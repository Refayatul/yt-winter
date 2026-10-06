"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const PD = (m) => require("../../core/profitdecoded/" + m);
const W = PD("wav");

// ---------- TTS providers (mock fetch; no network, no keys) ----------
test("TTS provider resolution never pretends: missing key falls back to the uncertified edge voice", () => {
  const T = PD("tts-provider");
  assert.deepEqual(T.resolve({}).premium, false);
  const noKey = T.resolve({ PD_TTS_PROVIDER: "elevenlabs" });
  assert.equal(noKey.name, "edge-tts"); assert.equal(noKey.fallbackFrom, "elevenlabs"); assert.match(noKey.reason, /ELEVENLABS_API_KEY/);
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "openai", OPENAI_API_KEY: "k" }).premium, true);
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k" }).premium, true);
});

test("request builders send the key only in headers and request 24 kHz audio", () => {
  const T = PD("tts-provider");
  const env = { ELEVENLABS_API_KEY: "SECRET1", OPENAI_API_KEY: "SECRET2", PD_ELEVENLABS_VOICE_ID: "voiceX" };
  const el = T.elevenLabsRequest("Hello $5", {}, env);
  assert.match(el.url, /text-to-speech\/voiceX\?output_format=pcm_24000/);
  assert.equal(el.init.headers["xi-api-key"], "SECRET1");
  assert.ok(!el.url.includes("SECRET1") && !el.init.body.includes("SECRET1"));
  assert.throws(() => T.elevenLabsRequest("x", {}, { ELEVENLABS_API_KEY: "k" }), /voice id/);
  const oa = T.openAiRequest("Hi", {}, env);
  assert.equal(oa.init.headers.authorization, "Bearer SECRET2");
  assert.equal(JSON.parse(oa.init.body).response_format, "wav");
  assert.ok(!oa.init.body.includes("SECRET2"));
});

test("synthesize decodes provider audio and surfaces HTTP failures without leaking the key", async () => {
  const T = PD("tts-provider");
  const pcm = Buffer.alloc(2400 * 2); for (let i = 0; i < 2400; i += 1) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  const okFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => pcm });
  const s = await T.synthesize("hi", { provider: "elevenlabs", voiceId: "v" }, { fetch: okFetch, env: { ELEVENLABS_API_KEY: "K", PD_ELEVENLABS_VOICE_ID: "v" } });
  assert.equal(s.length, 2400); assert.ok(Math.abs(s[5]) <= 1);
  const wavFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => W.writeWav(new Float32Array(24000).fill(0.1), 24000) });
  assert.equal((await T.synthesize("hi", { provider: "openai" }, { fetch: wavFetch, env: { OPENAI_API_KEY: "K" } })).length, 24000);
  await assert.rejects(T.synthesize("hi", { provider: "openai" }, { fetch: async () => ({ ok: false, status: 401 }), env: { OPENAI_API_KEY: "SECRETKEY" } }), (e) => /HTTP 401/.test(e.message) && !e.message.includes("SECRETKEY"));
});

test("premium providers lift the voice cap, the fallback does not", () => {
  const N = PD("narration");
  const segs = []; let t = 0; [2.1, 3.6, 1.4, 4.2, 2.8, 5.1, 1.9, 3.3].forEach((d, i) => { segs.push({ text: "Planet Fitness reported members " + "in the annual report ".repeat(i % 3), start: t, end: t + d }); t += d + [0.2, 0.55, 0.3, 0.9, 0.25, 0.6, 0.35][i % 7]; });
  const audio = { status: "OBSERVED", integratedLufs: -16, truePeakDbfs: -2, clippedSamples: 0 };
  assert.equal(N.qa(segs, { provider: "openai-tts gpt-4o-mini-tts", audio }).certified, true);
  assert.equal(N.qa(segs, { provider: "elevenlabs", audio }).certified, true);
  assert.equal(N.qa(segs, { provider: "edge-tts en-US (fallback voice)", audio }).certified, false);
});

// ---------- YouTube collector (mock API) ----------
const DAY = 86400000; const NOW = Date.parse("2026-10-06T00:00:00Z");
function mockApi() {
  const calls = [];
  const iso = (d) => new Date(NOW - d * DAY).toISOString();
  const vid = (id, ch, d, views) => ({ id, snippet: { channelId: ch, title: "Why " + id + " costs so much", publishedAt: iso(d) }, statistics: { viewCount: String(views), likeCount: String(Math.round(views * 0.04)), commentCount: String(Math.round(views * 0.003)) }, contentDetails: { duration: "PT9M" } });
  const filler = (ch) => Array.from({ length: 10 }, (_, i) => vid(`${ch}-f${i}`, ch, 40 + i * 7, 20000));
  const store = { small: [...filler("small"), vid("small-hit", "small", 10, 900000)], big: [...filler("big").map((v) => ({ ...v, statistics: { ...v.statistics, viewCount: "800000" } }))] };
  const fetch = async (url) => {
    const u = new URL(url); const ep = u.pathname.split("/").pop(); const p = u.searchParams; calls.push({ ep, key: p.get("key") });
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (ep === "channels" && p.get("forHandle")) return json({ items: p.get("forHandle") === "@Ghost" ? [] : [{ id: "big", snippet: { title: "Big" }, statistics: {} }] });
    if (ep === "channels") return json({ items: p.get("id").split(",").map((id) => ({ id, snippet: { title: id }, statistics: { subscriberCount: id === "small" ? "12000" : "5000000" }, contentDetails: { relatedPlaylists: { uploads: "UU" + id } } })) });
    if (ep === "search") return json({ items: [{ id: { videoId: "small-hit" }, snippet: { channelId: "small" } }] });
    if (ep === "playlistItems") return json({ items: store[p.get("playlistId").slice(2)].map((v) => ({ contentDetails: { videoId: v.id } })) });
    if (ep === "videos") { const all = Object.values(store).flat(); return json({ items: p.get("id").split(",").map((id) => all.find((v) => v.id === id)).filter(Boolean) }); }
    return { ok: false, status: 404 };
  };
  return { fetch, calls };
}

