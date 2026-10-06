"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = (m) => require("../../core/profitdecoded/auto/" + m);
for (const k of ["TAVILY_API_KEY", "SERPER_API_KEY", "EXA_API_KEY", "PD_SEARCH_PROVIDER"]) delete process.env[k]; // tests are hermetic: no real search key
process.env.PD_FETCH_CONTACT = "tests@example.org"; // sec.gov refuses undeclared tools; real runs set this to a real contact e-mail

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
  assert.match(ua, /^ProfitDecodedResearch( |\/1\.0 \()/);
});

test("groq chat: request shape, retries with retry-after, rate-limit and truncation errors, no key", async () => {
  const G = A("groq"); const calls = [];
  const ok = chatBody("hello");
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return resp(ok); };
  await G.chat({ system: "s", messages: [{ role: "user", content: "x" }], tools: [{ type: "browser_search" }], schema: { type: "object" }, key: "K", fetchImpl: f });
  const b = calls[0].body;
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions"); assert.equal(calls[0].init.headers.authorization, "Bearer K");
  assert.equal(b.model, "openai/gpt-oss-20b", "browsing uses the smaller model (its own free-tier quota)"); assert.deepEqual(b.tools, [{ type: "browser_search" }]); assert.equal(b.tool_choice, "required"); assert.equal(b.reasoning_effort, "low");
  assert.ok(!("response_format" in b), "browser_search cannot be combined with structured outputs");
  await G.chat({ messages: [], schema: { type: "object" }, key: "K", fetchImpl: f });
  assert.equal(calls[1].body.response_format.type, "json_schema"); assert.ok(!("tools" in calls[1].body)); assert.equal(calls[1].body.model, "openai/gpt-oss-120b");
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
// router: (body) => response, used when calls are not strictly sequential (per-page extraction)
function routedClient(router) { const calls = []; return { calls, provider: "groq", key: "K", fetch: async (url, init) => { const body = JSON.parse(init.body); calls.push(body); const r = router(body); return resp(chatBody(typeof r === "string" ? r : JSON.stringify(r))); } }; }
const sysOf = (b) => (b.messages.find((m) => m.role === "system") || {}).content || "";
const userOf = (b) => (b.messages.find((m) => m.role === "user") || {}).content || "";
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

test("groq research: unparseable memo falls back to URLs + our own passage selection + per-page verified quote extraction", async () => {
  const R = A("research-agent"); const L = A("llm"); const fs = require("fs"); const os = require("os"); const path = require("path");
  const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-dbg-"));
  const prose = `I looked at the filings. The key page is ${SEC} and the study is at ${AER} (see also ${FORT}). Members are numerous and attendance is modest.`;
  const perPage = {
    [SEC]: [{ url: SEC, fact: "members and clubs", quote: "we had approximately 20.8 million members and 2,896 clubs" }, { url: SEC, fact: "workouts", quote: "Members completed more than 650 million workouts in our clubs during the year" }, { url: SEC, fact: "invented", quote: "the company secretly measures attendance at every club every single day" }],
    [AER]: [{ url: AER, fact: "attendance", quote: "attend on average 4.3 times per month" }],
    [FORT]: [{ url: FORT, fact: "price", quote: "raise the Classic membership from $10 to $15 a month, the first increase since 1998" }],
  };
  const client = routedClient((b) => {
    if (b.tools) return prose;
    if (/You extract evidence/.test(sysOf(b))) { const u = Object.keys(perPage).find((k) => userOf(b).includes(k)); return { quotes: perPage[u] || [] }; }
    return dossierDraft();
  });
  const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir, now: new Date("2026-10-06") });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons)); assert.equal(r.usedFallback, true);
  assert.ok(r.dropped.some((d) => /does not appear/.test(d.reason)), "the invented quote is rejected");
  const extractCalls = client.calls.filter((b) => /You extract evidence/.test(sysOf(b)));
  assert.equal(extractCalls.length, 3, "one small call per page");
  assert.ok(extractCalls.every((b) => b.max_completion_tokens === 4500 && b.response_format.type === "json_schema"));
  assert.ok(extractCalls.every((b) => (userOf(b).match(/https?:\/\//g) || []).length >= 1 && /PAGE:/.test(userOf(b))));
  assert.ok(fs.readdirSync(debugDir).some((f) => /groq-memo\.txt$/.test(f)) && fs.readdirSync(debugDir).some((f) => /groq-quotes\.json$/.test(f)));
  // the structuring step requires a recorded contradiction check
  const dossierCall = client.calls.find((b) => /convert verified quotes/.test(sysOf(b)));
  assert.match(sysOf(dossierCall), /contradictions MUST contain at least one entry/);
  // memo with usable lines takes the cheap path (3 verified sources incl. a primary one) and skips extraction
  const c2 = groqClient([MEMO, dossierDraft()]);
  const ok = await R.research(topic(), "short", { client: c2, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir, now: new Date("2026-10-06") });
  assert.equal(ok.status, "ok"); assert.equal(ok.usedFallback, false); assert.equal(c2.calls.length, 2);
  const none = await R.research(topic(), "short", { client: groqClient(["no links, no quotes"]), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir });
  assert.equal(none.status, "research-failed"); assert.match(none.reasons[0], /no usable FACT/);
});

test("groq research: extraction stops cleanly on the free-tier rate limit; a rate limit elsewhere is a clean error, never a topic failure", async () => {
  const R = A("research-agent"); const L = A("llm");
  let n = 0;
  const mk = (limitStructuring) => ({ provider: "groq", key: "K", sleep: async () => {}, fetch: async (url, init) => { const b = JSON.parse(init.body); if (b.tools) return resp(chatBody(`see ${SEC} and ${AER}`)); if (/You extract evidence/.test(sysOf(b))) { n += 1; return n === 1 ? resp(chatBody(JSON.stringify({ quotes: [{ url: SEC, fact: "f", quote: "we had approximately 20.8 million members and 2,896 clubs" }] }))) : resp({}, false, 429); } return limitStructuring ? resp({}, false, 429) : resp(chatBody(JSON.stringify(dossierDraft()))); } });
  const r = await R.research(topic(), "short", { client: mk(false), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir: require("os").tmpdir() });
  assert.ok(r.dropped.some((d) => /extraction stopped: .*rate limit/i.test(d.reason)), JSON.stringify(r.dropped));
  assert.ok(r.evidenceCount >= 1, "what was verified before the limit is kept");
  n = 0;
  await assert.rejects(R.research(topic(), "short", { client: mk(true), ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir: require("os").tmpdir() }), (e) => e.code === "RATE_LIMIT");
});

test("groq research: the discovery prompt asks for a small search budget (free-tier tokens)", async () => {
  const R = A("research-agent"); const L = A("llm"); const client = groqClient(["nothing"]);
  await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir: require("os").tmpdir() });
  const sys = client.calls[0].messages.find((m) => m.role === "system").content;
  assert.match(sys, /at most 3 searches and open at most 4 pages/);
  assert.match(client.calls[0].messages.find((m) => m.role === "user").content, /Topic: /);
  assert.equal(client.calls[0].max_completion_tokens, 8000);
});

