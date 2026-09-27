"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const Channel = require("../../core/channel-context");
const Publishing = require("../../core/publishing");
const Research = require("../../core/research");
const Scripting = require("../../core/scripting");
const Quality = require("../../core/quality/impossible-brief");
const Discovery = require("../../core/discovery");
const Library = require("../../core/analytics/library-health");
const Scheduler = require("../../core/scheduling");
const Simulation = require("../../core/simulation/two-channel");
const Rendering = require("../../core/rendering");
const Retention = require("../../core/retention");
const Notifications = require("../../core/notifications");

const ROOT = path.resolve(__dirname, "..", "..");

test("channel registry defaults safely and parses --channel in both forms", () => {
  const registry = Channel.registry();
  assert.equal(registry.defaultChannel, "failure-reconstructed");
  assert.deepEqual(Object.keys(registry.channels).sort(), ["failure-reconstructed", "impossible-brief"]);
  assert.deepEqual(Channel.parseChannelArgv(["--channel", "impossible-brief", "--due"]), { slug: "impossible-brief", argv: ["--due"] });
  assert.deepEqual(Channel.parseChannelArgv(["--channel=failure-reconstructed", "x"]), { slug: "failure-reconstructed", argv: ["x"] });
  assert.throws(() => Channel.parseChannelArgv(["--channel", "unknown"]), /Unknown channel/);
});

test("channel data roots, analytics, memory, production, and state never overlap", () => {
  const fr = Channel.getChannel("failure-reconstructed");
  const ib = Channel.getChannel("impossible-brief");
  for (const key of ["topics", "analytics", "state", "memory", "reports", "packages", "production", "secrets"]) {
    assert.notEqual(fr.paths[key], ib.paths[key], key);
  }
  assert.ok(ib.paths.state.startsWith(path.join(ROOT, "channels", "impossible-brief")));
  assert.ok(!ib.paths.state.includes(path.join(ROOT, "icerik")));
});

test("YouTube credentials are namespaced; ImpossibleBrief cannot inherit legacy YT secrets", () => {
  const keys = ["YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN", "FR_YT_CLIENT_ID", "FR_YT_CLIENT_SECRET", "FR_YT_REFRESH_TOKEN", "IB_YT_CLIENT_ID", "IB_YT_CLIENT_SECRET", "IB_YT_REFRESH_TOKEN"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.YT_CLIENT_ID = "legacy-id";
    process.env.YT_CLIENT_SECRET = "legacy-secret";
    process.env.YT_REFRESH_TOKEN = "legacy-token";
    process.env.IB_YT_CLIENT_ID = "ib-id";
    process.env.IB_YT_CLIENT_SECRET = "ib-secret";
    process.env.IB_YT_REFRESH_TOKEN = "ib-token";
    const fr = Channel.getChannel("failure-reconstructed").credentials();
    const ib = Channel.getChannel("impossible-brief").credentials();
    assert.equal(fr.clientId, "legacy-id", "legacy fallback remains only for original channel");
    assert.equal(ib.clientId, "ib-id");
    delete process.env.IB_YT_CLIENT_ID;
    assert.equal(Channel.getChannel("impossible-brief").credentials().clientId, "", "no fallback to shared credential");
  } finally {
    for (const key of keys) saved[key] == null ? delete process.env[key] : process.env[key] = saved[key];
  }
});

test("wrong-channel upload is blocked before any mutation", async () => {
  const key = "IB_YT_CHANNEL_ID";
  const saved = process.env[key];
  process.env[key] = "UC_IMPOSSIBLE_BRIEF";
  try {
    const ib = Channel.getChannel("impossible-brief");
    assert.throws(() => Publishing.assertUploadTarget("UC_FAILURE_RECONSTRUCTED", ib), /CHANNEL_ID_MISMATCH/);
    assert.deepEqual(Publishing.assertUploadTarget("UC_IMPOSSIBLE_BRIEF", ib).ok, true);
    const yt = require("../../lib/yt");
    await assert.rejects(() => yt.verifyChannelIdentity({ data: async () => ({ ok: true, veri: { items: [{ id: "UC_FAILURE_RECONSTRUCTED", snippet: { title: "Failure Reconstructed" } }] } }) }, ib), /upload blocked/);
  } finally { saved == null ? delete process.env[key] : process.env[key] = saved; }
});

