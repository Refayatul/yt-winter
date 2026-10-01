"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { ROOT } = require("../channel-context");

const CACHE_SCHEMA = 1;
const MAX_HOLD_SECONDS = 4;
// Enough licensed pictures that a 30-second Short rarely needs to reuse one.
const MAX_STILLS = 8;
const NUMBER_RE = /\b[A-Z]{1,6}-\d+\b|\d[\d,]*(?:\.\d+)?(?:\s*[–—-]\s*\d[\d,]*(?:\.\d+)?)?(?:\s*-?\s*(?:%|percent|rpm|km\/h|m\/s|mph|nm|nanometres?|nanometers?|μm|um|micrometres?|micrometers?|km|kilometres?|kilometers?|millimetres?|millimeters?|centimetres?|centimeters?|metres?|meters?|kg|kV|V|volts?|GW|MW|watts?|tons?|seconds?|minutes?|hours?|days?|years?|nautical\s+miles?|miles?|feet|inches?|litres?|liters?|°C|degrees?|million|billion|thousand|barrels?(?:\s+(?:per|a)\s+day)?|light-seconds?))?/gi;

function numberTokens(text) {
  return [...new Set((String(text || "").match(NUMBER_RE) || []).map((value) => value.replace(/\s+/g, " ").replace(/[.,]$/, "").trim()))];
}

function scenesFor(topic) {
  if (Array.isArray(topic.visualScenes)) return topic.visualScenes.map((scene) => typeof scene === "string" ? scene : scene.text).filter(Boolean);
  return ((topic.visualPotential || {}).scenes || []).filter(Boolean);
}

function claimRows(script, duration) {
  const claims = (script && script.claims || []).map((claim) => ({ ...claim }));
  if (!claims.length) return [];
  if (claims.every((claim) => Number.isFinite(claim.start) && Number.isFinite(claim.end) && claim.end > claim.start)) return claims;
  const piece = duration / claims.length;
  return claims.map((claim, index) => ({ ...claim, start: index * piece, end: (index + 1) * piece }));
}

function timelineBoundaries(claims, duration, pacingSegments) {
  const boundaries = new Set([0, duration]);
  const claimBoundaries = [0, duration];
  for (const claim of claims) {
    const start = Math.max(0, Math.min(duration, claim.start));
    const end = Math.max(0, Math.min(duration, claim.end));
    boundaries.add(start);
    boundaries.add(end);
    claimBoundaries.push(start, end);
  }
  let cursor = 0;
  for (const segment of Array.isArray(pacingSegments) ? pacingSegments : []) {
    cursor += Number(segment) || 0;
    // A pacing cut almost on top of a claim boundary creates a flash-frame,
    // not a meaningful visual change. The claim boundary wins.
    if (cursor > 0 && cursor < duration && !claimBoundaries.some((value) => Math.abs(value - cursor) < 0.4)) boundaries.add(cursor);
  }
  if (!Array.isArray(pacingSegments) || !pacingSegments.length) {
    for (let at = 3; at < duration; at += 3) boundaries.add(at);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  // A configured pacing range should already be short, but split again here
  // so an unusual config can never create a >4 second static visual.
  const out = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const start = out[out.length - 1];
    const end = sorted[index];
    const pieces = Math.ceil((end - start) / 3.5);
    for (let piece = 1; piece <= pieces; piece += 1) out.push(start + (end - start) * piece / pieces);
  }
  return out;
}

