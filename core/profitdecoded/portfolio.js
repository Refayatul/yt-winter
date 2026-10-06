"use strict";
// Topic portfolio strategy + topic clusters (spec 48-49).
const S = require("./signals");
const { channelConfig } = require("./config");

const TYPES = ["REACH", "REVENUE", "EVERGREEN", "AUTHORITY", "TREND", "EXPERIMENT"];

function classifyPortfolioType(topic, ctx = {}) {
  const sg = topic.signals; const v = (k) => S.valueOr(sg[k]);
  if (ctx.breakout && ctx.breakout.saturation && ["EARLY", "GROWING"].includes(ctx.breakout.saturation.class) && (ctx.breakout.outlier && ctx.breakout.ageDays <= 45)) return "TREND";
  const scores = {
    REACH: 0.5 * v("broadAudience") + 0.3 * v("shortsPotential") + 0.2 * v("curiosityGap"),
    REVENUE: 0.4 * v("advertiserFit") + 0.35 * v("longformPotential") + 0.25 * v("moneyRelevance"),
    EVERGREEN: 0.6 * v("evergreen") + 0.4 * v("titlePotential"),
    AUTHORITY: 0.5 * v("businessInsight") + 0.3 * v("evidenceQuality") + 0.2 * v("longformPotential"),
    EXPERIMENT: 0.6 * (100 - v("familiarBrand")) + 0.4 * v("surprise"),
  };
  if (topic.pillar === "company-stories" || topic.pillar === "strange-economics") scores.AUTHORITY += 8;
  if (topic.pillar === "pricing-psychology") scores.EVERGREEN += 8;
  if (topic.pillar === "hidden-business-models") scores.REVENUE += 5;
  if (topic.pillar === "money-traps") scores.REACH += 6;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// Pick the portfolio type most under-represented vs target, using recently published types.
function allocationDeficits(recentTypes, target) {
  const goal = target || (channelConfig() || {}).portfolioAllocation || { reach: 0.3, revenue: 0.25, evergreen: 0.2, authority: 0.1, trend: 0.1, experiment: 0.05 };
  const n = Math.max(1, recentTypes.length);
  const out = {};
  for (const t of TYPES) out[t] = S.round((goal[t.toLowerCase()] || 0) - recentTypes.filter((x) => x === t).length / n, 3);
  return out;
}

// Topic clusters: Shorts feed a long-form; follow-ups chain. Built from the inventory's cluster field.
function buildClusters(topics) {
  const byCluster = new Map();
  for (const t of topics) { if (!byCluster.has(t.cluster)) byCluster.set(t.cluster, []); byCluster.get(t.cluster).push(t); }
  const clusters = [];
  for (const [cluster, items] of byCluster) {
    if (items.length < 3) continue;
    const sorted = [...items].sort((a, b) => b.score.score - a.score.score);
    const flagship = sorted.find((t) => t.formats.long) || sorted[0];
    const shorts = sorted.filter((t) => t.id !== flagship.id && t.formats.short).slice(0, 8);
    const followUps = sorted.filter((t) => t.id !== flagship.id && t.formats.long && !shorts.includes(t)).slice(0, 3);
    clusters.push({ cluster, size: items.length, flagshipLong: flagship.id, supportingShorts: shorts.map((t) => t.id), followUpLong: followUps.map((t) => t.id), sharedResearchEntities: [...new Set(items.map((t) => t.entity))].slice(0, 12) });
  }
  return clusters.sort((a, b) => b.size - a.size);
}

module.exports = { TYPES, classifyPortfolioType, allocationDeficits, buildClusters };
