#!/usr/bin/env node
"use strict";
// Still frames from the motion library: thumbnail mockups (original artwork only) and component sheets.
//   node scripts/profitdecoded/motion/render-thumbnails.js <dir> [--spec thumbnails.js] [--size 1280x720] [--prefix thumb]
// The spec defines window.THUMBS(PD) -> [{ id, html }]. Writes <dir>/out/<prefix>-<id>.png; for thumbnails
// (the default spec) also a mobile-size board (168x94 and 360x202 previews).
const fs = require("fs");
const path = require("path");

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
  if (specName !== "thumbnails.js") { await browser.close(); console.log(`stills: ${files.map((f) => path.basename(f)).join(", ")}`); return; }
  // Mobile check board, drawn with the same pinned browser (no ImageMagick): each concept at the home-feed phone
  // size (360x202) and YouTube's small list size (168x94).
  const board = path.join(out, "thumbnails-mobile-check.png"); const imgs = files.map((f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64"));
  await page.setViewportSize({ width: 560, height: 210 * files.length + 10 });
  await page.setContent(`<html><body style="margin:0;background:#0b0c0e">${imgs.map((src) => `<div style="display:flex;gap:12px;padding:4px"><img src="${src}" style="width:360px;height:202px"><img src="${src}" style="width:168px;height:94px"></div>`).join("")}</body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: board, fullPage: true });
  await browser.close();
  console.log(`thumbnails: ${files.map((f) => path.basename(f)).join(", ")} + ${path.basename(board)}`);
}
main().catch((e) => { console.error("THUMBNAILS FAILED:", e.message); process.exit(1); });
