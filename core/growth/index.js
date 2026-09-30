"use strict";

// GROWTH ENGINE — shared algorithm, channel-isolated memory.
//
//   rank → select (A/B first, C deliberately) → hooks → first 3 s → script →
//   titles → CTA/loop → integrity/factual → pacing/captions → readiness
//
// planShort() is pure planning (no uploads). The Shorts pipelines call it
// before render (pre-stage gate) and again with options.render after render
// (final-stage gate on the measured output).

const Config = require("./config");
const Store = require("./store");
const Model = require("./topic-model");
const Context = require("./context");
const Titles = require("./titles");
const Hooks = require("./hooks");
const FirstSeconds = require("./first-seconds");
const Script = require("./script");
const Engagement = require("./engagement");
const Integrity = require("./integrity");
const Pacing = require("./pacing");
const Readiness = require("./readiness");
const Funnel = require("./funnel");
const Experiments = require("./experiments");

function durationBucket(seconds) {
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 25) return "under-25s";
  if (seconds <= 35) return "25-35s";
  if (seconds <= 45) return "35-45s";
  return "over-45s";
}

function findTopic(ctx, idOrSlug) {
  return ctx.inventory.find((topic) => topic.id === idOrSlug || topic.slug === idOrSlug) || null;
}

// Deterministic selection: primary buckets first; the experimental bucket is
// used on a deterministic share of days; fallback to C only when the channel
// config allows it and no A/B remains. D is never selected.
function selectShortTopic(channel, options = {}) {
  const ranked = options.ranked || Context.rank(channel, options);
  const config = Config.forChannel(channel);
  const policy = config.scheduler.shorts;
  const day = options.date || new Date().toISOString().slice(0, 10);
  const exclude = new Set(options.exclude || []);
  const eligible = ranked.rows.filter((row) => !exclude.has(row.topic.id) && !exclude.has(row.topic.slug));
  const primary = eligible.filter((row) => policy.primaryBuckets.includes(row.score.bucket));
  const experimental = eligible.filter((row) => row.score.bucket === policy.experimentalBucket);
  const experimentDay = Engagement.hash01(`${channel.slug}:${day}:experiment`) < policy.experimentRatio;
  let choice = null;
  let reason = null;
  if (experimentDay && experimental.length) { choice = experimental[0]; reason = `experiment day (ratio ${policy.experimentRatio}): best C topic`; }
  else if (primary.length) { choice = primary[0]; reason = `best ${primary[0].score.bucket} topic`; }
  else if (policy.fallbackToC && experimental.length) { choice = experimental[0]; reason = "FALLBACK_TO_C: no A/B topic remains; C must still pass full production readiness"; }
  const inventory = { A: 0, B: 0, C: 0, D: 0 };
  for (const row of eligible) inventory[row.score.bucket] += 1;
  return {
    channel: channel.slug,
    date: day,
    selected: choice,
    reason: choice ? reason : `NO_QUALIFIED_TOPIC: ${primary.length} A/B, ${experimental.length} C${policy.fallbackToC ? "" : " (C fallback disabled)"}; skipping is better than publishing weak content`,
    inventory,
    ranked,
  };
}

// Production order for the legacy (Failure Reconstructed) loop, which tries
// topics in order until one succeeds: the selection first, then the rest of the
// primary buckets, then C only when fallback is allowed. D never appears.
function orderedQueue(channel, options = {}) {
  const selection = selectShortTopic(channel, options);
  const config = Config.forChannel(channel);
  const policy = config.scheduler.shorts;
  const exclude = new Set(options.exclude || []);
  const rows = selection.ranked.rows.filter((row) => !exclude.has(row.topic.id) && !exclude.has(row.topic.slug));
  const order = [];
  const push = (row) => { if (row && !order.includes(row.topic.slug)) order.push(row.topic.slug); };
  push(selection.selected);
  rows.filter((row) => policy.primaryBuckets.includes(row.score.bucket)).forEach(push);
  if (policy.fallbackToC) rows.filter((row) => row.score.bucket === policy.experimentalBucket).forEach(push);
  return { order, reason: selection.reason, inventory: selection.inventory, selected: selection.selected ? selection.selected.topic.slug : null };
}

const DEFAULT_LAYER = { "impossible-brief": "KNOWN SCIENCE", "critical-thread": "VERIFIED FACT" };
function editorialClaims(topic, config, templatedFields) {
  const lint = Script.lint(topic.narration, topic, config, { templatedFields });
  const wordsPerSecond = 2.8;
  let t = 0;
  const claims = topic.narrationBeats.map((beat, index) => {
    const text = /[.!?]$/.test(beat.text) ? beat.text : beat.text + ".";
    const seconds = Math.max(1.2, text.split(/\s+/).length / wordsPerSecond);
    const claim = { start: Math.round(t * 10) / 10, end: Math.round((t + seconds) * 10) / 10, role: beat.role || `BEAT_${index + 1}`, layer: beat.layer || DEFAULT_LAYER[topic.channel] || "VERIFIED FACT", confidence: beat.layer || DEFAULT_LAYER[topic.channel] || "VERIFIED FACT", text };
    t += seconds;
    return claim;
  });
  return {
    format: "short", generator: "editorial (researched record)", targetSeconds: claims[claims.length - 1].end,
    spoken: claims.map((claim) => claim.text).join(" "), claims, lines: claims.map((claim) => claim.text),
    structure: claims.map((claim) => claim.role), forbiddenOpening: Hooks.FORBIDDEN.test(claims[0].text),
    sourceIds: (topic.sources || []).map((source) => source.name), retention: lint,
  };
}

