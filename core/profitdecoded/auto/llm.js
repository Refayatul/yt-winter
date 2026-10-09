"use strict";
// Thin, testable Claude boundary for the autonomous ProfitDecoded stages.
// * Model: claude-opus-5-5 (override with PD_AUTO_MODEL), adaptive thinking, streaming.
// * pause_turn (long server-tool turns) is resumed explicitly; refusal and max_tokens are errors.
// * Server-side refusal fallbacks are on by default (PD_AUTO_FALLBACKS=0 disables).
// * A spend guard (PD_AUTO_MAX_USD, default 3) stops a run before it can run away.
// * The API key is read from ANTHROPIC_API_KEY (env or .env) and never logged.

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../config");

const MODEL = () => process.env.PD_AUTO_MODEL || "claude-opus-5-5";

function envKey(name) {
  if (process.env[name] && process.env[name].trim()) return process.env[name].trim();
  if (process.env.NODE_TEST_CONTEXT) return "";
  try { for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) { const m = line.match(new RegExp("^" + name + "=(.*)$")); if (m && m[1].trim()) return m[1].trim(); } } catch (e) { /* optional */ }
  return "";
}
// PD_AUTO_PROVIDER = anthropic | groq. Unset: Anthropic when its key exists, otherwise Groq (free tier).
function provider() {
  const p = (process.env.PD_AUTO_PROVIDER || "").toLowerCase();
  if (p === "anthropic" || p === "groq") return p;
  return envKey("ANTHROPIC_API_KEY") ? "anthropic" : envKey("GROQ_API_KEY") ? "groq" : "anthropic";
}
// Documented list prices (USD per 1M tokens). Cache writes (5-minute TTL) cost 1.25x input; cache reads are listed.
// An unknown model id is priced as claude-opus-5-5 (stated, never silently cheaper).
const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const PRICE = { ...PRICES["claude-opus-5-5"], cacheWriteMultiplier: 1.25, webSearchPer1k: 10 };
const priceFor = (model) => PRICES[model] || PRICES["claude-opus-5-5"];

class AutoError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = "AutoError"; this.code = code; Object.assign(this, extra); }
}

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  if (process.env.NODE_TEST_CONTEXT) return "";
  try { for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) { const m = line.match(/^ANTHROPIC_API_KEY=(.*)$/); if (m && m[1].trim()) return m[1].trim(); } } catch (e) { /* optional */ }
  return "";
}

function createClient(options = {}) {
  if ((options.provider || provider()) === "groq") {
    const gk = options.apiKey || envKey("GROQ_API_KEY");
    if (!gk) throw new AutoError("NO_KEY", "GROQ_API_KEY is not set (env or .env): the autonomous research/script stages cannot run");
    return { provider: "groq", key: gk };
  }
  const key = options.apiKey || apiKey();
  if (!key) throw new AutoError("NO_KEY", "ANTHROPIC_API_KEY is not set (env or .env): the autonomous research/script stages cannot run");
  const Anthropic = require("@anthropic-ai/sdk");
  return new (Anthropic.default || Anthropic)({ apiKey: key });
}

// usage.input_tokens excludes cached tokens: cache writes and reads are billed separately.
function spend(usage, model) {
  const u = usage || {}; const p = priceFor(model || MODEL());
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * PRICE.cacheWriteMultiplier;
  const usd = input / 1e6 * p.input + (u.output_tokens || 0) / 1e6 * p.output + (u.cache_read_input_tokens || 0) / 1e6 * p.cacheRead
    + ((u.server_tool_use && u.server_tool_use.web_search_requests) || 0) / 1000 * PRICE.webSearchPer1k;
  return Math.round(usd * 1000) / 1000;
}
const addUsage = (a, b) => { const o = { ...a }; for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) o[k] = (o[k] || 0) + ((b && b[k]) || 0); const s = (b && b.server_tool_use && b.server_tool_use.web_search_requests) || 0; o.server_tool_use = { web_search_requests: ((a.server_tool_use || {}).web_search_requests || 0) + s }; return o; };

// ledger is shared across calls in one run: { usd, usage, calls }
// stages: per-stage usage so a run reports what each step cost ({ plan: { calls, usd, usage }, ... }).
function newLedger(maxUsd) { return { maxUsd: maxUsd == null ? Number(process.env.PD_AUTO_MAX_USD || 3) : maxUsd, maxTokens: Number(process.env.PD_AUTO_MAX_TOKENS || 400000), tokens: 0, usd: 0, usage: {}, calls: 0, stages: {} }; }
function recordStage(ledger, stage, usage, usd) {
  if (!stage) return;
  ledger.stages = ledger.stages || {};
  const st = ledger.stages[stage] || { calls: 0, usd: 0, usage: {} };
  st.calls += 1; st.usd = Math.round((st.usd + usd) * 1000) / 1000; st.usage = addUsage(st.usage, usage);
  ledger.stages[stage] = st;
}
// Groq takes plain-string message content; Anthropic-style text blocks (with cache_control) are flattened.
const flatten = (messages) => messages.map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n") } : m));

