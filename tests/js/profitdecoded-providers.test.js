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

test("Google Cloud TTS: key in a header only, rate mapped, response decoded, missing key falls back", async () => {
  const T = PD("tts-provider");
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "google" }).fallbackFrom, "google");
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k" }).premium, true);
  const req = T.googleRequest("Hello", { rate: "-3%" }, { GOOGLE_TTS_API_KEY: "SECRETG" });
  assert.equal(req.init.headers["x-goog-api-key"], "SECRETG");
  assert.ok(!req.url.includes("SECRETG") && !req.init.body.includes("SECRETG"));
  const body = JSON.parse(req.init.body);
  assert.equal(body.audioConfig.sampleRateHertz, 24000); assert.ok(Math.abs(body.audioConfig.speakingRate - 0.97) < 1e-9);
  assert.match(body.voice.name, /Chirp3-HD/);
  const wav = W.writeWav(new Float32Array(12000).fill(0.05), 24000);
  const s = await T.synthesize("hi", { provider: "google" }, { env: { GOOGLE_TTS_API_KEY: "K" }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ audioContent: wav.toString("base64") }) }) });
  assert.equal(s.length, 12000);
  assert.equal(PD("narration").qa([{ text: "a", start: 0, end: 1 }], { provider: "google-cloud-tts chirp3-hd" }).certified, true);
});

test("Kokoro (free, local/CI): falls back when files are missing, builds the command, never auto-certifies", async () => {
  const T = PD("tts-provider"); const fs = require("fs"); const os = require("os"); const path = require("path");
  const noFiles = T.resolve({ PD_TTS_PROVIDER: "kokoro" });
  assert.equal(noFiles.name, "edge-tts"); assert.equal(noFiles.fallbackFrom, "kokoro"); assert.match(noFiles.reason, /PD_KOKORO_MODEL/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kk-")); const m = path.join(dir, "m.onnx"), v = path.join(dir, "v.bin"); fs.writeFileSync(m, "x"); fs.writeFileSync(v, "x");
  const env = { PD_TTS_PROVIDER: "kokoro", PD_KOKORO_MODEL: m, PD_KOKORO_VOICES: v, PD_KOKORO_PYTHON: "py" };
  const r = T.resolve(env); assert.equal(r.name, "kokoro"); assert.equal(r.premium, false);
  const cmd = T.kokoroCommand({ rate: "-3%", voice: "bm_george", provider: "kokoro" }, env);
  assert.equal(cmd.bin, "py");
  assert.ok(cmd.args.some((a) => /kokoro_tts\.py$/.test(a)));
  assert.equal(cmd.args[cmd.args.indexOf("--voice") + 1], "bm_george");
  assert.equal(cmd.args[cmd.args.indexOf("--speed") + 1], "0.970");
  // the text goes to the helper on stdin (never argv), and the decoded WAV comes back
  let seenInput = null;
  const run = (c, input) => { seenInput = input; fs.writeFileSync(c.args[c.args.length - 1], W.writeWav(new Float32Array(2400).fill(0.1), 24000)); };
  const samples = await T.synthesize("Hello there", { provider: "kokoro", rate: "+0%" }, { env, run: (c, input) => run({ ...c, args: [...c.args, "--out", path.join(dir, "o.wav")] }, input) }).catch(() => null);
  assert.equal(samples, null, "a runner that does not honour --out cannot fake audio");
  assert.equal(seenInput, "Hello there");
  assert.equal(PD("narration").qa([{ text: "a", start: 0, end: 1 }], { provider: "kokoro-82m (open-source, unreviewed)" }).certified, false);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "..", "scripts", "profitdecoded", "kokoro_tts.py")));
});

test("Kokoro default runner reports the helper's real failure instead of a confusing ENOENT", async () => {
  const T = PD("tts-provider"); const fs = require("fs"); const os = require("os"); const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kk2-")); const m = path.join(dir, "m.onnx"), v = path.join(dir, "v.bin"); fs.writeFileSync(m, "x"); fs.writeFileSync(v, "x");
  const stub = (body) => { const f = path.join(dir, "py" + Math.random().toString(36).slice(2) + ".sh"); fs.writeFileSync(f, "#!/bin/sh\n" + body + "\n"); fs.chmodSync(f, 0o755); return f; };
  const env = (py) => ({ PD_TTS_PROVIDER: "kokoro", PD_KOKORO_MODEL: m, PD_KOKORO_VOICES: v, PD_KOKORO_PYTHON: py });
  await assert.rejects(T.synthesize("hi", { provider: "kokoro" }, { env: env(stub('echo "boom: no such voice" >&2; exit 3')) }), /exited 3: boom: no such voice/);
  await assert.rejects(T.synthesize("hi", { provider: "kokoro" }, { env: env(stub("exit 0")) }), /reported success but wrote no audio/);
  await assert.rejects(T.synthesize("hi", { provider: "kokoro" }, { env: env(path.join(dir, "does-not-exist")) }), /could not start/);
  // a helper that really writes a WAV to --out succeeds
  const writer = stub('while [ "$1" != "--out" ]; do shift; done; cp ' + path.join(dir, "ok.wav") + ' "$2"');
  fs.writeFileSync(path.join(dir, "ok.wav"), W.writeWav(new Float32Array(24000).fill(0.1), 24000));
  assert.equal((await T.synthesize("hi", { provider: "kokoro" }, { env: env(writer) })).length, 24000);
});

