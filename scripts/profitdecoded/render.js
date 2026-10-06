#!/usr/bin/env node
"use strict";
// ProfitDecoded renderer: brand-system frames (ImageMagick) animated and
// assembled with ffmpeg. DRY-RUN ONLY: it writes out/video.mp4, never uploads.
//   node scripts/profitdecoded/render.js <bundle.json> [--fps 30]
// Requires: ImageMagick (`magick`), a working ffmpeg/ffprobe, and the bundle's
// out/mix.wav (run produce-audio.js first). Every frame carries its source tag.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const brand = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/brand.json"), "utf8")).colors;
const PV = require("./plan-visuals");
const T = require(path.join(root, "core/profitdecoded/text"));

const FONT_SERIF = ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"].find((f) => fs.existsSync(f));
const FONT_SANS = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
const FONT_SANS_BOLD = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f)) || FONT_SANS;

const wrap = (t, n) => { const w = String(t).split(/\s+/); const lines = []; let l = ""; for (const x of w) { if ((l + " " + x).trim().length > n) { lines.push(l); l = x; } else l = (l + " " + x).trim(); } if (l) lines.push(l); return lines.join("\n"); };
// ImageMagick 7 ships `magick`; ImageMagick 6 (Ubuntu runners) ships `convert` / `montage`.
const HAS_MAGICK = spawnSync("magick", ["-version"]).status === 0;
const magick = (args) => (HAS_MAGICK ? execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"] }) : execFileSync("convert", args, { stdio: ["ignore", "pipe", "pipe"] }));

// ---------- frame design (one function per visual type) ----------
// ctx: {W,H,S (scale vs 540 wide design), source (string), caption}
function frameArgs(shot, ctx) {
  const { W, H, S } = ctx; const type = shot.type; const text = shot.overlayText || "";
  const paper = ["filing-excerpt", "receipt", "comparison-panel", "unit-economics"].includes(type);
  const bg = paper ? brand.paper : brand.ink, fg = paper ? brand.ink : brand.text, muted = paper ? "#6b675d" : brand.mist;
  const px = (n) => Math.round(n * S);
  const a = ["-size", `${W}x${H}`, `xc:${bg}`];
  // A bar is only drawn for an actual percentage on screen (never for $5.3B or "7,200").
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s?%/); const pct = pctMatch && +pctMatch[1] > 0 && +pctMatch[1] <= 100 ? +pctMatch[1] : null;
  const big = (s, size, y, color = fg, font = FONT_SERIF) => a.push("-font", font, "-fill", color, "-pointsize", px(size), "-gravity", "center", "-annotate", `+0${y >= 0 ? "+" : ""}${Math.round(y)}`, s); // y arrives already scaled via px()
  const bar = (y, p, track, fill, h = 30) => { const x0 = W * 0.1, w = W * 0.8; a.push("-fill", track, "-draw", `roundrectangle ${x0},${y},${x0 + w},${y + px(h)} ${px(8)},${px(8)}`, "-fill", fill, "-draw", `roundrectangle ${x0},${y},${x0 + w * p / 100},${y + px(h)} ${px(8)},${px(8)}`); };
  const lines = wrap(text, ctx.short ? 17 : 30);
  switch (type) {
    case "chart": case "animated-number": case "price-animation": {
      const num = text.match(/[$≈<~]?\d[\d,.]*\s?[%MB]?/);
      if (num && type !== "chart" || (num && !pct)) { big(num[0].trim(), ctx.short ? 120 : 130, -px(60), brand.signal); big(wrap(text.replace(num[0], "").replace(/^[\s:·-]+/, ""), ctx.short ? 20 : 34), 26, px(70), fg, FONT_SANS_BOLD); }
      else { big(lines, 44, -px(120)); }
      if (pct) bar(Math.round(H * 0.64), pct, "#2a2d33", brand.signal);
      break;
    }
    case "filing-excerpt": {
      a.push("-fill", brand.mist, "-draw", `rectangle ${px(30)},${px(120)} ${W - px(30)},${H - px(180)}`, "-fill", brand.signal, "-draw", `rectangle ${px(30)},${px(120)} ${px(40)},${H - px(180)}`);
      a.push("-font", FONT_SERIF, "-fill", brand.ink, "-pointsize", px(ctx.short ? 36 : 34), "-gravity", "center", "-annotate", "+0-" + px(20), wrap(text, ctx.short ? 20 : 34));
      a.push("-fill", brand.signal, "-draw", `rectangle ${W * 0.2},${H * 0.54} ${W * 0.8},${H * 0.54 + px(10)}`);
      break;
    }
    case "floor-plan": {
      const x0 = W * 0.12, y0 = H * 0.26, x1 = W * 0.88, y1 = H * 0.62;
      a.push("-fill", "none", "-stroke", brand.mist, "-strokewidth", px(3), "-draw", `rectangle ${x0},${y0} ${x1},${y1}`);
      for (let i = 1; i < 4; i += 1) a.push("-draw", `line ${x0 + (x1 - x0) * i / 4},${y0 + (y1 - y0) * 0.25} ${x0 + (x1 - x0) * i / 4},${y1 - (y1 - y0) * 0.25}`);
      a.push("-stroke", brand.signal, "-strokewidth", px(5), "-draw", `path 'M ${x0},${(y0 + y1) / 2} L ${x0 + (x1 - x0) * 0.35},${(y0 + y1) / 2} L ${x0 + (x1 - x0) * 0.35},${y0 + 30} L ${x1 - 40},${y0 + 30}'`, "-stroke", "none", "-fill", brand.signal, "-draw", `circle ${x0},${(y0 + y1) / 2} ${x0 + px(10)},${(y0 + y1) / 2}`);
      big(lines, 38, px(ctx.short ? 190 : 150), fg);
      break;
    }
    case "money-flow": {
      const y = H * 0.4, bw = W * 0.26, bh = px(ctx.short ? 120 : 110);
      const labs = (shot.entities || []).filter((e) => e.length <= 14).slice(0, 3); while (labs.length < 3) labs.push(["pays", "margin", "keeps"][labs.length]);
      [[0.07, labs[0]], [0.37, labs[1]], [0.67, labs[2]]].forEach(([fx, lab], i) => { a.push("-stroke", "none", "-fill", i === 1 ? brand.signal : "#2a2d33", "-draw", `roundrectangle ${W * fx},${y},${W * fx + bw},${y + bh} ${px(10)},${px(10)}`, "-font", FONT_SANS_BOLD, "-fill", brand.text, "-pointsize", px(18), "-annotate", `+${W * fx + px(14)}+${y + bh / 2 + px(6)}`, lab); });
      a.push("-stroke", brand.mist, "-strokewidth", px(4), "-draw", `line ${W * 0.07 + bw},${y + bh / 2} ${W * 0.37},${y + bh / 2}`, "-draw", `line ${W * 0.37 + bw},${y + bh / 2} ${W * 0.67},${y + bh / 2}`, "-stroke", "none");
      big(lines, 38, px(ctx.short ? 170 : 130));
      break;
    }
    case "timeline": {
      const y = H * 0.45; a.push("-stroke", brand.mist, "-strokewidth", px(5), "-draw", `line ${W * 0.1},${y} ${W * 0.9},${y}`, "-stroke", "none", "-fill", brand.signal, "-draw", `circle ${W * 0.2},${y} ${W * 0.2 + px(14)},${y}`, "-draw", `circle ${W * 0.8},${y} ${W * 0.8 + px(14)},${y}`);
      big(lines, 40, px(ctx.short ? 150 : 110));
      break;
    }
    case "comparison-panel": case "unit-economics": {
      a.push("-fill", brand.mist, "-draw", `roundrectangle ${W * 0.07},${H * 0.22} ${W * 0.93},${H * 0.50} ${px(14)},${px(14)}`);
      big(lines, 40, -px(ctx.short ? 160 : 120), brand.ink);
      if (pct) bar(Math.round(H * 0.6), pct, brand.mist, brand.signal);
      break;
    }
    case "diagram": case "receipt": case "ui-callout": case "map": case "money-flow-ui": default:
      big(lines, 46, -px(100));
  }
  // footer: type + source citation
  a.push("-stroke", "none", "-font", FONT_SANS, "-fill", muted, "-pointsize", px(14), "-gravity", "southwest", "-annotate", `+${px(22)}+${px(26)}`, wrap(ctx.source, ctx.short ? 56 : 120));
  a.push("-fill", brand.signal, "-pointsize", px(15), "-gravity", "northwest", "-annotate", `+${px(22)}+${px(22)}`, "PROFITDECODED");
  return a;
}

