"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = (m) => require("../../core/profitdecoded/auto/" + m);

const html = (title, body) => `<html><head><title>${title}</title><script>var x=1;</script></head><body><p>${body}</p></body></html>`;
const SEC = "https://www.sec.gov/Archives/edgar/data/1637207/plnt10k.htm";
const AER = "https://www.aeaweb.org/articles?id=10.1257%2Faer.96.3.694";
const FORT = "https://fortune.com/2024/05/10/planet-fitness-price-hike-classic-membership";
const PAGES = {
  [SEC]: html("PLNT 10-K", "At December 31, 2025 we had approximately 20.8 million members and 2,896 clubs. Members completed more than 650 million workouts in our clubs during the year."),
  [AER]: html("Paying Not to Go", "Members who choose a contract with a flat monthly fee of over $70 attend on average 4.3 times per month, according to the data."),
  [FORT]: html("Fortune", "Planet Fitness will raise the Classic membership from $10 to $15 a month, the first increase since 1998, the company said."),
};
const resp = (body, ok = true, status = 200, headers = {}) => ({ ok, status, headers: { get: (k) => headers[k.toLowerCase()] || (k.toLowerCase() === "content-type" ? "text/html" : null) }, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const pageFetch = (extra = {}) => async (url) => { const u = String(url); if (extra[u]) return extra[u]; return PAGES[u] ? resp(PAGES[u]) : resp("nope", false, 404); };
const chatBody = (content, usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, finish = "stop") => ({ choices: [{ message: { content }, finish_reason: finish }], usage });

test("groq: memo lines, quote verification and JSON extraction", () => {
  const G = A("groq");
  const lines = G.parseMemoLines(`reasoning...\nFACT: members | URL: ${SEC} | QUOTE: "we had approximately 20.8 million members and 2,896 clubs"\nCAVEAT: no capacity figure\nFACT: x | URL: https://a.gov/b). | QUOTE: “Members completed more than 650 million workouts in our clubs”`);
  assert.equal(lines.length, 2); assert.equal(lines[1].url, "https://a.gov/b");
  const page = G.htmlToText(PAGES[SEC]);
  assert.ok(!/var x/.test(page));
  assert.equal(G.quoteInPage("we had approximately 20.8 million members and 2,896 clubs", page), true);
  assert.equal(G.quoteInPage("We had  APPROXIMATELY 20.8 million members and 2,896 clubs", page), true);
  assert.equal(G.quoteInPage("we had approximately 99.9 million members and 4,000 clubs worldwide today", page), false);
  assert.equal(G.quoteInPage("20.8 million", page), false, "too short to be a verifiable quote");
  assert.deepEqual(G.extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(G.extractJson('here you go: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.equal(G.extractJson("no json"), null);
});

test("groq: our own page fetch refuses Wikipedia, non-http, errors, PDFs and times out cleanly", async () => {
  const G = A("groq");
  assert.equal((await G.fetchPage("https://en.wikipedia.org/wiki/X", { fetchImpl: pageFetch() })).ok, false);
  assert.match((await G.fetchPage("ftp://x/y", { fetchImpl: pageFetch() })).reason, /http/);
  assert.match((await G.fetchPage("https://x.gov/missing", { fetchImpl: pageFetch() })).reason, /HTTP 404/);
  assert.match((await G.fetchPage("https://x.gov/a.pdf", { fetchImpl: async () => resp("%PDF", true, 200, { "content-type": "application/pdf" }) })).reason, /unsupported content type/);
  const ok = await G.fetchPage(SEC, { fetchImpl: pageFetch() });
  assert.equal(ok.ok, true); assert.equal(ok.title, "PLNT 10-K"); assert.match(ok.text, /20\.8 million members/);
  const slow = await G.fetchPage("https://x.gov/slow", { timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.equal(slow.reason, "timeout");
  let ua = ""; await G.fetchPage(SEC, { fetchImpl: async (u, o) => { ua = o.headers["user-agent"]; return resp(PAGES[SEC]); } });
  assert.match(ua, /ProfitDecodedResearch\/1\.0 \(.+\)/);
});

test("groq chat: request shape, retries with retry-after, rate-limit and truncation errors, no key", async () => {
  const G = A("groq"); const calls = [];
  const ok = chatBody("hello");
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return resp(ok); };
  await G.chat({ system: "s", messages: [{ role: "user", content: "x" }], tools: [{ type: "browser_search" }], schema: { type: "object" }, key: "K", fetchImpl: f });
  const b = calls[0].body;
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions"); assert.equal(calls[0].init.headers.authorization, "Bearer K");
  assert.equal(b.model, "openai/gpt-oss-120b"); assert.deepEqual(b.tools, [{ type: "browser_search" }]); assert.equal(b.tool_choice, "required"); assert.equal(b.reasoning_effort, "low");
  assert.ok(!("response_format" in b), "browser_search cannot be combined with structured outputs");
  await G.chat({ messages: [], schema: { type: "object" }, key: "K", fetchImpl: f });
  assert.equal(calls[1].body.response_format.type, "json_schema"); assert.ok(!("tools" in calls[1].body));
  assert.ok(!calls[1].init.body.includes('"K"'), "key only in the header");
  let n = 0; const slept = [];
  const flaky = async () => (++n < 3 ? resp({}, false, 429, { "retry-after": "2" }) : resp(ok));
  assert.equal((await G.chat({ messages: [], key: "K", fetchImpl: flaky, sleepMs: async (ms) => slept.push(ms) })).text, "hello");
  assert.deepEqual(slept, [2000, 2000]);
  await assert.rejects(G.chat({ messages: [], key: "K", fetchImpl: async () => resp({}, false, 429), sleepMs: async () => {}, maxRetries: 1 }), (e) => e.code === "RATE_LIMIT" && /free-tier/.test(e.message));
  await assert.rejects(G.chat({ messages: [], key: "K", fetchImpl: async () => resp({}, false, 401) }), (e) => e.code === "HTTP" && e.status === 401);
  await assert.rejects(G.chat({ messages: [], key: "K", fetchImpl: async () => resp(chatBody("cut", {}, "length")) }), (e) => e.code === "MAX_TOKENS");
  await assert.rejects(G.chat({ messages: [], key: "", fetchImpl: f }).catch((e) => { if (process.env.GROQ_API_KEY) throw new Error("env key present"); throw e; }), (e) => e.code === "NO_KEY" || /env key present/.test(e.message));
});

test("provider selection: explicit env wins, otherwise Anthropic when keyed, else Groq", () => {
  const L = A("llm"); const save = { ...process.env };
  const set = (o) => { for (const k of ["PD_AUTO_PROVIDER", "ANTHROPIC_API_KEY", "GROQ_API_KEY"]) delete process.env[k]; Object.assign(process.env, o); };
  try {
    set({ GROQ_API_KEY: "g" }); assert.equal(L.provider(), "groq"); assert.equal(L.createClient().provider, "groq");
    set({ ANTHROPIC_API_KEY: "a", GROQ_API_KEY: "g" }); assert.equal(L.provider(), "anthropic");
    set({ ANTHROPIC_API_KEY: "a", GROQ_API_KEY: "g", PD_AUTO_PROVIDER: "groq" }); assert.equal(L.provider(), "groq");
    set({ PD_AUTO_PROVIDER: "groq" }); assert.throws(() => L.createClient(), (e) => e.code === "NO_KEY" && /GROQ_API_KEY/.test(e.message));
    set({}); assert.equal(L.provider(), "anthropic");
  } finally { for (const k of ["PD_AUTO_PROVIDER", "ANTHROPIC_API_KEY", "GROQ_API_KEY"]) { if (save[k] === undefined) delete process.env[k]; else process.env[k] = save[k]; } }
});

test("LLM.run on Groq returns parsed JSON, accumulates tokens and enforces the token guard", async () => {
  const L = A("llm"); const ledger = L.newLedger(5); ledger.maxTokens = 200;
  const client = { provider: "groq", key: "K", fetch: async () => resp(chatBody('{"ok":true}')) };
  const r = await L.run({ client, system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" }, ledger });
  assert.deepEqual(r.json, { ok: true }); assert.equal(ledger.tokens, 150); assert.equal(ledger.calls, 1);
  await L.run({ client, system: "s", messages: [], ledger });
  await assert.rejects(L.run({ client, system: "s", messages: [], ledger }), (e) => e.code === "BUDGET" && /token guard/.test(e.message));
  await assert.rejects(L.run({ client: { ...client, fetch: async () => resp(chatBody("not json")) }, system: "s", messages: [], schema: { type: "object" }, ledger: L.newLedger(5) }), (e) => e.code === "BAD_JSON");
});

// ---- end to end: search finds sources + quotes, WE verify them against downloaded pages ----
const dossierDraft = (over = {}) => ({
  thesis: "Planet Fitness can charge a very low price partly because its clubs are sized for the share of members who actually show up and the filings point to that share being small.",
  angle: "capacity arithmetic from the company's own numbers", contradictions: [{ id: "k1", status: "resolved", note: "the filing never states the mechanism; presented as our arithmetic" }],
  sources: [
    { id: "s1", type: "10-k", publisher: "Planet Fitness, Inc. / SEC", title: "10-K FY2025", url: SEC, date: "2026-02" },
    { id: "s2", type: "academic", publisher: "American Economic Review", title: "Paying Not to Go to the Gym", url: AER, date: "2006-06" },
    { id: "s3", type: "journalism", publisher: "Fortune", title: "Price hike", url: FORT, date: "2024-05-10" },
  ],
  claims: [
    { id: "c1", central: true, text: "Planet Fitness had approximately 20.8 million members and 2,896 clubs.", numbers: ["20.8", "2,896"], sourceIds: ["s1"] },
    { id: "c2", central: true, text: "Members completed more than 650 million workouts.", numbers: ["650"], sourceIds: ["s1"] },
    { id: "c3", central: false, text: "Members attended 4.3 times a month.", numbers: ["4.3"], sourceIds: ["s2"] },
    { id: "c4", central: false, text: "Members pay 999 dollars a year.", numbers: ["999"], sourceIds: ["s1"] },
  ],
  inferences: [{ id: "i1", text: "20.8 million over 2,896 clubs is about 7,200 members per club.", numbers: ["7,200"], basisClaimIds: ["c1"] }],
  ...over,
});
const MEMO = `thinking...\nFACT: members and clubs | URL: ${SEC} | QUOTE: "we had approximately 20.8 million members and 2,896 clubs"\nFACT: workouts | URL: ${SEC} | QUOTE: "Members completed more than 650 million workouts in our clubs during the year"\nFACT: attendance | URL: ${AER} | QUOTE: "flat monthly fee of over $70 attend on average 4.3 times per month"\nFACT: price | URL: ${FORT} | QUOTE: "raise the Classic membership from $10 to $15 a month, the first increase since 1998"\nCAVEAT: the filing does not state the non-attendance mechanism`;
function groqClient(responses) { let i = 0; const calls = []; return { calls, provider: "groq", key: "K", fetch: async (url, init) => { calls.push(JSON.parse(init.body)); const r = responses[Math.min(i, responses.length - 1)]; i += 1; return resp(chatBody(typeof r === "string" ? r : JSON.stringify(r))); } }; }
const topic = () => ({ id: "hbm-001", topic: "Why Gyms Make More Money When You Stay Home", entity: "Planet Fitness", pillar: "hidden-business-models", coreQuestion: "Why?" });

test("groq research: only quotes verified on pages we downloaded become evidence; the unsupported figure is dropped", async () => {
  const R = A("research-agent"); const L = A("llm");
  const client = groqClient([MEMO, dossierDraft()]);
  const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, now: new Date("2026-10-06") });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  assert.deepEqual(r.dossier.claims.map((c) => c.id).sort(), ["c1", "c2", "c3"]);
  assert.match(r.dropped.find((d) => d.id === "c4").reason, /"999" is not in the text/);
  assert.equal(r.pagesFetched, 3);
  assert.deepEqual(client.calls[0].tools, [{ type: "browser_search" }]); assert.equal(client.calls[0].tool_choice, "required");
  assert.ok(!("response_format" in client.calls[0]) && client.calls[1].response_format.type === "json_schema");
  assert.match(client.calls[1].messages.at(-1).content, /verified quotes|EVIDENCE/);
  assert.ok(r.ledger.tokens > 0);
});

test("groq research: fabricated quotes, dead links and Wikipedia are rejected, never trusted", async () => {
  const R = A("research-agent"); const L = A("llm");
  const fake = `FACT: x | URL: ${SEC} | QUOTE: "Planet Fitness had forty million members and a secret attendance ledger kept offline"\nFACT: y | URL: https://dead.example.gov/z | QUOTE: "this page does not exist anywhere on the internet at all"\nFACT: z | URL: https://en.wikipedia.org/wiki/Planet_Fitness | QUOTE: "Planet Fitness is an American franchisor of fitness centers"`;
  const r = await R.research(topic(), "short", { client: groqClient([fake, dossierDraft()]), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() } });
  assert.equal(r.status, "research-failed"); assert.match(r.reasons[0], /no quote could be verified/);
  assert.deepEqual(r.dropped.map((d) => d.reason.split(" (")[0]).sort(), ["could not download the page", "could not download the page", "quote does not appear in the downloaded page"]);
  const none = await R.research(topic(), "short", { client: groqClient(["I found nothing useful."]), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() } });
  assert.equal(none.status, "research-failed"); assert.match(none.reasons[0], /no usable FACT/);
});

test("groq script stage reuses the same gates and rewrite loop", async () => {
  const W = A("script-agent"); const L = A("llm"); const fs = require("fs"); const path = require("path");
  const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "channels/profitdecoded/dryruns/short-costco-membership/bundle.json"), "utf8"));
  const dossier = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "channels/profitdecoded/research/cs-001-why-costco-wants-membership-more-than-sales.json"), "utf8"));
  const good = { hookCandidates: bundle.hookCandidates, beats: bundle.beats.map(({ id, type, text, claimId }) => ({ id, type, text, claimId })), graphics: Object.entries(bundle.graphicSpecs).flatMap(([beatId, specs]) => specs.map((s) => ({ beatId, type: s.type, entities: s.entities, overlayText: s.overlayText, numbers: s.numbers, evidenceClaimId: s.evidenceClaimId }))), titleCandidates: bundle.titleCandidates, thumbnailCandidates: bundle.thumbnailCandidates.map((t) => ({ id: t.id, dominantObject: t.dominantObject, text: t.text, elementCount: t.elementCount, contradiction: t.contradiction, composition: t.composition, contrast: t.contrast, numberShown: t.numberShown })), learningValue: "x" };
  const bad = JSON.parse(JSON.stringify(good)); bad.beats[3].text = "Fees were about 73% of operating income.";
  const client = groqClient([bad, good]);
  const r = await W.write({ id: "cs", topic: "Why Costco Wants Membership More Than Sales", entity: "Costco", pillar: "company-stories" }, dossier, "short", { client, ledger: L.newLedger(5) });
  assert.equal(r.status, "ok"); assert.equal(r.rounds.length, 2);
  assert.match(client.calls[1].messages.at(-1).content, /number "73/);
  assert.equal(client.calls[0].response_format.type, "json_schema");
});

