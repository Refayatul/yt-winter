"use strict";
// Shorts craft v2 (SHORTS_CRAFT_V2, off by default): first frame, detail-crop repeats, hook text, read pacing.
const test = require("node:test");
const assert = require("node:assert/strict");
const Craft = require("../../core/rendering/craft");
const V = require("../../core/rendering/topic-visuals");
const Rendering = require("../../core/rendering");

const topic = { channel: "impossible-brief", slug: "dino", topic: "What If the Dinosaur-Killing Asteroid Hit Today?", canonicalTopic: "Chicxulub asteroid impact",
  thumbnailText: "Dinosaur killer, today", visualScenes: ["asteroid", "crater", "dust", "sky", "dinosaurs"] };
const STILLS = [
  { file: "Yucatan chix crater.jpg", description: "crater location", width: 1200, height: 900 },
  { file: "Chicxulub radar topography.jpg", description: "radar topography map", width: 1200, height: 900 },
  { file: "Chicxulub Free-Air Gravity anomaly.png", description: "gravity anomaly", width: 1200, height: 900 },
  { file: "Chicxulub impact - artist impression.jpg", description: "artist's impression of the asteroid impact", width: 1600, height: 900 },
];
const claims = [
  "What If the Dinosaur-Killing Asteroid Hit Today?", "Stood on end, it would tower over Everest.", "It struck slightly over 66 million years ago.",
  "The crater it left is up to 300 kilometres wide.", "Today, the first danger would be heat and debris raining worldwide.",
  "Then soot and dust would dim sunlight for years.", "The real killer wasn't the crater. It was the sky.",
].map((text, i) => ({ text, start: i * 3.4, end: (i + 1) * 3.4 }));
const plan = (craft) => V.buildVisualPlan(topic, { claims, targetSeconds: 23.8 }, STILLS.map((s) => ({ ...s })), Array(12).fill(1.98), 23.8, [], { opening: "number", craft });

test("off by default; SHORTS_CRAFT_V2=1 enables every channel, a list enables only the named ones", () => {
  assert.equal(Craft.enabled("impossible-brief", {}), false);
  assert.equal(Craft.enabled("impossible-brief", { SHORTS_CRAFT_V2: "0" }), false);
  assert.equal(Craft.enabled("impossible-brief", { SHORTS_CRAFT_V2: "1" }), true);
  assert.equal(Craft.enabled("critical-thread", { SHORTS_CRAFT_V2: "impossible-brief" }), false);
  assert.equal(Craft.enabled("impossible-brief", { SHORTS_CRAFT_V2: "impossible-brief, critical-thread" }), true);
});

test("pictures are typed: data figures cannot open a Short; illustrations and photographs can", () => {
  assert.equal(Craft.figureType(STILLS[3]), "illustration");
  assert.equal(Craft.figureType(STILLS[2]), "data");
  assert.equal(Craft.figureType(STILLS[1]), "data");
  assert.equal(Craft.figureType({ file: "Entrance of Mont-Blanc tunnel.jpg" }), "photo");
  assert.equal(Craft.chooseOpening(STILLS, topic, claims[0].text).file, "Chicxulub impact - artist impression.jpg");
  assert.equal(Craft.chooseOpening([STILLS[1], STILLS[2]], topic, claims[0].text), null, "no data figure is ever chosen to open");
});

test("with the flag off the visual plan is exactly the current one", () => {
  const legacy = V.buildVisualPlan(topic, { claims, targetSeconds: 23.8 }, STILLS.map((s) => ({ ...s })), Array(12).fill(1.98), 23.8, [], { opening: "number" });
  assert.deepEqual(plan(false), legacy);
  assert.ok(!plan(false).some((shot) => shot.detail));
});

test("craft plan: vivid opening, every return is a detail crop, repeats are capped, the payoff closes on a picture", () => {
  const shots = plan(true);
  assert.equal(shots[0].still.file, "Chicxulub impact - artist impression.jpg");
  assert.equal(shots[0].kind, "photo", "an illustration opens full-frame, not letterboxed");
  const uses = new Map();
  for (const shot of shots.filter((s) => s.type === "licensed-still" && !s.loopBack)) {
    const n = (uses.get(shot.still.file) || 0) + 1;
    uses.set(shot.still.file, n);
    if (n > 1 && Craft.figureType(shot.still) !== "data") assert.equal(shot.detail, true, `${shot.still.file} use ${n} is a detail crop`);
  }
  for (const [file, n] of uses) assert.ok(n <= (Craft.figureType({ file }) === "data" ? 2 : 3), `${file} used ${n} times`);
  assert.notEqual(shots[shots.length - 1].type, "procedural");
  assert.ok(shots.every((shot) => shot.duration <= 4.01), "the hold limit is unchanged");
});

test("hook words: one or two balanced lines, sized to fit; overlay draws a readability band only with the flag", () => {
  assert.deepEqual(Craft.hookLines("DINOSAUR KILLER, TODAY"), ["DINOSAUR", "KILLER, TODAY"]);
  assert.deepEqual(Craft.hookLines("ONE MACHINE"), ["ONE MACHINE"]);
  assert.ok(Craft.hookFontSize(["DINOSAUR", "KILLER, TODAY"]) >= 100);
  const on = Rendering.overlayText(topic, 24, "motion", "licensed-still", "IMPOSSIBLE BRIEF #3", null, true);
  assert.match(on, /drawbox=/);
  assert.equal((on.match(/text='(DINOSAUR|KILLER, TODAY)'/g) || []).length, 2);
  assert.doesNotMatch(Rendering.overlayText(topic, 24, "motion", "licensed-still", "IMPOSSIBLE BRIEF #3", null), /drawbox=/);
});

test("read pacing: a beat after the hook and before the payoff, short joins, about the same total; slower payoff", () => {
  const pauses = Craft.linePauses(9);
  assert.equal(pauses[0], 0.32);
  assert.equal(pauses[7], 0.36);
  assert.equal(pauses[8], 0);
  assert.ok(Math.abs(pauses.reduce((a, b) => a + b, 0) - 8 * 0.18) < 0.15);
  assert.equal(Craft.payoffRate("+2%"), "-3%");
  assert.equal(Craft.payoffRate("-6%"), "-11%");
});

test("an opening_visual experiment arm turns on the opening change alone for that video (one variable)", () => {
  const arm = (value) => ({ experiment: { experiment_id: "ib-short-opening_visual", arm: "variant", variable: "opening_visual", value } });
  assert.deepEqual(Craft.features("impossible-brief", null, {}), { opening: false, repeats: false, pacing: false });
  assert.deepEqual(Craft.features("impossible-brief", arm("craft-v2-opening"), {}), { opening: true, repeats: false, pacing: false });
  assert.deepEqual(Craft.features("impossible-brief", arm("current"), {}), { opening: false, repeats: false, pacing: false });
  assert.deepEqual(Craft.features("impossible-brief", null, { SHORTS_CRAFT_V2: "1" }), { opening: true, repeats: true, pacing: true });
  const openingOnly = V.buildVisualPlan(topic, { claims, targetSeconds: 23.8 }, STILLS.map((s) => ({ ...s })), Array(12).fill(1.98), 23.8, [], { opening: "number", craft: { opening: true } });
  assert.equal(openingOnly[0].still.file, "Chicxulub impact - artist impression.jpg");
  assert.ok(!openingOnly.some((shot) => shot.detail), "repeats are unchanged in the opening-only arm");
});
