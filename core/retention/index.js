"use strict";

const fs = require("fs");
const path = require("path");
const { getChannel } = require("../channel-context");

function learn(samples, channel = getChannel()) {
  const valid = (samples || []).filter((sample) => sample.channel === channel.slug);
  const best = (key) => valid.filter((sample) => sample[key] != null).sort((a, b) => b.averagePercentageViewed - a.averagePercentageViewed)[0];
  const rules = ["hookType", "durationSeconds", "secondBeat", "visualChangeFrequency", "questionStyle", "category", "ctaStyle"]
    .map((key) => ({ key, value: best(key)?.[key] ?? null, evidenceVideos: valid.length, confidence: valid.length >= channel.config.retentionRules.learnAfterVideos ? "SUPPORTED" : "ESTIMATED" }));
  const value = { channel: channel.slug, learnedRules: rules, sampleSize: valid.length, lastUpdated: new Date().toISOString() };
  const file = path.join(channel.paths.memory, "retention-rules.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  return value;
}

module.exports = { learn };