// ---------- SEC: declared User-Agent, official JSON APIs, block-page detection ----------
const TICKERS = { 0: { cik_str: 1637207, ticker: "PLNT", title: "Planet Fitness, Inc." }, 1: { cik_str: 909832, ticker: "COST", title: "COSTCO WHOLESALE CORP /NEW" }, 2: { cik_str: 1, ticker: "XX", title: "Planet Fitness Holdings Worldwide Franchise Group Ltd Spin" } };
const SUBS = { name: "Planet Fitness, Inc.", filings: { recent: { form: ["8-K", "10-K", "10-Q", "10-K"], accessionNumber: ["0001637207-26-000010", "0001637207-26-000021", "0001637207-26-000030", "0001637207-25-000016"], primaryDocument: ["a.htm", "plnt10-k12312025_ars.htm", "q.htm", "plnt-20241231.htm"], filingDate: ["2026-03-01", "2026-02-20", "2026-05-01", "2025-02-20"] } } };
const secFetch = (seen = []) => async (url, init) => { seen.push({ url: String(url), ua: init && init.headers && init.headers["user-agent"] }); const u = String(url); if (u.endsWith("company_tickers.json")) return resp(JSON.stringify(TICKERS)); if (u.includes("data.sec.gov/submissions/CIK0001637207.json")) return resp(JSON.stringify(SUBS)); return resp("nope", false, 404); };

