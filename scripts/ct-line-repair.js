"use strict";

// CRITICALTHREAD line-level narration repair (used by scripts/ct-research.js).
//
// Why: dry run 38570584587 (2026-10-14). Every draft returned valid JSON and every draft failed the
// narration-support check. Its repair request carried only the list of errors, not the draft, so the
// model rewrote the whole record from scratch and new lines failed instead (CT-265: lines 4 and 9
// failed, then lines 3 and 6).
//
// A repair now:
// - gives the model its own draft, the facts with their ids, the exact support rule and each source's
//   primary-reference count;
// - asks for replacement lines only, for the failing lines only;
// - splices them in, leaving every other line and every fact unchanged;
// - re-runs the complete verification.
// Nothing here changes a claim, a quote, a citation or a narration line by itself. The only automatic
// change is formatting an unambiguous fact id (f1, F07, [F2]); an id that matches no fact is dropped
// and never guessed.

const path = require("path");
const Shared = require(path.join(__dirname, "bto-research"));

const FIGURE = /\b\d[\d,.]*\b/g;
const MAX_SPOKEN_FIGURES = 3;

// The support rule exactly as Shared.narrationSupport applies it, in words the model can follow.
const SUPPORT_RULE = "Support rule (checked by code): every narration line must cite at least one fact id, and its own content words (3+ letters, not common words) must reuse words from the claims or quotes of the facts it cites: at least 1 shared word in lines 1-2, at least 2 in every later line. Only a plural -s is tolerated, so use the facts' own words (\"seawater\", not \"the sea\"). A line with fewer than 3 content words needs no overlap.";
const PRIMARY_RULE = "Primary-reference rule (checked by code): the sources your facts cite must together carry at least 2 primary references; each source lists its primaryReferences count.";
const FIGURE_RULE = `Figure rule (checked by code): the whole narration speaks at most ${MAX_SPOKEN_FIGURES} figures (years, counts and measurements all count) and never repeats one; every spoken number must appear in a cited fact.`;

// ---- Fact ids ---------------------------------------------------------------------------------

// "f1", "F01", "1", "[F2]", " F2 " -> "F2" when that fact exists; anything else is dropped, never guessed.
function normalizeFactIds(draft) {
  if (!draft || !Array.isArray(draft.narration)) return { draft, changes: [] };
  const ids = new Set((Array.isArray(draft.facts) ? draft.facts : []).map((fact) => fact && fact.id).filter(Boolean));
  const changes = [];
  const fix = (raw, line) => {
    if (ids.has(raw)) return raw;
    const digits = String(raw).match(/^\s*\[?\s*[Ff]?\s*0*(\d+)\s*\]?\s*$/);
    const candidate = digits ? `F${digits[1]}` : null;
    if (candidate && ids.has(candidate)) { changes.push({ line, from: String(raw).slice(0, 12), to: candidate }); return candidate; }
    changes.push({ line, from: String(raw).slice(0, 12), to: null });
    return null;
  };
  const narration = draft.narration.map((line, index) => {
    if (!line || typeof line !== "object") return line;
    const list = Array.isArray(line.facts) ? line.facts : typeof line.facts === "string" ? line.facts.split(/[\s,;]+/).filter(Boolean) : [];
    return { ...line, facts: [...new Set(list.map((raw) => fix(raw, index + 1)).filter(Boolean))] };
  });
  return { draft: { ...draft, narration }, changes };
}

// ---- Which lines to repair ------------------------------------------------------------------

// Categories (scripts/ct-research.js VERIFICATION_RULES) a replacement narration line can fix.
const LINE_CATEGORIES = new Set(["NARRATION_CITES_NO_FACT", "NARRATION_NOT_SUPPORTED", "SENTENCE_TOO_LONG", "INVALID_LAYER", "MISSING_ROLE",
  "TOO_MANY_SPOKEN_FIGURES", "REPEATED_FIGURE", "OPENING_TOO_LONG", "OPENING_STARTS_WITH_DATE", "OPENING_NOT_A_VALID_HOOK"]);

// Lines that push the narration over the figure limit or repeat a figure; earlier lines keep theirs.
function figureLines(narration) {
  const seen = new Set();
  let count = 0;
  const over = new Map();
  narration.forEach((line, index) => {
    for (const figure of String(line && line.text || "").match(FIGURE) || []) {
      if (seen.has(figure)) over.set(index + 1, "REPEATED_FIGURE");
      else if (count + 1 > MAX_SPOKEN_FIGURES) over.set(index + 1, over.get(index + 1) || "TOO_MANY_SPOKEN_FIGURES");
      seen.add(figure);
      count += 1;
    }
  });
  return over;
}

