// SHORTS NARRATION FALLBACK: what happens when the Edge voice is refused.
//
// The primary voice stays the channel's Edge voice (config.voice). When Edge refuses or fails
// within its bounded retries, a Short may be narrated by an OFFLINE fallback, Kokoro-82M
// (kokoro-onnx on CPU; Apache-2.0 model and voices; no key, no account, no cost), but only
// when ALL of these hold:
//   1. the channel names a fallback voice: config.voice.fallback = { provider: "kokoro", voice, speed, approved }
//   2. the Kokoro model files and Python package are present on this machine;
//   3. either the owner approved that voice for publishing (fallback.approved === true), or this
//      run does not publish (PUBLISH != 1) AND the run explicitly asked for previews with
//      SHORTS_TTS_FALLBACK=preview. An unreviewed voice therefore never reaches YouTube.
// SHORTS_TTS_FALLBACK=off disables the fallback entirely.
//
// The whole narration of a Short comes from ONE voice: when Edge fails part-way, every line is
// re-read by the fallback; voices are never mixed inside a video. Every narration, primary or
// fallback, must pass lib/speech-check.js before rendering continues.
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// Exit status of a renderer that could not get valid narration (EX_TEMPFAIL): the topic is not at
// fault, so the queue must neither mark it failed nor move on to burn the next one.
const NARRATION_UNAVAILABLE_EXIT = 75;

// A refusal (401/403/429) is the service declining this client; a few spaced retries are worth
// it (refusals were intermittent on 2026-10-12), endless ones are not.
const isRefusal = (message) => /\b(401|403|429)\b|Unexpected server response/i.test(String(message || ""));

function kokoroPaths(env = process.env) {
  const dir = env.SHORTS_KOKORO_DIR || path.join(ROOT, "kokoro-model");
  return {
    model: env.SHORTS_KOKORO_MODEL || path.join(dir, "kokoro-v1.0.onnx"),
    voices: env.SHORTS_KOKORO_VOICES || path.join(dir, "voices-v1.0.bin"),
    python: env.SHORTS_KOKORO_PYTHON || "python3",
  };
}

function kokoroAvailable(env = process.env) {
  const paths = kokoroPaths(env);
  for (const [label, file] of [["model", paths.model], ["voices", paths.voices]]) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000) return { ok: false, reason: `Kokoro ${label} file missing (${file})` };
  }
  const probe = cp.spawnSync(paths.python, ["-c", "import kokoro_onnx, soundfile"], { encoding: "utf8", timeout: 60000 });
  if (probe.status !== 0) return { ok: false, reason: `Kokoro Python package unavailable (${paths.python}: ${String(probe.stderr || probe.error || "").trim().split("\n").pop()})` };
  return { ok: true, reason: null };
}

// Whether this run may narrate the channel with its fallback voice, and why not.
function fallbackPolicy(channel, env = process.env, available = kokoroAvailable) {
  const fallback = ((channel.config || {}).voice || {}).fallback || null;
  const mode = String(env.SHORTS_TTS_FALLBACK || "").toLowerCase();
  const base = { allowed: false, provider: fallback ? fallback.provider : null, voice: fallback ? fallback.voice : null, speed: fallback ? Number(fallback.speed) || 1 : 1, approved: !!(fallback && fallback.approved === true) };
  if (mode === "off") return { ...base, reason: "SHORTS_TTS_FALLBACK=off" };
  if (!fallback || fallback.provider !== "kokoro" || !fallback.voice) return { ...base, reason: "no fallback voice configured for this channel" };
  const publishing = env.PUBLISH === "1";
  if (!base.approved && (publishing || mode !== "preview")) {
    return { ...base, reason: publishing ? `fallback voice ${fallback.voice} is not approved for publishing (config.voice.fallback.approved)` : "unapproved fallback voice: previews need SHORTS_TTS_FALLBACK=preview" };
  }
  const ready = available(env);
  if (!ready.ok) return { ...base, reason: ready.reason };
  return { ...base, allowed: true, reason: base.approved ? "approved fallback voice" : "preview only (not publishable)" };
}

