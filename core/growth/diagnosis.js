"use strict";

// FAILURE DIAGNOSIS (PHASE 19). Configurable thresholds, separate Shorts and
// long-form rules, confidence reflects sample size, and no causal claim is
// made without the metric that would support it. Missing data → the code is
// not emitted (INSUFFICIENT_DATA instead), never guessed.

function diagnose(row, baselines, config, options = {}) {
  const long = row.contentType === "long";
  const t = long ? config.diagnosis.longform : config.diagnosis.shorts;
  const m = row.metrics || {};
  const base = (long ? baselines.long : baselines.short) || {};
  const out = [];
  const add = (code, confidence, evidence, recommendation) => out.push({ code, confidence, evidence, recommendation });
  const views = m.views;
  if (!Number.isFinite(views) || views < t.minViews) {
    add("INSUFFICIENT_DATA", "high", `${views ?? "unknown"} views < ${t.minViews}`, "No intervention; wait for the next checkpoint.");
    return finalize(out, row, options);
  }
  const sampleConfidence = (base.n || 0) >= 10 ? "medium" : "low";
  const retentionEarly = long ? retentionAt(row, 30) : retentionAt(row, 3);
  if (retentionEarly != null && retentionEarly < (long ? t.hookFailureRetentionAt30s : t.hookFailureRetentionAt3s)) {
    add("HOOK_FAILURE", sampleConfidence, `retention ${Math.round(retentionEarly * 100)}% at ${long ? "30 s" : "3 s"}`, "Next videos in this cluster: stronger first frame and a result-first opening.");
  }
  if (Number.isFinite(m.averagePercentageViewed) && m.averagePercentageViewed < t.retentionFailureAvp) {
    add("RETENTION_FAILURE", sampleConfidence, `average viewed ${m.averagePercentageViewed}% < ${t.retentionFailureAvp}%`, long ? "Tighten the middle; add a new reveal every 20–60 s." : "Cut setup sentences; move the mechanism earlier.");
  }
  if (long) {
    const half = retentionAt(row, null, 0.5);
    if (half != null && half < t.depthFailureRetentionAtHalf) add("LONGFORM_DEPTH_FAILURE", sampleConfidence, `retention ${Math.round(half * 100)}% at 50%`, "Middle sections repeat or lack new evidence; restructure around the failure chain.");
    if (Number.isFinite(m.ctr) && m.ctr < t.lowCtr) add("THUMBNAIL_PACKAGING_FAILURE", "low", `CTR ${m.ctr}% < ${t.lowCtr}% (manual Studio value)`, "Test one new thumbnail concept (logged experiment).");
  }
  if (Number.isFinite(m.engagementPer1000Views) && m.engagementPer1000Views < t.lowEngagementRatePer1000) add("LOW_ENGAGEMENT", "low", `${m.engagementPer1000Views} engagements / 1,000 views`, "Contextual comment prompt after the payoff.");
  if (Number.isFinite(m.subscribersPer1000Views) && views >= 1000 && m.subscribersPer1000Views < t.lowSubsPer1000) add("LOW_SUBSCRIBER_CONVERSION", sampleConfidence, `${m.subscribersPer1000Views} subs / 1,000 views`, long ? "Stronger series promise and end-screen pathway." : "Series-shaped payoff; link a related long-form episode.");
  const goodRetention = Number.isFinite(m.averagePercentageViewed) && m.averagePercentageViewed >= t.goodAvp;
  if (goodRetention && Number.isFinite(base.views) && views < base.views * t.lowDistributionViewsVsMedian) add("GOOD_CONTENT_LOW_DISTRIBUTION", "low", `good retention (${m.averagePercentageViewed}%) but views ${views} < ${t.lowDistributionViewsVsMedian}× median ${base.views}`, "Do not change the video; strengthen packaging/cluster links.");
  if (!long && Number.isFinite(m.shortsFeedShare) && m.shortsFeedShare < t.shortsFeedShareMinimum && !goodRetention) add("TOPIC_FAILURE", "low", `Shorts feed share ${Math.round(m.shortsFeedShare * 100)}% and weak retention`, "Lower this cluster's topic weight until more evidence.");
  if (!long && Number.isFinite(m.averagePercentageViewed) && goodRetention && Number.isFinite(m.first30sRetention) && m.first30sRetention < 0.5) add("VISUAL_FAILURE", "low", "viewers stay on average but drop at the start of visuals", "Review first-frame evidence and visual variety.");
  if (options.titleScore != null && options.titleScore < 60 && Number.isFinite(base.views) && views < base.views * 0.5) add("TITLE_PACKAGING_FAILURE", "low", `title score ${options.titleScore} and views below half the median`, "Test one alternative title (logged).");
  if (long && options.linkedShorts && options.linkedShorts > 0 && Number.isFinite(options.shortsTrafficShare) && options.shortsTrafficShare < 0.02) add("SHORT_TO_LONG_FUNNEL_FAILURE", "low", `${options.linkedShorts} linked Shorts but ${Math.round(options.shortsTrafficShare * 100)}% of views from Shorts (inferred)`, "Check Related Video manual actions are done; test an on-screen long-form CTA.");
  return finalize(out, row, options);
}

function retentionAt(row, seconds, ratio) {
  const curve = row.retention || (row.checkpoints && row.latestCheckpoint && row.checkpoints[row.latestCheckpoint] && row.checkpoints[row.latestCheckpoint].retention) || null;
  if (!Array.isArray(curve) || !curve.length) return null;
  const target = ratio != null ? ratio : row.durationSeconds ? Math.min(1, seconds / row.durationSeconds) : null;
  if (target == null) return null;
  const point = curve.reduce((best, item) => Math.abs(item.oran - target) < Math.abs(best.oran - target) ? item : best, curve[0]);
  return point.izleme;
}

function finalize(list, row, options) {
  if (!list.length) list.push({ code: "HEALTHY", confidence: "low", evidence: "no problem pattern in available metrics", recommendation: "Keep; revisit at next checkpoint." });
  return { videoId: row.videoId, channel: row.channel, contentType: row.contentType, checkpoint: options.checkpoint || row.latestCheckpoint || null, diagnoses: list };
}

module.exports = { diagnose, retentionAt };
