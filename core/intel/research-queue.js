"use strict";

// Research queue: which unresearched topics to research next, from signals available BEFORE research.
// It decides what is worth researching; it never certifies a fact. Research itself stays in the
// existing verified pipelines (scripts/bto-research.js, scripts/ib-ct-library/build.js), which check
// verbatim quotes, numbers, sources and reachability.
//
// Signals (each reported with its components):
//   potential  growth VideoPotentialScore of the topic record (0-100, existing scorer)
//   demand     competitor outliers (channels/<slug>/intel/competitor-insights.json) on the same subject:
//              observed public counts, 0 when no outlier matches, "unknown" without a snapshot
//   saturation competitor videos on the same subject (any performance): a crowded subject needs a
//              differentiated angle, so it is penalised and flagged, never copied
//   sources    research targets listed on the record (sources / authorities / sourceRequirements)
// A topic with no source target at all is not queued (research cannot start without one).

const fs = require("fs");
const path = require("path");
const Insights = require("./competitor-insights");

const WEIGHTS = { potential: 0.6, demand: 0.25, sources: 0.15 };
const SATURATION_PENALTY = 6; // points per competitor video beyond two on the same subject, capped below
const SATURATION_CAP = 18;

function loadInsights(channel) {
  const file = path.join(channel.paths.base, "intel", "competitor-insights.json");
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
}

const overlap = (a, b) => a.filter((w) => b.includes(w)).length;

function sourceTargets(topic) {
  const raw = topic.raw || topic;
  const list = [...(raw.sources || []), ...((raw.sourceQuality && raw.sourceQuality.authorities) || []), ...(raw.sourceRequirements || [])];
  return list.length;
}

// rows: growth Context.rank rows; researched(row) tells which records already carry research.
function build(channel, rows, options = {}) {
  const insights = options.insights === undefined ? loadInsights(channel) : options.insights;
  const records = insights ? insights.records : null;
  const out = [];
  for (const row of rows) {
    if (options.researched && options.researched(row)) continue;
    const topic = row.topic; const words = Insights.subjectWords(topic.title || topic.question || "");
    const targets = sourceTargets(topic);
    if (!targets) { out.push({ topicId: topic.id, title: topic.title, queued: false, reason: "no source targets on the record: research cannot start" }); continue; }
    let demand = null; let saturation = null; const matches = [];
    if (records) {
      const same = records.filter((r) => overlap(words, Insights.subjectWords(r.video.title)) >= 2);
      const outliers = same.filter((r) => r.classification === "breakout" || r.classification === "outperformer");
      demand = Math.min(100, new Set(outliers.map((r) => r.channel.id)).size * 40 + outliers.length * 10);
      saturation = same.length;
      matches.push(...same.slice(0, 5).map((r) => ({ channel: r.channel.name, title: r.video.title, url: r.video.url, classification: r.classification, views: r.observed.views })));
    }
    const potential = Number(row.score.VideoPotentialScore) || 0;
    const sourcesScore = Math.min(100, targets * 25);
    const penalty = saturation == null ? 0 : Math.min(SATURATION_CAP, Math.max(0, saturation - 2) * SATURATION_PENALTY);
    const score = WEIGHTS.potential * potential + WEIGHTS.demand * (demand == null ? 0 : demand) + WEIGHTS.sources * sourcesScore - penalty;
    out.push({
      topicId: topic.id, slug: topic.slug, title: topic.title, cluster: topic.cluster, queued: true, priority: Math.round(score * 10) / 10,
      components: { potential, demand: demand == null ? "unknown (no competitor snapshot)" : demand, sources: targets, saturation: saturation == null ? "unknown" : saturation, saturationPenalty: penalty },
      angleNeeded: saturation != null && saturation >= 3, competitorMatches: matches,
      next: "research with the channel's verified pipeline; reject the topic if fewer than the required primary/authoritative facts are found",
    });
  }
  const queued = out.filter((r) => r.queued).sort((a, b) => b.priority - a.priority);
  return { schema: "research-queue.v1", channel: channel.slug, generatedAt: new Date().toISOString(), competitorSnapshot: insights ? insights.snapshot : null, weights: WEIGHTS, queued, skipped: out.filter((r) => !r.queued) };
}

function markdown(queue, top = 25) {
  const lines = [`# Research queue: ${queue.channel}`, "", `Generated ${queue.generatedAt}. Competitor snapshot: ${queue.competitorSnapshot || "none (demand unknown)"}. Priority = ${WEIGHTS.potential}×potential + ${WEIGHTS.demand}×demand + ${WEIGHTS.sources}×source readiness − saturation penalty. It ranks what to research; it verifies nothing.`, "",
    "| # | Topic | Potential | Demand | Sources | Similar competitor videos | Priority | Angle needed |", "|---|---|---|---|---|---|---|---|"];
  queue.queued.slice(0, top).forEach((r, i) => lines.push(`| ${i + 1} | ${r.topicId} ${String(r.title || "").replace(/\|/g, "/").slice(0, 60)} | ${r.components.potential} | ${r.components.demand} | ${r.components.sources} | ${r.components.saturation} | ${r.priority} | ${r.angleNeeded ? "yes" : ""} |`));
  lines.push("", `${queue.queued.length} queued, ${queue.skipped.length} skipped (no source targets).`, "");
  return lines.join("\n");
}

module.exports = { build, markdown, loadInsights, sourceTargets, WEIGHTS };
