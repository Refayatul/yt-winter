"use strict";

// 2026-10-13: the 16:35 UTC watchdog reported ImpossibleBrief and CriticalThread unhealthy (issues
// #270, #271) although both Shorts had a final PUBLISH gate, a completed render and passed
// validations. The checker only recognised Failure Reconstructed's gate shape ({ asama: "final" }).
// The verdict now understands both shapes and fails closed on anything ambiguous.

const test = require("node:test");
const assert = require("node:assert/strict");
const SLA = require("../../production-sla-check");
const Channel = require("../../core/channel-context");

const verdict = SLA.finalQualityVerdict;

const frRecord = { channel: "failure-reconstructed", slug: "united-232-1989", videoId: "BukKRJfO7zI", tarih: "2026-10-13T14:32:52.683Z", publishAt: "2026-10-13T18:00:00.000Z", kalite: "PUBLISH", format: "short" };
const frGate = { slug: "united-232-1989", asama: "final", karar: "PUBLISH", toplam: 90, tarih: "2026-10-13T14:32:48.924Z" };

const ibRecord = { channel: "impossible-brief", slug: "what-if-ocean-plankton-disappeared", videoId: "yIX2WcN9dEQ", tarih: "2026-10-13T14:34:07.190Z", publishAt: "2026-10-13T18:00:00.000Z", kalite: "PUBLISH", format: "short" };
const ibGate = { decision: "PUBLISH", blockers: [], checked: ["science", "hook"] };
const ibValidations = { channel: "impossible-brief", topicId: "IB-OTH-005", slug: "what-if-ocean-plankton-disappeared", passed: true, failed: [],
  checks: { script: true, audio: true, video: true, qualityGate: true } };
const ibRender = { requested: true, completed: true };
const ibGenerated = [{ topicId: "IB-OTH-005", slug: "what-if-ocean-plankton-disappeared", generatedAt: "2026-10-13T14:34:08Z", uploaded: true }];

const ib = (overrides = {}) => verdict({ channel: "impossible-brief", record: ibRecord, gate: ibGate, validations: ibValidations, render: ibRender, generated: ibGenerated, ...overrides });
const fr = (overrides = {}) => verdict({ channel: "failure-reconstructed", record: frRecord, gate: frGate, ...overrides });

test("valid final gates pass: FR final gate and IB/CT PUBLISH + validations + completed render", () => {
  assert.deepEqual(fr(), { passed: true, decision: "PUBLISH", source: "quality-gate.final", reason: null });
  assert.deepEqual(ib(), { passed: true, decision: "PUBLISH", source: "quality-gate+validations+render", reason: null });
  const ct = verdict({ channel: "critical-thread", record: { ...ibRecord, channel: "critical-thread", slug: "x" }, gate: ibGate,
    validations: { ...ibValidations, channel: "critical-thread", slug: "x", topicId: "CT-219" }, render: ibRender, generated: [] });
  assert.equal(ct.passed, true);
});

test("REVIEW and BLOCK never pass, in either shape", () => {
  assert.match(fr({ gate: { ...frGate, karar: "REVIEW" } }).reason, /^GATE_NOT_PUBLISH: REVIEW/);
  assert.match(fr({ gate: { ...frGate, karar: "BLOCK" } }).reason, /^GATE_NOT_PUBLISH: BLOCK/);
  assert.match(ib({ gate: { ...ibGate, decision: "REVIEW" } }).reason, /^GATE_NOT_PUBLISH: REVIEW/);
  assert.match(ib({ gate: { decision: "PUBLISH", blockers: ["thin sources"] } }).reason, /^GATE_BLOCKERS/);
  assert.match(ib({ validations: { ...ibValidations, passed: false, failed: ["audio"] } }).reason, /^VALIDATIONS_FAILED/);
  assert.match(ib({ validations: { ...ibValidations, checks: { ...ibValidations.checks, video: false } } }).reason, /^VALIDATIONS_FAILED/);
  assert.match(ib({ render: { requested: true, completed: false } }).reason, /^RENDER_NOT_COMPLETED/);
  assert.match(fr({ gate: { ...frGate, asama: "pre" } }).reason, /^NOT_FINAL_GATE: pre/, "a pre-render gate is not the final gate");
});

