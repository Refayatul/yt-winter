"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const TopicVisuals = require("../../core/rendering/topic-visuals");
const Rendering = require("../../core/rendering");
const PackageQuality = require("../../core/quality/impossible-brief");

function shot(sourceId, type, start, end, claimIndex = 0, claimText = "80,800 km", numbers = ["80,800 km"]) {
  return { sourceId, type, start, end, duration: end - start, claimIndex, claimText, numbers };
}

function packageWith(renderQuality) {
  return {
    script: { forbiddenOpening: false },
    titles: Array.from({ length: 20 }, (_, index) => `Title ${index}`),
    visuals: Array.from({ length: 5 }, () => ({ changeRequiredWithinSeconds: 3 })),
    sources: [{}, {}],
    metadata: { uploadChannel: "impossible-brief" },
    renderVisuals: { visualQuality: renderQuality },
  };
}

test("rendered-visual gate blocks the old repeated generic composition", () => {
  const plan = Array.from({ length: 6 }, (_, index) => shot("procedural:generic", "procedural", index * 3, index * 3 + 3, index, "No measured value", []));
  const metrics = TopicVisuals.visualMetrics(plan);
  const gate = TopicVisuals.evaluateVisualQuality(metrics);
  assert.equal(metrics.distinctVisuals, 1);
  assert.equal(metrics.maxStaticSeconds, 18);
  assert.equal(gate.decision, "BLOCK");
  assert.ok(gate.reasons.some((reason) => reason.includes("distinct visuals")));
  assert.ok(gate.reasons.some((reason) => reason.includes("licensed real images")));
  assert.equal(PackageQuality.evaluatePackage(packageWith(gate)).decision, "BLOCK");
});

test("rendered-visual gate passes varied licensed stills and sourced cards", () => {
  const plan = [
    shot("card:0:distance", "number-card", 0, 2.5),
    shot("still:earth.jpg", "licensed-still", 2.5, 5, 1, "Gravity changes", []),
    shot("card:2:speed", "number-card", 5, 7.5, 2, "At 20–25 RPM", ["20–25 RPM"]),
    shot("still:moon.jpg", "licensed-still", 7.5, 10, 3, "The Moon remains visible", []),
    shot("card:4:time", "number-card", 10, 13, 4, "It takes 38 minutes", ["38 minutes"]),
  ];
  const metrics = TopicVisuals.visualMetrics(plan);
  assert.deepEqual({ distinct: metrics.distinctVisuals, images: metrics.realImageCount, cards: metrics.numberCardCount }, { distinct: 5, images: 2, cards: 3 });
  const gate = TopicVisuals.evaluateVisualQuality(metrics);
  assert.equal(gate.decision, "PUBLISH");
  assert.equal(PackageQuality.evaluatePackage(packageWith(gate)).decision, "PUBLISH");
});

test("number cards use only number-and-unit tokens present in their narration line", () => {
  const line = "The rim spans 80,800 km and turns at 20–25 RPM.";
  assert.deepEqual(TopicVisuals.numberTokens(line), ["80,800 km", "20–25 RPM"]);
  assert.deepEqual(TopicVisuals.numberTokens("In 2011, it stopped."), ["2011"]);
  assert.deepEqual(TopicVisuals.numberTokens("Drilling Kola SG-3 began in 1970."), ["SG-3", "1970"]);
  const script = { targetSeconds: 6, claims: [{ text: line, start: 0, end: 6 }] };
  const topic = { id: "IB-TEST", category: "SPACE", visualPotential: { scenes: ["rotating orbital habitat"] } };
  const plan = TopicVisuals.buildVisualPlan(topic, script, [], [3, 3], 6);
  const cards = plan.filter((item) => item.type === "number-card");
  // One card per narration line, and km vs RPM is not a comparison.
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].numbers, ["80,800 km"]);
  assert.deepEqual(cards[0].comparison, []);
  assert.ok(cards.every((item) => item.numbers.every((token) => item.claimText.includes(token))));
  assert.equal(TopicVisuals.visualMetrics(plan).cardNumbersValid, true);
  const sameUnit = TopicVisuals.buildVisualPlan(topic, { targetSeconds: 3, claims: [{ text: "Winters fall from 15 °C to 5 °C.", start: 0, end: 3 }] }, [], [3], 3);
  assert.deepEqual(sameUnit[0].comparison, ["15 °C", "5 °C"]);
});

