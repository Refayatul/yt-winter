"use strict";

// Line-level narration repair for CriticalThread research (scripts/ct-line-repair.js, wired into
// scripts/ct-research.js).
// Dry run 38570584587: every draft failed the narration-support check, and the repair, which never
// saw the draft, rewrote the whole record (CT-265: lines 4 and 9 failed, then lines 3 and 6).
// These tests use the repository's CT-230 fixture draft, the real offline builder and mocked model
// replies; no test calls Groq.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const Research = require(path.join(ROOT, "scripts", "ct-research"));
const LineRepair = require(path.join(ROOT, "scripts", "ct-line-repair"));
const Shared = require(path.join(ROOT, "scripts", "bto-research"));

const topic = () => JSON.parse(fs.readFileSync(path.join(ROOT, "channels", "critical-thread", "topics", "topic-universe.json"), "utf8")).topics.find((t) => t.id === "CT-230");
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ct-research-draft.json"), "utf8"));
const EXTRACT = "Reverse osmosis desalination membrane. " + fixture().facts.map((fact) => fact.quote).join(". ") + ".";
const set = (draft, n, patch) => { draft.narration[n - 1] = { ...draft.narration[n - 1], ...patch }; return draft; };

// One CT research topic through scripts/ct-research.js main(), with mocked model replies.
async function research(replies, { links = ["https://www.epa.gov/water-research", "https://www.who.int/water"] } = {}) {
  const t = topic();
  const requests = [];
  const lines = [];
  const result = await Research.main(["--limit", "1"], {
    generate: async (input) => { requests.push(input); const reply = replies[Math.min(requests.length - 1, replies.length - 1)]; return { json: typeof reply === "function" ? reply(input) : reply }; },
    log: (line) => lines.push(line),
    measure: () => ({ qualified: 0, runwayDays: 0, deficit: 14, queue: [{ slug: t.slug }] }),
    get: async (url) => {
      if (/list=search/.test(url)) return { body: { query: { search: [{ title: "Reverse osmosis" }] } } };
      if (/prop=extracts/.test(url)) return { body: { query: { pages: { 1: { title: "Reverse osmosis", extract: EXTRACT } } } } };
      if (/prop=extlinks/.test(url)) return { body: { query: { pages: { 1: { extlinks: links.map((link) => ({ "*": link })) } } } } };
      return { status: 200 };
    },
    verify: async () => ({ report: [{ slug: t.slug, errors: [] }] }),
  });
  return { outcome: result.outcomes[0], requests, lines };
}

const UNSUPPORTED = "So the facility relies on enormous compressors to run.";
const FIXED_4 = fixture().narration[3].text;

test("fact ids: f1, F07, [F2] and 9 become F1, F7, F2 and F9; unknown ids are dropped, never guessed; no text or fact changes", () => {
  const draft = fixture();
  set(draft, 2, { facts: ["f1"] }); set(draft, 6, { facts: ["F07"] }); set(draft, 3, { facts: ["[F2]"] }); set(draft, 5, { facts: ["9", "F99"] });
  const { draft: out, changes } = LineRepair.normalizeFactIds(draft);
  assert.deepEqual(out.narration.map((line) => line.facts), [["F12", "F5"], ["F1"], ["F2"], ["F12"], ["F9"], ["F7"], ["F4", "F12"]]);
  assert.deepEqual(changes.map((change) => change.to), ["F1", "F2", "F9", null, "F7"]);
  assert.deepEqual(out.narration.map((line) => line.text), draft.narration.map((line) => line.text), "narration wording unchanged");
  assert.deepEqual(out.facts, draft.facts, "facts unchanged");
  assert.deepEqual(LineRepair.normalizeFactIds(set(fixture(), 2, { facts: ["G1", "F 1 2", "first"] })).draft.narration[1].facts, [], "nothing ambiguous is mapped");
});

test("the model is told the actual support, figure and primary-reference rules", () => {
  assert.match(Research.SYSTEM, /at least 1 shared word in lines 1-2, at least 2 in every later line/);
  assert.match(Research.SYSTEM, /primaryReferences count/);
  assert.match(LineRepair.REPAIR_SYSTEM, /Rewrite ONLY the lines listed in "replace"/);
  assert.match(LineRepair.REPAIR_SYSTEM, /at most 3 figures/);
});

