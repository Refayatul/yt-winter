"use strict";

function plan(topic, script) {
  if (topic.channel === "critical-thread") {
    const priority = ["government-technical-media", "manufacturer-technical-material", "standards-diagram", "procedural-system-map", "labelled-technical-illustration", "licensed-industrial-footage"];
    return script.claims.map((claim, index) => ({
      scene: index + 1, start: claim.start, end: claim.end,
      sourcePriority: priority[Math.min(index, priority.length - 1)],
      subject: topic.visualPotential.scenes[index % topic.visualPotential.scenes.length],
      evidenceLabel: claim.layer === "MODEL" || claim.layer === "HYPOTHESIS" ? "MODEL / ILLUSTRATION" : claim.layer,
      changeRequiredWithinSeconds: 3.5,
    }));
  }
  if (topic.channel === "behind-the-ordinary") {
    const priority = ["licensed-object-photography", "macro-detail-photography", "manufacturer-archive", "standards-diagram", "labelled-technical-illustration", "object-in-use"];
    const visualType = ["real footage or photography", "macro/detail shot", "archival or manufacturer material", "diagram/cutaway", "clean 2D animation", "real object in use"];
    const facts = topic.facts || [];
    const explainers = require("../rendering/explainers").forClaims(topic, script.claims);
    const sceneFor = (index) => topic.visualPotential.scenes[index % topic.visualPotential.scenes.length];
    return script.claims.map((claim, index) => ({
      scene: index + 1, start: claim.start, end: claim.end,
      timestamp: `${claim.start.toFixed(1)}–${claim.end.toFixed(1)}s`,
      duration: Math.round((claim.end - claim.start) * 10) / 10,
      narration: claim.text,
      visualObjective: index === 0
        ? `Show ${topic.canonicalTopic || topic.object} and isolate ${topic.designDetail} immediately.`
        : `Make the viewer understand this claim: ${claim.text}`,
      visualType: explainers[index] ? `clean 2D animation (${explainers[index].kind})` : visualType[Math.min(index, visualType.length - 1)],
      sourcePriority: explainers[index] ? "drawn-explainer" : priority[Math.min(index, priority.length - 1)],
      subject: sceneFor(index),
      assetQuery: explainers[index] ? `drawn ${explainers[index].kind}: ${claim.text}` : `${topic.canonicalTopic || topic.object}: ${sceneFor(index)}`,
      assetSource: explainers[index] ? "rendered in-house from vectors (no external asset)" : `source from ${priority[Math.min(index, priority.length - 1)]}; reject unrelated filler`,
      explainer: explainers[index] ? explainers[index].kind : null,
      animationInstruction: explainers[index] ? `Animate the ${explainers[index].kind} in beats that follow the narration.` : index === 0 ? "Open on the real detail; add one restrained amber isolation marker." : index === 1 ? "Zoom to the relevant detail and add one concise label." : "Use motion, arrows or a cutaway only when they explain the narrated mechanism.",
      onScreenText: index === 0 ? (topic.thumbnailText || "").split(/\s+/).slice(0, 4).join(" ") : "",
      evidenceReference: (() => {
        const matched = facts.find((fact) => fact.role && claim.role && String(fact.role).toLowerCase() === String(claim.role).toLowerCase()) || facts[index] || null;
        return matched ? { claim: matched.claim, source: matched.source, url: matched.url || null } : null;
      })(),
      transition: index === 0 ? "hard open" : index === script.claims.length - 1 ? "resolve to the opening object for a clean payoff" : "motivated cut on the next explanatory beat",
      evidenceLabel: /ILLUSTRATION|MODEL/.test(claim.layer) ? "ILLUSTRATION" : claim.layer,
      changeRequiredWithinSeconds: 3,
    }));
  }
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
  if (topic.channel === "critical-thread") return {
    subject: topic.canonicalTopic,
    text: [topic.thumbnailText],
    maxWords: 3,
    palette: ["#07090d", "#c8ced8", "#d6ae5f", "#5aa9e6"],
    clutter: false,
    concepts: [
      { id: "critical-object", composition: `${topic.canonicalTopic} isolated against a dark technical field`, consequence: "faint global network" },
      { id: "system-map", composition: `${topic.canonicalTopic} centered inside a minimal dependency map`, consequence: "downstream nodes dimmed" },
      { id: "scale", composition: `extreme close view of ${topic.canonicalTopic}`, consequence: "small Earth silhouette" },
      { id: "failure", composition: `${topic.canonicalTopic} with one precise break or warning marker`, consequence: "restrained dark infrastructure" },
      { id: "replacement", composition: `${topic.canonicalTopic} beside an empty replacement outline`, consequence: "lead-time clock" },
    ],
  };
  if (topic.channel === "behind-the-ordinary") return {
    subject: topic.canonicalTopic || topic.object,
    text: [topic.thumbnailText].filter(Boolean),
    maxWords: 4,
    palette: ["#15130f", "#f3ead8", "#f2ad45", "#4eb3a5"],
    clutter: false,
    concepts: [
      { id: "single-object-detail", composition: `one ${topic.canonicalTopic} filling the frame`, consequence: `one amber marker on ${topic.designDetail}` },
      { id: "macro-purpose", composition: `macro crop of ${topic.designDetail}`, consequence: "rest of object softly out of focus" },
      { id: "then-now", composition: `clean two-panel historical and modern ${topic.canonicalTopic}`, consequence: `${topic.designDetail} aligned across both` },
      { id: "cutaway", composition: `labelled cutaway of ${topic.designDetail}`, consequence: "one teal motion or force arrow" },
      { id: "misconception", composition: `${topic.canonicalTopic} isolated on warm charcoal`, consequence: `wrong use dimmed, documented purpose highlighted` },
    ],
  };
  return { subject: topic.visualPotential.scenes[0], impossibleVisual: topic.scenarioChange, text: [], maxWords: 3, palette: ["#030712", "#25d9ff", "#b9eaff", "#ffffff"], clutter: false };
}

module.exports = { plan, thumbnail };
