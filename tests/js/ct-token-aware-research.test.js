"use strict";

// CriticalThread dry run 2026-10-14 (run 38516520859): CT-265 failed with INVALID_JSON on all four
// attempts, sent seconds apart with the same request, and CT-437 then hit Groq's 8,000
// tokens-per-minute limit (HTTP 429). The log could not say why the JSON failed. These tests cover
// the response diagnostics, the JSON failure categories, the bounded token-aware retry policy
// (input.budget) and the per-topic budget in scripts/ct-research.js, all against mocked responses;
// no test calls Groq.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Provider = require("../../core/llm/longform-provider");
const Research = require("../../scripts/ct-research");
const Channel = require("../../core/channel-context");

const KEY = "gsk_TESTKEY0123456789abcdef";
const PROMPT_MARKER = "PROMPT-MARKER-NOT-FOR-LOGS";
const REPLY_MARKER = "REPLY-MARKER-NOT-FOR-LOGS";
const ORG = "org_01abcdefghijklmnopqrstuvwx";
const spec = { name: "groq", model: "openai/gpt-oss-120b", configured: true, keyName: "GROQ_API_KEY" };
const valid = {
  answerable: true, title: "t", openingLine: "One ship stopped a canal.", dependency: "d.", mechanism: "m.", bottleneck: "b.", failureConsequence: "f.", resilience: "r.",
  facts: [{ id: "F1", claim: "c", quote: "six exact words copied from the source", sourceId: "S1" }],
  narration: [{ role: "HIDDEN_SYSTEM", layer: "VERIFIED FACT", text: "One ship stopped a canal.", facts: ["F1"] }],
};
const usage = (prompt, completion, reasoning) => ({ prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, ...(reasoning != null ? { completion_tokens_details: { reasoning_tokens: reasoning } } : {}) });

