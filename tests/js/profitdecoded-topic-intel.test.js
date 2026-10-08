"use strict";
// Phase 2 topic intelligence: title templates, manual coverage saturation, freshness,
// curated angles, the editorial lens and how they reach the decision engine.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const PD = (m) => require("../../core/profitdecoded/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const universe = readJson("channels/profitdecoded/topics/topic-universe.json");
const byId = Object.fromEntries(universe.topics.map((t) => [t.id, t]));
const S = PD("signals");

// SYNTHETIC fixtures (test data only).
const NO_FILES = { angles: { angles: [] }, watchlist: { entries: [] }, coverage: [] };
const vid = (views, days, relation = "same-angle") => ({ title: "t", channel: "c", views, approxAgeDays: days, relation });
const topicLike = (over = {}) => ({ ...universe.topics.find((t) => t.formats.long && t.formats.short && /^Why /.test(t.topic)), ...over });

// ---------- title templates ----------
test("title templates: observed crowded templates are recognised and older structures still resolve", () => {
  const C = PD("competitive");
  assert.equal(C.titleStructure("How Costco Really Makes Money"), "how-x-actually-makes-money");
  assert.equal(C.titleStructure("How Costco Makes Money (It's Not What You Think)"), "not-what-you-think");
  assert.equal(C.titleStructure("Costco Business Model Explained"), "business-model-explained");
  assert.equal(C.titleStructure("The Economics of Owning a Car Wash"), "economics-of-owning");
  assert.equal(C.titleStructure("The Decline of Sears...What Happened?"), "decline-what-happened");
  assert.equal(C.titleStructure("Why Airport Food Is So Expensive"), "so-expensive");
  assert.equal(C.titleStructure("The Real Reason Airlines Overbook"), "real-reason");
  assert.equal(C.titleStructure("Why Costco Wants Membership More Than Sales"), "why-x-question");
});

// ---------- manual coverage saturation ----------
test("coverage saturation follows the documented rules and stays INFERRED", () => {
  const C = PD("competitive");
  const cls = (videos, clones = 0) => C.coverageSaturation({ observedOn: "2026-10-08", query: "q", uploadsUnder30DaysInSample: clones, videos }).class;
  assert.equal(cls([]), "EARLY");
  assert.equal(cls([vid(200000, 900)]), "EARLY");
  assert.equal(cls([vid(40000, 100)]), "GROWING");
  assert.equal(cls([], 10), "GROWING");
  assert.equal(cls([vid(400000, 200)]), "HOT");
  assert.equal(cls([vid(2000000, 3000)]), "HOT");
  assert.equal(cls([vid(400000, 200), vid(350000, 30)]), "SATURATED");
  assert.equal(cls([vid(1e6, 2000), vid(2e6, 2000), vid(3e6, 2000)]), "SATURATED");
  // adjacent videos prove interest but are not competition
  assert.equal(cls([vid(9e6, 30, "adjacent"), vid(9e6, 30, "adjacent")]), "EARLY");
  const r = C.coverageSaturation({ observedOn: "2026-10-08", query: "q", videos: [vid(9e6, 30, "adjacent")] });
  assert.equal(r.provenance, "INFERRED"); assert.equal(r.adjacentDemandMaxViews, 9e6);
  assert.equal(C.coverageSaturation(null).class, "UNKNOWN");
});

