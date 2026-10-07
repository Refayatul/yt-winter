"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../../core/rendering/topic-visuals");

test("Behind the Ordinary rejects incidental Commons matches whose filenames do not name the subject", () => {
  const topic = { channel: "behind-the-ordinary", canonicalTopic: "the Bluetooth symbol", object: "the Bluetooth symbol" };
  assert.equal(V.fileNamesSubject(topic, { file: "Raton de Macintosh Bluetooth.jpg", description: "Bluetooth mouse" }), true);
  assert.equal(V.fileNamesSubject(topic, { file: "Kentucky Celebration Harrodsburg.jpg", description: "An ultrasound connects via Bluetooth" }), false);
});

test("Behind the Ordinary can pin an exact licensed detail asset without weakening host or licence checks", () => {
  const topic = { curatedVisuals: [
    { file: "Bluetooth Figure Mark Logo.png", imageUrl: "https://thumb.wikimedia.org/logo.png", sourceUrl: "https://commons.wikimedia.org/wiki/File:Logo", licence: "CC0 1.0" },
    { file: "bad.png", imageUrl: "https://example.com/bad.png", sourceUrl: "https://example.com", licence: "unknown" },
  ] };
  assert.deepEqual(V.curatedVisuals(topic).map((item) => item.file), ["Bluetooth Figure Mark Logo.png"]);
  const exact = { file: "Bluetooth Figure Mark Logo.png", description: "Official Bluetooth angular rune and bind rune" };
  assert.equal(V.detailStill({ channel: "behind-the-ordinary", canonicalTopic: "the Bluetooth symbol", designDetail: "its angular rune" }, [
    { file: "Bluetooth dongle.jpg", description: "Bluetooth adapter" }, exact,
  ]), exact);
});

test("raw ImpossibleBrief scenario/mechanism fields can establish semantic opening relevance", () => {
  const topic = {
    topic: "What If the Dinosaur-Killing Asteroid Hit Today?",
    scenarioChange: "a Chicxulub-size asteroid strikes Earth today",
    scientificMechanism: "impact converts kinetic energy into heat, shock and ejecta",
    openingLine: "One 10-kilometre asteroid ended the age of dinosaurs."
  };
  const evidence = V.semanticVisualEvidence(topic, {
    type: "licensed-still",
    still: { file: "Yucatan chix crater.jpg", description: "Chicxulub impact crater and asteroid scale illustration" },
    claimText: topic.openingLine,
  });
  assert.equal(evidence.relevant, true);
  assert.ok(evidence.strongTerms.some((term) => ["chicxulub", "asteroid", "impact"].includes(term)));
});

test("a sparse two-still pool gains scene-specific procedural variety instead of endless reuse", () => {
  const topic = { slug: "bluetooth", topic: "Bluetooth logo", canonicalTopic: "the Bluetooth symbol", visualScenes: ["Bluetooth logo", "two runes", "runes merge", "runestone", "phone pairing"] };
  const claims = Array.from({ length: 5 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, text: `Bluetooth scene ${i + 1}.` }));
  const stills = [
    { file: "Bluetooth logo.jpg", description: "Bluetooth logo", width: 1000, height: 1000 },
    { file: "Bluetooth dongle.jpg", description: "Bluetooth dongle", width: 1000, height: 1000 },
  ];
  const plan = V.buildVisualPlan(topic, { claims, targetSeconds: 10 }, stills, [2, 2, 2, 2, 2], 10, [], { opening: "motion" });
  const distinct = new Set(plan.map((shot) => shot.visualKey || shot.sourceId));
  assert.ok(distinct.size >= 5, `distinct=${distinct.size}`);
  assert.ok(plan.some((shot) => shot.type === "procedural"));
});

test("Behind the Ordinary visual plan keeps every measured hold within 3.2 seconds", () => {
  const topic = { channel: "behind-the-ordinary", slug: "bluetooth", topic: "Bluetooth logo", canonicalTopic: "the Bluetooth symbol", visualScenes: ["Bluetooth logo", "two runes", "runes merge", "runestone", "phone pairing"] };
  const claims = Array.from({ length: 8 }, (_, i) => ({ start: i * 4.6, end: (i + 1) * 4.6, text: `Bluetooth scene ${i + 1}.` }));
  const stills = ["A", "B", "C"].map((file) => ({ file: `Bluetooth ${file}.jpg`, description: "Bluetooth symbol", width: 1000, height: 1000 }));
  const plan = V.buildVisualPlan(topic, { claims, targetSeconds: 36.8 }, stills, [3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.5], 36.8, [], { opening: "motion" });
  assert.ok(Math.max(...plan.map((shot) => shot.duration)) <= 3.2);
});

test("loopBack never creates a consecutive same-source hold at the end", () => {
  const first = { type: "licensed-still", kind: "photo", visualKey: "A", sourceId: "A", still: { file: "A.jpg" }, motion: 0 };
  const plan = [
    first,
    { type: "procedural", visualKey: "B", sourceId: "B" },
    { type: "procedural", visualKey: "C", sourceId: "C" },
    { type: "procedural", visualKey: "D", sourceId: "D" },
    { type: "procedural", visualKey: "E", sourceId: "E" },
    { type: "licensed-still", kind: "photo", visualKey: "A", sourceId: "A2", still: { file: "A.jpg" }, motion: 1 },
    { type: "licensed-still", kind: "photo", visualKey: "Z", sourceId: "Z", still: { file: "Z.jpg" }, motion: 0 },
  ];
  const out = V.loopBack(plan);
  assert.equal(out[out.length - 1].visualKey, "Z");
  assert.equal(out[out.length - 1].loopBack, undefined);
});
