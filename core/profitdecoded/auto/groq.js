"use strict";
// Groq provider for the autonomous stages (free tier available).
//
// Groq's web-search built-in (browser_search on the gpt-oss models) returns synthesized text, not the page
// text, and cannot be combined with structured outputs. So evidence is never trusted from the model:
//   1. the model searches (browser_search) and writes FACT | URL | QUOTE lines,
//   2. WE download each cited page ourselves (fetchPage),
//   3. a quote counts only if it really appears in the page text we downloaded.
// Everything downstream (claims, numbers, gate) uses only those verified quotes.
//
// Env: GROQ_API_KEY (env or .env), GROQ_MODEL (default openai/gpt-oss-120b), PD_FETCH_CONTACT (an email
// or URL for the User-Agent; sec.gov requires one), PD_AUTO_MAX_TOKENS (token guard, default 400000).

const fs = require("fs");
const path = require("path");
const { ROOT } = require("../config");
const { AutoError } = require("./llm");

const URL_CHAT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";

function apiKey() {
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) return process.env.GROQ_API_KEY.trim();
  if (process.env.NODE_TEST_CONTEXT) return "";
  try { for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) { const m = line.match(/^GROQ_API_KEY=(.*)$/); if (m && m[1].trim()) return m[1].trim(); } } catch (e) { /* optional */ }
  return "";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function extractJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  return null;
}

