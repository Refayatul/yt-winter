"use strict";
// Dependency-free WAV utilities: read/write 16-bit PCM mono, ITU-R BS.1770
// K-weighted integrated loudness (gated), peak, and pause detection. Used so
// narration QA works on machines without a functioning ffmpeg.

function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4); const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(pos + 8), channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    else if (id === "data") { data = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + size)); break; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error("only 16-bit PCM WAV supported");
  const n = Math.floor(data.length / 2 / fmt.channels); const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { let s = 0; for (let c = 0; c < fmt.channels; c += 1) s += data.readInt16LE((i * fmt.channels + c) * 2); out[i] = s / fmt.channels / 32768; }
  return { rate: fmt.rate, samples: out };
}

function writeWav(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

// Biquad coefficients for the BS.1770 K-weighting stages at any sample rate.
function kFilters(fs) {
  const hs = (() => { const G = 3.999843853973347, f0 = 1681.974450955533, Q = 0.7071752369554196; const K = Math.tan(Math.PI * f0 / fs); const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416; const a0 = 1 + K / Q + K * K; return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }; })();
  const hp = (() => { const f0 = 38.13547087602444, Q = 0.5003270373238773; const K = Math.tan(Math.PI * f0 / fs); const a0 = 1 + K / Q + K * K; return { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }; })();
  return [hs, hp];
}
function biquad(x, { b, a }) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i += 1) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; } return y; }

function integratedLufs(samples, rate) {
  let y = samples; for (const f of kFilters(rate)) y = biquad(y, f);
  const block = Math.round(0.4 * rate), step = Math.round(0.1 * rate); const energies = [];
  for (let s = 0; s + block <= y.length; s += step) { let e = 0; for (let i = s; i < s + block; i += 1) e += y[i] * y[i]; energies.push(e / block); }
  if (!energies.length) return null;
  const lk = (e) => -0.691 + 10 * Math.log10(e);
  const abs = energies.filter((e) => lk(e) > -70); if (!abs.length) return -70;
  const rel = lk(abs.reduce((s, e) => s + e, 0) / abs.length) - 10;
  const gated = abs.filter((e) => lk(e) > rel); if (!gated.length) return -70;
  return lk(gated.reduce((s, e) => s + e, 0) / gated.length);
}
function peakDb(samples) { let p = 0; for (let i = 0; i < samples.length; i += 1) p = Math.max(p, Math.abs(samples[i])); return p > 0 ? 20 * Math.log10(p) : -120; }
function clippedSamples(samples) { let n = 0; for (let i = 0; i < samples.length; i += 1) if (Math.abs(samples[i]) >= 0.9995) n += 1; return n; }

// Silent stretches (>= minSec below thresholdDb RMS over 20 ms windows): returns durations in seconds.
function pauses(samples, rate, minSec = 0.35, thresholdDb = -45) {
  const win = Math.round(0.02 * rate); const out = []; let run = 0;
  for (let s = 0; s + win <= samples.length; s += win) { let e = 0; for (let i = s; i < s + win; i += 1) e += samples[i] * samples[i]; const db = 10 * Math.log10(e / win + 1e-12); if (db < thresholdDb) run += win; else { if (run / rate >= minSec) out.push(run / rate); run = 0; } }
  if (run / rate >= minSec) out.push(run / rate);
  return out;
}

function analyze(buf) {
  const { rate, samples } = readWav(buf);
  const p = pauses(samples, rate);
  return { status: "OBSERVED", method: "js-bs1770-k-weighted (dependency-free)", durationSec: samples.length / rate, integratedLufs: Math.round(integratedLufs(samples, rate) * 10) / 10, truePeakDbfs: Math.round(peakDb(samples) * 10) / 10, clippedSamples: clippedSamples(samples), pauses: p, silenceCount: p.length };
}

module.exports = { readWav, writeWav, integratedLufs, peakDb, clippedSamples, pauses, analyze };
