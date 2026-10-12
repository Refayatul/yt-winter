#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./core/channel-context");
const Channel = require("./core/channel-context");
const Library = require("./core/analytics/library-health");
const Simulation = require("./core/simulation/two-channel");
// The model covers all four channels. A channel switched off in config/channels.json
// (enabled:false; The Hidden Logic of Things since 2026-10-11) publishes nothing: inventory 0,
// so every day is a gap for it and the other channels must still pass on their own.
const MODELED = ["failure-reconstructed", "impossible-brief", "critical-thread", "behind-the-ordinary"];
const active = new Set(Channel.activeSlugs());
const inventories = Object.fromEntries(MODELED.map((slug) => [slug,
  active.has(slug) ? Library.calculate(Channel.getChannel(slug)) : { readyShorts: 0, qualifiedTopics: 0 }]));
const result = Simulation.simulate30Days({
  // The Hidden Logic of Things starts from its evidence-verified records only; its
  // question-only research backlog is never counted as publishable inventory.
  initialInventory: Object.fromEntries(Object.entries(inventories).map(([slug, value]) => [slug, value.readyShorts])),
  qualifiedInventory: Object.fromEntries(Object.entries(inventories).map(([slug, value]) => [slug, value.qualifiedTopics])),
  // These are deliberately false until the external/manual prerequisites in
  // docs are completed. The safety model can pass while production readiness
  // remains honestly NOT READY.
  longFormProductionWired: false,
  externalWatchdogDeployed: true,
  allFourOAuthIdentitiesConfigured: false,
  inactive: MODELED.filter((slug) => !active.has(slug)),
});
const markdown = Simulation.markdown(result);
const markdownFile = markdown.replace(/\s+$/, "") + "\n";
const file = path.join(ROOT, "analysis", "TWO-CHANNEL-30-DAY-SIMULATION.md");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, markdownFile);
fs.writeFileSync(path.join(ROOT, "analysis", "two-channel-30-day-simulation.json"), JSON.stringify(result, null, 2) + "\n");
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "autonomy-simulation-30d.md"), markdownFile);
fs.writeFileSync(path.join(ROOT, "reports", "autonomy-simulation-30d.json"), JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "reports", "four-channel-autonomy-30d.md"), markdownFile);
fs.writeFileSync(path.join(ROOT, "reports", "four-channel-autonomy-30d.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`30-day simulation: ${result.pass ? "PASS" : "FAIL"}`);
console.log(`Production readiness: ${result.productionReady ? "READY" : "NOT READY"}`);
console.log(`Failure Reconstructed: ${result.channels["failure-reconstructed"].shorts} Shorts, ${result.channels["failure-reconstructed"].longForm} long-form`);
console.log(`ImpossibleBrief: ${result.channels["impossible-brief"].shorts} Shorts, ${result.channels["impossible-brief"].longForm} long-form`);
console.log(`CriticalThread: ${result.channels["critical-thread"].shorts} Shorts, ${result.channels["critical-thread"].longForm} long-form`);
console.log(`The Hidden Logic of Things: ${result.channels["behind-the-ordinary"].shorts} Shorts, ${result.channels["behind-the-ordinary"].longForm} long-form, ${result.channels["behind-the-ordinary"].researchGapDays} research-gap day(s)`);
if (!result.pass) process.exitCode = 4;
