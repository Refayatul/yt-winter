"use strict";

// Budget-guarded Claude client for the per-channel LLM tasks (config/llm-routing.json).
// Fail-closed rules, in the order they are checked:
// * Dry-run is the default. A real request needs `run: true` from the caller AND the channel's
//   llm-budget.json with paidEnabled=true AND a single-use paidApproval (core/profitdecoded/budget.js).
// * The key is only <PREFIX>_ANTHROPIC_API_KEY of the calling channel, read from the environment; it
//   is never logged, never written to a file and never taken from another channel.
// * Every request is reserved at its maximum possible cost (all input priced as a cache write, the
//   whole max_tokens as output) before it is sent, and settled with the reported usage afterwards.
//   Per-video, per-day and per-month limits are checked against the ledger at reservation time.
// * Input is capped by the routing table (estimated from characters, deliberately high) and output by
//   max_tokens. stop_reason refusal or max_tokens is an error, never a silently truncated result.
// * No fallback model. Retries are bounded (policy.maxRetries) and only for 429 and 529, which the
//   provider did not bill; every retry is a new reservation and counts against maxCallsPerRun.

const fs = require("fs");
const path = require("path");
const Router = require("./router");
const Budget = require("../profitdecoded/budget");

class LlmError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = "LlmError"; this.code = code; Object.assign(this, extra); }
}

const CACHE_WRITE_MULTIPLIER = 1.25;
const BATCH_DISCOUNT = 0.5;
const CHARS_PER_TOKEN = 2.8; // deliberately low: estimates err high

const policyFile = (channel) => path.join(channel.paths.base, "llm-budget.json");

function loadPolicy(channel, file = policyFile(channel)) {
  if (!fs.existsSync(file)) throw new LlmError("NO_POLICY", `${channel.slug}: ${path.relative(channel.paths.base, file)} not found: paid LLM calls are disabled`);
  const policy = Budget.loadPolicy(file);
  for (const key of ["dailyUsd", "maxRetries", "maxCallsPerRun"]) {
    if (typeof policy[key] !== "number" || !(policy[key] >= 0)) throw new LlmError("BAD_POLICY", `${channel.slug}: llm-budget.json ${key} must be a non-negative number`);
  }
  return policy;
}

// Ledger: a local file for local runs (LLM_BUDGET_STORE=file), otherwise one file per channel on the
// llm-budget-ledger branch through the GitHub Contents API (compare-and-swap; survives Actions runs).
function storeFor(channel, policy, env = process.env, fetchImpl) {
  const kind = env.LLM_BUDGET_STORE || (policy.ledger && policy.ledger.store) || "github";
  if (kind === "file") {
    if (env.GITHUB_ACTIONS === "true") throw new LlmError("NO_STORE", "a runner-local ledger cannot enforce daily or monthly limits in GitHub Actions");
    return new Budget.FileStore(path.join(channel.paths.state, "llm-ledger.local.json"), { create: true });
  }
  const L = policy.ledger || {};
  return new Budget.GitHubStore({ repo: L.repo || env.GITHUB_REPOSITORY, branch: L.branch, file: `${channel.slug}.json`, token: env.LLM_BUDGET_TOKEN || env.GITHUB_TOKEN, fetchImpl });
}

const estimateTokens = (value) => Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN);

// Maximum cost of one request before it is sent (batch requests are reserved at full price too).
function maxCostUsd(params, price) {
  const input = estimateTokens({ s: params.system, m: params.messages, o: params.output_config || {} });
  return round(input / 1e6 * price.input * CACHE_WRITE_MULTIPLIER + params.max_tokens / 1e6 * price.output);
}

// Actual cost from reported usage. usage.input_tokens excludes cached tokens.
function costUsd(usage, price, options = {}) {
  const u = usage || {};
  const usd = (u.input_tokens || 0) / 1e6 * price.input
    + (u.cache_creation_input_tokens || 0) / 1e6 * price.input * CACHE_WRITE_MULTIPLIER
    + (u.cache_read_input_tokens || 0) / 1e6 * price.cacheRead
    + (u.output_tokens || 0) / 1e6 * price.output;
  return round(options.batch ? usd * BATCH_DISCOUNT : usd);
}

const round = (x) => Math.round(x * 1e6) / 1e6;

// The request body for one task. The stable part of the prompt (channel rules, schema notes) is the
// system block with cache_control, so repeated Shorts of one channel share a cached prefix.
function buildParams(route, { system, user, schema, thinking }) {
  return {
    model: route.model,
    max_tokens: route.maxOutputTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    thinking: thinking === "adaptive" ? { type: "adaptive" } : { type: "disabled" },
    output_config: { effort: route.effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
  };
}

// One Message Batches request entry (50% price, results within 24 h) for non-urgent work.
const batchRequest = (customId, params) => ({ custom_id: String(customId).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64), params });

const definitelyUnbilled = (error) => { const s = error && error.status; return (s >= 400 && s < 500 && s !== 408) || s === 529; };
const retryable = (error) => error && (error.status === 429 || error.status === 529);

// What may be written to a log: usage, cost and identifiers. Never the key, never request headers.
function logRecord(fields) {
  const { task, model, channel, videoId, escalated, overridden, estimateUsd, actualUsd, usage, stopReason, outcome, attempt, dryRun } = fields;
  return { at: new Date().toISOString(), channel, task, model, videoId: videoId || null, escalated: !!escalated, overridden: !!overridden, dryRun: !!dryRun, attempt: attempt || 0, estimateUsd, actualUsd: actualUsd == null ? null : actualUsd, usage: usage ? { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cache_creation_input_tokens: usage.cache_creation_input_tokens || 0, cache_read_input_tokens: usage.cache_read_input_tokens || 0 } : null, stopReason: stopReason || null, outcome };
}

