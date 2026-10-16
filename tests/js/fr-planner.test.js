"use strict";
// Shot Planner V1 + camera presets + the validator rules they rely on. Offline: no network, browser or ffmpeg.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "scripts/fr-premium/engine");
const { run, words } = require(path.join(ENGINE, "planner.js"));
const CAM = require(path.join(ENGINE, "camera-presets.js"));
const { validatePlan, loadPlanFiles } = require(path.join(ENGINE, "validate.js"));
const TIME = require(path.join(ENGINE, "timeref.js"));
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const CH = path.join(ROOT, "channels/failure-reconstructed/premium/challenger-1986");
const AP = path.join(ROOT, "channels/failure-reconstructed/premium/apollo-13-1970/plan");
const challenger = () => ({ script: J(path.join(CH, "plan/narration-script.json")), evidence: J(path.join(CH, "plan/evidence.json")), assets: J(path.join(CH, "plan/assets.json")), timeline: J(path.join(CH, "v1/timeline-edge-andrew.json")), channel: "failure-reconstructed" });
const apollo = () => ({ script: J(path.join(AP, "narration-script.json")), evidence: J(path.join(AP, "evidence.json")), assets: J(path.join(AP, "assets.json")), timeline: J(path.join(AP, "timeline-estimated.json")), channel: "failure-reconstructed" });
const codes = (r, line) => r.issues.filter((i) => !line || i.line === line).map((i) => i.code);

// ---- shot-plan generation -------------------------------------------------------------------------
test("planner: Challenger -> 12 shots, 9 clean; the only blockers are real gaps (L6 has no claim, positional event keys)", () => {
  const r = run(challenger());
  assert.equal(r.status, "NEEDS_HUMAN_REVIEW"); assert.equal(r.metrics.shots, 12);
  assert.equal(r.metrics.autoPlannedClean, 9); assert.deepEqual(r.metrics.reviewShots.sort(), ["S06", "S07", "S08"]);
  assert.ok(codes(r, "L6").includes("UNSUPPORTED_CLAIM")); assert.ok(codes(r, "L7").includes("REVIEW_EVENT_KEYS"));
  assert.equal(r.metrics.manualValues, 0); assert.ok(r.metrics.generatedValues > 150);
  const tpl = r.plan.shots.map((s) => s.template);
  assert.deepEqual(tpl, ["archival-plate", "trace-over-photo", "archival-plate", "joint-section", "joint-mechanism", "archival-plate", "event-sequence", "event-sequence", "archival-plate", "document-desk", "document-desk", "payoff"]);
});
test("planner: Apollo 13 -> NEEDS_HUMAN_REVIEW; only the hook still needs a human (its anchor), the rest is planned from evidence", () => {
  const r = run(apollo());
  assert.equal(r.status, "NEEDS_HUMAN_REVIEW"); assert.equal(r.metrics.shots, 9);
  assert.ok(codes(r, "L1").includes("MISSING_ANCHOR")); assert.deepEqual(r.metrics.reviewShots, ["S01"]);
  assert.deepEqual(r.plan.shots.map((s) => s.template), ["archival-plate", "component-section", "component-section", "component-section", "component-section", "archival-plate", "document-excerpt", "archival-plate", "payoff"]);
  // the owner approved the script for the evaluation pilot and the timeline is measured (Kokoro), so neither global flag is raised
  assert.ok(!codes(r).includes("SCRIPT_NOT_APPROVED") && !codes(r).includes("ESTIMATED_TIMELINE"));
  const d = apollo(); d.script = { ...d.script, status: "draft", timeline: { kind: "estimated", file: "timeline-estimated.json" } }; const r2 = run(d);
  assert.ok(codes(r2).includes("SCRIPT_NOT_APPROVED") && codes(r2).includes("ESTIMATED_TIMELINE"), "a draft script on estimated timings is still flagged");
  for (const i of r.issues.filter((x) => x.line)) assert.ok(i.detail && i.needed, `${i.code} has detail and what is needed`);
});
test("planner: deterministic (same inputs, identical plan)", () => {
  assert.deepEqual(run(challenger()).plan, run(challenger()).plan);
});
test("planner: shots tile the narration (timeline continuity) and start/end on line boundaries", () => {
  const d = challenger(); const r = run(d); const dur = d.timeline.duration + 0.8;
  let prev = 0; for (const s of r.plan.shots) { const a = TIME.resolve(s.start, d.timeline, dur), b = TIME.resolve(s.end, d.timeline, dur); assert.ok(Math.abs(a - prev) < 1e-6, s.id); assert.ok(b > a, s.id); prev = b; }
  assert.ok(Math.abs(prev - dur) < 1e-6);
});
test("template compatibility: every planned template exists and is allowed by the channel pack", () => {
  const pack = J(path.join(ENGINE, "channels/failure-reconstructed.json"));
  for (const r of [run(challenger()), run(apollo())]) for (const s of r.plan.shots) assert.ok(pack.templates.includes(s.template), s.template);
});

