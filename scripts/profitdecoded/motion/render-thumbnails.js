#!/usr/bin/env node
"use strict";
// Still frames from the motion library: thumbnail mockups (original artwork only) and component sheets.
//   node scripts/profitdecoded/motion/render-thumbnails.js <dir> [--spec thumbnails.js] [--size 1280x720] [--prefix thumb]
// The spec defines window.THUMBS(PD) -> [{ id, html }]. Writes <dir>/out/<prefix>-<id>.png; for thumbnails
// (the default spec) also a mobile-size board (168x94 and 360x202 previews).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

async function main() {
  const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const dir = path.resolve(args.find((a) => !a.startsWith("--")) || "."); const out = path.join(dir, "out"); fs.mkdirSync(out, { recursive: true });
  const specName = opt("--spec", "thumbnails.js"); const [VW, VH] = opt("--size", "1280x720").split("x").map(Number); const prefix = opt("--prefix", "thumb");
  const lib = fs.readFileSync(path.join(__dirname, "brand-lib.js"), "utf8"); const spec = fs.readFileSync(path.join(dir, specName), "utf8");
  const { loadPlaywright, launchOptions } = require("./render-motion"); const Fonts = require("./fonts");
  const browser = await loadPlaywright().chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${Fonts.css()}\nhtml,body{margin:0;width:${VW}px;height:${VH}px;overflow:hidden}</style></head><body><div id="stage"></div><script>${lib}</script><script>${spec}</script></body></html>`);
  await page.evaluate(Fonts.PAGE_CHECK);
  const ids = await page.evaluate(() => window.THUMBS(window.PD).map((t) => t.id)); const files = [];
  for (const id of ids) {
    await page.evaluate((x) => { const t = window.THUMBS(window.PD).find((y) => y.id === x); document.getElementById("stage").innerHTML = t.html; }, id);
    const f = path.join(out, `${prefix}-${id}.png`); await page.screenshot({ path: f }); files.push(f);
  }
  await browser.close();
  if (specName !== "thumbnails.js") { console.log(`stills: ${files.map((f) => path.basename(f)).join(", ")}`); return; }
  // Mobile check board: each concept at YouTube's small list size (168x94) and home-feed phone size (360x202).
  const board = path.join(out, "thumbnails-mobile-check.png");
  execFileSync("magick", ["-background", "#0b0c0e", ...files.flatMap((f) => ["(", "(", f, "-resize", "360x202", ")", "(", f, "-resize", "168x94", "-gravity", "north", "-background", "#0b0c0e", "-extent", "180x202", ")", "+append", ")"]), "-append", board]);
  console.log(`thumbnails: ${files.map((f) => path.basename(f)).join(", ")} + ${path.basename(board)}`);
}
main().catch((e) => { console.error("THUMBNAILS FAILED:", e.message); process.exit(1); });
