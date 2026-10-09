#!/usr/bin/env node
"use strict";
// Narration + sound-design production for a ProfitDecoded bundle (no upload).
//   node scripts/profitdecoded/produce-audio.js <bundle.json> [--seed text] [--no-tts-cache] [--tts-cache-only]
// TTS cache: every synthesized sentence is kept in <bundle dir>/tts-cache (or PD_TTS_CACHE), keyed by provider,
// model, voice, rate and spoken text, so re-mixing never pays for the same narration twice. --tts-cache-only
// refuses to synthesize anything that is not cached (a local re-mix of a paid narration).
// Voice: edge-tts (FALLBACK voice; narration gate caps it until a human listen
// is recorded). Per-sentence prosody varies by role so delivery is not uniform.
// Music: procedurally generated original pad (owned, no third-party licence),
// ducked under speech, with intentional silence after the hook. Loudness is
// normalised to about -16 LUFS integrated with a peak ceiling.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const T = require(path.join(root, "core/profitdecoded/text"));
const N = require(path.join(root, "core/profitdecoded/narration"));
const W = require(path.join(root, "core/profitdecoded/wav"));
const { channelConfig } = require(path.join(root, "core/profitdecoded/config"));
const TTS = require(path.join(root, "core/profitdecoded/tts-provider"));

