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
const Calendar = require("./core/scheduling/calendar");
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

// "Today" is the channel's local calendar day (Europe/Istanbul), never a
// rolling 24-hour window and never the runner's time zone. A publish instant
// is read in the publish zone: 18:00 New York on D is 01:00 Istanbul on D+1
// but still belongs to production day D.
function recordForDate(records, date, timeZone = Calendar.DEFAULT_TIME_ZONE, publishTimeZone = timeZone) {
  const rows = (Array.isArray(records) ? records : []).filter((item) => item && item.format !== "long");
  const scheduled = rows.filter((item) => Calendar.dayKey(item.publishAt, publishTimeZone) === date);
  const produced = rows.filter((item) => Calendar.dayKey(item.tarih || item.generatedAt, timeZone) === date);
  return (scheduled.length ? scheduled : produced).sort((a, b) => String(a.tarih || "").localeCompare(String(b.tarih || ""))).pop() || null;
}

// Final-gate evidence for the package of the day's Short. Two producers write it differently:
//   - Failure Reconstructed (quality-gate.js): one file with { slug, asama: "final", karar, tarih }.
//   - ImpossibleBrief / CriticalThread (core/pipeline): quality-gate.json { decision, blockers } plus
//     the post-render validations.json { channel, slug, topicId, passed, checks } and render.json
//     { completed }. These carry no "final" marker; the render and validation files are the proof
//     that the gate was the final, post-render one. Before 2026-10-13 only the first shape was
//     recognised, so every valid IB/CT package read as "quality not passed" (issues #270, #271).
function evidenceFor(channel, slug) {
  if (!slug) return { gate: null, validations: null, render: null };
  const dir = path.join(channel.paths.packages, slug);
  return {
    gate: jsonOku(path.join(dir, "quality-gate.json"), null),
    validations: jsonOku(path.join(dir, "validations.json"), null),
    render: jsonOku(path.join(dir, "render.json"), null),
  };
}

// A FR final gate must be written before the upload and not long before it (same production run).
const MAX_GATE_AGE_MS = 48 * 3600 * 1000;
const MAX_GATE_SKEW_MS = 10 * 60 * 1000;

// Returns { passed, decision, source, reason }. Fails closed: anything missing, malformed,
// inconsistent, stale or for another channel/topic is "not passed" with the reason. Only an
// explicit PUBLISH counts; REVIEW and BLOCK never pass (neither may be uploaded).
function finalQualityVerdict({ channel, record, gate, validations, render, generated }) {
  const fail = (reason, decision = null, source = null) => ({ passed: false, decision, source, reason });
  if (!record || !record.slug) return fail("NO_RECORD");
  if (record.channel && channel && record.channel !== channel) return fail("WRONG_CHANNEL: record belongs to " + record.channel);
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return fail("MISSING_GATE");
  const legacy = gate.karar != null || gate.asama != null;
  const decision = legacy ? gate.karar : gate.decision;
  const source = legacy ? "quality-gate.final" : "quality-gate+validations+render";
  if (typeof decision !== "string") return fail("MALFORMED_GATE: no decision", null, source);
  if (decision !== "PUBLISH") return fail("GATE_NOT_PUBLISH: " + decision, decision, source);
  if (record.kalite && record.kalite !== decision) return fail(`EVIDENCE_MISMATCH: uploaded as ${record.kalite}, package says ${decision}`, decision, source);
  if (legacy) {
    if (gate.asama !== "final") return fail("NOT_FINAL_GATE: " + (gate.asama || "no stage"), decision, source);
    if (gate.slug && gate.slug !== record.slug) return fail(`WRONG_TOPIC: gate for ${gate.slug}`, decision, source);
    const gateAt = Date.parse(gate.tarih || "");
    const uploadAt = Date.parse(record.tarih || "");
    if (Number.isNaN(gateAt) || Number.isNaN(uploadAt)) return fail("MALFORMED_GATE: missing gate or upload time", decision, source);
    if (gateAt - uploadAt > MAX_GATE_SKEW_MS || uploadAt - gateAt > MAX_GATE_AGE_MS) return fail(`STALE_GATE: gate ${gate.tarih}, upload ${record.tarih}`, decision, source);
    return { passed: true, decision, source, reason: null };
  }
  if (!Array.isArray(gate.blockers) || gate.blockers.length) return fail("GATE_BLOCKERS: " + JSON.stringify(gate.blockers ?? null).slice(0, 120), decision, source);
  if (!validations || typeof validations !== "object") return fail("MISSING_VALIDATIONS", decision, source);
  if (channel && validations.channel !== channel) return fail(`WRONG_CHANNEL: validations for ${validations.channel}`, decision, source);
  if (validations.slug !== record.slug) return fail(`WRONG_TOPIC: validations for ${validations.slug}`, decision, source);
  if (validations.passed !== true || !validations.checks || validations.checks.video !== true || validations.checks.qualityGate !== true) {
    return fail("VALIDATIONS_FAILED: " + JSON.stringify(validations.failed || []).slice(0, 120), decision, source);
  }
  if (!render || render.completed !== true) return fail("RENDER_NOT_COMPLETED", decision, source);
  const produced = (Array.isArray(generated) ? generated : []).find((item) => item && typeof item === "object" && item.slug === record.slug);
  if (produced && produced.topicId && validations.topicId && produced.topicId !== validations.topicId) {
    return fail(`STALE_GATE: validations for topic ${validations.topicId}, produced ${produced.topicId}`, decision, source);
  }
  return { passed: true, decision, source, reason: null };
}

