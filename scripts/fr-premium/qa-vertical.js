#!/usr/bin/env node
"use strict";
// Technical QA for a vertical Short (observed measurements only; no editorial judgement).
//   node scripts/fr-premium/qa-vertical.js <video.mp4> [--cues shots.json] [--words timeline.json] [--out qa.json]
// Same measurements for every version so A/B/C compare like for like. Exit 1 when a hard check fails.
const fs = require("fs");
const { spawnSync, execFileSync } = require("child_process");

const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const file = args[0];
const ff = (a) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).stderr;

function lumaStats(video, { w = 270, h = 480, fps = 30, t = null } = {}) {
  const raw = execFileSync("ffmpeg", ["-v", "error", ...(t ? ["-t", String(t)] : []), "-i", video, "-vf", `fps=${fps},scale=${w}:${h},format=gray`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 30 });
  const n = w * h, frames = Math.floor(raw.length / n), diffs = [], means = [];
  for (let f = 0; f < frames; f += 1) {
    let s = 0; for (let i = f * n; i < (f + 1) * n; i += 1) s += raw[i]; means.push(s / n);
    if (f) { let d = 0; for (let i = 0; i < n; i += 1) d += Math.abs(raw[f * n + i] - raw[(f - 1) * n + i]); diffs.push(d / n); }
  }
  return { frames, means, diffs };
}