// ---- the planner never invents --------------------------------------------------------------------
test("missing evidence: a line citing an unknown claim is reported, never filled in", () => {
  const d = challenger(); d.script.lines[2].claims.push("C-not-real"); const r = run(d);
  assert.ok(r.issues.some((i) => i.code === "UNSUPPORTED_CLAIM" && /C-not-real/.test(i.detail)));
  assert.ok(!JSON.stringify(r.plan).includes("C-not-real"));
});
test("missing anchors: without the measured smoke point the hook is not marked and is flagged (no guessed point)", () => {
  const d = challenger(); delete d.assets.assets.liftoff.anchors.smoke; const r = run(d);
  assert.ok(codes(r, "L1").includes("MISSING_ANCHOR")); assert.ok(!r.plan.shots[0].params.mark);
});
test("unsupported facts: a payoff with a digit, and a line without claims, are flagged", () => {
  const d = challenger(); d.script.lines[11].text = "The seal failed at 36 degrees."; d.script.lines[2].claims = [];
  const r = run(d); assert.ok(codes(r, "L12").includes("UNSUPPORTED_CLAIM")); assert.ok(codes(r, "L3").includes("UNSUPPORTED_CLAIM"));
});
test("on-screen text from the planner comes only from claims, approved script fields and anchor/asset labels", () => {
  const r = run(challenger()); const v = validatePlan({ plan: r.plan, evidence: J(path.join(CH, "plan/evidence.json")), assets: J(path.join(CH, "plan/assets.json")), timeline: J(path.join(CH, "v1/timeline-edge-andrew.json")) });
  assert.ok(!v.errors.some((e) => /on-screen number/.test(e)), v.errors.join("\n"));
});

