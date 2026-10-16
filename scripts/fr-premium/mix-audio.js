#!/usr/bin/env node
"use strict";
// FR premium mix and mux: narration levelled by measured (linear) gain, the sound-design stem ducked
// under the voice, the sum mastered to -14 LUFS integrated with a sample-peak limiter (keeps true peak
// under -1 dBTP after AAC), then muxed with the rendered picture.
//
//   node scripts/fr-premium/mix-audio.js <narration.wav> <sfx.wav> <video.mp4> <out.mp4> [--work dir]
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const [narr, sfx, video, out] = process.argv.slice(2);
const work = process.argv.includes("--work") ? process.argv[process.argv.indexOf("--work") + 1] : path.dirname(out);
const dur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const loud = (f) => { const e = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr; const s = e.slice(e.lastIndexOf("Summary"));
  return { I: +((s.match(/I:\s+(-?[\d.]+)/) || [])[1]), LRA: +((s.match(/LRA:\s+(-?[\d.]+)/) || [])[1]), truePeak: +((s.match(/Peak:\s+(-?[\d.]+)/) || [])[1]) }; };

const D = dur(video).toFixed(3);
const nl = loud(narr); const ng = (-16 - nl.I).toFixed(2);
const pre = path.join(work, "mix-pre.wav"), master = path.join(work, "mix-master.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", narr, "-i", sfx, "-filter_complex",
  `[0:a]aresample=48000,volume=${ng}dB,apad,atrim=0:${D},pan=stereo|c0=c0|c1=c0,asplit=2[v1][v2];` +
  `[1:a]aresample=48000,apad,atrim=0:${D}[b];[b][v1]sidechaincompress=threshold=0.025:ratio=5:attack=12:release=320:makeup=1[d];` +
  `[d][v2]amix=inputs=2:normalize=0:duration=first[m]`, "-map", "[m]", "-c:a", "pcm_s24le", pre]);
const pl = loud(pre); const mg = (-14 - pl.I).toFixed(2);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pre, "-af", `volume=${mg}dB,alimiter=limit=0.794:attack=5:release=80:level=disabled`, "-ar", "48000", "-c:a", "pcm_s24le", master]);
const ml = loud(master);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", master, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-t", D, "-movflags", "+faststart", out]);
const report = { narration: { before: nl, gainDb: +ng }, preMaster: pl, masterGainDb: +mg, master: ml, final: loud(out), durationSec: +D };
fs.writeFileSync(path.join(work, "audio-master.json"), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report));
