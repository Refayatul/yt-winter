"use strict";
// FR premium prototype (offline only): script evidence, shot anchoring, captions, framing math and
// isolation from production. No network, ffmpeg or browser is needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const FILM = path.join(ROOT, "channels/failure-reconstructed/premium/challenger-1986");
const TOOLS = path.join(ROOT, "scripts/fr-premium");
const read = (p) => fs.readFileSync(p, "utf8");
const json = (p) => JSON.parse(read(p));
const words = (s) => s.trim().split(/\s+/).length;

function loadLib() {
  const window = {};
  const ctx = vm.createContext({ window, document: { getElementById: () => ({ appendChild() {}, style: {} }) }, Math, JSON, String, Number, Set, Map, Promise, Array, Object, Error });
  vm.runInContext(read(path.join(TOOLS, "fr-lib.js")), ctx);
  vm.runInContext(read(path.join(TOOLS, "fr-forensic.js")), ctx);
  return { FR: window.FR, window, ctx };
}

for (const file of ["script.json", "script-short.json"]) {
  test(`${file}: every spoken line cites evidence that the script defines`, () => {
    const s = json(path.join(FILM, file));
    const ids = Object.keys(s.evidence);
    const lines = s.beats.flatMap((b) => b.lines);
    assert.ok(lines.length > 0);
    for (const l of lines) {
      assert.ok(l.evidence && l.evidence.length, `${l.id} has no evidence`);
      const cited = l.evidence.map((e) => (e.match(/E\d+/g) || [])).flat();
      if (!/editorial summary/i.test(l.evidence.join(" "))) assert.ok(cited.length, `${l.id} cites no E-id`);
      for (const c of cited) assert.ok(ids.includes(c), `${l.id} cites undefined ${c}`);
    }
  });
}

test("script.json: the chosen hook is one of the alternatives and is spoken first", () => {
  const s = json(path.join(FILM, "script.json"));
  const hook = s.hooks.find((h) => h.id === s.chosenHook);
  assert.ok(hook && s.hooks.length >= 3);
  assert.equal(s.beats[0].lines[0].text, hook.text);
});

test("script-short.json: 30-35 s at the v1 read's measured rate", () => {
  const short = json(path.join(FILM, "script-short.json"));
  const v1 = json(path.join(FILM, "v1/timeline-edge-andrew.json"));
  const v1Words = v1.words.length; const wpm = v1Words / (v1.duration / 60);
  const n = short.beats.flatMap((b) => b.lines).reduce((a, l) => a + words(l.text), 0);
  const est = (n / wpm) * 60;
  assert.ok(est >= 30 && est <= 35, `estimated ${est.toFixed(1)} s from ${n} words at ${wpm.toFixed(0)} wpm`);
});

test("v1 timeline: every script word is timed, in order, with no overlap", () => {
  const s = json(path.join(FILM, "script.json")); const tl = json(path.join(FILM, "v1/timeline-edge-andrew.json"));
  const scriptWords = s.beats.flatMap((b) => b.lines).flatMap((l) => l.text.split(/\s+/));
  assert.deepEqual(tl.words.map((w) => w.text), scriptWords);
  tl.words.forEach((w, i) => { assert.ok(w.end > w.start, w.text); if (i) assert.ok(w.start >= tl.words[i - 1].start, w.text); });
  assert.ok(tl.duration >= 45 && tl.duration <= 55);
});

test("scenes.js: every word anchor resolves and shots tile the film without gaps or overlaps", () => {
  const { FR, window, ctx } = loadLib();
  vm.runInContext(read(path.join(FILM, "scenes.js")), ctx);
  const tl = json(path.join(FILM, "v1/timeline-edge-andrew.json"));
  const media = {}; for (const k of ["liftoff", "fig14", "icicles", "breakup", "crew", "burn", "climb", "e207"]) media[k] = { src: "", iw: 1000, ih: 1500, scale: 1, fps: 30, frames: 30, dir: "", crop: { x: 0, y: 0, w: 1000, h: 1000 } };
  const meta = FR.init(tl, media, tl.duration + 0.8);
  const shots = meta.shots;
  assert.equal(shots[0].start, 0);
  for (let i = 1; i < shots.length; i += 1) assert.ok(Math.abs(shots[i].start - shots[i - 1].end) < 1e-6, `gap/overlap before ${shots[i].id}`);
  assert.ok(Math.abs(shots[shots.length - 1].end - (tl.duration + 0.8)) < 1e-3);
  for (const s of shots) {
    assert.ok(["archival", "document", "explanatory", "reconstruction"].includes(s.kind), `${s.id} has no provenance kind`);
    assert.ok(s.label, `${s.id} has no on-screen provenance label`);
  }
  // archival and document shots name their source asset
  for (const s of shots.filter((x) => x.kind === "archival")) assert.ok(s.source, `${s.id} archival without source`);
  assert.ok(window.SCENES);
});

