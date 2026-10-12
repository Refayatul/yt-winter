"use strict";

// Observed competitor signal for one topic, from channels/<slug>/intel/competitor-insights.json.
// Shared by the research queue and by Shorts topic ranking (core/growth/context.js), so there is one
// definition and no second topic engine. Public counts only; null means "no snapshot", never "no demand".
//   demand      0-100: distinct competitor channels with an outlier on the same subject (40 each) + 10 per outlier
//   saturation  number of competitor videos on the same subject, whatever their performance
const fs = require("fs");
const path = require("path");
const Insights = require("./competitor-insights");

const cache = new Map();
function load(channel) {
  if (cache.has(channel.slug)) return cache.get(channel.slug);
  let insights = null;
  try { insights = JSON.parse(fs.readFileSync(path.join(channel.paths.base, "intel", "competitor-insights.json"), "utf8")); } catch (e) { insights = null; }
  const value = insights && Array.isArray(insights.records) ? { snapshot: insights.snapshot || null, records: insights.records.map((r) => ({ ...r, _words: Insights.subjectWords(r.video.title) })) } : null;
  cache.set(channel.slug, value);
  return value;
}
const clearCache = () => cache.clear();

function forTopic(topic, insights) {
  if (!insights) return { demand: null, saturation: null, matches: [], snapshot: null };
  const words = Insights.subjectWords(topic.title || topic.question || "");
  const same = insights.records.filter((r) => (r._words || Insights.subjectWords(r.video.title)).filter((w) => words.includes(w)).length >= 2);
  const outliers = same.filter((r) => r.classification === "breakout" || r.classification === "outperformer");
  return {
    demand: Math.min(100, new Set(outliers.map((r) => r.channel.id)).size * 40 + outliers.length * 10), saturation: same.length,
    matches: same.slice(0, 5).map((r) => ({ channel: r.channel.name, title: r.video.title, url: r.video.url, classification: r.classification, views: r.observed.views })), snapshot: insights.snapshot,
  };
}

// Ranking adjustment, applied only when growth config sets competitorSignal.weight > 0 (default 0: the
// signal is computed and logged, ranking is unchanged). Bounded to +/-10 SelectionScore points.
function adjustment(signal, weight) {
  if (!(weight > 0) || !signal || signal.demand == null) return 0;
  const raw = weight * (signal.demand - 6 * Math.max(0, signal.saturation - 2));
  return Math.max(-10, Math.min(10, Math.round(raw * 10) / 10));
}

module.exports = { load, forTopic, adjustment, clearCache };
