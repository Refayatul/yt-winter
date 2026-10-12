"use strict";

// TITLE GRAMMAR GATE. Deterministic checks for the template mistakes that reached YouTube:
//   "How Fusion Reached Practical Power-plant Gain Would Unfold"  (a clause in a noun slot, then a modal)
//   "Inside High-lift Water Pump: The Hidden Dependency"           (a singular common noun with no article)
// A candidate with a problem is never selected (core/growth/titles.js); it stays in the audit list.
// The gate does not judge style or truth (the truthfulness score does that); it rejects broken English.

// Verbs that make a topic subject a clause ("fusion reached …", "the sun vanished …").
const FINITE = /\b(?:is|are|was|were|has|had|have|became|becomes|reached|reaches|stopped|stops|doubled|halved|tripled|vanished|vanishes|disappeared|disappears|froze|freezes|melted|melts|sank|sinks|lost|loses|grew|grows|shrank|shrinks|collapsed|exploded|failed|fails|fell|falls|rose|rises|turned|turns|spun|spins|stood|went|came|worked|works|happened|happens|hit|struck|ran|runs|could|would|will|can|might|must|did|does|do)\b/i;
// Uncountable heads that read naturally without an article ("Depends on Shipping").
const MASS_HEADS = new Set(("water power electricity energy timing data traffic shipping ventilation steel sand helium oil gas food information software " +
  "infrastructure refrigeration insurance cooling heating lighting freight fuel concrete glass copper aluminium aluminum lithium cobalt silicon " +
  "logistics navigation positioning signalling signaling sanitation irrigation desalination storage transport transportation propulsion braking " +
  "ice snow rain dust soot smoke sunlight light air heat salt rice wheat blood money cement asphalt rubber plastic paper wood coal uranium hydrogen " +
  "oxygen nitrogen carbon gravity magma lava radiation weather friction cover inertia dioxide monoxide methane ozone ammonia plasma " +
  "dilation strength rotation expansion contraction evaporation condensation precipitation convection conduction erosion corrosion pollution").split(/\s+/));
// Abstract nouns by suffix ("air resistance", "vacuum permittivity", "aerosol loading") are
// uncountable too; these -ing words name countable parts and still take an article.
const MASS_SUFFIX = /(?:ity|ance|ence|ness|ism|ing)$/;
const COUNTABLE_ING = new Set("ring thing spring string wing building bearing coupling fitting crossing ceiling railing casing housing landing opening".split(" "));
const DETERMINER = /^(?:the|a|an|this|that|these|those|its|their|our|your|every|each|one|two|three|no)\b/i;

function isClause(phrase) {
  const text = String(phrase || "").trim();
  if (!text) return false;
  // "fusion reached …": noun followed by a past-tense verb is a clause even without a listed verb.
  return FINITE.test(text) || /^[a-z][a-z-]* [a-z]+ed\b/i.test(text) && !/^[a-z-]+ (?:based|powered|cooled|fired|driven|controlled|related|shaped)\b/i.test(text);
}

// A lower-case, singular, countable noun phrase needs an article in a title slot.
function needsArticle(phrase) {
  const text = String(phrase || "").trim();
  if (!text || DETERMINER.test(text) || isClause(text)) return false;
  if (/[A-Z]/.test(text.replace(/\b[A-Z]{2,}\b/g, ""))) return false;          // a proper name ("Suez Canal", "Mont Blanc")
  if (/^[A-Z0-9-]+$/.test(text)) return false;                                // an acronym alone ("GPS")
  const head = text.toLowerCase().split(/\s+/).pop().split("-").pop();
  if (MASS_HEADS.has(head) || (MASS_SUFFIX.test(head) && !COUNTABLE_ING.has(head))) return false;
  if (/(?:s|ics)$/.test(head) && !/(?:ss|us|is)$/.test(head)) return false;   // plural ("cables"), not "glass"/"bus"/"axis"
  return true;
}

// "the high-lift water pump" for a title slot that needs a noun phrase.
function nounPhrase(phrase) {
  const text = String(phrase || "").trim();
  return needsArticle(text) ? `the ${text}` : text;
}

// Title case also capitalises each part of a hyphenated word ("Power-Plant", "High-Lift").
function hyphenCase(title) {
  let text = String(title);
  // Repeated until stable: "Weigh-in-motion" needs two passes ("Weigh-In-motion", then "Weigh-In-Motion").
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text.replace(/\b([A-Z][a-z]*)-([a-z])/g, (m, first, letter) => `${first}-${letter.toUpperCase()}`);
    if (next === text) break;
    text = next;
  }
  return text
    // Title case: the last word is always capitalised ("… Isn't Electricity Yet").
    .replace(/\b([a-z])([a-z']*)([?!.]?)$/, (m, first, rest, end) => first.toUpperCase() + rest + end);
}

function problems(title, topic = {}) {
  const out = [];
  const text = String(title || "");
  const lower = text.toLowerCase();
  const subject = String(topic.subject || "").trim();
  if (/\b(\w+) \1\b/i.test(text)) out.push("repeated word");
  // "a" before a vowel sound; "a one-percent", "a unique", "a useful" start with a consonant sound.
  if (/\b(?:a) (?:[aei]|o(?!ne\b|ne-|nce\b)|u(?!ni|se|su|ra|ti))/i.test(text)) out.push("'a' before a vowel sound");
  if (/^how\b.*\b\w+ed\b.*\bwould\b/i.test(text)) out.push("a finite verb and 'would' in one 'How …' clause");
  if (subject && isClause(subject)) {
    const at = lower.indexOf(subject.toLowerCase());
    if (at >= 0) {
      const before = lower.slice(0, at).trim();
      // A clause is only grammatical after a conjunction such as "if" or "when".
      if (!/(?:^|\s)(?:what if|if|when|once|after|before|because|as)(?: the| a| an)?$/.test(before)) out.push("a clause used as a noun");
    }
  }
  if (subject && needsArticle(subject)) {
    const re = new RegExp(`(?:^|[^a-z])(?:inside|on|through|for|if|replace|behind|without|about|of|holds?|runs?)\\s+${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text) || lower.startsWith(subject.toLowerCase() + ":") || new RegExp(`^why ${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) out.push("a singular noun without an article");
  }
  if (/\b[A-Z][a-z]+-[a-z]/.test(text)) out.push("lower-case word after a hyphen in title case");
  if (/[:?]\s*[:?]|\s[,.:;?]/.test(text)) out.push("stray punctuation");
  return out;
}

module.exports = { isClause, needsArticle, nounPhrase, hyphenCase, problems, MASS_HEADS };
