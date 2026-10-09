"use strict";
// Cost control, pre-generation filter, reviewer failure, editorial exceptions and publish safeguards.
// Every provider is mocked: no network, no paid call, no free-tier quota.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const B = require("../../core/profitdecoded/budget");
const L = require("../../core/profitdecoded/auto/llm");
const W = require("../../core/profitdecoded/auto/script-agent");
const E = require("../../core/profitdecoded/eligibility");
const X = require("../../core/profitdecoded/exceptions");
const DOSSIER = "channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json";
const PKG = "channels/profitdecoded/story-tests/hbm-073-gift-cards-long/";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pd-budget-"));
// a paid-enabled policy with an open, unrestricted approval (the committed policy has neither)
const policy = (over = {}) => ({ ...B.loadPolicy(), paidEnabled: true, paidApproval: { id: "test-approval", expiresAt: "2099-01-01T00:00:00Z" }, ...over });
const fileBudget = (over = {}, ctx = {}, now) => { const f = path.join(tmp(), "ledger.json"); fs.writeFileSync(f, JSON.stringify(B.emptyLedger())); return new B.Budget({ store: new B.FileStore(f), policy: policy(over), context: { pool: "script", topicId: "t", scriptId: "t:long:v1", runId: "r1", ...ctx }, ...(now ? { now } : {}) }); };
const read = async (bud) => (await bud.store.read()).doc;

// Anthropic mock: answers by STAGE marker; usage 2,000 in / 3,000 out (~$0.068 at Opus list price).
function anthropicMock(byStage, usage = { input_tokens: 2000, output_tokens: 3000 }) {
  const calls = [];
  const stageOf = (p) => { const t = JSON.stringify(p.messages); return /STAGE: STORY PLAN/.test(t) ? "plan" : /STAGE: TARGETED REWRITE/.test(t) ? "rewrite" : /STAGE: DRAFT/.test(t) ? "draft" : /STAGE: PACKAGING/.test(t) ? "package" : "other"; };
  const stream = (params) => { const st = stageOf(params); calls.push({ st, params }); const r = typeof byStage[st] === "function" ? byStage[st](params) : byStage[st];
    return { finalMessage: async () => { if (r instanceof Error) throw r; return { model: params.model, content: [{ type: "text", text: JSON.stringify(r) }], stop_reason: "end_turn", usage }; } }; };
  return { calls, messages: { stream }, beta: { messages: { stream } } };
}
const gem = (bodies) => { const q = [...bodies]; const calls = []; return { provider: "gemini", key: "k", sleep: async () => {}, calls, fetch: async (url, init) => { calls.push(JSON.parse(init.body)); const b = q.length > 1 ? q.shift() : q[0]; if (typeof b === "function") return b(); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(b) }] } }], usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 800, totalTokenCount: 9800 } }) }; } }; };
const quota = () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({ error: { message: "Quota exceeded for metric generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel" } }) });
const CRIT_READY = { verdict: "ready", problems: [], keep: ["the drawer"], automatedReadingsDisputed: [] };
const EVAL_PASS = { verdict: "pass", scores: { hook: 8, structure: 8, clarity: 8, naturalness: 8, pacing: 8, accuracy: 9 }, factualProblems: [], summary: "fine" };
function scriptFixture() {
  const plan = readJson(PKG + "plan.json"); const fin = readJson(PKG + "final.json"); const draft = readJson(PKG + "draft.json");
  // final.json carries graphics only for edited beats; the rest come from the draft (as story-review merges them)
  const graphics = [...(draft.graphics || []).filter((g) => fin.beats.some((b) => b.id === g.beatId) && !(fin.graphics || []).some((n) => n.beatId === g.beatId)), ...(fin.graphics || [])];
  return { plan, draftOut: { hookCandidates: plan.hookCandidates.map((h) => h.text), beats: fin.beats, graphics, titleCandidates: draft.titleCandidates, thumbnailCandidates: draft.thumbnailCandidates, learningValue: "x" }, rewrite: { beats: fin.beats, graphics: [], changeLog: ["no change"] } };
}
async function runPaid({ budget, critique = [CRIT_READY, EVAL_PASS], cacheDir = false, anth }) {
  const f = scriptFixture(); const a = anth || anthropicMock({ plan: f.plan, draft: f.draftOut, rewrite: f.rewrite }); const g = gem(critique);
  const ledger = L.newLedger(2); ledger.budget = budget;
  const r = await W.develop({ id: "hbm-073-how-gift-cards-make-money-for-retailers", topic: "gift cards" }, readJson(DOSSIER), "long", { ledger, cacheDir, clients: { plan: a, draft: a, rewrite: a, package: a, critique: g }, stageProviders: { plan: "anthropic", draft: "anthropic", rewrite: "anthropic", package: "anthropic", critique: "gemini" }, exceptions: [] });
  return { r, a, g };
}