test("cards only for values with a unit; bare numbers and identifiers stay off screen", () => {
  assert.deepEqual(TopicVisuals.cardTokens(["8", "4", "10", "1970", "SG-3"]), []);
  assert.deepEqual(TopicVisuals.cardTokens(["25%", "10 °C", "80,800 km", "7 million"]), ["25%", "10 °C", "80,800 km", "7 million"]);
});

test("visual plan leads with photographs, caps cards, and reuses stills with a new camera move", () => {
  const stills = [
    { file: "AMOC chart.png", description: "model graph" },
    { file: "Gulf Stream from orbit.jpg", description: "satellite photograph" },
    { file: "Iceberg.jpg", description: "iceberg near Greenland" },
  ];
  assert.deepEqual(stills.map(TopicVisuals.stillKind), ["diagram", "photo", "photo"]);
  const claims = Array.from({ length: 6 }, (_, index) => ({ text: `Line ${index} moves ${index + 2}0% of the heat.`, start: index * 5, end: index * 5 + 5 }));
  const plan = TopicVisuals.buildVisualPlan({ id: "IB-PLAN" }, { targetSeconds: 30, claims }, stills, Array(12).fill(2.5), 30);
  const cards = plan.filter((shot) => shot.type === "number-card");
  assert.ok(cards.length <= 3, `cards ${cards.length}`);
  assert.ok(plan.every((shot, index) => !index || !(shot.type === "number-card" && plan[index - 1].type === "number-card")), "no back-to-back cards");
  assert.ok(cards.every((card) => card.backdrop), "cards sit on a picture from the topic");
  const firstStill = plan.find((shot) => shot.type === "licensed-still");
  assert.equal(firstStill.kind, "photo", "photographs before diagrams");
  assert.ok(plan.every((shot, index) => !index || shot.type !== "licensed-still" || plan[index - 1].still !== shot.still), "never the same picture twice in a row");
  const reused = plan.filter((shot) => shot.type === "licensed-still" && shot.motion > 0);
  assert.ok(reused.length > 0 && reused.every((shot) => /#\d+$/.test(shot.sourceId)));
  const metrics = TopicVisuals.visualMetrics(plan);
  assert.equal(metrics.realImageCount, 3, "a re-used still counts once");
  assert.equal(TopicVisuals.evaluateVisualQuality(metrics).decision, "PUBLISH");
});

test("number-card type scales down wide sourced values to stay inside the card", () => {
  assert.ok(Rendering.numberCardFontSize("30 MINUTES") <= 122);
  assert.ok(Rendering.numberCardFontSize("80,800 KM  VS  20–25 RPM") < Rendering.numberCardFontSize("7 MILLION"));
});

test("pipeline skips a topic rejected only by the rendered-visual gate", () => {
  const os = require("os");
  const { visualRejection } = require("../../core/pipeline/impossible-brief");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "visual-rejection-"));
  const attribution = (error) => fs.writeFileSync(path.join(directory, "visual-attribution.json"), JSON.stringify({ count: 1, stills: [], error }));
  const result = (validations, validationReasons) => ({ validations: { script: true, audio: true, ...validations }, validationReasons });
  const visualBlock = result({ visuals: false, qualityGate: false }, {
    visuals: ["requires 2 licensed real images or 5 number cards (got 1 images, 1 cards)"],
    qualityGate: ["rendered visuals: requires 2 licensed real images or 5 number cards (got 1 images, 1 cards)"],
  });

  attribution(null);
  assert.match(visualRejection(visualBlock, directory), /requires 2 licensed real images/);
  // A Commons fetch failure is transient: the topic must not be blocked forever.
  attribution("visual cache preparation failed");
  assert.equal(visualRejection(visualBlock, directory), null);
  attribution(null);
  // Any non-visual failure keeps the old hard failure.
  assert.equal(visualRejection(result({ visuals: false, audio: false }, {}), directory), null);
  assert.equal(visualRejection(result({ visuals: false, qualityGate: false }, { qualityGate: ["unsupported claim"] }), directory), null);
  assert.equal(visualRejection(result({ qualityGate: false }, { qualityGate: ["rendered visuals: x"] }), directory), null);
  assert.equal(visualRejection(result({}, {}), directory), null);
});
