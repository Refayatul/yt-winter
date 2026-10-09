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

const BEAT_ITEM = { type: "object", additionalProperties: false, required: ["id", "type", "text", "claimId"], properties: { id: { type: "string" }, type: { type: "string", enum: BEAT_TYPES }, text: { type: "string" }, claimId: { type: "string" }, section: { type: "string" } } };
const GRAPHIC_ITEM = { type: "object", additionalProperties: false, required: ["beatId", "type", "entities", "overlayText", "numbers", "evidenceClaimId"], properties: { beatId: { type: "string" }, type: { type: "string", enum: GRAPHIC_TYPES }, entities: { type: "array", items: { type: "string" } }, overlayText: { type: "string" }, numbers: { type: "array", items: { type: "string" } }, evidenceClaimId: { type: "string" } } };

const SCRIPT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["hookCandidates", "beats", "graphics", "titleCandidates", "thumbnailCandidates", "learningValue"],
  properties: {
    hookCandidates: { type: "array", items: { type: "string" } },
    beats: { type: "array", items: BEAT_ITEM },
    graphics: { type: "array", items: GRAPHIC_ITEM },
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

// options.winningHook: the hook chosen by hook engineering (develop()); options.words: [min, max] for a target duration.
function check(out, dossier, format, options = {}) {
  const issues = [];
  const beats = out.beats || [];
  const script = beats.map((b) => b.text).join(" ");
  const words = T.words(script).length; const L = options.words ? { min: options.words[0], max: options.words[1] } : LENGTH[format];
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
  const opener = options.winningHook || (hooks.winner && hooks.winner.text);
  if (beats[0] && opener && T.wordSetSimilarity(beats[0].text, opener) < 0.5) issues.push("the first beat must be the winning hook (same wording): hook=\"" + opener.slice(0, 90) + "\"");
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

// =====================================================================================================
// Phase 3: staged story development (develop). Reuses the gates above; adds a story plan, hook
// engineering, an independent editorial critique and targeted rewrites, with a disk cache and a shared,
// prompt-cached prefix (system + dossier) so the stages do not pay for the same input twice.
//   1 research verification (existing gate)  2 thesis + 3 conflict + 4 hooks + 5 structure (one PLAN call)
//   6 script (DRAFT)  7 independent critique (CRITIQUE, fresh context)  8 targeted rewrite (REWRITE)
//   9 final assessment (local gates + retention critic + spoken naturalness + hook engineering)
// =====================================================================================================
const crypto = require("crypto");
const Retention = require("../retention");

const PURPOSES = ["hook", "setup", "question", "evidence", "mechanism", "complication", "turn", "consequence", "caveat", "payoff"];
const STORY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["thesis", "centralQuestion", "conflict", "misconception", "originalAngle", "hookCandidates", "questions", "sections", "payoff", "caveats"],
  properties: {
    thesis: { type: "string" }, centralQuestion: { type: "string" }, misconception: { type: "string" }, originalAngle: { type: "string" }, payoff: { type: "string" },
    conflict: { type: "object", additionalProperties: false, required: ["wants", "obstacle", "stakes"], properties: { wants: { type: "string" }, obstacle: { type: "string" }, stakes: { type: "string" } } },
    hookCandidates: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "mechanism"], properties: { text: { type: "string" }, mechanism: { type: "string", enum: Hooks.MECHANISMS } } } },
    questions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } } },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "purpose", "claimIds", "raises", "resolves", "visualIdea"], properties: { id: { type: "string" }, title: { type: "string" }, purpose: { type: "string", enum: PURPOSES }, claimIds: { type: "array", items: { type: "string" } }, raises: { type: "array", items: { type: "string" } }, resolves: { type: "array", items: { type: "string" } }, visualIdea: { type: "string" } } } },
    caveats: { type: "array", items: { type: "string" } },
  },
};
const PROBLEM_TYPES = ["factual", "story", "attention", "voice", "hook", "payoff", "repetition", "forced-drama", "clarity"];
const CRITIQUE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "problems", "keep", "automatedReadingsDisputed"],
  properties: {
    verdict: { type: "string", enum: ["ready", "revise"] },
    problems: { type: "array", items: { type: "object", additionalProperties: false, required: ["section", "beatIds", "type", "severity", "quote", "fix"], properties: { section: { type: "string" }, beatIds: { type: "array", items: { type: "string" } }, type: { type: "string", enum: PROBLEM_TYPES }, severity: { type: "string", enum: ["high", "medium", "low"] }, quote: { type: "string" }, fix: { type: "string" } } } },
    keep: { type: "array", items: { type: "string" } },
    automatedReadingsDisputed: { type: "array", items: { type: "string" } },
  },
};
const REWRITE_SCHEMA = { type: "object", additionalProperties: false, required: ["beats", "graphics", "changeLog"], properties: { beats: { type: "array", items: BEAT_ITEM }, graphics: { type: "array", items: GRAPHIC_ITEM }, changeLog: { type: "array", items: { type: "string" } } } };

