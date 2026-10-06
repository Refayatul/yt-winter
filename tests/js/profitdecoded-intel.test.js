"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const PD = (m) => require("../../core/profitdecoded/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const universe = JSON.parse(fs.readFileSync(path.join(ROOT, "channels/profitdecoded/topics/topic-universe.json"), "utf8"));
const NOW = Date.parse("2026-10-06T00:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
// SYNTHETIC FIXTURE (test data only, not real YouTube data).
const mkVideos = (views, n = 12, start = 20) => Array.from({ length: n }, (_, i) => ({ id: "v" + i + "-" + views, title: "Filler video " + i, publishedAt: daysAgo(start + i * 6), views, likes: Math.round(views * 0.03), comments: Math.round(views * 0.002) }));

test("outlier score: a 12K-subscriber channel's 1.4M-view video beats a 1M video on a 5M channel", () => {
  const C = PD("competitive");
  const small = { id: "small", name: "Small", subscribers: 12000, videos: [...mkVideos(25000), { id: "hit", title: "Why Costco prices work", publishedAt: daysAgo(30), views: 1400000, likes: 60000, comments: 4000, earlyViews48h: 300000 }] };
  const big = { id: "big", name: "Big", subscribers: 5000000, videos: [...mkVideos(900000), { id: "bighit", title: "Big hit", publishedAt: daysAgo(30), views: 1000000, likes: 30000, comments: 1500 }] };
  const a = C.outlierScore(small.videos.find((v) => v.id === "hit"), small, { now: NOW });
  const b = C.outlierScore(big.videos.find((v) => v.id === "bighit"), big, { now: NOW });
  assert.ok(a.score.value > b.score.value + 30, `${a.score.value} vs ${b.score.value}`);
  assert.equal(a.smallChannelOutlier, true);
  assert.equal(b.smallChannelOutlier, false);
  assert.equal(a.score.provenance, "OBSERVED");
  assert.ok(a.components.some((c) => c.name === "viewsPerSubscriber"));
});

test("outlier score degrades to UNKNOWN when inputs are missing instead of inventing a number", () => {
  const C = PD("competitive");
  const r = C.outlierScore({ id: "x", publishedAt: daysAgo(10), views: 1000 }, { id: "c", videos: [] }, { now: NOW });
  assert.equal(r.score.provenance, "UNKNOWN");
  assert.ok(r.missing.length >= 1);
});

test("breakout feed finds small-channel outliers, records the spec's fields, and refuses to copy", () => {
  const C = PD("competitive");
  const snapshot = { channels: [
    { id: "small", name: "Small", subscribers: 12000, videos: [...mkVideos(20000), { id: "hit", title: "Why Gyms Make More Money When You Stay Home", publishedAt: daysAgo(12), views: 900000, likes: 40000, comments: 2500 }] },
    { id: "mid", name: "Mid", subscribers: 300000, videos: [...mkVideos(80000), { id: "hit2", title: "How gyms really make money when members stay home", publishedAt: daysAgo(20), views: 700000, likes: 20000, comments: 900 }] },
    { id: "flat", name: "Flat", subscribers: 900000, videos: [...mkVideos(400000), { id: "ok", title: "A normal upload", publishedAt: daysAgo(5), views: 420000 }] },
  ] };
  const feed = C.buildBreakoutFeed(snapshot, { now: NOW, inventory: universe.topics, threshold: 50 });
  assert.ok(feed.count >= 2);
  assert.ok(!feed.feed.some((f) => f.source.videoId === "ok"));
  const top = feed.feed[0];
  for (const k of ["window", "source", "outlier", "topic", "titleStructure", "viralMechanismCode", "thumbnailConcept", "viewerQuestion", "pillar", "freshness", "evergreenPotential", "profitDecodedRelevance", "saturation", "opportunityScore", "copyRule"]) assert.ok(k in top, k);
  assert.match(top.copyRule, /Never reuse/);
  assert.equal(top.thumbnailConcept.startsWith("UNKNOWN"), true);
  assert.ok(top.topic && /gym/i.test(top.topic.topic)); // matched to our inventory, not copied
});

test("saturation: EARLY / GROWING / HOT / SATURATED / DECLINING from inspectable rules", () => {
  const C = PD("competitive");
  const v = (days, ch, subs, out = 70, title = "Why gyms make money") => ({ publishedAt: daysAgo(days), channelId: ch, channelSubscribers: subs, outlier: out, title });
  assert.equal(C.saturation([], { now: NOW }).class, "EARLY");
  assert.equal(C.saturation([v(10, "a", 5000)], { now: NOW }).class, "EARLY");
  assert.equal(C.saturation([v(10, "a", 5000), v(40, "b", 8000)], { now: NOW }).class, "GROWING");
  assert.equal(C.saturation([v(2, "a", 600000), v(5, "b", 700000), v(9, "c", 900000), v(12, "d", 4000)], { now: NOW }).class, "HOT");
  const many = Array.from({ length: 10 }, (_, i) => v(3 + i * 5, "c" + i, 800000, 20 + i));
  assert.equal(C.saturation(many, { now: NOW }).class, "SATURATED");
  assert.equal(C.saturation([v(200, "a", 5000), v(260, "b", 9000), v(300, "c", 1000)], { now: NOW }).class, "DECLINING");
});

test("competitor gap analysis demands a real reason to exist", () => {
  const C = PD("competitive");
  assert.equal(C.gapAnalysis({}).status, "UNKNOWN");
  const none = C.gapAnalysis({ competitorCoverage: [{ covered: ["a"], missed: [] }], canWriteStronger30Seconds: true });
  assert.equal(none.reasonToExist, false);
  const yes = C.gapAnalysis({ competitorCoverage: [{ covered: ["pricing"], missed: ["what 10-K discloses"] }], primarySourcesStronger: true, mechanismCanBeVisualized: true, canDeliverBetterPayoff: true, originalAngle: "capacity arithmetic" });
  assert.equal(yes.reasonToExist, true);
});

test("revenue opportunity never invents CPM/RPM and uses relative ESTIMATED categories", () => {
  const R = PD("revenue"); const t = universe.topics[0];
  const ro = R.revenueOpportunity(t);
  assert.ok(["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"].includes(ro.category));
  assert.equal(ro.provenance, "ESTIMATED");
  assert.ok(!/\$\d/.test(JSON.stringify(ro)));
  assert.ok(!Object.keys(ro).some((k) => /cpm|rpm|usd/i.test(k)));
  assert.equal(R.observedValuePerView([{ views: 100, revenueUsd: 1 }]).status, "UNKNOWN");
  const obs = R.observedValuePerView(Array.from({ length: 6 }, () => ({ views: 1000, revenueUsd: 4 })));
  assert.equal(obs.status, "OBSERVED"); assert.equal(obs.medianRpmUsd, 4);
});

test("value-per-view prefers durable high-value topics over low-value viral ones", () => {
  const R = PD("revenue"); const S = PD("signals");
  const base = universe.topics.find((t) => t.pillar === "hidden-business-models");
  const hi = { ...base, cluster: "banks-cards", signals: { ...base.signals, advertiserFit: S.estimated(85, "t"), longformPotential: S.estimated(90, "t"), evergreen: S.estimated(90, "t") } };
  const lo = { ...base, cluster: "casinos-gambling", signals: { ...base.signals, advertiserFit: S.estimated(25, "t"), longformPotential: S.estimated(30, "t"), evergreen: S.estimated(25, "t"), shortsPotential: S.estimated(99, "t") } };
  assert.ok(R.valueScore(hi).score.value > R.valueScore(lo).score.value + 15);
  assert.ok(R.expectedBusinessValue(hi).score > R.expectedBusinessValue(lo).score);
});

test("EBV is a floored weighted geometric mean: one noisy low factor cannot zero it", () => {
  const R = PD("revenue"); const S = PD("signals");
  const t = universe.topics[0];
  const noisy = { ...t, signals: { ...t.signals, longformPotential: S.estimated(0, "noise") } };
  const a = R.expectedBusinessValue(t), b = R.expectedBusinessValue(noisy);
  assert.ok(b.score > 40 && b.score < a.score);
  assert.equal(b.factors.longformPotential, 20); // floor
  assert.ok(a.shrinkApplied >= 0);
  assert.equal(a.provenance, "ESTIMATED");
});

test("decision engine: UNKNOWN demand blocks long-form; observed demand + angle + passing research allows it", () => {
  const D = PD("decision"); const S = PD("signals");
  const t = universe.topics.find((x) => x.formats.long && x.formats.short);
  const unknown = D.evaluate(t, {});
  assert.ok(unknown.unknownInputs.includes("demand") && unknown.unknownInputs.includes("outlierEvidence"));
  assert.notEqual(unknown.decision, "PRODUCE_LONG");
  assert.ok(unknown.notes.some((n) => /long-form blocked/.test(n)));
  const ev = { breakout: { outlier: { score: S.observed(88, "x") }, saturation: { class: "EARLY" }, ageDays: 10 }, gap: { status: "ORIGINAL_ANGLE", reasonToExist: true, reason: "ok" }, research: { pass: true, score: 92 } };
  assert.equal(D.evaluate(t, ev).decision, "PRODUCE_LONG");
  assert.notEqual(D.evaluate(t, { ...ev, breakout: { ...ev.breakout, saturation: { class: "SATURATED" } } }).decision, "PRODUCE_LONG");
  assert.equal(D.evaluate(t, { ...ev, gap: { status: "NO_CLEAR_REASON", reasonToExist: false, reason: "x" }, breakout: { ...ev.breakout, saturation: { class: "SATURATED" } } }).decision, "REJECT");
});

test("ranking is diverse across pillars and returns the spec's columns", () => {
  const D = PD("decision");
  const rows = D.rank(universe.topics);
  const by = Object.fromEntries(universe.topics.map((t) => [t.id, t]));
  const top = D.selectDiverse(rows, 20, { topicById: by });
  assert.equal(top.length, 20);
  assert.ok(new Set(top.map((r) => r.pillar)).size >= 3);
  for (const k of ["topic", "pillar", "portfolioType", "inputs", "revenueOpportunity", "saturation", "expectedBusinessValue", "decision"]) assert.ok(k in top[0], k);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].rankScore >= rows[i].rankScore);
});

test("portfolio strategy, clusters and viral mechanisms", () => {
  const P = PD("portfolio");
  assert.deepEqual(P.TYPES, ["REACH", "REVENUE", "EVERGREEN", "AUTHORITY", "TREND", "EXPERIMENT"]);
  const cfg = require("../../channels/profitdecoded/config.json").portfolioAllocation;
  assert.ok(Math.abs(Object.values(cfg).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  const deficits = P.allocationDeficits(["REACH", "REACH", "REACH", "REACH"]);
  assert.ok(deficits.REACH < 0 && deficits.REVENUE > 0);
  const clusters = P.buildClusters(universe.topics);
  assert.ok(clusters.length >= 10);
  const airlines = clusters.find((c) => c.cluster === "airlines");
  assert.ok(airlines.flagshipLong && airlines.supportingShorts.length >= 3);
  assert.ok(!airlines.supportingShorts.includes(airlines.flagshipLong));
  const C = PD("competitive");
  assert.equal(C.viralMechanism("Why Free Trials Are So Hard to Cancel"), "CF");
  assert.equal(C.titleStructure("The Real Reason Airlines Overbook"), "real-reason");
});
