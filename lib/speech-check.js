// SPEECH CHECK: is this narration file real, complete speech?
//
// Every narration (Edge or fallback) passes through here before a Short is rendered. It rejects
// what must never be published: silence, a tone placeholder, a truncated read, clipped audio.
// It does NOT judge naturalness; that needs a human listener.
//
//   check(file, { text }) -> { ok, problems: [...], metrics: {...} }
//
// Measured on 16 kHz mono PCM in 20 ms frames:
//   duration         against the word count (a truncated or runaway read fails)
//   voicedShare      frames above -45 dBFS (silence fails)
//   longestSilence   the longest run of quiet frames (a dropped sentence fails)
//   rmsVariation     coefficient of variation of voiced-frame loudness (a steady tone is ~0; speech is > 0.3)
//   zcrVariation     coefficient of variation of the zero-crossing rate (a tone is ~0; speech alternates voiced/unvoiced sounds)
//   clippedShare     samples at full scale
"use strict";

const cp = require("child_process");

const RATE = 16000;
const FRAME = RATE / 50; // 20 ms
const LIMITS = {
  minWordsPerSecond: 1.4, // slower than this: long gaps or a stalled read
  maxWordsPerSecond: 4.6, // faster than this: words were lost
  minVoicedShare: 0.45,
  maxSilenceSeconds: 1.6,
  minRmsVariation: 0.3,
  minZcrVariation: 0.25,
  maxClippedShare: 0.002,
};

function decode(file) {
  const ffmpeg = require("../ff-yol").ffmpeg;
  return cp.execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { maxBuffer: 256 * 1024 * 1024 });
}

const cv = (values) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
};

function measure(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const frames = Math.floor(samples.length / FRAME);
  const quiet = 32768 * Math.pow(10, -45 / 20);
  const voicedRms = []; const voicedZcr = [];
  let voiced = 0; let clipped = 0;
  for (let f = 0; f < frames; f += 1) {
    let sum = 0; let crossings = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i += 1) {
      const s = samples[i];
      sum += s * s;
      if (s >= 32767 || s <= -32768) clipped += 1;
      if (i > f * FRAME && (s >= 0) !== (samples[i - 1] >= 0)) crossings += 1;
    }
    const rms = Math.sqrt(sum / FRAME);
    if (rms > quiet) { voiced += 1; voicedRms.push(rms); voicedZcr.push(crossings); }
  }
  return {
    durationSeconds: +(samples.length / RATE).toFixed(2),
    voicedShare: frames ? +(voiced / frames).toFixed(3) : 0,
    rmsVariation: +cv(voicedRms).toFixed(3),
    zcrVariation: +cv(voicedZcr).toFixed(3),
    clippedShare: samples.length ? +(clipped / samples.length).toFixed(5) : 0,
  };
}

// Leading and trailing quiet is trimmed by the renderers; only gaps inside the speech count.
function interiorSilence(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const frames = Math.floor(samples.length / FRAME);
  const quiet = 32768 * Math.pow(10, -45 / 20);
  const loud = [];
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i += 1) sum += samples[i] * samples[i];
    loud.push(Math.sqrt(sum / FRAME) > quiet);
  }
  const first = loud.indexOf(true); const last = loud.lastIndexOf(true);
  if (first < 0) return 0;
  let run = 0; let longest = 0;
  for (let f = first; f <= last; f += 1) { if (loud[f]) run = 0; else { run += 1; longest = Math.max(longest, run); } }
  return +((longest * FRAME) / RATE).toFixed(2);
}

function check(file, { text = "", limits = {} } = {}) {
  const L = { ...LIMITS, ...limits };
  let pcm;
  try { pcm = decode(file); } catch (error) { return { ok: false, problems: [`cannot decode audio: ${String(error.message).slice(0, 120)}`], metrics: null }; }
  const metrics = measure(pcm);
  metrics.longestSilenceSeconds = interiorSilence(pcm);
  const words = String(text).trim() ? String(text).trim().split(/\s+/).length : 0;
  const problems = [];
  if (metrics.durationSeconds < 0.5) problems.push(`too short (${metrics.durationSeconds} s)`);
  if (words) {
    metrics.wordsPerSecond = +(words / Math.max(0.01, metrics.durationSeconds)).toFixed(2);
    if (metrics.wordsPerSecond > L.maxWordsPerSecond) problems.push(`${metrics.wordsPerSecond} words/s: speech is missing for part of the text`);
    if (metrics.wordsPerSecond < L.minWordsPerSecond) problems.push(`${metrics.wordsPerSecond} words/s: long gaps or a stalled read`);
  }
  if (metrics.voicedShare < L.minVoicedShare) problems.push(`mostly silent (voiced ${Math.round(metrics.voicedShare * 100)}%)`);
  if (metrics.longestSilenceSeconds > L.maxSilenceSeconds) problems.push(`a ${metrics.longestSilenceSeconds} s silence inside the narration`);
  if (metrics.rmsVariation < L.minRmsVariation || metrics.zcrVariation < L.minZcrVariation) problems.push(`steady signal, not speech (loudness variation ${metrics.rmsVariation}, zero-crossing variation ${metrics.zcrVariation})`);
  if (metrics.clippedShare > L.maxClippedShare) problems.push(`clipped (${(metrics.clippedShare * 100).toFixed(2)}% of samples at full scale)`);
  return { ok: problems.length === 0, problems, metrics };
}

module.exports = { check, measure, LIMITS };
