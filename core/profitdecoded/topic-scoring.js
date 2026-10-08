"use strict";
// ProfitDecoded topic scoring (spec sections 6, 60).
// Prefers: FAMILIAR THING + SURPRISING MECHANISM + MONEY + CURIOSITY.
// Every dimension is a provenance-tagged signal. Unknown dimensions score
// pessimistically and lower the reported confidence; they are never hidden.

const S = require("./signals");
const { weights } = require("./config");

const DIMENSIONS = Object.keys(require("./config").DEFAULT_WEIGHTS.topic);

// ---- Title potential (text heuristic; ESTIMATED) -------------------------
const STRONG_FORMS = [
  [/^why .+ (more|less|so|when|instead|never|always|on purpose|wants? you|don'?t|doesn'?t|prefer|lose|loses)\b/i, 14],
  [/\bon purpose\b/i, 10], [/\bwants? you to\b/i, 12], [/\bwhen you\b/i, 6],
  [/\bdesigned around\b/i, 10], [/\bactually\b/i, 4], [/\breally\b/i, 3],
  [/\b(trick|trap|secret|hidden|real reason)\b/i, 5], [/\bwithout\b/i, 5],
  [/\b(lose|loses|losing) money\b/i, 8], [/\b(destroy|destroys)\b/i, 8],
];
const WEAK_FORMS = [/\bunderstanding\b/i, /\boverview\b/i, /\bintroduction\b/i, /\beconomics of\b/i, /\bexplained\b$/i, /\ba (deep )?dive\b/i];

function titlePotential(title) {
  const t = String(title || "").trim();
  let score = 52;
  if (/^(why|how)\b/i.test(t)) score += 10;
  for (const [re, pts] of STRONG_FORMS) if (re.test(t)) score += pts;
  for (const re of WEAK_FORMS) if (re.test(t)) score -= 18;
  if (t.length > 72) score -= 10; else if (t.length <= 56) score += 6;
  if (/\bHow .+ Makes? Money\b/i.test(t) && !/\bwithout|more than|from\b/i.test(t)) score -= 4; // flat, template-prone
  return S.clamp(score);
}

// ---- Static priors keyed by cluster/pillar (ESTIMATED, documented) --------
const CLUSTER_AUDIENCE = { "grocery-retail": 95, "fast-food": 95, "online-shopping": 92, "streaming-media": 90, "airlines": 88, "tech-platforms": 88, "banks-cards": 80, "subscriptions": 90, "coffee-beverages": 88, "autos": 82, "travel-hotels": 82, "entertainment-venues": 85, "gyms-fitness": 82, "delivery-food-apps": 82, "gaming": 78, "telecom": 75, "luxury-fashion": 75, "scams": 85, "insurance-warranties": 70, "payments-fintech": 72, "healthcare-pharma": 78, "furniture-home": 78, "events-tickets": 80, "casinos-gambling": 72, "housing-realestate": 78, "education": 72, "beauty": 74, "pets": 72, "gig-economy": 72, "electronics-printers": 82 };
// Advertiser attractiveness (relative; NOT a CPM). Gambling/scam/health-claim
// topics are limited-ads risks; consumer finance/tech/business are strongest.
const CLUSTER_ADVERTISER = { "casinos-gambling": 30, "scams": 45, "healthcare-pharma": 55, "banks-cards": 80, "payments-fintech": 80, "tech-platforms": 82, "insurance-warranties": 82, "subscriptions": 78, "airlines": 78, "travel-hotels": 78, "autos": 80, "housing-realestate": 78, "education": 74 };
const PILLAR_BASE = {
  "hidden-business-models": { money: 80, evergreen: 76, longform: 78, insight: 80 },
  "pricing-psychology": { money: 74, evergreen: 86, longform: 68, insight: 74 },
  "money-traps": { money: 86, evergreen: 70, longform: 70, insight: 70 },
  "strange-economics": { money: 70, evergreen: 68, longform: 76, insight: 84 },
  "company-stories": { money: 66, evergreen: 62, longform: 90, insight: 72 },
};
const MECH_INSIGHT = { PL: 12, CH: 12, CD: 10, FH: 12, FC: 8, HP: 8, CF: 8, CB: 6, FP: 8, NA: 6 };
const STRICT_IP = new Set(["Disney", "Disney Parks", "Disney Plus", "Pokémon", "Sanrio", "LEGO", "NFL", "NFL stadiums", "NCAA", "MLB", "Nike", "Stanley", "Supreme", "Louis Vuitton", "Hermès", "Rolex", "Ferrari", "Harley-Davidson", "Peloton", "Crocs", "Sotheby's"]);