test("SEC pages need a declared contact e-mail; the block page is recognised, never mistaken for evidence", async () => {
  const G = A("groq"); const save = process.env.PD_FETCH_CONTACT;
  try {
    delete process.env.PD_FETCH_CONTACT;
    const refused = await G.fetchPage(SEC, { fetchImpl: pageFetch() });
    assert.equal(refused.ok, false); assert.match(refused.reason, /PD_FETCH_CONTACT/);
    process.env.PD_FETCH_CONTACT = "research@example.org";
    const seen = []; const ok = await G.fetchPage(SEC, { fetchImpl: async (u, o) => { seen.push(o.headers["user-agent"]); return resp(PAGES[SEC]); } });
    assert.equal(ok.ok, true); assert.equal(seen[0], "ProfitDecodedResearch research@example.org");
    const blocked = await G.fetchPage(SEC, { fetchImpl: async () => resp("<html><title>SEC.gov | Your Request Originates from an Undeclared Automated Tool</title></html>") });
    assert.equal(blocked.ok, false); assert.match(blocked.reason, /blocked the automated request/);
    process.env.PD_FETCH_CONTACT = "https://github.com/x/y";
    let ua = ""; await G.fetchPage("https://fortune.com/a", { fetchImpl: async (u, o) => { ua = o.headers["user-agent"]; return resp("<p>x</p>"); } });
    assert.equal(ua, "ProfitDecodedResearch/1.0 (https://github.com/x/y)", "non-SEC sites accept a URL contact");
  } finally { if (save === undefined) delete process.env.PD_FETCH_CONTACT; else process.env.PD_FETCH_CONTACT = save; }
});

test("EDGAR: registrant matching is strict, the latest 10-K URL is built from the official submissions JSON", async () => {
  const E = A("edgar");
  const seen = []; const deps = { fetchImpl: secFetch(seen), contact: "research@example.org" };
  const reg = await E.findRegistrant("Planet Fitness", deps);
  assert.equal(reg.ok, true); assert.equal(reg.cik, 1637207); assert.equal(reg.title, "Planet Fitness, Inc.");
  assert.equal((await E.findRegistrant("Costco", deps)).title, "COSTCO WHOLESALE CORP /NEW");
  assert.equal((await E.findRegistrant("Temu", deps)).ok, false, "a private company / brand is not force-matched");
  const f = await E.latestFilings(1637207, { forms: ["10-K"], limit: 1 }, deps);
  assert.equal(f.filings.length, 1); assert.equal(f.filings[0].url, "https://www.sec.gov/Archives/edgar/data/1637207/000163720726000021/plnt10-k12312025_ars.htm"); assert.equal(f.filings[0].filed, "2026-02-20");
  assert.ok(seen.some((x) => x.url.includes("data.sec.gov/submissions/CIK0001637207.json")));
  const c = await E.candidates("Planet Fitness", deps);
  assert.deepEqual(c.urls, [f.filings[0].url]);
  const none = await E.candidates("Temu", deps); assert.deepEqual(none.urls, []); assert.match(none.note, /no SEC registrant/);
  const nocontact = await E.candidates("Planet Fitness", { fetchImpl: secFetch(), contact: "" }); assert.deepEqual(nocontact.urls, []); assert.match(nocontact.note, /PD_FETCH_CONTACT/);
});

