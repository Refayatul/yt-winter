"use strict";
// Autonomous research stage: topic -> web research with citations -> dossier ->
// code-side verification -> research gate. Never lowers a gate: a topic whose
// research cannot be verified is reported as research-failed and skipped.

const fs = require("fs");
const path = require("path");
const LLM = require("./llm");
const Ev = require("./evidence");
const Research = require("../research");
const { CHANNEL_DIR } = require("../config");

const prompt = (name) => fs.readFileSync(path.join(CHANNEL_DIR, "prompts", name), "utf8");

const DOSSIER_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["thesis", "angle", "contradictions", "sources", "claims", "inferences"],
  properties: {
    thesis: { type: "string" }, angle: { type: "string" },
    contradictions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "status", "note"], properties: { id: { type: "string" }, status: { type: "string", enum: ["resolved", "open"] }, note: { type: "string" } } } },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "publisher", "title", "url", "date"], properties: { id: { type: "string" }, type: { type: "string", enum: ["10-k", "10-q", "earnings-release", "annual-report", "investor-presentation", "filing", "regulator", "government", "academic", "court-document", "company-primary", "journalism", "other"] }, publisher: { type: "string" }, title: { type: "string" }, url: { type: "string" }, date: { type: "string" } } } },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "central", "text", "numbers", "sourceIds"], properties: { id: { type: "string" }, central: { type: "boolean" }, text: { type: "string" }, numbers: { type: "array", items: { type: "string" } }, sourceIds: { type: "array", items: { type: "string" } } } } },
    inferences: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "numbers", "basisClaimIds"], properties: { id: { type: "string" }, text: { type: "string" }, numbers: { type: "array", items: { type: "string" } }, basisClaimIds: { type: "array", items: { type: "string" } } } } },
  },
};

function webTools(max = { search: 15, fetch: 14 }) {
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: max.search },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: max.fetch, citations: { enabled: true } },
  ];
}

function userBrief(topic, format) {
  return `Topic: ${topic.topic}\nEntity: ${topic.entity}\nPillar: ${topic.pillar}\nCore question: ${topic.coreQuestion}\nFormat: ${format === "short" ? "30-50 second Short (needs ~3+ sources, at least 1 primary)" : "long-form explainer (needs ~6+ sources, at least 2 primary)"}\n\nThis is a curated hypothesis: the title may imply a mechanism that the evidence does not support. Establish what is actually documented.`;
}

// Programmatic verification of the structured dossier against what the tools really returned.
function verifyDossier(draft, docs, now = new Date()) {
  const dropped = []; const sources = [];
  for (const s of draft.sources || []) {
    const d = docs.get(Ev.urlKey(s.url));
    if (!d || !(d.opened || d.texts.length)) { dropped.push({ type: "source", id: s.id, reason: "URL was never opened by the research agent" }); continue; }
    sources.push({ ...s, accessed: now.toISOString().slice(0, 10) });
  }
  const byId = new Map(sources.map((s) => [s.id, s]));
  const claims = [];
  for (const c of draft.claims || []) {
    const kept = { ...c, sourceIds: (c.sourceIds || []).filter((id) => byId.has(id)) };
    const v = Ev.verifyClaim(kept, byId, docs);
    if (!v.ok) { dropped.push({ type: "claim", id: c.id, central: c.central, reason: v.reasons.join("; ") }); continue; }
    claims.push(kept);
  }
  const claimIds = new Set(claims.map((c) => c.id));
  const inferences = (draft.inferences || []).filter((i) => (i.basisClaimIds || []).length && i.basisClaimIds.every((id) => claimIds.has(id))).map((i) => ({ ...i, disclosed: true }));
  for (const i of draft.inferences || []) if (!inferences.find((x) => x.id === i.id)) dropped.push({ type: "inference", id: i.id, reason: "basis claim missing or unverified" });
  const dossier = { format: draft.format, researchedAt: now.toISOString().slice(0, 10), researcher: `auto (${LLM.MODEL()} + web_search/web_fetch, programmatic verification)`, thesis: draft.thesis, angle: draft.angle, contradictionsChecked: (draft.contradictions || []).length > 0, contradictions: draft.contradictions || [], sources, claims, inferences };
  return { dossier, dropped };
}