// Reads every line with Kokoro (one model load). Returns [{ file, seconds }] in line order.
function kokoroLines(lines, outDir, { voice, speed = 1, env = process.env, timeoutMs = 600000 } = {}) {
  const paths = kokoroPaths(env);
  fs.mkdirSync(outDir, { recursive: true });
  const spec = path.join(outDir, "kokoro-spec.json");
  fs.writeFileSync(spec, JSON.stringify({ voice, speed, lines, outDir }));
  const run = cp.spawnSync(paths.python, [path.join(ROOT, "scripts", "kokoro_lines.py"), "--model", paths.model, "--voices", paths.voices, "--spec", spec], { encoding: "utf8", timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`Kokoro failed: ${String(run.stderr || run.error || "no output").trim().split("\n").slice(-2).join(" ")}`);
  const summary = JSON.parse(String(run.stdout).trim().split("\n").pop());
  if (!summary.lines || summary.lines.length !== lines.length) throw new Error("Kokoro returned a different number of lines");
  return summary;
}

// Joins line files with the given pauses (seconds after each line) into one file; returns the
// measured per-line times, so captions and cuts follow the actual speech.
function joinLines(files, pauses, out, { sampleRate = 24000, codec = ["-c:a", "libmp3lame", "-b:a", "128k"] } = {}) {
  const ffmpeg = require("../ff-yol").ffmpeg;
  const ffprobe = require("../ff-yol").ffprobe;
  const seconds = (file) => +cp.execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", file], { encoding: "utf8" }).trim();
  const inputs = files.flatMap((file) => ["-i", file]);
  const chain = files.map((_, i) => `[${i}:a]aresample=${sampleRate},aformat=channel_layouts=mono${pauses[i] > 0 ? `,apad=pad_dur=${pauses[i].toFixed(3)}` : ""}[p${i}]`).join(";");
  cp.execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", `${chain};${files.map((_, i) => `[p${i}]`).join("")}concat=n=${files.length}:v=0:a=1[a]`, "-map", "[a]", ...codec, out], { stdio: "ignore" });
  let at = 0;
  const lineTimes = files.map((file, i) => { const start = at; at += seconds(file) + (pauses[i] > 0 ? pauses[i] : 0); return { start, end: at }; });
  const durationSec = seconds(out);
  if (lineTimes.length) lineTimes[lineTimes.length - 1].end = durationSec;
  return { file: out, durationSec, lineTimes };
}

// The fallback narration of a whole script: Kokoro lines, joined, speech-checked.
function fallbackNarration(lines, out, policy, { pauses = [], env = process.env, workDir = null } = {}) {
  const dir = workDir || `${out}.kokoro`;
  const started = Date.now();
  const summary = kokoroLines(lines, dir, { voice: policy.voice, speed: policy.speed, env });
  const joined = joinLines(summary.lines.map((line) => line.file), lines.map((_, i) => (i < lines.length - 1 ? (pauses[i] != null ? pauses[i] : 0.25) : 0)), out);
  const speech = require("./speech-check").check(out, { text: lines.join(" ") });
  for (const line of summary.lines) try { fs.unlinkSync(line.file); } catch (error) { /* temp */ }
  try { fs.unlinkSync(path.join(dir, "kokoro-spec.json")); fs.rmdirSync(dir); } catch (error) { /* temp */ }
  if (!speech.ok) throw new Error(`fallback narration failed the speech check: ${speech.problems.join("; ")}`);
  return {
    ...joined,
    provider: `Kokoro-82M offline fallback (${policy.voice})`,
    fallback: { provider: "kokoro", voice: policy.voice, approved: policy.approved, reason: policy.reason, seconds: +((Date.now() - started) / 1000).toFixed(1) },
    speech,
  };
}

// The narration a rendered package was made with: FR writes Videos/denetim.json (voice), IB/CT
// write render.json (audio). Returns { found, fallback: {...} | null, provider, syntheticVoice }.
// An unreadable file counts as missing.
function narrationRecord(productionDir) {
  const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return null; } };
  const audit = read(path.join(productionDir, "Videos", "denetim.json"));
  if (audit && audit.voice) return { found: true, fallback: audit.voice.fallback || null, provider: audit.voice.provider || null, syntheticVoice: audit.voice.syntheticVoice };
  const render = read(path.join(productionDir, "render.json"));
  const audio = render && (render.audio || (render.render && render.render.audio));
  if (audio) return { found: true, fallback: audio.fallback || null, provider: audio.provider || null, syntheticVoice: audio.syntheticVoice };
  return { found: false, fallback: null, provider: null };
}

