"use strict";
// Final topic decision engine (spec 60-62): the winner is the topic with the
// highest EXPECTED BUSINESS VALUE among topics that clear evidence gates, not
// the one with the most potential views.

const S = require("./signals");
const { weights, thresholds } = require("./config");
const Rev = require("./revenue");
const Comp = require("./competitive");
const Port = require("./portfolio");
const TS = require("./topic-scoring");
const Fresh = require("./freshness");

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
  // Phase 2: editorial lens + freshness. options.intel is built once per run by rank(); a single
  // evaluate() call builds it on demand.
  const intel = options.intel || TS.buildIntelContext([], options.intelFiles);
  const freshness = Fresh.check(topic, intel.watchlist, { researchedAt: research && research.researchedAt, angle: intel.angles[topic.id] });
  const observedSat = breakout ? breakout.saturation : evidence.saturation || null;
  const lens = TS.editorialLens(topic, intel, { research, freshness, observedSaturation: observedSat });
  // Saturation: observed (API breakout / supplied) first, otherwise the manual coverage sample (INFERRED).
  const sat = observedSat || (lens.saturation.class !== "UNKNOWN" ? lens.saturation : null);
  const satClass = sat ? sat.class : "UNKNOWN";
  const satObserved = !!observedSat;
  const ro = Rev.revenueOpportunity(topic);
  const ebv = Rev.expectedBusinessValue(topic, options.ctx || {});
  const inputs = {
    demand: demandSig,
    outlierEvidence: outlierSig,
    broadAppeal: sg.broadAudience,
    curiosity: sg.curiosityGap,
    brandFit: S.estimated(Rev.brandFit(topic), "positioning fit"),
    // Without a competitor gap analysis the lens reads the title: generic templates score low, curated angles higher.
    originalAngle: gap.status === "UNKNOWN" ? lens.dimensions.angleOriginality : S.inferred(gap.reasonToExist ? 85 : 25, gap.reason),
    narrativeConflict: lens.dimensions.narrativeConflict,
    researchQuality: research ? S.observed(research.score, "research gate result") : S.unknown("no research dossier yet"),
    visualPotential: lens.dimensions.visualFeasibility,
    longformPotential: sg.longformPotential,
    revenueOpportunity: ro.score,
    evergreenValue: lens.dimensions.evergreenPotential,
    subscriberValue: Rev.subscriberQuality(topic),
  };
  let num = 0, den = 0;
  for (const [k, wt] of Object.entries(w.decision)) { num += wt * S.valueOr(inputs[k]); den += wt; }
  const composite = num / den;
  // A generic title alone must never discard a topic: for the REJECT gate, title-based originality is floored at the neutral UNKNOWN score.
  const titleOnlyLoss = gap.status === "UNKNOWN" ? Math.max(0, S.UNKNOWN_SCORE - S.valueOr(inputs.originalAngle)) * (w.decision.originalAngle || 0) / den : 0;
  const gateComposite = composite + titleOnlyLoss;
  const satPenalty = satClass === "UNKNOWN" ? 0 : w.decisionPenalties.saturation * Comp.SATURATION_PENALTY[satClass];
  const copyright = S.valueOr(topic.copyrightRisk, 40);
  // Unresearched means unverified: the prior (expected source availability) can never push factual risk below 40.
  let factualRisk = research ? Math.max(0, 100 - research.score) : Math.max(40, 100 - S.valueOr(sg.evidenceQuality, 40));
  if (freshness.needsResearch) factualRisk = Math.max(factualRisk, 80); // the known premise may no longer hold
  const productionRisk = 100 - S.valueOr(sg.productionFeasibility, 50);
  const penalties = {
    saturation: S.round(satPenalty, 1),
    copyrightRisk: S.round(w.decisionPenalties.copyrightRisk * copyright / 100, 1),
    factualRisk: S.round(w.decisionPenalties.factualRisk * factualRisk / 100, 1),
    productionRisk: S.round(w.decisionPenalties.productionRisk * productionRisk / 100, 1),
    genericTitle: S.round(lens.title.needsAngle ? (w.decisionPenalties.genericTitle || 0) * ({ SATURATED: 1, HOT: 0.5 }[lens.title.inventoryTemplateClass] || 0) : 0, 1),
  };
  const penaltyTotal = Object.values(penalties).reduce((s, x) => s + x, 0);
  const rankScore = S.round(0.55 * ebv.score + 0.45 * composite - penaltyTotal * 0.6, 1);
  const portfolioType = Port.classifyPortfolioType(topic, { breakout });

  const blockers = []; const notes = [];
  if (inputs.brandFit.value < 50) blockers.push(`brand fit ${inputs.brandFit.value} < 50`);
  if (copyright > 70) blockers.push(`copyright risk ${copyright} > 70`);
  // Only observed (API) saturation can block; a manual sample lowers the score but is not proof.
  if (satClass === "SATURATED" && satObserved && !gap.reasonToExist) blockers.push("SATURATED topic without a documented original angle");
  const min = thresholds().topicDecisionMinimum;
  const demandKnown = S.isKnown(demandSig) && demandSig.provenance === "OBSERVED";
  const longReady = demandKnown && demandSig.value >= 60 && gap.reasonToExist && research && research.pass && !["SATURATED", "HOT"].includes(satClass) && topic.formats.long;
  let decision;
  if (blockers.length || gateComposite < min) decision = "REJECT";
  else if (longReady) decision = "PRODUCE_LONG";
  else if (topic.formats.short && !research) decision = demandKnown ? "RESEARCH_FIRST" : "SHORT_TEST";
  else if (research && research.pass && topic.formats.short) decision = "PRODUCE_SHORT";
  else decision = "HOLD";
  // A premise known to be outdated or contradicted cannot be produced, not even as a Short probe.
  if (freshness.blocksProduction && ["PRODUCE_LONG", "PRODUCE_SHORT", "SHORT_TEST", "RESEARCH_FIRST"].includes(decision)) decision = "REFRESH_RESEARCH";
  if (freshness.needsResearch) notes.push("premise needs renewed research: " + freshness.note);
  if (lens.title.needsAngle) notes.push(`title uses the ${lens.title.inventoryTemplateClass} template "${lens.title.inventoryTemplate}" and has no curated narrative angle yet (topic kept; find a better angle)`);
  if (sat && !satObserved) notes.push(`saturation ${satClass} is INFERRED from a manual search sample (${sat.source})`);
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
    workingTitle: lens.title.workingTitle, angle: lens.title.angle ? { title: lens.title.angle.workingTitle, premiseStatus: lens.title.angle.premiseStatus } : null,
    titleTemplate: { template: lens.title.inventoryTemplate, class: lens.title.inventoryTemplateClass, needsAngle: lens.title.needsAngle },
    lens: { score: lens.score, confidence: lens.confidence, provenance: lens.provenance, dimensions: Object.fromEntries(Object.entries(lens.dimensions).map(([k, v]) => [k, { value: v.value == null ? null : S.round(v.value, 0), provenance: v.provenance }])) },
    freshness: { status: freshness.status, needsResearch: freshness.needsResearch, resolvedBy: freshness.resolvedBy, flags: freshness.flags.map((f) => ({ kind: f.kind, source: f.source, event: f.event, effectiveDate: f.effectiveDate || null, addressedBy: f.addressedBy })) },
    expectedBusinessValue: ebv, revenueOpportunity: { category: ro.category, provenance: "ESTIMATED" }, penalties, saturation: satClass, saturationProvenance: sat ? (satObserved ? "OBSERVED" : sat.provenance) : "UNKNOWN",
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { value: v.value == null ? null : S.round(v.value, 0), provenance: v.provenance }])),
    unknownInputs: Object.entries(inputs).filter(([, v]) => !S.isKnown(v)).map(([k]) => k), blockers, notes,
  };
}

function rank(topics, evidenceById = {}, options = {}) {
  const intel = options.intel || TS.buildIntelContext(topics, options.intelFiles);
  return topics.map((t) => evaluate(t, evidenceById[t.id] || {}, { ...options, intel })).sort((a, b) => b.rankScore - a.rankScore);
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
