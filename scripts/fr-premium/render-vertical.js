#!/usr/bin/env node
"use strict";
// Failure Reconstructed premium renderer: frame-accurate 1080x1920 motion (photos, archival film
// frames, SVG explanatory animation, captions) captured in headless Chromium and encoded with ffmpeg.
// Offline only: it writes files and never uploads.
//
//   node scripts/fr-premium/render-vertical.js <filmDir> --timeline timeline.json --assets <dir> --work <dir>
//        [--out video.mp4] [--stills 0,1.5,3] [--from s] [--to s] [--tail 0.8]
//        [--overrides proto.js,...] [--media-extra media.json,...]   (Phase 1 scene-only prototypes)
//        [--plan shot-plan.json]   (data-driven shots from the premium engine; scenes.js/overrides feed legacy-code shots only)
//        [--capture fast|playwright] [--profile frames.json]   (lossless capture mode; per-frame timing)
//
// <filmDir> holds scenes.js (shots, using fr-lib.js) and media.json (photos and clip ranges).
// The output is video only; mix-audio.js adds the soundtrack. Reuses the ProfitDecoded motion
// approach (pure function of time, OFL fonts embedded by scripts/profitdecoded/motion/fonts.js).
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const Fonts = require("../profitdecoded/motion/fonts");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const filmDir = path.resolve(args[0]);
const W = 1080, H = 1920, FPS = 30;
const work = path.resolve(opt("--work", path.join(filmDir, "out")));
const assets = path.resolve(opt("--assets", filmDir));
const timeline = JSON.parse(fs.readFileSync(path.resolve(opt("--timeline")), "utf8"));
let tail = +opt("--tail", 0.8);
const probe = (f) => { const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f]).toString().trim().split("x").map(Number); return { w, h }; };

// --plan shot-plan.json: shots come from data (engine/fr-plan.js + templates); media from the plan's assets.json
const planFile = opt("--plan", null); const PLAN = planFile ? (() => { const p = JSON.parse(fs.readFileSync(path.resolve(planFile), "utf8")); const d = path.dirname(path.resolve(planFile));
  return { plan: p, evidence: JSON.parse(fs.readFileSync(path.resolve(d, p.evidence), "utf8")), assets: JSON.parse(fs.readFileSync(path.resolve(d, p.assets), "utf8")) }; })() : null;
function prepareMedia() {
  const spec = PLAN ? { photos: Object.fromEntries(Object.entries(PLAN.assets.assets).filter(([, a]) => a.kind !== "clip").map(([k, a]) => [k, { file: a.file }])),
      clips: Object.fromEntries(Object.entries(PLAN.assets.assets).filter(([, a]) => a.kind === "clip").map(([k, a]) => [k, { file: a.file, ...a.clip }])) }
    : JSON.parse(fs.readFileSync(path.join(filmDir, "media.json"), "utf8"));
  // --media-extra a.json,b.json: extra photos/clips for scene prototypes (merged over media.json)
  for (const f of (opt("--media-extra", "") || "").split(",").filter(Boolean)) { const x = JSON.parse(fs.readFileSync(path.resolve(f), "utf8")); spec.photos = { ...spec.photos, ...(x.photos || {}) }; spec.clips = { ...spec.clips, ...(x.clips || {}) }; }
  const mdir = path.join(work, "media"); fs.mkdirSync(mdir, { recursive: true });
  const media = {};
  for (const [key, ph] of Object.entries(spec.photos || {})) {
    const src = path.join(assets, ph.file); const dst = path.join(mdir, key + ".jpg");
    // Long side at most 2600 px (enough for a 1.6x push on a 1080 px frame), RGB, high quality.
    if (!fs.existsSync(dst)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", "scale='if(gt(iw,ih),min(2600,iw),-2)':'if(gt(iw,ih),-2,min(2600,ih))',format=yuvj444p", "-frames:v", "1", "-q:v", "2", dst]); // first frame only (GIF drawings)
    const d = probe(dst); const s0 = probe(src);
    media[key] = { src: path.relative(work, dst), iw: d.w, ih: d.h, scale: d.w / s0.w, ...ph };
  }
  for (const [key, c] of Object.entries(spec.clips || {})) {
    const src = path.join(assets, c.file); const dir = path.join(mdir, key); fs.mkdirSync(dir, { recursive: true });
    const out = c.out || { w: 1080, h: 1080 };
    if (!fs.existsSync(path.join(dir, "0001.jpg")))
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(c.from), "-i", src, "-t", String(c.to - c.from), "-vf", `fps=${FPS},crop=${c.crop.w}:${c.crop.h}:${c.crop.x}:${c.crop.y},scale=${out.w}:${out.h}:flags=lanczos,format=yuvj420p`, "-q:v", "2", path.join(dir, "%04d.jpg")]);
    const frames = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    media[key] = { src: path.relative(work, path.join(dir, "0001.jpg")), dir: path.relative(work, dir), iw: out.w, ih: out.h, fps: FPS, frames, ...c, sourceCrop: c.crop, crop: { x: 0, y: 0, w: out.w, h: out.h } }; // frames are already cropped
  }
  return media;
}

