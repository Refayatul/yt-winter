"use strict";
// Phase 3 story engine: cost accounting, hook engineering, spoken naturalness, Retention Critic,
// story-plan checks and the staged develop() pipeline (mock Claude client, no network, no key).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const PD = (m) => require("../../core/profitdecoded/" + m);
const A = (m) => require("../../core/profitdecoded/auto/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

// ---------- fixtures: the real Costco dossier + its human-reviewed Short, arranged as a story ----------
const dossier = () => readJson("channels/profitdecoded/research/cs-001-why-costco-wants-membership-more-than-sales.json");
const topic = () => ({ id: "cs-001-why-costco-wants-membership-more-than-sales", topic: "Why Costco Wants Membership More Than Sales", entity: "Costco", pillar: "company-stories", viralMechanism: "Company Decision + Hidden Economics" });
function story() {
  const b = readJson("channels/profitdecoded/dryruns/short-costco-membership/bundle.json");
  const mech = ["contradiction", "question", "number", "visual mystery", "hidden incentive", "financial paradox"];
  const hooks = b.hookCandidates.map((t, i) => ({ text: t, mechanism: mech[i] }));
  const winner = PD("hooks").engineer(hooks, { dossier: dossier() }).winner.text;
  const sec = { b1: "open", b2: "proof", b3: "mechanism", b4: "turn", b5: "caveat", b6: "payoff" };
  const beats = b.beats.map((x) => ({ id: x.id, type: x.type, text: x.text, claimId: x.claimId, section: sec[x.id] }));
  beats[0] = { ...beats[0], text: winner, claimId: "c1" };
  const graphics = Object.entries(b.graphicSpecs).flatMap(([beatId, gs]) => gs.map((g) => ({ beatId, type: g.type, entities: g.entities, overlayText: g.overlayText, numbers: g.numbers, evidenceClaimId: g.evidenceClaimId })));
  const out = { hookCandidates: hooks.map((h) => h.text), beats, graphics, titleCandidates: b.titleCandidates, thumbnailCandidates: b.thumbnailCandidates.map(({ brandLogo, face, ...t }) => t), learningValue: b.learningValue };
  const S = (id, purpose, claimIds, raises = [], resolves = []) => ({ id, title: id, purpose, claimIds, raises, resolves, visualIdea: "filing excerpt" });
  const plan = { thesis: dossier().thesis, centralQuestion: "What is Costco really selling?", conflict: { wants: "low prices", obstacle: "thin margins", stakes: "where your fee goes" }, misconception: "Costco profits from groceries", originalAngle: "the income-statement gap", hookCandidates: hooks,
    questions: [{ id: "q1", text: "What is Costco really selling?" }],
    sections: [S("open", "hook", ["c1"], ["q1"]), S("proof", "evidence", ["c1", "c2"]), S("mechanism", "mechanism", ["c3"]), S("turn", "turn", ["c2"]), S("caveat", "caveat", ["c4"]), S("payoff", "payoff", ["c3"], [], ["q1"])],
    payoff: "Costco sells the discount itself", caveats: ["fees are one year of data"] };
  return { plan, out, winner };
}

// ---------- mock Anthropic client keyed by stage ----------
function mockClient(byStage) {
  const calls = [];
  const stageOf = (p) => { const t = JSON.stringify(p.messages); return /STAGE: STORY PLAN/.test(t) ? "plan" : /STAGE: INDEPENDENT EDITORIAL CRITIQUE/.test(t) ? "critique" : /STAGE: TARGETED REWRITE/.test(t) ? "rewrite" : /STAGE: DRAFT/.test(t) ? "draft" : "other"; };
  const next = (params) => { const st = stageOf(params); calls.push({ params, stage: st }); const queue = byStage[st]; const r = Array.isArray(queue) ? queue.shift() : queue; return { finalMessage: async () => ({ content: [{ type: "text", text: JSON.stringify(r) }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 400, cache_creation_input_tokens: st === "plan" ? 3000 : 0, cache_read_input_tokens: st === "plan" ? 0 : 3000 } }) }; };
  return { calls, beta: { messages: { stream: next } }, messages: { stream: next } };
}

// ---------- cost accounting ----------
test("spend: cache writes cost 1.25x input, reads are listed, prices follow the model", () => {
  const L = A("llm");
  assert.equal(L.spend({ input_tokens: 1e6 }, "claude-opus-5-5"), 4);
  assert.equal(L.spend({ cache_creation_input_tokens: 1e6 }, "claude-opus-5-5"), 5);
  assert.equal(L.spend({ cache_read_input_tokens: 1e6 }, "claude-opus-5-5"), 0.2);
  assert.equal(L.spend({ output_tokens: 1e6 }, "claude-opus-5-5"), 20);
  assert.equal(L.spend({ input_tokens: 1e6, output_tokens: 1e6 }, "claude-sonnet-5-5"), 12);
  assert.equal(L.spend({ input_tokens: 1e6 }, "some-future-model"), 4, "unknown models are priced as Opus 5.5, never cheaper");
  const ledger = L.newLedger(5); L.recordStage(ledger, "plan", { input_tokens: 10, output_tokens: 5 }, 0.01); L.recordStage(ledger, "plan", { input_tokens: 10 }, 0.02);
  assert.deepEqual([ledger.stages.plan.calls, ledger.stages.plan.usd, ledger.stages.plan.usage.input_tokens], [2, 0.03, 20]);
  assert.deepEqual(L.flatten([{ role: "user", content: [{ type: "text", text: "a", cache_control: {} }, { type: "text", text: "b" }] }]), [{ role: "user", content: "a\n\nb" }]);
});

test("llm.run sends top-level prompt caching and a per-call model override, and records the stage", async () => {
  const L = A("llm"); const calls = [];
  const client = { beta: { messages: { stream: (p) => { calls.push(p); return { finalMessage: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 10 } }) }; } } } };
  const ledger = L.newLedger(5);
  await L.run({ client, system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" }, ledger, stage: "critique", model: "claude-sonnet-5-5" });
  assert.deepEqual(calls[0].cache_control, { type: "ephemeral" });
  assert.equal(calls[0].model, "claude-sonnet-5-5");
  assert.equal(ledger.stages.critique.calls, 1);
  await L.run({ client, system: "s", messages: [], ledger, cache: false });
  assert.ok(!("cache_control" in calls[1]));
});

