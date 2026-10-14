"use strict";

// One provider boundary for long-form writing. Providers return the same JSON
// contract; fallback is used only when LONGFORM_LLM_FALLBACK_PROVIDER explicitly
// names it. Events contain provider/model/status metadata and never credentials
// or raw response bodies.

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../channel-context");

class LongformProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "LongformProviderError";
    this.code = code;
    this.provider = options.provider || null;
    this.status = options.status || null;
    this.retryable = !!options.retryable;
    this.defer = !!options.defer;
    this.retryAfterMs = options.retryAfterMs || null;
    this.stage = options.stage || null;
    // Diagnostics (sanitized; never the key, the prompt or request headers).
    this.retryClass = this.defer ? "defer" : this.retryable ? "retry" : "fail";
    this.providerCode = options.providerCode || null;
    this.providerMessage = options.providerMessage || null;
    this.requestBytes = options.requestBytes ?? null;
    this.estimatedTokens = options.estimatedTokens ?? null;
    // Response diagnostics: why the reply ended, what it cost, and how its JSON failed. Never the
    // reply itself.
    this.finishReason = options.finishReason || null;
    this.promptTokens = options.promptTokens ?? null;
    this.completionTokens = options.completionTokens ?? null;
    this.totalTokens = options.totalTokens ?? null;
    this.reasoningTokens = options.reasoningTokens ?? null;
    this.contentChars = options.contentChars ?? null;
    this.jsonCategory = options.jsonCategory || null;
    this.jsonPosition = options.jsonPosition ?? null;
    // Rate limit: which limit a 429 hit (TPM, RPM, TPD, RPD), its figures, and the provider's
    // rate-limit headers.
    this.limitKind = options.limitKind || null;
    this.limit = options.limit ?? null;
    this.used = options.used ?? null;
    this.requested = options.requested ?? null;
    this.rate = options.rate || null;
    // Token budget (withRetry with input.budget) and the attempt that failed.
    this.budgetSpent = options.budgetSpent ?? null;
    this.budgetLimit = options.budgetLimit ?? null;
    this.requestTokens = options.requestTokens ?? null;
    this.attempt = options.attempt ?? null;
    this.attempts = options.attempts ?? null;
  }
}

