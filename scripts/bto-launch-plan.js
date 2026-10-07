#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Channel = require("../core/channel-context");
const Editorial = require("../channels/behind-the-ordinary/editorial");

const channel = Channel.getChannel("behind-the-ordinary");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (value) => Math.round(value * 10) / 10;

function candidate(row, rank) {
  return {
    rank,
    id: row.topic.id,
    topic: row.topic.topic,
    coreQuestion: row.topic.coreQuestion,
    category: row.topic.category,
    canonicalTopic: row.topic.canonicalTopic,
    score: row.editorial.total,
    factors: row.editorial.factors,
    status: row.editorial.productionReady ? "PRODUCTION_READY" : "RESEARCH_REQUIRED",
    progressiveReveal: row.editorial.progressiveReveal,
  };
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function longClusters(rows, limit = 3) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.topic.canonicalTopic || "").trim();
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].filter(([, members]) => members.length >= 3).map(([subject, members]) => {
    members.sort((a, b) => b.editorial.total - a.editorial.total);
    const selected = members.slice(0, 5);
    const editorialAverage = selected.reduce((sum, row) => sum + row.editorial.total, 0) / selected.length;
    const longAverage = selected.reduce((sum, row) => sum + Number((row.topic.longFormPotential || {}).score || 0), 0) / selected.length;
    const visualAverage = selected.reduce((sum, row) => sum + Number((row.topic.visualPotential || {}).score || 0), 0) / selected.length;
    const score = round(editorialAverage * 0.55 + longAverage * 0.25 + visualAverage * 0.20);
    return {
      subject,
      title: `The Hidden Design Logic of ${titleCase(subject)}`,
      centralTheme: `The connected design problems solved by familiar details in ${subject}.`,
      score,
      targetMinutes: [8, 12],
      members: selected.map((row) => ({ id: row.topic.id, question: row.topic.coreQuestion, score: row.editorial.total, status: row.editorial.productionReady ? "PRODUCTION_READY" : "RESEARCH_REQUIRED" })),
      productionReady: selected.length >= 3 && selected.every((row) => row.editorial.productionReady),
      assemblyRule: "Research is reusable, but the episode must be rewritten as one causal narrative; never concatenate Short scripts.",
    };
  }).sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject)).slice(0, limit);
}

function build(universe, options = {}) {
  const weights = options.weights || Editorial.WEIGHTS;
  const ranked = Editorial.rank(universe.topics.filter((topic) => topic.status === "qualified"), { weights, minimum: options.minimum || 82 });
  const top30 = ranked.slice(0, 30).map((row, index) => candidate(row, index + 1));
  const top10 = ranked.slice(0, 10).map((row, index) => candidate(row, index + 1));
  const productionQueue = ranked.filter((row) => row.editorial.productionReady && row.editorial.progressiveReveal && row.editorial.total >= 85)
    .map((row, index) => candidate(row, index + 1));
  const clusters = longClusters(ranked, 3);
  return {
    schema: "hidden-logic-launch-plan/1",
    channel: channel.slug,
    channelName: channel.name,
    generatedAt: new Date().toISOString(),
    policy: {
      weights,
      minimumResearchPriority: 82,
      minimumProductionScore: 85,
      evidenceGate: "Only VERIFIED + productionReady records may enter production. A ranked research question is not a factual script.",
      qualityGate: "Overall >= 88 and every channel component floor must pass; otherwise skip the upload.",
    },
    counts: { inventory: universe.topics.length, researchRanked: ranked.length, launchCandidates: top30.length, productionReady: productionQueue.length },
    top30,
    top10,
    productionQueue,
    longFormClusters: clusters,
    recommendedFirstShort: productionQueue[0] || null,
    recommendedFirstLongForm: clusters[0] || null,
  };
}

function markdown(plan) {
  const lines = ["# The Hidden Logic of Things — launch plan", "", `Generated: ${plan.generatedAt}`, "", "## Top 10 Short research priorities", ""];
  for (const item of plan.top10) lines.push(`${item.rank}. **${item.topic}** — ${item.score}/100 — ${item.status}`);
  lines.push("", "## Top 3 long-form clusters", "");
  for (const [index, cluster] of plan.longFormClusters.entries()) lines.push(`${index + 1}. **${cluster.title}** — ${cluster.score}/100 — ${cluster.productionReady ? "PRODUCTION_READY" : "RESEARCH_REQUIRED"}`);
  lines.push("", "## First production recommendation", "", plan.recommendedFirstShort ? `Short: **${plan.recommendedFirstShort.topic}** (${plan.recommendedFirstShort.score}/100)` : "No Short currently clears the evidence and progressive-reveal gates.", "",
    plan.recommendedFirstLongForm ? `Long-form: **${plan.recommendedFirstLongForm.title}** (${plan.recommendedFirstLongForm.score}/100; ${plan.recommendedFirstLongForm.productionReady ? "ready" : "research required"})` : "No coherent long-form cluster is available.", "");
  return lines.join("\n");
}

function main() {
  const universe = read(channel.paths.topicUniverse);
  const plan = build(universe);
  const jsonFile = path.join(channel.paths.reports, "launch-plan.json");
  const mdFile = path.join(channel.paths.reports, "launch-plan.md");
  if (!process.argv.includes("--no-write")) {
    fs.mkdirSync(channel.paths.reports, { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(plan, null, 2) + "\n");
    fs.writeFileSync(mdFile, markdown(plan) + "\n");
  }
  console.log(JSON.stringify({ channel: plan.channel, launchCandidates: plan.top30.length, productionReady: plan.productionQueue.length,
    firstShort: plan.recommendedFirstShort && plan.recommendedFirstShort.topic, firstLong: plan.recommendedFirstLongForm && plan.recommendedFirstLongForm.title }, null, 2));
}

if (require.main === module) main();

module.exports = { candidate, longClusters, build, markdown };
