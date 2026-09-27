#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./core/channel-context");
const Simulation = require("./core/simulation/two-channel");
const result = Simulation.simulate30Days();
const markdown = Simulation.markdown(result);
const file = path.join(ROOT, "analysis", "TWO-CHANNEL-30-DAY-SIMULATION.md");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, markdown + "\n");
fs.writeFileSync(path.join(ROOT, "analysis", "two-channel-30-day-simulation.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`30-day simulation: ${result.pass ? "PASS" : "FAIL"}`);
console.log(`Failure Reconstructed: ${result.channels["failure-reconstructed"].shorts} Shorts, ${result.channels["failure-reconstructed"].longForm} long-form`);
console.log(`ImpossibleBrief: ${result.channels["impossible-brief"].shorts} Shorts, ${result.channels["impossible-brief"].longForm} long-form`);
if (!result.pass) process.exitCode = 4;