// Provider error text can quote what was sent and name the account. Keep it short and strip
// anything key-like and every account, project or request identifier: CI logs are public. Groq's
// 429 text names the organization ("... in organization `org_…` service tier ..."; run
// 38516520859, 2026-10-14).
function sanitizeDetail(value, limit = 240) {
  return String(value == null ? "" : value)
    .replace(/\b(?:gsk|sk|sk-ant|xai|key)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(organi[sz]ation|project|workspace|account|team)((?:[\s_-]*id)?\s*[:=]?\s*)(?:[`'"][^`'"\s]{2,}[`'"]|(?=[A-Za-z0-9_.:-]*\d)[A-Za-z0-9_.:-]{4,})/gi, "$1$2[redacted]")
    .replace(/\b(?:org|proj|prj|req|request|user|usr|acct|account|sess|session|team|ws|workspace|tenant)[-_][A-Za-z0-9]{6,}\b/gi, "[redacted-id]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[redacted-id]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .trim()
    .slice(0, limit);
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function usageText(item) {
  const reasoning = item.reasoningTokens != null ? ` (reasoning ${item.reasoningTokens})` : "";
  return `tokens ${item.promptTokens ?? "?"}+${item.completionTokens ?? "?"}=${item.totalTokens}${reasoning}`;
}

function limitText(item) {
  const figures = [item.limit != null && `limit ${item.limit}`, item.used != null && `used ${item.used}`, item.requested != null && `requested ${item.requested}`].filter(Boolean).join(" ");
  return `${item.limitKind}${figures ? " " + figures : ""}`;
}

function rateText(rate) {
  if (!rate || rate.remainingTokens == null) return null;
  return `TPM left ${rate.remainingTokens}${rate.limitTokens != null ? "/" + rate.limitTokens : ""}${rate.resetTokensMs != null ? ` reset ${seconds(rate.resetTokensMs)}` : ""}`;
}

// The diagnostic parts shared by errors and events, in a fixed order.
function diagnosticParts(item) {
  const parts = [];
  if (item.limitKind) parts.push(limitText(item));
  if (item.jsonCategory) parts.push(`json ${item.jsonCategory}${item.jsonPosition != null ? "@" + item.jsonPosition : ""}`);
  if (item.finishReason) parts.push(`finish ${item.finishReason}`);
  if (item.totalTokens != null) parts.push(usageText(item));
  if (item.contentChars != null) parts.push(`reply ${item.contentChars} chars`);
  const rate = rateText(item.rate);
  if (rate) parts.push(rate);
  if (item.budgetLimit != null) parts.push(`budget ${item.budgetSpent}/${item.budgetLimit}${item.requestTokens != null ? ` (next needs ≤${item.requestTokens})` : ""}`);
  return parts;
}

// One-line, log-safe summary of a provider failure.
function describeError(error) {
  if (!error) return "UNKNOWN";
  const parts = [error.code || "UNKNOWN"];
  if (error.status) parts.push(`HTTP ${error.status}`);
  if (error.providerCode) parts.push(`provider ${error.providerCode}`);
  parts.push(...diagnosticParts(error));
  if (error.estimatedTokens != null) parts.push(`~${error.estimatedTokens} input tokens (${error.requestBytes} bytes)`);
  if (error.stage) parts.push(`stage ${error.stage}`);
  if (error.attempt != null) parts.push(`attempt ${error.attempt}/${error.attempts}`);
  if (error.retryClass) parts.push(error.retryClass);
  return parts.join(" · ") + (error.providerMessage ? ` — ${error.providerMessage}` : "");
}

// One-line, log-safe summary of a withRetry event (null for events not worth a line). Events
// carry only codes, counts, sizes and timings, never the prompt or the reply.
function describeEvent(event) {
  if (!event || event.event === "request") return null;
  const head = event.attempt != null ? `attempt ${event.attempt}` : event.event;
  if (event.event === "success") return [`${head} ok`, ...diagnosticParts(event)].join(" · ");
  if (event.event === "failed" || event.event === "deferred") {
    return [`${head} ${event.code}${event.status ? " HTTP " + event.status : ""}${event.providerCode ? " " + event.providerCode : ""}`, ...diagnosticParts(event), event.retryClass].filter(Boolean).join(" · ");
  }
  if (event.event === "retry_scheduled") return `retry in ${seconds(event.delayMs)} after ${event.code}${event.jsonRecovery ? ` (JSON recovery${event.reasoningEffort ? ", reasoning effort " + event.reasoningEffort : ""}, temperature 0)` : ""}`;
  if (event.event === "paced") return `waiting ${seconds(event.delayMs)} before attempt ${event.attempt}: ${event.reason}`;
  return [event.event, event.code].filter(Boolean).join(" ");
}

function envValue(name) {
  if (Object.prototype.hasOwnProperty.call(process.env, name) && String(process.env[name]).trim()) return String(process.env[name]).trim();
  if (process.env.NODE_TEST_CONTEXT) return "";
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && match[1] === name) return match[2].trim();
    }
  } catch (error) { /* optional .env */ }
  return "";
}

function providerSpec(name) {
  if (name === "groq") return {
    name,
    model: envValue("GROQ_MODEL") || "openai/gpt-oss-120b",
    keyName: "GROQ_API_KEY",
    configured: !!envValue("GROQ_API_KEY"),
  };
  if (name === "anthropic") return {
    name,
    model: envValue("LONGFORM_MODEL") || envValue("ANTHROPIC_MODEL") || "claude-opus-5",
    keyName: "ANTHROPIC_API_KEY",
    configured: !!envValue("ANTHROPIC_API_KEY"),
  };
  return { name, model: null, keyName: null, configured: false };
}

function configuration() {
  let primaryName = envValue("LONGFORM_LLM_PROVIDER").toLowerCase();
  // Backward compatibility for the existing lane: it keeps working only when
  // explicitly enabled. A new installation selects Groq with the provider env.
  if (!primaryName && envValue("LONGFORM_LLM") === "1" && envValue("ANTHROPIC_API_KEY")) primaryName = "anthropic";
  const fallbackName = envValue("LONGFORM_LLM_FALLBACK_PROVIDER").toLowerCase();
  return {
    enabled: envValue("LONGFORM_LLM") !== "0" && !!primaryName,
    primary: providerSpec(primaryName),
    fallback: fallbackName && fallbackName !== primaryName ? providerSpec(fallbackName) : null,
  };
}

function available() {
  const config = configuration();
  return config.enabled && ["groq", "anthropic"].includes(config.primary.name) && config.primary.configured;
}

function retryAfterMs(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  const raw = headers.get("retry-after");
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.ceil(Number(raw) * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

// Groq durations: "7.66s", "2m59.56s", "14h12m", "250ms", or plain seconds.
function durationMs(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000);
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    total += Number(amount) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[unit];
  }
  return matched ? Math.ceil(total) : null;
}

// Groq's rate-limit headers come with every response. Per Groq's documentation the *-tokens
// headers describe the tokens-per-minute window and the *-requests headers the requests-per-day
// window; retry-after is sent only with a 429.
function rateLimitHeaders(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  const number = (name) => {
    const raw = headers.get(name);
    return raw != null && String(raw).trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
  };
  const rate = {
    limitTokens: number("x-ratelimit-limit-tokens"),
    remainingTokens: number("x-ratelimit-remaining-tokens"),
    resetTokensMs: durationMs(headers.get("x-ratelimit-reset-tokens")),
    limitRequests: number("x-ratelimit-limit-requests"),
    remainingRequests: number("x-ratelimit-remaining-requests"),
    resetRequestsMs: durationMs(headers.get("x-ratelimit-reset-requests")),
    retryAfterMs: retryAfterMs(headers),
  };
  return Object.values(rate).some((value) => value != null) ? rate : null;
}

// Which limit a 429 hit, read from Groq's text before it is sanitized ("... on tokens per minute
// (TPM): Limit 8000, Used 5174, Requested 5540. Please try again in 20.355s."). Only the kind and
// the figures are kept.
const DAILY_LIMITS = new Set(["TPD", "RPD", "ASD"]);
function rateLimitInfo(message) {
  const text = String(message || "");
  const figure = (label) => {
    const match = text.match(new RegExp(`\\b${label}\\s+(\\d+)`, "i"));
    return match ? Number(match[1]) : null;
  };
  const wait = text.match(/try again in\s+([0-9hms.]+)/i);
  return {
    limitKind: (text.match(/\((TPM|RPM|TPD|RPD|ASH|ASD)\)/) || [])[1] || null,
    limit: figure("Limit"),
    used: figure("Used"),
    requested: figure("Requested"),
    waitMs: wait ? durationMs(wait[1].replace(/\.+$/, "")) : null,
  };
}

function classifyHttp(provider, status, headers, stage, detail = {}) {
  // A daily limit cannot clear within a run: defer without retrying. Per-minute limits are retried
  // after the provider's own wait (Retry-After, else the wait named in its message).
  if (status === 429) {
    const daily = DAILY_LIMITS.has(detail.limitKind);
    return new LongformProviderError("RATE_LIMIT", `${provider} rate limit reached${detail.limitKind ? ` (${detail.limitKind})` : ""}; long-form generation deferred`, { provider, status, stage, retryable: !daily, defer: true, retryAfterMs: retryAfterMs(headers) || detail.waitMs || null, ...detail });
  }
  if (status === 401 || status === 403) return new LongformProviderError("AUTH", `${provider} authentication failed`, { provider, status, stage, ...detail });
  if (status === 408 || status === 409 || status === 425 || status >= 500) return new LongformProviderError("TRANSIENT", `${provider} temporarily unavailable (HTTP ${status})`, { provider, status, stage, retryable: true, defer: true, retryAfterMs: retryAfterMs(headers), ...detail });
  // The prompt itself is too big for the model's per-request/per-minute token limit: retrying the
  // same request cannot succeed, so it fails (the caller must send less).
  if (status === 413) return new LongformProviderError("REQUEST_TOO_LARGE", `${provider} request too large (HTTP 413)`, { provider, status, stage, ...detail });
  return new LongformProviderError("REQUEST", `${provider} request failed (HTTP ${status})`, { provider, status, stage, ...detail });
}

// Groq error bodies are { error: { message, type, code } }. Only the code and a sanitized,
// truncated message are kept (failed_generation and any echoed content are dropped).
async function groqErrorDetail(response) {
  let raw = "";
  try { raw = await response.text(); } catch (error) { return {}; }
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (error) { /* plain-text error */ }
  const error = parsed && parsed.error && typeof parsed.error === "object" ? parsed.error : null;
  const message = error ? error.message : parsed ? "" : raw;
  const limits = response.status === 429 ? rateLimitInfo(message) : {};
  return {
    providerCode: sanitizeDetail(error ? error.code || error.type || "" : "", 60) || null,
    providerMessage: sanitizeDetail(message) || null,
    ...Object.fromEntries(Object.entries(limits).filter(([, value]) => value != null)),
  };
}

async function groqHttpError(response, input, sent) {
  const detail = await groqErrorDetail(response);
  if (response.status === 429) noteRate("groq", null, detail);
  return classifyHttp("groq", response.status, response.headers, input.stage, { ...detail, ...sent.size, rate: rateLimitHeaders(response.headers) });
}

// Wraps fetch: measures the request (bytes, ~4 bytes per token) and enforces a timeout, so a
// stalled provider cannot hold a job until its workflow timeout.
function instrumentedFetch(fetchImpl, sent, timeoutMs) {
  return async (url, init = {}) => {
    const bytes = Buffer.byteLength(String(init.body || ""), "utf8");
    sent.size = { requestBytes: bytes, estimatedTokens: Math.ceil(bytes / 4) };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => { sent.timedOut = true; controller.abort(); }, timeoutMs) : null;
    try { return await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init); }
    finally { if (timer) clearTimeout(timer); }
  };
}

