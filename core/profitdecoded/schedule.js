"use strict";
// Scheduling + publication protection (spec 25, 33, 35).
// ProfitDecoded is a SHADOW channel: it is registered disabled, never enters
// the live portfolio queue, and cannot upload until every guard below passes.

const S = require("./signals");
const { channelConfig, thresholds } = require("./config");

// Offset (minutes) of an IANA zone at a UTC instant, via Intl (DST-correct, no deps).
function zoneOffsetMinutes(tz, date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 60000;
}
// Local wall-clock time on a given local calendar day -> UTC Date.
function localToUtc(tz, ymd, hhmm) {
  const [y, m, d] = ymd.split("-").map(Number); const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - zoneOffsetMinutes(tz, new Date(guess.getTime() - zoneOffsetMinutes(tz, guess) * 60000)) * 60000);
}
function localDay(tz, date) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function weekday(tz, date) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(date); }

// history: published/scheduled records [{format, publishAt}]
function plan(now = new Date(), history = []) {
  const cfg = channelConfig(); const pub = cfg.publishing;
  const tz = pub.shorts.publishWindowsLocal[0].tz;
  const today = localDay(tz, now);
  const shortAt = localToUtc(tz, today, pub.shorts.publishWindowsLocal[0].time);
  const prodShort = new Date(`${now.toISOString().slice(0, 10)}T${pub.shorts.productionTimeUtc}:00Z`);
  const shortToday = history.some((h) => h.format === "short" && localDay(tz, new Date(h.publishAt)) === today);
  const isLongDay = weekday(tz, now) === pub.longForm.publishDay;
  const lastLong = history.filter((h) => h.format === "long").map((h) => Date.parse(h.publishAt)).sort().pop();
  const longDue = (!lastLong || now.getTime() - lastLong >= 6 * 864e5);
  const nextSat = (() => { for (let i = 0; i < 8; i += 1) { const d = new Date(now.getTime() + i * 864e5); if (weekday(tz, d) === pub.longForm.publishDay) return localToUtc(tz, localDay(tz, d), pub.longForm.publishTimeLocal); } return null; })();
  return {
    channel: "profitdecoded", mode: "SHADOW (disabled in live portfolio)", timeZone: tz,
    short: { maxPerDay: pub.shorts.maxPerDay, alreadyScheduledToday: shortToday, productionStartUtc: prodShort.toISOString(), publishAtUtc: shortAt.toISOString(), publishAtLocal: `${today} ${pub.shorts.publishWindowsLocal[0].time} ${tz}`, mustSkipIfBelowGates: true },
    long: { due: longDue && isLongDay, nextPublishAtUtc: nextSat && nextSat.toISOString(), productionDays: pub.longForm.productionDays, productionStartUtc: pub.longForm.productionTimeUtc, publishLocal: `${pub.longForm.publishDay} ${pub.longForm.publishTimeLocal} ${pub.longForm.publishTz}` },
    renderIsolation: { avoidsExistingCronMinutes: [0, 7, 11, 17, 23, 27, 29, 30, 37, 41, 43, 47, 53], profitdecodedMinute: 50, note: "starts at :50 UTC, clear of the existing portfolio cron minutes; the global maxConcurrentRenders=1 lane still applies" },
    rationale: pub.scheduleRationale, learningWillOptimize: true,
  };
}

// ---- Publication guard: every condition must hold; each failure is reported. ----
// ctx: {env, assessment (quality.assess result), dryRun, approvals (count of human approvals so far), hasCredentials}
function publishGuard(ctx = {}) {
  const cfg = channelConfig(); const env = ctx.env || process.env; const blocks = [];
  if (ctx.dryRun !== false) blocks.push("dry-run mode (default): no upload is ever attempted");
  if (cfg.enabled !== true) blocks.push("channel config enabled=false (shadow mode)");
  if (cfg.platforms && cfg.platforms.youtube && cfg.platforms.youtube.enabled !== true) blocks.push("platforms.youtube.enabled=false");
  const flag = ctx.format === "long" ? cfg.publishing.longFormPublishFlag : cfg.publishing.publishFlag;
  if (String(env[flag] || "") !== "1") blocks.push(`${flag} is not set to 1`);
  if (!ctx.hasCredentials) blocks.push("PD_YT_* credentials not present/verified for this channel");
  if (!cfg.youtubeChannelId && !env.PD_YT_CHANNEL_ID) blocks.push("expected YouTube channel id not configured (identity check impossible)");
  if (!ctx.assessment) blocks.push("no quality assessment attached");
  else if (ctx.assessment.decision !== "PUBLISH") blocks.push(`assessment is ${ctx.assessment.decision}, not PUBLISH`);
  const need = cfg.publishing.requireHumanApprovalForFirstN;
  if ((ctx.approvals || 0) < need) blocks.push(`first ${need} videos need recorded human approval (has ${ctx.approvals || 0})`);
  return { allowed: blocks.length === 0, blocks };
}

module.exports = { plan, publishGuard, zoneOffsetMinutes, localToUtc, localDay };