// ---------- hook engineering ----------
test("hook engineering: six dimensions, factual gate, the winner is always factual", () => {
  const H = PD("hooks"); const d = dossier();
  const r = H.engineer([
    { text: "Costco's income statement shows $275.2 billion in revenue and $269.9 billion in sales of goods. Something fills that gap.", mechanism: "visual mystery" },
    { text: "Costco makes more money than any store on Earth from one line nobody reads.", mechanism: "contradiction" },
    { text: "Costco collected $9.9 billion last year just for letting people in.", mechanism: "number" },
    { text: "What if the cheapest store in town isn't making its money from the things it sells?", mechanism: "question" },
    { text: "Have you ever wondered how Costco makes money?", mechanism: "reveal" },
  ], { dossier: d });
  for (const row of r.ranked) for (const k of ["curiosity", "clarity", "originality", "tension", "visual", "factual"]) assert.ok(Number.isFinite(row.dims[k]), k);
  const bad = Object.fromEntries(r.ranked.map((x) => [x.text.slice(0, 20), x.factual]));
  assert.equal(bad["Costco makes more mo"].pass, false, "absolute claim without dossier support");
  assert.match(bad["Costco collected $9."].problems.join(), /9\.9/);
  assert.equal(r.winner.factual.pass, true);
  assert.ok(r.ranked.find((x) => /Have you ever/.test(x.text)).dims.originality < 50);
  assert.match(H.engineer(["a b c d e f g h i"], { dossier: d }).problems.join(), /need >=5/);
});

// ---------- spoken naturalness ----------
test("spoken naturalness flags what is hard to say or follow, and leaves plain narration alone", () => {
  const AI = PD("ai-patterns");
  const hard = AI.spoken("In order to leverage the ASC 606 framework, Starbucks recognizes breakage, which is, essentially, revenue from cards that are not expected to be redeemed (based on historical patterns), and it reported $200.4 million, $187.6 million and $196.1 million over three years.");
  const names = hard.findings.map((f) => f.name).join("|");
  for (const n of ["sentence too long", "too many numbers", "written punctuation", "corporate/academic", "acronym not explained"]) assert.match(names, new RegExp(n));
  assert.equal(hard.verdict, "REWRITE");
  const plain = AI.spoken("Starbucks keeps a list of money people loaded onto cards. Most of it gets spent. Some of it never does. The company has a name for that part. It calls it breakage, and it counts it as sales.");
  assert.equal(plain.verdict, "OK"); assert.ok(plain.score >= 90);
  assert.ok(AI.analyze("But here is the twist.").findings.some((f) => f.name === "stock twist transition"));
});