// ---------- freshness ----------
test("freshness: sourced watchlist flags block outdated premises; dossiers and checked angles resolve dated flags", () => {
  const F = PD("freshness");
  const watch = { entries: [
    { id: "e1", event: "product discontinued", effectiveDate: "2025-11-12", sources: [{ url: "https://x" }], topics: [{ id: "t-out", kind: "OUTDATED_PREMISE" }, { id: "t-ctx", kind: "CHANGED_CONTEXT" }] },
    { id: "e2", event: "filing contradicts", effectiveDate: null, sources: [{ url: "https://y" }], topics: [{ id: "t-con", kind: "PREMISE_CONTRADICTED" }] },
  ] };
  const t = (id, topic = "Why Things Cost What They Do") => ({ id, topic });
  const out = F.check(t("t-out"), watch);
  assert.equal(out.status, "OUTDATED_PREMISE"); assert.equal(out.blocksProduction, true); assert.equal(out.needsResearch, true);
  const ctx = F.check(t("t-ctx"), watch);
  assert.equal(ctx.status, "CHANGED_CONTEXT"); assert.equal(ctx.blocksProduction, false); assert.equal(ctx.needsResearch, true);
  // dossier before the event does not count, after it does
  assert.equal(F.check(t("t-out"), watch, { researchedAt: "2025-01-01" }).blocksProduction, true);
  const dossier = F.check(t("t-out"), watch, { researchedAt: "2026-01-01" });
  assert.equal(dossier.blocksProduction, false); assert.deepEqual(dossier.resolvedBy, ["dossier"]);
  // a checked angle written after the event resolves OUTDATED/CHANGED, never a contradicted claim
  const angle = { workingTitle: "How the Thing Ended", premiseStatus: "VERIFIED", checkedOn: "2026-10-08" };
  const viaAngle = F.check(t("t-out"), watch, { angle });
  assert.equal(viaAngle.blocksProduction, false); assert.equal(viaAngle.needsResearch, false); assert.deepEqual(viaAngle.resolvedBy, ["angle"]);
  assert.equal(F.check(t("t-con"), watch, { angle }).blocksProduction, true);
  assert.equal(F.check(t("t-con"), watch, { researchedAt: "2026-10-08" }).blocksProduction, false);
  // unchecked or stale angles do not resolve anything
  assert.equal(F.check(t("t-out"), watch, { angle: { ...angle, premiseStatus: "NEEDS_RESEARCH" } }).blocksProduction, true);
  assert.equal(F.check(t("t-out"), watch, { angle: { ...angle, checkedOn: "2025-01-01" } }).blocksProduction, true);
  // the title is never rewritten
  const topic = t("t-out", "Why the Thing Still Exists");
  F.check(topic, watch, { angle }); assert.equal(topic.topic, "Why the Thing Still Exists");
});

test("freshness phrasing heuristic is ESTIMATED, reads the working title and never blocks", () => {
  const F = PD("freshness");
  const r = F.check({ id: "x", topic: "Why Stores Still Use Coupons" }, { entries: [] });
  assert.equal(r.status, "TIME_SENSITIVE"); assert.equal(r.blocksProduction, false); assert.equal(r.needsResearch, false);
  assert.ok(r.flags.every((f) => f.provenance === "ESTIMATED"));
  assert.equal(F.check({ id: "x", topic: "Why Stores Still Use Coupons" }, { entries: [] }, { angle: { workingTitle: "Coupons Are a Data Business" } }).status, "CURRENT_UNVERIFIED");
  assert.equal(F.check({ id: "x", topic: "Why New Cars Lose Value So Fast" }, { entries: [] }).status, "CURRENT_UNVERIFIED");
});

// ---------- narrative conflict ----------
test("narrative conflict rewards titles that promise a tension, from an ESTIMATED title reading", () => {
  const TS = PD("topic-scoring");
  const flat = TS.narrativeConflict("How Gift Cards Make Money for Retailers", "FC");
  const tense = TS.narrativeConflict("Billions Sit on Unused Gift Cards. Who Keeps the Money?", "FC");
  assert.ok(tense.value > flat.value + 15, `${tense.value} vs ${flat.value}`);
  assert.equal(tense.provenance, "ESTIMATED");
  assert.ok(TS.narrativeConflict("How WeWork Lost Billions", "CD").value >= 80);
});

// ---------- editorial lens ----------
test("editorial lens: eight provenance-tagged dimensions; generic templates lose originality, curated angles gain it", () => {
  const TS = PD("topic-scoring");
  const files = { ...NO_FILES, coverage: [{ titleTemplates: { "how-x-actually-makes-money": { class: "SATURATED" } }, entries: [] }] };
  const inv = [{ topic: "How A Makes Money" }, { topic: "How B Makes Money" }, { topic: "Why C" }];
  const ctx = TS.buildIntelContext(inv, files);
  const base = topicLike();
  const generic = TS.editorialLens({ ...base, id: "g", topic: "How Parking Garages Make Money" }, ctx);
  assert.deepEqual(Object.keys(generic.dimensions).sort(), [...TS.LENS_DIMENSIONS].sort());
  for (const d of Object.values(generic.dimensions)) assert.ok(["OBSERVED", "ESTIMATED", "INFERRED", "UNKNOWN"].includes(d.provenance));
  assert.equal(generic.title.needsAngle, true);
  assert.equal(generic.dimensions.competitiveSaturation.provenance, "UNKNOWN");
  const withAngle = TS.buildIntelContext(inv, { ...files, angles: { angles: [{ topicId: "g", workingTitle: "Why Parking Garages Want You to Stay Longer", premiseStatus: "VERIFIED", checkedOn: "2026-10-08" }] } });
  const curated = TS.editorialLens({ ...base, id: "g", topic: "How Parking Garages Make Money" }, withAngle);
  assert.equal(curated.title.needsAngle, false);
  assert.equal(curated.title.workingTitle, "Why Parking Garages Want You to Stay Longer");
  assert.ok(curated.dimensions.angleOriginality.value >= generic.dimensions.angleOriginality.value + 40);
  assert.equal(curated.dimensions.sourceReliability.provenance, "INFERRED");
  assert.ok(curated.score > generic.score);
});

