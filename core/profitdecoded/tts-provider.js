"use strict";
// Narration provider abstraction (spec 13). Providers return 24 kHz mono 16-bit
// PCM samples (Float32Array) so the mixer is provider-independent.
//
//   edge-tts     free fallback voice (no key). Never certified as premium.
//   elevenlabs   needs ELEVENLABS_API_KEY (+ voice id)  -- premium
//   openai       needs OPENAI_API_KEY (gpt-4o-mini-tts)  -- premium
//   kokoro       free, open-source (Apache-2.0), CPU, no key: PD_KOKORO_MODEL + PD_KOKORO_VOICES (+ PD_KOKORO_PYTHON). NOT auto-certified: a human listen is still required
//   google       needs GOOGLE_TTS_API_KEY (Cloud Text-to-Speech; Chirp 3 HD / Neural2) -- premium, 1M free chars/month
//   cartesia     needs PD_CARTESIA_API_KEY + a voice id (PD_CARTESIA_VOICE_ID or config voice.cartesiaVoiceId) -- premium.
//                Sonic, pinned snapshot (docs.cartesia.ai, API version 2026-08-14). Billed 1 credit per character:
//                every request is counted in usage.cartesia and refused once PD_CARTESIA_MAX_CHARS would be exceeded.
//                No automatic retries. Without a key it falls back to Kokoro (free), never to another paid provider.
//
// Keys are read from the environment only and are never logged or written.
// Selection: PD_TTS_PROVIDER env, else channels/profitdecoded/config.json voice.provider.

const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFileSync, spawnSync } = require("child_process");
const W = require("./wav");
const { channelConfig } = require("./config");

const RATE = 24000;
const PREMIUM = new Set(["elevenlabs", "openai", "google", "cartesia"]);
const CARTESIA = { url: "https://api.cartesia.ai/tts/bytes", version: "2026-08-14", model: "sonic-3.6-2026-08-27" };
// Characters sent to Cartesia in this process (1 credit each). Read by the audition and narration reports.
const usage = { cartesia: { requests: 0, characters: 0 } };

function pcmFromWavBuffer(buf, rate = RATE) {
  const w = W.readWav(buf);
  if (w.rate === rate) return w.samples;
  // linear resample (providers are asked for 24 kHz; this is a safety net)
  const ratio = w.rate / rate; const out = new Float32Array(Math.floor(w.samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) { const p = i * ratio; const a = Math.floor(p), f = p - a; out[i] = w.samples[a] * (1 - f) + (w.samples[Math.min(a + 1, w.samples.length - 1)] * f); }
  return out;
}
function mp3ToSamples(mp3) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-tts-")); const a = path.join(dir, "x.mp3"), b = path.join(dir, "x.wav");
  fs.writeFileSync(a, mp3);
  if (process.platform === "darwin") execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", a, b]);
  else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", b]);
  return W.readWav(fs.readFileSync(b)).samples;
}

function kokoroConfig(env = process.env) {
  return { python: env.PD_KOKORO_PYTHON || "python3", model: env.PD_KOKORO_MODEL, voices: env.PD_KOKORO_VOICES, voice: env.PD_KOKORO_VOICE || (channelConfig().voice || {}).kokoroVoice || "am_michael" };
}
function kokoroCommand(opts = {}, env = process.env) {
  const k = kokoroConfig(env);
  const speed = opts.rate ? 1 + parseFloat(opts.rate) / 100 : 1;
  return { bin: k.python, args: [path.join(__dirname, "..", "..", "scripts", "profitdecoded", "kokoro_tts.py"), "--model", k.model, "--voices", k.voices, "--voice", opts.provider === "kokoro" && opts.voice && !/^en-/.test(opts.voice) ? opts.voice : k.voice, "--speed", String(speed.toFixed(3))] };
}

