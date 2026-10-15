"use strict";

// CriticalThread research vs. its deterministic verification (dry run 38604605273, 2026-10-14).
// Reproduced offline with the CT-230 fixture, the real hook engine, the real offline builder and
// mocked model replies (no Groq requests). Covers:
// - hook-candidate count vs. what the prompt asked for (TOO_FEW_HOOK_CANDIDATES);
// - the evidence pre-check (quotes not in the excerpt, invalid source ids, claim numbers missing
//   from their quotes);
// - targeted quote and narration-length repair instead of a full redraft;
// - the hook contract (why OPENING_NOT_A_VALID_HOOK has no safe deterministic fix);
// - adversarial narration that the existing gates do and do not catch;
// - unchanged quality and qualification gates.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const Research = require(path.join(ROOT, "scripts", "ct-research"));
const LineRepair = require(path.join(ROOT, "scripts", "ct-line-repair"));
const Preflight = require(path.join(ROOT, "scripts", "ct-evidence-preflight"));
const Builder = require(path.join(ROOT, "scripts", "ib-ct-library", "build"));
const Channel = require(path.join(ROOT, "core", "channel-context"));
const Hooks = require(path.join(ROOT, "core", "growth", "hooks"));
const Model = require(path.join(ROOT, "core", "growth", "topic-model"));
const GrowthConfig = require(path.join(ROOT, "core", "growth", "config"));

const channel = Channel.getChannel("critical-thread");
const config = GrowthConfig.forChannel(channel);
const topic = () => JSON.parse(fs.readFileSync(channel.paths.topicUniverse, "utf8")).topics.find((t) => t.id === "CT-230");
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ct-research-draft.json"), "utf8"));
const EXTRACT = "Reverse osmosis desalination membrane. " + fixture().facts.map((fact) => fact.quote).join(". ") + ".";
const SOURCES = [{ title: "Reverse osmosis", url: "https://en.wikipedia.org/wiki/Reverse_osmosis", text: EXTRACT, links: ["https://www.epa.gov/water-research", "https://www.who.int/water"] }];
const hooksFor = (draft) => Hooks.generate(Model.normalize(channel, Builder.merge("critical-thread", topic(), Research.toRecord(topic(), draft, SOURCES).record)), config, { openingMaxSeconds: channel.config.retentionRules.openingMaxSeconds });
const categories = (errors) => errors.map((error) => Research.classifyVerificationError(error).category);
const keepFacts = (draft, n) => { draft.facts = draft.facts.slice(0, n); const ids = new Set(draft.facts.map((fact) => fact.id)); draft.narration = draft.narration.map((line) => ({ ...line, facts: line.facts.filter((id) => ids.has(id)).length ? line.facts.filter((id) => ids.has(id)) : ["F1"] })); return draft; };

async function research(replies) {
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
      if (/prop=extlinks/.test(url)) return { body: { query: { pages: { 1: { extlinks: [{ "*": "https://www.epa.gov/water-research" }, { "*": "https://www.who.int/water" }] } } } } };
      return { status: 200 };
    },
    verify: async () => ({ report: [{ slug: t.slug, errors: [] }] }),
  });
  return { outcome: result.outcomes[0], requests, lines };
}

// ---- Hook candidates --------------------------------------------------------------------------

test("TOO_FEW_HOOK_CANDIDATES: the old prompt's 10-14 facts cannot reach the builder's minimum; 16 short facts can", () => {
  const min = config.hooks.minimumCandidates;
  const counts = Object.fromEntries([10, 14, 16].map((n) => [n, hooksFor(keepFacts(fixture(), n)).candidateCount]));
  assert.ok(counts[10] < min && counts[14] < min, `10 and 14 facts give ${counts[10]} and ${counts[14]} candidates (< ${min})`);
  assert.ok(counts[16] >= min, `16 facts give ${counts[16]}`);
  const long = fixture();
  long.facts = long.facts.map((fact) => ({ ...fact, claim: fact.claim.replace(/\.$/, "") + " in large modern seawater desalination plants today." }));
  assert.ok(hooksFor(long).candidateCount < min, "claims longer than the hook limit stop being candidates");
  assert.match(Research.SYSTEM, new RegExp(`Give 16 to 18 facts, each claim one short sentence of at most ${config.hooks.maxSpokenWords} words`));
  assert.match(Research.SYSTEM, new RegExp(`at least ${min} distinct evidence-backed hook candidates`));
});

