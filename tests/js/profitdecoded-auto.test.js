"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const A = (m) => require("../../core/profitdecoded/auto/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

// ---------- mock Anthropic client (no network, no key) ----------
function mockClient(responses) {
  const calls = []; let i = 0;
  const next = (params, beta) => { calls.push({ params, beta }); const r = responses[Math.min(i, responses.length - 1)]; i += 1; return { finalMessage: async () => (typeof r === "function" ? r(params) : r) }; };
  return { calls, beta: { messages: { stream: (p) => next(p, true) } }, messages: { stream: (p) => next(p, false) } };
}
const usage = (o = {}) => ({ input_tokens: 1000, output_tokens: 500, ...o });
const msg = (content, stop = "end_turn", u = usage()) => ({ content, stop_reason: stop, usage: u });
const textMsg = (text, extra = {}) => msg([{ type: "text", text }], "end_turn", usage(extra));

// ---------- llm.js ----------
test("llm.run: adaptive thinking, structured output, streaming; server-side model fallbacks are opt-in only", async () => {
  const L = A("llm");
  const c = mockClient([textMsg('{"a":1}')]);
  const r = await L.run({ client: c, system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" }, ledger: L.newLedger(5) });
  assert.deepEqual(r.json, { a: 1 });
  const p = c.calls[0];
  // default: no fallback to another model (no silent switch of the paid model)
  assert.equal(p.beta, false); assert.ok(!("fallbacks" in p.params));
  assert.equal(p.params.model, "claude-opus-5-5"); assert.deepEqual(p.params.thinking, { type: "adaptive" });
  assert.equal(p.params.output_config.format.type, "json_schema"); assert.equal(p.params.output_config.effort, "high");
  assert.ok(!("temperature" in p.params) && !("budget_tokens" in (p.params.thinking || {})));
  process.env.PD_AUTO_FALLBACKS = "1";
  try { const c2 = mockClient([textMsg("hi")]); await L.run({ client: c2, system: "s", messages: [], ledger: L.newLedger(5) }); assert.equal(c2.calls[0].beta, true); assert.equal(c2.calls[0].params.fallbacks, "default"); assert.deepEqual(c2.calls[0].params.betas, ["server-side-fallback-2026-07-01"]); }
  finally { delete process.env.PD_AUTO_FALLBACKS; }
});

test("llm.run: resumes pause_turn, refuses to hide refusal/max_tokens/bad JSON, enforces the spend guard", async () => {
  const L = A("llm");
  const c = mockClient([msg([{ type: "server_tool_use", id: "1", name: "web_search", input: {} }], "pause_turn"), textMsg("done")]);
  const r = await L.run({ client: c, system: "s", messages: [{ role: "user", content: "x" }], ledger: L.newLedger(5) });
  assert.equal(r.text, "done"); assert.equal(c.calls.length, 2);
  assert.equal(c.calls[1].params.messages.at(-1).role, "assistant"); // the paused turn was handed back
  assert.equal(r.ledger.calls, 2);
  await assert.rejects(L.run({ client: mockClient([msg([], "refusal")]), system: "s", messages: [], ledger: L.newLedger(5) }), (e) => e.code === "REFUSAL");
  await assert.rejects(L.run({ client: mockClient([msg([{ type: "text", text: "cut" }], "max_tokens")]), system: "s", messages: [], ledger: L.newLedger(5) }), (e) => e.code === "MAX_TOKENS");
  await assert.rejects(L.run({ client: mockClient([textMsg("not json")]), system: "s", messages: [], schema: { type: "object" }, ledger: L.newLedger(5) }), (e) => e.code === "BAD_JSON");
  await assert.rejects(L.run({ client: mockClient([msg([], "pause_turn")]), system: "s", messages: [], ledger: L.newLedger(5), maxPauses: 1 }), (e) => e.code === "PAUSED");
  const expensive = mockClient([textMsg("a", { input_tokens: 900000, output_tokens: 200000 }), textMsg("b")]);
  const ledger = L.newLedger(1);
  await L.run({ client: expensive, system: "s", messages: [], ledger });
  assert.ok(ledger.usd > 1);
  await assert.rejects(L.run({ client: expensive, system: "s", messages: [], ledger }), (e) => e.code === "BUDGET");
  assert.throws(() => { const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; try { L.createClient(); } finally { if (k) process.env.ANTHROPIC_API_KEY = k; } }, (e) => e.code === "NO_KEY");
});

// ---------- evidence + research ----------
const SEC = "https://www.sec.gov/Archives/edgar/data/1637207/plnt10k.htm";
const AER = "https://www.aeaweb.org/articles?id=10.1257%2Faer.96.3.694";
const FORT = "https://fortune.com/2024/05/10/planet-fitness-price-hike-classic-membership";
const fetchResult = (url, data, title = "doc") => ({ type: "web_fetch_tool_result", tool_use_id: "t", content: { type: "web_fetch_result", url, content: { type: "document", title, source: { type: "text", media_type: "text/plain", data } } } });
const researchBlocks = () => [
  fetchResult(SEC, "At December 31, 2025 we had approximately 20.8 million members and 2,896 clubs. Members completed more than 650 million workouts. Clubs are typically 20,000 square feet.", "PLNT 10-K"),
  fetchResult(AER, "members who choose a contract with a flat monthly fee of over $70 attend on average 4.3 times per month", "Paying Not to Go to the Gym"),
  fetchResult(FORT, "Planet Fitness will raise the Classic membership from $10 to $15 a month, the first increase since 1998.", "Fortune"),
  { type: "web_search_tool_result", tool_use_id: "s", content: [{ type: "web_search_result", url: "https://en.wikipedia.org/wiki/Planet_Fitness", title: "Wikipedia" }] },
  { type: "text", text: "Memo: 20.8 million members.", citations: [{ type: "web_search_result_location", url: SEC, title: "PLNT 10-K", cited_text: "approximately 20.8 million members and 2,896 clubs" }] },
];
const draft = (over = {}) => ({
  thesis: "Planet Fitness can charge a very low price partly because its clubs are sized for the share of members who actually show up and the filings point to that share being small.",
  angle: "capacity arithmetic from the company's own numbers", contradictions: [{ id: "k1", status: "resolved", note: "the filing never states the mechanism; we present it as our arithmetic" }],
  sources: [
    { id: "s1", type: "10-k", publisher: "Planet Fitness, Inc. / SEC", title: "10-K FY2025", url: SEC, date: "2026-02" },
    { id: "s2", type: "academic", publisher: "American Economic Review", title: "Paying Not to Go to the Gym", url: AER, date: "2006-06" },
    { id: "s3", type: "journalism", publisher: "Fortune", title: "Price hike", url: FORT, date: "2024-05-10" },
    { id: "s9", type: "journalism", publisher: "Invented Daily", title: "Never opened", url: "https://invented.example/story", date: "2025" },
  ],
  claims: [
    { id: "c1", central: true, text: "Planet Fitness had approximately 20.8 million members and 2,896 clubs.", numbers: ["20.8", "2,896"], sourceIds: ["s1"] },
    { id: "c2", central: true, text: "Members completed more than 650 million workouts.", numbers: ["650"], sourceIds: ["s1"] },
    { id: "c3", central: false, text: "Members pay 999 dollars a year on average.", numbers: ["999"], sourceIds: ["s1"] },
    { id: "c4", central: false, text: "Flat-fee members attended 4.3 times a month.", numbers: ["4.3"], sourceIds: ["s2", "s9"] },
    { id: "c5", central: false, text: "The Classic Card went from $10 to $15.", numbers: ["10", "15"], sourceIds: ["s3"] },
  ],
  inferences: [{ id: "i1", text: "20.8 million members over 2,896 clubs is about 7,200 members per club.", numbers: ["7,200"], basisClaimIds: ["c1"] }, { id: "i2", text: "Built on a dropped claim.", numbers: [], basisClaimIds: ["c3"] }],
  ...over,
});
const topic = () => ({ id: "hbm-001-why-gyms-make-more-money-when-you-stay-home", topic: "Why Gyms Make More Money When You Stay Home", entity: "Planet Fitness", pillar: "hidden-business-models", coreQuestion: "Why do gyms ...?", viralMechanism: "Familiar Company + Unexpected Business Model", formats: { short: true, long: true } });

test("evidence: only pages the tools actually returned can support a claim, and every figure must be in their text", () => {
  const E = A("evidence"); const docs = E.collect(researchBlocks());
  assert.equal(docs.size, 4);
  assert.ok(docs.get(E.urlKey(SEC)).opened && docs.get(E.urlKey(SEC)).texts.length === 2);
  assert.equal(docs.get(E.urlKey("https://en.wikipedia.org/wiki/Planet_Fitness")).opened, false);
  const byId = new Map([["s1", { url: SEC }]]);
  assert.equal(E.verifyClaim({ numbers: ["20.8", "2,896"], sourceIds: ["s1"] }, byId, docs).ok, true);
  assert.equal(E.verifyClaim({ numbers: ["999"], sourceIds: ["s1"] }, byId, docs).ok, false);
  assert.equal(E.verifyClaim({ numbers: ["1"], sourceIds: ["nope"] }, byId, docs).ok, false);
  // citations alone (no document text in the tool result) still count as readable evidence
  const onlyCites = E.collect([{ type: "web_fetch_tool_result", content: { url: "https://x.gov/a" } }, { type: "text", text: "t", citations: [{ url: "https://x.gov/a", cited_text: "revenue was 5,323 million" }] }]);
  assert.equal(E.verifyClaim({ numbers: ["5323"], sourceIds: ["a"] }, new Map([["a", { url: "https://x.gov/a" }]]), onlyCites).ok, true);
});

test("research agent: verified dossier passes the gate; unopened sources, absent figures and unsupported inferences are dropped", async () => {
  const R = A("research-agent"); const L = A("llm");
  const client = mockClient([msg(researchBlocks()), textMsg(JSON.stringify(draft()))]);
  const r = await R.research(topic(), "short", { client, ledger: L.newLedger(10), now: new Date("2026-10-06") });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  const ids = r.dossier.claims.map((c) => c.id);
  assert.deepEqual(ids.sort(), ["c1", "c2", "c4", "c5"]); // c4 survives on s2 once the unopened s9 is dropped
  const dropped = Object.fromEntries(r.dropped.map((d) => [d.id, d.reason]));
  assert.match(dropped.s9, /never opened/); assert.match(dropped.c3, /"999" is not in the text/);
  assert.ok(!r.dropped.some((d) => d.id === "c4"));
  assert.ok(r.dossier.inferences.every((i) => i.disclosed === true) && !r.dossier.inferences.find((i) => i.id === "i2"));
  assert.equal(r.dossier.sources.length, 3); assert.ok(r.dossier.sources.every((s) => s.accessed === "2026-10-06"));
  assert.match(r.dossier.researcher, /programmatic verification/);
  assert.equal(client.calls.length, 2);
  const tools = client.calls[0].params.tools;
  assert.deepEqual(tools.map((t) => t.type), ["web_search_20260209", "web_fetch_20260209"]);
  assert.equal(tools[1].citations.enabled, true);
  assert.ok(!("tools" in client.calls[1].params), "structuring call has no tools (citations/structured output are exclusive)");
  assert.ok(client.calls[1].params.output_config.format.schema.required.includes("claims"));
});

test("research agent: refuses to certify what it could not verify (no sources, hallucinated sources, Wikipedia-only)", async () => {
  const R = A("research-agent"); const L = A("llm");
  const none = await R.research(topic(), "short", { client: mockClient([textMsg("I could not open anything")]), ledger: L.newLedger(10) });
  assert.equal(none.status, "research-failed"); assert.match(none.reasons[0], /opened no sources/);
  const halluc = draft({ sources: draft().sources.map((s) => ({ ...s, url: s.url + "?fake=1" })) });
  const h = await R.research(topic(), "short", { client: mockClient([msg(researchBlocks()), textMsg(JSON.stringify(halluc))]), ledger: L.newLedger(10) });
  assert.equal(h.status, "research-failed"); assert.ok(h.dropped.filter((d) => d.type === "source").length === 4);
  const wiki = [fetchResult("https://en.wikipedia.org/wiki/Planet_Fitness", "20.8 million members and 2,896 clubs and 650 million workouts and 4.3")];
  const wd = draft({ sources: [{ id: "s1", type: "other", publisher: "Wikipedia", title: "w", url: "https://en.wikipedia.org/wiki/Planet_Fitness", date: "2026" }], claims: [{ id: "c1", central: true, text: "Planet Fitness had 20.8 million members and 2,896 clubs.", numbers: ["20.8"], sourceIds: ["s1"] }], inferences: [] });
  const w = await R.research(topic(), "short", { client: mockClient([msg(wiki), textMsg(JSON.stringify(wd))]), ledger: L.newLedger(10) });
  assert.equal(w.status, "research-failed"); assert.ok(w.reasons.some((x) => /Wikipedia|sources|primary/.test(x)));
});

// ---------- script agent ----------
const costcoDossier = () => readJson("channels/profitdecoded/research/cs-001-why-costco-wants-membership-more-than-sales.json");
function goodOutput() {
  const b = readJson("channels/profitdecoded/dryruns/short-costco-membership/bundle.json");
  return { hookCandidates: b.hookCandidates, beats: b.beats.map((x) => ({ id: x.id, type: x.type, text: x.text, claimId: x.claimId })), graphics: Object.entries(b.graphicSpecs).flatMap(([beatId, specs]) => specs.map((s) => ({ beatId, type: s.type, entities: s.entities, overlayText: s.overlayText, numbers: s.numbers, evidenceClaimId: s.evidenceClaimId }))), titleCandidates: b.titleCandidates, thumbnailCandidates: b.thumbnailCandidates.map((t) => ({ id: t.id, dominantObject: t.dominantObject, text: t.text, elementCount: t.elementCount, contradiction: t.contradiction, composition: t.composition, contrast: t.contrast, numberShown: t.numberShown })), learningValue: b.learningValue };
}
const costcoTopic = () => ({ id: "cs-001-why-costco-wants-membership-more-than-sales", topic: "Why Costco Wants Membership More Than Sales", entity: "Costco", pillar: "company-stories", viralMechanism: "Company Decision + Hidden Economics" });

test("script agent: the real, human-reviewed Costco script passes every local check", () => {
  const W = A("script-agent"); const r = W.check(goodOutput(), costcoDossier(), "short");
  assert.deepEqual(r.issues, []);
  assert.ok(r.words >= 80 && r.words <= 130, String(r.words));
});

test("script agent: each failure mode is detected with an actionable message", () => {
  const W = A("script-agent"); const d = costcoDossier();
  const mutate = (fn) => { const o = goodOutput(); fn(o); return W.check(o, d, "short").issues.join(" | "); };
  assert.match(mutate((o) => { o.beats[3].text = "Fees were about 73% of operating income, which is a game-changer. But here's the twist. But that's not all."; }), /number "73%?".* not in the dossier|generic AI writing/);
  assert.match(mutate((o) => { o.beats[3].text = "Fees were about 73% of operating income."; }), /number "73/);
  assert.match(mutate((o) => { o.beats[1].claimId = "c99"; }), /unknown claim id "c99"/);
  assert.match(mutate((o) => { o.beats[0].type = "evidence"; }), /first beat must be type hook/);
  assert.match(mutate((o) => { o.titleCandidates = o.titleCandidates.slice(0, 5); }), /only 5 distinct title candidates/);
  assert.match(mutate((o) => { o.hookCandidates = ["Why do prices rise?", "Why do costs rise?", "Why do bills rise?", "Why do fees rise?", "Why do taxes rise?"]; }), /hook candidates/);
  assert.match(mutate((o) => { o.graphics = o.graphics.filter((g) => g.beatId !== "b3"); }), /beats without a graphic: b3/);
  assert.match(mutate((o) => { o.beats = o.beats.slice(0, 2); }), /too short for a short/);
  assert.match(mutate((o) => { o.thumbnailCandidates = o.thumbnailCandidates.slice(0, 1); }), /3 thumbnail concepts/);
});

test("script agent: a failing draft is rewritten against the exact findings; gates are never relaxed", async () => {
  const W = A("script-agent"); const L = A("llm"); const good = goodOutput();
  const bad = goodOutput(); bad.beats[3].text = "Fees were about 73% of operating income.";
  const c = mockClient([textMsg(JSON.stringify(bad)), textMsg(JSON.stringify(good))]);
  const r = await W.write(costcoTopic(), costcoDossier(), "short", { client: c, ledger: L.newLedger(10) });
  assert.equal(r.status, "ok"); assert.equal(r.rounds.length, 2); assert.equal(r.rounds[0].issues > 0, true);
  const second = c.calls[1].params.messages;
  assert.match(second.at(-1).content, /number "73/);
  assert.equal(second.at(-2).role, "assistant");
  const stubborn = mockClient([textMsg(JSON.stringify(bad))]);
  const f = await W.write(costcoTopic(), costcoDossier(), "short", { client: stubborn, ledger: L.newLedger(10), maxRounds: 2 });
  assert.equal(f.status, "script-failed"); assert.equal(stubborn.calls.length, 3); assert.ok(f.reasons.length > 0);
  assert.ok(c.calls[0].params.system.includes("Forbidden patterns"), "system prompt carries the anti-slop rules");
  assert.ok(JSON.stringify(c.calls[0].params.messages[0].content).includes("VERIFIED CLAIMS"));
});

test("toBundle produces a bundle the existing pipeline accepts and picks a supportable title", () => {
  const W = A("script-agent"); const b = W.toBundle(costcoTopic(), costcoDossier(), goodOutput(), "short", "../../research/x.json");
  assert.equal(b.format, "short"); assert.ok(b.selectedTitle); assert.equal(b.dossierFile, "../../research/x.json");
  assert.ok(Object.keys(b.graphicSpecs).length === b.beats.length);
  const bundle = { ...b, dossier: costcoDossier(), visualPlan: require("../../scripts/profitdecoded/plan-visuals").build(b), topicScore: 80 };
  const res = require("../../core/profitdecoded/pipeline").run(bundle, { baseDir: ROOT });
  assert.ok(res.evidence.research.pass); assert.ok(res.evidence.visuals.alignment >= 80);
  assert.notEqual(res.assessment.decision, "PUBLISH");
});

// ---------- orchestrator ----------
// A small, valid script written against the mock Planet Fitness dossier above.
function gymOutput() {
  const beats = [
    ["b1", "hook", "Planet Fitness has 20.8 million members. Its ideal customer may be someone who barely walks through the door.", "c1"],
    ["b2", "proof", "That works out to about 7,200 members per club. The division is ours, not the company's.", "i1"],
    ["b3", "evidence", "The annual report says members completed more than 650 million workouts.", "c2"],
    ["b4", "mechanism", "A well-known study found flat-fee members went about 4.3 times a month, which suggests plenty of memberships sit unused.", "c4"],
    ["b5", "mini-payoff", "Until 2024 the Classic Card cost $10 a month. New members now pay $15.", "c5"],
    ["b6", "payoff", "So a club priced like this may work best when most members, most of the time, are somewhere else. That is our reading of the numbers.", "c1"],
  ].map(([id, type, text, claimId]) => ({ id, type, text, claimId }));
  const g = (beatId, type, entities, overlayText, numbers, evidenceClaimId) => ({ beatId, type, entities, overlayText, numbers, evidenceClaimId });
  return {
    hookCandidates: [beats[0].text, "650 million workouts sounds enormous until you divide it by 20.8 million members.", "Why would a gym be fine with you staying home?", "Look at a club with 7,200 members and one set of doors. Now count the workouts.", "A gym that sells more memberships than it can hold has an odd relationship with your attendance.", "Planet Fitness gets paid whether you work out or not."],
    beats, graphics: [g("b1", "chart", ["Planet Fitness", "members"], "20.8M members", ["20.8"], "c1"), g("b2", "unit-economics", ["members", "clubs", "7,200"], "≈7,200 members per club", ["7,200"], "i1"), g("b3", "filing-excerpt", ["workouts", "annual report"], "“more than 650 million workouts”", ["650"], "c2"), g("b4", "comparison-panel", ["study", "4.3", "flat fee"], "4.3 visits a month", ["4.3"], "c4"), g("b5", "timeline", ["Classic Card", "$10", "$15"], "$10 → $15", ["10", "15"], "c5"), g("b6", "typography", ["members", "somewhere else"], "Most members, elsewhere", [], "c1")],
    titleCandidates: ["How Planet Fitness Fits 7,200 Members Into One Gym", "Planet Fitness Has 20.8 Million Members. How Many Show Up?", "What 650 Million Workouts Say About Planet Fitness", "The Math Behind a $15 Gym Membership", "Why a Gym Can Sell More Memberships Than It Can Hold", "How a $15 Gym Makes Its Money", "What Planet Fitness's Own Numbers Say About Attendance", "The Gym Membership Math Planet Fitness Doesn't Spell Out", "How Many Members Can One Gym Hold?", "Planet Fitness and the Gym Visit Nobody Counts", "The 7,200 Member Problem at Planet Fitness", "How Planet Fitness Prices Around Attendance", "What a $10 Gym Plan Cost Until 2024", "Planet Fitness Members and the Workouts That Never Happen", "Inside the Planet Fitness Numbers", "How Many Planet Fitness Members Actually Work Out?", "The Planet Fitness Capacity Question", "Why Planet Fitness Members Outnumber Workouts", "What the Planet Fitness 10-K Says About Members", "Planet Fitness: 20.8 Million Members, 650 Million Workouts", "A Gym With 7,200 Members Per Club", "Planet Fitness and the Study of Unused Memberships"],
    thumbnailCandidates: [{ id: "t1", dominantObject: "one oversized key beside a crowd of tiny keys", text: "7,200", elementCount: 2, contradiction: "thousands of keys, one room", composition: "key-hero", contrast: "high", numberShown: "7,200" }, { id: "t2", dominantObject: "turnstile beside a nearly empty floor plan", text: "", elementCount: 2, contradiction: "members on paper, few on the floor", composition: "split-door-floor", contrast: "high", numberShown: null }, { id: "t3", dominantObject: "membership card on a stopped treadmill", text: "", elementCount: 2, contradiction: "a paid card on idle equipment", composition: "card-treadmill", contrast: "medium", numberShown: null }],
    learningValue: "Tests whether capacity arithmetic on primary-source numbers holds attention.",
  };
}

test("orchestrator: research -> script -> bundle on disk, spend recorded, failures cool down", async () => {
  const P = A("produce"); const L = A("llm"); const W = A("script-agent");
  assert.deepEqual(W.check(gymOutput(), { ...draft(), claims: draft().claims, inferences: draft().inferences, thesis: draft().thesis }, "short").issues, [], "the mock script must itself satisfy the gates");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-auto-"));
  const dirs = { research: path.join(tmp, "research"), auto: path.join(tmp, "auto"), state: path.join(tmp, "state") };
  const t = topic();
  const client = mockClient([msg(researchBlocks()), textMsg(JSON.stringify(draft())), textMsg(JSON.stringify(gymOutput()))]);
  const r = await P.produce({ topic: t, universe: [t], format: "short", deps: { client, ledger: L.newLedger(20), now: new Date("2026-10-06"), storyEngine: "legacy" }, dirs, now: Date.parse("2026-10-06") });
  assert.equal(r.status, "bundle-ready", JSON.stringify(r.reasons));
  assert.deepEqual(r.steps.map((x) => x.step), ["research", "script"]);
  assert.equal(r.steps[0].reused, false);
  assert.ok(fs.existsSync(path.join(dirs.research, t.id + ".json")) && fs.existsSync(r.bundlePath));
  const saved = JSON.parse(fs.readFileSync(path.join(dirs.research, t.id + ".json"), "utf8"));
  assert.equal(saved.topicId, t.id); assert.equal(saved.format, "short");
  const runs = P.loadRuns(dirs).runs; assert.equal(runs.length, 1); assert.equal(runs[0].status, "bundle-ready"); assert.ok(runs[0].usd > 0 && runs[0].calls === 3);
  // a failed research is remembered and the topic is skipped for a week
  const failed = await P.produce({ topic: { ...t, id: "x-1" }, universe: [t], format: "short", deps: { client: mockClient([textMsg("nothing opened")]), ledger: L.newLedger(10) }, dirs, now: Date.parse("2026-10-06") });
  assert.equal(failed.status, "research-failed");
  assert.equal(P.loadRuns(dirs).runs.at(-1).status, "research-failed");
  const universe = readJson("channels/profitdecoded/topics/topic-universe.json").topics;
  const none = { ...dirs, research: path.join(tmp, "none") };
  const firstPick = P.selectTopic(universe, none, "short", Date.parse("2026-10-06"));
  P.saveRun(dirs, { at: "2026-10-05T00:00:00Z", topicId: firstPick.topic.id, format: "short", status: "research-failed", usd: 0, calls: 1, reasons: [] });
  assert.notEqual(P.selectTopic(universe, none, "short", Date.parse("2026-10-06")).topic.id, firstPick.topic.id);
  assert.equal(P.selectTopic(universe, none, "short", Date.parse("2026-10-20")).topic.id, firstPick.topic.id, "cooldown expires after 7 days");
});

test("orchestrator reuses a passing dossier instead of paying for research again", async () => {
  const P = A("produce"); const L = A("llm");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-auto-"));
  const dirs = { research: path.join(tmp, "research"), auto: path.join(tmp, "auto"), state: path.join(tmp, "state") };
  fs.mkdirSync(dirs.research, { recursive: true });
  const costco = costcoDossier(); fs.writeFileSync(path.join(dirs.research, costcoTopic().id + ".json"), JSON.stringify(costco));
  const c = mockClient([textMsg(JSON.stringify(goodOutput()))]);
  const r = await P.produce({ topic: costcoTopic(), universe: [], format: "short", deps: { client: c, ledger: L.newLedger(10), storyEngine: "legacy" }, dirs, now: Date.parse("2026-10-06") });
  assert.equal(r.status, "bundle-ready"); assert.equal(r.steps[0].reused, true); assert.equal(c.calls.length, 1);
  const written = JSON.parse(fs.readFileSync(r.bundlePath, "utf8"));
  assert.equal(written.format, "short"); assert.match(written.dossierFile, /research/);
  assert.equal(fs.existsSync(path.resolve(path.dirname(r.bundlePath), written.dossierFile)), true);
});
