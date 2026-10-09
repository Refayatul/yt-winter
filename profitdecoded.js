#!/usr/bin/env node
"use strict";
// ProfitDecoded control CLI. Everything here is read-only or writes under
// channels/profitdecoded/. NOTHING in this file uploads to YouTube.
//
//   node profitdecoded.js inventory                    inventory statistics
//   node profitdecoded.js rank [--top 20] [--evidence evidence.json] [--snapshot intel/snapshot-*.json] [--write]
//   node profitdecoded.js breakout --snapshot file.json [--threshold 55]
//   node profitdecoded.js plan                         shadow schedule + render windows
//   node profitdecoded.js dry-run <bundle.json>        full assessment + review report
//   node profitdecoded.js publish-check                show why publishing is blocked
//   node profitdecoded.js clusters                     topic clusters (Shorts -> long-form chains)
//   node profitdecoded.js freshness                    topics whose premise may be outdated (needs renewed research)
//   node profitdecoded.js story-review <dir>           assess a story package (plan/draft/critique/final) -> review.md + bundle.json

const fs = require("fs");
const path = require("path");
const P = path.join(__dirname, "core", "profitdecoded");
const Decision = require(path.join(P, "decision"));
const Comp = require(path.join(P, "competitive"));
const Port = require(path.join(P, "portfolio"));
const Sched = require(path.join(P, "schedule"));
const Pipeline = require(path.join(P, "pipeline"));
const Report = require(path.join(P, "report"));
const Rev = require(path.join(P, "revenue"));
const { CHANNEL_DIR, readJson } = require(path.join(P, "config"));

const argv = process.argv.slice(2); const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const universe = () => readJson(path.join(CHANNEL_DIR, "topics", "topic-universe.json"), { topics: [], stats: {} });

function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.h.length, ...rows.map((r) => String(c.f(r)).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join("  ");
  return [line(cols.map((c) => c.h)), line(w.map((x) => "-".repeat(x))), ...rows.map((r) => line(cols.map((c) => c.f(r))))].join("\n");
}

