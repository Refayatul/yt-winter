"use strict";

// Growth-engine configuration: shared defaults (config/growth-engine.json)
// deep-merged with one channel's overrides (channels/<slug>/growth-engine.json).
// A channel never reads another channel's overrides.

const fs = require("fs");
const path = require("path");
const Channel = require("../channel-context");

const DEFAULTS_PATH = path.join(Channel.ROOT, "config", "growth-engine.json");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (key.startsWith("_")) continue;
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

function channelOverridePath(channel) {
  return path.join(channel.paths.base, "growth-engine.json");
}

const cache = new Map();

function forChannel(channel = Channel.getChannel()) {
  const key = channel.slug;
  if (cache.has(key)) return cache.get(key);
  const defaults = readJson(DEFAULTS_PATH, null);
  if (!defaults) throw new Error("Missing growth-engine defaults: config/growth-engine.json");
  const override = readJson(channelOverridePath(channel), {});
  const merged = deepMerge(defaults, override);
  merged.channel = channel.slug;
  // Channel config remains the single source for cadence and quality floors.
  const cadence = channel.config.publishingCadence || {};
  if (cadence.longForm && cadence.longForm.everyDays) merged.longform.cadenceDays = cadence.longForm.everyDays;
  if (cadence.shorts && cadence.shorts.targetDurationSeconds) merged.shortsDurationSeconds = cadence.shorts.targetDurationSeconds;
  const frozen = Object.freeze(merged);
  cache.set(key, frozen);
  return frozen;
}

function clearCache() { cache.clear(); }

module.exports = { DEFAULTS_PATH, deepMerge, forChannel, channelOverridePath, clearCache, readJson };
