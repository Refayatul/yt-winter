"use strict";
// Thin, testable Claude boundary for the autonomous ProfitDecoded stages.
// * Model: claude-opus-5-5 (override with PD_AUTO_MODEL), adaptive thinking, streaming.
// * pause_turn (long server-tool turns) is resumed explicitly; refusal and max_tokens are errors.
// * Server-side refusal fallbacks are off unless PD_AUTO_FALLBACKS=1, and never used under a budget.
// * Every paid call is reserved at its maximum cost in the persistent budget ledger (../budget.js) before it is sent;
//   without a ledger a paid call is refused. PD_AUTO_MAX_USD remains an in-run guard.
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
  if (options.provider === "gemini") {
    const k = options.apiKey || envKey("GEMINI_API_KEY");
    if (!k) throw new AutoError("NO_KEY", "GEMINI_API_KEY is not set (env or .env)");
    return { provider: "gemini", key: k, model: options.model || process.env.PD_GEMINI_MODEL || undefined };
  }
  if ((options.provider || provider()) === "groq") {
    const gk = options.apiKey || envKey("GROQ_API_KEY");
    if (!gk) throw new AutoError("NO_KEY", "GROQ_API_KEY is not set (env or .env): the autonomous research/script stages cannot run");
    return { provider: "groq", key: gk, pace: options.pace !== false };
  }
  const key = options.apiKey || apiKey();
  if (!key) throw new AutoError("NO_KEY", "ANTHROPIC_API_KEY is not set (env or .env): the autonomous research/script stages cannot run");
  const Anthropic = require("@anthropic-ai/sdk");
  // maxRetries 0: the SDK must not resend a paid request on its own; every attempt is reserved in the budget first.
  return new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 0 });
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
function recordStage(ledger, stage, usage, usd, meta = {}) {
  if (!stage) return;
  ledger.stages = ledger.stages || {};
  const st = ledger.stages[stage] || { calls: 0, usd: 0, usage: {}, reasoningTokens: 0, providers: [], models: [] };
  st.calls += 1; st.usd = Math.round((st.usd + usd) * 1000) / 1000; st.usage = addUsage(st.usage, usage);
  st.reasoningTokens = (st.reasoningTokens || 0) + (meta.reasoningTokens || 0);
  for (const [k, v] of [["providers", meta.provider], ["models", meta.model]]) if (v && !(st[k] || []).includes(v)) st[k] = [...(st[k] || []), v];
  if (meta.rate) st.lastRate = meta.rate;
  ledger.stages[stage] = st;
}

// Groq free tier counts prompt + max_completion_tokens against tokens-per-minute (8,000 for gpt-oss-120b on the
// free plan). Requests are paced inside a rolling 60-second window per client; a single request larger than the
// limit is refused up front with a clear error instead of a 413/429 loop.
const estTokens = (system, messages) => Math.ceil((String(system || "").length + JSON.stringify(flatten(messages || [])).length) / 3.5);
async function paceTokens(client, requested, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const limit = client.tpm || Number(process.env.PD_GROQ_TPM || 8000);
  if (requested > limit) throw new AutoError("REQUEST_TOO_LARGE", `request needs ~${requested} tokens (prompt + max output) but the tokens-per-minute limit is ${limit}: split the stage`);
  client.window = client.window || [];
  for (;;) {
    const t = now(); client.window = client.window.filter((x) => t - x.t < 60000);
    const used = client.window.reduce((s2, x) => s2 + x.tokens, 0);
    if (used + requested <= limit) { client.window.push({ t, tokens: requested }); return { waitedMs: 0 }; }
    const wait = 60000 - (t - client.window[0].t) + 250;
    client.waitedMs = (client.waitedMs || 0) + wait;
    await sleep(wait);
  }
}
// Groq takes plain-string message content; Anthropic-style text blocks (with cache_control) are flattened.
const flatten = (messages) => messages.map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n") } : m));

