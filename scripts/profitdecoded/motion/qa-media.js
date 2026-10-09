#!/usr/bin/env node
"use strict";
// Technical QA on a rendered ProfitDecoded video (observed facts only; no editorial judgement).
//   node scripts/profitdecoded/motion/qa-media.js <video.mp4> [--srt captions.srt] [--out qa.json] [--min 45 --max 60]
// Exit code 1 when a hard check fails. Duration outside --min/--max is reported as a warning, not a failure.
const fs = require("fs");
const { spawnSync, execFileSync } = require("child_process");

const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const file = args.find((a) => !a.startsWith("--") && !/^\d/.test(a) && a !== opt("--srt") && a !== opt("--out"));
const ff = (a) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...a], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;

function parseSrt(text) {
  const ts = (x) => { const [h, m, r] = x.split(":"); return +h * 3600 + +m * 60 + parseFloat(r.replace(",", ".")); };
  return text.trim().split(/\n\s*\n/).map((b) => { const l = b.split("\n"); const [a, z] = l[1].split(" --> "); return { start: ts(a), end: ts(z), lines: l.slice(2) }; });
}

function qa(video, { srt = null, min = 45, max = 60 } = {}) {
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", video], { encoding: "utf8" }));
  const v = probe.streams.find((s) => s.codec_type === "video"); const a = probe.streams.find((s) => s.codec_type === "audio");
  const loud = ff(["-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"]); const sum = loud.slice(loud.lastIndexOf("Summary"));
  const num = (re) => +((sum.match(re) || [])[1]);
  const freezes = [...ff(["-i", video, "-vf", "freezedetect=n=0.001:d=1.5", "-an", "-f", "null", "-"]).matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => ({ start: +m[1], duration: +m[2] }));
  const black = (ff(["-i", video, "-vf", "blackdetect=d=0.2:pix_th=0.05", "-an", "-f", "null", "-"]).match(/black_start/g) || []).length;
  const silences = [...ff(["-i", video, "-af", "silencedetect=n=-45dB:d=0.8", "-f", "null", "-"]).matchAll(/silence_duration: ([\d.]+)/g)].map((m) => +m[1]);
  const decodeErrors = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { encoding: "utf8" }).stderr.trim().split("\n").filter(Boolean).length;
  const vd = +v.duration, ad = a ? +a.duration : 0, dur = +probe.format.duration;
  const checks = [];
  const add = (name, ok, measured, target, hard = true) => checks.push({ name, ok, measured, target, hard });
  add("resolution", v.width === 1920 && v.height === 1080, `${v.width}x${v.height}`, "1920x1080");
  add("frame rate", v.r_frame_rate === "30/1", v.r_frame_rate, "30/1");
  add("codec", v.codec_name === "h264" && v.pix_fmt === "yuv420p", `${v.codec_name} ${v.profile} ${v.pix_fmt}`, "h264 yuv420p");
  add("colour tags", v.color_primaries === "bt709" && v.color_transfer === "bt709" && v.color_space === "bt709", `${v.color_primaries}/${v.color_transfer}/${v.color_space}`, "bt709");
  add("audio", !!a && a.channels === 2 && a.sample_rate === "48000", a ? `${a.codec_name} ${a.channels}ch ${a.sample_rate} Hz` : "none", "stereo 48 kHz");
  add("decode errors", decodeErrors === 0, decodeErrors, 0);
  add("black frames >= 0.2 s", black === 0, black, 0);
  add("integrated loudness", Math.abs(num(/I:\s+(-?[\d.]+)/) + 14) <= 1, `${num(/I:\s+(-?[\d.]+)/)} LUFS`, "-14 +/- 1 LUFS");
  add("true peak", num(/Peak:\s+(-?[\d.]+)/) <= -1, `${num(/Peak:\s+(-?[\d.]+)/)} dBTP`, "<= -1 dBTP");
  add("loudness range", num(/LRA:\s+(-?[\d.]+)/) <= 8, `${num(/LRA:\s+(-?[\d.]+)/)} LU`, "<= 8 LU");
  add("unintended silence >= 0.8 s", silences.length === 0, silences.length, 0);
  add("static holds > 3 s", freezes.filter((f) => f.duration > 3).length === 0, freezes.map((f) => `${f.start.toFixed(1)}s+${f.duration.toFixed(1)}`).join(", ") || "none", "none over 3 s");
  add("a/v duration match", Math.abs(vd - ad) <= 0.1, `${Math.abs(vd - ad).toFixed(3)} s`, "<= 0.1 s");
  add("duration", dur >= min && dur <= max, `${dur.toFixed(2)} s`, `${min}-${max} s`, false);
  if (srt) {
    const cues = parseSrt(fs.readFileSync(srt, "utf8")); const bad = cues.filter((c) => c.lines.length > 2 || c.lines.some((l) => l.length > 42) || c.end - c.start < 1 || c.lines.join(" ").length / (c.end - c.start) > 20);
    add("captions", bad.length === 0 && cues.length > 0 && cues[cues.length - 1].end <= dur + 0.05, `${cues.length} cues, ${bad.length} out of limits`, "<= 2x42 chars, >= 1 s, <= 20 chars/s");
  }
  return { file: video, observedAt: new Date().toISOString(), pass: checks.filter((c) => c.hard).every((c) => c.ok), checks, freezes, bitrateKbps: Math.round(+probe.format.bit_rate / 1000) };
}

if (require.main === module) {
  if (!file) { console.error("usage: qa-media.js <video.mp4> [--srt captions.srt] [--out qa.json]"); process.exit(2); }
  const r = qa(file, { srt: opt("--srt", null), min: +opt("--min", 45), max: +opt("--max", 60) });
  for (const c of r.checks) console.log(`${c.ok ? "PASS" : c.hard ? "FAIL" : "WARN"}  ${c.name.padEnd(28)} ${String(c.measured).padEnd(40)} target ${c.target}`);
  console.log(r.pass ? "QA: PASS (hard checks)" : "QA: FAIL");
  if (opt("--out", null)) fs.writeFileSync(opt("--out"), JSON.stringify(r, null, 1) + "\n");
  process.exit(r.pass ? 0 : 1);
}
module.exports = { qa, parseSrt };