const RATE = 24000;
const argv = process.argv.slice(2);
const bundlePath = path.resolve(argv[0] || "");
const seedText = argv.includes("--seed") ? argv[argv.indexOf("--seed") + 1] : null;
const crypto = require("crypto");
function ttsCache(provider) {
  if (argv.includes("--no-tts-cache")) return { get: () => null, set: () => {}, hits: 0, misses: 0 };
  const dir = process.env.PD_TTS_CACHE || path.join(path.dirname(bundlePath), "tts-cache");
  const id = provider.name === "cartesia" ? `${process.env.PD_CARTESIA_MODEL || TTS.CARTESIA.model}:${process.env.PD_CARTESIA_VOICE_ID || (channelConfig().voice || {}).cartesiaVoiceId}`
    : provider.name === "kokoro" ? (process.env.PD_KOKORO_VOICE || (channelConfig().voice || {}).kokoroVoice) : (channelConfig().voice || {}).voice;
  const file = (spoken, rate) => path.join(dir, crypto.createHash("sha256").update(JSON.stringify([provider.name, id, rate, spoken])).digest("hex").slice(0, 32) + ".wav");
  const c = { dir, hits: 0, misses: 0,
    get(spoken, rate) { const f = file(spoken, rate); if (!fs.existsSync(f)) return null; c.hits += 1; return W.readWav(fs.readFileSync(f)).samples; },
    set(spoken, rate, samples) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(spoken, rate), W.writeWav(samples, RATE)); c.misses += 1; } };
  return c;
}
function rng(seed) {
  let h = 1779033703 ^ String(seed).length; for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function trim(x, thresholdDb = -50, keepSec = 0.04) {
  const th = 10 ** (thresholdDb / 20); let s = 0, e = x.length - 1;
  while (s < x.length && Math.abs(x[s]) < th) s += 1; while (e > s && Math.abs(x[e]) < th) e -= 1;
  const k = Math.round(keepSec * RATE); return x.subarray(Math.max(0, s - k), Math.min(x.length, e + k));
}

const BEAT_RATE = { hook: -3, payoff: -2, "mini-payoff": -1, proof: 0, mechanism: 0, setup: 1, evidence: 0, turn: -1, reveal: -2 };
function sentenceRate(sentence, beatType, first, r, base) {
  let off = BEAT_RATE[beatType] != null ? BEAT_RATE[beatType] : 0;
  const w = T.words(sentence).length;
  if (first) off -= 1; if (w <= 6) off -= 2; if (w >= 24) off += 2; if (/\?$/.test(sentence)) off -= 1;
  off += (r() - 0.5) * 3;
  const total = Math.round(base + off);
  return (total >= 0 ? "+" : "") + total + "%";
}
function gapAfter(sentence, last, beatType, r) {
  if (last && beatType === "hook") return 0.62 + r() * 0.1;     // intentional silence after the hook
  let g = /\?$/.test(sentence) ? 0.36 + r() * 0.16 : /[;:]$/.test(sentence) ? 0.2 + r() * 0.1 : 0.2 + r() * 0.22;
  if (last) g += 0.12 + r() * 0.18;
  return g;
}

// ---- Original music bed ----
const PROGRESSIONS = [
  { name: "dorian-lull", chords: [[0, 3, 7, 10], [5, 9, 12, 14], [3, 7, 10, 14], [7, 10, 14, 17]], root: 146.83 },
  { name: "open-fifths", chords: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [-2, 5, 10]], root: 130.81 },
  { name: "lydian-drift", chords: [[0, 4, 7, 11], [2, 6, 9, 14], [7, 11, 14, 18], [4, 7, 11, 14]], root: 164.81 },
  { name: "minor-pulse", chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], root: 123.47 },
];
function musicBed(durSec, r, prog) {
  const n = Math.round(durSec * RATE); const out = new Float32Array(n);
  const chordLen = 6 + r() * 3; const lfoRate = 0.08 + r() * 0.1; let t0 = 0, idx = 0;
  while (t0 < durSec) {
    const chord = prog.chords[idx % prog.chords.length]; const t1 = Math.min(durSec, t0 + chordLen);
    const fade = 1.6;
    for (let i = Math.floor(t0 * RATE); i < Math.min(n, Math.floor((t1 + fade) * RATE)); i += 1) {
      const t = i / RATE; const env = Math.min(1, (t - t0) / fade) * (t > t1 ? Math.max(0, 1 - (t - t1) / fade) : 1);
      if (env <= 0) continue; let v = 0;
      for (const semi of chord) { const f = prog.root * 2 ** (semi / 12); for (const det of [-0.0035, 0, 0.0035]) v += Math.sin(2 * Math.PI * f * (1 + det) * t + semi); v += 0.25 * Math.sin(2 * Math.PI * f * 2 * t); }
      out[i] += v * env * (0.6 + 0.4 * Math.sin(2 * Math.PI * lfoRate * t + idx));
    }
    t0 += chordLen; idx += 1;
  }
  let lp = 0; for (let i = 0; i < n; i += 1) { lp += 0.06 * (out[i] - lp); out[i] = lp; }  // soften
  let pk = 0; for (let i = 0; i < n; i += 1) pk = Math.max(pk, Math.abs(out[i])); for (let i = 0; i < n; i += 1) out[i] /= pk || 1;
  return out;
}
// Long-form score layer (opt-in, bundle.score = "long"): a soft low pulse on the chord root (felt more than heard)
// that gives a 10-minute film forward motion under the pad. Original synthesis, owned.
function pulseLayer(durSec, prog, bpm = 72) {
  const n = Math.round(durSec * RATE); const out = new Float32Array(n); const step = 60 / bpm; const chordLen = 8;
  for (let t0 = 0, k = 0; t0 < durSec; t0 += step, k += 1) {
    const chord = prog.chords[Math.floor(t0 / chordLen) % prog.chords.length]; const f = prog.root / 2 * 2 ** (chord[k % 4 === 3 ? 1 % chord.length : 0] / 12);
    const accent = k % 4 === 0 ? 1 : 0.62; const len = Math.round(1.1 * RATE);
    for (let j = 0; j < len && Math.floor(t0 * RATE) + j < n; j += 1) { const t = j / RATE; const env = Math.min(1, t / 0.012) * Math.exp(-t * 4.2);
      out[Math.floor(t0 * RATE) + j] += accent * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 9)); }
  }
  let pk = 0; for (let i = 0; i < n; i += 1) pk = Math.max(pk, Math.abs(out[i])); for (let i = 0; i < n; i += 1) out[i] /= pk || 1;
  return out;
}
function envelope(x, win = Math.round(0.05 * RATE)) { const e = new Float32Array(Math.ceil(x.length / win)); for (let k = 0; k < e.length; k += 1) { let s = 0, c = 0; for (let i = k * win; i < Math.min(x.length, (k + 1) * win); i += 1) { s += x[i] * x[i]; c += 1; } e[k] = Math.sqrt(s / (c || 1)); } return { e, win }; }