test("groq: tolerant memo parsing, URL discovery from anywhere in a response, passage selection", () => {
  const G = A("groq");
  const lines = G.parseMemoLines(`1. **FACT:** Members | **URL:** ${SEC} | **QUOTE:** \u201cwe had approximately 20.8 million members and 2,896 clubs\u201d.\n- Workouts \u2014 ${SEC}: "Members completed more than 650 million workouts in our clubs during the year"\nplain line with no link or quote\nFACT: short | URL: ${AER} | QUOTE: "too short"`);
  assert.equal(lines.length, 2); assert.equal(lines[0].url, SEC); assert.match(lines[1].quote, /650 million workouts/);
  assert.deepEqual(G.urlsFromAnything({ message: `see ${AER}, and (https://en.wikipedia.org/wiki/X) https://api.groq.com/x`, annotations: [{ url: FORT }, { url: FORT }] }), [AER, FORT]);
  const t = "alpha ".repeat(300) + " Planet Fitness reported 20.8 million members in 2,896 clubs. " + "beta ".repeat(300);
  const sel = G.selectPassages(t, "planet fitness members clubs", 800);
  assert.match(sel, /20\.8 million members/); assert.ok(sel.length <= 800);
  assert.match(G.selectPassages(t, "planet fitness members clubs", 300), /Planet Fitness/, "a single over-budget chunk is truncated, not dropped");
  assert.equal(G.selectPassages("nothing relevant here at all", "planet fitness", 500), "");
});

