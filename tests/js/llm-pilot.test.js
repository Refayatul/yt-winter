"use strict";
// LLM routing + Haiku Shorts pilot + ProfitDecoded scene specs. No test sends a request to any provider:
// every paid path runs against an in-memory fake SDK and a temporary ledger file.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Channel = require("../../core/channel-context");
const Router = require("../../core/llm/router");
const Llm = require("../../core/llm/client");
const Writer = require("../../core/llm/shorts-writer");
const Budget = require("../../core/profitdecoded/budget");
const SceneSpec = require("../../core/profitdecoded/scene-spec");

const IB = Channel.getChannel("impossible-brief");
const CT = Channel.getChannel("critical-thread");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "llm-pilot-"));
const NOW = Date.parse("2026-10-11T10:00:00Z");

function paidPolicy(extra = {}) {
  return {
    paidEnabled: true, paidApproval: { id: "test-approval", pool: "experiment", model: "claude-haiku-5-5", expiresAt: "2026-10-12T00:00:00Z", approvedBy: "test" },
    targetPerScriptUsd: 0.005, maxPerScriptUsd: 0.02, dailyUsd: 0.1, monthlyUsd: { script: 1, experiment: 0.5 },
    maxRetries: 1, maxCallsPerRun: 6, maxAutoRewrites: 0, reservationTtlMinutes: 30, ...extra,
  };
}
const usage = { input_tokens: 900, output_tokens: 700, cache_creation_input_tokens: 600, cache_read_input_tokens: 0 };
function fakeSdk(responses) {
  const calls = [];
  return { calls, messages: { create: async (params) => { calls.push(params); const r = responses.shift(); if (r instanceof Error) throw r; return r; } } };
}
const ok = (json, extra = {}) => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(json) }], ...extra });
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const prompt = { system: "rules", user: "topic", schema: { type: "object" } };

function paidClient({ responses, policy = paidPolicy(), env = { IB_ANTHROPIC_API_KEY: "sk-test-secret" }, dir = tmp() } = {}) {
  const sdk = fakeSdk(responses);
  const store = new Budget.FileStore(path.join(dir, "ledger.json"), { create: true });
  const logFile = path.join(dir, "usage.jsonl");
  const client = Llm.createClient(IB, { run: true, env, sdk, store, policy, logFile, now: () => NOW });
  return { client, sdk, store, logFile, dir };
}

// ---------------------------------------------------------------------------------------------- router
test("router: Haiku by default, env overrides (channel beats global), explicit escalation only", () => {
  const r = Router.resolve("short-script", IB, { env: {} });
  assert.equal(r.model, "claude-haiku-5-5");
  assert.equal(r.keyName, "IB_ANTHROPIC_API_KEY");
  assert.equal(Router.resolve("short-script", IB, { env: { LLM_MODEL_SHORT_SCRIPT: "claude-sonnet-5-5" } }).model, "claude-sonnet-5-5");
  const both = { LLM_MODEL_SHORT_SCRIPT: "claude-sonnet-5-5", IB_LLM_MODEL_SHORT_SCRIPT: "claude-opus-5-5" };
  assert.equal(Router.resolve("short-script", IB, { env: both }).model, "claude-opus-5-5");
  assert.equal(Router.resolve("short-script", CT, { env: both }).model, "claude-sonnet-5-5", "IB's override must not leak to CT");
  assert.equal(Router.resolve("scene-spec", IB, { env: {}, escalate: true }).model, "claude-sonnet-5-5");
  assert.throws(() => Router.resolve("short-script", IB, { env: {}, escalate: true }), /no escalation model/);
  assert.throws(() => Router.resolve("nope", IB, { env: {} }), /unknown LLM task/);
  assert.throws(() => Router.resolve("short-script", IB, { env: { LLM_MODEL_SHORT_SCRIPT: "claude-mystery-9" } }), /unpriced model/);
});

