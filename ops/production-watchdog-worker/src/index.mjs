// Independent production clock (Cloudflare Cron Triggers -> GitHub repository_dispatch).
//
// Every cron is mapped to exactly one GitHub event; an unknown cron sends nothing.
//   05 07 UTC  shorts-production        (10:05 Istanbul, after every channel's production time)
//   05 13 UTC  shorts-production        (16:05 Istanbul, retry inside the same day)
//   35 16 UTC  production-sla-watchdog  (unchanged: five minutes after the 16:30 UTC SLA deadline)
//   05 19 UTC  publication-check        (65 min after the 21:00 Istanbul / 18:00 UTC release)
// The public release time is set by the channels' configs (21:00 Europe/Istanbul), never here.
//
// Each dispatch carries a correlation id and an HMAC-SHA256 signature keyed by the existing
// WATCHDOG_GITHUB_TOKEN (the same secret is a repository secret, so scripts/verify-dispatch.js can
// check it without any new credential). repository_dispatch already requires a token with write
// access; the signature additionally proves the event came from this Worker, not from another
// workflow or token holder. The watchdog payload keeps every field the existing receiver reads.

const DEFAULT_REPOSITORY = "eyazan/youtube-otomasyon";
const DEFAULT_CRON = "35 16 * * *";
const DEFAULT_DEADLINE = "16:30";
const EVENT_TYPE = "production-sla-watchdog";
export const SIGNATURE_VERSION = "v1";
const SIGNATURE_CONTEXT = "youtube-otomasyon.dispatch.v1";

export const SCHEDULE = Object.freeze({
  "5 7 * * *": Object.freeze({ event: "shorts-production", slot: "production-1" }),
  "5 13 * * *": Object.freeze({ event: "shorts-production", slot: "production-2" }),
  "35 16 * * *": Object.freeze({ event: EVENT_TYPE, slot: "sla-watchdog" }),
  "5 19 * * *": Object.freeze({ event: "publication-check", slot: "publication-check" }),
});

function publicConfig(env) {
  return {
    repository: env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    cron: env.WATCHDOG_CRON || DEFAULT_CRON,
    deadlineUtc: env.PRODUCTION_DEADLINE_UTC || DEFAULT_DEADLINE,
    version: env.WATCHDOG_VERSION || "development",
    commit: env.WATCHDOG_COMMIT || "unknown",
  };
}

export function signingMessage({ event, correlationId, firedAt, slot }) {
  return [SIGNATURE_CONTEXT, event, correlationId, firedAt, slot].join("\n");
}

export async function sign(key, fields) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signingMessage(fields)));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function correlationId(slot, firedAt) {
  const random = [...crypto.getRandomValues(new Uint8Array(4))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${slot}-${firedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${random}`;
}

function dispatchError(response, body) {
  const requestId = response.headers && typeof response.headers.get === "function"
    ? response.headers.get("x-github-request-id") : null;
  const details = {
    status: response.status,
    statusText: response.statusText || null,
    requestId,
    body: String(body || "").slice(0, 1000),
  };
  const error = new Error(`GitHub repository_dispatch failed: ${JSON.stringify(details)}`);
  error.details = details;
  return error;
}

export async function dispatchEvent(env, entry, fetchImpl = fetch, { cron = null, now = () => new Date() } = {}) {
  if (!env.WATCHDOG_GITHUB_TOKEN) throw new Error("WATCHDOG_GITHUB_TOKEN is not configured");
  if (!entry || !entry.event || !entry.slot) throw new Error("dispatch entry is missing its event or slot");
  const config = publicConfig(env);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)) {
    throw new Error(`GITHUB_REPOSITORY is invalid: ${config.repository}`);
  }
  const firedAt = now().toISOString();
  const id = correlationId(entry.slot, firedAt);
  const signature = await sign(env.WATCHDOG_GITHUB_TOKEN, { event: entry.event, correlationId: id, firedAt, slot: entry.slot });
  console.log(JSON.stringify({ event: "watchdog_dispatch_started", repository: config.repository,
    eventType: entry.event, slot: entry.slot, correlationId: id, firedAt, version: config.version, commit: config.commit }));
  const response = await fetchImpl(`https://api.github.com/repos/${config.repository}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.WATCHDOG_GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "youtube-otomasyon-production-watchdog",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: entry.event,
      client_payload: { source: "cloudflare-cron", fired_at: firedAt,
        worker_version: config.version, worker_commit: config.commit,
        correlation_id: id, slot: entry.slot, scheduled_cron: cron,
        signature_version: SIGNATURE_VERSION, signature },
    }),
  });
  if (response.status !== 204) {
    let body = "";
    try { body = await response.text(); } catch (error) { body = `[response body unavailable: ${error.message}]`; }
    throw dispatchError(response, body);
  }
  const result = { ok: true, repository: config.repository, status: response.status,
    eventType: entry.event, slot: entry.slot, correlationId: id, firedAt, version: config.version, commit: config.commit };
  console.log(JSON.stringify({ event: "watchdog_dispatch_succeeded", ...result }));
  return result;
}

// Backwards-compatible entry point: the 16:35 UTC SLA watchdog dispatch.
export async function dispatchWatchdog(env, fetchImpl = fetch, options = {}) {
  return dispatchEvent(env, SCHEDULE[DEFAULT_CRON], fetchImpl, { cron: DEFAULT_CRON, ...options });
}

export function entryForCron(cron) {
  return Object.prototype.hasOwnProperty.call(SCHEDULE, cron) ? SCHEDULE[cron] : null;
}

export default {
  async scheduled(controller, env, ctx) {
    const cron = controller && controller.cron;
    const entry = entryForCron(cron);
    if (!entry) {
      console.error(JSON.stringify({ event: "watchdog_unknown_cron", cron, ...publicConfig(env) }));
      return;
    }
    ctx.waitUntil(dispatchEvent(env, entry, fetch, { cron }).catch((error) => {
      console.error(JSON.stringify({ event: "watchdog_dispatch_failed", cron, eventType: entry.event, message: error.message,
        details: error.details || null, ...publicConfig(env) }));
      throw error;
    }));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health") return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const body = {
      ok: true,
      scheduler: "cloudflare-cron",
      eventType: EVENT_TYPE,
      tokenConfigured: !!env.WATCHDOG_GITHUB_TOKEN,
      signatureVersion: SIGNATURE_VERSION,
      schedule: Object.entries(SCHEDULE).map(([cron, entry]) => ({ cron, event: entry.event, slot: entry.slot })),
      ...publicConfig(env),
    };
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" },
    });
  },
};
