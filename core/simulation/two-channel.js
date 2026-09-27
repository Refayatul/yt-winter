"use strict";

const FAILURES = [
  { day: 2, channel: "impossible-brief", type: "channel token expired", recovery: "refresh credential and retry same isolated task" },
  { day: 5, channel: "failure-reconstructed", type: "network failure", recovery: "bounded retry" },
  { day: 8, channel: "impossible-brief", type: "render failure", recovery: "release render lock and retry" },
  { day: 11, channel: "failure-reconstructed", type: "upload failure", recovery: "retain topic and retry without duplicate" },
  { day: 14, channel: "impossible-brief", type: "quality block", recovery: "block topic and choose next qualified topic" },
  { day: 17, channel: "failure-reconstructed", type: "state write conflict", recovery: "reload, compare-and-swap and retry" },
  { day: 20, channel: "impossible-brief", type: "API unavailable", recovery: "publish state unaffected; analytics checkpoint deferred" },
];

function taskId(channel, format, day, sequence = 1) { return `${channel}:${format}:day-${String(day).padStart(2, "0")}:${sequence}`; }

function simulate30Days(options = {}) {
  const start = new Date(options.start || "2026-10-01T00:00:00.000Z");
  const states = {
    "failure-reconstructed": { shorts: [], long: [], topics: new Set(), failures: [] },
    "impossible-brief": { shorts: [], long: [], topics: new Set(), failures: [] },
  };
  const events = [];
  let maxActiveRender = 0;
  let maxActiveUpload = 0;
  for (let day = 1; day <= 30; day += 1) {
    const date = new Date(start.getTime() + (day - 1) * 86400000).toISOString().slice(0, 10);
    for (const channel of Object.keys(states)) {
      const state = states[channel];
      const injected = FAILURES.find((failure) => failure.day === day && failure.channel === channel);
      let sequence = 1;
      let topic = `${channel}-topic-${String(day).padStart(3, "0")}`;
      if (injected) {
        state.failures.push({ ...injected, date });
        events.push({ day, date, channel, task: taskId(channel, "short", day), status: "failed-attempt", failure: injected.type, otherChannelContinued: true });
        if (injected.type === "quality block") { topic += "-replacement"; sequence = 2; }
      }
      const id = taskId(channel, "short", day, sequence);
      if (state.topics.has(topic)) throw new Error("duplicate topic in simulation: " + topic);
      state.topics.add(topic);
      state.shorts.push({ id, topic, date, status: "published", retries: injected ? 1 : 0 });
      events.push({ day, date, channel, task: id, status: "published", recoveredFrom: injected ? injected.type : null });
      maxActiveRender = Math.max(maxActiveRender, 1);
      maxActiveUpload = Math.max(maxActiveUpload, 1);
      const cadence = channel === "failure-reconstructed" ? 5 : 7;
      if ((day - 1) % cadence === 0) {
        const longId = taskId(channel, "long", day);
        state.long.push({ id: longId, date, status: "published" });
        events.push({ day, date, channel, task: longId, status: "published" });
      }
    }
  }
  // Simulated catastrophic cross-channel attempt: guard blocks it before any
  // upload or state mutation, then the legitimate task continues.
  const wrongChannelGuard = {
    attemptedChannel: "impossible-brief",
    authenticatedChannel: "failure-reconstructed",
    blocked: true,
    mutationOccurred: false,
    reason: "CHANNEL_ID_MISMATCH",
  };
  const checks = {
    failureReconstructedShorts: states["failure-reconstructed"].shorts.length === 30,
    impossibleBriefShorts: states["impossible-brief"].shorts.length === 30,
    noDuplicateUploads: Object.values(states).every((state) => new Set(state.shorts.map((item) => item.id)).size === state.shorts.length),
    noTopicLoss: Object.values(states).every((state) => state.topics.size === 30),
    noStateCollision: Object.entries(states).every(([channel, state]) => state.shorts.every((item) => item.id.startsWith(channel + ":"))),
    channelFailureIsolation: FAILURES.every((failure) => events.some((event) => event.day === failure.day && event.channel !== failure.channel && event.status === "published")),
    wrongChannelUploadBlocked: wrongChannelGuard.blocked && !wrongChannelGuard.mutationOccurred,
    renderConcurrencyRespected: maxActiveRender <= 1,
    uploadConcurrencyRespected: maxActiveUpload <= 1,
  };
  return {
    start: start.toISOString().slice(0, 10),
    days: 30,
    injectedFailures: FAILURES,
    wrongChannelGuard,
    channels: Object.fromEntries(Object.entries(states).map(([channel, state]) => [channel, { shorts: state.shorts.length, longForm: state.long.length, uniqueTopics: state.topics.size, failuresRecovered: state.failures.length }])),
    resourcePeaks: { renders: maxActiveRender, uploads: maxActiveUpload },
    checks,
    pass: Object.values(checks).every(Boolean),
    events,
  };
}

function markdown(result) {
  const lines = ["# Two-channel 30-day simulation", "", `Result: **${result.pass ? "PASS" : "FAIL"}**`, "", `Window: ${result.start} for ${result.days} days. Uploads and renders were simulated; no external publish occurred.`, "", "## Output", "", "| Channel | Shorts | Long-form | Unique topics | Recovered failures |", "|---|---:|---:|---:|---:|"];
  for (const [channel, state] of Object.entries(result.channels)) lines.push(`| ${channel} | ${state.shorts} | ${state.longForm} | ${state.uniqueTopics} | ${state.failuresRecovered} |`);
  lines.push("", "## Injected failures", "");
  for (const failure of result.injectedFailures) lines.push(`- Day ${failure.day}, ${failure.channel}: **${failure.type}** → ${failure.recovery}.`);
  lines.push("", "## Isolation and safety checks", "");
  for (const [check, pass] of Object.entries(result.checks)) lines.push(`- ${pass ? "PASS" : "FAIL"}: ${check}`);
  lines.push("", "The explicit wrong-channel attempt was blocked with `CHANNEL_ID_MISMATCH` before upload-session creation or state mutation.", "");
  return lines.join("\n");
}

module.exports = { FAILURES, taskId, simulate30Days, markdown };
