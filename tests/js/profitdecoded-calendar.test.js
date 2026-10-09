"use strict";
// Topic pool + 52-week calendar invariants (local data only: no API call).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const P = (m) => require(path.join(ROOT, "core/profitdecoded", m));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

let cached = null;
function build() {
  if (cached) return cached;
  const Decision = P("decision"); const Comp = P("competitive"); const Research = P("research"); const E = P("eligibility"); const C = P("calendar");
  const topics = readJson("channels/profitdecoded/topics/topic-universe.json").topics; const evidence = {}; const dossiers = {};
  const snap = fs.readdirSync(path.join(ROOT, "channels/profitdecoded/intel")).filter((f) => /^snapshot-.*\.json$/.test(f)).sort().pop();
  for (const [id, o] of Object.entries(Comp.topicEvidenceFromSnapshot(readJson("channels/profitdecoded/intel/" + snap), topics).topics)) if (o.breakout) evidence[id] = { breakout: o.breakout };
  for (const f of fs.readdirSync(path.join(ROOT, "channels/profitdecoded/research"))) { const d = readJson("channels/profitdecoded/research/" + f); dossiers[d.topicId] = d; evidence[d.topicId] = { ...(evidence[d.topicId] || {}), research: { ...Research.gate(d, { format: d.format }), researchedAt: d.researchedAt } }; }
  const rows = Decision.rank(topics, evidence); const inv = E.inventory({ topics, rows, dossiers });
  const pool = C.buildPool({ rows, inv, topics }); const weeks = C.schedule(pool, "2026-11-02");
  cached = { C, topics, rows, inv, pool, weeks }; return cached;
}

test("pool: 104 unique topics (52 primary + 52 backup), verified research always primary, no blocked topic", () => {
  const { pool, inv } = build();
  assert.equal(pool.primary.length, 52); assert.equal(pool.backup.length, 52);
  const ids = [...pool.primary, ...pool.backup].map((c) => c.id); assert.equal(new Set(ids).size, 104);
  const verified = inv.topics.filter((x) => x.tier === "PRODUCTION_READY").map((x) => x.id);
  for (const id of verified) assert.ok(pool.primary.some((c) => c.id === id), id + " is a primary");
  const excluded = new Set(inv.topics.filter((x) => x.tier === "EXCLUDE").map((x) => x.id));
  assert.ok(ids.every((id) => !excluded.has(id)), "no blocked, outdated or duplicate inventory topic");
  for (const c of [...pool.primary, ...pool.backup]) assert.ok(["VERIFIED", "RESEARCH_REQUIRED", "DEMAND_UNVERIFIED"].includes(c.class), c.class);
});

test("pool: one subject per year (duplicate subjects removed, the better-ranked kept)", () => {
  const { pool } = build(); const all = [...pool.primary, ...pool.backup].map((c) => c.topic);
  const pairs = [["Why Blockbuster Failed", "How Blockbuster Passed on Netflix"], ["Why Costco's Food Court Hot Dog Never Changed Price", "Why Hot Dogs Cost So Little at Costco"], ["Why JCPenney Lost Customers When It Stopped Running Sales", "How JCPenney Lost Its Way"], ["Why Costco's Food Court Hot Dog Never Changed Price", "Why Rotisserie Chicken Costs $4.99 at Costco"]];
  for (const [a, b] of pairs) assert.ok(!(all.includes(a) && all.includes(b)), `${a} / ${b}`);
  assert.ok(pool.duplicates.some((d) => /Blockbuster/.test(d.topic)));
  // generic shared words alone do not merge different subjects
  assert.ok(!pool.duplicates.some((d) => /FTX/.test(d.topic) && /JCPenney/.test(d.duplicateOf)));
});

test("pool: every topic meets the standards, or enters on observed demand >= 60 and is flagged ANGLE_REQUIRED", () => {
  const { C, pool, rows, inv, topics } = build();
  const byRow = Object.fromEntries(rows.map((r) => [r.id, r])); const byInv = Object.fromEntries(inv.topics.map((x) => [x.id, x])); const byT = Object.fromEntries(topics.map((t) => [t.id, t]));
  for (const c of [...pool.primary, ...pool.backup]) {
    const r = byRow[c.id]; const x = byInv[c.id]; const t = byT[c.id];
    for (const [name, f] of Object.entries(C.STANDARDS)) assert.ok(f(r, x, t), `${c.topic}: ${name}`);
    const titleSignalsLow = (r.lens.dimensions.angleOriginality.value < 60) || (r.lens.dimensions.narrativeConflict.value < 60);
    if (titleSignalsLow) { assert.ok(x.flags.demandStrong, c.topic + " needs observed demand"); assert.equal(c.angleRequired, true); }
    if (c.class !== "VERIFIED") assert.ok(c.demand.provenance === "OBSERVED" ? c.class === "RESEARCH_REQUIRED" : c.class === "DEMAND_UNVERIFIED", "unknown demand is never treated as proven");
  }
});

test("calendar: 52 weeks, evidence first, no category twice in a row, no cluster within 3 weeks, no entity within 8 weeks, seasonal topics in season", () => {
  const { weeks } = build();
  assert.equal(weeks.length, 52);
  assert.equal(weeks[0].primary.class, "VERIFIED", "week 1 is the verified topic");
  const rank = { VERIFIED: 0, RESEARCH_REQUIRED: 1, DEMAND_UNVERIFIED: 2 };
  const first12 = weeks.slice(0, 12).map((w) => rank[w.primary.class]);
  assert.ok(first12.filter((v) => v <= 1).length >= 10, "weeks 1-12 are mostly evidence-backed");
  for (let i = 1; i < weeks.length; i += 1) assert.notEqual(weeks[i].primary.category, weeks[i - 1].primary.category, `week ${i + 1}`);
  for (let i = 0; i < weeks.length; i += 1) for (let j = Math.max(0, i - 3); j < i; j += 1) assert.notEqual(weeks[i].primary.cluster, weeks[j].primary.cluster, `cluster repeat at week ${i + 1}`);
  for (const w of weeks) if (w.primary.season && w.primary.class !== "VERIFIED") assert.ok(w.primary.season.months.includes(Number(w.weekOf.slice(5, 7))), `${w.primary.topic} out of season (${w.weekOf})`);
  assert.equal(new Set(weeks.map((w) => w.backup && w.backup.id)).size, 52, "every week has its own backup");
  for (let i = 0; i < weeks.length; i += 1) for (let j = Math.max(0, i - 8); j < i; j += 1) if (weeks[i].primary.entity) assert.notEqual(weeks[i].primary.entity, weeks[j].primary.entity, `${weeks[i].primary.entity} repeats at week ${i + 1}`);
});

test("calendar notes: verified topics only are marked verified; every other thesis is labelled a hypothesis", () => {
  const notes = readJson("channels/profitdecoded/topics/calendar-notes.json").notes;
  const { inv } = build(); const verified = new Set(inv.topics.filter((x) => x.tier === "PRODUCTION_READY").map((x) => x.id));
  for (const [id, n] of Object.entries(notes)) {
    if (n.verified) assert.ok(verified.has(id), id + " claims verified research"); else assert.match(n.thesis, /^HYPOTHESIS:/, id);
    assert.doesNotMatch(n.workingTitle, /^how .+ makes? money/i, id + " uses the generic title template");
  }
});
