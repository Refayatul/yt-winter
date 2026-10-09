#!/usr/bin/env node
"use strict";
// Thumbnail mockups from the motion library (original artwork only; no third-party marks).
//   node scripts/profitdecoded/motion/render-thumbnails.js <dir>
// <dir>/thumbnails.js defines window.THUMBS(PD) -> [{ id, html }] drawn on a 1280x720 canvas.
// Writes <dir>/out/thumb-<id>.png plus a mobile-size board (168x94 and 360x202 previews).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

async function main() {
  const dir = path.resolve(process.argv[2] || "."); const out = path.join(dir, "out"); fs.mkdirSync(out, { recursive: true });
  const lib = fs.readFileSync(path.join(__dirname, "brand-lib.js"), "utf8"); const spec = fs.readFileSync(path.join(dir, "thumbnails.js"), "utf8");
  const tries = [process.env.PD_PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean); let pw = null;
  for (const t of tries) { try { pw = require(t); break; } catch (e) { /* next */ } }
  if (!pw) throw new Error("playwright-core not found");
  const browser = await pw.chromium.launch(process.env.PD_CHROMIUM ? { executablePath: process.env.PD_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}</style></head><body><div id="stage"></div><script>${lib}</script><script>${spec}</script></body></html>`);
  const ids = await page.evaluate(() => window.THUMBS(window.PD).map((t) => t.id)); const files = [];
  for (const id of ids) {
    await page.evaluate((x) => { const t = window.THUMBS(window.PD).find((y) => y.id === x); document.getElementById("stage").innerHTML = t.html; }, id);
    const f = path.join(out, `thumb-${id}.png`); await page.screenshot({ path: f }); files.push(f);
  }
  await browser.close();
  // Mobile check board: each concept at YouTube's small list size (168x94) and home-feed phone size (360x202).
  const board = path.join(out, "thumbnails-mobile-check.png");
  execFileSync("magick", ["-background", "#0b0c0e", ...files.flatMap((f) => ["(", "(", f, "-resize", "360x202", ")", "(", f, "-resize", "168x94", "-gravity", "north", "-background", "#0b0c0e", "-extent", "180x202", ")", "+append", ")"]), "-append", board]);
  console.log(`thumbnails: ${files.map((f) => path.basename(f)).join(", ")} + ${path.basename(board)}`);
}
main().catch((e) => { console.error("THUMBNAILS FAILED:", e.message); process.exit(1); });
