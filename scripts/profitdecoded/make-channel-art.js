#!/usr/bin/env node
"use strict";
// Channel art for ProfitDecoded (ImageMagick). Outputs to channels/profitdecoded/brand-assets/:
//   profile-800.png   800x800  (YouTube crops to a circle: all content sits inside the centre 70%)
//   banner-2560x1440.png      (all text inside YouTube's 1546x423 "safe area" that every device shows)
// Brand: editorial paper/ink + one signal colour. No dollar signs, cash, rockets, coins or candlesticks.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const out = path.join(root, "channels/profitdecoded/brand-assets");
const c = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/brand.json"), "utf8")).colors;
const serif = ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"].find((f) => fs.existsSync(f));
const sans = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
const sansB = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f)) || sans;
const HAS = spawnSync("magick", ["-version"]).status === 0;
const im = (a) => execFileSync(HAS ? "magick" : "convert", a, { stdio: "pipe" });
fs.mkdirSync(out, { recursive: true });

// ---- profile: ink field, paper "Pd" monogram, receipt-tear signal bar ----
im(["-size", "800x800", `xc:${c.ink}`,
  "-fill", c.paper, "-font", serif, "-pointsize", 330, "-gravity", "center", "-annotate", "-6-40", "Pd",
  // receipt tear: a row of small triangles under the monogram
  "-fill", c.signal, "-draw", "rectangle 250,552 550,572",
  "-fill", c.ink, ...Array.from({ length: 12 }, (_, i) => ["-draw", `polygon ${250 + i * 25},552 ${262 + i * 25},566 ${275 + i * 25},552`]).flat(),
  path.join(out, "profile-800.png")]);

// ---- banner ----
const W = 2560, H = 1440, sx = 507, sy = 508; // safe area origin (1546x423)
const a = ["-size", `${W}x${H}`, `xc:${c.ink}`];
// faint price-tag grid texture outside the safe area
a.push("-stroke", "#1d2026", "-strokewidth", 2, "-fill", "none");
for (let x = 0; x <= W; x += 160) a.push("-draw", `line ${x},0 ${x},${H}`);
for (let y = 0; y <= H; y += 160) a.push("-draw", `line 0,${y} ${W},${y}`);
a.push("-stroke", "none");
// signal marker + wordmark
a.push("-fill", c.signal, "-draw", `rectangle ${sx},${sy + 40} ${sx + 14},${sy + 205}`);
a.push("-fill", c.paper, "-font", serif, "-pointsize", 140, "-gravity", "northwest", "-annotate", `+${sx + 46}+${sy + 30}`, "ProfitDecoded");
a.push("-fill", c.signal, "-font", sansB, "-pointsize", 52, "-annotate", `+${sx + 52}+${sy + 232}`, "THE BUSINESS BEHIND EVERYDAY LIFE");
a.push("-fill", c.mist, "-font", sans, "-pointsize", 36, "-annotate", `+${sx + 52}+${sy + 312}`, "How everyday businesses really make money.");
// receipt-line motif, kept inside the safe area at the right edge
a.push("-fill", "none", "-stroke", c.mist, "-strokewidth", 3, "-draw", `stroke-dasharray 10 10 line ${sx + 1240},${sy + 20} ${sx + 1240},${sy + 400}`);
a.push("-stroke", "none", "-fill", c.mist, "-font", sans, "-pointsize", 30);
[["price", "$9.99"], ["cost", "$3.10"], ["margin", "?"]].forEach(([k, v], i) => { a.push("-gravity", "northwest", "-annotate", `+${sx + 1272}+${sy + 60 + i * 110}`, k.toUpperCase(), "-fill", i === 2 ? c.signal : c.paper, "-font", serif, "-pointsize", 56, "-annotate", `+${sx + 1272}+${sy + 94 + i * 110}`, v, "-fill", c.mist, "-font", sans, "-pointsize", 30); });
a.push(path.join(out, "banner-2560x1440.png"));
im(a);
// preview showing the circular crop and the safe area
im([path.join(out, "banner-2560x1440.png"), "-fill", "none", "-stroke", "#e8553d88", "-strokewidth", 4, "-draw", `rectangle ${sx},${sy} ${sx + 1546},${sy + 423}`, "-resize", "1280x", path.join(out, "banner-safe-area-preview.png")]);
im([path.join(out, "profile-800.png"), "(", "-size", "800x800", "xc:none", "-fill", "white", "-draw", "circle 400,400 400,0", ")", "-alpha", "set", "-compose", "DstIn", "-composite", "-resize", "400x", path.join(out, "profile-circle-preview.png")]);
console.log("channel art written to " + path.relative(process.cwd(), out));