// Groq path: same contract as run(), no server tools here (research is orchestrated in research-agent).
async function runGroq(opts) {
  const { client, system, messages, schema, ledger = newLedger(), maxTokens = 8000, effort = "high" } = opts;
  if (ledger.tokens >= ledger.maxTokens) throw new AutoError("BUDGET", `token guard: ${ledger.tokens} >= PD_AUTO_MAX_TOKENS ${ledger.maxTokens}`);
  const G = require("./groq");
  const r = await G.chat({ system, messages: flatten(messages), schema, tools: opts.tools, model: opts.light ? G.LIGHT_MODEL() : undefined, maxTokens: Math.min(maxTokens, 30000), effort: effort === "max" || effort === "xhigh" ? "high" : effort, key: client.key, fetchImpl: client.fetch, sleepMs: client.sleep });
  ledger.calls += 1; ledger.tokens += (r.usage && r.usage.total_tokens) || 0; ledger.usage = addUsage(ledger.usage, { input_tokens: r.usage && r.usage.prompt_tokens, output_tokens: r.usage && r.usage.completion_tokens });
  recordStage(ledger, opts.stage, { input_tokens: r.usage && r.usage.prompt_tokens, output_tokens: r.usage && r.usage.completion_tokens }, 0);
  let json = null;
  if (schema) { json = G.extractJson(r.text); if (!json) throw new AutoError("BAD_JSON", "structured output was not valid JSON"); }
  return { text: r.text, json, blocks: [], ledger, raw: r.raw };
}

async function run(opts) {
  if (opts.client && opts.client.provider === "groq") return runGroq(opts);
  const { client, system, messages, tools, schema, ledger = newLedger(), maxTokens = 32000, effort = "high", maxPauses = 6 } = opts;
  const convo = [...messages]; const blocks = []; let lastStop = null;
  for (let i = 0; i <= maxPauses; i += 1) {
    if (ledger.usd >= ledger.maxUsd) throw new AutoError("BUDGET", `spend guard: estimated $${ledger.usd.toFixed(2)} >= PD_AUTO_MAX_USD $${ledger.maxUsd}`);
    // Prompt caching: top-level automatic caching marks the last cacheable block; callers may also put
    // cache_control on a stable prefix block (the dossier) so several stages share one cached prefix.
    const model = opts.model || MODEL();
    const params = {
      model, max_tokens: maxTokens, thinking: { type: "adaptive" }, system, messages: convo,
      ...(opts.cache === false ? {} : { cache_control: { type: "ephemeral" } }),
      output_config: { effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
      ...(tools && tools.length ? { tools } : {}),
    };
    const useFallback = process.env.PD_AUTO_FALLBACKS !== "0";
    const stream = useFallback
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params);
    const msg = await stream.finalMessage();
    const cost = spend(msg.usage, model);
    ledger.calls += 1; ledger.usage = addUsage(ledger.usage, msg.usage); ledger.usd = Math.round((ledger.usd + cost) * 1000) / 1000;
    recordStage(ledger, opts.stage, msg.usage, cost);
    blocks.push(...(msg.content || [])); lastStop = msg.stop_reason;
    if (msg.stop_reason === "refusal") throw new AutoError("REFUSAL", "model declined the request (stop_reason=refusal)", { details: msg.stop_details || null });
    if (msg.stop_reason === "max_tokens") throw new AutoError("MAX_TOKENS", "response hit max_tokens: output would be truncated");
    if (msg.stop_reason === "pause_turn") { convo.push({ role: "assistant", content: msg.content }); continue; }
    break;
  }
  if (lastStop === "pause_turn") throw new AutoError("PAUSED", "server-tool turn still paused after the resume limit");
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  let json = null;
  if (schema) { try { json = JSON.parse(text); } catch (e) { throw new AutoError("BAD_JSON", "structured output was not valid JSON"); } }
  return { text, json, blocks, ledger };
}

module.exports = { MODEL, PRICE, PRICES, priceFor, AutoError, apiKey, envKey, provider, createClient, run, runGroq, spend, newLedger, recordStage, flatten };