test("repair targets: line failures map to lines, figure failures to the lines over the limit, anything else to the fallback", () => {
  const draft = set(fixture(), 4, { text: "So its high-pressure pumps, the biggest energy users, need 2.9 to 5.5 kWh.", facts: ["F12", "F3"] });
  const targets = LineRepair.repairTargets([
    { category: "NARRATION_NOT_SUPPORTED", ref: "line 6" }, { category: "TOO_MANY_SPOKEN_FIGURES", ref: null }, { category: "OPENING_TOO_LONG", ref: null },
  ], draft.narration);
  assert.deepEqual([...targets.lines.keys()].sort((a, b) => a - b), [1, 4, 6, 7]);
  assert.deepEqual(targets.other, []);
  assert.deepEqual(LineRepair.repairTargets([{ category: "FEWER_THAN_2_PRIMARY_REFERENCES" }, { category: "NARRATION_NOT_SUPPORTED", ref: "line 3" }], draft.narration).other, ["FEWER_THAN_2_PRIMARY_REFERENCES"]);
});

test("a line-level repair request carries the original draft, facts, rules, failures, hints and primary-reference counts, and asks for the failing lines only", async () => {
  const draft = set(fixture(), 4, { text: UNSUPPORTED });
  const { requests, outcome, lines } = await research([draft, { lines: [{ n: 4, text: FIXED_4, facts: ["F12"] }] }]);
  assert.equal(outcome.status, "VERIFIED", lines.join("\n"));
  assert.equal(requests.length, 2);
  const repair = requests[1];
  assert.equal(repair.system, LineRepair.REPAIR_SYSTEM);
  assert.deepEqual([repair.maxTokens, repair.reasoningEffort, repair.clientJson, repair.budget.limit], [1600, "low", true, 16000]);
  const payload = JSON.parse(repair.user);
  assert.deepEqual(payload.narration.map((line) => line.text), draft.narration.map((line) => line.text), "the model sees its own draft");
  assert.deepEqual(payload.facts.map((fact) => fact.id), draft.facts.map((fact) => fact.id));
  assert.deepEqual(payload.replace, [{ n: 4, failures: ["NARRATION_NOT_SUPPORTED"], candidateFacts: [] }]);
  assert.deepEqual(payload.sources, [{ id: "S1", title: "Reverse osmosis", primaryReferences: 2 }]);
  assert.match(payload.rules.support, /at least 2 in every later line/);
  assert.equal("excerpt" in payload.sources[0], false, "excerpts are not resent");
  assert.ok(lines.some((line) => /repair CT-230: targeted, line\(s\) 4/.test(line)));
  const first = JSON.parse(requests[0].user);
  assert.equal(first.sources[0].primaryReferences, 2, "the first draft request also carries the counts");
});

test("unchanged lines and verified facts are preserved byte for byte; line 1 also updates openingLine", () => {
  const draft = fixture();
  const out = LineRepair.splice(draft, [{ n: 1, text: "Pumps keep desalination membranes making water.", facts: ["f12", "F5"] }, { n: 5, text: "ignored", facts: ["F9"] }], new Set([1]));
  for (let i = 1; i < draft.narration.length; i += 1) assert.deepEqual(out.narration[i], draft.narration[i]);
  assert.deepEqual(out.facts, draft.facts);
  assert.deepEqual(out.narration[0].facts, ["F12", "F5"]);
  assert.equal(out.openingLine, "Pumps keep desalination membranes making water.");
});

test("invalid evidence is never accepted: a repair that adds a number, stays unsupported or cites an unknown fact fails", async () => {
  const draft = () => set(fixture(), 4, { text: UNSUPPORTED });
  const number = await research([draft(), { lines: [{ n: 4, text: "So high-pressure pumps use 75 percent of the plant's energy.", facts: ["F12"] }] }]);
  assert.equal(number.outcome.status, "FAILED_CHECKS");
  assert.match(number.outcome.reason, /NUMBER_NOT_TRACED_TO_FACT/);
  assert.ok(number.lines.some((line) => /novelty CT-230 \(warning only\): line 4 NUMBER/.test(line)), number.lines.join("\n"));
  const still = await research([draft(), { lines: [{ n: 4, text: "So the whole facility depends on giant compressors.", facts: ["F12"] }] }]);
  assert.equal(still.outcome.status, "FAILED_CHECKS");
  assert.match(still.outcome.reason, /NARRATION_NOT_SUPPORTED line 4/);
  const unknown = await research([draft(), { lines: [{ n: 4, text: FIXED_4, facts: ["F99"] }] }]);
  assert.equal(unknown.outcome.status, "FAILED_CHECKS", "an unknown citation is rejected, not remapped");
  assert.ok(unknown.lines.some((line) => /reply rejected/.test(line)));
  const extra = await research([draft(), { lines: [{ n: 4, text: FIXED_4, facts: ["F12"] }, { n: 2, text: "Rewritten.", facts: ["F1"] }] }]);
  assert.equal(extra.outcome.status, "FAILED_CHECKS", "a reply that touches an unrequested line is rejected");
});

