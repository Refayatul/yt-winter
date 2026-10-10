#!/usr/bin/env node
"use strict";
// ProfitDecoded motion renderer: frame-accurate HTML/SVG motion graphics captured in headless
// Chromium and encoded with ffmpeg. DRY-RUN ONLY: writes files under <dir>/out, never uploads.
//
//   node scripts/profitdecoded/motion/render-motion.js <dir> [--fps 30] [--stills 1.5,12,30] [--from s] [--to s]
//   --video-only --out path.mp4 renders a revision range without remastering the existing soundtrack.
//   --analyze-only [--qa qa.json] writes out/visual-diversity.{json,md} without capturing video.
//
// <dir> holds scenes.js (the shot list, using the PD library in brand-lib.js), out/timeline.json
// (sentence timings from produce-audio.js) and out/mix.wav. Every frame is a pure function of time,
// so a render is reproducible. Requires playwright-core with a Chromium headless shell
// (PD_PLAYWRIGHT_CORE / PD_CHROMIUM override the lookups) and ffmpeg.
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const Diversity = require("../../../core/profitdecoded/visual-diversity");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dir = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
const FPS = +opt("--fps", 30);
const W = 1920, H = 1080;

const Fonts = require("./fonts");
// playwright-core is an exact-pinned devDependency; its Chromium headless shell is installed with
// `npx playwright-core install --only-shell chromium` (PD_CHROMIUM overrides the executable).
function loadPlaywright() {
  try { return require("playwright-core"); } catch (e) { throw new Error("playwright-core missing: run npm install (it is a pinned devDependency)"); }
}
const launchOptions = () => (process.env.PD_CHROMIUM ? { executablePath: process.env.PD_CHROMIUM } : {});