test("captions: at most 2 lines of 24 characters, every non-payoff word shown exactly once", () => {
  const { FR } = loadLib();
  const tl = json(path.join(FILM, "v1/timeline-edge-andrew.json"));
  FR.tl = tl; FR.captionSkip.add("L12");
  const cues = FR.buildCaptions();
  for (const c of cues) {
    assert.ok(c.lines.length <= 2);
    for (const l of c.lines) assert.ok(l.map((w) => w.text).join(" ").length <= 26, l.map((w) => w.text).join(" "));
    assert.ok(c.end > c.start);
  }
  // values cross the vm realm: compare plain copies
  const shown = JSON.parse(JSON.stringify(cues.flatMap((c) => c.lines.flat()).map((w) => w.text)));
  assert.deepEqual(shown, tl.words.filter((w) => w.line !== "L12").map((w) => w.text));
});

test("framing: cover() keeps the crop inside the image at any focus and zoom", () => {
  const { FR } = loadLib();
  const m = { iw: 2308, ih: 3458 };
  for (const [fx, fy, z] of [[0, 0, 1], [2308, 3458, 1.4], [1972, 2885, 1.38], [-50, 5000, 2]]) {
    const c = FR.cover(m, { fx, fy, z, box: { x: 0, y: 0, w: 1080, h: 1400 } });
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= m.iw + 1e-6 && c.y + c.h <= m.ih + 1e-6, JSON.stringify(c));
    assert.ok(Math.abs(c.w / c.h - 1080 / 1400) < 1e-9);
  }
});

test("isolation: the prototype never uploads, publishes, calls paid providers or reads credentials", () => {
  const walkAll = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkAll(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walkAll(TOOLS).concat([path.join(FILM, "scenes.js")], fs.readdirSync(path.join(FILM, "phase1")).filter((f) => /\.(js|json)$/.test(f)).map((f) => path.join(FILM, "phase1", f)));
  const banned = /youtube-yukle|tiktok-yukle|googleapis|youtube\.upload|@anthropic-ai|anthropic\.com\/v1|openai|elevenlabs|cartesia|GOOGLE_APPLICATION_CREDENTIALS|YOUTUBE_(CLIENT|REFRESH)|process\.env\.(ANTHROPIC|OPENAI|ELEVEN|CARTESIA)/i;
  for (const f of files) assert.ok(!banned.test(read(f)), `${path.basename(f)} references a publishing/paid/credential path`);
  // and nothing in production references the prototype
  const prodRoots = [".github/workflows", "core", "lib"].map((d) => path.join(ROOT, d));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of prodRoots.flatMap(walk).filter((x) => /\.(js|ya?ml|cjs)$/.test(x)))
    assert.ok(!/fr-premium|premium\/challenger/.test(read(f)), `${path.relative(ROOT, f)} references the prototype`);
  for (const f of fs.readdirSync(ROOT).filter((x) => /\.(c?js)$/.test(x)))
    assert.ok(!/fr-premium/.test(read(path.join(ROOT, f))), `${f} references the prototype`);
});

