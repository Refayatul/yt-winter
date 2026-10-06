"use strict";
// Anti-slop similarity across recent ProfitDecoded videos and (optionally)
// competitor transcripts (spec 26-27). History lives in channel state only.

const T = require("./text");
const S = require("./signals");
const Titles = require("./titles");

const LIMITS = { script: 0.30, hook: 0.55, structureRun: 3, musicRecent: 4, thumbRun: 3, competitorScript: 0.22, titleStructureShare: 0.4 };

// entry: {id, title, script, hook, structure:[beat types], music, thumbnailComposition, transitions:[], format}
function compare(candidate, history, options = {}) {
  const lim = { ...LIMITS, ...(options.limits || {}) };
  const recent = (history || []).slice(-(options.window || 12));
  const rejections = []; const warnings = []; const detail = {};
  let maxScript = 0, maxWith = null, maxHook = 0;
  for (const h of recent) {
    const sim = T.textSimilarity(candidate.script || "", h.script || "", 4);
    if (sim > maxScript) { maxScript = sim; maxWith = h.id; }
    maxHook = Math.max(maxHook, T.wordSetSimilarity(candidate.hook || "", h.hook || ""));
  }
  detail.maxScriptSimilarity = S.round(maxScript, 2); detail.mostSimilarTo = maxWith; detail.maxHookSimilarity = S.round(maxHook, 2);
  if (maxScript >= lim.script) rejections.push(`script similarity to previous episode ${maxWith} = ${maxScript.toFixed(2)} >= ${lim.script}`);
  if (maxHook >= lim.hook) rejections.push(`hook repeats a recent hook (similarity ${maxHook.toFixed(2)})`);

  const sig = (x) => (x || []).join(">");
  const lastStruct = recent.slice(-lim.structureRun).map((h) => sig(h.structure));
  if (candidate.structure && lastStruct.length === lim.structureRun && lastStruct.every((s) => s === sig(candidate.structure))) rejections.push(`story structure identical to the last ${lim.structureRun} videos`);
  if (candidate.music && recent.slice(-lim.musicRecent).some((h) => h.music && h.music === candidate.music)) rejections.push(`music track "${candidate.music}" reused within the last ${lim.musicRecent} videos`);
  const lastThumbs = recent.slice(-lim.thumbRun).map((h) => h.thumbnailComposition);
  if (candidate.thumbnailComposition && lastThumbs.length === lim.thumbRun && lastThumbs.every((c) => c === candidate.thumbnailComposition)) rejections.push(`thumbnail composition "${candidate.thumbnailComposition}" used for the last ${lim.thumbRun} videos`);
  const titles = recent.map((h) => h.title).filter(Boolean);
  if (candidate.title && titles.length >= 4) {
    const pat = Titles.pattern(candidate.title); const share = titles.filter((t) => Titles.pattern(t) === pat).length / titles.length;
    detail.titlePatternShare = S.round(share, 2);
    if (share > lim.titleStructureShare) rejections.push(`title structure "${pat}" already ${Math.round(share * 100)}% of recent titles`);
  }
  if (candidate.transitions && recent.length) {
    const prev = new Set(recent.slice(-3).flatMap((h) => h.transitions || []));
    const cur = new Set(candidate.transitions);
    if (cur.size && prev.size && [...cur].every((x) => prev.has(x)) && cur.size <= 2) warnings.push("transition palette is a subset of the last three videos");
  }
  // Competitor similarity (only meaningful with transcripts).
  const comps = options.competitorTranscripts || [];
  if (comps.length) {
    let worst = 0, who = null;
    for (const c of comps) { const sim = T.textSimilarity(candidate.script || "", c.text || "", 4); if (sim > worst) { worst = sim; who = c.id || c.source; } }
    detail.maxCompetitorSimilarity = S.round(worst, 2); detail.competitorChecked = comps.length;
    if (worst >= lim.competitorScript) rejections.push(`script similarity to competitor ${who} = ${worst.toFixed(2)} >= ${lim.competitorScript}`);
  } else { detail.competitorChecked = 0; warnings.push("competitor-script similarity NOT checked (no transcripts supplied): originality is unverified"); }
  return { pass: rejections.length === 0, rejections, warnings, detail, competitorVerified: comps.length > 0 };
}

module.exports = { compare, LIMITS };
