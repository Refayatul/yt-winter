"use strict";
// Regression tests for the defects found in Phase 3.5 and the model benchmark (one block per defect class).
// No network, no API: every test runs on the repository's own dossier and story packages.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const R = require("../../core/profitdecoded/research");
const W = require("../../core/profitdecoded/auto/script-agent");
const Retention = require("../../core/profitdecoded/retention");
const DOSSIER = "channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json";
const dossier = () => readJson(DOSSIER);
const clone = (x) => JSON.parse(JSON.stringify(x));
const beat = (id, text, claimId, section = "s1", type = "evidence") => ({ id, text, claimId, section, type });
const has = (issues, re) => issues.some((x) => re.test(x));

// ---- 1. Dossier arithmetic (Darden i2: 760.2 - 751.9 is 8.3, the balance grew 7.9 because of a 0.4 sale) ----------
test("dossier: the corrected Darden arithmetic is verified, and the original reasoning is rejected", () => {
  const d = dossier();
  const g = R.gate(d, { format: "long" });
  assert.equal(g.pass, true, g.rejections.join("; "));
  assert.deepEqual(g.warnings, [], "every inference carries a checked calc and the entity map is present");
  const i2 = d.inferences.find((x) => x.id === "i2"); const c5 = d.claims.find((x) => x.id === "c5");
  assert.match(i2.text, /\$8\.3 million/); assert.match(i2.text, /\$0\.4 million/); assert.match(i2.text, /\$7\.9 million/);
  assert.match(c5.text, /\$0\.4 million reduction from the sale of Olive Garden Canada/);
  assert.ok(c5.evidence.some((e) => /Sale of Olive Garden Canada gift card balances \(0\.4\)/.test(e.passage)), "the 0.4 is in the filing passage");
  assert.ok((d.corrections || []).some((c) => c.ids.includes("i2") && /8\.3/.test(c.why)), "the correction is logged with its reason");
  // the original wording: "took in 760.2 ... released 751.9 ..., so the pool grew by 7.9"
  const old = clone(d); const o2 = old.inferences.find((x) => x.id === "i2");
  o2.text = "Our arithmetic: Darden took in $760.2 million on new card loads and released $751.9 million through redemptions and breakage, so the unspent pool still grew by $7.9 million over the year.";
  o2.calc = [{ expr: "760.2 - 751.9", equals: 7.9 }];
  assert.ok(has(R.gate(old).rejections, /i2 arithmetic does not hold: 760\.2 - 751\.9 = 8\.3, not 7\.9/));
  // a figure stated in an inference that neither its basis nor its calc produces is rejected
  const stray = clone(d); stray.inferences.find((x) => x.id === "i1").text += " That is $999.9 million in three years.";
  assert.ok(has(R.gate(stray).rejections, /i1 states \$999\.9 million that neither its basis claims nor its calc produce/));
  // only arithmetic is ever evaluated
  assert.throws(() => R.evalExpr("process.exit(1)"), /unsafe/);
  assert.equal(R.evalExpr("628.8 - 0.4 + 760.2 - 751.9").toFixed(1), "636.7");
});

// ---- 2. Plan validation: evidence for the thesis and payoff, no unsupported conclusions, one home per figure ------
test("plan: the free-model plan is rejected before drafting (uncited thesis/payoff, 'most', 'only a small', 'exact split', repeated facts)", () => {
  const plan = readJson("channels/profitdecoded/story-tests/hbm-073-gift-cards-long-free-models/plan.json");
  const r = W.evaluatePlan(plan, dossier(), "long");
  for (const re of [/thesis cites no claim ids/, /payoff cites no claim ids/, /payoff overclaims: "most"/, /payoff overclaims: "only a small"/, /originalAngle overclaims: "exact"/, /repeated fact: c1 .* sections s2, s3/, /repeated fact: i1 .* sections s3, s7/, /repeated fact: i2 .* sections s4, s7/]) assert.ok(has(r.issues, re), re + "\n" + r.issues.join("\n"));
});

test("plan: a cited, bounded payoff passes; numbers, uncited or unestablished evidence and overclaims fail", () => {
  const d = dossier(); const plan = readJson("channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/plan.json");
  assert.deepEqual(W.evaluatePlan(plan, d, "long").issues, []);
  const bad = (edit) => { const p = clone(plan); edit(p); return R.planEvidenceIssues(p, d).issues; };
  assert.ok(has(bad((p) => { p.payoff += " Retailers keep most of it."; }), /payoff overclaims: "most"/));
  assert.ok(has(bad((p) => { p.payoff += " That is $50 billion."; }), /payoff states \$50 billion/));
  assert.ok(has(bad((p) => { p.payoffClaimIds = ["c3"]; }), /payoff cites c3, which no section establishes/));
  assert.ok(has(bad((p) => { p.thesisClaimIds = ["zz"]; }), /thesis cites unknown claim id "zz"/));
  assert.ok(has(bad((p) => { p.payoff += " Gift cards never expire."; }), /editorial rule/));
  // the same figure-bearing claim established in two story sections is a repeated fact; hook/caveat/payoff may refer back
  assert.ok(has(bad((p) => { p.sections.find((s) => s.id === "s6").claimIds.push("c5"); }), /repeated fact: c5 .* s5, s6/));
  assert.deepEqual(bad((p) => { p.sections.find((s) => s.id === "s8").claimIds.push("c5"); }), [], "s8 is the caveat: it may qualify an earlier fact");
  // a figure-free claim used in many sections is only a warning
  assert.ok(R.planEvidenceIssues(plan, d).warnings.some((w) => /c2 is planned in 3 sections \(s2, s3, s7\)/.test(w)));
});

