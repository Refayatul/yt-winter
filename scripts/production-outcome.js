#!/usr/bin/env node
"use strict";

// PRODUCTION OUTCOME: what this workflow run actually achieved, per active Shorts channel.
//
//   node scripts/production-outcome.js            writes reports/production-outcome.json and the
//                                                 run summary ($GITHUB_STEP_SUMMARY); exit 0
//   node scripts/production-outcome.js --channel failure-reconstructed   the same for one channel
//   node scripts/production-outcome.js --verdict  exit 1 when a channel needs action: a production,
//                                                 upload or schedule failure, or an owner approval
//
// Reads each channel's stage record (lib/run-stages.js) for this run (GITHUB_RUN_ID) and gives it
// one category:
//   SCHEDULED                    uploaded AND scheduled: a valid videoId and a publishAt from the
//                                YouTube upload response. This is NOT publication: YouTube still has
//                                to make it public at publishAt. PUBLICATION_CONFIRMED comes only from
//                                the YouTube API reporting it public (lib/publication-evidence.js).
//   CONTENT_BLOCKED              no topic passes the quality bar (inventory/editorial work, not an outage)
//   QUALITY_REJECTED             a quality, readiness or visual gate stopped the video
//   AWAITING_APPROVAL            the primary voice is unavailable and the fallback voice is not approved
//   UPLOAD_FAILED                rendered and approved, but the YouTube upload did not complete
//   PUBLISH_VERIFICATION_FAILED  the upload reported success without a valid videoId or publishAt
//   PRODUCTION_FAILED            any other failure (asset source outage, health pre-flight, crash, no record)
//   NOT_DUE / DRY_RUN            nothing was due / rendered without upload
// CONTENT_BLOCKED and QUALITY_REJECTED are warnings, not red runs: quality over cadence. They keep
// their own alerts (NO_QUALIFIED_TOPIC, quality-gate issues). Only SCHEDULED means a video is on its way.
//
//   node scripts/production-outcome.js --publication [--channel <slug>] [--days 7]
//       recent Shorts per channel with their publication evidence: SCHEDULED,
//       PUBLICATION_PENDING_CHECK, PUBLICATION_CONFIRMED or PUBLICATION_NOT_CONFIRMED (exit 0)

const fs = require("fs");
const path = require("path");
const Channel = require("../core/channel-context");
const Stages = require("../lib/run-stages");
const Publication = require("../lib/publication-evidence");

const ROOT = path.join(__dirname, "..");
const CATEGORIES = ["SCHEDULED", "CONTENT_BLOCKED", "QUALITY_REJECTED", "AWAITING_APPROVAL", "UPLOAD_FAILED", "PUBLISH_VERIFICATION_FAILED", "PRODUCTION_FAILED", "NOT_DUE", "DRY_RUN"];
const FAILING = new Set(["PRODUCTION_FAILED", "UPLOAD_FAILED", "PUBLISH_VERIFICATION_FAILED", "AWAITING_APPROVAL"]);
const WARNING = new Set(["CONTENT_BLOCKED", "QUALITY_REJECTED"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function fallbackAwaitingApproval(channel) {
  const fallback = ((channel && channel.config && channel.config.voice) || {}).fallback;
  return !!(fallback && fallback.voice && fallback.approved !== true);
}

// One category from a channel's stage record (see the header).
function classify(record, channel = null) {
  if (!record) return "PRODUCTION_FAILED";
  const stages = record.stages || {};
  const status = (stage) => (stages[stage] && stages[stage].status) || null;
  const reason = String(record.reason || "");
  switch (record.outcome) {
    case "UPLOADED": {
      const videoId = record.videoId || (stages.UPLOAD && stages.UPLOAD.detail) || "";
      const publishAt = status("SCHEDULE") === "done" ? (stages.SCHEDULE.detail || "") : "";
      return VIDEO_ID.test(videoId) && !Number.isNaN(Date.parse(publishAt)) ? "SCHEDULED" : "PUBLISH_VERIFICATION_FAILED";
    }
    case "NOT_DUE": return "NOT_DUE";
    case "DRY_RUN": return "DRY_RUN";
    case "NO_TOPIC": return "CONTENT_BLOCKED";
    case "BLOCKED": return "QUALITY_REJECTED";
    case "FAILED":
      // Specific codes first: a run that uploaded but could not verify the schedule, a target slot that
      // was taken or missed (never moved), or a spent retry budget are not "upload failed".
      if (/PUBLISH_VERIFICATION_FAILED/.test(reason)) return "PUBLISH_VERIFICATION_FAILED";
      if (/PUBLISH_SLOT_UNAVAILABLE|RETRY_BUDGET_EXHAUSTED/.test(reason)) return "PRODUCTION_FAILED";
      if (status("UPLOAD") === "failed" || /^rendered but not uploaded/.test(reason)) return "UPLOAD_FAILED";
      if (/NARRATION_UNAVAILABLE/.test(reason) && fallbackAwaitingApproval(channel)) return "AWAITING_APPROVAL";
      return "PRODUCTION_FAILED";
    default: return "PRODUCTION_FAILED";
  }
}

function activeShortsChannels() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "channels.json"), "utf8")).channels;
  return Object.entries(registry).filter(([slug, item]) => item.enabled && slug !== "profitdecoded").map(([slug]) => slug);
}

