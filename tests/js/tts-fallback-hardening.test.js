"use strict";

// Hardening of the 2026-10-12 outage fixes (#251), one regression per defect:
//   1. the upload guard failed open when a package had no narration record;
//   2. a corrupt Kokoro model could be cached and then fail every later run;
//   3. "no qualified topic" was reported as a failed production (now CONTENT_BLOCKED);
//   4. a Wikimedia/Pexels outage still marked FR topics permanently failed;
//   5. outcome categories: an upload with a videoId and publishAt is SCHEDULED, nothing more;
//   6. publication: only the YouTube API reporting the video public is PUBLICATION_CONFIRMED.

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const TTS = require("../../lib/shorts-tts");
const Outage = require("../../lib/source-outage");
const Outcome = require("../../scripts/production-outcome");

const ROOT = path.join(__dirname, "..", "..");
const channel = (fallback) => ({ slug: "failure-reconstructed", config: { voice: { provider: "edge-tts", voice: "en-US-AndrewMultilingualNeural", ...(fallback ? { fallback } : {}) } } });
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test("1. upload guard fails closed: a missing, unreadable or incomplete narration record blocks the upload", () => {
  const empty = tmp("guard-empty-");
  const missing = TTS.uploadAllowed(channel(), empty);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /NARRATION_RECORD_MISSING/);

  const corrupt = tmp("guard-corrupt-");
  fs.writeFileSync(path.join(corrupt, "render.json"), "{ not json");
  assert.match(TTS.uploadAllowed(channel(), corrupt).reason, /NARRATION_RECORD_MISSING/, "an unreadable record counts as missing");

  const noProvider = tmp("guard-noprovider-");
  fs.writeFileSync(path.join(noProvider, "render.json"), JSON.stringify({ audio: { syntheticVoice: true } }));
  assert.match(TTS.uploadAllowed(channel(), noProvider).reason, /NARRATION_RECORD_INVALID/);

  const tone = tmp("guard-tone-");
  fs.writeFileSync(path.join(tone, "render.json"), JSON.stringify({ audio: { provider: "non-speech CI fallback; production voice remains configured Edge TTS", syntheticVoice: false } }));
  assert.match(TTS.uploadAllowed(channel(), tone).reason, /NARRATION_PLACEHOLDER/, "a placeholder tone is never publishable narration");

  const edge = tmp("guard-edge-");
  fs.mkdirSync(path.join(edge, "Videos"));
  fs.writeFileSync(path.join(edge, "Videos", "denetim.json"), JSON.stringify({ voice: { provider: "edge-tts", voice: "en-US-AndrewMultilingualNeural" } }));
  assert.equal(TTS.uploadAllowed(channel(), edge).ok, true, "a recorded primary voice still uploads");

  const uploader = fs.readFileSync(path.join(ROOT, "youtube-yukle.js"), "utf8");
  assert.match(uploader, /NARRATION_NOT_PUBLISHABLE: \$\{sesOnay\.reason\}/);
  assert.match(uploader, /process\.exit\(14\)/);
});

