#!/usr/bin/env node
"use strict";
// Replace selected timed scenes in an already approved local master. Unchanged picture
// comes from the original; its AAC audio is copied into the new film without TTS calls.
//   node revise-master.js <film-dir> --source original.mp4 --out version-2.mp4 --ids shot-a,shot-b [--resume]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");

const args = process.argv.slice(2);
const opt = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const dir = path.resolve(args[0] || ".");
const source = path.resolve(opt("--source") || "");
const output = path.resolve(opt("--out") || "");
const wanted = new Set((opt("--ids") || "").split(",").filter(Boolean));
const fps = 30;
const sec = (frame) => (frame / fps).toFixed(6);
const fileHash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rangeKey = (start, end, ids) => `${start}:${end}:${[...ids].sort().join(",")}`;
const videoFrames = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

function run(command, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, argv, { stdio: "inherit" });
    p.on("error", reject); p.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function main() {
  if (!opt("--source") || !opt("--out") || !wanted.size) throw new Error("usage: revise-master.js <film-dir> --source original.mp4 --out new.mp4 --ids shot-a,shot-b");
  if (!fs.existsSync(source)) throw new Error(`source missing: ${source}`);
  if (source === output) throw new Error("output must not overwrite the source master");
  if (fs.existsSync(output) && !args.includes("--force")) throw new Error(`output already exists: ${output} (use --force for a deliberate rerun)`);
  const shotFile = path.join(dir, "out", "visual-diversity.json");
  if (!fs.existsSync(shotFile)) throw new Error("run render-motion.js --analyze-only first");
  const shots = JSON.parse(fs.readFileSync(shotFile, "utf8")).shotList;
  const selected = shots.filter((s) => wanted.has(s.id));
  if (selected.length !== wanted.size) throw new Error(`unknown shot id(s): ${[...wanted].filter((id) => !selected.some((s) => s.id === id)).join(", ")}`);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", source], { encoding: "utf8" }));
  const video = probe.streams.find((s) => s.codec_type === "video");
  if (video.r_frame_rate !== "30/1" || video.width !== 1920 || video.height !== 1080) throw new Error("source must be the 1920x1080/30 ProfitDecoded master");
  if (!probe.streams.some((s) => s.codec_type === "audio")) throw new Error("source audio missing");
  const totalFrames = Number(video.nb_frames);
  const margin = 18; // covers authored crossfades at both edit boundaries
  const ranges = selected.map((s) => ({ start: Math.max(0, Math.round(s.start * fps) - margin), end: Math.min(totalFrames, Math.round(s.end * fps) + margin), ids: [s.id] })).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) { last.end = Math.max(last.end, r.end); last.ids.push(...r.ids); }
    else merged.push({ ...r });
  }
  const workName = opt("--work-name") || "revision";
  if (path.basename(workName) !== workName) throw new Error("--work-name must be one directory name");
  const work = path.join(dir, "out", workName); fs.mkdirSync(work, { recursive: true });
  const manifestFile = path.join(work, "manifest.json");
  const checkpointFile = path.join(work, "checkpoint.json");
  const renderer = path.join(__dirname, "render-motion.js");
  const fingerprint = { sourceSha256: fileHash(source), scenesSha256: fileHash(path.join(dir, "scenes.js")),
    rendererSha256: fileHash(renderer), librarySha256: fileHash(path.join(__dirname, "brand-lib.js")) };
  const checkpoint = args.includes("--resume") && fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, "utf8")) : { schema: "profitdecoded.revision-checkpoint.v1", fingerprint, segments: {} };
  const compatible = Object.keys(fingerprint).every((k) => checkpoint.fingerprint?.[k] === fingerprint[k]);
  if (!compatible) throw new Error("revision checkpoint fingerprint changed; use a new --work-name to keep the completed renders intact");
  const reusable = new Map();
  if (args.includes("--resume")) {
    for (const [key, item] of Object.entries(checkpoint.segments || {})) {
      const file = path.join(work, item.file);
      if (fs.existsSync(file) && fileHash(file) === item.sha256 && videoFrames(file) === item.frames) reusable.set(key, file);
    }
  }
  let nextFresh = 1;
  while (fs.existsSync(path.join(work, `replacement-${String(nextFresh).padStart(2, "0")}.mp4`))) nextFresh += 1;
  for (let i = 0; i < merged.length; i += 1) {
    const r = merged[i]; const cached = reusable.get(rangeKey(r.start, r.end, r.ids));
    r.file = cached || path.join(work, `replacement-${String(nextFresh++).padStart(2, "0")}.mp4`);
    console.log(`revision ${i + 1}/${merged.length}: ${sec(r.start)}–${sec(r.end)} (${r.ids.join(", ")})`);
    if (cached) console.log(`  reuse ${path.basename(cached)}`);
    else {
      await run(process.execPath, [renderer, dir, "--video-only", "--from", sec(r.start), "--to", sec(r.end), "--out", r.file, "--preset", "veryfast", "--crf", "14"]);
      if (videoFrames(r.file) !== r.end - r.start) throw new Error(`replacement frame count differs from target range: ${r.file}`);
      checkpoint.segments[rangeKey(r.start, r.end, r.ids)] = { file: path.basename(r.file), sha256: fileHash(r.file), frames: r.end - r.start };
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2) + "\n");
    }
  }
  const pieces = []; let at = 0;
  for (const r of merged) {
    if (r.start > at) pieces.push({ kind: "original", start: at, end: r.start, file: source });
    pieces.push({ kind: "replacement", start: r.start, end: r.end, file: r.file, ids: r.ids }); at = r.end;
  }
  if (at < totalFrames) pieces.push({ kind: "original", start: at, end: totalFrames, file: source });
  const inputArgs = [];
  for (const piece of pieces) {
    if (piece.kind === "original") inputArgs.push("-ss", sec(piece.start), "-t", sec(piece.end - piece.start));
    inputArgs.push("-i", piece.file);
  }
  const audioIndex = pieces.length; inputArgs.push("-i", source);
  const chains = pieces.map((piece, i) => `[${i}:v]fps=${fps},trim=end_frame=${piece.end - piece.start},setpts=N/(${fps}*TB),format=yuv420p[v${i}]`);
  const concat = `${pieces.map((_, i) => `[v${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[v]`;
  const temp = output + ".partial.mp4";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await run("ffmpeg", ["-v", "error", "-stats", "-y", ...inputArgs, "-filter_complex", [...chains, concat].join(";"), "-map", "[v]", "-map", `${audioIndex}:a:0`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "copy", "-r", String(fps), "-t", sec(totalFrames), "-movflags", "+faststart", temp]);
  fs.renameSync(temp, output);
  const manifest = { schema: "profitdecoded.revision.v2", source, sourceSha256: fingerprint.sourceSha256, output, outputSha256: fileHash(output), frames: totalFrames, fps, fingerprint,
    audio: "original AAC stream copied without resynthesis", replacementRanges: merged.map(({ start, end, ids, file }) => ({ startFrame: start, endFrame: end, startSec: +sec(start), endSec: +sec(end), shots: ids, file: path.basename(file) })), pieces: pieces.map(({ kind, start, end, ids }) => ({ kind, startFrame: start, endFrame: end, shots: ids || [] })) };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`revised master -> ${output}`);
}
if (require.main === module) main().catch((e) => { console.error("REVISION FAILED:", e.message); process.exit(1); });
