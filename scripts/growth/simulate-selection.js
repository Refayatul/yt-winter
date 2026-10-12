#!/usr/bin/env node
"use strict";
// Read-only simulation of Shorts topic selection, day by day, exactly as the isolated pipeline's
// chooseTopic does it (selection, then the pre-render readiness gate with duplicate detection on).
// Nothing is written: no decisions, experiments or state.
//
//   node scripts/growth/simulate-selection.js --channel critical-thread [--days 14] [--start 2026-10-12]
//   GROWTH_VIRAL_EXCEPTION_PREVIEW=critical-thread node scripts/growth/simulate-selection.js ...   (preview a disabled exception)
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const Growth = require(path.join(root, "core/growth"));
const Discovery = require(path.join(root, "core/discovery"));
const Scripting = require(path.join(root, "core/scripting"));

function simulate(slug, { days = 14, start = new Date(Date.now() + 86400000).toISOString().slice(0, 10) } = {}) {
  const channel = Channel.getChannel(slug);
  const config = Growth.Config.forChannel(channel);
  const used = [...Discovery.usedIds(channel)];
  const exclude = [...used];
  const rows = [];
  const day0 = Date.parse(`${start}T12:00:00Z`);
  for (let d = 0; d < days; d += 1) {
    const date = new Date(day0 + d * 86400000).toISOString().slice(0, 10);
    let picked = null; const blocked = [];
    for (let attempt = 0; attempt < 3 && !picked; attempt += 1) {
      const selection = Growth.selectShortTopic(channel, { exclude, write: false, date });
      if (!selection.selected) { rows.push({ date, selected: null, reason: selection.reason, blocked }); break; }
      const topic = selection.selected.topic;
      const plan = Growth.planShort(channel, topic.id, { legacyTitles: Scripting.titleCandidates(topic), write: false, assignExperiment: false, selection: selection.decision });
      if (plan.readiness.decision === "BLOCK") { blocked.push({ id: topic.id, why: plan.readiness.hardFails.join("; ") || String(plan.readiness.ProductionReadinessScore) }); exclude.push(topic.id); continue; }
      picked = { date, mode: selection.mode, id: topic.id, title: topic.title, bucket: selection.selected.score.bucket, viral: selection.selected.score.ViralPotentialScore, readiness: plan.readiness.decision, readinessScore: plan.readiness.ProductionReadinessScore, duplicateOf: plan.topicDecision && plan.topicDecision.duplicateOf || null, blocked };
      exclude.push(topic.id);
    }
    if (picked) rows.push(picked);
    else if (!rows.length || rows[rows.length - 1].date !== date) rows.push({ date, selected: null, reason: "three consecutive pre-gate blocks", blocked });
  }
  return { channel: slug, viralMinimum: config.viralScoring.minimumToProduce, exception: config.viralScoring.exception || null, usedTopics: used, days: rows };
}

if (require.main === module) {
  const argv = process.argv.slice(2); const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const r = simulate(flag("--channel", "critical-thread"), { days: Number(flag("--days", 14)), start: flag("--start", undefined) });
  console.log(`# ${r.channel}: viral minimum ${r.viralMinimum}${r.exception ? ` (exception ${r.exception.mode})` : ""}; ${r.usedTopics.length} topics already used`);
  for (const d of r.days) console.log(d.id ? `${d.date} ${d.mode} ${d.id} [${d.bucket} v${d.viral}] readiness ${d.readiness} ${d.readinessScore}${d.blocked.length ? ` (after blocking ${d.blocked.map((b) => b.id).join(",")})` : ""} — ${d.title}` : `${d.date} SKIP — ${d.reason}${d.blocked.length ? ` (blocked: ${d.blocked.map((b) => `${b.id}: ${b.why}`).join(" | ")})` : ""}`);
}
module.exports = { simulate };
