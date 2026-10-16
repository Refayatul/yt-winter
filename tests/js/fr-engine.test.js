"use strict";
// Premium Shorts engine: evidence/asset/shot-plan schemas, template registry, validator and resolver.
// Offline: no network, browser or ffmpeg.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "scripts/fr-premium/engine");
const FILM = path.join(ROOT, "channels/failure-reconstructed/premium/challenger-1986");
const { validatePlan, loadPlanFiles, loadRegistry } = require(path.join(ENGINE, "validate.js"));
const { validate: schemaCheck } = require(path.join(ENGINE, "jsonschema.js"));
const TIME = require(path.join(ENGINE, "timeref.js"));
const PLAN_FILE = path.join(FILM, "plan/shot-plan.json");
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = () => clone(loadPlanFiles(PLAN_FILE));
const run = (d) => validatePlan(d);
const has = (r, re) => r.errors.some((e) => re.test(e));
const shot = (d, id) => d.plan.shots.find((s) => s.id === id);
const newErrors = (r) => r.errors;

test("Challenger plan: valid, 15 of 15 shots data-driven, no legacy code", () => {
  const r = run(base());
  assert.deepEqual(r.errors, [], r.errors.join("\n")); assert.deepEqual(r.warnings, []);
  assert.equal(r.stats.shots, 15); assert.equal(r.stats.dataDriven, 15); assert.equal(r.stats.legacy, 0);
});

test("an unverified dimension blocks the reconstruction that depends on it (former SRB-length gap)", () => {
  const d = base(); d.evidence.claims["C-srb-length"].status = "unverified";
  assert.ok(has(run(d), /S09: params\.dims\.srbLength: claim C-srb-length is unverified/));
});

// ---- evidence ------------------------------------------------------------------------------------
test("missing evidence: a shot citing an undefined claim fails", () => {
  const d = base(); shot(d, "S04").evidence.push("C-does-not-exist"); assert.ok(has(run(d), /unknown claim C-does-not-exist/));
});
test("missing evidence: an explanatory reconstruction that cites nothing fails", () => {
  const d = base(); shot(d, "S05").evidence = []; assert.ok(has(run(d), /S05: unsupported visual reconstruction: explanatory shot cites no evidence/));
});
test("invalid claim: an unverified claim cannot be used", () => {
  const d = base(); d.evidence.claims["C-temp-36f"].status = "unverified"; assert.ok(has(run(d), /S04: .*C-temp-36f is unverified/));
});
test("invalid claim: a number that does not appear in its source passage fails", () => {
  const d = base(); d.evidence.claims["C-temp-36f"].value = 31; assert.ok(has(run(d), /claim C-temp-36f: value 31 does not appear in its source passage/));
});
test("invalid claim: a verified fact needs a passage and a known source", () => {
  const d = base(); delete d.evidence.claims["C-flame-58788"].passage; d.evidence.claims["C-test-75f"].source = "E99";
  const r = run(d); assert.ok(has(r, /C-flame-58788: verified fact without a source passage/)); assert.ok(has(r, /C-test-75f: unknown source E99/));
});

// ---- assets --------------------------------------------------------------------------------------
test("missing asset licence fails the schema; CC-BY without attribution fails", () => {
  let d = base(); delete d.assets.assets.icicles.licence; assert.ok(has(run(d), /assets schema: .*icicles: missing required "licence"/));
  d = base(); d.assets.assets.icicles.licence = { id: "cc-by", statement: "Creative Commons Attribution" }; assert.ok(has(run(d), /asset icicles: cc-by requires an attribution/));
  d = base(); d.assets.assets.icicles.licence.id = "all-rights-reserved"; assert.ok(has(run(d), /assets schema: .*licence\.id/));
});

