"use strict";

// CriticalThread dry run 2026-10-14 (run 38542009457).
// - Every first request at Groq's default reasoning effort spent 3,198 of 3,200 completion tokens
//   on hidden reasoning and returned an empty reply (5 of 5).
// - Every low-effort retry returned valid JSON (3 of 3).
// - Every valid draft then failed verification, and the log could not say which rule.
// CT research now asks for low reasoning effort on every draft and repair request, and reports
// each verification round as classified failures (stage, category, fact/line number, repairable).
// The report never includes the builder's text, which can quote the draft.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const Research = require(path.join(ROOT, "scripts", "ct-research"));
const Provider = require(path.join(ROOT, "core", "llm", "longform-provider"));
const Builder = require(path.join(ROOT, "scripts", "ib-ct-library", "build"));

const universe = () => JSON.parse(fs.readFileSync(path.join(ROOT, "channels", "critical-thread", "topics", "topic-universe.json"), "utf8"));
const ct230 = () => universe().topics.find((topic) => topic.id === "CT-230");
const draft = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ct-research-draft.json"), "utf8"));
const SECRET = "DRAFT-TEXT-MARKER-NOT-FOR-LOGS";

function deps(verify, extra = {}) {
  const topic = ct230();
  const inputs = [];
  const lines = [];
  return {
    inputs, lines,
    deps: {
      generate: async (input) => { inputs.push(input); return { json: draft() }; },
      log: (line) => lines.push(line),
      measure: () => ({ qualified: 0, runwayDays: 0, deficit: 14, queue: [{ slug: topic.slug }] }),
      get: async (url) => {
        if (/list=search/.test(url)) return { body: { query: { search: [{ title: "Reverse osmosis" }] } } };
        if (/prop=extracts/.test(url)) return { body: { query: { pages: { 1: { title: "Reverse osmosis", extract: "Reverse osmosis desalination membrane. ".repeat(40) } } } } };
        if (/prop=extlinks/.test(url)) return { body: { query: { pages: { 1: { extlinks: [{ "*": "https://www.epa.gov/water-research" }, { "*": "https://www.who.int/water" }] } } } } };
        return { status: 200 };
      },
      verify,
      ...extra,
    },
  };
}

const BUILDER_ERRORS = [
  `fact 3: quote not found verbatim in Wikipedia — ${SECRET}`,
  `opening "${SECRET} is the hidden system nobody sees" > 9 words (opening ≤ 3s)`,
  `fact 2: 40, 82 not found in Wikipedia — ${SECRET}`,
  `source unreachable (404): https://www.epa.gov/${SECRET}`,
  `legacy quality BLOCK: ${SECRET}`,
];

test("TASK 1: every CT draft and repair request asks for low reasoning effort at the unchanged limits", async () => {
  let round = 0;
  const { deps: d, inputs } = deps(async () => ({ report: [{ slug: "x", errors: round++ === 0 ? [BUILDER_ERRORS[0]] : [] }] }));
  const result = await Research.main(["--limit", "1"], d);
  assert.equal(result.verified, 1, "the repair round verified the record");
  assert.equal(inputs.length, 2, "first draft and one repair request");
  for (const input of inputs) {
    assert.equal(input.reasoningEffort, "low");
    assert.equal(input.maxTokens, 3200, "the completion limit is unchanged");
    assert.equal(input.clientJson, true);
    assert.equal(input.budget.limit, 16000, "the per-topic budget is unchanged");
  }
  assert.ok(inputs[1].user.includes("previous_errors"), "the second request is the repair round");
  assert.equal(Research.REASONING_EFFORT, "low");
});

test("TASK 1: Groq receives reasoning_effort low on the first attempt at the usual temperature, and keeps it on a JSON recovery", async () => {
  const previous = { key: process.env.GROQ_API_KEY, attempts: process.env.LONGFORM_LLM_MAX_ATTEMPTS };
  process.env.GROQ_API_KEY = "gsk_TESTKEY0123456789abcdef";
  process.env.LONGFORM_LLM_MAX_ATTEMPTS = "4";
  Provider.resetRateState();
  const bodies = [];
  const replies = ["{", JSON.stringify(draft())];
  const fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const content = replies[Math.min(bodies.length - 1, replies.length - 1)];
    const body = { choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 2300, completion_tokens: 1500, total_tokens: 3800 } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  };
  try {
    const input = { stage: "ct-research", system: "S", user: "{}", maxTokens: 3200, clientJson: true, validateJson: Research.draftProblems, reasoningEffort: "low", budget: Provider.tokenBudget(16000) };
    await Provider.withRetry({ name: "groq", model: "openai/gpt-oss-120b", configured: true }, input, { fetch, sleep: async () => {} });
  } finally {
    for (const [name, value] of [["GROQ_API_KEY", previous.key], ["LONGFORM_LLM_MAX_ATTEMPTS", previous.attempts]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    Provider.resetRateState();
  }
  assert.deepEqual([bodies[0].reasoning_effort, bodies[0].temperature, bodies[0].max_completion_tokens], ["low", 0.25, 3200], "first attempt: low effort, usual temperature and limit");
  assert.deepEqual([bodies[1].reasoning_effort, bodies[1].temperature, bodies[1].max_completion_tokens], ["low", 0, 3200], "recovery keeps low effort");
});

test("TASK 1: other Groq callers are unchanged (no reasoning_effort unless a caller asks)", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk_TESTKEY0123456789abcdef";
  const bodies = [];
  const fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }], usage: {} }) }; };
  try {
    await Provider.groq({ stage: "longform", system: "S", user: "U", model: "m" }, { fetch });
    await Provider.groq({ stage: "longform", system: "S", user: "U", model: "m", clientJson: true }, { fetch });
  } finally { if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous; }
  assert.equal("reasoning_effort" in bodies[0], false, "FR/IB long-form (server JSON mode) is unchanged");
  assert.deepEqual(bodies[0].response_format, { type: "json_object" });
  assert.equal("reasoning_effort" in bodies[1], false, "client JSON without reasoningEffort sends none");
  for (const file of ["core/growth/longform.js", "scripts/bto-research.js", "scripts/bto-groq-json-compat.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), "utf8"), /reasoningEffort|reasoning_effort/, `${file} does not set reasoning effort`);
  }
});