test("Cartesia Sonic: pinned model and API version, key in a header only, raw 24 kHz PCM, credit cap, Kokoro fallback", async () => {
  const T = PD("tts-provider"); const fs = require("fs"); const os = require("os"); const path = require("path");
  const voice = "11111111-2222-3333-4444-555555555555";
  const req = T.cartesiaRequest("Hello", { rate: "-3%", voice }, { PD_CARTESIA_API_KEY: "SECRETC" });
  assert.equal(req.url, "https://api.cartesia.ai/tts/bytes");
  assert.equal(req.init.headers.authorization, "Bearer SECRETC"); assert.equal(req.init.headers["cartesia-version"], "2026-08-14");
  assert.ok(!req.url.includes("SECRETC") && !req.init.body.includes("SECRETC"));
  const body = JSON.parse(req.init.body);
  assert.equal(body.model_id, "sonic-3.6-2026-08-27"); assert.deepEqual(body.voice, { id: voice });
  assert.deepEqual(body.output_format, { container: "raw", encoding: "pcm_s16le", sample_rate: 24000 });
  assert.ok(Math.abs(body.generation_config.speed - 0.97) < 1e-9);
  // an edge-tts voice name is never sent as a Cartesia voice id
  assert.throws(() => T.cartesiaRequest("x", { voice: "en-US-AndrewMultilingualNeural" }, { PD_CARTESIA_API_KEY: "k" }), /voice id/);
  // no key: free Kokoro when its files exist (never another paid provider), else the uncertified edge voice
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-")); const m = path.join(dir, "m.onnx"), v = path.join(dir, "v.bin"); fs.writeFileSync(m, "x"); fs.writeFileSync(v, "x");
  const fb = T.resolve({ PD_TTS_PROVIDER: "cartesia", PD_KOKORO_MODEL: m, PD_KOKORO_VOICES: v });
  assert.equal(fb.name, "kokoro"); assert.equal(fb.fallbackFrom, "cartesia");
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "cartesia" }).name, "edge-tts");
  assert.equal(T.resolve({ PD_TTS_PROVIDER: "cartesia", PD_CARTESIA_API_KEY: "k" }).premium, true);
  // credits: counted per character before sending; refused without a cap or past it; one request, no retry
  const pcm = Buffer.alloc(4800); let calls = 0;
  const fetch = async () => { calls += 1; return { ok: true, status: 200, arrayBuffer: async () => pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length) }; };
  const env = { PD_CARTESIA_API_KEY: "k", PD_CARTESIA_VOICE_ID: voice };
  await assert.rejects(T.synthesize("Hello there.", { provider: "cartesia" }, { env, fetch }), /PD_CARTESIA_MAX_CHARS/);
  const before = T.usage.cartesia.characters;
  const s = await T.synthesize("Hello there.", { provider: "cartesia" }, { env: { ...env, PD_CARTESIA_MAX_CHARS: String(before + 20) }, fetch });
  assert.equal(s.length, 2400); assert.equal(T.usage.cartesia.characters - before, 12);
  await assert.rejects(T.synthesize("Hello there.", { provider: "cartesia" }, { env: { ...env, PD_CARTESIA_MAX_CHARS: String(before + 20) }, fetch }), /exceed/);
  assert.equal(calls, 1);
  const failing = async () => { calls += 1; return { ok: false, status: 402, text: async () => '{"error":"insufficient credits"}' }; };
  await assert.rejects(T.synthesize("Hi.", { provider: "cartesia" }, { env: { ...env, PD_CARTESIA_MAX_CHARS: "100000" }, fetch: failing }), /cartesia TTS failed: HTTP 402: .*insufficient credits/);
  assert.equal(calls, 2);
  assert.equal(PD("narration").qa([{ text: "a", start: 0, end: 1 }], { provider: "cartesia sonic-3.6-2026-08-27 voice x" }).certified, true);
});
