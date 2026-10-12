#!/usr/bin/env node
"use strict";
// Continuous Edge narration for synchronous callers (core/rendering): one request for the whole script.
//   node scripts/narrate-continuous.js <spec.json>
// spec: { lines: [..], voice, rate, pausesMs: [..], out: "narration.mp3" } -> writes <out> and <out>.timing.json
const fs = require("fs");
const cp = require("child_process");
const FF = require("../ff-yol.js");
const { narrate } = require("../lib/edge-narration");

const probe = (file) => Number(cp.execFileSync(FF.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
narrate({ ...spec, probe }).then((result) => {
  fs.writeFileSync(spec.out + ".timing.json", JSON.stringify({ mode: result.mode, durationSec: result.durationSec, lineTimes: result.lineTimes, words: result.words }, null, 1));
  process.exit(0);
}).catch((error) => { console.error(error.message); process.exit(2); });
