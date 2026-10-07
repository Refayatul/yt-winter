"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { ROOT } = require("../channel-context");
const Explainers = require("./explainers");

const CACHE_SCHEMA = 2;
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

function timelineBoundaries(claims, duration, pacingSegments, maximumPieceSeconds = 3.5) {
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
    const pieces = Math.ceil((end - start) / maximumPieceSeconds);
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
// Artist's illustrations and cutaways are not photographs either: they never
// open a Short or stand in for the real subject. Multi-panel images
// (comparisons, composites, mosaics) are shown whole: cropped to 9:16 the
// "Europa, Earth & Moon size comparison" showed only Earth.
const DIAGRAM_RE = /\b(?:graph|chart|diagram|plot|figure|fig|map|schematic|timeline|data|anomal\w*|model\w*|simulation|cross[- ]section|infographic|table|curve|scheme|projection|trend|svg|illustration|artist'?s?|cutaway|rendering|tectonics|comparison|composite|mosaic|montage|collage|panels?|side[- ]by[- ]side|before and after)\b/i;

// A file title that names three or more separate features ("Chaos
// Transition, Crisscrossing Bands & Chaos Near Agenor Linea") is a multi-panel
// figure: cropped to 9:16 it opened an ImpossibleBrief Short as a labelled
// 2x2 grid.
function multiPanelTitle(file) {
  const title = String(file || "").replace(/\.[a-z0-9]+$/i, "").replace(/\([^)]*\)/g, " ").replace(/^.*? - /, "");
  return (title.match(/,|\s&\s/g) || []).length >= 2;
}

function stillKind(still) {
  const text = `${still.file || ""} ${still.description || ""}`.replace(/[_]/g, " ");
  return /\.(?:png|svg|gif)$/i.test(still.file || "") || DIAGRAM_RE.test(text) || multiPanelTitle(still.file) ? "diagram" : "photo";
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

// Moving footage opens the body (shot 2) and returns every few cuts; each clip
// is used once.
const CLIP_SPACING = 4;

const GENERIC_VISUAL_TERMS = new Set([
  "road", "roads", "ocean", "sea", "water", "system", "systems", "eye", "eyes", "thing", "things", "object", "objects",
  "technology", "machine", "machines", "infrastructure", "building", "buildings", "sky", "earth", "world", "photo", "image",
  "view", "aerial", "landscape", "street", "highway", "server", "servers", "network", "power",
]);
const TERM_STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "into", "inside", "what", "why", "how", "only", "actual", "detail", "design"]);