// Groq path: same contract as run(), no server tools here (research is orchestrated in research-agent).
async function runGroq(opts) {
  const { client, system, messages, schema, ledger = newLedger(), maxTokens = 8000, effort = "high" } = opts;
  if (ledger.tokens >= ledger.maxTokens) throw new AutoError("BUDGET", `token guard: ${ledger.tokens} >= PD_AUTO_MAX_TOKENS ${ledger.maxTokens}`);
  const G = require("./groq");
  const maxOut = Math.min(maxTokens, 30000);
  if (client.pace) await paceTokens(client, estTokens(system, messages) + maxOut, client.now, client.sleep);
  const r = await G.chat({ system, messages: flatten(messages), schema, tools: opts.tools, model: opts.light ? G.LIGHT_MODEL() : undefined, maxTokens: maxOut, effort: effort === "max" || effort === "xhigh" ? "high" : effort, key: client.key, fetchImpl: client.fetch, sleepMs: client.sleep });
  if (r.rate && r.rate.limitTokens) client.tpm = r.rate.limitTokens; // the org's real TPM, as reported by Groq
  ledger.calls += 1; ledger.tokens += (r.usage && r.usage.total_tokens) || 0; ledger.usage = addUsage(ledger.usage, { input_tokens: r.usage && r.usage.prompt_tokens, output_tokens: r.usage && r.usage.completion_tokens });
  const reasoning = (r.usage && r.usage.completion_tokens_details && r.usage.completion_tokens_details.reasoning_tokens) || 0;
  recordStage(ledger, opts.stage, { input_tokens: r.usage && r.usage.prompt_tokens, output_tokens: r.usage && r.usage.completion_tokens }, 0, { provider: "groq", model: r.model, reasoningTokens: reasoning, rate: r.rate });
  let json = null;
  if (schema) { json = G.extractJson(r.text); if (!json) throw new AutoError("BAD_JSON", "structured output was not valid JSON"); }
  return { text: r.text, json, blocks: [], ledger, raw: r.raw };
}

// Gemini path (free-tier models only, see gemini.js): used for the independent editorial critique.
async function runGemini(opts) {
  const { client, system, messages, schema, ledger = newLedger(), maxTokens = 16384 } = opts;
  if (ledger.tokens >= ledger.maxTokens) throw new AutoError("BUDGET", `token guard: ${ledger.tokens} >= PD_AUTO_MAX_TOKENS ${ledger.maxTokens}`);
  const Gm = require("./gemini");
  const r = await Gm.chat({ system, messages, schema, maxTokens, model: client.model, key: client.key, fetchImpl: client.fetch, sleepMs: client.sleep });
  ledger.calls += 1; ledger.tokens += r.usage.total_tokens || 0;
  ledger.usage = addUsage(ledger.usage, { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens + r.usage.reasoning_tokens });
  recordStage(ledger, opts.stage, { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens }, 0, { provider: "gemini", model: r.model, reasoningTokens: r.usage.reasoning_tokens });
  let json = null;
  if (schema) { json = require("./groq").extractJson(r.text); if (!json) throw new AutoError("BAD_JSON", "structured output was not valid JSON"); }
  return { text: r.text, json, blocks: [], ledger, raw: r.raw };
}