function ok(content, { finish = "stop", tokens = usage(2340, 1500, 900), headers = {} } = {}) {
  const body = { model: "openai/gpt-oss-120b", choices: [{ message: { content }, finish_reason: finish }], usage: tokens };
  return { ok: true, status: 200, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
}

function fail(status, error, headers = {}) {
  const body = { error };
  return { ok: false, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
}

const tpm429 = (wait = "20.355s", headers = { "retry-after": "21" }) => fail(429, { message: `Rate limit reached for model \`openai/gpt-oss-120b\` in organization \`${ORG}\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Used 5174, Requested 5540. Please try again in ${wait}. Need more tokens?`, type: "tokens", code: "rate_limit_exceeded" }, headers);

async function run(replies, { budget = Provider.tokenBudget(16000), env = {}, maxTokens = 3200 } = {}) {
  Provider.resetRateState();
  const settings = { LONGFORM_LLM_MAX_ATTEMPTS: "4", LONGFORM_LLM_MAX_RETRY_MS: "120000", GROQ_API_KEY: KEY, LONGFORM_LLM_TPM: undefined, LONGFORM_LLM_JSON_RECOVERIES: undefined, ...env };
  const previous = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(settings)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  const requests = [];
  const sleeps = [];
  const events = [];
  const fetch = async (url, init) => { requests.push(JSON.parse(init.body)); const next = replies[Math.min(requests.length - 1, replies.length - 1)]; return typeof next === "function" ? next(init) : next; };
  const input = { stage: "ct-research", system: "SYSTEM " + PROMPT_MARKER, user: "{}", maxTokens, clientJson: true, validateJson: Research.draftProblems, ...(budget ? { budget } : {}) };
  try {
    const result = await Provider.withRetry(spec, input, { fetch, sleep: async (ms) => { sleeps.push(ms); }, timeoutMs: 50 }, (event) => events.push(event));
    return { result, requests, sleeps, events, budget };
  } catch (error) { return { error, requests, sleeps, events, budget }; } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    Provider.resetRateState();
  }
}

function assertSafe(outcome) {
  const lines = outcome.events.map(Provider.describeEvent).filter(Boolean);
  const text = JSON.stringify({ events: outcome.events, lines, error: outcome.error && { ...outcome.error, message: outcome.error.message, line: Provider.describeError(outcome.error) } });
  for (const secret of [KEY, PROMPT_MARKER, REPLY_MARKER, ORG, "org_"]) assert.ok(!text.includes(secret), `${secret} never appears in errors, events or log lines`);
  return lines;
}

test("TASK 1: every reply reports finish reason, token usage, reasoning tokens and length, never its content", async () => {
  const cut = '{"answerable": true, "openingLine": "' + REPLY_MARKER + " " + "x".repeat(400);
  const outcome = await run([ok(cut, { finish: "length", tokens: usage(2340, 3200, 2950) })], { budget: Provider.tokenBudget(8000), env: { LONGFORM_LLM_JSON_RECOVERIES: "0" } });
  const error = outcome.error;
  assert.equal(error.code, "TRUNCATED");
  assert.deepEqual([error.finishReason, error.promptTokens, error.completionTokens, error.totalTokens, error.reasoningTokens, error.contentChars, error.jsonCategory],
    ["length", 2340, 3200, 5540, 2950, cut.length, "TRUNCATED"]);
  const line = Provider.describeError(error);
  assert.match(line, /^TRUNCATED · json TRUNCATED · finish length · tokens 2340\+3200=5540 \(reasoning 2950\) · reply \d+ chars · budget 5540\/8000 · stage ct-research · attempt 1\/4 · fail/);
  const lines = assertSafe(outcome);
  assert.ok(lines.some((item) => /^attempt 1 TRUNCATED · json TRUNCATED · finish length · tokens 2340\+3200=5540/.test(item)), lines.join("\n"));
});

test("TASK 1: JSON failures are classified without keeping the reply", () => {
  const cases = [
    ["", null, "EMPTY"],
    ["I cannot answer that.", null, "NO_OBJECT"],
    ['{"facts": [{"id": "F1", "claim": "cut off', null, "UNTERMINATED"],
    ['{"a": "x"', "length", "TRUNCATED"],
    ['{"quote": "he said "no" twice"}', null, "STRUCTURE"],
    ['{"quote": "line\nbreak"}', null, "CONTROL_CHARACTER"],
    ["{answerable: true}", null, "PROPERTY_NAME"],
    ['{"a": 1,}', null, "PROPERTY_NAME"],
    ['{"a": "\\q"}', null, "BAD_ESCAPE"],
    ['{"a": 1} {"b": 2}', null, "TRAILING_TEXT"],
    ['```json\n{"a": [1, 2}\n```', null, "STRUCTURE"],
  ];
  for (const [text, finish, category] of cases) {
    let caught = null;
    try { Provider.parseJsonText(REPLY_MARKER + text, "groq", "ct-research", finish); } catch (thrown) { caught = thrown; }
    assert.ok(caught, JSON.stringify(text));
    assert.equal(caught.jsonCategory, category === "EMPTY" ? "NO_OBJECT" : category, JSON.stringify(text));
    assert.ok(!JSON.stringify({ ...caught, message: caught.message, line: Provider.describeError(caught) }).includes(REPLY_MARKER), "the reply text is not kept");
  }
  assert.equal(Provider.jsonFailure("   ").category, "EMPTY");
  assert.deepEqual(Provider.parseJsonText('Here: {"a": 1}', "groq", "s"), { a: 1 }, "strict parsing is unchanged for a valid object");
});

test("TASK 2/3: a cut-off reply is retried once with low reasoning effort at the same completion limit, then accepted only when valid", async () => {
  const outcome = await run([ok('{"answerable": true, "facts": [', { finish: "length", tokens: usage(2340, 3200, 3000) }), ok(JSON.stringify(valid), { tokens: usage(2340, 1400, 300) })]);
  assert.deepEqual(outcome.result.json, valid);
  assert.equal(outcome.requests.length, 2);
  assert.equal(outcome.requests[0].reasoning_effort, undefined, "the first request keeps the default reasoning effort");
  assert.deepEqual([outcome.requests[1].reasoning_effort, outcome.requests[1].temperature, outcome.requests[1].max_completion_tokens], ["low", 0, 3200], "max_completion_tokens is not raised");
  assert.equal(outcome.budget.spent, 5540 + 3740, "the budget is charged what Groq reports");
  const lines = assertSafe(outcome);
  assert.ok(lines.some((item) => /^retry in .* after TRUNCATED \(JSON recovery, reasoning effort low, temperature 0\)/.test(item)), lines.join("\n"));
});

test("TASK 2/3: JSON recovery is bounded to one retry; a second malformed, cut-off or incomplete reply fails the topic", async () => {
  const twiceCut = await run([ok("{", { finish: "length", tokens: usage(2340, 3200) })]);
  assert.deepEqual([twiceCut.error.code, twiceCut.requests.length, twiceCut.error.retryClass], ["TRUNCATED", 2, "fail"]);
  const syntax = await run([ok('{"quote": "he said "no" twice"}')]);
  assert.deepEqual([syntax.error.code, syntax.error.jsonCategory, syntax.requests.length], ["INVALID_JSON", "STRUCTURE", 2]);
  assert.equal(syntax.requests[1].temperature, 0);
  assert.equal(syntax.requests[1].reasoning_effort, undefined, "only a cut-off reply lowers reasoning effort");
  const schema = await run([ok(JSON.stringify({ ...valid, facts: [] }))]);
  assert.deepEqual([schema.error.code, schema.requests.length], ["INVALID_SCHEMA", 2]);
  assert.match(schema.error.message, /no facts/, "incomplete evidence is never accepted");
  const rejected = await run([fail(400, { message: "Failed to validate JSON.", code: "json_validate_failed" })]);
  assert.deepEqual([rejected.error.code, rejected.requests.length], ["REQUEST", 2]);
});

test("TASK 2: a per-minute 429 waits Groq's Retry-After (or the wait it names) and keeps the limit's figures, with the organization redacted", async () => {
  const withHeader = await run([tpm429(), ok(JSON.stringify(valid))]);
  assert.deepEqual(withHeader.result.json, valid);
  assert.ok(withHeader.sleeps.includes(22000), `Retry-After 21 s + 1 s margin (${withHeader.sleeps})`);
  const failed = withHeader.events.find((event) => event.event === "deferred");
  assert.deepEqual([failed.limitKind, failed.limit, failed.used, failed.requested], ["TPM", 8000, 5174, 5540]);
  const lines = assertSafe(withHeader);
  assert.ok(lines.some((item) => /^attempt 1 RATE_LIMIT HTTP 429 rate_limit_exceeded · TPM limit 8000 used 5174 requested 5540/.test(item)), lines.join("\n"));
  const fromText = await run([tpm429("20.355s", {}), ok(JSON.stringify(valid))]);
  assert.ok(fromText.sleeps.some((ms) => ms >= 21355), `the wait in Groq's text is honoured (${fromText.sleeps})`);
  const rpm = await run([fail(429, { message: "Rate limit reached on requests per minute (RPM): Limit 30, Used 30, Requested 1. Please try again in 2s.", code: "rate_limit_exceeded" }, { "retry-after": "2" }), ok(JSON.stringify(valid))]);
  assert.equal(rpm.events.find((event) => event.event === "deferred").limitKind, "RPM", "requests and tokens per minute are told apart");
  assert.ok(rpm.result);
});

test("TASK 2: daily limits and waits longer than the retry ceiling stop at once instead of retrying", async () => {
  const daily = await run([fail(429, { message: "Rate limit reached on tokens per day (TPD): Limit 200000, Used 199000, Requested 5540. Please try again in 7m12s.", code: "rate_limit_exceeded" })]);
  assert.deepEqual([daily.error.code, daily.error.limitKind, daily.error.defer, daily.error.retryable, daily.requests.length], ["RATE_LIMIT", "TPD", true, false, 1]);
  const long = await run([tpm429("10m0s", { "retry-after": "600" })]);
  assert.deepEqual([long.error.code, long.error.defer, long.requests.length, long.sleeps.length], ["RATE_LIMIT", true, 1, 0]);
});

test("TASK 2: authentication failures and permanently invalid requests are never retried", async () => {
  for (const [status, code] of [[401, "AUTH"], [403, "AUTH"], [400, "REQUEST"], [413, "REQUEST_TOO_LARGE"]]) {
    const outcome = await run([fail(status, { message: "nope", code: status === 400 ? "model_not_found" : "invalid_api_key" })]);
    assert.deepEqual([outcome.error.code, outcome.requests.length, outcome.sleeps.length], [code, 1, 0], `HTTP ${status}`);
  }
});

test("TASK 2: retries are bounded by LONGFORM_LLM_MAX_ATTEMPTS even when the provider keeps failing", async () => {
  const outcome = await run([fail(503, { message: "over capacity", code: "service_unavailable" })]);
  assert.deepEqual([outcome.error.code, outcome.requests.length], ["TRANSIENT", 4]);
});

test("TASK 2: the token budget refuses a request that could exceed it, before sending it", async () => {
  const none = await run([ok(JSON.stringify(valid))], { budget: Provider.tokenBudget(3000) });
  assert.deepEqual([none.error.code, none.requests.length], ["BUDGET_EXHAUSTED", 0], "3,200 completion tokens cannot fit a 3,000-token budget");
  assert.match(Provider.describeError(none.error), /budget 0\/3000 \(next needs ≤\d+\)/);
  const one = await run([ok("{", { finish: "length", tokens: usage(2340, 3200) })], { budget: Provider.tokenBudget(8500) });
  assert.deepEqual([one.error.code, one.requests.length], ["BUDGET_EXHAUSTED", 1], "the recovery attempt could need more than the 2,960 tokens left");
  assert.equal(one.budget.spent, 5540);
});

test("TASK 2: requests wait for per-minute headroom reported by Groq's headers instead of failing with 429", async () => {
  const headers = { "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "2460", "x-ratelimit-reset-tokens": "41.3s", "x-ratelimit-remaining-requests": "990", "x-ratelimit-limit-requests": "1000", "x-ratelimit-reset-requests": "1m26.4s" };
  const outcome = await run([ok('{"a": ', { tokens: usage(2340, 3200), headers }), ok(JSON.stringify(valid), { headers })]);
  assert.deepEqual(outcome.result.json, valid);
  const paced = outcome.events.find((event) => event.event === "paced");
  assert.ok(paced && paced.delayMs >= 41300 && paced.delayMs <= 43000, JSON.stringify(paced));
  assert.match(paced.reason, /TPM headroom 2460 < \d+ needed/);
  const lines = assertSafe(outcome);
  assert.ok(lines.some((item) => /TPM left 2460\/8000 reset 41\.3s/.test(item)), lines.join("\n"));
  const exhausted = await run([ok('{"a": ', { headers: { "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "3h0m0s" } })]);
  assert.deepEqual([exhausted.error.code, exhausted.error.limitKind, exhausted.error.defer, exhausted.requests.length], ["RATE_LIMIT", "RPD", true, 1], "a spent daily request limit stops before another request");
});

test("TASK 2: without headers, a large failed completion still holds the next request back", async () => {
  const outcome = await run([ok('{"a": ', { tokens: usage(2340, 3200) }), ok(JSON.stringify(valid))], { env: { LONGFORM_LLM_TPM: "8000" } });
  const paced = outcome.events.find((event) => event.event === "paced");
  assert.ok(paced && paced.delayMs > 30000, `waited ${paced && paced.delayMs} ms for 5,540 tokens of an 8,000-token minute`);
});

test("rate-limit headers and durations are parsed as Groq documents them", () => {
  assert.deepEqual([Provider.durationMs("7.66s"), Provider.durationMs("2m59.56s"), Provider.durationMs("14h12m"), Provider.durationMs("250ms"), Provider.durationMs("21"), Provider.durationMs("")], [7660, 179560, 51120000, 250, 21000, null]);
  assert.deepEqual(Provider.rateLimitInfo("Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 5174, Requested 5540. Please try again in 20.355s."), { limitKind: "TPM", limit: 8000, used: 5174, requested: 5540, waitMs: 20355 });
  assert.equal(Provider.rateLimitHeaders({ get: () => null }), null);
});

test("callers without a budget keep the previous behaviour (no pacing, no budget, no recovery cap)", async () => {
  const outcome = await run([ok(JSON.stringify({ ...valid, facts: [] }))], { budget: null });
  assert.deepEqual([outcome.error.code, outcome.requests.length], ["INVALID_SCHEMA", 4]);
  assert.equal(outcome.events.some((event) => event.event === "paced"), false);
});

// ---- scripts/ct-research.js ---------------------------------------------------------------

function researchDeps(generate, extra = {}) {
  const universe = JSON.parse(fs.readFileSync(Channel.getChannel("critical-thread").paths.topicUniverse, "utf8"));
  // CT-230 (reverse osmosis) matches the stubbed article, so each queue entry reaches the provider.
  const ct230 = universe.topics.find((topic) => topic.id === "CT-230");
  const topics = [ct230, ct230, ct230];
  const lines = [];
  return {
    topics, lines,
    deps: {
      generate, log: (line) => lines.push(line),
      measure: () => ({ qualified: 0, runwayDays: 0, deficit: 14, queue: topics.map((topic) => ({ slug: topic.slug })) }),
      get: async (url) => {
        if (/list=search/.test(url)) return { body: { query: { search: [{ title: "Reverse osmosis" }] } } };
        if (/prop=extracts/.test(url)) return { body: { query: { pages: { 1: { title: "Reverse osmosis", extract: "Reverse osmosis desalination membrane. ".repeat(40) } } } } };
        if (/prop=extlinks/.test(url)) return { body: { query: { pages: { 1: { extlinks: [{ "*": "https://www.epa.gov/water-research" }, { "*": "https://www.who.int/water" }] } } } } };
        return { status: 200 };
      },
      verify: async () => ({ report: [{ slug: "x", errors: [] }] }),
      ...extra,
    },
  };
}

test("ct-research gives each topic its own token budget and reports what each topic used", async () => {
  const seen = [];
  const { deps, lines } = researchDeps(async (input) => {
    seen.push(input.budget);
    input.budget.spent += 4000; input.budget.requests += 1;
    throw new Provider.LongformProviderError("INVALID_JSON", "groq returned invalid JSON", { provider: "groq", stage: "ct-research", jsonCategory: "STRUCTURE" });
  }, { topicTokenBudget: 16000, runTokenBudget: 45000 });
  const result = await Research.main(["--limit", "3"], deps);
  assert.equal(seen.length, 3, "an INVALID_JSON topic does not stop the batch");
  assert.ok(seen.every((budget) => budget.limit === 16000));
  assert.equal(new Set(seen).size, 3, "a fresh budget per topic");
  assert.equal(result.tokens, 12000);
  assert.ok(lines.some((line) => /: ERROR — INVALID_JSON · json STRUCTURE .*\[1 request\(s\), 4000 tokens\]/.test(line)), lines.join("\n"));
  assert.ok(lines.includes("provider tokens used this run: 12000 of 45000"));
});

test("ct-research stops the batch when the run budget cannot hold another request, or on a rejected credential", async () => {
  const spend = researchDeps(async (input) => { input.budget.spent += 15000; input.budget.requests += 1; return { json: { answerable: false, reason: "excerpts do not cover it" } }; },
    { topicTokenBudget: 16000, runTokenBudget: 18000 });
  const spent = await Research.main(["--limit", "3"], spend.deps);
  assert.equal(spent.outcomes.length, 1);
  assert.ok(spend.lines.some((line) => /run token budget left \(3000\) cannot hold one more request; stopping this batch/.test(line)), spend.lines.join("\n"));
  let calls = 0;
  const auth = researchDeps(async () => { calls += 1; throw new Provider.LongformProviderError("AUTH", "groq authentication failed", { provider: "groq", status: 401, stage: "ct-research" }); });
  const rejected = await Research.main(["--limit", "3"], auth.deps);
  assert.equal(calls, 1, "a rejected credential is not tried on the other topics");
  assert.equal(rejected.outcomes.length, 0);
  assert.ok(auth.lines.some((line) => /provider rejected the credential \(AUTH · HTTP 401/.test(line)));
});

test("the CT research workflow sets the token ceilings and keeps a dry run free of writes", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "ct-research.yml"), "utf8");
  for (const line of ["CT_RESEARCH_MAX_TOKENS: '3200'", "CT_RESEARCH_TOPIC_TOKEN_BUDGET: '16000'", "CT_RESEARCH_RUN_TOKEN_BUDGET: '45000'", "LONGFORM_LLM_TPM: '8000'", "LONGFORM_LLM_JSON_RECOVERIES: '1'"]) assert.ok(workflow.includes(line), line);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' \|\| vars\.CT_RESEARCH_AUTO == 'true'/, "scheduled runs stay behind CT_RESEARCH_AUTO");
  assert.match(workflow, /WRITE: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.write == 'true' \}\}/);
});
