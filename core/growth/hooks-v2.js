"use strict";

// Viral Quality v2 hook competition.
// The existing hook engine deliberately rejects cosmetic paraphrases. This
// wrapper keeps that rule, then expands the competition with distinct,
// source-backed claims already present in the normalized topic. Nothing new is
// asserted: every extra candidate is a compressed topic/evidence sentence and
// is passed through the same language/factual/scoring checks as base hooks.

const Hooks = require("./hooks");
const Model = require("./topic-model");

const HUMAN = /\b(people|workers|passengers|crew|children|killed|died|dead|victims?|survivors?|evacuat\w*|hospital|city|cities|everyone|humanity)\b/i;
const WARNING = /\b(warn\w*|ignored|crack\w*|alarm|complain\w*|knew|reported|evacuat\w*)\b/i;
const CONSEQUENCE = /\b(collaps\w*|explod\w*|crash\w*|burn\w*|sank|sink\w*|destroy\w*|fail\w*|blackout|ruptur\w*|flood\w*|dead|died|killed)\b/i;
const CAUSE = /\b(cause\w*|because|trigger\w*|failure|mechanism|pressure|load|fatigue|weld|liquef\w*|fractur\w*|short circuit|overheat\w*)\b/i;

function words(text) { return String(text || "").trim().split(/\s+/).filter(Boolean); }
function screenText(text) {
  const number = Model.numbersIn(text)[0];
  if (number && words(number).length <= 4) return number.toUpperCase();
  return words(String(text).replace(/[^a-z0-9% .'-]/gi, " ")).filter((word) => word.length >= 4).slice(0, 3).join(" ").toUpperCase();
}

function familyFor(text, field) {
  if (field === "warning" || WARNING.test(text)) return "warning_ignored";
  if (HUMAN.test(text)) return "human_consequence";
  if (/\d/.test(text)) return "number_anomaly";
  if (CONSEQUENCE.test(text)) return "shocking_consequence";
  if (field === "mechanism" || field === "trigger" || CAUSE.test(text)) return "mechanism_reveal";
  if (/\b(but|yet|not|never|instead|actually)\b/i.test(text)) return "contradiction";
  return "impossible_sounding_fact";
}

function evidenceSeeds(topic) {
  const seeds = [];
  const add = (field, value) => { if (value) seeds.push({ field, value: String(value) }); };
  add("warning", topic.warning);
  add("consequence", topic.consequence);
  add("trigger", topic.trigger);
  add("mechanism", topic.mechanism);
  add("number", topic.number);
  add("misconception", topic.misconception);
  add("secondBeat", topic.secondBeat);
  for (const item of topic.evidence || []) add("evidence", item && item.claim);
  for (const item of topic.narration || []) add("narration", item);
  for (const item of topic.chain || []) add("chain", item);
  return seeds;
}

function expand(topic, config, options = {}) {
  const base = Hooks.generate(topic, config, options);
  const target = Math.max(config.hooks.minimumCandidates || 10, config.hooks.targetCandidates || 30);
  if (base.candidates.length >= target) return { ...base, targetCandidates: target };

  const rawExtras = [];
  for (const seed of evidenceSeeds(topic)) {
    if (rawExtras.length + base.candidates.length >= target * 2) break;
    const sentence = String(seed.value).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0];
    const spoken = Hooks.compress(sentence, config.hooks.maxSpokenWords);
    if (!spoken || Hooks.wordCount(spoken) < 4) continue;
    rawExtras.push({
      family: familyFor(spoken, seed.field),
      spoken: /[.!?]$/.test(spoken) ? spoken : spoken + ".",
      onScreen: screenText(spoken),
      fields: [seed.field],
      editorial: seed.field === "narration" || seed.field === "secondBeat",
      evidenceExpanded: true,
    });
  }

  const combinedRaw = Hooks.dedupe([
    ...base.candidates.map((item) => ({ family: item.family, spoken: item.spoken, onScreen: item.onScreen, fields: item.fields, editorial: item.editorial })),
    ...rawExtras,
  ], config.hooks.cosmeticSimilarity);

  const learned = options.learnedFamilyBonus || {};
  const scored = combinedRaw.map((hook) => Hooks.score(hook, topic, config, options.templatedFields || [], options));
  for (const hook of scored) {
    hook.adjustedTotal = hook.blocked ? hook.total : Math.min(100, hook.total + (learned[hook.family] || 0));
    if (options.openingMaxSeconds) hook.fitsOpening = hook.words / 2.8 <= options.openingMaxSeconds * 1.15;
  }
  scored.sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.adjustedTotal - a.adjustedTotal);
  const trimmed = scored.slice(0, target);
  const selected = trimmed.find((hook) => !hook.blocked && hook.fitsOpening !== false && hook.adjustedTotal >= config.hooks.minimumScore) || null;
  const families = new Set(trimmed.map((hook) => hook.family));

  return {
    channel: topic.channel,
    topicId: topic.id,
    candidates: trimmed,
    candidateCount: trimmed.length,
    familyCount: families.size,
    targetCandidates: target,
    meetsTarget: trimmed.length >= target,
    meetsMinimum: trimmed.length >= config.hooks.minimumCandidates,
    selected,
    selectedScore: selected ? selected.adjustedTotal : 0,
    passes: !!selected && selected.adjustedTotal >= config.hooks.minimumScore,
  };
}

module.exports = { ...Hooks, generate: expand, expand, evidenceSeeds, familyFor };
