"use strict";
// Small shared text utilities (no dependencies).

const STOP = new Set("a an and are as at be but by for from has have he her his i in is it its of on or our she that the their them they this to was we were what when where which who why will with you your not no so if than then there these those how do does did can could would should".split(" "));

function words(text) { return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$%'.\s-]/g, " ").split(/\s+/).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, "")).filter(Boolean); }
function contentWords(text) { return words(text).filter((w) => !STOP.has(w) && w.length > 2); }
function sentences(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [clean];
  return parts.map((s) => s.trim()).filter((s) => s.length > 1);
}
function shingles(text, n = 3) {
  const w = words(text); const set = new Set();
  for (let i = 0; i + n <= w.length; i += 1) set.add(w.slice(i, i + n).join(" "));
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
function textSimilarity(a, b, n = 3) { return jaccard(shingles(a, n), shingles(b, n)); }
function wordSetSimilarity(a, b) { return jaccard(new Set(contentWords(a)), new Set(contentWords(b))); }
function mean(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function stdev(xs) { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); }
function cv(xs) { const m = mean(xs); return m ? stdev(xs) / m : 0; }
function median(xs) { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
function slugify(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90); }
function normalizeTitle(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$]+/g, " ").trim(); }

module.exports = { words, contentWords, sentences, shingles, jaccard, textSimilarity, wordSetSimilarity, mean, stdev, cv, median, slugify, normalizeTitle, STOP };
