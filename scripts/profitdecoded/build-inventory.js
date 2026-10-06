#!/usr/bin/env node
"use strict";
// Builds channels/profitdecoded/topics/topic-universe.json from curated seed files.
// Seeds are HYPOTHESES: no topic is marked researched. researchStatus stays
// "candidate" until a source dossier passes the research gate.

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const TS = require(path.join(root, "core/profitdecoded/topic-scoring"));
const T = require(path.join(root, "core/profitdecoded/text"));
const S = require(path.join(root, "core/profitdecoded/signals"));

const PILLARS = ["hidden-business-models", "pricing-psychology", "money-traps", "strange-economics", "company-stories"];
const MECHS = {
  FH: "Familiar Thing + Hidden Truth", FC: "Familiar Company + Unexpected Business Model", HP: "High Price + Unexpected Reason",
  CB: "Common Behavior + Psychological Explanation", PL: "Popular Product + Surprisingly Low Profit", CH: "Cheap Product + Hidden Revenue Source",
  CF: "Consumer Frustration + Business Incentive", CD: "Company Decision + Hidden Economics", FP: "Free Product + Unexpected Customer", NA: "Normal Activity + Billion-Dollar Industry",
};
const ID_PREFIX = { "hidden-business-models": "hbm", "pricing-psychology": "pp", "money-traps": "mt", "strange-economics": "se", "company-stories": "cs" };

function parse(pillar) {
  const file = path.join(__dirname, "seeds", pillar + ".txt");
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((line, i) => {
    const [title, entity, cluster, mech, f, s, e, v] = line.split("|");
    if (!MECHS[mech] || [f, s, e, v].some((x) => !/^[1-5]$/.test(x))) throw new Error(`bad seed ${pillar}:${i + 1}: ${line}`);
    return { pillar, title: title.trim(), entity: entity.trim(), cluster: cluster.trim(), mech, attrs: { familiarity: +f, surprise: +s, evidence: +e, visual: +v } };
  });
}

function coreQuestion(title) {
  const t = title.replace(/\.$/, "");
  if (/^why /i.test(t)) return t.replace(/^why /i, "Why ") + "?";
  if (/^how /i.test(t)) return t.replace(/^how /i, "How ") + "?";
  return "What is the mechanism behind: " + t + "?";
}

function build() {
  const seen = new Map(); const dropped = [];
  const raw = PILLARS.flatMap(parse);
  const unique = [];
  for (const seed of raw) {
    const key = T.normalizeTitle(seed.title);
    if (seen.has(key)) { dropped.push({ title: seed.title, reason: "exact duplicate of " + seen.get(key) }); continue; }
    // Near-duplicate guard (same entity, very similar title).
    const near = unique.find((u) => u.entity === seed.entity && T.wordSetSimilarity(u.title, seed.title) >= 0.8);
    if (near) { dropped.push({ title: seed.title, reason: "near duplicate of " + near.title }); continue; }
    seen.set(key, seed.title); unique.push(seed);
  }
  const perPillar = {}; const entityCount = {};
  for (const seed of unique) entityCount[seed.entity] = (entityCount[seed.entity] || 0) + 1;
  const topics = unique.map((seed) => {
    perPillar[seed.pillar] = (perPillar[seed.pillar] || 0) + 1;
    const id = `${ID_PREFIX[seed.pillar]}-${String(perPillar[seed.pillar]).padStart(3, "0")}-${T.slugify(seed.title).slice(0, 48)}`;
    const signals = TS.deriveSignals(seed);
    // Own-channel novelty (INFERRED): penalise topics that crowd a single entity.
    const crowd = entityCount[seed.entity] - 1;
    signals.novelty = S.inferred(S.clamp(92 - crowd * 7), "inferred from entity crowding inside the ProfitDecoded inventory only; competitor novelty UNKNOWN");
    const scored = TS.scoreTopic(signals);
    const risk = TS.copyrightRisk(seed);
    const longformSuitable = signals.longformPotential.value >= 66;
    const shortSuitable = signals.shortsPotential.value >= 60;
    return {
      id, topic: seed.title, pillar: seed.pillar, entity: seed.entity, cluster: seed.cluster,
      coreQuestion: coreQuestion(seed.title),
      curiosityGap: "Familiar " + seed.entity + " behaviour whose business logic the title implies but does not explain.",
      businessMechanism: "UNKNOWN until researched (hypothesis from title only)",
      viralMechanism: MECHS[seed.mech], viralMechanismCode: seed.mech,
      claimStatus: "hypothesis-needs-research",
      researchStatus: "candidate", sources: [],
      emotionalResponse: ["CF", "CB"].includes(seed.mech) ? "recognition / mild outrage" : "surprise / curiosity",
      formats: { short: shortSuitable, long: longformSuitable, longformExpansionPotential: S.round(signals.longformPotential.value, 0) },
      copyrightRisk: risk, estimatedProductionComplexity: signals.productionFeasibility.value >= 70 ? "low" : signals.productionFeasibility.value >= 55 ? "medium" : "high",
      signals, score: scored,
      status: "candidate",
    };
  });
  // Qualification: strong composite AND not dominated by unknown core levers.
  for (const t of topics) {
    t.status = t.score.score >= 74 && t.signals.evidenceQuality.value >= 60 && t.signals.titlePotential.value >= 58 ? "qualified" : "reserve";
  }
  topics.sort((a, b) => b.score.score - a.score.score);
  const stats = {
    total: topics.length, qualified: topics.filter((t) => t.status === "qualified").length, reserve: topics.filter((t) => t.status === "reserve").length,
    researched: 0, production_ready: 0, research_backlog: topics.length, used: 0,
    perPillar: Object.fromEntries(PILLARS.map((p) => [p, topics.filter((t) => t.pillar === p).length])),
    perPillarQualified: Object.fromEntries(PILLARS.map((p) => [p, topics.filter((t) => t.pillar === p && t.status === "qualified").length])),
    shortSuitable: topics.filter((t) => t.formats.short).length, longSuitable: topics.filter((t) => t.formats.long).length,
    clusters: [...new Set(topics.map((t) => t.cluster))].length, entities: [...new Set(topics.map((t) => t.entity))].length,
    droppedDuplicates: dropped.length,
  };
  return { stats, topics, dropped };
}

if (require.main === module) {
  const { stats, topics, dropped } = build();
  const out = path.join(root, "channels/profitdecoded/topics/topic-universe.json");
  fs.writeFileSync(out, JSON.stringify({
    schema: "profitdecoded.topic-universe.v1",
    note: "Curated candidates are HYPOTHESES. Ratings are hand-rated 1-5 attributes with documented priors (ESTIMATED). Demand, outlier evidence, saturation, competition and freshness are UNKNOWN until the Competitive Intelligence Engine is fed real YouTube data. Nothing here is researched or production-ready.",
    generated_at: new Date().toISOString(), stats, topics,
  }, null, 1) + "\n");
  console.log(JSON.stringify(stats, null, 2));
  if (dropped.length) console.log("dropped:", dropped.map((d) => d.title + " (" + d.reason + ")").join("\n  "));
}
module.exports = { build, PILLARS };