// ---- camera presets and positions -----------------------------------------------------------------
test("camera presets: the evidence push-in keeps the anchor inside the mobile safe zone", () => {
  const a = J(path.join(CH, "plan/assets.json")).assets.liftoff;
  const c = CAM.evidencePushIn({ asset: a, anchor: a.anchors.smoke, t0: "0", t1: "line:L2 +0.2", box: CAM.PHOTO_BOX });
  assert.equal(c.fallback, false); assert.ok(CAM.inSafe(c.anchorScreen, 80));
  assert.deepEqual(CAM.checkCover(a, CAM.PHOTO_BOX, c.keys[1], a.anchors.smoke.point), []);
});
test("camera presets: mechanism close-up frames all parts; document read-along zooms each mark to ~80% width", () => {
  const f = J(path.join(CH, "plan/assets.json")).assets.fig14.anchors; const cu = CAM.mechanismCloseUp({ rects: [f.tang.rect, f["clevis-inner-leg"].rect] });
  assert.ok(cu.region.x <= 180 && cu.region.x + cu.region.w >= 261 && Math.abs(cu.region.w / cu.region.h - cu.box.w / cu.box.h) < 0.02);
  const ch = J(path.join(CH, "plan/assets.json")).assets.chart53; const ra = CAM.documentReadAlong({ page: ch, world: { x: 540, y: 700, w: 1000 }, marks: [{ page: "asset:chart53", rect: ch.anchors["line-53f"].rect, at: "word:L10:recommended" }], t0: "line:L10 -0.1", t1: "line:L11 -0.1" });
  const z = ra.keys[1].zoom; assert.ok(Math.abs(470 * (1000 / 599) * z - 1080 * 0.8) < 2 || z === 2.8 || z === 1.0, String(z));
});
test("invalid camera positions fail validation: zoom out of range, focus off the image, mark outside the safe zone", () => {
  const base = () => clone(loadPlanFiles(path.join(CH, "plan/shot-plan.json"))); const S = (d, id) => d.plan.shots.find((s) => s.id === id);
  let d = base(); S(d, "S04").params.camera.keys[1].zoom = 7; assert.ok(validatePlan(d).errors.some((e) => /S04: invalid camera position: .*zoom 7/.test(e)));
  d = base(); S(d, "S04").params.camera.keys[0].focus = [9000, 100]; assert.ok(validatePlan(d).errors.some((e) => /S04: invalid camera position: .*outside the 2404x3000 image/.test(e)));
  d = base(); S(d, "S01").params.camera.keys[1] = { at: "line:L2 +0.2", focus: [300, 400], zoom: 2.5 }; assert.ok(validatePlan(d).errors.some((e) => /S01: invalid camera position: .*outside the mobile safe zone/.test(e)));
});

// ---- typography, exaggeration, channel style ------------------------------------------------------
test("mobile typography: labels below the channel minimum fail", () => {
  const d = clone(loadPlanFiles(path.join(CH, "plan/shot-plan.json"))); d.plan.shots.find((s) => s.id === "S02").params.callouts[0].size = 26;
  assert.ok(validatePlan(d).errors.some((e) => /S02: mobile typography: params\.callouts\[0\]\.size 26 px is below the failure-reconstructed minimum of 36 px/.test(e)));
});
test("factual exaggeration labels: the planner declares an evidence-derived factor and shows it", () => {
  const r = run(challenger()); const jm = r.plan.shots.find((s) => s.template === "joint-mechanism"); const js = r.plan.shots.find((s) => s.template === "joint-section");
  assert.equal(jm.params.scale.mode, "declared-exaggeration"); assert.ok(jm.params.labels.some((l) => l.text.includes("×{scale}")));
  assert.equal(js.params.scale.factor, 2.6); assert.ok(js.params.gapLabel.text.includes("×{scale}"));
});
test("channel-specific style rules: the plan style and templates must belong to the channel", () => {
  const r = run(challenger()); assert.equal(r.plan.style, "failure-reconstructed/forensic-v1");
  const d = { plan: { ...clone(r.plan), channel: "critical-thread" }, evidence: J(path.join(CH, "plan/evidence.json")), assets: J(path.join(CH, "plan/assets.json")), timeline: J(path.join(CH, "v1/timeline-edge-andrew.json")) };
  assert.ok(validatePlan(d).errors.some((e) => /no channel pack engine\/channels\/critical-thread\.json/.test(e)));
});

// ---- accuracy gates added this round ------------------------------------------------------------------
test("film clock: an edited compilation cannot carry a mission clock (no verified continuous segment)", () => {
  const d = clone(loadPlanFiles(path.join(CH, "plan/shot-plan.json"))); d.plan.shots.find((s) => s.id === "S07").params.filmClock = { label: "TIME AFTER LIFTOFF", timeBase: "claim:C-climb-timebase" };
  assert.ok(validatePlan(d).errors.some((e) => /S07: unsupported film clock: asset climb has no verified continuous segment .*edited compilation/.test(e)));
});
test("number words: the planner finds spoken numbers in the narration", () => {
  assert.equal(words(53), "fifty-three"); assert.equal(words(73), "seventy-three"); assert.equal(words(1000), "one thousand"); assert.equal(words(15), "fifteen");
});
