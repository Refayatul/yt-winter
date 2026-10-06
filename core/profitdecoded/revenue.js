"use strict";
// Revenue Opportunity, Value Per View, Expected Business Value (spec 45-48).
//
// No CPM/RPM is ever invented. Relative categories (VERY LOW..VERY HIGH) are
// derived from documented drivers and always carry provenance ESTIMATED until
// observed channel revenue exists, at which point observedValuePerView()
// supersedes the assumptions.
//
// EBV formula (documented, configurable in decision-weights.json):
//   EBV = exp( sum_i w_i * ln(max(f_i, floor)) / sum_i w_i )
// i.e. a weighted geometric mean over 7 factors (each 0..100) with a floor so
// a single noisy/low estimate drags the score down but cannot zero it. The
// result is then shrunk toward the neutral midpoint in proportion to how much
// of the input is UNKNOWN (low confidence cannot look like a high score).

const S = require("./signals");
const { weights } = require("./config");
const TS = require("./topic-scoring");

const LABELS = ["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"];
function label(v) { return LABELS[Math.min(4, Math.max(0, Math.floor(v / 20)))]; }

function sponsorFit(topic) {
  // Sponsor attractiveness: consumer-finance/software/travel brands buy into explainer audiences; gambling/scams do not.
  const c = topic.cluster;
  const high = ["tech-platforms", "payments-fintech", "banks-cards", "subscriptions", "travel-hotels", "online-shopping", "education"];
  const low = ["casinos-gambling", "scams", "healthcare-pharma"];
  return S.estimated(high.includes(c) ? 78 : low.includes(c) ? 30 : 58, "relative sponsor/affiliate category fit by subject cluster");
}

function subscriberQuality(topic) {
  // Topics with repeatable lessons (pricing/models) build returning viewers more than one-off scandals.
  const g = { "hidden-business-models": 78, "pricing-psychology": 74, "strange-economics": 70, "company-stories": 66, "money-traps": 62 }[topic.pillar] || 60;
  return S.estimated(g, "relative returning-viewer potential by pillar (no audience data yet)");
}

function revenueOpportunity(topic, ctx = {}) {
  const sg = topic.signals;
  const ad = S.valueOr(sg.advertiserFit);
  const longform = S.valueOr(sg.longformPotential);
  const evergreen = S.valueOr(sg.evergreen);
  const us = ctx.usAudience != null ? ctx.usAudience : S.estimated(topic.cluster === "healthcare-pharma" || topic.cluster === "banks-cards" || topic.cluster === "insurance-warranties" ? 85 : 72, "US-centric consumer subjects");
  const brandSafety = 100 - (topic.copyrightRisk ? S.valueOr(topic.copyrightRisk, 40) * 0.4 : 12);
  const sponsor = sponsorFit(topic);
  const cost = 100 - S.valueOr(sg.productionFeasibility, 50); // higher complexity -> lower net opportunity
  const composite = 0.24 * ad + 0.22 * longform + 0.18 * evergreen + 0.12 * us.value + 0.10 * sponsor.value + 0.08 * brandSafety + 0.06 * (100 - cost);
  const inputs = { advertiserFit: sg.advertiserFit, longformPotential: sg.longformPotential, evergreen: sg.evergreen, usAudience: us, sponsorFit: sponsor };
  const known = Object.values(inputs).filter(S.isKnown).length;
  return { score: S.estimated(S.round(composite, 1), "weighted relative drivers; NOT a revenue forecast"), category: label(composite), provenance: "ESTIMATED", inputs, knownInputs: known, note: "relative category only; replaced by observed value-per-view when channel revenue data exists" };
}

// Value per view: what a view is worth RELATIVE to an average view on the channel.
function valueScore(topic, ctx = {}) {
  const ro = revenueOpportunity(topic, ctx);
  const sub = subscriberQuality(topic);
  const sg = topic.signals;
  const v = 0.34 * ro.score.value + 0.22 * S.valueOr(sg.longformPotential) + 0.18 * S.valueOr(sg.evergreen) + 0.16 * sub.value + 0.10 * sponsorFit(topic).value;
  return { score: S.estimated(S.round(v, 1), "estimated relative value per view"), category: label(v), provenance: "ESTIMATED", revenueOpportunity: ro, subscriberQuality: sub };
}

// Replace assumptions with observed data when present: { revenueUsd, views, longformViews, watchHours, subsGained }.
function observedValuePerView(rows) {
  const usable = (rows || []).filter((r) => r && Number(r.views) > 0 && r.revenueUsd != null);
  if (usable.length < 5) return { status: "UNKNOWN", reason: `needs >=5 videos with revenue (has ${usable.length})` };
  const rpm = usable.map((r) => r.revenueUsd / r.views * 1000);
  return { status: "OBSERVED", videos: usable.length, medianRpmUsd: Math.round(rpm.sort((a, b) => a - b)[Math.floor(rpm.length / 2)] * 100) / 100, provenance: "OBSERVED" };
}

function expectedBusinessValue(topic, ctx = {}) {
  const w = (ctx.weights || weights()).ebv; const floor = (ctx.weights || weights()).ebvFloor;
  const sg = topic.signals;
  const ro = revenueOpportunity(topic, ctx);
  const demand = ctx.viralPotential || (S.isKnown(sg.shortsPotential) ? S.estimated(0.55 * sg.shortsPotential.value + 0.45 * sg.curiosityGap.value, "title/curiosity-based proxy; no demand evidence") : S.unknown("no data"));
  const factors = {
    viralPotential: demand,
    revenueOpportunity: ro.score,
    longformPotential: sg.longformPotential,
    evergreenValue: sg.evergreen,
    subscriberQuality: subscriberQuality(topic),
    sponsorFit: sponsorFit(topic),
    brandFit: ctx.brandFit || S.estimated(brandFit(topic), "pillar/mechanism fit with ProfitDecoded positioning"),
  };
  let num = 0, den = 0; const used = {};
  for (const [k, wt] of Object.entries(w)) {
    const v = Math.max(floor, S.valueOr(factors[k]));
    used[k] = S.round(v, 0); num += wt * Math.log(v); den += wt;
  }
  const geo = Math.exp(num / den);
  const conf = S.confidence(factors, w);
  // Shrink toward 50 by missing-evidence ratio so low-confidence rows cannot top the table on assumptions alone.
  const shrink = 0.35 * (1 - Math.min(1, conf / 0.6));
  const score = S.round(geo * (1 - shrink) + 50 * shrink, 1);
  return { score, geometricMean: S.round(geo, 1), confidence: S.round(conf, 2), shrinkApplied: S.round(shrink, 2), factors: used, provenance: "ESTIMATED", category: label(score) };
}

function brandFit(topic) {
  let v = 82;
  if (topic.cluster === "casinos-gambling") v -= 22;
  if (topic.cluster === "scams") v -= 14;
  if (topic.pillar === "money-traps") v -= 4;
  if (/crypto|trading|invest/i.test(topic.topic)) v -= 25;
  return S.clamp(v);
}

module.exports = { label, revenueOpportunity, valueScore, observedValuePerView, expectedBusinessValue, sponsorFit, subscriberQuality, brandFit };