test("failures a line cannot fix use the bounded fallback: one full redraft that sees its previous draft", async () => {
  // Three facts: TOO_FEW_FACTS. A line or a quote repair cannot add facts, so this is a full redraft.
  const fewFacts = () => { const draft = fixture(); draft.facts = draft.facts.slice(0, 3); draft.narration = draft.narration.map((line) => ({ ...line, facts: ["F1", "F2", "F3"] })); return draft; };
  const { requests, outcome, lines } = await research([fewFacts(), fewFacts()]);
  assert.equal(outcome.status, "FAILED_CHECKS");
  assert.match(outcome.reason, /TOO_FEW_FACTS|NARRATION_NOT_SUPPORTED|TOO_FEW_HOOK_CANDIDATES/);
  assert.equal(requests.length, 2, "still one repair request");
  assert.equal(requests[1].system, Research.SYSTEM);
  const payload = JSON.parse(requests[1].user);
  assert.ok(payload.previous_draft && Array.isArray(payload.previous_errors), "the redraft sees its previous draft and errors");
  assert.ok(lines.some((line) => /full redraft \(not targetable: .*TOO_FEW_FACTS/.test(line)));
});

test("a draft whose only problem is fact-id formatting verifies without any repair request", async () => {
  const draft = fixture();
  set(draft, 2, { facts: ["f1"] }); set(draft, 6, { facts: ["F07"] });
  const { requests, outcome, lines } = await research([draft]);
  assert.equal(outcome.status, "VERIFIED");
  assert.equal(requests.length, 1);
  assert.ok(lines.some((line) => /fact ids CT-230: 2 normalised, 0 unknown dropped/.test(line)));
});

// ---- Offline before/after measurement -------------------------------------------------------------

const SCENARIOS = [
  ["unsupported paraphrase (line 4)", () => set(fixture(), 4, { text: UNSUPPORTED })],
  ["invented detail (line 5)", () => set(fixture(), 5, { text: "Engineers in Paris painted every pipe bright yellow last spring." })],
  ["line cites no fact (line 6)", () => set(fixture(), 6, { facts: [] })],
  ["wrong citation (line 3)", () => set(fixture(), 3, { facts: ["F8"] })],
  ["malformed ids (lines 2, 6)", () => set(set(fixture(), 2, { facts: ["f1"] }), 6, { facts: ["F07"] })],
  ["too many figures (line 4)", () => set(fixture(), 4, { text: "So its high-pressure pumps, the biggest energy users, need 2.9 to 5.5 kWh.", facts: ["F12", "F3"] })],
  ["repeated figure (line 3)", () => set(fixture(), 3, { text: "Seawater pushes back with about 27 bar, against 82 bar applied.", facts: ["F2", "F1"] })],
  ["two failing lines (3, 6)", () => set(set(fixture(), 3, { facts: ["F8"] }), 6, { text: "Over time, grime slowly clogs everything." })],
];

// A well-behaved repairer returns the original fixture line for each requested line.
const goodRepair = (input) => ({ lines: JSON.parse(input.user).replace.map(({ n }) => ({ n, text: fixture().narration[n - 1].text, facts: fixture().narration[n - 1].facts })) });

test("offline before/after: support failures, repairs, preserved lines and facts across the failure scenarios", async () => {
  const rows = [];
  for (const [name, make] of SCENARIOS) {
    const before = await Research.precheck(topic(), make(), [{ title: "Reverse osmosis", url: "https://en.wikipedia.org/wiki/Reverse_osmosis", text: EXTRACT, links: ["https://www.epa.gov/water-research", "https://www.who.int/water"] }]);
    const { outcome, requests } = await research([make(), goodRepair]);
    const repair = (outcome.repairs || [])[0] || null;
    rows.push({ name, failuresBefore: before.errors.length, status: outcome.status, requests: requests.length, repairedLines: repair ? repair.lines : [], keptLines: repair ? repair.kept : null });
  }
  for (const row of rows) {
    assert.equal(row.status, "VERIFIED", JSON.stringify(row));
    if (row.repairedLines.length) assert.equal(row.keptLines, 7 - row.repairedLines.length, `${row.name}: every other line kept`);
  }
  assert.equal(rows.find((row) => /malformed/.test(row.name)).requests, 1, "id formatting needs no model call");
  process.env.CT_LINE_REPAIR_REPORT && fs.writeFileSync(process.env.CT_LINE_REPAIR_REPORT, JSON.stringify(rows, null, 2));
});

// ---- Novelty audit (warning only) -------------------------------------------------------------------

test("novelty audit: flags numbers, names, acronyms and technical terms absent from the cited facts (measured on labelled lines)", () => {
  const facts = fixture().facts;
  const cite = (...ids) => ids.map((id) => facts.find((fact) => fact.id === id));
  // [text, cited facts, expected novelty categories] — labels are the expected surface novelty.
  const cases = [
    ["So the plant's biggest energy users are its high-pressure pumps.", cite("F12"), []],
    ["Seawater must be pushed through at up to 82 bar.", cite("F1"), []],
    ["Even state-of-the-art plants still need around 2.3 kilowatt-hours per cubic metre.", cite("F4", "F12"), []],
    ["So high-pressure pumps use 75 percent of the plant's energy.", cite("F12"), ["NUMBER"]],
    ["So Siemens high-pressure pumps are the biggest energy users.", cite("F12"), ["NAME"]],
    ["Plants near Perth reuse the pressure of the reject stream.", cite("F9"), ["NAME"]],
    ["The HVDC link feeds the high-pressure pumps.", cite("F12"), ["TECHNICAL"]],
    ["Each RO train loses about 40 bar to fouling.", cite("F7"), ["TECHNICAL", "NUMBER"]],
    ["Siemens pumps are the plant's biggest energy users.", cite("F12"), ["NAME"]],
    ["The membranes are the largest energy users in the plant.", cite("F12"), ["NAME?"]],
  ];
  let truePositive = 0, falsePositive = 0, falseNegative = 0, trueNegative = 0;
  const misses = [];
  for (const [text, cited, expected] of cases) {
    const got = [...new Set(LineRepair.noveltyAudit(text, cited).map((warning) => warning.category))];
    const want = expected.filter((item) => !item.endsWith("?"));
    const semantic = expected.some((item) => item.endsWith("?"));
    if (!want.length && !got.length) trueNegative += semantic ? 0 : 1;
    for (const category of want) if (got.includes(category)) truePositive += 1; else { falseNegative += 1; misses.push(`${category}: ${text}`); }
    for (const category of got) if (!want.includes(category)) { falsePositive += 1; misses.push(`unexpected ${category}: ${text}`); }
    if (semantic && !got.length) { falseNegative += 1; misses.push(`semantic (wrong subject) not detectable: ${text}`); }
  }
  // Measured: the surface audit catches added numbers, mid-sentence names, acronyms and technical
  // tokens; it misses a name that starts the sentence and any purely semantic error.
  assert.deepEqual({ truePositive, falsePositive, falseNegative, trueNegative }, { truePositive: 6, falsePositive: 0, falseNegative: 2, trueNegative: 3 }, misses.join("\n"));
  assert.ok(misses.some((miss) => /Siemens pumps are/.test(miss)), "sentence-initial name: known miss");
  assert.ok(misses.some((miss) => /semantic/.test(miss)), "semantic errors are out of its reach");
});

test("the support rule given to the model matches the verifier on the fixture", () => {
  const draft = fixture();
  assert.deepEqual(Shared.narrationSupport(draft.narration, draft.facts), []);
  const words = (text) => Shared.contentWords(text);
  assert.deepEqual(words("Seawater pushes back"), ["seawater", "pushes", "back"], "3+ letters, common words removed");
});
