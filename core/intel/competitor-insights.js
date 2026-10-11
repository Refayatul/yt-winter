"use strict";

// Competitor outlier detection and structured insight records, for every channel.
//
// Input: a snapshot in the collector format (core/profitdecoded/yt-collector.js):
//   { fetchedAt, source, channels: [{ id, name, subscribers, videos: [{ id, title, publishedAt, views, likes, comments, durationSec }] }] }
// Only YouTube-reported public numbers are used. CTR, impressions and retention of competitor videos are
// private and are never estimated.
//
// Baselines are per channel AND per format (Shorts and long-form are never compared with each other).
// A video is classified only when it is at least MIN_AGE_DAYS old and its channel has at least
// MIN_BASELINE prior videos of the same format; otherwise it is "too-early" / "insufficient-baseline".
// Two ratios must agree, so an old video that simply had more time is not called a breakout:
//   lifetime  = views / median views of the channel's other same-format videos (older than 3 days)
//   velocity  = views per day since publish / median views per day of those videos
//
// Each record separates observed values, computed values and inferences; inferences are hypotheses for a
// person to check (title structure, duration, topic recurrence), never claims about why a video worked.

const DAY = 86400000;
const MIN_AGE_DAYS = 7;
const MIN_BASELINE = 5;
const SHORT_MAX_SECONDS = 180;
const CLASSES = [
  { name: "breakout", lifetime: 5, velocity: 2 },
  { name: "outperformer", lifetime: 2.5, velocity: 1.25 },
];

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const formatOf = (v) => (v.durationSec != null && v.durationSec <= SHORT_MAX_SECONDS) || /#shorts\b/i.test(v.title || "") ? "short" : "long";
const ageDays = (v, now) => Math.max(0.5, (now - Date.parse(v.publishedAt)) / DAY);

