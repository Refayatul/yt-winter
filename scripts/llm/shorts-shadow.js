#!/usr/bin/env node
"use strict";

// Shadow run of the Haiku Shorts writer for one topic. It never changes what production renders or
// publishes: it writes a side-by-side record next to the production package (or to --out).
//
//   node scripts/llm/shorts-shadow.js --channel impossible-brief --topic IB-SPA-001 [--out DIR]
//       Dry run (default): prompt, routed model, worst-case cost and the production baseline. No API call.
//   ... --run
//       Sends ONE request through core/llm/client.js. Refused unless the channel's llm-budget.json has
//       paidEnabled=true and a usable single-use paidApproval, and <PREFIX>_ANTHROPIC_API_KEY is set.
//
// Exit codes: 0 written (whatever the gate verdict), 2 refused or failed (nothing paid without a
// settled ledger entry), 1 usage error.

const fs = require("fs");
const path = require("path");
const Channel = require("../../core/channel-context");
const Context = require("../../core/growth/context");
const Growth = require("../../core/growth");
const Writer = require("../../core/llm/shorts-writer");
const Llm = require("../../core/llm/client");

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }

// Production baseline for the same topic: the growth plan script, computed without writing state.
function baselineLines(channel, topic) {
  const plan = Growth.planShort(channel, topic.id, { write: false, skipDuplicate: true });
  return { generator: plan.script.generator, lines: plan.script.lines || (plan.script.claims || []).map((claim) => claim.text) };
}

async function shadow({ channel, topicId, out, run = false, env = process.env, sdk, store, policy }) {
  const ctx = Context.build(channel, {});
  const topic = ctx.inventory.find((item) => item.id === topicId || item.slug === topicId);
  if (!topic) throw new Error(`${channel.name}: topic not found: ${topicId}`);
  const dir = out || path.join(channel.paths.production, topic.slug, "llm-shadow");
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 1) + "\n");
  const prompt = Writer.buildPrompt(topic, channel, { config: ctx.config });
  const client = Llm.createClient(channel, { run, env, sdk, store, policy, logFile: path.join(dir, "usage.jsonl") });
  const baseline = baselineLines(channel, topic);
  write("baseline.json", baseline);
  write("prompt.json", { system: prompt.system, user: prompt.user, schema: prompt.schema });
  const result = await client.call("short-script", { system: prompt.system, user: prompt.user, schema: prompt.schema }, { videoId: topic.id });
  if (result.dryRun) {
    const summary = { mode: "dry-run", topicId: topic.id, channel: channel.slug, model: result.route.model, maxUsd: result.maxUsd, inputTokensEstimate: result.inputTokensEstimate, maxOutputTokens: result.params.max_tokens, baselineGenerator: baseline.generator, baseline: Writer.describe(baseline.lines) };
    write("summary.json", summary);
    return summary;
  }
  const validation = Writer.validate(result.json, topic, channel, prompt);
  const comparison = Writer.compare(baseline.lines, result.json.beats.map((beat) => beat.text), topic, channel, { config: ctx.config, candidateValidation: validation });
  write("candidate.json", result.json);
  write("validation.json", validation);
  write("comparison.json", comparison);
  if (validation.passes) write("candidate-script.json", Writer.toScript(result.json, topic));
  const summary = { mode: "run", topicId: topic.id, channel: channel.slug, model: result.route.model, actualUsd: result.actualUsd, usage: result.record.usage, gatePasses: validation.passes, blockers: validation.blockers, editorialReview: validation.editorialReview };
  write("summary.json", summary);
  return summary;
}

async function main(argv = process.argv.slice(2)) {
  const slug = arg(argv, "--channel"); const topicId = arg(argv, "--topic");
  if (!slug || !topicId) { console.error("usage: shorts-shadow.js --channel <slug> --topic <id|slug> [--out DIR] [--run]"); return 1; }
  try {
    const summary = await shadow({ channel: Channel.getChannel(slug), topicId, out: arg(argv, "--out"), run: argv.includes("--run") });
    console.log(JSON.stringify(summary, null, 1));
    return 0;
  } catch (error) {
    console.error(`[llm-shadow] ${error.code || "ERROR"}: ${error.message}`);
    return 2;
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code; });

module.exports = { shadow, baselineLines, main };
