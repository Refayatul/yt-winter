#!/usr/bin/env node
"use strict";

// The Hidden Logic of Things end-to-end package dry run. It follows the same shared
// discovery → growth → render-package path as the other isolated channels and
// deliberately never calls the uploader.

const fs = require("fs");
const path = require("path");
const Channel = require("./core/channel-context");
const Discovery = require("./core/discovery");
const Growth = require("./core/growth");
const Rendering = require("./core/rendering");
const Scripting = require("./core/scripting");

const channel = Channel.getChannel("behind-the-ordinary");
const render = process.argv.includes("--render");
const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
// An explicit topic is a reproducible test fixture and may be re-rendered even
// when historical generated/published state marks it used. Normal unattended
// discovery still excludes used and blocked records.
const candidates = requested
  ? Discovery.universe(channel).topics.filter((item) => item.productionReady === true && item.researchStatus === "VERIFIED")
  : Discovery.discover(channel, { limit: 50 });
const topic = candidates.find((item) => !requested || item.slug === requested || item.id === requested);
if (!topic) throw new Error(`Missing production-ready The Hidden Logic of Things topic: ${requested || "launch topic"}`);

const plan = Growth.planShort(channel, topic.id, {
  legacyTitles: Scripting.titleCandidates(topic),
  skipDuplicate: true,
  disclosureEnabled: true,
});
const outputDirectory = path.join(channel.paths.reports, "dry-runs", topic.slug);
const result = Rendering.buildPackage(topic, channel, outputDirectory, { render, growthPlan: plan, recordState: false });
const cadence = channel.config.publishingCadence || {};
const analytics = channel.config.analytics || {};
const analyticsFeatures = plan.growthMeta || {};
result.validations.scheduling = channel.config.publishTime === "21:00" && channel.config.publishTimeZone === "Europe/Istanbul" &&
  cadence.shorts && cadence.shorts.everyDays === 1 && cadence.longForm && cadence.longForm.everyDays === 7;
result.validations.analyticsMetadata = JSON.stringify(analytics.checkpointsHours) === JSON.stringify([1, 6, 24, 48, 168]) &&
  ["questionType", "payoffType", "narratorSpeed", "visualDensity"].every((key) => analyticsFeatures[key] != null);
if (!result.validations.scheduling) result.validationReasons.scheduling = ["daily Shorts / weekly long-form schedule is not pinned to 21:00 Europe/Istanbul"];
if (!result.validations.analyticsMetadata) result.validationReasons.analyticsMetadata = ["missing 1h/6h/24h/48h/7d checkpoints or channel-specific learning features"];
const failed = Object.entries(result.validations).filter(([, value]) => !value).map(([name]) => name);
const report = {
  channel: channel.slug,
  dryRun: true,
  uploadAttempted: false,
  rendered: render,
  generatedAt: new Date().toISOString(),
  topicId: topic.id,
  topic: topic.topic,
  growthDecision: plan.readiness.decision,
  packageDecision: result.qualityGate.decision,
  pass: failed.length === 0,
  failed,
  result: {
    ...JSON.parse(JSON.stringify(result, (key, value) => key === "file" && typeof value === "string" && path.isAbsolute(value) ? path.relative(Channel.ROOT, value) : value)),
    outputDirectory: path.relative(Channel.ROOT, result.outputDirectory),
  },
};
fs.mkdirSync(channel.paths.reports, { recursive: true });
fs.writeFileSync(path.join(channel.paths.reports, "e2e-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`The Hidden Logic of Things E2E: ${report.pass ? "PASS" : "FAIL"} — ${topic.topic}${render ? " (rendered)" : " (package)"}; upload disabled`);
if (failed.length) {
  console.error(`Failed validations: ${failed.join(", ")}`);
  process.exitCode = 4;
}