const GROQ_MEMO_FORMAT = `\n\nOUTPUT FORMAT (strict): after any short reasoning, write one line per fact, exactly:\nFACT: <the fact> | URL: <page url> | QUOTE: "<one verbatim sentence or fragment copied from that page, at least 8 words>"\nOnly pages you actually opened. No Wikipedia. Quotes are machine-checked against the downloaded page: a quote that is not on the page is discarded. Add lines starting with CAVEAT: for contradictions, missing evidence and what the sources do NOT say.`;

// Groq path: the model finds sources and quotes (browser_search); WE download the pages and verify every quote.
async function researchGroq(topic, format, deps, client, ledger) {
  const memo = await LLM.run({ client, ledger, system: prompt("research.md") + GROQ_MEMO_FORMAT, messages: [{ role: "user", content: userBrief(topic, format) }], tools: [{ type: "browser_search" }], maxTokens: 12000, effort: "low" });
  const G = require("./groq"); const lines = G.parseMemoLines(memo.text);
  if (!lines.length) return { status: "research-failed", reasons: ["the research model returned no FACT | URL | QUOTE lines"], ledger };
  const { docs, rejected, pagesFetched } = await G.verifyMemo(lines, deps.groq || {});
  const evidence = Ev.summary(docs);
  if (!evidence.length) return { status: "research-failed", reasons: ["no quote could be verified against a downloaded page"], dropped: rejected.map((r) => ({ type: "quote", ...r })), ledger };
  const structured = await LLM.run({
    client, ledger, system: "You convert verified quotes into a dossier. Use ONLY the sources under EVIDENCE: each excerpt is a quote already verified against the real page. Every number in a claim must appear in the excerpt of a source it cites. Mark claims central only if the video's thesis depends on them. Inferences are only our own arithmetic on claims (list basisClaimIds). Anything not in the evidence is left out. Return JSON only.",
    messages: [{ role: "user", content: `TOPIC: ${topic.topic}\n\nNOTES (caveats and context):\n${memo.text.split(/\r?\n/).filter((x) => /^CAVEAT:/i.test(x)).join("\n")}\n\nEVIDENCE (verified quotes):\n${JSON.stringify(evidence)}\n\nReturn JSON with keys thesis, angle, contradictions, sources, claims, inferences.` }],
    schema: DOSSIER_SCHEMA, maxTokens: 12000, effort: "medium",
  });
  const draft = { ...structured.json, format };
  const { dossier, dropped } = verifyDossier(draft, docs, deps.now);
  const gate = Research.gate(dossier, { format });
  return { status: gate.pass ? "ok" : "research-failed", dossier, gate, dropped: [...rejected.map((r) => ({ type: "quote", ...r })), ...dropped], evidenceCount: evidence.length, pagesFetched, reasons: gate.rejections, ledger };
}

async function research(topic, format, deps = {}) {
  const client = deps.client || LLM.createClient(); const ledger = deps.ledger || LLM.newLedger();
  if (client.provider === "groq") return researchGroq(topic, format, deps, client, ledger);
  // 1. read the web
  const memo = await LLM.run({ client, ledger, system: prompt("research.md"), messages: [{ role: "user", content: userBrief(topic, format) }], tools: webTools(deps.maxUses), maxTokens: 32000, effort: "high" });
  const docs = Ev.collect(memo.blocks);
  const evidence = Ev.summary(docs);
  if (!evidence.length) return { status: "research-failed", reasons: ["the research agent opened no sources"], ledger };
  // 2. structure what was actually read
  const structured = await LLM.run({
    client, ledger, system: "You convert a research memo into a verified-evidence dossier. Use ONLY the sources listed under EVIDENCE (they are the pages that were really opened). Every number in a claim must appear in that source's excerpt. Mark claims central only if the video's thesis depends on them. Write inferences only as our own arithmetic on claims, listing their basisClaimIds. If something is not supported by the evidence, leave it out. Return JSON.",
    messages: [{ role: "user", content: `TOPIC: ${topic.topic}\n\nMEMO:\n${memo.text}\n\nEVIDENCE (opened pages):\n${JSON.stringify(evidence)}` }],
    schema: DOSSIER_SCHEMA, maxTokens: 24000, effort: "medium",
  });
  const draft = { ...structured.json, format };
  const { dossier, dropped } = verifyDossier(draft, docs, deps.now);
  const gate = Research.gate(dossier, { format });
  return { status: gate.pass ? "ok" : "research-failed", dossier, gate, dropped, evidenceCount: evidence.length, reasons: gate.rejections, ledger };
}

module.exports = { research, verifyDossier, DOSSIER_SCHEMA, webTools, userBrief };
