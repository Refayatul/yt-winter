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
  // Story package (plan/draft/critique/final + usage): written even when a run pauses, so nothing is lost.
  const storyDir = legacy ? null : writeStoryPackage(path.join(dirs.auto, `${topic.id}-${format}`, "story"), topic, format, w, ledger, deps);
  if (w.status === "paused") return finish("paused", { reasons: w.reasons, pausedAt: w.pausedAt, storyDir });
  if (w.status !== "ok") return finish("script-failed", { reasons: w.reasons, draft: w.out, storyDir });
  // 3. bundle on disk
  const rel = path.relative(path.join(dirs.auto, `${topic.id}-${format}`), path.join(dirs.research, topic.id + ".json"));
  const bundle = legacy ? Writer.toBundle(topic, dossier, w.out, format, rel) : Writer.bundleFromStory(topic, dossier, w, format, rel);
  const dir = path.join(dirs.auto, `${topic.id}-${format}`); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n");
  return finish("bundle-ready", { bundlePath: path.join(dir, "bundle.json"), bundle, spendUsd: ledger.usd, storyDir });
}

// Provider usage + cost report. Actual charges: paid providers from the spend ledger; free tiers cannot be confirmed
// from an API response (billing is an account setting), so their usage is reported with a list-price equivalent.
const LIST_PRICE = { groq: { "openai/gpt-oss-120b": { input: 0.15, output: 0.75, source: "Groq launch post (day-zero GPT-OSS), upper of published figures" }, "openai/gpt-oss-20b": { input: 0.1, output: 0.5, source: "Groq launch post" } } };
function usageReport(ledger, deps = {}) {
  const Gm = require("./gemini");
  const stages = Object.entries(ledger.stages || {}).map(([name, st]) => ({ stage: name, providers: st.providers || [], models: st.models || [], calls: st.calls, inputTokens: st.usage.input_tokens || 0, outputTokens: st.usage.output_tokens || 0, reasoningTokens: st.reasoningTokens || 0, cacheReadTokens: st.usage.cache_read_input_tokens || 0, paidUsd: st.usd || 0, lastRateLimit: st.lastRate || null }));
  const byProvider = {};
  for (const s2 of stages) for (const p of s2.providers.length ? s2.providers : ["unknown"]) {
    const b = byProvider[p] = byProvider[p] || { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, models: [] };
    b.calls += s2.calls; b.inputTokens += s2.inputTokens; b.outputTokens += s2.outputTokens; b.reasoningTokens += s2.reasoningTokens; for (const m of s2.models) if (!b.models.includes(m)) b.models.push(m);
  }
  const eq = (prov, b) => b.models.reduce((sum, m) => { const pr = prov === "gemini" ? Gm.PAID_EQUIVALENT[m.replace(/-\d{3,}$/, "")] || Gm.PAID_EQUIVALENT[m] : (LIST_PRICE.groq[m] || null); if (!pr) return sum; const out = prov === "gemini" ? b.outputTokens + b.reasoningTokens : b.outputTokens; return sum + (b.inputTokens * pr.input + out * pr.output) / 1e6 / b.models.length; }, 0);
  for (const [p, b] of Object.entries(byProvider)) b.listPriceEquivalentUsd = Math.round(eq(p, b) * 10000) / 10000;
  return {
    generatedAt: new Date().toISOString(), paidBudgetUsd: ledger.maxUsd, paidSpendUsd: ledger.usd, tokenGuard: ledger.maxTokens, tokensCounted: ledger.tokens, stages, byProvider,
    charges: { anthropic: { usd: ledger.usd, basis: "spend ledger (list prices); 0 means no paid call was made" }, groq: { usd: 0, basis: "free plan stated by the owner; Groq console billing is the source of truth" }, gemini: { usd: 0, basis: "free tier stated by the owner; only free-tier-listed models can be called; AI Studio billing is the source of truth" } },
    note: "Token counts are the providers' own usage fields. listPriceEquivalentUsd is what the same usage would cost on paid plans; it is not a charge.",
  };
}

function writeStoryPackage(dir, topic, format, w, ledger, deps) {
  fs.mkdirSync(dir, { recursive: true });
  const put = (f, v) => { if (v != null) fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 1) + "\n"); };
  put("meta.json", { topicId: topic.id, format, minutes: deps.minutes || [8, 12], title: deps.title || topic.topic, status: w.status, pausedAt: w.pausedAt || null, reasons: w.reasons || [], log: w.log || [] });
  put("plan.json", w.plan);
  if (w.draft) put("draft.json", { ...w.draft.out, hookCandidates: [] });
  // provider + model of the stage as recorded in this run's ledger; a stage replayed from the disk cache made no call in this run
  const who = (st) => { const r = (ledger.stages || {})[st]; return r && r.models && r.models.length ? `${[].concat(r.providers || []).join(",")} ${[].concat(r.models).join(",")}` : "replayed from the stage cache of an earlier run; see that run's usage.json"; };
  if (w.critique) put("critique.json", { provenance: `Independent critique stage (${who("critique")}), fresh context: it never saw the drafting conversation.`, ...w.critique });
  if (w.evaluation) put("evaluation.json", { provenance: `Independent final evaluation (${who("evaluate")}), fresh context.`, ...w.evaluation });
  if (w.out && w.status === "ok") put("final.json", { beats: w.out.beats, graphics: w.out.graphics, changeLog: w.changes || [] });
  else if (w.out && w.draft) put("latest.json", { status: w.status, beats: w.out.beats, graphics: w.out.graphics, changeLog: w.changes || [], blocking: (w.assessment || {}).blocking || [] });
  put("usage.json", usageReport(ledger, deps));
  return dir;
}

module.exports = { usageReport, writeStoryPackage, produce, selectTopic, existingDossier, loadRuns, saveRun, dirsDefault, COOLDOWN_DAYS };