// Maximum possible cost of one paid request, computed BEFORE it is sent: every input token priced as a cache write
// (the most expensive input rate), the whole max_tokens budget as output (adaptive thinking is billed as output and
// counts against max_tokens), and every allowed web search. Character count is converted with a deliberately low
// chars-per-token ratio so the estimate errs high.
function estimateMaxUsd(params, policy = {}) {
  const est = policy.estimator || {};
  const p = priceFor(params.model);
  const chars = JSON.stringify({ s: params.system, m: params.messages, t: params.tools || [], o: params.output_config || {} }).length;
  const inTok = Math.ceil(chars / (est.charsPerToken || 2.8));
  const inRate = p.input * (est.inputPricedAsCacheWrite === false ? 1 : PRICE.cacheWriteMultiplier);
  const searches = (params.tools || []).filter((t) => /web_search/.test(t.type || t.name || "")).reduce((n, t) => n + (t.max_uses || est.webSearchesIfUnspecified || 10), 0);
  return Math.round((inTok / 1e6 * inRate + params.max_tokens / 1e6 * p.output + searches / 1000 * PRICE.webSearchPer1k) * 1e6) / 1e6;
}
// Did the provider definitely NOT bill this failed request? Rejections before processing (4xx except 408, and 529
// overloaded) did not; anything else (timeouts, dropped streams, other 5xx) may have, so it stays charged.
const definitelyUnbilled = (e) => { const s = e && (e.status || (e.error && e.error.status)); return (s >= 400 && s < 500 && s !== 408) || s === 529; };

async function run(opts) {
  if (opts.client && opts.client.provider === "groq") return runGroq(opts);
  if (opts.client && opts.client.provider === "gemini") return runGemini(opts);
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
    // Server-side refusal fallbacks may answer with another model: opt-in only (PD_AUTO_FALLBACKS=1), never under a budget.
    const budget = ledger.budget;
    if (!budget && !process.env.NODE_TEST_CONTEXT) throw new AutoError("PAID_DISABLED", "paid call without the persistent budget ledger: refused (fail closed)");
    const useFallback = !budget && process.env.PD_AUTO_FALLBACKS === "1";
    let reservation = null;
    if (budget) {
      const estimateUsd = estimateMaxUsd(params, budget.policy);
      reservation = await budget.reserve({ id: budget.idFor([budget.context.scriptId, opts.stage || "call", params]), stage: opts.stage || null, category: opts.category || (opts.stage === "research" ? "research" : ["critique", "evaluate"].includes(opts.stage) ? "review" : "script"), provider: "anthropic", model, estimateUsd });
    }
    let msg;
    try {
      const stream = useFallback
        ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : client.messages.stream(params);
      msg = await stream.finalMessage();
    } catch (e) {
      if (reservation) await (definitelyUnbilled(e) ? budget.release(reservation.id, `provider rejected the request (HTTP ${e.status})`) : budget.markUncertain(reservation.id, `outcome unknown: ${String(e.message || e).slice(0, 160)}`));
      throw e;
    }
    const cost = spend(msg.usage, msg.model || model);
    if (reservation) {
      try { await budget.settle(reservation.id, cost, msg.usage); }
      catch (e) {
        // Paid for, but the ledger could not record it: the reservation stays counted at its maximum (never lost), the
        // output is handed back on the error so the stage cache keeps what was paid for, and the run stops.
        const text0 = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        let json0 = null; try { json0 = schema ? JSON.parse(text0) : null; } catch (x) { json0 = null; }
        throw new AutoError(e.code && /^STATE_|CONFLICT/.test(e.code) ? "STATE_UNCONFIRMED" : (e.code || "STATE_UNCONFIRMED"), `paid call succeeded but the budget ledger did not confirm settlement (reservation ${reservation.id} stays charged at its maximum): ${e.message}`, { paidResult: msg.stop_reason === "end_turn" && (!schema || json0) ? { text: text0, json: json0 } : null });
      }
    }
    ledger.calls += 1; ledger.usage = addUsage(ledger.usage, msg.usage); ledger.usd = Math.round((ledger.usd + cost) * 1000) / 1000;
    recordStage(ledger, opts.stage, msg.usage, cost, { provider: "anthropic", model: msg.model || model });
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

module.exports = { estimateMaxUsd, definitelyUnbilled, MODEL, PRICE, PRICES, priceFor, AutoError, apiKey, envKey, provider, createClient, run, runGroq, runGemini, spend, newLedger, recordStage, flatten, paceTokens, estTokens };