// Long-form length from a target duration (narration ~130-160 words per minute).
const wordsFor = (format, minutes) => (format === "short" ? [LENGTH.short.min, LENGTH.short.max] : [Math.round(minutes[0] * 130), Math.round(minutes[1] * 160)]);

// ---- cache ------------------------------------------------------------------------------------------
const PROMPT_FILES = ["system.md", "story.md", "script.md", "editor.md"];
const hash = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 24);
function promptVersion() { return hash(PROMPT_FILES.map((f) => { try { return prompt(f); } catch (e) { return ""; } }).join("\n")); }
function stageCache(dir) {
  if (dir === false) return { get: () => null, set: () => {}, hits: 0 };
  const root = dir || path.join(CHANNEL_DIR, "state", "story-cache");
  const c = { hits: 0, get(key) { try { const v = JSON.parse(fs.readFileSync(path.join(root, key + ".json"), "utf8")); c.hits += 1; return v; } catch (e) { return null; } }, set(key, v) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, key + ".json"), JSON.stringify(v, null, 1) + "\n"); } };
  return c;
}

// ---- shared prefix: system + dossier (prompt-cached across stages) ---------------------------------
function dossierBlock(topic, dossier, format, ctx = {}) {
  const src = Object.fromEntries((dossier.sources || []).map((x) => [x.id, x]));
  const claims = (dossier.claims || []).map((c) => ({ id: c.id, central: !!c.central, text: c.text, numbers: c.numbers || [], sources: (c.sourceIds || []).map((id) => src[id] ? `${src[id].publisher} (${src[id].type}${src[id].date ? ", " + src[id].date : ""})` : id) }));
  const ours = (dossier.inferences || []).map((c) => ({ id: c.id, text: c.text, numbers: c.numbers || [], ourArithmetic: true, basis: c.basisClaimIds }));
  const comp = (ctx.competitors || []).map((c) => `- ${c.channel}: "${c.title}" (${c.views != null ? c.views.toLocaleString("en-US") + " views" : "views unknown"}${c.age ? ", " + c.age : ""}). Covers: ${(c.covers || []).join("; ") || "unknown"}. Misses: ${(c.misses || []).join("; ") || "unknown"}`).join("\n");
  return [
    `TOPIC: ${topic.topic}`, `ENTITY: ${topic.entity}`, `RESEARCH THESIS: ${dossier.thesis}`, `RESEARCH ANGLE: ${dossier.angle || ""}`,
    "", "VERIFIED CLAIMS (the only facts that exist for this film; 'ourArithmetic' must be said to be our own calculation):", JSON.stringify(claims.concat(ours), null, 1),
    "", "CONTRADICTIONS AND LIMITS FOUND IN RESEARCH:", JSON.stringify(dossier.contradictions || [], null, 1),
    comp ? "\nCOMPETITOR COVERAGE (do not copy; find what they leave out):\n" + comp : "",
  ].join("\n");
}
function stageMessages(topic, dossier, format, ctx, stageText) {
  return [{ role: "user", content: [{ type: "text", text: dossierBlock(topic, dossier, format, ctx), cache_control: { type: "ephemeral" } }, { type: "text", text: stageText }] }];
}

