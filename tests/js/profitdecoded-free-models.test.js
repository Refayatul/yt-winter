"use strict";
// Phase 3.5: free-model validation (Groq writes, Gemini critiques). Mock HTTP only: no keys, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const A = (m) => require("../../core/profitdecoded/auto/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

const dossier = () => readJson("channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json");
const topic = () => readJson("channels/profitdecoded/topics/topic-universe.json").topics.find((t) => t.id === "hbm-073-how-gift-cards-make-money-for-retailers");
const PKG = "channels/profitdecoded/story-tests/hbm-073-gift-cards-long/";
const headers = (o) => ({ get: (n) => (o[n.toLowerCase()] != null ? String(o[n.toLowerCase()]) : null) });
const json = (status, body, h = {}) => ({ ok: status < 300, status, headers: headers(h), json: async () => body });

// Groq mock: answers by the STAGE marker in the prompt, reports free-plan rate-limit headers.
function groqMock(planQueue) {
  const goodPlan = readJson(PKG + "plan.json"); const fin = readJson(PKG + "final.json"); const draft = readJson(PKG + "draft.json");
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body); const text = body.messages.map((m) => m.content).join("\n");
    assert.match(String(init.headers.authorization), /^Bearer /);
    let out; let stage;
    if (/STAGE: STORY PLAN/.test(text)) { stage = "plan"; out = planQueue && planQueue.length ? planQueue.shift() : goodPlan; calls.repairs = (calls.repairs || []).concat(/STORY PLAN REPAIR/.test(text) ? [{ messages: body.messages.filter((m) => m.role !== "system").length, hasDossierBlock: /VERIFIED CLAIMS \(the only facts/.test(text), max: body.max_completion_tokens }] : []); }
    else if ((stage = "draft") && /STAGE: DRAFT SECTION/.test(text)) { const sec = /THIS SECTION: (\S+)/.exec(text)[1]; const beats = fin.beats.filter((b) => b.section === sec); out = { beats, graphics: beats.map((b) => ({ beatId: b.id, type: "typography", entities: ["x"], overlayText: "x", numbers: [], evidenceClaimId: b.claimId })) }; }
    else if (/STAGE: PACKAGING/.test(text)) { stage = "package"; out = { titleCandidates: draft.titleCandidates, thumbnailCandidates: draft.thumbnailCandidates, learningValue: "x" }; }
    else if (/STAGE: TARGETED REWRITE/.test(text)) { stage = "rewrite"; const sec = /SECTION (\S+) "/.exec(text)[1]; out = { beats: fin.beats.filter((b) => b.section === sec), graphics: [], changeLog: ["no change needed"] }; }
    calls.push({ stage, max: body.max_completion_tokens, model: body.model, effort: body.reasoning_effort });
    return json(200, { model: body.model, choices: [{ message: { content: JSON.stringify(out) }, finish_reason: "stop" }], usage: { prompt_tokens: 3000, completion_tokens: 1500, total_tokens: 4500, completion_tokens_details: { reasoning_tokens: 400 } } }, { "x-ratelimit-limit-tokens": 8000, "x-ratelimit-remaining-tokens": 3500, "x-ratelimit-limit-requests": 1000 });
  };
  return { fetch, calls };
}
function geminiMock(queue) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = queue.length > 1 ? queue.shift() : queue[0];
    return typeof r === "function" ? r() : r;
  };
  return { fetch, calls };
}
const critiqueOk = (body) => json(200, { modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(body) }] } }], usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 800, thoughtsTokenCount: 1200, totalTokenCount: 11000 } });
const CRIT = { verdict: "revise", problems: [{ section: "payoff", beatIds: ["b36"], type: "clarity", severity: "low", quote: "The store keeps a piece of the money", fix: "keep it as is" }], keep: ["the drawer"], automatedReadingsDisputed: [] };

