"use strict";

// WEEKLY LEARNING SUMMARY — the part of the Monday report that says what the
// channel's own numbers are teaching, in plain words. It reads the per-video
// performance records (core/growth/analytics, 1h/12h/1d/48h checkpoints) and
// the channel's learning file (core/growth/learning: observation ->
// hypothesis -> adopted, with sample-size and significance gates).
//
// Comparisons are associations inside one channel: topic, timing and
// packaging confound each other. The summary says so and never ranks a group
// with fewer than MIN_GROUP videos.

const Titles = require("./titles");

const MIN_GROUP = 3;
const NEW_SLOT_ZONE = "America/New_York";

function metric(checkpoint, key) {
  const value = checkpoint && checkpoint.metrics && checkpoint.metrics[key];
  if (value && typeof value === "object") return Number.isFinite(value.value) ? value.value : null;
  return Number.isFinite(value) ? value : null;
}

// Views after ~one day, the comparable point for every video; the latest
// checkpoint at or past 24 h, otherwise null (too young to compare).
function dayViews(record) {
  const checkpoints = record.checkpoints || {};
  for (const label of ["1d", "24h", "48h", "2d", "3d", "7d"]) {
    const views = metric(checkpoints[label], "views");
    if (views != null) return views;
  }
  return null;
}

function averageViewed(record) {
  const checkpoints = record.checkpoints || {};
  for (const label of ["1d", "24h", "48h", "2d", "3d", "7d", "12h"]) {
    const value = metric(checkpoints[label], "average_percentage_viewed");
    if (value != null) return value;
  }
  const flat = record.metrics && record.metrics.averagePercentageViewed;
  return Number.isFinite(flat) ? flat : null;
}

function hourIn(publishAt, timeZone) {
  const date = new Date(publishAt);
  if (!Number.isFinite(date.getTime())) return null;
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
}

// Publish slot label: the old fixed 18:00 UTC (21:00 TR) or the US-evening
// 18:00 New York slot introduced on 2026-10-02.
function publishSlot(publishAt) {
  if (!publishAt) return "unknown";
  if (hourIn(publishAt, NEW_SLOT_ZONE) === 18) return "18:00 New York";
  if (new Date(publishAt).getUTCHours() === 18) return "21:00 TR";
  return `${new Date(publishAt).getUTCHours()}:00 UTC`;
}

function popularityBand(score) {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 75) return "famous";
  if (score >= 55) return "known";
  return "obscure";
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key] || "unknown";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return [...groups.entries()].map(([value, items]) => {
    const views = items.map((item) => item.views).filter((value) => value != null);
    const viewed = items.map((item) => item.viewed).filter((value) => value != null);
    return { value, n: items.length, measured: views.length, meanViews: views.length ? Math.round(mean(views)) : null,
      meanViewed: viewed.length ? Math.round(mean(viewed) * 10) / 10 : null };
  }).sort((a, b) => (b.meanViews ?? -1) - (a.meanViews ?? -1));
}

function summarize(records, learning = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const popularityFor = options.popularityFor || (() => null);
  const shorts = (records || []).filter((record) => (record.contentType || "short") === "short" && record.publishAt);
  const rows = shorts.map((record) => ({
    videoId: record.videoId, title: record.title || record.selectedTitle || record.slug, publishAt: record.publishAt,
    views: dayViews(record), viewed: averageViewed(record),
    titlePattern: record.titlePattern || (record.title ? Titles.pattern(record.title) : "unknown"),
    publishSlot: record.publishSlot || publishSlot(record.publishAt),
    popularityBand: record.popularityBand || popularityBand(popularityFor(record.slug)),
    openingVisual: record.openingVisual || "unknown",
  }));
  const weekAgo = now.getTime() - 7 * 86400000;
  const recent = rows.filter((row) => Date.parse(row.publishAt) >= weekAgo).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const shortsLearning = learning.shorts || {};
  return {
    sample: rows.length,
    measured: rows.filter((row) => row.views != null).length,
    retentionAvailable: rows.some((row) => row.viewed != null),
    recent,
    bySlot: groupBy(rows, "publishSlot"),
    byTitlePattern: groupBy(rows, "titlePattern"),
    byPopularity: groupBy(rows, "popularityBand"),
    findings: {
      adopted: shortsLearning.adopted || [],
      hypotheses: shortsLearning.hypotheses || [],
      observations: shortsLearning.observations || [],
    },
  };
}

const fmtViews = (value) => value == null ? "henüz yok" : String(value);
const fmtPct = (value) => value == null ? "—" : `%${Math.round(value)}`;

function groupLines(title, groups) {
  const usable = groups.filter((group) => group.measured >= MIN_GROUP);
  if (usable.length < 2) return [`- ${title}: karşılaştırma için yeterli veri yok (grup başına en az ${MIN_GROUP} ölçülmüş video gerekir).`];
  return [`- ${title}:`, ...usable.map((group) => `  - ${group.value}: ${group.measured} video, 1. gün ortalama **${group.meanViews}** izlenme, izlenme oranı ${fmtPct(group.meanViewed)}`)];
}

function finding(item) {
  const lift = Number.isFinite(item.lift) ? `${item.lift >= 0 ? "+" : ""}${Math.round(item.lift * 100)}%` : "?";
  return `${item.dimension} = ${item.value} (${item.sample} video, fark ${lift})`;
}

function markdown(summary) {
  const lines = ["**📈 Bu haftanın öğrenme özeti**", ""];
  if (summary.recent.length) {
    lines.push("Son 7 günün videoları (1. gün izlenme · izlenme oranı · başlık kalıbı · konu bilinirliği · yayın saati):");
    for (const row of summary.recent) {
      lines.push(`- ${row.title} — ${fmtViews(row.views)} · ${fmtPct(row.viewed)} · ${row.titlePattern} · ${row.popularityBand} · ${row.publishSlot}`);
    }
    lines.push("");
  }
  lines.push(...groupLines("Yayın saati", summary.bySlot));
  lines.push(...groupLines("Başlık kalıbı", summary.byTitlePattern));
  lines.push(...groupLines("Konu bilinirliği (Wikipedia)", summary.byPopularity));
  if (!summary.retentionAvailable) lines.push("- İzlenme oranı (%) henüz gelmedi: Analytics izni yeni token'larla açıldı, ilk ölçümler birkaç gün içinde düşer.");
  lines.push("");
  const { adopted, hypotheses, observations } = summary.findings;
  if (adopted.length) lines.push("**Uygulanan öğrenmeler** (puanlamayı etkiliyor):", ...adopted.slice(0, 5).map((item) => `- ${finding(item)}`), "");
  if (hypotheses.length) lines.push("**Hipotezler** (izleniyor, henüz uygulanmıyor):", ...hypotheses.slice(0, 5).map((item) => `- ${finding(item)}`), "");
  if (!adopted.length && !hypotheses.length) {
    lines.push(`Sistem henüz bir kural benimsemedi (${summary.measured}/${summary.sample} video ölçüldü); kural için yeterli örnek ve istatistiksel fark gerekiyor.`);
    if (observations.length) lines.push(`İlk gözlem: ${finding(observations[0])}.`);
    lines.push("");
  }
  lines.push("_Bunlar kanal içi ilişkilerdir; konu, saat ve paketleme birbirini etkiler, kesin neden-sonuç değildir._");
  return lines.join("\n");
}

module.exports = { MIN_GROUP, dayViews, averageViewed, publishSlot, popularityBand, summarize, markdown };
