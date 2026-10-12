#!/usr/bin/env node
"use strict";

// PRODUCTION OUTCOME: what this workflow run actually achieved, per active Shorts channel.
//
//   node scripts/production-outcome.js            writes reports/production-outcome.json and the
//                                                 run summary ($GITHUB_STEP_SUMMARY); exit 0
//   node scripts/production-outcome.js --verdict  exit 1 when an active channel was due and
//                                                 nothing was uploaded (FAILED, NO_TOPIC, BLOCKED
//                                                 or no record), so a green run means real output
//
// Reads each channel's stage record (lib/run-stages.js) for this run (GITHUB_RUN_ID). A channel
// that already uploaded today, or whose slot has not come yet, is NOT_DUE and fine.

const fs = require("fs");
const path = require("path");
const Channel = require("../core/channel-context");
const Stages = require("../lib/run-stages");

const ROOT = path.join(__dirname, "..");
const FAILING = new Set(["FAILED", "NO_TOPIC", "BLOCKED", "MISSING"]);

function activeShortsChannels() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "channels.json"), "utf8")).channels;
  return Object.entries(registry).filter(([slug, item]) => item.enabled && slug !== "profitdecoded").map(([slug]) => slug);
}

function evaluate(runId = process.env.GITHUB_RUN_ID || null, channels = activeShortsChannels()) {
  return channels.map((slug) => {
    const channel = Channel.getChannel(slug);
    const record = Stages.latest(channel, runId);
    if (!record) return { channel: slug, outcome: "MISSING", reason: "no stage record for this run (the step crashed before tracking or did not run)", stages: null };
    return { channel: slug, outcome: record.outcome || "FAILED", reason: record.reason || (record.outcome ? null : "run ended without an outcome"), slug: record.slug, videoId: record.videoId || null, stages: record.stages };
  });
}

function markdown(rows) {
  const cell = (stage) => (!stage ? "—" : { done: "✅", failed: "❌", skipped: "⏭", scheduled: "🕘", "not-reached": "·" }[stage.status] || stage.status);
  const lines = ["## Shorts production outcome", "",
    `| Channel | Outcome | ${Stages.STAGES.join(" | ")} | Reason |`, `|---|---|${Stages.STAGES.map(() => "---").join("|")}|---|`];
  for (const row of rows) {
    lines.push(`| ${row.channel} | **${row.outcome}** | ${Stages.STAGES.map((stage) => cell(row.stages && row.stages[stage])).join(" | ")} | ${String(row.reason || row.videoId || "").replace(/\|/g, "/").slice(0, 220)} |`);
  }
  lines.push("", "✅ done · ❌ failed · ⏭ skipped · 🕘 scheduled on YouTube · · not reached");
  return lines.join("\n") + "\n";
}

if (require.main === module) {
  const rows = evaluate();
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
  const failing = rows.filter((row) => FAILING.has(row.outcome));
  for (const row of failing) console.log(`::error::${row.channel}: ${row.outcome}${row.reason ? ` — ${row.reason}` : ""}`);
  if (failing.length) { console.log(`${failing.length} active channel(s) produced nothing this run.`); process.exit(1); }
  console.log("Every active channel either uploaded or was not due.");
}

module.exports = { evaluate, markdown, activeShortsChannels, FAILING };