test("router config: every task routes to a priced model and no Shorts task defaults to an expensive model", () => {
  const routing = Router.loadRouting();
  for (const [task, spec] of Object.entries(routing.tasks)) {
    assert.ok(routing.prices[spec.model], `${task} model priced`);
    if (spec.escalateTo) assert.ok(routing.prices[spec.escalateTo], `${task} escalation priced`);
    if (/^(short-|topic-|visual-|scene-|qa-)/.test(task)) assert.equal(spec.model, "claude-haiku-5-5", task);
  }
});

// ---------------------------------------------------------------------------------------------- client
test("client: dry-run is the default and never touches the SDK or the key", async () => {
  const sdk = fakeSdk([]);
  const client = Llm.createClient(IB, { env: {}, sdk });
  const r = await client.call("short-script", prompt, { videoId: "IB-X" });
  assert.equal(r.dryRun, true);
  assert.equal(sdk.calls.length, 0);
  assert.ok(r.maxUsd > 0 && r.maxUsd < 0.01, `worst case ${r.maxUsd}`);
  assert.equal(r.params.system[0].cache_control.type, "ephemeral");
  assert.equal(r.params.output_config.format.type, "json_schema");
  assert.deepEqual(r.params.thinking, { type: "disabled" });
});

test("client: committed channel policies keep paid calls disabled", async () => {
  for (const slug of ["impossible-brief", "critical-thread", "behind-the-ordinary", "failure-reconstructed"]) {
    const policy = Llm.loadPolicy(Channel.getChannel(slug));
    assert.equal(policy.paidEnabled, false, slug);
    assert.equal(policy.paidApproval, null, slug);
  }
  const client = Llm.createClient(IB, { run: true, env: { IB_ANTHROPIC_API_KEY: "x" }, sdk: fakeSdk([]) });
  await assert.rejects(client.call("short-script", prompt, { videoId: "IB-X" }), (e) => e.code === "PAID_DISABLED");
});

test("client: refuses without the channel's own key (another channel's key is ignored)", async () => {
  const { client, sdk } = paidClient({ responses: [], env: { ANTHROPIC_API_KEY: "shared", CT_ANTHROPIC_API_KEY: "ct" } });
  await assert.rejects(client.call("short-script", prompt, { videoId: "IB-X" }), (e) => e.code === "NO_KEY" && /IB_ANTHROPIC_API_KEY/.test(e.message));
  assert.equal(sdk.calls.length, 0);
});

test("client: a paid call is reserved, settled at actual usage and logged without the key", async () => {
  const { client, store, logFile, sdk } = paidClient({ responses: [ok({ beats: [] })] });
  const r = await client.call("short-script", prompt, { videoId: "IB-X" });
  assert.deepEqual(r.json, { beats: [] });
  assert.equal(sdk.calls[0].model, "claude-haiku-5-5");
  const expected = Llm.costUsd(usage, Router.loadRouting().prices["claude-haiku-5-5"]);
  assert.equal(r.actualUsd, expected);
  const { doc } = await store.read();
  const entry = doc.entries.find((e) => e.type === "spend");
  assert.equal(entry.status, "settled");
  assert.equal(entry.actualUsd, expected);
  assert.ok(entry.estimateUsd >= entry.actualUsd);
  const log = fs.readFileSync(logFile, "utf8");
  assert.ok(!log.includes("sk-test-secret"));
  assert.equal(JSON.parse(log.trim()).usage.output_tokens, 700);
});

test("client: refusal, max_tokens and a different response model are errors, never results", async () => {
  for (const [response, code] of [[ok({}, { stop_reason: "refusal" }), "REFUSAL"], [ok({}, { stop_reason: "max_tokens" }), "MAX_TOKENS"], [ok({}, { model: "claude-opus-5-5" }), "MODEL_MISMATCH"]]) {
    const { client } = paidClient({ responses: [response] });
    await assert.rejects(client.call("short-script", prompt, { videoId: `IB-${code}` }), (e) => e.code === code);
  }
});