test("groq research fallback puts the registrant's latest 10-K first and still verifies every quote", async () => {
  const R = A("research-agent"); const L = A("llm"); const save = process.env.PD_FETCH_CONTACT; process.env.PD_FETCH_CONTACT = "research@example.org";
  try {
    const TENK = "https://www.sec.gov/Archives/edgar/data/1637207/000163720726000021/plnt10-k12312025_ars.htm";
    const pages = { ...PAGES, [TENK]: PAGES[SEC] };
    const f = async (url, init) => { const u = String(url); if (/company_tickers|data\.sec\.gov/.test(u)) return secFetch()(url, init); return pages[u] ? resp(pages[u]) : resp("nope", false, 404); };
    const prose = `Nothing parseable here, but see ${AER} and ${FORT}.`;
    const perPage = { [TENK]: [{ url: TENK, fact: "members", quote: "we had approximately 20.8 million members and 2,896 clubs" }, { url: TENK, fact: "workouts", quote: "Members completed more than 650 million workouts in our clubs during the year" }], [AER]: [{ url: AER, fact: "attendance", quote: "attend on average 4.3 times per month" }], [FORT]: [{ url: FORT, fact: "price", quote: "raise the Classic membership from $10 to $15 a month, the first increase since 1998" }] };
    const draft = dossierDraft(); draft.sources[0].url = TENK;
    const order = [];
    const client = routedClient((b) => { if (b.tools) return prose; if (/You extract evidence/.test(sysOf(b))) { const u = Object.keys(perPage).find((k) => userOf(b).includes(k)); order.push(u); return { quotes: perPage[u] || [] }; } return draft; });
    const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: f }, debugDir: require("os").tmpdir(), now: new Date("2026-10-06") });
    assert.equal(r.status, "ok", JSON.stringify(r.reasons)); assert.equal(r.usedFallback, true);
    assert.ok(r.dossier.sources.some((s) => s.url === TENK));
    assert.equal(order[0], TENK, "the 10-K is processed first");
  } finally { if (save === undefined) delete process.env.PD_FETCH_CONTACT; else process.env.PD_FETCH_CONTACT = save; }
});

test("EDGAR: errors name the failing URL, and full-text search is the fallback when the ticker file is unavailable", async () => {
  const E = A("edgar");
  const seen = [];
  const ftsHits = { hits: { hits: [{ _id: "0001637207-25-000016:plnt-20241231.htm", _source: { ciks: ["0001637207"], file_date: "2025-02-20", display_names: ["Planet Fitness, Inc.  (PLNT)  (CIK 0001637207)"] } }, { _id: "0001637207-26-000021:plnt10-k12312025_ars.htm", _source: { ciks: ["0001637207"], file_date: "2026-02-20", display_names: ["Planet Fitness, Inc.  (PLNT)"] } }, { _id: "0000000001-26-000001:other.htm", _source: { ciks: ["0000000001"], file_date: "2026-03-01", display_names: ["Totally Different Corp"] } }] } };
  const f = async (url) => { const u = String(url); seen.push(u); if (u.endsWith("company_tickers.json")) return resp("nope", false, 404); if (u.includes("efts.sec.gov")) return resp(JSON.stringify(ftsHits)); return resp("nope", false, 404); };
  const c = await E.candidates("Planet Fitness", { fetchImpl: f, contact: "r@example.org" });
  assert.deepEqual(c.urls, ["https://www.sec.gov/Archives/edgar/data/1637207/000163720726000021/plnt10-k12312025_ars.htm"]);
  assert.match(c.note, /HTTP 404 for https:\/\/www\.sec\.gov\/files\/company_tickers\.json/); assert.match(c.note, /full-text search/);
  const all404 = await E.candidates("Planet Fitness", { fetchImpl: async () => resp("nope", false, 404), contact: "r@example.org" });
  assert.deepEqual(all404.urls, []); assert.match(all404.note, /company_tickers\.json.*efts\.sec\.gov/);
});

test("groq chat: error bodies are surfaced, and a JSON-validation 400 is retried once in plain JSON mode", async () => {
  const G = A("groq"); const calls = [];
  const fail400 = () => ({ ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: { message: "Failed to generate JSON. Please adjust your prompt.", code: "json_validate_failed" } }) });
  const f = async (url, init) => { const body = JSON.parse(init.body); calls.push(body); return body.response_format.type === "json_schema" ? fail400() : resp(chatBody('{"ok":true}')); };
  const r = await G.chat({ messages: [{ role: "user", content: "x" }], schema: { type: "object", required: ["ok"] }, maxTokens: 4000, key: "KEY123", fetchImpl: f });
  assert.equal(r.text, '{"ok":true}'); assert.equal(calls.length, 2);
  assert.equal(calls[1].response_format.type, "json_object"); assert.equal(calls[1].max_completion_tokens, 6000);
  assert.match(calls[1].messages.at(-1).content, /JSON Schema/); assert.match(calls[1].messages.at(-1).content, /"required":\["ok"\]/);
  // if plain JSON mode also fails, the reason is in the error (and no secret)
  const always = async () => ({ ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: { message: "bad request: schema invalid", code: "invalid_request_error" } }) });
  await assert.rejects(G.chat({ messages: [], schema: { type: "object" }, key: "KEY123", fetchImpl: always }), (e) => e.code === "HTTP" && e.status === 400 && /invalid_request_error: bad request: schema invalid/.test(e.message) && !e.message.includes("KEY123"));
  // 400 without a JSON body still reports the status
  await assert.rejects(G.chat({ messages: [], key: "K", fetchImpl: async () => ({ ok: false, status: 400, headers: { get: () => null } }) }), /HTTP 400/);
});

