"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const TopicVisuals = require("../../core/rendering/topic-visuals");
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
  const script = { targetSeconds: 6, claims: [{ text: line, start: 0, end: 6 }] };
  const topic = { id: "IB-TEST", category: "SPACE", visualPotential: { scenes: ["rotating orbital habitat"] } };
  const plan = TopicVisuals.buildVisualPlan(topic, script, [], [3, 3], 6);
  const cards = plan.filter((item) => item.type === "number-card");
  assert.ok(cards.length >= 1);
  assert.ok(cards.every((item) => item.numbers.every((token) => item.claimText.includes(token))));
  assert.equal(TopicVisuals.visualMetrics(plan).cardNumbersValid, true);
});