function semanticFieldTerms(value) {
  const text = String(value || "").toLowerCase().replace(/cat['’]?s[- ]eye/g, " road stud reflector ");
  const words = text.split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !TERM_STOP.has(word) && !GENERIC_VISUAL_TERMS.has(word));
  if (/\b(?:road stud|cat['’]?s[- ]eye)\b/i.test(text)) words.push("stud", "reflector", "reflective", "catseye");
  if (/\b(?:uninterruptible power supply|\bups\b)\b/i.test(text)) words.push("ups", "uninterruptible", "battery", "backup");
  return [...new Set(words)];
}

function semanticTerms(topic) {
  return [...new Set([topic && topic.canonicalTopic, topic && topic.subject, topic && topic.designDetail, topic && topic.mechanism,
    topic && topic.topic, topic && topic.coreQuestion].flatMap(semanticFieldTerms))];
}

// A broad Commons result can mention the subject only incidentally in a long
// description while depicting something else entirely. For this channel,
// search results outside the curated topic article must name a distinctive
// subject term in the file title itself. That rejects false positives such as
// an equine ultrasound photograph whose description merely says Bluetooth.
function fileNamesSubject(topic, item) {
  const file = String(item && item.file || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const terms = [...new Set([
    ...semanticFieldTerms(topic && topic.canonicalTopic),
    ...semanticFieldTerms(topic && topic.subject),
    ...semanticFieldTerms(topic && topic.object),
  ])].filter((term) => term.length >= 4);
  return terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(file));
}

function visualAssetText(shot) {
  const asset = shot && (shot.still || shot.clip || shot.backdrop) || {};
  return [asset.file, asset.description, asset.alt, asset.title, asset.origin, shot && shot.scene].filter(Boolean).join(" ");
}

function semanticVisualEvidence(topic, shot) {
  const assetText = visualAssetText(shot);
  const normalized = assetText.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const matcher = (terms) => terms.filter((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
  const fields = {
    canonicalTopic: semanticFieldTerms(topic && topic.canonicalTopic),
    subject: semanticFieldTerms(topic && topic.subject),
    designDetail: semanticFieldTerms(topic && topic.designDetail),
    mechanism: semanticFieldTerms(topic && (topic.mechanism || topic.scientificMechanism)),
    scenario: semanticFieldTerms(topic && (topic.scenario || topic.scenarioChange || topic.event)),
    openingLine: semanticFieldTerms(topic && topic.openingLine),
    openingClaim: semanticFieldTerms(shot && (shot.claimText || shot.scene)),
  };
  const matches = Object.fromEntries(Object.entries(fields).map(([key, terms]) => [key, matcher(terms)]));
  const terms = [...new Set(Object.values(fields).flat())];
  const matchedTerms = [...new Set(Object.values(matches).flat())];
  const genericTermsIgnored = [...GENERIC_VISUAL_TERMS].filter((term) => new RegExp(`\\b${term}\\b`, "i").test(normalized));
  const unrelatedLandmark = /\boak alley\b/i.test(assetText) && /\b(?:road stud|cat['’]?s[- ]eye)\b/i.test([topic && topic.canonicalTopic, topic && topic.subject, topic && topic.topic].join(" "));
  const subjectMatch = matches.subject.length > 0 || matches.canonicalTopic.length > 0 || matches.scenario.length > 0;
  const mechanismMatch = matches.mechanism.length > 0;
  const designDetailMatch = matches.designDetail.length > 0;
  const claimMatch = matches.openingClaim.length > 0 || matches.openingLine.length > 0;
  const strongTerms = [...new Set([...matches.subject, ...matches.canonicalTopic, ...matches.mechanism, ...matches.designDetail, ...matches.scenario])];
  const relevant = !unrelatedLandmark && (strongTerms.length > 0 || (claimMatch && matchedTerms.length >= 2));
  const rejectionReasons = [];
  if (unrelatedLandmark) rejectionReasons.push("Oak Alley is a generic road setting, not a road stud or reflector mechanism");
  if (!unrelatedLandmark && !relevant) rejectionReasons.push("opening asset does not depict a distinctive subject, design detail, or mechanism");
  if (!strongTerms.length && genericTermsIgnored.length) rejectionReasons.push(`generic context terms ignored: ${genericTermsIgnored.join(", ")}`);
  return {
    measured: true,
    relevant,
    decision: relevant ? "PUBLISH" : "BLOCK",
    assetType: shot && shot.type || null,
    asset: assetText || null,
    topicTerms: terms,
    matchedTerms,
    strongTerms,
    genericTermsIgnored,
    subjectMatch,
    mechanismMatch,
    designDetailMatch,
    claimMatch,
    rejectionReasons,
    reason: relevant ? `opening asset matches distinctive evidence: ${strongTerms.length ? strongTerms.join(", ") : matchedTerms.join(", ")}` : rejectionReasons.join("; "),
  };
}

function detailStill(topic, stills = []) {
  if (!topic || topic.channel !== "behind-the-ordinary") return null;
  return stills.find((still) => {
    const evidence = semanticVisualEvidence(topic, { type: "licensed-still", still });
    return evidence.designDetailMatch;
  }) || null;
}

// Opening experiment, 50/50 by topic: "number" opens on the hook's sourced
// number card (the original look); "motion" opens on moving footage (or the
// lead photograph) with the hook words on screen. Recorded in render.json so
// Studio "viewed vs swiped away" can be compared per variant.
function openingVariant(topic) {
  return parseInt(shortHash(`opening:${topic.slug || topic.id}`).slice(0, 8), 16) % 2 ? "motion" : "number";
}

function buildVisualPlan(topic, script, stills = [], pacingSegments = [], duration = script && script.targetSeconds || 0, clips = [], options = {}) {
  const opening = options.opening || "number";
  const claims = claimRows(script, duration);
  if (!claims.length || !(duration > 0)) return [];
  const behindOrdinary = topic && topic.channel === "behind-the-ordinary";
  const boundaries = timelineBoundaries(claims, duration, pacingSegments, behindOrdinary ? 3 : 3.5);
  const maximumHoldSeconds = behindOrdinary ? 3.2 : MAX_HOLD_SECONDS;
  const scenes = scenesFor(topic);
  // Narration lines a topic explains with an animated diagram (explainerScenes).
  const explainerSpecs = Explainers.forClaims(topic, claims);
  // Photographs first (they carry the story), diagrams after, each in the
  // relevance order prepareAssets produced.
  const semanticFirst = (items) => items.sort((a, b) => Number(semanticVisualEvidence(topic, { type: "licensed-still", still: b }).relevant)
    - Number(semanticVisualEvidence(topic, { type: "licensed-still", still: a }).relevant));
  let ordered = [...semanticFirst(stills.filter((still) => stillKind(still) === "photo")), ...semanticFirst(stills.filter((still) => stillKind(still) === "diagram"))];
  const explanatoryLead = detailStill(topic, ordered);
  if (explanatoryLead) ordered = [explanatoryLead, ...ordered.filter((still) => still !== explanatoryLead)];
  // A curator can name the opening picture outright (curatedVisuals[].lead).
  const curatedLead = ordered.find((still) => still.lead === true);
  if (curatedLead) ordered = [curatedLead, ...ordered.filter((still) => still !== curatedLead)];
  const maxCards = ordered.length >= 2 ? MAX_CARDS_WITH_STILLS : MAX_CARDS_WITHOUT_STILLS;
  const stillUses = new Map();
  const cardedClaims = new Set();
  let cards = 0;
  let backdropIndex = 0;
  let clipIndex = 0;
  let lastClipShot = -CLIP_SPACING;
  const plan = [];
  const distinctKeys = () => new Set(plan.map((shot) => shot.visualKey || shot.sourceId));

  // The Hidden Logic of Things: the picture must match the line it sits
  // under, so stills are ranked by the words they share with that line.
  const words = (value) => new Set(String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  let currentClaimWords = new Set();
  const lineMatch = (still) => [...words([still.file, still.description, still.title].join(" "))].filter((word) => currentClaimWords.has(word)).length;
  const nextStill = () => {
    const last = plan.length ? plan[plan.length - 1].still : null;
    const candidates = ordered.filter((still) => still !== last);
    if (!candidates.length) return null;
    if (behindOrdinary) {
      return candidates.reduce((best, still) => {
        const usesDelta = (stillUses.get(still.file) || 0) - (stillUses.get(best.file) || 0);
        if (usesDelta !== 0) return usesDelta < 0 ? still : best;
        return lineMatch(still) > lineMatch(best) ? still : best;
      }, candidates[0]);
    }
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
    currentClaimWords = words(claim.text);
    const explainer = explainerSpecs[claimIndex];
    // No sub-second flashes: a sliver of a line extends the shot before it.
    const tail = plan[plan.length - 1];
    if (behindOrdinary && end - start < 1.2 && tail && tail.claimIndex === claimIndex && tail.duration + (end - start) <= maximumHoldSeconds) {
      tail.end = end;
      tail.duration = tail.end - tail.start;
      continue;
    }
    if (explainer) {
      // One continuous animation per narration line; its own beats supply the
      // visual changes, so later pacing boundaries extend it.
      const last = plan[plan.length - 1];
      if (last && last.type === "explainer" && last.claimIndex === claimIndex) {
        last.end = end;
        last.duration = last.end - last.start;
        continue;
      }
      const key = `explainer:${claimIndex}:${Explainers.specKey(explainer)}`;
      plan.push({ shot: plan.length + 1, start, end, duration: end - start, claimIndex, claimText: claim.text, scene: claim.text,
        type: "explainer", explainer, numbers: [], comparison: [], still: null, sourceId: key, visualKey: key });
      continue;
    }
    const numbers = numberTokens(claim.text);
    const eligible = cardTokens(numbers);
    const previous = plan[plan.length - 1];
    const cardAllowed = eligible.length && cards < maxCards && !cardedClaims.has(claimIndex) && (!previous || previous.type !== "number-card");
    let type;
    const motionOpen = opening === "motion" && shotIndex === 0 && (clips.length || ordered.some((still) => stillKind(still) === "photo"));
    const clipDue = clipIndex < clips.length && plan.length > 0 && plan.length - lastClipShot >= CLIP_SPACING && (!previous || previous.type !== "stock-video");
    // A numeric hook is the opening visual; later, one card per claim at most,
    // never two in a row, and stills carry everything else.
    if (motionOpen) type = clips.length ? "stock-video" : "licensed-still";
    else if (shotIndex === 0 && cardAllowed) type = "number-card";
    else if (clipDue) type = "stock-video";
    else if (cardAllowed && (!ordered.length || (previous && previous.type === "licensed-still"))) type = "number-card";
    else if (ordered.length && nextStill()) type = "licensed-still";
    else if (cardAllowed) type = "number-card";
    else type = "procedural";

    // A sparse licensed pool must not become an alternating two-image
    // slideshow. Once reuse would begin, scene-specific procedural frames add
    // genuine visual changes until the minimum variety gate can be reached.
    if (type === "licensed-still") {
      const candidate = nextStill();
      const reused = candidate && (stillUses.get(candidate.file) || 0) > 0;
      // The Hidden Logic of Things never uses generic procedural filler; a
      // relevant still may return once (the visual audit caps reuse at 2).
      if (reused && distinctKeys().size < 5 && scenes.length && !behindOrdinary) type = "procedural";
    }

    // A picture the viewer has already seen reads as a slideshow. Before a
    // still comes back, the previous real shot holds a little longer instead,
    // as long as it stays within the static-hold limit.
    if (type === "licensed-still") {
      const candidate = nextStill();
      const reused = candidate && (stillUses.get(candidate.file) || 0) > 0;
      if (reused && previous && ["licensed-still", "stock-video"].includes(previous.type) &&
        previous.duration + (end - start) <= maximumHoldSeconds) {
        previous.end = end;
        previous.duration = previous.end - previous.start;
        continue;
      }
    }

    const entry = { shot: plan.length + 1, start, end, duration: end - start, claimIndex, claimText: claim.text,
      scene: scenes[claimIndex % Math.max(1, scenes.length)] || claim.text, type, numbers, comparison: [], still: null,
      proceduralFrame: claimIndex * 97 + shotIndex };
    if (type === "stock-video") {
      const clip = clips[clipIndex++];
      lastClipShot = plan.length;
      Object.assign(entry, { clip, sourceId: `video:${clip.id}`, visualKey: `video:${clip.id}` });
    } else if (type === "licensed-still") {
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
  return loopBack(plan);
}

// Loop ending: the last shot returns to the opening picture (with another
// camera move), so the cut from the end back to the start is seamless and
// rewatches feel natural. Only a real picture opening, only over a closing
// still or clip, and only when the Short has enough shots to make it a
// callback rather than a repeat.
function loopBack(plan) {
  const first = plan[0];
  const last = plan[plan.length - 1];
  if (plan.length < 5 || !first || !last || first === last) return plan;
  if (!["licensed-still", "stock-video"].includes(first.type) || !["licensed-still", "stock-video"].includes(last.type)) return plan;
  if (first.type === "licensed-still" && first.kind !== "photo") return plan;
  // Never at the cost of variety: the visual gate needs 5 distinct visuals.
  const key = (shot) => shot.visualKey || shot.sourceId;
  if (new Set(plan.slice(0, -1).map(key)).size < 5) return plan;
  // Do not turn the final two segments into one long static hold by looping
  // back to the same source already used by the penultimate segment.
  const penultimate = plan[plan.length - 2];
  if (penultimate && key(penultimate) === key(first)) return plan;
  if (first.type === "stock-video") {
    Object.assign(last, { type: "stock-video", clip: first.clip, still: null, kind: undefined, sourceId: `${first.sourceId}#loop`, visualKey: first.visualKey, loopBack: true });
  } else {
    Object.assign(last, { type: "licensed-still", still: first.still, kind: first.kind, clip: undefined, motion: (first.motion || 0) + 2,
      sourceId: `${first.sourceId}#loop`, visualKey: first.visualKey, loopBack: true });
  }
  return plan;
}

function visualMetrics(plan, topic = null) {
  // A still re-used with another camera move is the same picture: it counts
  // once for variety, and back-to-back uses count as one static hold.
  const key = (shot) => shot.visualKey || shot.sourceId;
  const distinct = new Set(plan.map(key));
  const real = new Set(plan.filter((shot) => shot.type === "licensed-still" || shot.type === "stock-video").map(key));
  const cards = new Set(plan.filter((shot) => shot.type === "number-card").map(key));
  let maxStaticSeconds = 0;
  let runSource = null;
  let runSeconds = 0;
  for (const shot of plan) {
    // An explainer animates throughout; it is not a static hold.
    if (shot.type === "explainer") { runSource = null; runSeconds = 0; continue; }
    if (key(shot) === runSource) runSeconds += shot.duration;
    else { runSource = key(shot); runSeconds = shot.duration; }
    maxStaticSeconds = Math.max(maxStaticSeconds, runSeconds);
  }
  const first = plan[0];
  const openingHookCovered = !!first && first.claimIndex === 0 && (first.type !== "number-card" || first.numbers.every((token) => first.claimText.includes(token)));
  const cardNumbersValid = plan.filter((shot) => shot.type === "number-card")
    .every((shot) => shot.numbers.length > 0 && shot.numbers.every((token) => shot.claimText.includes(token)));
  const openingSemantic = topic && first ? semanticVisualEvidence(topic, first) : { measured: false, relevant: null, reason: "topic not supplied to semantic visual audit" };
  const uses = new Map();
  for (const shot of plan) uses.set(key(shot), (uses.get(key(shot)) || 0) + 1);
  // Per-shot relevance judged on the asset itself (file, caption), never on
  // the narration it sits under, so filler cannot borrow the line's words.
  const shotRelevant = (shot) => shot.type === "explainer" || (shot.type === "number-card" && shot.numbers.length > 0)
    || (["licensed-still", "stock-video"].includes(shot.type) && !!topic && semanticVisualEvidence(topic, { type: shot.type, still: shot.still, clip: shot.clip, claimText: shot.claimText }).relevant);
  const totalSeconds = plan.reduce((sum, shot) => sum + shot.duration, 0) || 1;
  const relevantSeconds = plan.filter(shotRelevant).reduce((sum, shot) => sum + shot.duration, 0);
  const lastClaim = plan.length ? Math.max(...plan.map((shot) => shot.claimIndex)) : -1;
  const payoffShots = plan.filter((shot) => shot.claimIndex === lastClaim && !shot.loopBack);
  return {
    strict: !!topic && topic.channel === "behind-the-ordinary",
    maxVisualUses: Math.max(0, ...uses.values()),
    explainerShots: plan.filter((shot) => shot.type === "explainer").length,
    proceduralShots: plan.filter((shot) => shot.type === "procedural").length,
    relevantShare: Math.round(relevantSeconds / totalSeconds * 1000) / 1000,
    irrelevantShots: plan.filter((shot) => !shotRelevant(shot)).map((shot) => ({ shot: shot.shot, type: shot.type, asset: shot.still ? shot.still.file : shot.clip ? shot.clip.id : shot.sourceId, line: shot.claimText })),
    payoffCovered: payoffShots.some((shot) => shot.type === "explainer" || (shot.type === "licensed-still" && shot.kind === "diagram" && shotRelevant(shot))),
    shotTypes: plan.map((shot) => shot.type),

    distinctVisuals: distinct.size,
    realImageCount: real.size,
    numberCardCount: cards.size,
    maxStaticSeconds: Math.round(maxStaticSeconds * 1000) / 1000,
    visualChanges: plan.length,
    openingHookCovered,
    cardNumbersValid,
    openingSemantic,
  };
}

function evaluateVisualQuality(metrics) {
  const reasons = [];
  if (!metrics || metrics.distinctVisuals < 5) reasons.push(`distinct visuals ${metrics && metrics.distinctVisuals || 0} < 5`);
  if (!metrics || (metrics.realImageCount < 2 && metrics.numberCardCount < 5)) reasons.push(`requires 2 licensed real images or 5 number cards (got ${metrics && metrics.realImageCount || 0} images, ${metrics && metrics.numberCardCount || 0} cards)`);
  if (!metrics || metrics.maxStaticSeconds > MAX_HOLD_SECONDS) reasons.push(`maximum static hold ${metrics && metrics.maxStaticSeconds || 0}s > ${MAX_HOLD_SECONDS}s`);
  if (!metrics || !metrics.openingHookCovered) reasons.push("first visual does not cover the opening hook");
  if (!metrics || !metrics.cardNumbersValid) reasons.push("number card contains a value absent from its narration line");
  if (!metrics || !metrics.openingSemantic || (metrics.openingSemantic.measured && !metrics.openingSemantic.relevant)) {
    reasons.push(metrics && metrics.openingSemantic && metrics.openingSemantic.reason || "opening semantic relevance was not measured");
  }
  let relevance = 100;
  if (metrics && metrics.strict) {
    // The Hidden Logic of Things: every visual must explain its line.
    if (metrics.maxVisualUses > 2) reasons.push(`excessive duplicate visuals: one visual used ${metrics.maxVisualUses} times`);
    if (metrics.visualChanges && metrics.distinctVisuals / metrics.visualChanges < 0.6) reasons.push(`slideshow: ${metrics.distinctVisuals} distinct visuals across ${metrics.visualChanges} shots`);
    if (metrics.proceduralShots > 0) reasons.push(`${metrics.proceduralShots} generic procedural filler frame(s)`);
    if (metrics.relevantShare < 0.9) reasons.push(`visual/narration mismatch: only ${Math.round(metrics.relevantShare * 100)}% of screen time shows a subject-specific visual`);
    if (!metrics.payoffCovered) reasons.push("payoff line has no explanatory diagram");
    relevance = Math.round(metrics.relevantShare * 100);
  }
  const score = Math.max(0, Math.min(relevance, 100) - reasons.length * 20);
  return { decision: reasons.length ? "BLOCK" : "PUBLISH", score, reasons, semanticEvidence: metrics && metrics.openingSemantic || null };
}

const PERSON_FILE = /\b(Miss|Mrs?|Ms|Mme|Mlle|Dr|Sir|Lady|Lord|portrait|gagnante|winner|actress|actor|singer)\b|\b[A-Z][a-z]+[A-Z][a-z]+\.(jpe?g|png)\b/;

function wikiTitles(topic) {
  const titles = [];
  // A researched record may name the articles its pictures should come from.
  for (const title of Array.isArray(topic.visualArticles) ? topic.visualArticles : []) if (title && !titles.includes(title)) titles.push(String(title));
  // CriticalThread research stores citations in sources/researchEvidence rather
  // than facts. Reuse any explicit Wikipedia citations there too, otherwise CT
  // incorrectly skips the strongest curated visual source entirely.
  const rows = [
    ...(Array.isArray(topic.facts) ? topic.facts : []),
    ...(Array.isArray(topic.sources) ? topic.sources : []),
    ...(Array.isArray(topic.researchEvidence) ? topic.researchEvidence : []),
  ];
  for (const row of rows) {
    try {
      const url = new URL(row && (row.url || row.sourceUrl) || "");
      if (url.hostname !== "en.wikipedia.org" || !url.pathname.startsWith("/wiki/")) continue;
      const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
      if (title && !titles.includes(title)) titles.push(title);
    } catch (error) {}
  }
  // CT records are often sourced from NIST/manufacturer pages and therefore
  // have no Wikipedia URL. Their canonical subject is still a safe candidate
  // article title: Commons article lookup simply returns no images when the
  // title does not exist, while valid titles unlock editor-curated media.
  if (topic.channel === "critical-thread" && topic.canonicalTopic && !titles.length) {
    titles.push(String(topic.canonicalTopic));
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

function curatedVisuals(topic) {
  return (Array.isArray(topic && topic.curatedVisuals) ? topic.curatedVisuals : []).filter((item) => {
    try {
      const host = new URL(item.imageUrl).hostname;
      return /^https:/.test(item.imageUrl) && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(host) && item.file && item.sourceUrl && item.licence;
    } catch (error) { return false; }
  });
}

function loadManifest(outputDirectory, topic = null) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath(outputDirectory), "utf8"));
    if (manifest.schemaVersion !== CACHE_SCHEMA) return null;
    if (topic && curatedVisuals(topic).some((item) => !(manifest.stills || []).some((still) => still.file === item.file))) return null;
    const excluded = new Set((Array.isArray(topic && topic.excludeStills) ? topic.excludeStills : [topic && topic.excludeStills]).filter(Boolean).map(String));
    const stills = (manifest.stills || [])
      .filter((still) => !excluded.has(still.file))
      .filter((still) => !topic || topic.channel !== "behind-the-ordinary" || still.origin === "wikipedia-article" || still.origin === "curated-licensed" || fileNamesSubject(topic, still))
      .map((still) => ({ ...still, path: path.join(cacheDirectory(outputDirectory), still.cachedFile) }));
    const clips = (manifest.clips || []).map((clip) => ({ ...clip, path: path.join(cacheDirectory(outputDirectory), clip.cachedFile) }));
    if (!stills.every((still) => fs.existsSync(still.path)) || !clips.every((clip) => fs.existsSync(clip.path))) return null;
    return { ...manifest, stills, clips };
  } catch (error) { return null; }
}

// Order of candidate stills: the story's own article first (then NASA's
// subject search, then background articles); within an article, pictures that
// name the story's subject; then keyword relevance. Mutates and returns items.
function orderStills(items, articles = [], relevanceTerms = []) {
  const relevance = (item) => relevanceTerms.filter((word) => `${item.file} ${item.description || ""}`.toLowerCase().includes(word)).length;
  const rank = (item) => Number.isFinite(item.articleRank) ? item.articleRank : articles.length;
  // Within an article, pictures that name the story's subject lead: the Mont
  // Blanc Tunnel article also carries Gotthard ventilation-plant photos, and a
  // keyword score alone ("ventilation") put those first.
  const titleTerms = [...new Set(String(articles[0] || "").replace(/\([^)]*\)/g, " ").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !["the", "and", "for", "of"].includes(word)))];
  const titleHits = (item) => titleTerms.filter((word) => `${item.file} ${item.description || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").includes(word)).length;
  return items.sort((a, b) => rank(a) - rank(b) || titleHits(b) - titleHits(a) || relevance(b) - relevance(a) || b.score - a.score || a.file.localeCompare(b.file));
}

async function prepareAssets(topic, outputDirectory) {
  const cached = loadManifest(outputDirectory, topic);
  if (cached) return cached;
  const Commons = require("../../scripts/fr-library/build");
  const directory = cacheDirectory(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const baseCached = loadManifest(outputDirectory);
  // A verified topic may name an exact licensed explainer asset. Enrich an
  // existing cache in place instead of repeating broad network searches.
  if (baseCached && curatedVisuals(topic).length) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath(outputDirectory), "utf8"));
    for (const item of curatedVisuals(topic)) {
      if ((manifest.stills || []).some((still) => still.file === item.file)) continue;
      const response = await Commons.get(item.imageUrl, { binary: true });
      if (!(response.status >= 200 && response.status < 300) || !Buffer.isBuffer(response.body) || !response.body.length) continue;
      const extension = /\.png(?:$|\?)/i.test(item.imageUrl) || /\.png$/i.test(item.file) ? ".png" : ".jpg";
      const cachedFile = shortHash(item.file) + extension;
      fs.writeFileSync(path.join(directory, cachedFile), response.body);
      manifest.stills.unshift({ ...item, cachedFile, origin: "curated-licensed", articleRank: -1 });
    }
    fs.writeFileSync(manifestPath(outputDirectory), JSON.stringify(manifest, null, 2) + "\n");
    const enriched = loadManifest(outputDirectory, topic);
    if (enriched) return enriched;
  }
  const picked = curatedVisuals(topic).map((item) => ({ ...item, origin: "curated-licensed", articleRank: -1 }));
  const excluded = (Array.isArray(topic.excludeStills) ? topic.excludeStills : [topic.excludeStills]).filter(Boolean).map(String);
  const used = new Set([...excluded, ...picked.map((item) => item.file)]);
  const articles = wikiTitles(topic);

  // articleRank: the story's own article (first fact) leads; a broader
  // background article (tunnel ventilation for the Mont Blanc fire) follows.
  for (const [articleRank, article] of articles.entries()) {
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
      if (!used.has(item.file)) { picked.push({ ...item, articleRank }); used.add(item.file); }
      if (picked.length >= MAX_STILLS) break;
    }
  }

  // Some Wikipedia pages intentionally use diagrams only. A tightly filtered
  // Commons search is the secondary source; the same licence, safety, size and
  // subject-title/description rules still apply. It runs only when the article
  // itself has too few pictures: a broad search returns loosely related photos
  // (an aircraft "over the Atlantic" for an ocean-current topic).
  // Keep the secondary Commons search aligned with the production pre-check:
  // a topic with 2–3 licensed visuals is still short of the four-image floor.
  if (picked.length < 4) {
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

  // An everyday-object word can be a surname ("Miss Constance Jeans" for
  // jeans). Outside the topic's own articles, The Hidden Logic of Things drops
  // portraits and honorific-titled files.
  if (topic.channel === "behind-the-ordinary") {
    for (let index = picked.length - 1; index >= 0; index -= 1) {
      if (picked[index].origin !== "wikipedia-article" &&
        (PERSON_FILE.test(`${picked[index].file} ${picked[index].description || ""}`) || !fileNamesSubject(topic, picked[index]))) picked.splice(index, 1);
    }
  }

  const relevanceTerms = [...new Set(subjectPhrases(topic, articles[0] || "").join(" ").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !["what", "with", "from", "into", "that", "this", "showing", "diagram", "comparison"].includes(word)))];
  // Diagrams are kept only from the topic's own Wikipedia article, where an
  // editor placed them; a keyword search turns up unrelated schematics (a
  // military "defence system" sketch for a tunnel ventilation system).
  for (let index = picked.length - 1; index >= 0; index -= 1) {
    if (picked[index].origin !== "wikipedia-article" && stillKind(picked[index]) === "diagram") picked.splice(index, 1);
  }

  // Articles about oceans, planets or the Sun often carry only paper figures.
  // NASA's public-domain library fills in photographs (core/rendering/nasa-images.js
  // decides rights and relevance). A NASA outage only means fewer pictures.
  if (picked.filter((item) => stillKind(item) === "photo").length < 3 && picked.length < MAX_STILLS && process.env.NASA_IMAGES !== "0") {
    try {
      const found = await require("./nasa-images").search(topic, MAX_STILLS - picked.length, Commons.get, used);
      // NASA's topic search is subject-specific (real Europa photographs), so it
      // ranks right after the story's own article.
      for (const item of found) {
        if (!used.has(item.file)) { picked.push({ ...item, articleRank: 0.5 }); used.add(item.file); }
      }
    } catch (error) {}
  }
  orderStills(picked, articles, relevanceTerms);

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
      trademarkNotice: item.trademarkNotice || null,
      origin: item.origin,
      score: item.score,
      articleRank: Number.isFinite(item.articleRank) ? item.articleRank : articles.length,
    });
  }
  // Moving footage (core/rendering/stock-footage.js) when a Pexels key is
  // configured; without one, or when Pexels fails, the Short uses stills only.
  // NASA visualizations first (real data, public domain, no key), then Pexels
  // for the remaining clip slots.
  let clips = [];
  if (process.env.NASA_VIDEOS !== "0") {
    try { clips = await require("./nasa-videos").search(topic, directory); } catch (error) { clips = []; }
  }
  const pexelsKey = process.env.PEXELS_KEY;
  const StockFootage = require("./stock-footage");
  if (pexelsKey && process.env.STOCK_FOOTAGE !== "0" && clips.length < StockFootage.MAX_CLIPS) {
    try { clips = clips.concat(await StockFootage.search(topic, directory, pexelsKey, { limit: StockFootage.MAX_CLIPS - clips.length })); } catch (error) {}
  }
  const manifest = { schemaVersion: CACHE_SCHEMA, topicId: topic.id, stills, clips };
  fs.writeFileSync(manifestPath(outputDirectory), JSON.stringify(manifest, null, 2) + "\n");
  return loadManifest(outputDirectory, topic) || { ...manifest, stills: [] };
}

// A reviewed, licence-checked set of stills committed under
// channels/<channel>/assets/visual-packs/<slug>/ seeds the cache, so a run
// never depends on live downloads for a topic a human already approved.
function seedFromVisualPack(topic, outputDirectory) {
  if (!topic || !topic.channel || !topic.slug) return false;
  const pack = path.join(ROOT, "channels", topic.channel, "assets", "visual-packs", topic.slug);
  if (!fs.existsSync(path.join(pack, "manifest.json")) || fs.existsSync(manifestPath(outputDirectory))) return false;
  fs.mkdirSync(cacheDirectory(outputDirectory), { recursive: true });
  for (const file of fs.readdirSync(pack)) fs.copyFileSync(path.join(pack, file), path.join(cacheDirectory(outputDirectory), file));
  return true;
}

function prepareAssetsSync(topicFile, outputDirectory) {
  let topic = null;
  try { topic = JSON.parse(fs.readFileSync(topicFile, "utf8")); } catch (error) {}
  if (seedFromVisualPack(topic, outputDirectory)) console.log(`visual pack: seeded ${topic.slug} from channels/${topic.channel}/assets/visual-packs`);
  const cached = loadManifest(outputDirectory, topic);
  if (cached) return cached;
  const result = cp.spawnSync(process.execPath, [path.join(ROOT, "scripts", "ib-ct-visual-cache.js"), topicFile, outputDirectory], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 480000,
    env: process.env,
  });
  const loaded = loadManifest(outputDirectory, topic);
  if (result.status === 0 && loaded) return loaded;
  // Surface the cause in CI logs instead of failing silently into the gate.
  console.log(`::warning::visual cache failed for ${topic && topic.slug || topicFile}: ${String(result.stderr || (result.error && result.error.message) || "status " + result.status).trim().slice(-600)}`);
  return { schemaVersion: CACHE_SCHEMA, topicId: null, stills: [], error: (result.stderr || result.error && result.error.message || "visual cache preparation failed").trim() };
}

function attributionLines(stills, clips = []) {
  return [
    ...(stills || []).map((still) => `- ${still.file} — ${still.author}; ${still.licence}; ${still.sourceUrl}`),
    ...(clips || []).map((clip) => clip.origin === "nasa-video"
      ? `- NASA video: ${clip.file} — ${clip.author}; ${clip.licence}; ${clip.sourceUrl}`
      : `- Stock footage: Pexels / ${clip.author}; ${clip.licence}; ${clip.sourceUrl}`),
  ];
}

module.exports = { seedFromVisualPack, PERSON_FILE,
  loopBack, orderStills,
  CACHE_SCHEMA, MAX_HOLD_SECONDS, GENERIC_VISUAL_TERMS, numberTokens, stillKind, cardTokens, semanticTerms, fileNamesSubject, semanticVisualEvidence, detailStill, openingVariant, buildVisualPlan, visualMetrics, evaluateVisualQuality,
  wikiTitles, curatedVisuals, prepareAssets, prepareAssetsSync, loadManifest, attributionLines,
};