function activeClaim(claims, at) {
  const index = claims.findIndex((claim) => at >= claim.start - 0.001 && at < claim.end - 0.001);
  return index < 0 ? Math.max(0, claims.length - 1) : index;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

// Paper figures, charts and maps are unreadable when cropped to 9:16; they
// are shown whole over a blurred copy of themselves. Photographs fill the frame.
const DIAGRAM_RE = /\b(?:graph|chart|diagram|plot|figure|fig|map|schematic|timeline|data|anomal\w*|model\w*|simulation|cross[- ]section|infographic|table|curve|scheme|projection|trend|svg)\b/i;

function stillKind(still) {
  const text = `${still.file || ""} ${still.description || ""}`.replace(/[_]/g, " ");
  return /\.(?:png|svg|gif)$/i.test(still.file || "") || DIAGRAM_RE.test(text) ? "diagram" : "photo";
}

// A card is worth showing only for a value with a unit or percentage. Bare
// numbers ("8", "4 vs 10") and identifiers carry no meaning on screen.
function cardTokens(numbers) {
  return numbers.filter((token) => !/^[A-Z]{1,6}-\d+$/.test(token) && /[a-z%°]/i.test(token));
}

function tokenUnit(token) {
  return String(token).replace(/^[\d,.\s–—-]+/, "").trim().toLowerCase();
}

const MAX_CARDS_WITH_STILLS = 3;
const MAX_CARDS_WITHOUT_STILLS = 6;

function buildVisualPlan(topic, script, stills = [], pacingSegments = [], duration = script && script.targetSeconds || 0) {
  const claims = claimRows(script, duration);
  if (!claims.length || !(duration > 0)) return [];
  const boundaries = timelineBoundaries(claims, duration, pacingSegments);
  const scenes = scenesFor(topic);
  // Photographs first (they carry the story), diagrams after, each in the
  // relevance order prepareAssets produced.
  const ordered = [...stills.filter((still) => stillKind(still) === "photo"), ...stills.filter((still) => stillKind(still) === "diagram")];
  const maxCards = ordered.length >= 2 ? MAX_CARDS_WITH_STILLS : MAX_CARDS_WITHOUT_STILLS;
  const stillUses = new Map();
  const cardedClaims = new Set();
  let cards = 0;
  let backdropIndex = 0;
  const plan = [];

  const nextStill = () => {
    const last = plan.length ? plan[plan.length - 1].still : null;
    const candidates = ordered.filter((still) => still !== last);
    if (!candidates.length) return null;
    // Unused stills first; once all are used, the least used one returns with
    // a different camera move.
    return candidates.reduce((best, still) => ((stillUses.get(still.file) || 0) < (stillUses.get(best.file) || 0) ? still : best), candidates[0]);
  };

  for (let shotIndex = 0; shotIndex < boundaries.length - 1; shotIndex += 1) {
    const start = boundaries[shotIndex];
    const end = boundaries[shotIndex + 1];
    if (end - start < 0.01) continue;
    const claimIndex = activeClaim(claims, start + 0.002);
    const claim = claims[claimIndex];
    const numbers = numberTokens(claim.text);
    const eligible = cardTokens(numbers);
    const previous = plan[plan.length - 1];
    const cardAllowed = eligible.length && cards < maxCards && !cardedClaims.has(claimIndex) && (!previous || previous.type !== "number-card");
    let type;
    // A numeric hook is the opening visual; later, one card per claim at most,
    // never two in a row, and stills carry everything else.
    if (shotIndex === 0 && cardAllowed) type = "number-card";
    else if (cardAllowed && (!ordered.length || (previous && previous.type === "licensed-still"))) type = "number-card";
    else if (ordered.length && nextStill()) type = "licensed-still";
    else if (cardAllowed) type = "number-card";
    else type = "procedural";

    const entry = { shot: plan.length + 1, start, end, duration: end - start, claimIndex, claimText: claim.text,
      scene: scenes[claimIndex % Math.max(1, scenes.length)] || claim.text, type, numbers, comparison: [], still: null,
      proceduralFrame: claimIndex * 97 + shotIndex };
    if (type === "licensed-still") {
      const still = nextStill();
      const use = stillUses.get(still.file) || 0;
      stillUses.set(still.file, use + 1);
      Object.assign(entry, { still, kind: stillKind(still), motion: use, sourceId: use ? `still:${still.file}#${use + 1}` : `still:${still.file}`, visualKey: `still:${still.file}` });
    } else if (type === "number-card") {
      const sameUnit = eligible.length >= 2 && tokenUnit(eligible[0]) && tokenUnit(eligible[0]) === tokenUnit(eligible[1]);
      const cardNumbers = sameUnit ? eligible.slice(0, 2) : eligible.slice(0, 1);
      cards += 1;
      cardedClaims.add(claimIndex);
      // The narration caption already says what the value means; the card shows
      // the value alone over a blurred picture from the same topic.
      const backdrop = ordered.length ? ordered[backdropIndex++ % ordered.length] : null;
      Object.assign(entry, { numbers: cardNumbers, comparison: sameUnit ? cardNumbers : [], backdrop, sourceId: `card:${claimIndex}:${shortHash(cardNumbers.join("|"))}` });
      entry.visualKey = entry.sourceId;
    } else {
      entry.sourceId = `procedural:${claimIndex}:${entry.proceduralFrame}:${shortHash(entry.scene)}`;
      entry.visualKey = entry.sourceId;
    }
    plan.push(entry);
  }
  return plan;
}

function visualMetrics(plan) {
  // A still re-used with another camera move is the same picture: it counts
  // once for variety, and back-to-back uses count as one static hold.
  const key = (shot) => shot.visualKey || shot.sourceId;
  const distinct = new Set(plan.map(key));
  const real = new Set(plan.filter((shot) => shot.type === "licensed-still").map(key));
  const cards = new Set(plan.filter((shot) => shot.type === "number-card").map(key));
  let maxStaticSeconds = 0;
  let runSource = null;
  let runSeconds = 0;
  for (const shot of plan) {
    if (key(shot) === runSource) runSeconds += shot.duration;
    else { runSource = key(shot); runSeconds = shot.duration; }
    maxStaticSeconds = Math.max(maxStaticSeconds, runSeconds);
  }
  const first = plan[0];
  const openingHookCovered = !!first && first.claimIndex === 0 && (first.type !== "number-card" || first.numbers.every((token) => first.claimText.includes(token)));
  const cardNumbersValid = plan.filter((shot) => shot.type === "number-card")
    .every((shot) => shot.numbers.length > 0 && shot.numbers.every((token) => shot.claimText.includes(token)));
  return {
    distinctVisuals: distinct.size,
    realImageCount: real.size,
    numberCardCount: cards.size,
    maxStaticSeconds: Math.round(maxStaticSeconds * 1000) / 1000,
    visualChanges: plan.length,
    openingHookCovered,
    cardNumbersValid,
  };
}

function evaluateVisualQuality(metrics) {
  const reasons = [];
  if (!metrics || metrics.distinctVisuals < 5) reasons.push(`distinct visuals ${metrics && metrics.distinctVisuals || 0} < 5`);
  if (!metrics || (metrics.realImageCount < 2 && metrics.numberCardCount < 5)) reasons.push(`requires 2 licensed real images or 5 number cards (got ${metrics && metrics.realImageCount || 0} images, ${metrics && metrics.numberCardCount || 0} cards)`);
  if (!metrics || metrics.maxStaticSeconds > MAX_HOLD_SECONDS) reasons.push(`maximum static hold ${metrics && metrics.maxStaticSeconds || 0}s > ${MAX_HOLD_SECONDS}s`);
  if (!metrics || !metrics.openingHookCovered) reasons.push("first visual does not cover the opening hook");
  if (!metrics || !metrics.cardNumbersValid) reasons.push("number card contains a value absent from its narration line");
  return { decision: reasons.length ? "BLOCK" : "PUBLISH", reasons };
}

function wikiTitles(topic) {
  const titles = [];
  for (const fact of topic.facts || []) {
    try {
      const url = new URL(fact.url || "");
      if (url.hostname !== "en.wikipedia.org" || !url.pathname.startsWith("/wiki/")) continue;
      const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
      if (title && !titles.includes(title)) titles.push(title);
    } catch (error) {}
  }
  return titles;
}

function anchorPhrases(topic, articleTitle) {
  const title = String(topic.topic || "").replace(/^what if\s+/i, "").replace(/[?]/g, "").replace(/\b(?:tomorrow|tonight|right now)\b/gi, "").trim();
  const anchors = [topic.canonicalTopic, topic.subject, title, articleTitle].filter(Boolean);
  // Commons metadata often calls an electrical grid simply "electric" or
  // "power". Keep those narrow domain synonyms in the relevance anchors so
  // genuine utility control rooms pass without weakening the three-term gate.
  if (/\bgrid\b/i.test(topic.canonicalTopic || "")) {
    anchors.push(String(topic.canonicalTopic).replace(/\bgrid\b/i, "electric"));
    anchors.push(String(topic.canonicalTopic).replace(/\bgrid\b/i, "power"));
  }
  return [...new Set(anchors)];
}

function subjectPhrases(topic, articleTitle) {
  return [...new Set([...anchorPhrases(topic, articleTitle), ...scenesFor(topic)].filter(Boolean))];
}

function cacheDirectory(outputDirectory) { return path.join(outputDirectory, "visual-cache"); }
function manifestPath(outputDirectory) { return path.join(cacheDirectory(outputDirectory), "manifest.json"); }

function loadManifest(outputDirectory) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath(outputDirectory), "utf8"));
    if (manifest.schemaVersion !== CACHE_SCHEMA) return null;
    const stills = (manifest.stills || []).map((still) => ({ ...still, path: path.join(cacheDirectory(outputDirectory), still.cachedFile) }));
    if (!stills.every((still) => fs.existsSync(still.path))) return null;
    return { ...manifest, stills };
  } catch (error) { return null; }
}

