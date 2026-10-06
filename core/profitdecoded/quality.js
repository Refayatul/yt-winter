"use strict";
// ProfitDecoded quality score (spec 23), HARD gates (24-25), Humanness score
// (56) and Premium Media Test (57). Quality is never traded for cadence: the
// only outputs are PUBLISH / REVIEW / REJECT and an exact reason list.

const S = require("./signals");
const { weights, thresholds } = require("./config");

const WEIGHT_KEYS = ["topic", "hook", "storytelling", "visual", "visualScriptMatch", "narration", "research", "editing", "title", "thumbnail"];

// ---- Humanness: would a viewer perceive this as generic automated content? ----
function humanness(parts) {
  const w = weights().humanness; const th = thresholds().humanness;
  let total = 0, wsum = 0; const unknown = []; const breakdown = {};
  for (const [k, wt] of Object.entries(w)) {
    const v = parts[k];
    const known = typeof v === "number" && Number.isFinite(v);
    if (!known) unknown.push(k);
    const used = known ? S.clamp(v) : S.UNKNOWN_SCORE;
    breakdown[k] = known ? Math.round(used) : null;
    total += wt * used; wsum += wt;
  }
  const score = Math.round(total / wsum);
  // Unknown components are scored pessimistically for ranking, but they alone must not hard-reject:
  // the floor applies to the score over components that were actually measured.
  let kt = 0, kw = 0; for (const [k, wt] of Object.entries(w)) if (!unknown.includes(k)) { kt += wt * breakdown[k]; kw += wt; }
  const knownScore = kw ? Math.round(kt / kw) : 0;
  const verdict = knownScore < th.hardReject ? "REJECT" : unknown.length ? "UNVERIFIED" : score >= th.target ? "PASS" : "REVIEW";
  return { score, knownScore, target: th.target, hardReject: th.hardReject, verdict, unknown, breakdown };
}

// ---- Quality score ----
function qualityScore(components) {
  const w = weights().quality; const wsum = Object.values(w).reduce((s, x) => s + x, 0);
  let total = 0; const unknown = []; const breakdown = {};
  for (const k of WEIGHT_KEYS) {
    const v = components[k];
    const known = typeof v === "number" && Number.isFinite(v);
    if (!known) unknown.push(k);
    const used = known ? S.clamp(v) : 0; // UNKNOWN earns no points
    breakdown[k] = { weight: w[k], score: known ? Math.round(v) : null, points: S.round(w[k] * used / 100, 1) };
    total += w[k] * used / 100;
  }
  return { total: S.round(total / wsum * 100, 1), breakdown, unknown };
}

// ---- Hard gates: any failure rejects regardless of total score ----
// ev: the evidence bundle produced by pipeline.js.
function hardGates(ev) {
  const th = thresholds(); const fails = []; const unverified = [];
  const need = (cond, msg) => { if (!cond) fails.push(msg); };
  const unver = (cond, msg) => { if (cond) unverified.push(msg); };

  // narration
  if (ev.narration) {
    for (const r of ev.narration.rejections || []) fails.push("REJECTED: narration — " + r);
    unver(!ev.narration.certified, `narration voice "${ev.narration.provider}" is not certified premium (no human listen recorded)`);
    unver(!ev.narration.measured, "narration cadence/audio not measured from a rendered take");
  } else unverified.push("no narration QA result");
  // research / facts
  if (ev.research) {
    for (const r of ev.research.rejections || []) fails.push("REJECTED: research — " + r);
    need(ev.research.score >= th.researchGate, `REJECTED: research score ${ev.research.score} < required ${th.researchGate}`);
  } else fails.push("REJECTED: no research dossier");
  if (ev.scriptClaims) {
    if (ev.scriptClaims.unsupported.length) fails.push(`REJECTED: ${ev.scriptClaims.unsupported.length} script sentence(s) repeat claims without adequate support`);
    if (ev.scriptClaims.numbersWithoutDossierSupport.length) fails.push(`REJECTED: ${ev.scriptClaims.numbersWithoutDossierSupport.length} number(s) in the script are not in the research dossier (e.g. ${ev.scriptClaims.numbersWithoutDossierSupport[0].number})`);
  }
  // first seconds
  if (ev.first30) {
    // The full 0-5 / 5-15 / 15-30 evaluation is a long-form requirement. A 30-50 s Short is judged on its opening seconds.
    if (ev.format === "short") need(ev.first30.parts.hook >= 65, `REJECTED: Short opening (first 5 seconds) scores ${ev.first30.parts.hook} < required 65 (${(ev.first30.notes || []).join("; ") || "weak opening"})`);
    else need(ev.first30.score >= th.firstThirtySeconds, `REJECTED: first-30-second score ${ev.first30.score} < required ${th.firstThirtySeconds} (${(ev.first30.notes || []).join("; ") || "weak opening"})`);
  }
  if (ev.hook) { need(ev.hook.valid, "REJECTED: hook competition invalid — " + (ev.hook.problems || []).join("; ")); need(!ev.hook.winner || ev.hook.winner.score >= 60, `REJECTED: weakest-possible first seconds, winning hook scored ${ev.hook.winner && ev.hook.winner.score} < 60`); }
  // visuals
  if (ev.visuals) {
    for (const r of ev.visuals.rejections || []) fails.push("REJECTED: visuals — " + r);
    need(ev.visuals.alignment >= th.visualScriptMatch, `REJECTED: visual/script alignment ${ev.visuals.alignment} < required ${th.visualScriptMatch}`);
  } else fails.push("REJECTED: no visual plan");
  // render technicals
  if (ev.render) {
    need(!ev.render.audioBroken, "REJECTED: broken audio in the rendered file");
    need(!ev.render.artifacts, "REJECTED: rendering artifacts detected");
    need(ev.render.textReadable !== false, "REJECTED: unreadable on-screen text in render");
  } else unverified.push("no rendered file inspected (render QA UNKNOWN)");
  if (ev.duration && ev.duration.inRange === false) unverified.push(`narrated duration ${Math.round(ev.duration.seconds)} s is outside the typical ${ev.duration.target[0]}-${ev.duration.target[1]} s range: ${ev.format === "long" ? "the evidence base may be too thin for a premium long-form (do not pad)" : "tighten or split"}`);
  // writing
  if (ev.aiPatterns) { need(ev.aiPatterns.aiPatternScore < 35, `REJECTED: generic AI writing — pattern score ${ev.aiPatterns.aiPatternScore} >= 35 (${(ev.aiPatterns.findings || []).slice(0, 3).map((f) => f.name).join(", ")})`); }
  // similarity / originality
  if (ev.similarity) { for (const r of ev.similarity.rejections || []) fails.push("REJECTED: similarity — " + r); unver(!ev.similarity.competitorVerified, "competitor similarity unverified"); }
  else unverified.push("no similarity check");
  // packaging truthfulness
  if (ev.title) { need(!ev.title.misleading, "REJECTED: misleading title"); need(ev.title.score >= 70, `REJECTED: best title scores ${ev.title.score} < 70`); }
  if (ev.thumbnail) { need(!ev.thumbnail.misleading, "REJECTED: misleading thumbnail"); need(ev.thumbnail.score >= 60, `REJECTED: best thumbnail scores ${ev.thumbnail.score} < 60`); } else unverified.push("no thumbnail candidates scored");
  // copyright
  if (ev.copyright) need(ev.copyright.ok, "REJECTED: copyright uncertainty — " + (ev.copyright.detail || "unlicensed asset"));
  // humanness
  if (ev.humanness) {
    if (ev.humanness.verdict === "REJECT") fails.push(`REJECTED: humanness ${ev.humanness.knownScore} (measured components) < hard floor ${ev.humanness.hardReject}`);
    if (ev.humanness.unknown.length) unverified.push("humanness components unmeasured: " + ev.humanness.unknown.join(", "));
  }
  return { fails, unverified };
}

