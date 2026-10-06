"use strict";
// Visual intent planning + visual/script QA (spec 15-18, 24, 26).
// Every narration beat needs a VISUAL INTENT; generic stock is capped; every
// asset needs a licence status; pacing follows information density, not a clock.

const T = require("./text");
const S = require("./signals");

const GENERIC_TAGS = new Set(["hands typing", "typing", "city skyline", "skyline", "people walking", "walking", "money counting", "counting money", "cash", "generic office", "office", "businessman", "handshake", "laptop", "coins", "stock market", "graph arrow", "meeting", "traffic", "crowd", "rocket", "dollar sign", "piles of cash", "candlestick"]);
const OK_LICENSES = new Set(["owned", "original-graphic", "licensed", "public-domain", "cc0", "cc-by", "company-press-kit", "government-work", "editorial-licensed"]);
const GRAPHIC_TYPES = new Set(["chart", "diagram", "floor-plan", "price-animation", "receipt", "ui-callout", "filing-excerpt", "timeline", "comparison-panel", "map", "money-flow", "unit-economics", "typography", "animated-number"]);
const MOTIONS = ["push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "static-hold", "parallax", "reveal-wipe", "track-path", "count-up", "highlight-pulse", "split-reveal"];
const TRANSITIONS = ["cut", "match-cut", "wipe", "push", "dissolve", "whip", "dip-to-ink", "none"];

// ---- Planning: derive a visual objective/type per beat from what the sentence is doing ----
function intentFor(text, claim) {
  const t = String(text);
  const has = (re) => re.test(t);
  if (has(/\$\d|\b\d+(\.\d+)?\s?(cents|dollars|percent|%|million|billion)\b/i) && has(/\b(price|cost|charge|fee|pay|paid|dollars|cents)\b/i)) return { type: "price-animation", objective: "make the price/number tangible and comparable", motion: "count-up" };
  if (has(/\b(percent|%|million|billion|revenue|profit|margin|members|subscribers|sales)\b/i) && has(/\d/)) return { type: "chart", objective: "show the figure's size against a reference, citing the source on screen", motion: "reveal-wipe" };
  if (has(/\b(layout|aisle|floor|store|warehouse|walk|path|back of the|front of the|entrance|checkout)\b/i)) return { type: "floor-plan", objective: "show where things sit and how the customer moves", motion: "track-path" };
  if (has(/\b(filing|annual report|10-k|earnings|investor|report|regulator|lawsuit|court|ftc|sec)\b/i)) return { type: "filing-excerpt", objective: "show the primary source passage that proves the claim", motion: "highlight-pulse" };
  if (has(/\b(subscription|trial|cancel|checkout|app|screen|button|click|sign up)\b/i)) return { type: "ui-callout", objective: "show the real interface decision that causes the behaviour", motion: "highlight-pulse" };
  if (has(/\b(compare|versus|than|cheaper|more expensive|instead of)\b/i)) return { type: "comparison-panel", objective: "put the two things side by side with the numbers", motion: "split-reveal" };
  if (has(/\b(then|later|by \d{4}|in \d{4}|years? (ago|later)|since)\b/i)) return { type: "timeline", objective: "place the event in sequence", motion: "pan-right" };
  if (has(/\b(money|flows?|goes to|pays? for|comes from|cut|share)\b/i)) return { type: "money-flow", objective: "show who pays whom and where the margin lands", motion: "track-path" };
  if (claim) return { type: "typography", objective: "state the key claim visually with its source tag", motion: "push-in" };
  return { type: "product-image", objective: "show the actual product/place being discussed", motion: "push-in" };
}

// Seeded RNG so planning is reproducible but not mechanical.
function rng(seed) {
  let h = 1779033703 ^ String(seed).length; for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Beats: [{id, text, start, end}] -> planned shots with density-driven duration.
function planShots(beats, options = {}) {
  const shots = []; let lastTransition = null; let lastMotion = null;
  for (const beat of beats) {
    const dur = beat.end - beat.start;
    const density = Math.min(1, ((beat.text.match(/\b\d[\d,.]*\b/g) || []).length * 0.25) + (T.contentWords(beat.text).length / 28));
    const r = rng(options.seed + ":" + beat.id);
    // High density -> hold the explanatory graphic longer; low density/energy -> quicker beats.
    const fast = options.format === "short"; // Shorts need a quicker visual rhythm than long-form
    const n = dur < (fast ? 1.6 : 2.2) ? 1 : density > (fast ? 0.9 : 0.7) ? (dur > (fast ? 5 : 7) ? 2 : 1) : Math.max(1, Math.min(fast ? 7 : 5, Math.round(dur / (fast ? 1.3 + r() * 2.4 : 2.4 + r() * 3.2))));
    let cuts = Array.from({ length: n }, () => 0.35 + r() * 2.0); const total = cuts.reduce((s, x) => s + x, 0);
    cuts = cuts.map((c) => c / total * dur);
    let at = beat.start;
    const base = intentFor(beat.text, beat.claimId);
    cuts.forEach((d, i) => {
      let motion = i === 0 ? base.motion : MOTIONS[Math.floor(r() * MOTIONS.length)];
      if (motion === lastMotion) motion = MOTIONS[(MOTIONS.indexOf(motion) + 3) % MOTIONS.length];
      let transition = TRANSITIONS[Math.floor(r() * TRANSITIONS.length)];
      if (transition === lastTransition) transition = TRANSITIONS[(TRANSITIONS.indexOf(transition) + 2) % TRANSITIONS.length];
      shots.push({ beatId: beat.id, intent: { objective: base.objective, type: i === 0 ? base.type : (i % 2 ? "typography" : base.type) }, start: S.round(at, 2), duration: S.round(d, 2), motion, transition, claimId: beat.claimId || null });
      lastMotion = motion; lastTransition = transition; at += d;
    });
  }
  return shots;
}

// ---- QA ----
function isGenericStock(shot) {
  const tags = (shot.tags || []).map((x) => String(x).toLowerCase());
  return shot.type === "stock" && (shot.generic === true || tags.some((x) => GENERIC_TAGS.has(x)));
}

// plan: [{beatId, type, source:{id,kind,license,url}, tags, entities, overlayText, durationSec, motion, transition, aiGenerated, animated, fontPx, alt}]
function qa(plan, beats, options = {}) {
  const cfg = { genericStockMax: 0.15, aiMax: 0.25, minDurationCv: 0.35, maxStatic: 14, minFontPx: 44, maxOverlayWords: 12, ...options };
  const rejections = []; const warnings = [];
  const beatList = beats.map((b) => ({ ...b, words: T.contentWords(b.text), numbers: b.text.match(/\d[\d,.]*/g) || [] }));
  const byBeat = new Map(); for (const p of plan) { if (!byBeat.has(p.beatId)) byBeat.set(p.beatId, []); byBeat.get(p.beatId).push(p); }

  // Visual-script alignment per beat.
  let relevant = 0; const mismatched = [];
  for (const b of beatList) {
    const shots = byBeat.get(b.id) || [];
    const ok = shots.some((p) => {
      if (isGenericStock(p)) return false;
      const vocab = new Set(T.contentWords([...(p.entities || []), p.overlayText || "", p.alt || "", ...(p.tags || [])].join(" ")));
      const overlap = b.words.filter((w) => vocab.has(w)).length;
      const dataMatch = GRAPHIC_TYPES.has(p.type) && b.numbers.length && (p.numbers || []).some((n) => b.numbers.some((bn) => String(bn).replace(/,/g, "") === String(n).replace(/,/g, "")));
      return overlap >= 1 || dataMatch || (GRAPHIC_TYPES.has(p.type) && p.evidenceClaimId && p.evidenceClaimId === b.claimId);
    });
    if (ok) relevant += 1; else mismatched.push(b.id);
  }
  const alignment = beatList.length ? Math.round(relevant / beatList.length * 100) : 0;
  if (mismatched.length) rejections.push(`${mismatched.length} of ${beatList.length} narration beats lack semantically relevant visuals (${mismatched.slice(0, 5).join(", ")}${mismatched.length > 5 ? ", ..." : ""})`);
  const missingBeats = beatList.filter((b) => !byBeat.has(b.id)).map((b) => b.id);
  if (missingBeats.length) rejections.push(`${missingBeats.length} narration beat(s) have no visual at all`);

  // Generic stock.
  const totalDur = plan.reduce((s, p) => s + (p.durationSec || 0), 0) || 1;
  const genericDur = plan.filter(isGenericStock).reduce((s, p) => s + (p.durationSec || 0), 0);
  const stockShare = genericDur / totalDur;
  if (stockShare > cfg.genericStockMax) rejections.push(`generic stock footage is ${Math.round(stockShare * 100)}% of runtime (max ${Math.round(cfg.genericStockMax * 100)}%)`);
  let run = 0, worst = 0; for (const p of plan) { if (isGenericStock(p)) { run += 1; worst = Math.max(worst, run); } else run = 0; }
  if (worst >= 2) rejections.push(`generic stock-footage sequence: ${worst} generic clips in a row`);

  // Copyright/source status.
  const unlicensed = plan.filter((p) => !p.source || !OK_LICENSES.has(String(p.source.license || "").toLowerCase()));
  if (unlicensed.length) rejections.push(`copyright uncertainty: ${unlicensed.length} visual asset(s) without a verified licence status (${[...new Set(unlicensed.map((p) => (p.source && p.source.id) || p.type))].slice(0, 4).join(", ")})`);

  // Repetition.
  const counts = {}; for (const p of plan) if (p.source && p.source.id) counts[p.source.id] = (counts[p.source.id] || 0) + 1;
  const reused = Object.entries(counts).filter(([id, c]) => c > 2 && !/^graphic:/.test(id));
  if (reused.length) rejections.push(`repeated B-roll: ${reused.map(([id, c]) => `${id} x${c}`).slice(0, 3).join(", ")}`);
  let consecutive = 0; for (let i = 1; i < plan.length; i += 1) if (plan[i].source && plan[i - 1].source && plan[i].source.id === plan[i - 1].source.id && !/^graphic:/.test(plan[i].source.id)) consecutive += 1;
  if (consecutive > 1) warnings.push(`${consecutive} consecutive reuses of the same asset`);

  // AI-generated share.
  const aiShare = plan.filter((p) => p.aiGenerated).reduce((s, p) => s + (p.durationSec || 0), 0) / totalDur;
  if (aiShare > cfg.aiMax) rejections.push(`AI-generated imagery is ${Math.round(aiShare * 100)}% of runtime (max ${Math.round(cfg.aiMax * 100)}%)`);
  if (plan.some((p) => p.aiGenerated && !p.labelled)) warnings.push("AI-generated visuals must carry an on-screen label");

  // Pacing: variation, dead stretches, repeated motion/transition.
  const durs = plan.map((p) => p.durationSec).filter((d) => d > 0);
  const durCv = T.cv(durs);
  if (durs.length >= 8 && durCv < cfg.minDurationCv) rejections.push(`mechanical pacing: shot length CV ${durCv.toFixed(2)} < ${cfg.minDurationCv}`);
  const dead = plan.filter((p) => p.durationSec > cfg.maxStatic && !p.animated);
  if (dead.length) rejections.push(`${dead.length} dead visual stretch(es) > ${cfg.maxStatic}s without animation`);
  const topShare = (key) => { const c = {}; for (const p of plan) if (p[key]) c[p[key]] = (c[p[key]] || 0) + 1; const max = Math.max(0, ...Object.values(c)); return plan.length ? max / plan.length : 0; };
  if (plan.length >= 10 && topShare("motion") > 0.4) warnings.push(`one camera motion is ${Math.round(topShare("motion") * 100)}% of shots (repetitive zooms)`);
  if (plan.length >= 10 && topShare("transition") > 0.5) warnings.push(`one transition is ${Math.round(topShare("transition") * 100)}% of shots`);

  // Text legibility.
  const unreadable = plan.filter((p) => p.overlayText && ((p.fontPx || 0) < cfg.minFontPx || T.words(p.overlayText).length > cfg.maxOverlayWords));
  if (unreadable.length) rejections.push(`unreadable text on ${unreadable.length} shot(s): overlay must be >= ${cfg.minFontPx}px and <= ${cfg.maxOverlayWords} words`);

  const graphicShare = plan.filter((p) => GRAPHIC_TYPES.has(p.type)).reduce((s, p) => s + (p.durationSec || 0), 0) / totalDur;
  const specificity = S.clamp(Math.round(100 - stockShare * 250 + Math.min(20, graphicShare * 40) - reused.length * 10));
  const repetition = S.clamp(Math.round(100 - reused.length * 25 - consecutive * 6 - Math.max(0, topShare("motion") - 0.3) * 80));
  const pacing = S.clamp(Math.round(Math.min(100, durCv / 0.6 * 100) - dead.length * 15));
  const visualQuality = S.clamp(Math.round(0.4 * specificity + 0.25 * pacing + 0.2 * repetition + 0.15 * Math.min(100, graphicShare * 160)));
  return { alignment, specificity, repetition, pacing, visualQuality, graphicShare: S.round(graphicShare, 2), genericStockShare: S.round(stockShare, 2), aiShare: S.round(aiShare, 2), shotLengthCv: S.round(durCv, 2), rejections, warnings, pass: rejections.length === 0 };
}

module.exports = { GENERIC_TAGS, OK_LICENSES, GRAPHIC_TYPES, intentFor, planShots, qa, isGenericStock };
