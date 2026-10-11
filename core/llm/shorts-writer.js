"use strict";

// Haiku Shorts writer for the isolated pipelines (ImpossibleBrief, CriticalThread, Behind the Ordinary).
// Claude writes narration beats, a shot note per beat and the metadata FROM THE RESEARCH RECORD ONLY:
// the topic's sourced facts are numbered F1..Fn and every beat cites the facts it relies on. The
// curated narration is never shown to the model, so a benchmark against it compares like with like.
//
// The model is not the fact-checker. Its output is accepted only when deterministic gates pass:
// * the production retention lint (core/growth/script.js lint: forbidden openings, unsupported numbers,
//   sentence length, word budget, payoff) run against the same evidence the model was given;
// * traceability: verified-layer beats cite at least one fact, cited ids exist, and every number in a
//   beat appears in the facts it cites;
// * structure: channel roles and evidence layers, first and last role, beat count;
// * metadata limits: title, tags, description, hashtags.
// Whether a paraphrase is faithful to its fact is NOT decidable here: it is reported as
// "editorial review required", never scored.

const fs = require("fs");
const path = require("path");
const Script = require("../growth/script");
const GrowthConfig = require("../growth/config");
const Model = require("../growth/topic-model");

const PROFILES = {
  "impossible-brief": {
    layers: ["KNOWN SCIENCE", "ESTIMATED CONSEQUENCE", "SPECULATIVE SCENARIO"], verified: ["KNOWN SCIENCE"],
    roles: ["IMPOSSIBLE_QUESTION", "FIRST_EFFECT", "SCIENCE_EXPLANATION", "SECOND_ORDER_EFFECT", "LIMITS", "SCIENTIFIC_PAYOFF"],
    first: "IMPOSSIBLE_QUESTION", last: "SCIENTIFIC_PAYOFF",
  },
  "critical-thread": {
    layers: ["VERIFIED FACT", "INDUSTRY CLAIM", "ESTIMATE", "MODEL"], verified: ["VERIFIED FACT", "INDUSTRY CLAIM"],
    roles: ["HIDDEN_SYSTEM", "WHY_IT_MATTERS", "WHAT_DEPENDS_ON_IT", "HOW_IT_WORKS", "BOTTLENECK", "FAILURE", "RESILIENCE", "PAYOFF"],
    first: "HIDDEN_SYSTEM", last: "PAYOFF",
  },
  "behind-the-ordinary": {
    layers: ["VERIFIED FACT"], verified: ["VERIFIED FACT"],
    roles: ["VISUAL_MYSTERY", "CLEAR_PROMISE", "EXPLANATION", "ORIGIN", "SURPRISING_DETAIL", "CONSEQUENCE", "PAYOFF"],
    first: "VISUAL_MYSTERY", last: "PAYOFF",
  },
  // Legacy pipeline (shorts-sira.js + icerik/konular case files): benchmark only, no production hook.
  "failure-reconstructed": {
    layers: ["CONFIRMED FACT", "ANALYSIS"], verified: ["CONFIRMED FACT"],
    roles: ["HOOK", "EVENT", "CAUSE", "WARNING", "CONSEQUENCE", "LESSON"],
    first: "HOOK", last: "LESSON",
    rules: "# Failure Reconstructed\n\nReconstruct one real engineering or industrial failure from its case file: what happened, the physical cause, the warning that was missed, and the lesson. Restrained documentary tone; never sensationalise deaths. Open on the failure itself, not a date. Never use \u201cDid you know\u201d, \u201cImagine\u201d, \u201cIn this video\u201d or a channel intro.",
  },
};

