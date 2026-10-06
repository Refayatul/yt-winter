"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const PD = (m) => require("../../core/profitdecoded/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const universe = JSON.parse(fs.readFileSync(path.join(ROOT, "channels/profitdecoded/topics/topic-universe.json"), "utf8"));
const Builder = require("../../scripts/profitdecoded/build-inventory");

test("inventory has at least 500 unique topics across all five pillars with the intended mix", () => {
  const t = universe.topics;
  assert.ok(t.length >= 500, "topics: " + t.length);
  assert.equal(new Set(t.map((x) => x.id)).size, t.length);
  assert.equal(new Set(t.map((x) => x.topic.toLowerCase())).size, t.length);
  const share = (p) => t.filter((x) => x.pillar === p).length / t.length;
  const target = { "hidden-business-models": 0.30, "pricing-psychology": 0.25, "money-traps": 0.20, "strange-economics": 0.15, "company-stories": 0.10 };
  for (const [p, want] of Object.entries(target)) assert.ok(Math.abs(share(p) - want) <= 0.06, `${p} share ${share(p).toFixed(2)} vs ${want}`);
  assert.ok(universe.stats.qualified >= 500, "qualified: " + universe.stats.qualified);
});

test("inventory is honest: candidates are hypotheses, nothing is claimed researched or production-ready", () => {
  assert.equal(universe.stats.researched, 0);
  assert.equal(universe.stats.production_ready, 0);
  for (const t of universe.topics) {
    assert.equal(t.claimStatus, "hypothesis-needs-research");
    assert.equal(t.researchStatus, "candidate");
    assert.deepEqual(t.sources, []);
    assert.equal(t.signals.freshness.provenance, "UNKNOWN");
    assert.equal(t.signals.competitionOpenness.provenance, "UNKNOWN");
    for (const [k, s] of Object.entries(t.signals)) assert.ok(["OBSERVED", "ESTIMATED", "INFERRED", "UNKNOWN"].includes(s.provenance), k);
  }
});

test("inventory carries the required per-topic fields and a valid viral mechanism", () => {
  const required = ["topic", "pillar", "coreQuestion", "curiosityGap", "businessMechanism", "viralMechanism", "formats", "copyrightRisk", "estimatedProductionComplexity", "signals", "score"];
  const mechs = new Set(["Familiar Thing + Hidden Truth", "Familiar Company + Unexpected Business Model", "High Price + Unexpected Reason", "Common Behavior + Psychological Explanation", "Popular Product + Surprisingly Low Profit", "Cheap Product + Hidden Revenue Source", "Consumer Frustration + Business Incentive", "Company Decision + Hidden Economics", "Free Product + Unexpected Customer", "Normal Activity + Billion-Dollar Industry"]);
  for (const t of universe.topics) { for (const k of required) assert.ok(t[k] !== undefined, `${t.id} missing ${k}`); assert.ok(mechs.has(t.viralMechanism), t.viralMechanism); }
  for (const dim of PD("topic-scoring").DIMENSIONS) assert.ok(universe.topics[0].signals[dim], dim);
});

test("the inventory build is deterministic and rejects duplicates", () => {
  const a = Builder.build(); const b = Builder.build();
  assert.deepEqual(a.topics.map((t) => t.id), b.topics.map((t) => t.id));
  assert.equal(a.stats.total, universe.stats.total);
  assert.ok(a.dropped.length >= 1);
});

test("scoring prefers FAMILIAR + SURPRISING + MONEY + CURIOUS over flat academic titles", () => {
  const TS = PD("topic-scoring");
  const mk = (title, F, S) => { const seed = { title, entity: "X", pillar: "hidden-business-models", cluster: "gyms-fitness", mech: "FC", attrs: { familiarity: F, surprise: S, evidence: 4, visual: 4 } }; seed.copyrightRisk = TS.copyrightRisk(seed); return { ...seed, signals: TS.deriveSignals(seed) }; };
  const strong = TS.scoreTopic(mk("Why Gyms Make More Money When You Stay Home", 5, 5).signals);
  const weak = TS.scoreTopic(mk("Understanding Gym Economics", 3, 2).signals);
  assert.ok(strong.score > weak.score + 10, `${strong.score} vs ${weak.score}`);
  assert.ok(TS.titlePotential("Why Gyms Make More Money When You Stay Home") > TS.titlePotential("Understanding Gym Economics") + 20);
  assert.ok(TS.titlePotential("The $9.99 Trick Still Works. Here's Why.") >= 55);
});

test("UNKNOWN signals are scored pessimistically and lower confidence, never favourably", () => {
  const S = PD("signals"); const TS = PD("topic-scoring");
  const t = universe.topics[0];
  const base = TS.scoreTopic(t.signals);
  const worse = { ...t.signals, businessInsight: S.unknown("x"), evidenceQuality: S.unknown("x") };
  const scored = TS.scoreTopic(worse);
  assert.ok(scored.score < base.score);
  assert.ok(scored.confidence < base.confidence);
  assert.ok(scored.unknownDimensions.includes("businessInsight"));
  assert.equal(S.valueOr(S.unknown("x")), S.UNKNOWN_SCORE);
  assert.throws(() => S.sig(NaN, "OBSERVED"));
});