function copyrightRisk(topic) {
  // Footage/logo risk estimate. Not legal advice; the visual plan checks real asset licences.
  if (STRICT_IP.has(topic.entity)) return S.estimated(55, "entity has aggressive brand/IP enforcement; use filings, own graphics, licensed stills");
  if (topic.cluster === "scams") return S.estimated(15, "scam subjects use original diagrams; low IP exposure");
  return S.estimated(30, "default consumer-brand exposure; avoid unlicensed ad/film footage");
}

function deriveSignals(seed) {
  const F = seed.attrs.familiarity, Su = seed.attrs.surprise, E = seed.attrs.evidence, V = seed.attrs.visual;
  const base = PILLAR_BASE[seed.pillar];
  const tp = titlePotential(seed.title);
  const BY = "curation-heuristic-v1 (hand-rated 1-5 attributes + documented priors)";
  const est = (v) => S.estimated(S.clamp(Math.round(v)), BY);
  const audience = CLUSTER_AUDIENCE[seed.cluster] || 75;
  const money = base.money + (seed.cluster === "banks-cards" || seed.cluster === "subscriptions" ? 6 : 0);
  const curiosity = 0.45 * (Su * 20) + 0.35 * tp + 0.2 * (F * 20);
  const businessInsight = base.insight + (MECH_INSIGHT[seed.mech] || 6) - 10;
  const shortLen = seed.title.length <= 60 ? 8 : 0;
  const signals = {
    broadAudience: est(0.55 * audience + 0.45 * (F * 20)),
    curiosityGap: est(curiosity),
    surprise: est(Su * 20),
    familiarBrand: est(F * 20),
    businessInsight: est(businessInsight),
    moneyRelevance: est(money),
    evergreen: est(base.evergreen + (seed.cluster === "tech-platforms" ? -8 : 0) + (seed.cluster === "scams" ? -4 : 0)),
    freshness: S.unknown("no news/trend feed connected; set by the Breakout Topic Feed when real data exists"),
    evidenceQuality: est(E * 20),
    visualAvailability: est(V * 20),
    titlePotential: est(tp),
    thumbnailPotential: est(0.5 * (F * 20) + 0.3 * (V * 20) + 0.2 * (Su * 20)),
    shortsPotential: est(50 + (Su - 3) * 9 + (F - 3) * 6 + shortLen + (seed.mech === "CB" ? 6 : 0)),
    longformPotential: est(base.longform + (E - 3) * 5 + (V - 3) * 3 + (seed.pillar === "pricing-psychology" && seed.mech === "CB" ? -6 : 0)),
    advertiserFit: S.estimated(CLUSTER_ADVERTISER[seed.cluster] || 72, "relative advertiser-friendliness by subject cluster (NOT a CPM)"),
    competitionOpenness: S.unknown("needs live YouTube competitor/saturation data (Competitive Intelligence Engine)"),
    novelty: S.unknown("filled by inventory dedupe (own channel) and competitor coverage once available"),
    productionFeasibility: est(40 + E * 8 + V * 8 + (copyrightRisk(seed).value > 45 ? -8 : 0)),
  };
  return signals;
}

// 0..100 composite of the four ProfitDecoded levers, geometric so that one weak lever hurts.
function coreFormula(signals) {
  const lever = (k) => Math.max(1, S.valueOr(signals[k], S.UNKNOWN_SCORE));
  const money = lever("moneyRelevance"), fam = lever("familiarBrand"), sur = lever("surprise"), cur = lever("curiosityGap");
  return Math.pow(money * fam * sur * cur, 1 / 4);
}

function scoreTopic(signals, overrideWeights) {
  const w = overrideWeights || weights().topic;
  let total = 0, wsum = 0;
  const parts = {}; const unknowns = [];
  for (const dim of DIMENSIONS) {
    const sg = signals[dim];
    if (!S.isKnown(sg)) unknowns.push(dim);
    const v = S.valueOr(sg);
    parts[dim] = S.round(v, 0);
    total += (w[dim] || 0) * v; wsum += w[dim] || 0;
  }
  const weighted = total / wsum;
  const core = coreFormula(signals);
  const score = S.round(0.7 * weighted + 0.3 * core, 1);
  return {
    score, weightedScore: S.round(weighted, 1), coreFormula: S.round(core, 1), parts, unknownDimensions: unknowns,
    confidence: S.round(S.confidence(signals, w), 2), provenance: S.provenanceMix(signals),
  };
}

// ---- Editorial lens (Phase 2) ------------------------------------------------
// Eight dimensions an editor would check before commissioning a documentary. Each is a
// provenance-tagged signal; most reuse existing signals, three are new (narrative conflict,
// competitive saturation, angle originality). Curated data comes from config.intelFiles().

