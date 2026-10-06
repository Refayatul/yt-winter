"use strict";
// Primary-source discovery from the SEC's official, documented JSON APIs (free, no key):
//   https://www.sec.gov/files/company_tickers.json            name -> CIK
//   https://data.sec.gov/submissions/CIK##########.json        a company's filings
// The SEC's fair-access policy REQUIRES a User-Agent that declares who is calling (an e-mail address).
// Set PD_FETCH_CONTACT to that address (GitHub variable); without it sec.gov requests are not made.

const T = require("../text");
const G = require("./groq");

const NOISE = new Set(["inc", "corp", "corporation", "co", "company", "ltd", "llc", "plc", "the", "new", "holdings", "holding", "group", "de", "sa", "nv", "lp", "class", "common", "stock", "wholesale", "international"]);
const sig = (s) => T.words(String(s || "").replace(/[^A-Za-z0-9 ]+/g, " ")).filter((w) => w.length > 1 && !NOISE.has(w));

async function getJson(url, deps) {
  const page = await G.fetchPage(url, { ...deps, maxChars: 40000000 });
  if (!page.ok) return { ok: false, reason: `${page.reason} for ${url}` };
  try { return { ok: true, json: JSON.parse(page.text) }; } catch (e) { return { ok: false, reason: `response was not JSON (${url})` }; }
}

// Best registrant for an entity name ("Planet Fitness" -> Planet Fitness, Inc.). Requires strong agreement; wrong company is worse than none.
async function findRegistrant(entity, deps = {}) {
  const r = await getJson("https://www.sec.gov/files/company_tickers.json", deps);
  if (!r.ok) return { ok: false, reason: r.reason };
  const want = sig(entity); if (!want.length) return { ok: false, reason: "entity has no distinctive words" };
  let best = null;
  for (const row of Object.values(r.json)) {
    const have = sig(row.title); if (!have.length) continue;
    const inter = want.filter((w) => have.includes(w)).length;
    const score = inter / Math.max(want.length, have.length);
    // all words of the entity must appear in the registrant name, and the name must not be much longer
    if (inter === want.length && score >= 0.5 && (!best || score > best.score)) best = { score, cik: row.cik_str, title: row.title, ticker: row.ticker };
  }
  return best ? { ok: true, ...best } : { ok: false, reason: `no SEC registrant matches "${entity}" (private company, subsidiary, or brand name)` };
}

const pad10 = (cik) => String(cik).padStart(10, "0");
async function latestFilings(cik, { forms = ["10-K"], limit = 1 } = {}, deps = {}) {
  const r = await getJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`, deps);
  if (!r.ok) return { ok: false, reason: r.reason };
  const f = (r.json.filings && r.json.filings.recent) || {}; const out = [];
  for (let i = 0; i < (f.form || []).length && out.length < limit * forms.length; i += 1) {
    if (!forms.includes(f.form[i])) continue;
    out.push({ form: f.form[i], filed: f.filingDate[i], url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(f.accessionNumber[i]).replace(/-/g, "")}/${f.primaryDocument[i]}`, company: r.json.name });
  }
  const byForm = {}; return { ok: true, filings: out.filter((x) => { byForm[x.form] = (byForm[x.form] || 0) + 1; return byForm[x.form] <= limit; }) };
}

// Fallback when the ticker file is unavailable: the SEC's public full-text search (needs the same declared User-Agent).
async function searchFilings(entity, deps = {}) {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"' + entity + '"')}&forms=10-K`;
  const r = await getJson(url, deps);
  if (!r.ok) return { ok: false, reason: r.reason };
  const want = sig(entity); const hits = (r.json.hits && r.json.hits.hits) || [];
  const rows = hits.map((h) => ({ id: String(h._id || ""), s: h._source || {} })).filter((h) => h.id.includes(":") && (h.s.ciks || []).length)
    .filter((h) => { const names = (h.s.display_names || []).map(sig); return names.some((n) => want.every((w) => n.includes(w))); })
    .sort((a, b) => String(b.s.file_date || "").localeCompare(String(a.s.file_date || "")));
  if (!rows.length) return { ok: false, reason: `no 10-K found in SEC full-text search for "${entity}"` };
  const top = rows[0]; const [adsh, file] = top.id.split(":"); const cik = Number(top.s.ciks[0]);
  return { ok: true, filings: [{ form: "10-K", filed: top.s.file_date, url: `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${file}`, company: (top.s.display_names || [])[0] }] };
}

// Candidate primary-source URLs for an entity (latest 10-K). Never throws: SEC problems are returned as notes.
async function candidates(entity, deps = {}) {
  const contact = deps.contact !== undefined ? deps.contact : process.env.PD_FETCH_CONTACT;
  if (!/@/.test(String(contact || ""))) return { urls: [], note: "SEC lookup skipped: set PD_FETCH_CONTACT to a contact e-mail address (sec.gov requires a declared User-Agent)" };
  const reg = await findRegistrant(entity, deps);
  if (reg.ok) {
    const f = await latestFilings(reg.cik, { forms: ["10-K"], limit: 1 }, deps);
    if (f.ok && f.filings.length) return { urls: f.filings.map((x) => x.url), registrant: reg, filings: f.filings };
    reg.note = f.reason || "no 10-K found in the submissions list";
  }
  // company_tickers.json unavailable or no match: try full-text search before giving up
  const fts = await searchFilings(entity, deps);
  if (fts.ok) return { urls: fts.filings.map((x) => x.url), filings: fts.filings, note: `registrant lookup: ${reg.reason || reg.note}; used full-text search` };
  return { urls: [], note: `${reg.reason || reg.note}; ${fts.reason}` };
}

module.exports = { findRegistrant, latestFilings, searchFilings, candidates, sig };
