"use strict";
// Thumbnail candidate scoring (spec 22, 53). Scores concepts, not pixels:
// mobile readability, one dominant object, visual contradiction, and ONE
// combined curiosity gap with the title (complementary, not repeating).
const T = require("./text");
const S = require("./signals");

// candidate: {id, dominantObject, brandLogo:bool, text, elementCount, face:bool, contradiction:string|null, composition, contrast:'high'|'medium'|'low', numberShown:string|null, claims:[truthful claim texts]}
function scoreCandidate(c, ctx = {}) {
  const notes = []; let score = 40;
  const words = T.words(c.text || "").length;
  if (c.elementCount <= 3) score += 14; else if (c.elementCount > 5) { score -= 14; notes.push("too many elements for a phone screen"); }
  if (words <= 4) score += 10; else { score -= (words - 4) * 5; notes.push(`${words} words of text (prefer <=4)`); }
  if (!c.text) { score += 4; notes.push("no text: relies on image + title"); }
  if (c.dominantObject) score += 12; else { score -= 12; notes.push("no single dominant object"); }
  if (c.contradiction) score += 14; else notes.push("no visual contradiction/economic tension");
  if (c.contrast === "high") score += 6; else if (c.contrast === "low") score -= 8;
  if (c.brandLogo) score += 3;
  // Combined gap: thumbnail text must not simply repeat the title.
  const overlap = ctx.title && c.text ? T.wordSetSimilarity(c.text, ctx.title) : 0;
  if (overlap > 0.5) { score -= 16; notes.push("repeats the title instead of adding to the curiosity gap"); }
  else if (c.text) score += 6;
  // Truthfulness: any number or claim on the thumbnail must trace to the dossier.
  let misleading = false;
  if (c.numberShown && ctx.supportedNumbers && !ctx.supportedNumbers.map(String).includes(String(c.numberShown))) { misleading = true; notes.push(`number "${c.numberShown}" is not supported by the research dossier`); }
  if (/\b(scam|fraud|illegal|exposed|lawsuit)\b/i.test(c.text || "") && !(ctx.allowedAccusations || []).length) { misleading = true; notes.push("accusatory word without a sourced basis"); }
  const banned = /(dollar sign|pile of cash|rocket|crypto|candlestick)/i.test([c.dominantObject, c.contradiction, c.composition].join(" "));
  if (banned) { score -= 18; notes.push("uses a banned finance cliché"); }
  return { id: c.id, score: S.clamp(Math.round(score)), composition: c.composition, misleading, notes };
}

function rank(candidates, ctx = {}, history = []) {
  const ranked = candidates.map((c) => ({ ...scoreCandidate(c, ctx), candidate: c })).sort((a, b) => b.score - a.score);
  const problems = [];
  if (ranked.length < 3) problems.push(`only ${ranked.length} thumbnail candidates (need >=3 for testing)`);
  const best = ranked.find((r) => !r.misleading) || null;
  if (best && history.length >= 3 && history.slice(-3).every((h) => h === best.composition)) problems.push(`composition "${best.composition}" repeats the last 3 thumbnails`);
  return { selected: best ? { id: best.id, score: best.score, composition: best.composition, misleading: false } : null, ranked, problems, score: best ? best.score : 0, misleading: !best };
}

module.exports = { scoreCandidate, rank };
