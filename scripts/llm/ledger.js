#!/usr/bin/env node
"use strict";
// Per-channel LLM budget ledger (core/llm/client.js): one JSON file per channel on the llm-budget-ledger branch.
//   node scripts/llm/ledger.js status --channel impossible-brief      read-only: today's and this month's committed spend, approval state
//   node scripts/llm/ledger.js init   --channel impossible-brief      creates the branch and/or the channel's empty ledger file (no spend)
// Token: LLM_BUDGET_TOKEN or GITHUB_TOKEN (contents: write for init). LLM_BUDGET_STORE=file uses a local file instead.
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const Llm = require(path.join(root, "core/llm/client"));
const Budget = require(path.join(root, "core/profitdecoded/budget"));

async function main(argv = process.argv.slice(2)) {
  const sub = argv[0]; const slug = argv.includes("--channel") ? argv[argv.indexOf("--channel") + 1] : null;
  if (!["status", "init"].includes(sub) || !slug) { console.error("usage: ledger.js status|init --channel <slug>"); return 1; }
  const channel = Channel.getChannel(slug);
  const policy = Llm.loadPolicy(channel);
  const store = Llm.storeFor(channel, policy);
  if (sub === "init") {
    if (store.kind === "file") { await store.read(); console.log(`local ledger ready: ${path.relative(root, store.file)}`); return 0; }
    const made = await store.init();
    if (made.created) { console.log(`created branch ${store.branch} with ${store.file}`); return 0; }
    try { await store.read(); console.log(`${store.branch}:${store.file} already exists`); }
    catch (e) { if (e.code !== "STATE_MISSING") throw e; await store.write(Budget.emptyLedger(), null); console.log(`created ${store.branch}:${store.file}`); }
    return 0;
  }
  const { doc } = await store.read(); const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10); const month = Budget.monthKey(now);
  const ap = Budget.approvalState(doc, policy, now);
  console.log(JSON.stringify({ channel: slug, paidEnabled: policy.paidEnabled, approval: ap.ok ? { usable: true, id: ap.approval.id, expiresAt: ap.approval.expiresAt, model: ap.approval.model || null, maxUsd: ap.approval.maxUsd || null } : { usable: false, reason: ap.reason },
    today: { ...Budget.totals(doc, policy, now, { day }), limitUsd: policy.dailyUsd }, month: { script: Budget.totals(doc, policy, now, { month, pool: "script" }), experiment: Budget.totals(doc, policy, now, { month, pool: "experiment" }), limits: policy.monthlyUsd },
    perShortLimitUsd: policy.maxPerScriptUsd }, null, 1));
  return 0;
}
if (require.main === module) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(`ledger: ${e.code || ""} ${e.message}`); process.exitCode = 2; });
module.exports = { main };