function requestTimeoutMs() {
  const configured = Number(envValue("LONGFORM_LLM_TIMEOUT_MS"));
  return Number.isFinite(configured) && configured >= 1000 ? configured : 120000;
}

// ---- Token-aware requests (opt-in: input.budget) -------------------------------------------
// Groq counts a request against its tokens-per-minute limit as prompt + max_completion_tokens
// ("Requested 5540" = ~2340 prompt + 3200 completion in run 38516520859). The latest rate-limit
// state per provider (the headers of the last response, or a 429's figures) is kept, so a request
// that cannot fit waits for the window instead of being sent to fail.
const PACE_MARGIN_MS = 1000;
const rateState = new Map();

function noteRate(provider, rate, info = {}, now = Date.now()) {
  const next = { ...(rateState.get(provider) || {}), at: now };
  if (rate) {
    if (rate.limitTokens != null) next.limitTokens = rate.limitTokens;
    if (rate.remainingTokens != null) { next.remainingTokens = rate.remainingTokens; next.resetTokensAt = now + (rate.resetTokensMs || 0); }
    if (rate.remainingRequests != null) { next.remainingRequests = rate.remainingRequests; next.resetRequestsAt = now + (rate.resetRequestsMs || 0); }
  }
  if (info.limitKind === "TPM" && info.limit != null) {
    next.limitTokens = info.limit;
    next.remainingTokens = Math.max(0, info.limit - (info.used || 0));
    next.resetTokensAt = now + (info.waitMs || 60000);
  }
  if (!rate && info.limitKind !== "TPM") return;
  rateState.set(provider, next);
}

