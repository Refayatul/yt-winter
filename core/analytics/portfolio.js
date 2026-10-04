"use strict";

const fs = require("fs");
const path = require("path");
const Channel = require("../channel-context");
const Library = require("./library-health");
const GrowthStore = require("../growth/store");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function latestMetric(row, key) {
  const checkpoints = Object.values(row && row.checkpoints || {}).filter((item) => item && item.metrics);
  checkpoints.sort((a, b) => Date.parse(a.collectedAt || 0) - Date.parse(b.collectedAt || 0));
  const metric = checkpoints.length && checkpoints[checkpoints.length - 1].metrics[key];
  if (metric && Number.isFinite(metric.value)) return metric.value;
  const direct = row && row.metrics && row.metrics[key];
  if (Number.isFinite(direct)) return direct;
  if (direct && Number.isFinite(direct.value)) return direct.value;
  return null;
}

function derivedShortMetrics(channel) {
  const rows = GrowthStore.readState(channel, "growth", "performance.json", []).filter((row) => row && row.contentType === "short");
  const apv = [];
  const subs = [];
  const shares = [];
  for (const row of rows) {
    const value = latestMetric(row, "average_percentage_viewed");
    if (Number.isFinite(value)) apv.push(value);
    if (row.normalized && Number.isFinite(row.normalized.subscribersPer1000Views)) subs.push(row.normalized.subscribersPer1000Views);
    const views = latestMetric(row, "views");
    const shareCount = latestMetric(row, "shares");
    if (Number.isFinite(views) && views > 0 && Number.isFinite(shareCount)) shares.push(shareCount / views * 1000);
  }
  const round = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  return {
    sampleSize: rows.length,
    retentionSamples: apv.length,
    conversionSamples: subs.length,
    shareSamples: shares.length,
    averagePercentViewed: round(median(apv)),
    subscribersPer1000Views: round(median(subs)),
    sharesPer1000Views: round(median(shares)),
  };
}

function latestChannelSnapshot(channel) {
  const dir = path.join(channel.paths.analytics, "kanal");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort() : [];
  return files.length ? read(path.join(dir, files[files.length - 1]), null) : read(path.join(channel.paths.analytics, "baseline.json"), null);
}

function channelMetrics(channel) {
  const snapshot = latestChannelSnapshot(channel) || {};
  const derived = derivedShortMetrics(channel);
  const published = read(path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "yayinlananlar.json" : "published.json"), []);
  const health = Library.calculate(channel);
  return {
    channel: channel.slug,
    name: channel.name,
    subscribers: snapshot.subscribers ?? null,
    views: snapshot.views ?? null,
    watchHours: snapshot.watchHours ?? null,
    shortsFeedPercent: snapshot.shortsFeedPercent ?? null,
    ctr: snapshot.ctr ?? null,
    averagePercentViewed: snapshot.averagePercentViewed ?? derived.averagePercentViewed,
    subscribersPer1000Views: snapshot.subscribersPer1000Views ?? derived.subscribersPer1000Views,
    sharesPer1000Views: snapshot.sharesPer1000Views ?? derived.sharesPer1000Views,
    analyticsSamples: {
      shorts: derived.sampleSize,
      retention: derived.retentionSamples,
      subscriberConversion: derived.conversionSamples,
      shares: derived.shareSamples,
    },
    publishingSuccess: published.length ? Math.round(published.filter((item) => item.videoId).length / published.length * 1000) / 10 : null,
    libraryDaysRemaining: health.daysOfInventory,
    bestTopic: snapshot.bestTopic ?? null,
    bestCategory: snapshot.bestCategory ?? null,
    productionCost: snapshot.productionCost ?? null,
    systemHealth: health.acceptance.passes ? "healthy" : "library-low",
  };
}

function compare(rows) {
  const valid = (key) => rows.filter((row) => row[key] != null).sort((a, b) => b[key] - a[key]);
  const leader = (key) => valid(key)[0] ? valid(key)[0].channel : "unavailable";
  return {
    fasterGrowth: leader("subscribers"),
    betterRetention: leader("averagePercentViewed"),
    betterSubscriberConversion: leader("subscribersPer1000Views"),
    betterShareability: leader("sharesPer1000Views"),
    cheaperToProduce: valid("productionCost").sort((a, b) => a.productionCost - b.productionCost)[0]?.channel || "unavailable",
  };
}

function build() {
  const rows = Object.keys(Channel.registry().channels).map((slug) => channelMetrics(Channel.getChannel(slug)));
  return { generatedAt: new Date().toISOString(), channels: rows, comparison: compare(rows) };
}

module.exports = { latestChannelSnapshot, derivedShortMetrics, channelMetrics, compare, build };
