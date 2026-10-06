"use strict";
// ProfitDecoded learning engine (spec 8, 28, 29, 50-55). Isolated: reads and
// writes only channels/profitdecoded/. Learning uses rolling evidence with
// shrinkage so one viral video cannot rewrite the strategy.

const fs = require("fs");
const path = require("path");
const S = require("./signals");
const T = require("./text");
const { CHANNEL_DIR } = require("./config");

const MEMORY = path.join(CHANNEL_DIR, "memory", "learning.json");
const DIMENSIONS = ["pillar", "entity", "cluster", "viralMechanism", "hookMechanism", "titlePattern", "thumbnailStyle", "durationBucket", "pacing", "openingStyle", "narrationStyle", "visualStyle"];
const SHRINK_K = 5; // pseudo-observations pulling a thin sample toward the channel mean
const MIN_EVIDENCE = 5; // below this a dimension value is "insufficient evidence" and cannot drive decisions

function assertChannelPath(file) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(CHANNEL_DIR + path.sep)) throw new Error("learning isolation violation: " + file + " is outside channels/profitdecoded");
  return resolved;
}
function load(file = MEMORY) { try { return JSON.parse(fs.readFileSync(assertChannelPath(file), "utf8")); } catch (e) { return { schema: "profitdecoded.learning.v1", records: [] }; } }
function save(mem, file = MEMORY) { fs.mkdirSync(path.dirname(assertChannelPath(file)), { recursive: true }); fs.writeFileSync(file, JSON.stringify(mem, null, 1) + "\n"); }

// ---- Short classification -------------------------------------------------
// Benchmarks are channel-relative once >=12 Shorts have 24h+ data; before that
// provisional absolute benchmarks apply and are labelled PROVISIONAL.
const PROVISIONAL = { basis: "PROVISIONAL absolute benchmarks", viewedVsSwiped: 65, firstSecondsRetention: 70, avgPercentViewed: 75, subsPer1k: 2.0, sharesPer1k: 3.0, minViews: 300 };

function benchmarks(shorts) {
  const ready = shorts.filter((s) => s.metrics && s.metrics.d1);
  if (ready.length < 12) return { ...PROVISIONAL, basis: "PROVISIONAL (fewer than 12 Shorts with 24h data)", relative: false };
  const med = (get) => T.median(ready.map(get).filter((x) => x != null));
  return {
    viewedVsSwiped: med((s) => s.metrics.d1.viewedVsSwiped) || PROVISIONAL.viewedVsSwiped, firstSecondsRetention: med((s) => s.metrics.d1.firstSecondsRetention) || PROVISIONAL.firstSecondsRetention,
    avgPercentViewed: med((s) => s.metrics.d1.avgPercentViewed) || PROVISIONAL.avgPercentViewed, subsPer1k: med((s) => s.metrics.d1.subsPer1k) || PROVISIONAL.subsPer1k, sharesPer1k: med((s) => s.metrics.d1.sharesPer1k) || PROVISIONAL.sharesPer1k,
    medianViews24h: med((s) => s.metrics.d1.views), minViews: PROVISIONAL.minViews, basis: `OBSERVED channel medians over ${ready.length} Shorts`, relative: true,
  };
}