function qa(video, { cuesFile = null, wordsFile = null } = {}) {
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", video], { encoding: "utf8" }));
  const v = probe.streams.find((s) => s.codec_type === "video"), a = probe.streams.find((s) => s.codec_type === "audio");
  const dur = +probe.format.duration, vd = +v.duration, ad = a ? +a.duration : 0;
  const decodeErrors = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { encoding: "utf8" }).stderr.trim().split("\n").filter(Boolean).length;
  const black = [...ff(["-i", video, "-vf", "blackdetect=d=0.1:pix_th=0.06", "-an", "-f", "null", "-"]).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  const freezes = [...ff(["-i", video, "-vf", "freezedetect=n=0.003:d=2", "-an", "-f", "null", "-"]).matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => ({ start: +m[1], duration: +m[2] }));
  const loud = ff(["-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"]); const sum = loud.slice(loud.lastIndexOf("Summary")); const num = (re) => +((sum.match(re) || [])[1]);
  const astats = ff(["-i", video, "-af", "astats=metadata=0", "-f", "null", "-"]); const clipped = [...astats.matchAll(/Number of samples clipped: (\d+)/g)].map((m) => +m[1]);
  const flat = [...astats.matchAll(/Flat factor: ([\d.]+)/g)].map((m) => +m[1]);
  const silences = [...ff(["-i", video, "-af", "silencedetect=n=-45dB:d=1.0", "-f", "null", "-"]).matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => ({ start: +m[1], duration: +m[2] }));
  const L = lumaStats(video);
  const first3 = L.diffs.slice(0, 89); const mean = (x) => x.reduce((s, y) => s + y, 0) / (x.length || 1);
  // frame 0: brightness and detail (std dev of a 270x480 gray frame) - an empty/blurred first frame has low detail
  const f0 = execFileSync("ffmpeg", ["-v", "error", "-i", video, "-frames:v", "1", "-vf", "scale=270:480,format=gray", "-f", "rawvideo", "pipe:1"]);
  const m0 = mean([...f0]); const sd0 = Math.sqrt(mean([...f0].map((x) => (x - m0) ** 2)));
  // edge energy (sharpness proxy): mean absolute horizontal gradient of frame 0
  let grad = 0; for (let y = 0; y < 480; y += 1) for (let x = 1; x < 270; x += 1) grad += Math.abs(f0[y * 270 + x] - f0[y * 270 + x - 1]); grad /= 480 * 269;
  // longest run of near-static frames (mean abs diff < 0.5 on the proxy)
  let run = 0, longest = 0; for (const d of L.diffs) { run = d < 0.5 ? run + 1 : 0; longest = Math.max(longest, run); }
  const checks = []; const add = (name, ok, measured, target, hard = true) => checks.push({ name, ok, measured, target, hard });
  add("resolution", v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`, "1080x1920");
  add("frame rate", v.r_frame_rate === "30/1", v.r_frame_rate, "30/1");
  add("codec", v.codec_name === "h264" && v.pix_fmt === "yuv420p", `${v.codec_name} ${v.profile} ${v.pix_fmt}`, "h264 yuv420p");
  add("full decode errors", decodeErrors === 0, decodeErrors, 0);
  add("duration", dur >= 45 && dur <= 55, `${dur.toFixed(2)} s`, "45-55 s", false);
  add("black frames >= 0.1 s", black.length === 0, black.length ? black.map((b) => `${b[0]}-${b[1]}`).join(", ") : "none", "none");
  add("first frame not empty", m0 > 25 && sd0 > 20, `mean luma ${m0.toFixed(1)}, detail sd ${sd0.toFixed(1)}, edge ${grad.toFixed(2)}`, "mean > 25, sd > 20");
  add("static holds >= 2 s (freezedetect n=0.003)", freezes.length === 0, freezes.map((f) => `${f.start.toFixed(1)}s+${f.duration.toFixed(1)}`).join(", ") || "none", "none");
  add("audio clipping", clipped.every((c) => c === 0) && flat.every((f) => f === 0), `clipped ${clipped.join("/")}, flat ${flat.join("/")}`, "0");
  add("integrated loudness", Math.abs(num(/I:\s+(-?[\d.]+)/) + 14) <= 1, `${num(/I:\s+(-?[\d.]+)/)} LUFS`, "-14 +/- 1", false);
  add("true peak", num(/Peak:\s+(-?[\d.]+)/) <= -1, `${num(/Peak:\s+(-?[\d.]+)/)} dBTP`, "<= -1 dBTP");
  add("silence >= 1.0 s at -45 dB", true, silences.map((s) => `${s.start.toFixed(1)}s+${s.duration.toFixed(1)}`).join(", ") || "none", "reported (designed pauses allowed)", false);
  add("a/v duration match", Math.abs(vd - ad) <= 0.1, `${Math.abs(vd - ad).toFixed(3)} s`, "<= 0.1 s");
  const r = { file: video, observedAt: new Date().toISOString(), durationSec: +dur.toFixed(3), video: `${v.width}x${v.height} ${v.r_frame_rate} ${v.codec_name}`, audio: a ? `${a.codec_name} ${a.channels}ch ${a.sample_rate} Hz` : "none",
    loudness: { I: num(/I:\s+(-?[\d.]+)/), LRA: num(/LRA:\s+(-?[\d.]+)/), truePeak: num(/Peak:\s+(-?[\d.]+)/) },
    motion: { method: "mean abs luma diff per frame on a 270x480 gray proxy; static = diff < 0.5", first3sMean: +mean(first3).toFixed(2), first3sStaticShare: +(first3.filter((d) => d < 0.5).length / first3.length).toFixed(2), wholeMean: +mean(L.diffs).toFixed(2), wholeStaticShare: +(L.diffs.filter((d) => d < 0.5).length / L.diffs.length).toFixed(2), longestStaticRunSec: +(longest / 30).toFixed(2) },
    frame0: { meanLuma: +m0.toFixed(1), detailSd: +sd0.toFixed(1), edgeEnergy: +grad.toFixed(2) }, black, freezes, silences, checks };
  if (cuesFile) {
    const cues = JSON.parse(fs.readFileSync(cuesFile, "utf8")).cues; const bad = cues.filter((c) => c.lines.length > 2 || c.lines.some((l) => l.length > 26));
    const fast = cues.filter((c) => c.lines.join(" ").length / Math.max(0.01, c.end - c.start) > 22);
    add("caption layout", bad.length === 0, `${cues.length} cues, ${bad.length} over 2 lines x 26 chars`, "<= 2 x 26");
    add("caption reading speed", fast.length === 0, `${fast.length} cues over 22 chars/s (max ${Math.max(...cues.map((c) => c.lines.join(" ").length / (c.end - c.start))).toFixed(1)})`, "<= 22 chars/s", false);
    add("captions within video", cues[cues.length - 1].end <= dur + 0.05, `last cue ends ${cues[cues.length - 1].end.toFixed(2)} s`, `<= ${dur.toFixed(2)} s`);
    if (wordsFile) {
      // acoustic check: each cue start vs the nearest speech onset found in the final audio (silencedetect ends)
      const onsets = [...ff(["-i", opt("--narration", video), "-af", "silencedetect=n=-38dB:d=0.12", "-f", "null", "-"]).matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
      const after = cues.map((c) => { const o = onsets.filter((x) => Math.abs(x - c.start) < 0.6); return o.length ? Math.min(...o.map((x) => Math.abs(x - c.start))) : null; }).filter((x) => x !== null);
      r.captionSync = { method: "|cue start - nearest acoustic onset (silencedetect -38 dB, 0.12 s) on " + (opt("--narration", null) ? "the narration track" : "the final mix") + "| for cues that start after a pause", measured: after.length, meanMs: Math.round(1000 * after.reduce((s, x) => s + x, 0) / (after.length || 1)), maxMs: Math.round(1000 * Math.max(0, ...after)) };
      add("caption sync vs acoustic onsets", r.captionSync.maxMs <= 150, `${r.captionSync.measured} cues: mean ${r.captionSync.meanMs} ms, max ${r.captionSync.maxMs} ms`, "max <= 150 ms", false);
    }
  }
  // Loop continuity (Shorts replay): last frame -> first frame, against the normal frame-to-frame change
  // in the final second. Thresholds fixed: FAIL if whole-frame MAD > 25; WARN if the jump is > 3x the
  // final second's median change AND > 4 (same rule as ProfitDecoded visual-metrics boundaryContinuity).
  {
    const n = 270 * 480; const raw = execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", "scale=270:480,format=gray", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 30 });
    const fr = Math.floor(raw.length / n); const at = (k) => raw.subarray(k * n, (k + 1) * n);
    const mad = (a, b, y0 = 0, y1 = 480) => { let d = 0; for (let i = y0 * 270; i < y1 * 270; i += 1) d += Math.abs(a[i] - b[i]); return d / ((y1 - y0) * 270); };
    const last = at(fr - 1), first = at(0);
    const tail = []; for (let k = Math.max(1, fr - 30); k < fr; k += 1) tail.push(mad(at(k - 1), at(k)));
    tail.sort((x, y) => x - y); const med = tail[Math.floor(tail.length / 2)] || 0;
    const whole = mad(last, first), photo = mad(last, first, 175, 325); // y 700-1300 at full size: below the headline, above the captions
    r.loop = { method: "mean abs gray diff on 270x480 proxy", lastToFirstWhole: +whole.toFixed(2), lastToFirstPhotoRegion: +photo.toFixed(2), finalSecondMedianStep: +med.toFixed(2), ratio: +((whole + 0.5) / (med + 0.5)).toFixed(2) };
    add("loop continuity (last -> first frame)", whole <= 25 && !(r.loop.ratio > 3 && whole > 4), `whole ${r.loop.lastToFirstWhole}, photo region ${r.loop.lastToFirstPhotoRegion}, final-second step ${r.loop.finalSecondMedianStep}, ratio ${r.loop.ratio}`, "whole <= 25; not (ratio > 3 and > 4)", whole > 25);
  }
  // First 3 s: when speech starts (from the final mix and, when given, the narration track).
  {
    const onset = (f) => { const e = ff(["-t", "3", "-i", f, "-af", "silencedetect=n=-38dB:d=0.05", "-f", "null", "-"]); const m = e.match(/silence_end: ([\d.]+)/); const startsSilent = /silence_start: 0(\.0+)?\b/.test(e) || /silence_start: -?0\.0/.test(e); return startsSilent && m ? +m[1] : 0; };
    r.first3s = { speechOnsetSec: onset(opt("--narration", video)), motionMean: r.motion.first3sMean, staticShare: r.motion.first3sStaticShare, frame0: r.frame0 };
    add("first spoken word within 0.5 s", r.first3s.speechOnsetSec <= 0.5, `${r.first3s.speechOnsetSec.toFixed(2)} s`, "<= 0.5 s", false);
  }
  r.pass = checks.filter((c) => c.hard).every((c) => c.ok);
  return r;
}
if (require.main === module) {
  const r = qa(file, { cuesFile: opt("--cues", null), wordsFile: opt("--words", null) });
  for (const c of r.checks) console.log(`${c.ok ? "PASS" : c.hard ? "FAIL" : "WARN"}  ${c.name.padEnd(42)} ${String(c.measured).slice(0, 70).padEnd(70)} ${c.target}`);
  console.log("motion", JSON.stringify(r.motion)); console.log(r.pass ? "QA: PASS (hard checks)" : "QA: FAIL");
  if (opt("--out", null)) fs.writeFileSync(opt("--out"), JSON.stringify(r, null, 1) + "\n");
}
module.exports = { qa };
