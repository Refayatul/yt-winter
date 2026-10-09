#!/usr/bin/env node
"use strict";
// Autonomous ProfitDecoded production (DRY-RUN, never uploads).
//   node scripts/profitdecoded/auto-produce.js [--topic <id>] [--format short|long]
//        [--through script|audio|render|assess] [--max-usd 3] [--dry]
// Needs ANTHROPIC_API_KEY for the research/script stages. --dry only selects the topic and prints the plan.
// Script stage: the staged story engine (PD_STORY_ENGINE=legacy for the single-call writer); per-stage cost is printed.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const Produce = require(path.join(root, "core/profitdecoded/auto/produce"));
const LLM = require(path.join(root, "core/profitdecoded/auto/llm"));
const argv = process.argv.slice(2); const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const format = flag("--format", "short"); const through = flag("--through", "assess");
if (!["short", "long"].includes(format) || !["script", "audio", "render", "assess"].includes(through)) { console.error("usage: auto-produce.js [--topic id] [--format short|long] [--through script|audio|render|assess] [--max-usd N] [--dry]"); process.exit(2); }
const universe = JSON.parse(fs.readFileSync(path.join(root, "channels/profitdecoded/topics/topic-universe.json"), "utf8")).topics;
const dirs = Produce.dirsDefault();
const pick = flag("--topic") ? { topic: universe.find((t) => t.id === flag("--topic")) } : Produce.selectTopic(universe, dirs, format);
if (!pick || !pick.topic) { console.error("no eligible topic (all rejected, recently failed, or unknown id)"); process.exit(3); }
const topic = pick.topic;
console.log(`topic: ${topic.topic} (${topic.id})  format: ${format}  through: ${through}${pick.decision ? `  decision: ${pick.decision.decision} rank ${pick.decision.rankScore}` : ""}`);
if (argv.includes("--dry")) { console.log(`plan: [provider: ${LLM.provider()}] research (web search + page verification) -> script -> bundle${through === "script" ? "" : " -> narration -> render -> assessment"}; model ${LLM.provider() === "groq" ? require(path.join(root, "core/profitdecoded/auto/groq")).MODEL() : LLM.MODEL()}; guard ${LLM.provider() === "groq" ? (process.env.PD_AUTO_MAX_TOKENS || 400000) + " tokens" : "$" + flag("--max-usd", process.env.PD_AUTO_MAX_USD || 3)}`); process.exit(0); }
(async () => {
  const run = (label, args) => { console.log(`> ${label}`); const p = spawnSync("node", args, { stdio: "inherit", cwd: root }); if (p.status !== 0) { console.error(`${label} failed (${p.status})`); process.exit(p.status || 1); } };
  const r = await Produce.produce({ topic, universe, format, deps: { maxUsd: flag("--max-usd") ? Number(flag("--max-usd")) : undefined, ledger: LLM.newLedger(flag("--max-usd") ? Number(flag("--max-usd")) : undefined) }, dirs });
  console.log(`${r.status}  (${r.ledger.calls} API calls, ${r.ledger.tokens ? r.ledger.tokens + " Groq tokens" : "estimated spend $" + r.ledger.usd.toFixed(2)})`);
  for (const s of r.steps) console.log("  - " + JSON.stringify({ ...s, stages: undefined, log: undefined }));
  for (const [name, st] of Object.entries(r.ledger.stages || {})) console.log(`  cost ${name.padEnd(9)} ${st.calls} call(s)  in ${st.usage.input_tokens || 0}  cache-write ${st.usage.cache_creation_input_tokens || 0}  cache-read ${st.usage.cache_read_input_tokens || 0}  out ${st.usage.output_tokens || 0}  ~$${st.usd.toFixed(3)}`);
  if (r.storyDir) console.log("story package: " + path.relative(process.cwd(), r.storyDir) + " (usage.json has per-provider tokens and charges)");
  if (r.status === "paused") { for (const x of r.reasons || []) console.log("  PAUSED: " + x); console.log(`Stopped safely at stage "${r.pausedAt}". Completed stages are cached; re-run the same command to resume. No fallback to a paid provider.`); process.exit(0); }
  if (r.status !== "bundle-ready") { for (const x of r.reasons || []) console.log("  REASON: " + x); console.log("Nothing was produced. Gates were not relaxed."); process.exit(1); }
  if (r.storyDir) run("story review", ["profitdecoded.js", "story-review", path.relative(root, r.storyDir)]);
  console.log("bundle: " + path.relative(process.cwd(), r.bundlePath));
  const rel = path.relative(root, r.bundlePath);
  if (through !== "script") run("narration + music", ["scripts/profitdecoded/produce-audio.js", rel]);
  if (through === "render" || through === "assess") run("render", ["scripts/profitdecoded/render.js", rel]);
  if (through === "assess") { run("assessment", ["profitdecoded.js", "dry-run", rel]); }
})().catch((e) => { console.error(e.code ? `${e.code}: ${e.message}` : e.message); process.exit(1); });
