#!/usr/bin/env node
"use strict";
// Text collision and phone-legibility check on render-vertical.js --inspect-text output.
//   node scripts/fr-premium/text-qa.js <text-inspection.json> [--out text-qa.json]
// Thresholds are fixed here (set before the v2 render was inspected) and are not tuned per film.
const fs = require("fs");
const T = {
  overlapShare: 0.15,                 // FAIL: two separate text boxes overlap by > 15% of the smaller box
  captionBand: [1318, 1470],          // FAIL: non-caption text inside the caption band
  bottomUiY: 1600,                    // WARN: essential text below y=1600 (Shorts title/channel UI)
  rightUi: { x: 950, y0: 1000, y1: 1600 }, // WARN: essential text under the right-hand Shorts buttons
  minFontFail: 18, minFontWarn: 24,   // essential text size in px at 1080 width
  edgeMargin: 32,                     // FAIL: essential text closer than 32 px to the left/right frame edge (clipped or unsafe)
};
const file = process.argv[2]; const outIdx = process.argv.indexOf("--out");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1;
const issues = []; let minEssential = Infinity, minAt = null;
for (const s of data.samples) {
  const bx = s.boxes;
  for (let i = 0; i < bx.length; i += 1) {
    const a = bx[i]; const essential = a.role !== "handle";
    if (essential && a.fontPx > 0 && a.fontPx < minEssential) { minEssential = a.fontPx; minAt = { t: s.t, text: a.text }; }
    if (essential && a.fontPx > 0 && a.fontPx < T.minFontFail) issues.push({ level: "FAIL", t: s.t, check: "text too small", detail: `${a.fontPx}px "${a.text}"` });
    else if (essential && a.fontPx > 0 && a.fontPx < T.minFontWarn) issues.push({ level: "WARN", t: s.t, check: "small text", detail: `${a.fontPx}px "${a.text}"` });
    if (essential && (a.x < T.edgeMargin || a.x + a.w > 1080 - T.edgeMargin)) issues.push({ level: "FAIL", t: s.t, check: "text at/over frame edge", detail: `"${a.text}" x=${a.x}-${a.x + a.w}` });
    if (a.role !== "caption" && inter(a, { x: 0, y: T.captionBand[0], w: 1080, h: T.captionBand[1] - T.captionBand[0] }) > 0.3 * a.w * a.h)
      issues.push({ level: "FAIL", t: s.t, check: "text in caption band", detail: `"${a.text}" y=${a.y}-${a.y + a.h}` });
    if (essential && a.role !== "caption" && a.y + a.h > T.bottomUiY) issues.push({ level: "WARN", t: s.t, check: "text in bottom UI zone", detail: `"${a.text}"` });
    if (essential && a.x + a.w > T.rightUi.x && a.y + a.h > T.rightUi.y0 && a.y < T.rightUi.y1) issues.push({ level: "WARN", t: s.t, check: "text under right UI buttons", detail: `"${a.text}" x=${a.x}-${a.x + a.w}` });
    for (let j = i + 1; j < bx.length; j += 1) {
      const b = bx[j]; if (contains(a, b) || contains(b, a)) continue;
      const share = inter(a, b) / Math.min(a.w * a.h, b.w * b.h);
      if (share > T.overlapShare) issues.push({ level: "FAIL", t: s.t, check: "text collision", detail: `"${a.text}" x "${b.text}" (${(share * 100).toFixed(0)}%)` });
    }
  }
}
// collapse repeats: same check+detail across consecutive samples -> one range
const groups = new Map();
for (const i of issues) { const k = `${i.level}|${i.check}|${i.detail}`; const g = groups.get(k); if (g) g.to = i.t; else groups.set(k, { ...i, from: i.t, to: i.t }); }
const list = [...groups.values()].map(({ t, ...g }) => g).sort((a, b) => a.from - b.from);
const res = { thresholds: T, samples: data.samples.length, step: data.step, minEssentialFontPx: minEssential, minEssentialAt: minAt,
  fails: list.filter((x) => x.level === "FAIL"), warns: list.filter((x) => x.level === "WARN"), pass: !list.some((x) => x.level === "FAIL") };
for (const x of list) console.log(`${x.level}  ${x.from.toFixed(2)}-${x.to.toFixed(2)} s  ${x.check}: ${x.detail}`);
console.log(`text QA: ${res.samples} samples every ${data.step} s; min essential text ${minEssential}px ("${minAt && minAt.text}" at ${minAt && minAt.t} s); ${res.fails.length} FAIL groups, ${res.warns.length} WARN groups -> ${res.pass ? "PASS" : "FAIL"}`);
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(res, null, 1) + "\n");
process.exit(res.pass ? 0 : 1);
