"use strict";

// CriticalThread research-only candidates (channels/critical-thread/research-candidates/).
// - They are research seeds: never topic records, never read by production, never promoted
//   automatically.
// - They are checked for duplicates against the CT, FR and IB topic universes and publication
//   histories.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const Candidates = require(path.join(ROOT, "scripts", "ct-candidates"));
const Inventory = require(path.join(ROOT, "scripts", "growth", "topic-inventory"));

test("batch 1 holds the 11 approved candidates, all RESEARCH_ONLY, at most 4 blackouts, with CTC- ids", () => {
  const data = Candidates.load();
  assert.deepEqual(Candidates.validate(data), []);
  assert.equal(data.status, "RESEARCH_ONLY");
  assert.equal(data.candidates.length, 11);
  assert.ok(data.candidates.every((item) => item.status === "RESEARCH_ONLY" && /^CTC-\d{3}$/.test(item.candidateId)));
  assert.equal(data.candidates.filter((item) => item.blackout).length, 4);
  assert.deepEqual(data.candidates.map((item) => item.title), [
    "New York City blackout of 1977", "South Australia state-wide blackout (2016)", "UK power cut of 9 August 2019", "India northern grid collapse (2012)",
    "Facebook global outage (2021)", "AWS S3 us-east-1 outage (2017)", "AT&T long-distance network collapse (1990)", "UK NATS flight-plan failure (2023)",
    "Howard Street Tunnel fire, Baltimore (2001)", "Tokyo Stock Exchange Arrowhead outage (2020)", "Iridium 33 and Cosmos 2251 collision (2009)",
  ]);
});

test("validation rejects a candidate that is not research-only, has a CT- id, or pushes blackouts over 4", () => {
  const data = Candidates.load();
  const bad = { ...data, candidates: [...data.candidates.slice(0, 10), { ...data.candidates[10], status: "QUALIFIED", candidateId: "CT-999" }] };
  const problems = Candidates.validate(bad);
  assert.ok(problems.some((p) => /status must be RESEARCH_ONLY/.test(p)));
  assert.ok(problems.some((p) => /must look like CTC-001/.test(p)));
  const blackouts = { ...data, candidates: data.candidates.map((item) => ({ ...item, blackout: true })) };
  assert.ok(Candidates.validate(blackouts).some((p) => /more than 4 blackout/.test(p)));
});

test("no approved candidate duplicates a CT, FR or IB record or a published Short", () => {
  const result = Candidates.check();
  assert.deepEqual(result.report.filter((row) => row.duplicates.length), []);
  assert.equal(result.clean, true);
  const rows = Candidates.corpus();
  for (const channel of ["critical-thread", "failure-reconstructed", "impossible-brief"]) {
    assert.ok(rows.some((row) => row.channel === channel && row.where === "universe"), `${channel} universe is searched`);
    assert.ok(rows.some((row) => row.channel === channel && row.where === "published"), `${channel} publication history is searched`);
  }
});

test("duplicate detection finds the two seeds rejected by hand (CT-219, CT-089) and published titles", () => {
  const milwaukee = Candidates.duplicates({ matchTerms: ["milwaukee"] });
  assert.ok(milwaukee.some((hit) => hit.channel === "critical-thread" && hit.id === "CT-219" && hit.match === "text"), "a mention in another record's evidence is reported");
  const taiwan = Candidates.duplicates({ matchTerms: ["earthquake that cut asia"] });
  assert.ok(taiwan.some((hit) => hit.id === "CT-089" && hit.match === "title"));
  const published = JSON.parse(fs.readFileSync(path.join(ROOT, "icerik", "yayinlananlar.json"), "utf8"))[0];
  const escaped = String(published.slug).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.ok(Candidates.duplicates({ matchTerms: [escaped] }).some((hit) => hit.channel === "failure-reconstructed" && hit.where === "published"));
  assert.deepEqual(Candidates.duplicates({ matchTerms: ["iridium 33", "cosmos 2251"] }), [], "platinum-iridium in CT-434 is not a hit");
});

test("production cannot read research-only candidates", () => {
  // 1. Nothing but the checker (and tests) refers to the candidates file or module.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "tests"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|mjs|cjs|ya?ml|sh|py)$/.test(entry.name) && /research-candidates|ct-candidates/.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(ROOT, file));
    }
  };
  walk(ROOT);
  assert.deepEqual(offenders, ["scripts/ct-candidates.js"]);
  // 2. The checker never writes.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "scripts", "ct-candidates.js"), "utf8"), /writeFileSync|appendFileSync|Store\.write/);
  // 3. No candidate is in the topic universe or in production's selection.
  const universe = fs.readFileSync(path.join(ROOT, "channels", "critical-thread", "topics", "topic-universe.json"), "utf8");
  assert.doesNotMatch(universe, /CTC-\d{3}|RESEARCH_ONLY/);
  const inventory = Inventory.measure("critical-thread", { targetDays: 14, attempts: { attempts: {} } });
  const selected = JSON.stringify([inventory.qualifiedTopics, inventory.queue]);
  assert.doesNotMatch(selected, /CTC-\d{3}/);
  for (const item of Candidates.load().candidates) assert.ok(!selected.includes(item.title), `${item.candidateId} is not in production selection`);
});

test("promotion is documented as a separate owner-approved step and is not automated", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs", "ops", "CT-RESEARCH-CANDIDATES.md"), "utf8");
  for (const step of [/Research dry run/, /bucket A, viral score ≥ 75/, /Owner approval/, /No step publishes or schedules anything/]) assert.match(doc, step);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "scripts", "ct-research.js"), "utf8"), /research-candidates|candidates\.json/, "ct-research has no candidate mode in this change");
});