test("2. Kokoro model: invalid files are replaced or removed, and only verified files are cached", () => {
  const dir = tmp("kokoro-");
  const src = path.join(dir, "src");
  const model = path.join(dir, "model");
  fs.mkdirSync(src);
  fs.mkdirSync(model);
  fs.writeFileSync(path.join(src, "a.bin"), "model-a");
  fs.writeFileSync(path.join(src, "b.bin"), "model-b");
  const sha = (file) => cp.execFileSync("sha256sum", [file], { encoding: "utf8" }).split(" ")[0];
  const manifest = path.join(dir, "manifest.sha256");
  fs.writeFileSync(manifest, `${sha(path.join(src, "a.bin"))}  a.bin\n${sha(path.join(src, "b.bin"))}  b.bin\n`);
  const run = () => cp.spawnSync("bash", [path.join(ROOT, "scripts", "kokoro-model.sh"), model], {
    env: { ...process.env, KOKORO_MANIFEST: manifest, KOKORO_BASE_URL: `file://${src}` }, encoding: "utf8" });

  fs.writeFileSync(path.join(model, "a.bin"), "corrupt cached copy");
  const repaired = run();
  assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  assert.equal(fs.readFileSync(path.join(model, "a.bin"), "utf8"), "model-a", "a corrupt cached file is downloaded again");

  fs.writeFileSync(path.join(src, "b.bin"), "tampered upstream");
  fs.rmSync(path.join(model, "b.bin"));
  const refused = run();
  assert.equal(refused.status, 1);
  assert.deepEqual(fs.readdirSync(model), [], "after a failed verification no model file (and no .part) is left to cache");

  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "portfolio-production.yml"), "utf8");
  assert.ok(!/uses: actions\/cache@v4\s*\n\s*with:\s*\n\s*path: kokoro-model/.test(workflow), "no combined restore+save cache for the model");
  assert.match(workflow, /uses: actions\/cache\/restore@v4\s*\n\s*with:\s*\n\s*path: kokoro-model/);
  assert.match(workflow, /if: steps\.kokoro\.outcome == 'success' && steps\.kokoro-cache\.outputs\.cache-hit != 'true'\s*\n\s*uses: actions\/cache\/save@v4/);
  assert.match(workflow, /bash scripts\/kokoro-model\.sh kokoro-model/);
});

test("3. no qualified topic is CONTENT_BLOCKED (a warning), never an infrastructure failure", () => {
  const record = { outcome: "NO_TOPIC", reason: "no bucket A topic at viral >= 75", stages: { RESEARCH: { status: "failed" } } };
  assert.equal(Outcome.classify(record), "CONTENT_BLOCKED");
  assert.ok(!Outcome.FAILING.has("CONTENT_BLOCKED"));
  assert.ok(Outcome.WARNING.has("CONTENT_BLOCKED"));
  assert.equal(Outcome.classify({ outcome: "BLOCKED", reason: "visual pre-check", stages: {} }), "QUALITY_REJECTED");
  assert.ok(!Outcome.FAILING.has("QUALITY_REJECTED"));
});

