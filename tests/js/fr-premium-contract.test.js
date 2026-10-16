"use strict";
// Premium release safety: the premium engine is isolated from production, only Failure Reconstructed may
// use it (offline, human-reviewed), ImpossibleBrief keeps its own pipeline, and the quality contract never
// turns a technical or evidence pass, or a creative warning, into publishing eligibility. Offline.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "scripts/fr-premium/engine");
const { evaluate, POLICY } = require(path.join(ENGINE, "premium-contract.js"));
const { run } = require(path.join(ENGINE, "planner.js"));
const { validatePlan } = require(path.join(ENGINE, "validate.js"));
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const AP = path.join(ROOT, "channels/failure-reconstructed/premium/apollo-13-1970/plan");
const files = () => { const d = { script: J(path.join(AP, "narration-script.json")), evidence: J(path.join(AP, "evidence.json")), assets: J(path.join(AP, "assets.json")), timeline: J(path.join(AP, "timeline-kokoro-am_michael.json")), channel: "failure-reconstructed" };
  const plan = run(d).plan; return { plan, evidence: d.evidence, assets: d.assets, timeline: d.timeline }; };
const TECH = { pass: true, checks: [{ name: "resolution", ok: true, hard: true }, { name: "duration", ok: true, hard: false, measured: "50 s" }] };
const TEXT = { pass: true, fails: [], warns: [] };
const CLEAN = { summary: { shots: 9, warn_shots: 0, warns: 0, time_weighted_empty: 0.2, slide_like: 0 } };
const WARNED = { summary: { shots: 9, warn_shots: 9, warns: 30, time_weighted_empty: 0.45, slide_like: 2 } };
const SYNC = { meanAbsMs: 40, maxAbsMs: 120 };
const ok = { by: "owner", at: "2026-10-16" };
const ALL = { script: ok, voice: ok, creative: ok, publish: ok };
const ev = (o = {}) => { const f = files(); return evaluate({ channel: "failure-reconstructed", plan: f.plan, files: f, technical: TECH, text: TEXT, creative: CLEAN, sync: SYNC, approvals: ALL, ...o }); };

test("isolation: no workflow, production script or channel config references the premium engine", () => {
  const wf = path.join(ROOT, ".github/workflows");
  for (const f of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(path.join(wf, f), "utf8"), /fr-premium|premium-contract|premium-policy/, f);
  for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith(".js"))) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), "utf8"), /scripts\/fr-premium/, f);
  for (const c of fs.readdirSync(path.join(ROOT, "channels"))) { const cfg = path.join(ROOT, "channels", c, "config.json"); if (fs.existsSync(cfg)) assert.doesNotMatch(fs.readFileSync(cfg, "utf8"), /fr-premium|premium-policy/, c); }
});

test("policy: every listed channel exists, only Failure Reconstructed is offline-review, nothing auto-publishes", () => {
  const channels = J(path.join(ROOT, "config/channels.json")).channels;
  for (const [slug, p] of Object.entries(POLICY.channels)) { assert.ok(channels[slug], `unknown channel ${slug}`); assert.equal(p.autoPublish, false, slug); }
  assert.deepEqual(Object.entries(POLICY.channels).filter(([, p]) => p.mode === "offline-review").map(([s]) => s), ["failure-reconstructed"]);
});

test("ImpossibleBrief: premium is not available and the FR templates cannot be validated for it", () => {
  const r = evaluate({ channel: "impossible-brief" }); assert.equal(r.verdict, "PREMIUM_NOT_AVAILABLE"); assert.equal(r.publishingEligible, false);
  const f = files(); const plan = { ...f.plan, channel: "impossible-brief" };
  assert.ok(validatePlan({ ...f, plan }).errors.some((e) => /no channel pack/.test(e)));
});

test("contract: eligible only with technical, evidence, creative and every human approval", () => {
  const r = ev(); assert.equal(r.verdict, "PUBLISH_ELIGIBLE"); assert.equal(r.publishingEligible, true); assert.equal(r.criteria.length, 12);
  assert.deepEqual(Object.values(r.passes), ["PASS", "PASS", "PASS", "PASS"]); assert.equal(r.autoPublish, false);
});

test("contract: creative warnings need a human creative sign-off; they are never auto-approved", () => {
  const r = ev({ creative: WARNED, approvals: { script: ok, voice: ok, publish: ok } });
  assert.equal(r.passes.creative, "NEEDS_HUMAN_REVIEW"); assert.equal(r.verdict, "NEEDS_HUMAN_REVIEW"); assert.equal(r.publishingEligible, false);
  const s = ev({ creative: WARNED }); assert.equal(s.passes.creative, "PASS_WITH_HUMAN_SIGNOFF"); assert.ok(s.criteria.find((c) => c.n === 10).status === "WARN", "the warning stays reported");
});

test("contract: a technical pass or evidence pass alone never makes a video eligible", () => {
  for (const approvals of [{}, { script: ok }, { script: ok, voice: ok, creative: ok }]) { const r = ev({ approvals }); assert.equal(r.publishingEligible, false); assert.equal(r.passes.human, "MISSING"); }
  assert.equal(ev({ approvals: { ...ALL, publish: { by: "owner" } } }).publishingEligible, false, "an approval without a date is not an approval");
});

test("contract: hard technical failures, missing QA, unlicensed assets and evidence errors block", () => {
  assert.equal(ev({ technical: { pass: false, checks: [{ name: "a/v duration match", ok: false, hard: true }] } }).verdict, "BLOCKED");
  assert.equal(ev({ technical: null }).verdict, "BLOCKED"); assert.equal(ev({ text: { pass: false, fails: [{}] } }).verdict, "BLOCKED"); assert.equal(ev({ creative: null }).verdict, "BLOCKED");
  const f = files(); const k = f.plan.shots.flatMap((s) => s.assets || [])[0]; f.assets.assets[k].licence = { id: "all-rights-reserved", statement: "x" };
  assert.equal(evaluate({ channel: "failure-reconstructed", plan: f.plan, files: f, technical: TECH, text: TEXT, creative: CLEAN, sync: SYNC, approvals: ALL }).verdict, "BLOCKED");
  const g = files(); g.plan.shots[1].evidence = ["C-does-not-exist"];
  assert.equal(evaluate({ channel: "failure-reconstructed", plan: g.plan, files: g, technical: TECH, text: TEXT, creative: CLEAN, sync: SYNC, approvals: ALL }).passes.evidence, "FAIL");
});

test("contract: a remake of a published topic needs its own approval; poor narration sync is not eligible", () => {
  const r = ev({ remake: true }); assert.equal(r.publishingEligible, false); assert.deepEqual(r.missingApprovals, ["remake"]);
  assert.equal(ev({ remake: true, approvals: { ...ALL, remake: ok } }).publishingEligible, true);
  assert.equal(ev({ sync: { meanAbsMs: 90, maxAbsMs: 400 } }).publishingEligible, false);
});