// ---- Evidence pre-check ----------------------------------------------------------------------

test("evidence pre-check: invalid source ids, quotes not in the excerpt and claim numbers missing from quotes", () => {
  assert.deepEqual(Preflight.evidencePreflight(fixture(), SOURCES), [], "the fixture is clean");
  const draft = fixture();
  draft.facts[0] = { ...draft.facts[0], sourceId: "S9" };
  draft.facts[1] = { ...draft.facts[1], quote: "Seawater pushes back with natural osmotic pressure of 27 bar" };
  draft.facts[2] = { ...draft.facts[2], claim: "Seawater RO systems need 2.9-5.5 kWh/m3 and 7 pumps." };
  const errors = Preflight.evidencePreflight(draft, SOURCES);
  assert.deepEqual(categories(errors), ["INVALID_SOURCE_ID", "QUOTE_NOT_IN_EXCERPT", "CLAIM_NUMBER_NOT_IN_QUOTE", "CLAIM_NUMBER_NOT_IN_QUOTE"]);
  assert.deepEqual(errors.map((error) => Research.classifyVerificationError(error).ref), ["fact F1", "fact F2", "fact F2", "fact F3"]);
  const year = fixture();
  year.facts[3] = { ...year.facts[3], claim: "By 2015 state-of-the-art systems are around 2.3 kWh/m3." };
  assert.deepEqual(Preflight.evidencePreflight(year, SOURCES), [], "years are exempt, as in the builder's claim-number check");
});

test("a replacement quote is accepted only if it is in the fact's own excerpt, at least 5 words, and carries every claim number", () => {
  const fact = fixture().facts[1];
  assert.equal(Preflight.acceptableQuote(fact, fact.quote, SOURCES), true);
  assert.equal(Preflight.acceptableQuote(fact, "Seawater pushes back with 27 bar of pressure", SOURCES), false, "not in the excerpt");
  assert.equal(Preflight.acceptableQuote(fact, "natural osmotic pressure", SOURCES), false, "too short");
  assert.equal(Preflight.acceptableQuote(fact, "natural osmotic pressure that must be overcome", SOURCES), false, "misses 27 and 390");
  assert.equal(Preflight.acceptableQuote({ ...fact, sourceId: "S2" }, fact.quote, SOURCES), false, "unknown source");
});

test("the pre-check blocks the draft before the online verification, which still runs once it is clean", async () => {
  const draft = fixture();
  draft.facts[1] = { ...draft.facts[1], quote: "Seawater pushes back with natural osmotic pressure of 27 bar" };
  const pre = await Research.precheck(topic(), draft, SOURCES);
  assert.ok(categories(pre.errors).includes("QUOTE_NOT_IN_EXCERPT"));
  let online = 0;
  await Research.main(["--limit", "1"], { generate: async () => ({ json: fixture() }), log: () => {}, measure: () => ({ qualified: 0, runwayDays: 0, deficit: 14, queue: [{ slug: topic().slug }] }),
    get: async (url) => /list=search/.test(url) ? { body: { query: { search: [{ title: "Reverse osmosis" }] } } } : /prop=extracts/.test(url) ? { body: { query: { pages: { 1: { title: "Reverse osmosis", extract: EXTRACT } } } } } : /prop=extlinks/.test(url) ? { body: { query: { pages: { 1: { extlinks: [{ "*": "https://www.epa.gov/a" }, { "*": "https://www.who.int/b" }] } } } } } : { status: 200 },
    verify: async () => { online += 1; return { report: [{ slug: "x", errors: [] }] }; } });
  assert.equal(online, 1, "a clean draft still goes through the builder's online verification");
});