test("editorial lens: saturation provenance is OBSERVED > INFERRED (manual) > UNKNOWN; research makes reliability OBSERVED", () => {
  const TS = PD("topic-scoring");
  const t = { ...topicLike(), id: "s1" };
  const manual = TS.buildIntelContext([], { ...NO_FILES, coverage: [{ entries: [{ topicIds: ["s1"], observedOn: "2026-10-08", query: "q", videos: [vid(400000, 100), vid(500000, 50)] }] }] });
  const inferred = TS.editorialLens(t, manual);
  assert.equal(inferred.dimensions.competitiveSaturation.provenance, "INFERRED");
  assert.equal(inferred.dimensions.competitiveSaturation.value, 0); // SATURATED
  const observed = TS.editorialLens(t, manual, { observedSaturation: { class: "EARLY", reasons: ["api"] }, research: { score: 91 } });
  assert.equal(observed.dimensions.competitiveSaturation.provenance, "OBSERVED");
  assert.equal(observed.dimensions.competitiveSaturation.value, 100);
  assert.deepEqual([observed.dimensions.sourceReliability.provenance, observed.dimensions.sourceReliability.value], ["OBSERVED", 91]);
  const stale = TS.editorialLens(t, manual, { freshness: { status: "OUTDATED_PREMISE", needsResearch: true } });
  assert.ok(stale.dimensions.sourceReliability.value <= 40);
  assert.ok(stale.dimensions.evergreenPotential.value < inferred.dimensions.evergreenPotential.value);
});

// ---------- decision engine integration ----------
test("decision: a generic title costs rank (penalty + note) but never causes a REJECT on its own", () => {
  const D = PD("decision"); const TS = PD("topic-scoring");
  const files = { ...NO_FILES, coverage: [{ titleTemplates: { "how-x-actually-makes-money": { class: "SATURATED" } }, entries: [] }] };
  const inv = universe.topics;
  const intel = TS.buildIntelContext(inv, files);
  const t = topicLike();
  const neutral = D.evaluate(t, {}, { intel });
  const generic = D.evaluate({ ...t, topic: "How Everyday Things Really Make Money" }, {}, { intel });
  assert.ok(generic.penalties.genericTitle > 0);
  assert.ok(generic.rankScore < neutral.rankScore);
  assert.ok(generic.notes.some((n) => /no curated narrative angle/.test(n)));
  assert.equal(generic.titleTemplate.needsAngle, true);
  if (neutral.decision !== "REJECT") assert.notEqual(generic.decision, "REJECT");
  // on the real inventory: every REJECT survives removing the template evidence (so the title is never the reason)
  const real = TS.buildIntelContext(inv);
  const noTemplates = { ...real, templates: {} };
  for (const r of D.rank(inv, {}, { intel: real }).filter((x) => x.decision === "REJECT" && x.titleTemplate.needsAngle)) {
    assert.equal(D.evaluate(byId[r.id], {}, { intel: noTemplates }).decision, "REJECT", r.topic);
  }
});

