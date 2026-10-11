"use strict";

// Shorts craft v2 (experimental, OFF by default). Changes that came out of the
// 2026-10-11 creative audit of published Shorts (docs/growth/SHORTS-CREATIVE-AUDIT.md):
//   * the first frame is the most vivid picture of the hook's subject, never a data map or chart;
//   * a picture is shown at most three times, and every return is a tighter detail crop on another
//     region, so a repeat reads as a new shot instead of the same slide;
//   * the hook words are large, on two lines, over a readability band;
//   * narration breathes like a read, not a list: a beat after the hook and before the payoff,
//     shorter joins between connected lines, and an unhurried payoff.
// Enabled per run with SHORTS_CRAFT_V2=1 (all channels) or a comma list of channel slugs. A running
// growth experiment on `opening_visual` whose arm value is "craft-v2-opening" turns on the opening
// change alone for that video, so a controlled test changes one variable.
// Nothing here changes facts, scripts, sources or gates.

function enabled(channelSlug, env = process.env) {
  const value = String(env.SHORTS_CRAFT_V2 || "").trim();
  if (!value || value === "0") return false;
  if (value === "1" || value === "all") return true;
  return value.split(",").map((item) => item.trim()).includes(String(channelSlug || ""));
}

// Data figures stay readable only whole and cannot carry a first frame; illustrations
// (artist's impressions, cutaways, renderings) and photographs can.
const DATA_FIGURE_RE = /\b(?:graph|chart|plot|map|schematic|timeline|data|anomal\w*|topograph\w*|gravity|radar|table|curve|projection|trend|infographic|cross[- ]section|tectonics|svg|figure|fig|sketch map|locator)\b/i;
const ILLUSTRATION_RE = /\b(?:artist'?s?|impression|illustration|rendering|render|cutaway|concept|painting|reconstruction)\b/i;

function figureType(still) {
  const text = `${still.file || ""} ${still.description || ""} ${still.title || ""}`.replace(/[_]/g, " ");
  if (DATA_FIGURE_RE.test(text) || /\.(?:svg|gif)$/i.test(still.file || "")) return "data";
  if (ILLUSTRATION_RE.test(text)) return "illustration";
  return "photo";
}

const words = (value) => new Set(String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));

// Higher is a stronger first frame: shares words with the hook line or the topic's event, and
// is a photograph or illustration rather than a data figure.
function openingImpact(still, topic, hookText) {
  const assetWords = words([still.file, still.description, still.title].join(" "));
  const hookWords = words([hookText, topic && topic.thumbnailText, topic && topic.openingLine].join(" "));
  const subjectWords = words([topic && topic.canonicalTopic, topic && topic.scenario, topic && topic.event, topic && topic.topic].join(" "));
  const hookHits = [...assetWords].filter((word) => hookWords.has(word)).length;
  const subjectHits = [...assetWords].filter((word) => subjectWords.has(word)).length;
  const type = figureType(still);
  return hookHits * 2 + subjectHits + (type === "illustration" ? 3 : type === "photo" ? 2 : -6);
}

// Measured brightness and contrast of a picture in its 9:16 crop (0-255): mean luma, and the
// spread between the 10th and 90th percentiles. Null when the file cannot be read.
function frameStats(still) {
  const file = still && still.path;
  if (!file || !require("fs").existsSync(file)) return null;
  try {
    const out = require("child_process").spawnSync(require("../../ff-yol").ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-frames:v", "1",
      "-vf", "scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,scale=180:320,signalstats,metadata=print", "-f", "null", "-"], { encoding: "utf8", timeout: 20000 }).stderr;
    const get = (key) => Number((out.match(new RegExp(`${key}=([0-9.]+)`)) || [])[1]);
    const stats = { yavg: get("YAVG"), spread: get("YHIGH") - get("YLOW") };
    return Number.isFinite(stats.yavg) && Number.isFinite(stats.spread) ? stats : null;
  } catch (error) { return null; }
}

// A dark or flat picture loses the first glance on a phone screen (measured on 2026-10-11: the ice
// Short's anchor-ice opening averaged 64/255 with a 91-level spread; the dinosaur illustration 121
// and 207). Up to -3 points, comparable to one subject-word match.
function legibility(stats) {
  if (!stats) return 0;
  const dark = stats.yavg < 80 ? (80 - stats.yavg) / 8 : 0;
  const flat = stats.spread < 110 ? (110 - stats.spread) / 20 : 0;
  return -Math.min(3, dark + flat);
}