// ---- Targeted repair -------------------------------------------------------------------------

test("a failing quote and a failing line are repaired in one targeted request; claims and other facts are unchanged", async () => {
  const draft = fixture();
  draft.facts[1] = { ...draft.facts[1], quote: "Seawater pushes back with natural osmotic pressure of 27 bar" };
  draft.narration[3] = { ...draft.narration[3], text: "So the facility relies on enormous compressors to run." };
  const good = (input) => {
    const payload = JSON.parse(input.user);
    return { lines: payload.replace.map(({ n }) => ({ n, text: fixture().narration[n - 1].text, facts: fixture().narration[n - 1].facts })), quotes: payload.quotes.map(({ id }) => ({ id, quote: fixture().facts.find((f) => f.id === id).quote })) };
  };
  const { outcome, requests, lines } = await research([draft, good]);
  assert.equal(outcome.status, "VERIFIED", lines.join("\n"));
  assert.equal(requests.length, 2);
  const payload = JSON.parse(requests[1].user);
  assert.equal(requests[1].system, LineRepair.REPAIR_SYSTEM);
  assert.deepEqual(payload.replace.map((item) => item.n), [4]);
  assert.deepEqual(payload.quotes.map((item) => [item.id, item.failures]), [["F2", ["QUOTE_NOT_IN_EXCERPT", "CLAIM_NUMBER_NOT_IN_QUOTE"]]]);
  assert.deepEqual(payload.excerpts.map((item) => item.id), ["S1"], "only the involved source's excerpt is sent");
  assert.deepEqual(outcome.record.facts.map((fact) => fact.claim), fixture().facts.map((fact) => fact.claim), "claims unchanged");
  assert.ok(lines.some((line) => /repair CT-230: targeted, line\(s\) 4; quote\(s\) F2/.test(line)));
  assert.ok(lines.some((line) => /quotes CT-230: 1 replaced, 0 rejected/.test(line)));
});

test("an invented replacement quote is rejected, the old quote stays, and the record fails", async () => {
  const draft = fixture();
  draft.facts[1] = { ...draft.facts[1], quote: "Seawater pushes back with natural osmotic pressure of 27 bar" };
  const invented = () => ({ quotes: [{ id: "F2", quote: "Seawater has 27 bar (390 psi) of osmotic pressure, engineers say" }] });
  const { outcome, lines } = await research([draft, invented]);
  assert.equal(outcome.status, "FAILED_CHECKS");
  assert.match(outcome.reason, /QUOTE_NOT_IN_EXCERPT fact F2/);
  assert.ok(lines.some((line) => /quotes CT-230: 0 replaced, 1 rejected/.test(line)));
});