// ---- 3. Attribution: reported figures vs our calculations, the right company, no spoken ids, named companies -------
test("attribution: our calculation voiced as a company's reported figure is caught; disclosed math passes", () => {
  const d = dossier();
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks recorded $222.4 million of breakage revenue for fiscal 2025.", "i1")], d), /\$222\.4 million is presented as reported by Starbucks, but it is our calculation/));
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks's breakage lines come from its filing. That left $222.4 million.", "i1")], d), /\$222\.4 million is our calculation, not a reported figure/));
  assert.deepEqual(R.attributionIssues([beat("a", "Starbucks splits breakage in two lines. Together, by our own math, that's $222.4 million in one year.", "i1")], d), []);
  assert.deepEqual(R.attributionIssues([beat("a", "Add up the two breakage lines in Starbucks's filing and you get $222.4 million. That addition is ours.", "i1")], d), []);
  // our rounding needs "about" (or our-math wording); the exact reported figure does not
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks loaded $15.2 billion onto cards and loyalty Stars.", "i3")], d), /\$15\.2 billion is our rounding/));
  assert.deepEqual(R.attributionIssues([beat("a", "Starbucks took in about $15.2 billion in card loads, reloads and loyalty Stars.", "i3")], d), []);
});

test("attribution: a figure attributed to the wrong company is caught", () => {
  const d = dossier();
  assert.ok(has(R.attributionIssues([beat("a", "Darden reported $200.4 million of breakage in fiscal 2025.", "c1")], d), /\$200\.4 million comes from Starbucks, but the sentence attributes it to Darden/));
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks says a 50 basis point change moves breakage income by $3.6 million.", "c6")], d), /\$3\.6 million comes from Darden, but the sentence attributes it to Starbucks/));
  assert.deepEqual(R.attributionIssues([beat("a", "Darden says a 50 basis point change would move breakage income by about $3.6 million.", "c6")], d), []);
});

test("attribution: internal claim or source ids are never spoken", () => {
  const d = dossier();
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks deferred $15,245.8 million and recognized $15,199.5 million, including breakage. That leaves the pool roughly flat, as shown in i3.", "c3")], d), /speaks an internal id \("i3"\)/));
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks cards do not expire, per c2.", "c2")], d), /speaks an internal id \("c2"\)/));
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks cards do not expire, as claim 2 shows.", "c2")], d), /internal id/));
});