const LIMITS = { beats: [5, 10], openingWords: 10, titleChars: 70, tags: [3, 15], tagChars: 30, tagsTotalChars: 450, descriptionChars: 900, hashtags: 3 };
// Phrases that mark generated filler; a hit is a warning for the editor, not a blocker.
const GENERIC = /\b(delve|buckle up|game[- ]changer|mind[- ]blowing|in a world where|let'?s dive|here'?s the thing|it'?s important to note|interestingly|furthermore|in conclusion|the answer may surprise you)\b/gi;

function profileFor(channel) {
  const profile = PROFILES[channel.slug];
  if (!profile) throw new Error(`LLM Shorts writer has no profile for ${channel.slug}`);
  return profile;
}

// The research record the model sees: sourced facts only. Evidence copied from the curated narration or the
// editorial brief (which carries the curated opening line) and every narration-derived field are excluded.
const EDITORIAL_SOURCES = new Set(["editorial narration", "editorial brief"]);
function researchRecord(topic) {
  const facts = (topic.evidence || []).filter((item) => item && item.claim && !EDITORIAL_SOURCES.has(item.source))
    .map((item, index) => ({ id: `F${index + 1}`, layer: item.layer || item.confidence || "VERIFIED FACT", claim: item.claim, source: item.source || item.sourceName || null }));
  const field = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return {
    topicId: topic.id, question: field(topic.question) || field(topic.title), subject: field(topic.subject), coreQuestion: field(topic.coreQuestion),
    scenario: field(topic.scenario), mechanism: field(topic.mechanism), dependency: field(topic.dependency), bottleneck: field(topic.bottleneck),
    resilience: field(topic.resilience), facts, sources: (topic.sources || []).map((source) => source.name).filter(Boolean),
  };
}

// The topic the deterministic lint checks against: exactly what the model was given, so a number the
// model invented (or remembered from elsewhere) is unsupported even if the curated narration has it.
function lintTopic(topic, record) {
  return {
    ...topic, narration: [], narrationBeats: [], hookText: "", openingLine: "", secondBeat: "", editorialTitles: [], thumbnailTexts: [],
    number: "", consequence: "", result: "", lesson: "", misconception: "", chain: [], timeline: [],
    evidence: record.facts.map((fact) => ({ claim: fact.claim, layer: fact.layer })),
    mechanism: record.mechanism || "", trigger: record.scenario || "", title: record.question || "",
  };
}

function schemaFor(profile) {
  return {
    type: "object", additionalProperties: false, required: ["beats", "title", "description", "tags", "thumbnailText"],
    properties: {
      beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "role", "layer", "evidence", "visual"], properties: {
        text: { type: "string" }, role: { type: "string", enum: profile.roles }, layer: { type: "string", enum: profile.layers },
        evidence: { type: "array", items: { type: "string" } }, visual: { type: "string" },
      } } },
      title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, thumbnailText: { type: "string" },
    },
  };
}

function systemPrompt(channel, profile, config) {
  const file = path.join(channel.paths.prompts, "system.md");
  const rules = profile.rules || fs.readFileSync(file, "utf8").trim();
  const [low, high] = config.script.shorts.targetWords;
  return [rules, "",
    "## Output contract (vertical Short, synthetic narration)",
    `- ${LIMITS.beats[0] + 2}-${LIMITS.beats[1] - 1} beats, ${low}-${high} spoken words in total, one sentence per beat, at most ${config.script.shorts.maxSentenceWords} words per sentence.`,
    `- Roles in story order: ${profile.roles.join(", ")}. The first beat is ${profile.first} (at most ${LIMITS.openingWords} words, concrete, never a forbidden opening); the last beat is ${profile.last} and states a consequence, lesson or payoff.`,
    `- Layers: ${profile.layers.join(", ")}. A ${profile.verified.join(" or ")} beat must cite at least one fact id in "evidence" and may only say what those facts say.`,
    "- Write only from the numbered facts. Never add a number, date, name, ranking or superlative that is not in a cited fact. If a fact is not needed, leave it out.",
    "- \"visual\": one concrete on-screen objective for the beat (subject, framing, any label). No generic stock, no text-only frames.",
    `- title: at most ${LIMITS.titleChars} characters, specific, no claim beyond the facts. description: two plain sentences, no links, no hashtags. tags: ${LIMITS.tags[0] + 2}-${LIMITS.tags[1] - 3} lowercase search phrases. thumbnailText: at most 3 words.`,
  ].join("\n");
}

function buildPrompt(topic, channel, options = {}) {
  const profile = profileFor(channel);
  const config = options.config || GrowthConfig.forChannel(channel);
  const record = researchRecord(topic);
  if (record.facts.length < 3) throw new Error(`${topic.id}: only ${record.facts.length} sourced facts; the writer needs at least 3 (research first)`);
  const user = `Write the Short for this research record.\n${JSON.stringify(record)}`;
  return { system: systemPrompt(channel, profile, config), user, schema: schemaFor(profile), record, profile, config };
}