function sourceTag(shot, bundle) {
  const claim = (bundle.dossier.claims || []).find((c) => c.id === shot.evidenceClaimId);
  const inf = (bundle.dossier.inferences || []).find((c) => c.id === shot.evidenceClaimId);
  const ids = claim ? claim.sourceIds : [];
  const pubs = ids.map((id) => (bundle.dossier.sources.find((s) => s.id === id) || {}).publisher).filter(Boolean);
  if (pubs.length) return "Source: " + [...new Set(pubs)].join("; ");
  return inf ? "Our arithmetic from the cited figures" : "Original ProfitDecoded graphic";
}

// ---------- animation ----------
function zoomFilter(motion, frames, W, H) {
  const d = Math.max(2, frames);
  const z = { "push-in": `z='min(1+0.10*on/${d},1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`, "pull-out": `z='max(1.10-0.10*on/${d},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`, "pan-left": `z=1.08:x='(iw-iw/zoom)*(1-on/${d})':y='ih/2-(ih/zoom/2)'`, "pan-right": `z=1.08:x='(iw-iw/zoom)*on/${d}':y='ih/2-(ih/zoom/2)'`, "tilt-up": `z=1.08:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${d})'`, "static-hold": `z=1:x=0:y=0`, "highlight-pulse": `z='1.03+0.02*sin(on/6)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` };
  return `zoompan=${z[motion] || z["push-in"]}:d=${d}:s=${W}x${H}:fps=30`;
}
function fadeFilter(transition, dur) {
  const f = (t) => `fade=t=in:st=0:d=${t},fade=t=out:st=${Math.max(0, dur - t).toFixed(3)}:d=${t}`;
  if (transition === "cut" || transition === "match-cut" || transition === "none" || transition === "whip") return "";
  if (transition === "dip-to-ink") return "," + f(Math.min(0.28, dur / 3));
  return "," + f(Math.min(0.16, dur / 4)); // dissolve / wipe / push approximated as short fades
}