const LENS_DIMENSIONS = ["audienceCuriosity", "competitiveSaturation", "narrativeConflict", "evergreenPotential", "advertiserRelevance", "visualFeasibility", "sourceReliability", "angleOriginality"];

// Narrative conflict: does the title promise a tension (a loss, a contradiction, a winner and a loser)?
// Base by viral mechanism; title markers add to it. ESTIMATED, a reading of the title only.
const MECH_CONFLICT = { CD: 70, PL: 70, CF: 66, HP: 62, CH: 62, FP: 60, CB: 58, FH: 55, NA: 55, FC: 50 };
const CONFLICT_MARKERS = [
  [/\b(lose|loses|losing|lost|fail(ed|s)?|collaps\w*|bankrupt\w*|stopped|ended|killed|disappear\w*|ran out|gave up)\b/i, 16],
  [/\bwho (pays|keeps|wins|loses|profits)\b/i, 14],
  [/\b(but|yet|instead|without|despite|even when|more than|less than|cheaper than)\b/i, 12],
  [/\b(barely|never|nobody|no one|can'?t|won'?t|refuses?|doesn'?t|don'?t|isn'?t|not)\b/i, 10],
  [/\?|\. \S/, 6],
];
function narrativeConflict(title, mech) {
  let v = MECH_CONFLICT[mech] || 55; let add = 0;
  for (const [re, pts] of CONFLICT_MARKERS) if (re.test(title)) add += pts;
  v += Math.min(30, add);
  return S.estimated(S.clamp(v), "title/mechanism conflict heuristic (reads the working title only)");
}

// Index curated data once per ranking run.
function buildIntelContext(inventory, files) {
  const Comp = require("./competitive");
  const f = files || require("./config").intelFiles();
  const angles = {}; for (const a of (f.angles && f.angles.angles) || []) angles[a.topicId] = a;
  const coverage = {}; const templates = {};
  for (const file of f.coverage || []) {
    for (const e of file.entries || []) for (const id of e.topicIds || []) coverage[id] = e;
    for (const [name, t] of Object.entries(file.titleTemplates || {})) templates[name] = t;
  }
  // Within-inventory repetition (INFERRED): how many of our own titles share each template.
  const share = {}; const n = (inventory || []).length || 1;
  for (const t of inventory || []) { const k = Comp.titleStructure(t.topic); share[k] = (share[k] || 0) + 1 / n; }
  return { angles, coverage, templates, templateShare: share, watchlist: f.watchlist || { entries: [] } };
}

function titleInfo(topic, ctx) {
  const Comp = require("./competitive");
  const angle = ctx.angles[topic.id] || null;
  const working = angle ? angle.workingTitle : topic.topic;
  const template = Comp.titleStructure(working);
  const tpl = ctx.templates[template] || null;
  const inventoryTemplate = Comp.titleStructure(topic.topic);
  const invTpl = ctx.templates[inventoryTemplate] || null;
  // A topic "needs an angle" when its inventory title uses an oversaturated template and nobody has written a better one yet.
  const needsAngle = !angle && !!invTpl && ["SATURATED", "HOT"].includes(invTpl.class);
  return { inventoryTitle: topic.topic, workingTitle: working, angle, template, templateClass: tpl ? tpl.class : null, inventoryTemplate, inventoryTemplateClass: invTpl ? invTpl.class : null, inventoryTemplateShare: S.round(ctx.templateShare[inventoryTemplate] || 0, 2), needsAngle };
}

// research: Research.gate() result or null; freshness: freshness.check() result; observedSaturation: competitive.saturation() result from API data.
function editorialLens(topic, ctx, extra = {}) {
  const Comp = require("./competitive");
  const sg = topic.signals; const v = (k, d) => S.valueOr(sg[k], d);
  const title = titleInfo(topic, ctx);
  const fresh = extra.freshness || { status: "CURRENT_UNVERIFIED", severity: 0, needsResearch: false };
  const research = extra.research || null;
  const angle = title.angle;

  // Competitive saturation: OBSERVED (API) > INFERRED (manual sample) > UNKNOWN. 100 = open field.
  let sat = extra.observedSaturation && extra.observedSaturation.class ? { ...extra.observedSaturation, provenance: "OBSERVED" } : null;
  if (!sat && ctx.coverage[topic.id]) sat = Comp.coverageSaturation(ctx.coverage[topic.id]);
  const competitiveSaturation = sat && sat.class !== "UNKNOWN"
    ? S.sig(S.round(100 * (1 - Comp.SATURATION_PENALTY[sat.class]), 0), sat.provenance, `${sat.class}: ${(sat.reasons || []).join("; ")}`)
    : S.unknown("no competitor coverage data (needs PD_YT_API_KEY collector run or a manual coverage observation)");

  // Angle originality: generic templates score low, curated angles higher, observed same-angle hits lower.
  let orig = angle ? ({ VERIFIED: 80, SUPPORTED_SECONDARY: 75 }[angle.premiseStatus] || 70) : 60;
  const tplPenalty = { SATURATED: 30, HOT: 15, GROWING: 5 }[title.templateClass] || 0;
  let titleLoss = tplPenalty; // the part of the loss that comes only from the title's wording
  orig -= tplPenalty;
  // Our own inventory repeating a crowded template (plain "Why ...?" / "How ...?" questions are not templates).
  if (!angle && title.inventoryTemplateClass && title.inventoryTemplateShare > 0.2) { orig -= 10; titleLoss += 10; }
  let origProv = "ESTIMATED"; const origWhy = [angle ? `curated angle (${angle.premiseStatus})` : "inventory title", title.templateClass ? `template ${title.template} is ${title.templateClass}` : `template ${title.template}`];
  if (sat && sat.provenance !== "UNKNOWN" && ["HOT", "SATURATED"].includes(sat.class)) { orig -= sat.class === "SATURATED" ? 20 : 10; origProv = sat.provenance === "OBSERVED" ? "INFERRED" : sat.provenance; origWhy.push(`angle coverage ${sat.class}`); }
  const angleOriginality = S.sig(S.clamp(orig), origProv, origWhy.join("; "));
  // Same signal with the wording penalties removed: used where a title must not decide the outcome (REJECT gate).
  const angleOriginalityTitleNeutral = S.sig(S.clamp(orig + titleLoss), origProv, "title-neutral: " + origWhy.join("; "));

  // Source reliability: research result (OBSERVED) > verified angle premise (INFERRED) > evidence prior capped for unresearched topics.
  let sourceReliability;
  if (research) sourceReliability = S.observed(research.score, "research gate result");
  else if (angle && angle.premiseStatus === "VERIFIED") sourceReliability = S.inferred(70, "angle premise checked against primary sources; full dossier still needed");
  else if (angle && angle.premiseStatus === "SUPPORTED_SECONDARY") sourceReliability = S.inferred(60, "angle premise supported by secondary sources only");
  else sourceReliability = S.estimated(Math.min(70, v("evidenceQuality", 40)), "expected source availability (prior), capped while unresearched");
  if (fresh.needsResearch) sourceReliability = S.sig(Math.min(40, sourceReliability.value), sourceReliability.provenance, sourceReliability.source + "; capped: premise needs renewed research (" + fresh.status + ")");

  const evergreenDrop = { TIME_SENSITIVE: 8, CHANGED_CONTEXT: 12, OUTDATED_PREMISE: 20, PREMISE_CONTRADICTED: 20 }[fresh.status] || 0;
  const dims = {
    audienceCuriosity: sg.curiosityGap,
    competitiveSaturation,
    narrativeConflict: narrativeConflict(title.workingTitle, topic.viralMechanismCode),
    evergreenPotential: S.estimated(S.clamp(v("evergreen") - evergreenDrop), evergreenDrop ? `evergreen prior minus ${evergreenDrop} (freshness ${fresh.status})` : "evergreen prior"),
    advertiserRelevance: sg.advertiserFit,
    visualFeasibility: S.estimated(S.clamp(0.5 * v("visualAvailability") + 0.5 * v("productionFeasibility") - (S.valueOr(topic.copyrightRisk, 30) > 45 ? 10 : 0)), "visual availability + production feasibility, minus IP-risk"),
    sourceReliability,
    angleOriginality,
  };
  const w = require("./config").weights().lens;
  let num = 0, den = 0; for (const k of LENS_DIMENSIONS) { num += (w[k] || 0) * S.valueOr(dims[k]); den += w[k] || 0; }
  return {
    score: S.round(num / den, 1), confidence: S.round(S.confidence(dims, w), 2), provenance: S.provenanceMix(dims),
    dimensions: dims, angleOriginalityTitleNeutral, title, saturation: sat || { class: "UNKNOWN", provenance: "UNKNOWN" }, freshness: fresh,
  };
}

module.exports = { DIMENSIONS, titlePotential, deriveSignals, copyrightRisk, coreFormula, scoreTopic, CLUSTER_ADVERTISER, CLUSTER_AUDIENCE, PILLAR_BASE, LENS_DIMENSIONS, narrativeConflict, buildIntelContext, titleInfo, editorialLens };