// m: a 24h-or-later snapshot {views, impressions?, viewedVsSwiped?, firstSecondsRetention?, avgViewDurationSec?, avgPercentViewed?, likes, comments, shares, subsGained}
function classifyShort(m, bench = PROVISIONAL, options = {}) {
  if (!m || m.views == null) return { label: "insufficient evidence", reason: "no metrics", topicScore: null };
  if (m.views < (bench.minViews || PROVISIONAL.minViews)) return { label: "insufficient evidence", reason: `only ${m.views} views (<${bench.minViews || PROVISIONAL.minViews})`, topicScore: null };
  const per1k = (x) => (x == null ? null : x / m.views * 1000);
  const subsPer1k = per1k(m.subsGained), sharesPer1k = per1k(m.shares);
  const have = { vs: m.viewedVsSwiped != null, fs: m.firstSecondsRetention != null, apv: m.avgPercentViewed != null };
  if (!have.apv && !have.vs) return { label: "insufficient evidence", reason: "retention metrics missing (needs avg % viewed or viewed-vs-swiped)", topicScore: null };
  const rel = (v, b) => (v == null ? null : S.clamp(50 + (v / b - 1) * 60));
  const hookParts = [rel(m.viewedVsSwiped, bench.viewedVsSwiped), rel(m.firstSecondsRetention, bench.firstSecondsRetention)].filter((x) => x != null);
  const hookScore = hookParts.length ? T.mean(hookParts) : null;
  const payoffScore = rel(m.avgPercentViewed, bench.avgPercentViewed);
  const demandParts = [];
  if (bench.medianViews24h && m.views24h != null) demandParts.push(rel(m.views24h, bench.medianViews24h));
  if (sharesPer1k != null) demandParts.push(rel(sharesPer1k, bench.sharesPer1k));
  if (subsPer1k != null) demandParts.push(rel(subsPer1k, bench.subsPer1k));
  const topicScore = demandParts.length ? T.mean(demandParts) : (payoffScore != null ? payoffScore : null);
  if (topicScore == null) return { label: "insufficient evidence", reason: "no demand signals (shares/subs/views) available", topicScore: null };
  const hi = (x) => x != null && x >= 58, lo = (x) => x != null && x < 48;
  let label;
  if (hi(topicScore) && (hookScore == null || hi(hookScore)) && (payoffScore == null || !lo(payoffScore))) label = "strong topic";
  else if (hi(topicScore) && lo(hookScore)) label = "strong subject but weak hook";
  else if (hi(hookScore) && lo(payoffScore)) label = "strong hook but weak payoff";
  else if (lo(topicScore) && (lo(hookScore) || lo(payoffScore))) label = "weak topic";
  else label = hi(hookScore) ? "strong hook but weak payoff" : "weak topic";
  const velocity = options.history ? velocityProfile(options.history) : null;
  return { label, topicScore: S.round(topicScore, 1), hookScore: hookScore == null ? null : S.round(hookScore, 1), payoffScore: payoffScore == null ? null : S.round(payoffScore, 1), subsPer1k: subsPer1k == null ? null : S.round(subsPer1k, 2), sharesPer1k: sharesPer1k == null ? null : S.round(sharesPer1k, 2), benchmarkBasis: bench.basis, velocity, provenance: "OBSERVED" };
}

// history: {h1,h6,h12,h24,h48,d7} cumulative views. Velocity = views per hour in each window.
function velocityProfile(h) {
  const pts = [["1h", 1, h.h1], ["6h", 6, h.h6], ["12h", 12, h.h12], ["24h", 24, h.h24], ["48h", 48, h.h48], ["7d", 168, h.d7]].filter(([, , v]) => v != null);
  const rates = []; let pt = 0, pv = 0;
  for (const [name, t, v] of pts) { rates.push({ window: name, viewsPerHour: S.round((v - pv) / (t - pt), 1) }); pt = t; pv = v; }
  const decaying = rates.length >= 3 && rates[rates.length - 1].viewsPerHour < rates[0].viewsPerHour * 0.1;
  const sustained = rates.length >= 4 && rates[rates.length - 1].viewsPerHour > rates[1].viewsPerHour * 0.35;
  return { rates, shape: sustained ? "sustained" : decaying ? "spike-and-decay" : "normal" };
}

// ---- Rolling aggregation with shrinkage --------------------------------------
// record: {id, format, valueScore (0-100 relative outcome), dims:{pillar,...}, observedRevenueUsd?}
function winsorize(values) { if (values.length < 4) return values; const m = T.median(values); const cap = Math.max(m * 3, m + 25); return values.map((v) => Math.min(v, cap)); }