test("4. a Wikimedia/archive.org/Pexels outage exits 76 and never spends an FR topic; a missing file still fails", () => {
  for (const error of [Object.assign(new Error("getaddrinfo ENOTFOUND commons.wikimedia.org"), { code: "ENOTFOUND" }),
    Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }), new Error("HTTP 503"), new Error("HTTP 429"),
    new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")]) assert.equal(Outage.isTransient(error), true, error.message);
  for (const error of [new Error("HTTP 404"), new Error("lisans uygun degil (CC BY-SA): x"), new Error("kaynak icin url/wikimedia/archive yok: a")]) {
    assert.equal(Outage.isTransient(error), false, error.message);
  }

  // The real fetcher, with https.get failing like a DNS outage (and backoff sleeps skipped).
  const preload = path.join(tmp("outage-preload-"), "preload.js");
  const job = `zz-outage-test-${process.pid}`;
  const base = path.join(ROOT, "uretim", job);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "konu.json"), JSON.stringify({ kaynaklar: [{ ad: "a.jpg", url: "https://upload.example.invalid/a.jpg", lisans: "Public domain" }] }));
  try {
    for (const [mode, expected] of [["dns", Outage.ASSET_SOURCE_UNAVAILABLE_EXIT], ["404", 1]]) {
      fs.writeFileSync(preload, `
        const https = require("https"); const EventEmitter = require("events"); const { Readable } = require("stream");
        global.setTimeout = (fn) => setImmediate(fn);
        https.get = (url, options, callback) => {
          const request = new EventEmitter();
          setImmediate(() => {
            if (${JSON.stringify(mode)} === "dns") request.emit("error", Object.assign(new Error("getaddrinfo ENOTFOUND upload.example.invalid"), { code: "ENOTFOUND" }));
            else { const res = new Readable({ read() { this.push(null); } }); res.statusCode = 404; res.headers = {}; callback(res); }
          });
          return request;
        };`);
      const result = cp.spawnSync(process.execPath, ["-r", preload, path.join(ROOT, "arsiv-bul.js"), job], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
      assert.equal(result.status, expected, `${mode}: ${result.stdout}${result.stderr}`);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  const sira = fs.readFileSync(path.join(ROOT, "shorts-sira.js"), "utf8");
  assert.match(sira, /r\.status === ASSET_SOURCE_UNAVAILABLE_EXIT \|\| \(script === "stok-bul\.js" && r\.status === 2\)/, "a missing PEXELS_KEY is also infrastructure");
  assert.match(sira, /throw new AltyapiHatasi\("ASSET_SOURCE_UNAVAILABLE"/);
  const branch = sira.slice(sira.indexOf("if (e instanceof AltyapiHatasi) {"));
  assert.ok(branch.indexOf("return 1;") >= 0 && branch.indexOf("return 1;") < branch.indexOf("basarisizIsaretle(slug)"), "the queue stops before marking the topic failed");
  for (const fetcher of ["arsiv-bul.js", "stok-bul.js"]) {
    assert.match(fs.readFileSync(path.join(ROOT, fetcher), "utf8"), /Outage\.isTransient\(e\) \? Outage\.ASSET_SOURCE_UNAVAILABLE_EXIT : 1/, fetcher);
  }
});

test("5. outcome categories: SCHEDULED needs a videoId and publishAt; every failure kind is distinct and actionable", () => {
  const stages = (over = {}) => ({ RESEARCH: { status: "done" }, NARRATION: { status: "done" }, UPLOAD: { status: "not-reached" }, SCHEDULE: { status: "not-reached" }, ...over });
  const ok = { outcome: "UPLOADED", videoId: "tSanOctggR4", stages: stages({ UPLOAD: { status: "done", detail: "tSanOctggR4" }, SCHEDULE: { status: "done", detail: "2026-10-13T18:00:00.000Z" } }) };
  assert.equal(Outcome.classify(ok), "SCHEDULED");
  assert.equal(Outcome.classify({ ...ok, stages: stages({ UPLOAD: { status: "done", detail: "tSanOctggR4" }, SCHEDULE: { status: "skipped" } }) }), "PUBLISH_VERIFICATION_FAILED", "no publishAt");
  assert.equal(Outcome.classify({ ...ok, videoId: null, stages: stages({ UPLOAD: { status: "done", detail: null }, SCHEDULE: { status: "done", detail: "2026-10-13T18:00:00.000Z" } }) }), "PUBLISH_VERIFICATION_FAILED", "no videoId");
  assert.equal(Outcome.classify({ outcome: "FAILED", reason: "x: upload failed (exit 3)", stages: stages({ UPLOAD: { status: "failed" } }) }), "UPLOAD_FAILED");
  assert.equal(Outcome.classify({ outcome: "FAILED", reason: "rendered but not uploaded (no credentials)", stages: stages() }), "UPLOAD_FAILED");
  const narration = { outcome: "FAILED", reason: "NARRATION_UNAVAILABLE (slug): Edge 403", stages: stages({ NARRATION: { status: "failed" } }) };
  assert.equal(Outcome.classify(narration, channel({ voice: "am_michael", approved: false })), "AWAITING_APPROVAL");
  assert.equal(Outcome.classify(narration, channel({ voice: "am_michael", approved: true })), "PRODUCTION_FAILED", "an approved fallback that still failed is a production failure");
  assert.equal(Outcome.classify({ outcome: "FAILED", reason: "ASSET_SOURCE_UNAVAILABLE (slug): arsiv-bul.js", stages: stages() }), "PRODUCTION_FAILED");
  assert.equal(Outcome.classify(null), "PRODUCTION_FAILED", "no stage record is a failure, never success");
  for (const category of ["PRODUCTION_FAILED", "UPLOAD_FAILED", "PUBLISH_VERIFICATION_FAILED", "AWAITING_APPROVAL"]) assert.ok(Outcome.FAILING.has(category));
  for (const category of ["SCHEDULED", "NOT_DUE", "DRY_RUN"]) assert.ok(!Outcome.FAILING.has(category) && !Outcome.WARNING.has(category));
  const md = Outcome.markdown([{ channel: "critical-thread", category: "CONTENT_BLOCKED", scheduled: false, publication: "NOT_SCHEDULED", reason: "no topic", stages: null }]);
  assert.match(md, /\| critical-thread \| \*\*CONTENT_BLOCKED\*\* \| \*\*no\*\* \| NOT_SCHEDULED \|/, "the summary says plainly that nothing is on its way");
  assert.match(md, /Scheduled is not published/);
  // The FR primary workflow reports the same table for FR alone (a green run there is not a published video).
  const primary = fs.readFileSync(path.join(ROOT, ".github", "workflows", "uretim-is.yml"), "utf8");
  assert.match(primary, /node scripts\/production-outcome\.js --channel failure-reconstructed/);
  const refused = cp.spawnSync(process.execPath, [path.join(ROOT, "scripts", "production-outcome.js"), "--channel", "behind-the-ordinary"], { encoding: "utf8" });
  assert.equal(refused.status, 2, "an inactive channel is refused");
});

test("6. SCHEDULED is not PUBLICATION_CONFIRMED: only a YouTube-API public observation of that exact video confirms it", () => {
  const Publication = require("../../lib/publication-evidence");
  const video = { videoId: "tSanOctggR4", publishAt: "2026-10-11T18:00:00.000Z" };
  const confirmed = { at: "2026-10-11T18:09:20.695Z", type: "publish.public", videoId: "tSanOctggR4", publishAt: video.publishAt, delayMinutes: 9 };
  assert.equal(Publication.status(video, [], Date.parse("2026-10-11T12:34:00Z")).state, "SCHEDULED", "uploaded with publishAt ahead");
  assert.equal(Publication.status(video, [], Date.parse("2026-10-11T18:30:00Z")).state, "PUBLICATION_PENDING_CHECK");
  const late = Publication.status(video, [], Date.parse("2026-10-11T19:01:00Z"));
  assert.equal(late.state, "PUBLICATION_NOT_CONFIRMED");
  assert.equal(late.overdueMinutes, 61);
  assert.equal(Publication.status(video, [confirmed], Date.parse("2026-10-11T18:10:00Z")).state, "PUBLICATION_CONFIRMED");
  assert.equal(Publication.status(video, [{ ...confirmed, videoId: "d_xBJEX6QJ8" }], Date.parse("2026-10-11T20:00:00Z")).state, "PUBLICATION_NOT_CONFIRMED", "another video's confirmation does not count");
  assert.equal(Publication.status(video, [{ ...confirmed, type: "publish.unexpected_public" }], Date.parse("2026-10-11T20:00:00Z")).state, "PUBLICATION_NOT_CONFIRMED", "only the scheduled-publication check confirms");
  assert.equal(Publication.status({ videoId: "short", publishAt: video.publishAt }, [confirmed]).state, "NOT_SCHEDULED");
  assert.equal(Publication.status({ videoId: video.videoId, publishAt: null }, [confirmed]).state, "NOT_SCHEDULED");
  // The confirmation event is written only on privacyStatus === "public" from the API (bildirim.js yayinKontrol).
  const notifier = fs.readFileSync(path.join(ROOT, "bildirim.js"), "utf8");
  assert.match(notifier, /if \(v && v\.status\.privacyStatus === "public"\) \{\s*\n\s*\/\/[^\n]*\n\s*try \{ require\("\.\/lib\/ops-log"\)\.event\(CHANNEL, "publish\.public"/);
  assert.equal(Publication.CONFIRM_GRACE_MINUTES, 60, "matches bildirim.js: an issue opens 60 minutes after publishAt");
});
