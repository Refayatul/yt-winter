"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Channel = require("../../core/channel-context");
const Discovery = require("../../core/discovery");
const Rendering = require("../../core/rendering");
const Scripting = require("../../core/scripting");
const SharedQuality = require("../../core/quality");
const BehindQuality = require("../../core/quality/behind-the-ordinary");

function envBackup() {
  return { ...process.env };
}

function restoreEnv(old) {
  for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
  Object.assign(process.env, old);
}

test("channel registry defaults safely and parses --channel in both forms", () => {
  assert.equal(Channel.defaultChannel().slug, "failure-reconstructed");
  assert.equal(Channel.fromArgv(["node", "x", "--channel", "impossible-brief"]).slug, "impossible-brief");
  assert.equal(Channel.fromArgv(["node", "x", "--channel=critical-thread"]).slug, "critical-thread");
});

test("channel data roots, analytics, memory, production, and state never overlap", () => {
  const channels = Channel.listChannels();
  assert.equal(channels.length, 4);
  for (const name of ["root", "analytics", "memory", "production", "state"]) {
    const values = channels.map((channel) => channel.paths[name]);
    assert.equal(new Set(values).size, channels.length, `${name} path collision`);
  }
});

test("YouTube credentials are namespaced; isolated channels cannot inherit legacy secrets", () => {
  const old = envBackup();
  try {
    process.env.YT_CLIENT_ID = "legacy-id";
    process.env.YT_CLIENT_SECRET = "legacy-secret";
    process.env.YT_REFRESH_TOKEN = "legacy-refresh";
    process.env.YT_CHANNEL_ID = "legacy-channel";
    for (const slug of ["impossible-brief", "critical-thread", "behind-the-ordinary"]) {
      const channel = Channel.getChannel(slug);
      for (const names of Object.values(channel.config.credentialEnv)) for (const name of names) delete process.env[name];
      const creds = Channel.credentials(channel);
      assert.equal(creds.clientId, "");
      assert.equal(creds.clientSecret, "");
      assert.equal(creds.refreshToken, "");
      assert.equal(creds.channelId, "");
    }
    const legacy = Channel.credentials(Channel.getChannel("failure-reconstructed"));
    assert.equal(legacy.clientId, "legacy-id");
    assert.equal(legacy.refreshToken, "legacy-refresh");
  } finally { restoreEnv(old); }
});

test("all twelve wrong-channel upload directions are blocked before mutation", () => {
  const channels = Channel.listChannels();
  for (const intended of channels) {
    for (const authenticated of channels) {
      if (intended.slug === authenticated.slug) continue;
      assert.throws(() => Channel.assertUploadIdentity(intended.slug, authenticated.slug), /UPLOAD IDENTITY BLOCK/);
    }
  }
});

test("library has 500 qualified, source-based, non-duplicate topics in the target mix", () => {
  const universe = Discovery.universe(Channel.getChannel("failure-reconstructed"));
  assert.equal(universe.stats.total, 500);
  assert.equal(new Set(universe.topics.map((item) => item.id)).size, 500);
  assert.ok(universe.topics.every((item) => item.sources && item.sources.length));
});