function aggregate(records, dimension, options = {}) {
  const usable = records.filter((r) => r.valueScore != null && r.dims && r.dims[dimension] != null && (!options.format || r.format === options.format));
  if (!usable.length) return {};
  const all = winsorize(usable.map((r) => r.valueScore)); const globalMean = T.mean(all);
  const groups = {};
  usable.forEach((r, i) => { const k = r.dims[dimension]; (groups[k] = groups[k] || []).push(all[i]); });
  const out = {};
  for (const [k, vals] of Object.entries(groups)) {
    const n = vals.length; const shrunk = (vals.reduce((s, v) => s + v, 0) + globalMean * SHRINK_K) / (n + SHRINK_K);
    out[k] = { n, rawMean: S.round(T.mean(vals), 1), shrunkMean: S.round(shrunk, 1), lift: S.round(shrunk - globalMean, 1), evidence: n >= MIN_EVIDENCE ? "sufficient" : "insufficient", provenance: "OBSERVED" };
  }
  return out;
}

// Candidate selection: 75% exploit proven patterns, 25% explore (configurable). Deterministic with a seed.
function chooseExploreExploit(candidates, mem, options = {}) {
  const share = options.exploreShare != null ? options.exploreShare : 0.25;
  const r = rng(options.seed || "pd");
  const pillarAgg = aggregate(mem.records || [], "pillar");
  const lift = (c) => { const a = pillarAgg[c.pillar]; return a && a.evidence === "sufficient" ? a.lift : 0; };
  const proven = [...candidates].sort((a, b) => (b.rankScore + lift(b) * 0.4) - (a.rankScore + lift(a) * 0.4));
  const exploring = r() < share;
  if (!exploring) return { mode: "exploit", pick: proven[0], reason: "best rank score adjusted by rolling pillar evidence" };
  // Explore: highest-ranked candidate whose pillar/mechanism has little or no evidence.
  const novel = proven.find((c) => !(pillarAgg[c.pillar] && pillarAgg[c.pillar].evidence === "sufficient") || c.portfolioType === "EXPERIMENT");
  return { mode: "explore", pick: novel || proven[0], reason: novel ? "pillar/pattern with insufficient evidence" : "no under-explored candidate; falling back to exploit" };
}
// mulberry32 over a string hash: well mixed even for sequential seeds ("s1", "s2", ...).
function rng(seed) {
  let h = 1779033703 ^ String(seed).length; for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- Short -> long feedback -----------------------------------------------------
// Winning Shorts raise related long-form priority. Not blind conversion: the
// long topic must be long-suitable, not saturated, and the cluster must not
// already have a long-form in the cooldown window.
function shortToLongBoosts(shortRecords, topics, options = {}) {
  const cooldownDays = options.cooldownDays || 28; const now = options.now || Date.now();
  const byId = new Map(topics.map((t) => [t.id, t]));
  const recentLongClusters = new Set((options.recentLongs || []).filter((l) => now - Date.parse(l.publishedAt) < cooldownDays * 864e5).map((l) => l.cluster));
  const boosts = []; const skipped = [];
  for (const rec of shortRecords) {
    const c = rec.classification; if (!c || !["strong topic", "strong subject but weak hook"].includes(c.label)) continue;
    const src = byId.get(rec.topicId); if (!src) continue;
    const strength = c.label === "strong topic" ? 1 : 0.6;
    for (const t of topics) {
      if (t.id === src.id || !t.formats.long) continue;
      const sameCluster = t.cluster === src.cluster; const sameEntity = t.entity === src.entity;
      if (!sameCluster && !sameEntity) continue;
      if (recentLongClusters.has(t.cluster)) { skipped.push({ topicId: t.id, reason: "cluster long-form cooldown" }); continue; }
      const sat = options.saturationById && options.saturationById[t.id];
      if (sat === "SATURATED" || sat === "HOT") { skipped.push({ topicId: t.id, reason: "topic is " + sat }); continue; }
      const boost = S.round((sameEntity ? 10 : 5) * strength * Math.min(1, (c.topicScore - 45) / 25), 1);
      if (boost > 0) boosts.push({ topicId: t.id, fromShort: src.id, boost, basis: `${c.label} (topic ${c.topicScore})`, sameEntity });
    }
    // The Short's own topic is a direct long-form candidate if it is long-suitable.
    const srcSat = options.saturationById && options.saturationById[src.id];
    if (src.formats.long && !recentLongClusters.has(src.cluster) && srcSat !== "SATURATED" && srcSat !== "HOT") boosts.push({ topicId: src.id, fromShort: src.id, boost: S.round(14 * strength, 1), basis: `own Short ${c.label}`, direct: true });
  }
  const merged = {};
  for (const b of boosts) { const m = merged[b.topicId] || (merged[b.topicId] = { topicId: b.topicId, boost: 0, sources: [] }); m.boost = Math.min(18, m.boost + b.boost); m.sources.push(b); }
  return { boosts: Object.values(merged).sort((a, b) => b.boost - a.boost), skipped };
}

// ---- Retention-drop cause classification -------------------------------------
// curve: [{t, pct}] absolute retention; beats: [{start,end,type,visualRepeated,newInfo,narrationFlag,explanationSeconds,restatement,titleMismatch}]
function retentionCauses(curve, beats, options = {}) {
  const threshold = options.dropPerSecond || 0.9; // percentage points lost per second
  const drops = [];
  for (let i = 1; i < curve.length; i += 1) {
    const dt = curve[i].t - curve[i - 1].t; if (dt <= 0) continue;
    const rate = (curve[i - 1].pct - curve[i].pct) / dt;
    if (rate >= threshold) drops.push({ from: curve[i - 1].t, to: curve[i].t, ratePerSec: S.round(rate, 2) });
  }
  return drops.map((d) => {
    const mid = (d.from + d.to) / 2; const beat = beats.find((b) => mid >= b.start && mid < b.end) || {};
    const causes = [];
    if (d.from < 8 && beat.titleMismatch) causes.push("misleading packaging");
    else if (d.from < 15 && beat.type === "setup") causes.push("slow setup");
    if (beat.visualRepeated) causes.push("visual monotony");
    if (beat.visualIrrelevant) causes.push("irrelevant visual");
    if (beat.explanationSeconds > 22) causes.push("overlong explanation");
    if (beat.restatement) causes.push("repeated information");
    if (beat.confusingEconomics) causes.push("confusing economics");
    if (beat.narrationFlag) causes.push("narration issue");
    if (beat.transitionWeak) causes.push("weak transition");
    if (beat.payoffDelayed) causes.push("payoff delay");
    return { ...d, beatType: beat.type || null, causes: causes.length ? causes : ["unclassified (needs human review)"], provenance: causes.length ? "INFERRED" : "UNKNOWN" };
  });
}

// ---- Revenue-aware value -------------------------------------------------------
// Only OBSERVED revenue is used as revenue; otherwise the value stays a relative view-quality score.
function videoValue(rec) {
  if (rec.observed && rec.observed.revenueUsd != null && rec.observed.views > 0) {
    return { score: null, revenuePerThousandViews: S.round(rec.observed.revenueUsd / rec.observed.views * 1000, 2), watchHours: rec.observed.watchHours == null ? null : rec.observed.watchHours, subsPerThousand: rec.observed.subsGained == null ? null : S.round(rec.observed.subsGained / rec.observed.views * 1000, 2), provenance: "OBSERVED" };
  }
  return { score: null, provenance: "UNKNOWN", reason: "no observed revenue for this video: values stay relative, never invented" };
}

// ---- Persistence helpers ---------------------------------------------------------
function addRecord(record, file = MEMORY) {
  const mem = load(file); const i = mem.records.findIndex((r) => r.id === record.id);
  if (i >= 0) mem.records[i] = { ...mem.records[i], ...record }; else mem.records.push(record);
  save(mem, file); return mem;
}

module.exports = { MEMORY, DIMENSIONS, SHRINK_K, MIN_EVIDENCE, PROVISIONAL, benchmarks, classifyShort, velocityProfile, aggregate, chooseExploreExploit, shortToLongBoosts, retentionCauses, videoValue, load, save, addRecord, assertChannelPath };
