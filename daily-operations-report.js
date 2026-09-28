#!/usr/bin/env node
"use strict";

// One evidence-based operational view for both channels. Unknown API-only
// metrics stay null; this report never turns missing data into zero.
const fs = require("fs");
const path = require("path");
const Channel = require("./core/channel-context");
const Library = require("./core/analytics/library-health");
const Scheduling = require("./core/scheduling");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function stateFile(channel, legacyName, isolatedName) {
  return path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? legacyName : isolatedName);
}

function metricValue(row, key) {
  const value = row && row.metrikler && row.metrikler[key];
  return value && value.durum === "ok" ? value.deger : null;
}

function derivedValue(row, key) {
  const value = row && row.turetilmis && row.turetilmis[key];
  return value && value.durum === "ok" ? value.deger : null;
}

function latestAnalytics(channel) {
  const root = channel.paths.analytics;
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root)) {
    const directory = path.join(root, name);
    if (!fs.statSync(directory).isDirectory() || name === "kanal") continue;
    const files = fs.readdirSync(directory).filter((file) => /^\d+d\.json$|^manual-.*\.json$/.test(file)).sort();
    const values = files.map((file) => read(path.join(directory, file), null)).filter(Boolean)
      .sort((a, b) => String(a.toplandi || "").localeCompare(String(b.toplandi || "")));
    if (values.length) rows.push(values[values.length - 1]);
  }
  return rows;
}

function average(values) {
  const available = values.filter((value) => Number.isFinite(value));
  return available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length * 100) / 100 : null;
}

function trafficPercent(rows, keys) {
  const values = rows.map((row) => {
    if (!Array.isArray(row.trafik) || !row.trafik.length) return null;
    return row.trafik.filter((item) => keys.includes(item.kaynak)).reduce((sum, item) => sum + item.oran, 0) * 100;
  });
  return average(values);
}

function performance(rows, format) {
  const filtered = rows.filter((row) => row.format === format);
  const views = filtered.map((row) => metricValue(row, "views")).filter(Number.isFinite);
  const totalViews = views.length ? views.reduce((sum, value) => sum + value, 0) : null;
  const median = views.length ? [...views].sort((a, b) => a - b)[Math.floor(views.length / 2)] : null;
  return {
    videosMeasured: filtered.length,
    views: totalViews,
    averageViewDuration: average(filtered.map((row) => metricValue(row, "averageViewDuration"))),
    averagePercentageViewed: average(filtered.map((row) => metricValue(row, "averageViewPercentage"))),
    subscribersPer1000Views: average(filtered.map((row) => derivedValue(row, "subsPer1000"))),
    ctr: average(filtered.map((row) => metricValue(row, "ctr"))),
    first30SecondsRetention: average(filtered.map((row) => metricValue(row, "first30sRetention"))),
    viewedVsSwipedAway: null,
    suggestedTrafficPercent: trafficPercent(filtered, ["RELATED_VIDEO"]),
    browseTrafficPercent: trafficPercent(filtered, ["BROWSE", "SUBSCRIBER", "YT_OTHER_PAGE"]),
    returningViewers: average(filtered.map((row) => metricValue(row, "returningViewers"))),
    breakoutRate: median && views.length >= 5 ? Math.round(views.filter((value) => value >= median * 2).length / views.length * 10000) / 100 : null,
  };
}

function publicationForDate(rows, date, format = "short") {
  return rows.filter((row) => (row.format || "short") === format &&
    (String(row.publishAt || "").slice(0, 10) === date || String(row.tarih || row.generatedAt || "").slice(0, 10) === date))
    .sort((a, b) => String(a.tarih || "").localeCompare(String(b.tarih || ""))).pop() || null;
}

function quality(channel, slug) {
  if (!slug) return null;
  const gate = read(path.join(channel.paths.packages, slug, "quality-gate.json"), null);
  return gate ? { decision: gate.karar || gate.decision || null, score: gate.toplam ?? gate.total ?? null } : null;
}

function tikTokState(channel, todaySlug) {
  if (channel.slug !== "failure-reconstructed") return null;
  const records = read(path.join(Channel.ROOT, "icerik", "tiktok.json"), []);
  const published = read(stateFile(channel, "yayinlananlar.json", "published.json"), []);
  const sent = new Set(records.filter((row) => row.publishId).map((row) => row.slug));
  const today = records.find((row) => row.slug === todaySlug) || null;
  return {
    mode: "SEND_TO_USER_INBOX",
    todayStatus: today ? today.durum : todaySlug ? "NOT_SENT" : "NO_TODAY_VIDEO",
    sent: sent.size,
    publicationStateAvailable: false,
    backlog: published.filter((row) => (row.format || "short") === "short" && row.slug && !sent.has(row.slug)).length,
    failures: records.filter((row) => row.durum === "FAILED" || row.hata).length,
  };
}