function isoDay(value, timeZone = Calendar.DEFAULT_TIME_ZONE) {
  return value ? Calendar.dayKey(value, timeZone) : null;
}

function durationSeconds(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return (+match[1] || 0) * 86400 + (+match[2] || 0) * 3600 + (+match[3] || 0) * 60 + (+match[4] || 0);
}

// The repository commit is useful operational state, but it cannot be the
// duplicate-prevention authority: an upload may have succeeded immediately
// before its state commit failed. The authenticated YouTube channel is the
// source of truth for whether today's Short slot is already occupied.
function youtubeVideoForDate(videos, date, timeZone = Calendar.DEFAULT_TIME_ZONE, publishTimeZone = timeZone) {
  return (Array.isArray(videos) ? videos : [])
    .filter((video) => {
      const seconds = durationSeconds(video && video.contentDetails && video.contentDetails.duration);
      const short = seconds != null && seconds <= 180;
      const day = isoDay(video && video.status && video.status.publishAt, publishTimeZone)
        || isoDay(video && video.snippet && video.snippet.publishedAt, publishTimeZone);
      return short && day === date;
    })
    .sort((a, b) => String((a.status && a.status.publishAt) || (a.snippet && a.snippet.publishedAt) || "")
      .localeCompare(String((b.status && b.status.publishAt) || (b.snippet && b.snippet.publishedAt) || "")))
    .pop() || null;
}

// The deadline instant for production day `date` (YYYY-MM-DD, channel calendar day) at
// `deadlineUtc` (HH:MM, UTC). A watchdog that GitHub starts hours late can run after midnight
// Istanbul, when "today" is already the next production day and its deadline is still ahead.
function deadlineAt(date, deadlineUtc = "16:30") {
  return `${date}T${deadlineUtc}:00.000Z`;
}