async function main() {
  fs.mkdirSync(work, { recursive: true });
  if (PLAN) tail = PLAN.plan.film.tail;
  const media = prepareMedia();
  const duration = +(timeline.duration + tail).toFixed(3);
  const lib = fs.readFileSync(path.join(__dirname, "fr-lib.js"), "utf8");
  const scenes = fs.readFileSync(path.join(filmDir, "scenes.js"), "utf8");
  const forensic = fs.readFileSync(path.join(__dirname, "fr-forensic.js"), "utf8");
  // --overrides a.js,b.js: scene-only prototypes that FR.replace() shots of the film by id
  const overrides = (opt("--overrides", "") || "").split(",").filter(Boolean).map((f) => fs.readFileSync(path.resolve(f), "utf8")).join("\n");
  // plan mode: the engine's time references, templates and resolver run after the legacy scenes (which only
  // feed legacy-code shots); FR_PLAN carries the plan, evidence and assets into the page
  const E = path.join(__dirname, "engine"); const planJs = PLAN ? [path.join(E, "timeref.js"), path.join(E, "templates", "_common.js"),
    ...fs.readdirSync(path.join(E, "templates")).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => path.join(E, "templates", f)), path.join(E, "fr-plan.js")]
    .map((f) => fs.readFileSync(f, "utf8")).join("\n") : "";
  const planData = PLAN ? `window.FR_PLAN = ${JSON.stringify(PLAN).replace(/</g, "\\u003c")};` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${Fonts.css()}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#090c11}
