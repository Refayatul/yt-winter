"use strict";

function plan(topic, script) {
  const priority = ["official-scientific-media", "scientific-diagram", "public-domain-astronomy", "procedural-simulation", "labelled-ai-illustration", "relevant-stock"];
  return script.claims.map((claim, index) => ({
    scene: index + 1,
    start: claim.start,
    end: claim.end,
    sourcePriority: priority[Math.min(index, priority.length - 1)],
    subject: topic.visualPotential.scenes[index % topic.visualPotential.scenes.length],
    evidenceLabel: claim.layer === "SPECULATIVE SCENARIO" ? "ILLUSTRATION" : claim.layer,
    changeRequiredWithinSeconds: 3.5,
  }));
}

function thumbnail(topic) {
  return { subject: topic.visualPotential.scenes[0], impossibleVisual: topic.scenarioChange, text: [], maxWords: 3, palette: ["#030712", "#25d9ff", "#b9eaff", "#ffffff"], clutter: false };
}

module.exports = { plan, thumbnail };
