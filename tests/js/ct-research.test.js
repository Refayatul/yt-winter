"use strict";
// CriticalThread inventory replenishment: runway measurement, free-provider-only research,
// unchanged builder gates (plus verbatim quotes for automated records), and keep-only-qualified writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const Research = require(path.join(ROOT, "scripts", "ct-research"));
const Inventory = require(path.join(ROOT, "scripts", "growth", "topic-inventory"));
const Builder = require(path.join(ROOT, "scripts", "ib-ct-library", "build"));
const Discovery = require(path.join(ROOT, "core", "discovery"));
const Channel = require(path.join(ROOT, "core", "channel-context"));

const universe = () => JSON.parse(fs.readFileSync(path.join(ROOT, "channels", "critical-thread", "topics", "topic-universe.json"), "utf8"));
const ct230 = () => universe().topics.find((topic) => topic.id === "CT-230");
const draft = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ct-research-draft.json"), "utf8"));
const SOURCES = [{ title: "Reverse osmosis", url: "https://en.wikipedia.org/wiki/Reverse_osmosis", links: ["https://www.epa.gov/water-research", "https://www.who.int/health-topics/water-sanitation-and-hygiene-wash"] }];
const spec = (name, configured = true) => ({ name, configured });

test("CT research runs on the free provider only: no paid primary, no paid fallback", () => {
  assert.equal(Research.freeProviderOnly({ enabled: true, primary: spec("groq"), fallback: null }).ok, true);
  assert.match(Research.freeProviderOnly({ enabled: true, primary: spec("anthropic"), fallback: null }).reason, /no free long-form provider/);
  assert.match(Research.freeProviderOnly({ enabled: true, primary: spec("groq"), fallback: spec("anthropic") }).reason, /fallback provider anthropic refused/);
  assert.equal(Research.freeProviderOnly({ enabled: true, primary: spec("groq", false), fallback: null }).ok, false, "no key, no run");
  assert.equal(Research.freeProviderOnly({ enabled: false, primary: spec("groq"), fallback: null }).ok, false);
});

test("the workflow pins Groq with no fallback, carries no paid key, and its schedule is off until approved", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ct-research.yml"), "utf8");
  assert.match(yml, /if: github\.event_name == 'workflow_dispatch' \|\| vars\.CT_RESEARCH_AUTO == 'true'/);
  assert.match(yml, /LONGFORM_LLM_PROVIDER: groq/);
  assert.match(yml, /LONGFORM_LLM_FALLBACK_PROVIDER: ''/);
  assert.doesNotMatch(yml, /ANTHROPIC/);
  assert.match(yml, /default: 'false'/, "a manual run is a dry run unless write=true");
  assert.match(yml, /push-state\.sh/);
});

test("only articles about the subject count as evidence", () => {
  assert.equal(Research.relevantArticle("Extreme ultraviolet lithography", "x".repeat(600), "EUV lithography system"), true);
  assert.equal(Research.relevantArticle("List of semiconductor fabrication plants", "", "semiconductor fabrication plant"), false);
  assert.equal(Research.relevantArticle("Power station", "A power station generates electricity.", "transformer station"), false, "a generic word alone is not enough");
  assert.equal(Research.relevantArticle("Mercury", "Mercury may refer to: a planet", "mercury cell"), false);
  assert.equal(Research.relevantArticle("Strait", "The Bosporus strait is ...", "bosporus strait"), true, "the opening names the subject");
  assert.equal(Research.relevantArticle("Reverse osmosis", "x".repeat(600), "desalination reverse-osmosis membrane"), true, "hyphenated subjects match");
});

test("a draft becomes an in-place automated upgrade that passes the unchanged builder gates", async () => {
  const topic = ct230();
  const { record, supportErrors } = Research.toRecord(topic, draft(), SOURCES);
  assert.deepEqual(supportErrors, []);
  assert.equal(record.slug, topic.slug, "same slug: used-topic and duplicate tracking stay intact");
  assert.equal(record.automated, true);
  assert.ok(record.facts.every((fact) => fact.quote && fact.url === SOURCES[0].url));
  assert.ok(record.narration.every((line) => Research.ROLES.includes(line.role)));
  const { report } = await Builder.run({ channel: "critical-thread", records: [record] }, { offline: true, write: false, log: () => {} });
  assert.deepEqual(report[0].errors, []);
  assert.ok(report[0].hooks >= 20);
});

test("automated records need verbatim quotes; hand-researched CT seeds are unchanged", async () => {
  const { record } = Research.toRecord(ct230(), draft(), SOURCES);
  const noQuotes = { ...record, facts: record.facts.map((fact) => ({ ...fact, quote: "too short" })) };
  const automated = await Builder.run({ channel: "critical-thread", records: [noQuotes] }, { offline: true, write: false, log: () => {} });
  assert.ok(automated.report[0].errors.some((error) => /verbatim source quote/.test(error)));
  const { automated: _flag, ...hand } = noQuotes;
  const handRun = await Builder.run({ channel: "critical-thread", records: [hand] }, { offline: true, write: false, log: () => {} });
  assert.ok(!handRun.report[0].errors.some((error) => /quote/.test(error)));
});