function evaluateSnapshot(snapshot) {
  const timeZone = snapshot.timeZone || Calendar.DEFAULT_TIME_ZONE;
  const record = recordForDate(snapshot.published, snapshot.date, timeZone, snapshot.publishTimeZone || timeZone);
  const slug = record && record.slug || null;
  const verdict = finalQualityVerdict({ channel: snapshot.channel, record, gate: snapshot.quality || null,
    validations: snapshot.validations || null, render: snapshot.render || null, generated: snapshot.generated });
  const decision = verdict.decision;
  const generated = ids(snapshot.generated);
  const produced = !!(slug && (generated.has(slug) || record));
  const remoteTodayVideo = snapshot.remoteTodayVideo || null;
  const videoId = record && record.videoId || remoteTodayVideo && remoteTodayVideo.id || null;
  const uploaded = !!(videoId && videoIdGecerli(videoId));
  const remotePublishAt = remoteTodayVideo && remoteTodayVideo.status && remoteTodayVideo.status.publishAt || null;
  const publishTimeZone = snapshot.publishTimeZone || timeZone;
  const scheduled = !!((record && record.publishAt && isoDay(record.publishAt, publishTimeZone) === snapshot.date)
    || (remotePublishAt && isoDay(remotePublishAt, publishTimeZone) === snapshot.date));
  const qualityPassed = verdict.passed;
  const notificationExists = !!(videoId && snapshot.notifications && snapshot.notifications["video:" + videoId]);
  const videoIdExists = uploaded && snapshot.remoteVideoExists !== false;
  const youtubeVerified = !!snapshot.youtubeVerified;
  const youtubeTodayExists = youtubeVerified && !!remoteTodayVideo;
  // Fail closed. An API/authentication failure is never interpreted as an
  // empty day, because doing so could upload a duplicate after a state-commit
  // failure. Recovery is authorized only by a successful remote absence check.
  // Before the day's deadline nothing is missing yet: never recover (the scheduled run owns the
  // slot) and never report a failure for a day that has not reached its deadline.
  const deadlinePassed = snapshot.deadlinePassed !== false;
  const safeToRecover = youtubeVerified && !youtubeTodayExists && deadlinePassed;
  const productionReady = produced && uploaded && scheduled && videoIdExists && qualityPassed;
  const healthy = productionReady && notificationExists;
  return {
    date: snapshot.date,
    timeZone,
    deadlineUtc: snapshot.deadlineUtc || "16:30",
    deadlineAt: deadlineAt(snapshot.date, snapshot.deadlineUtc || "16:30"),
    deadlinePassed,
    channel: snapshot.channel,
    slug,
    produced,
    topicSelected: !!slug,
    scriptReady: produced,
    assetsReady: produced,
    renderReady: produced,
    uploaded,
    scheduled,
    youtubeUploaded: uploaded,
    youtubeScheduled: scheduled,
    videoId,
    videoIdExists,
    publishAt: record && record.publishAt || remotePublishAt,
    quality: decision,
    qualityGate: decision,
    qualityPassed,
    qualityEvidence: verdict.source,
    qualityReason: verdict.reason,
    notificationExists,
    productionReady,
    youtubeVerified,
    youtubeTodayExists,
    remoteTodayVideoId: remoteTodayVideo && remoteTodayVideo.id || null,
    safeToRecover,
    automaticRecoveryStarted: !!snapshot.automaticRecoveryStarted,
    healthy,
    verification: youtubeVerified ? "youtube-api" : "repository-state",
  };
}

