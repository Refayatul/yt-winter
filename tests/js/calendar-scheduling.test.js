"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Channel = require("../../core/channel-context");
const Calendar = require("../../core/scheduling/calendar");
const Scheduler = require("../../core/scheduling");
const Sla = require("../../production-sla-check");

const FR = Channel.getChannel("failure-reconstructed");
const IB = Channel.getChannel("impossible-brief");
const CT = Channel.getChannel("critical-thread");
const SLOTS = [[FR, "09:00", "06:00"], [IB, "09:30", "06:30"], [CT, "10:00", "07:00"]];
const DAY = "2026-10-02";
const at = (utc) => new Date(`${DAY}T${utc}:00Z`);
const yesterdays = [{ format: "short", slug: "yesterday", videoId: "AAAAAAAAAAA", tarih: "2026-10-01T06:20:00Z", publishAt: "2026-10-01T18:00:00.000Z" }];

test("each channel is not due before its Istanbul production slot and due at/after it", () => {
  for (const [channel, local, utc] of SLOTS) {
    const [h, m] = utc.split(":").map(Number);
    const before = new Date(Date.UTC(2026, 9, 2, h, m) - 60000);
    const decisionBefore = Calendar.shortDecision(channel, yesterdays, before);
    assert.equal(decisionBefore.due, false, `${channel.slug} one minute before ${local}`);
    assert.match(decisionBefore.reason, new RegExp(`before production slot ${local}`));
    assert.equal(Calendar.shortDecision(channel, yesterdays, at(utc)).due, true, `${channel.slug} at ${local}`);
    assert.equal(Calendar.shortDecision(channel, yesterdays, at("12:00")).due, true, `${channel.slug} after ${local}`);
    assert.equal(Calendar.shortDecision(channel, yesterdays, at(utc)).productionAt, `${DAY}T${utc}:00.000Z`);
  }
});

test("all three channels schedule the public release for 21:00 Istanbul (18:00 UTC) the same day", () => {
  for (const [channel, , utc] of SLOTS) {
    const decision = Calendar.shortDecision(channel, yesterdays, at(utc));
    assert.equal(decision.publishAt, `${DAY}T18:00:00.000Z`);
    // The uploader runs a few minutes after production starts.
    const uploadedAt = new Date(at(utc).getTime() + 12 * 60000);
    assert.equal(Calendar.publishSlot(channel, yesterdays, uploadedAt).toISOString(), `${DAY}T18:00:00.000Z`);
  }
});

test("yesterday's 21:00 Short does not block this morning's production", () => {
  // The old rolling rule (last publishAt + 24 h) kept this "not due" until 21:00.
  for (const [channel, , utc] of SLOTS) {
    const decision = Calendar.shortDecision(channel, yesterdays, at(utc));
    assert.equal(decision.due, true, channel.slug);
    assert.equal(decision.lastDay, "2026-10-01");
  }
  const YP = require("../../yayin-plani");
  assert.equal(YP.durum("short", at("06:00"), yesterdays, []).uygun, true, "Failure Reconstructed legacy plan");
});

test("a Short already uploaded or scheduled for today prevents a second production", () => {
  const scheduledToday = [...yesterdays, { format: "short", slug: "today", videoId: "BBBBBBBBBBB", tarih: `${DAY}T06:14:00Z`, publishAt: `${DAY}T18:00:00.000Z` }];
  const lateUpload = [...yesterdays, { format: "short", slug: "late", videoId: "CCCCCCCCCCC", tarih: `${DAY}T17:40:00Z`, publishAt: "2026-10-03T18:00:00.000Z" }];
  const unscheduled = [...yesterdays, { format: "short", slug: "private", videoId: "DDDDDDDDDDD", tarih: `${DAY}T06:14:00Z` }];
  for (const [channel] of SLOTS) {
    for (const records of [scheduledToday, lateUpload, unscheduled]) {
      for (const time of ["07:30", "10:23", "16:23"]) {
        const decision = Calendar.shortDecision(channel, records, at(time));
        assert.equal(decision.due, false, `${channel.slug} ${records[1].slug} ${time}`);
        assert.match(decision.reason, /today's Short already exists/);
      }
    }
  }
  // A Short uploaded late yesterday for today also fills today.
  const carried = [{ format: "short", slug: "carried", tarih: "2026-10-01T17:30:00Z", publishAt: `${DAY}T18:00:00.000Z` }];
  assert.equal(Calendar.shortDecision(IB, carried, at("08:00")).due, false);
  // Long-form records never occupy the Short day.
  assert.equal(Calendar.shortDecision(CT, [{ format: "long", tarih: `${DAY}T05:00:00Z`, publishAt: `${DAY}T18:00:00.000Z` }], at("08:00")).due, true);
});

test("the production window closes one hour before the 21:00 release; nothing rolls into tomorrow", () => {
  assert.equal(Calendar.shortDecision(FR, yesterdays, at("16:59")).due, true);
  const closed = Calendar.shortDecision(FR, yesterdays, at("17:00"));
  assert.equal(closed.due, false);
  assert.match(closed.reason, /production window closed/);
  // An upload that finishes after the window but before 21:00 still gets today.
  assert.equal(Calendar.publishSlot(FR, yesterdays, at("17:30")).toISOString(), `${DAY}T18:00:00.000Z`);
  // Today's slot already taken -> next free day.
  const taken = [...yesterdays, { format: "short", publishAt: `${DAY}T18:00:00.000Z` }];
  assert.equal(Calendar.publishSlot(FR, taken, at("08:00")).toISOString(), "2026-10-03T18:00:00.000Z");
});

test("Europe/Istanbul handling is DST- and runner-timezone-safe", () => {
  // Istanbul is UTC+3 all year since 2016; it observed DST before that.
  assert.equal(Calendar.zonedTime("2026-01-15", "21:00").toISOString(), "2026-01-15T18:00:00.000Z");
  assert.equal(Calendar.zonedTime("2026-07-15", "21:00").toISOString(), "2026-07-15T18:00:00.000Z");
  assert.equal(Calendar.zonedTime("2015-01-15", "21:00").toISOString(), "2015-01-15T19:00:00.000Z");
  assert.equal(Calendar.zonedTime("2015-07-15", "21:00").toISOString(), "2015-07-15T18:00:00.000Z");
  // A zone with DST today: the spring-forward day itself.
  assert.equal(Calendar.zonedTime("2026-03-29", "09:00", "Europe/London").toISOString(), "2026-03-29T08:00:00.000Z");
  assert.equal(Calendar.zonedTime("2026-03-28", "09:00", "Europe/London").toISOString(), "2026-03-28T09:00:00.000Z");
  // Local midnight: 21:30 UTC on the 1st is already the 2nd in Istanbul.
  assert.equal(Calendar.dayKey("2026-10-01T21:30:00Z"), "2026-10-02");
  assert.equal(Calendar.dayKey("2026-10-01T20:59:59Z"), "2026-10-01");
  // The runner's own TZ must not matter.
  const script = `const C=require(${JSON.stringify(path.resolve(__dirname, "../../core/scheduling/calendar"))});` +
    `const ch=require(${JSON.stringify(path.resolve(__dirname, "../../core/channel-context"))}).getChannel("critical-thread");` +
    `const d=C.shortDecision(ch,[],new Date("2026-10-01T21:30:00Z"));` +
    `process.stdout.write(JSON.stringify([d.today,d.productionAt,d.publishAt,C.zonedTime("2026-10-02","09:00").toISOString()]));`;
  for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"]) {
    const out = cp.execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz } }).toString();
    assert.deepEqual(JSON.parse(out), ["2026-10-02", "2026-10-02T07:00:00.000Z", "2026-10-02T18:00:00.000Z", "2026-10-02T06:00:00.000Z"], tz);
  }
});

