"use strict";

// Experimental CriticalThread Stage A. No production imports, network clients, or implicit writes.
// A primary-source link is NOT evidence: PRIMARY_SOURCE_VERIFIED requires an independently
// retrieved, matching original document through the injected verifyPrimary callback.
const crypto = require("node:crypto");
const fs = require("node:fs");
const Builder = require("./ib-ct-library/build");
const Research = require("../core/research");

const VERSION = 1;
const MIN_FACTS = 16;
const MAX_FACTS = 18;
const CLAIM_MAX_WORDS = 10;
const QUOTE_MIN_WORDS = 6;
const MAX_OUTPUT_TOKENS = 3200;
const ID = /^F[1-9]\d*$/;
const SOURCE_ID = /^S[1-9]\d*$/;

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const words = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);
const clean = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
function validHttps(value) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !!u.hostname; }
  catch (_) { return false; }
}
function allowedPrimary(url) {
  if (!validHttps(url)) return false;
  const host = new URL(url).hostname.toLowerCase();
  return Research.PRIMARY_HOSTS.some((domain) => host === domain || host.endsWith("." + domain));
}
function numbers(text) {
  return [...new Set((String(text || "").match(/\b\d[\d,.]*\b/g) || []).map((n) => n.replace(/,/g, "")))];
}
function sourceList(sources) {
  if (!Array.isArray(sources)) throw new Error("SOURCES_REQUIRED");
  const ids = new Set();
  for (const source of sources) {
    if (!source || !SOURCE_ID.test(source.source_id) || ids.has(source.source_id) ||
        !validHttps(source.url) || typeof source.excerpt !== "string" || !source.excerpt.trim() ||
        !["primary", "secondary"].includes(source.kind)) throw new Error("INVALID_SOURCE_DESCRIPTOR");
    ids.add(source.source_id);
  }
  return sources;
}
function reject(fact, code) {
  return { fact_id: typeof fact?.fact_id === "string" ? fact.fact_id.slice(0, 20) : null, code };
}
function seal(value) { return { ...value, integrity_sha256: digest(value) }; }
function verifyIntegrity(pkg) {
  if (!pkg || typeof pkg.integrity_sha256 !== "string") return false;
  const { integrity_sha256, ...data } = pkg;
  return digest(data) === integrity_sha256;
}

