"use strict";
// Creative Director V1 (experimental): the storyboard it writes stays inside the evidence gates, adds no
// claim, asset, anchor or number, and its rules fire only on the conditions they name. Offline.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "scripts/fr-premium/engine");
const { run: plan } = require(path.join(ENGINE, "planner.js"));
const M = require(path.join(ENGINE, "asset-matcher.js"));
const CD = require(path.join(ENGINE, "experimental/creative-director.js"));
const { validatePlan } = require(path.join(ENGINE, "validate.js"));
const TIME = require(path.join(ENGINE, "timeref.js"));
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const AP = path.join(ROOT, "channels/failure-reconstructed/premium/apollo-13-1970/plan");
const CH = path.join(ROOT, "channels/failure-reconstructed/premium/challenger-1986/plan");
const load = (dir, tl) => ({ script: J(path.join(dir, "narration-script.json")), evidence: J(path.join(dir, "evidence.json")), assets: J(path.join(dir, "assets.json")), timeline: J(path.join(dir, tl)), channel: "failure-reconstructed" });
const direct = (d) => { const r = plan(d); const matches = M.matchAll({ ...d, beats: r.beats }); return { ...CD.run({ plan: r.plan, matches, ...d }), auto: r.plan, d }; };
const apollo = () => direct(load(AP, "timeline-estimated.json"));
const at = (o, ref) => TIME.resolve(ref, o.d.timeline, o.d.timeline.duration + o.plan.film.tail);
const claimRefs = (x) => new Set((JSON.stringify(x).match(/C-[a-z0-9-]+/g) || []));

test("CD storyboard validates, is deterministic and contiguous", () => {
  const a = apollo(), b = apollo(); assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(validatePlan({ plan: a.plan, evidence: a.d.evidence, assets: a.d.assets, timeline: a.d.timeline }).errors, []);
  let prev = 0; for (const s of a.plan.shots) { assert.ok(Math.abs(at(a, s.start) - prev) < 1e-6, s.id); assert.ok(at(a, s.end) - at(a, s.start) >= CD.RULE.minShot - 1e-9, `${s.id} too short`); prev = at(a, s.end); }
});