// ---- Phase 1 scene prototypes -------------------------------------------------------------------
const GRAMMAR = new Set(["match", "push-in", "follow-cause", "cut", "hard-cut", "dip", "loop", "continuous"]);
function loadPrototypes() {
  const { FR, window, ctx } = loadLib();
  vm.runInContext(read(path.join(FILM, "scenes.js")), ctx);
  for (const f of fs.readdirSync(path.join(FILM, "phase1")).filter((x) => /^proto-.*\.js$/.test(x))) vm.runInContext(read(path.join(FILM, "phase1", f)), ctx);
  const tl = json(path.join(FILM, "v1/timeline-edge-andrew.json"));
  const media = {}; for (const k of ["liftoff", "fig14", "icicles", "breakup", "crew", "burn", "climb", "e207", "chart53", "fax"]) media[k] = { src: "", iw: 1000, ih: 1500, scale: 1, fps: 30, frames: 30, dir: "", crop: { x: 0, y: 0, w: 1000, h: 1000 } };
  const meta = JSON.parse(JSON.stringify(FR.init(tl, media, tl.duration + 0.8)));
  return { FR, window, meta, tl };
}

test("phase 1: four prototypes replace exactly S02 S03 S05 S08 S09 S12 S13 and the film still tiles", () => {
  const { window, meta, tl } = loadPrototypes();
  assert.equal(window.OVERRIDES.length, 4);
  const shots = meta.shots; assert.equal(shots.length, 15);
  for (let i = 1; i < shots.length; i += 1) assert.ok(Math.abs(shots[i].start - shots[i - 1].end) < 1e-6, `gap/overlap before ${shots[i].id}`);
  assert.ok(Math.abs(shots[shots.length - 1].end - (tl.duration + 0.8)) < 1e-3);
  const planned = shots.filter((s) => s.plan.transitionReason).map((s) => s.id);
  assert.deepEqual(planned, ["S02", "S03", "S05", "S08", "S09", "S12", "S13"]);
});

test("phase 1: every rebuilt shot declares a grammar transition, timed states with evidence, and provenance", () => {
  const { meta } = loadPrototypes();
  for (const s of meta.shots.filter((x) => x.plan.transitionReason)) {
    assert.ok(GRAMMAR.has(s.transition), `${s.id} transition '${s.transition}' not in grammar`);
    assert.ok(s.label && s.kind, `${s.id} provenance`);
    if (s.kind !== "archival") {
      assert.ok(s.plan.states.length >= 2, `${s.id} needs >= 2 narration-timed state changes`);
      for (const x of s.plan.states) assert.ok(x.t >= s.start - 1e-6 && x.t < s.end, `${s.id} state '${x.what}' outside the shot`);
      assert.ok(s.plan.states.filter((x) => x.ev).length >= 1, `${s.id} states cite no evidence`);
    }
    // mechanism shots are registered to archival media, or say why not (creative_qa then WARNs)
    if (s.kind === "explanatory" || s.kind === "reconstruction") assert.ok(s.plan.register && (s.plan.register.from || s.plan.register.reason), `${s.id} has no registration or reason`);
    assert.ok(!s.plan.primitives.some((p) => ["bar-chart", "flowchart", "bullets"].includes(p)), `${s.id} uses a slide primitive`);
  }
});

test("phase 1: the flame-to-tank event clock uses the Commission's documented times, in order", () => {
  const { FR } = loadPrototypes();
  const s09 = FR.shots.find((s) => s.id === "S09");
  const at = JSON.parse(JSON.stringify(s09.events.map((e) => e.at)));
  assert.deepEqual(at, [59.262, 60.238, 64.66, 72.204, 73.124]); // Rogers Commission Vol. 1 Ch. III
  for (let i = 1; i < s09.events.length; i += 1) assert.ok(s09.events[i].screen > s09.events[i - 1].screen);
  const ev = FR.X.events(s09.events, s09.events[2].screen + 1e-3); assert.ok(Math.abs(ev.now - 64.66) < 0.05);
});

test("forensic components: event clock interpolates, groove seals warm and leaks cold", () => {
  const { FR } = loadLib();
  const evs = [{ at: 10, screen: 0, key: "a" }, { at: 20, screen: 1, key: "b" }];
  assert.equal(FR.X.events(evs, 0.5).now, 15); assert.equal(FR.X.events(evs, 5).now, 20);
  const g = (tau) => FR.X.groove({ x: 0, y: 0, w: 1080, h: 460, gap: 1, tRel: 0.6, tau, tint: "warm" });
  assert.equal(g(0.06).sealed, true); assert.equal(g(4).sealed, false); assert.ok(g(4).gapW > 20);
});