// Without rate-limit headers, the last completion's size still says how long its tokens occupy
// the per-minute window.
function noteUsage(provider, totalTokens, now = Date.now()) {
  if (!(totalTokens > 0)) return;
  rateState.set(provider, { ...(rateState.get(provider) || {}), lastTokens: totalTokens, lastAt: now });
}

function resetRateState() { rateState.clear(); }

function tpmLimit(provider) {
  const known = rateState.get(provider);
  if (known && known.limitTokens) return known.limitTokens;
  const configured = Number(envValue("LONGFORM_LLM_TPM"));
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

// How long to wait before a request that needs up to `needTokens` of the per-minute window.
function paceFor(provider, needTokens, now = Date.now()) {
  const state = rateState.get(provider);
  if (!state) return { waitMs: 0 };
  if (state.remainingRequests === 0 && state.resetRequestsAt > now) return { waitMs: state.resetRequestsAt - now, daily: true, reason: "requests-per-day limit exhausted" };
  if (state.remainingTokens != null && state.resetTokensAt > now) {
    if (state.remainingTokens >= needTokens) return { waitMs: 0 };
    return { waitMs: state.resetTokensAt - now + PACE_MARGIN_MS, reason: `TPM headroom ${state.remainingTokens} < ${needTokens} needed` };
  }
  const limit = tpmLimit(provider);
  if (limit && state.lastTokens && state.lastAt && needTokens + state.lastTokens > limit) {
    const waitMs = Math.ceil((state.lastTokens / limit) * 60000) - (now - state.lastAt);
    if (waitMs > 0) return { waitMs: waitMs + PACE_MARGIN_MS, reason: `last reply used ${state.lastTokens} of a ${limit} TPM window` };
  }
  return { waitMs: 0 };
}

// Upper bound of what a request can count against the per-minute window: the prompt (about four
// bytes per token, an overestimate for English) plus max_completion_tokens.
function estimateRequestTokens(input) {
  const text = `${input.system || ""}${input.clientJson ? CLIENT_JSON_CONTRACT : ""}${input.user || ""}`;
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4) + 16 + (input.maxTokens || 4096);
}

// A token budget shared by every request for one unit of work (one research topic): each request
// is checked against it before it is sent and charged what the provider reports afterwards.
function tokenBudget(limit) {
  const value = Number(limit);
  return { limit: Number.isFinite(value) && value > 0 ? value : Infinity, spent: 0, requests: 0 };
}

