"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Check = require("../../scripts/profitdecoded/youtube-auth-check");

const NAMES = ["PD_YT_CLIENT_ID", "PD_YT_CLIENT_SECRET", "PD_YT_REFRESH_TOKEN", "PD_YT_CHANNEL_ID", "PD_PUBLISH"];
async function withEnv(values, fn) {
  const before = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  for (const n of NAMES) delete process.env[n];
  Object.assign(process.env, values);
  try { return await fn(); } finally { for (const n of NAMES) { if (before[n] === undefined) delete process.env[n]; else process.env[n] = before[n]; } }
}
const SECRETS = { PD_YT_CLIENT_ID: "pd-client", PD_YT_CLIENT_SECRET: "pd-secret-value", PD_YT_REFRESH_TOKEN: "pd-refresh-value", PD_YT_CHANNEL_ID: "UCprofitdecoded" };
// A fake Google: token refresh, then channels.list(mine=true) returning `channelId`.
const google = (channelId, calls = []) => async (opt) => {
  calls.push(opt);
  if (opt.hostname === "oauth2.googleapis.com" && opt.path === "/token") return { durum: 200, govde: JSON.stringify({ access_token: "access-value", scope: "https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly" }) };
  if (opt.path.startsWith("/youtube/v3/channels?")) return { durum: 200, govde: JSON.stringify({ items: [{ id: channelId, snippet: { title: "ProfitDecoded" } }] }) };
  return { durum: 500, govde: "{}" };
};

test("only the OAuth refresh, token-info and channels.list(mine=true) reads can leave the process", async () => {
  const log = []; let reached = 0;
  const guarded = Check.readOnlyRequest(async () => { reached += 1; return { durum: 200, govde: "{}" }; }, log);
  await guarded({ hostname: "oauth2.googleapis.com", path: "/token", method: "POST" });
  await guarded({ hostname: "www.googleapis.com", path: "/youtube/v3/channels?part=id,snippet&mine=true" });
  for (const opt of [
    { hostname: "www.googleapis.com", path: "/upload/youtube/v3/videos?part=snippet,status", method: "POST" },
    { hostname: "www.googleapis.com", path: "/youtube/v3/videos?part=snippet", method: "PUT" },
    { hostname: "www.googleapis.com", path: "/youtube/v3/videos?id=x", method: "DELETE" },
    { hostname: "www.googleapis.com", path: "/youtube/v3/thumbnails/set?videoId=x", method: "POST" },
    { hostname: "www.googleapis.com", path: "/youtube/v3/videos?part=id&id=x" },
  ]) await assert.rejects(guarded(opt), /read-only check refused/);
  assert.equal(reached, 2);
  assert.equal(log.filter((r) => !r.allowed).length, 5);
  assert.ok(log.every((r) => !r.path.includes("?")));
});

test("missing configuration reports NOT_CONFIGURED with setup steps and makes no request", async () => {
  await withEnv({}, async () => {
    const calls = [];
    const r = await Check.run({ inner: google("UCprofitdecoded", calls) });
    assert.equal(r.status, "NOT_CONFIGURED");
    assert.deepEqual(r.missing, ["PD_YT_CLIENT_ID", "PD_YT_CLIENT_SECRET", "PD_YT_REFRESH_TOKEN", "PD_YT_CHANNEL_ID"]);
    assert.equal(r.setup.length, 4);
    assert.equal(calls.length, 0);
  });
});

test("a matching ProfitDecoded channel verifies, with no write request and no secret in the output", async () => {
  await withEnv(SECRETS, async () => {
    const calls = [];
    const r = await Check.run({ inner: google("UCprofitdecoded", calls) });
    assert.equal(r.status, "VERIFIED");
    assert.equal(r.channelMatch, true);
    assert.equal(r.authenticatedChannelId, "UCprofitdecoded");
    assert.equal(r.youtubeWriteRequests, 0);
    assert.equal(r.videosUploaded, 0);
    assert.deepEqual(calls.map((c) => `${c.method || "GET"} ${c.hostname}`), ["POST oauth2.googleapis.com", "GET www.googleapis.com"]);
    const text = JSON.stringify(r);
    for (const secret of ["pd-secret-value", "pd-refresh-value", "access-value"]) assert.ok(!text.includes(secret), secret);
    assert.equal(r.publishing.PD_PUBLISH, "unset");
    assert.equal(r.publishing.publishGuardAllowed, false);
  });
});

test("a token for another channel fails as a mismatch", async () => {
  await withEnv(SECRETS, async () => {
    const r = await Check.run({ inner: google("UCsomeOtherChannel") });
    assert.equal(r.status, "FAILED");
    assert.equal(r.channelMatch, false);
    assert.equal(r.authenticatedChannelId, "UCsomeOtherChannel");
  });
});

test("other channels' and legacy credentials are never used for ProfitDecoded", async () => {
  await withEnv({}, async () => {
    const other = { YT_CLIENT_ID: "legacy", YT_CLIENT_SECRET: "legacy", YT_REFRESH_TOKEN: "legacy", BTO_YT_CLIENT_ID: "bto", BTO_YT_CLIENT_SECRET: "bto", BTO_YT_REFRESH_TOKEN: "bto", FR_YT_CLIENT_ID: "fr" };
    const before = Object.fromEntries(Object.keys(other).map((k) => [k, process.env[k]]));
    Object.assign(process.env, other);
    try {
      const calls = [];
      const r = await Check.run({ inner: google("UCprofitdecoded", calls) });
      assert.equal(r.status, "NOT_CONFIGURED");
      assert.equal(calls.length, 0);
      assert.deepEqual(Object.values(r.credentialNames), ["PD_YT_CLIENT_ID", "PD_YT_CLIENT_SECRET", "PD_YT_REFRESH_TOKEN", "PD_YT_CHANNEL_ID"]);
    } finally { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  });
});

test("the workflow is manual-only, read-only, and receives only ProfitDecoded values", () => {
  const wf = fs.readFileSync(path.join(__dirname, "../../.github/workflows/profitdecoded-youtube-auth-check.yml"), "utf8");
  assert.match(wf, /on:\s*\n\s*workflow_dispatch:\s*\n\s*\npermissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(wf, /schedule:|push:|pull_request:/);
  const secrets = [...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual(secrets, ["PD_YT_CLIENT_ID", "PD_YT_CLIENT_SECRET", "PD_YT_REFRESH_TOKEN"]);
  assert.doesNotMatch(wf, /PD_PUBLISH:|PD_LONGFORM_PUBLISH:|youtube-yukle|videos\.insert|ANTHROPIC|CARTESIA/);
});
