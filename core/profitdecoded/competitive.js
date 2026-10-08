"use strict";
// Competitive Intelligence Engine (spec sections 41-44).
// Goal: detect PROVEN AUDIENCE DEMAND before investing in production, never to
// copy. Works on channel/video snapshots (from the YouTube Data API via
// fetchSnapshot, or fixtures). Without data every output is UNKNOWN.

const S = require("./signals");
const T = require("./text");

const DAY = 86400000;
const log2 = (x) => Math.log(x) / Math.log(2);

// ---- Outlier score -----------------------------------------------------------
// ratio r -> 0..100: r<=1 -> 0, r=2 -> 25, r=4 -> 50, r=8 -> 75, r>=16 -> 100.
const ratioScore = (r) => (r > 1 ? S.clamp(25 * log2(r)) : 0);

function channelBaseline(channel, excludeId, now = Date.now(), lookback = 20) {
  const prior = (channel.videos || []).filter((v) => v.id !== excludeId && v.views != null && now - Date.parse(v.publishedAt) > 3 * DAY)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, lookback);
  const views = prior.map((v) => v.views);
  return { n: views.length, median: T.median(views), mean: T.mean(views) };
}

function outlierScore(video, channel, options = {}) {
  const now = options.now || Date.now();
  const ageDays = Math.max(0.5, (now - Date.parse(video.publishedAt)) / DAY);
  const base = options.baseline || channelBaseline(channel, video.id, now);
  const comps = []; const missing = [];
  const add = (name, weight, score, detail) => comps.push({ name, weight, score: S.round(score, 1), detail });
  const subs = Number(channel.subscribers);
  if (subs > 0) add("viewsPerSubscriber", 0.22, ratioScore(video.views / Math.max(subs, 1000)), `${video.views} views / ${Math.max(subs, 1000)} subs`); else missing.push("subscribers");
  if (base.n >= 5 && base.median > 0) {
    add("viewsVsMedian", 0.34, ratioScore(video.views / base.median), `median of last ${base.n} = ${Math.round(base.median)}`);
    add("viewsVsMean", 0.08, ratioScore(video.views / Math.max(base.mean, 1)), `mean = ${Math.round(base.mean)}`);
  } else missing.push("channel baseline (needs >=5 prior videos)");
  if (video.earlyViews48h != null && base.n >= 5) {
    const priorEarly = (channel.videos || []).filter((v) => v.id !== video.id && v.earlyViews48h != null).map((v) => v.earlyViews48h);
    if (priorEarly.length >= 5) add("earlyVelocity", 0.14, ratioScore(video.earlyViews48h / Math.max(1, T.median(priorEarly))), "views in first 48h vs channel median");
    else missing.push("early velocity baseline");
  } else {
    // age-adjusted proxy: lifetime views/day vs baseline views/day is only a rough check
    if (base.n >= 5) {
      const perDay = video.views / ageDays;
      const prior = (channel.videos || []).filter((v) => v.id !== video.id && v.views != null).map((v) => v.views / Math.max(1, (now - Date.parse(v.publishedAt)) / DAY));
      add("ageAdjustedVelocity", 0.1, ratioScore(perDay / Math.max(0.01, T.median(prior))), "views/day since publish vs channel median views/day");
    }
    missing.push("first-48h velocity");
  }
  if (video.views > 0 && video.likes != null) {
    const eng = (video.likes + (video.comments || 0) * 4) / video.views;
    add("engagement", 0.12, S.clamp(eng / 0.08 * 100), `(likes+4*comments)/views = ${eng.toFixed(3)}`);
  } else missing.push("likes/comments");
  if (options.topicRecurrence != null) add("topicRecurrence", 0.1, S.clamp((options.topicRecurrence - 1) * 33), `${options.topicRecurrence} distinct channels had outliers on this topic`);
  if (!comps.length) return { score: S.unknown("no usable inputs"), components: [], missing, smallChannelOutlier: false };
  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  let score = comps.reduce((s, c) => s + c.weight * c.score, 0) / wsum;
  const medRatio = base.n >= 5 && base.median > 0 ? video.views / base.median : 0;
  const small = subs > 0 && subs < 100000 && medRatio >= 5;
  if (small) score = Math.min(100, score + 8); // small channel breaking its own ceiling = purest demand signal
  const evidenceWeight = wsum / (0.22 + 0.34 + 0.08 + 0.14 + 0.12 + 0.1);
  return {
    score: S.observed(S.round(score, 1), "computed from YouTube-reported view counts"),
    components: comps, missing, smallChannelOutlier: small, medianMultiple: S.round(medRatio, 1), evidenceCoverage: S.round(Math.min(1, evidenceWeight), 2),
  };
}