test("decision: manual saturation lowers the score but only OBSERVED saturation can block", () => {
  const D = PD("decision"); const TS = PD("topic-scoring");
  const t = { ...topicLike(), id: "m1" };
  const intel = TS.buildIntelContext([], { ...NO_FILES, coverage: [{ entries: [{ topicIds: ["m1"], observedOn: "2026-10-08", query: "q", videos: [vid(400000, 100), vid(500000, 50)] }] }] });
  const open = D.evaluate(t, {}, { intel: TS.buildIntelContext([], NO_FILES) });
  const manual = D.evaluate(t, {}, { intel });
  assert.equal(manual.saturation, "SATURATED"); assert.equal(manual.saturationProvenance, "INFERRED");
  assert.ok(manual.penalties.saturation > 0 && manual.rankScore < open.rankScore);
  assert.ok(!manual.blockers.some((b) => /SATURATED/.test(b)));
  const observed = D.evaluate(t, { saturation: { class: "SATURATED" }, gap: { status: "NO_CLEAR_REASON", reasonToExist: false, reason: "x" } }, { intel: TS.buildIntelContext([], NO_FILES) });
  assert.equal(observed.saturationProvenance, "OBSERVED");
  assert.ok(observed.blockers.some((b) => /SATURATED/.test(b)));
});

test("decision: outdated premises go to REFRESH_RESEARCH; a checked angle written after the change lifts the block", () => {
  const D = PD("decision"); const TS = PD("topic-scoring");
  const t = { ...topicLike(), id: "f1" };
  const watchlist = { entries: [{ id: "w", event: "changed", effectiveDate: "2025-05-12", sources: [{ url: "https://x" }], topics: [{ id: "f1", kind: "OUTDATED_PREMISE" }] }] };
  const blocked = D.evaluate(t, {}, { intel: TS.buildIntelContext([], { ...NO_FILES, watchlist }) });
  assert.equal(blocked.decision, "REFRESH_RESEARCH");
  assert.ok(blocked.penalties.factualRisk >= 12.8);
  const angles = { angles: [{ topicId: "f1", workingTitle: "The Rule That Changed the Price", premiseStatus: "SUPPORTED_SECONDARY", checkedOn: "2026-10-08" }] };
  const reframed = D.evaluate(t, {}, { intel: TS.buildIntelContext([], { ...NO_FILES, watchlist, angles }) });
  assert.notEqual(reframed.decision, "REFRESH_RESEARCH");
  assert.deepEqual(reframed.freshness.resolvedBy, ["angle"]);
  assert.equal(reframed.workingTitle, "The Rule That Changed the Price");
});

test("decision: observed breakout evidence from the collector feed reaches the engine as OBSERVED", () => {
  const C = PD("competitive"); const D = PD("decision"); const TS = PD("topic-scoring");
  const t = topicLike();
  const item = { topic: { id: t.id }, outlier: { score: S.observed(80, "x") }, saturation: { class: "GROWING", reasons: [] }, ageDays: 12 };
  const ev = C.evidenceFromFeed({ feed: [item, { ...item, outlier: { score: S.observed(60, "x") } }, { topic: null, outlier: { score: S.observed(99, "x") } }] });
  assert.deepEqual(Object.keys(ev), [t.id]); assert.equal(ev[t.id].outlier.score.value, 80);
  const r = D.evaluate(t, { breakout: ev[t.id] }, { intel: TS.buildIntelContext([], NO_FILES) });
  assert.equal(r.inputs.demand.provenance, "OBSERVED"); assert.equal(r.saturationProvenance, "OBSERVED");
});