const words = (text) => String(text || "").split(/\s+/).filter(Boolean).length;
const numbers = (text) => Model.numbersIn(String(text || "")).map((raw) => (raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/) || [null])[0]).filter(Boolean);

function validate(output, topic, channel, prompt) {
  const profile = prompt.profile; const record = prompt.record; const config = prompt.config;
  const blockers = []; const warnings = [];
  const beats = Array.isArray(output && output.beats) ? output.beats : [];
  if (beats.length < LIMITS.beats[0] || beats.length > LIMITS.beats[1]) blockers.push(`structure: ${beats.length} beats (allowed ${LIMITS.beats[0]}-${LIMITS.beats[1]})`);
  const factIds = new Map(record.facts.map((fact) => [fact.id, fact]));
  beats.forEach((beat, index) => {
    const n = index + 1;
    if (!beat || !String(beat.text || "").trim()) { blockers.push(`beat ${n}: empty text`); return; }
    if (!profile.roles.includes(beat.role)) blockers.push(`beat ${n}: role ${beat.role} is not a ${channel.slug} role`);
    if (!profile.layers.includes(beat.layer)) blockers.push(`beat ${n}: layer ${beat.layer} is not a ${channel.slug} layer`);
    const cited = (beat.evidence || []).filter((id) => factIds.has(id));
    const unknown = (beat.evidence || []).filter((id) => !factIds.has(id));
    if (unknown.length) blockers.push(`beat ${n}: cites unknown fact id(s) ${unknown.join(", ")}`);
    if (profile.verified.includes(beat.layer) && !cited.length) blockers.push(`beat ${n}: ${beat.layer} beat cites no fact`);
    const citedText = cited.map((id) => factIds.get(id).claim).join(" ").replace(/,/g, "");
    const citedNumbers = new Set(numbers(citedText));
    const loose = numbers(beat.text).filter((value) => !citedNumbers.has(value));
    if (loose.length && cited.length) blockers.push(`beat ${n}: number(s) ${loose.join(", ")} not in its cited facts`);
    if (!String(beat.visual || "").trim()) warnings.push(`beat ${n}: no visual objective`);
  });
  if (beats.length && beats[0].role !== profile.first) blockers.push(`structure: first beat is ${beats[0].role}, expected ${profile.first}`);
  if (beats.length && beats[beats.length - 1].role !== profile.last) blockers.push(`structure: last beat is ${beats[beats.length - 1].role}, expected ${profile.last}`);
  if (beats.length && words(beats[0].text) > LIMITS.openingWords) blockers.push(`opening: ${words(beats[0].text)} words (max ${LIMITS.openingWords})`);
  const lines = beats.map((beat) => String(beat.text || "").trim()).filter(Boolean);
  const lint = Script.lint(lines.length ? lines : [""], lintTopic(topic, record), config, {});
  for (const finding of lint.blockers) blockers.push(`lint: ${finding.replace(/^BLOCKER: /, "")}`);
  if (!lint.passes && !lint.blockers.length) blockers.push(`lint: retention score ${lint.score} < ${config.script.shorts.minimumScore} (${lint.findings.join("; ")})`);
  for (const finding of lint.findings.filter((item) => !item.startsWith("BLOCKER"))) warnings.push(`lint: ${finding}`);
  const generic = lines.join(" ").match(GENERIC) || [];
  if (generic.length) warnings.push(`generic phrasing: ${[...new Set(generic.map((x) => x.toLowerCase()))].join(", ")}`);
  // Metadata
  const title = String((output && output.title) || "").trim();
  if (!title || title.length > LIMITS.titleChars) blockers.push(`metadata: title length ${title.length} (1-${LIMITS.titleChars})`);
  const titleNumbers = numbers(title).filter((value) => !new Set(numbers(record.facts.map((fact) => fact.claim).join(" ").replace(/,/g, ""))).has(value));
  if (titleNumbers.length) blockers.push(`metadata: title number(s) ${titleNumbers.join(", ")} not in the facts`);
  const tags = Array.isArray(output && output.tags) ? output.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  if (tags.length < LIMITS.tags[0] || tags.length > LIMITS.tags[1]) blockers.push(`metadata: ${tags.length} tags (${LIMITS.tags[0]}-${LIMITS.tags[1]})`);
  if (tags.some((tag) => tag.length > LIMITS.tagChars) || tags.join(",").length > LIMITS.tagsTotalChars) blockers.push("metadata: a tag or the tag list is too long");
  const description = String((output && output.description) || "");
  if (description.length > LIMITS.descriptionChars) blockers.push(`metadata: description ${description.length} chars (max ${LIMITS.descriptionChars})`);
  if (/https?:\/\//i.test(description)) blockers.push("metadata: description contains a link (links come from the source list, not the model)");
  if ((description.match(/#\w+/g) || []).length > LIMITS.hashtags) blockers.push("metadata: too many hashtags");
  return {
    passes: blockers.length === 0, blockers, warnings,
    editorialReview: "required: whether each beat faithfully paraphrases its cited facts is not checked by code",
    lint: { score: lint.score, words: lint.words, estimatedSeconds: lint.estimatedSeconds, passes: lint.passes, findings: lint.findings },
    citedFacts: [...new Set(beats.flatMap((beat) => beat.evidence || []))].filter((id) => factIds.has(id)).length, facts: record.facts.length,
  };
}

// Deterministic, descriptive comparison. No combined "quality score": the numbers are measurements.
function describe(lines) {
  const all = lines.join(" ");
  const tokens = all.toLowerCase().match(/[a-z0-9']+/g) || [];
  const trigrams = new Map();
  for (let i = 0; i + 2 < tokens.length; i += 1) { const key = tokens.slice(i, i + 3).join(" "); trigrams.set(key, (trigrams.get(key) || 0) + 1); }
  return {
    beats: lines.length, words: words(all), estimatedSeconds: Math.round(words(all) / 2.8 * 10) / 10,
    openingWords: words(lines[0]), longestSentence: Math.max(0, ...lines.map(words)), numbers: numbers(all).length,
    distinctWordRatio: tokens.length ? Math.round(new Set(tokens).size / tokens.length * 100) / 100 : 0,
    repeatedTrigrams: [...trigrams.values()].filter((count) => count > 1).length,
    genericPhrases: (all.match(GENERIC) || []).length,
  };
}

function compare(baselineLines, candidateLines, topic, channel, options = {}) {
  const config = options.config || GrowthConfig.forChannel(channel);
  // Baseline lint uses the full production topic, exactly as planShort does.
  const baselineLint = Script.lint(baselineLines, topic, config, {});
  return {
    baseline: { ...describe(baselineLines), lintScore: baselineLint.score, lintPasses: baselineLint.passes, lintBlockers: baselineLint.blockers },
    candidate: options.candidateValidation ? { ...describe(candidateLines), lintScore: options.candidateValidation.lint.score, lintPasses: options.candidateValidation.lint.passes, gatePasses: options.candidateValidation.passes, gateBlockers: options.candidateValidation.blockers } : describe(candidateLines),
    note: "Measurements only. lintScore is the production retention heuristic (core/growth/script.js), not a quality verdict; hook strength, clarity and accuracy need the blind editorial review (docs/llm/AUTOMATION.md, Benchmark).",
  };
}

// Converts accepted output to the renderer's script contract (same shape as growth editorialClaims).
function toScript(output, topic) {
  let t = 0;
  const claims = output.beats.map((beat) => {
    const text = /[.!?]$/.test(beat.text.trim()) ? beat.text.trim() : beat.text.trim() + ".";
    const seconds = Math.max(1.2, words(text) / 2.8);
    const claim = { start: Math.round(t * 10) / 10, end: Math.round((t + seconds) * 10) / 10, role: beat.role, layer: beat.layer, confidence: beat.layer, text, evidence: beat.evidence, visual: beat.visual };
    t += seconds; return claim;
  });
  return { format: "short", generator: "llm shorts-writer (shadow)", targetSeconds: claims.length ? claims[claims.length - 1].end : 0, spoken: claims.map((c) => c.text).join(" "), claims, lines: claims.map((c) => c.text), structure: claims.map((c) => c.role), sourceIds: (topic.sources || []).map((source) => source.name) };
}

module.exports = { PROFILES, LIMITS, profileFor, researchRecord, lintTopic, schemaFor, buildPrompt, validate, describe, compare, toScript };
