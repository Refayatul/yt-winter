// ATTEMPT BUDGET: bounded retries per channel and per target publication day.
//
// GitHub can start the same scheduled production many times a day (14 portfolio crons, the
// Cloudflare dispatches, the watchdog). Without a budget a failing topic or a broken upload is retried
// on every run. Each channel keeps its own counters in <channel state>/ops/attempts.json:
//
//   { "channel": "...", "days": { "2026-10-14": { "topics": 2, "render": 2, "upload": 1, "updatedAt": "..." } } }
//
//   topics  topics that passed the pre-render gate and entered production (asset fetch, render)
//   render  renders started (narration + video)
//   upload  upload attempts (youtube-yukle.js runs)
//
// Limits default to { topics: 5, render: 3, upload: 2 } and can be set per channel in
// config.publishingCadence.shorts.retryBudget. A spent budget never deletes or marks a topic: the
// day is reported as PRODUCTION_FAILED with RETRY_BUDGET_EXHAUSTED and an alert, other channels and
// other days are untouched.
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_LIMITS = Object.freeze({ topics: 5, render: 3, upload: 2 });
const KINDS = Object.keys(DEFAULT_LIMITS);
const KEEP_DAYS = 21;

const file = (channel) => path.join(channel.paths.state, "ops", "attempts.json");

function limits(channel) {
  const configured = ((((channel.config || {}).publishingCadence || {}).shorts || {}).retryBudget) || {};
  const out = {};
  for (const kind of KINDS) out[kind] = Number.isInteger(configured[kind]) && configured[kind] > 0 ? configured[kind] : DEFAULT_LIMITS[kind];
  return out;
}

function load(channel) {
  try {
    const data = JSON.parse(fs.readFileSync(file(channel), "utf8"));
    return { channel: channel.slug, days: data && typeof data.days === "object" && data.days ? data.days : {} };
  } catch (error) { return { channel: channel.slug, days: {} }; }
}

function save(channel, data) {
  const days = Object.keys(data.days).sort().slice(-KEEP_DAYS);
  const kept = Object.fromEntries(days.map((day) => [day, data.days[day]]));
  fs.mkdirSync(path.dirname(file(channel)), { recursive: true });
  fs.writeFileSync(file(channel), JSON.stringify({ channel: channel.slug, days: kept }, null, 2) + "\n");
}

function assertArgs(day, kind) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) throw new Error(`attempt budget: invalid target day ${day}`);
  if (!KINDS.includes(kind)) throw new Error(`attempt budget: unknown kind ${kind}`);
}

function status(channel, day, kind) {
  assertArgs(day, kind);
  const used = Number((load(channel).days[day] || {})[kind]) || 0;
  const limit = limits(channel)[kind];
  return { ok: used < limit, used, limit, day, kind, channel: channel.slug };
}

// Reserve one attempt. Returns { ok:false } without recording anything when the budget is spent.
function take(channel, day, kind, { now = () => new Date().toISOString() } = {}) {
  const current = status(channel, day, kind);
  if (!current.ok) return current;
  const data = load(channel);
  const entry = { topics: 0, render: 0, upload: 0, ...(data.days[day] || {}) };
  entry[kind] = (Number(entry[kind]) || 0) + 1;
  entry.updatedAt = now();
  data.days[day] = entry;
  save(channel, data);
  return { ...current, ok: true, used: entry[kind] };
}

function exhaustedReason(result) {
  return `RETRY_BUDGET_EXHAUSTED: ${result.kind} ${result.used}/${result.limit} for ${result.day}`;
}

module.exports = { DEFAULT_LIMITS, KINDS, file, limits, load, status, take, exhaustedReason };
