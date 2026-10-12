#!/usr/bin/env node
"use strict";
// Read-only ProfitDecoded channel activity: what is actually on the channel, including videos the owner
// uploaded by hand in YouTube Studio (automatic publishing is disabled, so the repository never learns
// about those uploads on its own).
//
//   node scripts/profitdecoded/channel-activity.js [--write] [--no-analytics]
//
// Uses only the PD_YT_* credentials. Every request passes an allowlist: the OAuth refresh/token-info
// calls, GET reads of channels / playlistItems / videos, and GET YouTube Analytics reports. Anything else
// is refused before it leaves the process. Tokens and secrets are never printed.
// --write stores channels/profitdecoded/state/channel-activity.json and registers manual uploads in
// channels/profitdecoded/state/manual-uploads.json (read by analytics-sync.js), never published.json.
//
// Metrics are recorded only when the API returns them. Impressions and impressions CTR are not exposed by
// the YouTube Analytics API (YouTube Studio only) and are recorded as unavailable, never as zero. Analytics
// rows lag 1-3 days; an empty report for a recent video is "not yet available", not zero views.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const YouTube = require(path.join(root, "lib/yt"));

const SLUG = "profitdecoded";
const ALLOWED = [
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/token$/ },
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/tokeninfo$/ },
  { method: "GET", host: "www.googleapis.com", path: /^\/youtube\/v3\/(channels|playlistItems|videos)\?/ },
  { method: "GET", host: "youtubeanalytics.googleapis.com", path: /^\/v2\/reports\?/ },
];
const UNAVAILABLE = { impressions: "not exposed by the YouTube Analytics API (YouTube Studio only)", impressionsCtr: "not exposed by the YouTube Analytics API (YouTube Studio only)" };

function readOnlyRequest(inner = YouTube.istek, log = []) {
  return (opt = {}, body) => {
    const method = String(opt.method || "GET").toUpperCase(); const host = String(opt.hostname || ""); const p = String(opt.path || "");
    const allowed = ALLOWED.some((a) => a.method === method && a.host === host && a.path.test(p));
    log.push({ method, host, path: p.split("?")[0], allowed });
    if (!allowed) return Promise.reject(Object.assign(new Error(`read-only activity check refused ${method} ${host}${p.split("?")[0]}`), { code: "BLOCKED_NON_READ_REQUEST" }));
    return inner(opt, body);
  };
}

const day = (d) => new Date(d).toISOString().slice(0, 10);

