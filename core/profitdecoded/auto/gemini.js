"use strict";
// Google Gemini provider (free tier only) for the independent editorial critique.
//
// * REST generateContent with the key in the x-goog-api-key header (never in the URL, never logged).
// * Only models that Google's pricing page lists as "Free of charge" on the free tier are allowed
//   (FREE_TIER_MODELS, checked against https://ai.google.dev/gemini-api/docs/pricing, last updated 2026-10-07).
//   Any other model is refused before a request is made: no silent paid usage.
// * The free tier cannot be confirmed from an API response: it depends on whether billing is enabled on
//   the Google Cloud project. The repository owner states the project is on the free tier; Google AI Studio
//   (billing + rate-limit pages) is the source of truth.
// * 429/5xx are retried with the server's RetryInfo delay (bounded); an exhausted daily quota is reported as
//   QUOTA so the caller can pause and resume later instead of failing a topic.
// Env: GEMINI_API_KEY (env or .env), PD_GEMINI_MODEL (default gemini-3.8-flash).

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../config");
const { AutoError } = require("./llm");

const FREE_TIER_MODELS = Object.freeze(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"]);
// Paid list prices (USD per 1M tokens) for the same models: used only to report what the usage WOULD cost on a paid tier.
const PAID_EQUIVALENT = Object.freeze({ "gemini-3.8-flash": { input: 0.75, output: 3.75 }, "gemini-3.7-flash": { input: 0.75, output: 3.75 }, "gemini-3.6-flash": { input: 0.75, output: 3.75 }, "gemini-3.5-flash": { input: 1.5, output: 9 }, "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 }, "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 }, "gemini-3-flash-preview": { input: 0.5, output: 3 }, "gemini-2.5-flash": { input: 0.3, output: 2.5 }, "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 } });
const MODEL = () => process.env.PD_GEMINI_MODEL || "gemini-3.8-flash";
const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

function apiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) return process.env.GEMINI_API_KEY.trim();
  if (process.env.NODE_TEST_CONTEXT) return "";
  try { for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) { const m = line.match(/^GEMINI_API_KEY=(.*)$/); if (m && m[1].trim()) return m[1].trim(); } } catch (e) { /* optional */ }
  return "";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// "RetryInfo" in a 429 body: { "@type": "...RetryInfo", "retryDelay": "37s" }
function retryDelayMs(body) {
  const det = (body && body.error && body.error.details) || [];
  const ri = det.find((d) => /RetryInfo/.test(d["@type"] || ""));
  const s = ri && /([\d.]+)s/.exec(ri.retryDelay || "");
  return s ? Math.ceil(Number(s[1]) * 1000) : null;
}
const isDailyQuota = (body) => /per ?day|PerDay|daily/i.test(JSON.stringify((body && body.error) || {}));

// Free models tried, in order, when the chosen one is overloaded (503). All must be on the free-tier allowlist.
const FALLBACKS = () => String(process.env.PD_GEMINI_FALLBACK_MODELS || "gemini-3.7-flash,gemini-2.5-flash").split(",").map((x) => x.trim()).filter(Boolean);

// messages: [{ role: "user"|"assistant", content: string | [{type:"text", text}] }]
// A model that stays overloaded (503 after retries) is replaced by the next free fallback; if every free model is
// overloaded the error is UNAVAILABLE so the caller pauses (resumable) instead of failing.
async function chat(opts) {
  const chain = [opts.model || MODEL(), ...(opts.fallbacks || FALLBACKS())].filter((x, i, a) => a.indexOf(x) === i);
  let last;
  for (const model of chain) {
    try { return await chatOne({ ...opts, model }); }
    catch (e) { if (e.status !== 503) throw e; last = e; }
  }
  throw new AutoError("UNAVAILABLE", `every free Gemini model tried is overloaded (${chain.join(", ")}): ${last && last.message}`, { status: 503 });
}

async function chatOne({ system, messages, schema, maxTokens = 16384, model, key, fetchImpl, sleepMs = sleep, maxRetries = 4, maxWaitMs = 90000 }) {
  const m = model;
  if (!FREE_TIER_MODELS.includes(m)) throw new AutoError("NOT_FREE", `Gemini model "${m}" is not on the free-tier allowlist (${FREE_TIER_MODELS.join(", ")}): refusing to call a possibly paid model`);
  const k = key || apiKey();
  if (!k) throw new AutoError("NO_KEY", "GEMINI_API_KEY is not set (env or .env)");
  const text = (c) => (Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n\n") : String(c));
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages.map((x) => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: text(x.content) + (schema && x === messages[messages.length - 1] ? `\n\nReturn ONLY one JSON object conforming to this JSON Schema (no prose, no code fences):\n${JSON.stringify(schema)}` : "") }] })),
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, ...(schema ? { responseMimeType: "application/json" } : {}) },
  };
  const doFetch = fetchImpl || fetch;
  for (let attempt = 0; ; attempt += 1) {
    const res = await doFetch(URL_BASE + encodeURIComponent(m) + ":generateContent", { method: "POST", headers: { "x-goog-api-key": k, "content-type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await res.json(); } catch (e) { /* no body */ }
    if (res.ok) {
      const cand = ((j && j.candidates) || [])[0] || {};
      const finish = cand.finishReason || null;
      if (finish === "MAX_TOKENS") throw new AutoError("MAX_TOKENS", "Gemini response hit maxOutputTokens: output would be truncated");
      if (finish && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(finish)) throw new AutoError("REFUSAL", `Gemini stopped with finishReason ${finish}`);
      const out = ((cand.content && cand.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
      const u = (j && j.usageMetadata) || {};
      return { text: out, model: (j && j.modelVersion) || m, usage: { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0, reasoning_tokens: u.thoughtsTokenCount || 0, total_tokens: u.totalTokenCount || 0 }, raw: j };
    }
    const msg = j && j.error ? String(j.error.message || "").slice(0, 300) : "";
    if (res.status === 429 && isDailyQuota(j)) throw new AutoError("QUOTA", `Gemini free-tier daily quota exhausted for ${m}: ${msg}`, { status: 429 });
    const retryable = res.status === 429 || res.status >= 500;
    const wait = retryDelayMs(j) || (res.status === 503 ? 5000 : 4000) * 2 ** attempt;
    if (!retryable || attempt >= maxRetries || wait > maxWaitMs) throw new AutoError(res.status === 429 ? "RATE_LIMIT" : "HTTP", `Gemini request failed: HTTP ${res.status}${msg ? " (" + msg + ")" : ""}`, { status: res.status });
    await sleepMs(wait);
  }
}

module.exports = { chat, apiKey, MODEL, FALLBACKS, FREE_TIER_MODELS, PAID_EQUIVALENT, retryDelayMs };
