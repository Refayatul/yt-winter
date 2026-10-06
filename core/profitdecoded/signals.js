"use strict";
// Provenance-tagged decision signals. The system must always know whether a
// number came from real YouTube analytics (OBSERVED), a documented heuristic
// or model (ESTIMATED), a deduction from other data (INFERRED) or is simply
// not known (UNKNOWN). UNKNOWN is never silently converted into a good score.

const PROVENANCE = Object.freeze({ OBSERVED: "OBSERVED", ESTIMATED: "ESTIMATED", INFERRED: "INFERRED", UNKNOWN: "UNKNOWN" });
// Pessimistic stand-in used when a score needs a number but the signal is UNKNOWN.
const UNKNOWN_SCORE = 35;
// Provenance trust multipliers used in confidence, not in the score itself.
const TRUST = Object.freeze({ OBSERVED: 1, INFERRED: 0.7, ESTIMATED: 0.55, UNKNOWN: 0 });

function sig(value, provenance, source) {
  if (!PROVENANCE[provenance]) throw new Error("invalid provenance: " + provenance);
  if (provenance === "UNKNOWN") return Object.freeze({ value: null, provenance, source: source || "no data" });
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("signal needs a finite number unless UNKNOWN");
  return Object.freeze({ value, provenance, source: source || null });
}
const observed = (v, s) => sig(v, "OBSERVED", s);
const estimated = (v, s) => sig(v, "ESTIMATED", s);
const inferred = (v, s) => sig(v, "INFERRED", s);
const unknown = (s) => sig(null, "UNKNOWN", s);

function isKnown(s) { return !!s && s.provenance !== "UNKNOWN" && typeof s.value === "number"; }
function valueOr(s, fallback = UNKNOWN_SCORE) { return isKnown(s) ? s.value : fallback; }
function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function round(n, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }

// Normalise anything stored in JSON back into a signal.
function revive(raw) {
  if (!raw || typeof raw !== "object") return unknown("missing");
  if (raw.provenance === "UNKNOWN") return unknown(raw.source);
  return sig(Number(raw.value), raw.provenance, raw.source);
}

function provenanceMix(signals) {
  const mix = { OBSERVED: 0, ESTIMATED: 0, INFERRED: 0, UNKNOWN: 0 };
  for (const s of Object.values(signals)) mix[(s && s.provenance) || "UNKNOWN"] += 1;
  return mix;
}

// Weighted confidence 0..1: how much of the decision weight rests on real data.
function confidence(signals, weights) {
  let total = 0; let got = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += weight;
    const s = signals[key];
    got += weight * (s ? TRUST[s.provenance] || 0 : 0);
  }
  return total ? got / total : 0;
}

module.exports = { PROVENANCE, UNKNOWN_SCORE, TRUST, sig, observed, estimated, inferred, unknown, isKnown, valueOr, clamp, round, revive, provenanceMix, confidence };
