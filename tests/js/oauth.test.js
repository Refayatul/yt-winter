"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const YouTube = require("../../lib/yt");
const OAuthHealth = require("../../oauth-health");

const ROOT = path.resolve(__dirname, "..", "..");

function fakeChannel(overrides = {}) {
  const credentials = { clientId: "client-id-secret", clientSecret: "client-secret-value", refreshToken: "refresh-token-value",
    names: { clientId: ["CT_CLIENT_ID"], clientSecret: ["CT_CLIENT_SECRET"], refreshToken: ["CT_YT_REFRESH_TOKEN"], channelId: ["CT_YT_CHANNEL_ID"] } };
  return {
    slug: "critical-thread", name: "CriticalThread", prefix: "CT",
    credentialNames: credentials.names,
    credentials: () => credentials,
    expectedChannelId: () => "UC_CRITICAL_THREAD",
    ...overrides,
  };
}

test("shared OAuth layer retries transient access-token refresh and never returns credentials", async () => {
  let calls = 0;
  const result = await YouTube.token(async () => {
    calls += 1;
    if (calls === 1) return { durum: 503, govde: JSON.stringify({ error: "temporarily_unavailable" }) };
    return { durum: 200, govde: JSON.stringify({ access_token: "short-lived-access", expires_in: 3600, scope: YouTube.REQUIRED_SCOPES.join(" ") }) };
  }, fakeChannel(), { attempts: 2, delay: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.erisim, "short-lived-access");
  assert.doesNotMatch(JSON.stringify(result), /client-secret-value|refresh-token-value/);
});

test("OAuth failures are classified without exposing response bodies", async () => {
  await assert.rejects(() => YouTube.token(async () => ({ durum: 400, govde: JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }) }), fakeChannel(), { attempts: 1 }),
    (error) => error.code === "INVALID_GRANT" && !/refresh-token-value/.test(error.message));
  assert.equal(YouTube.classifyOAuthFailure(401, JSON.stringify({ error: "invalid_client" })).code, "CLIENT_MISMATCH");
  assert.equal(YouTube.classifyApiFailure({ durum: 403, neden: "quotaExceeded" }), "QUOTA_ERROR");
  assert.equal(YouTube.classifyApiFailure({ durum: 403, neden: "insufficient authentication scopes" }), "INSUFFICIENT_SCOPE");
});

test("oauth-health proves refresh, APIs and channel match for all three channels without printing secrets", async () => {
  const request = async (options) => {
    if (options.hostname === "oauth2.googleapis.com") return { durum: 200, govde: JSON.stringify({ access_token: "short-lived-access", expires_in: 3600, scope: YouTube.REQUIRED_SCOPES.join(" ") }) };
    if (options.hostname === "youtubeanalytics.googleapis.com") return { durum: 200, govde: JSON.stringify({ columnHeaders: [{ name: "views" }], rows: [[1]] }) };
    return { durum: 200, govde: JSON.stringify({ items: [{ id: "UC_CRITICAL_THREAD", snippet: { title: "CriticalThread" } }] }) };
  };
  for (const [slug, name] of [["failure-reconstructed", "Failure Reconstructed"], ["impossible-brief", "ImpossibleBrief"], ["critical-thread", "CriticalThread"]]) {
    const result = await OAuthHealth.check(fakeChannel({ slug, name }), { request, attempts: 1 });
    assert.equal(result.healthy, true, slug);
    assert.equal(result.channelMatch, true, slug);
    assert.equal(result.youtubeDataApi, true, slug);
    assert.equal(result.youtubeAnalyticsApi, true, slug);
    assert.doesNotMatch(JSON.stringify(result), /client-id-secret|client-secret-value|refresh-token-value|short-lived-access/, slug);
  }
});

test("all YouTube write entry points rely on the shared channel-aware auth guard", () => {
  for (const file of ["youtube-yukle.js", "youtube-guncelle.js", "youtube-playlist.js", "yorum-yanitla.js", "pinned-comment.js"]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /getYouTubeClient|verifyChannelIdentity/, file);
    assert.doesNotMatch(source, /hostname:\s*["']oauth2\.googleapis\.com/, `${file} must not implement runtime refresh separately`);
  }
});

test("OAuth Actions health jobs are isolated and use only their channel credential namespace", () => {
  const source = fs.readFileSync(path.join(ROOT, ".github", "workflows", "youtube-oauth-health.yml"), "utf8");
  assert.match(source, /^  failure-reconstructed:/m);
  assert.match(source, /^  impossible-brief:/m);
  assert.match(source, /^  critical-thread:/m);
  assert.match(source, /IB_CLIENT_ID: \$\{\{ secrets\.IB_CLIENT_ID \}\}/);
  assert.match(source, /CT_CLIENT_ID: \$\{\{ secrets\.CT_CLIENT_ID \}\}/);
  assert.match(source, /node oauth-health\.js --channel failure-reconstructed/);
  assert.match(source, /node oauth-health\.js --channel impossible-brief/);
  assert.match(source, /node oauth-health\.js --channel critical-thread/);
});