test("attribution: a company's facts before the company is named are caught; teasers and questions may come first", () => {
  const d = dossier();
  const groqS4 = [beat("s4-1", "Gift-card sales are recorded only when the cards are redeemed. The cards have no expiration dates or dormancy fees.", "c4", "s4"), beat("s5-1", "Darden says a half-point change moves income by about $3.6 million.", "c6", "s5")];
  assert.ok(has(R.attributionIssues(groqS4, d), /beat s4-1 uses Darden's facts before naming it/));
  assert.deepEqual(R.attributionIssues([beat("a", "Somewhere in a drawer there's a gift card with money still on it.", "c8", "s1", "hook"), beat("b", "In a Bankrate survey run online by YouGov, 43 percent of adults said they hold an unused card. It's an estimate.", "c8")], d), []);
  assert.deepEqual(R.attributionIssues([beat("q", "Which raises a question. If the cards don't expire, how does a company decide any money is gone?", "c4", "s1", "turn")], d), []);
});

test("attribution: scope, required survey context, figure labels and editorial rules", () => {
  const d = dossier();
  const ok = "A Bankrate survey run online by YouGov estimates US adults hold about $27 billion in unused gift card value.";
  assert.deepEqual(R.attributionIssues([beat("a", ok, "c8")], d), []);
  assert.ok(has(R.attributionIssues([beat("a", "A Bankrate survey run online by YouGov estimates households hold about $27 billion in unused gift card value.", "c8")], d), /"households" misstates the scope of c8/));
  assert.ok(has(R.attributionIssues([beat("a", "In a 2024 Bankrate survey, 43 percent of American adults said they hold an unused gift card. Bankrate estimates the total at about $27 billion.", "c8")], d), /c8 is used without the survey method/));
  // $751.9M is redemptions AND breakage (c5), the label may sit anywhere in the beat
  assert.ok(has(R.attributionIssues([beat("a", "Darden's filing lists $760.2 million in new card loads and $751.9 million in redemptions.", "c5")], d), /751\.9 must be described as redemptions and breakage/));
  assert.deepEqual(R.attributionIssues([beat("a", "Darden's loads were $760.2 million. Redemptions and breakage took out $751.9 million.", "c5")], d), []);
  // the combined Starbucks balance must carry the loyalty caveat when its figure is spoken (rule x4), not otherwise
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks holds about $1.75 billion in unused gift cards.", "i4")], d), /balance includes loyalty Stars/));
  assert.deepEqual(R.attributionIssues([beat("a", "At Starbucks, loading a card creates something the company owes you until you spend it.", "c3")], d), []);
  assert.ok(has(R.attributionIssues([beat("a", "Most gift cards never expire, like Starbucks cards.", "c2")], d).concat(R.attributionIssues([beat("a", "Starbucks says gift cards don't expire.", "c2")], d)), /x1/));
  assert.ok(has(R.attributionIssues([beat("a", "Starbucks already knows how much will never be spent.", "c2")], d), /x3/));
});

test("attribution: the same figure restated in another section is caught; same value with a different unit is not", () => {
  const d = dossier();
  assert.ok(has(R.attributionIssues([beat("a", "Bankrate's survey, run online by YouGov, estimates about $27 billion.", "c8", "s1"), beat("b", "That survey estimate of $27 billion is from YouGov's online panel for Bankrate.", "c8", "s7")], d), /repeated figure: \$27 billion is stated in sections s1, s7/));
  assert.deepEqual(R.attributionIssues([beat("a", "Darden spreads breakage over generally 12 years.", "c4", "s5"), beat("b", "In the Bankrate survey run online by YouGov, an estimated 12 percent saw a store close first.", "c9", "s8")], d).filter((x) => /repeated figure/.test(x)), []);
});

// ---- 4. The real scripts --------------------------------------------------------------------------------------
test("the free-model script's documented defects are all caught by the new checks", () => {
  const g = readJson("channels/profitdecoded/story-tests/hbm-073-gift-cards-long-free-models/latest.json");
  const issues = R.attributionIssues(g.beats, dossier());
  for (const re of [/beat s2-3 speaks an internal id \("i3"\)/, /beat s4-1 uses Darden's facts before naming it/, /beat s7-1: \$222\.4 million is presented as reported by Starbucks/, /beat s7-3: "households"/, /beat s9-2: 751\.9 must be described as redemptions and breakage/, /repeated figure: \$222\.4\smillion is stated in sections s3, s7, s9/]) assert.ok(has(issues, re), re.toString());
});

test("Claude gift-card script: the benchmark version lacked the survey method; the revision passes every factual gate", () => {
  const dir = "channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/";
  const d = dossier(); const plan = readJson(dir + "plan.json"); const latest = readJson(dir + "latest.json"); const bench = readJson(dir + "draft.json");
  assert.ok(has(R.attributionIssues(bench.beats, d), /c8 is used without the survey method/), "the omission the blind judge found");
  assert.deepEqual(R.attributionIssues(latest.beats, d), []);
  assert.deepEqual(W.evaluatePlan(plan, d, "long").issues, []);
  const text = latest.beats.map((b) => b.text).join(" ");
  assert.match(text, /YouGov/); assert.match(text, /2,373 adults/); assert.doesNotMatch(text, /\$7\.9 million/, "the Darden pool line states reported balances, not the old 'so' arithmetic");
  const a = W.assess({ ...latest, hookCandidates: plan.hookCandidates.map((h) => h.text) }, d, "long", { plan, winningHook: plan.selectedHook, hookCandidates: plan.hookCandidates, words: W.wordsFor("long", [8, 12]), title: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" });
  // what remains is packaging (not produced yet) and one heuristic opening reading; nothing factual
  assert.deepEqual(a.blocking.filter((b) => !/title candidates|thumbnail concepts|weak-opening/.test(b)), []);
});

test("Phase 3 gift-card package: its original hook attributed our $222.4M sum to Starbucks's report", () => {
  const original = "In the US, Starbucks cards don't expire. Its latest annual report still counts $222.4 million of card money as sales, and no drink was served for it.";
  assert.ok(has(R.attributionIssues([beat("b1", original, "i1", "open", "hook")], dossier()), /our calculation, not a reported figure/));
  const fin = readJson("channels/profitdecoded/story-tests/hbm-073-gift-cards-long/final.json");
  assert.match(fin.beats[0].text, /by our math/);
});

// ---- 5. Retention critic: a question answered by the next line or by an inflected word is answered ----------------
test("retention: answers are recognised by stem and by the next line's figure; an unanswered question still fails", () => {
  const plan = { sections: [{ id: "s1", title: "t", purpose: "evidence" }] };
  const run = (texts) => Retention.critique(texts.map((t, i) => ({ id: "b" + i, section: "s1", text: t })), { plan, format: "long", title: "x" }).openQuestions;
  assert.equal(run(["So what is this worth to Starbucks?", "In fiscal 2025, it recognized breakage worth $200.4 million."])[0].answeredIn, "s1");
  assert.equal(run(["So, who keeps the money?", "On paper, you keep the money. The balance waits."])[0].answeredIn, "s1");
  assert.equal(run(["Why do some cards still expire?", "Breakage is booked over time."])[0].answeredIn, null);
});
