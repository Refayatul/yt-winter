"use strict";
// AI-writing-pattern detector for narration scripts (spec 12, 26, 56).
// Returns aiPatternScore 0-100 (higher = more generic/AI-sounding) and a
// naturalness score (100 - penalties). Deterministic and inspectable: every
// penalty is listed with its evidence so a rewrite can target it.

const T = require("./text");
const S = require("./signals");

const PHRASES = [
  [/\bbut here'?s (the )?(twist|thing|catch|kicker)\b/gi, 10, "stock twist transition"],
  [/\bbut that'?s not all\b/gi, 10, "stock escalation"],
  [/\bhere'?s where (things|it) get(s)? interesting\b/gi, 10, "stock suspense"],
  [/\b(have you ever wondered|did you know|in today'?s video|welcome back|before we (dive|begin|get started)|let'?s dive in|buckle up|stay tuned|without further ado)\b/gi, 14, "banned generic opener/filler"],
  [/\bit'?s (important|worth) (to )?(note|noting|remember)\b/gi, 6, "filler hedge"],
  [/\b(in (the )?(ever-?changing|fast-?paced) (world|landscape)|in today'?s (digital )?(age|world)|at the end of the day|when it comes to)\b/gi, 8, "generic framing"],
  [/\b(game-?changer|revolutioni[sz]e|unlock the (power|secret)|delve|tapestry|testament to|navigate the (complex|landscape)|rich tapestry|plays? a (crucial|pivotal|vital) role|stands as)\b/gi, 7, "AI-flavoured vocabulary"],
  [/\b(shocking|mind-?blowing|jaw-?dropping|insane|unbelievable|incredible|staggering)\b/gi, 4, "unearned dramatic adjective"],
  [/\bthe (truth|reality) (is|might surprise you)\b/gi, 5, "fake reveal"],
  [/\b(you won'?t believe|what (they|nobody) (don'?t|doesn'?t) want you to know|they don'?t want you to know)\b/gi, 12, "clickbait phrasing"],
  [/\bin (conclusion|summary)\b/gi, 8, "essay conclusion"],
  [/\b(remember|always remember)[:,]? (that )?/gi, 3, "motivational filler"],
  [/\b(think about it|let that sink in|read that again)\b/gi, 8, "engagement bait"],
  [/\bnot (just|only) [^.?!]{3,60}, but (also )?[^.?!]{3,60}/gi, 3, "not-just-but template"],
  [/\bit'?s not (about|just) [^.?!]{3,60}[.;,] it'?s (about )?[^.?!]{3,60}/gi, 6, "it's-not-X-it's-Y template"],
];
const SENTENCE_STARTERS_BAD = new Set(["but", "and", "so", "now", "then", "here", "this", "that", "it", "and"]);

function analyze(script, options = {}) {
  const text = String(script || "");
  const sents = T.sentences(text);
  const wc = T.words(text).length || 1;
  const findings = [];
  let penalty = 0;
  for (const [re, pts, name] of PHRASES) {
    const hits = text.match(re) || [];
    if (hits.length) { const p = Math.min(pts * hits.length, pts * 3); penalty += p; findings.push({ type: "phrase", name, count: hits.length, penalty: p, example: hits[0].slice(0, 60) }); }
  }
  // Em dashes.
  const dashes = (text.match(/—|–| -- /g) || []).length;
  const dashRate = dashes / (wc / 100);
  if (dashRate > 0.8) { const p = Math.min(14, (dashRate - 0.8) * 5); penalty += p; findings.push({ type: "punctuation", name: "excess em dashes", count: dashes, penalty: S.round(p, 1) }); }
  // Rhetorical questions.
  const qs = sents.filter((s) => s.endsWith("?")).length;
  const qRate = qs / Math.max(1, sents.length);
  if (qRate > 0.12) { const p = Math.min(14, (qRate - 0.12) * 60); penalty += p; findings.push({ type: "rhetoric", name: "excess rhetorical questions", count: qs, penalty: S.round(p, 1) }); }
  // Sentence length variation (burstiness). Human documentary writing mixes short and long.
  const lens = sents.map((s) => T.words(s).length);
  const lenCv = T.cv(lens);
  if (sents.length >= 8 && lenCv < 0.42) { const p = Math.min(18, (0.42 - lenCv) * 60); penalty += p; findings.push({ type: "rhythm", name: "uniform sentence length", detail: `CV ${lenCv.toFixed(2)} < 0.42`, penalty: S.round(p, 1) }); }
  // Repetitive sentence openers.
  const starts = sents.map((s) => T.words(s).slice(0, 2).join(" "));
  const startCounts = {}; for (const s of starts) startCounts[s] = (startCounts[s] || 0) + 1;
  const repeated = Object.entries(startCounts).filter(([k, c]) => c >= 3 && k).sort((a, b) => b[1] - a[1]);
  for (const [k, c] of repeated.slice(0, 3)) { const p = Math.min(10, (c - 2) * 3); penalty += p; findings.push({ type: "repetition", name: "repeated sentence opener", example: k, count: c, penalty: p }); }
  const conjOpeners = sents.filter((s) => SENTENCE_STARTERS_BAD.has(T.words(s)[0])).length / Math.max(1, sents.length);
  if (conjOpeners > 0.4) { const p = Math.min(8, (conjOpeners - 0.4) * 30); penalty += p; findings.push({ type: "rhythm", name: "too many but/and/so/this openers", penalty: S.round(p, 1) }); }
  // Tricolons ("a, b, and c").
  const tri = (text.match(/\b[\w'-]+(?: [\w'-]+)?, [\w'-]+(?: [\w'-]+)?,? (and|or) [\w'-]+/gi) || []).length;
  const triRate = tri / Math.max(1, sents.length);
  if (triRate > 0.18) { const p = Math.min(10, (triRate - 0.18) * 40); penalty += p; findings.push({ type: "rhetoric", name: "constant three-item lists", count: tri, penalty: S.round(p, 1) }); }
  // Repeated transitions across the script.
  const transitions = (text.match(/\b(however|moreover|furthermore|additionally|meanwhile|consequently|ultimately)\b/gi) || []).length;
  if (transitions / Math.max(1, sents.length) > 0.08) { const p = 6; penalty += p; findings.push({ type: "transitions", name: "formal transition overuse", count: transitions, penalty: p }); }
  // Repeated conclusions: last sentence restating the first.
  if (sents.length >= 6) {
    const sim = T.wordSetSimilarity(sents[0], sents[sents.length - 1]);
    if (sim > 0.45) { penalty += 10; findings.push({ type: "structure", name: "conclusion repeats the introduction", similarity: S.round(sim, 2), penalty: 10 }); }
  }
  // Near-duplicate sentences inside the script.
  let dup = 0;
  for (let i = 0; i < sents.length; i += 1) for (let j = i + 1; j < sents.length; j += 1) if (T.words(sents[i]).length > 5 && T.textSimilarity(sents[i], sents[j], 2) > 0.7) dup += 1;
  if (dup) { const p = Math.min(12, dup * 4); penalty += p; findings.push({ type: "repetition", name: "near-duplicate sentences", count: dup, penalty: p }); }
  // Concreteness: numbers/proper nouns signal specificity; their absence is a generic-writing signal.
  const specifics = (text.match(/\b\d[\d,.]*\b|\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g) || []).length - sents.length; // discount sentence-initial capitals
  const spec100 = specifics / (wc / 100);
  if (wc > 80 && spec100 < 3) { const p = Math.min(10, (3 - spec100) * 3); penalty += p; findings.push({ type: "specificity", name: "few concrete names/numbers", detail: `${spec100.toFixed(1)} per 100 words`, penalty: S.round(p, 1) }); }

  const aiPatternScore = S.clamp(Math.round(penalty * 1.6));
  return {
    aiPatternScore, naturalness: 100 - aiPatternScore, findings, stats: { sentences: sents.length, words: wc, sentenceLengthCv: S.round(lenCv, 2), questionRate: S.round(qRate, 2), emDashesPer100Words: S.round(dashRate, 2) },
    verdict: aiPatternScore >= (options.rewriteAbove || 35) ? "REWRITE" : "OK",
  };
}

module.exports = { analyze, PHRASES };