#under,#media,#svg,#hud{position:absolute;left:0;top:0;width:${W}px;height:${H}px}#svg{overflow:visible}</style></head>
<body><div id="stage"><svg id="under" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg><div id="media"></div><svg id="svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg><div id="hud"></div></div>
<script>${lib}</script><script>${forensic}</script><script>${scenes}</script><script>${overrides}</script><script>${planData}</script><script>${planJs}</script></body></html>`;
  const page$ = path.join(work, "page.html"); fs.writeFileSync(page$, html);
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch(process.env.PD_CHROMIUM ? { executablePath: process.env.PD_CHROMIUM } : { args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + page$, { waitUntil: "load" });
  await page.evaluate(Fonts.PAGE_CHECK);
  const meta = await page.evaluate((a) => FR.init(a.timeline, a.media, a.duration), { timeline, media, duration });
  if (errors.length) throw new Error("scene errors: " + errors.join(" | "));
  fs.writeFileSync(path.join(work, "shots.json"), JSON.stringify(meta, null, 1) + "\n");
  fs.writeFileSync(path.join(work, "media-resolved.json"), JSON.stringify(media, null, 1) + "\n");

  // --inspect-text <step>: text boxes every <step> s -> work/text-inspection.json (no video is written).
  if (opt("--inspect-text", null)) {
    const step = +opt("--inspect-text"); const samples = [];
    for (let t = 0; t < duration; t += step) { await page.evaluate((x) => FR.frame(x), t); samples.push({ t: +t.toFixed(3), boxes: await page.evaluate(() => FR.inspectText()) }); }
    fs.writeFileSync(path.join(work, "text-inspection.json"), JSON.stringify({ step, duration, samples }, null, 1) + "\n");
    await browser.close(); if (errors.length) throw new Error("scene errors: " + errors.join(" | ")); console.log(`text inspection: ${samples.length} samples -> ${work}/text-inspection.json`); return;
  }
  const stills = opt("--stills", null);
  if (stills) {
    const sdir = path.join(work, "stills"); fs.mkdirSync(sdir, { recursive: true });
    for (const t of stills.split(",").map(Number)) { await page.evaluate((x) => FR.frame(x), t); await page.screenshot({ path: path.join(sdir, `t${t.toFixed(2).padStart(6, "0")}.png`) }); }
    await browser.close(); if (errors.length) throw new Error("scene errors: " + errors.join(" | ")); console.log(`stills -> ${sdir}`); return;
  }
  const from = +opt("--from", 0), to = Math.min(duration, +opt("--to", duration));
  const video = path.resolve(opt("--out", path.join(work, "video.mp4")));
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", "noise=alls=4:allf=u,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", opt("--preset", "slow"), "-crf", opt("--crf", "17"), "-x264-params", "aq-mode=3:colorprim=bt709:transfer=bt709:colormatrix=bt709",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", String(FPS), "-an", "-movflags", "+faststart", video], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, no) => ff.on("close", (c) => (c === 0 ? ok() : no(new Error("ffmpeg exited " + c)))));
  const n = Math.round((to - from) * FPS); const t0 = Date.now();
  // frame capture: lossless PNG either way. Default ("fast"): Chrome's speed-optimized PNG encoder over CDP
  // (bit-identical frames, larger PNGs, ~2.5x faster); --capture playwright uses Playwright's screenshot.
  const cdp = opt("--capture", "fast") === "fast" ? await page.context().newCDPSession(page) : null;
  const capture = cdp ? async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false })).data, "base64") : () => page.screenshot({ type: "png", timeout: 120000 });
  // --profile out.json: per-frame time in scene build + DOM update (page), screenshot (paint + PNG) and ffmpeg back-pressure
  const prof = opt("--profile", null) ? [] : null; const now = () => Number(process.hrtime.bigint()) / 1e6;
  for (let i = 0; i < n; i += 1) {
    const a0 = now(); const inPage = await page.evaluate(async (x) => { const q = performance.now(); await FR.frame(x); return performance.now() - q; }, from + i / FPS);
    const a1 = now(); const buf = await capture(); const a2 = now();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (prof) prof.push({ t: +(from + i / FPS).toFixed(3), build: +inPage.toFixed(1), evaluate: +(a1 - a0).toFixed(1), screenshot: +(a2 - a1).toFixed(1), pipe: +(now() - a2).toFixed(1), png: buf.length });
    if (i % 150 === 0) process.stdout.write(`\r[fr-premium] frame ${i}/${n}`);
  }
  ff.stdin.end(); const e0 = now(); await done; const encTail = now() - e0; await browser.close();
  if (prof) { const sum = (k) => +prof.reduce((x, r) => x + r[k], 0).toFixed(0); fs.writeFileSync(path.resolve(opt("--profile")), JSON.stringify({ frames: n, wallMs: Date.now() - t0, totals: { build: sum("build"), evaluate: sum("evaluate"), screenshot: sum("screenshot"), pipe: sum("pipe"), encodeTail: +encTail.toFixed(0), pngBytes: sum("png") }, frames_: prof }, null, 1) + "\n"); }
  if (errors.length) throw new Error("scene errors during render: " + errors.join(" | "));
  console.log(`\n[fr-premium] ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${video}`);
}
main().catch((e) => { console.error("RENDER FAILED:", e.message); process.exit(1); });