// ---------- Retention Critic ----------
test("retention critic: repetition, teasers, filler, unpaid questions, missing payoff, mechanical loops", () => {
  const R = PD("retention");
  const b = (id, section, text, claimId = "c1", type = "evidence") => ({ id, section, text, claimId, type });
  const r = R.critique([
    b("b1", "open", "Starbucks booked $200.4 million last year from card money it does not expect anyone to spend. Who decides what you will forget?", "c1", "hook"),
    b("b2", "mid", "Stay with me, because this changes everything about gift cards.", "c1"),
    b("b3", "mid", "Starbucks booked $200.4 million last year from card money it does not expect anyone to spend.", "c1"),
    b("b4", "pad", "It is what it is.", "c1"),
    b("b5", "end", "So the balances stay on the books for a while.", "c1", "payoff"),
  ], { format: "long" });
  const all = JSON.stringify(r);
  for (const t of ["forced-drama", "repetition", "filler", "unpaid-question", "missing-payoff"]) assert.match(all, new RegExp(t), t);
  assert.equal(r.provenance, "ESTIMATED"); assert.match(r.disclaimer, /does not measure or predict/);
  assert.ok(r.weakest.length >= 1 && r.weakest[0].fix);
  // questions on a metronome
  const loop = Array.from({ length: 6 }, (_, i) => b("q" + i, "s" + i, `Fact number ${i + 1} about the card balance and the store ledger appears here in a plain sentence. Why does item ${i + 1} matter?`, "c" + i));
  assert.match(JSON.stringify(R.critique(loop, { format: "long" }).global), /mechanical-loops/);
  // the approved fixture reads clean
  const { plan, out } = story();
  const clean = R.critique(out.beats, { plan, format: "short" });
  assert.deepEqual(clean.global.filter((g) => g.severity === "high"), []);
});

test("editorial report grades every section and flags claim ids the dossier does not have", () => {
  const R = PD("retention"); const { plan, out } = story();
  const rep = R.editorialReport([...out.beats, { id: "x", section: "payoff", type: "payoff", text: "An extra line citing nothing real.", claimId: "zz" }], { plan, dossier: dossier(), format: "short" });
  assert.equal(rep.sections.length, plan.sections.length);
  for (const s of rep.sections) for (const k of ["retention", "naturalness", "genericness", "evidence"]) assert.ok(Number.isFinite(s.grades[k]), k);
  assert.ok(rep.sections.find((s) => s.id === "payoff").issues.some((i) => i.type === "unknown-claim"));
});

// ---------- story plan checks ----------
test("story plan checks: claim ids, every question resolved, a turn, a caveat, payoff last, factual hooks", () => {
  const W = A("script-agent"); const { plan } = story(); const d = dossier();
  assert.deepEqual(W.evaluatePlan(plan, d).issues, []);
  const broken = { ...plan, sections: plan.sections.filter((s) => !["turn", "caveat", "payoff"].includes(s.id)).map((s) => (s.id === "proof" ? { ...s, claimIds: ["c1", "nope"] } : s)), hookCandidates: plan.hookCandidates.slice(0, 3) };
  const issues = W.evaluatePlan(broken, d).issues.join("\n");
  for (const t of ["unknown claim id", "never resolved", "no complication or turn", "payoff", "caveat", "hook"]) assert.match(issues, new RegExp(t), t);
  // editorial hook override: allowed for a close factual hook with a reason, refused otherwise
  const ranked = W.evaluatePlan(plan, d).hooks.ranked;
  const close = ranked.find((h, i) => i > 0 && h.factual.pass && ranked[0].total - h.total <= 10);
  const ok = W.evaluatePlan({ ...plan, selectedHook: close.text, selectionReason: "more familiar brand" }, d);
  assert.deepEqual(ok.issues, []); assert.equal(ok.selected.text, close.text); assert.ok(ok.override && ok.override.reason);
  // an invalid override never fails the plan: it is ignored with a warning and the best factual hook opens
  const noReason = W.evaluatePlan({ ...plan, selectedHook: close.text }, d);
  assert.deepEqual(noReason.issues, []); assert.match(noReason.warnings.join(), /selectionReason/); assert.equal(noReason.selected.text, ranked[0].text);
  const far = ranked.find((h) => ranked[0].total - h.total > 10);
  if (far) { const f = W.evaluatePlan({ ...plan, selectedHook: far.text, selectionReason: "x" }, d); assert.match(f.warnings.join(), /more than 10 below/); assert.equal(f.selected.text, ranked[0].text); }
  assert.match(W.evaluatePlan({ ...plan, selectedHook: "not a candidate", selectionReason: "x" }, d).warnings.join(), /not one of the hook candidates/);
});

