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

// One-line, log-safe summary of a provider failure.
function describeError(error) {
  if (!error) return "UNKNOWN";
  const parts = [error.code || "UNKNOWN"];
  if (error.status) parts.push(`HTTP ${error.status}`);
  if (error.providerCode) parts.push(`provider ${error.providerCode}`);
  if (error.estimatedTokens != null) parts.push(`~${error.estimatedTokens} input tokens (${error.requestBytes} bytes)`);
  if (error.stage) parts.push(`stage ${error.stage}`);
  if (error.retryClass) parts.push(error.retryClass);
  return parts.join(" · ") + (error.providerMessage ? ` — ${error.providerMessage}` : "");
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

function classifyHttp(provider, status, headers, stage, detail = {}) {
  if (status === 429) return new LongformProviderError("RATE_LIMIT", `${provider} rate limit reached; long-form generation deferred`, { provider, status, stage, retryable: true, defer: true, retryAfterMs: retryAfterMs(headers), ...detail });
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
  return {
    providerCode: sanitizeDetail(error ? error.code || error.type || "" : "", 60) || null,
    providerMessage: sanitizeDetail(error ? error.message : parsed ? "" : raw) || null,
  };
}

async function groqHttpError(response, input, sent) {
  const detail = await groqErrorDetail(response);
  return classifyHttp("groq", response.status, response.headers, input.stage, { ...detail, ...sent.size });
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

function parseJsonText(text, provider, stage) {
  const value = String(text || "");
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first < 0 || last < first) throw new LongformProviderError("INVALID_JSON", `${provider} returned no JSON object`, { provider, stage });
  try { return JSON.parse(value.slice(first, last + 1)); }
  catch (error) { throw new LongformProviderError("INVALID_JSON", `${provider} returned invalid JSON`, { provider, stage }); }
}

// Client-side JSON (input.clientJson). Groq's server-side JSON mode (response_format json_object)
// rejects some valid research generations with HTTP 400 json_validate_failed before the caller can
// inspect them (CriticalThread dry run 2026-10-13: 3 of 3 topics). With clientJson the request
// leaves JSON mode off, states the output contract in the system prompt, hides reasoning, and the
// reply is parsed and schema-checked here (input.validateJson). Malformed or incomplete replies
// are retried a bounded number of times (withRetry) and are never returned to the caller.
const CLIENT_JSON_CONTRACT = "\n\nOUTPUT CONTRACT: Return exactly one valid JSON object and nothing else. Use double-quoted property names and strings. Do not use markdown fences, comments, trailing commas, NaN, Infinity, or text before/after the JSON object.";

function jsonRetryable(error) {
  return error.code === "INVALID_JSON" || error.code === "INVALID_SCHEMA"
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
        ...(input.clientJson ? { response_format: undefined, reasoning_format: "hidden", ...(input.jsonRecovery ? { temperature: 0 } : {}) } : {}),
      }),
    });
  } catch (error) {
    if (sent.timedOut) throw new LongformProviderError("TIMEOUT", "groq request timed out; long-form generation deferred", { provider: "groq", stage: input.stage, retryable: true, defer: true, ...sent.size });
    throw new LongformProviderError("NETWORK", "groq network request failed; long-form generation deferred", { provider: "groq", stage: input.stage, retryable: true, defer: true, ...sent.size });
  }
  if (!response.ok) throw await groqHttpError(response, input, sent);
  let body;
  try { body = await response.json(); }
  catch (error) { throw new LongformProviderError("INVALID_RESPONSE", "groq returned an unreadable response", { provider: "groq", stage: input.stage }); }
  const message = body && body.choices && body.choices[0] && body.choices[0].message;
  const json = parseJsonText(message && message.content, "groq", input.stage);
  if (input.clientJson && typeof input.validateJson === "function") {
    const problems = [].concat(input.validateJson(json) || []).filter(Boolean);
    if (problems.length) throw new LongformProviderError("INVALID_SCHEMA", `groq JSON is missing required content: ${problems.slice(0, 4).join("; ")}`.slice(0, 300), { provider: "groq", stage: input.stage });
  }
  return {
    json,
    provider: "groq",
    model: body.model || input.model,
    usage: { input_tokens: body.usage && body.usage.prompt_tokens || 0, output_tokens: body.usage && body.usage.completion_tokens || 0 },
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

async function withRetry(spec, input, dependencies = {}, onEvent = () => {}) {
  const attempts = Math.max(1, Math.min(4, Number(envValue("LONGFORM_LLM_MAX_ATTEMPTS")) || 2));
  const sleep = dependencies.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    onEvent({ event: "request", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 1 });
    try {
      const result = await once(spec, input, dependencies);
      onEvent({ event: "success", provider: result.provider, model: result.model, stage: input.stage, attempt: attempt + 1, usage: result.usage });
      return result;
    } catch (error) {
      const safe = error instanceof LongformProviderError ? error : new LongformProviderError("UNKNOWN", `${spec.name} long-form request failed`, { provider: spec.name, stage: input.stage });
      // Client-side JSON: a malformed, incomplete or server-rejected JSON reply is retried (bounded by
      // the same attempt limit) at temperature 0; it is never passed on.
      if (input.clientJson && jsonRetryable(safe)) {
        safe.retryable = true; safe.defer = false; safe.retryClass = "retry";
        input = { ...input, jsonRecovery: true };
      }
      onEvent({ event: safe.defer ? "deferred" : "failed", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 1, code: safe.code, status: safe.status, retryable: safe.retryable, retryAfterMs: safe.retryAfterMs,
        retryClass: safe.retryClass, providerCode: safe.providerCode, providerMessage: safe.providerMessage, requestBytes: safe.requestBytes, estimatedTokens: safe.estimatedTokens });
      if (!safe.retryable || attempt + 1 >= attempts) throw safe;
      const delay = delayFor(safe, attempt);
      onEvent({ event: "retry_scheduled", provider: spec.name, model: spec.model, stage: input.stage, attempt: attempt + 2, delayMs: delay, code: safe.code });
      await sleep(delay);
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
  groqErrorDetail, instrumentedFetch, jsonRetryable, CLIENT_JSON_CONTRACT,
  parseJsonText, groq, anthropic, delayFor, withRetry, generateJson,
};
