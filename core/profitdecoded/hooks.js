"use strict";
// Hook competition + first-30-second scoring (spec 11, 51, 54).
const T = require("./text");
const S = require("./signals");
const AI = require("./ai-patterns");

const MECHANISMS = ["contradiction", "question", "reveal", "number", "comparison", "visual mystery", "consumer pain", "hidden incentive", "financial paradox", "unexpected consequence"];
const BANNED_OPENERS = /^(have you ever|did you know|in today'?s|welcome back|what if i told you|hey guys|hi everyone|so,? )/i;

// Classify a hook line by the mechanism it actually uses (heuristic; the author may also tag it).
function classify(text) {
  const t = String(text);
  const scores = {
    contradiction: (/\b(but|yet|except|still|even though|despite)\b/i.test(t) ? 2 : 0) + (/\b(perfect|ideal|best) (customer|case)\b/i.test(t) ? 2 : 0) + (/\bmay be someone who\b/i.test(t) ? 1 : 0),
    question: /\?\s*$/.test(t.trim()) || /^(why|how|what|who)\b/i.test(t) ? 2 : 0,
    reveal: /\b(the real|actually|secret|turns out|the answer)\b/i.test(t) ? 2 : 0,
    number: (t.match(/\$?\d[\d,.]*\s?(%|percent|million|billion|cents|dollars)?/g) || []).length >= 1 ? 2 : 0,
    comparison: /\b(more than|less than|cheaper than|costs? more|than a|versus|vs\.?)\b/i.test(t) ? 2 : 0,
    "visual mystery": /\b(look at|this (receipt|menu|price|sign|label|tag)|notice|see the)\b/i.test(t) ? 2 : 0,
    "consumer pain": /\b(you pay|your (money|bill|card)|you('re| are) (charged|paying)|can'?t cancel|you forgot)\b/i.test(t) ? 2 : 0,
    "hidden incentive": /\b(wants? you to|profits? (when|if|from)|makes? money (when|if)|designed (around|to)|on purpose)\b/i.test(t) ? 2 : 0,
    "financial paradox": /\b(loses? money|lose money|loss|free|pays? you|less is more|empty)\b/i.test(t) ? 2 : 0,
    "unexpected consequence": /\b(which means|so (that|every)|the result|ends up|as a result|that'?s why)\b/i.test(t) ? 1 : 0,
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { mechanism: ranked[0][1] > 0 ? ranked[0][0] : "reveal", scores };
}

// Information-gap + specificity scoring of one hook (0-100). Heuristic and inspectable.
function scoreHook(text, ctx = {}) {
  const t = String(text).trim();
  const w = T.words(t).length;
  const notes = []; let score = 50;
  if (BANNED_OPENERS.test(t)) { score -= 40; notes.push("banned generic opener"); }
  if (w < 8) { score -= 8; notes.push("too short to carry an information gap"); }
  if (w > 40) { score -= 14; notes.push("too long to land in the first seconds"); }
  const specific = (t.match(/\b\d[\d,.]*\b|\b[A-Z][a-zA-Z']+(?: [A-Z][a-zA-Z']+)*\b/g) || []).length - 1;
  if (specific >= 2) { score += 12; notes.push("concrete names/numbers"); } else if (specific === 0) { score -= 6; notes.push("no concrete name or number"); }
  const c = classify(t);
  if (["contradiction", "financial paradox", "hidden incentive"].includes(c.mechanism)) { score += 14; notes.push("opens an unresolved tension (" + c.mechanism + ")"); }
  else if (["number", "comparison"].includes(c.mechanism)) score += 8;
  else if (c.mechanism === "question") { score += 2; }
  if (/\b(you|your)\b/i.test(t)) score += 4;
  // The gap must not be answered inside the hook itself.
  if (ctx.answer && T.wordSetSimilarity(t, ctx.answer) > 0.6) { score -= 12; notes.push("hook already gives away the payoff"); }
  const ai = AI.analyze(t);
  if (ai.aiPatternScore >= 25) { score -= 14; notes.push("AI-pattern phrasing"); }
  if (ctx.topicWords && !T.contentWords(t).some((x) => ctx.topicWords.includes(x))) { score -= 10; notes.push("does not name the topic's subject"); }
  return { score: S.clamp(Math.round(score)), mechanism: c.mechanism, notes };
}

// Hooks must differ in MECHANISM, not wording. Returns the winner or a failure.
function compete(candidates, ctx = {}) {
  const scored = candidates.map((c) => {
    const text = typeof c === "string" ? c : c.text;
    const s = scoreHook(text, ctx);
    // the author's tag (when valid) wins over the heuristic label: spread the score first, then set the mechanism
    return { ...s, text, mechanism: (c && c.mechanism && MECHANISMS.includes(c.mechanism)) ? c.mechanism : s.mechanism };
  }).sort((a, b) => b.score - a.score);
  const mechs = new Set(scored.map((c) => c.mechanism));
  const paraphrase = [];
  for (let i = 0; i < scored.length; i += 1) for (let j = i + 1; j < scored.length; j += 1) if (T.wordSetSimilarity(scored[i].text, scored[j].text) > 0.55) paraphrase.push([i, j]);
  const problems = [];
  if (scored.length < 5) problems.push(`only ${scored.length} hook candidates (need >=5)`);
  if (mechs.size < 4) problems.push(`only ${mechs.size} distinct hook mechanisms (need >=4)`);
  if (paraphrase.length) problems.push(`${paraphrase.length} candidate pair(s) are paraphrases of each other`);
  return { winner: scored[0] || null, ranked: scored, distinctMechanisms: mechs.size, problems, valid: problems.length === 0 };
}

// ---- First 30 seconds (spec 54). `segments` are narration beats with start/end seconds. ----
function first30(script, ctx = {}) {
  const beats = Array.isArray(script) ? script : T.sentences(script).map((s, i, a) => ({ text: s }));
  // Allocate time by word count at ~2.6 wps if explicit timings are absent.
  let t = 0; const timed = beats.map((b) => { const d = b.end != null ? b.end - b.start : T.words(b.text).length / 2.6; const o = { text: b.text, start: b.start != null ? b.start : t, end: b.start != null ? b.end : t + d }; t = o.end; return o; });
  const win = (a, b) => timed.filter((x) => x.start < b && x.end > a).map((x) => x.text).join(" ");
  const w05 = win(0, 5), w515 = win(5, 15), w1530 = win(15, 30);
  const notes = []; const parts = {};
  // 0-5s: unresolved gap, names the subject, no throat-clearing.
  const h = scoreHook(timed.length ? timed[0].text + (timed[1] && timed[0].end < 5 ? " " + timed[1].text : "") : "", ctx);
  parts.hook = h.score; if (h.notes.length) notes.push("0-5s: " + h.notes.join("; "));
  // 5-15s: validates the click -> the title's subject must be explicitly addressed with a concrete fact.
  const titleWords = T.contentWords(ctx.title || "");
  const overlap515 = titleWords.length ? titleWords.filter((x) => T.contentWords(w05 + " " + w515).includes(x)).length / titleWords.length : 0.5;
  const concrete515 = (w515.match(/\b\d[\d,.]*\b|\b[A-Z][a-z]+\b/g) || []).length;
  parts.validate = S.clamp(35 + overlap515 * 40 + Math.min(25, concrete515 * 5));
  if (overlap515 < 0.4) notes.push("5-15s: does not clearly validate the title's promise");
  // 15-30s: forward momentum -> first piece of value delivered, no background lecture.
  const bg = /\b(founded in|was founded|history of|back in \d{4}|began in|started in)\b/i.test(w1530);
  const firstValue = /\b(because|which means|so the|that is why|here is how|the reason)\b/i.test(w1530 + " " + w515);
  parts.momentum = S.clamp(45 + (firstValue ? 25 : 0) + (bg ? -22 : 10) + Math.min(20, (w1530.match(/\b\d[\d,.]*\b/g) || []).length * 6));
  if (bg) notes.push("15-30s: spends the window on background/history instead of value");
  if (!firstValue) notes.push("15-30s: no explicit mechanism/value statement yet");
  const ai = AI.analyze(timed.map((x) => x.text).join(" "));
  const aiPenalty = Math.max(0, ai.aiPatternScore - 20) * 0.5;
  const score = S.clamp(Math.round(0.4 * parts.hook + 0.3 * parts.validate + 0.3 * parts.momentum - aiPenalty));
  return { score, parts, notes, windows: { "0-5": w05, "5-15": w515, "15-30": w1530 }, aiPatternScore: ai.aiPatternScore };
}

// ---- Hook engineering (Phase 3): six editorial dimensions + a factual-accuracy gate ----------------
// Every dimension is a heuristic reading of the text (ESTIMATED). Factual accuracy is a GATE, not a score
// to trade off: a hook whose numbers are not in the verified dossier, or that makes an absolute/superlative
// claim the dossier does not make, can never win.
const VISUAL_NOUNS = /\b(card|cards|receipt|register|drawer|wallet|coin|coins|penny|ticket|price tag|tag|label|shelf|aisle|screen|app|bill|balance|cup|counter|box|bucket|map|chart|filing|statement|ledger)\b/i;
const ABSOLUTES = /\b(always|never|everyone|everybody|nobody|no one|all of|every single|guaranteed|the only|the biggest|the largest|the most|the best|the worst|secretly)\b/i;
const JARGON = /\b(breakage|deferred revenue|liabilit(y|ies)|escheat\w*|asc 606|recogni[sz]ed revenue|stored value)\b/i;

function numbersIn(text) { return (String(text).match(/\$?\d[\d,.]*\d|\$?\d/g) || []).map((n) => n.replace(/^\$/, "").replace(/[,.]+$/, "")).filter((n) => n.length > 1 || /\d/.test(n)); }
function dossierNumbers(dossier) {
  const all = ((dossier && dossier.claims) || []).concat((dossier && dossier.inferences) || []);
  return new Set(all.flatMap((c) => numbersIn((c.text || "") + " " + (c.numbers || []).join(" "))));
}

function evaluateHook(text, ctx = {}) {
  const t = String(text || "").trim(); const w = T.words(t).length; const base = scoreHook(t, ctx);
  const sents = T.sentences(t).length || 1;
  const others = (ctx.others || []).filter((o) => o !== t);
  const dims = {};
  // Curiosity: the existing information-gap score.
  dims.curiosity = base.score;
  // Clarity: lands in one breath, at most two sentences, no unexplained jargon.
  dims.clarity = S.clamp(90 - Math.max(0, w - 28) * 3 - Math.max(0, 10 - w) * 4 - (sents > 2 ? 15 : 0) - (JARGON.test(t) ? 18 : 0) - (/[;()]/.test(t) ? 10 : 0));
  // Originality: not a banned/stock opener, not a crowded title template, not a paraphrase of a sibling candidate.
  const AI = require("./ai-patterns");
  const sib = others.length ? Math.max(...others.map((o) => T.wordSetSimilarity(t, o))) : 0;
  dims.originality = S.clamp(85 - (BANNED_OPENERS.test(t) ? 50 : 0) - Math.round(sib * 40) - (AI.analyze(t).aiPatternScore >= 20 ? 20 : 0) - (/\b(makes? money|not what you think|here'?s why)\b/i.test(t) ? 15 : 0));
  // Tension: does it set two things against each other, or name a winner and a loser?
  const TS = require("./topic-scoring");
  dims.tension = TS.narrativeConflict(t, { contradiction: "CD", "financial paradox": "PL", "hidden incentive": "CF", "consumer pain": "CF" }[base.mechanism] || "FH").value;
  // Visual potential: a concrete object or number a viewer can see on screen.
  dims.visual = S.clamp(40 + (VISUAL_NOUNS.test(t) ? 30 : 0) + (numbersIn(t).length ? 15 : 0) + (/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/.test(t.slice(1)) ? 10 : 0));
  // Factual accuracy (gate): every number must be in the dossier; absolutes must be backed by the dossier's own wording.
  const known = dossierNumbers(ctx.dossier);
  const orphan = ctx.dossier ? numbersIn(t).filter((n) => !known.has(n) && !/^(19|20)\d\d$/.test(n)) : [];
  const dossierText = ctx.dossier ? ((ctx.dossier.claims || []).map((c) => c.text).join(" ") + " " + (ctx.dossier.thesis || "")) : "";
  const absolute = (t.match(ABSOLUTES) || [])[0];
  const absoluteUnbacked = absolute && !new RegExp("\\b" + absolute.replace(/\s+/g, "\\s+") + "\\b", "i").test(dossierText);
  const factual = { pass: !orphan.length && !absoluteUnbacked, problems: [...orphan.map((n) => `number "${n}" is not in the verified dossier`), ...(absoluteUnbacked ? [`absolute/superlative "${absolute}" is not supported by the dossier`] : [])] };
  dims.factual = factual.pass ? 100 : 0;
  const W = { curiosity: 0.28, clarity: 0.18, originality: 0.16, tension: 0.18, visual: 0.12, factual: 0.08 };
  const total = Math.round(Object.entries(W).reduce((sum, [k, wt]) => sum + wt * dims[k], 0));
  return { text: t, mechanism: base.mechanism, total, dims, factual, notes: base.notes, provenance: "ESTIMATED" };
}

// Rank >=5 candidates on the six dimensions; the winner is the best FACTUAL hook. Mechanism diversity is still required.
function engineer(candidates, ctx = {}) {
  const texts = candidates.map((c) => (typeof c === "string" ? c : c.text));
  const rows = candidates.map((c, i) => {
    const e = evaluateHook(texts[i], { ...ctx, others: texts });
    const tagged = typeof c === "object" && c.mechanism && MECHANISMS.includes(c.mechanism) ? c.mechanism : null;
    return { ...e, mechanism: tagged || e.mechanism };
  }).sort((a, b) => b.total - a.total);
  const problems = [];
  if (rows.length < 5) problems.push(`only ${rows.length} hook candidates (need >=5)`);
  const mechs = new Set(rows.map((r) => r.mechanism));
  if (mechs.size < 4) problems.push(`only ${mechs.size} distinct hook mechanisms (need >=4)`);
  const factual = rows.filter((r) => r.factual.pass);
  if (!factual.length) problems.push("no candidate passes the factual-accuracy gate");
  const winner = factual[0] || null;
  if (winner && winner.total < 65) problems.push(`best factual hook scores ${winner.total} (<65)`);
  return { winner, ranked: rows, distinctMechanisms: mechs.size, problems, valid: problems.length === 0, note: "heuristic editorial scores; they rank candidates, they do not predict audience retention" };
}

module.exports = { MECHANISMS, classify, scoreHook, compete, first30, BANNED_OPENERS, evaluateHook, engineer };
