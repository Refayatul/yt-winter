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
//   SUCCESS                      uploaded AND scheduled: a valid videoId and a publishAt from the
//                                YouTube upload response (YouTube makes it public at publishAt; the
//                                SLA watchdog re-verifies through the YouTube API after the deadline)
//   CONTENT_BLOCKED              no topic passes the quality bar (inventory/editorial work, not an outage)
//   QUALITY_REJECTED             a quality, readiness or visual gate stopped the video
//   AWAITING_APPROVAL            the primary voice is unavailable and the fallback voice is not approved
//   UPLOAD_FAILED                rendered and approved, but the YouTube upload did not complete
//   PUBLISH_VERIFICATION_FAILED  the upload reported success without a valid videoId or publishAt
//   PRODUCTION_FAILED            any other failure (asset source outage, health pre-flight, crash, no record)
//   NOT_DUE / DRY_RUN            nothing was due / rendered without upload
// CONTENT_BLOCKED and QUALITY_REJECTED are warnings, not red runs: quality over cadence. They keep
// their own alerts (NO_QUALIFIED_TOPIC, quality-gate issues). Only SUCCESS means a video is on its way.

const fs = require("fs");
const path = require("path");
const Channel = require("../core/channel-context");
const Stages = require("../lib/run-stages");

const ROOT = path.join(__dirname, "..");
const CATEGORIES = ["SUCCESS", "CONTENT_BLOCKED", "QUALITY_REJECTED", "AWAITING_APPROVAL", "UPLOAD_FAILED", "PUBLISH_VERIFICATION_FAILED", "PRODUCTION_FAILED", "NOT_DUE", "DRY_RUN"];
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
      return VIDEO_ID.test(videoId) && !Number.isNaN(Date.parse(publishAt)) ? "SUCCESS" : "PUBLISH_VERIFICATION_FAILED";
    }
    case "NOT_DUE": return "NOT_DUE";
    case "DRY_RUN": return "DRY_RUN";
    case "NO_TOPIC": return "CONTENT_BLOCKED";
    case "BLOCKED": return "QUALITY_REJECTED";
    case "FAILED":
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
    if (!record) return { channel: slug, outcome: "MISSING", category: "PRODUCTION_FAILED", published: false, reason: "no stage record for this run (the step crashed before tracking or did not run)", stages: null };
    const category = classify(record, channel);
    const publishAt = category === "SUCCESS" ? record.stages.SCHEDULE.detail : null;
    return { channel: slug, outcome: record.outcome || "FAILED", category, published: category === "SUCCESS", publishAt,
      reason: record.reason || (record.outcome ? null : "run ended without an outcome"), slug: record.slug, videoId: record.videoId || null, stages: record.stages };
  });
}

function markdown(rows) {
  const cell = (stage) => (!stage ? "—" : { done: "✅", failed: "❌", skipped: "⏭", scheduled: "🕘", "not-reached": "·" }[stage.status] || stage.status);
  const lines = ["## Shorts production outcome", "",
    `| Channel | Category | Video on its way | ${Stages.STAGES.join(" | ")} | Reason |`, `|---|---|---|${Stages.STAGES.map(() => "---").join("|")}|---|`];
  for (const row of rows) {
    const onItsWay = row.published ? `yes: ${row.videoId}, public at ${row.publishAt}` : "**no**";
    lines.push(`| ${row.channel} | **${row.category}** | ${onItsWay} | ${Stages.STAGES.map((stage) => cell(row.stages && row.stages[stage])).join(" | ")} | ${String(row.reason || row.videoId || "").replace(/\|/g, "/").slice(0, 220)} |`);
  }
  lines.push("", "✅ done · ❌ failed · ⏭ skipped · 🕘 scheduled on YouTube · · not reached");
  return lines.join("\n") + "\n";
}

if (require.main === module) {
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
  const uploaded = rows.filter((row) => row.published).map((row) => row.channel);
  console.log(`No production, upload or approval failure. Uploaded and scheduled this run: ${uploaded.length ? uploaded.join(", ") : "none"}.`);
}

module.exports = { evaluate, markdown, activeShortsChannels, classify, CATEGORIES, FAILING, WARNING };