test("groq research: a 400 on one page's extraction skips that page and keeps the others", async () => {
  const R = A("research-agent"); const L = A("llm");
  const client = { provider: "groq", key: "K", sleep: async () => {}, fetch: async (url, init) => { const b = JSON.parse(init.body); if (b.tools) return resp(chatBody(`see ${SEC} and ${AER} and ${FORT}`)); if (/You extract evidence/.test(sysOf(b))) { if (userOf(b).includes(AER)) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: { message: "model refused the schema", code: "invalid_request_error" } }) }; const u = userOf(b).includes(SEC) ? SEC : FORT; return resp(chatBody(JSON.stringify({ quotes: u === SEC ? [{ url: SEC, fact: "m", quote: "we had approximately 20.8 million members and 2,896 clubs" }] : [{ url: FORT, fact: "p", quote: "raise the Classic membership from $10 to $15 a month, the first increase since 1998" }] }))); } return resp(chatBody(JSON.stringify(dossierDraft()))); } };
  const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, debugDir: require("os").tmpdir() });
  assert.ok(r.dropped.some((d) => /extraction skipped for this page: .*invalid_request_error/.test(d.reason)), JSON.stringify(r.dropped));
  assert.ok(r.evidenceCount >= 2);
});

// ---------- Tavily discovery (no browsing tokens) ----------
const tavilyResp = (results) => resp({ results });
test("tavily: request shape, domain restriction, error bodies and rate-limit mapping", async () => {
  const S = A("search"); const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return tavilyResp([{ url: "https://sec.gov/a", title: "A", content: "x".repeat(900), score: 0.9 }, { title: "no url" }]); };
  const r = await S.tavily("planet fitness 10-K", { key: "tvly-SECRET", includeDomains: ["sec.gov"], fetchImpl: f });
  assert.equal(calls[0].url, "https://api.tavily.com/search"); assert.equal(calls[0].init.headers.authorization, "Bearer tvly-SECRET");
  assert.deepEqual(calls[0].body.include_domains, ["sec.gov"]); assert.equal(calls[0].body.search_depth, "basic"); assert.equal(calls[0].body.include_raw_content, false);
  assert.ok(!calls[0].init.body.includes("tvly-SECRET"), "key only in the header");
  assert.equal(r.length, 1); assert.equal(r[0].content.length, 400);
  await assert.rejects(S.tavily("q", { key: "k", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ detail: { error: "Unauthorized: missing or invalid API key" } }) }) }), (e) => e.code === "HTTP" && /Unauthorized/.test(e.message));
  await assert.rejects(S.tavily("q", { key: "k", fetchImpl: async () => ({ ok: false, status: 432, json: async () => ({}) }) }), (e) => e.code === "RATE_LIMIT");
  await assert.rejects(S.tavily("q", { key: "", fetchImpl: f }), (e) => e.code === "NO_KEY" || process.env.TAVILY_API_KEY);
});