// ---- deterministic assessment (used after every writing stage) --------------------------------------
function assess(out, dossier, format, ctx = {}) {
  const beats = out.beats || [];
  const script = beats.map((b) => b.text).join(" ");
  const hookRows = Hooks.engineer(ctx.hookCandidates || out.hookCandidates || [], { dossier, topicWords: T.contentWords(dossier.thesis || "") });
  const local = check(out, dossier, format, { winningHook: ctx.winningHook || (hookRows.winner && hookRows.winner.text), words: ctx.words });
  const retention = Retention.critique(beats, { plan: ctx.plan, format, title: ctx.title || "" });
  const spoken = AI.spoken(script);
  const editorial = Retention.editorialReport(beats, { plan: ctx.plan, dossier, format, title: ctx.title || "" });
  const blocking = [...local.issues];
  for (const g of retention.global.filter((x) => x.severity === "high")) blocking.push(`retention: ${g.type}: ${g.evidence}. Fix: ${g.recommendation}`);
  for (const sec of retention.sections) for (const i of sec.issues.filter((x) => x.severity === "high")) blocking.push(`retention (${sec.id}): ${i.type}: ${i.evidence}. Fix: ${i.recommendation}`);
  if (spoken.score < 75) blocking.push(`spoken naturalness ${spoken.score} (<75): ${spoken.findings.slice(0, 4).map((f) => f.name + (f.sentence ? ` ("${f.sentence.slice(0, 60)}")` : f.detail ? ` (${f.detail})` : "")).join("; ")}`);
  return { blocking, local, retention, spoken, editorial, hooks: { winner: hookRows.winner, ranked: hookRows.ranked, problems: hookRows.problems } };
}

function evaluatePlan(plan, dossier) {
  const issues = [];
  const ids = new Set([...(dossier.claims || []), ...(dossier.inferences || [])].map((c) => c.id));
  const qids = new Set((plan.questions || []).map((q) => q.id));
  const raised = new Map(); const resolved = new Map();
  (plan.sections || []).forEach((s, i) => {
    for (const c of s.claimIds || []) if (!ids.has(c)) issues.push(`section ${s.id} uses unknown claim id "${c}"`);
    for (const q of s.raises || []) { if (!qids.has(q)) issues.push(`section ${s.id} raises unknown question "${q}"`); raised.set(q, i); }
    for (const q of s.resolves || []) resolved.set(q, i);
  });
  for (const [q, i] of raised) if (!resolved.has(q) || resolved.get(q) < i) issues.push(`question ${q} is raised but never resolved later`);
  const used = new Set((plan.sections || []).flatMap((s) => s.claimIds || []));
  for (const c of (dossier.claims || []).filter((x) => x.central)) if (!used.has(c.id)) issues.push(`central claim ${c.id} is not used by any section`);
  const purposes = (plan.sections || []).map((s) => s.purpose);
  if (!purposes.some((p) => ["complication", "turn"].includes(p))) issues.push("no complication or turn section");
  if (purposes[purposes.length - 1] !== "payoff") issues.push("the last section must be the payoff");
  if (!purposes.includes("caveat")) issues.push("no caveat section (state the limits of the evidence)");
  const hooks = Hooks.engineer(plan.hookCandidates || [], { dossier, topicWords: T.contentWords(dossier.thesis || "") });
  for (const pr of hooks.problems) issues.push("hooks: " + pr);
  return { issues, hooks };
}

// A cached stage never creates a client: re-running a fully cached story costs nothing and needs no key.
async function stage(name, opts, getClient, cache, key) {
  const hit = cache.get(key);
  if (hit) return { json: hit, cached: true };
  const r = await LLM.run({ ...opts, client: getClient(), stage: name });
  cache.set(key, r.json);
  return { json: r.json, cached: false };
}