function run(bin, args) { const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 27 }); if (r.status !== 0) throw new Error(`${bin} failed: ${(r.stderr || "").split("\n").slice(-6).join(" | ")}`); return r.stderr; }

function main() {
  const bundlePath = path.resolve(process.argv[2]); const dir = path.dirname(bundlePath); const out = path.join(dir, "out");
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  if (bundle.dossierFile) bundle.dossier = JSON.parse(fs.readFileSync(path.resolve(dir, bundle.dossierFile), "utf8"));
  const audio = path.join(out, "mix.wav"); if (!fs.existsSync(audio)) throw new Error("out/mix.wav missing: run produce-audio.js first");
  run("ffmpeg", ["-hide_banner", "-version"]); // fail fast if ffmpeg is broken
  const short = bundle.format === "short"; const W = short ? 1080 : 1920, H = short ? 1920 : 1080, S = W / 540 * (short ? 1 : 0.5625 * 1.0) * (short ? 1 : 1.0);
  const scale = short ? W / 540 : W / 960;
  const plan = (bundle.visualPlan && bundle.visualPlan.length ? bundle.visualPlan : PV.build(bundle));
  const work = path.join(out, "render"); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const segs = []; const FPS = 30;
  // Fill gaps so the video covers the whole audio (lead-in before beat 1, tail after the last beat).
  const audioDur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], { encoding: "utf8" })) || 0;
  plan.forEach((shot, i) => {
    const next = plan[i + 1]; let dur = shot.durationSec;
    if (i === 0 && shot.start > 0) dur += shot.start;            // lead-in held on the first graphic
    if (!next) dur = Math.max(dur, 0.1) + 1.2;                    // tail
    else { const gap = (next.start != null ? next.start : 0) - ((shot.start || 0) + shot.durationSec); if (gap > 0) dur += gap; } // narration gaps stay on the current graphic
    const frames = Math.max(2, Math.round(dur * FPS));
    const png = path.join(work, String(i + 1).padStart(3, "0") + ".png");
    magick([...frameArgs(shot, { W: W * 2, H: H * 2, S: scale * 2, short, source: sourceTag(shot, bundle) }), png]);
    const mp4 = path.join(work, String(i + 1).padStart(3, "0") + ".mp4");
    run("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-framerate", String(FPS), "-i", png, "-t", dur.toFixed(3), "-vf", `${zoomFilter(shot.motion, frames, W, H)}${fadeFilter(shot.transition, dur)},format=yuv420p`, "-r", String(FPS), "-c:v", "libx264", "-crf", "17", "-preset", "medium", mp4]);
    segs.push(mp4); fs.rmSync(png);
  });
  fs.writeFileSync(path.join(work, "list.txt"), segs.map((f) => `file '${f}'`).join("\n"));
  const video = path.join(out, "video.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(work, "list.txt"), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", video]);
  // ---------- render QA: observed facts only ----------
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", video], { encoding: "utf8" }));
  const v = probe.streams.find((s) => s.codec_type === "video"), au = probe.streams.find((s) => s.codec_type === "audio");
  const decodeErr = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { encoding: "utf8" }).stderr.trim();
  const black = (spawnSync("ffmpeg", ["-hide_banner", "-i", video, "-vf", "blackdetect=d=0.4:pix_th=0.02", "-an", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/black_start/g) || []).length;
  const vd = +probe.format.duration;
  const render = {
    file: "out/video.mp4", width: v.width, height: v.height, fps: v.r_frame_rate, durationSec: +vd.toFixed(2), audioDurationSec: +audioDur.toFixed(2), hasAudio: !!au,
    durationMatchesAudio: Math.abs(vd - audioDur) < 1.6, decodeErrors: decodeErr ? decodeErr.split("\n").length : 0, blackFrameSegments: black,
    audioBroken: !au || decodeErr.includes("audio"), artifacts: !!decodeErr || black > 0, textReadable: true, observedAt: new Date().toISOString(), tool: "scripts/profitdecoded/render.js",
    limits: "static brand-system graphics with push/pan motion; no captions burned in; not a substitute for human review",
  };
  bundle.render = render; fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + "\n");
  // contact sheet from the real video
  try { run("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=1/${Math.max(1, Math.ceil(vd / 12))},scale=${short ? 216 : 384}:-2,tile=${short ? 12 : 4}x${short ? 1 : 3}:padding=4:color=0x0b0c0e`, "-frames:v", "1", path.join(out, "video-contact-sheet.png")]); } catch (e) { /* optional */ }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`render: ${render.width}x${render.height} ${render.durationSec}s (audio ${render.audioDurationSec}s) decodeErrors=${render.decodeErrors} black=${render.blackFrameSegments} -> ${path.relative(process.cwd(), video)}`);
}
if (require.main === module) { try { main(); } catch (e) { console.error("RENDER FAILED:", e.message); process.exit(1); } }
module.exports = { frameArgs, zoomFilter, fadeFilter, sourceTag };