// ---------- staged develop() ----------
test("develop: plan -> draft -> independent critique -> targeted rewrite, shared cached prefix, per-stage costs", async () => {
  const W = A("script-agent"); const L = A("llm"); const { plan, out } = story();
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-story-"));
  const draft = { ...out, beats: out.beats.map((b) => (b.id === "b5" ? { ...b, text: "And you do renew. In the US and Canada, 92.3% of members did. Stay with me, because this changes everything." } : b)) };
  const critique = { verdict: "revise", problems: [{ section: "caveat", beatIds: ["b5"], type: "forced-drama", severity: "high", quote: "Stay with me", fix: "cut the teaser" }], keep: ["the income-statement opening"], automatedReadingsDisputed: [] };
  const rewrite = { beats: out.beats, graphics: [], changeLog: ["b5: removed teaser"] };
  const client = mockClient({ plan: [plan], draft: [draft], critique: [critique], rewrite: [rewrite] });
  const ledger = L.newLedger(20);
  const r = await W.develop(topic(), dossier(), "short", { client, ledger, cacheDir, finalEvaluation: false });
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  assert.deepEqual(client.calls.map((c) => c.stage), ["plan", "draft", "critique", "rewrite"]);
  // shared, prompt-cached prefix: same system, dossier block first with cache_control
  assert.equal(new Set(client.calls.map((c) => c.params.system)).size, 1);
  for (const c of client.calls) { const first = c.params.messages[0].content[0]; assert.deepEqual(first.cache_control, { type: "ephemeral" }); assert.match(first.text, /VERIFIED CLAIMS/); }
  // the critic is independent: one fresh user turn, no drafting conversation
  const crit = client.calls.find((c) => c.stage === "critique");
  assert.equal(crit.params.messages.length, 1); assert.doesNotMatch(JSON.stringify(crit.params.messages), /STAGE: DRAFT/);
  assert.match(JSON.stringify(crit.params.messages), /AUTOMATED READINGS/);
  // targeted rewrite kept titles, thumbnails and graphics; the teaser is gone
  assert.equal(r.out.titleCandidates.length, out.titleCandidates.length);
  assert.ok(!/Stay with me/.test(r.out.beats.map((b) => b.text).join(" ")));
  assert.equal(r.out.beats[0].text, r.winningHook);
  assert.ok(r.draft.assessment.blocking.some((x) => /forced-drama/.test(x)), "the draft's teaser was caught deterministically too");
  for (const st of ["plan", "draft", "critique", "rewrite"]) assert.equal(ledger.stages[st].calls, 1, st);
  assert.ok(ledger.usd > 0);
  // a second run reuses every stage from the disk cache: no calls, no client, no key
  const again = await W.develop(topic(), dossier(), "short", { ledger: L.newLedger(20), cacheDir, finalEvaluation: false });
  assert.equal(again.status, "ok"); assert.equal(again.cacheHits, 4); assert.equal(again.ledger.calls, 0);
  // the bundle carries the story artefacts and still feeds the existing pipeline
  const bundle = W.bundleFromStory(topic(), dossier(), r, "short", "../research/x.json");
  assert.ok(bundle.storyPlan && bundle.editorial.critique && bundle.editorial.hooks.length >= 5);
  const P = PD("pipeline"); const res = P.run({ ...bundle, dossier: dossier() });
  assert.ok(res.evidence.retention && res.evidence.spoken);
  assert.match(PD("report").render(res, { ...bundle, dossier: dossier() }, {}), /Retention critic/);
});

test("develop: gates are never relaxed (unverified research, unfixable script)", async () => {
  const W = A("script-agent"); const L = A("llm"); const { plan, out } = story();
  const weak = { ...dossier(), sources: dossier().sources.slice(0, 1) };
  const none = mockClient({});
  const r1 = await W.develop(topic(), weak, "short", { client: none, ledger: L.newLedger(5), cacheDir: false });
  assert.equal(r1.status, "research-failed"); assert.equal(none.calls.length, 0);
  const bad = { ...out, beats: out.beats.map((b) => (b.id === "b3" ? { ...b, text: b.text + " Costco earned $99 billion from it." } : b)) };
  const client = mockClient({ plan: [plan], draft: [bad], critique: [{ verdict: "revise", problems: [], keep: [], automatedReadingsDisputed: [] }], rewrite: [{ beats: bad.beats, graphics: [], changeLog: [] }, { beats: bad.beats, graphics: [], changeLog: [] }] });
  const r2 = await W.develop(topic(), dossier(), "short", { client, ledger: L.newLedger(5), cacheDir: false, maxRewrites: 2, finalEvaluation: false });
  assert.equal(r2.status, "script-failed");
  assert.match(r2.reasons.join(), /99/);
  assert.equal(client.calls.filter((c) => c.stage === "rewrite").length, 2);
});

