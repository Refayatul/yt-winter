"use strict";

// 2026-10-12 incident: Edge TTS refused every GitHub runner (HTTP 403). FR marked 28 qualified
// topics as permanently failed one after another, IB rendered tone placeholders, and the
// workflow stayed green with nothing published. These tests pin the fixes.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const TTS = require("../../lib/shorts-tts");
const Speech = require("../../lib/speech-check");
const Stages = require("../../lib/run-stages");
const Channel = require("../../core/channel-context");
const FF = require("../../ff-yol");

const channelWith = (fallback) => ({ slug: "test-channel", config: { voice: { provider: "edge-tts", voice: "en-US-AndrewMultilingualNeural", ...(fallback ? { fallback } : {}) } } });
const ready = () => ({ ok: true, reason: null });
const missing = () => ({ ok: false, reason: "Kokoro model file missing" });
const KOKORO = { provider: "kokoro", voice: "am_michael", speed: 1 };

test("fallback policy: an unreviewed voice never narrates a publishing run", () => {
  assert.equal(TTS.fallbackPolicy(channelWith(null), { PUBLISH: "1" }, ready).allowed, false);
  const unapproved = channelWith({ ...KOKORO, approved: false });
  const publishing = TTS.fallbackPolicy(unapproved, { PUBLISH: "1", SHORTS_TTS_FALLBACK: "preview" }, ready);
  assert.equal(publishing.allowed, false);
  assert.match(publishing.reason, /not approved/);
  assert.equal(TTS.fallbackPolicy(unapproved, { PUBLISH: "0" }, ready).allowed, false, "previews must ask for the fallback explicitly");
  const preview = TTS.fallbackPolicy(unapproved, { PUBLISH: "0", SHORTS_TTS_FALLBACK: "preview" }, ready);
  assert.equal(preview.allowed, true);
  assert.equal(preview.approved, false);
});

test("fallback policy: an approved voice is used only when Kokoro is installed, and can be switched off", () => {
  const approved = channelWith({ ...KOKORO, approved: true });
  assert.equal(TTS.fallbackPolicy(approved, { PUBLISH: "1" }, ready).allowed, true);
  assert.equal(TTS.fallbackPolicy(approved, { PUBLISH: "1" }, missing).allowed, false);
  assert.equal(TTS.fallbackPolicy(approved, { PUBLISH: "1", SHORTS_TTS_FALLBACK: "off" }, ready).allowed, false);
});

test("active channels configure distinct fallback voices, none approved yet", () => {
  const voices = ["failure-reconstructed", "impossible-brief", "critical-thread"].map((slug) => Channel.getChannel(slug).config.voice.fallback);
  for (const fallback of voices) {
    assert.equal(fallback.provider, "kokoro");
    assert.equal(fallback.approved, false, "a fallback voice is approved only by the owner after listening");
  }
  assert.equal(new Set(voices.map((fallback) => fallback.voice)).size, 3, "each channel keeps its own voice identity");
});

test("upload guard: a package narrated by an unapproved fallback voice is refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-guard-"));
  fs.writeFileSync(path.join(dir, "render.json"), JSON.stringify({ audio: { provider: "Kokoro-82M offline fallback (am_michael) (claim-timed)", fallback: { provider: "kokoro", voice: "am_michael" } } }));
  assert.equal(TTS.uploadAllowed(channelWith({ ...KOKORO, approved: false }), dir).ok, false);
  assert.equal(TTS.uploadAllowed(channelWith({ ...KOKORO, voice: "am_fenrir", approved: true }), dir).ok, false, "approval is for one specific voice");
  assert.equal(TTS.uploadAllowed(channelWith({ ...KOKORO, approved: true }), dir).ok, true);
  fs.mkdirSync(path.join(dir, "Videos"));
  fs.writeFileSync(path.join(dir, "Videos", "denetim.json"), JSON.stringify({ voice: { provider: "edge-tts", voice: "en-US-AndrewMultilingualNeural" } }));
  assert.equal(TTS.uploadAllowed(channelWith(null), dir).ok, true, "the primary Edge voice is unaffected");
  const uploader = fs.readFileSync(path.join(ROOT, "youtube-yukle.js"), "utf8");
  assert.ok(uploader.indexOf("uploadAllowed(CHANNEL, BASE)") > 0 && uploader.indexOf("uploadAllowed(CHANNEL, BASE)") < uploader.indexOf("getYouTubeClient"), "checked before any YouTube call");
});