function maxRetryMs() {
  const configured = Number(envValue("LONGFORM_LLM_MAX_RETRY_MS"));
  return Number.isFinite(configured) && configured >= 1000 ? configured : 30000;
}

function responseDiagnostics(body, content) {
  const usage = (body && body.usage) || {};
  const details = usage.completion_tokens_details || {};
  const choice = body && body.choices && body.choices[0];
  const finish = choice && choice.finish_reason;
  const known = usage.prompt_tokens != null || usage.completion_tokens != null;
  return {
    finishReason: typeof finish === "string" && /^[a-z_]{1,32}$/.test(finish) ? finish : finish ? "other" : null,
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? (known ? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) : null),
    reasoningTokens: details.reasoning_tokens ?? null,
    contentChars: content.length,
  };
}

// Why a reply is not usable JSON, without keeping any of it: a category and, for a syntax error,
// the character position.
//   TRUNCATED     the provider stopped at max_completion_tokens (finish_reason "length")
//   EMPTY         no content at all
//   NO_OBJECT     text without a JSON object
//   UNTERMINATED  an object that never closes (cut off without a "length" finish)
//   TRAILING_TEXT a complete object followed by more braces or text
//   CONTROL_CHARACTER, BAD_ESCAPE, PROPERTY_NAME, STRUCTURE, UNEXPECTED_TOKEN, SYNTAX
//                 a closed object that is still invalid JSON (V8's error class)
function jsonFailure(text, finishReason = null) {
  const value = String(text || "");
  if (finishReason === "length") return { category: "TRUNCATED" };
  if (!value.trim()) return { category: "EMPTY" };
  const first = value.indexOf("{");
  if (first < 0) return { category: "NO_OBJECT" };
  // Find where the first object closes. A closer that does not match its opener ends the scan too,
  // so JSON.parse reports it as a structure error.
  const stack = [];
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = first; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      if (stack.pop() !== (char === "}" ? "{" : "[") || !stack.length) { end = index; break; }
    }
  }
  if (end < 0) return { category: "UNTERMINATED" };
  let message = "";
  try { JSON.parse(value.slice(first, end + 1)); return { category: "TRAILING_TEXT" }; }
  catch (error) { message = String(error && error.message || ""); }
  const position = (message.match(/position (\d+)/) || [])[1];
  const category = /Bad control character/i.test(message) ? "CONTROL_CHARACTER"
    : /Bad (?:escaped|Unicode escape)/i.test(message) ? "BAD_ESCAPE"
      : /property name/i.test(message) ? "PROPERTY_NAME"
        : /Expected ',' or|after (?:property value|array element)/i.test(message) ? "STRUCTURE"
          : /Unexpected (?:end|token|non-whitespace)/i.test(message) ? "UNEXPECTED_TOKEN" : "SYNTAX";
  return { category, position: position != null ? Number(position) + first : null };
}

function parseJsonText(text, provider, stage, finishReason = null) {
  const value = String(text || "");
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  const invalid = (message) => {
    const failure = jsonFailure(value, finishReason);
    return new LongformProviderError("INVALID_JSON", message, { provider, stage, jsonCategory: failure.category, jsonPosition: failure.position ?? null });
  };
  if (first < 0 || last < first) throw invalid(`${provider} returned no JSON object`);
  try { return JSON.parse(value.slice(first, last + 1)); }
  catch (error) { throw invalid(`${provider} returned invalid JSON`); }
}

// Client-side JSON (input.clientJson). Groq's server-side JSON mode (response_format json_object)
// rejects some valid research generations with HTTP 400 json_validate_failed before the caller can
// inspect them (CriticalThread dry run 2026-10-13: 3 of 3 topics). With clientJson the request
// leaves JSON mode off, states the output contract in the system prompt, hides reasoning, and the
// reply is parsed and schema-checked here (input.validateJson). Malformed or incomplete replies
// are retried a bounded number of times (withRetry) and are never returned to the caller.
const CLIENT_JSON_CONTRACT = "\n\nOUTPUT CONTRACT: Return exactly one valid JSON object and nothing else. Use double-quoted property names and strings. Do not use markdown fences, comments, trailing commas, NaN, Infinity, or text before/after the JSON object.";

function jsonRetryable(error) {
  return error.code === "INVALID_JSON" || error.code === "INVALID_SCHEMA" || error.code === "TRUNCATED"
    || (error.code === "REQUEST" && error.status === 400 && error.providerCode === "json_validate_failed");
}

