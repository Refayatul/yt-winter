"use strict";

// CRITICALTHREAD evidence pre-check (used by scripts/ct-research.js precheck()).
//
// Cheap, deterministic checks of a draft's facts against the excerpts the model was given. They can
// fail a draft earlier than the builder's online verification; they never replace it. Every draft
// that passes them still goes through the builder: quotes and numbers against the live source page,
// reachability, primary references.
//
// - INVALID_SOURCE_ID: the fact names a source that was not supplied. toRecord() silently drops such
//   a fact, which can later surface only as "cites no fact" or "too few facts".
// - QUOTE_NOT_IN_EXCERPT: the quote does not occur in its source excerpt. The model saw only the
//   excerpt, so the quote is paraphrased or from outside knowledge. In dry run 38604605273 this
//   happened for 2, 2 and 4 facts of the three topics; it used to be informational only.
// - CLAIM_NUMBER_NOT_IN_QUOTE: a number in the claim is not in its quote (the prompt's own rule).
//   Years 1500-2100 are exempt, as in the builder's claim-number check.
// Quote length stays the builder's check (QUOTE_TOO_SHORT, at least 5 words), so it is not
// duplicated here.

const path = require("path");
const Builder = require(path.join(__dirname, "ib-ct-library", "build"));
const FR = require(path.join(__dirname, "fr-library", "build"));

const isYear = (n) => Number.isInteger(n) && n >= 1500 && n <= 2100;

function claimNumbersMissing(claim, quote) {
  const available = new Set(FR.numbersIn(quote));
  return [...new Set(FR.numbersIn(claim))].filter((n) => !isYear(n) && !available.has(n));
}

function sourceFor(fact, sources) {
  const match = String(fact && fact.sourceId || "").match(/^S(\d+)$/);
  return match ? sources[Number(match[1]) - 1] || null : null;
}

// Messages use the fact id ("fact F3: ..."), so they are classified by ct-research and can be routed
// to a targeted quote repair.
function evidencePreflight(draft, sources) {
  const errors = [];
  for (const fact of Array.isArray(draft && draft.facts) ? draft.facts : []) {
    if (!fact || !fact.id) continue;
    const source = sourceFor(fact, sources);
    if (!source) { errors.push(`fact ${fact.id}: sourceId ${String(fact.sourceId || "none").slice(0, 8)} is not a supplied source`); continue; }
    if (fact.quote && source.text && !Builder.quoteFound(source.text, fact.quote)) errors.push(`fact ${fact.id}: quote not found in its source excerpt`);
    const missing = fact.claim && fact.quote ? claimNumbersMissing(fact.claim, fact.quote) : [];
    if (missing.length) errors.push(`fact ${fact.id}: claim number(s) not in its quote: ${missing.length}`);
  }
  return errors;
}

// A replacement quote for a targeted repair is accepted only if it occurs in the fact's own excerpt,
// is at least 5 words long (the builder's minimum) and carries every number of the unchanged claim.
function acceptableQuote(fact, quote, sources) {
  const source = sourceFor(fact, sources);
  const text = String(quote || "").trim();
  if (!source || !source.text || !text) return false;
  if (text.split(/\s+/).length < 5) return false;
  if (!Builder.quoteFound(source.text, text)) return false;
  return claimNumbersMissing(fact.claim, text).length === 0;
}

module.exports = { evidencePreflight, acceptableQuote, claimNumbersMissing, sourceFor };
