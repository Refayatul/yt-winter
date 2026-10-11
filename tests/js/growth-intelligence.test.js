"use strict";
// Competitor outlier insights, the research queue, and read-only channel activity. No network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Insights = require("../../core/intel/competitor-insights");
const Queue = require("../../core/intel/research-queue");
const Collector = require("../../core/profitdecoded/yt-collector");
const Activity = require("../../scripts/profitdecoded/channel-activity");
const Collect = require("../../scripts/intel/collect-competitors");

const NOW = Date.parse("2026-10-11T00:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
const vid = (id, d, views, extra = {}) => ({ id, title: `Why Video ${id} Happens`, publishedAt: daysAgo(d), views, likes: Math.round(views / 50), comments: 3, durationSec: 900, ...extra });

function snapshot(videos, extra = {}) {
  return { fetchedAt: new Date(NOW).toISOString(), source: "test", channels: [{ id: "UC1", name: "Comp", subscribers: 50000, videos, ...extra }] };
}

test("insights: a breakout needs both the lifetime and the views-per-day ratio, against same-format videos", () => {
  const base = Array.from({ length: 10 }, (_, i) => vid(`b${i}`, 20 + i * 10, 10000));
  const r = Insights.insights(snapshot([...base, vid("hit", 30, 80000), vid("old", 400, 60000)]), { now: NOW });
  const by = Object.fromEntries(r.records.map((x) => [x.video.id, x]));
  assert.equal(by.hit.classification, "breakout");
  assert.ok(by.hit.computed.lifetimeRatio >= 5 && by.hit.computed.velocityRatio >= 2);
  assert.notEqual(by.old.classification, "breakout", "an old video that just had more time is not a breakout");
  assert.equal(by.b0.observed.views, 10000);
  assert.match(by.hit.inferred.label, /hypotheses/);
  assert.ok(by.hit.humanReview.required.includes("opening hook"));
});

test("insights: too-early, insufficient baseline, and Shorts never compared with long-form", () => {
  const longs = Array.from({ length: 6 }, (_, i) => vid(`l${i}`, 20 + i * 5, 1000));
  const shorts = [vid("s1", 30, 900000, { durationSec: 40 }), vid("s2", 25, 800000, { durationSec: 40 })];
  const r = Insights.insights(snapshot([...longs, ...shorts, vid("new", 2, 50000)]), { now: NOW });
  const by = Object.fromEntries(r.records.map((x) => [x.video.id, x]));
  assert.equal(by.new.classification, "too-early");
  assert.equal(by.s1.video.format, "short");
  assert.equal(by.s1.classification, "insufficient-baseline", "two Shorts are not a baseline, and long-form views are not used");
  assert.equal(r.patterns.byFormat.short.videos, 2);
});

test("insights: CTR, impressions and retention of competitor videos are never present", () => {
  const r = Insights.insights(snapshot(Array.from({ length: 8 }, (_, i) => vid(`v${i}`, 20 + i, 1000 * (i + 1)))), { now: NOW });
  const text = JSON.stringify(r);
  assert.ok(!/"ctr"|"impressions"|"retention"\s*:/i.test(text));
});

test("research queue: no source targets = not queued; saturation is penalised and flagged; demand unknown without a snapshot", () => {
  const channel = { slug: "test", paths: { base: os.tmpdir() } };
  const row = (id, title, potential, sources) => ({ topic: { id, title, raw: { sources } }, score: { VideoPotentialScore: potential } });
  const rows = [row("T1", "Why cargo ports clog", 60, [{ name: "a" }]), row("T2", "Why ships idle", 60, [])];
  const noSnap = Queue.build(channel, rows, { insights: null });
  assert.equal(noSnap.queued.length, 1);
  assert.equal(noSnap.skipped[0].topicId, "T2");
  assert.match(String(noSnap.queued[0].components.demand), /unknown/);
  const rec = (id, title, cls) => ({ video: { title, url: "u" }, channel: { id, name: id }, classification: cls, observed: { views: 1 } });
  const crowded = { snapshot: "s.json", records: ["A", "B", "C", "D"].map((c) => rec(c, "Why cargo ports clog so badly", c === "A" ? "breakout" : "typical")) };
  const q = Queue.build(channel, [rows[0]], { insights: crowded });
  assert.equal(q.queued[0].components.saturation, 4);
  assert.ok(q.queued[0].components.saturationPenalty > 0);
  assert.equal(q.queued[0].angleNeeded, true);
  assert.ok(q.queued[0].components.demand > 0);
});

test("read-only wrappers refuse anything but the allowlisted reads", async () => {
  const inner = async () => ({ durum: 200, govde: "{}" });
  for (const wrap of [Activity.readOnlyRequest(inner, []), Collect.readOnly(inner, [])]) {
    await assert.rejects(wrap({ method: "POST", hostname: "www.googleapis.com", path: "/upload/youtube/v3/videos?part=snippet" }), (e) => e.code === "BLOCKED_NON_READ_REQUEST");
    await assert.rejects(wrap({ method: "PUT", hostname: "www.googleapis.com", path: "/youtube/v3/videos?part=snippet" }), (e) => e.code === "BLOCKED_NON_READ_REQUEST");
    assert.deepEqual(await wrap({ method: "GET", hostname: "www.googleapis.com", path: "/youtube/v3/videos?part=statistics&id=x" }), { durum: 200, govde: "{}" });
  }
});

test("collector OAuth client enforces its quota budget and reports HTTP errors", async () => {
  const calls = [];
  const c = Collector.oauthClient({ accessToken: "t", quotaBudget: 2, request: async (opt) => { calls.push(opt); return { durum: 200, govde: "{\"items\":[]}" }; } });
  await c.call("videos", { id: "a" }); await c.call("channels", { id: "b" });
  await assert.rejects(c.call("videos", { id: "c" }), (e) => e.code === "BUDGET");
  assert.equal(calls[0].headers.Authorization, "Bearer t");
  const bad = Collector.oauthClient({ accessToken: "t", request: async () => ({ durum: 403, govde: "{}" }) });
  await assert.rejects(bad.call("videos", {}), (e) => e.code === "QUOTA_OR_FORBIDDEN");
});

test("manual uploads: only public videos are registered, once, outside published.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manual-"));
  const file = path.join(dir, "manual-uploads.json");
  const report = { videos: [{ videoId: "pub", title: "A", publishedAt: "2026-10-10T19:16:44Z", format: "long", privacyStatus: "public" }, { videoId: "priv", title: "B", publishedAt: "2026-10-10T00:00:00Z", format: "long", privacyStatus: "private" }] };
  Activity.registerManualUploads(report, file);
  const rows = Activity.registerManualUploads(report, file);
  assert.deepEqual(rows.map((r) => r.videoId), ["pub"]);
});

