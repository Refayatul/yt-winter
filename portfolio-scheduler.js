#!/usr/bin/env node
"use strict";

const Scheduler = require("./core/scheduling");
const plan = Scheduler.portfolioPlan();
if (process.argv.includes("--enqueue")) Scheduler.enqueue(plan);
if (process.argv.includes("--json")) console.log(JSON.stringify(plan, null, 2));
else {
  console.log("TODAY\n");
  for (const item of plan.channels) {
    console.log(`${item.channel}:`);
    console.log(`Short due: ${item.short.due ? "YES" : "NO"}`);
    console.log(`Long due: ${item.long.due ? "YES" : "NO"}\n`);
  }
  console.log(`Queue: ${plan.queue.map((item) => item.key).join(" → ") || "empty"}`);
  // Shadow channels (registered but disabled) are planned for visibility only and are never enqueued.
  const shadow = require("./core/profitdecoded/schedule").plan(new Date());
  console.log(`Shadow (not enqueued): ${shadow.channel} — Short ${shadow.short.publishAtLocal} (prod ${shadow.short.productionStartUtc.slice(11, 16)}Z), long ${shadow.long.publishLocal}`);
  console.log(`Limits: ${plan.resourceLimits.maxConcurrentRenders} render / ${plan.resourceLimits.maxConcurrentUploads} upload`);
}