test("speech check: real speech passes; a tone, silence or a truncated read fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "speech-"));
  const speech = path.join(__dirname, "fixtures", "speech-sample.mp3");
  const ok = Speech.check(speech, { text: "Qantas Flight 32 suffered an uncontained engine failure." });
  assert.equal(ok.ok, true, ok.problems.join("; "));
  const tone = path.join(dir, "tone.m4a");
  cp.execFileSync(FF.ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=180:sample_rate=44100:duration=3", tone]);
  const toneResult = Speech.check(tone, { text: "Qantas Flight 32 suffered an uncontained engine failure." });
  assert.equal(toneResult.ok, false);
  assert.match(toneResult.problems.join(" "), /not speech/);
  const silence = path.join(dir, "silence.m4a");
  cp.execFileSync(FF.ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "3", silence]);
  assert.equal(Speech.check(silence, { text: "Qantas Flight 32 suffered an uncontained engine failure." }).ok, false);
  const truncated = Speech.check(speech, { text: "Qantas Flight 32 suffered an uncontained engine failure. In seconds, debris tore through the wing and cut wiring. The crew spent nearly two hours working through failures." });
  assert.equal(truncated.ok, false, "three sentences cannot fit in three seconds");
  assert.match(truncated.problems.join(" "), /speech is missing/);
});

test("IB/CT: with Edge refused and no approved fallback, a publishing run stops before rendering", () => {
  const Rendering = require("../../core/rendering");
  const channel = Channel.getChannel("impossible-brief");
  const script = { claims: [{ text: "One teaspoon of neutron star weighs about 900 Great Pyramids." }, { text: "Outside the star, that matter would expand violently." }] };
  const keep = { PUBLISH: process.env.PUBLISH, SHORTS_EDGE_TTS: process.env.SHORTS_EDGE_TTS, TTS_PROVIDER: process.env.TTS_PROVIDER, SHORTS_TTS_FALLBACK: process.env.SHORTS_TTS_FALLBACK };
  try {
    Object.assign(process.env, { SHORTS_EDGE_TTS: "off", TTS_PROVIDER: "edge", SHORTS_TTS_FALLBACK: "off" });
    process.env.PUBLISH = "1";
    assert.throws(() => Rendering.synthesizeNarration(script, fs.mkdtempSync(path.join(os.tmpdir(), "narr-")), channel), (error) => error.code === "NARRATION_UNAVAILABLE");
    process.env.PUBLISH = "0";
    const preview = Rendering.synthesizeNarration(script, fs.mkdtempSync(path.join(os.tmpdir(), "narr-")), channel);
    assert.equal(preview.syntheticVoice, false, "an offline preview keeps a placeholder that can never pass the publish gate");
  } finally {
    for (const [key, value] of Object.entries(keep)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("FR queue: a narration outage stops the queue without spending the topic", () => {
  const sira = fs.readFileSync(path.join(ROOT, "shorts-sira.js"), "utf8");
  assert.match(sira, /r\.status === NARRATION_UNAVAILABLE_EXIT\) throw new AltyapiHatasi/);
  const branch = sira.slice(sira.indexOf("if (e instanceof AltyapiHatasi)"));
  assert.ok(branch.indexOf("return 1;") >= 0 && branch.indexOf("return 1;") < branch.indexOf("basarisizIsaretle(slug)"), "returns before marking the topic failed");
  const yap = fs.readFileSync(path.join(ROOT, "shorts-yap.js"), "utf8");
  assert.match(yap, /exitCode: TTS\.NARRATION_UNAVAILABLE_EXIT/);
  assert.match(yap, /process\.exit\(e\.exitCode \|\| 1\)/);
  assert.equal(TTS.NARRATION_UNAVAILABLE_EXIT, 75);
  const failed = JSON.parse(fs.readFileSync(path.join(ROOT, "icerik", "basarisiz.json"), "utf8"));
  for (const slug of ["united-232-1989", "amtrak-188-2015", "tenerife-1977"]) assert.ok(!failed.includes(slug), `${slug} failed only because Edge refused narration; it is restored`);
});

test("stage record and verdict: nothing uploaded is never a green production", () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "stages-"));
  const channel = { slug: "failure-reconstructed", paths: { state } };
  const run = Stages.start(channel, { env: { GITHUB_RUN_ID: "42", PUBLISH: "1" } });
  run.topic("amtrak-188-2015").done("RESEARCH").done("SCRIPT").done("ASSETS").fail("NARRATION", "Edge TTS 403").outcome("FAILED", "NARRATION_UNAVAILABLE");
  const record = Stages.latest(channel, "42");
  assert.equal(record.outcome, "FAILED");
  assert.equal(record.stages.NARRATION.status, "failed");
  assert.equal(record.stages.RENDER.status, "not-reached");
  assert.equal(record.stages.UPLOAD.status, "not-reached");
  const Outcome = require("../../scripts/production-outcome");
  for (const kind of ["PRODUCTION_FAILED", "UPLOAD_FAILED", "PUBLISH_VERIFICATION_FAILED", "AWAITING_APPROVAL"]) assert.ok(Outcome.FAILING.has(kind));
  for (const kind of ["SUCCESS", "NOT_DUE", "DRY_RUN", "CONTENT_BLOCKED", "QUALITY_REJECTED"]) assert.ok(!Outcome.FAILING.has(kind));
  assert.equal(Outcome.classify(record, { config: { voice: { fallback: { voice: "am_michael", approved: false } } } }), "AWAITING_APPROVAL");
  const md = Outcome.markdown([{ channel: "failure-reconstructed", outcome: "FAILED", category: "AWAITING_APPROVAL", published: false, reason: "NARRATION_UNAVAILABLE", stages: record.stages }]);
  assert.match(md, /\| failure-reconstructed \| \*\*AWAITING_APPROVAL\*\* \| \*\*no\*\* \| ✅ \| ✅ \| ✅ \| ❌ \| · \|/);
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "portfolio-production.yml"), "utf8");
  assert.match(workflow, /production-outcome\.js --verdict/);
  assert.ok(workflow.indexOf("--verdict") > workflow.indexOf("Commit isolated state"), "the verdict runs after state is committed");
});