// ---- budget ledger -------------------------------------------------------------------------------------------------
test("budget: the maximum cost is reserved before the call; an over-limit call is refused before the provider is reached", async () => {
  const bud = fileBudget({ maxPerScriptUsd: 0.5 });
  const client = anthropicMock({ other: { ok: true } });
  const ledger = L.newLedger(2); ledger.budget = bud;
  // 32,000 output tokens at $20/M is already $0.64: over the $0.50 per-script limit, so nothing is sent
  await assert.rejects(L.run({ client, system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" }, ledger, maxTokens: 32000, stage: "draft" }), (e) => e.code === "BUDGET" && /per-script limit/.test(e.message));
  assert.equal(client.calls.length, 0);
  // a call that fits is reserved, sent, and settled at the reported usage
  const r = await L.run({ client, system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" }, ledger, maxTokens: 8000, stage: "plan" });
  assert.deepEqual(r.json, { ok: true });
  const doc = await read(bud); const e = doc.entries.find((x) => x.status === "settled");
  assert.ok(e && e.estimateUsd >= e.actualUsd, "the reservation covered the real cost");
  assert.equal(e.actualUsd, L.spend({ input_tokens: 2000, output_tokens: 3000 }, "claude-opus-5-5"));
  assert.equal(e.category, "script"); assert.equal(e.scriptId, "t:long:v1"); assert.equal(e.month, B.monthKey(Date.now()));
});

test("budget: the estimate errs high (input as cache write, full max_tokens as output, every web search)", () => {
  const params = { model: "claude-opus-5-5", max_tokens: 10000, system: "x".repeat(28000), messages: [{ role: "user", content: "y".repeat(28000) }], tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] };
  const est = L.estimateMaxUsd(params, policy());
  const realistic = L.spend({ input_tokens: 15000, output_tokens: 10000, server_tool_use: { web_search_requests: 5 } }, "claude-opus-5-5");
  assert.ok(est >= realistic, `${est} >= ${realistic}`);
  assert.ok(L.estimateMaxUsd({ ...params, model: "unknown-model" }, policy()) >= est, "an unknown model is priced at least as Opus");
});

test("budget: monthly exhaustion and rollover (UTC calendar month, per pool)", async () => {
  let t = Date.parse("2026-10-30T12:00:00Z");
  const bud = fileBudget({ monthlyUsd: { script: 1, experiment: 0.5 }, maxPerScriptUsd: 2 }, {}, () => t);
  await bud.reserve({ id: "a", estimateUsd: 0.6 }); await bud.settle("a", 0.55);
  bud.context = { ...bud.context, scriptId: "t2" };
  await assert.rejects(bud.reserve({ id: "b", estimateUsd: 0.5 }), (e) => e.code === "BUDGET" && /script budget 2026-10/.test(e.message));
  bud.context = { ...bud.context, pool: "experiment" };
  await bud.reserve({ id: "c", estimateUsd: 0.4 }); // separate pool, separate limit
  t = Date.parse("2026-11-01T00:00:01Z"); bud.context = { ...bud.context, pool: "script", scriptId: "t3" };
  const e = await bud.reserve({ id: "d", estimateUsd: 0.9 }); // November starts empty
  assert.equal(e.month, "2026-11");
  const st = await bud.status("2026-10"); assert.equal(st.script.settledUsd, 0.55);
  // the October experiment reservation never settled and is past its TTL: it counts as uncertain at its maximum
  assert.equal(st.experiment.uncertainUsd, 0.4); assert.equal(st.experiment.committedUsd, 0.4);
});

test("budget: concurrent reservations cannot both pass (compare-and-swap; the loser re-checks the newer ledger)", async () => {
  // A store where both reservations read the same version before either writes.
  let doc = B.emptyLedger(); let version = 0; const reads = [];
  const store = { kind: "memory", read: async () => { const snap = { doc: JSON.parse(JSON.stringify(doc)), version }; reads.push(snap); await new Promise((r) => setTimeout(r, 5)); return snap; },
    write: async (d, v) => { if (v !== version) { const e = new B.BudgetError("CONFLICT", "changed"); throw e; } doc = d; version += 1; } };
  const p = policy({ monthlyUsd: { script: 1, experiment: 0 } });
  const mk = (sid) => new B.Budget({ store, policy: p, context: { pool: "script", scriptId: sid, runId: sid } });
  const results = await Promise.allSettled([mk("s1").reserve({ id: "x1", estimateUsd: 0.7 }), mk("s2").reserve({ id: "x2", estimateUsd: 0.7 })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "BUDGET");
  assert.equal(doc.entries.length, 1); assert.ok(reads.length >= 3, "the loser re-read the ledger after the conflict");
});

test("budget: GitHub ledger uses the blob sha for compare-and-swap, and refuses when unreadable or unconfirmed", async () => {
  let sha = "s1"; let content = Buffer.from(JSON.stringify(B.emptyLedger())).toString("base64"); const puts = [];
  const fetchImpl = async (url, init = {}) => {
    if (!init.method) return { ok: true, status: 200, json: async () => ({ content, sha }) };
    const body = JSON.parse(init.body); puts.push(body);
    if (body.sha !== sha) return { ok: false, status: 409, json: async () => ({}) };
    sha = "s" + (puts.length + 1); content = body.content; return { ok: true, status: 200, json: async () => ({}) };
  };
  const store = new B.GitHubStore({ repo: "o/r", branch: "ledger", file: "ledger.json", token: "t", fetchImpl });
  const bud = new B.Budget({ store, policy: policy(), context: { scriptId: "g", runId: "r" } });
  await bud.reserve({ id: "g1", estimateUsd: 0.1 });
  assert.equal(puts[0].sha, "s1"); assert.equal(puts[0].branch, "ledger");
  assert.ok(!JSON.stringify(puts).includes("authorization"), "the token is sent as a header, never in the body");
  const down = new B.GitHubStore({ repo: "o/r", branch: "ledger", file: "ledger.json", token: "t", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  await assert.rejects(new B.Budget({ store: down, policy: policy(), context: { scriptId: "g" } }).reserve({ id: "z", estimateUsd: 0.1 }), (e) => e.code === "STATE_UNREACHABLE");
  const missing = new B.GitHubStore({ repo: "o/r", branch: "ledger", file: "ledger.json", token: "t", fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  await assert.rejects(new B.Budget({ store: missing, policy: policy(), context: { scriptId: "g" } }).reserve({ id: "z", estimateUsd: 0.1 }), (e) => e.code === "STATE_MISSING");
  assert.throws(() => new B.GitHubStore({ repo: "o/r", branch: "ledger", file: "ledger.json", token: "" }), (e) => e.code === "NO_STORE");
});

test("budget: fail closed (policy off, no ledger, runner-local file in Actions, paid call without a ledger)", async () => {
  await assert.rejects(fileBudget({ paidEnabled: false }).reserve({ id: "a", estimateUsd: 0.1 }), (e) => e.code === "PAID_DISABLED");
  assert.equal(B.loadPolicy().paidEnabled, false, "the committed policy keeps paid calls disabled");
  assert.throws(() => B.storeFromEnv(policy({ ledger: { store: "file" } }), { GITHUB_ACTIONS: "true" }), (e) => e.code === "NO_STORE");
  const f = path.join(tmp(), "none.json");
  await assert.rejects(new B.Budget({ store: new B.FileStore(f), policy: policy(), context: { scriptId: "a" } }).reserve({ id: "a", estimateUsd: 0.1 }), (e) => e.code === "STATE_MISSING");
  const saved = process.env.NODE_TEST_CONTEXT; delete process.env.NODE_TEST_CONTEXT;
  try { await assert.rejects(L.run({ client: anthropicMock({ other: {} }), system: "s", messages: [], ledger: L.newLedger(5) }), (e) => e.code === "PAID_DISABLED"); }
  finally { process.env.NODE_TEST_CONTEXT = saved; }
});

test("budget: provider errors release or keep the reservation; no automatic SDK retries", async () => {
  const bud = fileBudget(); const ledger = L.newLedger(2); ledger.budget = bud;
  const rejected = Object.assign(new Error("invalid request"), { status: 400 });
  await assert.rejects(L.run({ client: anthropicMock({ other: rejected }), system: "s", messages: [{ role: "user", content: "a" }], ledger, maxTokens: 4000, stage: "plan" }));
  const dropped = new Error("socket hang up"); // no status: the provider may have processed it
  await assert.rejects(L.run({ client: anthropicMock({ other: dropped }), system: "s", messages: [{ role: "user", content: "b" }], ledger, maxTokens: 4000, stage: "plan" }));
  const doc = await read(bud);
  assert.equal(doc.entries.find((e) => e.note && /HTTP 400/.test(e.note)).status, "released");
  const unsure = doc.entries.find((e) => e.status === "uncertain"); assert.ok(unsure && /outcome unknown/.test(unsure.note));
  assert.equal((await bud.status()).script.uncertainUsd, unsure.estimateUsd, "an uncertain call stays charged at its maximum");
  assert.equal(L.createClient({ provider: "anthropic", apiKey: "test-key" }).maxRetries, 0);
});

test("budget: interrupted runs are charged until reconciled; duplicate or in-flight identical requests are refused", async () => {
  let t = Date.parse("2026-10-09T10:00:00Z");
  const bud = fileBudget({ reservationTtlMinutes: 30 }, {}, () => t);
  await bud.reserve({ id: "same", estimateUsd: 0.3 });
  await assert.rejects(bud.reserve({ id: "same", estimateUsd: 0.3 }), (e) => e.code === "IN_FLIGHT");
  t += 31 * 60000; // the run died without settling
  const st = await bud.status(); assert.equal(st.script.uncertainUsd, 0.3);
  await assert.rejects(bud.reserve({ id: "same", estimateUsd: 0.3 }), (e) => e.code === "DUPLICATE");
  await bud.mutate((doc) => B.reconcile(doc, "same", 0.12, "Owner", "checked the Anthropic console usage for this request"));
  assert.equal((await bud.status()).script.settledUsd, 0.12);
  await bud.reserve({ id: "done", estimateUsd: 0.2 }); await bud.settle("done", 0.1);
  await assert.rejects(bud.reserve({ id: "done", estimateUsd: 0.2 }), (e) => e.code === "DUPLICATE" && /PD_BUDGET_ALLOW_REPEAT=done/.test(e.message));
  bud.context = { ...bud.context, allowRepeat: "done" }; const again = await bud.reserve({ id: "done", estimateUsd: 0.2 });
  assert.equal(again.status, "reserved"); assert.ok((await read(bud)).entries.some((e) => e.id.startsWith("done#superseded")), "the earlier payment stays in the history");
});

test("budget: cost report separates actual from estimated, per attempt and per accepted script", async () => {
  const bud = fileBudget();
  await bud.reserve({ id: "p", estimateUsd: 0.3 }); await bud.settle("p", 0.1);
  await bud.reserve({ id: "q", estimateUsd: 0.4, category: "review" });
  await bud.recordOutcome({ status: "accepted" });
  const rep = B.costReport(await read(bud), bud.policy);
  assert.equal(rep.byCategory.script.actualUsd, 0.1); assert.equal(rep.byCategory.review.estimatedUsd, 0.4);
  assert.equal(rep.counts.accepted, 1); assert.equal(rep.perAcceptedScriptUsd, 0.5); assert.equal(rep.perPublishedVideoUsd, null);
});

// ---- the paid story run ----------------------------------------------------------------------------------------------
test("paid run: one draft, independent Gemini review, settled spend under the limits; a cached re-run pays nothing", async () => {
  const bud = fileBudget(); const cacheDir = tmp();
  const { r, a } = await runPaid({ budget: bud, cacheDir });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  assert.deepEqual(a.calls.map((c) => c.st), ["plan", "draft"]);
  assert.equal(a.calls[0].params.max_tokens, 12000); assert.equal(a.calls[1].params.max_tokens, 32000, "output limits come from the budget policy");
  const st = await bud.status(); assert.ok(st.script.settledUsd > 0 && st.script.settledUsd <= 2 && st.script.reservedUsd === 0);
  const before = (await read(bud)).entries.length;
  const again = await runPaid({ budget: bud, cacheDir });
  assert.equal(again.r.status, "ok"); assert.equal(again.a.calls.length, 0, "every stage replayed from the cache");
  assert.equal((await read(bud)).entries.length, before, "no new reservation");
});

test("paid run: the reviewer may not be the writer, and a failed reviewer pauses the run (never approves it)", async () => {
  const f = scriptFixture(); const a = anthropicMock({ plan: f.plan, draft: f.draftOut, rewrite: f.rewrite }); const ledger = L.newLedger(2); ledger.budget = fileBudget();
  const same = await W.develop({ id: "x", topic: "x" }, readJson(DOSSIER), "long", { ledger, cacheDir: false, clients: { plan: a, draft: a, rewrite: a, critique: a }, stageProviders: { plan: "anthropic", draft: "anthropic", rewrite: "anthropic", critique: "anthropic" } });
  assert.equal(same.status, "config-error"); assert.match(same.reasons[0], /independent review required/); assert.equal(a.calls.length, 0, "refused before any paid call");
  const { r } = await runPaid({ budget: fileBudget(), critique: [quota] });
  assert.equal(r.status, "paused"); assert.match(r.reasons[0], /QUOTA/); assert.equal(r.pausedAt, "critique");
});

test("paid run: at most one automatic rewrite; a critical factual error still blocks", async () => {
  const HIGH = { verdict: "fail", scores: { hook: 8, structure: 8, clarity: 8, naturalness: 8, pacing: 8, accuracy: 3 }, factualProblems: [{ section: "breakage", beatIds: ["b19"], severity: "high", quote: "x", problem: "invented frequency", fix: "cut" }], summary: "factual error" };
  const REVISE = { verdict: "revise", problems: [{ section: "breakage", beatIds: ["b19"], type: "clarity", severity: "low", quote: "q", fix: "f" }], keep: [], automatedReadingsDisputed: [] };
  const { r, a } = await runPaid({ budget: fileBudget(), critique: [REVISE, HIGH, HIGH] });
  assert.equal(r.status, "script-failed");
  assert.equal(a.calls.filter((c) => c.st === "rewrite").length, 1, "the critique rewrite used the one automatic rewrite: no fact-fix rewrite");
  assert.ok(r.reasons.some((x) => /independent fact check/.test(x)) && r.reasons.some((x) => /verdict: fail/.test(x)));
});

test("paid run: a truncated paid reply is not regenerated automatically", async () => {
  const f = scriptFixture();
  const a = anthropicMock({ plan: f.plan, draft: () => new L.AutoError("MAX_TOKENS", "truncated") });
  const { r } = await runPaid({ budget: fileBudget(), anth: a });
  assert.equal(r.status, "provider-error"); assert.match(r.reasons[0], /MAX_TOKENS/);
  assert.equal(a.calls.filter((c) => c.st === "draft").length, 1);
});

// ---- pre-generation filter ---------------------------------------------------------------------------------------------
test("pre-generation filter: gift cards may run as an experiment only; weak dossiers and missing research are deferred", () => {
  const u = readJson("channels/profitdecoded/topics/topic-universe.json").topics; const gc = u.find((t) => t.id === "hbm-073-how-gift-cards-make-money-for-retailers");
  const d = readJson(DOSSIER);
  assert.equal(E.check(gc, d, { format: "long", pool: "experiment" }).status, "ELIGIBLE");
  const prod = E.check(gc, d, { format: "long", pool: "script" });
  assert.equal(prod.status, "DEFER"); assert.ok(prod.reasons.some((x) => /format-clearance/.test(x)));
  assert.ok(E.check(gc, null, { format: "long", pool: "experiment" }).reasons.some((x) => /verified-dossier/.test(x)), "no dossier: deferred, never researched with paid tokens");
  const noCalc = JSON.parse(JSON.stringify(d)); noCalc.inferences.forEach((i) => delete i.calc);
  assert.ok(E.check(gc, noCalc, { format: "long", pool: "experiment" }).reasons.some((x) => /attribution-data/.test(x)));
  const thin = JSON.parse(JSON.stringify(d)); thin.claims = thin.claims.slice(0, 5); thin.inferences = [];
  assert.equal(E.check(gc, thin, { format: "long", pool: "experiment" }).status, "DEFER");
  const over = JSON.parse(JSON.stringify(d)); over.angle = "Reveal the exact split: retailers keep most of it.";
  assert.ok(E.check(gc, over, { format: "long", pool: "experiment" }).reasons.some((x) => /payoff-evidence/.test(x)));
});

test("orchestrator: a deferred topic makes no paid call, and the outcome is recorded", async () => {
  const P = require("../../core/profitdecoded/auto/produce");
  const u = readJson("channels/profitdecoded/topics/topic-universe.json").topics; const gc = u.find((t) => t.id === "hbm-073-how-gift-cards-make-money-for-retailers");
  const bud = fileBudget({}, { pool: "script", topicId: gc.id }); const ledger = L.newLedger(2); ledger.budget = bud;
  const a = anthropicMock({});
  const dirs = { research: path.join(ROOT, "channels/profitdecoded/research"), auto: tmp(), state: tmp() };
  const r = await P.produce({ topic: gc, universe: u, format: "long", deps: { ledger, client: a }, dirs });
  assert.equal(r.status, "deferred"); assert.equal(a.calls.length, 0);
  const doc = await read(bud); assert.ok(doc.entries.some((e) => e.type === "outcome" && e.status === "deferred"));
});

// ---- quality: coverage and editorial exceptions -------------------------------------------------------------------------
test("source coverage: a long-form script must cite every central claim", () => {
  const d = readJson(DOSSIER); const fin = readJson(PKG + "final.json");
  const without = fin.beats.filter((b) => b.claimId !== "c7");
  assert.ok(W.check({ beats: without }, d, "long").issues.some((x) => /central claim c7 is not covered/.test(x)));
  assert.ok(!W.check({ beats: fin.beats }, d, "long").issues.some((x) => /central claim/.test(x)));
});

test("editorial exception: one heuristic finding, one script version, a named person; never a factual finding", () => {
  const dir = "channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/";
  const beats = readJson(dir + "latest.json").beats;
  const finding = "retention: weak-opening: first-30-seconds reading 79 (0-5s: opens an unresolved tension (contradiction)). Fix: open on the tension, validate the title by second 15, deliver the first real fact by second 30";
  const base = { topicId: "hbm-073-how-gift-cards-make-money-for-retailers", format: "long", beats, findingText: finding, approvedBy: "Channel Owner", reason: "Blind independent review rated this hook 9/10 three times; heuristic misses the scene opener." };
  const ex = X.propose(base);
  const ctx = { topicId: base.topicId, format: "long", beats };
  const applied = X.apply([finding, "only 0 distinct title candidates (need >=20)"], ctx, [ex]);
  assert.deepEqual(applied.blocking, ["only 0 distinct title candidates (need >=20)"]); assert.equal(applied.waived[0].approvedBy, "Channel Owner");
  // the script changes: the exception no longer applies
  const edited = beats.map((b, i) => (i === 0 ? { ...b, text: b.text + " Really." } : b));
  const stale = X.apply([finding], { ...ctx, beats: edited }, [ex]); assert.deepEqual(stale.blocking, [finding]); assert.match(stale.rejected[0].why.join(), /script changed/);
  // the reading changes: a new approval is needed
  const other = finding.replace("79", "74"); assert.deepEqual(X.apply([other], ctx, [ex]).blocking, [other]);
  // factual and attribution findings cannot be waived, automated or missing approvers are refused
  assert.throws(() => X.propose({ ...base, findingText: "beat b1: $222.4 million is our calculation, not a reported figure" }), /not waivable/);
  assert.throws(() => X.propose({ ...base, findingText: "independent fact check (s2): \"x\" invented" }), /not waivable/);
  assert.throws(() => X.propose({ ...base, approvedBy: "Claude" }), /looks automated/);
  assert.throws(() => X.propose({ ...base, reason: "ok" }), /reason/);
  assert.deepEqual(X.load().filter((x) => x.topicId === base.topicId), [], "no exception is committed for the gift-card script: it waits for a human decision");
});

// ---- publishing stays blocked ------------------------------------------------------------------------------------------
test("publishing: blocked by default on every condition; the produce workflow never uploads and keeps its schedule gate", () => {
  const Sched = require("../../core/profitdecoded/schedule");
  const g = Sched.publishGuard({});
  assert.equal(g.allowed, false);
  for (const re of [/dry-run/, /enabled=false/, /youtube\.enabled=false/, /PD_PUBLISH is not set/, /human approval/]) assert.ok(g.blocks.some((b) => re.test(b)), re.toString());
  const cfg = readJson("channels/profitdecoded/config.json"); assert.equal(cfg.enabled, false); assert.equal(cfg.platforms.youtube.enabled, false);
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/profitdecoded-produce.yml"), "utf8");
  assert.match(wf, /cron: '50 11 \* \* 1-5'/); assert.match(wf, /if: github\.event_name == 'workflow_dispatch' \|\| vars\.PD_AUTO_SCHEDULE == 'true'/);
  assert.doesNotMatch(wf, /youtube.*upload|videos\.insert|PD_PUBLISH: /i);
  assert.match(wf, /max_usd:[\s\S]*?default: '0'/); assert.match(wf, /concurrency:\s*\n\s*group: profitdecoded-produce-/);
});

// ---- preflight hardening ---------------------------------------------------------------------------------------------
test("crash safety: a paid result whose settlement cannot be confirmed is cached, stays charged, and the run pauses", async () => {
  const f = path.join(tmp(), "ledger.json"); fs.writeFileSync(f, JSON.stringify(B.emptyLedger()));
  const store = new B.FileStore(f); let failSettle = true;
  const flaky = { kind: "file", read: () => store.read(), write: async (doc, v) => { if (failSettle && doc.entries.some((e) => e.status === "settled")) throw new B.BudgetError("STATE_UNCONFIRMED", "write timed out"); return store.write(doc, v); } };
  const bud = new B.Budget({ store: flaky, policy: policy(), context: { pool: "experiment", scriptId: "c:long:v1", runId: "r1" } });
  const cacheDir = tmp();
  const first = await runPaid({ budget: bud, cacheDir });
  assert.equal(first.r.status, "paused"); assert.match(first.r.reasons[0], /STATE_UNCONFIRMED/);
  assert.equal(first.a.calls.length, 1, "the plan was paid for once");
  const doc = (await store.read()).doc; assert.equal(doc.entries[0].status, "reserved", "still counted at its maximum");
  failSettle = false;
  const again = await runPaid({ budget: bud, cacheDir });
  assert.equal(again.a.calls.filter((c) => c.st === "plan").length, 0, "the paid plan came back from the cache: not paid twice");
});

test("workflow: write token not persisted, re-run safe cache keys, preflight gate before any Anthropic call, no publish step", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/profitdecoded-produce.yml"), "utf8");
  assert.match(wf, /actions\/checkout@v4\s*\n\s*with:\s*\n\s*persist-credentials: false/);
  for (const m of wf.matchAll(/key: pd-story-[^\n]*/g)) assert.match(m[0], /github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  const pre = wf.indexOf("name: Preflight"); const produce = wf.indexOf("name: Autonomous production");
  assert.ok(pre > 0 && pre < produce, "the preflight runs before production");
  assert.match(wf, /if: inputs\.through == 'preflight' \|\| inputs\.provider == 'anthropic'/);
  assert.match(wf, /preflight --paid --probe-gemini/);
  assert.match(wf, /name: Autonomous production \(dry run, no upload\)\s*\n(\s*id: produce\s*\n)?\s*if: inputs\.through != 'preflight'/);
  assert.equal((wf.match(/PD_BUDGET_TOKEN: \$\{\{ github\.token \}\}/g) || []).length, 4, "the token is passed to the preflight, production, approval-close and ledger-status steps only");
});

test("preflight: NO-GO for a paid run while the committed policy keeps paid calls disabled (no network needed)", () => {
  const { spawnSync } = require("child_process");
  const env = { ...process.env }; for (const k of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "PD_BUDGET_TOKEN", "GITHUB_TOKEN"]) delete env[k];
  const r = spawnSync("node", [path.join(ROOT, "profitdecoded.js"), "preflight", "--paid", "--topic", "hbm-073-how-gift-cards-make-money-for-retailers", "--format", "long", "--pool", "experiment", "--max-usd", "2"], { cwd: ROOT, env, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL\s+paid-enabled\s+paidEnabled=false/); assert.match(r.stdout, /FAIL\s+budget-ledger/); assert.match(r.stdout, /FAIL\s+anthropic-key/);
  assert.match(r.stdout, /PASS\s+eligibility\s+ELIGIBLE/); assert.match(r.stdout, /PASS\s+publishing-blocked/); assert.match(r.stdout, /PREFLIGHT: NO-GO/);
});

// ---- single-use paid approval and schedule isolation --------------------------------------------------------------
test("paid approval: required, scoped to one script and pool, expires, and is closed after the run (resumes refused)", async () => {
  const exp = { id: "exp-gc-1", scriptId: "hbm-073:long:v1", pool: "experiment", expiresAt: "2026-10-12T00:00:00Z", approvedBy: "Owner" };
  let t = Date.parse("2026-10-10T12:00:00Z");
  const mk = (over, ctx = {}) => fileBudget({ paidApproval: exp, ...over }, { pool: "experiment", scriptId: "hbm-073:long:v1", ...ctx }, () => t);
  await assert.rejects(fileBudget({ paidApproval: null }).reserve({ id: "a", estimateUsd: 0.1 }), (e) => e.code === "PAID_DISABLED" && /no paidApproval/.test(e.message));
  await assert.rejects(mk({}, { scriptId: "other:long:v1" }).reserve({ id: "a", estimateUsd: 0.1 }), (e) => e.code === "PAID_DISABLED" && /covers hbm-073:long:v1 only/.test(e.message));
  await assert.rejects(mk({}, { pool: "script" }).reserve({ id: "a", estimateUsd: 0.1 }), (e) => /covers the experiment pool only/.test(e.message));
  const bud = mk({});
  await bud.reserve({ id: "plan", estimateUsd: 0.3 }); await bud.settle("plan", 0.1);
  const c1 = await bud.closeApproval("production step ended: failure"); const c2 = await bud.closeApproval("again");
  assert.equal(c1.approvalId, "exp-gc-1"); assert.equal(c2.at, c1.at, "closing is idempotent");
  await assert.rejects(bud.reserve({ id: "draft", estimateUsd: 0.6 }), (e) => e.code === "PAID_DISABLED" && /used and closed/.test(e.message));
  const st = await bud.status(); assert.equal(st.approval.usable, false);
  t = Date.parse("2026-10-13T00:00:00Z");
  await assert.rejects(mk({ paidApproval: { ...exp, id: "exp-gc-2" } }).reserve({ id: "x", estimateUsd: 0.1 }), (e) => /expired/.test(e.message));
  assert.equal(B.loadPolicy().paidApproval, null, "the committed policy grants no approval");
});

test("paid approval for a one-model experiment: other models refused, its own cap applies, workflow passes the model", async () => {
  const exp = { id: "exp-haiku-1", scriptId: "hbm-073:long:haiku55-v1", pool: "experiment", model: "claude-haiku-5-5", maxUsd: 0.5, expiresAt: "2026-10-12T00:00:00Z", approvedBy: "Owner" };
  const t = Date.parse("2026-10-10T12:00:00Z");
  const bud = fileBudget({ paidApproval: exp }, { pool: "experiment", scriptId: exp.scriptId, scriptCapUsd: 2 }, () => t);
  await assert.rejects(bud.reserve({ id: "a", estimateUsd: 0.1, model: "claude-opus-5-5" }), (e) => e.code === "PAID_DISABLED" && /covers model claude-haiku-5-5 only/.test(e.message));
  await bud.reserve({ id: "plan", estimateUsd: 0.3, model: "claude-haiku-5-5" });
  await assert.rejects(bud.reserve({ id: "draft", estimateUsd: 0.3, model: "claude-haiku-5-5" }), (e) => e.code === "BUDGET" && /\$0\.50/.test(e.message));
  assert.match((await bud.status()).approval.detail, /model claude-haiku-5-5, max \$0\.5/);
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/profitdecoded-produce.yml"), "utf8");
  assert.equal((wf.match(/PD_AUTO_MODEL: \$\{\{ inputs\.model \|\| 'claude-opus-5-5' \}\}/g) || []).length, 2, "preflight and production both use the dispatched model");
});

test("workflow: ProfitDecoded-only key, approval closed on every outcome of the paid step, schedule cannot run paid", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/profitdecoded-produce.yml"), "utf8");
  assert.doesNotMatch(wf, /secrets\.ANTHROPIC_API_KEY/, "never the repository-wide key other channels read");
  assert.equal((wf.match(/secrets\.PD_ANTHROPIC_API_KEY/g) || []).length, 3);
  assert.match(wf, /name: Close the paid approval \(single use\)\s*\n\s*if: always\(\) && inputs\.provider == 'anthropic' && inputs\.through != 'preflight' && steps\.produce\.outcome != 'skipped'/);
  assert.ok(wf.indexOf("name: Close the paid approval") > wf.indexOf("name: Autonomous production") && wf.indexOf("name: Close the paid approval") < wf.indexOf("name: Save story stage cache"), "closed right after production, before anything else");
  // a scheduled run has no inputs: provider groq, paid limit 0, no preflight, and the job itself is gated off
  assert.match(wf, /PD_AUTO_PROVIDER: \$\{\{ inputs\.provider \|\| 'groq' \}\}/); assert.match(wf, /MAX_USD: \$\{\{ inputs\.max_usd \|\| '0' \}\}/);
  assert.match(wf, /if: github\.event_name == 'workflow_dispatch' \|\| vars\.PD_AUTO_SCHEDULE == 'true'/);
  for (const other of ["portfolio-production.yml", "bto-research.yml"]) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, ".github/workflows", other), "utf8"), /PD_ANTHROPIC_API_KEY/, other + " cannot read the ProfitDecoded key");
});

test("schedule isolation: a free (groq) run creates no budget and any Anthropic call in it is refused", async () => {
  const saved = process.env.NODE_TEST_CONTEXT; delete process.env.NODE_TEST_CONTEXT;
  try {
    const ledger = L.newLedger(0); // scheduled runs: max_usd 0, no budget ledger attached
    const client = anthropicMock({ other: {} });
    await assert.rejects(L.run({ client, system: "s", messages: [], ledger }), (e) => ["PAID_DISABLED", "BUDGET"].includes(e.code));
    assert.equal(client.calls.length, 0, "refused before the provider is contacted");
    await assert.rejects(L.run({ client, system: "s", messages: [], ledger: L.newLedger(5) }), (e) => e.code === "PAID_DISABLED", "even with a non-zero limit, no ledger means no paid call");
  } finally { process.env.NODE_TEST_CONTEXT = saved; }
  const W2 = require("../../core/profitdecoded/auto/script-agent");
  assert.ok(!Object.values(W2.stageProviders({})).includes("anthropic"), "no stage defaults to Anthropic without PD_STORY_PROVIDERS");
});
