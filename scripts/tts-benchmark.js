#!/usr/bin/env node
"use strict";

// TTS BENCHMARK: the same scripts read by (A) each channel's Edge voice and (B) Kokoro candidates.
// Free and offline apart from Edge itself; no upload. Every sample is speech-checked; whether a
// voice sounds right is for a person to decide by ear (the report says so).
//
//   node scripts/tts-benchmark.js --scripts benchmarks/tts/scripts.json --out tts-bench [--edge] [--kokoro]
//     [--voices failure-reconstructed=am_michael,bm_george;impossible-brief=am_fenrir,am_puck;critical-thread=af_heart,af_bella]
//
// Each channel's lines are read line by line and joined with the production pause (0.18 s), so
// both engines are timed the same way. Output: <out>/<channel>/<engine>-<voice>.mp3 and
// <out>/report.json + report.md.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const Channel = require("../core/channel-context");
const TTS = require("../lib/shorts-tts");
const Speech = require("../lib/speech-check");

const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const OUT = path.resolve(option("out", "tts-bench"));
const SCRIPTS = JSON.parse(fs.readFileSync(option("scripts", path.join(__dirname, "..", "benchmarks", "tts", "scripts.json")), "utf8"));
const PAUSE = 0.18;
const VOICES = Object.fromEntries(String(option("voices", "failure-reconstructed=am_michael,bm_george;impossible-brief=am_fenrir,am_puck;critical-thread=af_heart,af_bella"))
  .split(";").map((pair) => pair.split("=")).map(([channel, list]) => [channel, list.split(",")]));
const wantEdge = argv.includes("--edge") || !argv.includes("--kokoro");
const wantKokoro = argv.includes("--kokoro") || !argv.includes("--edge");

function edgeLines(lines, dir, voice, rate) {
  fs.mkdirSync(dir, { recursive: true });
  return lines.map((line, i) => {
    const input = path.join(dir, `line-${i + 1}.txt`); const file = path.join(dir, `line-${i + 1}.mp3`);
    fs.writeFileSync(input, line + "\n");
    const started = Date.now();
    const run = cp.spawnSync(process.execPath, [path.join(__dirname, "synthesize-voice.js"), input, file, voice, rate], { encoding: "utf8", timeout: 120000 });
    if (run.status !== 0) throw new Error(`Edge line ${i + 1}: ${String(run.stderr).trim().slice(0, 160)}`);
    return { file, synthSeconds: (Date.now() - started) / 1000 };
  });
}

function record(engine, voice, channel, lines, files, synthSeconds, loadSeconds, out) {
  const joined = TTS.joinLines(files, lines.map((_, i) => (i < lines.length - 1 ? PAUSE : 0)), out);
  const speech = Speech.check(out, { text: lines.join(" ") });
  return { channel, engine, voice, file: path.relative(OUT, out), seconds: +joined.durationSec.toFixed(2), synthSeconds: +synthSeconds.toFixed(2),
    loadSeconds, realTimeFactor: +(synthSeconds / joined.durationSec).toFixed(3), speechCheck: speech.ok ? "pass" : `FAIL: ${speech.problems.join("; ")}`, metrics: speech.metrics };
}

const rows = [];
for (const [slug, item] of Object.entries(SCRIPTS).filter(([key]) => !key.startsWith("_"))) {
  const channel = Channel.getChannel(slug);
  const lines = item.lines;
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "script.txt"), lines.join("\n") + "\n");
  if (wantEdge) {
    const voice = channel.config.voice.voice; const rate = channel.config.voice.rate || "+0%";
    try {
      const started = Date.now();
      const parts = edgeLines(lines, path.join(dir, "edge-lines"), voice, rate);
      rows.push(record("edge", voice, slug, lines, parts.map((p) => p.file), (Date.now() - started) / 1000, null, path.join(dir, `A-edge-${voice}.mp3`)));
    } catch (error) { rows.push({ channel: slug, engine: "edge", voice, error: error.message }); }
    fs.rmSync(path.join(dir, "edge-lines"), { recursive: true, force: true });
  }
  if (wantKokoro) {
    for (const voice of VOICES[slug] || []) {
      try {
        const work = path.join(dir, `kokoro-${voice}`);
        const started = Date.now();
        const summary = TTS.kokoroLines(lines, work, { voice, speed: 1 });
        const wall = (Date.now() - started) / 1000;
        const synth = summary.lines.reduce((sum, line) => sum + line.synthSeconds, 0);
        const row = record("kokoro", voice, slug, lines, summary.lines.map((line) => line.file), synth, summary.loadSeconds, path.join(dir, `B-kokoro-${voice}.mp3`));
        row.wallSeconds = +wall.toFixed(2);
        rows.push(row);
        fs.rmSync(work, { recursive: true, force: true });
      } catch (error) { rows.push({ channel: slug, engine: "kokoro", voice, error: error.message }); }
    }
  }
}

const report = { at: new Date().toISOString(), host: `${process.platform}/${process.arch}`, runner: process.env.RUNNER_NAME || null, pauseSeconds: PAUSE, rows,
  note: "Speech checks prove the files contain complete speech, not that a voice sounds natural. Every sample needs a human listener before any voice is approved." };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const md = ["# TTS benchmark", "", `Generated ${report.at} on ${report.host}. ${report.note}`, "",
  "| Channel | Engine | Voice | Length (s) | Words/s | Synthesis (s) | Real-time factor | Model load (s) | Speech check | File |", "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => r.error ? `| ${r.channel} | ${r.engine} | ${r.voice} | — | — | — | — | — | ERROR: ${r.error.slice(0, 80)} | — |`
    : `| ${r.channel} | ${r.engine} | ${r.voice} | ${r.seconds} | ${r.metrics ? r.metrics.wordsPerSecond : "—"} | ${r.synthSeconds} | ${r.realTimeFactor} | ${r.loadSeconds ?? "—"} | ${r.speechCheck} | ${r.file} |`)];
fs.writeFileSync(path.join(OUT, "report.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
