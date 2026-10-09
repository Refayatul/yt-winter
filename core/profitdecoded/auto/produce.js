"use strict";
// Autonomous production orchestrator (research -> script -> bundle). Dry-run only:
// it never uploads. Downstream stages (audio, render, assessment) are run by
// scripts/profitdecoded/auto-produce.js on the bundle this returns.

const fs = require("fs");
const path = require("path");
const LLM = require("./llm");
const Research = require("../research");
const Decision = require("../decision");
const Agent = require("./research-agent");
const Writer = require("./script-agent");
const { CHANNEL_DIR, readJson } = require("../config");

const COOLDOWN_DAYS = 7;
const dirsDefault = () => ({ research: path.join(CHANNEL_DIR, "research"), auto: path.join(CHANNEL_DIR, "auto"), state: path.join(CHANNEL_DIR, "state") });

function loadRuns(dirs) { return readJson(path.join(dirs.state, "auto-runs.json"), { runs: [] }); }
function saveRun(dirs, run) {
  fs.mkdirSync(dirs.state, { recursive: true });
  const file = path.join(dirs.state, "auto-runs.json"); const db = loadRuns(dirs); db.runs.push(run); db.runs = db.runs.slice(-200);
  fs.writeFileSync(file, JSON.stringify(db, null, 1) + "\n");
}
const recentlyFailed = (db, topicId, now) => db.runs.some((r) => r.topicId === topicId && /failed/.test(r.status) && now - Date.parse(r.at) < COOLDOWN_DAYS * 864e5);

function existingDossier(dirs, topicId, format) {
  const d = readJson(path.join(dirs.research, topicId + ".json"), null);
  if (!d) return null;
  const gate = Research.gate(d, { format: d.format || format });
  return gate.pass && (d.format || format) === format ? { dossier: d, gate } : null;
}

// Pick the next topic with the decision engine: researched dossiers feed it, recent failures are skipped.
function selectTopic(universe, dirs, format, now = Date.now()) {
  const evidence = {};
  if (fs.existsSync(dirs.research)) for (const f of fs.readdirSync(dirs.research).filter((x) => x.endsWith(".json"))) {
    const d = readJson(path.join(dirs.research, f), null); if (d && d.topicId) evidence[d.topicId] = { research: Research.gate(d, { format: d.format }) };
  }
  const db = loadRuns(dirs); const rows = Decision.rank(universe, evidence);
  const byId = Object.fromEntries(universe.map((t) => [t.id, t]));
  const pick = rows.find((r) => r.decision !== "REJECT" && byId[r.id].formats[format] && !recentlyFailed(db, r.id, now));
  return pick ? { topic: byId[pick.id], decision: pick } : null;
}

async function produce({ topic, universe, format = "short", deps = {}, dirs = dirsDefault(), now = Date.now() }) {
  const steps = []; const ledger = deps.ledger || LLM.newLedger(deps.maxUsd);
  const finish = (status, extra = {}) => { const run = { at: new Date(now).toISOString(), topicId: topic.id, format, status, usd: ledger.usd, calls: ledger.calls, reasons: extra.reasons || [] }; if (!deps.noRecord) saveRun(dirs, run); return { status, topic, steps, ledger, ...extra }; };
  // 1. research (reuse a passing dossier; otherwise research live)
  let dossier; const reused = existingDossier(dirs, topic.id, format);
  if (reused) { dossier = reused.dossier; steps.push({ step: "research", reused: true, score: reused.gate.score }); }
  else {
    const r = await Agent.research(topic, format, { ...deps, ledger });
    steps.push({ step: "research", reused: false, status: r.status, score: r.gate && r.gate.score, dropped: (r.dropped || []).length, usd: ledger.usd });
    if (r.status !== "ok") return finish("research-failed", { reasons: r.reasons, dropped: r.dropped });
    dossier = { ...r.dossier, topicId: topic.id, format };
    fs.mkdirSync(dirs.research, { recursive: true }); fs.writeFileSync(path.join(dirs.research, topic.id + ".json"), JSON.stringify(dossier, null, 2) + "\n");
  }
  // 2. script: the staged story engine (plan -> hooks -> draft -> independent critique -> targeted rewrite).
  //    PD_STORY_ENGINE=legacy keeps the original single-call writer.
  const legacy = (deps.storyEngine || process.env.PD_STORY_ENGINE) === "legacy";
  const w = legacy ? await Writer.write(topic, dossier, format, { ...deps, ledger }) : await Writer.develop(topic, dossier, format, { ...deps, ledger });
  steps.push({ step: "script", engine: legacy ? "legacy" : "story", status: w.status, rounds: w.rounds, log: w.log, usd: ledger.usd, stages: ledger.stages });
  if (w.status !== "ok") return finish("script-failed", { reasons: w.reasons, draft: w.out });
  // 3. bundle on disk
  const rel = path.relative(path.join(dirs.auto, `${topic.id}-${format}`), path.join(dirs.research, topic.id + ".json"));
  const bundle = legacy ? Writer.toBundle(topic, dossier, w.out, format, rel) : Writer.bundleFromStory(topic, dossier, w, format, rel);
  const dir = path.join(dirs.auto, `${topic.id}-${format}`); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n");
  return finish("bundle-ready", { bundlePath: path.join(dir, "bundle.json"), bundle, spendUsd: ledger.usd });
}

module.exports = { produce, selectTopic, existingDossier, loadRuns, saveRun, dirsDefault, COOLDOWN_DAYS };
