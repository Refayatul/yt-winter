"use strict";

// 2026-10-13 CriticalThread dry run (run 38463843698): CT-265, CT-437 and CT-234 all failed with
// HTTP 400 json_validate_failed from Groq's server-side JSON mode. CT research now uses client-side
// JSON: no response_format, the output contract in the prompt, local parsing and a structural
// schema check, and a bounded retry of malformed replies. Nothing malformed is ever returned.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Provider = require("../../core/llm/longform-provider");
const Research = require("../../scripts/ct-research");

const ROOT = path.join(__dirname, "..", "..");
const spec = { name: "groq", model: "openai/gpt-oss-120b", configured: true, keyName: "GROQ_API_KEY" };
const valid = {
  answerable: true, title: "t", openingLine: "One ship stopped a canal.", dependency: "d.", mechanism: "m.", bottleneck: "b.", failureConsequence: "f.", resilience: "r.",
  facts: [{ id: "F1", claim: "c", quote: "six exact words copied from the source", sourceId: "S1" }],
  narration: [{ role: "HIDDEN_SYSTEM", layer: "VERIFIED FACT", text: "One ship stopped a canal.", facts: ["F1"] }],
};
const input = () => ({ stage: "ct-research", system: "SYSTEM PROMPT", user: "{}", maxTokens: 512, clientJson: true, validateJson: Research.draftProblems });

function groqReply(content, status = 200, body = null, headers = {}) {
  return { ok: status === 200, status, headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => ({ model: "openai/gpt-oss-120b", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }),
    text: async () => JSON.stringify(body || {}) };
}

function scripted(replies) {
  const requests = [];
  const fetch = async (url, init) => { requests.push(JSON.parse(init.body)); const next = replies[Math.min(requests.length - 1, replies.length - 1)]; return typeof next === "function" ? next(init) : next; };
  return { fetch, requests };
}

