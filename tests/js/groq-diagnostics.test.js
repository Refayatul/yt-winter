"use strict";

// 2026-10-13 CriticalThread research dry run (run 38460639764) reported "ERROR — REQUEST" for two
// topics with no HTTP status or provider message, so the cause could not be diagnosed. Provider
// failures now carry the HTTP status, a sanitized provider code/message, the request size, the
// stage and the retry class, and never the API key, the prompt or request headers.

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Provider = require("../../core/llm/longform-provider");

const ROOT = path.join(__dirname, "..", "..");
const KEY = "gsk_TESTKEY0123456789abcdef";
const PROMPT_MARKER = "PROMPT-BODY-MUST-NOT-BE-LOGGED";
const input = { model: "openai/gpt-oss-120b", stage: "ct-research", system: "system " + PROMPT_MARKER, user: "user " + PROMPT_MARKER.repeat(50), maxTokens: 1024 };

function reply(status, body, headers = {}) {
  return async () => ({ ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body });
}

async function failure(fetch, extra = {}) {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = KEY;
  try { await Provider.groq(input, { fetch, ...extra }); } catch (error) { return error; } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
  }
  throw new Error("expected a failure");
}

function assertSafe(error) {
  const text = JSON.stringify({ ...error, message: error.message, line: Provider.describeError(error) });
  assert.doesNotMatch(text, new RegExp(KEY), "the API key never appears");
  assert.doesNotMatch(text, new RegExp(PROMPT_MARKER), "the prompt never appears");
  assert.doesNotMatch(text, /Authorization|Bearer gsk/i, "request headers never appear");
}

test("HTTP 400: provider code and sanitized message are kept, the echoed generation is dropped", async () => {
  const error = await failure(reply(400, { error: { message: "Failed to validate JSON. Key gsk_LEAKED0123456789 in output", type: "invalid_request_error", code: "json_validate_failed",
    failed_generation: "{ " + PROMPT_MARKER + " }" } }));
  assert.equal(error.code, "REQUEST");
  assert.equal(error.status, 400);
  assert.equal(error.providerCode, "json_validate_failed");
  assert.match(error.providerMessage, /^Failed to validate JSON\. Key \[redacted\] in output$/);
  assert.equal(error.retryClass, "fail");
  assert.equal(error.stage, "ct-research");
  assert.ok(error.requestBytes > 1000 && error.estimatedTokens === Math.ceil(error.requestBytes / 4));
  assert.match(Provider.describeError(error), /^REQUEST · HTTP 400 · provider json_validate_failed · ~\d+ input tokens \(\d+ bytes\) · stage ct-research · fail — Failed to validate JSON/);
  assertSafe(error);
});

test("HTTP 401 and 403 are authentication failures and are not retried", async () => {
  for (const status of [401, 403]) {
    const error = await failure(reply(status, { error: { message: "Invalid API Key " + KEY, code: "invalid_api_key" } }));
    assert.deepEqual([error.code, error.status, error.retryClass, error.providerCode], ["AUTH", status, "fail", "invalid_api_key"]);
    assert.match(error.providerMessage, /Invalid API Key \[redacted\]/);
    assertSafe(error);
  }
});

test("HTTP 413 is REQUEST_TOO_LARGE with the measured size; retrying the same request cannot help", async () => {
  const error = await failure(reply(413, { error: { message: "Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 9512", type: "tokens", code: "rate_limit_exceeded" } }));
  assert.deepEqual([error.code, error.status, error.retryClass, error.defer], ["REQUEST_TOO_LARGE", 413, "fail", false]);
  assert.match(error.providerMessage, /Limit 8000, Requested 9512/);
  assert.ok(error.estimatedTokens > 0);
  assertSafe(error);
});

test("HTTP 429 defers with Retry-After; 5xx defers as transient", async () => {
  const limited = await failure(reply(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "7" }));
  assert.deepEqual([limited.code, limited.retryClass, limited.retryAfterMs, limited.providerCode], ["RATE_LIMIT", "defer", 7000, "rate_limit_exceeded"]);
  for (const status of [500, 502, 503]) {
    const error = await failure(reply(status, "<html>Bad gateway</html>"));
    assert.deepEqual([error.code, error.status, error.retryClass], ["TRANSIENT", status, "defer"]);
    assert.equal(error.providerMessage, "<html>Bad gateway</html>", "a non-JSON body is kept, sanitized and truncated");
    assertSafe(error);
  }
});

test("a stalled request times out instead of holding the job until the workflow limit", async () => {
  const hang = (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
  const error = await failure(hang, { timeoutMs: 50 });
  assert.deepEqual([error.code, error.retryClass], ["TIMEOUT", "defer"]);
  assert.ok(error.requestBytes > 0);
  const network = await failure(async () => { throw new Error("ECONNRESET"); });
  assert.deepEqual([network.code, network.retryClass], ["NETWORK", "defer"]);
  assertSafe(error);
});

test("long or control-character provider messages are bounded", () => {
  const value = Provider.sanitizeDetail("a\n\tb" + "x".repeat(1000));
  assert.equal(value.length, 240);
  assert.match(value, /^a b/);
  assert.equal(Provider.sanitizeDetail(null), "");
});

test("ct-research reports provider failures with the diagnostic line and the topic id", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "ct-research.js"), "utf8");
  assert.match(source, /Provider\.describeError\(error\)/);
  assert.match(source, /log\(`✗ \$\{topic\.id\} \$\{topic\.slug\}: provider \$\{error\.code === "AUTH" \? "rejected the credential" : "deferred"\}/);
  assert.match(source, /log\(`\$\{outcome\.status === "VERIFIED" \? "✓" : "✗"\} \$\{topic\.id\} \$\{topic\.slug\}/);
});

test("the BTO research runtime patch still applies to the provider (and is idempotent)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bto-patch-"));
  for (const file of ["scripts/bto-groq-json-compat.js", "scripts/bto-research.js", "core/llm/longform-provider.js"]) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  for (let run = 0; run < 2; run += 1) {
    const result = cp.spawnSync(process.execPath, ["scripts/bto-groq-json-compat.js"], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  const patched = fs.readFileSync(path.join(dir, "core/llm/longform-provider.js"), "utf8");
  assert.match(patched, /throw await groqHttpError\(response, input, sent\);/, "native diagnostics survive the patch");
  assert.match(patched, /reasoning_format: "hidden"/, "the BTO JSON contract patch still applies");
});