// deps: { client, ledger, cacheDir (false disables), competitors, minutes [min,max], maxRewrites, criticModel }
async function develop(topic, dossier, format, deps = {}) {
  const ledger = deps.ledger || LLM.newLedger(); const cache = stageCache(deps.cacheDir);
  const minutes = deps.minutes || [8, 12]; const words = wordsFor(format, minutes);
  const maxRewrites = deps.maxRewrites == null ? 2 : deps.maxRewrites;
  const log = [];
  // 1. Research verification: the existing gate decides; nothing is written on an unverified dossier.
  const gate = Research.gate(dossier, { format });
  if (!gate.pass) return { status: "research-failed", reasons: gate.rejections, ledger, log };
  let client = deps.client;
  const getClient = () => (client = client || LLM.createClient());
  const system = prompt("system.md");
  const ctx = { competitors: deps.competitors || [] };
  const base = { dossier: hash(dossier), topic: topic.id, format, words, prompts: promptVersion(), model: LLM.MODEL() };
  // 2-5. Story plan: thesis, conflict, hooks, structure (one call; one repair round if the plan fails its checks).
  let planMsgs = stageMessages(topic, dossier, format, ctx, prompt("story.md") + `\n\nFORMAT: ${format === "short" ? "a 35-45 second Short (one question, one turn, one payoff)" : `a ${minutes[0]}-${minutes[1]} minute documentary (${words[0]}-${words[1]} words of narration)`}. Return the plan as JSON.`);
  let plan = (await stage("plan", { ledger, system, messages: planMsgs, schema: STORY_SCHEMA, maxTokens: 16000, effort: "high" }, getClient, cache, hash({ ...base, s: "plan" }))).json;
  let pe = evaluatePlan(plan, dossier); log.push({ stage: "plan", issues: pe.issues.length });
  if (pe.issues.length) {
    planMsgs = [...planMsgs, { role: "assistant", content: JSON.stringify(plan) }, { role: "user", content: "The plan failed these checks. Fix exactly these and return the full JSON:\n- " + pe.issues.join("\n- ") }];
    plan = (await stage("plan", { ledger, system, messages: planMsgs, schema: STORY_SCHEMA, maxTokens: 16000, effort: "high" }, getClient, cache, hash({ ...base, s: "plan-fix", plan }))).json;
    pe = evaluatePlan(plan, dossier); log.push({ stage: "plan-fix", issues: pe.issues.length });
    if (pe.issues.length) return { status: "plan-failed", reasons: pe.issues, plan, ledger, log };
  }
  const hookTexts = plan.hookCandidates.map((h) => h.text); const winningHook = pe.hooks.winner.text;
  // 6. Draft.
  const draftText = prompt("script.md") + `\n\nSTAGE: DRAFT. Write the narration for this approved plan.\nAPPROVED PLAN:\n${JSON.stringify(plan, null, 1)}\n\nWINNING HOOK (first beat, same wording): ${winningHook}\nLENGTH: ${words[0]}-${words[1]} words of narration. Tag each beat with its section id. hookCandidates: return the plan's hook texts unchanged. Produce graphics for every beat, >=22 truthful title candidates, 3 thumbnail concepts and learningValue.`;
  let out = (await stage("draft", { ledger, system, messages: stageMessages(topic, dossier, format, ctx, draftText), schema: SCRIPT_SCHEMA, maxTokens: format === "short" ? 16000 : 48000, effort: "high" }, getClient, cache, hash({ ...base, s: "draft", plan }))).json;
  out = { ...out, hookCandidates: hookTexts };
  const actx = { plan, winningHook, hookCandidates: plan.hookCandidates, words, title: topic.topic };
  let a = assess(out, dossier, format, actx); log.push({ stage: "draft", blocking: a.blocking.length, words: a.local.words, retention: a.retention.score, spoken: a.spoken.score });
  const draft = { out, assessment: a };
  // 7. Independent critique: fresh context (no drafting conversation), automated readings attached.
  const readings = { retention: { score: a.retention.score, global: a.retention.global, weakest: a.retention.weakest, sections: a.retention.sections.map((x) => ({ id: x.id, score: x.score, issues: x.issues })) }, spoken: { score: a.spoken.score, findings: a.spoken.findings.slice(0, 12) }, aiPatternScore: a.local.aiPatternScore, localChecks: a.local.issues, hooks: a.hooks.ranked.map((h) => ({ text: h.text, total: h.total, factual: h.factual })) };
  const critText = prompt("editor.md") + `\n\nSTORY PLAN:\n${JSON.stringify({ thesis: plan.thesis, centralQuestion: plan.centralQuestion, sections: plan.sections.map((x) => ({ id: x.id, title: x.title, purpose: x.purpose })), payoff: plan.payoff }, null, 1)}\n\nSCRIPT BEATS:\n${JSON.stringify(out.beats, null, 1)}\n\nAUTOMATED READINGS (heuristics):\n${JSON.stringify(readings, null, 1)}`;
  const critique = (await stage("critique", { ledger, system, messages: stageMessages(topic, dossier, format, ctx, critText), schema: CRITIQUE_SCHEMA, maxTokens: 16000, effort: "medium", model: deps.criticModel || process.env.PD_AUTO_CRITIC_MODEL || undefined }, getClient, cache, hash({ ...base, s: "critique", beats: out.beats }))).json;
  log.push({ stage: "critique", verdict: critique.verdict, problems: critique.problems.length });
  // 8. Targeted rewrites: only the problems found; titles, thumbnails and unchanged graphics are kept.
  let rounds = 0; const changes = [];
  let problems = [...critique.problems.map((x) => `[${x.severity}] ${x.section} ${x.beatIds.join(",")}: ${x.type}: "${x.quote}" -> ${x.fix}`), ...a.blocking];
  while ((critique.verdict === "revise" || a.blocking.length) && problems.length && rounds < maxRewrites) {
    rounds += 1;
    const rwText = prompt("script.md") + `\n\nSTAGE: TARGETED REWRITE ${rounds}. Fix exactly these problems and nothing else. Keep beat ids for beats you keep; new beats need new ids and a graphic. Keep the winning hook as the first beat. Keep: ${critique.keep.join("; ") || "everything that is not listed"}.\nPROBLEMS:\n- ${problems.join("\n- ")}\n\nCURRENT BEATS:\n${JSON.stringify(out.beats, null, 1)}\n\nReturn all beats (rewritten and unchanged), graphics only for new or changed beats, and a changeLog.`;
    const rw = (await stage("rewrite", { ledger, system, messages: stageMessages(topic, dossier, format, ctx, rwText), schema: REWRITE_SCHEMA, maxTokens: format === "short" ? 16000 : 48000, effort: "high" }, getClient, cache, hash({ ...base, s: "rewrite", beats: out.beats, problems }))).json;
    const keepGraphics = (out.graphics || []).filter((g) => rw.beats.some((b) => b.id === g.beatId) && !rw.graphics.some((n) => n.beatId === g.beatId));
    out = { ...out, beats: rw.beats, graphics: [...keepGraphics, ...rw.graphics] };
    changes.push(...rw.changeLog);
    a = assess(out, dossier, format, actx); log.push({ stage: "rewrite-" + rounds, blocking: a.blocking.length, retention: a.retention.score, spoken: a.spoken.score });
    problems = a.blocking; // later rounds are targeted at what the deterministic checks still find
    if (!problems.length) break;
  }
  // 9. Final assessment.
  const status = a.blocking.length ? "script-failed" : "ok";
  return { status, plan, draft, critique, out, assessment: a, changes, rounds, reasons: a.blocking, winningHook, ledger, cacheHits: cache.hits, log };
}