function resolve(env = process.env) {
  const cfg = (channelConfig() || {}).voice || {};
  const name = String(env.PD_TTS_PROVIDER || cfg.provider || "edge-tts").toLowerCase();
  if (name === "elevenlabs" && !env.ELEVENLABS_API_KEY) return { name: "edge-tts", premium: false, fallbackFrom: "elevenlabs", reason: "ELEVENLABS_API_KEY not set" };
  if (name === "kokoro") {
    const k = kokoroConfig(env);
    if (!k.model || !k.voices || !fs.existsSync(k.model) || !fs.existsSync(k.voices)) return { name: "edge-tts", premium: false, fallbackFrom: "kokoro", reason: "PD_KOKORO_MODEL / PD_KOKORO_VOICES not set or files missing" };
    return { name: "kokoro", premium: false, fallbackFrom: null };
  }
  if (name === "cartesia" && !env.PD_CARTESIA_API_KEY) {
    const k = kokoroConfig(env);
    if (k.model && k.voices && fs.existsSync(k.model) && fs.existsSync(k.voices)) return { name: "kokoro", premium: false, fallbackFrom: "cartesia", reason: "PD_CARTESIA_API_KEY not set" };
    return { name: "edge-tts", premium: false, fallbackFrom: "cartesia", reason: "PD_CARTESIA_API_KEY not set and Kokoro files missing" };
  }
  if (name === "google" && !env.GOOGLE_TTS_API_KEY) return { name: "edge-tts", premium: false, fallbackFrom: "google", reason: "GOOGLE_TTS_API_KEY not set" };
  if (name === "openai" && !env.OPENAI_API_KEY) return { name: "edge-tts", premium: false, fallbackFrom: "openai", reason: "OPENAI_API_KEY not set" };
  return { name, premium: PREMIUM.has(name), fallbackFrom: null };
}

