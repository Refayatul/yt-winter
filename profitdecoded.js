#!/usr/bin/env node
"use strict";
// ProfitDecoded control CLI. Everything here is read-only or writes under
// channels/profitdecoded/. NOTHING in this file uploads to YouTube.
//
//   node profitdecoded.js inventory                    inventory statistics
//   node profitdecoded.js rank [--top 20] [--evidence evidence.json] [--write]
//   node profitdecoded.js breakout --snapshot file.json [--threshold 55]
//   node profitdecoded.js plan                         shadow schedule + render windows
//   node profitdecoded.js dry-run <bundle.json>        full assessment + review report
//   node profitdecoded.js publish-check                show why publishing is blocked
//   node profitdecoded.js clusters                     topic clusters (Shorts -> long-form chains)
//   node profitdecoded.js freshness                    topics whose premise may be outdated (needs renewed research)

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
  console.log("\nNote: ESTIMATED = curation heuristics. Satur* = INFERRED from a manual public-search sample (not API data). UNKNOWN demand/outlier/saturation are never converted into favourable scores; long-form stays blocked until observed evidence exists.");
  if (has("--write")) {
    fs.mkdirSync(path.join(CHANNEL_DIR, "reports"), { recursive: true });
    fs.writeFileSync(path.join(CHANNEL_DIR, "reports", "topic-ranking.json"), JSON.stringify({ generatedAt: new Date().toISOString(), top, provenanceNote: "ESTIMATED/UNKNOWN as labelled per input" }, null, 1) + "\n");
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
  const rows = u.topics.map((t) => ({ t, r: Fresh.check(t, watch, { researchedAt: dated[t.id] }) })).filter((x) => x.r.status !== "CURRENT_UNVERIFIED");
  const order = (x) => -x.r.severity;
  rows.sort((a, b) => order(a) - order(b));
  const strong = rows.filter((x) => x.r.flags.some((f) => f.source === "watchlist"));
  console.log(`${strong.length} topic(s) flagged by the sourced watchlist, ${rows.length - strong.length} by phrasing only (re-check during research).\n`);
  for (const { t, r } of strong) {
    console.log(`${r.status.padEnd(20)} ${r.blocksProduction ? "BLOCKS " : "       "}${t.id}\n  "${t.topic}"`);
    for (const f of r.flags.filter((x) => x.source === "watchlist")) console.log(`  - ${f.event}${f.addressedByResearch ? " [addressed by dossier]" : ""}\n    impact: ${f.impact}\n    sources: ${f.sources.map((s) => s.url).join(" , ")}`);
  }
  if (has("--all")) for (const { t, r } of rows.filter((x) => !strong.includes(x))) console.log(`${r.status.padEnd(20)} ${t.id}  (${r.flags.map((f) => f.event).join("; ")})`);
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
