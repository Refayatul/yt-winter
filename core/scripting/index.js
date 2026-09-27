"use strict";

const FORBIDDEN_OPENINGS = /^(did you know|imagine|today we will|in this video|scientists say|welcome)/i;

function titleSubject(topic) {
  return topic.topic.replace(/^What If /i, "").replace(/\?$/, "");
}

function titleCandidates(topic) {
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

function shortScript(topic) {
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
  return ["Cold open", "Scenario definition", "Initial consequence", "Science mechanism", "Simulation timeline", "Secondary consequences", "Survival and real-world implications", "Final answer"]
    .map((section, index) => ({ order: index + 1, section, evidence: index === 1 ? "SPECULATIVE SCENARIO" : index < 4 ? "KNOWN SCIENCE" : "ESTIMATED CONSEQUENCE" }));
}

module.exports = { FORBIDDEN_OPENINGS, titleCandidates, shortScript, longFormOutline };
