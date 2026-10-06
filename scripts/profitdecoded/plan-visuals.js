"use strict";
// Turns per-beat graphic specs into a timed shot plan (density-driven durations
// from core/profitdecoded/visuals.planShots) so the visual QA can run on it.
const path = require("path");
const V = require(path.join(__dirname, "..", "..", "core/profitdecoded/visuals"));

function build(bundle) {
  const shots = V.planShots(bundle.beats.map((b) => ({ id: b.id, text: b.text, start: b.start != null ? b.start : 0, end: b.end != null ? b.end : 6, claimId: b.claimId })), { seed: bundle.id, format: bundle.format });
  const perBeat = {};
  return shots.map((shot) => {
    const specs = bundle.graphicSpecs[shot.beatId] || [];
    const i = perBeat[shot.beatId] = (perBeat[shot.beatId] || 0);
    perBeat[shot.beatId] += 1;
    const spec = specs[i % Math.max(1, specs.length)];
    if (!spec) return { beatId: shot.beatId, type: "stock", durationSec: shot.duration, tags: ["generic"], source: null };
    return {
      beatId: shot.beatId, type: spec.type, entities: spec.entities, overlayText: spec.overlayText, numbers: spec.numbers || [], evidenceClaimId: spec.evidenceClaimId, alt: spec.alt || spec.overlayText,
      source: { id: spec.asset, kind: "original-graphic", license: "original-graphic" }, durationSec: shot.duration, start: shot.start, motion: shot.motion, transition: shot.transition,
      animated: true, fontPx: bundle.format === "short" ? 72 : 56, aiGenerated: false,
    };
  });
}
module.exports = { build };