// verifyPrimary(source) is an injected, trusted original-document retrieval adapter.
// It must return {url, text} from the source URL itself. A caller-supplied "reachable" flag,
// the source kind, a Wikipedia citation, or a link HEAD success never confers verification.
async function validateEvidence({ topic, sources, facts, verifyPrimary }) {
  if (!topic || typeof topic.id !== "string" || !topic.id.trim()) throw new Error("TOPIC_ID_REQUIRED");
  sourceList(sources);
  if (!Array.isArray(facts)) throw new Error("FACTS_REQUIRED");
  const byId = new Map(sources.map((s) => [s.source_id, s]));
  const fetched = new Map();
  async function original(source) {
    if (source.kind !== "primary" || !allowedPrimary(source.url) || typeof verifyPrimary !== "function") return null;
    if (!fetched.has(source.url)) {
      const promise = Promise.resolve().then(() => verifyPrimary(source)).then((result) => {
        return result && result.url === source.url && typeof result.text === "string" && result.text.trim() ? result.text : null;
      }).catch(() => null);
      fetched.set(source.url, promise);
    }
    return fetched.get(source.url);
  }

  const approved = [], rejected = [];
  const factIds = new Set(), duplicateClaims = new Set();
  for (const fact of facts) {
    let code = null;
    const source = byId.get(fact && fact.source_id);
    const claim = String(fact && fact.claim || "").trim();
    const quote = String(fact && fact.verbatim_quote || "").trim();
    if (!fact || !ID.test(fact.fact_id) || factIds.has(fact.fact_id)) code = "INVALID_OR_DUPLICATE_FACT_ID";
    else if (!source) code = "UNKNOWN_SOURCE";
    else if (words(claim).length < 4 || words(claim).length > CLAIM_MAX_WORDS) code = "CLAIM_WORD_COUNT";
    else if (words(quote).length < QUOTE_MIN_WORDS) code = "QUOTE_TOO_SHORT";
    else if (!Builder.quoteFound(source.excerpt, quote)) code = "QUOTE_NOT_IN_EXCERPT";
    else if (numbers(claim).some((n) => !numbers(quote).includes(n))) code = "CLAIM_NUMBER_NOT_IN_QUOTE";
    else if (duplicateClaims.has(clean(claim))) code = "DUPLICATE_CLAIM";
    if (fact && ID.test(fact.fact_id)) factIds.add(fact.fact_id);
    if (code) { rejected.push(reject(fact, code)); continue; }
    duplicateClaims.add(clean(claim));
    let evidenceStatus = "EXCERPT_MATCHED";
    let provenance = null;
    const documentText = await original(source);
    if (documentText && Builder.quoteFound(documentText, quote)) {
      evidenceStatus = "PRIMARY_SOURCE_VERIFIED";
      provenance = { source_url: source.url, method: "DIRECT_DOCUMENT_QUOTE_MATCH" };
    }
    approved.push({
      fact_id: fact.fact_id, source_id: source.source_id, claim,
      verbatim_quote: quote, source_url: source.url, evidence_status: evidenceStatus,
      semantic_status: "NEEDS_REVIEW", numeric_values: numbers(claim),
      primary_source_provenance: provenance
    });
  }
  const primaryDocs = [...new Set(approved.filter((f) => f.evidence_status === "PRIMARY_SOURCE_VERIFIED").map((f) => f.source_url))];
  const diagnostics = [];
  if (facts.length > MAX_FACTS) diagnostics.push("EXCESS_FACTS");
  if (approved.length < MIN_FACTS) diagnostics.push("INSUFFICIENT_VALID_FACTS");
  if (primaryDocs.length < 2) diagnostics.push("INSUFFICIENT_VERIFIED_PRIMARY_DOCUMENTS");
  const value = {
    version: VERSION, channel: "critical-thread", topic_id: topic.id,
    status: diagnostics.length ? "INSUFFICIENT_EVIDENCE" : "READY_FOR_STORY_REVIEW_REQUIRED",
    approved_facts: approved, rejected_facts: rejected,
    sources: sources.map((s) => ({
      source_id: s.source_id, url: s.url, kind: s.kind,
      excerpt_sha256: digest(s.excerpt), excerpt: s.excerpt
    })),
    verification: {
      distinct_primary_documents: primaryDocs.length, valid_facts: approved.length,
      diagnostics, semantic_accuracy: "NEEDS_REVIEW", primary_document_urls: primaryDocs
    }
  };
  return seal(value);
}

// The generator is deliberately injected: this module never initiates a paid or live API call.
// The caller must enforce the existing 16k/topic and 45k/run token budgets before invoking it.
async function extractEvidence({ topic, sources, generate, verifyPrimary, budget }) {
  sourceList(sources);
  if (typeof generate !== "function") throw new Error("EXTRACTOR_REQUIRED");
  const result = await generate({
    stage: "ct-evidence-first-extract", reasoningEffort: "low",
    maxTokens: MAX_OUTPUT_TOKENS, clientJson: true,
    ...(budget ? { budget } : {}),
    system: "Return JSON only: {facts:[{fact_id,source_id,claim,verbatim_quote}]}. Use only supplied excerpts. Write 16-18 distinct claims, 4-10 words each, with a 6+ word exact quote. Never fabricate citations, dates, numbers or facts.",
    user: JSON.stringify({
      topic_id: topic.id, subject: topic.subject,
      sources: sources.map((s) => ({ source_id: s.source_id, url: s.url, excerpt: s.excerpt }))
    })
  });
  return validateEvidence({ topic, sources, facts: result && result.json && result.json.facts, verifyPrimary });
}

// Explicit opt-in persistence only. Never write a research package into topic-universe.json.
function savePackage(pkg, filename) {
  if (!verifyIntegrity(pkg)) throw new Error("EVIDENCE_INTEGRITY_FAILED");
  if (!filename || typeof filename !== "string") throw new Error("EXPLICIT_PATH_REQUIRED");
  fs.writeFileSync(filename, JSON.stringify(pkg, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
function loadPackage(filename) {
  const pkg = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!verifyIntegrity(pkg)) throw new Error("EVIDENCE_INTEGRITY_FAILED");
  return pkg;
}
module.exports = {
  VERSION, MIN_FACTS, MAX_FACTS, MAX_OUTPUT_TOKENS, validateEvidence, extractEvidence,
  verifyIntegrity, savePackage, loadPackage, allowedPrimary, numbers
};