// ---------- curated data files ----------
test("freshness watchlist: every entry is sourced, dated and points at real inventory topics", () => {
  const w = readJson("channels/profitdecoded/topics/freshness-watchlist.json");
  const kinds = new Set(["CHANGED_CONTEXT", "OUTDATED_PREMISE", "PREMISE_CONTRADICTED"]);
  assert.ok(w.entries.length >= 5);
  for (const e of w.entries) {
    assert.ok(e.sources.length >= 1 && e.sources.every((s) => /^https:\/\//.test(s.url)), e.id);
    assert.match(e.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.effectiveDate === null || !Number.isNaN(Date.parse(e.effectiveDate)), e.id);
    for (const t of e.topics) { assert.ok(byId[t.id], t.id); assert.ok(kinds.has(t.kind), t.kind); }
  }
});

test("curated angles: real topics, honest premise status, primary evidence behind VERIFIED", () => {
  const a = readJson("channels/profitdecoded/topics/angles.json").angles;
  const statuses = new Set(["VERIFIED", "SUPPORTED_SECONDARY", "NEEDS_RESEARCH"]);
  for (const x of a) {
    assert.ok(byId[x.topicId], x.topicId); assert.ok(statuses.has(x.premiseStatus));
    assert.ok(x.workingTitle && x.workingTitle !== byId[x.topicId].topic || x.topicId.startsWith("cs-001"), x.topicId);
    if (x.premiseStatus === "VERIFIED") assert.ok(x.evidence.some((e) => /primary/.test(e.tier)), x.topicId);
    if (x.premiseStatus === "NEEDS_RESEARCH") assert.equal(x.checkedOn, null);
    for (const r of x.rejectedTitles || []) assert.ok(r.title && r.reason);
  }
  assert.equal(new Set(a.map((x) => x.topicId)).size, a.length);
});

test("coverage observations: real topics, valid relations, finite counts, every template class known", () => {
  const C = PD("competitive");
  const files = fs.readdirSync(path.join(ROOT, "channels/profitdecoded/intel")).filter((f) => /^coverage-.*\.json$/.test(f));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const d = readJson("channels/profitdecoded/intel/" + f);
    for (const [name, t] of Object.entries(d.titleTemplates || {})) { assert.ok(["SATURATED", "HOT", "GROWING", "EARLY"].includes(t.class), name); assert.ok(t.evidence); }
    for (const e of d.entries) {
      for (const id of e.topicIds) assert.ok(byId[id], id);
      for (const v of e.videos) { assert.ok(["same-angle", "adjacent"].includes(v.relation)); assert.ok(Number.isFinite(v.views) && Number.isFinite(v.approxAgeDays)); }
      assert.notEqual(C.coverageSaturation(e).class, "UNKNOWN");
    }
  }
});

test("reference channels: niche-relevant list, unique handles, removed channels not active; collector reads it", () => {
  const cfg = readJson("channels/profitdecoded/intel/reference-channels.json");
  const Y = PD("yt-collector");
  const handles = Y.referenceHandles(cfg);
  assert.equal(handles.length, cfg.referenceChannels.length);
  assert.ok(handles.every((h) => /^@[\w.-]+$/.test(h)));
  assert.ok(cfg.referenceChannels.every((c) => ["small-channel-outlier", "category-benchmark", "format-watch", "watch"].includes(c.role) && c.why));
  for (const h of cfg["removedOn2026-10-08"].handles) assert.ok(!handles.includes(h), h);
  assert.ok(cfg.referenceChannels.filter((c) => c.role === "small-channel-outlier").length >= 4);
  assert.deepEqual(Y.referenceHandles({ referenceChannels: [{ handle: "@A" }], referenceHandles: ["@A", "@B"] }), ["@A", "@B"]);
  const plan = cfg.queries.length * cfg.windowsDays.length * Y.COST.search + handles.length;
  assert.ok(plan <= cfg.quotaBudget && cfg.quotaBudget < 10000, `plan ${plan}`);
});

test("collector keeps video duration (Shorts vs long-form) without guessing", () => {
  const Y = PD("yt-collector");
  assert.equal(Y.isoSeconds("PT9M"), 540); assert.equal(Y.isoSeconds("PT1H2M3S"), 3723); assert.equal(Y.isoSeconds("PT45S"), 45);
  assert.equal(Y.isoSeconds(undefined), null); assert.equal(Y.isoSeconds("garbage"), null);
});

// ---------- observed snapshot evidence (SYNTHETIC snapshot, test data only) ----------
const NOW2 = Date.parse("2026-10-08T00:00:00Z");
const ago = (d) => new Date(NOW2 - d * 86400000).toISOString();
const filler = (ch, n, views, dur = 600) => Array.from({ length: n }, (_, i) => ({ id: `${ch}-${i}-${dur}`, title: "Filler upload " + i, publishedAt: ago(30 + i * 7), views, durationSec: dur }));

test("breakout feed can compare like with like: Shorts never set a long-form baseline", () => {
  const C = PD("competitive");
  const ch = { id: "c", name: "C", subscribers: 20000, videos: [...filler("c", 8, 900000, 40), ...filler("c", 8, 10000, 600), { id: "hit", title: "Why Parking Lots Earn More Than Stores", publishedAt: ago(10), views: 200000, durationSec: 720 }] };
  const mixed = C.buildBreakoutFeed({ channels: [ch] }, { now: NOW2, threshold: 50 });
  const long = C.buildBreakoutFeed({ channels: [ch] }, { now: NOW2, threshold: 50, format: "long" });
  assert.equal(long.format, "long");
  const hit = long.feed.find((f) => f.source.videoId === "hit");
  assert.ok(hit, "long-form breakout found against a long-form baseline");
  assert.equal(hit.source.durationSec, 720);
  assert.ok(!mixed.feed.some((f) => f.source.videoId === "hit"), "with Shorts in the baseline the same video looks ordinary");
});

test("topic matching is literal: entity phrase, or two subject words; one-word subjects need the entity", () => {
  const C = PD("competitive");
  const gift = { topic: "How Gift Cards Make Money for Retailers", entity: "Gift cards" };
  assert.ok(C.matchesTopic("What Happens to Money on Unused Gift Cards?", gift, false));
  assert.ok(!C.matchesTopic("Why Retailers Love Loyalty Apps", gift, false));
  const penny = { topic: "Why Pennies Cost More Than a Penny", entity: "US Mint" };
  assert.ok(!C.matchesTopic("Thrift Store Finds for Pennies", penny, false));
  assert.ok(C.matchesTopic("Inside the US Mint's Last Penny Run", penny, false));
  const amc = { topic: "Why AMC Sells Popcorn", entity: "AMC" };
  assert.ok(!C.matchesTopic("the amc of it all", amc, false)); // acronyms match case-sensitively
  const shared = { topic: "Why Costco Wants Membership More Than Sales", entity: "Costco" };
  assert.ok(!C.matchesTopic("How A Single Costco Changes Its Local Economy", shared, true));
  assert.ok(C.matchesTopic("The Costco Membership Machine", shared, true));
  assert.deepEqual(C.subjectTerms("How Car Washes Became a Business Everyone Wants"), ["car", "wash"]);
});

test("snapshot evidence: per-channel saturation, low-view uploads counted as supply, absent topics omitted", () => {
  const C = PD("competitive");
  const inv = [{ id: "gc", topic: "How Gift Cards Make Money for Retailers", entity: "Gift cards" }, { id: "none", topic: "Why Lighthouses Still Exist", entity: "Lighthouses" }];
  const series = { id: "series", name: "Series", subscribers: 50000, videos: [...filler("s", 6, 20000), ...Array.from({ length: 8 }, (_, i) => ({ id: "s-gc" + i, title: "Gift cards secret " + i, publishedAt: ago(5 + i), views: 30000, durationSec: 600 }))] };
  const clones = Array.from({ length: 11 }, (_, i) => ({ id: "clone" + i, name: "Clone " + i, subscribers: 10, videos: [{ id: "cv" + i, title: "What Happens to Money on Unused Gift Cards", publishedAt: ago(3), views: 12, durationSec: 500 }] }));
  const hindi = { id: "hi", name: "Hi", subscribers: 9000, videos: [{ id: "h1", title: "गिफ्ट कार्ड Gift Cards का पैसा", publishedAt: ago(2), views: 900000, durationSec: 700 }] };
  const shorts = { id: "sh", name: "Sh", subscribers: 9000, videos: [{ id: "sh1", title: "Gift cards in 30 seconds", publishedAt: ago(2), views: 900000, durationSec: 30 }] };
  const ev = C.topicEvidenceFromSnapshot({ fetchedAt: new Date(NOW2).toISOString(), channels: [series, ...clones, hindi, shorts] }, inv);
  assert.ok(!("none" in ev.topics));
  const gc = ev.topics.gc;
  assert.equal(gc.audienceChannels, 1, "an 8-part series from one channel counts once");
  assert.equal(gc.lowViewUploads, 11);
  assert.ok(!gc.top.some((t) => /गिफ्ट|30 seconds/.test(t.title)), "non-Latin titles and Shorts excluded");
  assert.notEqual(gc.breakout.saturation.class, "SATURATED");
  assert.equal(gc.breakout.saturation.provenance === "OBSERVED" || gc.breakout.saturation.provenance === "INFERRED", true);
  // only clones -> GROWING (supply), never audience saturation
  const onlyClones = C.topicEvidenceFromSnapshot({ fetchedAt: new Date(NOW2).toISOString(), channels: clones }, inv);
  assert.equal(onlyClones.topics.gc.breakout.saturation.class, "GROWING");
  assert.equal(onlyClones.topics.gc.breakout.outlier.score.provenance, "UNKNOWN");
  // one audience channel is not demand evidence
  assert.equal(gc.breakout.outlier.score.provenance, "UNKNOWN");
  assert.match(gc.breakout.outlier.score.source, /only 1 matched channel/);
});