test("a record whose citations do not support its narration, or with one reference, is not verified", () => {
  const d = draft();
  d.narration[3].text = "Engineers in Paris painted every pipe bright yellow last spring.";
  const { supportErrors } = Research.toRecord(ct230(), d, [{ ...SOURCES[0], links: ["https://www.epa.gov/water-research"] }]);
  assert.ok(supportErrors.some((error) => /line 4 is not supported/.test(error)));
  assert.ok(supportErrors.some((error) => /fewer than 2 reachable primary references/.test(error)));
  assert.deepEqual(Research.toRecord(ct230(), { answerable: false, reason: "excerpts do not cover a failure" }, SOURCES), { skip: "excerpts do not cover a failure" });
});

test("a narration that lists figures, or repeats one, goes to the repair round instead of being kept", () => {
  const d = draft();
  d.narration[3].text = "Plants run at 40 to 82 bar of seawater pressure to beat it.";
  d.narration[4].text = "Seawater systems need 2.9 to 5.5 kilowatt-hours per cubic metre.";
  const { supportErrors } = Research.toRecord(ct230(), d, SOURCES);
  assert.ok(supportErrors.some((error) => /narration speaks 7 figures; at most 3/.test(error)), supportErrors.join("; "));
  assert.ok(supportErrors.some((error) => /repeats a figure \(82\)/.test(error)));
  assert.match(Research.SYSTEM, /at most 3 figures/, "the drafting instruction asks for it up front");
  assert.deepEqual(Research.toRecord(ct230(), draft(), SOURCES).supportErrors, [], "the three-figure draft passes");
});

test("research runs only below the runway target, works the queue up to the deficit, and records attempts", async () => {
  const topic = ct230();
  const calls = [];
  const deps = {
    generate: async () => { calls.push("generate"); return { json: draft() }; },
    get: async (url) => {
      if (/list=search/.test(url)) return { body: { query: { search: [{ title: "Reverse osmosis" }] } } };
      if (/prop=extracts/.test(url)) return { body: { query: { pages: { 1: { title: "Reverse osmosis", extract: "Reverse osmosis desalination membrane. ".repeat(40) } } } } };
      if (/prop=extlinks/.test(url)) return { body: { query: { pages: { 1: { extlinks: [{ "*": "https://www.epa.gov/water-research" }, { "*": "https://www.who.int/water" }] } } } } };
      return { status: 200 };
    },
    verify: async () => ({ report: [{ slug: topic.slug, errors: [] }] }),
  };
  const full = await Research.main([], { ...deps, measure: () => ({ qualified: 14, runwayDays: 14, deficit: 0, queue: [{ slug: topic.slug }] }) });
  assert.equal(full.reason, "runway ok");
  assert.equal(calls.length, 0, "no provider call when the runway is at target");
  const short = await Research.main(["--limit", "5"], { ...deps, measure: () => ({ qualified: 13, runwayDays: 13, deficit: 1, queue: [{ slug: topic.slug }, { slug: "other" }] }) });
  assert.equal(calls.length, 1, "limited to the deficit");
  assert.equal(short.verified, 1);
  assert.deepEqual(short.kept, [], "a dry run writes nothing");
});

test("writes keep only upgrades that become production-qualified; the rest are restored", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-research-"));
  const file = path.join(dir, "topic-universe.json");
  const original = { topics: [{ slug: "a", topic: "A old" }, { slug: "b", topic: "B old" }, { slug: "c", topic: "C untouched" }] };
  fs.writeFileSync(file, JSON.stringify(original));
  const run = async (seed) => {
    const u = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const record of seed.records) u.topics = u.topics.map((item) => (item.slug === record.slug ? { ...item, topic: record.topic } : item));
    fs.writeFileSync(file, JSON.stringify(u));
    return { report: [] };
  };
  const measure = () => ({ qualifiedTopics: [{ slug: "a" }] });
  const result = await Research.writeQualified([{ slug: "a", topic: "A new" }, { slug: "b", topic: "B new" }], { run, measure, file });
  assert.deepEqual(result, { kept: ["a"], restored: ["b"] });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).topics.map((item) => item.topic), ["A new", "B old", "C untouched"]);
});

test("inventory runway uses production's gates: unused, selectable bucket, viral minimum, readiness", () => {
  const result = Inventory.measure("critical-thread", { targetDays: 14 });
  const used = Discovery.usedIds(Channel.getChannel("critical-thread"));
  assert.equal(result.needed, 14);
  assert.equal(result.deficit, Math.max(0, 14 - result.qualified));
  for (const item of [...result.qualifiedTopics, ...result.queue]) assert.ok(!used.has(item.id) && !used.has(item.slug), `${item.id} is unused`);
  for (const item of result.qualifiedTopics) {
    assert.ok(item.viral >= result.viralMinimum);
    assert.notEqual(item.readiness, "BLOCK");
  }
  assert.ok(result.queue.every((item) => item.gap), "every queued record names its gap");
  assert.ok(!result.queue.some((item) => /duplicate of/.test(item.gap)), "duplicates are never queued");
  const firstBelow = result.queue.findIndex((item) => !(item.viral >= result.viralMinimum));
  if (firstBelow > 0) assert.ok(result.queue.slice(firstBelow).every((item) => !(item.viral >= result.viralMinimum)), "records at the viral minimum come first");
});