test("CD adds no claim, asset or anchor; every shown number stays a claim placeholder", () => {
  const a = apollo(); const scriptClaims = new Set(a.d.script.lines.flatMap((l) => l.claims));
  for (const c of claimRefs(a.plan.shots)) assert.ok(claimRefs(a.auto).has(c) || scriptClaims.has(c), `new claim ${c}`);
  for (const s of a.plan.shots) for (const k of s.assets || []) assert.ok(a.d.assets.assets[k], k);
  assert.ok(!/#[a-z]/.test(JSON.stringify(a.plan.shots.map((s) => s.params)).replace(/word:[^"]*/g, "")), "no anchor references");
  for (const s of a.plan.shots) for (const v of JSON.stringify(s.params).match(/"(?:value|text|sub|label)":"[^"]*"/g) || []) assert.ok(!/\d/.test(v.replace(/\{C-[a-z0-9-]+\}/g, "")), `${s.id}: bare number in ${v}`);
});

test("R1: no visual mode held past the cap; the conceptual scene keeps its disclosure and loses only its plates", () => {
  const a = apollo(); const runs = []; for (const s of a.plan.shots) { const m = CD.modeOf(s, { A: a.d.assets.assets }); const key = s.params.scene || s.params.media || s.template; const d = at(a, s.end) - at(a, s.start); const l = runs[runs.length - 1]; if (l && l.m === m && l.key === key) l.sec += d; else runs.push({ m, key, sec: d }); }
  assert.ok(Math.max(...runs.map((r) => r.sec)) <= CD.RULE.maxModeSeconds, JSON.stringify(runs));
  const sc = a.plan.shared["component-l2"]; assert.equal(sc.mode, "conceptual"); assert.match(sc.disclosure, /not to scale/i); assert.equal(sc.archival, undefined);
  assert.equal(sc.span[0], "line:L3 -0.1"); assert.ok(sc.states.length >= 3, "documented states are kept");
});

test("R2: documented times become a timeline whose ticks are the claims; its ground is a drawing, never a photo", () => {
  const a = apollo(); const tl = a.plan.shots.find((s) => s.template === "timeline"); assert.ok(tl);
  assert.deepEqual(tl.params.ticks, ["claim:C-a13-fans", "claim:C-a13-dataloss"]);
  assert.equal(tl.params.steps.length, tl.params.ticks.length - 1);
  if (tl.params.media) assert.equal(a.d.assets.assets[tl.params.media.slice(6)].kind, "document");
  const next = a.plan.shots[a.plan.shots.indexOf(tl) + 1]; assert.equal(next.params.media, "asset:sm-damage"); assert.ok(at(a, next.start) > at(a, "word:L6:later"), "the result image waits for the narration");
});

test("R3: the finding's backdrop is historical, and stays a test photo when no historical result image exists", () => {
  const a = apollo(); const ex = a.plan.shots.find((s) => s.template === "document-excerpt");
  assert.equal(ex.params.backdrop.kind, "historical-photo"); assert.ok(!/test/i.test(a.d.assets.assets[ex.params.backdrop.asset.slice(6)].provenanceLabel));
  const d = load(AP, "timeline-estimated.json"); for (const k of ["sm-damage", "sm-damage-2"]) d.assets.assets[k].tags = ["vehicle"];
  const b = direct(d); assert.equal(b.plan.shots.find((s) => s.template === "document-excerpt").params.backdrop.kind, "test-imagery");
});

test("R4: a named place or person gets its unused photo (flagged for review); objects never trigger it", () => {
  const a = apollo(); const mc = a.plan.shots.find((s) => s.params.media === "asset:mission-control");
  assert.ok(mc); assert.equal(mc.line, "L8"); assert.deepEqual(mc.review.codes, ["CONFIRM_DEPICTION"]);
  assert.equal(a.plan.shots.filter((s) => s.line === "L5").length, 1, "'damaging' does not pull in a damage photo");
});

test("R5: hook headline readable, payoff mirrors the hook framing for the loop", () => {
  const a = apollo(); const h = a.plan.shots[0], p = a.plan.shots[a.plan.shots.length - 1];
  assert.ok(at(a, h.params.headline.out[1]) >= CD.RULE.hookHeadline); assert.deepEqual(p.params.box, h.params.box);
  assert.equal(h.params.camera.keys[0].zoom, p.params.camera.keys[p.params.camera.keys.length - 1].zoom);
});

test("CD generalizes: on Challenger it adds no validation error to the planner's plan (no Apollo-specific code)", () => {
  const c = direct(load(CH, "../v1/timeline-edge-andrew.json")); const v = (pl) => validatePlan({ plan: pl, evidence: c.d.evidence, assets: c.d.assets, timeline: c.d.timeline }).errors;
  const before = new Set(v(c.auto).map((e) => e.replace(/^S\d+: /, ""))); // the planner's own open issue (S06 needs an asset) stays
  for (const e of v(c.plan)) assert.ok(before.has(e.replace(/^S\d+: /, "")), `new error: ${e}`);
  assert.ok(c.report.before.summary.shots > 0 && Array.isArray(c.report.decisions));
});

test("timeline template accepts hero layout and a soft ground; archival-plate plates accept stills", () => {
  const T = require(path.join(ENGINE, "templates/timeline.js")); assert.ok(T.params.properties.hero && T.params.properties.groundGrade.enum.includes("soft"));
  const src = fs.readFileSync(path.join(ENGINE, "templates/archival-plate.js"), "utf8"); assert.match(src, /isClip \? FR\.clip\(key, t - clip0, \{ box \}\) : FR\.photo\(key, \{ fx: m\.iw \/ 2/);
});
