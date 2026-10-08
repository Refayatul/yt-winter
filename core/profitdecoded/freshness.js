"use strict";
// Topic freshness: is the topic's premise still true? Inventory titles are
// hypotheses written at one point in time; products get discontinued, companies
// close and rules change. This module never rewrites a title or a fact. It flags
// the topic, names the dated event and its sources, and says whether research
// must be redone before the topic may be produced.
//
// Two inputs:
//   * the curated watchlist (channels/profitdecoded/topics/freshness-watchlist.json):
//     dated, sourced events matched to topic ids. Provenance INFERRED (a person read the sources).
//   * a phrasing heuristic: words that tie a claim to a moment ("still", "now", "anymore",
//     "used to", years) or to rules that change often. Provenance ESTIMATED; it only asks for
//     a re-check and never blocks on its own.

const SEVERITY = Object.freeze({ CURRENT_UNVERIFIED: 0, TIME_SENSITIVE: 1, CHANGED_CONTEXT: 2, OUTDATED_PREMISE: 3, PREMISE_CONTRADICTED: 3 });
// Kinds that make the inventory premise unusable until the topic is researched again.
const BLOCKING = new Set(["OUTDATED_PREMISE", "PREMISE_CONTRADICTED"]);

const TIME_WORDS = /\b(still|now|anymore|no longer|used to|after promising|20[0-9]{2})\b/i;
const RULE_WORDS = /\b(fee|fees|cancel\w*|overdraft|tariff\w*|tax\w*|refund\w*|subscription\w*)\b/i;

function heuristicFlags(title) {
  const flags = [];
  const t = String(title || "");
  if (TIME_WORDS.test(t)) flags.push({ kind: "TIME_SENSITIVE", source: "heuristic", provenance: "ESTIMATED", event: `title ties the claim to a point in time ("${t.match(TIME_WORDS)[0]}"): re-check the premise during research` });
  if (RULE_WORDS.test(t)) flags.push({ kind: "TIME_SENSITIVE", source: "heuristic", provenance: "ESTIMATED", event: `subject is often regulated ("${t.match(RULE_WORDS)[0]}"): check the current rules during research` });
  return flags;
}

function watchlistFlags(topic, watchlist) {
  const out = [];
  for (const e of (watchlist && watchlist.entries) || []) {
    const hit = (e.topics || []).find((x) => x.id === topic.id);
    if (!hit) continue;
    out.push({ kind: hit.kind, source: "watchlist", provenance: "INFERRED", watchId: e.id, event: e.event, effectiveDate: e.effectiveDate, impact: hit.impact, sources: e.sources || [], verifiedOn: e.verifiedOn });
  }
  return out;
}

// options.researchedAt: date of the topic's research dossier, if any. A dossier dated on or after
// the event has already worked with the changed facts, so that flag no longer blocks.
function check(topic, watchlist, options = {}) {
  const researchedAt = options.researchedAt ? Date.parse(options.researchedAt) : null;
  const flags = [...watchlistFlags(topic, watchlist), ...heuristicFlags(topic.topic)].map((f) => {
    // No effective date (e.g. a contradicting filing): any dossier counts, because research checks the claim itself.
    const addressed = researchedAt != null && (f.effectiveDate == null || researchedAt >= Date.parse(f.effectiveDate));
    return { ...f, addressedByResearch: addressed };
  });
  const open = flags.filter((f) => !f.addressedByResearch);
  const worst = open.reduce((w, f) => (SEVERITY[f.kind] > SEVERITY[w] ? f.kind : w), "CURRENT_UNVERIFIED");
  const needsResearch = open.some((f) => BLOCKING.has(f.kind) || (f.kind === "CHANGED_CONTEXT" && f.source === "watchlist"));
  return {
    status: worst, severity: SEVERITY[worst], needsResearch, blocksProduction: open.some((f) => BLOCKING.has(f.kind)), flags,
    note: worst === "CURRENT_UNVERIFIED" ? "no known change; the premise is still an unresearched hypothesis" : open.map((f) => `${f.kind}: ${f.event}`).join(" | "),
  };
}

module.exports = { check, heuristicFlags, SEVERITY, BLOCKING };
