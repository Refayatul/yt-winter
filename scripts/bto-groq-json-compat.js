#!/usr/bin/env node
"use strict";

// Keep GPT-OSS reasoning hidden, but do not use Groq server-side JSON Object
// Mode. Some valid research prompts make Groq reject the generation with
// json_validate_failed before the application can inspect it. We instead ask
// for strict JSON in the prompt and use the provider's existing client-side
// JSON parser. Research/evidence/answerability quality gates are unchanged.
const fs = require("fs");
const path = require("path");

const providerFile = path.join(__dirname, "..", "core", "llm", "longform-provider.js");
let provider = fs.readFileSync(providerFile, "utf8");

const requestNeedle = '        messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],\n        response_format: { type: "json_object" },\n        temperature: 0.25,';
const requestReplacement = '        messages: [{ role: "system", content: `${input.system}\\n\\nOUTPUT CONTRACT: Return exactly one valid JSON object and nothing else. Use double-quoted property names and strings. Do not use markdown fences, comments, trailing commas, NaN, Infinity, or text before/after the JSON object.` }, { role: "user", content: input.user }],\n        reasoning_format: "hidden",\n        temperature: input.jsonRecovery ? 0 : 0.25,';
if (!provider.includes(requestReplacement)) {
  if (!provider.includes(requestNeedle)) throw new Error("Groq client-side JSON patch target not found");
  provider = provider.replace(requestNeedle, requestReplacement);
}

const httpNeedle = '  if (!response.ok) throw classifyHttp("groq", response.status, response.headers, input.stage);';
const httpReplacement = `  if (!response.ok) {
    let detail = "";
    try {
      const raw = await response.text();
      detail = String(raw || "").replace(/[\\r\\n\\t]+/g, " ").replace(/[\\x00-\\x1f\\x7f]/g, " ").trim().slice(0, 500);
    } catch (error) { /* diagnostics are best effort */ }
    const classified = classifyHttp("groq", response.status, response.headers, input.stage);
    if (detail) classified.message = classified.message + ": " + detail;
    throw classified;
  }`;
if (!provider.includes(httpReplacement)) {
  if (!provider.includes(httpNeedle)) throw new Error("Groq HTTP diagnostic patch target not found");
  provider = provider.replace(httpNeedle, httpReplacement);
}

// INVALID_JSON is produced only after Groq returned a successful HTTP response;
// retry it with temperature 0 and the same strict JSON output contract.
const retryNeedle = '      const result = await once(spec, input, dependencies);';
const retryReplacement = '      const result = await once(spec, attempt > 0 && input.__jsonRecovery ? { ...input, jsonRecovery: true } : input, dependencies);';
if (!provider.includes(retryReplacement)) {
  if (!provider.includes(retryNeedle)) throw new Error("Groq JSON retry request patch target not found");
  provider = provider.replace(retryNeedle, retryReplacement);
}

const catchNeedle = '      if (!safe.retryable || attempt + 1 >= attempts) throw safe;\n      const delay = delayFor(safe, attempt);';
const catchReplacement = '      if (spec.name === "groq" && safe.code === "INVALID_JSON") { safe.retryable = true; safe.defer = false; }\n      if (!safe.retryable || attempt + 1 >= attempts) throw safe;\n      if (safe.code === "INVALID_JSON") input = { ...input, __jsonRecovery: true };\n      const delay = safe.code === "INVALID_JSON" ? 250 : delayFor(safe, attempt);';
if (!provider.includes(catchReplacement)) {
  if (!provider.includes(catchNeedle)) throw new Error("Groq client JSON retry state patch target not found");
  provider = provider.replace(catchNeedle, catchReplacement);
}

// Groq can return 429 while the token-per-minute window is still occupied.
// Short exponential retries only burn attempts inside the same window. Honor
// Retry-After with a safety margin; when the header is absent, wait one full
// minute before retrying. LONGFORM_LLM_MAX_RETRY_MS remains the hard ceiling.
const delayNeedle = `  const exponential = Math.min(maximum, 1000 * 2 ** attempt);
  return Math.min(maximum, Math.max(exponential, error.retryAfterMs || 0));`;
const delayReplacement = `  const exponential = Math.min(maximum, 1000 * 2 ** attempt);
  if (error.code === "RATE_LIMIT") {
    const rateWindow = error.retryAfterMs ? error.retryAfterMs + 5000 : 65000;
    return Math.min(maximum, Math.max(exponential, rateWindow));
  }
  return Math.min(maximum, Math.max(exponential, error.retryAfterMs || 0));`;
if (!provider.includes(delayReplacement)) {
  if (!provider.includes(delayNeedle)) throw new Error("Groq rate-limit delay patch target not found");
  provider = provider.replace(delayNeedle, delayReplacement);
}

fs.writeFileSync(providerFile, provider);
if (!provider.includes('reasoning_format: "hidden"')) throw new Error("Groq reasoning_format assertion failed");
if (provider.includes('response_format: { type: "json_object" }')) throw new Error("Groq server-side JSON mode must be disabled");
if (!provider.includes('OUTPUT CONTRACT: Return exactly one valid JSON object')) throw new Error("Groq strict JSON output contract assertion failed");
if (!provider.includes('error.code === "RATE_LIMIT"')) throw new Error("Groq rate-limit wait assertion failed");

// Preserve code + status + bounded provider message in per-topic outcomes.
const researchFile = path.join(__dirname, "bto-research.js");
let research = fs.readFileSync(researchFile, "utf8");
const reasonNeedle = '      outcome = { status: "ERROR", reason: String(error.code || error.message).slice(0, 200) };';
const reasonReplacement = '      outcome = { status: "ERROR", reason: String(`${error.code || "ERROR"}${error.status ? ` HTTP ${error.status}` : ""}: ${error.message || "provider request failed"}`).slice(0, 700) };';
if (!research.includes(reasonReplacement)) {
  if (!research.includes(reasonNeedle)) throw new Error("BTO provider error telemetry patch target not found");
  research = research.replace(reasonNeedle, reasonReplacement);
  fs.writeFileSync(researchFile, research);
}
if (!research.includes('error.status ? ` HTTP ${error.status}`')) throw new Error("BTO provider error telemetry assertion failed");

console.log("Groq client-side JSON parsing + strict output contract + rate-limit-aware retry + safe diagnostics verified; model and quality gates unchanged");
