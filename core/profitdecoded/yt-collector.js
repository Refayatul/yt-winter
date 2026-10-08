"use strict";
// Live competitor/outlier data collection for the Competitive Intelligence
// Engine, via the YouTube Data API v3 (read-only API key: PD_YT_API_KEY).
//   * reference channels: resolved by handle (unresolved handles are REPORTED, never guessed)
//   * discovery: keyword searches per window (7/30/90/365 days) surface videos from channels of ANY size,
//     which is how small-channel outliers are found
//   * quota-aware: search.list costs 100 units, everything else 1; a budget stops collection early
// Output is a snapshot consumable by competitive.buildBreakoutFeed(). No data = no snapshot (never fabricated).

const DAY = 86400000;
const COST = { search: 100, channels: 1, playlistItems: 1, videos: 1 };

function client(options = {}) {
  const key = options.apiKey || process.env.PD_YT_API_KEY;
  if (!key) throw new Error("PD_YT_API_KEY is not set: competitive data stays UNKNOWN (no fabricated values)");
  const doFetch = options.fetch || fetch; let used = 0; const budget = options.quotaBudget || 3000;
  const log = [];
  async function call(endpoint, params) {
    const cost = COST[endpoint]; if (used + cost > budget) { const e = new Error(`quota budget ${budget} reached (used ${used})`); e.code = "BUDGET"; throw e; }
    const url = new URL("https://www.googleapis.com/youtube/v3/" + endpoint); url.search = new URLSearchParams({ ...params, key }).toString();
    const res = await doFetch(url); used += cost;
    if (!res.ok) { const e = new Error(`YouTube API ${endpoint} -> HTTP ${res.status}`); e.status = res.status; if (res.status === 403) e.code = "QUOTA_OR_FORBIDDEN"; throw e; }
    log.push({ endpoint, cost }); return res.json();
  }
  return { call, get used() { return used; }, budget, log };
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function resolveHandles(yt, handles) {
  const resolved = []; const unresolved = [];
  for (const h of handles) {
    const r = await yt.call("channels", { part: "id,snippet,statistics", forHandle: h.replace(/^@?/, "@") });
    const item = (r.items || [])[0];
    if (item) resolved.push(item.id); else unresolved.push(h);
  }
  return { resolved, unresolved };
}

async function channelStats(yt, ids) {
  const out = {};
  for (const c of chunk([...new Set(ids)], 50)) {
    const r = await yt.call("channels", { part: "snippet,statistics,contentDetails", id: c.join(",") });
    for (const it of r.items || []) out[it.id] = { id: it.id, name: it.snippet.title, subscribers: it.statistics.hiddenSubscriberCount ? null : Number(it.statistics.subscriberCount), uploads: it.contentDetails.relatedPlaylists.uploads };
  }
  return out;
}

async function recentVideos(yt, uploadsPlaylist, n = 30) {
  const pl = await yt.call("playlistItems", { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: String(Math.min(50, n)) });
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId);
  return videoDetails(yt, ids);
}
async function videoDetails(yt, ids) {
  const out = [];
  for (const c of chunk(ids, 50)) {
    const r = await yt.call("videos", { part: "snippet,statistics,contentDetails", id: c.join(",") });
    for (const v of r.items || []) out.push({ id: v.id, channelId: v.snippet.channelId, title: v.snippet.title, publishedAt: v.snippet.publishedAt, views: Number(v.statistics.viewCount), likes: v.statistics.likeCount == null ? null : Number(v.statistics.likeCount), comments: v.statistics.commentCount == null ? null : Number(v.statistics.commentCount), durationIso: v.contentDetails.duration });
  }
  return out;
}

// Handles from the structured list (referenceChannels: [{ handle, role, ... }]) and/or the older flat list.
function referenceHandles(config) {
  const list = (config.referenceChannels || []).map((c) => c.handle).concat(config.referenceHandles || []);
  return [...new Set(list.filter(Boolean))];
}

// config: { referenceChannels:[{handle,...}] | referenceHandles:[...], queries:[...], windowsDays:[7,30,90,365], maxResultsPerSearch, minDurationSec, regionCode }
async function collect(config, options = {}) {
  const yt = options.client || client(options);
  const now = options.now || Date.now();
  const report = { startedAt: new Date(now).toISOString(), unresolvedHandles: [], searches: 0, notes: [], stoppedEarly: null };
  const channelIds = new Set(); const discovered = new Map();
  try {
    const { resolved, unresolved } = await resolveHandles(yt, referenceHandles(config));
    report.unresolvedHandles = unresolved; resolved.forEach((id) => channelIds.add(id));
    outer: for (const days of config.windowsDays || [30]) {
      for (const q of config.queries || []) {
        if (yt.used + COST.search > yt.budget - (config.reserveUnits || 500)) { report.stoppedEarly = `search stopped to keep ${config.reserveUnits || 500} units for channel baselines (used ${yt.used}/${yt.budget})`; break outer; }
        const r = await yt.call("search", { part: "snippet", type: "video", q, order: "viewCount", maxResults: String(config.maxResultsPerSearch || 15), publishedAfter: new Date(now - days * DAY).toISOString(), relevanceLanguage: "en", regionCode: config.regionCode || "US", videoDuration: "any" });
        report.searches += 1;
        for (const it of r.items || []) { discovered.set(it.id.videoId, { window: days, query: q }); channelIds.add(it.snippet.channelId); }
      }
    }
  } catch (e) { if (e.code === "BUDGET" || e.code === "QUOTA_OR_FORBIDDEN") report.stoppedEarly = e.message; else throw e; }
  const stats = await channelStats(yt, [...channelIds]).catch((e) => { report.stoppedEarly = report.stoppedEarly || e.message; return {}; });
  const channels = [];
  for (const [id, st] of Object.entries(stats)) {
    try {
      const vids = await recentVideos(yt, st.uploads, config.baselineVideos || 25);
      channels.push({ id, name: st.name, subscribers: st.subscribers, videos: vids.filter((v) => v.durationIso !== "P0D").map(({ durationIso, channelId, ...v }) => v) });
    } catch (e) { report.notes.push(`${st.name}: ${e.message}`); if (e.code === "BUDGET") { report.stoppedEarly = e.message; break; } }
  }
  return { snapshot: { fetchedAt: new Date(now).toISOString(), source: "youtube-data-api-v3", channels }, report: { ...report, channelsCollected: channels.length, quotaUsed: yt.used, quotaBudget: yt.budget } };
}

module.exports = { client, resolveHandles, referenceHandles, channelStats, recentVideos, collect, COST };
