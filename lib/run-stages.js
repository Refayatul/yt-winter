// PRODUCTION STAGES: what one channel's run actually completed, stage by stage.
//
// A green workflow used to mean only that the steps did not crash (every channel step is
// continue-on-error and a skipped day exits 0). Each Shorts run now records, per channel:
//   RESEARCH SCRIPT ASSETS NARRATION RENDER QA UPLOAD SCHEDULE PUBLISH
// each one "done", "failed", "skipped", "scheduled" or "not-reached", with the exact reason, plus an outcome:
//   UPLOADED      a video was uploaded and scheduled (PUBLISH happens at publishAt on YouTube)
//   NOT_DUE       the channel's slot has not come yet, or today's Short already exists
//   NO_TOPIC      no topic passes the quality bar (nothing produced on purpose)
//   BLOCKED       a quality/readiness gate stopped the video (nothing uploaded on purpose)
//   FAILED        a dependency or stage failed (nothing uploaded)
//   DRY_RUN       rendered without upload (PUBLISH != 1); never counts as production
// scripts/production-outcome.js turns the records into the run summary and fails the workflow
// when an active channel was due and nothing was uploaded.
//
//   const run = Stages.start(channel);  run.done("RESEARCH", "slug");  run.fail("NARRATION", "Edge 403");
//   run.outcome("UPLOADED", { videoId });  (each call writes state/ops/production-stages.json)
"use strict";

const fs = require("fs");
const path = require("path");

const STAGES = ["RESEARCH", "SCRIPT", "ASSETS", "NARRATION", "RENDER", "QA", "UPLOAD", "SCHEDULE", "PUBLISH"];
const OUTCOMES = ["UPLOADED", "NOT_DUE", "NO_TOPIC", "BLOCKED", "FAILED", "DRY_RUN"];
const HISTORY = 30;

const file = (channel) => path.join(channel.paths.state, "ops", "production-stages.json");

function load(channel) {
  try { return JSON.parse(fs.readFileSync(file(channel), "utf8")); } catch (error) { return { channel: channel.slug, runs: [] }; }
}

function start(channel, { now = () => new Date().toISOString(), env = process.env } = {}) {
  const record = {
    runId: env.GITHUB_RUN_ID || null, attempt: env.GITHUB_RUN_ATTEMPT || null, startedAt: now(), publish: env.PUBLISH === "1",
    // What started this run: schedule, a verified Cloudflare repository_dispatch (with its correlation id), or manual.
    trigger: { event: env.GITHUB_EVENT_NAME || null, correlationId: env.DISPATCH_CORRELATION_ID || null },
    targetDay: null,
    slug: null, outcome: null, reason: null,
    stages: Object.fromEntries(STAGES.map((stage) => [stage, { status: "not-reached" }])),
  };
  const save = () => {
    const data = load(channel);
    const runs = data.runs.filter((run) => !(run.runId && run.runId === record.runId && run.startedAt === record.startedAt));
    runs.push(record);
    fs.mkdirSync(path.dirname(file(channel)), { recursive: true });
    fs.writeFileSync(file(channel), JSON.stringify({ channel: channel.slug, runs: runs.slice(-HISTORY) }, null, 2) + "\n");
  };
  const set = (stage, status, detail) => {
    if (!STAGES.includes(stage)) throw new Error(`unknown production stage ${stage}`);
    record.stages[stage] = { status, ...(detail ? { detail: String(detail).slice(0, 300) } : {}), at: now() };
    save();
    return api;
  };
  const api = {
    record,
    topic(slug) { record.slug = slug; save(); return api; },
    done: (stage, detail) => set(stage, "done", detail),
    fail: (stage, detail) => set(stage, "failed", detail),
    skip: (stage, detail) => set(stage, "skipped", detail),
    scheduled: (stage, detail) => set(stage, "scheduled", detail),
    // Retrying the next topic in the same run: earlier stage marks belong to the previous topic.
    reset() { for (const stage of STAGES) record.stages[stage] = { status: "not-reached" }; record.slug = null; save(); return api; },
    outcome(kind, reason, extra = {}) {
      if (!OUTCOMES.includes(kind)) throw new Error(`unknown outcome ${kind}`);
      record.outcome = kind; record.reason = reason ? String(reason).slice(0, 400) : null; record.finishedAt = now();
      Object.assign(record, extra);
      save();
      return api;
    },
  };
  save();
  return api;
}

// The record a run left for this channel (by run id; the latest one when no id is given).
function latest(channel, runId = null) {
  const runs = load(channel).runs;
  const mine = runId ? runs.filter((run) => run.runId === String(runId)) : runs;
  return mine.length ? mine[mine.length - 1] : null;
}

module.exports = { STAGES, OUTCOMES, start, latest, load, file };