test("client: bounded retry only for 529/429 (released), a 500 is uncertain and not retried", async () => {
  const a = paidClient({ responses: [httpError(529), ok({ beats: [] })] });
  await a.client.call("short-script", prompt, { videoId: "IB-R" });
  assert.equal(a.sdk.calls.length, 2);
  const docA = (await a.store.read()).doc.entries.filter((e) => e.type === "spend");
  assert.deepEqual(docA.map((e) => e.status).sort(), ["released", "settled"]);
  const b = paidClient({ responses: [httpError(529), httpError(529), ok({})] });
  await assert.rejects(b.client.call("short-script", prompt, { videoId: "IB-R2" }), (e) => e.code === "REQUEST_FAILED");
  assert.equal(b.sdk.calls.length, 2, "maxRetries 1 = two attempts at most");
  const c = paidClient({ responses: [httpError(500), ok({})] });
  await assert.rejects(c.client.call("short-script", prompt, { videoId: "IB-U" }), (e) => e.code === "REQUEST_FAILED");
  assert.equal(c.sdk.calls.length, 1);
  assert.equal((await c.store.read()).doc.entries.find((e) => e.type === "spend").status, "uncertain");
});

test("client: daily, per-video and per-run limits refuse before anything is sent", async () => {
  const daily = paidClient({ responses: [ok({})], policy: paidPolicy({ dailyUsd: 0.0001 }) });
  await assert.rejects(daily.client.call("short-script", prompt, { videoId: "IB-D" }), (e) => e.code === "BUDGET" && /daily/.test(e.message));
  assert.equal(daily.sdk.calls.length, 0);
  const video = paidClient({ responses: [ok({})], policy: paidPolicy({ maxPerScriptUsd: 0.0001 }) });
  await assert.rejects(video.client.call("short-script", prompt, { videoId: "IB-V" }), (e) => e.code === "BUDGET");
  const run = paidClient({ responses: [ok({}), ok({})], policy: paidPolicy({ maxCallsPerRun: 1 }) });
  await run.client.call("short-script", prompt, { videoId: "IB-1" });
  await assert.rejects(run.client.call("short-script", prompt, { videoId: "IB-2" }), (e) => e.code === "CALL_LIMIT");
});

test("client: per-request input cap and batch request shape", () => {
  const client = Llm.createClient(IB, { env: {} });
  assert.throws(() => client.plan("short-script", { system: "x".repeat(20000), user: "y" }), (e) => e.code === "REQUEST_TOO_LARGE");
  const planned = client.plan("short-script", prompt);
  const req = Llm.batchRequest("IB-SPA-001 short", planned.params);
  assert.match(req.custom_id, /^[a-zA-Z0-9_-]+$/);
  assert.equal(req.params.model, "claude-haiku-5-5");
  const price = { input: 0.1, output: 0.5, cacheRead: 0.01 };
  assert.ok(Math.abs(Llm.costUsd(usage, price, { batch: true }) - Llm.costUsd(usage, price) / 2) < 1e-6);
});

test("budget: the optional daily limit leaves policies without dailyUsd unchanged", () => {
  const base = { ...paidPolicy(), dailyUsd: undefined };
  const req = { id: "x", scriptId: "s", pool: "experiment", category: "script", estimateUsd: 0.01, month: "2026-10" };
  assert.equal(Budget.decide({ entries: [] }, req, base, NOW).ok, true);
  const spent = { entries: [{ type: "spend", id: "y", scriptId: "other", pool: "experiment", month: "2026-10", status: "settled", actualUsd: 0.004, estimateUsd: 0.01, createdAt: new Date(NOW).toISOString() }] };
  assert.equal(Budget.decide(spent, req, base, NOW).ok, true);
  assert.equal(Budget.decide(spent, req, { ...base, dailyUsd: 0.012 }, NOW).code, "BUDGET");
  const yesterday = { entries: [{ ...spent.entries[0], createdAt: new Date(NOW - 86400000).toISOString() }] };
  assert.equal(Budget.decide(yesterday, req, { ...base, dailyUsd: 0.012 }, NOW).ok, true);
});

// ---------------------------------------------------------------------------------------------- writer
const Context = require("../../core/growth/context");
const ctxIB = Context.build(IB, {});
const moon = ctxIB.inventory.find((t) => t.id === "IB-SPA-001");