function evaluate(runId = process.env.GITHUB_RUN_ID || null, channels = activeShortsChannels()) {
  return channels.map((slug) => {
    const channel = Channel.getChannel(slug);
    const record = Stages.latest(channel, runId);
    if (!record) return { channel: slug, outcome: "MISSING", category: "PRODUCTION_FAILED", scheduled: false, publication: "NOT_SCHEDULED", reason: "no stage record for this run (the step crashed before tracking or did not run)", stages: null };
    const category = classify(record, channel);
    const publishAt = category === "SCHEDULED" ? record.stages.SCHEDULE.detail : null;
    const videoId = record.videoId || (record.stages && record.stages.UPLOAD && record.stages.UPLOAD.detail) || null;
    const publication = category === "SCHEDULED" ? Publication.forChannel(channel, { videoId, publishAt }).state : "NOT_SCHEDULED";
    return { channel: slug, outcome: record.outcome || "FAILED", category, scheduled: category === "SCHEDULED", publication, publishAt,
      reason: record.reason || (record.outcome ? null : "run ended without an outcome"), slug: record.slug, videoId: record.videoId || null,
      targetDay: record.targetDay || null, trigger: record.trigger || null, stages: record.stages };
  });
}

function markdown(rows) {
  const cell = (stage) => (!stage ? "—" : { done: "✅", failed: "❌", skipped: "⏭", scheduled: "🕘", "not-reached": "·" }[stage.status] || stage.status);
  const lines = ["## Shorts production outcome", "",
    `| Channel | Category | Scheduled | Publication | ${Stages.STAGES.join(" | ")} | Reason |`, `|---|---|---|---|${Stages.STAGES.map(() => "---").join("|")}|---|`];
  for (const row of rows) {
    const scheduled = row.scheduled ? `yes: ${row.videoId}, publishAt ${row.publishAt}` : "**no**";
    lines.push(`| ${row.channel} | **${row.category}** | ${scheduled} | ${row.publication || "NOT_SCHEDULED"} | ${Stages.STAGES.map((stage) => cell(row.stages && row.stages[stage])).join(" | ")} | ${String(row.reason || row.videoId || "").replace(/\|/g, "/").slice(0, 220)} |`);
  }
  lines.push("", "✅ done · ❌ failed · ⏭ skipped · 🕘 scheduled on YouTube · · not reached",
    "Scheduled is not published: PUBLICATION_CONFIRMED requires the YouTube API to report the video public after publishAt.");
  return lines.join("\n") + "\n";
}

// Recent Shorts of one channel from its own upload registry, each with its publication evidence.
function publicationReport(slug, { days = 7, now = Date.now() } = {}) {
  const channel = Channel.getChannel(slug);
  const legacy = channel.config.pathMode === "legacy-adapter";
  let registry = [];
  try { registry = JSON.parse(fs.readFileSync(path.join(channel.paths.state, legacy ? "yayinlananlar.json" : "published.json"), "utf8")); } catch (error) {}
  const events = require("../lib/ops-log").read(channel);
  return (Array.isArray(registry) ? registry : [])
    .filter((item) => item && item.format !== "long" && item.publishAt && now - Date.parse(item.publishAt) <= days * 86400000)
    .map((item) => ({ channel: slug, slug: item.slug, ...Publication.status({ videoId: item.videoId, publishAt: item.publishAt }, events, now) }));
}

if (require.main === module && process.argv.includes("--publication")) {
  const only = process.argv.includes("--channel") ? process.argv[process.argv.indexOf("--channel") + 1] : null;
  const days = process.argv.includes("--days") ? Number(process.argv[process.argv.indexOf("--days") + 1]) || 7 : 7;
  for (const slug of only ? [only] : activeShortsChannels()) {
    for (const row of publicationReport(slug, { days })) console.log([row.channel, row.publishAt, row.videoId, row.state, row.confirmedAt || "", row.delayMinutes ?? row.overdueMinutes ?? ""].join("\t"));
  }
} else if (require.main === module) {
  // --channel <slug>: one channel only (the FR primary workflow, uretim-is.yml, produces FR alone).
  const only = process.argv.includes("--channel") ? process.argv[process.argv.indexOf("--channel") + 1] : null;
  if (only && !activeShortsChannels().includes(only)) { console.error(`not an active Shorts channel: ${only}`); process.exit(2); }
  const rows = evaluate(undefined, only ? [only] : undefined);
  const verdict = process.argv.includes("--verdict");
  if (!verdict) {
    const out = path.join(ROOT, "reports", "production-outcome.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID || null, rows }, null, 2) + "\n");
    const md = markdown(rows);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    console.log(md);
    process.exit(0);
  }
  for (const row of rows.filter((item) => WARNING.has(item.category))) console.log(`::warning::${row.channel}: ${row.category} (nothing uploaded)${row.reason ? ` — ${row.reason}` : ""}`);
  const failing = rows.filter((row) => FAILING.has(row.category));
  for (const row of failing) console.log(`::error::${row.channel}: ${row.category}${row.reason ? ` — ${row.reason}` : ""}`);
  if (failing.length) { console.log(`${failing.length} active channel(s) need action.`); process.exit(1); }
  const uploaded = rows.filter((row) => row.scheduled).map((row) => row.channel);
  console.log(`No production, upload or approval failure. Uploaded and scheduled (not yet confirmed public) this run: ${uploaded.length ? uploaded.join(", ") : "none"}.`);
}

module.exports = { evaluate, markdown, activeShortsChannels, classify, publicationReport, CATEGORIES, FAILING, WARNING };