test("orchestrator uses the story engine by default; PD_STORY_ENGINE=legacy keeps the single-call writer", async () => {
  const P = A("produce"); const L = A("llm"); const { plan, out } = story();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-story-"));
  const dirs = { research: path.join(tmp, "research"), auto: path.join(tmp, "auto"), state: path.join(tmp, "state") };
  fs.mkdirSync(dirs.research, { recursive: true }); fs.writeFileSync(path.join(dirs.research, topic().id + ".json"), JSON.stringify(dossier()));
  const client = mockClient({ plan: [plan], draft: [out], critique: [{ verdict: "ready", problems: [], keep: ["all"], automatedReadingsDisputed: [] }] });
  const r = await P.produce({ topic: topic(), universe: [], format: "short", deps: { client, ledger: L.newLedger(10), cacheDir: false, finalEvaluation: false }, dirs, now: Date.parse("2026-10-09") });
  assert.equal(r.status, "bundle-ready", JSON.stringify(r.reasons));
  assert.equal(r.steps[1].engine, "story"); assert.ok(r.steps[1].stages.plan && r.steps[1].stages.critique);
  const written = JSON.parse(fs.readFileSync(r.bundlePath, "utf8"));
  assert.ok(written.storyPlan && written.editorial); assert.equal(written.authoring.stage, "story-engine");
});

test("calibration: a Short needs one central claim, long-form all; a dead stretch needs duration", () => {
  const W = A("script-agent"); const R = PD("retention"); const { plan } = story(); const d = dossier();
  const oneIdea = { ...plan, sections: plan.sections.map((s) => ({ ...s, claimIds: s.claimIds.filter((c) => c !== "c2" && c !== "c3") })).map((s) => (s.claimIds.length ? s : { ...s, claimIds: ["c1"] })) };
  assert.ok(W.evaluatePlan(oneIdea, d, "long").issues.some((i) => /central claim/.test(i)));
  assert.ok(!W.evaluatePlan(oneIdea, d, "short").issues.some((i) => /central claim/.test(i)));
  const b = (id, section, text) => ({ id, section, text, claimId: "c1", type: "evidence" });
  const short = R.critique([b("a", "s1", "Starbucks counted $222.4 million of card money as sales in fiscal 2025."), b("b", "s2", "It books that money slowly, as other cards are spent.")], { format: "short" });
  assert.ok(!JSON.stringify(short).includes("dead-stretch"), "a one-sentence beat is not a stretch");
  const long = R.critique([b("a", "s1", "Starbucks counted $222.4 million of card money as sales in fiscal 2025."), b("b", "s2", "It books that money slowly, as other cards are spent, and it does this every single year, quietly, in the background, without anyone noticing very much at all, while the money keeps moving from one line of the accounts to another line of the accounts.")], { format: "long" });
  assert.ok(JSON.stringify(long).includes("dead-stretch"));
});

test("production test packages (gift cards) pass the research gate and every story check, with no number outside the dossier", () => {
  const { execFileSync } = require("child_process");
  for (const pkg of ["hbm-073-gift-cards-long", "hbm-073-gift-cards-short"]) {
    const dir = path.join(ROOT, "channels/profitdecoded/story-tests", pkg);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pd-pkg-"));
    for (const f of ["meta.json", "plan.json", "draft.json", "critique.json", "final.json"]) fs.copyFileSync(path.join(dir, f), path.join(tmp, f));
    const outText = execFileSync("node", [path.join(ROOT, "profitdecoded.js"), "story-review", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.match(outText, /final: \d+ words, 0 blocking/, outText);
    const review = fs.readFileSync(path.join(tmp, "review.md"), "utf8");
    assert.match(review, /Numbers in the final script that are not in the dossier: none/);
    assert.match(review, /does not measure or predict audience retention/);
    const bundle = JSON.parse(fs.readFileSync(path.join(tmp, "bundle.json"), "utf8"));
    assert.ok(bundle.storyPlan && bundle.editorial && bundle.beats.length);
  }
  const d = readJson("channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json");
  for (const f of ["long", "short"]) assert.equal(PD("research").gate(d, { format: f }).pass, true, f);
  for (const c of d.claims) assert.ok((c.evidence || []).length >= 1, c.id + " has a verbatim passage");
});
