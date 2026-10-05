#!/usr/bin/env node
"use strict";

// Make GPT-OSS JSON mode valid, retain safe HTTP diagnostics, and recover from
// Groq json_validate_failed responses without weakening research quality gates.
const fs = require("fs");
const path = require("path");

const providerFile = path.join(__dirname, "..", "core", "llm", "longform-provider.js");
let provider = fs.readFileSync(providerFile, "utf8");

const reasoningNeedle = '        response_format: { type: "json_object" },\n        temperature: 0.25,';
const reasoningReplacement = '        reasoning_format: "hidden",\n        response_format: { type: "json_object" },\n        temperature: input.jsonRecovery ? 0 : 0.25,';
if (!provider.includes(reasoningReplacement)) {
  if (!provider.includes(reasoningNeedle)) throw new Error("Groq JSON compatibility patch target not found");
  provider = provider.replace(reasoningNeedle, reasoningReplacement);
}

const messagesNeedle = '        messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],';
const messagesReplacement = '        messages: [{ role: "system", content: input.jsonRecovery ? `${input.system}\\n\\nSTRICT JSON RECOVERY: Return exactly one valid JSON object and nothing else. Use double-quoted property names and strings. Do not use markdown fences, comments, trailing commas, NaN, Infinity, or text before/after the JSON object.` : input.system }, { role: "user", content: input.user }],';
if (!provider.includes(messagesReplacement)) {
  if (!provider.includes(messagesNeedle)) throw new Error("Groq JSON recovery prompt patch target not found");
  provider = provider.replace(messagesNeedle, messagesReplacement);
}

const httpNeedle = '  if (!response.ok) throw classifyHttp("groq", response.status, response.headers, input.stage);';
const httpReplacement = `  if (!response.ok) {
    let detail = "";
    try {
      const raw = await response.text();
      // Groq error payloads are JSON/text. Keep only a bounded, single-line,
      // control-character-free diagnostic; never include request data.
      detail = String(raw || "").replace(/[\\r\\n\\t]+/g, " ").replace(/[\\x00-\\x1f\\x7f]/g, " ").trim().slice(0, 500);
    } catch (error) { /* diagnostics are best effort */ }
    const classified = classifyHttp("groq", response.status, response.headers, input.stage);
    if (response.status === 400 && detail.includes("json_validate_failed")) {
      classified.code = "JSON_VALIDATE_FAILED";
      classified.retryable = true;
      classified.defer = false;
    }
    if (detail) classified.message = classified.message + ": " + detail;
    throw classified;
  }`;
if (!provider.includes(httpReplacement)) {
  if (!provider.includes(httpNeedle)) throw new Error("Groq HTTP diagnostic patch target not found");
  provider = provider.replace(httpNeedle, httpReplacement);
}

const retryNeedle = '      const result = await once(spec, input, dependencies);';
const retryReplacement = '      const result = await once(spec, attempt > 0 && input.__jsonRecovery ? { ...input, jsonRecovery: true } : input, dependencies);';
if (!provider.includes(retryReplacement)) {
  if (!provider.includes(retryNeedle)) throw new Error("Groq JSON retry request patch target not found");
  provider = provider.replace(retryNeedle, retryReplacement);
}

const catchNeedle = '      if (!safe.retryable || attempt + 1 >= attempts) throw safe;\n      const delay = delayFor(safe, attempt);';
const catchReplacement = '      if (!safe.retryable || attempt + 1 >= attempts) throw safe;\n      if (safe.code === "JSON_VALIDATE_FAILED") input = { ...input, __jsonRecovery: true };\n      const delay = safe.code === "JSON_VALIDATE_FAILED" ? 250 : delayFor(safe, attempt);';
if (!provider.includes(catchReplacement)) {
  if (!provider.includes(catchNeedle)) throw new Error("Groq JSON retry state patch target not found");
  provider = provider.replace(catchNeedle, catchReplacement);
}

fs.writeFileSync(providerFile, provider);
if (!provider.includes('reasoning_format: "hidden"')) throw new Error("Groq reasoning_format assertion failed");
if (!provider.includes('JSON_VALIDATE_FAILED')) throw new Error("Groq JSON recovery assertion failed");
if (!provider.includes('STRICT JSON RECOVERY')) throw new Error("Groq strict JSON retry assertion failed");

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

console.log("Groq JSON mode + strict validation recovery + safe diagnostics verified; model and quality gates unchanged");
