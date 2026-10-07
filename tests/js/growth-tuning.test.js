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