// Generic title structures (no channel's wording is stored as a template, only the pattern name).
const TITLE_PATTERNS = [
  ["what-if", /^what (if|happens if|would happen)\b/i], ["why-question", /^why\b/i], ["how-question", /^how\b/i],
  ["what-question", /^what\b/i], ["the-x-that", /^the .+ (that|which|who)\b/i], ["number-led", /^\$?\d/],
  ["superlative", /\b(most|biggest|worst|largest|deadliest|only)\b/i], ["question-other", /\?$/],
  ["colon-or-dash", /[:—–-]\s/], ["statement", /./],
];
const titleStructure = (title) => (TITLE_PATTERNS.find(([, re]) => re.test(title || "")) || ["statement"])[0];
const STOP = new Set("the a an of to in and or for on is are was why how what if when with from that this it its by at as be your you we our they their his her not no do does did can will would".split(" "));
const subjectWords = (title) => [...new Set(String(title || "").toLowerCase().replace(/#\w+/g, "").match(/[a-z][a-z'-]{2,}/g) || [])].filter((w) => !STOP.has(w));

function baselineFor(channel, video, now) {
  const format = formatOf(video);
  const prior = (channel.videos || []).filter((v) => v.id !== video.id && formatOf(v) === format && v.views != null && now - Date.parse(v.publishedAt) > 3 * DAY);
  return { format, n: prior.length, medianViews: median(prior.map((v) => v.views)), medianViewsPerDay: median(prior.map((v) => v.views / ageDays(v, now))), medianDurationSec: median(prior.map((v) => v.durationSec)) };
}

function classify(video, base, now) {
  const age = ageDays(video, now);
  if (age < MIN_AGE_DAYS) return { classification: "too-early", reason: `${round(age, 1)} days old (< ${MIN_AGE_DAYS})` };
  if (base.n < MIN_BASELINE || !(base.medianViews > 0)) return { classification: "insufficient-baseline", reason: `${base.n} prior ${base.format} videos (< ${MIN_BASELINE})` };
  const lifetime = video.views / base.medianViews; const velocity = (video.views / age) / Math.max(1e-9, base.medianViewsPerDay);
  const hit = CLASSES.find((c) => lifetime >= c.lifetime && velocity >= c.velocity);
  return { classification: hit ? hit.name : lifetime < 0.5 ? "underperformer" : "typical", lifetimeRatio: round(lifetime), velocityRatio: round(velocity) };
}

function confidenceOf(base, video, now) {
  const age = ageDays(video, now); const engagement = video.likes != null;
  if (base.n >= 15 && age >= 14 && engagement) return "high";
  if (base.n >= 8 && age >= MIN_AGE_DAYS) return "medium";
  return "low";
}

// insights(snapshot, { ourChannel, now, snapshotFile, topicOf }) -> { records, patterns }
function insights(snapshot, options = {}) {
  const now = options.now || Date.parse(snapshot.fetchedAt) || Date.now();
  const records = [];
  for (const channel of snapshot.channels || []) {
    for (const video of channel.videos || []) {
      if (video.views == null || !video.publishedAt) continue;
      const base = baselineFor(channel, video, now);
      const verdict = classify(video, base, now);
      records.push({
        schema: "competitor-insight.v1", ourChannel: options.ourChannel || null,
        video: { id: video.id, url: `https://www.youtube.com/watch?v=${video.id}`, title: video.title, publishedAt: video.publishedAt, format: base.format, durationSec: video.durationSec ?? null },
        channel: { id: channel.id, name: channel.name, subscribers: channel.subscribers ?? null },
        topic: options.topicOf ? options.topicOf(video) : subjectWords(video.title).slice(0, 6).join(" "),
        observed: { views: video.views, likes: video.likes ?? null, comments: video.comments ?? null, at: snapshot.fetchedAt, source: snapshot.source || "youtube-data-api-v3" },
        baseline: { format: base.format, priorVideos: base.n, medianViews: base.medianViews, medianViewsPerDay: round(base.medianViewsPerDay), medianDurationSec: base.medianDurationSec },
        computed: { ageDays: round(ageDays(video, now), 1), viewsPerDay: round(video.views / ageDays(video, now), 1), lifetimeRatio: verdict.lifetimeRatio ?? null, velocityRatio: verdict.velocityRatio ?? null },
        classification: verdict.classification, classificationNote: verdict.reason || null,
        confidence: confidenceOf(base, video, now),
        inferred: { titleStructure: titleStructure(video.title), durationVsChannel: base.medianDurationSec && video.durationSec ? round(video.durationSec / base.medianDurationSec) : null, label: "hypotheses for human review, not causes" },
        evidence: [{ kind: "snapshot", file: options.snapshotFile || null, fetchedAt: snapshot.fetchedAt }],
        lessons: [], humanReview: { required: ["opening hook", "narrative structure", "visual storytelling", "voiceover style", "editing rhythm", "use of evidence", "thumbnail composition"], note: "requires watching the video; not inferred by code" },
      });
    }
  }
  // Topic recurrence: the same subject word in outliers from different channels is a demand signal.
  const outliers = records.filter((r) => r.classification === "breakout" || r.classification === "outperformer");
  const wordChannels = new Map();
  for (const r of outliers) for (const w of subjectWords(r.video.title)) { const set = wordChannels.get(w) || new Set(); set.add(r.channel.id); wordChannels.set(w, set); }
  for (const r of outliers) {
    const shared = subjectWords(r.video.title).filter((w) => (wordChannels.get(w) || new Set()).size >= 2);
    r.inferred.recurringSubjects = shared;
    if (shared.length) r.lessons.push(`Subject recurs across ${Math.max(...shared.map((w) => wordChannels.get(w).size))} channels' outliers (${shared.slice(0, 3).join(", ")}): a demand signal to research, not a topic to copy.`);
    if (r.inferred.durationVsChannel != null && r.inferred.durationVsChannel >= 1.5) r.lessons.push("Longer than the channel's usual length: depth may have been rewarded (check retention on our own tests).");
    if (r.inferred.durationVsChannel != null && r.inferred.durationVsChannel <= 0.67) r.lessons.push("Shorter than the channel's usual length: test tighter cuts.");
    r.lessons.push(`Title structure "${r.inferred.titleStructure}" — compare its share among outliers vs typical videos before using it.`);
  }
  return { records, patterns: patterns(records) };
}

// Niche-level descriptive statistics. Lift = share among outliers / share among typical videos.
function patterns(records) {
  const byFormat = {};
  for (const format of ["short", "long"]) {
    const rs = records.filter((r) => r.video.format === format);
    const out = rs.filter((r) => r.classification === "breakout" || r.classification === "outperformer");
    const typ = rs.filter((r) => r.classification === "typical" || r.classification === "underperformer");
    const share = (list, key) => (list.length ? list.filter((r) => r.inferred.titleStructure === key).length / list.length : 0);
    const structures = [...new Set(rs.map((r) => r.inferred.titleStructure))].map((key) => ({ structure: key, outlierShare: round(share(out, key)), typicalShare: round(share(typ, key)), lift: typ.length && share(typ, key) > 0 ? round(share(out, key) / share(typ, key)) : null, outliers: out.filter((r) => r.inferred.titleStructure === key).length }))
      .filter((s) => s.outliers > 0).sort((a, b) => b.outliers - a.outliers);
    byFormat[format] = { videos: rs.length, classified: out.length + typ.length, outliers: out.length, medianDurationSecOutliers: median(out.map((r) => r.video.durationSec)), medianDurationSecTypical: median(typ.map((r) => r.video.durationSec)), titleStructures: structures };
  }
  // Publishing frequency per channel (uploads per week over the observed window).
  const perChannel = {};
  for (const r of records) { const c = perChannel[r.channel.id] = perChannel[r.channel.id] || { name: r.channel.name, subscribers: r.channel.subscribers, dates: [], outliers: 0 }; c.dates.push(Date.parse(r.video.publishedAt)); if (r.classification === "breakout" || r.classification === "outperformer") c.outliers += 1; }
  const channels = Object.values(perChannel).map((c) => { const span = (Math.max(...c.dates) - Math.min(...c.dates)) / (7 * DAY); return { name: c.name, subscribers: c.subscribers, videosObserved: c.dates.length, uploadsPerWeek: span > 0 ? round((c.dates.length - 1) / span, 1) : null, outliers: c.outliers }; }).sort((a, b) => b.outliers - a.outliers);
  return { byFormat, channels, note: "Descriptive statistics of public counts. A pattern with few outliers is anecdotal; use it to design a controlled experiment, not as a rule." };
}

function markdown(result, title) {
  const top = result.records.filter((r) => r.classification === "breakout" || r.classification === "outperformer").sort((a, b) => b.computed.lifetimeRatio - a.computed.lifetimeRatio);
  const lines = [`# ${title}`, "", `Records: ${result.records.length} videos; outliers: ${top.length}. Observed = YouTube public counts at snapshot time; ratios are computed against each channel's own same-format median; explanations are hypotheses.`, "",
    "| Channel | Video | Format | Age d | Views | × median | × views/day | Class | Confidence |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of top.slice(0, 40)) lines.push(`| ${r.channel.name} | [${String(r.video.title).replace(/\|/g, "/").slice(0, 70)}](${r.video.url}) | ${r.video.format} | ${r.computed.ageDays} | ${r.observed.views.toLocaleString("en-US")} | ${r.computed.lifetimeRatio} | ${r.computed.velocityRatio} | ${r.classification} | ${r.confidence} |`);
  lines.push("", "## Patterns (descriptive)", "");
  for (const [format, p] of Object.entries(result.patterns.byFormat)) {
    if (!p.videos) continue;
    lines.push(`**${format}**: ${p.videos} videos, ${p.classified} classifiable, ${p.outliers} outliers; median duration outliers ${p.medianDurationSecOutliers ?? "—"} s vs typical ${p.medianDurationSecTypical ?? "—"} s.`, "");
    if (p.titleStructures.length) lines.push("| Title structure | Outliers | Share among outliers | Share among typical | Lift |", "|---|---|---|---|---|", ...p.titleStructures.map((s) => `| ${s.structure} | ${s.outliers} | ${s.outlierShare} | ${s.typicalShare} | ${s.lift ?? "—"} |`), "");
  }
  lines.push("| Channel | Subscribers | Videos observed | Uploads/week | Outliers |", "|---|---|---|---|---|", ...result.patterns.channels.map((c) => `| ${c.name} | ${c.subscribers ?? "hidden"} | ${c.videosObserved} | ${c.uploadsPerWeek ?? "—"} | ${c.outliers} |`), "", result.patterns.note, "");
  return lines.join("\n");
}

module.exports = { insights, patterns, markdown, classify, baselineFor, titleStructure, subjectWords, formatOf, MIN_AGE_DAYS, MIN_BASELINE, SHORT_MAX_SECONDS };
