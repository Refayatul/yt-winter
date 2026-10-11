#!/usr/bin/env node
"use strict";
// Read-only Shorts performance forensics over the repository's stored YouTube Analytics (no API calls):
// the last 20 Shorts per channel with views, retention, engaged views, traffic and internal scores.
// Used for docs/growth/SHORTS-CREATIVE-AUDIT.md.
//   node scripts/growth/shorts-forensics.js > forensics.json
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const read = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const out = {};
for (const slug of ["failure-reconstructed", "impossible-brief", "critical-thread", "profitdecoded"]) {
  const ch = Channel.getChannel(slug);
  const adir = ch.paths.analytics;
  const perf = read(path.join(root, "channels", slug, "state", "growth", "performance.json"), []);
  const perfById = new Map((Array.isArray(perf) ? perf : Object.values(perf || {})).map((p) => [p.videoId, p]));
  const pub = read(path.join(ch.paths.state, "published.json"), []);
  const pubById = new Map((Array.isArray(pub) ? pub : []).map((p) => [p.videoId, p]));
  const wh = read(path.join(adir, "warehouse", "video_daily.json"), { rows: [] });
  const life = new Map();
  for (const r of wh.rows || []) {
    const a = life.get(r.videoId) || { views: 0, minutes: 0, subs: 0, lost: 0, last: null, type: r.contentType };
    a.views += r.views || 0; a.minutes += r.estimatedMinutesWatched || 0; a.subs += r.subscribersGained || 0; a.lost += r.subscribersLost || 0; a.last = r.day; life.set(r.videoId, a);
  }
  const traffic = read(path.join(adir, "warehouse", "traffic_daily.json"), { rows: [] });
  const tsum = {}; for (const r of traffic.rows || []) tsum[r.source] = (tsum[r.source] || 0) + (r.views || 0);
  const ids = fs.existsSync(adir) ? fs.readdirSync(adir).filter((d) => /^[A-Za-z0-9_-]{11}$/.test(d)) : [];
  const allIds = new Set([...ids, ...life.keys()]);
  const videos = [];
  for (const id of allIds) {
    const dir = path.join(adir, id);
    const cp = ["7d", "3d", "1d"].map((k) => [k, read(path.join(dir, `${k}.json`))]).find(([, v]) => v);
    const d = cp ? cp[1] : null; const m = (k) => (d && d.metrikler && d.metrikler[k] && d.metrikler[k].durum === "ok" ? d.metrikler[k].deger : null);
    const p = perfById.get(id) || {}; const pb = pubById.get(id) || {};
    const L = life.get(id) || null;
    const dur = d ? d.sureSn : null;
    // audienceWatchRatio at 3 s and at 50%: interpolate the stored curve (fractions of duration).
    const at = (frac) => { const c = d && d.tutma; if (!c || !c.length) return null; let best = c[0]; for (const pt of c) if (Math.abs(pt.oran - frac) < Math.abs(best.oran - frac)) best = pt; return best.izleme; };
    const rel = (frac) => { const c = d && d.tutma; if (!c || !c.length) return null; let best = c[0]; for (const pt of c) if (Math.abs(pt.oran - frac) < Math.abs(best.oran - frac)) best = pt; return best.goreceli; };
    const format = (d && d.format) || (L && L.type) || p.contentType || pb.format || "?";
    videos.push({
      id, title: (d && d.baslik) || p.title || pb.baslik, published: (d && d.yayin) || (p.publishAt || pb.publishAt || pb.tarih || "").slice(0, 16), hourUTC: p.publishHourUTC ?? null, format, durationSec: dur,
      checkpoint: cp ? cp[0] : null, views: m("views"), lifetimeViews: L ? L.views : null, lifetimeThrough: L ? L.last : null,
      avd: m("averageViewDuration"), apv: m("averageViewPercentage"), engagedViews: m("engagedViews"), engagedRate: m("engagedViews") != null && m("views") ? +(m("engagedViews") / m("views")).toFixed(3) : null,
      first30s: m("first30sRetention"), watchRatioAt3s: dur ? at(3 / dur) : null, watchRatioMid: at(0.5), watchRatioEnd: at(0.98), relativeAtStart: rel(0.01), relativeMid: rel(0.5),
      subs: m("subscribersGained"), subsLost: m("subscribersLost"), likes: m("likes"), shares: m("shares"), comments: m("comments"),
      shortsFeedShare: d && d.trafik ? (d.trafik.find((t) => t.kaynak === "SHORTS") || {}).oran ?? 0 : null, traffic: d && d.trafik ? d.trafik.map((t) => `${t.kaynak}:${t.views}`).join(" ") : null,
      drop: d && d.retentionDrop ? d.retentionDrop : null,
      internal: { readiness: p.readiness ?? null, hookScore: p.hookScore ?? null, hookType: p.hookType || null, bucket: p.bucket || null, topic: p.factors ? Math.round(Object.values(p.factors).reduce((a, b) => a + b, 0) / Object.values(p.factors).length) : null, openingVisual: p.openingVisual || null, structure: p.storyStructure || null, quality: pb.kalite || null },
    });
  }
  videos.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  out[slug] = { trafficLifetime: tsum, videos: videos.filter((v) => v.format !== "long" && v.format !== "video").slice(0, 20), longform: videos.filter((v) => v.format === "long" || v.format === "video"), unavailable: { warehouse: wh.unavailable || null } };
}
console.log(JSON.stringify(out, null, 1));
