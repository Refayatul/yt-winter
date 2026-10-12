#!/usr/bin/env node
"use strict";
// Qualified Shorts inventory: how many upcoming daily slots the existing gates can fill, against a
// target runway, plus the research queue of existing records closest to qualifying.
//
//   node scripts/growth/topic-inventory.js --channel critical-thread [--target-days 14] [--json]
//
// "Qualified" uses production's own rules, unchanged: an unused topic in a selectable bucket, with
// ViralPotentialScore >= the effective viralScoring.minimumToProduce, whose pre-render readiness
// gate (duplicate detection on) does not BLOCK. Nothing is written.
//
// The research queue lists unused records whose gap is evidence that research can add (hook,
// source quality, templated fields, VideoPotential below the A line). Hard rejects that research
// cannot fix (duplicate, no dependency statement) are left out. Questions attempted within
// RETRY_AFTER_DAYS (channel state research-attempts.json) wait.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const Growth = require(path.join(root, "core/growth"));
const Discovery = require(path.join(root, "core/discovery"));
const Scripting = require(path.join(root, "core/scripting"));

const RETRY_AFTER_DAYS = 60;
const UNFIXABLE = /duplicate of|no dependency statement|no mechanism|not production-ready/;

function attemptsFile(channel) { return path.join(channel.paths.state, "research-attempts.json"); }
function readAttempts(channel) {
  try { return JSON.parse(fs.readFileSync(attemptsFile(channel), "utf8")); } catch (error) { return { channel: channel.slug, attempts: {} }; }
}

function readiness(channel, topic) {
  const plan = Growth.planShort(channel, topic.id, { legacyTitles: Scripting.titleCandidates(topic), write: false, assignExperiment: false });
  return { decision: plan.readiness.decision, score: plan.readiness.ProductionReadinessScore, hardFails: plan.readiness.hardFails };
}

// What keeps a record out of the qualified inventory, in the scorer's own words.
function gaps(row, minimum, aLine, selectable) {
  const out = [];
  if (!(row.score.ViralPotentialScore >= minimum)) out.push(`viral ${row.score.ViralPotentialScore} < ${minimum}`);
  if (!selectable.has(row.score.bucket)) {
    const reasons = (row.score.reasons || []).filter((reason) => /not A|boilerplate|template|single-source|experimental band|< /.test(reason));
    out.push(...(reasons.length ? reasons : [`bucket ${row.score.bucket}; VideoPotential ${row.score.VideoPotentialScore} (A from ${aLine})`]));
  }
  return out;
}

function measure(slug, { targetDays = 14, now = new Date(), attempts = null } = {}) {
  const channel = Channel.getChannel(slug);
  const config = Growth.Config.forChannel(channel);
  const minimum = Number(config.viralScoring.minimumToProduce);
  const selectable = new Set([...(config.selection.exploitBuckets || []), ...(config.selection.exploreBuckets || [])]);
  const everyDays = Number(((channel.config.publishingCadence || {}).shorts || {}).everyDays) || 1;
  const needed = Math.ceil(targetDays / everyDays);
  const used = Discovery.usedIds(channel);
  const rows = Growth.Context.rank(channel, { write: false }).rows.filter((row) => !used.has(row.topic.id) && !used.has(row.topic.slug));
  const qualified = [];
  const blocked = [];
  for (const row of rows) {
    if (!selectable.has(row.score.bucket) || !(row.score.ViralPotentialScore >= minimum)) continue;
    const gate = readiness(channel, row.topic);
    (gate.decision === "BLOCK" ? blocked : qualified).push({ id: row.topic.id, slug: row.topic.slug, bucket: row.score.bucket, viral: row.score.ViralPotentialScore, readiness: gate.decision, readinessScore: gate.score, hardFails: gate.hardFails });
  }
  const history = attempts || readAttempts(channel);
  const recent = (topic) => {
    const at = history.attempts && history.attempts[topic.slug] && history.attempts[topic.slug].at;
    return !!at && (now - new Date(at)) / 86400000 < RETRY_AFTER_DAYS;
  };
  const aLine = Number(config.topic.buckets.A);
  const priority = new Set((config.topic.priorityClusters || []).map((c) => String(c).toUpperCase()));
  const done = new Set([...qualified, ...blocked].map((item) => item.id));
  const queue = rows
    .filter((row) => !done.has(row.topic.id))
    .filter((row) => !(row.score.bucket === "D" && !row.score.enrichable && (row.score.reasons || []).some((reason) => UNFIXABLE.test(reason))))
    .filter((row) => !(row.score.reasons || []).some((reason) => /duplicate of/.test(reason)))
    .filter((row) => !recent(row.topic))
    .map((row) => ({
      id: row.topic.id, slug: row.topic.slug, title: row.topic.title, cluster: row.topic.cluster, canonicalTopic: row.topic.canonicalTopic,
      bucket: row.score.bucket, potential: row.score.VideoPotentialScore, viral: row.score.ViralPotentialScore,
      gap: gaps(row, minimum, aLine, selectable).join("; "),
      // Research adds evidence; it barely moves ViralPotentialScore (CriticalThread carries a fixed
      // weak-footage penalty). So records already at the viral minimum come first, then those over
      // the A line (only hook/source/template evidence missing), then priority clusters, potential.
      rank: (row.score.ViralPotentialScore >= minimum ? 2000 : 0) + (row.score.VideoPotentialScore >= aLine ? 1000 : 0) + (priority.has(String(row.topic.cluster).toUpperCase()) ? 100 : 0) + (row.score.VideoPotentialScore || 0) + (row.score.ViralPotentialScore || 0) / 100,
    }))
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return {
    channel: slug, targetDays, everyDays, needed, viralMinimum: minimum, exception: config.viralScoring.exception || null,
    qualified: qualified.length, runwayDays: qualified.length * everyDays, deficit: Math.max(0, needed - qualified.length),
    qualifiedTopics: qualified, blockedAtReadiness: blocked, queue,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const result = measure(flag("--channel", "critical-thread"), { targetDays: Number(flag("--target-days", 14)) });
  if (argv.includes("--json")) { console.log(JSON.stringify({ ...result, queue: result.queue.slice(0, 40) }, null, 2)); }
  else {
    console.log(`# ${result.channel}: ${result.qualified} qualified topic(s) = ${result.runwayDays} day(s) of runway; target ${result.targetDays} day(s); deficit ${result.deficit}`);
    console.log(`viral minimum ${result.viralMinimum}${result.exception ? ` (exception ${result.exception.mode})` : ""}`);
    for (const item of result.qualifiedTopics) console.log(`  qualified ${item.id} [${item.bucket} v${item.viral}] readiness ${item.readiness} ${item.readinessScore}`);
    for (const item of result.blockedAtReadiness) console.log(`  blocked   ${item.id} [${item.bucket} v${item.viral}] ${item.hardFails.join("; ")}`);
    console.log(`research queue: ${result.queue.length} record(s); next ${Math.min(10, result.queue.length)}:`);
    for (const item of result.queue.slice(0, 10)) console.log(`  ${item.id} [${item.bucket} p${item.potential} v${item.viral}] ${item.cluster} — ${item.gap}`);
  }
}

module.exports = { measure, readAttempts, attemptsFile, RETRY_AFTER_DAYS };