function channelReport(channel, date, now) {
  const published = read(stateFile(channel, "yayinlananlar.json", "published.json"), []);
  const generated = read(stateFile(channel, "uretilenler.json", "generated.json"), []);
  const failed = read(stateFile(channel, "basarisiz.json", "failed.json"), []);
  const blocked = read(stateFile(channel, "engellenen.json", "blocked.json"), {});
  const review = read(stateFile(channel, "inceleme.json", "review.json"), {});
  const short = publicationForDate(published, date, "short");
  const long = publicationForDate(published, date, "long");
  const gate = quality(channel, short && short.slug);
  const plan = Scheduling.channelPlan(channel, now);
  const inventory = Library.calculate(channel);
  const analytics = latestAnalytics(channel);
  const failures = (Array.isArray(failed) ? failed.length : Object.keys(failed || {}).length) +
    Object.keys(blocked || {}).length + Object.keys(review || {}).length;
  const youtubeUploaded = !!(short && short.videoId);
  const youtubeScheduled = !!(short && short.publishAt && String(short.publishAt).slice(0, 10) === date);
  const deadline = new Date(`${date}T16:30:00.000Z`);
  const schedulerHealth = youtubeScheduled ? "healthy" : now < deadline ? "pending-before-deadline" : "sla-missed-or-channel-disabled";
  const tiktok = tikTokState(channel, short && short.slug);
  return {
    channel: channel.slug,
    name: channel.name,
    date,
    todayTopic: short && short.slug || null,
    shortStatus: youtubeScheduled ? "scheduled" : youtubeUploaded ? "uploaded-not-scheduled" : plan.short.due ? "due-not-produced" : "not-due",
    longStatus: long && long.videoId ? "uploaded" : plan.long.due ? "due-not-produced" : "not-due",
    qualityScore: gate && gate.score,
    qualityGate: gate && gate.decision || short && short.kalite || null,
    youtubeStatus: youtubeScheduled ? "scheduled" : youtubeUploaded ? "uploaded" : "not-uploaded",
    publishTime: short && short.publishAt || null,
    videoId: short && short.videoId || null,
    analyticsHealth: analytics.length ? "measured" : "no-channel-measurements",
    schedulerHealth,
    backlog: inventory.readyShorts,
    errors: failures,
    inventory,
    scorecard: { youtubeShorts: performance(analytics, "short"), youtubeLong: performance(analytics, "long") },
    tiktok,
    stateCounts: { generated: generated.length, published: published.length, failed: Array.isArray(failed) ? failed.length : Object.keys(failed || {}).length },
  };
}

function build(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const channels = Object.keys(Channel.registry().channels).map((slug) => channelReport(Channel.getChannel(slug), date, now));
  return { generatedAt: now.toISOString(), date, channels };
}

function cell(value) { return value == null ? "unavailable" : String(value); }

function markdown(report) {
  const lines = ["# Daily operations report", "", `Generated: ${report.generatedAt}`, "",
    "Missing API-only metrics are reported as `unavailable`, never as zero.", ""];
  for (const row of report.channels) {
    lines.push(`## ${row.name}`, "", "| Signal | Status |", "|---|---|",
      `| Today topic | ${cell(row.todayTopic)} |`, `| Short | ${row.shortStatus} |`, `| Long | ${row.longStatus} |`,
      `| Quality | ${cell(row.qualityGate)} / ${cell(row.qualityScore)} |`, `| YouTube | ${row.youtubeStatus} |`,
      `| Publish time | ${cell(row.publishTime)} |`, `| Video ID | ${cell(row.videoId)} |`, `| Analytics | ${row.analyticsHealth} |`,
      `| Scheduler | ${row.schedulerHealth} |`, `| Ready topic backlog | ${row.backlog} |`, `| Errors/review/blocks | ${row.errors} |`);
    if (row.tiktok) lines.push(`| TikTok today | ${row.tiktok.todayStatus} |`, `| TikTok backlog | ${row.tiktok.backlog} |`);
    lines.push("");
  }
  return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
  const nowArg = argv.find((arg) => arg.startsWith("--now="));
  const report = build(nowArg ? new Date(nowArg.slice(6)) : new Date());
  const output = path.join(Channel.ROOT, "reports");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "daily-operations.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(output, "daily-operations.md"), markdown(report) + "\n");
  console.log(markdown(report));
  return report;
}

module.exports = { read, metricValue, performance, publicationForDate, tikTokState, channelReport, build, markdown, main };

if (require.main === module) main();
