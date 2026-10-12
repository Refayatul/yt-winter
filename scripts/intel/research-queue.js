#!/usr/bin/env node
"use strict";
// Writes channels/<slug>/intel/research-queue.{json,md}: unresearched topics ranked for research.
//   node scripts/intel/research-queue.js --channel critical-thread [--top 25] [--stdout]
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const Growth = require(path.join(root, "core/growth"));
const Discovery = require(path.join(root, "core/discovery"));
const Queue = require(path.join(root, "core/intel/research-queue"));

function main(argv = process.argv.slice(2)) {
  const slug = argv.includes("--channel") ? argv[argv.indexOf("--channel") + 1] : null;
  if (!slug) { console.error("usage: research-queue.js --channel <slug> [--top N] [--stdout]"); return 1; }
  const channel = Channel.getChannel(slug);
  const used = new Set(Discovery.usedIds(channel));
  const rows = Growth.Context.rank(channel, {}).rows.filter((row) => !used.has(row.topic.id));
  const queue = Queue.build(channel, rows, { researched: (row) => !!((row.topic.narration && row.topic.narration.length) || (row.topic.raw && row.topic.raw.researched)) });
  const md = Queue.markdown(queue, Number(argv.includes("--top") ? argv[argv.indexOf("--top") + 1] : 25));
  if (argv.includes("--stdout")) { console.log(md); return 0; }
  const dir = path.join(channel.paths.base, "intel"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "research-queue.json"), JSON.stringify({ ...queue, queued: queue.queued.slice(0, 100) }, null, 1) + "\n");
  fs.writeFileSync(path.join(dir, "research-queue.md"), md);
  console.log(`${channel.name}: ${queue.queued.length} queued, ${queue.skipped.length} skipped`);
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
