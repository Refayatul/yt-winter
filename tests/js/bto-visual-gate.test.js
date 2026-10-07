"use strict";

const test = require("node:test");
const assert = require("node:assert");
const TopicVisuals = require("../../core/rendering/topic-visuals");
const Explainers = require("../../core/rendering/explainers");

const LINES = [
  "That strange Bluetooth symbol hides two letters.",
  "Two runes, merged into one symbol.",
  "The name honours King Harald Bluetooth, who united Denmark and Norway.",
  "At an industry meeting, Intel's Jim Kardach suggested it as a temporary code name.",
  "Harald united Scandinavia. This radio link would unite PCs and phones.",
  "It was only a placeholder. RadioWire or PAN was meant to replace it.",
  "PAN was already everywhere online, and RadioWire's trademark check ran out of time.",
  "So the logo merges Harald's initials in runes: H and B.",
];
const SECONDS = [3.2, 2.8, 4.9, 5.5, 5.5, 5.1, 5.5, 4.3];

function claims() {
  let at = 0;
  return LINES.map((text, index) => { const claim = { text, start: at, end: at + SECONDS[index] }; at += SECONDS[index]; return claim; });
}
const duration = SECONDS.reduce((a, b) => a + b, 0);

function topic(extra = {}) {
  return { id: "BTO-T", slug: "bluetooth-test", channel: "behind-the-ordinary", topic: "Why the Bluetooth Logo Looks Like That",
    canonicalTopic: "the Bluetooth symbol", designDetail: "its angular rune", openingLine: LINES[0],
    visualPotential: { scenes: ["the Bluetooth logo"] }, ...extra };
}

const STILLS = [
  { file: "Bluetooth Figure Mark Logo.png", width: 1280, height: 1280, description: "Official Bluetooth figure mark: the angular Runic B" },
  { file: "TP-Link Archer T2UB Nano dongle plugged in to a computer.jpg", width: 3746, height: 2634, description: "Bluetooth dongle" },
  { file: "Raton de Macintosh Bluetooth (261411466).jpg", width: 800, height: 532, description: "" },
  { file: "BluetoothUSB.jpg", width: 1600, height: 1200 },
];

const EXPLAINERS = [
  { match: "Two runes, merged", kind: "glyph-merge", mode: "tease" },
  { match: "Jim Kardach", kind: "name-card", lines: [{ text: "Jim Kardach, Intel" }] },
  { match: "unite PCs and phones", kind: "unite", rows: [["Denmark", "Norway"], ["PCs", "Phones"]] },
  { match: "only a placeholder", kind: "shortlist", items: [{ name: "Bluetooth" }] },
  { match: "PAN was already everywhere", kind: "shortlist", struck: true, items: [{ name: "PAN", reject: "hits" }] },
  { match: "merges Harald's initials", kind: "glyph-merge", mode: "reveal" },
];

test("a four-photo slideshow of the Bluetooth Short is blocked, not scored 100", () => {
  const plan = TopicVisuals.buildVisualPlan(topic(), { claims: claims() }, STILLS, [], duration);
  const quality = TopicVisuals.evaluateVisualQuality(TopicVisuals.visualMetrics(plan, topic()));
  assert.strictEqual(quality.decision, "BLOCK");
  assert.ok(quality.reasons.some((reason) => /excessive duplicate visuals/.test(reason)), quality.reasons.join("; "));
  assert.ok(quality.reasons.some((reason) => /visual\/narration mismatch/.test(reason)), quality.reasons.join("; "));
  assert.ok(quality.score < 90);
});

test("explainer scenes become one animated shot per line and cover the payoff", () => {
  const withExplainers = topic({ explainerScenes: EXPLAINERS });
  const plan = TopicVisuals.buildVisualPlan(withExplainers, { claims: claims() }, STILLS.slice(0, 2), [], duration);
  const explainerShots = plan.filter((shot) => shot.type === "explainer");
  assert.strictEqual(explainerShots.length, 6);
  assert.strictEqual(new Set(explainerShots.map((shot) => shot.claimIndex)).size, 6);
  assert.ok(plan.every((shot) => shot.duration >= 0.6), "no sub-second flashes");
  const metrics = TopicVisuals.visualMetrics(plan, withExplainers);
  assert.strictEqual(metrics.payoffCovered, true);
  assert.ok(metrics.maxVisualUses <= 2);
});

test("stricter visual rules apply only to The Hidden Logic of Things", () => {
  const other = topic({ channel: "critical-thread" });
  const plan = TopicVisuals.buildVisualPlan(other, { claims: claims() }, STILLS, [], duration);
  const metrics = TopicVisuals.visualMetrics(plan, other);
  assert.strictEqual(metrics.strict, false);
  const quality = TopicVisuals.evaluateVisualQuality(metrics);
  assert.ok(!quality.reasons.some((reason) => /payoff line|slideshow|duplicate visuals/.test(reason)));
});

test("explainer specs match narration lines by text or claim index", () => {
  const specs = Explainers.forClaims(topic({ explainerScenes: [...EXPLAINERS, { claim: 0, kind: "name-card", lines: [] }, { match: "x", kind: "not-a-kind" }] }), claims());
  assert.strictEqual(specs[0].kind, "name-card");
  assert.strictEqual(specs[1].kind, "glyph-merge");
  assert.strictEqual(specs[2], null);
  assert.strictEqual(specs[7].mode, "reveal");
  assert.deepStrictEqual(Explainers.forClaims({}, claims()), new Array(8).fill(null));
});

test("rendered package: unmeasured visual relevance is a hard fail, not a default 90", () => {
  const Quality = require("../../core/quality/behind-the-ordinary");
  const result = Quality.evaluatePackage({ topic: { productionReady: true, researchStatus: "VERIFIED", payoff: "x", visualPotential: { score: 95 } },
    script: { spoken: "x", claims: [] }, render: { completed: true, audio: {}, video: {}, thumbnail: {} }, renderVisuals: {}, metadata: { description: "" } });
  assert.strictEqual(result.components.visualRelevance, 0);
  assert.ok(result.hardFails.some((reason) => /visualRelevance 0/.test(reason)));
});

test("The Hidden Logic of Things never inserts generic procedural filler", () => {
  const sparse = topic({ explainerScenes: EXPLAINERS, visualPotential: { scenes: ["a", "b", "c"] } });
  const plan = TopicVisuals.buildVisualPlan(sparse, { claims: claims() }, STILLS.slice(0, 2), [], duration);
  assert.ok(plan.every((shot) => shot.type !== "procedural"), plan.map((shot) => shot.type).join(","));
});