test("collector requires a key, reports unresolved handles, respects quota and finds the small-channel outlier end to end", async () => {
  const C = PD("yt-collector"); const Comp = PD("competitive");
  assert.throws(() => C.client({ apiKey: "" , fetch: () => {} }), /PD_YT_API_KEY/);
  const api = mockApi();
  const { snapshot, report } = await C.collect({ referenceHandles: ["@Big", "@Ghost"], queries: ["q1", "q2"], windowsDays: [30], baselineVideos: 25 }, { apiKey: "K", fetch: api.fetch, quotaBudget: 1000, now: NOW });
  assert.deepEqual(report.unresolvedHandles, ["@Ghost"]);
  assert.equal(report.searches, 2); assert.ok(report.quotaUsed <= 1000);
  assert.equal(snapshot.channels.length, 2);
  const feed = Comp.buildBreakoutFeed(snapshot, { now: NOW, threshold: 50 });
  assert.equal(feed.count, 1);
  assert.equal(feed.feed[0].source.videoId, "small-hit"); assert.equal(feed.feed[0].outlier.smallChannelOutlier, true);
  assert.ok(api.calls.every((c) => c.key === "K"));
});

test("collector stops searching before the budget is spent so channel baselines are still collected", async () => {
  const C = PD("yt-collector");
  const api = mockApi();
  const { report, snapshot } = await C.collect({ referenceHandles: [], queries: ["a", "b", "c", "d", "e"], windowsDays: [7, 30], reserveUnits: 150 }, { apiKey: "K", fetch: api.fetch, quotaBudget: 450, now: NOW });
  assert.match(report.stoppedEarly, /search stopped to keep 150 units/);
  assert.ok(report.searches <= 3);
  assert.ok(snapshot.channels.length >= 1, "baseline collection still ran");
  assert.ok(report.quotaUsed <= 450);
});

test("collector surfaces quota exhaustion instead of inventing data", async () => {
  const C = PD("yt-collector");
  const { report, snapshot } = await C.collect({ referenceHandles: ["@A"], queries: [], windowsDays: [] }, { apiKey: "K", fetch: async () => ({ ok: false, status: 403 }), quotaBudget: 100 });
  assert.match(report.stoppedEarly, /HTTP 403/);
  assert.equal(snapshot.channels.length, 0);
});

// ---------- renderer (pure parts; the ffmpeg run is exercised by the profitdecoded-render workflow) ----------
test("renderer: motion/transition filters and honest on-screen data (no fake bars)", () => {
  const R = require("../../scripts/profitdecoded/render");
  assert.match(R.zoomFilter("push-in", 90, 1080, 1920), /^zoompan=z='min\(1\+0\.10\*on\/90,1\.10\)'.*d=90:s=1080x1920:fps=30$/);
  assert.match(R.zoomFilter("pan-left", 60, 1920, 1080), /x='\(iw-iw\/zoom\)\*\(1-on\/60\)'/);
  assert.match(R.zoomFilter("nonsense", 60, 1920, 1080), /min\(1\+0\.10/); // unknown motion degrades to push-in
  assert.equal(R.fadeFilter("cut", 3), ""); assert.match(R.fadeFilter("dissolve", 3), /fade=t=in/); assert.match(R.fadeFilter("dip-to-ink", 3), /d=0\.28/);
  const base = { type: "chart", entities: ["a"], numbers: ["5.3"], evidenceClaimId: "c1" };
  const args = (overlayText) => R.frameArgs({ ...base, overlayText }, { W: 540, H: 960, S: 1, short: true, source: "Source: X" }).join(" ");
  assert.ok(!/roundrectangle/.test(args("$5.3B in fees")), "a dollar figure must never draw a percentage bar");
  assert.ok(/roundrectangle/.test(args("51% of operating income")));
  assert.ok(args("x").includes("Source: X") && args("x").includes("PROFITDECODED"));
  const bundle = { dossier: { sources: [{ id: "s1", publisher: "SEC" }], claims: [{ id: "c1", sourceIds: ["s1"] }], inferences: [{ id: "i1" }] } };
  assert.equal(R.sourceTag({ evidenceClaimId: "c1" }, bundle), "Source: SEC");
  assert.equal(R.sourceTag({ evidenceClaimId: "i1" }, bundle), "Our arithmetic from the cited figures");
});
