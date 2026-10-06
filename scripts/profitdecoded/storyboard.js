#!/usr/bin/env node
"use strict";
// Review storyboard + thumbnail concept boards (ImageMagick). These are
// REVIEW ARTIFACTS built from the shot plan, not the final rendered video.
//   node scripts/profitdecoded/storyboard.js <bundle.json>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const brand = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/brand.json"), "utf8")).colors;
const PV = require("./plan-visuals");
const bundlePath = path.resolve(process.argv[2]); const dir = path.dirname(bundlePath); const out = path.join(dir, "out");
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const FONT = ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"].find((f) => fs.existsSync(f));
const FONT2 = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
const short = bundle.format === "short"; const W = short ? 540 : 960, H = short ? 960 : 540;
const wrap = (t, n) => { const w = String(t).split(/\s+/); const lines = []; let l = ""; for (const x of w) { if ((l + " " + x).trim().length > n) { lines.push(l); l = x; } else l = (l + " " + x).trim(); } if (l) lines.push(l); return lines.join("\n"); };
const magick = (args) => execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"] });

fs.mkdirSync(path.join(out, "frames"), { recursive: true });
const plan = bundle.visualPlan && bundle.visualPlan.length ? bundle.visualPlan : PV.build(bundle);
const beatText = Object.fromEntries(bundle.beats.map((b) => [b.id, b.text]));
const frames = [];
plan.forEach((s, i) => {
  const paper = ["filing-excerpt", "receipt", "comparison-panel"].includes(s.type);
  const bg = paper ? brand.paper : brand.ink, fg = paper ? brand.ink : brand.text;
  const file = path.join(out, "frames", String(i + 1).padStart(3, "0") + ".png");
  const a = ["-size", `${W}x${H}`, `xc:${bg}`];
  // data bar for percentage graphics
  const pct = (s.numbers || []).map(Number).filter((n) => n > 0 && n <= 100).pop();
  if ((["chart", "comparison-panel", "money-flow"].includes(s.type)) && pct) {
    const bw = W * 0.8; a.push("-fill", paper ? brand.mist : "#2a2d33", "-draw", `rectangle ${W * 0.1},${H * 0.62} ${W * 0.1 + bw},${H * 0.62 + 34}`, "-fill", brand.signal, "-draw", `rectangle ${W * 0.1},${H * 0.62} ${W * 0.1 + bw * pct / 100},${H * 0.62 + 34}`);
  }
  a.push("-font", FONT, "-fill", fg, "-pointsize", short ? 46 : 44, "-gravity", "center", "-annotate", `+0-${short ? 120 : 40}`, wrap(s.overlayText || "", short ? 16 : 26));
  a.push("-font", FONT2, "-fill", paper ? "#555" : brand.mist, "-pointsize", short ? 15 : 14, "-gravity", "south", "-annotate", "+0+78", wrap(`“${beatText[s.beatId] || ""}”`, short ? 52 : 100));
  a.push("-fill", brand.signal, "-pointsize", 13, "-gravity", "southwest", "-annotate", "+14+14", `${i + 1}  ${s.type}  ·  ${s.motion}  ·  ${s.durationSec}s  ·  ${s.evidenceClaimId || ""}  ·  ${s.source ? s.source.license : "NO SOURCE"}`, file);
  magick(a); frames.push(file);
});
magick(["montage", ...frames, "-tile", short ? "6x" : "4x", "-geometry", short ? "270x480+6+6" : "480x270+6+6", "-background", "#0b0c0e", path.join(out, "storyboard.png")]);

// Thumbnail concept boards (not final art).
(bundle.thumbnailCandidates || []).forEach((t) => {
  const f = path.join(out, `thumb-${t.id}.png`);
  magick(["-size", "1280x720", `xc:${brand.ink}`, "-fill", brand.signal, "-draw", "rectangle 60,60 640,660", "-fill", brand.paper, "-font", FONT, "-pointsize", 120, "-gravity", "east", "-annotate", "+70-60", t.text || "", "-font", FONT2, "-fill", brand.ink, "-pointsize", 26, "-gravity", "northwest", "-annotate", "+90+90", wrap(t.dominantObject, 30), "-fill", brand.paper, "-pointsize", 20, "-gravity", "southwest", "-annotate", "+70+60", wrap("CONCEPT, not final art — tension: " + (t.contradiction || ""), 90), f]);
});
console.log(`storyboard: ${frames.length} frames -> ${path.relative(process.cwd(), path.join(out, "storyboard.png"))}`);
