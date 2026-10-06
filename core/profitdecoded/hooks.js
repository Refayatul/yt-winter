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
    return { text, mechanism: (c.mechanism && MECHANISMS.includes(c.mechanism)) ? c.mechanism : s.mechanism, ...s };
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

module.exports = { MECHANISMS, classify, scoreHook, compete, first30, BANNED_OPENERS };