async function prepareAssets(topic, outputDirectory) {
  const cached = loadManifest(outputDirectory);
  if (cached) return cached;
  const Commons = require("../../scripts/fr-library/build");
  const directory = cacheDirectory(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const picked = [];
  const excluded = (Array.isArray(topic.excludeStills) ? topic.excludeStills : [topic.excludeStills]).filter(Boolean).map(String);
  const used = new Set(excluded);
  const articles = wikiTitles(topic);

  for (const article of articles) {
    if (picked.length >= MAX_STILLS) break;
    const subjects = subjectPhrases(topic, article);
    const anchorSubjects = anchorPhrases(topic, article);
    const found = await Commons.commonsStills(subjects, 4, article, {
      keywords: subjects,
      subjects,
      anchorSubjects,
      strictSubject: true,
      articleOnly: true,
      strict: !!topic.strictStills,
      exclude: used,
      reject: excluded,
    });
    for (const item of found) {
      if (!used.has(item.file)) { picked.push(item); used.add(item.file); }
      if (picked.length >= MAX_STILLS) break;
    }
  }

  // Some Wikipedia pages intentionally use diagrams only. A tightly filtered
  // Commons search is the secondary source; the same licence, safety, size and
  // subject-title/description rules still apply. It runs only when the article
  // itself has too few pictures: a broad search returns loosely related photos
  // (an aircraft "over the Atlantic" for an ocean-current topic).
  if (picked.length < 2) {
    const subjects = subjectPhrases(topic, articles[0] || "");
    const anchorSubjects = anchorPhrases(topic, articles[0] || "");
    const found = await Commons.commonsStills(subjects, MAX_STILLS - picked.length, null, {
      keywords: subjects,
      subjects,
      anchorSubjects,
      strictSubject: true,
      strict: !!topic.strictStills,
      exclude: used,
      reject: excluded,
      phrases: subjects,
    });
    for (const item of found) {
      if (!used.has(item.file)) { picked.push(item); used.add(item.file); }
      if (picked.length >= MAX_STILLS) break;
    }
  }

  const relevanceTerms = [...new Set(subjectPhrases(topic, articles[0] || "").join(" ").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !["what", "with", "from", "into", "that", "this", "showing", "diagram", "comparison"].includes(word)))];
  const relevance = (item) => relevanceTerms.filter((word) => `${item.file} ${item.description || ""}`.toLowerCase().includes(word)).length;
  // Diagrams are kept only from the topic's own Wikipedia article, where an
  // editor placed them; a keyword search turns up unrelated schematics (a
  // military "defence system" sketch for a tunnel ventilation system).
  for (let index = picked.length - 1; index >= 0; index -= 1) {
    if (picked[index].origin !== "wikipedia-article" && stillKind(picked[index]) === "diagram") picked.splice(index, 1);
  }
  picked.sort((a, b) => relevance(b) - relevance(a) || b.score - a.score || a.file.localeCompare(b.file));

  const stills = [];
  for (const item of picked) {
    if (!item.imageUrl) continue;
    const response = await Commons.get(item.imageUrl, { binary: true });
    if (!(response.status >= 200 && response.status < 300) || !Buffer.isBuffer(response.body) || !response.body.length) continue;
    const extension = /\.png$/i.test(item.file) ? ".png" : ".jpg";
    const cachedFile = shortHash(item.file) + extension;
    fs.writeFileSync(path.join(directory, cachedFile), response.body);
    stills.push({
      file: item.file,
      cachedFile,
      width: item.width,
      height: item.height,
      licence: item.licence,
      author: item.author,
      sourceUrl: item.sourceUrl,
      description: item.description,
      origin: item.origin,
      score: item.score,
    });
  }
  const manifest = { schemaVersion: CACHE_SCHEMA, topicId: topic.id, stills };
  fs.writeFileSync(manifestPath(outputDirectory), JSON.stringify(manifest, null, 2) + "\n");
  return loadManifest(outputDirectory) || { ...manifest, stills: [] };
}

function prepareAssetsSync(topicFile, outputDirectory) {
  const cached = loadManifest(outputDirectory);
  if (cached) return cached;
  const result = cp.spawnSync(process.execPath, [path.join(ROOT, "scripts", "ib-ct-visual-cache.js"), topicFile, outputDirectory], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 240000,
    env: process.env,
  });
  const loaded = loadManifest(outputDirectory);
  if (result.status === 0 && loaded) return loaded;
  return { schemaVersion: CACHE_SCHEMA, topicId: null, stills: [], error: (result.stderr || result.error && result.error.message || "visual cache preparation failed").trim() };
}

function attributionLines(stills) {
  return (stills || []).map((still) => `- ${still.file} — ${still.author}; ${still.licence}; ${still.sourceUrl}`);
}

module.exports = {
  CACHE_SCHEMA, MAX_HOLD_SECONDS, numberTokens, stillKind, cardTokens, buildVisualPlan, visualMetrics, evaluateVisualQuality,
  wikiTitles, prepareAssets, prepareAssetsSync, loadManifest, attributionLines,
};
