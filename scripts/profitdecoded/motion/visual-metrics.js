#!/usr/bin/env node
"use strict";
// Coarse, repeatable frame measurements for before/after review. They are not
// a substitute for judging composition, motion, or audience response.
const { execFileSync } = require("node:child_process");

function measure(file, { step = 5, width = 160, height = 90 } = {}) {
  const frameBytes = width * height * 3;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=1/${step},scale=${width}:${height}:flags=bicubic,format=rgb24`, "-an", "-f", "rawvideo", "pipe:1"], { maxBuffer: 128 << 20 });
  const samples = [];
  for (let off = 0; off + frameBytes <= raw.length; off += frameBytes) {
    let luma = 0, dark = 0, chroma = 0;
    for (let p = off; p < off + frameBytes; p += 3) {
      const r = raw[p], g = raw[p + 1], b = raw[p + 2];
      const y = (54 * r + 183 * g + 19 * b) / 256;
      luma += y; if (y < 50) dark += 1; chroma += Math.max(r, g, b) - Math.min(r, g, b);
    }
    const pixels = width * height;
    samples.push({ second: +(samples.length * step).toFixed(2), meanLuma: +(luma / pixels).toFixed(1), darkPixelFraction: +(dark / pixels).toFixed(3), meanChroma: +(chroma / pixels).toFixed(1) });
  }
  const mean = (key) => +(samples.reduce((n, s) => n + s[key], 0) / (samples.length || 1)).toFixed(3);
  return { method: `${width}x${height} RGB samples every ${step}s; luma=(54R+183G+19B)/256; dark pixel threshold <50`,
    samples: samples.length, meanLuma: mean("meanLuma"), meanDarkPixelFraction: mean("darkPixelFraction"), meanChroma: mean("meanChroma"),
    nearDarkSamples: samples.filter((s) => s.meanLuma < 60 && s.darkPixelFraction > 0.6).length,
    series: samples };
}

// Splice continuity for a revised master: compares the picture change across each edit point
// (frame b-1 -> b) with the change just before it (b-2 -> b-1). A large ratio at a point where
// the authored picture continues indicates a visible jump between reused and re-rendered frames.
function boundaryContinuity(file, boundaries, { width = 160, height = 90 } = {}) {
  const wanted = [...new Set(boundaries.flatMap((b) => [b - 2, b - 1, b]).filter((n) => n >= 0))].sort((x, y) => x - y);
  if (!wanted.length) return { method: "", points: [] };
  const frameBytes = width * height * 3;
  const select = wanted.map((n) => `eq(n\\,${n})`).join("+");
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `select='${select}',scale=${width}:${height}:flags=bicubic,format=rgb24`, "-vsync", "0", "-an", "-f", "rawvideo", "pipe:1"], { maxBuffer: 256 << 20 });
  const frames = new Map(wanted.map((n, i) => [n, raw.subarray(i * frameBytes, (i + 1) * frameBytes)]));
  const mad = (a, b) => { if (!a || !b || a.length < frameBytes || b.length < frameBytes) return null; let d = 0; for (let i = 0; i < frameBytes; i += 1) d += Math.abs(a[i] - b[i]); return d / frameBytes; };
  const points = boundaries.filter((b) => b >= 2).map((b) => {
    const across = mad(frames.get(b - 1), frames.get(b)), before = mad(frames.get(b - 2), frames.get(b - 1));
    return { frame: b, second: +(b / 30).toFixed(3), madAcross: across === null ? null : +across.toFixed(2), madBefore: before === null ? null : +before.toFixed(2),
      ratio: across === null || before === null ? null : +((across + 0.5) / (before + 0.5)).toFixed(2) };
  });
  return { method: `${width}x${height} RGB mean absolute difference; ratio=(across+0.5)/(before+0.5); review points with ratio > 3 and madAcross > 4`, points,
    flagged: points.filter((p) => p.ratio > 3 && p.madAcross > 4) };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) { console.error("usage: visual-metrics.js video.mp4 [--boundaries revision-manifest.json]"); process.exit(2); }
  try {
    if (args.includes("--boundaries")) {
      const manifest = JSON.parse(require("node:fs").readFileSync(args[args.indexOf("--boundaries") + 1], "utf8"));
      const cuts = manifest.pieces.slice(1).map((p) => p.startFrame);
      console.log(JSON.stringify(boundaryContinuity(args[0], cuts), null, 2));
    } else console.log(JSON.stringify(measure(args[0]), null, 2));
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { measure, boundaryContinuity };