function goodOutput() {
  return {
    beats: [
      { text: "If the Moon vanished, tides would not stop.", role: "IMPOSSIBLE_QUESTION", layer: "ESTIMATED CONSEQUENCE", evidence: ["F3"], visual: "Night coast, Moon gone" },
      { text: "The Sun still raises tides about 46% as strong.", role: "FIRST_EFFECT", layer: "KNOWN SCIENCE", evidence: ["F3"], visual: "Tide gauge" },
      { text: "Gravity's news travels at the speed of light.", role: "SCIENCE_EXPLANATION", layer: "KNOWN SCIENCE", evidence: ["F2"], visual: "Light pulse" },
      { text: "The Moon sits 1.3 light-seconds away, so Earth notices 1.3 seconds later.", role: "FIRST_EFFECT", layer: "KNOWN SCIENCE", evidence: ["F1"], visual: "Distance bar" },
      { text: "Then the big lunar tides fade, leaving the smaller solar ones.", role: "SECOND_ORDER_EFFECT", layer: "ESTIMATED CONSEQUENCE", evidence: ["F3"], visual: "Coastline before and after" },
      { text: "Earth's tilt, now about 23.44 degrees, loses a stabilizer.", role: "SECOND_ORDER_EFFECT", layer: "KNOWN SCIENCE", evidence: ["F4"], visual: "Tilted globe" },
      { text: "But 2011 simulations suggest it might only wander between 20 and 25 degrees.", role: "LIMITS", layer: "KNOWN SCIENCE", evidence: ["F5"], visual: "Range dial" },
      { text: "So the first change you would see is darker nights.", role: "SCIENTIFIC_PAYOFF", layer: "ESTIMATED CONSEQUENCE", evidence: [], visual: "Moonless sky" },
    ],
    title: "What Happens 1.3 Seconds After the Moon Vanishes", description: "Tides shrink but do not stop. Nights get darker.", tags: ["moon", "tides", "gravity", "space science", "what if"], thumbnailText: "NO MOON",
  };
}

test("writer: the model sees sourced facts only, never the curated narration", () => {
  const p = Writer.buildPrompt(moon, IB, { config: ctxIB.config });
  assert.ok(p.record.facts.length >= 3);
  assert.ok(p.record.facts.every((f) => f.source !== "editorial narration"));
  for (const line of moon.narration) assert.ok(!p.user.includes(line), `curated line leaked: ${line}`);
  assert.ok(p.system.includes("ImpossibleBrief"));
});

test("writer: a traceable, well-formed Short passes the deterministic gates", () => {
  const p = Writer.buildPrompt(moon, IB, { config: ctxIB.config });
  const v = Writer.validate(goodOutput(), moon, IB, p);
  assert.deepEqual(v.blockers, []);
  assert.equal(v.passes, true);
  assert.match(v.editorialReview, /required/);
  const script = Writer.toScript(goodOutput(), moon);
  assert.equal(script.claims.length, 8);
  assert.ok(script.claims[1].start > 0);
});

test("writer: invented numbers, uncited verified beats, structure and metadata problems are blockers", () => {
  const p = Writer.buildPrompt(moon, IB, { config: ctxIB.config });
  const cases = [
    [(o) => { o.beats[1].text = "The Sun still raises tides about 61% as strong."; }, /not in its cited facts|unsupported number/],
    [(o) => { o.beats[2].evidence = []; }, /cites no fact/],
    [(o) => { o.beats[2].evidence = ["F99"]; }, /unknown fact id/],
    [(o) => { o.beats[0].role = "FIRST_EFFECT"; }, /first beat/],
    [(o) => { o.beats[0].text = "Did you know the Moon could vanish?"; }, /forbidden opening/],
    [(o) => { o.description = "See https://example.com"; }, /link/],
    [(o) => { o.title = "The Moon Vanishes in 7 Seconds"; }, /title number/],
    [(o) => { o.tags = ["moon"]; }, /tags/],
  ];
  for (const [mutate, pattern] of cases) {
    const o = goodOutput(); mutate(o);
    const v = Writer.validate(o, moon, IB, p);
    assert.equal(v.passes, false, String(pattern));
    assert.ok(v.blockers.some((b) => pattern.test(b)), `${pattern} in ${v.blockers.join(" | ")}`);
  }
});

