"use strict";

// PRODUCTION QUALITY GATES (PHASE 25 Shorts, PHASE 32M long-form).
// PUBLISH ≥ publish, REVIEW ≥ review, else BLOCK — and any hard failure
// blocks regardless of the number. Dimensions that cannot be measured yet
// (before render) are excluded from the weighted mean and listed as such.

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }

function decide(dimensions, weights, thresholds, hardFails) {
  let sum = 0;
  let total = 0;
  const unmeasured = [];
  for (const [key, weight] of Object.entries(weights)) {
    const value = dimensions[key];
    if (value == null) { unmeasured.push(key); continue; }
    sum += clamp(value) * weight;
    total += weight;
  }
  const score = total ? Math.round(sum / total) : 0;
  const decision = hardFails.length ? "BLOCK" : score >= thresholds.publish ? "PUBLISH" : score >= thresholds.review ? "REVIEW" : "BLOCK";
  return { score, decision, unmeasured };
}

// inputs: see core/growth/index.js planShort (pre stage, and final stage via options.render)
function shorts(inputs, config) {
  const hardFails = [];
  const notes = [];
  const d = {};
  const topic = inputs.topicScore;
  d.topicPotential = topic.VideoPotentialScore;
  if (topic.bucket === "D") hardFails.push("topic bucket D: " + topic.reasons.join("; "));
  d.hook = inputs.hooks.selectedScore;
  if (!inputs.hooks.selected) hardFails.push("no usable hook");
  if (!inputs.hooks.meetsMinimum) notes.push(`only ${inputs.hooks.candidateCount} hook candidates`);
  d.script = inputs.script.score;
  for (const blocker of inputs.script.blockers || []) hardFails.push("script: " + blocker.replace(/^BLOCKER:\s*/, ""));
  d.firstSeconds = inputs.firstSeconds.score;
  for (const blocker of inputs.firstSeconds.blockers || []) hardFails.push("first 3 s: " + blocker);
  d.factual = inputs.factual.score;
  hardFails.push(...inputs.factual.hardFails.map((item) => "factual: " + item));
  d.visualRelevance = inputs.integrity.score;
  hardFails.push(...inputs.integrity.hardFails.map((item) => "visual integrity: " + item));
  d.sources = inputs.sourceQuality.score;
  d.metadata = inputs.metadata ? (inputs.metadata.uploadChannel === inputs.channel ? 100 : 0) : null;
  if (inputs.metadata && inputs.metadata.uploadChannel !== inputs.channel) hardFails.push(`wrong channel metadata: ${inputs.metadata.uploadChannel} ≠ ${inputs.channel}`);
  if (inputs.duplicate) hardFails.push("duplicate: " + inputs.duplicate);
  if (inputs.placeholder) hardFails.push("placeholder asset or text");
  if (inputs.copyrightIssue) hardFails.push("copyright: " + inputs.copyrightIssue);
  if (inputs.disclosureMissing) hardFails.push("missing required disclosure");
  // Measured after render (null before).
  const render = inputs.render || null;
  const external = inputs.externalGate || null;
  d.visualQuality = external && external.visual != null ? external.visual : render ? (render.completed ? 82 : 0) : null;
  d.audio = external && external.audio != null ? external.audio : render ? (render.completed && render.syntheticVoice ? 85 : 0) : null;
  if (render && render.completed && render.syntheticVoice === false) hardFails.push("broken audio: non-speech fallback narration");
  if (render && render.completed && render.hasAudio === false) hardFails.push("broken audio: no audio stream");
  d.captions = inputs.captions ? (inputs.captions.passes ? 90 : 50) : null;
  if (render && render.completed && render.captionsBurned === false) hardFails.push("broken captions: not burned in");
  if (external && external.captionCritical) hardFails.push("broken captions: " + external.captionCritical);
  if (external && external.visualCritical) hardFails.push("visual check: " + external.visualCritical);
  const range = inputs.durationRange;
  d.duration = render && render.durationSeconds && range ? (render.durationSeconds >= range[0] - 0.5 && render.durationSeconds <= range[1] + 0.5 ? 100 : 40) : null;
  d.pacing = inputs.pacing ? (inputs.pacing.mechanical ? 50 : inputs.pacing.cutsInFirst3Seconds >= 2 ? 92 : 70) : null;
  d.render = render ? (render.completed && (!render.width || (render.width === 1080 && render.height === 1920)) ? 100 : 0) : null;
  if (render && render.completed && render.width && (render.width !== 1080 || render.height !== 1920)) hardFails.push(`broken render: ${render.width}x${render.height}`);
  const rules = config.readiness.shorts;
  const result = decide(d, rules.weights, rules, hardFails);
  return { ProductionReadinessScore: result.score, decision: result.decision, stage: render ? "final" : "pre", dimensions: d, unmeasured: result.unmeasured, hardFails, notes, thresholds: { publish: rules.publish, review: rules.review } };
}

function longform(inputs, config) {
  const hardFails = [...(inputs.hardFails || [])];
  const d = inputs.dimensions;
  const rules = config.readiness.longform;
  const result = decide(d, rules.weights, rules, hardFails);
  return { LongFormProductionReadinessScore: result.score, decision: result.decision, dimensions: d, unmeasured: result.unmeasured, hardFails, notes: inputs.notes || [], thresholds: { publish: rules.publish, review: rules.review } };
}

module.exports = { decide, shorts, longform };
