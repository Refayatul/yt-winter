"use strict";
// Final topic decision engine (spec 60-62): the winner is the topic with the
// highest EXPECTED BUSINESS VALUE among topics that clear evidence gates, not
// the one with the most potential views.

const S = require("./signals");
const { weights, thresholds } = require("./config");
const Rev = require("./revenue");
const Comp = require("./competitive");
const Port = require("./portfolio");

function evaluate(topic, evidence = {}, options = {}) {
  const w = options.weights || weights();
  const sg = topic.signals;
  const breakout = evidence.breakout || null;
  const gap = evidence.gap || { status: "UNKNOWN", reasonToExist: false };
  const research = evidence.research || null; // result of Research.gate()
  const shortWinner = evidence.shortWinner || null; // from learning.classifyShort()

  const outlierSig = breakout && breakout.outlier && S.isKnown(breakout.outlier.score) ? breakout.outlier.score : S.unknown("no competitor outlier data for this topic");
  const demandSig = outlierSig.provenance === "OBSERVED"
    ? S.observed(S.clamp(0.6 * outlierSig.value + 0.4 * (shortWinner ? shortWinner.topicScore : outlierSig.value)), "derived from observed outlier evidence")
    : shortWinner ? S.observed(shortWinner.topicScore, "observed own-Short performance") : S.unknown("no demand evidence");
  const sat = breakout ? breakout.saturation : evidence.saturation || null;
  const satClass = sat ? sat.class : "UNKNOWN";
  const ro = Rev.revenueOpportunity(topic);
  const ebv = Rev.expectedBusinessValue(topic, options.ctx || {});
  const inputs = {
    demand: demandSig,
    outlierEvidence: outlierSig,
    broadAppeal: sg.broadAudience,
    curiosity: sg.curiosityGap,
    brandFit: S.estimated(Rev.brandFit(topic), "positioning fit"),
    originalAngle: gap.status === "UNKNOWN" ? S.unknown("no competitor gap analysis") : S.inferred(gap.reasonToExist ? 85 : 25, gap.reason),
    researchQuality: research ? S.observed(research.score, "research gate result") : S.unknown("no research dossier yet"),
    visualPotential: sg.visualAvailability,
    longformPotential: sg.longformPotential,
    revenueOpportunity: ro.score,
    evergreenValue: sg.evergreen,
    subscriberValue: Rev.subscriberQuality(topic),
  };
  let num = 0, den = 0;
  for (const [k, wt] of Object.entries(w.decision)) { num += wt * S.valueOr(inputs[k]); den += wt; }
  const composite = num / den;
  const satPenalty = satClass === "UNKNOWN" ? 0 : w.decisionPenalties.saturation * Comp.SATURATION_PENALTY[satClass];
  const copyright = S.valueOr(topic.copyrightRisk, 40);
  // Unresearched means unverified: the prior (expected source availability) can never push factual risk below 40.
  const factualRisk = research ? Math.max(0, 100 - research.score) : Math.max(40, 100 - S.valueOr(sg.evidenceQuality, 40));
  const productionRisk = 100 - S.valueOr(sg.productionFeasibility, 50);
  const penalties = {
    saturation: S.round(satPenalty, 1),
    copyrightRisk: S.round(w.decisionPenalties.copyrightRisk * copyright / 100, 1),
    factualRisk: S.round(w.decisionPenalties.factualRisk * factualRisk / 100, 1),
    productionRisk: S.round(w.decisionPenalties.productionRisk * productionRisk / 100, 1),
  };
  const penaltyTotal = Object.values(penalties).reduce((s, x) => s + x, 0);
  const rankScore = S.round(0.55 * ebv.score + 0.45 * composite - penaltyTotal * 0.6, 1);
  const portfolioType = Port.classifyPortfolioType(topic, { breakout });

  const blockers = []; const notes = [];
  if (inputs.brandFit.value < 50) blockers.push(`brand fit ${inputs.brandFit.value} < 50`);
  if (copyright > 70) blockers.push(`copyright risk ${copyright} > 70`);
  if (satClass === "SATURATED" && !gap.reasonToExist) blockers.push("SATURATED topic without a documented original angle");
  const min = thresholds().topicDecisionMinimum;
  const demandKnown = S.isKnown(demandSig) && demandSig.provenance === "OBSERVED";
  const longReady = demandKnown && demandSig.value >= 60 && gap.reasonToExist && research && research.pass && !["SATURATED", "HOT"].includes(satClass) && topic.formats.long;
  let decision;
  if (blockers.length || composite < min) decision = "REJECT";
  else if (longReady) decision = "PRODUCE_LONG";
  else if (topic.formats.short && !research) decision = demandKnown ? "RESEARCH_FIRST" : "SHORT_TEST";
  else if (research && research.pass && topic.formats.short) decision = "PRODUCE_SHORT";
  else decision = "HOLD";
  if (decision === "SHORT_TEST") notes.push("demand UNKNOWN: eligible only as a cheap Short probe; long-form needs observed demand evidence or a winning Short");
  if (!longReady && topic.formats.long) {
    const miss = [];
    if (!demandKnown) miss.push("observed demand/outlier evidence"); else if (demandSig.value < 60) miss.push("stronger demand");
    if (!gap.reasonToExist) miss.push("documented original angle");
    if (!research || !research.pass) miss.push("research gate PASS");
    if (["SATURATED", "HOT"].includes(satClass)) miss.push("topic is " + satClass);
    if (miss.length) notes.push("long-form blocked until: " + miss.join(", "));
  }
  return {
    id: topic.id, topic: topic.topic, pillar: topic.pillar, portfolioType, decision, rankScore, composite: S.round(composite, 1),
    expectedBusinessValue: ebv, revenueOpportunity: { category: ro.category, provenance: "ESTIMATED" }, penalties, saturation: satClass,
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { value: v.value == null ? null : S.round(v.value, 0), provenance: v.provenance }])),
    unknownInputs: Object.entries(inputs).filter(([, v]) => !S.isKnown(v)).map(([k]) => k), blockers, notes,
  };
}

function rank(topics, evidenceById = {}, options = {}) {
  return topics.map((t) => evaluate(t, evidenceById[t.id] || {}, options)).sort((a, b) => b.rankScore - a.rankScore);
}

// Balance the shortlist across portfolio types and pillars so the table is not 20 near-identical topics.
function selectDiverse(rows, count, options = {}) {
  const picked = []; const perPillar = {}; const perCluster = {};
  const cap = options.maxPerPillar || Math.ceil(count * 0.4);
  const topicById = options.topicById || {};
  for (const r of rows) {
    if (picked.length >= count) break;
    if (r.decision === "REJECT") continue;
    const cluster = (topicById[r.id] || {}).cluster;
    if ((perPillar[r.pillar] || 0) >= cap) continue;
    if (cluster && (perCluster[cluster] || 0) >= 2) continue;
    picked.push(r); perPillar[r.pillar] = (perPillar[r.pillar] || 0) + 1; if (cluster) perCluster[cluster] = (perCluster[cluster] || 0) + 1;
  }
  return picked;
}

module.exports = { evaluate, rank, selectDiverse };
