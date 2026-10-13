"use strict";

// Offline acceptance tests for Cloudflare-scheduled production (ops/production-watchdog-worker,
// scripts/verify-dispatch.js, leadDays, retry budgets, publish read-back, publication evidence).
// Nothing here calls GitHub, Cloudflare or YouTube: every API is a stub.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const Calendar = require("../../core/scheduling/calendar");
const Channel = require("../../core/channel-context");
const Dispatch = require("../../scripts/verify-dispatch");
const Budget = require("../../lib/attempt-budget");
const Safety = require("../../lib/publish-safety");
const Evidence = require("../../lib/publication-evidence");
const Outcome = require("../../scripts/production-outcome");

const SHORTS = ["failure-reconstructed", "impossible-brief", "critical-thread"];
const KEY = "test-signing-key";
const worker = () => import(pathToFileURL(path.join(ROOT, "ops", "production-watchdog-worker", "src", "index.mjs")));

// A channel with the real FR schedule (09:00 production, 21:00 Istanbul publish) and an optional leadDays.
function frChannel(leadDays) {
  const real = Channel.getChannel("failure-reconstructed");
  const config = JSON.parse(JSON.stringify(real.config));
  if (leadDays != null) config.publishingCadence.shorts.leadDays = leadDays;
  return { ...real, config };
}

// A throwaway channel whose state lives in a temp dir (budgets never touch the real state).
function tempChannel(slug, retryBudget) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), `budget-${slug}-`));
  return { slug, name: slug, paths: { state }, config: { publishingCadence: { shorts: retryBudget ? { retryBudget } : {} } } };
}

const short = (day, uploadedAt) => ({ format: "short", slug: `s-${day}`, videoId: "abcdefghijk", publishAt: `${day}T18:00:00.000Z`, tarih: uploadedAt || `${day}T07:20:00.000Z` });

// Capture what the Worker sends for one cron.
async function workerDispatch(cron, now = new Date("2026-10-14T07:05:00Z")) {
  const w = await worker();
  let sent = null;
  const result = await w.dispatchEvent({ WATCHDOG_GITHUB_TOKEN: KEY, WATCHDOG_VERSION: "v-test", WATCHDOG_COMMIT: "abc" },
    w.entryForCron(cron), async (url, options) => { sent = { url, body: JSON.parse(options.body), headers: options.headers }; return { status: 204 }; },
    { cron, now: () => now });
  return { result, sent, event: { action: sent.body.event_type, client_payload: sent.body.client_payload } };
}

// 1. Cloudflare dispatch authentication ----------------------------------------------------------

test("AUTH: a Worker-signed dispatch verifies with the Node verifier (same key, same message)", async () => {
  const { sent, event, result } = await workerDispatch("5 7 * * *");
  assert.equal(sent.body.event_type, "shorts-production");
  assert.equal(sent.body.client_payload.slot, "production-1");
  assert.equal(sent.body.client_payload.signature_version, "v1");
  assert.match(sent.body.client_payload.correlation_id, /^production-1-20261014T070500Z-[0-9a-f]{8}$/);
  assert.equal(result.correlationId, sent.body.client_payload.correlation_id);
  const ok = Dispatch.verify({ event, expectedEvents: ["shorts-production"], key: KEY, now: Date.parse("2026-10-14T07:06:00Z") });
  assert.deepEqual({ ok: ok.ok, signed: ok.signed, slot: ok.slot }, { ok: true, signed: true, slot: "production-1" });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(KEY), "the key never appears in the result");
});

test("AUTH: forged, tampered, replayed, unsigned and misrouted dispatches are rejected", async () => {
  const { event } = await workerDispatch("5 13 * * *", new Date("2026-10-14T13:05:00Z"));
  const now = Date.parse("2026-10-14T13:06:00Z");
  const check = (e, extra = {}) => Dispatch.verify({ event: e, expectedEvents: ["shorts-production"], key: KEY, now, ...extra }).code;
  const clone = () => JSON.parse(JSON.stringify(event));
  assert.equal(check(event, { key: "another-key" }), "BAD_SIGNATURE", "a different key");
  let e = clone(); e.client_payload.slot = "production-1"; e.client_payload.correlation_id = e.client_payload.correlation_id.replace("production-2", "production-1");
  assert.equal(check(e), "BAD_SIGNATURE", "slot changed after signing");
  e = clone(); e.client_payload.fired_at = "2026-10-14T13:05:30.000Z";
  assert.equal(check(e), "BAD_SIGNATURE", "timestamp changed after signing");
  e = clone(); e.action = "publication-check";
  assert.equal(Dispatch.verify({ event: e, expectedEvents: ["publication-check"], key: KEY, now }).code, "BAD_SIGNATURE", "a signature cannot be reused for another event");
  assert.equal(check(event, { now: Date.parse("2026-10-14T19:06:00Z") }), "STALE_DISPATCH", "older than 6 h");
  assert.equal(check(event, { now: Date.parse("2026-10-14T13:00:00Z") }), "FUTURE_TIMESTAMP");
  assert.equal(check(event, { expectedEvents: ["publication-check"] }), "UNEXPECTED_EVENT");
  e = clone(); e.client_payload.source = "someone-else";
  assert.equal(check(e), "UNEXPECTED_SOURCE");
  e = clone(); delete e.client_payload.signature; delete e.client_payload.signature_version;
  assert.equal(check(e), "UNSIGNED", "production never accepts an unsigned dispatch");
  e = clone(); e.client_payload.signature_version = "v0";
  assert.equal(check(e), "SIGNATURE_VERSION");
  e = clone(); e.client_payload.correlation_id = "x";
  assert.equal(check(e), "BAD_CORRELATION_ID");
  e = clone(); e.client_payload.signature = "zz";
  assert.equal(check(e), "BAD_SIGNATURE");
  assert.equal(check(event, { key: "" }), "NO_KEY", "no key configured fails closed");
  assert.equal(check(null), "NO_EVENT");
});