// Upload guard, fail-closed: the package must record which voice narrated it, the narration must be
// real speech (never a placeholder), and a fallback voice is publishable only while the channel's
// configuration approves exactly that voice.
function uploadAllowed(channel, productionDir) {
  const record = narrationRecord(productionDir);
  if (!record.found) return { ok: false, record, reason: "NARRATION_RECORD_MISSING: no readable Videos/denetim.json voice or render.json audio record, so the narration cannot be verified" };
  if (typeof record.provider !== "string" || !record.provider.trim()) return { ok: false, record, reason: "NARRATION_RECORD_INVALID: the narration record names no voice provider" };
  if (record.syntheticVoice === false) return { ok: false, record, reason: "NARRATION_PLACEHOLDER: the render has no real narration (placeholder audio)" };
  if (record.fallback && typeof record.fallback !== "object") return { ok: false, record, reason: "NARRATION_RECORD_INVALID: malformed fallback record" };
  if (!record.fallback) return { ok: true, record };
  const configured = ((channel.config || {}).voice || {}).fallback || {};
  if (configured.approved === true && configured.voice === record.fallback.voice) return { ok: true, record };
  return { ok: false, record, reason: `narrated by fallback voice ${record.fallback.voice}, which is not approved for ${channel.slug} (config.voice.fallback)` };
}

// Installed version of the unofficial Edge read-aloud client. Printed with every narration health
// check so a run log shows which client spoke to Edge (2026-10-13: 2.0.9 got 403, 2.1.0 recovered).
function edgeLibraryVersion() {
  try { return require("msedge-tts/package.json").version; } catch (error) { return "unknown"; }
}

// Pre-flight: can the primary Edge voice synthesize one short sentence right now? A bounded few
// attempts (refusals were intermittent from home networks and total from GitHub runners on
// 2026-10-12). Returns { ok, tries: [...], error }.
async function edgeProbe(voice, { attempts = 3, gapMs = 3000, timeoutMs = 15000, env = process.env } = {}) {
  if (env.SHORTS_EDGE_TTS === "off") return { ok: false, tries: ["disabled (SHORTS_EDGE_TTS=off)"], error: "disabled" };
  const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
  const tries = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await new Promise(async (resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream("Narration check.", { rate: "+0%" });
        let bytes = 0;
        audioStream.on("data", (chunk) => { bytes += chunk.length; });
        audioStream.on("end", () => { clearTimeout(timer); resolve(bytes > 1000 ? { ok: true } : { ok: false, error: "no audio" }); });
        audioStream.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, error: error.message }); });
      } catch (error) { clearTimeout(timer); resolve({ ok: false, error: error.message }); }
    });
    tries.push(result.ok ? "ok" : String(result.error).slice(0, 80));
    if (result.ok) return { ok: true, tries, error: null };
    if (attempt < attempts) await new Promise((ok) => setTimeout(ok, gapMs));
  }
  return { ok: false, tries, error: tries[tries.length - 1] };
}

module.exports = { edgeProbe, edgeLibraryVersion, NARRATION_UNAVAILABLE_EXIT, narrationRecord, uploadAllowed, isRefusal, kokoroPaths, kokoroAvailable, fallbackPolicy, kokoroLines, joinLines, fallbackNarration };
