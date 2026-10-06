"use strict";
// Autonomous writing stage: verified dossier -> hooks, script beats, graphic specs,
// titles, thumbnail concepts -> local gates -> targeted rewrite rounds.
// The model never sees a fact that is not in the dossier, and the code rejects any
// number it invents. Gates are never relaxed: after the rewrite limit the stage fails.

const fs = require("fs");
const path = require("path");
const LLM = require("./llm");
const T = require("../text");
const AI = require("../ai-patterns");
const Hooks = require("../hooks");
const Titles = require("../titles");
const Research = require("../research");
const { CHANNEL_DIR } = require("../config");

const prompt = (name) => fs.readFileSync(path.join(CHANNEL_DIR, "prompts", name), "utf8");
const BEAT_TYPES = ["hook", "setup", "evidence", "mystery", "proof", "mechanism", "mini-payoff", "turn", "caveat", "consequence", "payoff"];
const GRAPHIC_TYPES = ["chart", "diagram", "floor-plan", "price-animation", "receipt", "ui-callout", "filing-excerpt", "timeline", "comparison-panel", "map", "money-flow", "unit-economics", "typography", "animated-number"];

const SCRIPT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["hookCandidates", "beats", "graphics", "titleCandidates", "thumbnailCandidates", "learningValue"],
  properties: {
    hookCandidates: { type: "array", items: { type: "string" } },
    beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "text", "claimId"], properties: { id: { type: "string" }, type: { type: "string", enum: BEAT_TYPES }, text: { type: "string" }, claimId: { type: "string" } } } },
    graphics: { type: "array", items: { type: "object", additionalProperties: false, required: ["beatId", "type", "entities", "overlayText", "numbers", "evidenceClaimId"], properties: { beatId: { type: "string" }, type: { type: "string", enum: GRAPHIC_TYPES }, entities: { type: "array", items: { type: "string" } }, overlayText: { type: "string" }, numbers: { type: "array", items: { type: "string" } }, evidenceClaimId: { type: "string" } } } },
    titleCandidates: { type: "array", items: { type: "string" } },
    thumbnailCandidates: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "dominantObject", "text", "elementCount", "contradiction", "composition", "contrast", "numberShown"], properties: { id: { type: "string" }, dominantObject: { type: "string" }, text: { type: "string" }, elementCount: { type: "integer" }, contradiction: { type: "string" }, composition: { type: "string" }, contrast: { type: "string", enum: ["high", "medium", "low"] }, numberShown: { type: ["string", "null"] } } } },
    learningValue: { type: "string" },
  },
};

const LENGTH = { short: { min: 80, max: 130, text: "a 30-50 second Short: 80-130 words of narration in 5-7 beats (hook, proof, mechanism, mini-payoff, payoff)" }, long: { min: 450, max: 2600, text: "a long-form explainer. Write as long as the verified evidence supports and no longer: do not pad. 12-30 beats with real progression, mini-payoffs and one clear caveat beat" } };

function brief(topic, dossier, format) {
  const claims = [...dossier.claims, ...dossier.inferences].map((c) => ({ id: c.id, text: c.text, numbers: c.numbers || [], ours: !!c.basisClaimIds }));
  return `TOPIC: ${topic.topic}\nENTITY: ${topic.entity}\nTHESIS: ${dossier.thesis}\nANGLE: ${dossier.angle}\nFORMAT: ${LENGTH[format].text}\n\nVERIFIED CLAIMS AND OUR OWN ARITHMETIC (the ONLY facts you may use; "ours": true means say it is our math):\n${JSON.stringify(claims, null, 1)}\n\nSOURCE PUBLISHERS (for citing on screen): ${[...new Set(dossier.sources.map((s) => s.publisher))].join("; ")}\n\nProduce: >=6 hook candidates built on different mechanisms (contradiction, number, comparison, visual mystery, hidden incentive, financial paradox, consumer pain, question...), the beats (each beat's claimId must be one of the ids above), one or more graphics per beat, >=22 title candidates that the claims actually support (do not promise more than the evidence shows), 3 thumbnail concepts (<=3 elements, one dominant object, <=4 words, number only if in the claims), and learningValue (what we would learn if this performs well or badly).`;
}