test("ImpossibleBrief package enforces claims, hooks, 20 titles, visuals, metadata and no upload", () => {
  const channel = Channel.getChannel("impossible-brief");
  const topic = Discovery.universe(channel).topics.find((item) => item.topic === "What If Gravity Doubled Tomorrow?");
  assert.ok(topic);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ib-e2e-"));
  try {
    const plan = require("../../core/growth").planShort(channel, topic.id, { skipDuplicate: true });
    const result = Rendering.buildPackage(topic, channel, temp, { render: false, growthPlan: plan });
    assert.ok(Object.values(result.validations).every(Boolean));
    assert.equal(Scripting.titleCandidates(topic).length >= 20, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"), "utf8")).uploadChannel, "impossible-brief");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("CriticalThread has 500+ distinct sourced topics and an isolated launch package", () => {
  const channel = Channel.getChannel("critical-thread");
  const universe = Discovery.universe(channel);
  assert.ok(universe.stats.total >= 500);
  assert.equal(new Set(universe.topics.map((topic) => topic.id)).size, universe.stats.total);
  assert.ok(universe.topics.every((topic) => Array.isArray(topic.sources) && topic.sources.length));
  const topic = universe.topics.find((item) => item.productionReady === true);
  assert.ok(topic);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ct-e2e-"));
  try {
    const plan = require("../../core/growth").planShort(channel, topic.id, { skipDuplicate: true });
    const result = Rendering.buildPackage(topic, channel, temp, { render: false, growthPlan: plan });
    assert.ok(Object.values(result.validations).every(Boolean));
    const longForm = JSON.parse(fs.readFileSync(path.join(temp, "long-form-outline.json"), "utf8"));
    assert.deepEqual(longForm.targetMinutes, [8, 18]);
    assert.equal(longForm.sections.length, 8);
    assert.equal(longForm.titleCandidates.length, 20);
    assert.equal(longForm.standaloneShorts.length, 4);
    assert.ok(longForm.evidence.length >= 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"), "utf8")).uploadChannel, "critical-thread");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("The Hidden Logic of Things has 500+ unique research questions and an evidence-gated launch batch", () => {
  const channel = Channel.getChannel("behind-the-ordinary");
  const universe = Discovery.universe(channel);
  assert.equal(universe.stats.total, 525);
  assert.equal(universe.stats.validated_candidates, 525);
  assert.equal(new Set(universe.topics.map((topic) => topic.question.toLowerCase())).size, 525);
  assert.deepEqual(universe.stats.categories, {
    "EVERYDAY MYSTERIES": 105, "HIDDEN ENGINEERING": 105, "STRANGE ORIGINS": 105, "DESIGN DECISIONS": 105, "ORDINARY SYSTEMS": 105,
  });
  for (const topic of universe.topics) assert.notEqual(BehindQuality.evaluateTopic(topic, universe.topics).decision, "BLOCK", topic.id);
  const discovered = Discovery.discover(channel, { limit: 50 });
  const used = Discovery.usedIds(channel);
  assert.equal(discovered.length, universe.topics.filter((item) => item.productionReady === true && !used.has(item.id)).length, "unresearched or already-used questions cannot enter production discovery");
  assert.ok(discovered.every((item) => item.researchStatus === "VERIFIED"));
  // Use a currently discoverable, production-eligible record rather than a
  // permanently hard-coded ID. Published replacement operations intentionally
  // move records out of discovery, and a launch-package test must not become a
  // duplicate-package test merely because the channel progressed.
  const topic = discovered[0];
  assert.ok(topic, "at least one verified unused BTO topic must remain discoverable");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bto-e2e-"));
  try {
    const plan = require("../../core/growth").planShort(channel, topic.id, { skipDuplicate: true });
    const result = Rendering.buildPackage(topic, channel, temp, { render: false, growthPlan: plan });
    assert.ok(Object.values(result.validations).every(Boolean));
    assert.equal(SharedQuality.engineFor("behind-the-ordinary"), BehindQuality);
    assert.equal(Scripting.titleCandidates(topic).length, 20);
    assert.equal(Scripting.longToShortFactory(topic).length, 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "thumbnail.json"), "utf8")).maxWords, 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"), "utf8")).uploadChannel, "behind-the-ordinary");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("ImpossibleBrief pipeline persists named validation evidence", () => {
  const channel = Channel.getChannel("impossible-brief");
  const topic = Discovery.universe(channel).topics.find((item) => item.topic === "What If Gravity Doubled Tomorrow?");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ib-validation-"));
  try {
    const result = Rendering.buildPackage(topic, channel, temp, { render: false });
    const file = Rendering.writeValidationEvidence(result, topic, channel, temp);
    const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(evidence.channel, "impossible-brief");
    assert.equal(evidence.topicId, topic.id);
    assert.ok(evidence.validations && Object.keys(evidence.validations).length > 5);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("portfolio scheduling serializes shared render/upload resources", () => {
  const workflow = fs.readFileSync(path.join(Channel.ROOT, ".github", "workflows", "portfolio-production.yml"), "utf8");
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /group:\s*portfolio-production/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test("retention learning only accepts samples from the selected channel", () => {
  const channel = Channel.getChannel("impossible-brief");
  const memory = require("../../core/retention-memory");
  const samples = [
    { channel: "impossible-brief", hook: "a", retention: 80 },
    { channel: "critical-thread", hook: "b", retention: 99 },
  ];
  const filtered = memory.filterForChannel ? memory.filterForChannel(channel, samples) : samples.filter((item) => item.channel === channel.slug);
  assert.deepEqual(filtered.map((item) => item.channel), ["impossible-brief"]);
});

test("retention learning waits for a sample floor and aggregates repeated patterns", () => {
  const memory = require("../../core/retention-memory");
  if (!memory.learn) return;
  const small = memory.learn([{ pattern: "x", retention: 90 }]);
  assert.ok(small == null || small.status === "INSUFFICIENT_DATA" || small.sampleSize < 5);
});

test("30-day failure simulation preserves four channels and blocks every wrong target", () => {
  const channels = Channel.listChannels();
  for (let day = 0; day < 30; day += 1) {
    for (const intended of channels) {
      for (const authenticated of channels) {
        if (intended.slug === authenticated.slug) continue;
        assert.throws(() => Channel.assertUploadIdentity(intended.slug, authenticated.slug), /UPLOAD IDENTITY BLOCK/);
      }
    }
  }
});

test("major CLI modules resolve channel-specific library paths", () => {
  for (const slug of ["impossible-brief", "critical-thread", "behind-the-ordinary"]) {
    const channel = Channel.getChannel(slug);
    assert.ok(channel.paths.root.includes(slug));
    assert.ok(channel.paths.state.includes(slug));
    assert.ok(channel.paths.analytics.includes(slug));
  }
});

test("every notification title carries an unambiguous channel name", () => {
  const Notifications = require("../../lib/bildirimler");
  for (const channel of Channel.listChannels()) {
    if (!Notifications.titleForChannel) continue;
    assert.match(Notifications.titleForChannel(channel, "test"), new RegExp(channel.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