test("missing or malformed evidence fails closed", () => {
  assert.equal(fr({ gate: null }).reason, "MISSING_GATE");
  assert.equal(ib({ gate: [] }).reason, "MISSING_GATE");
  assert.match(ib({ gate: { blockers: [] } }).reason, /^MALFORMED_GATE/);
  assert.equal(ib({ validations: null }).reason, "MISSING_VALIDATIONS");
  assert.equal(ib({ render: null }).reason, "RENDER_NOT_COMPLETED");
  assert.match(ib({ gate: { decision: "PUBLISH" } }).reason, /^GATE_BLOCKERS/, "blockers must be an explicit empty list");
  assert.match(fr({ gate: { ...frGate, tarih: undefined } }).reason, /^MALFORMED_GATE/);
  assert.match(fr({ record: { ...frRecord, tarih: "not a date" } }).reason, /^MALFORMED_GATE/);
  assert.equal(verdict({ channel: "failure-reconstructed", record: null, gate: frGate }).reason, "NO_RECORD");
});

test("stale evidence fails: an old FR gate, a gate written after the upload, another topic's validations", () => {
  assert.match(fr({ gate: { ...frGate, tarih: "2026-10-10T09:00:00Z" } }).reason, /^STALE_GATE/);
  assert.match(fr({ gate: { ...frGate, tarih: "2026-10-13T16:00:00Z" } }).reason, /^STALE_GATE/, "a gate rewritten after the upload is not the upload's gate");
  assert.match(ib({ generated: [{ ...ibGenerated[0], topicId: "IB-OTH-001" }] }).reason, /^STALE_GATE/);
  assert.match(fr({ record: { ...frRecord, kalite: "REVIEW" } }).reason, /^EVIDENCE_MISMATCH/, "the upload-time decision must agree with the package");
});

test("wrong channel or topic fails", () => {
  assert.match(ib({ channel: "critical-thread" }).reason, /^WRONG_CHANNEL: record belongs to impossible-brief/);
  assert.match(ib({ validations: { ...ibValidations, channel: "critical-thread" } }).reason, /^WRONG_CHANNEL: validations for critical-thread/);
  assert.match(ib({ validations: { ...ibValidations, slug: "another-topic" } }).reason, /^WRONG_TOPIC/);
  assert.match(fr({ gate: { ...frGate, slug: "another-topic" } }).reason, /^WRONG_TOPIC/);
});

test("wrong date: a record from another day is not today's Short, so nothing passes for today", () => {
  const snapshot = SLA.evaluateSnapshot({ date: "2026-10-14", channel: "impossible-brief", published: [ibRecord], generated: ibGenerated,
    notifications: { "video:yIX2WcN9dEQ": "x" }, quality: ibGate, validations: ibValidations, render: ibRender, youtubeVerified: true, deadlinePassed: false });
  assert.equal(snapshot.slug, null);
  assert.equal(snapshot.qualityPassed, false);
  assert.equal(snapshot.qualityReason, "NO_RECORD");
  assert.equal(snapshot.safeToRecover, false, "before the deadline nothing is recovered");
});

test("the snapshot is healthy for a valid IB package and unhealthy, with the reason, for a genuine failure", () => {
  const base = { date: "2026-10-13", channel: "impossible-brief", published: [ibRecord], generated: ibGenerated,
    notifications: { "video:yIX2WcN9dEQ": "2026-10-13T14:36:00Z" }, quality: ibGate, validations: ibValidations, render: ibRender,
    remoteVideoExists: true, youtubeVerified: true, remoteTodayVideo: { id: "yIX2WcN9dEQ" } };
  const ok = SLA.evaluateSnapshot(base);
  assert.deepEqual([ok.qualityPassed, ok.productionReady, ok.healthy, ok.qualityEvidence], [true, true, true, "quality-gate+validations+render"]);
  const bad = SLA.evaluateSnapshot({ ...base, validations: { ...ibValidations, passed: false, failed: ["captions"] } });
  assert.deepEqual([bad.qualityPassed, bad.healthy], [false, false], "a genuine failure is still reported");
  assert.match(bad.qualityReason, /^VALIDATIONS_FAILED/);
  assert.equal(bad.safeToRecover, false, "a scheduled video is never re-produced because its evidence is missing");
});

test("the committed 2026-10-13 packages of all three channels pass (the #270 / #271 false alarms)", async () => {
  for (const slug of ["failure-reconstructed", "impossible-brief", "critical-thread"]) {
    const result = await SLA.check({ channel: Channel.getChannel(slug), date: "2026-10-13", now: "2026-10-13T16:35:00Z" });
    assert.equal(result.qualityPassed, true, `${slug}: ${result.qualityReason}`);
    assert.equal(result.productionReady, true, slug);
  }
});