test("writer: comparison reports measurements, not a quality score", () => {
  const c = Writer.compare(moon.narration, goodOutput().beats.map((b) => b.text), moon, IB, { config: ctxIB.config });
  assert.equal(typeof c.baseline.words, "number");
  assert.equal(c.candidate.beats, 8);
  assert.ok(!("score" in c) && !("winner" in c));
});

// ---------------------------------------------------------------------------------------------- shadow
test("shadow hook: off by default, isolated when on, never sends unless asked", () => {
  const { llmShadow } = require("../../core/pipeline/impossible-brief");
  let spawned = null;
  const spawn = (cmd, args) => { spawned = args; return { status: 0 }; };
  assert.equal(llmShadow(IB, moon, "/tmp/out", {}, spawn), null);
  assert.equal(spawned, null);
  llmShadow(IB, moon, "/tmp/out", { LLM_SHORTS_SHADOW: "1" }, spawn);
  assert.ok(spawned.includes("--topic") && !spawned.includes("--run"));
  llmShadow(IB, moon, "/tmp/out", { LLM_SHORTS_SHADOW: "run" }, spawn);
  assert.ok(spawned.includes("--run"));
  assert.equal(llmShadow(IB, moon, "/tmp/out", { LLM_SHORTS_SHADOW: "1" }, () => { throw new Error("boom"); }), null);
  assert.equal(llmShadow(IB, moon, "/tmp/out", { LLM_SHORTS_SHADOW: "1" }, () => ({ status: 2, stderr: "PAID_DISABLED" })), 2);
});

test("shadow CLI: dry run writes prompt, baseline and estimate; --run is refused by the committed policy", async () => {
  const { shadow } = require("../../scripts/llm/shorts-shadow");
  const out = tmp();
  const summary = await shadow({ channel: IB, topicId: "IB-SPA-001", out, env: {} });
  assert.equal(summary.mode, "dry-run");
  for (const f of ["prompt.json", "baseline.json", "summary.json", "usage.jsonl"]) assert.ok(fs.existsSync(path.join(out, f)), f);
  await assert.rejects(shadow({ channel: IB, topicId: "IB-SPA-001", out: tmp(), run: true, env: { IB_ANTHROPIC_API_KEY: "x" }, sdk: fakeSdk([]) }), (e) => e.code === "PAID_DISABLED");
});

// ---------------------------------------------------------------------------------------------- scene spec
const sample = require("../fixtures/profitdecoded/scene-spec-hbm-034-sample.json");
const timeline = require("../fixtures/profitdecoded/scene-spec-timeline.json");
const clone = () => JSON.parse(JSON.stringify(sample));

test("scene spec: the sample covers every scene type and passes the gates", () => {
  assert.deepEqual([...new Set(sample.scenes.map((s) => s.type))].sort(), Object.keys(SceneSpec.TYPES).sort());
  const v = SceneSpec.validate(sample, { timeline, allowedNumbers: ["8.2", "10", "9.3", "10.6", "7.2", "3.4", "7.8", "27.6", "24", "2025", "31", "9.0", "2020", "2024", "5"] });
  assert.deepEqual(v.blockers, []);
  const shots = SceneSpec.planShots(sample, timeline);
  assert.equal(shots.length, sample.scenes.length);
  assert.ok(shots.every((s, i) => i === 0 || s.start >= shots[i - 1].start));
});

test("scene spec: unknown types, unsourced figures, unspoken cues, long text and undossiered numbers block", () => {
  const cases = [
    [(s) => { s.scenes[0].type = "hologram"; }, /unknown type/],
    [(s) => { delete s.scenes[1].source; }, /needs "source"|without a source/],
    [(s) => { s.scenes[1].cue = "twelve billion"; }, /not spoken/],
    [(s) => { s.scenes[5].text = "x".repeat(60); }, /mobile font floor/],
    [(s) => { s.scenes[0].beat = "s99-1"; }, /not in the timeline/],
    [(s) => { s.scenes[2].links[0].to = "ghost"; }, /missing node/],
  ];
  for (const [mutate, pattern] of cases) {
    const s = clone(); mutate(s);
    const v = SceneSpec.validate(s, { timeline });
    assert.ok(v.blockers.some((b) => pattern.test(b)), `${pattern} in ${v.blockers.join(" | ")}`);
  }
  const v = SceneSpec.validate(sample, { timeline, allowedNumbers: ["8.2"] });
  assert.ok(v.blockers.some((b) => /not in the dossier/.test(b)));
});