function gateMode() {
  return process.env.GROWTH_GATE_MODE === "shadow" ? "shadow" : "enforce";
}

function captionClaimsFromNarration(lines, seconds) {
  const words = lines.map((line) => line.split(/\s+/).length);
  const total = words.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return lines.map((text, index) => { const start = t; t += seconds * words[index] / total; return { start, end: t, text }; });
}

function planShort(channel, idOrTopic, options = {}) {
  const ctx = options.context || Context.build(channel, options);
  const config = ctx.config;
  const topic = typeof idOrTopic === "string" ? findTopic(ctx, idOrTopic) : idOrTopic;
  if (!topic) throw new Error(`${channel.name}: topic not found for growth plan: ${idOrTopic}`);
  if (topic.channel !== channel.slug) throw new Error(`CROSS_CHANNEL_PLAN_BLOCKED: topic ${topic.id} belongs to ${topic.channel}`);
  const evaluation = Context.evaluate(topic, ctx, { skipDuplicate: options.skipDuplicate });
  const hooks = evaluation.hooks;
  const retention = channel.config.retentionRules || {};
  const related = Funnel.relatedLongFor(channel, topic, { longs: options.longs });
  const cta = Engagement.cta(topic, config, { relatedLongVideo: related ? { videoId: related.long.videoId, title: related.long.title, relationship: related.relationship } : null });
  const experiment = options.assignExperiment ? Experiments.assign(channel, "short", topic.slug, { write: options.write }) : null;
  const legacyTitles = options.legacyTitles || [];
  const titles = Titles.generate(topic, config, "short", { extra: legacyTitles, publishedTitles: ctx.history.publishedTitles, learnedPatternBonus: ((ctx.learning || {}).shorts || {}).adoptedTitlePatternBonus });
  let script;
  if (topic.channel === "failure-reconstructed") {
    // Editorial narration is never auto-replaced; it is mapped and linted.
    const lint = Script.lint(topic.narration, topic, config, { templatedFields: evaluation.boilerplate.templatedFields });
    script = { format: "short", generator: "editorial (case file)", spoken: topic.narration.join(" "), lines: topic.narration, structure: lint.roles, retention: lint };
  } else if (topic.narration && topic.narration.length) {
    // Researched ImpossibleBrief / CriticalThread records: editorial narration,
    // one timed claim per line with its evidence layer (the renderer's
    // contract); nominal timing is replaced by measured takes at render.
    script = editorialClaims(topic, config, evaluation.boilerplate.templatedFields);
  } else if (hooks.selected) {
    script = Script.buildShort(topic, hooks, config, { templatedFields: evaluation.boilerplate.templatedFields, cta: cta.type !== "NONE" && cta.delivery !== "on-screen" ? cta.text : null });
  } else {
    script = { format: "short", generator: "none", spoken: "", lines: [], structure: [], retention: { score: 0, findings: ["no hook"], blockers: ["BLOCKER: no hook"], passes: false } };
  }
  const lines = script.claims ? script.claims.map((claim) => claim.text) : script.lines;
  const first = hooks.selected ? FirstSeconds.plan(topic, hooks, config, { openingMaxSeconds: retention.openingMaxSeconds }) : { score: 0, passes: false, blockers: ["no hook"], First3SecondPlan: null };
  const loop = hooks.selected ? Engagement.loop(topic, script.claims ? script : lines, hooks.selected, config) : { LoopPotentialScore: 0, apply: false };
  const disclosureEnabled = options.disclosureEnabled !== false;
  const integrity = Integrity.visual(topic, config, { disclosureEnabled });
  const factual = Integrity.factual(topic, lines);
  const range = channel.config.publishingCadence.shorts.targetDurationSeconds || [20, 40];
  const estimatedSeconds = Math.round(lines.join(" ").split(/\s+/).length / 2.8 * 10) / 10;
  const plannedSegments = Pacing.segments(Math.min(range[1], Math.max(range[0], estimatedSeconds)), config);
  const pacing = Pacing.pacingReport(plannedSegments);
  const captionClaims = script.claims || captionClaimsFromNarration(lines, estimatedSeconds);
  const captions = Pacing.captionAudit(captionClaims, config.captions);
  const readiness = Readiness.shorts({
    channel: channel.slug,
    topicScore: evaluation.score,
    hooks,
    script: script.retention,
    firstSeconds: first,
    factual,
    integrity,
    sourceQuality: evaluation.sourceQuality,
    metadata: { uploadChannel: channel.slug },
    duplicate: options.duplicate || null,
    captions: options.stage === "final" ? captions : null,
    pacing,
    durationRange: range,
    render: options.render || null,
    externalGate: options.externalGate || null,
  }, config);
  const plan = {
    schema: "growth-short-plan/1",
    channel: channel.slug,
    channelName: channel.name,
    contentType: "short",
    createdAt: (options.now || new Date()).toISOString(),
    topic: { id: topic.id, slug: topic.slug, title: topic.title, cluster: topic.cluster, subject: topic.subject },
    topicScore: evaluation.score,
    hooks: { selected: hooks.selected, candidateCount: hooks.candidateCount, familyCount: hooks.familyCount, meetsMinimum: hooks.meetsMinimum, candidates: hooks.candidates },
    first3Seconds: first,
    script: { ...script, estimatedSeconds },
    titles: { selected: titles.selected, selectedScore: titles.selectedScore, count: titles.count, meetsMinimum: titles.meetsMinimum, candidates: titles.candidates },
    cta,
    loop,
    integrity,
    factual,
    pacing: { plannedSegments, ...pacing },
    captions,
    relatedLong: related ? { videoId: related.long.videoId, slug: related.long.slug, title: related.long.title, ...related.relationship } : null,
    experiment,
    readiness,
    growthMeta: {
      hookType: hooks.selected ? hooks.selected.family : null,
      hookScore: hooks.selectedScore,
      topicCluster: topic.cluster,
      bucket: evaluation.score.bucket,
      storyStructure: (config.story && config.story.shorts || []).join(">"),
      titlePattern: titles.selected ? titles.selected.pattern : null,
      ctaStyle: cta.type,
      durationBucket: durationBucket(estimatedSeconds),
      openingVisual: first.First3SecondPlan ? first.First3SecondPlan.firstFrame.sourceClass : null,
      experimentVariant: experiment ? `${experiment.experiment_id}:${experiment.arm}` : null,
      factors: Object.fromEntries(Object.entries(evaluation.score.factors).map(([key, value]) => [key, value.value])),
    },
  };
  plan.summary = summary(plan);
  if (options.write) Store.writeState(channel, "shorts", `${topic.slug}.json`, plan);
  return plan;
}