test("narration word count and the second-beat limit are targeted line rewrites, not full redrafts", () => {
  const narration = fixture().narration;
  const words = LineRepair.repairTargets([{ category: "NARRATION_WORD_COUNT", ref: null }], narration);
  assert.deepEqual([...words.lines.keys()], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(words.other, []);
  assert.deepEqual([...LineRepair.repairTargets([{ category: "SECOND_BEAT_TOO_LONG", ref: null }], narration).lines.keys()], [1, 2]);
  const builderQuote = LineRepair.repairTargets([{ category: "QUOTE_NOT_VERBATIM", ref: "fact 3" }, { category: "QUOTE_TOO_SHORT", ref: "fact 13" }], narration, fixture().facts.map((fact) => fact.id));
  assert.deepEqual([...builderQuote.facts.keys()], ["F3", "F13"], "the builder's fact positions map to ids");
});

test("replay of dry run 38604605273: which rounds needed a full redraft before and after this change", () => {
  const OLD_LINE = new Set(["NARRATION_CITES_NO_FACT", "NARRATION_NOT_SUPPORTED", "SENTENCE_TOO_LONG", "INVALID_LAYER", "MISSING_ROLE", "TOO_MANY_SPOKEN_FIGURES", "REPEATED_FIGURE", "OPENING_TOO_LONG", "OPENING_STARTS_WITH_DATE", "OPENING_NOT_A_VALID_HOOK"]);
  const f = (category, ref = null) => ({ category, ref });
  const rounds = {
    "CT-265 round 1": [f("NARRATION_NOT_SUPPORTED", "line 3"), f("NARRATION_NOT_SUPPORTED", "line 5"), f("NARRATION_WORD_COUNT"), f("QUOTE_TOO_SHORT", "fact 1"), f("QUOTE_TOO_SHORT", "fact 13"), f("TOO_FEW_HOOK_CANDIDATES"), f("OPENING_NOT_A_VALID_HOOK")],
    "CT-265 round 2": [f("QUOTE_TOO_SHORT", "fact 1"), f("QUOTE_TOO_SHORT", "fact 13"), f("OPENING_NOT_A_VALID_HOOK")],
    "CT-437 round 1": [f("NARRATION_NOT_SUPPORTED", "line 3"), f("FEWER_THAN_2_PRIMARY_REFERENCES"), f("QUOTE_TOO_SHORT", "fact 7"), f("LEGACY_RESEARCH_AUDIT"), f("LEGACY_QUALITY_BLOCK"), f("TOO_FEW_HOOK_CANDIDATES"), f("OPENING_NOT_A_VALID_HOOK")],
    "CT-234 round 1": [f("NARRATION_NOT_SUPPORTED", "line 4"), f("NARRATION_NOT_SUPPORTED", "line 6"), f("NARRATION_NOT_SUPPORTED", "line 8"), f("OPENING_NOT_A_VALID_HOOK")],
    "CT-234 round 2": [f("TOO_MANY_SPOKEN_FIGURES"), f("REPEATED_FIGURE"), f("OPENING_NOT_A_VALID_HOOK")],
  };
  const narration = Array.from({ length: 8 }, (_, i) => ({ text: i === 2 ? "It needs 40 bar and 27 bar and 82 bar and 27 bar." : "x", facts: ["F1"] }));
  const ids = Array.from({ length: 16 }, (_, i) => `F${i + 1}`);
  const result = Object.fromEntries(Object.entries(rounds).map(([name, failures]) => {
    const before = failures.every((item) => OLD_LINE.has(item.category)) ? "lines" : "full";
    const targets = LineRepair.repairTargets(failures, narration, ids);
    return [name, { before, after: targets.other.length ? `full (${targets.other.join(", ")})` : "targeted" }];
  }));
  assert.deepEqual(result, {
    "CT-265 round 1": { before: "full", after: "full (TOO_FEW_HOOK_CANDIDATES)" },
    "CT-265 round 2": { before: "full", after: "targeted" },
    "CT-437 round 1": { before: "full", after: "full (FEWER_THAN_2_PRIMARY_REFERENCES, LEGACY_RESEARCH_AUDIT, LEGACY_QUALITY_BLOCK, TOO_FEW_HOOK_CANDIDATES)" },
    "CT-234 round 1": { before: "lines", after: "targeted" },
    "CT-234 round 2": { before: "lines", after: "targeted" },
  });
});

// ---- Hook contract ---------------------------------------------------------------------------

test("hook contract: the builder accepts an opening only if it is the engine's top candidate", () => {
  const good = hooksFor(fixture());
  assert.equal(good.selected.spoken, fixture().openingLine, "the fixture's opening is the selected hook");
  assert.equal(good.selected.family, "visual_first_reveal");
  const weak = fixture();
  weak.openingLine = "Desalination plants need constant power.";
  weak.narration[0] = { ...weak.narration[0], text: weak.openingLine };
  const ranked = hooksFor(weak);
  assert.notEqual(ranked.selected.spoken, weak.openingLine);
  assert.deepEqual([ranked.selected.family, ranked.selected.fields], ["shocking_consequence", ["consequence"]], "the winner comes from the draft's failureConsequence field, not from a fact");
});

test("hook contract: adopting the best fact-backed candidate as the opening is not stable, so no canonical hook is applied", () => {
  const weak = fixture();
  weak.openingLine = "Desalination plants need constant power.";
  weak.narration[0] = { ...weak.narration[0], text: weak.openingLine };
  const before = hooksFor(weak);
  const factBacked = before.candidates.find((hook) => hook.fields.length === 1 && hook.fields[0] === "evidence" && !hook.blocked && hook.adjustedTotal >= config.hooks.minimumScore);
  assert.ok(factBacked, "there is an eligible fact-derived candidate");
  const adopted = fixture();
  adopted.openingLine = factBacked.spoken;
  adopted.narration[0] = { ...adopted.narration[0], text: factBacked.spoken, facts: ["F1"] };
  const after = hooksFor(adopted);
  assert.notEqual(after.selected.spoken, factBacked.spoken, "a higher-ranked candidate still wins: the selection does not converge");
  assert.equal(after.selected.fields[0], "consequence");
});

// ---- Factual safety --------------------------------------------------------------------------

test("factual safety: which adversarial narration lines the existing offline gates catch (word overlap is not semantic verification)", async () => {
  const cases = [
    ["wrong subject", "The membranes are the plant's biggest energy users.", ["F12"]],
    ["invented organisation", "Siemens high-pressure pumps are the plant's biggest energy users.", ["F12"]],
    ["changed causal relationship", "Membrane fouling makes the pumps the biggest energy users.", ["F7", "F12"]],
    ["incorrect date", "Since 1998 high-pressure pumps are the biggest energy users.", ["F12"]],
    ["unsupported number", "High-pressure pumps use 75 percent of the plant's energy.", ["F12"]],
    ["misleading overlap", "Pretreatment filters stop the high-pressure pumps in the plant.", ["F8", "F12"]],
    ["negated fact", "High-pressure pumps are not the largest energy users.", ["F12"]],
  ];
  const outcome = {};
  for (const [name, text, facts] of cases) {
    const draft = fixture();
    draft.narration[3] = { ...draft.narration[3], text, facts };
    outcome[name] = (await Research.precheck(topic(), draft, SOURCES)).errors.length ? "caught" : "passes";
  }
  assert.deepEqual(outcome, {
    "wrong subject": "passes", "invented organisation": "passes", "changed causal relationship": "passes",
    "incorrect date": "caught", "unsupported number": "caught", "misleading overlap": "passes", "negated fact": "passes",
  });
});

// ---- Gates unchanged --------------------------------------------------------------------------

test("quality and qualification gates are unchanged", () => {
  assert.deepEqual([config.hooks.minimumScore, config.hooks.minimumCandidates, config.hooks.maxSpokenWords], [76, 20, 10]);
  assert.equal(Number(config.viralScoring.minimumToProduce), 75);
  const quality = fs.readFileSync(path.join(ROOT, "core", "quality", "critical-thread.js"), "utf8");
  assert.match(quality, /topic\.hookPotential\.score < 76/);
  const build = fs.readFileSync(path.join(ROOT, "scripts", "ib-ct-library", "build.js"), "utf8");
  assert.match(build, /if \(words < 5\) errors\.push\(`fact \$\{index \+ 1\}: a verbatim source quote of at least 5 words is required`\)/);
  assert.match(build, /hooks\.selected\.spoken !== \(\/\[\.!\?\]\$\/\.test\(record\.openingLine\)/, "the exact-match hook check is unchanged");
  assert.match(fs.readFileSync(path.join(ROOT, "scripts", "bto-research.js"), "utf8"), /shared\.length < \(index < 2 \? 1 : 2\)/, "narration support thresholds unchanged");
});
