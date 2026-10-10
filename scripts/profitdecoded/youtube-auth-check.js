#!/usr/bin/env node
"use strict";
// Read-only YouTube connection test for ProfitDecoded. It never uploads, edits or publishes.
//   node scripts/profitdecoded/youtube-auth-check.js [--out result.json]
// Uses only the PD_YT_* names (core/channel-context.js); other channels' and legacy YT_* values are never read.
// Every HTTP request passes an allowlist: the OAuth refresh and token-info calls and one channels.list(mine=true)
// read. Anything else is refused before it leaves the process, and the request log (method, host, path without
// query) is part of the result. Access tokens, refresh tokens and client secrets are never printed.
// Exit codes: 0 verified, 3 not configured (setup steps listed), 4 failed or mismatched.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const YouTube = require(path.join(root, "lib/yt"));
const Health = require(path.join(root, "oauth-health"));
const Schedule = require(path.join(root, "core/profitdecoded/schedule"));

const SLUG = "profitdecoded";
const ALLOWED = [
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/token$/ },
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/tokeninfo$/ },
  { method: "GET", host: "www.googleapis.com", path: /^\/youtube\/v3\/channels\?part=id,snippet&mine=true$/ },
];

// Wraps the HTTP function so only the allowlisted read calls can run.
function readOnlyRequest(inner = YouTube.istek, log = []) {
  return (opt = {}, body) => {
    const method = String(opt.method || "GET").toUpperCase(); const host = String(opt.hostname || ""); const p = String(opt.path || "");
    const allowed = ALLOWED.some((a) => a.method === method && a.host === host && a.path.test(p));
    log.push({ method, host, path: p.split("?")[0], allowed });
    if (!allowed) return Promise.reject(Object.assign(new Error(`read-only check refused ${method} ${host}${p.split("?")[0]}`), { code: "BLOCKED_NON_READ_REQUEST" }));
    return inner(opt, body);
  };
}

function publishingState(env = process.env) {
  const cfg = Channel.getChannel(SLUG).config;
  const guard = Schedule.publishGuard({ env });
  return {
    PD_PUBLISH: env.PD_PUBLISH ? "set" : "unset", PD_LONGFORM_PUBLISH: env.PD_LONGFORM_PUBLISH ? "set" : "unset",
    channelEnabled: cfg.enabled === true, youtubePlatformEnabled: !!(cfg.platforms && cfg.platforms.youtube && cfg.platforms.youtube.enabled),
    humanApprovalForFirstN: cfg.publishing && cfg.publishing.requireHumanApprovalForFirstN, publishGuardAllowed: guard.allowed,
  };
}

function setupSteps(missing) {
  const steps = {
    PD_YT_CLIENT_ID: "Repository secret PD_YT_CLIENT_ID: the OAuth 2.0 client ID (Desktop app type) from the Google Cloud project used for ProfitDecoded.",
    PD_YT_CLIENT_SECRET: "Repository secret PD_YT_CLIENT_SECRET: the client secret of that same OAuth client.",
    PD_YT_REFRESH_TOKEN: "Repository secret PD_YT_REFRESH_TOKEN: a refresh token minted with that client while signed in as the ProfitDecoded brand account (scopes youtube.force-ssl and yt-analytics.readonly).",
    PD_YT_CHANNEL_ID: "Repository variable PD_YT_CHANNEL_ID: the ProfitDecoded channel ID (UC…), from YouTube Studio > Settings > Channel > Advanced settings.",
  };
  return missing.map((name) => steps[name] || `Configure ${name}.`);
}

async function run(options = {}) {
  const env = options.env || process.env;
  const channel = Channel.selectChannel(SLUG);
  const log = [];
  const result = await Health.check(channel, { ...options, request: readOnlyRequest(options.inner, log), inventory: { daysOfInventory: 1 } });
  const by = (name) => result.checks.find((c) => c.name === name) || {};
  const missing = (by("config").missing || []).slice();
  const writes = log.filter((r) => r.host !== "oauth2.googleapis.com" && r.method !== "GET"); // attempted, and refused
  const report = {
    test: "profitdecoded-youtube-auth-check", channel: SLUG, checkedAt: result.checkedAt,
    status: result.notConfigured || missing.length ? "NOT_CONFIGURED" : (result.accessTokenRefresh && result.channelMatch ? "VERIFIED" : "FAILED"),
    authentication: by("refresh-token").code || null,
    scopes: { code: by("scopes").code || null, missing: by("scopes").missingScopes || [] },
    expectedChannelId: result.expectedChannelId || null, authenticatedChannelId: result.authenticatedChannelId || null,
    channelMatch: !!result.channelMatch, credentialSource: result.credentialSource || "channel-scoped",
    credentialNames: result.credentialNames, missing,
    setup: missing.length ? setupSteps(missing) : [],
    requests: log, refusedRequests: log.filter((r) => !r.allowed).length,
    videosUploaded: 0, videosModified: 0, youtubeWriteRequests: writes.length,
    publishing: publishingState(env),
  };
  return report;
}

if (require.main === module) {
  process.env.QUOTA_LEDGER = process.env.QUOTA_LEDGER || "0"; // a connection test does not touch the committed quota ledger
  run().then((report) => {
    const json = JSON.stringify(report, null, 2) + "\n";
    const argv = process.argv.slice(2); const out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : null;
    if (out) fs.writeFileSync(path.resolve(out), json);
    process.stdout.write(json);
    process.exitCode = report.status === "VERIFIED" ? 0 : report.status === "NOT_CONFIGURED" ? 3 : 4;
  }).catch((error) => {
    process.stdout.write(JSON.stringify({ test: "profitdecoded-youtube-auth-check", status: "FAILED", error: Health.safeError(error) }, null, 2) + "\n");
    process.exitCode = 4;
  });
}
module.exports = { run, readOnlyRequest, publishingState, setupSteps, ALLOWED };