// ---- anchors -------------------------------------------------------------------------------------
test("invalid anchor reference: unknown anchor, anchor out of bounds, asset not listed", () => {
  let d = base(); shot(d, "S01").params.mark.anchor = "asset:liftoff#nowhere"; assert.ok(has(run(d), /S01: params\.mark\.anchor: asset liftoff has no anchor "nowhere"/));
  d = base(); d.assets.assets.liftoff.anchors.smoke.point = [5000, 2885]; assert.ok(has(run(d), /asset liftoff#smoke: \(5000, 2885\) outside the 2308x3458/));
  d = base(); shot(d, "S01").assets = []; assert.ok(has(run(d), /S01: .*asset liftoff not listed in shot\.assets/));
});
test("unsupported visual reconstruction: a traced path off its measured anchor fails", () => {
  const d = base(); shot(d, "S02").params.paths[0].points = [[300, 400], [300, 900]];
  assert.ok(has(run(d), /S02: unsupported visual reconstruction: params\.paths\[0\] point \(300, 400\) is not on its basis asset:liftoff#right-srb/));
});
test("unsupported visual reconstruction: illustrative values without a visible label fail", () => {
  const d = base(); const s = shot(d, "S05"); s.provenance.label = "Explanatory animation"; s.params.chip.label = "Animation"; s.params.source.text = "{C-test-75f}, {C-joint-28f} · Rogers Commission Ch. IV";
  assert.ok(has(run(d), /S05: unsupported visual reconstruction: illustrative values without a visible label/));
});
test("declared exaggeration must match the evidence and be shown on screen", () => {
  const d = base(); shot(d, "S05").params.scale = { mode: "declared-exaggeration", factor: 8 }; shot(d, "S05").params.gapLabel.text = "GAP";
  assert.ok(has(run(d), /S05: declared exaggeration ×8 does not match the evidence/));
  shot(d, "S05").params.source.text += " · gap ×8"; assert.ok(has(run(d), /S05: declared exaggeration ×8 does not match the evidence \(×2\.61\)/));
});

test("visual exaggeration derived from evidence must be declared; the joint mechanism must show its factor", () => {
  let d = base(); shot(d, "S05").params.scale = { mode: "schematic" }; assert.ok(has(run(d), /S05: visual exaggeration ×2\.6 must be declared/));
  d = base(); delete shot(d, "S05").params.gapMax; assert.ok(has(run(d), /S05: visual scale cannot be derived from evidence/));
  d = base(); const s6 = shot(d, "S06"); s6.params.labels = s6.params.labels.filter((l) => l.target !== "gap"); s6.params.source.text = "Rogers Fig. 14 geometry · recovery illustrative";
  assert.ok(has(run(d), /S06: declared exaggeration ×8 is not shown on screen/));
});
test("approximate values must say so on screen", () => {
  let d = base(); d.evidence.claims["C-telecon-0845"].display = "8:45 PM"; assert.ok(has(run(d), /approximate claim C-telecon-0845 is shown as "8:45 PM" without an approximation marker/));
  d = base(); d.evidence.claims["C-breakup-photo-76s"].display = "76 s after launch"; assert.ok(has(run(d), /S10: .*approximate claim C-breakup-photo-76s/));
});
test("film clock: the time base must be a claim; document zoom: anchors must exist", () => {
  let d = base(); shot(d, "S07").params.filmClock = { label: "TIME AFTER LIFTOFF", timeBase: -10 }; assert.ok(has(run(d), /S07: params\.filmClock\.timeBase: factual value must reference a claim/));
  d = base(); shot(d, "S03").params.register.toAnchor = "asset:fig14#nowhere"; assert.ok(has(run(d), /S03: params\.register\.toAnchor: asset fig14 has no anchor "nowhere"/));
});

// ---- parameters ----------------------------------------------------------------------------------
test("unsupported parameters: unknown keys and wrong types fail against the template schema", () => {
  const d = base(); shot(d, "S04").params.sparkles = true; shot(d, "S10").params.filter = "sepia(1)";
  const r = run(d); assert.ok(has(r, /S04: unsupported parameter: params: unsupported property "sparkles"/)); assert.ok(has(r, /S10: unsupported parameter: params\.filter/));
});
test("factual values must be claim references; on-screen numbers must come from claims", () => {
  const d = base(); shot(d, "S08").params.stamp.value = 58.788; shot(d, "S04").params.stat.value = "36°F";
  const r = run(d); assert.ok(has(r, /S08: params\.stamp\.value: factual value must reference a claim/)); assert.ok(has(r, /S04: params\.stat\.value: on-screen number "36°F"/));
});
test("citations and asset identifiers are allowed on screen without a claim", () => {
  const d = base(); shot(d, "S12").params.source.text = "Thiokol chart, Rogers Commission Vol. 1, p. 90"; assert.deepEqual(newErrors(run(d)), []);
  shot(d, "S12").params.source.text = "Thiokol chart, 1 hour before the decision"; assert.ok(has(run(d), /S12: params\.source\.text: on-screen number "1"/));
});

// ---- transitions, templates, channel -------------------------------------------------------------
test("wrong transition type and a missing reason fail", () => {
  const d = base(); shot(d, "S04").transition.type = "star-wipe"; delete shot(d, "S10").transition.reason;
  const r = run(d); assert.ok(has(r, /S04: wrong transition type "star-wipe"/)); assert.ok(has(r, /S10: transition has no reason/));
});
test("unsupported shot template fails; a legacy shot must state why", () => {
  let d = base(); shot(d, "S04").template = "particle-storm"; assert.ok(has(run(d), /S04: unsupported template "particle-storm"/));
  d = base(); Object.assign(shot(d, "S06"), { template: "legacy-code", params: { shot: "S06" } }); assert.ok(has(run(d), /S06: legacy-code shot without manual\.reason/));
});
test("template provenance: an archival plate cannot be labelled a reconstruction", () => {
  const d = base(); shot(d, "S04").provenance.kind = "reconstruction"; assert.ok(has(run(d), /S04: template archival-plate cannot carry provenance "reconstruction"/));
});
test("incorrect channel configuration: unknown channel, channel without a pack, wrong style", () => {
  let d = base(); d.plan.channel = "no-such-channel"; let r = run(d); assert.ok(has(r, /channel "no-such-channel" has no channels\/no-such-channel\/config\.json/)); assert.ok(has(r, /no channel pack/));
  d = base(); d.plan.channel = "impossible-brief"; assert.ok(has(run(d), /no channel pack engine\/channels\/impossible-brief\.json/));
  d = base(); d.plan.style = "impossible-brief/cosmic-v1"; assert.ok(has(run(d), /style "impossible-brief\/cosmic-v1" is not a failure-reconstructed style/));
});

// ---- narration anchors and timing ----------------------------------------------------------------
test("missing narration anchors: unknown word or line fails", () => {
  let d = base(); shot(d, "S05").params.gap.startAt = "word:L4:quickly -0.2"; assert.ok(has(run(d), /S05: params\.gap\.startAt: .*word "quickly" not spoken in L4/));
  d = base(); shot(d, "S04").start = "line:L99 -0.1"; assert.ok(has(run(d), /S04: start: .*no line L99/));
});
test("invalid timing: end before start, gaps, and shots past the film end fail", () => {
  let d = base(); shot(d, "S04").end = "line:L3 -0.5"; assert.ok(has(run(d), /S04: invalid timing: end .* <= start/));
  d = base(); shot(d, "S05").start = "line:L4"; assert.ok(has(run(d), /S05: invalid timing: starts at .* but the previous shot ends at/));
  d = base(); shot(d, "S15").end = "end +2"; assert.ok(has(run(d), /S15: invalid timing: ends after the film/));
  d = base(); shot(d, "S05").qa.states[0].at = "line:L9"; assert.ok(has(run(d), /S05: qa state .* is outside the shot/));
});
test("qa expectations: a mechanism template needs its minimum narration-timed states", () => {
  const d = base(); shot(d, "S05").qa.states = shot(d, "S05").qa.states.slice(0, 1); assert.ok(has(run(d), /S05: qa: 1 narration-timed states, template joint-section expects >= 2/));
});

// ---- registry, schemas, time references -----------------------------------------------------------
test("registry: every template has an id, provenance, a parameter schema and a builder; the channel pack only lists known templates", () => {
  const reg = loadRegistry(); const pack = JSON.parse(fs.readFileSync(path.join(ENGINE, "channels/failure-reconstructed.json"), "utf8"));
  for (const id of ["archival-plate", "trace-over-photo", "joint-section", "joint-mechanism", "document-zoom", "document-desk", "event-sequence", "timeline", "payoff", "legacy-code"]) {
    const T = reg[id]; assert.ok(T, id); assert.equal(T.id, id); assert.ok(T.provenance.length); assert.equal(T.params.type, "object"); assert.equal(typeof T.build, "function"); }
  for (const t of pack.templates) assert.ok(reg[t], `pack lists unknown template ${t}`);
});
test("schemas: the Challenger evidence, assets and plan pass; the validator subset enforces types, enums and patterns", () => {
  const d = base(); for (const [n, doc] of [["evidence", d.evidence], ["assets", d.assets], ["shot-plan", d.plan]]) assert.deepEqual(schemaCheck(JSON.parse(fs.readFileSync(path.join(ENGINE, "schemas", `${n}.schema.json`), "utf8")), doc), [], n);
  const s = { type: "object", required: ["a"], additionalProperties: false, properties: { a: { type: "integer", minimum: 1 }, b: { enum: ["x"] }, c: { type: "string", pattern: "^q" } } };
  assert.equal(schemaCheck(s, { a: 0, b: "y", c: "z", d: 1 }).length, 4); assert.deepEqual(schemaCheck(s, { a: 2, b: "x", c: "qq" }), []);
});
test("time references resolve against the narration and reject malformed input", () => {
  const tl = JSON.parse(fs.readFileSync(path.join(FILM, "v1/timeline-edge-andrew.json"), "utf8"));
  const w = tl.words.find((x) => x.line === "L10" && x.text === "fifty-three");
  assert.equal(TIME.resolve("word:L10:fifty-three -0.1", tl, 52), w.start - 0.1);
  assert.equal(TIME.resolve("end -0.35", tl, 52), 52 - 0.35);
  assert.throws(() => TIME.resolve("word:L10:fifty-three-0.1", tl, 52), /not spoken/);
  assert.throws(() => TIME.resolve("soon", tl, 52), /bad time reference/);
});

// ---- resolver (page side, in a VM) ------------------------------------------------------------------
test("resolver: the plan builds 15 shots that tile the film, with templates, provenance and registered match", () => {
  const window = {}; const ctx = vm.createContext({ window, globalThis: window, document: { getElementById: () => ({ appendChild() {}, style: {} }) }, Math, JSON, String, Number, Set, Map, Promise, Array, Object, Error, RegExp });
  const read = (p) => fs.readFileSync(p, "utf8");
  vm.runInContext(read(path.join(ROOT, "scripts/fr-premium/fr-lib.js")), ctx); vm.runInContext(read(path.join(ROOT, "scripts/fr-premium/fr-forensic.js")), ctx);
  vm.runInContext(read(path.join(FILM, "scenes.js")), ctx);
  for (const f of fs.readdirSync(path.join(FILM, "phase1")).filter((x) => /^proto-.*\.js$/.test(x))) vm.runInContext(read(path.join(FILM, "phase1", f)), ctx);
  vm.runInContext(read(path.join(FILM, "v3/v3-opening.js")), ctx);
  const d = base(); window.FR_PLAN = { plan: d.plan, evidence: d.evidence, assets: d.assets };
  for (const f of ["timeref.js", "templates/_common.js", ...fs.readdirSync(path.join(ENGINE, "templates")).filter((x) => !x.startsWith("_")).map((x) => "templates/" + x), "fr-plan.js"]) vm.runInContext(read(path.join(ENGINE, f)), ctx);
  const media = {}; for (const [k, a] of Object.entries(d.assets.assets)) media[k] = a.kind === "clip" ? { src: "", dir: "x", iw: a.clip.out.w, ih: a.clip.out.h, scale: 1, fps: 30, frames: 100, crop: { x: 0, y: 0, w: a.clip.out.w, h: a.clip.out.h } } : { src: "", iw: a.width, ih: a.height, scale: 1 };
  const meta = JSON.parse(JSON.stringify(window.FR.init(d.timeline, media, d.timeline.duration + d.plan.film.tail)));
  assert.equal(meta.shots.length, 15);
  for (let i = 1; i < meta.shots.length; i += 1) assert.ok(Math.abs(meta.shots[i].start - meta.shots[i - 1].end) < 1e-6, meta.shots[i].id);
  assert.equal(meta.shots[8].kind, "reconstruction"); assert.ok(meta.shots[8].plan.register, "S09 registered to the film");
  assert.equal(window.FR.captionFrom, 0.5); assert.ok(window.FR.captionSkip.has("L12"));
});

test("isolation: the engine never uploads, publishes, calls paid providers or reads credentials", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const banned = /youtube-yukle|tiktok-yukle|googleapis|youtube\.upload|@anthropic-ai|anthropic\.com\/v1|openai|elevenlabs|cartesia|GOOGLE_APPLICATION_CREDENTIALS|YOUTUBE_(CLIENT|REFRESH)|process\.env\.(ANTHROPIC|OPENAI|ELEVEN|CARTESIA)|cloudflare/i;
  for (const f of walk(ENGINE)) assert.ok(!banned.test(fs.readFileSync(f, "utf8")), `${path.relative(ROOT, f)} references a publishing/paid/credential path`);
});
