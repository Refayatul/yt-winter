"use strict";

// Channel-specific launch and editorial scoring. Question-only records may be
// ranked for research, but only VERIFIED + productionReady records may enter
// production. The seven weights are the public editorial policy for this
// channel and deliberately sum to one.

const WEIGHTS = Object.freeze({
  UniversalCuriosity: 0.25,
  HookStrength: 0.20,
  VisualExplainability: 0.15,
  SurprisePayoff: 0.15,
  EvidenceAvailability: 0.10,
  EvergreenPotential: 0.10,
  LongFormExpansion: 0.05,
});

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const round = (value) => Math.round(value * 10) / 10;
const get = (value, path, fallback = 0) => path.split(".").reduce((row, key) => row && row[key], value) ?? fallback;
const words = (value) => String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "because", "for", "from", "has", "have", "in", "is", "it", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "why", "with"]);

function answerLeak(topic) {
  const opening = new Set(words(topic.openingLine || topic.hook).filter((word) => !STOP.has(word)));
  const payoff = new Set(words(topic.payoff).filter((word) => !STOP.has(word)));
  if (!opening.size || !payoff.size) return false;
  const fullOverlap = [...opening].filter((word) => payoff.has(word)).length / Math.min(opening.size, payoff.size);
  const subject = new Set(words([topic.topic, topic.coreQuestion, topic.canonicalTopic, topic.object, topic.designDetail].join(" ")));
  const strippedOpening = [...opening].filter((word) => !subject.has(word));
  const strippedPayoff = [...payoff].filter((word) => !subject.has(word));
  const strippedOverlap = strippedOpening.filter((word) => strippedPayoff.includes(word)).length / Math.max(1, Math.min(strippedOpening.length, strippedPayoff.length));
  return fullOverlap >= 0.65 || strippedOverlap >= 0.3;
}

function components(topic) {
  const curiosity = clamp(topic.curiosityScore);
  const audience = clamp(get(topic, "audienceFit.score", 70));
  const shortPotential = clamp(get(topic, "shortPotential.score", curiosity));
  const novelty = clamp(get(topic, "novelty.score", curiosity));
  const verifiedEvidence = topic.productionReady === true && topic.researchStatus === "VERIFIED";
  const sourceBase = clamp(get(topic, "sourceQuality.score", get(topic, "sourceAvailability.score", 0)));
  const evidence = verifiedEvidence && (topic.sources || []).length >= 2 && (topic.facts || []).length >= 5 ? Math.max(95, sourceBase) : sourceBase;
  const hookPenalty = answerLeak(topic) ? 12 : 0;
  return {
    UniversalCuriosity: round(curiosity * 0.60 + audience * 0.40),
    HookStrength: round(shortPotential * 0.65 + curiosity * 0.35 - hookPenalty),
    VisualExplainability: round(get(topic, "visualPotential.score", 0)),
    SurprisePayoff: round(novelty * 0.55 + curiosity * 0.45),
    EvidenceAvailability: round(evidence),
    EvergreenPotential: round(topic.evergreenScore),
    LongFormExpansion: round(get(topic, "longFormPotential.score", 0)),
  };
}

function score(topic, weights = WEIGHTS) {
  const factors = components(topic);
  const total = Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(factors[key]) * weight, 0);
  return {
    total: round(total),
    factors,
    weights,
    productionReady: topic.productionReady === true && topic.researchStatus === "VERIFIED",
    progressiveReveal: !answerLeak(topic),
  };
}

function rank(topics, options = {}) {
  const minimum = Number(options.minimum == null ? 0 : options.minimum);
  return (topics || []).map((topic) => ({ topic, editorial: score(topic, options.weights || WEIGHTS) }))
    .filter((row) => row.editorial.total >= minimum)
    .sort((a, b) => b.editorial.total - a.editorial.total || b.editorial.factors.VisualExplainability - a.editorial.factors.VisualExplainability || a.topic.id.localeCompare(b.topic.id));
}

function questionType(topic) {
  const text = `${topic.topic || ""} ${topic.designDetail || ""}`.toLowerCase();
  if (/origin|name|started|first|history|symbol|logo/.test(text)) return "origin";
  if (/behavio|placement|layout|timing|queue|price/.test(text)) return "behavior";
  if (/system|code|number|standard|format|check digit/.test(text)) return "system";
  if (/mechanism|pressure|interlock|self-clean|flow|vent|lock|bearing/.test(text)) return "mechanism";
  return "design-purpose";
}

function payoffType(topic) {
  const text = `${topic.payoff || ""} ${topic.mechanism || ""} ${topic.misconception || ""}`.toLowerCase();
  if (/misconception|not |wasn't|isn't|actual|instead/.test(text)) return "reversal";
  if (/origin|started|invent|introduced|history|remains|surviving/.test(text)) return "origin";
  if (/protect|prevent|allow|lets|so that|purpose|designed/.test(text)) return "purpose";
  return "mechanism";
}

module.exports = { WEIGHTS, answerLeak, components, score, rank, questionType, payoffType };