async function groq(input, dependencies = {}) {
  if (input.clientJson) input = { ...input, system: `${input.system}${CLIENT_JSON_CONTRACT}` };
  const rawFetch = dependencies.fetch || globalThis.fetch;
  if (typeof rawFetch !== "function") throw new LongformProviderError("RUNTIME", "fetch is unavailable for Groq", { provider: "groq", stage: input.stage });
  const sent = { size: {}, timedOut: false };
  const fetchImpl = instrumentedFetch(rawFetch, sent, dependencies.timeoutMs || requestTimeoutMs());
  let response;
  try {
    response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${envValue("GROQ_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
        response_format: { type: "json_object" },
        temperature: 0.25,
        max_completion_tokens: input.maxTokens || 4096,
        ...(input.clientJson ? { response_format: undefined, reasoning_format: "hidden", ...(input.jsonRecovery ? { temperature: 0 } : {}), ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}) } : {}),
      }),
    });
  } catch (error) {
    if (sent.timedOut) throw new LongformProviderError("TIMEOUT", "groq request timed out; long-form generation deferred", { provider: "groq", stage: input.stage, retryable: true, defer: true, ...sent.size });
    throw new LongformProviderError("NETWORK", "groq network request failed; long-form generation deferred", { provider: "groq", stage: input.stage, retryable: true, defer: true, ...sent.size });
  }
  const rate = rateLimitHeaders(response.headers);
  noteRate("groq", rate);
  if (!response.ok) throw await groqHttpError(response, input, sent);
  let body;
  try { body = await response.json(); }
  catch (error) { throw new LongformProviderError("INVALID_RESPONSE", "groq returned an unreadable response", { provider: "groq", stage: input.stage, rate }); }
  const message = body && body.choices && body.choices[0] && body.choices[0].message;
  const content = message && typeof message.content === "string" ? message.content : "";
  const diagnostics = { ...responseDiagnostics(body, content), rate };
  noteUsage("groq", diagnostics.totalTokens);
  let json;
  try { json = parseJsonText(content, "groq", input.stage, diagnostics.finishReason); }
  catch (error) {
    // A client-side JSON reply cut off at max_completion_tokens is its own failure: the same request
    // would be cut off again, so withRetry changes the request instead of repeating it.
    if (input.clientJson && diagnostics.finishReason === "length") error.code = "TRUNCATED";
    Object.assign(error, diagnostics);
    throw error;
  }
  if (input.clientJson && typeof input.validateJson === "function") {
    const problems = [].concat(input.validateJson(json) || []).filter(Boolean);
    if (problems.length) throw new LongformProviderError("INVALID_SCHEMA", `groq JSON is missing required content: ${problems.slice(0, 4).join("; ")}`.slice(0, 300), { provider: "groq", stage: input.stage, ...diagnostics });
  }
  return {
    json,
    provider: "groq",
    model: body.model || input.model,
    usage: { input_tokens: body.usage && body.usage.prompt_tokens || 0, output_tokens: body.usage && body.usage.completion_tokens || 0, total_tokens: diagnostics.totalTokens || 0, reasoning_tokens: diagnostics.reasoningTokens },
    diagnostics,
  };
}