async function check(options = {}) {
  const channel = options.channel || Channel.getChannel();
  const legacy = channel.config.pathMode === "legacy-adapter";
  const timeZone = channel.config.timezone || Calendar.DEFAULT_TIME_ZONE;
  const publishTimeZone = Calendar.shortSchedule(channel).publishTimeZone;
  const date = options.date || Calendar.dayKey(new Date(), timeZone);
  const deadlineUtc = options.deadlineUtc || process.env.PRODUCTION_DEADLINE_UTC || "16:30";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(deadlineUtc)) throw new Error("PRODUCTION_DEADLINE_UTC must be HH:MM");
  const now = options.now ? new Date(options.now) : new Date();
  const deadlinePassed = now.getTime() >= Date.parse(deadlineAt(date, deadlineUtc));
  const published = jsonOku(path.join(channel.paths.state, legacy ? "yayinlananlar.json" : "published.json"), []);
  const generated = jsonOku(path.join(channel.paths.state, legacy ? "uretilenler.json" : "generated.json"), []);
  const notificationsState = jsonOku(path.join(channel.paths.state, legacy ? "bildirim-durum.json" : "notification-state.json"), { gonderilen: {} });
  const record = recordForDate(published, date, timeZone, publishTimeZone);
  let remoteVideoExists;
  let remoteTodayVideo = null;
  let youtubeVerified = false;
  let youtubeError = null;
  if (options.verifyYouTube) {
    try {
      const yt = options.youtube || require("./lib/yt");
      const token = await yt.token(undefined, channel);
      const api = yt.istemci(token);
      await yt.verifyChannelIdentity(api, channel);
      const uploads = await yt.yuklemeler(api, 100);
      const idsToRead = [...new Set([...(uploads.ids || []), record && record.videoId].filter(Boolean))];
      const videos = idsToRead.length ? await yt.videolar(api, idsToRead) : [];
      remoteTodayVideo = youtubeVideoForDate(videos, date, timeZone, publishTimeZone);
      const recordedRemoteVideo = record && record.videoId ? videos.find((item) => item.id === record.videoId) : null;
      remoteVideoExists = record && record.videoId ? !!recordedRemoteVideo : !!remoteTodayVideo;
      // YouTube can omit status.publishAt after a scheduled video becomes
      // public. If the authenticated API still proves the exact registry ID
      // exists and the registry slot is today, prefer skipping to a duplicate.
      if (!remoteTodayVideo && recordedRemoteVideo && isoDay(record.publishAt, publishTimeZone) === date) remoteTodayVideo = recordedRemoteVideo;
      youtubeVerified = true;
    } catch (error) {
      remoteVideoExists = false;
      youtubeError = String(error.message || error).slice(0, 240);
    }
  }
  const result = evaluateSnapshot({
    date,
    timeZone,
    publishTimeZone,
    deadlineUtc,
    deadlinePassed,
    channel: channel.slug,
    published,
    generated,
    notifications: notificationsState.gonderilen || {},
    ...(() => { const evidence = evidenceFor(channel, record && record.slug); return { quality: evidence.gate, validations: evidence.validations, render: evidence.render }; })(),
    remoteVideoExists,
    remoteTodayVideo,
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
    youtube_verified: result.youtubeVerified,
    youtube_today_exists: result.youtubeTodayExists,
    safe_to_recover: result.safeToRecover,
    deadline_passed: result.deadlinePassed !== false,
    slug: result.slug || "",
    video_id: result.videoId || "",
    publish_at: result.publishAt || "",
  };
  fs.appendFileSync(outputPath, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
}

async function main(argv = process.argv.slice(2)) {
  const selected = Channel.selectFromArgv(argv);
  const date = argValue(selected.argv, "--date") || Calendar.dayKey(new Date(), selected.channel.config.timezone || Calendar.DEFAULT_TIME_ZONE);
  const result = await check({
    channel: selected.channel,
    date,
    verifyYouTube: selected.argv.includes("--verify-youtube"),
    automaticRecoveryStarted: selected.argv.includes("--recovery-started"),
  });
  if (selected.argv.includes("--simulate-missing")) {
    result.produced = false;
    result.topicSelected = false;
    result.scriptReady = false;
    result.assetsReady = false;
    result.renderReady = false;
    result.uploaded = false;
    result.scheduled = false;
    result.youtubeUploaded = false;
    result.youtubeScheduled = false;
    result.videoId = null;
    result.videoIdExists = false;
    result.publishAt = null;
    result.quality = null;
    result.qualityGate = null;
    result.qualityPassed = false;
    result.notificationExists = false;
    result.productionReady = false;
    result.healthy = false;
    result.youtubeVerified = true;
    result.youtubeTodayExists = false;
    result.safeToRecover = true;
    result.deadlinePassed = true;
    result.verification = "simulated-scheduler-failure";
  }
  const output = argValue(selected.argv, "--output");
  if (output) jsonYaz(path.resolve(output), result);
  if (selected.argv.includes("--github-output")) writeGitHubOutput(result);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.healthy ? 0 : 2;
}

module.exports = { argValue, deadlineAt, recordForDate, finalQualityVerdict, evidenceFor, youtubeVideoForDate, evaluateSnapshot, check, writeGitHubOutput, main };

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(JSON.stringify({ healthy: false, checkerError: String(error.message || error) }) + "\n");
  process.exitCode = 1;
});
