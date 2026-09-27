"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { KOK, jsonOku } = require("../../lib/ortak");
const SLA = require("../../production-sla-check");
const Recovery = require("../../core/scheduling/recovery");
const TikTok = require("../../tiktok-yukle");

test("production SLA emits the required healthy machine-readable shape", () => {
  const result = SLA.evaluateSnapshot({
    date: "2026-09-27",
    deadlineUtc: "16:30",
    channel: "failure-reconstructed",
    published: [{ slug: "deepwater-horizon-2010", videoId: "aScjSrwqeRk", format: "short", tarih: "2026-09-27T12:31:08Z", publishAt: "2026-09-27T18:00:00Z", kalite: "PUBLISH" }],
    generated: ["deepwater-horizon-2010"],
    notifications: { "video:aScjSrwqeRk": "2026-09-27T12:33:01Z" },
    quality: { asama: "final", karar: "PUBLISH" },
    remoteVideoExists: true,
    youtubeVerified: true,
  });
  assert.deepEqual({ produced: result.produced, uploaded: result.uploaded, scheduled: result.scheduled,
    videoId: result.videoId, publishAt: result.publishAt, quality: result.quality, healthy: result.healthy }, {
    produced: true, uploaded: true, scheduled: true, videoId: "aScjSrwqeRk",
    publishAt: "2026-09-27T18:00:00Z", quality: "PUBLISH", healthy: true,
  });
  assert.equal(result.verification, "youtube-api");
});

test("missed scheduler starts recovery; a human is notified only if recovery also fails", () => {
  const missing = SLA.evaluateSnapshot({ date: "2026-09-28", channel: "failure-reconstructed",
    published: [], generated: [], notifications: {}, quality: null, remoteVideoExists: false });
  assert.equal(Recovery.decide(missing).startProduction, true);
  assert.equal(Recovery.decide(missing).notifyHuman, false);
  assert.equal(Recovery.afterRecovery(missing, { started: true }).notifyHuman, true);
  const recovered = { ...missing, scheduled: true, productionReady: true, notificationExists: true, healthy: true };
  assert.equal(Recovery.afterRecovery(recovered, { started: true }).notifyHuman, false);
});

test("TikTok duplicate protection treats any durable publishId as already sent", () => {
  assert.equal(TikTok.dahaOnceGonderildi({ slug: "x", publishId: "v_1", durum: "PROCESSING_UPLOAD" }), true);
  assert.equal(TikTok.dahaOnceGonderildi({ slug: "x", durum: "SEND_TO_USER_INBOX" }), true);
  assert.equal(TikTok.dahaOnceGonderildi({ slug: "x", durum: "FAILED" }), false);
  assert.equal(TikTok.dahaOnceGonderildi(null), false);
});

test("current historical TikTok candidate is Tacoma Narrows", () => {
  const sent = new Set(jsonOku(path.join(KOK, "icerik", "tiktok.json"), []).map((item) => item.slug));
  if (!sent.has("tacoma-narrows")) assert.equal(TikTok.gecmisKuyrugu()[0].slug, "tacoma-narrows");
});

test("workflow sends actual production result before one historical backlog item", () => {
  const source = fs.readFileSync(path.join(KOK, ".github", "workflows", "uretim-is.yml"), "utf8");
  const today = source.indexOf('tiktok-yukle.js "$SLUG" --source-result="$RESULT"');
  const backlog = source.indexOf("tiktok-yukle.js --gecmis");
  assert.ok(today > 0 && backlog > today);
  assert.match(source, /PRODUCTION_RESULT_PATH/);
  assert.doesNotMatch(source, /^\s*if:\s*!inputs/m, "YAML tag syntax must not break the reusable workflow");
});

test("Cloudflare watchdog sends the independent repository_dispatch event", async () => {
  const worker = await import(pathToFileURL(path.join(KOK, "ops", "production-watchdog-worker", "src", "index.mjs")));
  let request = null;
  const result = await worker.dispatchWatchdog({ WATCHDOG_GITHUB_TOKEN: "test-token", GITHUB_REPOSITORY: "eyazan/youtube-otomasyon" }, async (url, options) => {
    request = { url, options };
    return { status: 204 };
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(request.options.body).event_type, "production-sla-watchdog");
  assert.match(request.url, /repos\/eyazan\/youtube-otomasyon\/dispatches$/);
  assert.doesNotMatch(JSON.stringify(result), /test-token/);
});
