"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "core", "rendering", "topic-visuals.js");
let src = fs.readFileSync(file, "utf8");

function replaceOnce(before, after, label) {
  if (src.includes(after)) return;
  const count = src.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one source match, got ${count}`);
  src = src.replace(before, after);
}

replaceOnce(
`    mechanism: semanticFieldTerms(topic && topic.mechanism),
    openingClaim: semanticFieldTerms(shot && (shot.claimText || shot.scene)),`,
`    mechanism: semanticFieldTerms(topic && (topic.mechanism || topic.scientificMechanism)),
    scenario: semanticFieldTerms(topic && (topic.scenario || topic.scenarioChange || topic.event)),
    openingLine: semanticFieldTerms(topic && topic.openingLine),
    openingClaim: semanticFieldTerms(shot && (shot.claimText || shot.scene)),`,
"raw IB semantic fields"
);
replaceOnce(
`  const subjectMatch = matches.subject.length > 0 || matches.canonicalTopic.length > 0;
  const mechanismMatch = matches.mechanism.length > 0;
  const designDetailMatch = matches.designDetail.length > 0;
  const claimMatch = matches.openingClaim.length > 0;
  const strongTerms = [...new Set([...matches.subject, ...matches.canonicalTopic, ...matches.mechanism, ...matches.designDetail])];`,
`  const subjectMatch = matches.subject.length > 0 || matches.canonicalTopic.length > 0 || matches.scenario.length > 0;
  const mechanismMatch = matches.mechanism.length > 0;
  const designDetailMatch = matches.designDetail.length > 0;
  const claimMatch = matches.openingClaim.length > 0 || matches.openingLine.length > 0;
  const strongTerms = [...new Set([...matches.subject, ...matches.canonicalTopic, ...matches.mechanism, ...matches.designDetail, ...matches.scenario])];`,
"semantic match strength"
);
replaceOnce(
`  const plan = [];

  const nextStill = () => {`,
`  const plan = [];
  const distinctKeys = () => new Set(plan.map((shot) => shot.visualKey || shot.sourceId));

  const nextStill = () => {`,
"visual diversity counter"
);
replaceOnce(
`    else if (ordered.length && nextStill()) type = "licensed-still";
    else if (cardAllowed) type = "number-card";
    else type = "procedural";

    // A picture the viewer has already seen reads as a slideshow.`,
`    else if (ordered.length && nextStill()) type = "licensed-still";
    else if (cardAllowed) type = "number-card";
    else type = "procedural";

    // A sparse licensed pool must not become an alternating two-image
    // slideshow. Once reuse would begin, scene-specific procedural frames add
    // genuine visual changes until the minimum variety gate can be reached.
    if (type === "licensed-still") {
      const candidate = nextStill();
      const reused = candidate && (stillUses.get(candidate.file) || 0) > 0;
      if (reused && distinctKeys().size < 5 && scenes.length) type = "procedural";
    }

    // A picture the viewer has already seen reads as a slideshow.`,
"sparse still diversification"
);
replaceOnce(
`  // Never at the cost of variety: the visual gate needs 5 distinct visuals.
  const key = (shot) => shot.visualKey || shot.sourceId;
  if (new Set(plan.slice(0, -1).map(key)).size < 5) return plan;
  if (first.type === "stock-video") {`,
`  // Never at the cost of variety: the visual gate needs 5 distinct visuals.
  const key = (shot) => shot.visualKey || shot.sourceId;
  if (new Set(plan.slice(0, -1).map(key)).size < 5) return plan;
  // Do not turn the final two segments into one long static hold by looping
  // back to the same source already used by the penultimate segment.
  const penultimate = plan[plan.length - 2];
  if (penultimate && key(penultimate) === key(first)) return plan;
  if (first.type === "stock-video") {`,
"loopback static-hold guard"
);

fs.writeFileSync(file, src);
console.log("Applied final render-quality fixes to core/rendering/topic-visuals.js");
