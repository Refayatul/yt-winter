"use strict";
// Generalization round: Asset Matching Engine V1, anchor-suggestion states, component-section,
// document-excerpt, and the validator gates that keep them honest. Offline: no network, browser or ffmpeg.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "scripts/fr-premium/engine");
const { run } = require(path.join(ENGINE, "planner.js"));
const M = require(path.join(ENGINE, "asset-matcher.js"));
const COMP = require(path.join(ENGINE, "component-extract.js"));
const { validatePlan } = require(path.join(ENGINE, "validate.js"));
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const AP = path.join(ROOT, "channels/failure-reconstructed/premium/apollo-13-1970/plan");
const CH = path.join(ROOT, "channels/failure-reconstructed/premium/challenger-1986/plan");
const apollo = () => ({ script: J(path.join(AP, "narration-script.json")), evidence: J(path.join(AP, "evidence.json")), assets: J(path.join(AP, "assets.json")), timeline: J(path.join(AP, "timeline-estimated.json")), channel: "failure-reconstructed" });
const planned = () => { const d = apollo(); const r = run(d); return { plan: r.plan, evidence: d.evidence, assets: d.assets, timeline: d.timeline }; };
const errs = (d) => validatePlan(d).errors;
const has = (d, re) => errs(d).some((e) => re.test(e));
const shot = (d, tpl) => d.plan.shots.find((s) => s.template === tpl);
const asset = (title, caption = "", extra = {}) => ({ kind: "photo", file: "x.jpg", width: 3000, height: 4000, source: { title, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`, caption }, licence: { id: "public-domain", statement: "NASA work" }, ...extra });

// ---- the planned Apollo 13 plan is valid and its gates hold ----------------------------------------
test("Apollo 13 auto plan validates (component scene, excerpt, archival plates)", () => {
  const d = planned(); assert.deepEqual(errs(d), []);
  assert.equal(d.plan.shared["component-l2"].mode, "conceptual"); assert.ok(d.plan.shared["component-l2"].states.length >= 3);
});

// ---- incorrect historical asset matching / wrong mission imagery -----------------------------------
test("matcher: another mission of the same family is rejected (Apollo 14 tank concept, Apollo 10 crew)", () => {
  const id = M.identity(apollo().evidence);
  for (const t of ["File:Apollo 14 redesigned oxygen tank (S71-16745).jpg", "File:Apollo 10 Prime Crew - GPN-2000-001501.jpg"]) assert.equal(M.subjectCheck(asset(t), id).reject, "WRONG_SUBJECT", t);
  assert.equal(M.subjectCheck(asset("File:Tank test", "photographed on 3 March 1972"), id).reject, "WRONG_PERIOD");
  assert.equal(M.subjectCheck(asset("File:The Actual Apollo 13 Prime Crew - GPN-2000-001167.jpg"), id).reject, undefined, "archive ids are not dates");
});
test("validator: a shot using another mission's photo fails", () => {
  const d = planned(); d.assets.assets.crew.source.title = "File:Apollo 10 Prime Crew - GPN-2000-001501.jpg"; d.assets.assets.crew.source.caption = "Apollo 10 crew";
  assert.ok(has(d, /S08: wrong subject imagery: asset crew names apollo 10/));
});
test("matcher: semantic overlap alone never proves a depiction (CONFIRM_DEPICTION, not ACCEPT)", () => {
  const d = apollo(); const r = M.matchAll({ ...d, beats: run(d).beats });
  const l5 = r.lines.find((l) => l.line === "L5"); const sm2 = l5.candidates.find((c) => c.asset === "sm-damage-2");
  assert.equal(sm2.verdict, "NEEDS_HUMAN_REVIEW"); assert.ok(sm2.codes.includes("CONFIRM_DEPICTION"));
  assert.ok(!l5.candidates.some((c) => c.verdict === "ACCEPT"));
});
test("matcher: no suitable visual -> NO_SUITABLE_VISUAL (never a guessed asset)", () => {
  const d = apollo(); const r = M.matchAll({ ...d, beats: run(d).beats });
  assert.equal(r.lines.find((l) => l.line === "L2").status, "NO_SUITABLE_VISUAL"); assert.equal(r.lines.find((l) => l.line === "L2").decision, null);
});

// ---- misleading reconstruction visuals -------------------------------------------------------------
test("matcher: a test / concept image needs a disclosure and is never accepted as the event", () => {
  const d = apollo(); const r = M.matchAll({ ...d, beats: run(d).beats });
  for (const l of r.lines) { const c = l.candidates.find((x) => x.asset === "tank-fire-test"); assert.notEqual(c.verdict, "ACCEPT", l.line); }
});
test("validator: a board test photo shown as archival without saying so fails", () => {
  const d = planned(); const s = d.plan.shots.find((x) => x.id === "S08"); s.assets = ["tank-fire-test"]; s.params.media = "asset:tank-fire-test";
  assert.ok(has(d, /S08: misleading reconstruction visual: asset tank-fire-test shows a test/));
});
test("validator: a conceptual scene without its conceptual disclosure fails", () => {
  const d = planned(); d.plan.shared["component-l2"].disclosure = "Diagram";
  assert.ok(has(d, /misleading reconstruction visual: conceptual component scene without a visible "conceptual" disclosure/));
});
test("validator: a typeset excerpt must say it is not a scan", () => {
  const d = planned(); shot(d, "document-excerpt").params.disclosure = "Report page";
  assert.ok(has(d, /misleading reconstruction visual: a typeset excerpt must say it is typeset/));
});

// ---- unsupported visual claims / unsupported geometry ----------------------------------------------
test("validator: a component label or state tag with words not in its claim passage fails", () => {
  let d = planned(); d.plan.shared["component-l2"].parts.find((q) => q.id === "switch").label = "faulty relay";
  assert.ok(has(d, /unsupported visual claim: part switch label "faulty relay" has words not in C-a13-switch-rating's passage \(faulty, relay\)/));
  d = planned(); d.plan.shared["component-l2"].states.find((q) => q.state === "stuck-closed").tag = "CONTACTS WELDED SHUT";
  assert.ok(has(d, /unsupported visual claim: state tag "CONTACTS WELDED SHUT"/));
  d = planned(); d.plan.shared["component-l2"].links.push({ from: "wire", to: "gse-power-supply", kind: "powered-by", claim: "claim:C-a13-switch-80f" });
  assert.ok(has(d, /unsupported visual claim: link wire powered-by gse-power-supply is not stated/));
});
test("validator: conceptual scenes take no geometry; measured scenes need verified mechanism-part anchors", () => {
  let d = planned(); const sc = () => d.plan.shared["component-l2"];
  sc().parts[0].anchor = "asset:tank-diagram#heater"; assert.ok(has(d, /unsupported geometry: conceptual scenes do not take drawing anchors/));
  d = planned(); sc().scale.mode = "true-scale"; assert.ok(has(d, /unsupported geometry: a conceptual scene has no measured geometry/));
  d = planned(); sc().mode = "measured"; sc().drawing = "asset:tank-diagram"; sc().disclosure = "Drawing geometry"; sc().scale.mode = "true-scale";
  for (const s of d.plan.shots.filter((x) => x.template === "component-section")) s.assets = ["tank-diagram"];
  assert.ok(has(d, /unsupported geometry: measured part heater has no verified anchor/));
});
test("planner: suggestions never switch a component scene to measured mode; verified anchors do", () => {
  const d = apollo(); const sug = J(path.join(AP, "anchor-suggestions.json")).suggestions;
  assert.equal(run({ ...d, suggestions: sug }).plan.shared["component-l2"].mode, "conceptual");
  const a = d.assets.assets["tank-diagram"]; const mk = (label, x) => ({ rect: { x, y: 40, w: 30, h: 120 }, space: "source-px", method: "manual-measure", basis: "test fixture: measured by a human", role: "mechanism-part", label });
  a.anchors = { heater: mk("heater tube", 300), switch: mk("thermostatic switch", 250), supply: mk("power supply", 20), wires: mk("fan motor wires", 340) };
  const r = run(d); const sc = r.plan.shared["component-l2"]; assert.equal(sc.mode, "measured"); assert.ok(sc.parts.filter((q) => !q.layerOf && q.id !== "spacecraft-power-supply").every((q) => q.anchor));
});
test("component extraction: topology and documented states come from passages; nothing for unrelated text", () => {
  const e = apollo().evidence; const x = COMP.extract(["C-a13-heaters-65v", "C-a13-switch-rating", "C-a13-switch-80f", "C-a13-1000f", "C-a13-teflon"], e.claims);
  assert.deepEqual(x.links.map((l) => `${l.from} ${l.kind} ${l.to}`).sort(), ["heater powered-by gse-power-supply", "insulation layer-of wire", "switch in-series heater", "switch mounted-on heater", "switch rated-for spacecraft-power-supply", "wire near heater"]);
  assert.deepEqual(x.states.map((s) => `${s.part}:${s.state}`).sort(), ["heater:hot", "heater:on", "insulation:damaged", "switch:rated", "switch:stuck-closed", "switch:threshold"]);
  for (const s of x.states) assert.ok(e.claims[s.claim].passage.toLowerCase().includes(s.phrase.toLowerCase()), s.phrase);
  const none = COMP.extract(["C-a13-averted"], e.claims); assert.equal(none.states.length, 0);
  assert.ok(!JSON.stringify(run(apollo()).plan.shared).match(/"(x|y|w|h)":/), "a conceptual scene carries no coordinates");
});

// ---- invalid anchors / suggested vs verified ---------------------------------------------------------
test("validator: a suggested anchor is never a verified registration point", () => {
  const sug = { suggestions: [{ id: "SG-launch-1", asset: "launch", status: "SUGGESTED", rect: { x: 2028, y: 3660, w: 612, h: 612 } }, { id: "SG-launch-2", asset: "launch", status: "REJECTED", point: [100, 100] }] };
  let d = planned(); d.suggestions = sug; d.assets.assets.launch.anchors = { poi: { rect: { x: 2028, y: 3660, w: 612, h: 612 }, space: "source-px", method: "manual-measure", basis: "copied from the engine", role: "point-of-interest" } };
  assert.ok(has(d, /asset launch#poi: suggested anchor used as verified \(coordinates of SG-launch-1, status SUGGESTED\)/));
  d = planned(); d.suggestions = sug; d.assets.assets.launch.anchors = { poi: { point: [500, 500], space: "source-px", method: "manual-measure", basis: "cites a suggestion", role: "point-of-interest", suggestion: "SG-launch-2" } };
  assert.ok(has(d, /suggested anchor used as verified \(suggestion SG-launch-2 is REJECTED\)/));
  d = planned(); d.suggestions = { suggestions: [{ id: "SG-launch-1", asset: "launch", status: "VERIFIED", rect: { x: 1, y: 1, w: 2, h: 2 } }] };
  assert.ok(has(d, /SG-launch-1: VERIFIED without a human reviewer and date/));
  d = planned(); d.suggestions = { suggestions: [{ id: "SG-launch-1", asset: "launch", status: "MAYBE" }] }; assert.ok(has(d, /status "MAYBE"/));
});
test("anchor suggestions on disk are all SUGGESTED (the engine never verifies)", () => {
  for (const s of J(path.join(AP, "anchor-suggestions.json")).suggestions) assert.equal(s.status, "SUGGESTED", s.id);
});
test("validator: an anchor outside its image fails (existing gate kept)", () => {
  const d = planned(); d.assets.assets["tank-diagram"].anchors = { p: { point: [900, 10], space: "source-px", method: "manual-measure", basis: "bad measure", role: "mechanism-part" } };
  assert.ok(has(d, /asset tank-diagram#p: \(900, 10\) outside the 394x217 source-px/));
});

// ---- duplicate assets / licensing ---------------------------------------------------------------------
test("validator + matcher: duplicate files are caught by sha256", () => {
  const d = planned(); d.assets.assets["sm-damage-2"].sha256 = d.assets.assets["sm-damage"].sha256;
  assert.ok(has(d, /duplicate asset: sm-damage-2 and sm-damage are the same file \(sha256\)/));
  const r = M.matchAll({ script: apollo().script, evidence: d.evidence, assets: d.assets });
  assert.ok(r.lines[0].candidates.some((c) => c.codes.includes("DUPLICATE") && c.verdict === "REJECT"));
});
test("licensing: CC BY without attribution is rejected by the matcher and fails validation; unknown licences fail the schema", () => {
  const d = planned(); d.assets.assets.crew.licence = { id: "cc-by", statement: "CC BY 4.0" };
  assert.ok(has(d, /asset crew: cc-by requires an attribution/));
  const r = M.matchAll({ script: apollo().script, evidence: d.evidence, assets: d.assets }); assert.ok(r.lines.every((l) => l.candidates.find((c) => c.asset === "crew").verdict === "REJECT"));
  const d2 = planned(); d2.assets.assets.crew.licence.id = "all-rights-reserved"; assert.ok(has(d2, /assets schema/));
  const p = run({ ...apollo(), assets: d.assets }); assert.ok(!p.plan.shots.some((s) => (s.assets || []).includes("crew")), "the planner never picks a rejected asset");
});
test("provenance is never fabricated: the matcher copies nothing into assets and an asset without a source page fails", () => {
  const d = apollo(); const before = JSON.stringify(d.assets); M.matchAll({ ...d }); assert.equal(JSON.stringify(d.assets), before);
  const v = planned(); delete v.assets.assets.crew.source.page; assert.ok(has(v, /assets schema: .*page/));
});

// ---- missing evidence ---------------------------------------------------------------------------------
test("missing evidence: removing a claim the component scene uses fails validation, and the planner drops the state", () => {
  const d = planned(); delete d.evidence.claims["C-a13-teflon"]; assert.ok(has(d, /unknown claim C-a13-teflon/));
  const a = apollo(); delete a.evidence.claims["C-a13-teflon"]; const r = run(a);
  assert.ok(!r.plan.shared["component-l2"].states.some((s) => s.state === "damaged")); assert.ok(r.issues.some((i) => i.code === "UNSUPPORTED_CLAIM" && /C-a13-teflon/.test(i.detail)));
});
test("excerpt: the highlighted words must be verbatim in the passage", () => {
  const d = planned(); d.evidence.claims["C-a13-cause"].display = "an electrical fire";
  assert.ok(has(d, /unsupported visual claim: excerpt highlight "an electrical fire" is not verbatim in the passage/));
});

// ---- Challenger does not regress ------------------------------------------------------------------------
test("Challenger production plan stays VALID and the planner still makes 9/12 clean with the same templates", () => {
  const v = require(path.join(ENGINE, "validate.js")).loadPlanFiles(path.join(CH, "shot-plan.json")); assert.deepEqual(validatePlan(v).errors, []);
  const r = run({ script: J(path.join(CH, "narration-script.json")), evidence: J(path.join(CH, "evidence.json")), assets: J(path.join(CH, "assets.json")), timeline: J(path.join(CH, "../v1/timeline-edge-andrew.json")), channel: "failure-reconstructed" });
  assert.equal(r.metrics.autoPlannedClean, 9); assert.ok(!r.plan.shots.some((s) => ["component-section", "document-excerpt"].includes(s.template)));
});

// ---- creative round 2: archival plates, evidence meters, labelled test imagery ----------------------------
test("archival plates: chosen by rule (topic + system named in the image's own caption), never tests", () => {
  const sc = run(apollo()).plan.shared["component-l2"];
  assert.deepEqual(sc.archival.map((a) => [a.asset, a.kind]), [["asset:tank-location", "historical-drawing"], ["asset:tank-diagram", "historical-drawing"]]);
  assert.ok(!sc.archival.some((a) => a.asset === "asset:tank-fire-test"));
});
test("validator: a test photo labelled as a historical image, or test imagery without 'not the accident', fails", () => {
  let d = planned(); d.plan.shared["component-l2"].archival[0] = { asset: "asset:tank-fire-test", kind: "historical-photo", label: "NASA photo", window: ["line:L2 -0.1", "line:L2 +1"] };
  for (const s of d.plan.shots.filter((x) => x.template === "component-section")) s.assets.push("tank-fire-test");
  assert.ok(has(d, /misleading reconstruction visual: tank-fire-test shows a test but is labelled historical-photo/));
  d = planned(); shot(d, "document-excerpt").params.backdrop.label = "NASA photo · fire inside the tank";
  assert.ok(has(d, /test imagery tank-fire-test must be labelled as a test and "not the accident"/));
  d = planned(); shot(d, "document-excerpt").params.backdrop.kind = "historical-photo";
  assert.ok(has(d, /misleading reconstruction visual: backdrop tank-fire-test shows a test but is labelled historical-photo/));
});
test("excerpt backdrop: the related test photo is used only as labelled test imagery", () => {
  const b = shot(planned(), "document-excerpt").params.backdrop;
  assert.equal(b.kind, "test-imagery"); assert.match(b.label, /test · not the accident$/);
});
test("meters: values are claims (65 V fill, 28 V rating; 80°F mark, about 1000°F fill) and tags use only passage words", () => {
  const m = run(apollo()).plan.shared["component-l2"].meters;
  assert.deepEqual(m.map((x) => [x.quantity, x.entries.map((e) => `${e.role}:${e.value.slice(6)}`)]), [["voltage", ["fill:C-a13-heaters-65v", "mark:C-a13-switch-rating"]], ["temperature", ["mark:C-a13-switch-80f", "fill:C-a13-switch-80f", "fill:C-a13-1000f"]]]);
  const d = planned(); d.plan.shared["component-l2"].meters[0].entries[1].tag = "MAX SAFE {C-a13-switch-rating}";
  assert.ok(has(d, /unsupported visual claim: meter tag "MAX SAFE \{C-a13-switch-rating\}" has words not in C-a13-switch-rating's passage \(MAX, SAFE\)/));
  const d2 = planned(); d2.plan.shared["component-l2"].meters[1].entries[2].tag = "{C-a13-1000f.value}°F";
  assert.ok(has(d2, /approximate claim C-a13-1000f is shown .* without an approximation marker/));
});

// ---- round 3: camera continuity, cue timing, anchor calibration ------------------------------------------
test("component camera: one continuous scene span, moves stay inside their line and settle >= 0.6 s before the line's first cue", () => {
  const d = apollo(); const r = run(d); const sc = r.plan.shared["component-l2"]; const TIME = require(path.join(ENGINE, "timeref.js"));
  const dur = d.timeline.duration + 0.8; const at = (x) => TIME.resolve(x, d.timeline, dur);
  const shots = r.plan.shots.filter((s) => s.params.scene === "shared:component-l2");
  assert.equal(at(sc.span[0]), at(shots[0].start)); assert.equal(at(sc.span[1]), at(shots[shots.length - 1].end));
  for (const s of shots) { const a = at(s.start), b = at(s.end); const keys = sc.camera.filter((k) => at(k.at) >= a - 1e-6 && at(k.at) < b - 1e-6);
    const cue = Math.min(...sc.states.filter((x) => s.qa.states.some((q) => q.claim === x.claim.slice(6) && q.at === x.at)).map((x) => at(x.at)));
    const moves = keys.filter((k, j) => j > 0 && JSON.stringify(k.focus) !== JSON.stringify(keys[j - 1].focus));
    for (const k of moves) { const j = sc.camera.indexOf(k); const start = at(sc.camera[j - 1].at);
      assert.ok(at(k.at) <= b - 0.3 + 1e-6, `${s.id}: camera arrives inside the line`);
      // either settled 0.6 s before the cue, or the move starts only after the state has read (cue + 0.9)
      if (isFinite(cue)) assert.ok(at(k.at) <= cue - 0.6 + 1e-6 || start >= cue + 0.9 - 1e-6, `${s.id}: no move during the state change (${start.toFixed(2)}-${at(k.at).toFixed(2)}, cue ${cue.toFixed(2)})`); } }
});
test("anchor calibration: unreliable suggestions are assessed NEEDS_HUMAN_REVIEW, stay SUGGESTED, and never offered as measured-mode geometry", () => {
  const sug = J(path.join(AP, "anchor-suggestions.json")).suggestions; const by = Object.fromEntries(sug.map((s) => [s.id, s]));
  for (const id of ["SG-launch-1", "SG-tank-diagram-37", "SG-tank-diagram-38"]) { assert.equal(by[id].status, "SUGGESTED"); assert.equal(by[id].assessment, "NEEDS_HUMAN_REVIEW", id); assert.ok(by[id].assessmentReason); }
  assert.ok(by["SG-launch-1"].confidence <= 0.15 && by["SG-launch-1"].rawConfidence > by["SG-launch-1"].confidence);
  for (const s of sug.filter((x) => ["leader-target", "subject-box", "region-of-interest"].includes(x.method))) assert.equal(s.assessment, "NEEDS_HUMAN_REVIEW", s.id);
  const up = run({ ...apollo(), suggestions: sug }).upgrades; assert.ok(!up.some((u) => u.code === "MEASURED_MODE_AFTER_VERIFICATION"));
  assert.ok(up.some((u) => u.code === "MEASURED_MODE_NEEDS_MANUAL_ANCHORS" && u.suggestions.includes("SG-tank-diagram-37")));
});
