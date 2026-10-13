"use strict";

// 2026-10-12: GitHub started the 17:07 UTC watchdog cron at 23:35 UTC, after midnight Istanbul.
// "Today" was already 2026-10-13, whose 16:30 UTC deadline was 17 hours away. The check still
// reported that day unhealthy, ran recovery and recorded `sla-failure:2026-10-13`, which would
// have silenced the real alert for that day.

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Channel = require("../../core/channel-context");
const SLA = require("../../production-sla-check");

const ROOT = path.join(__dirname, "..", "..");

// A verified YouTube channel with no video on the checked day.
const emptyYouTube = {
  token: async () => "token",
  istemci: () => ({}),
  verifyChannelIdentity: async () => true,
  yuklemeler: async () => ({ ids: [] }),
  videolar: async () => [],
};

test("before the day's deadline nothing is recovered, even when YouTube confirms the day is empty", () => {
  const before = SLA.evaluateSnapshot({ date: "2026-10-13", channel: "critical-thread", published: [], generated: [], notifications: {},
    youtubeVerified: true, deadlinePassed: false });
  assert.equal(before.deadlinePassed, false);
  assert.equal(before.safeToRecover, false);
  assert.equal(before.deadlineAt, "2026-10-13T16:30:00.000Z");
  const after = SLA.evaluateSnapshot({ date: "2026-10-13", channel: "critical-thread", published: [], generated: [], notifications: {},
    youtubeVerified: true, deadlinePassed: true });
  assert.equal(after.safeToRecover, true, "after the deadline an empty, verified day is recovered as before");
  const legacy = SLA.evaluateSnapshot({ date: "2026-10-13", channel: "critical-thread", published: [], generated: [], notifications: {}, youtubeVerified: true });
  assert.equal(legacy.safeToRecover, true, "callers that pass no deadline keep the old behaviour");
});

test("a watchdog started after midnight Istanbul does not treat the new day as missed", async () => {
  const channel = Channel.getChannel("critical-thread");
  const late = await SLA.check({ channel, date: "2026-10-13", now: "2026-10-12T23:35:36Z", verifyYouTube: true, youtube: emptyYouTube, deadlineUtc: "16:30" });
  assert.equal(late.youtubeVerified, true);
  assert.equal(late.deadlinePassed, false);
  assert.equal(late.safeToRecover, false);
  const onTime = await SLA.check({ channel, date: "2026-10-13", now: "2026-10-13T16:35:00Z", verifyYouTube: true, youtube: emptyYouTube, deadlineUtc: "16:30" });
  assert.equal(onTime.deadlinePassed, true);
  assert.equal(onTime.safeToRecover, true, "the 16:35 UTC Cloudflare watchdog still recovers an empty day");
});

test("no SLA failure alert, and no alert key used up, for a day before its deadline", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sla-guard-"));
  const report = path.join(dir, "sla-after.json");
  fs.writeFileSync(report, JSON.stringify({ date: "2026-10-13", channel: "critical-thread", healthy: false, deadlinePassed: false, deadlineAt: "2026-10-13T16:30:00.000Z" }));
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const state = path.join(ROOT, "channels", "critical-thread", "state", "notification-state.json");
  const before = fs.existsSync(state) ? fs.readFileSync(state, "utf8") : null;
  const run = cp.spawnSync(process.execPath, ["bildirim.js", "--channel", "critical-thread", "--sla-failure", report], { cwd: ROOT, env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /not reached yet — no failure alert/);
  assert.equal(fs.existsSync(state) ? fs.readFileSync(state, "utf8") : null, before, "notification state is untouched");
});
