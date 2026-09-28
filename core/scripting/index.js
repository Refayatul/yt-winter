"use strict";

const FORBIDDEN_OPENINGS = /^(did you know|imagine|today we will|in this video|scientists say|welcome)/i;

function titleSubject(topic) {
  return topic.topic.replace(/^What If /i, "").replace(/\?$/, "");
}

function titleCandidates(topic) {
  if (topic.channel === "critical-thread") return criticalThreadTitles(topic);
  const subject = titleSubject(topic);
  const base = topic.topic.replace(/\?$/, "");
  const candidates = [
    topic.topic,
    `${base}: The First 60 Seconds`,
    `The First Thing to Change If ${subject}`,
    `${subject} — What Breaks First?`,
    `The Science of ${subject}`,
    `If ${subject}, This Happens First`,
    `${subject}: A Scientific Timeline`,
    `Could Earth Survive If ${subject}?`,
    `The Hidden Consequence of ${subject}`,
    `${subject}, Explained in 30 Seconds`,
    `One Second After ${subject}`,
    `Why ${subject} Changes Everything`,
    `${subject}: Known Science vs. Speculation`,
    `The Real Physics Behind ${subject}`,
    `How Fast Would ${subject} Affect Us?`,
    `${subject}: The Answer Is Not What Changes First`,
    `What Actually Happens When ${subject}?`,
    `${subject}: From First Effect to Final Outcome`,
    `The Most Likely Outcome If ${subject}`,
    `${subject} — The Scientific Answer`,
  ];
  return [...new Set(candidates)].slice(0, 20);
}

function criticalThreadTitles(topic) {
  const subject = topic.canonicalTopic;
  const dependency = topic.category.toLowerCase();
  const candidates = [
    topic.topic,
    `Why ${subject} Is So Hard to Replace`,
    `The World Quietly Depends on ${subject}`,
    `Inside ${subject}: The Hidden Bottleneck`,
    `What Fails When ${subject} Stops`,
    `The Critical System Behind ${subject}`,
    `How ${subject} Holds Modern Infrastructure Together`,
    `${subject}: The Replacement Problem`,
    `The Fragile Chain Built Around ${subject}`,
    `Why There Is No Quick Substitute for ${subject}`,
    `The Hidden Dependency Inside ${dependency}`,
    `How ${subject} Became Critical Infrastructure`,
    `The Bottleneck Nobody Sees: ${subject}`,
    `What Modern Life Needs from ${subject}`,
    `The System That Cannot Pause: ${subject}`,
    `Where ${subject} Fits in the Global Supply Chain`,
    `Can We Replace ${subject} Fast Enough?`,
    `${subject}: Failure, Recovery and Redundancy`,
    `The Capacity Constraint Hidden in ${subject}`,
    `Why ${subject} Matters More Than It Looks`,
  ];
  return [...new Set(candidates)].slice(0, 20);
}

function shortScript(topic) {
  if (topic.channel === "critical-thread") {
    const claims = [
      { start: 0, end: 2, layer: "VERIFIED FACT", confidence: "VERIFIED FACT", text: topic.openingLine },
      { start: 2, end: 6, layer: "VERIFIED FACT", confidence: "VERIFIED FACT", text: topic.secondBeat },
      { start: 6, end: 18, layer: "VERIFIED FACT", confidence: "VERIFIED FACT", text: `${topic.canonicalTopic} occupies a specialized step in ${topic.category.toLowerCase()}, linking capacity, interfaces and operating knowledge.` },
      { start: 18, end: 29, layer: "MODEL", confidence: "MODEL", text: `If it disappears, capacity tightens first. Wider effects depend on inventories, qualified substitutes and recovery time.` },
      { start: 29, end: 36, layer: "VERIFIED FACT", confidence: "VERIFIED FACT", text: "Real resilience comes from spares, diversified capacity and recovery plans tested before the bottleneck fails." },
    ];
    const spoken = claims.map((claim) => claim.text).join(" ");
    return { format: "short", targetSeconds: 36, spoken, claims, forbiddenOpening: FORBIDDEN_OPENINGS.test(spoken), sourceIds: topic.sources.map((source) => source.name) };
  }
  const claims = [
    { start: 0, end: 1.5, layer: "SPECULATIVE SCENARIO", confidence: "SPECULATIVE", text: topic.openingLine || topic.hook.split(/(?<=[.!?])\s+/)[0] },
    { start: 1.5, end: 5, layer: "ESTIMATED CONSEQUENCE", confidence: "SUPPORTED", text: topic.secondBeat || `The first measurable change follows ${topic.scientificMechanism.split(",")[0]}.` },
    { start: 5, end: 18, layer: "KNOWN SCIENCE", confidence: "VERIFIED", text: `Known physics says the mechanism is ${topic.scientificMechanism}.` },
    { start: 18, end: 28, layer: "ESTIMATED CONSEQUENCE", confidence: "ESTIMATED", text: `The best supported consequence is this: ${topic.expectedConsequence}.` },
    { start: 28, end: 32, layer: "SPECULATIVE SCENARIO", confidence: "SPECULATIVE", text: "The exact timeline depends on how the impossible change occurs." },
  ];
  const spoken = claims.map((claim) => claim.text).join(" ");
  return { format: "short", targetSeconds: 32, spoken, claims, forbiddenOpening: FORBIDDEN_OPENINGS.test(spoken), sourceIds: topic.sources.map((source) => source.name) };
}

function longFormOutline(topic) {
  if (topic.channel === "critical-thread") return {
    format: "long",
    targetMinutes: topic.longFormPotential.targetMinutes,
    coldOpen: topic.openingLine,
    centralDependencyQuestion: topic.coreQuestion,
    sections: ["Cold open", "Central dependency question", "Technical explanation", "Supply chain and system map", "Bottleneck", "Failure consequences", "Resilience and alternatives", "Conclusion and sources"]
      .map((section, index) => ({ order: index + 1, section, evidence: index < 4 ? "VERIFIED FACT" : index < 7 ? "MODEL" : "VERIFIED FACT" })),
    sources: topic.sources,
    evidence: topic.researchEvidence || [],
    visualPlan: topic.visualPotential.scenes,
    titleCandidates: criticalThreadTitles(topic),
    thumbnailConceptRequirement: "five distinct concepts in thumbnail.json",
    standaloneShorts: longToShortFactory(topic),
  };
  return ["Cold open", "Scenario definition", "Initial consequence", "Science mechanism", "Simulation timeline", "Secondary consequences", "Survival and real-world implications", "Final answer"]
    .map((section, index) => ({ order: index + 1, section, evidence: index === 1 ? "SPECULATIVE SCENARIO" : index < 4 ? "KNOWN SCIENCE" : "ESTIMATED CONSEQUENCE" }));
}

function longToShortFactory(topic) {
  if (topic.channel !== "critical-thread") return [];
  return [
    { angle: "hidden dependency", hook: topic.openingLine },
    { angle: "mechanism", hook: `How ${topic.canonicalTopic} actually works inside ${topic.category.toLowerCase()}.` },
    { angle: "bottleneck", hook: `Why replacing ${topic.canonicalTopic} is not a simple procurement problem.` },
    { angle: "resilience", hook: `The backup plan for ${topic.canonicalTopic} starts long before failure.` },
  ];
}

module.exports = { FORBIDDEN_OPENINGS, titleCandidates, criticalThreadTitles, shortScript, longFormOutline, longToShortFactory };