test("tavily discover: plans queries with the LLM, restricts the first to sec.gov, ranks primary sources first, filters junk and caps hosts", async () => {
  const S = A("search"); const L = A("llm"); process.env.TAVILY_API_KEY = "tvly-test";
  const client = routedClient(() => ({ queries: ["planet fitness members per club", "gym membership attendance study", "planet fitness price increase 2024", "planet fitness franchise economics", "a fifth that must be dropped"] }));
  const searched = [];
  const f = async (url, init) => { const b = JSON.parse(init.body); searched.push(b);
    if (b.include_domains) return tavilyResp([{ url: SEC, title: "10-K", score: 0.5 }, { url: SEC + "?x=2", title: "dup host", score: 0.4 }, { url: "https://www.sec.gov/c", title: "third on same host", score: 0.3 }]);
    return tavilyResp([{ url: FORT, title: "Fortune", score: 0.95 }, { url: "https://en.wikipedia.org/wiki/Planet_Fitness", score: 0.99 }, { url: "https://www.reddit.com/r/x", score: 0.9 }, { url: "https://x.example/report.pdf", score: 0.9 }, { url: AER, title: "AER", score: 0.2 }, { url: "https://randomblog.example/post", score: 0.99 }]); };
  const d = await S.discover(topic(), { client, ledger: L.newLedger(5), searchFetch: f });
  assert.equal(d.queries.length, 4); assert.equal(d.searches, 5);
  assert.deepEqual(searched[0].include_domains, ["sec.gov"]); assert.ok(searched.slice(1).every((b) => !b.include_domains));
  assert.ok(d.urls.indexOf(SEC) >= 0 && d.urls.indexOf(SEC) < d.urls.indexOf(FORT), "primary before journalism");
  assert.ok(d.urls.indexOf(FORT) < d.urls.indexOf("https://randomblog.example/post"), "journalism before unvetted blogs");
  assert.ok(!d.urls.some((u) => /wikipedia|reddit|\.pdf/.test(u)));
  assert.ok(d.urls.filter((u) => /sec\.gov/.test(u)).length <= 2, "at most 2 pages per host");
  // a Tavily rate limit mid-plan stops searching but keeps what was found
  let n = 0; const limited = await S.discover(topic(), { client, ledger: L.newLedger(5), searchFetch: async () => (++n === 1 ? tavilyResp([{ url: SEC, score: 1 }]) : ({ ok: false, status: 432, json: async () => ({}) })) });
  assert.deepEqual(limited.urls, [SEC]);
  delete process.env.TAVILY_API_KEY;
});