(async () => {
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8")); const outDir = path.join(path.dirname(bundlePath), "out"); fs.mkdirSync(outDir, { recursive: true });
  const cfg = channelConfig(); const voice = cfg.voice.voice; const baseRate = parseInt(cfg.voice.rate, 10) || 0;
  const r = rng((seedText || bundle.id) + ":audio"); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-audio-"));
  const provider = TTS.resolve(); if (provider.fallbackFrom) console.log(`[tts] ${provider.fallbackFrom} unavailable (${provider.reason}); using ${provider.name}`);
  const pieces = []; const timeline = []; let cursor = 0.35; let n = 0; const pron = []; const cache = ttsCache(provider);
  bundle.beats.forEach((b) => { b.id = b.id || "b" + (bundle.beats.indexOf(b) + 1); });
  for (const beat of bundle.beats) {
    const sents = T.sentences(beat.text); let beatStart = null, beatEnd = null;
    for (let i = 0; i < sents.length; i += 1) {
      const sp0 = N.spokenText(sents[i]); const spoken = sp0.charAt(0).toUpperCase() + sp0.slice(1); const rate = sentenceRate(sents[i], beat.type, i === 0, r, baseRate);
      process.stdout.write(`\r[tts] ${++n} ${beat.id}  `);
      let raw = cache.get(spoken, rate);
      if (!raw) {
        if (argv.includes("--tts-cache-only")) throw new Error(`--tts-cache-only: sentence ${n} (${beat.id}) is not in the TTS cache ${cache.dir}; refusing to synthesize`);
        raw = await TTS.synthesize(spoken, { rate, voice, provider: provider.name }); cache.set(spoken, rate, raw);
      }
      const samples = trim(raw);
      const start = cursor; const end = start + samples.length / RATE;
      pieces.push({ start, samples }); timeline.push({ beatId: beat.id, text: sents[i], spoken, rate, start: +start.toFixed(3), end: +end.toFixed(3) });
      if (beatStart == null) beatStart = start; beatEnd = end;
      cursor = end + gapAfter(sents[i], i === sents.length - 1, beat.type, r);
    }
    beat.start = +beatStart.toFixed(3); beat.end = +beatEnd.toFixed(3);
    // Film pacing (opt-in): a breath between sections, and a title card after the cold open.
    const nextBeat = bundle.beats[bundle.beats.indexOf(beat) + 1]; const pace = bundle.pacing || {};
    if (nextBeat && beat.section && nextBeat.section !== beat.section) {
      if (pace.titleAfter === beat.section) { bundle.titleCard = { start: +(cursor - 0.1).toFixed(3), end: +(cursor + pace.titleSec).toFixed(3) }; cursor += pace.titleSec; }
      else if (pace.sectionGap) cursor += pace.sectionGap[0] + r() * (pace.sectionGap[1] - pace.sectionGap[0]);
    }
  }
  console.log(`\n[tts] cache ${cache.dir}: ${cache.hits} hit(s), ${cache.misses} synthesized`);
  const total = cursor + ((bundle.pacing || {}).tailSec || 1.2); const voiceTrack = new Float32Array(Math.round(total * RATE));
  for (const p of pieces) { const o = Math.round(p.start * RATE); for (let i = 0; i < p.samples.length; i += 1) voiceTrack[o + i] += p.samples[i]; }
  // Voice-only normalisation to -16 LUFS.
  const gainTo = (x, target) => 10 ** ((target - W.integratedLufs(x, RATE)) / 20);
  const vg = gainTo(voiceTrack, -17.5); for (let i = 0; i < voiceTrack.length; i += 1) voiceTrack[i] *= vg;
  // Music with ducking.
  const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
  const long = bundle.score === "long";
  const music = musicBed(total, r, prog); const { e, win } = envelope(voiceTrack);
  if (long) { const pl = pulseLayer(total, prog); for (let i = 0; i < music.length; i += 1) music[i] = 0.8 * music[i] + 0.32 * pl[i]; }
  let duck = 1; const gainMusic = 10 ** ((long ? -11 : -24) / 20); const under = long ? 0.36 : 0.28;
  for (let i = 0; i < music.length; i += 1) {
    const speaking = e[Math.min(e.length - 1, Math.floor(i / win))] > 0.012; const target = speaking ? under : 1;
    duck += (target - duck) * (target < duck ? 1 / (0.08 * RATE) : 1 / (0.45 * RATE));
    const t = i / RATE; const fade = Math.min(1, t / 1.5) * Math.min(1, (total - t) / 2.2);
    music[i] *= duck * fade * gainMusic;
  }
  const mix = new Float32Array(voiceTrack.length); for (let i = 0; i < mix.length; i += 1) mix[i] = voiceTrack[i] + music[i];
  const mg = gainTo(mix, -14.3); for (let i = 0; i < mix.length; i += 1) mix[i] = Math.tanh(mix[i] * mg) * 0.89;  // soft limiter, hard ceiling about -1 dBFS
  fs.writeFileSync(path.join(outDir, "narration-only.wav"), W.writeWav(voiceTrack, RATE));
  if (long) fs.writeFileSync(path.join(outDir, "music-only.wav"), W.writeWav(music, RATE));
  fs.writeFileSync(path.join(outDir, "mix.wav"), W.writeWav(mix, RATE));
  fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify(timeline, null, 1) + "\n");
  const musicName = `pd-original-pad-${prog.name}-${T.slugify(bundle.id).slice(0, 12)}`;
  bundle.audioFile = "out/mix.wav"; bundle.narration = { ...(bundle.narration || {}), provider: provider.name === "edge-tts" ? `edge-tts ${voice} (fallback voice)` : provider.name === "openai" ? "openai-tts gpt-4o-mini-tts" : provider.name === "google" ? "google-cloud-tts chirp3-hd" : provider.name === "kokoro" ? "kokoro-82m (open-source, unreviewed)" : provider.name === "cartesia" ? `cartesia ${process.env.PD_CARTESIA_MODEL || TTS.CARTESIA.model} voice ${process.env.PD_CARTESIA_VOICE_ID || cfg.voice.cartesiaVoiceId}` : "elevenlabs", segments: timeline.map((s) => ({ text: s.text, start: s.start, end: s.end })), humanListenApproved: false, ...(provider.name === "cartesia" ? { credits: { requests: TTS.usage.cartesia.requests, creditsConsumed: TTS.usage.cartesia.characters } } : {}) };
  bundle.audio = { music: musicName, assets: [{ id: musicName, kind: "music", license: "owned", note: "procedurally generated by scripts/profitdecoded/produce-audio.js; original, no third-party material" }] };
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + "\n");
  const m = W.analyze(fs.readFileSync(path.join(outDir, "mix.wav")));
  console.log(`audio: ${m.durationSec.toFixed(1)} s, ${m.integratedLufs} LUFS, peak ${m.truePeakDbfs} dBFS, ${timeline.length} sentences, music ${musicName}`);
  if (provider.name === "cartesia") console.log(`cartesia: ${TTS.usage.cartesia.requests} request(s), ${TTS.usage.cartesia.characters} credits (characters sent)`);
})().catch((e) => { console.error(e); process.exit(1); });
