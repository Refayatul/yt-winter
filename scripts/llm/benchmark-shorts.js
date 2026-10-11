#!/usr/bin/env node
"use strict";

// Shorts benchmark: the Haiku writer against the production baseline on IDENTICAL topics, one
// representative topic per distinct Shorts pipeline profile. Never renders, uploads or publishes.
//
//   node scripts/llm/benchmark-shorts.js --out DIR                 dry run: prompts, token and cost estimates, baselines
//   node scripts/llm/benchmark-shorts.js --out DIR --run           one paid request per topic, each refused without
//                                                                  that channel's single-use paid approval
//   --topics impossible-brief:IB-SPA-001,critical-thread:CT-001   override the representative set
//
// Output: DIR/<channel>/<topic>/ (see shorts-shadow.js), DIR/benchmark.json, DIR/BENCHMARK.md and, after a
// paid run, DIR/blind-review.md (A/B order shuffled) with the key in DIR/blind-key.json for the editor.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Channel = require("../../core/channel-context");
const Router = require("../../core/llm/router");
const { shadow } = require("./shorts-shadow");

// Representative, already-researched topics: one per pipeline profile. FR is the legacy case-file
// pipeline; IB, CT and BTO share the isolated pipeline with different editorial profiles.
const DEFAULT_TOPICS = [
  ["impossible-brief", "IB-SPA-001"],
  ["critical-thread", "CT-001"],
  ["behind-the-ordinary", "BTO-016"],
  ["failure-reconstructed", "aberfan-1966"],
];
// Expected (not worst-case) output for one Short: ~8 beats with evidence ids and shot notes plus metadata.
const EXPECTED_OUTPUT_TOKENS = 900;
const REALISTIC_CHARS_PER_TOKEN = 4;

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }

function expectedUsd(summary, price, options = {}) {
  // The cached system prefix is read at cacheRead price after the first Short of a channel.
  const input = summary.inputTokensEstimate * 2.8 / REALISTIC_CHARS_PER_TOKEN;
  const usd = input / 1e6 * price.input + EXPECTED_OUTPUT_TOKENS / 1e6 * price.output;
  return Math.round((options.batch ? usd / 2 : usd) * 1e6) / 1e6;
}

function blindReview(rows, outDir) {
  const lines = ["# Blind Shorts review", "", "For each topic, read A and B without knowing which is the production baseline. Rate hook, clarity, accuracy against the cited facts, progression and visual potential from 1 to 5 and note any factual problem. The key is in blind-key.json; open it only after rating.", ""];
  const key = {};
  for (const row of rows.filter((r) => r.candidateLines)) {
    const swap = crypto.randomInt(2) === 1;
    const [a, b] = swap ? [row.candidateLines, row.baselineLines] : [row.baselineLines, row.candidateLines];
    key[row.topicId] = { A: swap ? "haiku" : "baseline", B: swap ? "baseline" : "haiku" };
    lines.push(`## ${row.channel} / ${row.topicId}`, "", "**A**", "", ...a.map((x) => `- ${x}`), "", "**B**", "", ...b.map((x) => `- ${x}`), "", "| | Hook | Clarity | Accuracy | Progression | Visual potential | Notes |", "|---|---|---|---|---|---|---|", "| A | | | | | | |", "| B | | | | | | |", "");
  }
  fs.writeFileSync(path.join(outDir, "blind-review.md"), lines.join("\n"));
  fs.writeFileSync(path.join(outDir, "blind-key.json"), JSON.stringify(key, null, 1) + "\n");
}