// Map Failure Reconstructed's existing final gate (quality-gate.js) into the
// readiness inputs so nothing is measured twice.
function externalFromLegacyGate(result) {
  if (!result || !result.bilesenler) return null;
  const b = result.bilesenler;
  return {
    visual: b.visual && !b.visual.olculmedi ? b.visual.puan : null,
    audio: b.audio && !b.audio.olculmedi ? b.audio.puan : null,
    visualCritical: b.visual && b.visual.kritik && !/CAPTION/i.test(b.visual.kritik) ? b.visual.kritik : null,
    captionCritical: b.visual && b.visual.kritik && /CAPTION/i.test(b.visual.kritik) ? b.visual.kritik : null,
    legacyDecision: result.karar,
    legacyScore: result.toplam,
  };
}

function summary(plan) {
  return {
    Channel: plan.channelName,
    "Content Type": "SHORT",
    Topic: plan.topic.title,
    "Topic Score": plan.topicScore.VideoPotentialScore,
    "Topic Bucket": plan.topicScore.bucket,
    "Selected Hook": plan.hooks.selected ? plan.hooks.selected.spoken : null,
    "Hook Type": plan.hooks.selected ? plan.hooks.selected.family : null,
    "Hook Score": plan.hooks.selected ? plan.hooks.selected.adjustedTotal : 0,
    "First-3-sec Score": plan.first3Seconds.score,
    Duration: plan.script.estimatedSeconds ? `~${plan.script.estimatedSeconds}s (estimated)` : null,
    Scenes: plan.pacing.segments,
    "Production Score": `${plan.readiness.ProductionReadinessScore} (${plan.readiness.stage}) → ${plan.readiness.decision}`,
    Experiment: plan.experiment ? `${plan.experiment.experiment_id}:${plan.experiment.arm}` : "none",
    "Related Long Video": plan.relatedLong ? `${plan.relatedLong.title} (${plan.relatedLong.type})` : "none yet",
  };
}

function printSummary(summaryObject, extra = {}) {
  const rows = { ...summaryObject, ...extra };
  const width = Math.max(...Object.keys(rows).map((key) => key.length));
  return Object.entries(rows).map(([key, value]) => `${(key + ":").padEnd(width + 2)}${value == null ? "—" : value}`).join("\n");
}

module.exports = {
  Config, Store, Model, Context, selectShortTopic, orderedQueue, gateMode, planShort, externalFromLegacyGate, summary, printSummary, durationBucket, findTopic,
};
