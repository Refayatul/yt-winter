#!/usr/bin/env node
"use strict";

// CriticalThread dry run on the production path: the growth plan supplies the
// editorial script and pacing (as core/pipeline does), and a topic rejected
// only by the rendered-visual gate is skipped for the next qualified topic,
// exactly like a scheduled run. Upload is never attempted.

const fs = require("fs");
const path = require("path");
const Channel = require("./core/channel-context");
const Discovery = require("./core/discovery");
const Rendering = require("./core/rendering");
const Scripting = require("./core/scripting");
const Growth = require("./core/growth");
const { visualRejection, visualShortfall } = require("./core/pipeline/impossible-brief");

const MAX_ATTEMPTS = 3;
const channel = Channel.getChannel("critical-thread");
const render = process.argv.includes("--render");
const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const topics = Discovery.universe(channel).topics || [];
const MAX_TOPIC_SCANS = Math.max(MAX_ATTEMPTS, topics.length);
const launch = requested
  ? topics.find((item) => item.slug === requested || item.id === requested)
  : topics.find((item) => item.topic === "The Machine the Entire Chip Industry Depends On");
if (!launch) throw new Error(`Missing CriticalThread dry-run topic: ${requested || "launch topic"}`);

function nextTopic(tried) {
  if (!tried.length) return launch;
  if (requested) return null;
  // Use the production queue, not repeated daily selectShortTopic() calls.
  // selectShortTopic() intentionally returns one deterministic exploit/explore
  // winner; calling it again with exclusions can exhaust a tiny decision pool
  // after only a few visual rejects. orderedQueue() exposes every remaining
  // production-qualified A/B (then C when configured), so visual qualification
  // can actually scan the inventory as the scheduled pipeline is intended to.
  const queue = Growth.orderedQueue(channel, { exclude: tried.map((item) => item.topicId) }).order;
  const nextSlug = queue[0];
  return nextSlug ? topics.find((item) => item.slug === nextSlug) : null;
}

function portable(result) {
  const copy = JSON.parse(JSON.stringify(result));
  copy.outputDirectory = path.relative(Channel.ROOT, result.outputDirectory);
  for (const key of ["audio", "video", "thumbnail"]) {
    if (copy.render[key] && copy.render[key].file) copy.render[key].file = path.relative(Channel.ROOT, copy.render[key].file);
  }
  return copy;
}

const attempts = [];
let result = null;
let pass = false;
let lastPlan = null;
let renderAttempts = 0;
for (let scan = 1; scan <= MAX_TOPIC_SCANS && renderAttempts < MAX_ATTEMPTS; scan += 1) {
  const topic = nextTopic(attempts);
  if (!topic) break;
  const shortfall = render && !requested ? visualShortfall(topic, path.join(channel.paths.reports, "dry-runs", topic.slug)) : null;
  if (shortfall) {
    attempts.push({ topicId: topic.id, slug: topic.slug, topic: topic.topic, pass: false, visualPrecheck: shortfall });
    console.log(`CriticalThread E2E pre-check: skipped ${topic.topic} — ${shortfall}`);
    continue;
  }
  renderAttempts += 1;
  const plan = Growth.planShort(channel, topic.id, { legacyTitles: Scripting.titleCandidates(topic), skipDuplicate: true });
  lastPlan = plan;
  const outputDirectory = path.join(channel.paths.reports, "dry-runs", topic.slug);
  result = Rendering.buildPackage(topic, channel, outputDirectory, { render, growthPlan: plan });
  pass = Object.values(result.validations).every(Boolean);
  const visualReason = !pass && render && !requested ? visualRejection(result, outputDirectory) : null;
  attempts.push({ topicId: topic.id, slug: topic.slug, topic: topic.topic, pass, visualRejection: visualReason });
  console.log(`CriticalThread E2E attempt ${renderAttempts}: ${pass ? "PASS" : "FAIL"} — ${topic.topic}${render ? " (rendered)" : " (package)"}`);
  if (pass || !visualReason) break;
  console.log(`  visual gate BLOCK (controlled, topic skipped): ${visualReason}`);
}

const report = { channel: channel.slug, dryRun: true, uploadAttempted: false, rendered: render, generatedAt: new Date().toISOString(), pass, attempts, result: result && portable(result) };
fs.mkdirSync(channel.paths.reports, { recursive: true });
fs.writeFileSync(path.join(channel.paths.reports, "e2e-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`CriticalThread E2E: ${pass ? "PASS" : "FAIL"} — ${result ? attempts[attempts.length - 1].topic : "no topic"}; upload disabled`);
if (!pass) {
  if (result) {
    const failed = Object.entries(result.validations).filter(([, value]) => !value).map(([name]) => name);
    console.error(`Failed validations: ${failed.join(", ")}`);
    for (const name of failed) {
      const reasons = result.validationReasons && result.validationReasons[name];
      if (Array.isArray(reasons) && reasons.length) console.error(`  ${name}: ${reasons.join("; ")}`);
      if (name === "growthReadiness" && lastPlan && lastPlan.readiness) {
        const r = lastPlan.readiness;
        console.error(`  growthReadiness: stage=${r.stage} decision=${r.decision} score=${r.ProductionReadinessScore} thresholds=${JSON.stringify(r.thresholds)}`);
        console.error(`  growthReadiness dimensions: ${JSON.stringify(r.dimensions)}`);
        if (r.hardFails && r.hardFails.length) console.error(`  growthReadiness hardFails: ${r.hardFails.join("; ")}`);
        if (r.unmeasured && r.unmeasured.length) console.error(`  growthReadiness unmeasured: ${r.unmeasured.join(", ")}`);
      }
    }
    if (render && result.render.video) {
      console.error(`Render evidence: duration=${result.render.video.durationSeconds}s resolution=${result.render.video.width}x${result.render.video.height} audio=${result.render.video.hasAudio} visualChanges=${result.render.video.visualChanges}`);
    }
  }
  process.exitCode = 4;
}