test("AUTH: the verifier CLI writes outputs and never prints the key or the signature", async () => {
  const { event } = await workerDispatch("5 7 * * *", new Date());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-dispatch-"));
  fs.writeFileSync(path.join(dir, "event.json"), JSON.stringify(event));
  const out = path.join(dir, "out");
  const run = require("node:child_process").spawnSync(process.execPath, ["scripts/verify-dispatch.js", "--event", "shorts-production"], { cwd: ROOT, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_PATH: path.join(dir, "event.json"), GITHUB_OUTPUT: out, DISPATCH_SIGNING_KEY: KEY } });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(fs.readFileSync(out, "utf8"), /^verified=true\ncorrelation_id=production-1-\d{8}T\d{6}Z-[0-9a-f]{8}\nslot=production-1\n/);
  assert.doesNotMatch(run.stdout + run.stderr, new RegExp(`${KEY}|${event.client_payload.signature}`));
  const bad = require("node:child_process").spawnSync(process.execPath, ["scripts/verify-dispatch.js", "--event", "shorts-production"], { cwd: ROOT, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_PATH: path.join(dir, "event.json"), GITHUB_OUTPUT: out, DISPATCH_SIGNING_KEY: "wrong" } });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /Dispatch rejected::BAD_SIGNATURE/);
});

test("AUTH: workflows verify every dispatch with the existing secret and act only behind flags that default off", () => {
  for (const [file, event, flag] of [[".github/workflows/portfolio-production.yml", "shorts-production", "CF_PRODUCTION_DISPATCH"],
    [".github/workflows/yayin-kontrol.yml", "publication-check", "CF_PUBLICATION_DISPATCH"]]) {
    const wf = read(file);
    assert.match(wf, new RegExp(`repository_dispatch:\\n\\s+types: \\[${event}\\]`), file);
    assert.match(wf, new RegExp(`node scripts/verify-dispatch\\.js --event ${event} --max-age-minutes 360\\n`), `${file} verifies (no --allow-unsigned)`);
    assert.match(wf, /DISPATCH_SIGNING_KEY: \$\{\{ secrets\.WATCHDOG_GITHUB_TOKEN \}\}/, `${file} uses the existing secret`);
    assert.match(wf, new RegExp(`DISPATCH_ENABLED: \\$\\{\\{ vars\\.${flag} \\}\\}`), file);
    assert.match(wf, /= "1" \]/, `${file} needs the flag to be exactly 1`);
    assert.match(wf, /needs: gate/, `${file} work depends on the gate`);
    assert.doesNotMatch(wf, /--allow-unsigned/);
  }
});

// 2. Idempotent repeated dispatches --------------------------------------------------------------

test("IDEMPOTENT: the 07:05 and 13:05 dispatches, a GitHub cron and the watchdog produce at most one Short per day", () => {
  const channel = frChannel(0);
  const first = Calendar.shortDecision(channel, [], new Date("2026-10-14T07:05:00Z"));
  assert.deepEqual([first.due, first.targetDay, first.targetPublishAt], [true, "2026-10-14", "2026-10-14T18:00:00.000Z"]);
  const records = [short("2026-10-14")];
  for (const at of ["2026-10-14T07:40:00Z", "2026-10-14T13:05:00Z", "2026-10-14T16:35:00Z"]) {
    const again = Calendar.shortDecision(channel, records, new Date(at));
    assert.equal(again.due, false, at);
    assert.match(again.reason, /already exists/);
  }
  assert.throws(() => Calendar.publishSlot(channel, records, new Date("2026-10-14T13:05:00Z"), 10, { targetDay: "2026-10-14" }), { code: "PUBLISH_SLOT_TAKEN" });
  const wf = read(".github/workflows/portfolio-production.yml");
  assert.match(wf, /concurrency:\n\s+group: portfolio-production\n\s+cancel-in-progress: false/, "runs are serialized, never parallel");
  assert.match(read(".github/workflows/yayin-kontrol.yml"), /group: portfolio-production/);
});