// ---------- Gemini client ----------
test("gemini: free-tier allowlist, key in a header (never the URL), JSON mode, usage incl. thinking tokens", async () => {
  const G = A("gemini");
  const m = geminiMock([critiqueOk({ a: 1 })]);
  const r = await G.chat({ system: "sys", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], schema: { type: "object" }, key: "SECRET", fetchImpl: m.fetch });
  assert.deepEqual(JSON.parse(r.text), { a: 1 });
  assert.match(m.calls[0].url, /\/models\/gemini-3\.8-flash:generateContent$/); assert.ok(!m.calls[0].url.includes("SECRET"));
  assert.equal(m.calls[0].headers["x-goog-api-key"], "SECRET");
  assert.equal(m.calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.equal(m.calls[0].body.systemInstruction.parts[0].text, "sys");
  assert.deepEqual(r.usage, { input_tokens: 9000, output_tokens: 800, reasoning_tokens: 1200, total_tokens: 11000 });
  const none = geminiMock([critiqueOk({})]);
  await assert.rejects(G.chat({ messages: [], model: "gemini-3.1-pro-preview", key: "K", fetchImpl: none.fetch }), (e) => e.code === "NOT_FREE");
  assert.equal(none.calls.length, 0, "a non-free model is refused before any request");
  await assert.rejects(G.chat({ messages: [], key: "", fetchImpl: none.fetch }), (e) => e.code === "NO_KEY");
});

