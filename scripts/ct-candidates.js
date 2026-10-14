#!/usr/bin/env node
"use strict";

// CRITICALTHREAD research-only candidates (channels/critical-thread/research-candidates/).
//
//   node scripts/ct-candidates.js --check
//
// Candidates are research seeds, never topic records:
// - every one is RESEARCH_ONLY, and no production code reads the file
//   (tests/js/ct-research-candidates.test.js);
// - nothing here writes topic-universe.json.
// --check validates the file and reports possible duplicates in the CriticalThread, Failure
// Reconstructed and ImpossibleBrief topic universes and their publication histories. Any hit needs
// an owner review: a mention inside another record's evidence can still be the same event (the
// Milwaukee 1993 seed turned out to be CT-219).
// Promotion is a separate, owner-approved step: docs/ops/CT-RESEARCH-CANDIDATES.md.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Channel = require(path.join(ROOT, "core", "channel-context"));

const FILE = path.join(ROOT, "channels", "critical-thread", "research-candidates", "candidates.json");
const CHANNELS = ["critical-thread", "failure-reconstructed", "impossible-brief"];
const MAX_BLACKOUTS = 4;
const REQUIRED = ["candidateId", "status", "title", "category", "researchTargets", "coreQuestion", "expectedPrimarySources", "matchTerms"];

function load(file = FILE) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function validate(data) {
  const problems = [];
  const list = Array.isArray(data && data.candidates) ? data.candidates : [];
  if (!list.length) problems.push("no candidates");
  if (data && data.status !== "RESEARCH_ONLY") problems.push("file status must be RESEARCH_ONLY");
  const ids = new Set();
  for (const item of list) {
    for (const field of REQUIRED) if (item[field] == null || item[field] === "" || (Array.isArray(item[field]) && !item[field].length)) problems.push(`${item.candidateId || "?"}: missing ${field}`);
    if (item.status !== "RESEARCH_ONLY") problems.push(`${item.candidateId}: status must be RESEARCH_ONLY`);
    if (ids.has(item.candidateId)) problems.push(`${item.candidateId}: duplicate candidateId`);
    ids.add(item.candidateId);
    if (!/^CTC-\d{3}$/.test(String(item.candidateId))) problems.push(`${item.candidateId}: candidateId must look like CTC-001 (never a CT- topic id)`);
    for (const term of item.matchTerms || []) { try { new RegExp(term, "i"); } catch (error) { problems.push(`${item.candidateId}: invalid matchTerm ${term}`); } }
  }
  if (list.filter((item) => item.blackout).length > MAX_BLACKOUTS) problems.push(`more than ${MAX_BLACKOUTS} blackout candidates in one batch`);
  return problems;
}

const TITLE_FIELDS = ["title", "topic", "canonicalTopic", "canonical_name", "slug", "topic_id", "coreQuestion", "baslik"];

// Existing records and published Shorts of each channel.
function corpus(channels = CHANNELS) {
  const rows = [];
  for (const slug of channels) {
    const channel = Channel.getChannel(slug);
    try {
      const universe = JSON.parse(fs.readFileSync(channel.paths.topicUniverse, "utf8"));
      for (const record of Array.isArray(universe) ? universe : universe.topics || []) rows.push({ channel: slug, where: "universe", id: record.id || record.topic_id || record.slug, record });
    } catch (error) { /* a channel without a universe file has nothing to match */ }
    const history = path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "yayinlananlar.json" : "published.json");
    try { for (const record of JSON.parse(fs.readFileSync(history, "utf8"))) rows.push({ channel: slug, where: "published", id: record.videoId || record.slug, record }); }
    catch (error) { /* no publication history yet */ }
  }
  return rows;
}

// A title hit (title, slug, question) is a likely duplicate; a text hit (anywhere in the record) is a
// mention that still needs a look.
function duplicates(candidate, rows = corpus()) {
  const patterns = (candidate.matchTerms || []).map((term) => new RegExp(term, "i"));
  const hits = [];
  for (const row of rows) {
    const head = TITLE_FIELDS.map((field) => row.record[field]).filter(Boolean).join(" | ");
    const pattern = patterns.find((item) => item.test(head)) || patterns.find((item) => item.test(JSON.stringify(row.record)));
    if (pattern) hits.push({ channel: row.channel, where: row.where, id: row.id, match: pattern.test(head) ? "title" : "text" });
  }
  return hits;
}

function check(data = load(), rows = corpus()) {
  const problems = validate(data);
  const report = (data.candidates || []).map((candidate) => ({ candidateId: candidate.candidateId, title: candidate.title, duplicates: duplicates(candidate, rows) }));
  return { problems, report, clean: !problems.length && report.every((row) => !row.duplicates.length) };
}

function main(argv = process.argv.slice(2)) {
  if (!argv.includes("--check")) { console.log("usage: node scripts/ct-candidates.js --check"); return null; }
  const result = check();
  for (const problem of result.problems) console.log(`✗ ${problem}`);
  for (const row of result.report) console.log(`${row.duplicates.length ? "✗" : "✓"} ${row.candidateId} ${row.title}${row.duplicates.length ? " — possible duplicate: " + row.duplicates.map((hit) => `${hit.channel} ${hit.where} ${hit.id} (${hit.match})`).join(", ") : ""}`);
  console.log(result.clean ? "candidates: research-only, no duplicates found" : "candidates need owner review");
  if (!result.clean) process.exitCode = 1;
  return result;
}

if (require.main === module) main();

module.exports = { FILE, MAX_BLACKOUTS, load, validate, corpus, duplicates, check, main };
