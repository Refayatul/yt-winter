#!/usr/bin/env node
"use strict";

// IMPOSSIBLEBRIEF OPENING EXPERIMENT (A: current opening, B: craft v2 opening), on the existing
// framework (core/growth/experiments.js). Nothing is enabled unless --write is given.
//
//   node scripts/growth/opening-experiment.js plan   [--channel impossible-brief] [--count 10]
//   node scripts/growth/opening-experiment.js plan   --write     (creates the RUNNING experiment)
//   node scripts/growth/opening-experiment.js report [--channel impossible-brief]
//
// Design: the next N topics the production selector would choose (same exclusions, no state
// written) are sorted by category and selector score and paired; within each pair a deterministic
// coin decides which topic opens the current way (control) and which with "craft-v2-opening"
// (variant). The pairs keep categories and selector scores balanced across the arms at n = 5.
// Only the planned topics join the experiment; every other Short is produced as before.
// The arm changes the opening only (Craft.features: opening on, repeats/pacing/captions off);
// facts, scripts, sources, licensing and every gate are unchanged.

const fs = require("fs");
const path = require("path");
const Channel = require("../../core/channel-context");
const Growth = require("../../core/growth");
const Discovery = require("../../core/discovery");
const Experiments = require("../../core/growth/experiments");
const Engagement = require("../../core/growth/engagement");
const Scripting = require("../../core/scripting");
const Craft = require("../../core/rendering/craft");
const Pipeline = require("../../core/pipeline/impossible-brief");
const os = require("os");

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "plan";
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const channel = Channel.getChannel(option("channel", "impossible-brief"));
const ID = option("id", `${channel.slug}-short-opening_visual-craft-v2`);

function plan(count) {
  const exclude = [...Discovery.usedIds(channel)];
  const picked = []; const blocked = [];
  const universe = Discovery.universe(channel).topics || [];
  while (picked.length < count && blocked.length < 40) {
    const selection = Growth.selectShortTopic(channel, { exclude, write: false });
    if (!selection.selected) break;
    const topic = selection.selected.topic;
    exclude.push(topic.id);
    // Production's own pre-render gate (core/pipeline/impossible-brief.js chooseTopic): a topic it
    // would BLOCK never gets produced, so it cannot hold an experiment slot.
    const raw = universe.find((item) => item.id === topic.id);
    const pre = Growth.planShort(channel, topic.id, { legacyTitles: Scripting.titleCandidates(raw), write: false, selection: selection.decision });
    if (pre.readiness.decision === "BLOCK") { blocked.push(`${topic.slug} (${pre.readiness.hardFails.join("; ") || pre.readiness.ProductionReadinessScore})`); continue; }
    // ...and its visual pre-check (at least 4 licensed pictures/clips), which skipped two planned
    // topics in the 2026-10-12 production run. Downloads into a temporary folder; free sources only.
    if (!argv.includes("--no-visual-check")) {
      const shortfall = Pipeline.visualShortfall(raw, fs.mkdtempSync(path.join(os.tmpdir(), "opening-experiment-")));
      if (shortfall) { blocked.push(`${topic.slug} (visual pre-check: ${shortfall})`); continue; }
    }
    const score = selection.selected.score || {};
    picked.push({ slug: topic.slug, id: topic.id, category: topic.category || "OTHER", bucket: score.bucket || "?",
      score: Number(score.SelectionScore) || 0, viral: Number(score.ViralPotentialScore) || 0 });
  }
  if (picked.length < count || count % 2) throw new Error(`need an even ${count} qualified topics; the selector returned ${picked.length}`);
  // Same-category pairs first (closest selector scores), then the leftovers paired by score.
  const byScore = (a, b) => b.score - a.score;
  const couples = []; const left = [];
  for (const category of [...new Set(picked.map((t) => t.category))]) {
    const group = picked.filter((t) => t.category === category).sort(byScore);
    while (group.length >= 2) couples.push([group.shift(), group.shift()]);
    left.push(...group);
  }
  left.sort(byScore);
  while (left.length >= 2) couples.push([left.shift(), left.shift()]);
  const pairs = couples.map(([a, b], i) => {
    const flip = Engagement.hash01(`${ID}:pair:${a.slug}:${b.slug}`) < 0.5;
    return { pair: i + 1, control: flip ? a : b, variant: flip ? b : a };
  });
  return { picked, pairs, blocked };
}

function metricsFor(videoId, checkpoint) {
  const file = path.join(Channel.ROOT, "channels", channel.slug, "analytics", videoId, `${checkpoint}.json`);
  if (!videoId || !fs.existsSync(file)) return null;
  const m = JSON.parse(fs.readFileSync(file, "utf8")).metrikler || {};
  const v = (key) => (m[key] && Number.isFinite(m[key].deger) ? m[key].deger : null);
  return { views: v("views"), averageViewPercentage: v("averageViewPercentage"), first30sRetention: v("first30sRetention"),
    stayedToWatch: v("stayedToWatch"), engagedShareProxy: v("views") ? +(v("engagedViews") / v("views")).toFixed(3) : null };
}

