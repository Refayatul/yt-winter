// PRODUCTION SLA CHECK — one machine-readable answer for the daily watchdog.
//
// Exit codes:
//   0 = every production and notification assertion passed
//   2 = the SLA is not healthy (JSON is still emitted)
//   1 = the checker itself failed
//
// Usage:
//   node production-sla-check.js --channel failure-reconstructed
//   node production-sla-check.js --channel failure-reconstructed --verify-youtube
//   node production-sla-check.js --date 2026-09-27 --github-output
"use strict";

const fs = require("fs");
const path = require("path");
const Channel = require("./core/channel-context");
const { jsonOku, jsonYaz, videoIdGecerli } = require("./lib/ortak");

function argValue(argv, name) {
  const exact = argv.indexOf(name);
  if (exact >= 0 && argv[exact + 1] && !argv[exact + 1].startsWith("--")) return argv[exact + 1];
  const inline = argv.find((item) => item.startsWith(name + "="));
  return inline ? inline.slice(name.length + 1) : null;
}

function ids(rows) {
  return new Set((Array.isArray(rows) ? rows : []).map((item) => typeof item === "string" ? item : item && (item.slug || item.topicId)).filter(Boolean));
}

function recordForDate(records, date) {
  const rows = (Array.isArray(records) ? records : []).filter((item) => item && item.format !== "long");
  const scheduled = rows.filter((item) => String(item.publishAt || "").slice(0, 10) === date);
  const produced = rows.filter((item) => String(item.tarih || item.generatedAt || "").slice(0, 10) === date);
  return (scheduled.length ? scheduled : produced).sort((a, b) => String(a.tarih || "").localeCompare(String(b.tarih || ""))).pop() || null;
}

function qualityFor(channel, slug) {
  if (!slug) return null;
  return jsonOku(path.join(channel.paths.packages, slug, "quality-gate.json"), null);
}

function evaluateSnapshot(snapshot) {
  const record = recordForDate(snapshot.published, snapshot.date);
  const slug = record && record.slug || null;
  const quality = snapshot.quality || null;
  const decision = quality && (quality.karar || quality.decision) || record && record.kalite || null;
  const finalGate = !quality || quality.asama === "final" || quality.stage === "final";
  const generated = ids(snapshot.generated);
  const produced = !!(slug && (generated.has(slug) || record));
  const videoId = record && record.videoId || null;
  const uploaded = !!(videoId && videoIdGecerli(videoId));
  const scheduled = !!(record && record.publishAt && String(record.publishAt).slice(0, 10) === snapshot.date);
  const qualityPassed = !!(decision && decision !== "BLOCK" && finalGate);
  const notificationExists = !!(videoId && snapshot.notifications && snapshot.notifications["video:" + videoId]);
  const videoIdExists = uploaded && snapshot.remoteVideoExists !== false;
  const productionReady = produced && uploaded && scheduled && videoIdExists && qualityPassed;
  const healthy = productionReady && notificationExists;
  return {
    date: snapshot.date,
    deadlineUtc: snapshot.deadlineUtc || "16:30",
    channel: snapshot.channel,
    slug,
    produced,
    uploaded,
    scheduled,
    videoId,
    videoIdExists,
    publishAt: record && record.publishAt || null,
    quality: decision,
    qualityPassed,
    notificationExists,
    productionReady,
    automaticRecoveryStarted: !!snapshot.automaticRecoveryStarted,
    healthy,
    verification: snapshot.youtubeVerified ? "youtube-api" : "repository-state",
  };
}

async function check(options = {}) {
  const channel = options.channel || Channel.getChannel();
  const legacy = channel.config.pathMode === "legacy-adapter";
  const date = options.date || new Date().toISOString().slice(0, 10);
  const deadlineUtc = options.deadlineUtc || process.env.PRODUCTION_DEADLINE_UTC || "16:30";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(deadlineUtc)) throw new Error("PRODUCTION_DEADLINE_UTC must be HH:MM");
  const published = jsonOku(path.join(channel.paths.state, legacy ? "yayinlananlar.json" : "published.json"), []);
  const generated = jsonOku(path.join(channel.paths.state, legacy ? "uretilenler.json" : "generated.json"), []);
  const notificationsState = jsonOku(path.join(channel.paths.state, legacy ? "bildirim-durum.json" : "notification-state.json"), { gonderilen: {} });
  const record = recordForDate(published, date);
  let remoteVideoExists;
  let youtubeVerified = false;
  let youtubeError = null;
  if (options.verifyYouTube && record && record.videoId) {
    try {
      const yt = options.youtube || require("./lib/yt");
      const token = await yt.token(undefined, channel);
      const api = yt.istemci(token);
      await yt.verifyChannelIdentity(api, channel);
      const videos = await yt.videolar(api, [record.videoId]);
      remoteVideoExists = videos.some((item) => item.id === record.videoId);
      youtubeVerified = true;
    } catch (error) {
      remoteVideoExists = false;
      youtubeError = String(error.message || error).slice(0, 240);
    }
  }
  const result = evaluateSnapshot({
    date,
    deadlineUtc,
    channel: channel.slug,
    published,
    generated,
    notifications: notificationsState.gonderilen || {},
    quality: qualityFor(channel, record && record.slug),
    remoteVideoExists,
    youtubeVerified,
    automaticRecoveryStarted: options.automaticRecoveryStarted,
  });
  if (youtubeError) result.youtubeError = youtubeError;
  return result;
}

function writeGitHubOutput(result, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const values = {
    healthy: result.healthy,
    production_ready: result.productionReady,
    today_video_scheduled: result.scheduled,
    slug: result.slug || "",
    video_id: result.videoId || "",
    publish_at: result.publishAt || "",
  };
  fs.appendFileSync(outputPath, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
}

async function main(argv = process.argv.slice(2)) {
  const selected = Channel.selectFromArgv(argv);
  const date = argValue(selected.argv, "--date") || new Date().toISOString().slice(0, 10);
  const result = await check({
    channel: selected.channel,
    date,
    verifyYouTube: selected.argv.includes("--verify-youtube"),
    automaticRecoveryStarted: selected.argv.includes("--recovery-started"),
  });
  if (selected.argv.includes("--simulate-missing")) {
    result.produced = false;
    result.uploaded = false;
    result.scheduled = false;
    result.videoId = null;
    result.videoIdExists = false;
    result.publishAt = null;
    result.quality = null;
    result.qualityPassed = false;
    result.notificationExists = false;
    result.productionReady = false;
    result.healthy = false;
    result.verification = "simulated-scheduler-failure";
  }
  const output = argValue(selected.argv, "--output");
  if (output) jsonYaz(path.resolve(output), result);
  if (selected.argv.includes("--github-output")) writeGitHubOutput(result);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.healthy ? 0 : 2;
}

module.exports = { argValue, recordForDate, evaluateSnapshot, check, writeGitHubOutput, main };

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(JSON.stringify({ healthy: false, checkerError: String(error.message || error) }) + "\n");
  process.exitCode = 1;
});