async function run(replies, attempts = "4") {
  const previous = { attempts: process.env.LONGFORM_LLM_MAX_ATTEMPTS, key: process.env.GROQ_API_KEY };
  process.env.LONGFORM_LLM_MAX_ATTEMPTS = attempts;
  process.env.GROQ_API_KEY = "gsk_test0123456789";
  const { fetch, requests } = scripted(replies);
  const events = [];
  const sleeps = [];
  try {
    const result = await Provider.withRetry(spec, input(), { fetch, sleep: async (ms) => { sleeps.push(ms); }, timeoutMs: 50 }, (event) => events.push(event));
    return { result, requests, events, sleeps };
  } catch (error) { return { error, requests, events, sleeps }; } finally {
    for (const [name, value] of [["LONGFORM_LLM_MAX_ATTEMPTS", previous.attempts], ["GROQ_API_KEY", previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test("valid JSON: no server-side JSON mode, the contract is in the prompt, reasoning is hidden", async () => {
  const { result, requests } = await run([groqReply(JSON.stringify(valid))]);
  assert.deepEqual(result.json, valid);
  assert.equal(requests.length, 1);
  assert.equal("response_format" in requests[0], false, "Groq JSON mode is off");
  assert.equal(requests[0].reasoning_format, "hidden");
  assert.equal(requests[0].temperature, 0.25);
  assert.match(requests[0].messages[0].content, /^SYSTEM PROMPT\n\nOUTPUT CONTRACT: Return exactly one valid JSON object/);
});

test("invalid JSON is retried at temperature 0 and then accepted only when valid", async () => {
  const { result, requests, events } = await run([groqReply("Here is the answer: {not json"), groqReply("```json\n" + JSON.stringify(valid) + "\n```")]);
  assert.deepEqual(result.json, valid, "a fenced but valid object is parsed locally");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].temperature, 0, "the recovery attempt is deterministic");
  assert.ok(events.some((event) => event.event === "failed" && event.code === "INVALID_JSON" && event.retryClass === "retry"));
});

test("provider json_validate_failed (HTTP 400) is retried instead of failing the topic", async () => {
  const rejected = groqReply(null, 400, { error: { message: "Failed to validate JSON.", code: "json_validate_failed" } });
  const { result, requests } = await run([rejected, groqReply(JSON.stringify(valid))]);
  assert.deepEqual(result.json, valid);
  assert.equal(requests.length, 2);
});

test("missing required fields are rejected and retried; a reply that never completes is never returned", async () => {
  const { answerable, ...noAnswerable } = valid;
  assert.deepEqual(Research.draftProblems(noAnswerable), ["answerable must be true or false"]);
  assert.ok(Research.draftProblems({ ...valid, facts: [] }).includes("no facts"));
  assert.ok(Research.draftProblems({ ...valid, facts: [{ id: "F1", claim: "c", sourceId: "S1" }] }).includes("a fact lacks id, claim, quote or sourceId"));
  assert.ok(Research.draftProblems({ ...valid, narration: [{ text: "x" }] }).includes("a narration line lacks text or facts"));
  assert.ok(Research.draftProblems({ ...valid, bottleneck: " " }).includes("missing bottleneck"));
  assert.deepEqual(Research.draftProblems({ answerable: false, reason: "excerpts do not support it" }), []);
  assert.deepEqual(Research.draftProblems({ answerable: false }), ["answerable:false without a reason"]);
  assert.deepEqual(Research.draftProblems([]), ["reply is not a JSON object"]);
  const incomplete = groqReply(JSON.stringify({ ...valid, facts: [] }));
  const { error, requests } = await run([incomplete]);
  assert.equal(error.code, "INVALID_SCHEMA");
  assert.match(error.message, /no facts/);
  assert.equal(requests.length, 4, "bounded by LONGFORM_LLM_MAX_ATTEMPTS");
});

test("repeated malformed replies stop at the attempt limit and surface the failure", async () => {
  const { error, requests, sleeps } = await run([groqReply("{bad")], "3");
  assert.equal(error.code, "INVALID_JSON");
  assert.equal(requests.length, 3);
  assert.equal(sleeps.length, 2);
});

test("a timeout still defers (stops the batch) after its retries, as before", async () => {
  const hang = (init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const { error, requests } = await run([hang], "2");
  assert.deepEqual([error.code, error.defer, error.retryClass], ["TIMEOUT", true, "defer"]);
  assert.equal(requests.length, 2);
});

test("rate limiting still defers with Retry-After and is not turned into a JSON retry", async () => {
  const limited = groqReply(null, 429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "3" });
  const { error, sleeps } = await run([limited], "2");
  assert.deepEqual([error.code, error.defer, error.retryClass], ["RATE_LIMIT", true, "defer"]);
  assert.ok(sleeps[0] >= 3000, "Retry-After is honoured");
  assert.equal(Provider.jsonRetryable(error), false);
  const other400 = groqReply(null, 400, { error: { message: "model not found", code: "model_not_found" } });
  const rejected = await run([other400], "3");
  assert.equal(rejected.error.code, "REQUEST");
  assert.equal(rejected.requests.length, 1, "other 400s are not retried");
});

test("callers without clientJson keep server-side JSON mode unchanged", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk_test0123456789";
  const { fetch, requests } = scripted([groqReply(JSON.stringify({ ok: true }))]);
  try { await Provider.groq({ stage: "longform", system: "S", user: "U", model: "m" }, { fetch }); } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
  }
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  assert.equal(requests[0].messages[0].content, "S");
  assert.equal("reasoning_format" in requests[0], false);
});

test("CT research asks for client-side JSON with its schema check; verification code is unchanged", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "ct-research.js"), "utf8");
  assert.match(source, /deps\.generate\(\{ stage: "ct-research", maxTokens: COMPLETION_TOKENS, system: SYSTEM, clientJson: true, validateJson: draftProblems,/);
  assert.match(source, /const supportErrors = Shared\.narrationSupport\(narration, facts\);/, "fact support is still checked after the schema check");
  assert.match(source, /if \(links\.length < 2\) supportErrors\.push/, "two primary references are still required");
});