test("checkpoints: low early views are INSUFFICIENT_DATA, impressions/CTR recorded as unavailable", () => {
  const report = { checkedAt: "2026-10-11T06:30:00Z", videos: [{ videoId: "v", publishedAt: "2026-10-10T19:16:44Z", format: "long", durationSeconds: 540, observed: { views: 1, likes: 0, comments: 0 }, analytics: { totals: null, totalsStatus: "not yet available" } }] };
  const [row] = Activity.checkpointRows(report);
  assert.equal(row.checkpoint, "6h");
  assert.equal(row.diagnosis[0].code, "INSUFFICIENT_DATA");
  assert.match(row.unavailable.impressionsCtr, /not exposed/);
  assert.ok(!("averagePercentageViewed" in row.metrics), "missing analytics are not zero-filled");
});

test("committed competitor configs: every channel has its own list, verified handles, no shared default", () => {
  const root = path.resolve(__dirname, "..", "..");
  const lists = {};
  for (const slug of ["impossible-brief", "critical-thread", "behind-the-ordinary", "failure-reconstructed", "profitdecoded"]) {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "channels", slug, "intel", "reference-channels.json"), "utf8"));
    lists[slug] = Collector.referenceHandles(cfg).sort().join(",");
    assert.ok(lists[slug].length > 0, slug);
  }
  assert.equal(new Set(Object.values(lists)).size, 5, "no two channels share the same competitor set");
});
