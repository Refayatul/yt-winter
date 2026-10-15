"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const Evidence = require("../../scripts/ct-evidence-first");

const sources = [
  { source_id: "S1", kind: "primary", url: "https://nasa.gov/reports/first", excerpt: "" },
  { source_id: "S2", kind: "primary", url: "https://nist.gov/reports/second", excerpt: "" }
];
const quote = (i) => "The official report confirms component number " + i + " triggered a cascade of documented technical failures.";
const claim = (i) => "Component " + i + " triggered documented technical failures.";
function fixture() {
  const facts = Array.from({ length: 16 }, (_, i) => ({
    fact_id: "F" + (i + 1), source_id: i < 8 ? "S1" : "S2",
    claim: claim(i + 1), verbatim_quote: quote(i + 1)
  }));
  const copy = sources.map((s, i) => ({
    ...s, excerpt: facts.filter((f) => f.source_id === "S" + (i + 1)).map((f) => f.verbatim_quote).join("\n")
  }));
  return { facts, sources: copy };
}
const primary = async (s) => ({ url: s.url, text: s.excerpt });

test("16 direct-document-matched facts use 2 primary originals but remain semantic review", async () => {
  const { facts, sources } = fixture();
  const p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, facts, sources, verifyPrimary: primary });
  assert.equal(p.status, "READY_FOR_STORY_REVIEW_REQUIRED");
  assert.equal(p.verification.distinct_primary_documents, 2);
  assert.equal(p.approved_facts.length, 16);
  assert.ok(p.approved_facts.every((f) => f.evidence_status === "PRIMARY_SOURCE_VERIFIED" && f.semantic_status === "NEEDS_REVIEW"));
  assert.equal(Evidence.verifyIntegrity(p), true);
});

test("links and secondhand excerpts never become primary verification by metadata alone", async () => {
  const { facts, sources } = fixture();
  const p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, facts, sources });
  assert.equal(p.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(p.verification.distinct_primary_documents, 0);
  assert.equal(p.approved_facts[0].evidence_status, "EXCERPT_MATCHED");
});

test("reject hallucinated quotes, unsupported digits and unknown sources", async () => {
  const { facts, sources } = fixture();
  facts[0].verbatim_quote = "The report definitely says something that is fabricated.";
  facts[1].claim = "Component 999 triggered documented technical failures.";
  facts[2].source_id = "S500";
  const p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, facts, sources, verifyPrimary: primary });
  assert.deepEqual(p.rejected_facts.map((f) => f.code), ["QUOTE_NOT_IN_EXCERPT","CLAIM_NUMBER_NOT_IN_QUOTE","UNKNOWN_SOURCE"]);
  assert.equal(p.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(p.approved_facts.length, 13);
});

test("fail closed for duplicate claims, short quotes, insufficient and excess inventory", async () => {
  const a = fixture();
  a.facts[3].claim = a.facts[0].claim;
  a.facts[3].verbatim_quote = a.facts[0].verbatim_quote;
  let p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, ...a, verifyPrimary: primary });
  assert.ok(p.rejected_facts.some((f) => f.code === "DUPLICATE_CLAIM"));
  assert.equal(p.status, "INSUFFICIENT_EVIDENCE");
  const b = fixture();
  b.facts[4].verbatim_quote = "a very short quote";
  p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, ...b, verifyPrimary: primary });
  assert.ok(p.rejected_facts.some((f) => f.code === "QUOTE_TOO_SHORT"));
  const c = fixture();
  c.facts.push(...c.facts.slice(0, 3).map((f, i) => ({ ...f, fact_id: "F" + (17 + i) })));
  p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, ...c, verifyPrimary: primary });
  assert.ok(p.verification.diagnostics.includes("EXCESS_FACTS"));
});

test("untrusted primary URL and mismatched original URL do not confer primary status", async () => {
  const { facts, sources } = fixture();
  sources[0].url = "https://not-nasa.gov/reports/first";
  const p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, facts, sources,
    verifyPrimary: async (s) => ({ url: s.url === sources[1].url ? "https://other.gov/wrong" : s.url, text: s.excerpt }) });
  assert.equal(p.verification.distinct_primary_documents, 0);
  assert.equal(p.status, "INSUFFICIENT_EVIDENCE");
});

test("extract calls only the injected model with low reasoning, preserves review gate", async () => {
  const { facts, sources } = fixture();
  let calls = 0;
  const p = await Evidence.extractEvidence({ topic: { id: "CT-TEST", subject: "Example" }, sources, verifyPrimary: primary,
    generate: async (request) => {
      calls++;
      assert.equal(request.reasoningEffort, "low");
      assert.equal(request.maxTokens, 3200);
      assert.ok(!request.user.includes("api_key"));
      return { json: { facts } };
    } });
  assert.equal(calls, 1);
  assert.equal(p.status, "READY_FOR_STORY_REVIEW_REQUIRED");
});

test("tampering is detected and persistence is explicit and private", async () => {
  const { facts, sources } = fixture();
  const p = await Evidence.validateEvidence({ topic: { id: "CT-TEST" }, facts, sources, verifyPrimary: primary });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-evidence-"));
  try {
    const dest = path.join(dir, "evidence.json");
    Evidence.savePackage(p, dest);
    assert.equal(Evidence.loadPackage(dest).approved_facts.length, 16);
    assert.equal(fs.statSync(dest).mode & 0o777, 0o600);
    assert.throws(() => Evidence.savePackage(p, dest), /EEXIST/);
    const changed = JSON.parse(fs.readFileSync(dest, "utf8"));
    changed.approved_facts[0].claim = "Altered claim";
    fs.writeFileSync(dest, JSON.stringify(changed));
    assert.throws(() => Evidence.loadPackage(dest), /EVIDENCE_INTEGRITY_FAILED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