// One chat completion with bounded retries on 429/5xx (honours retry-after). Returns {text, usage, finish}.
async function chat({ system, messages, tools, schema, maxTokens = 8000, effort = "low", fetchImpl, key, sleepMs = sleep, maxRetries = 3 }) {
  const k = key || apiKey();
  if (!k) throw new AutoError("NO_KEY", "GROQ_API_KEY is not set (env or .env)");
  const body = { model: MODEL(), messages: [...(system ? [{ role: "system", content: system }] : []), ...messages], max_completion_tokens: maxTokens, reasoning_effort: effort, temperature: 0.3 };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = "required"; }
  if (schema && !(tools && tools.length)) body.response_format = { type: "json_schema", json_schema: { name: "result", schema } };
  const doFetch = fetchImpl || fetch;
  for (let attempt = 0; ; attempt += 1) {
    const res = await doFetch(URL_CHAT, { method: "POST", headers: { authorization: "Bearer " + k, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      const j = await res.json(); const c = (j.choices || [])[0] || {};
      if (c.finish_reason === "length") throw new AutoError("MAX_TOKENS", "Groq response hit the token limit: output would be truncated");
      return { text: (c.message && c.message.content) || "", usage: j.usage || {}, finish: c.finish_reason, raw: j };
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) throw new AutoError(res.status === 429 ? "RATE_LIMIT" : "HTTP", `Groq request failed: HTTP ${res.status}${res.status === 429 ? " (free-tier rate limit; try again later or lower the load)" : ""}`, { status: res.status });
    const ra = Number((res.headers && res.headers.get && res.headers.get("retry-after")) || 0);
    await sleepMs(Math.min(60000, (ra > 0 ? ra * 1000 : 2000 * 2 ** attempt)));
  }
}

// ---------- our own page fetch + quote verification ----------
function htmlToText(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|tr|li|h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();
}
const BLOCKED_HOSTS = /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/;
async function fetchPage(url, { fetchImpl, maxChars = 1500000, timeoutMs = 25000 } = {}) {
  let u; try { u = new URL(url); } catch (e) { return { ok: false, reason: "invalid URL" }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: "not http(s)" };
  if (BLOCKED_HOSTS.test(u.hostname)) return { ok: false, reason: "Wikipedia is not an allowed source" };
  const contact = process.env.PD_FETCH_CONTACT || "https://github.com/eyazan/youtube-otomasyon";
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await (fetchImpl || fetch)(url, { headers: { "user-agent": `ProfitDecodedResearch/1.0 (${contact})`, accept: "text/html,application/xhtml+xml,text/plain" }, signal: ctl.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = String((res.headers && res.headers.get && res.headers.get("content-type")) || "");
    if (/pdf|octet-stream|image|video/i.test(type)) return { ok: false, reason: `unsupported content type ${type}` };
    const raw = await res.text();
    const text = (/html|xml/i.test(type) || /^\s*</.test(raw) ? htmlToText(raw) : raw).slice(0, maxChars);
    const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    return { ok: true, url, title: title ? htmlToText(title).slice(0, 200) : "", text };
  } catch (e) { return { ok: false, reason: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(timer); }
}

const normText = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
function quoteInPage(quote, pageText) {
  const q = normText(quote).replace(/^"|"$/g, "").replace(/\.\.\.$|…$/, "").trim();
  if (q.length < 25) return false;               // a verifiable quote must be a real sentence fragment
  const p = normText(pageText);
  if (p.includes(q)) return true;
  // tolerate extraction noise: at least 90% of the quote's 4-word windows must occur verbatim
  const w = q.split(" "); if (w.length < 8) return false;
  let hit = 0, tot = 0; for (let i = 0; i + 4 <= w.length; i += 1) { tot += 1; if (p.includes(w.slice(i, i + 4).join(" "))) hit += 1; }
  return tot > 0 && hit / tot >= 0.9;
}

// Tolerant memo parsing: models decorate lines (bullets, bold, numbering, trailing periods, curly quotes).
// A usable line has an http(s) URL and a quoted fragment of >= 25 characters.
function parseMemoLines(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\*\*/g, "").replace(/^[\s>*\-\u2022\d.)]+/, "");
    const url = (line.match(/https?:\/\/[^\s|"\u201c\u201d<>]+/) || [])[0];
    if (!url) continue;
    const quotes = [...line.matchAll(/["\u201c]([^"\u201c\u201d]{25,}?)["\u201d]/g)].map((m) => m[1].trim());
    if (!quotes.length) continue;
    const factPart = line.split(/\|?\s*URL:|https?:\/\//i)[0].replace(/^FACT:\s*/i, "").replace(/[|:\s]+$/, "").trim();
    out.push({ fact: factPart || "(no fact label)", url: url.replace(/[)\].,;:]+$/, ""), quote: quotes[quotes.length - 1] });
  }
  return out;
}

// Every distinct http(s) URL anywhere in a response (text, citations, annotations): discovery that does not depend on formatting.
const IGNORE_HOSTS = /(^|\.)groq\.com$|(^|\.)exa\.ai$|(^|\.)googleapis\.com$|(^|\.)wikipedia\.org$/;
function urlsFromAnything(x, limit = 10) {
  const text = typeof x === "string" ? x : JSON.stringify(x || "");
  const seen = new Set(); const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s"'\\<>)\]},|]+/g)) {
    const u = m[0].replace(/[.,;:]+$/, ""); let host = "";
    try { host = new URL(u).hostname; } catch (e) { continue; }
    if (IGNORE_HOSTS.test(host) || seen.has(u)) continue;
    seen.add(u); out.push(u); if (out.length >= limit) break;
  }
  return out;
}

// Pick the passages of a page most likely to hold the facts (keyword + number density), within a character budget.
function selectPassages(text, keywords, maxChars = 5000, chunkSize = 700) {
  const chunk = Math.max(100, Math.min(chunkSize, maxChars));
  const kw = [...new Set(String(keywords || "").toLowerCase().split(/[^a-z0-9$%.]+/).filter((w) => w.length > 3))];
  const parts = []; const t = String(text || "");
  for (let i = 0; i < t.length; i += chunk) parts.push(t.slice(i, i + chunk));
  const scored = parts.map((p, i) => { const l = p.toLowerCase(); let sc = 0; for (const w of kw) if (l.includes(w)) sc += 2; sc += Math.min(4, (p.match(/\d[\d,.]*/g) || []).length * 0.4); return { p, i, sc }; }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
  const picked = []; let used = 0;
  for (const x of scored) { if (used + x.p.length > maxChars) { if (!picked.length) picked.push({ ...x, p: x.p.slice(0, maxChars) }); break; } picked.push(x); used += x.p.length; }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.p.trim()).join("\n...\n");
}

// Returns a docs Map compatible with evidence.js: only verified quotes become evidence text.
// `pages` (url key -> fetched page) can be shared between calls so a page is downloaded once.
async function verifyMemo(lines, deps = {}, pages = new Map(), docs = new Map()) {
  const rejected = [];
  const Ev = require("./evidence");
  for (const l of lines) {
    const key = Ev.urlKey(l.url);
    if (!pages.has(key)) pages.set(key, await fetchPage(l.url, deps));
    const page = pages.get(key);
    if (!page.ok) { rejected.push({ url: l.url, reason: `could not download the page (${page.reason})` }); continue; }
    if (!quoteInPage(l.quote, page.text)) { rejected.push({ url: l.url, reason: "quote does not appear in the downloaded page", quote: l.quote.slice(0, 120) }); continue; }
    if (!docs.has(key)) docs.set(key, { url: l.url, title: page.title, texts: [], opened: true, seenInSearch: true });
    if (!docs.get(key).texts.includes(l.quote)) docs.get(key).texts.push(l.quote);
  }
  return { docs, rejected, pages, pagesFetched: [...pages.values()].filter((p) => p.ok).length };
}

module.exports = { MODEL, apiKey, chat, fetchPage, htmlToText, quoteInPage, parseMemoLines, urlsFromAnything, selectPassages, verifyMemo, extractJson };