// Bundle for the existing production pipeline, plus the story artefacts for human review.
function bundleFromStory(topic, dossier, res, format, dossierFile) {
  const b = toBundle(topic, dossier, res.out, format, dossierFile);
  b.authoring = { ...b.authoring, stage: "story-engine", winningHook: res.winningHook, rewriteRounds: res.rounds, cacheHits: res.cacheHits };
  b.storyPlan = res.plan;
  b.editorial = { critique: res.critique, changes: res.changes, retention: { score: res.assessment.retention.score, global: res.assessment.retention.global, weakest: res.assessment.retention.weakest, disclaimer: res.assessment.retention.disclaimer }, spoken: { score: res.assessment.spoken.score }, hooks: res.assessment.hooks.ranked.map((h) => ({ text: h.text, mechanism: h.mechanism, total: h.total, dims: h.dims, factual: h.factual.pass })) };
  return b;
}

module.exports = { bundleFromStory, write, check, toBundle, brief, SCRIPT_SCHEMA, BEAT_TYPES, GRAPHIC_TYPES, LENGTH, develop, assess, evaluatePlan, dossierBlock, stageCache, promptVersion, wordsFor, STORY_SCHEMA, CRITIQUE_SCHEMA, REWRITE_SCHEMA, PURPOSES };
