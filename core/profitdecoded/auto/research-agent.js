"use strict";
// Autonomous research stage: topic -> web research with citations -> dossier ->
// code-side verification -> research gate. Never lowers a gate: a topic whose
// research cannot be verified is reported as research-failed and skipped.

const fs = require("fs");
const path = require("path");
const LLM = require("./llm");
const Ev = require("./evidence");
const Research = require("../research");
const Edgar = require("./edgar");
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

const GROQ_MEMO_FORMAT = `\n\nBUDGET: use at most 3 searches and open at most 4 pages (tokens are limited). Prefer primary sources.\nOUTPUT FORMAT (strict): one line per fact, exactly:\nFACT: <the fact> | URL: <page url> | QUOTE: "<one verbatim sentence or fragment copied from that page, at least 8 words>"\nOnly pages you actually opened. No Wikipedia. Quotes are machine-checked against the downloaded page: a quote that is not on the page is discarded. Add lines starting with CAVEAT: for contradictions, missing evidence and what the sources do NOT say.`;

const QUOTES_SCHEMA = { type: "object", additionalProperties: false, required: ["quotes"], properties: { quotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "fact", "quote"], properties: { url: { type: "string" }, fact: { type: "string" }, quote: { type: "string" } } } } } };

function writeDebug(deps, name, text) {
  try {
    const dir = deps.debugDir || path.join(CHANNEL_DIR, "state", "auto-debug");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), String(text || "").slice(0, 200000));
  } catch (e) { /* diagnostics are best effort */ }
}

// Groq path: the model finds sources (browser_search); WE download the pages and verify every quote.
// If its answer is not parseable (or yields too little), URLs are taken from anywhere in the response, the
// relevant passages of each downloaded page are selected by us, and the model extracts verbatim quotes from them.
async function researchGroq(topic, format, deps, client, ledger) {
  const G = require("./groq"); const gdeps = deps.groq || {};
  const slug = String(topic.id || topic.topic).slice(0, 60);
  const memo = await LLM.run({ client, ledger, system: prompt("research.md") + GROQ_MEMO_FORMAT, messages: [{ role: "user", content: userBrief(topic, format) }], tools: [{ type: "browser_search" }], maxTokens: 8000, effort: "low" });
  writeDebug(deps, `${slug}-groq-memo.txt`, memo.text);
  const lines = G.parseMemoLines(memo.text);
  const pages = new Map(); const docs = new Map(); let rejected = [];
  let v = await G.verifyMemo(lines, gdeps, pages, docs); rejected = rejected.concat(v.rejected);
  let usedFallback = false;
  const hasPrimary = () => [...docs.values()].some((d) => Research.classifySource({ url: d.url }).tier === 1);
  if (docs.size < 3 || !hasPrimary()) {
    usedFallback = true;
    // Official filings first: the latest 10-K of the SEC registrant (if any), then whatever the search produced.
    const sec = await Edgar.candidates(topic.entity, { ...gdeps, contact: deps.contact });
    if (sec.note) writeDebug(deps, `${slug}-sec-note.txt`, sec.note);
    const urls = [...new Set([...(sec.urls || []), ...lines.map((l) => l.url), ...G.urlsFromAnything(memo.text), ...G.urlsFromAnything(memo.raw)])].slice(0, 8);
    const Evk = require("./evidence"); const fetched = [];
    for (const u of urls) { const k = Evk.urlKey(u); const fresh = !pages.has(k); if (fresh) pages.set(k, await G.fetchPage(u, gdeps)); const pg = pages.get(k); if (pg.ok) fetched.push({ url: u, title: pg.title, passages: G.selectPassages(pg.text, `${topic.topic} ${topic.entity} ${topic.coreQuestion}`) }); else if (fresh) rejected.push({ url: u, reason: `could not download the page (${pg.reason})` }); }
    const usable = fetched.filter((f) => f.passages).slice(0, 6);
    // One small call per page: every page gets its own chance to contribute quotes (more independent sources),
    // and each call stays cheap (a few thousand tokens) for the free-tier budget.
    const allQuotes = [];
    for (const page of usable) {
      let q;
      try { q = await LLM.run({ client, ledger, system: "You extract evidence. From the PASSAGES of ONE downloaded page, copy verbatim sentences or fragments (>= 8 words each) that state concrete facts, figures, prices, dates or mechanisms relevant to the topic (at most 6). Copy exactly, character for character; never paraphrase or combine. Machine-checked: a quote that is not verbatim on the page is discarded. Return JSON.", messages: [{ role: "user", content: `TOPIC: ${topic.topic}\nCORE QUESTION: ${topic.coreQuestion}\n\nPAGE:\n${JSON.stringify(page)}` }], schema: QUOTES_SCHEMA, maxTokens: 4500, effort: "low" }); }
      catch (e) { if (e.code === "BUDGET" || e.code === "RATE_LIMIT") { rejected.push({ url: page.url, reason: `extraction stopped: ${e.message}` }); break; } if (e.code === "HTTP" && e.status === 400) { rejected.push({ url: page.url, reason: `extraction skipped for this page: ${e.message}` }); continue; } throw e; }
      for (const x of (q.json.quotes || [])) allQuotes.push({ fact: x.fact, url: page.url, quote: x.quote });
    }
    writeDebug(deps, `${slug}-groq-quotes.json`, JSON.stringify(allQuotes, null, 1));
    v = await G.verifyMemo(allQuotes, gdeps, pages, docs); rejected = rejected.concat(v.rejected);
  }
  const evidence = Ev.summary(docs);
  if (!evidence.length) return { status: "research-failed", reasons: [lines.length ? "no quote could be verified against a downloaded page" : "the research model returned no usable FACT | URL | QUOTE lines and no page could supply verified quotes"], dropped: rejected.map((r) => ({ type: "quote", ...r })), usedFallback, ledger };
  const structured = await LLM.run({
    client, ledger, system: "You convert verified quotes into a dossier. Use ONLY the sources under EVIDENCE: each excerpt is a quote already verified against the real page. Every number in a claim must appear in the excerpt of a source it cites. Mark claims central only if the video's thesis depends on them. Inferences are only our own arithmetic on claims (list basisClaimIds). Anything not in the evidence is left out. contradictions MUST contain at least one entry that records which claims or sources you compared and the outcome (status resolved or open); if nothing conflicts, say exactly what you compared and that the figures agree. Never return it empty. Return JSON only.",
    messages: [{ role: "user", content: `TOPIC: ${topic.topic}\n\nNOTES (caveats and context):\n${memo.text.split(/\r?\n/).filter((x) => /^\W*CAVEAT:/i.test(x)).join("\n")}\n\nEVIDENCE (verified quotes):\n${JSON.stringify(evidence)}\n\nReturn JSON with keys thesis, angle, contradictions, sources, claims, inferences.` }],
    schema: DOSSIER_SCHEMA, maxTokens: 12000, effort: "medium",
  });
  const draft = { ...structured.json, format };
  const { dossier, dropped } = verifyDossier(draft, docs, deps.now);
  const gate = Research.gate(dossier, { format });
  return { status: gate.pass ? "ok" : "research-failed", dossier, gate, dropped: [...rejected.map((r) => ({ type: "quote", ...r })), ...dropped], evidenceCount: evidence.length, pagesFetched: v.pagesFetched, usedFallback, reasons: gate.rejections, ledger };
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