function check(out, dossier, format) {
  const issues = [];
  const beats = out.beats || [];
  const script = beats.map((b) => b.text).join(" ");
  const words = T.words(script).length; const L = LENGTH[format];
  if (words < L.min) issues.push(`script is ${words} words: too short for a ${format} (min ${L.min})`);
  if (words > L.max) issues.push(`script is ${words} words: too long for a ${format} (max ${L.max})`);
  const ids = new Set([...dossier.claims, ...dossier.inferences].map((c) => c.id));
  for (const b of beats) if (!ids.has(b.claimId)) issues.push(`beat ${b.id} cites unknown claim id "${b.claimId}"`);
  if (!beats.length || beats[0].type !== "hook") issues.push("the first beat must be type hook");
  const ai = AI.analyze(script);
  if (ai.aiPatternScore >= 35) issues.push(`generic AI writing: pattern score ${ai.aiPatternScore} (>=35). Fix: ${ai.findings.slice(0, 5).map((f) => f.name + (f.example ? ` ("${f.example}")` : "")).join("; ")}`);
  const sc = Research.unsupportedClaimsInScript(script, dossier);
  for (const o of sc.numbersWithoutDossierSupport.slice(0, 6)) issues.push(`number "${o.number}" is not in the dossier (sentence: "${o.sentence.slice(0, 90)}")`);
  const topicWords = T.contentWords(dossier.thesis || "");
  const hooks = Hooks.compete(out.hookCandidates || [], { topicWords });
  if (!hooks.valid) issues.push("hook candidates: " + hooks.problems.join("; "));
  if (hooks.winner && hooks.winner.score < 60) issues.push(`best hook scores ${hooks.winner.score} (<60): make the first seconds open an information gap with a concrete name/number`);
  if (beats[0] && hooks.winner && T.wordSetSimilarity(beats[0].text, hooks.winner.text) < 0.5) issues.push("the first beat must be the winning hook (same wording): hook=\"" + hooks.winner.text.slice(0, 90) + "\"");
  const titles = new Set((out.titleCandidates || []).map((t) => t.trim()).filter(Boolean));
  if (titles.size < 20) issues.push(`only ${titles.size} distinct title candidates (need >=20)`);
  if ((out.thumbnailCandidates || []).length < 3) issues.push("need 3 thumbnail concepts");
  const covered = new Set((out.graphics || []).map((g) => g.beatId));
  const missing = beats.filter((b) => !covered.has(b.id)).map((b) => b.id);
  if (missing.length) issues.push(`beats without a graphic: ${missing.join(", ")}`);
  return { issues, words, aiPatternScore: ai.aiPatternScore, hookWinner: hooks.winner && hooks.winner.text };
}

function toBundle(topic, dossier, out, format, dossierFile) {
  const graphicSpecs = {};
  (out.graphics || []).forEach((g, i) => { (graphicSpecs[g.beatId] = graphicSpecs[g.beatId] || []).push({ type: g.type, entities: g.entities, overlayText: g.overlayText, numbers: g.numbers, evidenceClaimId: g.evidenceClaimId, asset: `graphic:${g.beatId}-${g.type}-${i + 1}` }); });
  const winner = Hooks.compete(out.hookCandidates, { topicWords: T.contentWords(dossier.thesis) }).winner;
  const claimTexts = [...dossier.claims, ...dossier.inferences].map((c) => c.text).concat([dossier.thesis]);
  const ranked = Titles.rankTitles(out.titleCandidates, { claims: claimTexts, brand: topic.entity });
  return {
    id: `auto-${format}-${T.slugify(topic.topic).slice(0, 48)}`, format, dossierFile,
    topic: { id: topic.id, topic: topic.topic, entity: topic.entity, pillar: topic.pillar, viralMechanism: topic.viralMechanism },
    learningValue: out.learningValue, selectedTitle: ranked.selected ? ranked.selected.title : null,
    hookCandidates: out.hookCandidates, beats: out.beats.map((b) => ({ id: b.id, type: b.type, text: b.text, claimId: b.claimId })), graphicSpecs,
    titleCandidates: out.titleCandidates, thumbnailCandidates: out.thumbnailCandidates.map((t) => ({ ...t, brandLogo: false, face: false })), history: [], competitorTranscripts: [], gap: { status: "UNKNOWN", reasonToExist: false },
    authoring: { stage: "auto", model: LLM.MODEL(), winningHook: winner && winner.text },
  };
}

async function write(topic, dossier, format, deps = {}) {
  const client = deps.client || LLM.createClient(); const ledger = deps.ledger || LLM.newLedger();
  const maxRounds = deps.maxRounds == null ? 2 : deps.maxRounds;
  const messages = [{ role: "user", content: brief(topic, dossier, format) }];
  let out = null, result = null; const history = [];
  for (let round = 0; round <= maxRounds; round += 1) {
    const r = await LLM.run({ client, ledger, system: prompt("system.md") + "\n\n" + prompt("script.md"), messages, schema: SCRIPT_SCHEMA, maxTokens: format === "short" ? 16000 : 48000, effort: "high" });
    out = r.json; result = check(out, dossier, format); history.push({ round, issues: result.issues.length, words: result.words, aiPatternScore: result.aiPatternScore });
    if (!result.issues.length) return { status: "ok", out, check: result, rounds: history, ledger };
    if (round === maxRounds) break;
    messages.push({ role: "assistant", content: JSON.stringify(out) }, { role: "user", content: `Your draft failed these checks. Fix exactly these problems, keep everything that passed, and return the full JSON again:\n- ${result.issues.join("\n- ")}` });
  }
  return { status: "script-failed", out, check: result, rounds: history, reasons: result.issues, ledger };
}

module.exports = { write, check, toBundle, brief, SCRIPT_SCHEMA, BEAT_TYPES, GRAPHIC_TYPES, LENGTH };