// ---- Premium Media Test ----
function premiumMediaTest(ev, q, h) {
  const reasons = [];
  if (ev.research && ev.research.score < 85) reasons.push(`research depth ${ev.research.score} would look thin next to leading business channels`);
  if (ev.narration && (!ev.narration.certified || ev.narration.naturalness < 88)) reasons.push("narration is not certified as human-grade");
  if (ev.visuals && (ev.visuals.visualQuality < 80 || ev.visuals.graphicShare < 0.4)) reasons.push(`visuals look cheaper/more generic than top peers (quality ${ev.visuals.visualQuality}, graphics ${Math.round((ev.visuals.graphicShare || 0) * 100)}%)`);
  if (ev.aiPatterns && ev.aiPatterns.aiPatternScore >= 25) reasons.push("script still carries generic-AI phrasing");
  if (h && h.score < 90) reasons.push(`humanness ${h.score} < 90`);
  if (ev.first30 && ev.format !== "short" && ev.first30.score < 85) reasons.push(`first 30 seconds (${ev.first30.score}) weaker than leading channels`);
  if (ev.first30 && ev.format === "short" && ev.first30.parts.hook < 70) reasons.push(`Short opening (${ev.first30.parts.hook}) weaker than leading channels`);
  return { wouldFeelOutOfPlace: reasons.length > 0, reasons, verdict: reasons.length ? "FAIL" : "PASS", note: "Heuristic comparison on quality dimensions only; a human reviewer makes the final judgement." };
}

// ---- Decision ----
function assess(components, ev, options = {}) {
  const th = thresholds();
  const q = qualityScore(components);
  const h = humanness(ev.humannessParts || {});
  ev = { ...ev, humanness: h };
  const gates = hardGates(ev);
  const pmt = premiumMediaTest(ev, q, h);
  const reasons = [...gates.fails];
  let decision;
  if (gates.fails.length) decision = "REJECT";
  else if (q.total < th.review) { decision = "REJECT"; reasons.push(`REJECTED: quality ${q.total} < review floor ${th.review}`); }
  else if (q.total < th.autoPublish || gates.unverified.length || h.verdict !== "PASS" || pmt.wouldFeelOutOfPlace || q.unknown.length) {
    decision = "REVIEW";
    if (q.total < th.autoPublish) reasons.push(`REVIEW: quality ${q.total} < auto-publish ${th.autoPublish}`);
    for (const u of gates.unverified) reasons.push("REVIEW: " + u);
    if (h.verdict !== "PASS") reasons.push(`REVIEW: humanness ${h.score} (${h.verdict}) vs target ${h.target}`);
    if (q.unknown.length) reasons.push("REVIEW: unscored quality components: " + q.unknown.join(", "));
    if (pmt.wouldFeelOutOfPlace) reasons.push("REVIEW: premium media test FAIL — " + pmt.reasons.join("; "));
  } else decision = "PUBLISH";
  return { decision, quality: q, humanness: h, premiumMediaTest: pmt, hardGateFailures: gates.fails, unverified: gates.unverified, reasons, thresholds: { autoPublish: th.autoPublish, review: th.review } };
}

module.exports = { qualityScore, humanness, hardGates, premiumMediaTest, assess, WEIGHT_KEYS };
