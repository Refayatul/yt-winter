"use strict";

// PER-CHANNEL GROWTH DASHBOARD (PHASE 34). Each channel is reported from its
// own state only; cross-channel infrastructure health is listed separately and
// performance baselines are never blended.

const fs = require("fs");
const path = require("path");
const Channel = require("../channel-context");
const Config = require("./config");
const Store = require("./store");
const Context = require("./context");
const Analytics = require("./analytics");
const Learning = require("./learning");
const Funnel = require("./funnel");
const Lane = require("./lane");
const Experiments = require("./experiments");

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } }

function channelHealth(channel, now = new Date()) {
  const config = Config.forChannel(channel);
  const ranked = Context.rank(channel);
  const perf = Analytics.readAll(channel);
  const baselines = Analytics.baselines(channel, perf);
  const learning = Learning.read(channel);
  const relationships = Funnel.load(channel);
  const lane = Lane.status(channel, now);
  const laneState = Store.readState(channel, "longform", "lane.json", { cycles: [] });
  const episodes = Lane.episodes(channel);
  const clusters = Store.readState(channel, "growth", "clusters.json", { clusters: {} });
  const alerts = Store.readState(channel, "growth", "alerts.json", []).slice(-10);
  const experiments = Experiments.load(channel).experiments;
  const history = ranked.context.history;
  const legacy = channel.config.pathMode === "legacy-adapter";
  const lastShort = history.published.filter((row) => (row.format || "short") === "short").map((row) => row.publishAt || row.tarih).filter(Boolean).sort().pop() || null;
  const enrichment = ranked.rows.filter((row) => row.score.bucket === "C" || row.score.enrichable).slice(0, 10).map((row) => ({ slug: row.topic.slug, bucket: row.score.bucket, reason: row.score.reasons.join("; ") }));
  const tiktok = channel.config.platforms.tiktok && channel.config.platforms.tiktok.enabled
    ? (() => { const t = readJson(path.join(Channel.ROOT, "icerik", "tiktok.json"), []); const rows = Array.isArray(t) ? t : []; return { enabled: true, mode: channel.config.platforms.tiktok.mode, recordedItems: rows.length, sent: rows.filter((row) => row.publishId).length, errors: rows.filter((row) => row.hata).length, last: rows.map((row) => row.tarih).sort().pop() || null }; })()
    : { enabled: false };
  return {
    channel: channel.slug,
    name: channel.name,
    shorts: {
      lastPublished: lastShort,
      published: history.published.filter((row) => (row.format || "short") === "short").length,
      inventory: ranked.distribution,
      nextSelection: (() => { const sel = require("./index").selectShortTopic(channel, { ranked, date: now.toISOString().slice(0, 10) }); return { slug: sel.selected ? sel.selected.topic.slug : null, reason: sel.reason }; })(),
      baseline: baselines.short,
    },
    longform: {
      lane: { cycleId: lane.cycleId, due: lane.due, reason: lane.reason, lastPublished: lane.lastPublished },
      lastCycle: laneState.cycles[laneState.cycles.length - 1] || null,
      episodes: episodes.length,
      backlog: (() => { try { return Lane.candidates(channel, ranked.context).slice(0, 5).map((row) => ({ slug: row.topic.slug, LongFormPotentialScore: row.potential.LongFormPotentialScore, bucket: row.potential.bucket, mode: row.mode })); } catch (error) { return []; } })(),
      baseline: baselines.long,
    },
    tiktok,
    clusters: { count: Object.keys(clusters.clusters || {}).length, integrity: Funnel.clusterIntegrity(channel) },
    funnel: {
      shortToLong: relationships.shortToLong.length,
      longToLong: relationships.longToLong.length,
      pendingRelatedVideoManualActions: relationships.manualActions.filter((item) => !item.done).length,
    },
    growth: { trackedVideos: perf.length, subscriberConversion: { shorts: baselines.short.subscribersPer1000Views, longform: baselines.long.subscribersPer1000Views } },
    learning: { shorts: { status: learning.shorts.status || "heuristics-only", sampleSize: learning.shorts.sampleSize, adopted: learning.shorts.adopted.length, hypotheses: learning.shorts.hypotheses.length }, longform: { status: learning.longform.status || "heuristics-only", sampleSize: learning.longform.sampleSize, adopted: learning.longform.adopted.length } },
    experiments: experiments.map((item) => ({ id: item.experiment_id, contentType: item.content_type, variable: item.variable, status: item.status, confidence: item.confidence })),
    enrichmentTasks: enrichment,
    alerts,
    legacyPaths: legacy,
  };
}