function report() {
  const experiment = Experiments.load(channel).experiments.find((item) => item.experiment_id === ID);
  if (!experiment) { console.log(`${ID}: not created (run "plan --write" after approval)`); return; }
  const mean = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null);
  console.log(`${ID} (${experiment.status}); primary metric: averageViewPercentage at 72 h (YouTube Analytics API).`);
  console.log("engagedShareProxy = engagedViews / views: a proxy, NOT YouTube's 'stayed to watch' (that is Studio-only; import it with scripts/studio-import.js).");
  for (const checkpoint of ["3d", "7d"]) {
    console.log(`\n## ${checkpoint === "3d" ? "72 hours" : "7 days"}\n\n| Arm | Topic | Video | Views | Avg % viewed | 30 s retention | Stayed to watch (Studio) | Engaged share (proxy) |\n|---|---|---|---|---|---|---|---|`);
    const arms = {};
    for (const arm of ["control", "variant"]) {
      arms[arm] = experiment.sample[arm].map((item) => ({ item, m: metricsFor(item.videoId, checkpoint) }));
      for (const { item, m } of arms[arm]) console.log(`| ${arm} | ${item.key} | ${item.videoId || "not published"} | ${m ? m.views : "—"} | ${m ? m.averageViewPercentage : "—"} | ${m ? m.first30sRetention : "—"} | ${m && m.stayedToWatch != null ? m.stayedToWatch : "not imported"} | ${m ? m.engagedShareProxy : "—"} |`);
    }
    const ready = (arm) => arms[arm].filter((row) => row.m && row.m.averageViewPercentage != null);
    const c = ready("control"); const v = ready("variant");
    console.log(`\nAvg % viewed: control ${mean(c.map((r) => r.m.averageViewPercentage))} (n=${c.length}), variant ${mean(v.map((r) => r.m.averageViewPercentage))} (n=${v.length}).`);
    if (c.length < experiment.minimum_per_arm || v.length < experiment.minimum_per_arm) console.log(`Insufficient data: ${experiment.minimum_per_arm} per arm are needed; no conclusion is drawn.`);
  }
}

if (command === "report") report();
else {
  const count = Number(option("count", 10));
  const { pairs, blocked } = plan(count);
  if (blocked.length) console.log(`Skipped (production's pre-render gate would block them): ${blocked.join(", ")}\n`);
  // What each arm switches on in the renderer (Craft.features), with SHORTS_CRAFT_V2 unset as in production.
  const arm = (value) => Craft.features(channel.slug, { experiment: { variable: "opening_visual", value } }, {});
  const control = arm("current"); const variant = arm("craft-v2-opening");
  const onlyOpening = !Object.values(control).some(Boolean) && variant.opening && !variant.repeats && !variant.pacing && !variant.captions;
  console.log(`Arm check: control ${JSON.stringify(control)}; variant ${JSON.stringify(variant)} -> ${onlyOpening ? "only the opening differs" : "MORE THAN THE OPENING DIFFERS: do not start"}`);
  if (process.env.SHORTS_CRAFT_V2) console.log("WARNING: SHORTS_CRAFT_V2 is set in this environment; production must leave it unset for IB during the experiment.");
  if (!onlyOpening) process.exitCode = 3;
  console.log(`Experiment ${ID}: opening_visual, control "current", variant "craft-v2-opening", ${count / 2} per arm (matched pairs).\n`);
  console.log("| Pair | Control (current opening) | Variant (craft v2 opening) | Category | Selection score | Viral potential | Bucket |\n|---|---|---|---|---|---|---|");
  const both = (p, key) => (p.control[key] === p.variant[key] ? p.control[key] : `${p.control[key]} / ${p.variant[key]}`);
  for (const p of pairs) console.log(`| ${p.pair} | ${p.control.slug} | ${p.variant.slug} | ${both(p, "category")} | ${both(p, "score")} | ${both(p, "viral")} | ${both(p, "bucket")} |`);
  const avg = (arm, key) => (pairs.reduce((sum, p) => sum + p[arm][key], 0) / pairs.length).toFixed(1);
  console.log(`\nArm means: selection score ${avg("control", "score")} vs ${avg("variant", "score")}; viral potential ${avg("control", "viral")} vs ${avg("variant", "viral")}.`);
  const planned = Object.fromEntries(pairs.flatMap((p) => [[p.control.slug, "control"], [p.variant.slug, "variant"]]));
  if (argv.includes("--write")) {
    const row = Experiments.create(channel, { id: ID, variable: "opening_visual", control: "current", variant: "craft-v2-opening", metric: "averageViewPercentage", planned,
      hypothesis: "A subject photograph or illustration with a large boxed hook keeps more viewers past the opening than the current opening.",
      notes: "Primary: averageViewPercentage at the 72 h checkpoint; secondary: 7 d, 30 s retention, Studio stayed-to-watch when imported. engagedViews/views is reported only as a proxy." });
    console.log(`\nCreated ${row.experiment_id} (RUNNING) in channels/${channel.slug}/memory/${Experiments.FILE}.`);
  } else console.log("\nDry run: nothing written. Add --write (after approval) to create the experiment.");
}
