#!/usr/bin/env node
"use strict";
// Collects a live competitor/outlier snapshot and builds the breakout feed.
//   PD_YT_API_KEY=... node scripts/profitdecoded/collect-competitors.js [--budget 3000] [--threshold 55] [--dry]
// --dry prints the planned quota cost and exits (no key needed).
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const C = require(path.join(root, "core/profitdecoded/yt-collector"));
const Comp = require(path.join(root, "core/profitdecoded/competitive"));
const argv = process.argv.slice(2); const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const cfg = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/intel/reference-channels.json"), "utf8"));
const universe = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/topics/topic-universe.json"), "utf8")).topics;
const budget = +flag("--budget", cfg.quotaBudget);
const searches = cfg.queries.length * cfg.windowsDays.length;
const planned = searches * C.COST.search + cfg.referenceHandles.length + 60 * 2;
console.log(`plan: ${searches} searches x ${C.COST.search} + handles + about 60 channels (stats + uploads + videos) ~ ${planned} units (budget ${budget}; free daily quota is 10,000)`);
if (argv.includes("--dry")) process.exit(0);
(async () => {
  const { snapshot, report } = await C.collect(cfg, { quotaBudget: budget });
  const dir = path.join(root, "channels/profitdecoded/intel"); const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dir, `snapshot-${stamp}.json`), JSON.stringify(snapshot));
  const feed = Comp.buildBreakoutFeed(snapshot, { threshold: +flag("--threshold", 55), inventory: universe });
  fs.writeFileSync(path.join(dir, `breakout-feed-${stamp}.json`), JSON.stringify(feed, null, 1) + "\n");
  fs.writeFileSync(path.join(dir, `collection-report-${stamp}.json`), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify(report, null, 1));
  console.log(`breakout feed: ${feed.count} opportunities -> channels/profitdecoded/intel/breakout-feed-${stamp}.json`);
  for (const f of feed.feed.slice(0, 10)) console.log(` ${f.opportunityScore}  ${f.saturation.class.padEnd(9)} small=${f.outlier.smallChannelOutlier ? "Y" : "n"}  ${f.pillar}  <- ${f.topic ? f.topic.topic : "(no inventory match)"}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
