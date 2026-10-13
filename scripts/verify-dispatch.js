#!/usr/bin/env node
"use strict";

// VERIFY A CLOUDFLARE repository_dispatch before a workflow acts on it.
//
//   node scripts/verify-dispatch.js --event shorts-production [--event ...] [--max-age-minutes 360]
//                                   [--allow-unsigned]
//
// Reads the GitHub event ($GITHUB_EVENT_PATH) and the signing key ($DISPATCH_SIGNING_KEY, the existing
// WATCHDOG_GITHUB_TOKEN repository secret, which the Worker also holds). Exit 0 and GitHub outputs
// verified=true / correlation_id / slot / fired_at only when:
//   - the event type is one this workflow accepts;
//   - client_payload.source is "cloudflare-cron" and the correlation id is well formed;
//   - fired_at is not in the future (2 min skew) and not older than --max-age-minutes;
//   - the HMAC-SHA256 signature over the event, correlation id, fired_at and slot matches
//     (same message as ops/production-watchdog-worker/src/index.mjs, constant-time compare).
// --allow-unsigned accepts a payload without a signature (only for the legacy watchdog event while a
// redeploy is pending); a payload that carries a signature must still verify. The key and the
// signature are never printed.

const crypto = require("crypto");
const fs = require("fs");

const SIGNATURE_CONTEXT = "youtube-otomasyon.dispatch.v1";
const CORRELATION = /^[a-z0-9-]{3,40}-\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const MAX_SKEW_MS = 2 * 60000;

function signingMessage({ event, correlationId, firedAt, slot }) {
  return [SIGNATURE_CONTEXT, event, correlationId, firedAt, slot].join("\n");
}

function sign(key, fields) {
  return crypto.createHmac("sha256", key).update(signingMessage(fields)).digest("hex");
}

function verify({ event, expectedEvents, key, now = Date.now(), maxAgeMinutes = 360, allowUnsigned = false }) {
  const fail = (code, detail) => ({ ok: false, code, detail });
  if (!event || typeof event !== "object") return fail("NO_EVENT", "no GitHub event payload");
  const type = event.action;
  if (!expectedEvents.includes(type)) return fail("UNEXPECTED_EVENT", `event type ${type || "(none)"} is not accepted here`);
  const payload = event.client_payload || {};
  if (payload.source !== "cloudflare-cron") return fail("UNEXPECTED_SOURCE", `source ${payload.source || "(none)"}`);
  const firedAt = Date.parse(payload.fired_at || "");
  if (Number.isNaN(firedAt)) return fail("BAD_TIMESTAMP", "fired_at missing or invalid");
  if (firedAt - now > MAX_SKEW_MS) return fail("FUTURE_TIMESTAMP", `fired_at ${payload.fired_at} is in the future`);
  if (now - firedAt > maxAgeMinutes * 60000) return fail("STALE_DISPATCH", `fired_at ${payload.fired_at} is older than ${maxAgeMinutes} min`);
  const signed = payload.signature != null || payload.signature_version != null;
  if (!signed) {
    if (allowUnsigned) return { ok: true, signed: false, correlationId: null, slot: null, firedAt: payload.fired_at };
    return fail("UNSIGNED", "the dispatch carries no signature");
  }
  if (payload.signature_version !== "v1") return fail("SIGNATURE_VERSION", `unsupported signature version ${payload.signature_version}`);
  if (!CORRELATION.test(String(payload.correlation_id || ""))) return fail("BAD_CORRELATION_ID", "correlation_id missing or malformed");
  if (!/^[a-z0-9-]{3,40}$/.test(String(payload.slot || "")) || !String(payload.correlation_id).startsWith(payload.slot + "-")) {
    return fail("BAD_SLOT", "slot missing or not matching the correlation id");
  }
  if (!key) return fail("NO_KEY", "DISPATCH_SIGNING_KEY is not configured");
  if (!/^[0-9a-f]{64}$/.test(String(payload.signature || ""))) return fail("BAD_SIGNATURE", "signature malformed");
  const expected = Buffer.from(sign(key, { event: type, correlationId: payload.correlation_id, firedAt: payload.fired_at, slot: payload.slot }), "hex");
  const actual = Buffer.from(payload.signature, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return fail("BAD_SIGNATURE", "signature does not match");
  return { ok: true, signed: true, correlationId: payload.correlation_id, slot: payload.slot, firedAt: payload.fired_at };
}

function args(argv) {
  const events = [];
  let maxAgeMinutes = 360;
  let allowUnsigned = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--event") events.push(argv[++i]);
    else if (argv[i] === "--max-age-minutes") maxAgeMinutes = Number(argv[++i]);
    else if (argv[i] === "--allow-unsigned") allowUnsigned = true;
  }
  return { events, maxAgeMinutes, allowUnsigned };
}

if (require.main === module) {
  const options = args(process.argv.slice(2));
  let event = null;
  try { event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")); } catch (error) {}
  const result = verify({ event, expectedEvents: options.events, key: process.env.DISPATCH_SIGNING_KEY || "",
    maxAgeMinutes: options.maxAgeMinutes, allowUnsigned: options.allowUnsigned });
  const out = process.env.GITHUB_OUTPUT;
  if (!result.ok) {
    console.log(`::error title=Dispatch rejected::${result.code}: ${result.detail}`);
    if (out) fs.appendFileSync(out, "verified=false\n");
    process.exit(1);
  }
  console.log(`Dispatch verified: ${event.action} · ${result.signed ? `correlation ${result.correlationId} · slot ${result.slot}` : "unsigned (legacy)"} · fired ${result.firedAt}`);
  if (out) fs.appendFileSync(out, `verified=true\ncorrelation_id=${result.correlationId || ""}\nslot=${result.slot || ""}\nfired_at=${result.firedAt}\n`);
}

module.exports = { SIGNATURE_CONTEXT, signingMessage, sign, verify };
