#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Channel = require("./core/channel-context");
const Discovery = require("./core/discovery");
const Rendering = require("./core/rendering");

const channel = Channel.getChannel("critical-thread");
const render = process.argv.includes("--render");
const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const topics = Discovery.universe(channel).topics || [];
const topic = requested
  ? topics.find((item) => item.slug === requested || item.id === requested)
  : topics.find((item) => item.topic === "The Machine the Entire Chip Industry Depends On");
if (!topic) throw new Error(`Missing CriticalThread dry-run topic: ${requested || "launch topic"}`);

const outputDirectory = path.join(channel.paths.reports, "dry-runs", topic.slug);
const result = Rendering.buildPackage(topic, channel, outputDirectory, { render });
const pass = Object.values(result.validations).every(Boolean);
const portable = JSON.parse(JSON.stringify(result));
portable.outputDirectory = path.relative(Channel.ROOT, outputDirectory);
for (const key of ["audio", "video", "thumbnail"]) {
  if (portable.render[key] && portable.render[key].file) portable.render[key].file = path.relative(Channel.ROOT, portable.render[key].file);
}
const report = { channel: channel.slug, dryRun: true, uploadAttempted: false, rendered: render, generatedAt: new Date().toISOString(), pass, result: portable };
fs.mkdirSync(channel.paths.reports, { recursive: true });
fs.writeFileSync(path.join(channel.paths.reports, "e2e-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`CriticalThread E2E: ${pass ? "PASS" : "FAIL"} — ${topic.topic}${render ? " (rendered)" : " (package)"}; upload disabled`);
if (!pass) process.exitCode = 4;
