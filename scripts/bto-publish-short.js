#!/usr/bin/env node
"use strict";
// The Hidden Logic of Things: render ONE reviewed Short and upload it PRIVATE
// with a scheduled publishAt (the channel's 21:00 Europe/Istanbul slot).
// Fail-closed: identity, package validations, the rendered visual audit and
// final readiness must all pass before anything is uploaded. Never deletes.
//
// Usage: node scripts/bto-publish-short.js <slug> [--dry-run]

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const Channel = require("../core/channel-context");
const Discovery = require("../core/discovery");
const Rendering = require("../core/rendering");
const Scripting = require("../core/scripting");
const Growth = require("../core/growth");
const Pipeline = require("../core/pipeline/impossible-brief");
const YT = require("../lib/yt");

const ROOT = Channel.ROOT;
const slug = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");

function read(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); }

function renderValidated(channel) {
  const topic = (Discovery.universe(channel).topics || []).find((item) => item.slug === slug || item.id === slug);
  if (!topic) throw new Error(`TOPIC_NOT_FOUND ${slug}`);
  if (topic.productionReady !== true || topic.researchStatus !== "VERIFIED") throw new Error("TOPIC_NOT_VERIFIED");
  const pre = Growth.planShort(channel, topic.id, { legacyTitles: Scripting.titleCandidates(topic), skipDuplicate: true, assignExperiment: true, write: !dryRun });
  if (pre.readiness.decision === "BLOCK") throw new Error(`PRE_RENDER_BLOCK: ${(pre.readiness.hardFails || []).join("; ")}`);
  const output = path.join(channel.paths.production, topic.slug);
  const result = Rendering.buildPackage(topic, channel, output, { render: true, growthPlan: pre, recordState: !dryRun });
  const failed = Object.entries(result.validations || {}).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error(`PACKAGE_VALIDATION_FAILED: ${failed.join(", ")} — ${JSON.stringify(result.validationReasons)}`);
  const video = result.render && result.render.video;
  if (!video || !video.visualQuality || video.visualQuality.decision !== "PUBLISH") throw new Error(`VISUAL_QUALITY_${video && video.visualQuality ? video.visualQuality.decision : "MISSING"}`);
  if (result.qualityGate.decision !== "PUBLISH") throw new Error(`QUALITY_GATE_${result.qualityGate.decision}: ${result.qualityGate.hardFails.join("; ")}`);
  const finalPlan = Growth.planShort(channel, topic.id, {
    legacyTitles: Scripting.titleCandidates(topic), skipDuplicate: true, stage: "final", assignExperiment: true, write: !dryRun, selection: pre.topicDecision,
    render: { completed: true, syntheticVoice: result.render.audio && result.render.audio.syntheticVoice, hasAudio: video.hasAudio, captionsBurned: video.captionsBurned,
      width: video.width, height: video.height, durationSeconds: video.durationSeconds, visualQuality: video.visualQuality },
  });
  if (finalPlan.readiness.decision !== "PUBLISH") throw new Error(`FINAL_READINESS_${finalPlan.readiness.decision}: ${(finalPlan.readiness.hardFails || []).join("; ")}`);
  Pipeline.writeCompatibilityFiles(result, topic, channel);
  write(path.join(output, "readiness.json"), finalPlan.readiness);
  Pipeline.writeValidationEvidence(result, topic, channel, output);
  return { topic, output, overall: result.qualityGate.overall, visual: video.visualQuality.score, distinct: video.distinctVisuals, duration: video.durationSeconds };
}

(async () => {
  if (!slug) throw new Error("usage: bto-publish-short.js <slug> [--dry-run]");
  const channel = Channel.getChannel("behind-the-ordinary");
  if (!dryRun) {
    const client = await YT.getYouTubeClient(channel);
    console.log(`identity PASS: ${client.identity.title || channel.name} (${client.identity.actual})`);
  }
  const rendered = renderValidated(channel);
  console.log(`render PASS: overall=${rendered.overall} visual=${rendered.visual} distinct=${rendered.distinct} duration=${rendered.duration}s`);
  if (dryRun) { console.log("dry run: upload skipped"); return; }
  const result = cp.spawnSync(process.execPath, [path.join(ROOT, "youtube-yukle.js"), "--channel", channel.slug, rendered.topic.slug], {
    cwd: ROOT, env: { ...process.env, PUBLISH_MODE: "live", YT_PRIVACY: "private", PROVENANCE_REQUIRED: process.env.PROVENANCE_REQUIRED || "0" },
    stdio: "inherit", timeout: 15 * 60 * 1000,
  });
  if (result.status !== 0) throw new Error(`UPLOAD_FAILED exit=${result.status}`);
  const rows = read(path.join(channel.paths.state, "published.json"), []) || [];
  const row = rows.filter((item) => item && item.slug === rendered.topic.slug && item.videoId).pop();
  if (!row) throw new Error("UPLOAD_NOT_RECORDED");
  console.log(`uploaded PRIVATE: ${row.videoId} publishAt=${row.publishAt || "none"}`);
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