function infrastructure() {
  const workflows = fs.readdirSync(path.join(Channel.ROOT, ".github", "workflows")).filter((file) => file.endsWith(".yml"));
  return {
    workflows,
    channels: Object.keys(Channel.registry().channels),
    growthEngineConfig: fs.existsSync(Config.DEFAULTS_PATH),
    analyticsSupport: Analytics.SUPPORT,
  };
}

function build(now = new Date()) {
  const channels = Object.keys(Channel.registry().channels).map((slug) => channelHealth(Channel.getChannel(slug), now));
  return { generatedAt: now.toISOString(), note: "Per-channel baselines are computed separately and never blended.", channels, infrastructure: infrastructure() };
}

function markdown(report) {
  const out = [`# Growth dashboard`, "", `Generated ${report.generatedAt}. ${report.note}`, ""];
  for (const c of report.channels) {
    out.push(`## ${c.name}`, "");
    out.push(`**Shorts health** — last published ${c.shorts.lastPublished || "never"} · ${c.shorts.published} published · inventory A${c.shorts.inventory.A}/B${c.shorts.inventory.B}/C${c.shorts.inventory.C}/D${c.shorts.inventory.D} · next: ${c.shorts.nextSelection.slug || "—"} (${c.shorts.nextSelection.reason})`, "");
    out.push(`**Long-form health** — cycle ${c.longform.lane.cycleId}: ${c.longform.lastCycle ? c.longform.lastCycle.status + (c.longform.lastCycle.reason ? " — " + c.longform.lastCycle.reason : "") : "no cycle yet"} · episodes ${c.longform.episodes} · lane ${c.longform.lane.due ? "DUE" : "not due"} (${c.longform.lane.reason})`, "");
    if (c.tiktok.enabled) out.push(`**TikTok** — enabled (${c.tiktok.mode}); ${c.tiktok.recordedItems} recorded item(s)`, "");
    out.push(`**Long-form backlog** — ${c.longform.backlog.map((row) => `${row.slug} ${row.LongFormPotentialScore}/${row.bucket}`).join(", ") || "empty"}`, "");
    out.push(`**Content clusters** — ${c.clusters.count} · integrity ${c.clusters.integrity.ok ? "OK" : c.clusters.integrity.problems.join("; ")}`, "");
    out.push(`**Growth / subscriber conversion** — tracked ${c.growth.trackedVideos} · subs/1k Shorts ${c.growth.subscriberConversion.shorts ?? "n/a"} · subs/1k long ${c.growth.subscriberConversion.longform ?? "n/a"}`, "");
    out.push(`**Learning** — Shorts ${c.learning.shorts.status} (n=${c.learning.shorts.sampleSize}, adopted ${c.learning.shorts.adopted}) · Long-form ${c.learning.longform.status} (n=${c.learning.longform.sampleSize})`, "");
    out.push(`**Short → Long funnel** — ${c.funnel.shortToLong} link(s), ${c.funnel.longToLong} long→long, ${c.funnel.pendingRelatedVideoManualActions} pending RELATED_VIDEO_MANUAL_ACTION_REQUIRED`, "");
    if (c.enrichmentTasks.length) out.push(`**Research/source enrichment tasks**`, "", ...c.enrichmentTasks.slice(0, 5).map((task) => `- ${task.slug} (${task.bucket}): ${task.reason}`), "");
    if (c.alerts.length) out.push(`**Recent alerts**`, "", ...c.alerts.map((alert) => `- ${alert.date} ${alert.code}: ${alert.message}`), "");
  }
  out.push("## Cross-channel infrastructure", "", `Channels: ${report.infrastructure.channels.join(", ")} · workflows: ${report.infrastructure.workflows.length} · growth config present: ${report.infrastructure.growthEngineConfig}`, "");
  return out.join("\n") + "\n";
}

module.exports = { channelHealth, build, markdown, infrastructure };