test("calendar scheduling stays channel-isolated", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-isolation-"));
  try {
    const states = {};
    for (const channel of [IB, CT]) {
      states[channel.slug] = path.join(temp, channel.slug);
      fs.mkdirSync(states[channel.slug], { recursive: true });
    }
    // Only ImpossibleBrief has today's Short.
    fs.writeFileSync(path.join(states["impossible-brief"], "published.json"), JSON.stringify([
      { channel: "impossible-brief", format: "short", slug: "ib-today", videoId: "EEEEEEEEEEE", tarih: `${DAY}T06:40:00Z`, publishAt: `${DAY}T18:00:00.000Z` },
    ]));
    fs.writeFileSync(path.join(states["critical-thread"], "published.json"), JSON.stringify(yesterdays));
    const ib = { ...IB, paths: { ...IB.paths, state: states["impossible-brief"] } };
    const ct = { ...CT, paths: { ...CT.paths, state: states["critical-thread"] } };
    const ibPlan = Scheduler.channelPlan(ib, at("07:30"));
    const ctPlan = Scheduler.channelPlan(ct, at("07:30"));
    assert.equal(ibPlan.short.due, false);
    assert.equal(ibPlan.short.existing.slug, "ib-today");
    assert.equal(ctPlan.short.due, true);
    assert.equal(ctPlan.short.existing, null);
    // Each channel keeps its own production slot.
    assert.equal(ibPlan.short.productionAt, `${DAY}T06:30:00.000Z`);
    assert.equal(ctPlan.short.productionAt, `${DAY}T07:00:00.000Z`);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  assert.notEqual(Calendar.shortSchedule(FR).productionTime, Calendar.shortSchedule(IB).productionTime);
  assert.notEqual(Calendar.shortSchedule(IB).productionTime, Calendar.shortSchedule(CT).productionTime);
});

test("watchdog checks today's Istanbul calendar day, not a rolling interval", () => {
  const records = [
    ...yesterdays,
    // Uploaded 22:30 UTC on the 1st = 01:30 TR on the 2nd.
    { format: "short", slug: "after-midnight", videoId: "FFFFFFFFFFF", tarih: "2026-10-01T22:30:00Z", publishAt: `${DAY}T18:00:00.000Z` },
  ];
  assert.equal(Sla.recordForDate(records, DAY).slug, "after-midnight");
  assert.equal(Sla.recordForDate(records, "2026-10-01").slug, "yesterday");
  assert.equal(Sla.recordForDate(yesterdays, DAY), null, "yesterday's Short never satisfies today's SLA");
  const video = (id, publishAt) => ({ id, contentDetails: { duration: "PT40S" }, status: { publishAt } });
  assert.equal(Sla.youtubeVideoForDate([video("a", "2026-10-01T18:00:00Z"), video("b", `${DAY}T18:00:00Z`)], DAY).id, "b");
  const snapshot = Sla.evaluateSnapshot({ date: DAY, channel: "critical-thread", published: yesterdays, generated: [], notifications: {}, youtubeVerified: true });
  assert.equal(snapshot.productionReady, false);
  assert.equal(snapshot.safeToRecover, true, "today is empty, so recovery may produce today's Short");
});