// Splits classified failures into line repairs and everything else. `failures` are
// { category, ref } objects from ct-research classifyVerificationError.
function repairTargets(failures, narration) {
  const lines = new Map();
  const other = [];
  const add = (n, category) => { if (n >= 1 && n <= narration.length) lines.set(n, [...new Set([...(lines.get(n) || []), category])]); };
  for (const failure of failures) {
    if (!LINE_CATEGORIES.has(failure.category)) { other.push(failure.category); continue; }
    const ref = String(failure.ref || "").match(/^line (\d+)$/);
    if (ref) add(Number(ref[1]), failure.category);
    else if (/^OPENING_/.test(failure.category)) add(1, failure.category);
    else if (failure.category === "TOO_MANY_SPOKEN_FIGURES" || failure.category === "REPEATED_FIGURE") {
      const over = figureLines(narration);
      if (!over.size) other.push(failure.category);
      for (const [n, category] of over) add(n, category);
    } else other.push(failure.category);
  }
  return { lines, other: [...new Set(other)] };
}

// Facts not cited by a line that would meet the support rule for its current words. A hint for the
// model only: citations are never changed automatically.
function citationHints(draft, n) {
  const line = draft.narration[n - 1] || {};
  const own = Shared.contentWords(line.text);
  const need = n <= 2 ? 1 : 2;
  return (draft.facts || []).filter((fact) => !(line.facts || []).includes(fact.id)).map((fact) => {
    const evidence = new Set(Shared.contentWords(`${fact.claim} ${fact.quote}`));
    return { id: fact.id, shared: own.filter((word) => evidence.has(word) || evidence.has(word.replace(/s$/, "")) || evidence.has(word + "s")).length };
  }).filter((hint) => hint.shared >= need).sort((a, b) => b.shared - a.shared).slice(0, 3).map((hint) => hint.id);
}

// ---- The repair request -------------------------------------------------------------------------

const REPAIR_SYSTEM = [
  "You repair specific narration lines of a CriticalThread research draft. The facts are fixed and already checked: do not add, change or remove facts.",
  "Rewrite ONLY the lines listed in \"replace\". Every other line stays exactly as it is and counts toward the limits.",
  "Each replacement keeps its line number, role and place in the story, uses only details stated by the facts it cites, and cites only fact ids from \"facts\". Add no name, place, organisation, number or technical term that is not in a cited fact.",
  SUPPORT_RULE,
  FIGURE_RULE,
  "Line 1 is the spoken hook: at most 9 words, concrete, not starting with a date. No sentence longer than 16 words.",
  "Return JSON only: {\"lines\":[{\"n\":4,\"role\":\"...\",\"layer\":\"VERIFIED FACT\",\"text\":\"...\",\"facts\":[\"F3\"]}]}",
].join("\n");

function repairInput(draft, targets, sources, extra = {}) {
  return {
    rules: { support: SUPPORT_RULE, primaryReferences: PRIMARY_RULE, figures: FIGURE_RULE },
    sources: sources.map((source, index) => ({ id: `S${index + 1}`, title: source.title, primaryReferences: (source.links || []).length })),
    facts: (draft.facts || []).map((fact) => ({ id: fact.id, claim: fact.claim, quote: fact.quote, sourceId: fact.sourceId })),
    narration: draft.narration.map((line, index) => ({ n: index + 1, role: line.role, layer: line.layer, text: line.text, facts: line.facts })),
    replace: [...targets.lines.entries()].sort((a, b) => a[0] - b[0]).map(([n, failures]) => ({ n, failures, candidateFacts: citationHints(draft, n) })),
    ...(extra.strongestHook ? { strongestHook: extra.strongestHook } : {}),
  };
}