test("IDEMPOTENT: a Short pre-uploaded for today (tarih yesterday) also blocks a second upload", () => {
  const decision = Calendar.shortDecision(frChannel(0), [short("2026-10-14", "2026-10-13T08:00:00.000Z")], new Date("2026-10-14T07:05:00Z"));
  assert.equal(decision.due, false);
});

// 3. One-day-ahead production --------------------------------------------------------------------

test("LEAD: leadDays defaults to 0 on every channel and is capped", () => {
  for (const slug of SHORTS) {
    const config = JSON.parse(read(`channels/${slug}/config.json`));
    assert.equal(config.publishingCadence.shorts.leadDays, 0, `${slug} stays same-day until the owner enables it`);
    assert.equal(Calendar.shortSchedule(Channel.getChannel(slug)).leadDays, 0);
    assert.equal(Calendar.shortSchedule(Channel.getChannel(slug)).publishTime, "21:00");
    assert.equal(Calendar.shortSchedule(Channel.getChannel(slug)).publishTimeZone, "Europe/Istanbul");
  }
  assert.equal(Calendar.shortSchedule(frChannel(9)).leadDays, Calendar.MAX_LEAD_DAYS);
  assert.equal(Calendar.shortSchedule(frChannel(-1)).leadDays, 0);
});

