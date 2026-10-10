"use strict";
// Topic pool + 52-week editorial calendar. This module does NOT score topics: it consumes the decision engine's rows
// (Decision.rank) and the readiness classification (Eligibility.inventory), applies the channel's pool standards,
// balances the five content categories, and schedules. Rebuilt monthly by `profitdecoded.js calendar`.
// Every signal keeps its provenance: OBSERVED (collector snapshot, verified dossier) or ESTIMATED (curation heuristics).

const CATEGORIES = ["Hidden Economics of Everyday Life", "Consumer Brands & Business Stories", "Pricing Psychology & Hidden Fees", "Technology Business Models", "Business Failures & Comebacks"];
const TECH = new Set(["tech-platforms", "streaming-media", "payments-fintech", "gaming", "telecom", "delivery-food-apps", "gig-economy", "electronics-printers"]);
const FAILURE = /\b(fail\w*|collapse\w*|bankrupt\w*|lost|went (bust|broke|under)|died|decline\w*|downfall|crash\w*|comeback|rise and fall|killed|shut down|closed)\b/i;

function categoryOf(t) {
  if (FAILURE.test(t.topic)) return "Business Failures & Comebacks";
  if (TECH.has(t.cluster)) return "Technology Business Models";
  if (t.pillar === "pricing-psychology" || t.pillar === "money-traps") return "Pricing Psychology & Hidden Fees";
  // a named brand in the title (company stories, or a business-model topic about one familiar brand)
  if (t.pillar === "company-stories" || (/^[A-Z]/.test(t.entity || "") && !/\b(stores?|companies|brands|apps?|banks?|airlines|sites?|chains?)\b/i.test(t.entity || "") && new RegExp("\\b" + String(t.entity).split(/\s+/)[0].replace(/[^\w']/g, "") + "\\b").test(t.topic))) return "Consumer Brands & Business Stories";
  return "Hidden Economics of Everyday Life";
}

const L = (r, k) => (r.lens.dimensions[k] || {}).value;
const obsSaturated = (r) => ["SATURATED", "HOT"].includes(r.saturation) && r.saturationProvenance === "OBSERVED";
const evidenceOverride = (r, x) => x.flags.demandStrong && !obsSaturated(r);
const needsAngle = (r, x) => evidenceOverride(r, x) && (L(r, "angleOriginality") < 60 || L(r, "narrativeConflict") < 60);
// Pool standards (the channel's ten topic requirements, mapped to existing signals; thresholds are editorial choices).
const STANDARDS = {
  "not blocked (decision engine, freshness, duplicate)": (r, x) => x.tier !== "EXCLUDE",
  "8-12 minute potential (long-form potential >= 80)": (r, x, t) => !!t.formats.long && r.inputs.longformPotential.value >= 80,
  // Narrative conflict and angle originality are ESTIMATED from the title wording; a topic with observed demand >= 60
  // (not observed-saturated) may enter on that evidence, flagged ANGLE_REQUIRED (new angle + title before production).
  "storytelling potential (narrative conflict >= 60)": (r, x) => L(r, "narrativeConflict") >= 60 || evidenceOverride(r, x),
  "broad audience relevance (>= 70)": (r) => r.inputs.broadAppeal.value >= 70,
  "differentiated angle (angle originality >= 60)": (r, x) => L(r, "angleOriginality") >= 60 || evidenceOverride(r, x),
  "visual feasibility (>= 60) and copyright risk <= 60": (r, x, t) => r.inputs.visualPotential.value >= 60 && ((t.copyrightRisk || {}).value || 0) <= 60,
  "advertiser relevance (>= 60)": (r) => L(r, "advertiserRelevance") >= 60,
  "evergreen value (>= 55)": (r) => r.inputs.evergreenValue.value >= 55,
  "competitive opportunity (not observed HOT/SATURATED)": (r) => !(["SATURATED", "HOT"].includes(r.saturation) && r.saturationProvenance === "OBSERVED"),
  "US relevance and a central question": (r, x, t) => x.flags.usFocus && !!t.coreQuestion,
};

function evidenceClass(r, x) {
  if (x.tier === "EXCLUDE") return "BLOCKED";
  if (x.tier === "PRODUCTION_READY") return "VERIFIED";
  if (["SATURATED", "HOT"].includes(r.saturation) && r.saturationProvenance === "OBSERVED") return "SATURATED";
  return x.flags.demandObserved ? "RESEARCH_REQUIRED" : "DEMAND_UNVERIFIED";
}
// Transparent ranking: the decision engine's rank, plus evidence bonuses, minus an inferred-saturation penalty.
function poolScore(r, x) {
  return Math.round((r.rankScore + (x.tier === "PRODUCTION_READY" ? 15 : 0) + (x.flags.demandStrong ? 8 : x.flags.demandObserved ? 2 : 0) - (x.flags.oversaturated && r.saturationProvenance !== "OBSERVED" ? 5 : 0)) * 10) / 10;
}

const SEASONAL = [
  [/\b(gift cards?|black friday|cyber monday|holidays?|christmas|santa|returns? (policy|policies|fraud))\b/i, [11, 12], "holiday shopping"],
  [/\b(thanksgiving|turkey)\b/i, [11], "Thanksgiving"],
  [/\b(tax|irs|refund anticipation)\b/i, [2, 3, 4], "tax season"],
  [/\b(gyms?|resolutions?|diets?)\b/i, [1], "New Year resolutions"],
  [/\b(valentine|flower|roses?|chocolate)\b/i, [2], "Valentine's Day"],
  [/\b(super bowl|nfl)\b/i, [2], "Super Bowl"],
  [/\b(summer|vacations?|theme parks?|cruises?|sunscreen)\b/i, [6, 7, 8], "summer travel"],
  [/\b(back to school|textbook|college|tuition|student)\b/i, [8, 9], "back to school"],
  [/\b(halloween|cand(y|ies)|costumes?)\b/i, [10], "Halloween"],
  [/\b(prime day)\b/i, [7], "Prime Day"],
];
function seasonOf(t) { for (const [re, months, label] of SEASONAL) if (re.test(t.topic)) return { months, label }; return null; }

// Production difficulty from existing signals (the inventory's own field is "low" for every topic and carries no information).
function difficultyOf(r, t, x) {
  let s = 0; const cr = (t.copyrightRisk || {}).value || 0;
  s += cr > 45 ? 2 : cr > 30 ? 1 : 0;
  s += (r.penalties.factualRisk || 0) > 2 ? 2 : (r.penalties.factualRisk || 0) > 0.5 ? 1 : 0;
  s += (r.penalties.productionRisk || 0) > 1 ? 1 : 0;
  s += r.inputs.visualPotential.value < 70 ? 1 : 0;
  s += /\b(law|lawsuit|regulat\w*|fraud|scam\w*|fda|sec|ftc|patent|drug|insurance|pharma\w*|lender|loan|credit)\b/i.test(t.topic) ? 1 : 0;
  s += x.tier === "PRODUCTION_READY" ? -2 : 0;
  return s >= 4 ? "High" : s >= 2 ? "Medium" : "Low";
}
const genericTitle = (title) => /^how .+ makes? money\b/i.test(title) || /^why .+ (is|are) so (cheap|expensive)\b/i.test(title);

function buildPool({ rows, inv, topics, size = 104 }) {
  const byId = Object.fromEntries(topics.map((t) => [t.id, t])); const iv = Object.fromEntries(inv.topics.map((x) => [x.id, x]));
  const audit = Object.fromEntries(Object.keys(STANDARDS).map((k) => [k, 0]));
  const candidates = [];
  for (const r of rows) {
    const t = byId[r.id]; const x = iv[r.id]; let ok = true;
    for (const [k, f] of Object.entries(STANDARDS)) if (!f(r, x, t)) { if (ok) audit[k] += 1; ok = false; }
    if (!ok) continue;
    candidates.push({ id: r.id, topic: t.topic, workingTitle: r.workingTitle || t.topic, coreQuestion: t.coreQuestion, pillar: t.pillar, cluster: t.cluster, entity: t.entity || null, category: categoryOf(t), class: evidenceClass(r, x), score: poolScore(r, x), rankScore: r.rankScore,
      demand: x.flags.demandObserved ? { value: x.flags.demandValue, provenance: "OBSERVED" } : { value: null, provenance: "UNKNOWN" },
      saturation: { class: r.saturation, provenance: r.saturationProvenance }, freshness: r.freshness.status, evergreen: r.inputs.evergreenValue.value, season: seasonOf(t),
      difficulty: difficultyOf(r, t, x), genericTitle: genericTitle(r.workingTitle || t.topic), angleRequired: needsAngle(r, x) || genericTitle(r.workingTitle || t.topic), decision: r.decision });
  }
  candidates.sort((a, b) => b.score - a.score);
  // One subject per year: drop a lower-ranked candidate that repeats a kept one's subject (>= 50% of subject terms, three
  // shared subject terms, or the same named company when either is a company story or both share pillar and cluster).
  const Comp = require("./competitive"); const kept = []; const duplicates = [];
  for (const c of candidates) {
    const t = byId[c.id]; const terms = new Set(Comp.subjectTerms(t.topic)); const specific = /^[A-Z]/.test(t.entity || "") && !/s$/.test(t.entity || "");
    const dup = kept.find((k) => { const kt = byId[k.id]; const kterms = new Set(Comp.subjectTerms(kt.topic)); const shared = [...terms].filter((w) => kterms.has(w)).length; const jac = shared / Math.max(1, terms.size + kterms.size - shared);
      return jac >= 0.5 || shared >= 3 || (specific && kt.entity === t.entity && (t.pillar === "company-stories" || kt.pillar === "company-stories" || (t.pillar === kt.pillar && t.cluster === kt.cluster))); });
    if (dup) duplicates.push({ id: c.id, topic: c.topic, duplicateOf: dup.topic }); else kept.push(c);
  }
  candidates.length = 0; candidates.push(...kept);
  const take = Math.min(size, candidates.length); const half = Math.ceil(take / 2);
  // Primaries: balanced across categories (each at least floor(half/8), at most ceil(half*0.3)), at most 3 per cluster.
  const minPer = Math.floor(half / 8); const maxPer = Math.ceil(half * 0.3); const primary = []; const perCat = {}; const perCluster = {};
  const add = (c) => { primary.push(c); perCat[c.category] = (perCat[c.category] || 0) + 1; perCluster[c.cluster] = (perCluster[c.cluster] || 0) + 1; };
  for (const c of candidates.filter((x) => x.class === "VERIFIED")) add(c); // verified research always gets a primary slot
  // each category's minimum, filled in global score order (a category's best topic never loses its cluster slot to another's)
  for (const c of candidates) if (!primary.includes(c) && (perCat[c.category] || 0) < minPer && (perCluster[c.cluster] || 0) < 3) add(c);
  for (const c of candidates) { if (primary.length >= half) break; if (primary.includes(c) || (perCat[c.category] || 0) >= maxPer || (perCluster[c.cluster] || 0) >= 3) continue; add(c); }
  // a category that cannot supply its share does not leave weeks empty: relax the category cap, keep the cluster cap
  for (const c of candidates) { if (primary.length >= half) break; if (primary.includes(c) || (perCluster[c.cluster] || 0) >= 3) continue; add(c); }
  const rest = candidates.filter((c) => !primary.includes(c)).slice(0, take - primary.length);
  return { audit, duplicates, candidatesMeetingStandards: candidates.length, primary: primary.sort((a, b) => b.score - a.score), backup: rest, classes: candidates.reduce((m, c) => ({ ...m, [c.class]: (m[c.class] || 0) + 1 }), {}) };
}

// 52 weeks: evidence first in weeks 1-12, seasonal topics on their months, no category twice in a row, no cluster within 3 weeks,
// no subject entity (company, industry) within 8 weeks.
function schedule(pool, startIso, weeks = 52) {
  const start = Date.parse(startIso + "T00:00:00Z"); const weekStart = (i) => new Date(start + i * 7 * 864e5);
  const evidenceRank = { VERIFIED: 0, RESEARCH_REQUIRED: 1, DEMAND_UNVERIFIED: 2, SATURATED: 3 };
  const left = [...pool.primary]; const out = [];
  for (let i = 0; i < Math.min(weeks, pool.primary.length); i += 1) {
    const month = weekStart(i).getUTCMonth() + 1; const prev = out[i - 1]; const recentClusters = out.slice(-3).map((w) => w.primary.cluster); const recentEntities = out.slice(-8).map((w) => w.primary.entity).filter(Boolean);
    const fits = (c) => (!prev || c.category !== prev.primary.category) && !recentClusters.includes(c.cluster) && !recentEntities.includes(c.entity);
    const seasonalNow = left.filter((c) => c.season && c.season.months.includes(month) && fits(c));
    const offSeason = (c) => c.season && !c.season.months.includes(month) && left.some(() => true) && i < weeks - 8; // hold seasonal topics for their months
    const order = (a, b) => (i < 12 ? evidenceRank[a.class] - evidenceRank[b.class] : 0) || b.score - a.score;
    let pick = seasonalNow.sort(order)[0] || left.filter((c) => fits(c) && !offSeason(c)).sort(order)[0] || left.filter(fits).sort(order)[0] || left.sort(order)[0];
    left.splice(left.indexOf(pick), 1);
    out.push({ week: i + 1, weekOf: weekStart(i).toISOString().slice(0, 10), primary: pick, planning: i < 12 ? "detailed" : "provisional (reassess monthly)" });
  }
  // Backups: same category, different cluster where possible, each used once.
  const free = [...pool.backup];
  for (const w of out) {
    let b = free.find((c) => c.category === w.primary.category && c.cluster !== w.primary.cluster) || free.find((c) => c.category === w.primary.category) || free[0];
    if (b) { free.splice(free.indexOf(b), 1); w.backup = b; }
  }
  return out;
}

module.exports = { CATEGORIES, STANDARDS, categoryOf, evidenceClass, poolScore, seasonOf, difficultyOf, genericTitle, buildPool, schedule };