// Captions: sentence text split into cues of at most 2 lines x 42 characters, timed in proportion to
// the spoken characters inside each measured sentence (the TTS gives sentence, not word, timings).
function captions(timeline) {
  const cues = [];
  for (const s of timeline) {
    const words = s.text.split(/\s+/); const chunks = []; let cur = [];
    // One line up to 42 characters; otherwise the most balanced two-line break with both lines <= 42.
    const fits = (ws) => { const all = ws.join(" "); if (all.length <= 42) return [all]; let best = null;
      for (let k = 1; k < ws.length; k += 1) { const a = ws.slice(0, k).join(" "), b = ws.slice(k).join(" "); if (a.length > 42 || b.length > 42) continue; const sc = Math.max(a.length, b.length); if (!best || sc < best.sc) best = { sc, lines: [a, b] }; }
      return best ? best.lines : null; };
    // Balanced split: the fewest cues that fit, with similar lengths (no orphaned two-word tail cue).
    for (let n = 1; n <= words.length; n += 1) {
      const target = s.text.length / n; const parts = []; cur = [];
      for (const w of words) { if (cur.length && (cur.join(" ").length + 1 + w.length > target * 1.15) && parts.length < n - 1) { parts.push(cur); cur = []; } cur.push(w); }
      parts.push(cur);
      if (parts.every((c) => fits(c))) { chunks.push(...parts); break; }
    }
    const total = chunks.reduce((n, c) => n + c.join(" ").length, 0); let t = s.start;
    for (const c of chunks) { const d = (s.end - s.start) * (c.join(" ").length / total); cues.push({ start: t, end: t + d, lines: fits(c) }); t += d; }
  }
  // A very short spoken line ("It won't.") stays on screen for at least 1 s by extending into the pause after it,
  // never past the next cue's start.
  cues.forEach((c, i) => { if (c.end - c.start < 1) c.end = Math.min(c.start + 1, i + 1 < cues.length ? cues[i + 1].start : c.start + 1); });
  return cues;
}
const stamp = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.lines.join("\n")}\n`).join("\n");

// Audio master: measured gain to -14 LUFS integrated, then a limiter at -2 dBFS sample peak so the AAC
// encode stays under -1 dBTP; stereo 48 kHz. Returns the measurements before and after.
function loud(file) { const e = require("child_process").spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr; const sum = e.slice(e.lastIndexOf("Summary"));
  return { I: +((sum.match(/I:\s+(-?[\d.]+)/) || [])[1]), LRA: +((sum.match(/LRA:\s+(-?[\d.]+)/) || [])[1]), truePeak: +((sum.match(/Peak:\s+(-?[\d.]+)/) || [])[1]) }; }
function master(src, dst, target = -14) {
  const before = loud(src); const gain = (target - before.I).toFixed(2);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-af", `volume=${gain}dB,alimiter=limit=0.794:attack=5:release=80:level=disabled,aresample=48000`, "-ac", "2", "-c:a", "pcm_s24le", dst]);
  return { before, gainDb: +gain, after: loud(dst) };
}

// Sample the actual composed SVG once late in each shot. Bounds include camera transforms.
// At a 640 px playback width, the 1920 px canvas is scaled by exactly one third.
async function inspectShotFrames(page, shots) {
  const observations = [];
  for (const shot of shots) {
    const second = shot.start + (shot.end - shot.start) * 0.82;
    observations.push(await page.evaluate(({ shotId, second }) => {
      PD.frame(second);
      const visible = (el) => {
        let opacity = 1;
        for (let node = el; node && node.id !== "stage"; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          opacity *= Number(style.opacity);
        }
        const r = el.getBoundingClientRect();
        return opacity >= 0.5 && r.width > 2 && r.height > 2 && r.right > 0 && r.left < 1920 && r.bottom > 0 && r.top < 1080;
      };
      const texts = [...document.querySelectorAll("#stage svg text")].filter(visible);
      const essential = texts.filter((el) => !el.closest('[data-role="source"], [data-role="decorative"]'));
      const sources = texts.filter((el) => !!el.closest('[data-role="source"]'));
      const sizes = essential.map((el) => +(el.getBoundingClientRect().height / 3).toFixed(1)).filter((n) => n > 0);
      const clipped = sources.some((el) => { const r = el.getBoundingClientRect(); return r.left < 60 || r.right > 1860 || r.bottom > 1070; });
      const sourceSizes = sources.map((el) => +(el.getBoundingClientRect().height / 3).toFixed(1)).filter((n) => n > 0);
      return { shotId, second: +second.toFixed(2), essentialTextPxOn640: sizes.length ? Math.min(...sizes) : 0,
        sourceTextPxOn640: sourceSizes.length ? Math.min(...sourceSizes) : 0,
        essentialTextCount: essential.length, sourcePresent: sources.length > 0, sourceClipped: clipped,
        sourceText: sources.map((el) => el.textContent.trim()).slice(0, 2) };
    }, { shotId: shot.id, second }));
  }
  return observations;
}

async function main() {
  const out = path.join(dir, "out"); const timeline = JSON.parse(fs.readFileSync(path.join(out, "timeline.json"), "utf8"));
  const audio = path.join(out, "mix.wav"); if (!fs.existsSync(audio)) throw new Error("out/mix.wav missing: run produce-audio.js first");
  const audioDur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], { encoding: "utf8" }));
  const lib = fs.readFileSync(path.join(__dirname, "brand-lib.js"), "utf8"); const scenes = fs.readFileSync(path.join(dir, "scenes.js"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${Fonts.css()}\nhtml,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}.layer{position:absolute;inset:0}</style></head><body><div id="stage"></div><script>${lib}</script><script>${scenes}</script></body></html>`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(Fonts.PAGE_CHECK);
  const meta = await page.evaluate((a) => PD.init(a.timeline, a.audioDur), { timeline, audioDur });
  if (errors.length) throw new Error("scene errors: " + errors.join(" | "));
  const frameObservations = await inspectShotFrames(page, meta.shots);
  // --qa <qa-media.json> adds measured near-static intervals from an already rendered master.
  const freezes = opt("--qa", null) ? JSON.parse(fs.readFileSync(opt("--qa"), "utf8")).freezes || [] : [];
  const diversity = Diversity.analyze(meta.shots, { timeline, frameObservations, freezes });
  fs.writeFileSync(path.join(out, "visual-diversity.json"), JSON.stringify(diversity, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "visual-diversity.md"), Diversity.markdown(diversity));
  fs.writeFileSync(path.join(out, "visual-frame-samples.json"), JSON.stringify(frameObservations, null, 2) + "\n");
  if (args.includes("--analyze-only")) {
    await browser.close(); console.log(`visual-diversity -> ${path.relative(process.cwd(), out)} (${diversity.issues.length} review flags)`); return;
  }
  const total = Math.max(audioDur, meta.duration);
  const stills = opt("--stills", null);
  if (stills) {
    const sdir = path.join(out, "stills"); fs.mkdirSync(sdir, { recursive: true });
    for (const t of stills.split(",").map(Number)) { await page.evaluate((x) => PD.frame(x), t); await page.screenshot({ path: path.join(sdir, `t${t.toFixed(2).padStart(6, "0")}.png`) }); }
    await browser.close(); console.log(`stills -> ${path.relative(process.cwd(), sdir)}`); return;
  }
  const from = +opt("--from", 0), to = Math.min(total, +opt("--to", total));
  const videoOnly = args.includes("--video-only");
  let mastered = null;
  if (!videoOnly) {
    mastered = path.join(out, "master.wav"); const audioMaster = master(audio, mastered);
    fs.writeFileSync(path.join(out, "audio-master.json"), JSON.stringify(audioMaster, null, 1) + "\n");
  }
  const video = path.resolve(opt("--out", path.join(out, "prototype.mp4")));
  fs.mkdirSync(path.dirname(video), { recursive: true });
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    ...(videoOnly ? [] : ["-ss", String(from), "-i", mastered]),
    // Fixed-pattern dither (noise, not temporal grain) stops dark gradients banding in 8-bit H.264; explicit
    // BT.709 conversion and tags keep brand colours from shifting in players.
    "-map", "0:v", ...(videoOnly ? ["-an"] : ["-map", "1:a", "-af", `apad,atrim=0:${(to - from).toFixed(3)}`]), "-vf", "noise=alls=6:allf=u,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", opt("--preset", "slow"), "-crf", opt("--crf", "17"), "-x264-params", "aq-mode=3:deblock=-1,-1:colorprim=bt709:transfer=bt709:colormatrix=bt709", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", String(FPS),
    ...(videoOnly ? [] : ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2"]), "-t", (to - from).toFixed(3), "-movflags", "+faststart", video], { stdio: ["pipe", "inherit", "inherit"] });
  const ffDone = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  const n = Math.round((to - from) * FPS); const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    await page.evaluate((x) => PD.frame(x), from + i / FPS);
    // A transient browser stall (system load, sleep) must not lose a long render: every frame is a pure function of
    // time, so the same frame is simply captured again (at most twice) with a longer timeout.
    let buf = null;
    for (let a = 0; !buf; a += 1) { try { buf = await page.screenshot({ type: "png", timeout: 120000 }); } catch (e) { if (a >= 2) throw e; process.stdout.write(`\n[motion] frame ${i}: screenshot retry ${a + 1} (${String(e.message).split("\n")[0]})\n`); await page.evaluate((x) => PD.frame(x), from + i / FPS); } }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) process.stdout.write(`\r[motion] frame ${i}/${n}`);
  }
  ff.stdin.end(); await ffDone; await browser.close();
  if (errors.length) throw new Error("scene errors during render: " + errors.join(" | "));
  fs.writeFileSync(path.join(out, "captions.srt"), toSrt(captions(timeline)));
  fs.writeFileSync(path.join(out, "shots.json"), JSON.stringify(meta.shots, null, 1) + "\n");
  console.log(`\n[motion] ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(process.cwd(), video)} (${(to - from).toFixed(2)} s)`);
}
if (require.main === module) main().catch((e) => { console.error("MOTION RENDER FAILED:", e.message); process.exit(1); });
module.exports = { captions, toSrt, loadPlaywright, launchOptions };