test("LEAD: with leadDays 1, today comes first; then tomorrow's 21:00 slot is produced, never a taken day", () => {
  const channel = frChannel(1);
  const early = Calendar.shortDecision(channel, [], new Date("2026-10-14T05:00:00Z"));
  assert.equal(early.due, false, "before today's production time nothing is produced, not even ahead");
  const today = Calendar.shortDecision(channel, [], new Date("2026-10-14T07:05:00Z"));
  assert.deepEqual([today.due, today.ahead, today.targetDay], [true, false, "2026-10-14"]);
  const ahead = Calendar.shortDecision(channel, [short("2026-10-14")], new Date("2026-10-14T13:05:00Z"));
  assert.deepEqual([ahead.due, ahead.ahead, ahead.targetDay, ahead.targetPublishAt], [true, true, "2026-10-15", "2026-10-15T18:00:00.000Z"]);
  assert.match(ahead.reason, /^ahead: producing 2026-10-15's Short/);
  const uploadedAhead = { ...short("2026-10-15"), tarih: "2026-10-14T13:30:00.000Z" };
  const done = Calendar.shortDecision(channel, [short("2026-10-14"), uploadedAhead], new Date("2026-10-14T16:35:00Z"));
  assert.equal(done.due, false, "leadDays 1 never fills two future days");
  const next = Calendar.shortDecision(channel, [short("2026-10-14"), uploadedAhead], new Date("2026-10-15T04:05:00Z"));
  assert.equal(next.due, false, "next morning before production: nothing");
  const rolling = Calendar.shortDecision(channel, [short("2026-10-14"), uploadedAhead], new Date("2026-10-15T07:05:00Z"));
  assert.deepEqual([rolling.ahead, rolling.targetDay], [true, "2026-10-16"], "the day after keeps the one-day lead");
  assert.equal(Calendar.publishSlot(channel, [short("2026-10-14")], new Date("2026-10-14T13:05:00Z"), 10, { targetDay: "2026-10-15" }).toISOString(), "2026-10-15T18:00:00.000Z");
  const off = Calendar.shortDecision(frChannel(0), [short("2026-10-14")], new Date("2026-10-14T13:05:00Z"));
  assert.equal(off.due, false, "leadDays 0 keeps today's behaviour");
});

test("LEAD: the target day reaches the uploader and both pipelines", () => {
  const uploader = read("youtube-yukle.js");
  assert.match(uploader, /const hedefGun = process\.env\.SHORTS_TARGET_DAY/);
  assert.match(uploader, /hedefGun \? \{ targetDay: hedefGun \} : \{\}/);
  assert.match(read("shorts-sira.js"), /SHORTS_TARGET_DAY: HEDEF_GUN/);
  assert.match(read("core/pipeline/impossible-brief.js"), /SHORTS_TARGET_DAY: targetDay/);
  assert.match(read("yayin-plani.js"), /hedefGun: gun\.targetDay/);
});

// 4. Private uploads and publishAt read-back ------------------------------------------------------

test("READBACK: an upload is only SCHEDULED when YouTube reports private + the exact publishAt", async () => {
  const api = (response) => ({ data: async () => response });
  const once = { attempts: 1 };
  const item = (status) => ({ ok: true, veri: { items: [{ id: "abcdefghijk", status }] } });
  const publishAt = "2026-10-15T18:00:00.000Z";
  assert.equal((await Safety.verifyScheduled(api(item({ privacyStatus: "private", publishAt: "2026-10-15T18:00:00Z" })), "abcdefghijk", { publishAt, ...once })).ok, true);
  assert.equal((await Safety.verifyScheduled(api(item({ privacyStatus: "public", publishAt })), "abcdefghijk", { publishAt, ...once })).code, "READBACK_PRIVACY_MISMATCH");
  assert.equal((await Safety.verifyScheduled(api(item({ privacyStatus: "private", publishAt: "2026-10-16T18:00:00Z" })), "abcdefghijk", { publishAt, ...once })).code, "READBACK_PUBLISHAT_MISMATCH");
  assert.equal((await Safety.verifyScheduled(api(item({ privacyStatus: "private" })), "abcdefghijk", { publishAt, ...once })).code, "READBACK_PUBLISHAT_MISMATCH");
  assert.equal((await Safety.verifyScheduled(api({ ok: true, veri: { items: [] } }), "abcdefghijk", { publishAt, ...once })).code, "READBACK_NOT_FOUND");
  assert.equal((await Safety.verifyScheduled(api({ ok: false, durum: 503 }), "abcdefghijk", { publishAt, ...once })).code, "READBACK_UNAVAILABLE");
  assert.equal((await Safety.verifyScheduled({ data: async () => { throw new Error("socket hang up"); } }, "abcdefghijk", { publishAt, ...once })).code, "READBACK_UNAVAILABLE");
});

test("READBACK: the uploader stays private by default, exits 15 on a failed read-back and 16 on an unavailable target slot", () => {
  const uploader = read("youtube-yukle.js");
  assert.match(uploader, /let gizlilik = \(env\("YT_PRIVACY"\) \|\| "private"\)\.toLowerCase\(\);/);
  assert.match(uploader, /Safety\.verifyScheduled\(/);
  assert.match(uploader, /PUBLISH_VERIFICATION_FAILED/);
  assert.match(uploader, /process\.exitCode = 15/);
  assert.match(uploader, /process\.exit\(16\)/);
  const outcome = (reason) => Outcome.classify({ outcome: "FAILED", reason, stages: { UPLOAD: { status: "done", detail: "abcdefghijk" }, SCHEDULE: { status: "failed" } } });
  assert.equal(outcome("PUBLISH_VERIFICATION_FAILED: READBACK_PUBLISHAT_MISMATCH"), "PUBLISH_VERIFICATION_FAILED");
  assert.equal(outcome("PUBLISH_SLOT_UNAVAILABLE: target day 2026-10-14"), "PRODUCTION_FAILED");
  assert.equal(Outcome.classify({ outcome: "UPLOADED", videoId: "abcdefghijk", stages: { UPLOAD: { status: "done" }, SCHEDULE: { status: "done", detail: "2026-10-14T18:00:00.000Z" } } }), "SCHEDULED");
});

// 5. Channel isolation ---------------------------------------------------------------------------

test("ISOLATION: budgets, lead days and schedules are per channel", () => {
  const fr = tempChannel("failure-reconstructed");
  const ib = tempChannel("impossible-brief");
  for (let i = 0; i < 3; i += 1) assert.equal(Budget.take(fr, "2026-10-14", "render").ok, true);
  assert.equal(Budget.take(fr, "2026-10-14", "render").ok, false);
  assert.equal(Budget.take(ib, "2026-10-14", "render").ok, true, "IB keeps its own budget");
  assert.equal(Budget.status(ib, "2026-10-14", "render").used, 1);
  assert.notEqual(Budget.file(fr), Budget.file(ib));
  const paths = new Set(SHORTS.map((slug) => Budget.file(Channel.getChannel(slug))));
  assert.equal(paths.size, 3, "every real channel writes its own attempts file");
  const ahead = Calendar.shortDecision(frChannel(1), [short("2026-10-14")], new Date("2026-10-14T13:05:00Z"));
  const ct = Calendar.shortDecision(Channel.getChannel("critical-thread"), [short("2026-10-14")], new Date("2026-10-14T13:05:00Z"));
  assert.equal(ahead.ahead, true);
  assert.equal(ct.due, false, "another channel's leadDays does not change CT");
});

// 6. Retry budget exhaustion ---------------------------------------------------------------------

test("BUDGET: 5 topics, 3 renders, 2 uploads per channel and target day; a spent budget records nothing", () => {
  const channel = tempChannel("x");
  assert.deepEqual(Budget.limits(channel), { topics: 5, render: 3, upload: 2 });
  for (let i = 1; i <= 2; i += 1) assert.equal(Budget.take(channel, "2026-10-14", "upload").used, i);
  const spent = Budget.take(channel, "2026-10-14", "upload");
  assert.deepEqual([spent.ok, spent.used, spent.limit], [false, 2, 2]);
  assert.equal(Budget.exhaustedReason(spent), "RETRY_BUDGET_EXHAUSTED: upload 2/2 for 2026-10-14");
  assert.equal(Budget.load(channel).days["2026-10-14"].upload, 2, "the refused attempt is not counted");
  assert.equal(Budget.take(channel, "2026-10-15", "upload").ok, true, "the next target day has a fresh budget");
  for (let i = 0; i < 5; i += 1) assert.equal(Budget.take(channel, "2026-10-14", "topics").ok, true);
  assert.equal(Budget.take(channel, "2026-10-14", "topics").ok, false);
  assert.deepEqual(Budget.limits(tempChannel("y", { render: 1, upload: 0 })), { topics: 5, render: 1, upload: 2 }, "invalid overrides fall back");
  assert.throws(() => Budget.take(channel, "14.10.2026", "render"), /invalid target day/);
  assert.throws(() => Budget.take(channel, "2026-10-14", "publish"), /unknown kind/);
  assert.equal(Outcome.classify({ outcome: "FAILED", reason: Budget.exhaustedReason(spent), stages: {} }), "PRODUCTION_FAILED");
});

test("BUDGET: both pipelines check the budget before topics, rendering and uploading, and keep the topic", () => {
  const fr = read("shorts-sira.js");
  const order = ["butce(\"topics\")", "butce(\"render\")", "butce(\"upload\")"].map((s) => fr.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "FR: topics < render < upload");
  assert.ok(fr.indexOf("butce(\"upload\")") < fr.indexOf("SHORTS_TARGET_DAY: HEDEF_GUN"), "FR: budget before the upload spawn");
  const ib = read("core/pipeline/impossible-brief.js");
  assert.match(ib, /budget\("topics"\)/);
  assert.match(ib, /budget\("render"\)/);
  assert.match(ib, /budget\("upload"\)/);
  assert.ok(ib.indexOf("budget(\"upload\")") < ib.indexOf("SHORTS_TARGET_DAY: targetDay"), "IB/CT: budget before the upload spawn");
  assert.match(ib, /no more attempts for this day; topic kept/);
});

// 7. Missed publishing deadlines -----------------------------------------------------------------

test("MISSED: a missed day is reported, never moved to the next day's slot", () => {
  const channel = frChannel(0);
  const late = Calendar.shortDecision(channel, [], new Date("2026-10-14T17:30:00Z"));
  assert.equal(late.due, false);
  assert.match(late.reason, /window closed/);
  assert.throws(() => Calendar.publishSlot(channel, [], new Date("2026-10-14T17:55:00Z"), 10, { targetDay: "2026-10-14" }), { code: "PUBLISH_SLOT_MISSED" });
  assert.throws(() => Calendar.publishSlot(channel, [], new Date("2026-10-14T17:55:00Z"), 10, { targetDay: "bad" }), { code: "PUBLISH_SLOT_INVALID" });
  const withLead = Calendar.shortDecision(frChannel(1), [], new Date("2026-10-14T17:30:00Z"));
  assert.deepEqual([withLead.ahead, withLead.targetDay], [true, "2026-10-15"], "with leadDays the next day's own Short is produced, today stays missed");
  assert.match(withLead.reason, /today's window closed/);
});

// 8. Delayed GitHub Actions runs ------------------------------------------------------------------

test("DELAYED: a run GitHub starts hours late does not produce for the wrong day", async () => {
  const { event } = await workerDispatch("5 13 * * *", new Date("2026-10-14T13:05:00Z"));
  const startedAt = Date.parse("2026-10-14T21:30:00Z"); // 00:30 Istanbul on 10-15
  assert.equal(Dispatch.verify({ event, expectedEvents: ["shorts-production"], key: KEY, now: startedAt }).code, "STALE_DISPATCH");
  const decision = Calendar.shortDecision(frChannel(0), [short("2026-10-14")], new Date(startedAt));
  assert.equal(decision.today, "2026-10-15");
  assert.equal(decision.due, false, "after midnight Istanbul, before 09:00: the new day is not due yet");
  const inside = Dispatch.verify({ event, expectedEvents: ["shorts-production"], key: KEY, now: Date.parse("2026-10-14T16:00:00Z") });
  assert.equal(inside.ok, true, "a delay inside 6 h is still accepted; the calendar decides what is due");
});

// 9. YouTube API uncertainty and duplicate prevention ---------------------------------------------

test("UNCERTAIN: a Short uploaded but not recorded is found on YouTube by its deterministic slot, not uploaded again", async () => {
  const channel = frChannel(0);
  const publishAt = Calendar.publishSlot(channel, [], new Date("2026-10-14T13:05:00Z"), 10, { targetDay: "2026-10-14" }).toISOString();
  assert.equal(publishAt, "2026-10-14T18:00:00.000Z", "a retry for the same target day asks for the same slot");
  const recent = [{ id: "abcdefghijk", title: "An earlier title", publishAt: "2026-10-14T18:00:00Z" }];
  assert.deepEqual(Safety.matchRemote(recent, { title: "A different retry title", publishAt }), { videoId: "abcdefghijk", matchedBy: "publishAt" });
  assert.equal(Safety.matchRemote(recent, { title: "Other", publishAt: "2026-10-15T18:00:00.000Z" }), null);
  const failing = { data: async (url) => (url.startsWith("channels") ? { ok: true, veri: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] } } : { ok: false, durum: 500 }) };
  await assert.rejects(() => Safety.recentUploads(failing), { code: "RECONCILE_UNAVAILABLE" });
  const uploader = read("youtube-yukle.js");
  assert.ok(uploader.indexOf("Safety.matchRemote(") < uploader.indexOf("Safety.verifyScheduled("), "reconcile happens before uploading");
  assert.match(uploader, /RECONCILE_UNAVAILABLE/);
  const fr = read("shorts-sira.js");
  assert.match(fr, /r\.status === 15/);
  assert.match(fr, /class YayinDogrulamaHatasi/);
});

// 10. No unapproved narration or low-quality uploads ----------------------------------------------

test("QUALITY: dispatch changes nothing about voice approval, the upload guard or quality gates", () => {
  const uploader = read("youtube-yukle.js");
  assert.match(uploader, /require\("\.\/lib\/shorts-tts"\)\.uploadAllowed\(CHANNEL, BASE\)/);
  assert.match(uploader, /process\.exit\(14\)/);
  for (const slug of SHORTS) {
    const voice = JSON.parse(read(`channels/${slug}/config.json`)).voice || {};
    assert.notEqual(voice.fallback && voice.fallback.approved, true, `${slug} fallback voice stays unapproved`);
  }
  assert.match(read("shorts-sira.js"), /kapi\(/, "FR quality gate still runs");
  const wf = read(".github/workflows/portfolio-production.yml");
  assert.doesNotMatch(wf, /SHORTS_CRAFT_V2: '?1/, "Shorts craft v2 stays off");
  assert.match(wf, /PUBLISH: \$\{\{ vars\.BTO_PUBLISH == '1' && '1' \|\| '0' \}\}/, "BTO stays opt-in");
});

// 11. Publication status reconciliation -----------------------------------------------------------

test("PUBLICATION: scheduled is not published; only a YouTube-confirmed public video counts", () => {
  const video = { videoId: "abcdefghijk", publishAt: "2026-10-14T18:00:00.000Z" };
  assert.equal(Evidence.status(video, [], Date.parse("2026-10-14T17:00:00Z")).state, "SCHEDULED");
  assert.equal(Evidence.status(video, [], Date.parse("2026-10-14T18:30:00Z")).state, "PUBLICATION_PENDING_CHECK");
  assert.equal(Evidence.status(video, [], Date.parse("2026-10-14T19:05:00Z")).state, "PUBLICATION_NOT_CONFIRMED", "the 19:05 UTC check is past the 60 min grace");
  assert.equal(Evidence.status(video, [{ type: "publish.public", videoId: "abcdefghijk", at: "2026-10-14T18:01:00Z" }], Date.parse("2026-10-14T19:05:00Z")).state, "PUBLICATION_CONFIRMED");
  assert.equal(Evidence.status(video, [{ type: "publish.public", videoId: "zzzzzzzzzzz" }], Date.parse("2026-10-14T19:05:00Z")).state, "PUBLICATION_NOT_CONFIRMED", "another video's confirmation does not count");
  const wf = read(".github/workflows/yayin-kontrol.yml");
  assert.match(wf, /production-outcome\.js --publication --days 3/);
});

// 12. Existing watchdog compatibility -------------------------------------------------------------

test("WATCHDOG: the 16:35 UTC dispatch keeps its event, its receiver and every field it reads", async () => {
  const w = await worker();
  let body = null;
  await w.dispatchWatchdog({ WATCHDOG_GITHUB_TOKEN: KEY }, async (url, options) => { body = JSON.parse(options.body); return { status: 204 }; });
  assert.equal(body.event_type, "production-sla-watchdog");
  for (const field of ["source", "fired_at", "worker_version", "worker_commit", "correlation_id"]) assert.ok(body.client_payload[field] != null, field);
  assert.equal(body.client_payload.source, "cloudflare-cron");
  assert.equal(body.client_payload.slot, "sla-watchdog");
  const receiver = read(".github/workflows/production-watchdog.yml");
  assert.match(receiver, /types: \[production-sla-watchdog, production-sla-watchdog-self-test\]/);
  assert.doesNotMatch(receiver, /verify-dispatch/, "the watchdog receiver is unchanged");
  const health = await (await w.default.fetch(new Request("https://watchdog.example/health"), { WATCHDOG_GITHUB_TOKEN: KEY })).json();
  assert.equal(health.eventType, "production-sla-watchdog");
  assert.equal(health.cron, "35 16 * * *");
  assert.equal(health.signatureVersion, "v1");
  assert.deepEqual(health.schedule.map((row) => row.cron), ["5 7 * * *", "5 13 * * *", "35 16 * * *", "5 19 * * *"]);
  assert.doesNotMatch(JSON.stringify(health), new RegExp(KEY));
});

test("WATCHDOG: each cron sends exactly its own event; an unknown cron sends nothing", async () => {
  const w = await worker();
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => { sent.push(JSON.parse(options.body).event_type); return { status: 204 }; };
  try {
    for (const cron of ["5 7 * * *", "5 13 * * *", "35 16 * * *", "5 19 * * *", "0 0 * * *"]) {
      const pending = [];
      await w.default.scheduled({ cron }, { WATCHDOG_GITHUB_TOKEN: KEY }, { waitUntil: (p) => pending.push(p) });
      await Promise.all(pending);
    }
  } finally { globalThis.fetch = original; }
  assert.deepEqual(sent, ["shorts-production", "shorts-production", "production-sla-watchdog", "publication-check"]);
});

test("WATCHDOG: wrangler.toml, the deploy workflow and the Worker agree on four crons (Free plan: 5 per account)", async () => {
  const w = await worker();
  const toml = read("ops/production-watchdog-worker/wrangler.toml");
  const crons = JSON.parse(toml.match(/crons = (\[[^\]]*\])/)[1]);
  assert.deepEqual(crons, Object.keys(w.SCHEDULE));
  assert.ok(crons.length <= 5);
  const deploy = read(".github/workflows/deploy-watchdog.yml");
  assert.equal(deploy.match(/DISPATCH_CRONS: '([^']+)'/)[1], crons.join("|"));
  assert.match(deploy, /WATCHDOG_CRON: '35 16 \* \* \*'/);
  assert.equal(w.entryForCron("35 16 * * *").event, "production-sla-watchdog");
});

test("GITHUB BACKUP: schedule runs still publish; manual runs stay opt-in; dispatch runs act like schedule runs only behind the gate", () => {
  const wf = read(".github/workflows/portfolio-production.yml");
  assert.match(wf, /\n {2}schedule:\n/, "the GitHub crons stay as the backup");
  assert.doesNotMatch(wf, /!= 'workflow_dispatch'/, "publishing is an allow-list, never 'any event except manual'");
  for (const line of wf.split("\n").filter((l) => /github\.event_name == 'schedule'/.test(l))) {
    assert.match(line, /\(github\.event_name == 'schedule' \|\| github\.event_name == 'repository_dispatch'\)/, `schedule and verified dispatch are treated alike: ${line.trim()}`);
  }
  assert.match(wf, /if: needs\.gate\.outputs\.run == 'true'/);
  assert.match(wf, /DISPATCH_CORRELATION_ID: \$\{\{ needs\.gate\.outputs\.correlation_id \}\}/);
  assert.match(read("lib/run-stages.js"), /correlationId: env\.DISPATCH_CORRELATION_ID/);
});

// Review regressions (final security / production-readiness review) ------------------------------

test("REVIEW: publishing follows an explicit event allow-list; a new trigger type would not publish", () => {
  const wf = read(".github/workflows/portfolio-production.yml");
  const publishLines = wf.split("\n").filter((line) => /PUBLISH: \$\{\{/.test(line) && /'1'/.test(line));
  assert.ok(publishLines.length >= 4);
  for (const line of publishLines) {
    if (/BTO_PUBLISH/.test(line)) continue;
    assert.match(line, /\(github\.event_name == 'schedule' \|\| github\.event_name == 'repository_dispatch'\) && '1'/, line.trim());
  }
  const triggers = wf.slice(wf.indexOf("\non:"), wf.indexOf("\nconcurrency:"));
  assert.deepEqual([...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort(), ["repository_dispatch", "schedule", "workflow_dispatch"]);
});

test("REVIEW: read-back retries YouTube's post-insert lag, but a mismatch is final at once", async () => {
  const publishAt = "2026-10-15T18:00:00.000Z";
  const ok = { ok: true, veri: { items: [{ id: "abcdefghijk", status: { privacyStatus: "private", publishAt } }] } };
  const sequence = (...responses) => { let i = 0; return { data: async () => responses[Math.min(i++, responses.length - 1)] }; };
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const lagged = await Safety.verifyScheduled(sequence({ ok: true, veri: { items: [] } }, ok), "abcdefghijk", { publishAt, sleep });
  assert.deepEqual([lagged.ok, lagged.attempts, sleeps], [true, 2, [10000]]);
  sleeps.length = 0;
  const down = await Safety.verifyScheduled(sequence({ ok: false, durum: 503 }), "abcdefghijk", { publishAt, sleep });
  assert.deepEqual([down.ok, down.code, down.attempts, sleeps.length], [false, "READBACK_UNAVAILABLE", 3, 2]);
  sleeps.length = 0;
  const wrong = await Safety.verifyScheduled(sequence({ ok: true, veri: { items: [{ status: { privacyStatus: "public", publishAt } }] } }), "abcdefghijk", { publishAt, sleep });
  assert.deepEqual([wrong.code, wrong.attempts, sleeps.length], ["READBACK_PRIVACY_MISMATCH", 1, 0]);
});

test("REVIEW: an upload whose read-back failed still spends its topic (never produced a second time)", () => {
  const fr = read("shorts-sira.js");
  const exit15 = fr.slice(fr.indexOf("if (r.status === 15)"), fr.indexOf("if (r.status === 16)"));
  assert.ok(exit15.indexOf("isaretle(slug)") > 0 && exit15.indexOf("isaretle(slug)") < exit15.indexOf("throw new YayinDogrulamaHatasi"));
  const ib = read("core/pipeline/impossible-brief.js");
  const ib15 = ib.slice(ib.indexOf("if (upload.status === 15) {"), ib.indexOf("run.outcome(\"FAILED\", `${topic.slug}: ${code}`)"));
  assert.match(ib15, /recordGenerated\(channel, topic, true\)/);
});

test("REVIEW: an outage before rendering/uploading gives back topic and render attempts, never upload attempts", () => {
  const channel = tempChannel("outage");
  for (let i = 0; i < 3; i += 1) { Budget.take(channel, "2026-10-14", "topics"); Budget.take(channel, "2026-10-14", "render"); }
  assert.equal(Budget.status(channel, "2026-10-14", "render").ok, false, "three narration outages would have spent the day");
  for (let i = 0; i < 3; i += 1) { Budget.release(channel, "2026-10-14", "topics"); Budget.release(channel, "2026-10-14", "render"); }
  assert.deepEqual([Budget.status(channel, "2026-10-14", "render").used, Budget.status(channel, "2026-10-14", "topics").used], [0, 0]);
  assert.equal(Budget.release(channel, "2026-10-14", "render").used, 0, "never below zero");
  Budget.take(channel, "2026-10-14", "upload");
  assert.throws(() => Budget.release(channel, "2026-10-14", "upload"), /never released/);
  assert.equal(Budget.status(channel, "2026-10-14", "upload").used, 1);
  const fr = read("shorts-sira.js");
  assert.match(fr, /if \(e instanceof AltyapiHatasi\) \{\n\s+if \(HEDEF_GUN\) butceIade\(\);/);
  assert.match(fr, /ALINAN\.filter\(\(k\) => k !== "upload"\)/);
  const ib = read("core/pipeline/impossible-brief.js");
  const narration = ib.slice(ib.indexOf("if (error.code === \"NARRATION_UNAVAILABLE\")"), ib.indexOf("GrowthRuntime.alert(channel, \"NARRATION_UNAVAILABLE\""));
  assert.match(narration, /Budget\.release\(channel, targetDay, "topics"\)/);
  assert.match(narration, /Budget\.release\(channel, targetDay, "render"\)/);
  assert.doesNotMatch(ib, /Budget\.release\([^)]*"upload"\)/);
});

test("REVIEW: a partial deploy (new script, old single cron) keeps the watchdog working", async () => {
  const w = await worker();
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => { sent.push(JSON.parse(options.body)); return { status: 204 }; };
  try {
    const pending = [];
    await w.default.scheduled({ cron: "35 16 * * *" }, { WATCHDOG_GITHUB_TOKEN: KEY }, { waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  } finally { globalThis.fetch = original; }
  assert.deepEqual(sent.map((body) => [body.event_type, body.client_payload.slot]), [["production-sla-watchdog", "sla-watchdog"]]);
});

test("DEPLOY: the watchdog deploy workflow defaults to a read-only preflight and checks capacity before any change", () => {
  const deploy = read(".github/workflows/deploy-watchdog.yml");
  assert.match(deploy, /mode:\n\s+description:[^\n]*\n\s+type: choice\n\s+options: \[preflight, deploy\]\n\s+default: preflight/);
  const step = (name) => deploy.indexOf(`- name: ${name}`);
  const order = ["Refuse when dispatch flags are already enabled", "Preflight — account cron capacity and current watchdog",
    "Store GitHub dispatch token in the Worker", "Deploy Worker and independent cron trigger", "Verify deployed version, cron, secret and health endpoint"].map(step);
  assert.ok(order.every((i) => i > 0) && order.every((v, i) => i === 0 || order[i - 1] < v), "flags and capacity are checked before the secret, deploy and verify steps");
  for (const name of ["Store GitHub dispatch token in the Worker", "Deploy Worker and independent cron trigger", "Verify deployed version, cron, secret and health endpoint"]) {
    assert.match(deploy.slice(step(name), step(name) + 200), /\n\s+if: inputs\.mode == 'deploy'\n/, `${name} runs only in deploy mode`);
  }
  const preflight = deploy.slice(step("Preflight — account cron capacity and current watchdog"), step("Store GitHub dispatch token in the Worker"));
  assert.doesNotMatch(preflight, /-X (PUT|POST|DELETE|PATCH)|wrangler@\$WRANGLER_VERSION" (deploy|secret|rollback|triggers)\s/, "the preflight is read-only");
  assert.match(preflight, /workers\/scripts"/);
  assert.match(preflight, /\/schedules"/);
  assert.match(preflight, /if \[ \$\(\(OTHER \+ NEEDED\)\) -gt "\$CRON_LIMIT" \]; then[\s\S]*?exit 9/);
  assert.match(deploy, /CRON_LIMIT: \$\{\{ vars\.CF_WORKERS_PLAN == 'paid' && '250' \|\| '5' \}\}/, "the Free limit is assumed unless the owner says otherwise");
  assert.match(deploy, /vars\.CF_PRODUCTION_DISPATCH[\s\S]*vars\.CF_PUBLICATION_DISPATCH[\s\S]*exit 7/);
  assert.doesNotMatch(deploy, /wrangler@\$WRANGLER_VERSION" rollback/, "rollback goes through a redeploy, never Cloudflare version rollback");
});