async function anthropic(input, dependencies = {}) {
  const client = dependencies.anthropicClient || (() => {
    const Anthropic = dependencies.Anthropic || require("@anthropic-ai/sdk");
    return new Anthropic({ apiKey: envValue("ANTHROPIC_API_KEY") });
  })();
  let response;
  try {
    response = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens || 4096,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
  } catch (error) {
    const status = error && (error.status || error.statusCode);
    if (status) throw classifyHttp("anthropic", status, error.headers, input.stage);
    throw new LongformProviderError("NETWORK", "anthropic request failed; long-form generation deferred", { provider: "anthropic", stage: input.stage, retryable: true, defer: true });
  }
  if (response.stop_reason === "refusal") throw new LongformProviderError("REFUSAL", "anthropic refused the long-form request", { provider: "anthropic", stage: input.stage });
  if (response.stop_reason === "max_tokens") throw new LongformProviderError("TRUNCATED", "anthropic response reached its token limit", { provider: "anthropic", stage: input.stage, retryable: true, defer: true });
  const text = (response.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
  return { json: parseJsonText(text, "anthropic", input.stage), provider: "anthropic", model: response.model || input.model, usage: response.usage || { input_tokens: 0, output_tokens: 0 } };
}

async function once(spec, input, dependencies) {
  if (!spec || !["groq", "anthropic"].includes(spec.name)) throw new LongformProviderError("UNSUPPORTED_PROVIDER", `unsupported long-form provider: ${spec && spec.name || "none"}`, { provider: spec && spec.name, stage: input.stage });
  if (!spec.configured) throw new LongformProviderError("MISSING_SECRET", `missing ${spec.keyName} for long-form provider ${spec.name}`, { provider: spec.name, stage: input.stage });
  const request = { ...input, model: spec.model };
  return spec.name === "groq" ? groq(request, dependencies) : anthropic(request, dependencies);
}

function delayFor(error, attempt) {
  const configuredMax = Number(envValue("LONGFORM_LLM_MAX_RETRY_MS"));
  const maximum = Number.isFinite(configuredMax) && configuredMax >= 1000 ? configuredMax : 30000;
  const exponential = Math.min(maximum, 1000 * 2 ** attempt);
  return Math.min(maximum, Math.max(exponential, error.retryAfterMs || 0));
}

// The safe diagnostic fields of an error or a result, for events.
function eventDiagnostics(item) {
  const out = {};
  if (!item) return out;
  for (const field of ["finishReason", "promptTokens", "completionTokens", "totalTokens", "reasoningTokens", "contentChars", "jsonCategory", "jsonPosition",
    "limitKind", "limit", "used", "requested", "budgetSpent", "budgetLimit", "requestTokens"]) if (item[field] != null) out[field] = item[field];
  if (item.rate) {
    const { limitTokens, remainingTokens, resetTokensMs, remainingRequests } = item.rate;
    out.rate = { limitTokens, remainingTokens, resetTokensMs, remainingRequests };
  }
  return out;
}

function jsonRecoveryLimit() {
  const raw = envValue("LONGFORM_LLM_JSON_RECOVERIES");
  const configured = Number(raw);
  return raw !== "" && Number.isFinite(configured) && configured >= 0 ? Math.min(2, Math.floor(configured)) : 1;
}

const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

// Before a budgeted request: refuse it when the budget or the per-minute limit cannot hold it,
// stop when a daily limit is exhausted or the per-minute window cannot clear within the retry
// ceiling, and otherwise wait for per-minute headroom. Returns the tokens the request may count.
async function preflight(spec, input, budget, { attempt, attempts, sleep, onEvent }) {
  const need = estimateRequestTokens(input);
  const fields = { provider: spec.name, stage: input.stage, attempt: attempt + 1, attempts, requestTokens: need, budgetSpent: budget.spent, budgetLimit: finiteOrNull(budget.limit) };
  if (budget.spent + need > budget.limit) throw new LongformProviderError("BUDGET_EXHAUSTED", `${spec.name} token budget exhausted`, fields);
  const limit = tpmLimit(spec.name);
  if (limit && need > limit) throw new LongformProviderError("REQUEST_TOO_LARGE", `${spec.name} request can exceed the per-minute token limit`, { ...fields, limitKind: "TPM", limit });
  const pace = paceFor(spec.name, need);
  if (pace.daily) throw new LongformProviderError("RATE_LIMIT", `${spec.name} daily request limit exhausted; long-form generation deferred`, { ...fields, defer: true, limitKind: "RPD", retryAfterMs: pace.waitMs });
  if (pace.waitMs > maxRetryMs()) throw new LongformProviderError("RATE_LIMIT", `${spec.name} token headroom not available within ${seconds(maxRetryMs())}; long-form generation deferred`, { ...fields, defer: true, limitKind: "TPM", retryAfterMs: pace.waitMs });
  if (pace.waitMs > 0) {
    onEvent({ event: "paced", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 1, delayMs: pace.waitMs, reason: pace.reason });
    await sleep(pace.waitMs);
  }
  return need;
}

async function withRetry(spec, input, dependencies = {}, onEvent = () => {}) {
  const attempts = Math.max(1, Math.min(4, Number(envValue("LONGFORM_LLM_MAX_ATTEMPTS")) || 2));
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  // input.budget opts into token-aware requests: a token budget checked before every request,
  // pacing to the per-minute window, a bounded number of JSON recoveries, the provider's own wait
  // after a rate limit, and no retry after a daily limit.
  const budget = input.budget || null;
  let jsonRecoveries = budget ? jsonRecoveryLimit() : Infinity;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const need = budget ? await preflight(spec, input, budget, { attempt, attempts, sleep, onEvent }) : 0;
    onEvent({ event: "request", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 1 });
    try {
      const result = await once(spec, input, dependencies);
      if (budget) { budget.spent += (result.usage && result.usage.total_tokens) || 0; budget.requests += 1; }
      onEvent({ event: "success", provider: result.provider, model: result.model, stage: input.stage, attempt: attempt + 1, usage: result.usage,
        ...eventDiagnostics(result.diagnostics), ...(budget ? { budgetSpent: budget.spent, budgetLimit: finiteOrNull(budget.limit) } : {}) });
      return result;
    } catch (error) {
      const safe = error instanceof LongformProviderError ? error : new LongformProviderError("UNKNOWN", `${spec.name} long-form request failed`, { provider: spec.name, stage: input.stage });
      safe.attempt = attempt + 1;
      safe.attempts = attempts;
      if (budget) {
        // Charged what the provider reports; a timed-out request is charged its prompt estimate.
        budget.spent += safe.totalTokens ?? (safe.code === "TIMEOUT" ? need - (input.maxTokens || 4096) : 0);
        budget.requests += 1;
        Object.assign(safe, { budgetSpent: budget.spent, budgetLimit: finiteOrNull(budget.limit) });
      }
      // Client-side JSON: a malformed, cut-off, incomplete or server-rejected JSON reply is retried at
      // temperature 0 (a cut-off reply also with low reasoning effort, so it fits the same completion
      // limit); it is never passed on. With a budget, only jsonRecoveryLimit() times.
      if (input.clientJson && jsonRetryable(safe)) {
        if (jsonRecoveries > 0) {
          jsonRecoveries -= 1;
          safe.retryable = true; safe.defer = false; safe.retryClass = "retry";
          input = { ...input, jsonRecovery: true, ...(safe.code === "TRUNCATED" ? { reasoningEffort: "low" } : {}) };
        } else {
          safe.retryable = false; safe.defer = false; safe.retryClass = "fail";
        }
      }
      // Budgeted rate limits wait what the provider asks, and give up at once when that is longer
      // than the retry ceiling (a shorter wait would only hit the same limit again).
      const rateWait = budget && safe.code === "RATE_LIMIT" && safe.retryable ? (safe.retryAfterMs || 0) + PACE_MARGIN_MS : 0;
      if (rateWait > maxRetryMs()) { safe.retryable = false; safe.retryClass = "defer"; }
      onEvent({ event: safe.defer ? "deferred" : "failed", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 1, code: safe.code, status: safe.status, retryable: safe.retryable, retryAfterMs: safe.retryAfterMs,
        retryClass: safe.retryClass, providerCode: safe.providerCode, providerMessage: safe.providerMessage, requestBytes: safe.requestBytes, estimatedTokens: safe.estimatedTokens, ...eventDiagnostics(safe) });
      if (!safe.retryable || attempt + 1 >= attempts) throw safe;
      const delay = delayFor(safe, attempt);
      const wait = budget ? Math.max(delay, rateWait) : delay;
      onEvent({ event: "retry_scheduled", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 2, delayMs: wait, code: safe.code,
        ...(input.clientJson && jsonRetryable(safe) ? { jsonRecovery: true, reasoningEffort: input.reasoningEffort || null } : {}) });
      await sleep(wait);
    }
  }
  throw new LongformProviderError("UNKNOWN", "long-form provider exhausted attempts", { provider: spec.name, stage: input.stage, defer: true });
}