test("TASK 1: token limits and budgets are unchanged", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ct-research.yml"), "utf8");
  for (const line of ["CT_RESEARCH_MAX_TOKENS: '3200'", "CT_RESEARCH_TOPIC_TOKEN_BUDGET: '16000'", "CT_RESEARCH_RUN_TOKEN_BUDGET: '45000'", "LONGFORM_LLM_TPM: '8000'", "LONGFORM_LLM_JSON_RECOVERIES: '1'", "LONGFORM_LLM_MAX_ATTEMPTS: '4'"]) assert.ok(workflow.includes(line), line);
  const source = fs.readFileSync(path.join(ROOT, "scripts", "ct-research.js"), "utf8");
  assert.match(source, /const COMPLETION_TOKENS = Number\(process\.env\.CT_RESEARCH_MAX_TOKENS\) \|\| 3200;/);
  assert.match(source, /const TOPIC_TOKEN_BUDGET = Number\(process\.env\.CT_RESEARCH_TOPIC_TOKEN_BUDGET\) \|\| 16000;/);
  assert.match(source, /const RUN_TOKEN_BUDGET = Number\(process\.env\.CT_RESEARCH_RUN_TOKEN_BUDGET\) \|\| 45000;/);
});

test("TASK 2: builder and support messages are classified by stage, category, fact or line, and repairability", () => {
  const cases = [
    ["narration line 2 cites no fact", "support", "NARRATION_CITES_NO_FACT", "line 2", "yes"],
    ["narration line 4 is not supported by its cited facts", "support", "NARRATION_NOT_SUPPORTED", "line 4", "yes"],
    ["the cited articles have fewer than 2 reachable primary references", "support", "FEWER_THAN_2_PRIMARY_REFERENCES", null, "maybe"],
    ["narration speaks 7 figures; at most 3 (1, 2, 3, 4, 5, 6, 7)", "support", "TOO_MANY_SPOKEN_FIGURES", null, "yes"],
    ["narration repeats a figure (82)", "support", "REPEATED_FIGURE", null, "yes"],
    ["narration has 4 lines (5–8)", "lint", "NARRATION_LINE_COUNT", null, "yes"],
    ["narration 120 words (55–90)", "lint", "NARRATION_WORD_COUNT", null, "yes"],
    ["line 3 has a 19-word sentence", "lint", "SENTENCE_TOO_LONG", "line 3", "yes"],
    [BUILDER_ERRORS[1], "lint", "OPENING_TOO_LONG", null, "yes"],
    ["narration line 1 must equal openingLine (it is the spoken hook)", "lint", "OPENING_NOT_LINE_1", null, "yes"],
    ["only 3 sourced facts (≥ 4)", "lint", "TOO_FEW_FACTS", null, "yes"],
    ["thumbnailText missing or > 3 words", "lint", "THUMBNAIL_TEXT", null, "yes"],
    [BUILDER_ERRORS[0], "evidence", "QUOTE_NOT_VERBATIM", "fact 3", "yes"],
    ["fact 5: a verbatim source quote of at least 5 words is required", "evidence", "QUOTE_TOO_SHORT", "fact 5", "yes"],
    ["fact 1: source not readable (https://en.wikipedia.org/wiki/X) — quote cannot be verified", "evidence", "SOURCE_NOT_READABLE", "fact 1", "no"],
    [BUILDER_ERRORS[2], "evidence", "NUMBER_NOT_IN_SOURCE", "fact 2", "yes"],
    ["numbers not traced to a fact: 40, 82", "evidence", "NUMBER_NOT_TRACED_TO_FACT", null, "yes"],
    [BUILDER_ERRORS[3], "evidence", "SOURCE_UNREACHABLE", null, "no"],
    ["topic source example.com is not a primary host (put encyclopedia articles on facts / researchArticles)", "evidence", "SOURCE_NOT_PRIMARY_HOST", null, "no"],
    ["legacy research audit: a; b", "audit", "LEGACY_RESEARCH_AUDIT", null, "maybe"],
    [BUILDER_ERRORS[4], "audit", "LEGACY_QUALITY_BLOCK", null, "maybe"],
    ["only 6 hook candidates (≥ 10); add distinct short facts", "hooks", "TOO_FEW_HOOK_CANDIDATES", null, "yes"],
    ["the spoken opening is not a valid hook candidate (blocked or too long)", "hooks", "OPENING_NOT_A_VALID_HOOK", null, "yes"],
    ["duplicate of some-other-slug", "identity", "DUPLICATE_TOPIC", null, "no"],
    ["a message nobody has seen before", "other", "UNCLASSIFIED", null, "maybe"],
  ];
  for (const [text, stage, category, ref, repairable] of cases) assert.deepEqual(Research.classifyVerificationError(text), { stage, category, ref, repairable }, text);
});

