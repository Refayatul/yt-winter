"use strict";
// Title candidate generation scoring (spec 21, 52).
const T = require("./text");
const S = require("./signals");

const PATTERNS = [
  ["why-x-wants-you-to", /\bwants? you to\b/i], ["real-reason", /\breal reason\b/i], ["how-x-actually-makes-money", /\bhow .+ (actually |really )?makes? (its )?money\b/i],
  ["business-behind", /\bbusiness behind\b/i], ["strange-economics", /\bstrange economics\b/i], ["hidden-cost", /\bhidden cost\b/i],
  ["why-x-question", /^why\b/i], ["how-x", /^how\b/i], ["the-x-trick", /\btrick\b/i], ["statement", /./],
];
const pattern = (t) => (PATTERNS.find(([, re]) => re.test(t)) || ["statement"])[0];
const OVERCLAIM = /\b(secret|they don'?t want you to know|exposed|shocking|you won'?t believe|destroy(s|ed)? everything|nobody knows|banned)\b/i;

// ctx: {history:[titles], thesis, claims:[text], brand}
function scoreTitle(title, ctx = {}) {
  const t = String(title).trim(); const notes = [];
  const len = t.length;
  const mobile = len <= 52 ? 100 : len <= 62 ? 85 : len <= 70 ? 62 : 35;
  const familiar = ctx.brand && t.toLowerCase().includes(String(ctx.brand).toLowerCase()) ? 100 : (t.match(/\b[A-Z][a-zA-Z']+/g) || []).length >= 2 ? 80 : 55;
  let curiosity = 55;
  if (/^why\b/i.test(t) || /\bwhen you\b/i.test(t)) curiosity += 14;
  if (/\bon purpose|wants? you to|designed around|more money when|lose[s]? money|still works\b/i.test(t)) curiosity += 16;
  if (/\bhow .+ actually\b/i.test(t)) curiosity += 8;
  if (/\bunderstanding|economics of|explained$|overview\b/i.test(t)) { curiosity -= 22; notes.push("flat/academic phrasing"); }
  const surprise = /\b(more money when|lose|empty|destroy|trick|forgetting|get lost|stay home|barely)\b/i.test(t) ? 85 : 60;
  const tension = /\b(wants you|on purpose|forgetting|trap|lost|worse|hard to cancel|against you)\b/i.test(t) ? 88 : 58;
  const clarity = /^(why|how|the)\b/i.test(t) && len <= 70 ? 90 : 68;
  let truth = 92; let unsupportedPromise = false;
  if (OVERCLAIM.test(t)) { truth -= 45; notes.push("overclaiming/clickbait phrase"); }
  if (ctx.claims && ctx.claims.length) {
    // The title's promise must be carried by the research: >=2 of its content words (beyond the brand) must
    // appear together in a single sourced claim, inference or the thesis. Otherwise the promise is unsupported.
    const brandWords = new Set(T.contentWords(ctx.brand || ""));
    const tw = [...new Set(T.contentWords(t).filter((w) => !brandWords.has(w)))];
    const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
    const supported = ctx.claims.some((c) => { const cw = new Set(T.contentWords(c).map(stem)); return tw.filter((w) => cw.has(stem(w))).length >= Math.min(2, tw.length); });
    if (!supported) { truth -= 24; unsupportedPromise = true; notes.push("promise not carried by any single sourced claim/thesis"); }
  }
  const promise = /\b(why|how|reason)\b/i.test(t) ? 82 : 64;
  let diff = 85;
  const hist = ctx.history || [];
  const pat = pattern(t); const samePattern = hist.filter((h) => pattern(h) === pat).length;
  if (hist.length >= 4 && samePattern / hist.length > 0.4) { diff -= 28; notes.push(`structure "${pat}" already ${samePattern}/${hist.length} of recent titles`); }
  const maxSim = Math.max(0, ...hist.map((h) => T.wordSetSimilarity(t, h)));
  if (maxSim > 0.6) { diff -= 30; notes.push("near-duplicate of a previous title"); }
  const dims = { curiosity: S.clamp(curiosity), clarity, familiarity: familiar, surprise, emotionalTension: tension, mobileReadability: mobile, promiseStrength: promise, truthfulness: S.clamp(truth), differentiation: S.clamp(diff) };
  const w = { curiosity: 18, clarity: 12, familiarity: 8, surprise: 12, emotionalTension: 10, mobileReadability: 10, promiseStrength: 8, truthfulness: 14, differentiation: 8 };
  const total = Object.entries(w).reduce((s, [k, wt]) => s + wt * dims[k], 0) / Object.values(w).reduce((s, x) => s + x, 0);
  return { title: t, score: S.round(total, 1), dims, pattern: pat, notes, misleading: truth < 60 || unsupportedPromise };
}

function rankTitles(candidates, ctx = {}) {
  const unique = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  const ranked = unique.map((c) => scoreTitle(c, ctx)).sort((a, b) => b.score - a.score);
  const problems = [];
  if (ranked.length < 20) problems.push(`only ${ranked.length} title candidates (need >=20)`);
  return { selected: ranked.find((r) => !r.misleading) || null, ranked, problems, valid: problems.length === 0 };
}

module.exports = { scoreTitle, rankTitles, pattern };
