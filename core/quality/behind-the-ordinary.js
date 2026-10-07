"use strict";

const Editorial = require("../../channels/behind-the-ordinary/editorial");
const Scripting = require("../scripting");

const PILLARS = new Set(["EVERYDAY MYSTERIES", "HIDDEN ENGINEERING", "STRANGE ORIGINS", "DESIGN DECISIONS", "ORDINARY SYSTEMS"]);
const OTHER_CHANNEL = /\b(what if|impossible scenario|failure reconstructed|disaster reconstruction|global chokepoint|critical infrastructure dependency)\b/i;
const AI_FILLER = /\b(it(?:'s| is) important to note|interestingly|furthermore|in conclusion|delve into|in today's video|welcome back|did you know)\b/i;
const REQUIRED_SCENE_FIELDS = ["narration", "visualObjective", "visualType", "assetQuery", "assetSource", "animationInstruction", "evidenceReference", "transition", "duration"];
const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

function evaluateTopic(topic, allTopics = []) {
  const blockers = [];
  const exact = allTopics.filter((item) => item.id !== topic.id && String(item.topic).toLowerCase() === String(topic.topic).toLowerCase());
  if (!PILLARS.has(topic.category)) blockers.push("unknown editorial pillar");
  if (!topic.coreQuestion || !/\?$/.test(topic.coreQuestion)) blockers.push("missing one explicit central question");
  if (!topic.canonicalTopic || !topic.designDetail) blockers.push("missing ordinary object or design detail");
  if (!Array.isArray(topic.sourceRequirements) || topic.sourceRequirements.length < 2) blockers.push("fewer than two research-source requirements");
  if (!topic.quality || topic.quality.answerNotPreclaimed !== true) blockers.push("seed question preclaims an unverified answer");
  if (OTHER_CHANNEL.test([topic.topic, topic.coreQuestion, topic.whyInteresting].join(" "))) blockers.push("topic identity belongs to another channel");
  if (exact.length) blockers.push("exact duplicate topic");
  const verified = topic.productionReady === true && topic.researchStatus === "VERIFIED";
  if (verified) {
    if (!Array.isArray(topic.sources) || topic.sources.length < 2) blockers.push("production topic has fewer than two sources");
    if (!Array.isArray(topic.facts) || topic.facts.length < 5) blockers.push("production topic has fewer than five mapped facts");
    if (!Array.isArray(topic.narration) || topic.narration.length < 5) blockers.push("production topic has no evidence-led narration");
    if (!topic.openingLine || Scripting.FORBIDDEN_OPENINGS.test(topic.openingLine)) blockers.push("weak or forbidden opening");
    if (!topic.payoff) blockers.push("production topic has no payoff");
    if (Editorial.answerLeak(topic)) blockers.push("opening gives away the full payoff instead of progressively explaining it");
    if (authorityFacts(topic) < 2) blockers.push("fewer than two facts verified on a non-Wikipedia authoritative source");
  }
  const editorial = Editorial.score(topic);
  const scores = { ...editorial.factors, repetition: exact.length ? 0 : 100 };
  const total = editorial.total;
  const decision = blockers.length ? "BLOCK" : verified && total >= 85 ? "PUBLISH" : "REVIEW";
  return { topicId: topic.id, decision, total, scores, blockers, productionReady: verified, progressiveReveal: editorial.progressiveReveal,
    note: verified ? "evidence mapped" : "validated research question; evidence required before production" };
}

// Facts quote-verified on a page that is not Wikipedia (manufacturer,
// standards body, archive, museum, university, government). Wikipedia helps
// discovery but never carries a production video on its own.
function authorityFacts(topic) {
  return (topic.facts || []).filter((fact) => {
    if (!fact.claim || !fact.url) return false;
    try { return !/(^|\.)wikipedia\.org$/i.test(new URL(fact.url).hostname); } catch (error) { return false; }
  }).length;
}

function sourceConfidence(topic) {
  const mapped = (topic.facts || []).filter((fact) => fact.claim && fact.source).length;
  if (topic.productionReady === true && topic.researchStatus === "VERIFIED" && (topic.sources || []).length >= 2 && mapped >= 5) {
    const authority = authorityFacts(topic);
    return authority >= 2 ? 95 : authority === 1 ? 82 : 70;
  }
  return clamp(((topic.sourceQuality || topic.sourceAvailability || {}).score) || 0);
}

function naturalness(script) {
  const text = script && script.spoken || "";
  if (!text || AI_FILLER.test(text)) return 40;
  const sentences = text.split(/[.!?]+/).map((line) => line.trim()).filter(Boolean);
  const average = sentences.length ? sentences.reduce((sum, line) => sum + line.split(/\s+/).length, 0) / sentences.length : 99;
  return average <= 16 ? 94 : average <= 20 ? 86 : 72;
}

function titleMatchesTopic(title, topic) {
  const tokens = (value) => new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  const selected = tokens(title);
  const subject = [...tokens(`${topic.canonicalTopic || topic.object} ${topic.designDetail}`)].filter((word) => word.length > 3);
  return subject.some((word) => selected.has(word));
}

function evaluatePackage(pkg) {
  const hardFails = [];
  const topic = pkg.topic || {};
  const script = pkg.script || {};
  const growth = pkg.growthPlan || null;
  const rendered = pkg.render && pkg.render.completed;
  if (topic.productionReady !== true || topic.researchStatus !== "VERIFIED") hardFails.push("central claim cannot be verified");
  if (!script.spoken || script.forbiddenOpening) hardFails.push("forbidden or missing opening");
  if (AI_FILLER.test(script.spoken || "")) hardFails.push("script reads like generic AI prose");
  if (!topic.payoff) hardFails.push("payoff is missing");
  if (Editorial.answerLeak(topic)) hardFails.push("opening reveals the full payoff");
  if (!pkg.titles || pkg.titles.length < 20) hardFails.push("fewer than 20 title candidates");
  if (pkg.metadata && !titleMatchesTopic(pkg.metadata.title, topic)) hardFails.push("title/payoff mismatch");
  if (!pkg.visuals || pkg.visuals.length < 5) hardFails.push("missing visual scenes");
  for (const scene of pkg.visuals || []) {
    const missing = REQUIRED_SCENE_FIELDS.filter((field) => scene[field] == null || scene[field] === "");
    if (missing.length) hardFails.push(`scene ${scene.scene} missing storyboard fields: ${missing.join(", ")}`);
  }
  if (!pkg.sources || pkg.sources.length < 2) hardFails.push("insufficient sources");
  if (!pkg.thumbnail || pkg.thumbnail.maxWords > 4 || pkg.thumbnail.clutter === true) hardFails.push("thumbnail identity missing, cluttered or too verbose");
  if (!pkg.metadata || pkg.metadata.uploadChannel !== "behind-the-ordinary") hardFails.push("wrong channel metadata");

  const hook = clamp(growth && growth.hooks && growth.hooks.selectedScore || (!script.forbiddenOpening && !Editorial.answerLeak(topic) ? 90 : 60));
  const visualMeasured = pkg.renderVisuals && pkg.renderVisuals.visualQuality;
  // Once rendered, visual relevance is the measured score only; the topic's
  // planning estimate never stands in for what actually reached the screen.
  const visualRelevance = rendered
    ? clamp(visualMeasured && Number.isFinite(visualMeasured.score) ? visualMeasured.score : 0)
    : clamp(Math.max(90, (topic.visualPotential || {}).score || 0));
  if (rendered) {
    const renderedSources = pkg.renderVisuals && pkg.renderVisuals.sources || [];
    for (const scene of pkg.visuals || []) {
      if (scene.explainer && !renderedSources.some((shot) => shot.claimIndex === scene.scene - 1 && shot.type === "explainer")) {
        hardFails.push(`visual/narration mismatch: storyboard scene ${scene.scene} (${scene.explainer}) was not rendered as a diagram`);
      }
    }
  }
  const narrationNaturalness = naturalness(script);
  const renderedSegments = pkg.renderVisuals && pkg.renderVisuals.segmentSeconds;
  const pacing = Array.isArray(renderedSegments) && renderedSegments.length
    ? (Math.max(...renderedSegments) <= 3.2 ? 95 : Math.max(...renderedSegments) <= 3.5 ? 85 : 70)
    : (pkg.visuals || []).length && pkg.visuals.every((scene) => scene.changeRequiredWithinSeconds <= 3) ? 92 : 70;
  const curiosityPayoff = clamp(((topic.curiosityScore || 0) + (topic.payoff ? 95 : 0)) / 2);
  const components = { hook, visualRelevance, sourceConfidence: sourceConfidence(topic), narrationNaturalness, pacing, curiosityPayoff };
  const minimums = { hook: 85, visualRelevance: 90, sourceConfidence: 90, narrationNaturalness: 85, pacing: 85, curiosityPayoff: 85 };
  for (const [name, minimum] of Object.entries(minimums)) if (components[name] < minimum) hardFails.push(`${name} ${components[name]} < ${minimum}`);

  if (pkg.renderVisuals && visualMeasured && visualMeasured.decision === "BLOCK") hardFails.push(...(visualMeasured.reasons || []).map((reason) => "rendered visuals: " + reason));
  if (rendered) {
    const audio = pkg.render.audio || {};
    const video = pkg.render.video || {};
    const thumbnail = pkg.render.thumbnail || {};
    if (audio.syntheticVoice === false || video.hasAudio === false) hardFails.push("robotic or broken narration");
    if (!Array.isArray(audio.claimDurations) || audio.claimDurations.length !== (script.claims || []).length) hardFails.push("abnormal silence or broken audio timing");
    if (video.width !== 1080 || video.height !== 1920) hardFails.push("incorrect aspect ratio");
    if (!(video.durationSeconds >= 30 && video.durationSeconds <= 50.2)) hardFails.push("Short duration is outside 30–50 seconds");
    if (!thumbnail.bytes || !["licensed-still", "number-card"].includes(thumbnail.sourceType)) hardFails.push("missing or non-documentary thumbnail asset");
    if (thumbnail.textWords > 4) hardFails.push("unreadable thumbnail text density");
    if (!pkg.metadata.description.includes("Visual credits:") && (pkg.renderVisuals.realImageCount || 0) > 0) hardFails.push("missing attribution when required");
  }
  const overall = Math.round(Object.values(components).reduce((sum, value) => sum + value, 0) / Object.keys(components).length);
  const decision = hardFails.length ? "BLOCK" : overall >= 88 ? "PUBLISH" : overall >= 78 ? "REVIEW" : "BLOCK";
  return { decision, overall, components, thresholds: { publish: 88, review: 78, componentMinimums: minimums }, blockers: [...new Set(hardFails)], hardFails: [...new Set(hardFails)],
    checked: ["identity", "central-question", "evidence", "hook", "progressive-reveal", "storyboard", "visuals", "audio", "titles", "thumbnail", "sources", "metadata"] };
}

module.exports = { PILLARS, AI_FILLER, REQUIRED_SCENE_FIELDS, authorityFacts, evaluateTopic, evaluatePackage, naturalness, sourceConfidence, titleMatchesTopic };