async function benchmark({ out, run = false, topics = DEFAULT_TOPICS, env = process.env, sdk, store, policy }) {
  fs.mkdirSync(out, { recursive: true });
  const routing = Router.loadRouting();
  const rows = [];
  for (const [slug, topicId] of topics) {
    const channel = Channel.getChannel(slug);
    const dir = path.join(out, slug, topicId);
    const row = { channel: slug, topicId };
    try {
      const summary = await shadow({ channel, topicId, out: dir, run, env, sdk, store, policy });
      const route = Router.resolve("short-script", channel, { env, routing });
      Object.assign(row, { model: summary.model, mode: summary.mode, maxUsd: summary.maxUsd, inputTokensEstimate: summary.inputTokensEstimate });
      if (summary.mode === "dry-run") Object.assign(row, { expectedUsd: expectedUsd(summary, route.price), expectedBatchUsd: expectedUsd(summary, route.price, { batch: true }), baseline: summary.baseline });
      const baseline = JSON.parse(fs.readFileSync(path.join(dir, "baseline.json"), "utf8"));
      row.baselineLines = baseline.lines; row.baselineGenerator = baseline.generator;
      if (summary.mode === "run") {
        const candidate = JSON.parse(fs.readFileSync(path.join(dir, "candidate.json"), "utf8"));
        const comparison = JSON.parse(fs.readFileSync(path.join(dir, "comparison.json"), "utf8"));
        Object.assign(row, { actualUsd: summary.actualUsd, usage: summary.usage, gatePasses: summary.gatePasses, blockers: summary.blockers, comparison, candidateLines: candidate.beats.map((beat) => beat.text) });
      }
    } catch (error) {
      row.error = `${error.code || "ERROR"}: ${error.message}`;
    }
    rows.push(row);
  }
  const report = { generatedAt: new Date().toISOString(), mode: run ? "run" : "dry-run", rows: rows.map(({ baselineLines, candidateLines, ...rest }) => rest) };
  fs.writeFileSync(path.join(out, "benchmark.json"), JSON.stringify(report, null, 1) + "\n");
  if (run) blindReview(rows, out);
  fs.writeFileSync(path.join(out, "BENCHMARK.md"), markdown(report));
  return report;
}

function markdown(report) {
  const lines = [`# Shorts benchmark (${report.mode})`, "", `Generated ${report.generatedAt}. Identical topics; the baseline is the production growth-plan script for the same topic. No video was rendered or published.`, ""];
  lines.push("| Channel | Topic | Model | Input tokens (est.) | Reserved max $ | Expected $ | Expected $ (batch) | Actual $ | Gates | Baseline words / s |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of report.rows) {
    if (r.error) { lines.push(`| ${r.channel} | ${r.topicId} | | | | | | | refused: ${r.error.replace(/\|/g, "/")} | |`); continue; }
    lines.push(`| ${r.channel} | ${r.topicId} | ${r.model} | ${r.inputTokensEstimate || "—"} | ${r.maxUsd != null ? r.maxUsd.toFixed(5) : "—"} | ${r.expectedUsd != null ? r.expectedUsd.toFixed(5) : "—"} | ${r.expectedBatchUsd != null ? r.expectedBatchUsd.toFixed(5) : "—"} | ${r.actualUsd != null ? r.actualUsd.toFixed(5) : "not run"} | ${r.gatePasses == null ? "not run" : r.gatePasses ? "pass" : "BLOCK: " + r.blockers.join("; ").replace(/\|/g, "/")} | ${r.baseline ? `${r.baseline.words} / ${r.baseline.estimatedSeconds}` : r.comparison ? `${r.comparison.baseline.words} / ${r.comparison.baseline.estimatedSeconds}` : "—"} |`);
  }
  lines.push("", `Expected cost assumes ${REALISTIC_CHARS_PER_TOKEN} characters per token and ${EXPECTED_OUTPUT_TOKENS} output tokens; the reserved maximum prices every input token as a cache write and the whole max_tokens as output. Neither is a measurement: only a paid run's settled usage is.`, "");
  if (report.mode === "dry-run") lines.push("Quality has not been measured: no candidate exists until a paid run is approved. Do not read anything into the baseline column beyond length.", "");
  return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const out = arg(argv, "--out");
  if (!out) { console.error("usage: benchmark-shorts.js --out DIR [--run] [--topics slug:id,...]"); return 1; }
  const topics = arg(argv, "--topics") ? arg(argv, "--topics").split(",").map((pair) => pair.split(":")) : DEFAULT_TOPICS;
  const report = await benchmark({ out, run: argv.includes("--run"), topics });
  console.log(markdown(report));
  return report.rows.some((row) => row.error) ? 2 : 0;
}

if (require.main === module) main().then((code) => { process.exitCode = code; });

module.exports = { DEFAULT_TOPICS, benchmark, expectedUsd, markdown, main };
