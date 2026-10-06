"use strict";
// Evidence ledger built ONLY from what the web tools actually returned in the
// API response. A source the model never opened, or a figure that is not in the
// text we saw, cannot enter a dossier. Parsing is deliberately tolerant of the
// tool-result shapes (basic and dynamic-filtering variants).

const T = require("../text");

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
const stripNum = (n) => String(n).replace(/[,$\s]/g, "").replace(/%$/, "").replace(/[.,]+$/, "");
const urlKey = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase(); } catch (e) { return String(u || "").toLowerCase(); } };

function docText(content) {
  if (!content) return "";
  const c = content.content || content;                      // web_fetch_result.content (document block)
  const src = c && c.source;
  if (src && typeof src.data === "string") return src.data;
  if (typeof c === "string") return c;
  if (c && typeof c.text === "string") return c.text;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x && x.text) || "").join(" ");
  return "";
}

// blocks: all content blocks of the research call(s)
function collect(blocks) {
  const docs = new Map(); const fetchedOrder = [];
  const doc = (url) => { const k = urlKey(url); if (!docs.has(k)) docs.set(k, { url, title: "", texts: [], opened: false, seenInSearch: false }); return docs.get(k); };
  for (const b of blocks || []) {
    if (b.type === "web_fetch_tool_result" && b.content && (b.content.url || (b.content.content && b.content.content.url))) {
      const url = b.content.url || b.content.content.url; const d = doc(url);
      d.opened = true; d.title = d.title || (b.content.content && b.content.content.title) || ""; const t = docText(b.content); if (t) d.texts.push(t);
      fetchedOrder.push(d);
    } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r && r.url) { const d = doc(r.url); d.seenInSearch = true; d.title = d.title || r.title || ""; }
    }
  }
  for (const b of blocks || []) {
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) {
      if (!c || !c.cited_text) continue;
      let d = null;
      if (c.url) d = doc(c.url);
      else if (typeof c.document_index === "number" && fetchedOrder[c.document_index]) d = fetchedOrder[c.document_index];
      if (d) { d.texts.push(c.cited_text); if (!d.title && c.document_title) d.title = c.document_title; }
    }
  }
  return docs;
}

const joinedText = (d) => norm(d.texts.join(" "));
function summary(docs, perDocChars = 1800) {
  return [...docs.values()].filter((d) => d.opened || d.texts.length).map((d, i) => ({ url: d.url, title: d.title, opened: d.opened, excerpt: d.texts.join(" … ").slice(0, perDocChars), hasFullText: d.texts.some((t) => t.length > 4000) }));
}

// A claim is verifiable when every number it states appears in the text we saw for at least one cited source.
function verifyClaim(claim, sourceById, docs) {
  const reasons = []; const seen = (claim.sourceIds || []).map((id) => sourceById.get(id)).filter(Boolean).map((s) => docs.get(urlKey(s.url))).filter(Boolean);
  if (!seen.length) return { ok: false, reasons: ["no cited source was opened by the research agent"] };
  const texts = seen.map(joinedText).join(" ");
  if (!texts.trim()) return { ok: false, reasons: ["cited sources have no readable text in the tool results (cannot verify figures)"] };
  const nums = [...new Set((claim.numbers || []).map(stripNum).filter((n) => n.length > 0))];
  const compact = texts.replace(/[,$\s]/g, "");
  for (const n of nums) {
    // accept "20.8" in "20.8 million", "5,323" in "5323", and "92.3%" forms
    if (!compact.includes(n)) reasons.push(`figure "${n}" is not in the text of the cited source(s)`);
  }
  return { ok: reasons.length === 0, reasons };
}

module.exports = { collect, summary, verifyClaim, urlKey, stripNum, norm, docText };