async function generateJson(input, options = {}) {
  const config = options.config || configuration();
  const onEvent = options.onEvent || (() => {});
  try {
    return await withRetry(config.primary, input, options.dependencies || {}, onEvent);
  } catch (primaryError) {
    if (!config.fallback) throw primaryError;
    if (!config.fallback.configured) {
      onEvent({ event: "fallback_unavailable", provider: config.fallback.name, model: config.fallback.model, stage: input.stage, code: "MISSING_SECRET" });
      throw primaryError;
    }
    onEvent({ event: "fallback_started", provider: config.fallback.name, model: config.fallback.model, stage: input.stage, primaryProvider: config.primary.name, primaryCode: primaryError.code || "UNKNOWN" });
    return withRetry(config.fallback, input, options.dependencies || {}, onEvent);
  }
}

module.exports = {
  LongformProviderError, envValue, providerSpec, configuration, available, retryAfterMs, classifyHttp, sanitizeDetail, describeError,
  groqErrorDetail, instrumentedFetch, jsonRetryable, CLIENT_JSON_CONTRACT, describeEvent, durationMs, rateLimitHeaders, rateLimitInfo, jsonFailure,
  noteRate, noteUsage, resetRateState, paceFor, estimateRequestTokens, tokenBudget, responseDiagnostics,
  parseJsonText, groq, anthropic, delayFor, withRetry, generateJson,
};
