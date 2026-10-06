"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Channel = require("../../core/channel-context");
const Scheduling = require("../../core/scheduling");
const PD = (m) => require("../../core/profitdecoded/" + m);

const ROOT = path.resolve(__dirname, "..", "..");

test("ProfitDecoded is registered as an isolated, disabled shadow channel", () => {
  const entry = Channel.registry().channels.profitdecoded;
  assert.equal(entry.enabled, false);
  assert.equal(entry.status, "shadow");
  const channel = Channel.getChannel("profitdecoded");
  assert.equal(channel.config.slug, "profitdecoded");
  assert.equal(channel.config.name, "ProfitDecoded");
  assert.equal(channel.config.tagline, "The business behind everyday life.");
  assert.equal(channel.config.pathMode, "isolated");
  assert.equal(channel.config.allowLegacyYouTubeEnv, false);
});

test("every ProfitDecoded path lives under channels/profitdecoded (state, analytics, memory, topics, reports)", () => {
  const channel = Channel.getChannel("profitdecoded");
  const base = path.join(ROOT, "channels", "profitdecoded");
  for (const key of ["state", "analytics", "memory", "reports", "prompts", "topics", "topicUniverse", "packages", "production"]) {
    assert.ok(channel.paths[key].startsWith(base), `${key} -> ${channel.paths[key]}`);
  }
});

test("credentials are PD_-scoped only and never fall back to another channel's or the legacy YT_ names", () => {
  const names = Channel.getChannel("profitdecoded").credentialNames;
  for (const list of Object.values(names)) for (const n of list) assert.match(n, /^PD_YT_/);
  const before = { ...process.env };
  process.env.YT_CLIENT_ID = "legacy"; process.env.FR_YT_CLIENT_ID = "fr"; process.env.CT_CLIENT_ID = "ct";
  try { assert.equal(Channel.getChannel("profitdecoded").credentials().clientId, ""); }
  finally { for (const k of ["YT_CLIENT_ID", "FR_YT_CLIENT_ID", "CT_CLIENT_ID"]) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
});

test("a disabled channel stays out of every live portfolio loop and the four live channels are unchanged", () => {
  assert.deepEqual(Channel.activeSlugs().sort(), ["behind-the-ordinary", "critical-thread", "failure-reconstructed", "impossible-brief"]);
  assert.ok(!Channel.allChannels().some((c) => c.slug === "profitdecoded"));
  const plan = Scheduling.portfolioPlan(new Date("2026-10-06T12:00:00Z"));
  assert.ok(!plan.channels.some((c) => c.channel === "profitdecoded"));
  assert.ok(!plan.queue.some((t) => t.channel === "profitdecoded"));
});

test("scheduler: shadow plan uses US-Eastern windows, DST-correct, and avoids existing cron minutes", () => {
  const S = PD("schedule");
  const summer = S.plan(new Date("2026-07-14T10:00:00Z"));
  const winter = S.plan(new Date("2026-12-15T10:00:00Z"));
  assert.equal(summer.short.publishAtUtc, "2026-07-14T16:00:00.000Z"); // 12:00 EDT
  assert.equal(winter.short.publishAtUtc, "2026-12-15T17:00:00.000Z"); // 12:00 EST
  assert.match(summer.long.publishLocal, /Saturday 09:30 America\/New_York/);
  assert.equal(summer.short.productionStartUtc.slice(14, 16), "50");
  assert.ok(!summer.renderIsolation.avoidsExistingCronMinutes.includes(50));
  assert.equal(summer.short.maxPerDay, 1);
});

test("publish protection: nothing uploads in tests, and each missing condition is named", () => {
  const S = PD("schedule");
  const guard = S.publishGuard({});
  assert.equal(guard.allowed, false);
  for (const expect of [/dry-run/, /enabled=false/, /PD_PUBLISH/, /credentials/, /channel id/, /no quality assessment/, /human approval/]) assert.ok(guard.blocks.some((b) => expect.test(b)), String(expect));
  // Even a PUBLISH assessment with every flag set is blocked while the channel config is disabled.
  const all = S.publishGuard({ dryRun: false, env: { PD_PUBLISH: "1", PD_YT_CHANNEL_ID: "UCx" }, hasCredentials: true, approvals: 9, assessment: { decision: "PUBLISH" } });
  assert.equal(all.allowed, false);
  assert.ok(all.blocks.some((b) => /enabled=false/.test(b)));
});

test("learning and analytics isolation: persistence refuses paths outside channels/profitdecoded", () => {
  const L = PD("learning");
  assert.throws(() => L.assertChannelPath(path.join(ROOT, "channels", "critical-thread", "memory", "learning.json")), /isolation/);
  assert.throws(() => L.assertChannelPath(path.join(ROOT, "analytics", "x.json")), /isolation/);
  assert.doesNotThrow(() => L.assertChannelPath(L.MEMORY));
  assert.ok(L.MEMORY.includes(path.join("channels", "profitdecoded")));
  // No other channel's code path references ProfitDecoded state.
  const other = fs.readFileSync(path.join(ROOT, "core", "growth", "learning.js"), "utf8");
  assert.ok(!/profitdecoded/.test(other));
});

test("ProfitDecoded files are never imported by the existing channels' production code", () => {
  for (const dir of ["core/growth", "core/pipeline", "core/rendering", "core/publishing", "core/quality"]) {
    for (const file of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".js"))) {
      assert.ok(!/profitdecoded/i.test(fs.readFileSync(path.join(ROOT, dir, file), "utf8")), `${dir}/${file}`);
    }
  }
});