test("TASK 2: every message the real builder emits for a broken draft is classified", async () => {
  const broken = draft();
  broken.narration = broken.narration.slice(0, 3).map((line) => ({ ...line, text: line.text + " and then some more words to make this sentence far too long to read aloud" }));
  broken.facts = broken.facts.slice(0, 2).map((fact) => ({ ...fact, quote: "too short" }));
  const { record, supportErrors } = Research.toRecord(ct230(), broken, [{ title: "Reverse osmosis", url: "https://en.wikipedia.org/wiki/Reverse_osmosis", links: ["https://www.epa.gov/water-research"] }]);
  const run = await Builder.run({ channel: "critical-thread", records: [record] }, { offline: true, write: false, log: () => {} });
  const errors = [...supportErrors, ...run.report[0].errors];
  assert.ok(errors.length >= 4, errors.join("\n"));
  const unclassified = errors.filter((error) => Research.classifyVerificationError(error).category === "UNCLASSIFIED");
  assert.deepEqual(unclassified, [], "every builder and support message has a category");
});

test("TASK 2: the report shows the first three failures and the total, never the builder's text", () => {
  const summary = Research.verificationSummary(BUILDER_ERRORS, 1);
  assert.deepEqual([summary.round, summary.total, summary.failures.length, summary.repairable], [1, 5, 3, true]);
  const line = Research.describeVerification({ id: "CT-265" }, summary);
  assert.equal(line, "verify CT-265 round 1: 5 failure(s), repair possible · [evidence] QUOTE_NOT_VERBATIM fact 3 (repairable: yes) · [lint] OPENING_TOO_LONG (repairable: yes) · [evidence] NUMBER_NOT_IN_SOURCE fact 2 (repairable: yes) · all: QUOTE_NOT_VERBATIM×1, OPENING_TOO_LONG×1, NUMBER_NOT_IN_SOURCE×1, SOURCE_UNREACHABLE×1, LEGACY_QUALITY_BLOCK×1");
  assert.ok(!JSON.stringify({ summary, line }).includes(SECRET), "no draft text, claim, URL or audit text");
  assert.equal(Research.verificationSummary(["source unreachable (404): https://x.gov/a"], 2).repairable, false, "only unrepairable failures: repair not possible");
});

test("TASK 2/3: invalid evidence is never accepted, and the failure is reported only in classified form", async () => {
  let calls = 0;
  const { deps: d, lines } = deps(async () => { calls += 1; return { report: [{ slug: "x", errors: BUILDER_ERRORS }] }; },
    { writeQualified: async () => { throw new Error("must not write"); } });
  const result = await Research.main(["--limit", "1"], d);
  assert.equal(calls, 2, "first draft and one repair round, both verified by the builder");
  assert.equal(result.verified, 0);
  assert.equal(result.outcomes[0].status, "FAILED_CHECKS");
  assert.equal(result.outcomes[0].verification.length, 2);
  assert.match(result.outcomes[0].reason, /^round 2: 5 failure\(s\), repair possible · \[evidence\] QUOTE_NOT_VERBATIM fact 3/);
  const verifyLines = lines.filter((line) => /· verify CT-230 round [12]: 5 failure\(s\)/.test(line));
  assert.equal(verifyLines.length, 2, lines.join("\n"));
  assert.ok(!JSON.stringify({ result, lines }).includes(SECRET), "no builder text reaches the outcome or the log");
});

test("TASK 2/3: support failures found before the builder are classified the same way", async () => {
  const unsupported = draft();
  unsupported.narration[3].text = "Engineers in Paris painted every pipe bright yellow last spring.";
  const { deps: d, lines } = deps(async () => ({ report: [{ slug: "x", errors: [] }] }), { generate: async () => ({ json: unsupported }) });
  const result = await Research.main(["--limit", "1"], d);
  assert.equal(result.outcomes[0].status, "FAILED_CHECKS");
  assert.ok(lines.some((line) => /\[support\] NARRATION_NOT_SUPPORTED line 4 \(repairable: yes\)/.test(line)), lines.join("\n"));
  assert.ok(!lines.join("\n").includes("Paris"), "the draft's text is not logged");
});