// ---- Topic keying, viral mechanism, title structure ----------------------------
const TITLE_PATTERNS = [
  ["not-what-you-think", /\bnot what you think\b/i], ["business-model-explained", /\bbusiness model,? explained\b/i],
  ["economics-of-owning", /\beconomics of owning\b/i], ["decline-what-happened", /\bdecline of .+what happened\b/i], ["so-expensive", /\b(is|are) so expensive\b/i],
  ["why-x-wants-you-to", /\bwants? you to\b/i], ["real-reason", /\breal reason\b/i], ["how-x-actually-makes-money", /\bhow .+ (actually |really )?makes? money\b/i],
  ["business-behind", /\bbusiness behind\b/i], ["strange-economics", /\bstrange economics\b/i], ["hidden-cost", /\bhidden cost\b/i],
  ["why-x-question", /^why\b/i], ["how-x", /^how\b/i], ["numbered-list", /^\d+\b/], ["the-x-trick", /\btrick\b/i], ["statement", /./],
];
function titleStructure(title) { for (const [name, re] of TITLE_PATTERNS) if (re.test(title)) return name; return "statement"; }

const MECH_RULES = [
  ["CF", /\b(trap|cancel|hidden fee|junk fee|scam|can'?t cancel|rip ?off|overdraft)\b/i],
  ["CB", /\b(trick|psycholog|make[s]? you|manipulat|work[s]? so well|designed to)\b/i],
  ["PL", /\b(lose[s]? money|loss leader|barely profit|break even)\b/i],
  ["FP", /\b(free|gratis)\b/i], ["HP", /\b(so expensive|costs? so much|overpriced)\b/i],
  ["CD", /\b(collapse|bankrupt|failed|fell|ended|stopped|raised prices)\b/i], ["FC", /\b(makes? money|business model|how .+ works)\b/i],
];
function viralMechanism(title) { for (const [code, re] of MECH_RULES) if (re.test(title)) return code; return "FH"; }

const PILLAR_RULES = [
  ["money-traps", /\b(scam|trap|fraud|cancel|hidden fee|junk fee|overdraft|subscription)\b/i],
  ["pricing-psychology", /\b(price|pricing|psycholog|trick|discount|sale|anchor|\$\d)/i],
  ["strange-economics", /\b(loses? money|empty|destroy|strange|paradox|cheaper than|prefer)\b/i],
  ["company-stories", /\b(collapse|rise|fall|story|bankrupt|founder|became)\b/i],
  ["hidden-business-models", /./],
];
function classifyPillar(title) { for (const [p, re] of PILLAR_RULES) if (re.test(title)) return p; return "hidden-business-models"; }

// ---- Saturation ---------------------------------------------------------------
// Rule-based and fully inspectable; thresholds are conservative.
function saturation(related, options = {}) {
  const now = options.now || Date.now();
  if (!related || !related.length) return { class: "EARLY", reasons: ["no related videos found in the supplied snapshot"], provenance: "INFERRED", evidenceNote: "absence in a limited snapshot is not proof of absence" };
  const within = (days) => related.filter((r) => now - Date.parse(r.publishedAt) <= days * DAY);
  const recent30 = within(30), recent90 = within(90);
  const large = new Set(recent90.filter((r) => r.channelSubscribers >= 500000).map((r) => r.channelId)).size;
  const channels = new Set(recent90.map((r) => r.channelId)).size;
  const sims = []; for (let i = 0; i < recent90.length; i += 1) for (let j = i + 1; j < recent90.length; j += 1) sims.push(T.wordSetSimilarity(recent90[i].title, recent90[j].title));
  const titleSimilarity = S.round(T.mean(sims), 2);
  const sorted = [...related].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const half = Math.floor(sorted.length / 2);
  const early = T.mean(sorted.slice(0, half).map((r) => r.outlier || 0)), late = T.mean(sorted.slice(half).map((r) => r.outlier || 0));
  const diminishing = sorted.length >= 4 && late < early * 0.6;
  const newest = Math.min(...related.map((r) => (now - Date.parse(r.publishedAt)) / DAY));
  const reasons = [`${recent30.length} related videos in 30d, ${recent90.length} in 90d across ${channels} channels (${large} large)`, `mean title similarity ${titleSimilarity}`, diminishing ? "later videos earn clearly lower outlier scores" : "no outlier decay detected"];
  let cls;
  if (newest > 120 || (recent90.length === 0 && related.length >= 3)) cls = "DECLINING";
  else if (recent90.length >= 9 || (recent30.length >= 6 && large >= 3) || (diminishing && recent90.length >= 5)) cls = "SATURATED";
  else if (recent30.length >= 4 || large >= 3 || recent90.length >= 6) cls = "HOT";
  else if (recent90.length >= 2) cls = "GROWING";
  else cls = "EARLY";
  return { class: cls, counts: { recent30: recent30.length, recent90: recent90.length, channels, largeChannels: large }, titleSimilarity, diminishing, reasons, provenance: "OBSERVED" };
}
const SATURATION_PENALTY = { EARLY: 0, GROWING: 0.15, HOT: 0.5, SATURATED: 1, DECLINING: 0.6 };

// Saturation from MANUALLY recorded public search results (channels/profitdecoded/intel/coverage-*.json),
// used only until the API collector has run. The view counts were observed by a person on a dated
// public page; the class derived here is INFERRED, a sample is never proof of absence, and it never
// becomes OBSERVED. Videos are tagged "same-angle" or "adjacent"; only same-angle videos count as competition.
//   SATURATED: >=2 same-angle videos >=300K in the last 365 days, or >=3 same-angle videos >=1M at any age
//   HOT:       1 same-angle video >=300K in the last 365 days, or >=1 same-angle video >=1M at any age
//   GROWING:   same-angle videos in the last 365 days that all stayed <300K, or >=10 uploads <30 days old in the sample
//   EARLY:     none of the above
function coverageSaturation(entry) {
  if (!entry || !Array.isArray(entry.videos)) return { class: "UNKNOWN", provenance: "UNKNOWN", reasons: ["no coverage observation"] };
  const same = entry.videos.filter((v) => v.relation === "same-angle");
  const recent = same.filter((v) => v.approxAgeDays <= 365);
  const big365 = recent.filter((v) => v.views >= 300000).length;
  const mega = same.filter((v) => v.views >= 1000000).length;
  const clones = Number(entry.uploadsUnder30DaysInSample) || 0;
  let cls = "EARLY";
  if (big365 >= 2 || mega >= 3) cls = "SATURATED";
  else if (big365 === 1 || mega >= 1) cls = "HOT";
  else if (recent.length || clones >= 10) cls = "GROWING";
  const reasons = [`${same.length} same-angle video(s) in the sample, ${big365} >=300K in 365d, ${mega} >=1M at any age`, `${clones} upload(s) <30 days old in the sample`];
  const adjacentDemand = entry.videos.filter((v) => v.relation === "adjacent").reduce((m, v) => Math.max(m, v.views), 0);
  return { class: cls, provenance: "INFERRED", source: `manual public search sample observed ${entry.observedOn} (query: "${entry.query}")`, reasons, adjacentDemandMaxViews: adjacentDemand || null };
}

// ---- Breakout feed -------------------------------------------------------------
function topicKey(title, inventory) {
  // Match a competitor video to our inventory by content-word overlap; never by copying titles.
  let best = null; let bestSim = 0;
  for (const t of inventory || []) { const sim = T.wordSetSimilarity(title, t.topic); if (sim > bestSim) { bestSim = sim; best = t; } }
  return best && bestSim >= 0.34 ? { id: best.id, topic: best.topic, similarity: S.round(bestSim, 2) } : null;
}

function buildBreakoutFeed(snapshot, options = {}) {
  const now = options.now || Date.now();
  const threshold = options.threshold == null ? 55 : options.threshold;
  const windows = options.windows || [7, 30, 90, 365];
  const inventory = options.inventory || [];
  const all = [];
  for (const channel of snapshot.channels || []) for (const v of channel.videos || []) all.push({ channel, video: v });
  const scored = all.map(({ channel, video }) => ({ channel, video, o: outlierScore(video, channel, { now }) }));
  // Topic recurrence = distinct channels with an outlier on the same matched topic.
  const byKey = new Map();
  for (const r of scored) {
    if (!S.isKnown(r.o.score) || r.o.score.value < threshold) continue;
    const key = topicKey(r.video.title, inventory);
    r.key = key;
    const id = key ? key.id : "t:" + T.contentWords(r.video.title).slice(0, 4).join("-");
    r.keyId = id;
    if (!byKey.has(id)) byKey.set(id, new Set()); byKey.get(id).add(r.channel.id);
  }
  const feed = [];
  for (const r of scored) {
    if (!S.isKnown(r.o.score) || r.o.score.value < threshold) continue;
    const recurrence = byKey.get(r.keyId).size;
    const o = outlierScore(r.video, r.channel, { now, topicRecurrence: recurrence });
    const ageDays = Math.round((now - Date.parse(r.video.publishedAt)) / DAY);
    const related = scored.filter((x) => x.keyId === r.keyId || (x.key && r.key && x.key.id === r.key.id)).map((x) => ({ publishedAt: x.video.publishedAt, title: x.video.title, channelId: x.channel.id, channelSubscribers: x.channel.subscribers, outlier: S.isKnown(x.o.score) ? x.o.score.value : 0 }));
    const sat = saturation(related, { now });
    const base = channelBaseline(r.channel, r.video.id, now);
    const relevance = r.key ? S.round(r.key.similarity * 100, 0) : 25;
    const freshness = S.clamp(100 - ageDays * 0.9);
    const evergreen = /\b(why|how|real reason|business)\b/i.test(r.video.title) && !/\b(2025|2026|new|just|breaking|today)\b/i.test(r.video.title) ? 70 : 45;
    const opportunity = S.round(S.clamp(0.42 * o.score.value + 0.18 * relevance + 0.14 * freshness + 0.1 * evergreen - 25 * SATURATION_PENALTY[sat.class] + 12 * (SATURATION_PENALTY[sat.class] === 0 ? 1 : 0)), 1);
    feed.push({
      window: windows.find((w) => ageDays <= w) || 365,
      source: { channel: r.channel.name, channelId: r.channel.id, videoId: r.video.id, publishedAt: r.video.publishedAt, subscribers: r.channel.subscribers, views: r.video.views, baselineMedianViews: base.n >= 5 ? Math.round(base.median) : null },
      outlier: o, topic: r.key, titleStructure: titleStructure(r.video.title), viralMechanismCode: viralMechanism(r.video.title),
      thumbnailConcept: r.video.thumbnailNotes || "UNKNOWN (no thumbnail analysis supplied)",
      viewerQuestion: "Why/how does this familiar business behave this way? (derive from audience comments, not the creator's script)",
      pillar: classifyPillar(r.video.title), ageDays, freshness: S.round(freshness, 0), evergreenPotential: evergreen, profitDecodedRelevance: relevance, saturation: sat, opportunityScore: opportunity,
      copyRule: "Extract WHY THE AUDIENCE CARED. Never reuse this creator's script, title or thumbnail; an original angle is mandatory.",
    });
  }
  feed.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return { generatedAt: new Date(now).toISOString(), windows, count: feed.length, feed };
}

// ---- Competitor gap analysis -----------------------------------------------------
const GAP_QUESTIONS = ["covered the mechanism at primary-source depth", "newerEvidenceAvailable", "primarySourcesStronger", "mechanismCanBeVisualized", "canReachBroaderAudience", "canWriteStronger30Seconds", "canDeliverBetterPayoff"];
function gapAnalysis(input) {
  const cov = input.competitorCoverage;
  if (!cov || !cov.length) return { status: "UNKNOWN", reasonToExist: false, reason: "no competitor coverage analysis supplied; ProfitDecoded cannot claim an original angle yet", provenance: "UNKNOWN" };
  const checks = {
    newerEvidenceAvailable: !!input.newerEvidenceAvailable, primarySourcesStronger: !!input.primarySourcesStronger, mechanismCanBeVisualized: !!input.mechanismCanBeVisualized,
    canReachBroaderAudience: !!input.canReachBroaderAudience, canWriteStronger30Seconds: !!input.canWriteStronger30Seconds, canDeliverBetterPayoff: !!input.canDeliverBetterPayoff,
  };
  const missed = cov.flatMap((c) => c.missed || []);
  const unanswered = [...new Set(missed.concat(input.unansweredQuestions || []))];
  const yes = Object.values(checks).filter(Boolean).length;
  const reasonToExist = unanswered.length >= 1 && yes >= 3 && !!input.originalAngle;
  return {
    status: reasonToExist ? "ORIGINAL_ANGLE" : "NO_CLEAR_REASON", reasonToExist, checks, unanswered, originalAngle: input.originalAngle || null,
    explained: [...new Set(cov.flatMap((c) => c.covered || []))],
    reason: reasonToExist ? `${unanswered.length} unanswered question(s); ${yes}/6 advantages` : `needs >=1 unanswered question, >=3 of 6 advantages and a written original angle (has ${unanswered.length}, ${yes}/6, angle=${!!input.originalAngle})`,
    provenance: "INFERRED",
  };
}

// ---- Optional live fetch (YouTube Data API v3). Requires PD_YT_API_KEY. ----------------
async function fetchSnapshot(channelIds, options = {}) {
  const key = options.apiKey || process.env.PD_YT_API_KEY;
  if (!key) throw new Error("PD_YT_API_KEY is not set: competitive data stays UNKNOWN (no fabricated values)");
  const get = async (endpoint, params) => {
    const url = new URL("https://www.googleapis.com/youtube/v3/" + endpoint); url.search = new URLSearchParams({ ...params, key }).toString();
    const res = await (options.fetch || fetch)(url); if (!res.ok) throw new Error(`YouTube API ${endpoint} -> HTTP ${res.status}`); return res.json();
  };
  const channels = [];
  for (const id of channelIds) {
    const ch = await get("channels", { part: "snippet,statistics,contentDetails", id });
    const item = (ch.items || [])[0]; if (!item) continue;
    const uploads = item.contentDetails.relatedPlaylists.uploads;
    const pl = await get("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "50" });
    const ids = (pl.items || []).map((i) => i.contentDetails.videoId).join(",");
    const vs = ids ? await get("videos", { part: "snippet,statistics,contentDetails", id: ids }) : { items: [] };
    channels.push({ id, name: item.snippet.title, subscribers: item.statistics.hiddenSubscriberCount ? null : Number(item.statistics.subscriberCount), videos: (vs.items || []).map((v) => ({ id: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt, views: Number(v.statistics.viewCount), likes: v.statistics.likeCount == null ? null : Number(v.statistics.likeCount), comments: v.statistics.commentCount == null ? null : Number(v.statistics.commentCount) })) });
  }
  return { fetchedAt: new Date().toISOString(), source: "youtube-data-api-v3", channels };
}

module.exports = { outlierScore, channelBaseline, ratioScore, saturation, SATURATION_PENALTY, coverageSaturation, buildBreakoutFeed, gapAnalysis, titleStructure, viralMechanism, classifyPillar, topicKey, fetchSnapshot };
