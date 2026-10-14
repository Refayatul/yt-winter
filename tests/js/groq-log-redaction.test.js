"use strict";

// The 2026-10-14 CriticalThread dry run (run 38516520859) printed Groq's 429 text verbatim in a
// public CI log, including the account's organization ID ("... in organization `org_…` service
// tier ..."). Provider text is now stripped of organization, project, request and user
// identifiers, UUIDs and e-mail addresses, as well as keys and bearer tokens. The figures needed
// for diagnosis (limit kind, limit, used, requested, wait) are kept.

const test = require("node:test");
const assert = require("node:assert/strict");
const Provider = require("../../core/llm/longform-provider");

const ORG = "org_01abcdefghijklmnopqrstuvwx";
const RATE_LIMIT_TEXT = `Rate limit reached for model \`openai/gpt-oss-120b\` in organization \`${ORG}\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Used 5174, Requested 5540. Please try again in 20.355s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing`;

test("the Groq 429 text loses the organization ID and keeps the figures needed for diagnosis", () => {
  const clean = Provider.sanitizeDetail(RATE_LIMIT_TEXT);
  assert.doesNotMatch(clean, /org_/);
  assert.doesNotMatch(clean, new RegExp(ORG.slice(4)));
  assert.match(clean, /in organization \[redacted\] service tier/);
  assert.match(clean, /openai\/gpt-oss-120b/, "the model name is not an identifier");
  assert.match(clean, /tokens per minute \(TPM\): Limit 8000, Used 5174, Requested 5540\. Please try again in 20\.355s/);
});

test("account, project, request and user identifiers, UUIDs and e-mail addresses are redacted", () => {
  const cases = [
    ["request req_01jz8x9k2mabcdef failed", /req_/],
    ["project proj_abc123def456 is over quota", /proj_abc/],
    ["project_id=prj_9f8e7d6c5b4a", /prj_9f8e/],
    ["organization: 7c1d2e3f4a5b", /7c1d2e3f4a5b/],
    ["organization \"acme-research\" is suspended", /acme-research/],
    ["account acct_12345678 disabled", /acct_1234/],
    ["user_abcdef123456 has no access", /user_abc/],
    ["session sess_ABCDEF123456 expired", /sess_ABC/],
    ["trace 123e4567-e89b-12d3-a456-426614174000", /123e4567/],
    ["contact owner@example.com", /owner@example\.com/],
    ["key gsk_abcdefghijklmnop1234 invalid", /gsk_abc/],
    ["Authorization: Bearer abc.def.ghi", /abc\.def\.ghi/],
  ];
  for (const [text, secret] of cases) assert.doesNotMatch(Provider.sanitizeDetail(text), secret, text);
});

test("ordinary provider wording is not redacted", () => {
  for (const text of ["Please check your account settings and team members", "Invalid API Key", "Failed to validate JSON.", "model `openai/gpt-oss-120b` does not exist"]) {
    assert.equal(Provider.sanitizeDetail(text), text);
  }
});

test("a real 429 path never carries the organization ID into the error, its log line or provider events", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk_TESTKEY0123456789abcdef";
  const body = { error: { message: RATE_LIMIT_TEXT, type: "tokens", code: "rate_limit_exceeded" } };
  const fetch = async () => ({ ok: false, status: 429, headers: { get: (name) => ({ "retry-after": "21" })[name.toLowerCase()] || null },
    text: async () => JSON.stringify(body), json: async () => body });
  const events = [];
  let error;
  try {
    await Provider.withRetry({ name: "groq", model: "openai/gpt-oss-120b", configured: true, keyName: "GROQ_API_KEY" },
      { stage: "ct-research", system: "s", user: "u", maxTokens: 64 }, { fetch, sleep: async () => {} }, (event) => events.push(event));
  } catch (caught) { error = caught; } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
  }
  assert.equal(error.code, "RATE_LIMIT");
  const everything = JSON.stringify({ error: { ...error, message: error.message }, line: Provider.describeError(error), events });
  assert.doesNotMatch(everything, /org_|01abcdefghij/);
  assert.match(Provider.describeError(error), /provider rate_limit_exceeded/);
});