// Structural check of a repair reply (core/llm/longform-provider.js retries a reply that fails it).
function repairProblems(allowed, factIds) {
  return (reply) => {
    if (!reply || !Array.isArray(reply.lines) || !reply.lines.length) return ["reply has no lines"];
    const problems = [];
    const seen = new Set();
    for (const line of reply.lines) {
      if (!line || !allowed.has(Number(line.n))) { problems.push(`line ${line && line.n} was not requested`); continue; }
      if (seen.has(Number(line.n))) problems.push(`line ${line.n} returned twice`);
      seen.add(Number(line.n));
      if (typeof line.text !== "string" || !line.text.trim()) problems.push(`line ${line.n} has no text`);
      const ids = normalizeFactIds({ facts: [...factIds].map((id) => ({ id })), narration: [{ facts: line.facts }] }).draft.narration[0].facts;
      if (!ids.length) problems.push(`line ${line.n} cites no existing fact`);
    }
    for (const n of allowed) if (!seen.has(n)) problems.push(`line ${n} was not returned`);
    return problems;
  };
}

// Replaces the requested lines; every other line and every fact are kept as they were. Line 1 is also
// the record's openingLine (the builder requires them to be equal).
function splice(draft, replacements, allowed) {
  const factIds = new Set((draft.facts || []).map((fact) => fact.id));
  const narration = draft.narration.map((line, index) => {
    const replacement = replacements.find((item) => Number(item.n) === index + 1 && allowed.has(index + 1));
    if (!replacement) return line;
    const facts = normalizeFactIds({ facts: [...factIds].map((id) => ({ id })), narration: [{ facts: replacement.facts }] }).draft.narration[0].facts;
    return { ...line, ...(replacement.role ? { role: replacement.role } : {}), ...(replacement.layer ? { layer: replacement.layer } : {}), text: String(replacement.text).trim(), facts };
  });
  const out = { ...draft, narration };
  if (allowed.has(1) && narration[0]) out.openingLine = narration[0].text;
  return out;
}

// ---- Factual novelty audit (warning only) ---------------------------------------------------------

// Flags details in a narration line that its cited facts do not contain: numbers, capitalised names
// (organisations, places, people), acronyms and technical tokens. A warning, not a gate, and not a
// substitute for semantic fact verification: it compares surface forms only. Returns categories and
// the tokens (callers log categories only).
const COMMON = new Set(["the", "a", "an", "so", "but", "and", "or", "if", "when", "then", "that", "this", "these", "those", "it", "its", "one", "even", "without", "with", "every", "each", "over", "after", "before", "because", "which", "why", "how", "what", "who", "where", "while", "until", "once", "now", "today", "yet", "still", "just", "only", "in", "on", "at", "by", "for", "to", "of", "from", "into", "as", "no", "not", "all", "most", "more", "there", "here", "they", "we", "you", "he", "she", "his", "her", "their", "our"]);
function noveltyAudit(text, citedFacts) {
  const evidence = citedFacts.map((fact) => `${fact.claim} ${fact.quote}`).join(" ");
  const lowerEvidence = evidence.toLowerCase();
  const evidenceNumbers = new Set((evidence.match(FIGURE) || []).map((n) => n.replace(/,/g, "")));
  const warnings = [];
  for (const n of String(text).match(FIGURE) || []) if (!evidenceNumbers.has(n.replace(/,/g, ""))) warnings.push({ category: "NUMBER", token: n });
  const tokens = String(text).replace(/[’']s\b/g, "").split(/[^A-Za-z0-9\-/]+/).filter(Boolean);
  tokens.forEach((token, index) => {
    const clean = token.replace(/^-+|-+$/g, "");
    if (!clean || /^\d/.test(clean) || COMMON.has(clean.toLowerCase())) return;
    const inEvidence = new RegExp(`(^|[^a-z0-9])${clean.toLowerCase().replace(/[-/]/g, "[-/ ]?")}s?([^a-z0-9]|$)`).test(lowerEvidence);
    if (inEvidence) return;
    if (/^[A-Z0-9]{2,}$/.test(clean) || /[A-Za-z]\d|\d[A-Za-z]|\//.test(clean)) warnings.push({ category: "TECHNICAL", token: clean });
    else if (/^[A-Z][a-z]/.test(clean) && index > 0) warnings.push({ category: "NAME", token: clean });
  });
  return warnings;
}

module.exports = {
  SUPPORT_RULE, PRIMARY_RULE, FIGURE_RULE, REPAIR_SYSTEM, LINE_CATEGORIES, MAX_SPOKEN_FIGURES,
  normalizeFactIds, figureLines, repairTargets, citationHints, repairInput, repairProblems, splice, noveltyAudit,
};