// Lifetime per-video analytics, traffic sources and the retention curve. Missing = reported, not zeroed.
async function videoAnalytics(api, video, today) {
  const start = day(video.snippet.publishedAt); const base = { startDate: start, endDate: today, filters: `video==${video.id}` };
  const totals = YouTube.satirlar(await api.analytics({ ...base, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares" }))[0] || null;
  const traffic = YouTube.satirlar(await api.analytics({ ...base, dimensions: "insightTrafficSourceType", metrics: "views,estimatedMinutesWatched", sort: "-views" }));
  const retention = YouTube.satirlar(await api.analytics({ ...base, dimensions: "elapsedVideoTimeRatio", metrics: "audienceWatchRatio,relativeRetentionPerformance" }));
  return {
    window: `${start}..${today}`,
    totals: totals || null, totalsStatus: totals ? "reported" : "not yet available (analytics lag 1-3 days) or no data",
    trafficSources: traffic, retentionCurve: retention.length ? retention : null, ...UNAVAILABLE,
  };
}

async function run(options = {}) {
  const channel = Channel.selectChannel(SLUG);
  const log = [];
  const client = await YouTube.getYouTubeClient(channel, { request: readOnlyRequest(options.inner, log) });
  const { kanal, ids } = await YouTube.yuklemeler(client.api, 200);
  const videos = await YouTube.videolar(client.api, ids);
  const today = day(options.now || Date.now());
  const rows = [];
  for (const v of videos) {
    const row = {
      videoId: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt, durationSeconds: YouTube.sureSn(v.contentDetails.duration),
      format: YouTube.sureSn(v.contentDetails.duration) <= 180 ? "short" : "long", privacyStatus: v.status && v.status.privacyStatus,
      observed: { views: Number(v.statistics.viewCount), likes: v.statistics.likeCount != null ? Number(v.statistics.likeCount) : null, comments: v.statistics.commentCount != null ? Number(v.statistics.commentCount) : null, at: new Date(options.now || Date.now()).toISOString(), source: "YouTube Data API videos.list" },
    };
    if (options.analytics !== false) row.analytics = await videoAnalytics(client.api, v, today);
    rows.push(row);
  }
  return {
    schema: "profitdecoded.channel-activity.v1", checkedAt: new Date(options.now || Date.now()).toISOString(),
    channel: { id: kanal.id, title: kanal.snippet.title, subscribers: kanal.statistics.hiddenSubscriberCount ? null : Number(kanal.statistics.subscriberCount), views: Number(kanal.statistics.viewCount), videoCount: Number(kanal.statistics.videoCount) },
    identity: client.identity ? { matches: true } : null, videos: rows,
    requests: log.length, refusedRequests: log.filter((r) => !r.allowed).length, youtubeWriteRequests: 0,
  };
}

// Manual Studio uploads become analytics subjects without touching the publishing ledger (published.json).
function registerManualUploads(report, file) {
  let rows = []; try { rows = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { rows = []; }
  const known = new Set(rows.map((r) => r.videoId));
  for (const v of report.videos) if (!known.has(v.videoId) && v.privacyStatus === "public") rows.push({ channel: SLUG, videoId: v.videoId, title: v.title, publishAt: v.publishedAt, format: v.format, source: "manual upload (YouTube Studio), discovered by channel-activity.js" });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + "\n");
  return rows;
}

// One checkpoint row per video at the latest passed checkpoint (1h ... 30d, config/growth-engine.json),
// diagnosed by the shared growth diagnosis. With no channel baseline yet the diagnosis is INSUFFICIENT_DATA,
// which is the honest answer: low early views alone say nothing about quality.
function checkpointRows(report, options = {}) {
  const Config = require(path.join(root, "core/growth/config"));
  const Diagnosis = require(path.join(root, "core/growth/diagnosis"));
  const config = Config.forChannel(Channel.getChannel(SLUG));
  const hours = config.analytics.checkpointsHours; const labels = config.analytics.checkpointLabels;
  const now = Date.parse(report.checkedAt);
  return report.videos.map((v) => {
    const age = (now - Date.parse(v.publishedAt)) / 3600000;
    const index = hours.filter((h) => h <= age).length - 1;
    const totals = v.analytics && v.analytics.totals;
    const metrics = { views: v.observed.views, likes: v.observed.likes, comments: v.observed.comments,
      ...(totals ? { averagePercentageViewed: totals.averageViewPercentage, averageViewDuration: totals.averageViewDuration, estimatedMinutesWatched: totals.estimatedMinutesWatched, subscribersGained: totals.subscribersGained, subscribersPer1000Views: v.observed.views ? Math.round(totals.subscribersGained / v.observed.views * 1000 * 10) / 10 : null } : {}) };
    const checkpoint = index >= 0 ? labels[index] : "pre-1h";
    const row = { videoId: v.videoId, channel: SLUG, contentType: v.format === "short" ? "short" : "long", durationSeconds: v.durationSeconds, metrics, retention: null };
    return { videoId: v.videoId, checkpoint, ageHours: Math.round(age * 10) / 10, at: report.checkedAt, metrics, unavailable: UNAVAILABLE,
      analyticsStatus: v.analytics ? v.analytics.totalsStatus : "skipped", diagnosis: Diagnosis.diagnose(row, options.baselines || {}, config, { checkpoint }).diagnoses };
  });
}

function appendCheckpoints(rows, file) {
  let history = []; try { history = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { history = []; }
  for (const row of rows) { history = history.filter((h) => !(h.videoId === row.videoId && h.checkpoint === row.checkpoint)); history.push(row); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history, null, 1) + "\n");
  return history;
}

if (require.main === module) {
  process.env.QUOTA_LEDGER = process.env.QUOTA_LEDGER || "0";
  const argv = process.argv.slice(2);
  run({ analytics: !argv.includes("--no-analytics") }).then((report) => {
    if (argv.includes("--write")) {
      const state = Channel.getChannel(SLUG).paths.state;
      fs.writeFileSync(path.join(state, "channel-activity.json"), JSON.stringify(report, null, 2) + "\n");
      registerManualUploads(report, path.join(state, "manual-uploads.json"));
      appendCheckpoints(checkpointRows(report), path.join(state, "growth", "checkpoints.json"));
    }
    console.log(JSON.stringify({ channel: report.channel, videos: report.videos.map((v) => ({ videoId: v.videoId, title: v.title, publishedAt: v.publishedAt, format: v.format, privacy: v.privacyStatus, views: v.observed.views, likes: v.observed.likes, comments: v.observed.comments, analytics: v.analytics ? v.analytics.totalsStatus : "skipped" })), refusedRequests: report.refusedRequests, youtubeWriteRequests: 0 }, null, 1));
  }).catch((error) => { console.error(`channel activity check failed: ${error.code || ""} ${String(error.message).slice(0, 200)}`); process.exitCode = 4; });
}

module.exports = { run, readOnlyRequest, registerManualUploads, checkpointRows, appendCheckpoints, ALLOWED, UNAVAILABLE };