function appendLog(file, record) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + "\n");
}

// createClient(channel, { run, env, sdk, store, policy, logFile, now }) -> { call, plan }
// `sdk` and `store` are injectable for tests; production builds them from the channel.
function createClient(channel, options = {}) {
  const env = options.env || process.env;
  const routing = options.routing || Router.loadRouting();
  const state = { calls: 0, records: [] };

  // Build the request and its worst-case cost without sending anything.
  function plan(task, prompt, extra = {}) {
    const route = Router.resolve(task, channel, { env, routing, escalate: extra.escalate });
    const params = buildParams(route, { ...prompt, thinking: prompt.thinking || (routing.tasks[task] || {}).thinking });
    const inputTokens = estimateTokens({ s: params.system, m: params.messages, o: params.output_config });
    if (inputTokens > route.maxInputTokens) throw new LlmError("REQUEST_TOO_LARGE", `${task}: ~${inputTokens} input tokens exceeds the per-request cap ${route.maxInputTokens}`);
    return { route, params, inputTokensEstimate: inputTokens, maxUsd: maxCostUsd(params, route.price) };
  }

  async function call(task, prompt, extra = {}) {
    const planned = plan(task, prompt, extra);
    const { route, params } = planned;
    const base = { task, model: route.model, channel: channel.slug, videoId: extra.videoId, escalated: route.escalated, overridden: route.overridden, estimateUsd: planned.maxUsd };
    if (!options.run) {
      const record = logRecord({ ...base, dryRun: true, outcome: "dry-run: not sent" });
      state.records.push(record); appendLog(options.logFile, record);
      return { dryRun: true, ...planned, record };
    }
    const policy = options.policy || loadPolicy(channel);
    if (!policy.paidEnabled) throw new LlmError("PAID_DISABLED", `${channel.slug}: paid LLM calls are disabled (llm-budget.json paidEnabled=false)`);
    if (state.calls >= policy.maxCallsPerRun) throw new LlmError("CALL_LIMIT", `${channel.slug}: ${state.calls} calls already made in this run (maxCallsPerRun ${policy.maxCallsPerRun})`);
    const key = String(env[route.keyName] || "").trim();
    if (!key) throw new LlmError("NO_KEY", `${route.keyName} is not set: ${channel.slug} has no Anthropic key of its own (other channels' keys are never used)`);
    const budget = new Budget.Budget({
      store: options.store || storeFor(channel, policy, env), policy, now: options.now,
      context: { pool: extra.pool || "experiment", scriptId: `${extra.videoId || task}:${extra.format || "short"}:${extra.version || "v1"}`, topicId: extra.videoId || null, videoId: extra.videoId || null, runId: env.GITHUB_RUN_ID || null },
    });
    const sdk = options.sdk || (() => { const Anthropic = require("@anthropic-ai/sdk"); return new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 0 }); })();
    const maxAttempts = 1 + policy.maxRetries;
    for (let attempt = 1; ; attempt += 1) {
      state.calls += 1;
      const reservation = await budget.reserve({ id: budget.idFor([channel.slug, task, extra.videoId || null, params]), stage: task, category: route.category, provider: "anthropic", model: route.model, estimateUsd: planned.maxUsd });
      let message;
      try {
        message = await sdk.messages.create(params);
      } catch (error) {
        const unbilled = definitelyUnbilled(error);
        await (unbilled ? budget.release(reservation.id, `provider rejected the request (HTTP ${error.status})`) : budget.markUncertain(reservation.id, `outcome unknown: ${String(error.message || error).slice(0, 160)}`));
        const record = logRecord({ ...base, attempt, outcome: `error ${error.status || "network"}` });
        state.records.push(record); appendLog(options.logFile, record);
        if (unbilled && retryable(error) && attempt < maxAttempts && state.calls < policy.maxCallsPerRun) continue;
        throw new LlmError("REQUEST_FAILED", `${task}: request failed (HTTP ${error.status || "network"})`, { status: error.status || null });
      }
      const actualUsd = costUsd(message.usage, route.price);
      await budget.settle(reservation.id, actualUsd, message.usage);
      const record = logRecord({ ...base, attempt, actualUsd, usage: message.usage, stopReason: message.stop_reason, outcome: message.stop_reason === "end_turn" ? "ok" : message.stop_reason });
      state.records.push(record); appendLog(options.logFile, record);
      if (message.model && message.model !== route.model) throw new LlmError("MODEL_MISMATCH", `${task}: asked for ${route.model}, the response came from ${message.model}`);
      if (message.stop_reason === "refusal") throw new LlmError("REFUSAL", `${task}: the model declined the request`, { record });
      if (message.stop_reason === "max_tokens") throw new LlmError("MAX_TOKENS", `${task}: the response hit max_tokens ${params.max_tokens} and would be truncated`, { record });
      const text = (message.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
      let json = null;
      if (prompt.schema) { try { json = JSON.parse(text); } catch (error) { throw new LlmError("BAD_JSON", `${task}: structured output was not valid JSON`, { record }); } }
      return { dryRun: false, text, json, usage: message.usage, actualUsd, record, route };
    }
  }

  return { call, plan, records: state.records };
}

module.exports = { LlmError, createClient, loadPolicy, storeFor, buildParams, batchRequest, maxCostUsd, costUsd, estimateTokens, logRecord, definitelyUnbilled, BATCH_DISCOUNT, CACHE_WRITE_MULTIPLIER };
