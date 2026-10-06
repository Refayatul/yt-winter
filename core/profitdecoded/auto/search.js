"use strict";
// Web discovery through a search API instead of a token-hungry browsing tool.
// Tavily (free plan: 1,000 credits/month, no card): POST https://api.tavily.com/search, Bearer key.
// The search only returns candidate URLs; the pages are downloaded and every quote verified by our own code.
// Env: TAVILY_API_KEY (env or .env), PD_SEARCH_MAX (max searches per topic, default 5).

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../config");
const LLM = require("./llm");
const Research = require("../research");

function apiKey() { return LLM.envKey("TAVILY_API_KEY"); }
const available = () => !!apiKey();

async function tavily(query, { fetchImpl, key, includeDomains, maxResults = 8 } = {}) {
  const k = key || apiKey();
  if (!k) throw new LLM.AutoError("NO_KEY", "TAVILY_API_KEY is not set");
  const body = { query, search_depth: "basic", max_results: maxResults, include_answer: false, include_raw_content: false };
  if (includeDomains && includeDomains.length) body.include_domains = includeDomains;
  const res = await (fetchImpl || fetch)("https://api.tavily.com/search", { method: "POST", headers: { authorization: "Bearer " + k, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = ""; try { const j = await res.json(); msg = String((j && (j.detail && (j.detail.error || j.detail) || j.error || j.message)) || "").slice(0, 200); } catch (e) { /* no body */ }
    throw new LLM.AutoError(res.status === 429 || res.status === 432 || res.status === 433 ? "RATE_LIMIT" : "HTTP", `Tavily search failed: HTTP ${res.status}${msg ? ` (${msg})` : ""}`, { status: res.status });
  }
  const j = await res.json();
  return (j.results || []).filter((r) => r && r.url).map((r) => ({ url: r.url, title: r.title || "", content: String(r.content || "").slice(0, 400), score: r.score || 0 }));
}

const QUERIES_SCHEMA = { type: "object", additionalProperties: false, required: ["queries"], properties: { queries: { type: "array", items: { type: "string" } } } };
const BAD_HOST = /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$|(^|\.)reddit\.com$|(^|\.)quora\.com$|(^|\.)pinterest\.|(^|\.)facebook\.com$|(^|\.)tiktok\.com$|(^|\.)youtube\.com$|(^|\.)medium\.com$/;

// Queries: one aimed at the company's own annual report/filings (restricted to sec.gov), the rest generic.
async function planQueries(topic, deps) {
  const r = await LLM.run({ client: deps.client, ledger: deps.ledger, system: "You plan web searches for a business-research desk. Write 4 short, specific search queries (<= 12 words each) that would surface: (1) the company's latest annual report or filing on the topic, (2) regulator or academic evidence, (3) respected business journalism on the mechanism, (4) the key figure or claim implied by the title. No site: operators.", messages: [{ role: "user", content: `TOPIC: ${topic.topic}\nENTITY: ${topic.entity}\nCORE QUESTION: ${topic.coreQuestion}` }], schema: QUERIES_SCHEMA, maxTokens: 1500, effort: "low" });
  return (r.json.queries || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
}

// Returns { urls: [url...], found: [{url,title,tier,query}], queries, searches }
async function discover(topic, deps = {}) {
  const max = Number(process.env.PD_SEARCH_MAX || 5); const fetchImpl = deps.searchFetch;
  const queries = await planQueries(topic, deps);
  const plan = [{ q: `${topic.entity} latest annual report 10-K`, domains: ["sec.gov"] }, ...queries.map((q) => ({ q, domains: null }))].slice(0, max);
  const seen = new Map(); let searches = 0;
  for (const p of plan) {
    let results;
    try { results = await tavily(p.q, { fetchImpl, includeDomains: p.domains }); searches += 1; }
    catch (e) { if (e.code === "RATE_LIMIT") break; throw e; }
    for (const r of results) {
      let host = ""; try { host = new URL(r.url).hostname; } catch (e) { continue; }
      if (BAD_HOST.test(host) || /\.(pdf|zip|xlsx?)($|\?)/i.test(r.url) || seen.has(r.url)) continue;
      seen.set(r.url, { url: r.url, title: r.title, query: p.q, tier: Research.classifySource({ url: r.url }).tier || 4, score: r.score });
    }
  }
  // primary first (tier 1), then credible journalism (2), then the rest; best score first within a tier; max 2 pages per host
  const found = [...seen.values()].sort((a, b) => (a.tier - b.tier) || (b.score - a.score));
  const perHost = {}; const urls = [];
  for (const f of found) { const h = new URL(f.url).hostname; perHost[h] = (perHost[h] || 0) + 1; if (perHost[h] <= 2) urls.push(f.url); if (urls.length >= 10) break; }
  return { urls, found, queries, searches };
}

module.exports = { available, tavily, planQueries, discover, QUERIES_SCHEMA };