test("scene spec: render-motion prefers a handwritten scenes.js and refuses an invalid spec", () => {
  const { sceneScript } = require("../../scripts/profitdecoded/motion/render-motion");
  const a = tmp();
  fs.writeFileSync(path.join(a, "scenes.js"), "window.SCENES = () => ({ shots: [] });");
  fs.writeFileSync(path.join(a, "scene-spec.json"), JSON.stringify(sample));
  assert.match(sceneScript(a, timeline), /window.SCENES = \(\) =>/);
  const b = tmp();
  fs.writeFileSync(path.join(b, "scene-spec.json"), JSON.stringify(sample));
  const js = sceneScript(b, timeline);
  assert.match(js, /^window.SCENE_SPEC = /);
  assert.ok(!js.slice(0, js.indexOf(";\n")).includes("<"), "spec is escaped for inline <script>");
  const c = tmp();
  const bad = clone(); bad.scenes[0].type = "hologram";
  fs.writeFileSync(path.join(c, "scene-spec.json"), JSON.stringify(bad));
  assert.throws(() => sceneScript(c, timeline), /failed validation/);
  assert.throws(() => sceneScript(tmp(), timeline), /neither scenes.js nor scene-spec.json/);
});

test("scene spec: the output schema is a closed object the model can fill", () => {
  const schema = SceneSpec.outputSchema();
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.scenes.items.properties.type.enum.sort(), Object.keys(SceneSpec.TYPES).sort());
  const client = Llm.createClient(Channel.getChannel("impossible-brief"), { env: {} });
  const planned = client.plan("scene-spec", { system: "spec rules", user: JSON.stringify(sample).slice(0, 4000), schema, thinking: "adaptive" });
  assert.equal(planned.route.model, "claude-haiku-5-5");
  assert.deepEqual(planned.params.thinking, { type: "adaptive" });
});

test("scene spec: motifs and compositions are gated (undefined motif, ambiguous element, cue after the cut, unspoken startCue)", () => {
  const cases = [
    [(s) => { s.motifs["mile-card"].kind = "hologram"; }, /motif mile-card: kind/],
    [(s) => { s.scenes[0].elements[1].motif = "ghost"; }, /undefined motif "ghost"/],
    [(s) => { s.scenes[0].elements[0].text = "Two kinds"; }, /exactly one of/],
    [(s) => { const p = s.scenes.find((x) => x.id === "promise"); p.cue = "has been paid"; }, /after the shot ends/],
    [(s) => { s.scenes.find((x) => x.id === "still-owed").startCue = "never said"; }, /startCue "never said" is not spoken/],
    [(s) => { s.scenes.find((x) => x.id === "forecast-10").cameraKeys = [{ at: 0, x: 960, y: 540, z: 1 }]; }, /cameraKeys are supported on composition/],
    [(s) => { s.scenes[0].elements = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, text: "x" })); }, /max 14/],
  ];
  for (const [mutate, pattern] of cases) {
    const s = clone(); mutate(s);
    const v = SceneSpec.validate(s, { timeline });
    assert.ok(v.blockers.some((b) => pattern.test(b)), `${pattern} in ${v.blockers.join(" | ")}`);
  }
});

test("scene spec: a second shot inside a beat starts on its spoken phrase and the shots stay ordered", () => {
  const shots = SceneSpec.planShots(sample, timeline);
  const promise = shots.find((s) => s.id === "promise"); const still = shots.find((s) => s.id === "still-owed");
  assert.ok(still.start > promise.start && promise.end === still.start);
  assert.equal(still.start, SceneSpec.phraseTime(timeline, "s3-5", "The airline has been paid"));
});
