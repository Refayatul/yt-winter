#!/usr/bin/env node
"use strict";

// Make GPT-OSS JSON mode valid and preserve enough safe HTTP diagnostics to
// diagnose rejected research requests. Never log credentials, request bodies,
// prompts, or response headers; only Groq's short error response is retained.
const fs = require("fs");
const path = require("path");

const providerFile = path.join(__dirname, "..", "core", "llm", "longform-provider.js");
let provider = fs.readFileSync(providerFile, "utf8");

const reasoningNeedle = '        response_format: { type: "json_object" },\n        temperature: 0.25,';
const reasoningReplacement = '        reasoning_format: "hidden",\n        response_format: { type: "json_object" },\n        temperature: 0.25,';
if (!provider.includes(reasoningReplacement)) {
  if (!provider.includes(reasoningNeedle)) throw new Error("Groq JSON compatibility patch target not found");
  provider = provider.replace(reasoningNeedle, reasoningReplacement);
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
    if (detail) classified.message = classified.message + ": " + detail;
    throw classified;
  }`;
if (!provider.includes(httpReplacement)) {
  if (!provider.includes(httpNeedle)) throw new Error("Groq HTTP diagnostic patch target not found");
  provider = provider.replace(httpNeedle, httpReplacement);
}

fs.writeFileSync(providerFile, provider);
if (!provider.includes('reasoning_format: "hidden"')) throw new Error("Groq reasoning_format assertion failed");
if (!provider.includes('const raw = await response.text()')) throw new Error("Groq HTTP diagnostic assertion failed");

// The research runner previously reduced provider failures to the bare code
// "REQUEST", hiding the status/message we need. Preserve code + status + the
// bounded provider message in the per-topic outcome.
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

console.log("Groq JSON mode + safe request diagnostics verified; model and quality gates unchanged");