// Request-body builders are exported so tests can assert them without network.
function elevenLabsRequest(text, opts = {}, env = process.env) {
  const voiceId = opts.voiceId || env.PD_ELEVENLABS_VOICE_ID || (channelConfig().voice || {}).elevenLabsVoiceId;
  if (!voiceId) throw new Error("ElevenLabs needs a voice id (PD_ELEVENLABS_VOICE_ID or config voice.elevenLabsVoiceId)");
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`,
    init: { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/pcm" },
      body: JSON.stringify({ text, model_id: opts.model || "eleven_multilingual_v2", voice_settings: { stability: opts.stability == null ? 0.45 : opts.stability, similarity_boost: 0.75, style: opts.style == null ? 0.25 : opts.style, use_speaker_boost: true } }) },
    pcm: true,
  };
}
function openAiRequest(text, opts = {}, env = process.env) {
  return {
    url: "https://api.openai.com/v1/audio/speech",
    init: { method: "POST", headers: { authorization: "Bearer " + env.OPENAI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model || "gpt-4o-mini-tts", voice: opts.voice || (channelConfig().voice || {}).openaiVoice || "onyx", input: text, instructions: opts.instructions || "Calm, intelligent documentary narrator. Natural pacing, light emphasis on numbers, no sales energy.", response_format: "wav" }) },
    pcm: false,
  };
}
// Google Cloud Text-to-Speech (REST, API key). Returns base64 LINEAR16 WAV in JSON.
function googleRequest(text, opts = {}, env = process.env) {
  const speakingRate = opts.rate ? Math.max(0.7, Math.min(1.3, 1 + parseFloat(opts.rate) / 100)) : 1;
  return {
    url: "https://texttospeech.googleapis.com/v1/text:synthesize",
    init: { method: "POST", headers: { "x-goog-api-key": env.GOOGLE_TTS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ input: { text }, voice: { languageCode: "en-US", name: opts.voice && /^en-/.test(opts.voice) ? opts.voice : (env.PD_GOOGLE_TTS_VOICE || (channelConfig().voice || {}).googleVoice || "en-US-Chirp3-HD-Charon") }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: RATE, speakingRate } }) },
    json: true,
  };
}
// Cartesia Sonic (REST /tts/bytes): raw 16-bit PCM at 24 kHz, so no decoding step. Speed follows the channel rate.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cartesiaRequest(text, opts = {}, env = process.env) {
  const voiceId = opts.voice && UUID.test(opts.voice) ? opts.voice : env.PD_CARTESIA_VOICE_ID || (channelConfig().voice || {}).cartesiaVoiceId;
  if (!voiceId) throw new Error("Cartesia needs a voice id (PD_CARTESIA_VOICE_ID or config voice.cartesiaVoiceId)");
  const speed = opts.rate ? Math.max(0.6, Math.min(1.5, 1 + parseFloat(opts.rate) / 100)) : 1;
  return {
    url: CARTESIA.url,
    init: { method: "POST", headers: { authorization: "Bearer " + env.PD_CARTESIA_API_KEY, "cartesia-version": CARTESIA.version, "content-type": "application/json" },
      body: JSON.stringify({ model_id: env.PD_CARTESIA_MODEL || CARTESIA.model, transcript: text, voice: { id: voiceId }, output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: RATE }, language: "en", generation_config: { speed: +speed.toFixed(3) } }) },
    pcm: true,
  };
}
function chargeCartesia(text, env = process.env) {
  const cap = Number(env.PD_CARTESIA_MAX_CHARS || 0);
  if (!(cap > 0)) throw new Error("Cartesia refused: PD_CARTESIA_MAX_CHARS (credit cap for this run) is not set");
  if (usage.cartesia.characters + text.length > cap) throw new Error(`Cartesia refused: ${usage.cartesia.characters} + ${text.length} characters would exceed PD_CARTESIA_MAX_CHARS ${cap}`);
  usage.cartesia.requests += 1; usage.cartesia.characters += text.length;
}
function pcm16ToFloat(buf) { const n = Math.floor(buf.length / 2); const out = new Float32Array(n); for (let i = 0; i < n; i += 1) out[i] = buf.readInt16LE(i * 2) / 32768; return out; }

async function synthesize(text, opts = {}, deps = {}) {
  const env = deps.env || process.env; const p = opts.provider ? { name: opts.provider, premium: PREMIUM.has(opts.provider) } : resolve(env);
  const doFetch = deps.fetch || fetch;
  if (p.name === "elevenlabs" || p.name === "openai" || p.name === "google" || p.name === "cartesia") {
    const req = p.name === "elevenlabs" ? elevenLabsRequest(text, opts, env) : p.name === "google" ? googleRequest(text, opts, env) : p.name === "cartesia" ? cartesiaRequest(text, opts, env) : openAiRequest(text, opts, env);
    // Counted before sending (a failed request may still be billed); one attempt only.
    if (p.name === "cartesia") chargeCartesia(text, env);
    const res = await doFetch(req.url, req.init);
    if (!res.ok) { let why = ""; try { why = String(await res.text()).replace(/\s+/g, " ").slice(0, 200); } catch (e) { /* no body */ } throw new Error(`${p.name} TTS failed: HTTP ${res.status}${why ? ": " + why : ""}`); }
    if (req.json) return pcmFromWavBuffer(Buffer.from((await res.json()).audioContent, "base64"));
    const buf = Buffer.from(await res.arrayBuffer());
    return req.pcm ? pcm16ToFloat(buf) : pcmFromWavBuffer(buf);
  }
  if (p.name === "kokoro") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-kokoro-")); const out = path.join(dir, "k.wav");
    const cmd = kokoroCommand({ ...opts, provider: "kokoro" }, env);
    const defaultRun = (c, input) => {
      const r = spawnSync(c.bin, [...c.args, "--out", out], { input, encoding: "utf8", maxBuffer: 1 << 26 });
      const tail = (x) => String(x || "").trim().split("\n").slice(-8).join(" | ").slice(0, 600);
      // EPIPE just means the helper exited before reading stdin (e.g. it crashed): report its real exit code and stderr.
      if (r.error && r.error.code === "ENOENT") throw new Error(`kokoro helper could not start (ENOENT): is "${c.bin}" installed with kokoro-onnx and soundfile?`);
      if (r.error && r.status === null && r.error.code !== "EPIPE") throw new Error(`kokoro helper failed (${r.error.code || r.error.message})`);
      if (r.status !== 0) throw new Error(`kokoro helper exited ${r.status}: ${tail(r.stderr) || tail(r.stdout) || "no output"}`);
      if (!fs.existsSync(out) || fs.statSync(out).size < 1000) throw new Error(`kokoro helper reported success but wrote no audio: ${tail(r.stderr) || tail(r.stdout) || "no output"}`);
    };
    (deps.run || defaultRun)(cmd, text);
    return pcmFromWavBuffer(fs.readFileSync(out));
  }
  // edge-tts fallback
  const { MsEdgeTTS, OUTPUT_FORMAT } = deps.edge || require("msedge-tts");
  const tts = deps.ttsInstance || new MsEdgeTTS();
  await tts.setMetadata(opts.voice || (channelConfig().voice || {}).voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const mp3 = await new Promise((resolveP, reject) => { const { audioStream } = tts.toStream(text, { rate: opts.rate }); const c = []; audioStream.on("data", (d) => c.push(d)); audioStream.on("end", () => resolveP(Buffer.concat(c))); audioStream.on("error", reject); });
  return mp3ToSamples(mp3);
}

module.exports = { RATE, PREMIUM, CARTESIA, usage, resolve, synthesize, kokoroCommand, elevenLabsRequest, openAiRequest, googleRequest, cartesiaRequest, pcm16ToFloat, mp3ToSamples };
