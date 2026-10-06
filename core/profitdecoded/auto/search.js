"use strict";
// Web discovery through a search API instead of a token-hungry browsing tool. Providers (first key found wins,
// or PD_SEARCH_PROVIDER): Exa (free credits every month), Serper (2,500 free Google queries), Tavily (1,000 credits/month).
// The search only returns candidate URLs; the pages are downloaded and every quote verified by our own code.
// Env: EXA_API_KEY / SERPER_API_KEY / TAVILY_API_KEY (env or .env), PD_SEARCH_PROVIDER, PD_SEARCH_MAX (searches per topic, default 5).

const LLM = require("./llm");
const Research = require("../research");

// ---------- providers ----------
// All return [{ url, title, content, score }]. `domains` restricts results to those hosts.
const KEYS = { exa: "EXA_API_KEY", serper: "SERPER_API_KEY", tavily: "TAVILY_API_KEY" };
const ORDER = ["exa", "serper", "tavily"]; // preference when several keys exist
function providerName() {
  const forced = (process.env.PD_SEARCH_PROVIDER || "").toLowerCase();
  if (KEYS[forced] && LLM.envKey(KEYS[forced])) return forced;
  return ORDER.find((n) => LLM.envKey(KEYS[n])) || null;
}
const available = () => providerName();

async function failure(name, res) {
  let msg = ""; try { const j = await res.json(); msg = String((j && ((j.detail && (j.detail.error || j.detail)) || j.error || j.message)) || "").slice(0, 200); } catch (e) { /* no body */ }
  const limited = res.status === 429 || res.status === 432 || res.status === 433 || (res.status === 402) || (res.status === 403 && /credit|quota|limit/i.test(msg));
  return new LLM.AutoError(limited ? "RATE_LIMIT" : "HTTP", `${name} search failed: HTTP ${res.status}${msg ? ` (${msg})` : ""}${res.status === 402 ? " (out of free credits)" : ""}`, { status: res.status });
}

async function tavily(query, { fetchImpl, key, includeDomains, maxResults = 8 } = {}) {
  const k = key || LLM.envKey("TAVILY_API_KEY");
  if (!k) throw new LLM.AutoError("NO_KEY", "TAVILY_API_KEY is not set");
  const body = { query, search_depth: "basic", max_results: maxResults, include_answer: false, include_raw_content: false };
  if (includeDomains && includeDomains.length) body.include_domains = includeDomains;
  const res = await (fetchImpl || fetch)("https://api.tavily.com/search", { method: "POST", headers: { authorization: "Bearer " + k, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await failure("Tavily", res);
  const j = await res.json();
  return (j.results || []).filter((r) => r && r.url).map((r) => ({ url: r.url, title: r.title || "", content: String(r.content || "").slice(0, 400), score: r.score || 0 }));
}

// Serper: Google results as JSON. 2,500 free queries on signup, no card. Domain restriction = site: operator.
async function serper(query, { fetchImpl, key, includeDomains, maxResults = 8 } = {}) {
  const k = key || LLM.envKey("SERPER_API_KEY");
  if (!k) throw new LLM.AutoError("NO_KEY", "SERPER_API_KEY is not set");
  const q = includeDomains && includeDomains.length ? `${query} ${includeDomains.map((d) => "site:" + d).join(" OR ")}` : query;
  const res = await (fetchImpl || fetch)("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": k, "content-type": "application/json" }, body: JSON.stringify({ q, num: maxResults, gl: "us", hl: "en" }) });
  if (!res.ok) throw await failure("Serper", res);
  const j = await res.json();
  return (j.organic || []).filter((r) => r && r.link).map((r, i) => ({ url: r.link, title: r.title || "", content: String(r.snippet || "").slice(0, 400), score: 1 - i * 0.05 }));
}

// Exa: neural search. Free credits every month, no card. Domain restriction = includeDomains.
async function exa(query, { fetchImpl, key, includeDomains, maxResults = 8 } = {}) {
  const k = key || LLM.envKey("EXA_API_KEY");
  if (!k) throw new LLM.AutoError("NO_KEY", "EXA_API_KEY is not set");
  const body = { query, type: "auto", numResults: maxResults };
  if (includeDomains && includeDomains.length) body.includeDomains = includeDomains;
  const res = await (fetchImpl || fetch)("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": k, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await failure("Exa", res);
  const j = await res.json();
  return (j.results || []).filter((r) => r && r.url).map((r, i) => ({ url: r.url, title: r.title || "", content: String(r.text || r.summary || "").slice(0, 400), score: typeof r.score === "number" ? r.score : 1 - i * 0.05 }));
}
const PROVIDERS = { tavily, serper, exa };
const searchWith = (name, query, opts) => PROVIDERS[name](query, opts);

const QUERIES_SCHEMA = { type: "object", additionalProperties: false, required: ["queries"], properties: { queries: { type: "array", items: { type: "string" } } } };
const BAD_HOST = /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$|(^|\.)reddit\.com$|(^|\.)quora\.com$|(^|\.)pinterest\.|(^|\.)facebook\.com$|(^|\.)tiktok\.com$|(^|\.)youtube\.com$|(^|\.)medium\.com$/;

// Queries: one aimed at the company's own annual report/filings (restricted to sec.gov), the rest generic.
async function planQueries(topic, deps) {
  const today = (deps.today || new Date()).toISOString().slice(0, 10);
  const r = await LLM.run({ client: deps.client, ledger: deps.ledger, light: true, system: `You plan web searches for a business-research desk. Today is ${today}; prefer the most recent filings and sources. The TOPIC title is a hypothesis about HOW A COMPANY EARNS MONEY or why it prices/designs something a certain way. Interpret it as a business-model question (revenue sources, pricing, capacity, incentives, contracts), NOT as news, a trend, remote work, or a pandemic story. Write 4 short, specific search queries (<= 12 words each) that would surface: (1) the company's latest annual report (10-K) or filing that states the figures, (2) regulator or academic evidence on the underlying mechanism, (3) respected business journalism on the mechanism, (4) the key figure or claim implied by the title. No site: operators, no years unless needed.`, messages: [{ role: "user", content: `TOPIC: ${topic.topic}\nENTITY: ${topic.entity}\nCORE QUESTION: ${topic.coreQuestion}\nPILLAR: ${topic.pillar}` }], schema: QUERIES_SCHEMA, maxTokens: 1500, effort: "low" });
  return (r.json.queries || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
}

// Returns { urls: [url...], found: [{url,title,tier,query}], queries, searches }
async function discover(topic, deps = {}) {
  const max = Number(process.env.PD_SEARCH_MAX || 5); const fetchImpl = deps.searchFetch;
  const queries = await planQueries(topic, deps);
  const plan = [{ q: `${topic.entity} annual report 10-K ${(deps.today || new Date()).getUTCFullYear() - 1}`, domains: ["sec.gov"] }, ...queries.map((q) => ({ q, domains: null }))].slice(0, max);
  const seen = new Map(); let searches = 0;
  for (const p of plan) {
    let results;
    try { results = await searchWith(deps.provider || providerName(), p.q, { fetchImpl, includeDomains: p.domains }); searches += 1; }
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

module.exports = { available, providerName, tavily, serper, exa, planQueries, discover, QUERIES_SCHEMA, KEYS };
