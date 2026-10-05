#!/usr/bin/env node
"use strict";

// Groq reasoning models (including openai/gpt-oss-120b) require reasoning
// output to be parsed or hidden when JSON mode is enabled. Without this,
// chat/completions rejects otherwise valid BTO research requests with HTTP 400.
// Keep the model and all evidence/quality gates unchanged; only make the API
// request shape valid for JSON Object Mode.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "core", "llm", "longform-provider.js");
let src = fs.readFileSync(file, "utf8");
const needle = '        response_format: { type: "json_object" },\n        temperature: 0.25,';
const replacement = '        reasoning_format: "hidden",\n        response_format: { type: "json_object" },\n        temperature: 0.25,';

if (!src.includes(replacement)) {
  if (!src.includes(needle)) throw new Error("Groq JSON compatibility patch target not found");
  src = src.replace(needle, replacement);
  fs.writeFileSync(file, src);
}

if (!src.includes('reasoning_format: "hidden"')) throw new Error("Groq reasoning_format assertion failed");
console.log("Groq JSON mode verified: reasoning_format=hidden; model and quality gates unchanged");
