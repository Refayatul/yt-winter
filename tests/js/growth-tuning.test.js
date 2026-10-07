"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Channel = require("../../core/channel-context");
const Config = require("../../core/growth/config");
const Titles = require("../../core/growth/titles");

const channel = Channel.getChannel("failure-reconstructed");
const config = Config.forChannel(channel);
const topic = { channel: "failure-reconstructed", subject: "Eastern 212", consequence: "crash", facts: [] };

test("generic template titles lose points unless they carry a concrete number", () => {
  const generic = Titles.scoreOne({ title: "Eastern 212: What Failed First", source: "template", pattern: "failed-first" }, topic, config, "short");
  assert.equal(generic.genericTemplatePenalty, 8);
  const concrete = Titles.scoreOne({ title: "Eastern 212: What Failed First in 30 Seconds", source: "template", pattern: "failed-first" }, topic, config, "short");
  assert.equal(concrete.genericTemplatePenalty, 0);
  const other = Titles.scoreOne({ title: "Why Eastern 212 Crashed", source: "template", pattern: "why" }, topic, config, "short");
  assert.equal(other.genericTemplatePenalty, 0);
});

test("analytics tuning: recognition outweighs default demand and Shorts aim for ~26-32 s", () => {
  for (const slug of ["failure-reconstructed", "impossible-brief", "critical-thread", "behind-the-ordinary"]) {
    const c = Config.forChannel(Channel.getChannel(slug));
    assert.ok(c.topic.weights.TopicDemandScore >= 1.4, slug);
    assert.ok(c.topic.weights.SubscriberConversionPotential >= 1.1, slug);
  }
  assert.deepEqual(config.script.shorts.targetWords, [70, 88]);
  assert.ok(config.viralScoring.weights.recognizability >= 1.4);
});

test("series end promise: only channels whose promise is true, drawn in the last seconds", () => {
  const Series = require("../../core/series");
  const Rendering = require("../../core/rendering");
  assert.equal(Series.endLine(Channel.getChannel("failure-reconstructed")), "NEW FAILURE FILE EVERY DAY");
  assert.equal(Series.endLine(Channel.getChannel("behind-the-ordinary")), "FOLLOW FOR MORE HIDDEN LOGIC");
  assert.equal(Series.endLine(Channel.getChannel("impossible-brief")), null);
  assert.equal(Series.endLine(Channel.getChannel("critical-thread")), null);
  const overlay = Rendering.overlayText({ channel: "behind-the-ordinary", thumbnailText: "VIKING INITIALS" }, 36.8, "motion", "licensed-still", "HIDDEN LOGIC #3", "FOLLOW FOR MORE HIDDEN LOGIC");
  assert.match(overlay, /text='FOLLOW FOR MORE HIDDEN LOGIC'.*enable='gte\(t,34\.60\)'/);
  assert.doesNotMatch(Rendering.overlayText({ channel: "impossible-brief" }, 30, "motion", "licensed-still", null, null), /gte\(t/);
});

test("a published row without topicId still marks its topic used (no second upload)", () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const Discovery = require("../../core/discovery");
  const bto = Channel.getChannel("behind-the-ordinary");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "used-"));
  fs.writeFileSync(path.join(dir, "published.json"), JSON.stringify([{ slug: "why-jeans-have-copper-rivets", videoId: "wuVAovuA5ck" }]));
  const used = Discovery.usedIds({ ...bto, paths: { ...bto.paths, state: dir } });
  assert.ok(used.has("BTO-017"));
});