if (cmd === "inventory") {
  const u = universe(); console.log(JSON.stringify(u.stats, null, 2));
} else if (cmd === "rank") {
  const u = universe(); const evidence = flag("--evidence") ? readJson(path.resolve(flag("--evidence")), {}) : {};
  // --feed breakout-feed-*.json: observed collector output. Each inventory topic gets its strongest matched breakout (OBSERVED).
  if (flag("--feed")) for (const [id, b] of Object.entries(Comp.evidenceFromFeed(readJson(path.resolve(flag("--feed")), { feed: [] })))) evidence[id] = { ...(evidence[id] || {}), breakout: b };
  // --snapshot snapshot-*.json: observed per-topic coverage (long-form, same-format baselines, ages measured from the snapshot date).
  let observed = null;
  if (flag("--snapshot")) {
    observed = Comp.topicEvidenceFromSnapshot(readJson(path.resolve(flag("--snapshot")), { channels: [] }), u.topics);
    for (const [id, o] of Object.entries(observed.topics)) if (o.breakout && !(evidence[id] || {}).breakout) evidence[id] = { ...(evidence[id] || {}), breakout: o.breakout };
  }
  // Researched dossiers on disk feed the decision engine through the real research gate.
  const Research = require(path.join(P, "research")); const rdir = path.join(CHANNEL_DIR, "research");
  if (fs.existsSync(rdir)) for (const f of fs.readdirSync(rdir).filter((x) => x.endsWith(".json"))) {
    const d = readJson(path.join(rdir, f), null); if (!d) continue;
    evidence[d.topicId] = { ...(evidence[d.topicId] || {}), research: { ...Research.gate(d, { format: d.format }), researchedAt: d.researchedAt } };
  }
  const rows = Decision.rank(u.topics, evidence); const byId = Object.fromEntries(u.topics.map((t) => [t.id, t]));
  const top = Decision.selectDiverse(rows, +flag("--top", 20), { topicById: byId });
  const out = table(top, [
    { h: "#", f: (r) => top.indexOf(r) + 1 }, { h: "Topic", f: (r) => r.topic.slice(0, 52) }, { h: "Pillar", f: (r) => r.pillar.slice(0, 14) }, { h: "Type", f: (r) => r.portfolioType },
    { h: "Demand", f: (r) => r.inputs.demand.provenance === "UNKNOWN" ? "UNKNOWN" : r.inputs.demand.value }, { h: "Outlier", f: (r) => r.inputs.outlierEvidence.provenance === "UNKNOWN" ? "UNKNOWN" : r.inputs.outlierEvidence.value },
    { h: "Appeal", f: (r) => r.inputs.broadAppeal.value }, { h: "Curio", f: (r) => r.inputs.curiosity.value }, { h: "RevOpp", f: (r) => r.revenueOpportunity.category }, { h: "Evergr", f: (r) => r.inputs.evergreenValue.value },
    { h: "Long", f: (r) => r.inputs.longformPotential.value }, { h: "Visual", f: (r) => r.inputs.visualPotential.value },
    { h: "Satur", f: (r) => r.saturation === "UNKNOWN" ? "UNKNOWN" : `${r.saturation}${r.saturationProvenance === "OBSERVED" ? "" : "*"}` },
    { h: "Conflict", f: (r) => r.inputs.narrativeConflict.value }, { h: "Angle", f: (r) => r.inputs.originalAngle.value }, { h: "Lens", f: (r) => r.lens.score },
    { h: "Fresh", f: (r) => r.freshness.status === "CURRENT_UNVERIFIED" ? "-" : r.freshness.status.replace("_PREMISE", "").replace("PREMISE_", "").replace("_CONTEXT", "").replace("TIME_SENSITIVE", "TIME") },
    { h: "EBV", f: (r) => r.expectedBusinessValue.score }, { h: "Rank", f: (r) => r.rankScore }, { h: "Decision", f: (r) => r.decision },
  ]);
  const titles = top.filter((r) => r.workingTitle !== r.topic || r.titleTemplate.needsAngle).map((r) => `  ${String(top.indexOf(r) + 1).padStart(2)}. ${r.workingTitle !== r.topic ? `angle: "${r.workingTitle}" (${r.angle.premiseStatus})` : `needs angle: "${r.topic}" uses ${r.titleTemplate.class} template ${r.titleTemplate.template}`}`);
  console.log(out);
  if (titles.length) console.log("\nTitles:\n" + titles.join("\n"));
  console.log("\nNote: ESTIMATED = curation heuristics. Satur* = INFERRED from a manual public-search sample (not API data); Satur without * = OBSERVED from the collector snapshot. UNKNOWN demand/outlier/saturation are never converted into favourable scores; long-form stays blocked until observed evidence exists.");
  if (has("--write")) {
    fs.mkdirSync(path.join(CHANNEL_DIR, "reports"), { recursive: true });
    fs.writeFileSync(path.join(CHANNEL_DIR, "reports", "topic-ranking.json"), JSON.stringify({ generatedAt: new Date().toISOString(), snapshot: flag("--snapshot") ? path.basename(flag("--snapshot")) : null, top, observedCoverage: observed ? Object.fromEntries(top.filter((r) => observed.topics[r.id]).map((r) => [r.id, { related: observed.topics[r.id].related, audienceChannels: observed.topics[r.id].audienceChannels, lowViewUploads: observed.topics[r.id].lowViewUploads, top: observed.topics[r.id].top }])) : null, provenanceNote: "OBSERVED/INFERRED/ESTIMATED/UNKNOWN as labelled per input" }, null, 1) + "\n");
    fs.writeFileSync(path.join(CHANNEL_DIR, "reports", "topic-ranking.txt"), out + (titles.length ? "\n\nTitles:\n" + titles.join("\n") : "") + "\n");
  }
} else if (cmd === "breakout") {
  const snap = readJson(path.resolve(flag("--snapshot", "")), null);
  if (!snap) { console.error("usage: breakout --snapshot snapshot.json (build one with core/profitdecoded/competitive.js fetchSnapshot and PD_YT_API_KEY)"); process.exit(2); }
  const feed = Comp.buildBreakoutFeed(snap, { threshold: +flag("--threshold", 55), inventory: universe().topics });
  console.log(JSON.stringify(feed, null, 1));
} else if (cmd === "plan") {
  console.log(JSON.stringify(Sched.plan(new Date(), readJson(path.join(CHANNEL_DIR, "state", "published.json"), [])), null, 2));
} else if (cmd === "clusters") {
  console.log(JSON.stringify(Port.buildClusters(universe().topics).slice(0, 12), null, 1));
} else if (cmd === "freshness") {
  const u = universe(); const Fresh = require(path.join(P, "freshness"));
  const watch = readJson(path.join(CHANNEL_DIR, "topics", "freshness-watchlist.json"), { entries: [] });
  const rdir = path.join(CHANNEL_DIR, "research"); const dated = {};
  if (fs.existsSync(rdir)) for (const f of fs.readdirSync(rdir).filter((x) => x.endsWith(".json"))) { const d = readJson(path.join(rdir, f), null); if (d) dated[d.topicId] = d.researchedAt; }
  const angles = Object.fromEntries((readJson(path.join(CHANNEL_DIR, "topics", "angles.json"), { angles: [] }).angles || []).map((a) => [a.topicId, a]));
  const rows = u.topics.map((t) => ({ t, r: Fresh.check(t, watch, { researchedAt: dated[t.id], angle: angles[t.id] }) })).filter((x) => x.r.status !== "CURRENT_UNVERIFIED" || x.r.resolvedBy.length);
  const order = (x) => -x.r.severity;
  rows.sort((a, b) => order(a) - order(b));
  const strong = rows.filter((x) => x.r.flags.some((f) => f.source === "watchlist"));
  console.log(`${strong.length} topic(s) flagged by the sourced watchlist, ${rows.length - strong.length} by phrasing only (re-check during research).\n`);
  for (const { t, r } of strong) {
    console.log(`${(r.status === "CURRENT_UNVERIFIED" ? "RESOLVED" : r.status).padEnd(20)} ${r.blocksProduction ? "BLOCKS " : "       "}${t.id}\n  "${t.topic}"${angles[t.id] ? `  -> angle: "${angles[t.id].workingTitle}"` : ""}`);
    for (const f of r.flags.filter((x) => x.source === "watchlist")) console.log(`  - ${f.event}${f.addressedBy ? ` [addressed by ${f.addressedBy}]` : ""}\n    impact: ${f.impact}\n    sources: ${f.sources.map((s) => s.url).join(" , ")}`);
  }
  if (has("--all")) for (const { t, r } of rows.filter((x) => !strong.includes(x))) console.log(`${r.status.padEnd(20)} ${t.id}  (${r.flags.map((f) => f.event).join("; ")})`);
} else if (cmd === "story-review") {
  // A story package is what the story engine produces stage by stage (or what a human/LLM writer supplies):
  //   meta.json {topicId, format, minutes, title}, plan.json, draft.json, critique.json (optional), final.json {beats, graphics, changeLog}
  const W = require(path.join(P, "auto", "script-agent")); const Retention = require(path.join(P, "retention"));
  const dir = path.resolve(argv[1] || ""); const rj = (f) => readJson(path.join(dir, f), null);
  const meta = rj("meta.json"); if (!meta) { console.error("usage: story-review <dir with meta.json, plan.json, draft.json, final.json>"); process.exit(2); }
  const topic = universe().topics.find((t) => t.id === meta.topicId); const dossier = readJson(path.join(CHANNEL_DIR, "research", meta.topicId + ".json"), null);
  if (!topic || !dossier) { console.error("unknown topic or missing research dossier for " + meta.topicId); process.exit(2); }
  const format = meta.format; const words = W.wordsFor(format, meta.minutes || [8, 12]);
  const Research = require(path.join(P, "research")); const gate = Research.gate(dossier, { format });
  if (!gate.pass) { console.error("research gate FAILED: " + gate.rejections.join("; ")); process.exit(1); }
  const plan = rj("plan.json"); const draftOut = rj("draft.json"); const critique = rj("critique.json"); const approved = !!rj("final.json"); const fin = rj("final.json") || rj("latest.json"); // latest.json: a run that did not pass its gates
  const planCheck = W.evaluatePlan(plan, dossier, format); const winningHook = planCheck.selected && planCheck.selected.text;
  const ctx = { plan, winningHook, hookCandidates: plan.hookCandidates, words, title: meta.title };
  const draftFull = { ...draftOut, hookCandidates: plan.hookCandidates.map((h) => h.text) };
  const keepG = (draftFull.graphics || []).filter((g) => fin.beats.some((b) => b.id === g.beatId) && !(fin.graphics || []).some((n) => n.beatId === g.beatId));
  const finalOut = { ...draftFull, beats: fin.beats, graphics: [...keepG, ...(fin.graphics || [])], ...(fin.titleCandidates ? { titleCandidates: fin.titleCandidates } : {}) };
  const draftA = W.assess(draftFull, dossier, format, ctx); const finalA = W.assess(finalOut, dossier, format, ctx);
  // committed, human-approved editorial exceptions (one retention heuristic, this exact script version) are applied and listed
  const Ex = require(path.join(P, "exceptions")); const exr = Ex.apply(finalA.blocking, { topicId: meta.topicId, format, beats: finalOut.beats }); finalA.blocking = exr.blocking; finalA.waived = exr.waived;
  const exNote = (exr.waived.length || exr.rejected.length) ? "\n\n## Editorial exceptions\n" + exr.waived.map((w) => `- WAIVED ${w.finding} (${w.id}), approved by ${w.approvedBy} on ${w.approvedAt}: ${w.reason}. Finding: ${w.findingText}`).join("\n") + (exr.rejected.length ? "\n" + exr.rejected.map((r) => `- NOT APPLIED ${r.id}: ${r.why.join("; ")}`).join("\n") : "") + "\n" : "";
  const gateClaims = Object.fromEntries(gate.claims.map((c) => [c.id, c.status]));
  const all = [...dossier.claims, ...dossier.inferences]; const srcs = Object.fromEntries(dossier.sources.map((x) => [x.id, x]));
  const claimMap = [...new Set(finalOut.beats.map((b) => b.claimId))].map((id) => { const c = all.find((x) => x.id === id) || { text: "UNKNOWN CLAIM", sourceIds: [] }; const base = c.basisClaimIds ? c.basisClaimIds.flatMap((b) => (all.find((x) => x.id === b) || {}).sourceIds || []) : c.sourceIds; return { claimId: id, beatIds: finalOut.beats.filter((b) => b.claimId === id).map((b) => b.id), text: c.text, status: c.basisClaimIds ? "our arithmetic on " + c.basisClaimIds.join("+") : gateClaims[id] || "UNKNOWN", sources: [...new Set(base)].map((s) => srcs[s] ? `${srcs[s].publisher}, ${srcs[s].title} (${srcs[s].url})` : s), passages: (c.evidence || (c.basisClaimIds || []).flatMap((b) => (all.find((x) => x.id === b) || {}).evidence || [])).map((e) => e.passage).slice(0, 2) }; });
  const res = { plan, critique, out: finalOut, assessment: finalA, changes: fin.changeLog || [], rounds: 1, winningHook, cacheHits: 0 };
  const pkg = { topic, dossier, format, title: meta.title, generatedAt: new Date().toISOString(), plan, planCheck, critique, claimMap,
    draft: { assessment: draftA }, final: { assessment: finalA, out: finalOut, winningHook, changes: fin.changeLog || [], editorial: Retention.editorialReport(finalOut.beats, { plan, dossier, format, title: meta.title }) } };
  fs.writeFileSync(path.join(dir, "review.md"), (approved ? "" : "> NOT APPROVED: this is the latest script of a run that did not pass its gates (latest.json, not final.json). No bundle is written.\n\n") + Report.renderStory(pkg) + exNote);
  const rel = path.relative(dir, path.join(CHANNEL_DIR, "research", meta.topicId + ".json"));
  if (approved) fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify({ ...W.bundleFromStory(topic, dossier, res, format, rel), selectedTitle: meta.title }, null, 1) + "\n");
  console.log(`plan issues ${planCheck.issues.length} · draft: ${draftA.local.words} words, ${draftA.blocking.length} blocking · final: ${finalA.local.words} words, ${finalA.blocking.length} blocking, retention ${finalA.retention.score}, spoken ${finalA.spoken.score}, AI-pattern ${finalA.local.aiPatternScore}`);
  for (const b of finalA.blocking) console.log("  BLOCKING: " + b);
  for (const w of exr.waived) console.log(`  WAIVED (editorial exception ${w.id}, approved by ${w.approvedBy}): ${w.findingText}`);
  for (const r of exr.rejected) console.log(`  EXCEPTION NOT APPLIED (${r.id}): ${r.why.join("; ")}`);
  console.log("review: " + path.relative(process.cwd(), path.join(dir, "review.md")));
  process.exitCode = finalA.blocking.length || planCheck.issues.length ? 1 : 0;
} else if (cmd === "readiness") {
  // Inventory readiness from local data only (topic universe, observed snapshot, dossiers): no API calls.
  const E = require(path.join(P, "eligibility")); const Research = require(path.join(P, "research")); const u = universe(); const evidence = {}; const dossiers = {};
  const snapFile = flag("--snapshot") || (fs.readdirSync(path.join(CHANNEL_DIR, "intel")).filter((f) => /^snapshot-.*\.json$/.test(f)).sort().map((f) => path.join(CHANNEL_DIR, "intel", f)).pop());
  if (snapFile) for (const [id, o] of Object.entries(Comp.topicEvidenceFromSnapshot(readJson(snapFile, { channels: [] }), u.topics).topics)) if (o.breakout) evidence[id] = { breakout: o.breakout };
  const rdir = path.join(CHANNEL_DIR, "research");
  for (const f of fs.readdirSync(rdir).filter((x) => x.endsWith(".json"))) { const d = readJson(path.join(rdir, f), null); if (!d) continue; dossiers[d.topicId] = d; evidence[d.topicId] = { ...(evidence[d.topicId] || {}), research: { ...Research.gate(d, { format: d.format }), researchedAt: d.researchedAt } }; }
  const rows = Decision.rank(u.topics, evidence); const inv = E.inventory({ topics: u.topics, rows, dossiers }); const short = E.shortlist(inv, rows, u.topics, +flag("--top", 20));
  const out = { generatedAt: new Date().toISOString(), snapshot: snapFile ? path.relative(process.cwd(), snapFile) : null, provenanceNote: "demand = OBSERVED competitor outlier evidence (collector snapshot), never audience data for this channel; long-form suitability, visual potential and US focus are ESTIMATED heuristics; primary sources only where a verified dossier exists", summary: inv.summary, shortlist: short, topics: inv.topics };
  if (flag("--out")) fs.writeFileSync(path.resolve(flag("--out")), JSON.stringify(out) + "\n");
  console.log(JSON.stringify(inv.summary, null, 1));
  console.log(table(short, [{ h: "#", f: (r) => short.indexOf(r) + 1 }, { h: "Working title", f: (r) => (r.workingTitle || r.topic).slice(0, 58) }, { h: "Pillar", f: (r) => r.pillar.slice(0, 14) }, { h: "Tier", f: (r) => r.tier }, { h: "Demand", f: (r) => (r.flags.demandObserved ? r.flags.demandValue + " OBS" : "UNKNOWN") }, { h: "Sat", f: (r) => r.flags.oversaturated ? "HOT/SAT" : "-" }, { h: "Rank", f: (r) => r.rankScore }]));
} else if (cmd === "budget") {
  // budget status [--month YYYY-MM] | budget init | budget reconcile <entryId> --actual <usd> --by <name> --reason <text>
  const B = require(path.join(P, "budget")); const sub = argv[1];
  (async () => {
    const policy = B.loadPolicy(); const store = B.storeFromEnv(policy);
    if (sub === "init") { if (!store.init) throw new Error("init applies to the GitHub ledger"); console.log(JSON.stringify(await store.init())); return; }
    if (sub === "reconcile") {
      const id = argv[2]; let done = null;
      const bud = new B.Budget({ store, policy }); await bud.mutate((doc) => { done = B.reconcile(doc, id, Number(flag("--actual")), flag("--by"), flag("--reason")); return done; });
      console.log("reconciled: " + JSON.stringify(done)); return;
    }
    const bud = new B.Budget({ store, policy }); console.log(JSON.stringify(await bud.status(flag("--month")), null, 1));
  })().catch((e) => { console.error(`${e.code || "ERROR"}: ${e.message}`); process.exitCode = 1; });
} else if (cmd === "costs") {
  // Cost accounting from the paid-API ledger (actual vs estimated); free providers are reported per run in usage.json.
  const B = require(path.join(P, "budget"));
  (async () => { const policy = B.loadPolicy(); const store = B.storeFromEnv(policy); const { doc } = await store.read(); console.log(JSON.stringify(B.costReport(doc, policy, Date.now(), { month: flag("--month") }), null, 1)); })().catch((e) => { console.error(`${e.code || "ERROR"}: ${e.message}`); process.exitCode = 1; });
} else if (cmd === "editorial-exception") {
  // editorial-exception <storyDir> --finding retention:<type> --approver "<person>" --reason "<why>" [--ref <PR or note>]
  // Builds the record for ONE heuristic finding of the script in <storyDir> (final.json or latest.json) and writes it to
  // channels/profitdecoded/editorial-exceptions.json. Committing that file is the approval; it is reviewed like code.
  const Ex = require(path.join(P, "exceptions")); const W = require(path.join(P, "auto", "script-agent"));
  const dir = path.resolve(argv[1] || ""); const rj = (f) => readJson(path.join(dir, f), null); const meta = rj("meta.json"); const plan = rj("plan.json"); const fin = rj("final.json") || rj("latest.json");
  if (!meta || !plan || !fin) { console.error("usage: editorial-exception <storyDir> --finding retention:<type> --approver <name> --reason <text>"); process.exit(2); }
  const dossier = readJson(path.join(CHANNEL_DIR, "research", meta.topicId + ".json"), null); const pe = W.evaluatePlan(plan, dossier, meta.format);
  const a = W.assess({ ...fin, hookCandidates: plan.hookCandidates.map((h) => h.text) }, dossier, meta.format, { plan, winningHook: pe.selected && pe.selected.text, hookCandidates: plan.hookCandidates, words: W.wordsFor(meta.format, meta.minutes || [8, 12]), title: meta.title });
  const finding = a.blocking.find((b) => Ex.findingKey(b) === flag("--finding"));
  if (!finding) { console.error(`no current blocking finding of type ${flag("--finding")}; current blocking: ${a.blocking.join(" | ")}`); process.exit(1); }
  try { const x = Ex.propose({ topicId: meta.topicId, format: meta.format, beats: fin.beats, findingText: finding, approvedBy: flag("--approver"), reason: flag("--reason"), approvalRef: flag("--ref") || null }); Ex.save(x); console.log("exception recorded (commit channels/profitdecoded/editorial-exceptions.json to approve it):\n" + JSON.stringify(x, null, 1)); }
  catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "publish-check") {
  const g = Sched.publishGuard({}); console.log(g.allowed ? "ALLOWED" : "BLOCKED"); for (const b of g.blocks) console.log(" - " + b);
} else if (cmd === "dry-run") {
  const file = path.resolve(argv[1] || "");
  if (!fs.existsSync(file)) { console.error("usage: dry-run <bundle.json>"); process.exit(2); }
  const bundle = readJson(file, null); const baseDir = path.dirname(file);
  if (bundle.dossierFile) bundle.dossier = readJson(path.resolve(baseDir, bundle.dossierFile), null);
  if (bundle.graphicSpecs && !(bundle.visualPlan || []).length) bundle.visualPlan = require(path.join(__dirname, "scripts", "profitdecoded", "plan-visuals")).build(bundle);
  if (bundle.topicScore == null) { const t = universe().topics.find((x) => x.id === bundle.topic.id); if (t) bundle.topicScore = t.score.score; }
  const result = Pipeline.run(bundle, { baseDir });
  const topic = universe().topics.find((t) => t.id === bundle.topic.id);
  const extra = topic ? { portfolioType: Port.classifyPortfolioType(topic), ebv: Rev.expectedBusinessValue(topic), longPotential: topic.formats.longformExpansionPotential, learningValue: bundle.learningValue } : { learningValue: bundle.learningValue };
  const md = Report.render(result, bundle, extra);
  const outDir = path.join(baseDir, "out"); fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "review-report.md"), md); fs.writeFileSync(path.join(outDir, "assessment.json"), JSON.stringify(result, null, 1) + "\n");
  console.log(`${result.assessment.decision}  quality ${result.assessment.quality.total}  humanness ${result.assessment.humanness.score}  premium-test ${result.assessment.premiumMediaTest.verdict}`);
  for (const r of result.assessment.reasons) console.log(" - " + r);
  console.log("report: " + path.relative(process.cwd(), path.join(outDir, "review-report.md")));
  process.exitCode = 0;
} else {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(3, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