// The opening still: the best-scoring picture, only if it is not a data figure. `measure` (frameStats
// in rendering) adds the legibility term; without it the choice is by subject match alone.
function chooseOpening(stills, topic, hookText, measure = null) {
  let best = null;
  let bestScore = -Infinity;
  for (const still of stills) {
    if (figureType(still) === "data") continue;
    const score = openingImpact(still, topic, hookText) + (measure ? legibility(measure(still)) : 0);
    if (score > bestScore) { best = still; bestScore = score; }
  }
  return best;
}

// Grade for a dark opening picture that still won (gentle: brighter mid-tones, a little contrast).
function openingLift(stats) {
  if (!stats || stats.yavg >= 85) return "";
  return ",eq=brightness=0.04:contrast=1.10:gamma=1.18";
}

// Hook words on one or two balanced lines, sized to the longest line.
function hookLines(text, maxChars = 14) {
  const value = String(text || "").trim();
  if (value.length <= maxChars || !value.includes(" ")) return [value];
  const middle = value.length / 2;
  let split = -1;
  for (let i = 0; i < value.length; i += 1) if (value[i] === " " && (split < 0 || Math.abs(i - middle) < Math.abs(split - middle))) split = i;
  return [value.slice(0, split).trim(), value.slice(split + 1).trim()];
}

function hookFontSize(lines, maximum = 132) {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return Math.max(56, Math.min(maximum, Math.floor(980 / (longest * 0.66))));
}

// A spoken figure with three or more decimals ("11.611 kilometres") is read as "about 11.6"; the value
// stays true to the source and the listener can hold it. Already-hedged figures are left alone.
function simplifyNumbers(text) {
  return String(text).replace(/(\b(?:about|around|nearly|roughly|almost|some|over|under)\s+)?\b(\d+)\.(\d{3,})\b/gi, (match, hedge, whole, decimals) => {
    const rounded = Number(`${whole}.${decimals}`).toFixed(1).replace(/\.0$/, "");
    return `${hedge || "about "}${rounded}`;
  });
}

// Story measurements for the render report (not a score): spoken figures and cause-and-effect links.
const CAUSAL = /\b(?:because|so|which means|that means|that's why|as a result|so that|therefore|which is why|leaving|causing)\b/i;
function storyShape(lines) {
  const text = lines.join(" ");
  const figures = (text.match(/\b\d[\d,.]*\b/g) || []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return { figures, figuresPer10Words: +(figures * 10 / Math.max(1, words)).toFixed(2), causalLinks: lines.filter((line) => CAUSAL.test(line)).length, lines: lines.length };
}

// Captions under craft v2: larger, heavier and a touch higher, still inside the Shorts safe zone.
function captionStyle(base = {}) {
  return { ...base, fontSize: Math.max(Number(base.fontSize) || 0, 76), outline: Math.max(Number.isFinite(base.outline) ? base.outline : 5, 6), marginV: Math.max(Number(base.marginV) || 0, 600) };
}

// Pause after each line: a beat after the hook and before the payoff, short joins elsewhere.
// The total stays close to the uniform 0.18 s per join it replaces.
function linePauses(count) {
  return Array.from({ length: count }, (_, index) => {
    if (index === count - 1) return 0;
    if (index === 0) return 0.32;
    if (index === count - 2) return 0.36;
    return 0.13;
  });
}

// The payoff is read a little slower than the rest ("+2%" -> "-3%").
function payoffRate(rate) {
  const match = /^([+-]?\d+)%$/.exec(String(rate || "").trim());
  const base = match ? Number(match[1]) : -6;
  const value = base - 5;
  return `${value >= 0 ? "+" : ""}${value}%`;
}

// Which parts apply to one render: { opening, repeats, pacing }.
function features(channelSlug, growthPlan = null, env = process.env) {
  const all = enabled(channelSlug, env);
  const experiment = growthPlan && growthPlan.experiment;
  const openingArm = !!(experiment && experiment.variable === "opening_visual" && experiment.value === "craft-v2-opening");
  return { opening: all || openingArm, repeats: all, pacing: all, captions: all };
}

module.exports = { enabled, features, frameStats, legibility, openingLift, captionStyle, simplifyNumbers, storyShape, figureType, openingImpact, chooseOpening, hookLines, hookFontSize, linePauses, payoffRate, DATA_FIGURE_RE };