test("groq research: unparseable memo falls back to URLs + our own passage selection + verified quote extraction", async () => {
  const R = A("research-agent"); const L = A("llm"); const fs = require("fs"); const os = require("os"); const path = require("path");
  const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-dbg-"));
  const prose = `I looked at the filings. The key page is ${SEC} and the study is at ${AER} (see also ${FORT}). Members are numerous and attendance is modest.`;
  const quotes = { quotes: [
    { url: SEC, fact: "members and clubs", quote: "we had approximately 20.8 million members and 2,896 clubs" },
    { url: SEC, fact: "workouts", quote: "Members completed more than 650 million workouts in our clubs during the year" },
    { url: AER, fact: "attendance", quote: "attend on average 4.3 times per month" },
    { url: FORT, fact: "price", quote: "raise the Classic membership from $10 to $15 a month, the first increase since 1998" },
    { url: SEC, fact: "invented", quote: "the company secretly measures attendance at every club every single day" },
  ] };
  const client = groqClient([prose, quotes, dossierDraft()]);
  const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir, now: new Date("2026-10-06") });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons)); assert.equal(r.usedFallback, true);
  assert.ok(r.dropped.some((d) => /does not appear/.test(d.reason)), "the invented quote is rejected");
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[1].response_format.type, "json_schema");
  const userMsg = client.calls[1].messages.find((m) => m.role === "user").content;
  assert.match(userMsg, /PAGES/); assert.match(userMsg, /20\.8 million members/);
  assert.ok(fs.readdirSync(debugDir).some((f) => /groq-memo\.txt$/.test(f)) && fs.readdirSync(debugDir).some((f) => /groq-quotes\.json$/.test(f)));
  assert.match(fs.readFileSync(path.join(debugDir, fs.readdirSync(debugDir).find((f) => /memo/.test(f))), "utf8"), /key page is/);
  // memo with usable lines takes the cheap path (2 verified sources) and skips the fallback call
  const c2 = groqClient([MEMO, dossierDraft()]);
  const ok = await R.research(topic(), "short", { client: c2, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir, now: new Date("2026-10-06") });
  assert.equal(ok.status, "ok"); assert.equal(ok.usedFallback, false); assert.equal(c2.calls.length, 2);
  // nothing usable anywhere: still a clean failure, never an invention
  const none = await R.research(topic(), "short", { client: groqClient(["no links, no quotes"]), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir });
  assert.equal(none.status, "research-failed"); assert.match(none.reasons[0], /no usable FACT/);
});

test("groq research: the discovery prompt asks for a small search budget (free-tier tokens)", async () => {
  const R = A("research-agent"); const L = A("llm"); const client = groqClient(["nothing"]);
  await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir: require("os").tmpdir() });
  const sys = client.calls[0].messages.find((m) => m.role === "system").content;
  assert.match(sys, /at most 3 searches and open at most 4 pages/);
  assert.match(client.calls[0].messages.find((m) => m.role === "user").content, /Topic: /);
  assert.equal(client.calls[0].max_completion_tokens, 8000);
});
