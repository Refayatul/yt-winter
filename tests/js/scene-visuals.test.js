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
  assert.equal(cards.length, 2);
  assert.equal(new Set(cards.map((item) => item.sourceId)).size, 2);
  assert.deepEqual(cards[0].comparison, ["80,800 km", "20–25 RPM"]);
  assert.deepEqual(cards[1].numbers, ["20–25 RPM"]);
  assert.ok(cards.every((item) => item.numbers.every((token) => item.claimText.includes(token))));
  assert.equal(TopicVisuals.visualMetrics(plan).cardNumbersValid, true);
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
