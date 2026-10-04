"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Channel = require("../../core/channel-context");
const ROOT = path.resolve(__dirname, "../..");
const Behind = require("../../core/behind-ordinary/discovery");
const Visuals = require("../../core/rendering/topic-visuals");

function universe() { return Behind.universe(Channel.getChannel("behind-the-ordinary")); }

test("BTO inventory: 500+ unique, grammatical research questions that never pre-claim an answer", () => {
  const u = universe();
  assert.ok(u.topics.length >= 500);
  const ids = new Set();
  const questions = new Set();
  for (const topic of u.topics) {
    assert.ok(topic.id && topic.slug && topic.question);
    assert.ok(!ids.has(topic.id), topic.id);
    ids.add(topic.id);
    assert.ok(!questions.has(topic.question.toLowerCase()), topic.question);
    questions.add(topic.question.toLowerCase());
    assert.match(topic.question, /\?$/);
    assert.doesNotMatch(topic.question, /^(?:why|how)\s+(?:does|do|is|are)\s+.+\s+(?:because|so that)\b/i);
  }
});

test("BTO inventory: regenerating keeps every researched record (by inventory id)", () => {
  const before = universe();
  const researched = before.topics.filter((topic) => topic.productionReady === true).map((topic) => topic.id);
  const after = Behind.universe(Channel.getChannel("behind-the-ordinary"));
  for (const id of researched) assert.ok(after.topics.some((topic) => topic.id === id && topic.productionReady === true), id);
});

test("BTO production-ready records carry primary sources and verbatim-quoted facts", () => {
  for (const topic of universe().topics.filter((item) => item.productionReady === true)) {
    assert.ok(Array.isArray(topic.sources) && topic.sources.some((source) => source.primary === true), topic.slug);
    assert.ok(Array.isArray(topic.facts) && topic.facts.length, topic.slug);
    assert.ok(topic.facts.every((fact) => fact.quote && fact.sourceUrl), topic.slug);
  }
});

test("the research builder's quote check tolerates typography but not paraphrase", () => {
  const Research = require("../../core/behind-ordinary/research");
  assert.equal(Research.quoteFound("The inventor’s idea—simple.", "The inventor's idea - simple."), true);
  assert.equal(Research.quoteFound("The inventor's idea was simple.", "A simple idea came from the inventor."), false);
});

test("an onboarding channel with no credentials is 'setup pending', not a failure; partial setup is still CRITICAL", () => {
  const Health = require("../../core/auth/health");
  const channel = Channel.getChannel("behind-the-ordinary");
  const blank = Health.classifyCredentialSet(channel, {});
  assert.equal(blank.status, "SETUP_PENDING");
  const partial = Health.classifyCredentialSet(channel, { BTO_YT_CLIENT_ID: "x" });
  assert.equal(partial.status, "CRITICAL");
});

test("The Hidden Logic of Things uses its own light music moods, not the disaster beds", () => {
  const Music = require("../../core/rendering/music");
  const channel = Channel.getChannel("behind-the-ordinary");
  const moods = ["playful-curiosity", "warm-discovery", "light-mechanical", "gentle-reveal"];
  for (const mood of moods) assert.ok(Music.profile(channel, mood));
});

test("first-time authorization refuses a YouTube channel that already belongs to another configured channel", () => {
  const Auth = require("../../core/auth/channel-auth");
  const channel = Channel.getChannel("behind-the-ordinary");
  assert.throws(() => Auth.assertUniqueChannelIdentity(channel, "UC_FAILURE_RECONSTRUCTED", {
    "failure-reconstructed": "UC_FAILURE_RECONSTRUCTED",
  }), /already belongs/i);
});

test("BTO pictures come from the record's own articles; a surname match is not the object", () => {
  assert.ok(Visuals.PERSON_FILE.test("Miss Constance Jeans, gagnante du 60 yards - btv1b530181337.jpg"));
  assert.ok(Visuals.PERSON_FILE.test("ConstanceJeans.jpg"));
  assert.ok(!Visuals.PERSON_FILE.test("Closeup of copper rivet on jeans.jpg"));
  assert.ok(!Visuals.PERSON_FILE.test("Clothing Rack of Jeans.jpg"));
  const rivets = universe().topics.find((topic) => topic.slug === "why-jeans-have-copper-rivets");
  assert.deepEqual(rivets.visualArticles, ["Jeans"]);
  const source = fs.readFileSync(path.join(ROOT, "core/rendering/topic-visuals.js"), "utf8");
  assert.match(source, /topic\.visualArticles/);
});

test("the evidence-gated channel uses its verified pool but may skip a day when no A-grade viral candidate exists", () => {
  const Config = require("../../core/growth/config");
  const Growth = require("../../core/growth");
  const bto = Channel.getChannel("behind-the-ordinary");
  assert.equal(Config.forChannel(bto).candidatePool.minimum, 1);
  for (const slug of ["failure-reconstructed", "impossible-brief", "critical-thread"]) assert.equal(Config.forChannel(Channel.getChannel(slug)).candidatePool.minimum, 20, slug);
  const pick = Growth.selectShortTopic(bto, { date: "2026-10-03" });
  if (pick.selected) {
    assert.equal(pick.selected.topic.channel, "behind-the-ordinary");
    assert.equal(pick.selected.topic.productionReady, true);
    assert.equal(pick.selected.score.bucket, "A");
  } else {
    assert.match(pick.reason, /NO_(?:EXPLORE_CANDIDATE|QUALIFIED_POOL|ELIGIBLE_TOPIC)/);
  }
});

test("every production-ready BTO record yields at least 20 truthful title candidates (package gate)", () => {
  const os = require("node:os");
  const saved = process.env.GROWTH_STATE_ROOT;
  process.env.GROWTH_STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "bto-titles-"));
  try {
    const Growth = require("../../core/growth");
    const bto = Channel.getChannel("behind-the-ordinary");
    for (const topic of universe().topics.filter((item) => item.productionReady === true)) {
      const plan = Growth.planShort(bto, topic.id, { skipDuplicate: true });
      assert.ok(plan.titles.candidates.filter((item) => !item.misleading).length >= 20, topic.slug);
    }
  } finally { if (saved === undefined) delete process.env.GROWTH_STATE_ROOT; else process.env.GROWTH_STATE_ROOT = saved; }
});