test("health pre-flight: a refused voice without an approved fallback is critical and blocks the slot", async () => {
  const keep = process.argv.slice();
  process.argv.push("--channel", "impossible-brief");
  try {
    const Health = require("../../saglik.js");
    const result = await Health.denetle({ publish: "1", token: async () => ({ kapsam: "" }), identity: async () => ({ actual: "UC" }), seslendirme: async () => ({ ok: false, tries: ["403", "403", "403"] }),
      fallbackPolicy: { allowed: false, approved: false, voice: "am_fenrir", reason: "not approved" }, nitelikli: { count: 3, first: "x", reason: "ok" }, araclar: { ok: true }, diskGB: 50, kalan: 30 });
    const voice = result.bulgular.find((item) => item.ad === "seslendirme");
    assert.equal(voice.durum, "kritik");
    assert.match(voice.mesaj, /NARRATION_UNAVAILABLE/);
    assert.equal(result.yuklemeUygun, false);
    assert.match(fs.readFileSync(path.join(ROOT, "saglik.js"), "utf8"), /\["youtube-yetki", "youtube-kanal", "seslendirme", "render-araclari", "disk"\]\.includes/, "a narration outage blocks the slot like a broken OAuth token");
    const topics = await Health.denetle({ publish: "0", token: async () => ({ kapsam: "" }), identity: async () => ({ actual: "UC" }), nitelikli: { count: 0, first: null, reason: "NO_QUALIFIED_TOPIC" }, araclar: { ok: true }, diskGB: 50, kalan: 327 });
    assert.equal(topics.bulgular.find((item) => item.ad === "nitelikli-konu").durum, "kritik", "327 'days' of topics with none qualified is not healthy");
  } finally { process.argv.splice(0, process.argv.length, ...keep); }
});