test("library has 500 qualified, source-based, non-duplicate topics in the target mix", () => {
  const channel = Channel.getChannel("impossible-brief");
  const universe = Discovery.universe(channel);
  assert.equal(universe.count, 500);
  assert.equal(new Set(universe.topics.map((topic) => topic.id)).size, 500);
  assert.equal(new Set(universe.topics.map((topic) => topic.topic.toLowerCase())).size, 500);
  assert.deepEqual(Object.fromEntries(Object.entries(universe.categoryTargets)), { SPACE: 125, EARTH: 100, PHYSICS: 100, HUMAN: 50, "FUTURE TECHNOLOGY": 50, "EXTREME SCIENCE": 50, OTHER: 25 });
  for (const topic of universe.topics) {
    assert.equal(Research.auditTopic(topic).pass, true, topic.id);
    assert.notEqual(Quality.evaluateTopic(topic, universe.topics).decision, "BLOCK", topic.id);
    assert.ok(topic.visualPotential.score >= 70 && topic.quality.nonDuplicate);
  }
  const health = Library.calculate(channel);
  assert.ok(health.qualifiedTopics >= 365);
  assert.ok(health.daysOfInventory >= 365);
  assert.equal(health.duplicateTopics, 0);
});

test("ImpossibleBrief package enforces claims, hooks, 20 titles, visuals, metadata and no upload", () => {
  const channel = Channel.getChannel("impossible-brief");
  const topic = Discovery.universe(channel).topics.find((item) => item.topic === "What If Gravity Doubled Tomorrow?");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ib-e2e-"));
  try {
    const result = Rendering.buildPackage(topic, channel, temp, { render: false });
    assert.ok(Object.values(result.validations).every(Boolean));
    assert.equal(Scripting.titleCandidates(topic).length, 20);
    assert.equal(Scripting.shortScript(topic).forbiddenOpening, false);
    const metadata = JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"), "utf8"));
    assert.equal(metadata.uploadEnabled, false);
    assert.equal(metadata.uploadChannel, "impossible-brief");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("portfolio scheduling serializes shared render/upload resources", () => {
  const plan = Scheduler.portfolioPlan(new Date("2030-01-01T12:00:00Z"));
  assert.equal(plan.channels.length, 2);
  assert.equal(plan.resourceLimits.maxConcurrentRenders, 1);
  assert.equal(plan.resourceLimits.maxConcurrentUploads, 1);
  assert.ok(plan.queue.every((task) => task.renderLane === 0 && task.uploadLane === 0));
});

test("retention learning only accepts samples from the selected channel", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ib-memory-"));
  const base = Channel.getChannel("impossible-brief");
  const fake = { ...base, paths: { ...base.paths, memory: temp } };
  try {
    const result = Retention.learn([
      { channel: "failure-reconstructed", hookType: "archive", averagePercentageViewed: 99 },
      { channel: "impossible-brief", hookType: "consequence", averagePercentageViewed: 80 },
    ], fake);
    assert.equal(result.sampleSize, 1);
    assert.equal(result.learnedRules.find((rule) => rule.key === "hookType").value, "consequence");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("30-day failure simulation preserves both channels and blocks wrong target", () => {
  const result = Simulation.simulate30Days();
  assert.equal(result.pass, true);
  assert.equal(result.channels["failure-reconstructed"].shorts, 30);
  assert.equal(result.channels["impossible-brief"].shorts, 30);
  assert.equal(result.injectedFailures.length, 7);
  assert.equal(result.wrongChannelGuard.blocked, true);
  assert.equal(result.wrongChannelGuard.mutationOccurred, false);
});

test("major CLI modules resolve channel-specific library paths", () => {
  const program = "const C=require('./core/channel-context');C.selectChannel('impossible-brief');const K=require('./lib/kutuphane');console.log(JSON.stringify(K.YOL))";
  const output = cp.execFileSync(process.execPath, ["-e", program], { cwd: ROOT, encoding: "utf8" });
  const paths = JSON.parse(output);
  assert.ok(paths.yayinlananlar.includes("channels/impossible-brief/state/published.json"));
  assert.ok(paths.uretim.includes("channels/impossible-brief/state/production"));
});

test("every notification title carries an unambiguous channel name", () => {
  const fr = Channel.getChannel("failure-reconstructed");
  const ib = Channel.getChannel("impossible-brief");
  assert.equal(Notifications.prefix("Short scheduled", fr), "[Failure Reconstructed] Short scheduled");
  assert.equal(Notifications.prefix("Short scheduled", ib), "[ImpossibleBrief] Short scheduled");
});