test("groq research with a search API: no browsing call at all, discovery URLs go straight to per-page verified extraction", async () => {
  const R = A("research-agent"); const L = A("llm"); const save = process.env.TAVILY_API_KEY; process.env.TAVILY_API_KEY = "tvly-test";
  try {
    const perPage = { [SEC]: [{ url: SEC, fact: "m", quote: "we had approximately 20.8 million members and 2,896 clubs" }, { url: SEC, fact: "w", quote: "Members completed more than 650 million workouts in our clubs during the year" }], [AER]: [{ url: AER, fact: "a", quote: "attend on average 4.3 times per month" }], [FORT]: [{ url: FORT, fact: "p", quote: "raise the Classic membership from $10 to $15 a month, the first increase since 1998" }] };
    const client = routedClient((b) => {
      if (b.tools) throw new Error("browser_search must not be used when a search API is configured");
      if (/business-research desk/.test(sysOf(b))) return { queries: ["q1", "q2", "q3", "q4"] };
      if (/You extract evidence/.test(sysOf(b))) { const u = Object.keys(perPage).find((k) => userOf(b).includes(k)); return { quotes: perPage[u] || [] }; }
      return dossierDraft();
    });
    const searchFetch = async () => tavilyResp([{ url: SEC, title: "10-K", score: 0.9 }, { url: AER, title: "AER", score: 0.8 }, { url: FORT, title: "Fortune", score: 0.7 }]);
    const r = await R.research(topic(), "short", { client, ledger: L.newLedger(5), groq: { fetchImpl: pageFetch() }, searchFetch, debugDir: require("os").tmpdir(), now: new Date("2026-10-06") });
    assert.equal(r.status, "ok", JSON.stringify(r.reasons));
    assert.ok(client.calls.every((b) => !b.tools));
    assert.ok(r.ledger.tokens > 0 && r.ledger.tokens < 2000, "no browsing: tiny token use in the mock");
  } finally { if (save === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = save; }
});

test("search providers: Serper and Exa request shapes, domain restriction, error mapping and provider choice", async () => {
  const S = A("search"); const calls = [];
  const sf = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return resp({ organic: [{ title: "T1", link: "https://www.sec.gov/a", snippet: "snippet one" }, { title: "T2", link: "https://fortune.com/b", snippet: "snippet two" }, { title: "no link" }] }); };
  const r = await S.serper("planet fitness 10-K", { key: "SERPER-SECRET", includeDomains: ["sec.gov"], fetchImpl: sf, maxResults: 6 });
  assert.equal(calls[0].url, "https://google.serper.dev/search"); assert.equal(calls[0].init.headers["x-api-key"], "SERPER-SECRET");
  assert.equal(calls[0].body.q, "planet fitness 10-K site:sec.gov"); assert.equal(calls[0].body.num, 6); assert.ok(!calls[0].init.body.includes("SERPER-SECRET"));
  assert.deepEqual(r.map((x) => x.url), ["https://www.sec.gov/a", "https://fortune.com/b"]); assert.ok(r[0].score > r[1].score);
  const ef = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return resp({ results: [{ title: "E1", url: "https://www.sec.gov/e", text: "x".repeat(900), score: 0.8 }, { title: "E2", url: "https://fortune.com/e" }, { title: "no url" }] }); };
  const e = await S.exa("planet fitness 10-K", { key: "EXA-SECRET", includeDomains: ["sec.gov"], fetchImpl: ef });
  const c = calls.at(-1); assert.equal(c.url, "https://api.exa.ai/search"); assert.equal(c.init.headers["x-api-key"], "EXA-SECRET");
  assert.deepEqual(c.body.includeDomains, ["sec.gov"]); assert.equal(c.body.type, "auto"); assert.ok(!c.init.body.includes("EXA-SECRET"));
  assert.equal(e.length, 2); assert.equal(e[0].content.length, 400); assert.equal(e[0].score, 0.8);
  const bad = (status, body = {}) => async () => ({ ok: false, status, json: async () => body });
  await assert.rejects(S.serper("q", { key: "k", fetchImpl: bad(403, { message: "Not enough credits" }) }), (x) => x.code === "RATE_LIMIT" && /Not enough credits/.test(x.message));
  await assert.rejects(S.exa("q", { key: "k", fetchImpl: bad(402, { error: "out of credits" }) }), (x) => x.code === "RATE_LIMIT" && /out of free credits/.test(x.message));
  await assert.rejects(S.serper("q", { key: "k", fetchImpl: bad(401, { message: "Unauthorized" }) }), (x) => x.code === "HTTP" && x.status === 401);
  await assert.rejects(S.serper("q", { key: "", fetchImpl: sf }), (x) => x.code === "NO_KEY");
  // provider choice: explicit wins, else exa > serper > tavily, else none
  const save = { ...process.env }; const set = (o) => { for (const k of ["EXA_API_KEY", "SERPER_API_KEY", "TAVILY_API_KEY", "PD_SEARCH_PROVIDER"]) delete process.env[k]; Object.assign(process.env, o); };
  try {
    set({}); assert.equal(S.available(), null);
    set({ TAVILY_API_KEY: "t" }); assert.equal(S.providerName(), "tavily");
    set({ TAVILY_API_KEY: "t", SERPER_API_KEY: "s" }); assert.equal(S.providerName(), "serper");
    set({ TAVILY_API_KEY: "t", SERPER_API_KEY: "s", EXA_API_KEY: "e" }); assert.equal(S.providerName(), "exa");
    set({ TAVILY_API_KEY: "t", SERPER_API_KEY: "s", EXA_API_KEY: "e", PD_SEARCH_PROVIDER: "serper" }); assert.equal(S.providerName(), "serper");
    set({ SERPER_API_KEY: "s", PD_SEARCH_PROVIDER: "exa" }); assert.equal(S.providerName(), "serper", "forcing a provider without its key falls back to one that has a key");
  } finally { for (const k of ["EXA_API_KEY", "SERPER_API_KEY", "TAVILY_API_KEY", "PD_SEARCH_PROVIDER"]) { if (save[k] === undefined) delete process.env[k]; else process.env[k] = save[k]; } }
});

test("search discover works with a Serper key end to end (domain restriction becomes a site: query)", async () => {
  const S = A("search"); const L = A("llm"); process.env.SERPER_API_KEY = "serper-test";
  try {
    const client = routedClient(() => ({ queries: ["q one", "q two", "q three", "q four"] }));
    const seen = [];
    const f = async (url, init) => { const b = JSON.parse(init.body); seen.push(b.q); return resp({ organic: [{ title: "x", link: b.q.includes("site:sec.gov") ? SEC : FORT, snippet: "s" }] }); };
    const d = await S.discover(topic(), { client, ledger: L.newLedger(5), searchFetch: f });
    assert.ok(seen[0].endsWith("site:sec.gov")); assert.deepEqual(d.urls, [SEC, FORT]); assert.equal(d.searches, 5);
  } finally { delete process.env.SERPER_API_KEY; }
});