test("gemini: honours RetryInfo on 429, stops on an exhausted daily quota, refuses truncated or blocked output", async () => {
  const G = A("gemini"); const waits = [];
  const limited = json(429, { error: { code: 429, message: "Resource exhausted", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" }] } });
  const m = geminiMock([limited, critiqueOk({ ok: true })]);
  const r = await G.chat({ messages: [{ role: "user", content: "x" }], schema: { type: "object" }, key: "K", fetchImpl: m.fetch, sleepMs: async (ms) => waits.push(ms) });
  assert.deepEqual(JSON.parse(r.text), { ok: true }); assert.deepEqual(waits, [37000]);
  const daily = json(429, { error: { code: 429, message: "Quota exceeded for metric generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel" } });
  await assert.rejects(G.chat({ messages: [{ role: "user", content: "x" }], key: "K", fetchImpl: geminiMock([daily]).fetch, sleepMs: async () => {} }), (e) => e.code === "QUOTA");
  const cut = json(200, { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }], usageMetadata: {} });
  await assert.rejects(G.chat({ messages: [{ role: "user", content: "x" }], key: "K", fetchImpl: geminiMock([cut]).fetch }), (e) => e.code === "MAX_TOKENS");
  const blocked = json(200, { candidates: [{ finishReason: "SAFETY", content: { parts: [] } }], usageMetadata: {} });
  await assert.rejects(G.chat({ messages: [{ role: "user", content: "x" }], key: "K", fetchImpl: geminiMock([blocked]).fetch }), (e) => e.code === "REFUSAL");
});

// ---------- Groq pacing ----------
test("groq pacing: a rolling 60-second token window, and an oversized request refused up front", async () => {
  const L = A("llm"); let t = 0; const slept = [];
  const client = { tpm: 8000 }; const now = () => t; const sleep = async (ms) => { slept.push(ms); t += ms; };
  await L.paceTokens(client, 6000, now, sleep); assert.deepEqual(slept, []);
  t += 10000; await L.paceTokens(client, 5000, now, sleep);
  assert.equal(slept.length, 1); assert.ok(slept[0] >= 50000 && slept[0] <= 51000, String(slept[0]));
  await assert.rejects(L.paceTokens({ tpm: 8000 }, 9000, now, sleep), (e) => e.code === "REQUEST_TOO_LARGE");
});

// ---------- the live pipeline shape, end to end ----------
async function runStory(deps) { return A("script-agent").develop(topic(), dossier(), "long", deps); }
function freeClients(gm, gq, clock) {
  const g = { provider: "groq", key: "K", fetch: gq.fetch, pace: true, now: () => clock.t, sleep: async (ms) => { clock.t += ms; clock.slept += ms; } };
  return { plan: g, draft: g, package: g, rewrite: g, critique: { provider: "gemini", key: "G", fetch: gm.fetch, model: "gemini-3.8-flash" } };
}

test("free pipeline: Groq plans, drafts per section and rewrites only flagged sections; Gemini critiques; $0 paid", async () => {
  const L = A("llm"); const gq = groqMock(); const gm = geminiMock([critiqueOk(CRIT)]); const clock = { t: 0, slept: 0 };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-free-"));
  const ledger = L.newLedger(0);
  const r = await runStory({ clients: freeClients(gm, gq, clock), ledger, cacheDir });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  const plan = readJson(PKG + "plan.json");
  const drafts = gq.calls.filter((c) => c.stage === "draft");
  assert.equal(drafts.length, plan.sections.length, "one draft call per section");
  assert.ok(gq.calls.every((c) => c.max <= 4600), "every Groq request fits the free per-minute limit");
  assert.ok(clock.slept > 0, "calls were paced against the 8,000 tokens-per-minute window");
  assert.deepEqual(gq.calls.filter((c) => c.stage === "rewrite").length, 1, "only the flagged section was rewritten");
  assert.equal(gm.calls.length, 1); assert.equal(gm.calls[0].body.contents.length, 1, "the critic sees one fresh turn");
  assert.deepEqual(ledger.stages.critique.providers, ["gemini"]); assert.deepEqual(ledger.stages.plan.providers, ["groq"]);
  assert.equal(ledger.stages.critique.reasoningTokens, 1200); assert.equal(ledger.stages.plan.reasoningTokens, 400);
  assert.equal(ledger.usd, 0); assert.equal(r.out.beats[0].text, r.winningHook);
  const rep = A("produce").usageReport(ledger);
  assert.equal(rep.paidSpendUsd, 0); assert.equal(rep.charges.groq.usd, 0); assert.equal(rep.charges.gemini.usd, 0);
  assert.ok(rep.byProvider.groq.listPriceEquivalentUsd > 0 && rep.byProvider.gemini.listPriceEquivalentUsd > 0);
  assert.equal(rep.byProvider.groq.models[0], "openai/gpt-oss-120b");
});

test("a free-tier quota stop pauses safely with all completed stages cached, and the next run resumes", async () => {
  const L = A("llm"); const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-free-"));
  const daily = json(429, { error: { code: 429, message: "Quota exceeded: GenerateRequestsPerDayPerProjectPerModel" } });
  const gq1 = groqMock(); const clock = { t: 0, slept: 0 };
  const r1 = await runStory({ clients: freeClients(geminiMock([daily]), gq1, clock), ledger: L.newLedger(0), cacheDir });
  assert.equal(r1.status, "paused"); assert.equal(r1.pausedAt, "critique"); assert.match(r1.reasons[0], /QUOTA/);
  assert.ok(r1.draft && r1.plan, "plan and draft are preserved");
  const gq2 = groqMock(); const gm2 = geminiMock([critiqueOk(CRIT)]);
  const r2 = await runStory({ clients: freeClients(gm2, gq2, { t: 0, slept: 0 }), ledger: L.newLedger(0), cacheDir });
  assert.equal(r2.status, "ok");
  assert.equal(gq2.calls.filter((c) => c.stage !== "rewrite").length, 0, "plan, sections and packaging came from the cache");
  // the orchestrator writes a reviewable story package even for a paused run
  const P = A("produce"); const dir = P.writeStoryPackage(path.join(cacheDir, "pkg"), topic(), "long", r1, r1.ledger, {});
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  assert.equal(meta.status, "paused"); assert.ok(fs.existsSync(path.join(dir, "plan.json")) && fs.existsSync(path.join(dir, "usage.json")));
  assert.ok(!fs.existsSync(path.join(dir, "final.json")), "no final script is claimed for a paused run");
});

test("paid budget $0: a paid provider is refused before any request, never used as a fallback", async () => {
  const L = A("llm"); const anthropic = { calls: 0, beta: { messages: { stream: () => { anthropic.calls += 1; throw new Error("must not be called"); } } } };
  const r = await runStory({ stageProviders: { plan: "anthropic" }, clients: {}, client: anthropic, ledger: L.newLedger(0), cacheDir: false });
  assert.equal(r.status, "paused"); assert.match(r.reasons[0], /PAID_DISABLED/); assert.equal(anthropic.calls, 0);
  const saved = process.env.PD_AUTO_PROVIDER; process.env.PD_AUTO_PROVIDER = "anthropic";
  try { const r2 = await runStory({ ledger: L.newLedger(0), cacheDir: false }); assert.match(r2.reasons[0], /PAID_DISABLED/); }
  finally { if (saved == null) delete process.env.PD_AUTO_PROVIDER; else process.env.PD_AUTO_PROVIDER = saved; }
  assert.deepEqual(A("script-agent").stageProviders({ stageProviders: { plan: "groq", draft: "groq", critique: "gemini" } }), { plan: "groq", draft: "groq", package: "groq", critique: "gemini" });
});

test("findings are routed to the section they concern", () => {
  const W = A("script-agent"); const plan = readJson(PKG + "plan.json"); const fin = readJson(PKG + "final.json");
  const out = { beats: fin.beats };
  const { routed, global } = W.routeProblems(
    [{ section: "drawer", beatIds: [], type: "clarity", severity: "low", quote: "q", fix: "f" }, { section: "?", beatIds: ["b24"], type: "voice", severity: "low", quote: "q", fix: "f" }],
    ["retention (state): dead-stretch: x", "retention: weak-opening: y", "retention: missing-payoff: z", "script is 900 words: too short for a long (min 1040)", `retention: unpaid-question: "Why?" (open) is never answered. Fix: x`], out, plan);
  assert.equal(routed.drawer.length, 1); assert.equal(routed.forecast.length, 1); assert.equal(routed.state.length, 1);
  assert.ok(routed.open.some((x) => /weak-opening/.test(x)) && routed.open.some((x) => /unpaid/.test(x)));
  assert.ok(routed.payoff.some((x) => /missing-payoff/.test(x)) && routed.payoff.some((x) => /unpaid/.test(x)));
  assert.deepEqual(global, ["script is 900 words: too short for a long (min 1040)"]);
});

test("workflow: schedule and its gate unchanged, Gemini secret checked without printing values, resumable cache", () => {
  const y = fs.readFileSync(path.join(ROOT, ".github/workflows/profitdecoded-produce.yml"), "utf8");
  assert.match(y, /cron: '50 11 \* \* 1-5'/);
  assert.match(y, /if: github\.event_name == 'workflow_dispatch' \|\| vars\.PD_AUTO_SCHEDULE == 'true'/);
  assert.match(y, /GEMINI_KEY: \$\{\{ secrets\.GEMINI_API_KEY \}\}/);
  assert.doesNotMatch(y, /echo[^\n]*\$(GEMINI_KEY|GROQ_KEY|ANTHROPIC_KEY|GEMINI_API_KEY|GROQ_API_KEY)\b/);
  assert.match(y, /actions\/cache\/save@v4/); assert.match(y, /if: always\(\)\n\s+uses: actions\/cache\/save/);
  assert.match(y, /critique=gemini/);
});

test("a failed Groq plan is repaired with one compact, fresh request that fits the per-minute limit", async () => {
  const L = A("llm"); const good = readJson(PKG + "plan.json");
  const broken = { ...good, sections: good.sections.filter((x) => x.purpose !== "caveat"), selectedHook: "Starbucks booked $222 million in breakage revenue last year alone.", selectionReason: "x", hookCandidates: [...good.hookCandidates, { text: "Starbucks booked $222 million in breakage revenue last year alone.", mechanism: "number" }] };
  const W = A("script-agent"); const ev = W.evaluatePlan(broken, dossier(), "long");
  assert.match(ev.issues.join(), /caveat/); assert.match(ev.warnings.join(), /factual gate.*222/); assert.ok(ev.selected.factual.pass, "the unsupported hook can never open the film");
  const gq = groqMock([broken, good]); const gm = geminiMock([critiqueOk({ ...CRIT, verdict: "ready", problems: [] })]);
  const r = await runStory({ clients: freeClients(gm, gq, { t: 0, slept: 0 }), ledger: L.newLedger(0), cacheDir: false });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  assert.equal(gq.calls.repairs.length, 1);
  assert.deepEqual([gq.calls.repairs[0].messages, gq.calls.repairs[0].hasDossierBlock], [1, false]);
  assert.match(JSON.stringify(r.log), /plan-fix/);
});

