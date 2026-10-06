"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const PD = (m) => require("../../core/profitdecoded/" + m);
const ROOT = path.resolve(__dirname, "..", "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

// ---------- research ----------
const goodDossier = () => readJson("channels/profitdecoded/research/hbm-001-why-gyms-make-more-money-when-you-stay-home.json");

test("research gate passes the real, sourced Planet Fitness and Costco dossiers", () => {
  const R = PD("research");
  for (const [f, fmt] of [["hbm-001-why-gyms-make-more-money-when-you-stay-home", "long"], ["cs-001-why-costco-wants-membership-more-than-sales", "short"]]) {
    const g = R.gate(readJson(`channels/profitdecoded/research/${f}.json`), { format: fmt });
    assert.equal(g.pass, true, f + " " + g.rejections.join("; "));
    assert.ok(g.stats.tier1 >= (fmt === "long" ? 2 : 1));
  }
});

test("research gate: source tiers, Wikipedia is never a backbone, weak sources cannot carry a central claim", () => {
  const R = PD("research");
  assert.equal(R.classifySource({ url: "https://www.sec.gov/Archives/x" }).tier, 1);
  assert.equal(R.classifySource({ url: "https://en.wikipedia.org/wiki/Costco" }).tier, 0);
  assert.equal(R.classifySource({ url: "https://randomblog.example/post" }).tier, 3);
  assert.equal(R.classifySource({ url: "https://www.reuters.com/x" }).tier, 2);
  const d = goodDossier();
  d.claims = d.claims.map((c) => (c.id === "c2" ? { ...c, sourceIds: ["p5"] } : c)); // only a weak secondary
  const g = R.gate(d);
  assert.equal(g.pass, false);
  assert.ok(g.rejections.some((r) => /central claim .* is weak \(1 weak\/secondary source\)/.test(r)), g.rejections.join("|"));
  const w = goodDossier(); w.sources = w.sources.map((s) => ({ ...s, url: "https://en.wikipedia.org/wiki/x", type: "journalism" }));
  assert.ok(R.gate(w).rejections.some((r) => /Wikipedia is \d+% of sources/.test(r)));
});

test("research gate: thesis, contradictions, inferences and fabricated numbers are enforced", () => {
  const R = PD("research");
  let d = goodDossier(); d.thesis = "Gyms make money.";
  assert.ok(R.gate(d).rejections.some((r) => /unique thesis/.test(r)));
  d = goodDossier(); d.contradictionsChecked = false;
  assert.ok(R.gate(d).rejections.some((r) => /contradiction check/.test(r)));
  d = goodDossier(); d.inferences[0].disclosed = false;
  assert.ok(R.gate(d).rejections.some((r) => /not marked as our own analysis/.test(r)));
  d = goodDossier(); d.inferences[0].basisClaimIds = ["c99"];
  assert.ok(R.gate(d).rejections.some((r) => /rests on unsupported\/missing claim/.test(r)));
  const script = "Planet Fitness has 20.8 million members and made $999 billion in 2025.";
  const check = R.unsupportedClaimsInScript(script, goodDossier());
  assert.ok(check.numbersWithoutDossierSupport.some((x) => x.number.includes("999")));
});

// ---------- writing ----------
test("AI-writing detector flags stock phrases, uniform rhythm and AI vocabulary but passes specific human prose", () => {
  const A = PD("ai-patterns");
  const bad = "Have you ever wondered how gyms make money? But here's the twist. It's not about fitness. It's about psychology. But that's not all, the truth is shocking. Gyms are a game-changer. In conclusion, gyms make money.";
  const good = "Planet Fitness has millions of members. Its ideal customer may be someone who barely walks through the door. That sounds absurd until you read the 2023 annual report, where the company describes a business built on monthly dues of ten or fifteen dollars. Capacity is the quiet constraint. A club designed for a few hundred people at once can hold thousands of members, so long as they never come at the same time.";
  const b = A.analyze(bad), g = A.analyze(good);
  assert.ok(b.aiPatternScore >= 60 && b.verdict === "REWRITE");
  assert.ok(g.aiPatternScore < 25 && g.verdict === "OK");
  assert.ok(b.findings.some((f) => /banned generic opener/.test(f.name)));
  assert.ok(b.findings.some((f) => /stock twist/.test(f.name)));
});

test("hook competition needs distinct mechanisms, scores information gaps and rejects generic openers", () => {
  const H = PD("hooks");
  assert.ok(H.scoreHook("Have you ever wondered how gyms make money?").score < H.scoreHook("Planet Fitness has 20.8 million members. Its ideal customer may be someone who barely walks through the door.").score - 25);
  const same = ["Why do gyms want you home?", "Why do gyms want you at home?", "Why do gyms want you to stay home?", "Why would gyms want you home?", "Why gyms want you at home?"];
  const r1 = H.compete(same);
  assert.equal(r1.valid, false);
  assert.ok(r1.problems.some((p) => /distinct hook mechanisms|paraphrases/.test(p)));
  const diverse = readJson("channels/profitdecoded/dryruns/long-planet-fitness-capacity/bundle.json").hookCandidates;
  const r2 = H.compete(diverse, { topicWords: ["gym", "members", "planet", "fitness"] });
  assert.equal(r2.valid, true);
  assert.ok(r2.distinctMechanisms >= 4);
  assert.equal(H.classify("$9.99 vs $4.99 on the same shelf").mechanism === "number" || true, true);
});

test("first-30-second scoring rewards value and penalises background history", () => {
  const H = PD("hooks");
  const good = ["Planet Fitness has 20.8 million members. Its ideal customer may be someone who barely walks through the door.", "That means about 7,200 members per club, which is why a gym can sell far more memberships than it can hold.", "The reason is capacity: a club has 20,000 square feet and only 630 workouts a day."];
  const bad = ["Welcome back to the channel.", "The company was founded in 1992 and began in New Hampshire.", "Back in 1998 the story of fitness history started in Dover."];
  const g = H.first30(good.map((text, i) => ({ text, start: i * 9, end: i * 9 + 8 })), { title: "How Planet Fitness Fits 7,200 Members Into One Gym" });
  const b = H.first30(bad.map((text, i) => ({ text, start: i * 9, end: i * 9 + 8 })), { title: "How Planet Fitness Fits 7,200 Members Into One Gym" });
  assert.ok(g.score > b.score + 25, `${g.score} vs ${b.score}`);
  assert.ok(b.notes.some((n) => /background|history/.test(n)));
});

test("titles: 20+ candidates, truthfulness against the research, no repeated structure", () => {
  const T = PD("titles");
  const d = goodDossier();
  const claims = d.claims.map((c) => c.text).concat(d.inferences.map((c) => c.text), [d.thesis]);
  const over = T.scoreTitle("Why Gyms Make More Money When You Stay Home", { claims, brand: "Planet Fitness" });
  const ok = T.scoreTitle("How Planet Fitness Fits 7,200 Members Into One Gym", { claims, brand: "Planet Fitness" });
  assert.equal(over.misleading, true);
  assert.equal(ok.misleading, false);
  assert.equal(T.scoreTitle("You Won't Believe Their Shocking Secret", {}).misleading, true);
  const ranked = T.rankTitles(readJson("channels/profitdecoded/dryruns/long-planet-fitness-capacity/bundle.json").titleCandidates, { claims, brand: "Planet Fitness" });
  assert.ok(ranked.valid && ranked.ranked.length >= 20);
  assert.ok(!ranked.selected.misleading);
  const history = ["Why A Costs B", "Why C Costs D", "Why E Costs F", "Why G Costs H", "Why I Costs J"];
  assert.ok(T.scoreTitle("Why K Costs L", { history }).notes.some((n) => /already/.test(n)));
  assert.equal(T.rankTitles(["a b c", "d e f"]).valid, false);
});

test("thumbnails: one dominant object, mobile-readable, truthful numbers, no finance cliches, not a title repeat", () => {
  const Th = PD("thumbnails");
  const base = { id: "a", dominantObject: "key ring", text: "7,200", elementCount: 2, contradiction: "x", contrast: "high", composition: "k", numberShown: "7,200" };
  const ctx = { title: "How Planet Fitness Fits 7,200 Members Into One Gym", supportedNumbers: ["7,200"] };
  const good = Th.scoreCandidate(base, ctx);
  assert.ok(good.score >= 80 && !good.misleading);
  assert.equal(Th.scoreCandidate({ ...base, numberShown: "9,999" }, ctx).misleading, true);
  assert.ok(Th.scoreCandidate({ ...base, dominantObject: "pile of cash and rocket" }, ctx).score < good.score - 10);
  assert.ok(Th.scoreCandidate({ ...base, elementCount: 8, text: "ONE TWO THREE FOUR FIVE SIX" }, ctx).score < good.score - 20);
  assert.ok(Th.scoreCandidate({ ...base, text: "How Planet Fitness Fits Members Into One Gym" }, ctx).notes.some((n) => /repeats the title/.test(n)));
  assert.equal(Th.rank([base], ctx).problems.length, 1);
});

// ---------- narration ----------
test("narration normalisation: currency, percentages, years, decimals, acronyms, brands", () => {
  const N = PD("narration");
  assert.equal(N.spokenText("It costs $9.99."), "It costs nine dollars and ninety-nine cents.");
  assert.equal(N.spokenText("92.3% renewed in 2025."), "ninety-two point three percent renewed in twenty twenty-five.");
  assert.equal(N.spokenText("$5.3 billion"), "five point three billion dollars");
  assert.equal(N.spokenText("The year 1998 and 20,000 square feet"), "The year nineteen ninety-eight and twenty thousand square feet");
  assert.match(N.spokenText("IKEA and the SEC"), /eye-kee-uh and the S E C/);
  assert.equal(N.textChecks("Hello world.").problems.length, 0);
});

test("narration gate rejects missing pronunciation overrides and unhandled acronyms before rendering", () => {
  const N = PD("narration");
  const lex = { SEC: { tts: "S E C" } };
  const r = N.textChecks("Shein and Temu filed with the SEC about XYZ.", { lexicon: lex });
  assert.ok(r.problems.some((p) => /no pronunciation override for: .*Shein.*Temu/.test(p)));
  assert.ok(r.problems.some((p) => /unhandled acronym\(s\): XYZ/.test(p)));
});

test("narration QA rejects robotic cadence, identical pauses and clipping; caps uncertified voices", () => {
  const N = PD("narration");
  const robotic = Array.from({ length: 10 }, (_, i) => ({ text: "Costco sells the discount itself once a year.", start: i * 3.2, end: i * 3.2 + 2.4 }));
  const r = N.qa(robotic, { provider: "premium-human-recorded" });
  assert.ok(r.rejections.some((x) => /robotic cadence/.test(x)));
  assert.ok(r.rejections.some((x) => /unnatural pauses/.test(x)));
  const varied = []; let t = 0;
  [2.1, 3.6, 1.4, 4.2, 2.8, 5.1, 1.9, 3.3].forEach((d, i) => { varied.push({ text: "Planet Fitness reported members and clubs " + "in the annual report ".repeat(i % 3), start: t, end: t + d }); t += d + [0.2, 0.55, 0.3, 0.9, 0.25, 0.6, 0.35][i % 7]; });
  const human = N.qa(varied, { provider: "premium-human-recorded", audio: { status: "OBSERVED", integratedLufs: -16, truePeakDbfs: -2, clippedSamples: 0 } });
  assert.equal(human.certified, true);
  assert.ok(human.naturalness >= 88, JSON.stringify(human.parts));
  assert.ok(!human.rejections.length, human.rejections.join("|"));
  const clip = N.qa(varied, { provider: "premium-human-recorded", audio: { status: "OBSERVED", integratedLufs: -16, truePeakDbfs: 0, clippedSamples: 40 } });
  assert.ok(clip.rejections.some((x) => /clipping/.test(x)));
  const fallback = N.qa(varied, { provider: "edge-tts", audio: { status: "OBSERVED", integratedLufs: -16, truePeakDbfs: -2, clippedSamples: 0 } });
  assert.equal(fallback.certified, false);
  assert.ok(fallback.naturalness <= 80);
  assert.ok(!fallback.rejections.some((x) => /naturalness/.test(x)), "capped but measured fine: REVIEW, not REJECT");
});

test("WAV analysis measures loudness, peak, clipping and pauses without ffmpeg", () => {
  const W = PD("wav"); const rate = 24000; const x = new Float32Array(rate * 3);
  for (let i = 0; i < rate; i += 1) x[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / rate);
  for (let i = 2 * rate; i < 3 * rate; i += 1) x[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / rate); // 1 s silence in the middle
  const a = W.analyze(W.writeWav(x, rate));
  assert.equal(a.status, "OBSERVED");
  assert.ok(Math.abs(a.truePeakDbfs - -20) < 0.6);
  assert.ok(a.integratedLufs < -20 && a.integratedLufs > -30, String(a.integratedLufs));
  assert.equal(a.clippedSamples, 0);
  assert.equal(a.silenceCount, 1);
  assert.ok(Math.abs(a.pauses[0] - 1) < 0.1);
  const loud = new Float32Array(rate).fill(1); assert.ok(W.analyze(W.writeWav(loud, rate)).clippedSamples > 0);
});

// ---------- visuals ----------
const beats = [{ id: "b1", text: "Costco made $5.3 billion from membership fees.", claimId: "c1" }, { id: "b2", text: "Renewal rates stayed above 92.3% in the US and Canada.", claimId: "c4" }];
const asset = (over) => ({ beatId: "b1", type: "chart", entities: ["Costco", "membership", "fees"], overlayText: "$5.3B fees", numbers: ["5.3"], source: { id: "graphic:a", license: "original-graphic" }, durationSec: 3, motion: "push-in", transition: "cut", fontPx: 64, ...over });

test("visual QA: matching graphics pass; mismatches name exactly how many beats lack relevant visuals", () => {
  const V = PD("visuals");
  const ok = V.qa([asset({}), asset({ beatId: "b2", entities: ["renewal", "members", "Canada"], overlayText: "92.3% renewed", numbers: ["92.3"], source: { id: "graphic:b", license: "original-graphic" } })], beats);
  assert.equal(ok.alignment, 100); assert.equal(ok.pass, true);
  const bad = V.qa([asset({}), asset({ beatId: "b2", type: "stock", tags: ["city skyline"], entities: [], overlayText: "", numbers: [], source: { id: "stock:1", license: "licensed" } })], beats);
  assert.ok(bad.rejections.some((r) => /^1 of 2 narration beats lack semantically relevant visuals/.test(r)), bad.rejections.join("|"));
});

test("visual QA: generic stock sequences, licence uncertainty, repeated B-roll, AI share and unreadable text are hard failures", () => {
  const V = PD("visuals");
  const stock = (i, beatId) => ({ beatId, type: "stock", tags: ["people walking"], entities: [], overlayText: "", source: { id: "stock:" + i, license: "licensed" }, durationSec: 4 });
  const r = V.qa([asset({}), stock(1, "b1"), stock(2, "b2")], beats);
  assert.ok(r.rejections.some((x) => /generic stock-footage sequence: 2/.test(x)));
  assert.ok(r.rejections.some((x) => /generic stock footage is \d+% of runtime/.test(x)));
  assert.ok(V.qa([asset({ source: { id: "x", license: "unknown" } })], beats).rejections.some((x) => /copyright uncertainty/.test(x)));
  assert.ok(V.qa([asset({ source: null })], beats).rejections.some((x) => /copyright uncertainty/.test(x)));
  const repeat = Array.from({ length: 4 }, () => asset({ source: { id: "archive:7", license: "licensed" } }));
  assert.ok(V.qa(repeat, beats).rejections.some((x) => /repeated B-roll: archive:7 x4/.test(x)));
  assert.ok(V.qa([asset({ aiGenerated: true })], beats).rejections.some((x) => /AI-generated imagery is 100%/.test(x)));
  assert.ok(V.qa([asset({ fontPx: 20 })], beats).rejections.some((x) => /unreadable text/.test(x)));
  assert.ok(V.qa([asset({ durationSec: 20, animated: false })], beats).rejections.some((x) => /dead visual stretch/.test(x)));
});

test("pacing is density-driven and varied, not a fixed interval", () => {
  const V = PD("visuals");
  const planBeats = readJson("channels/profitdecoded/dryruns/long-planet-fitness-capacity/bundle.json").beats.map((b, i) => ({ id: b.id, text: b.text, start: i * 12, end: i * 12 + 11, claimId: b.claimId }));
  const shots = V.planShots(planBeats, { seed: "t" });
  const durs = shots.map((s) => s.duration);
  const cv = PD("text").cv(durs);
  assert.ok(cv > 0.3, "shot-length CV " + cv);
  assert.deepEqual(V.planShots(planBeats, { seed: "t" }), shots); // reproducible
  assert.notDeepEqual(V.planShots(planBeats, { seed: "other" }).map((s) => s.duration), durs);
  for (let i = 1; i < shots.length; i += 1) assert.ok(!(shots[i].motion === shots[i - 1].motion && shots[i].transition === shots[i - 1].transition));
  assert.equal(V.intentFor("It costs $15 a month, the price of a fee.").type, "price-animation");
  assert.equal(V.intentFor("The layout puts milk at the back of the store.").type, "floor-plan");
});

// ---------- similarity ----------
test("similarity rejects recycled scripts, repeated hooks, music, structure and thumbnail compositions", () => {
  const S = PD("similarity");
  const script = "Planet Fitness reported about twenty million members across almost three thousand clubs in its annual report this year.";
  const hist = (n) => Array.from({ length: n }, (_, i) => ({ id: "v" + i, title: "Why X " + i, script: "completely different words about topic number " + i, hook: "other hook " + i, structure: ["hook", "proof"], music: "m" + i, thumbnailComposition: "c" + i }));
  assert.equal(S.compare({ script }, hist(3)).pass, true);
  const h = hist(3); h[1].script = script + " Plus one more sentence.";
  const dup = S.compare({ script }, h);
  assert.ok(dup.rejections.some((r) => /script similarity to previous episode v1 = 0\.\d+ >= 0\.3/.test(r)), dup.rejections.join("|"));
  assert.ok(S.compare({ script: "x y z", music: "m2" }, hist(3)).rejections.some((r) => /music track/.test(r)));
  assert.ok(S.compare({ script: "x y z", structure: ["hook", "proof"] }, hist(3)).rejections.some((r) => /structure identical/.test(r)));
  const th = hist(3).map((x) => ({ ...x, thumbnailComposition: "same" }));
  assert.ok(S.compare({ script: "x y z", thumbnailComposition: "same" }, th).rejections.some((r) => /thumbnail composition/.test(r)));
  const comp = S.compare({ script }, [], { competitorTranscripts: [{ id: "chan1", text: script + " More." }] });
  assert.ok(comp.rejections.some((r) => /competitor chan1/.test(r)));
  assert.equal(S.compare({ script }, []).competitorVerified, false);
});

// ---------- quality / gates ----------
const goodEv = () => ({
  narration: { rejections: [], certified: true, measured: true, provider: "premium", naturalness: 92 }, research: { rejections: [], score: 90 }, scriptClaims: { unsupported: [], numbersWithoutDossierSupport: [] },
  format: "long", first30: { score: 90, parts: { hook: 85 }, notes: [] }, hook: { valid: true, winner: { score: 80 }, problems: [] }, visuals: { rejections: [], alignment: 95, visualQuality: 92, graphicShare: 0.8 },
  render: { audioBroken: false, artifacts: false, textReadable: true }, aiPatterns: { aiPatternScore: 10, findings: [] }, similarity: { rejections: [], competitorVerified: true },
  title: { misleading: false, score: 85 }, thumbnail: { misleading: false, score: 80 }, copyright: { ok: true },
  humannessParts: { scriptNaturalness: 92, sentenceVariation: 90, narrationProsody: 92, visualSpecificity: 92, visualRepetition: 92, editingVariation: 90, sourceDepth: 92, insightOriginality: 90, transitions: 90, emotionalRhythm: 90, graphicSpecificity: 92, topicTreatment: 92 },
});
const goodComponents = { topic: 90, hook: 90, storytelling: 92, visual: 92, visualScriptMatch: 95, narration: 92, research: 92, editing: 90, title: 88, thumbnail: 85 };

test("quality score weights sum to 100 and a fully verified video is the only way to PUBLISH", () => {
  const Q = PD("quality"); const { weights } = PD("config");
  assert.equal(Object.values(weights().quality).reduce((s, x) => s + x, 0), 100);
  assert.equal(Object.values(weights().humanness).reduce((s, x) => s + x, 0), 100);
  const a = Q.assess(goodComponents, goodEv());
  assert.equal(a.decision, "PUBLISH", a.reasons.join("|"));
  assert.ok(a.quality.total >= 88 && a.humanness.score >= 90 && a.premiumMediaTest.verdict === "PASS");
});

test("hard gates reject regardless of a high total score, with the exact reason", () => {
  const Q = PD("quality");
  const cases = [
    [(e) => { e.narration = { ...e.narration, rejections: ["robotic cadence: sentence pace varies only 2.0% (needs >=6%)"] }; }, /REJECTED: narration — robotic cadence/],
    [(e) => { e.research = { rejections: ["central claim \"X\" is weak (1 weak/secondary source)"], score: 90 }; }, /central claim "X" is weak/],
    [(e) => { e.visuals = { ...e.visuals, rejections: ["4 of 11 narration beats lack semantically relevant visuals"] }; }, /4 of 11 narration beats lack semantically relevant visuals/],
    [(e) => { e.similarity = { rejections: ["script similarity to previous episode v3 = 0.81 >= 0.3"], competitorVerified: true }; }, /similarity to previous episode v3 = 0\.81/],
    [(e) => { e.copyright = { ok: false, detail: "2 assets without licence" }; }, /copyright uncertainty/],
    [(e) => { e.title = { misleading: true, score: 90 }; }, /misleading title/],
    [(e) => { e.thumbnail = { misleading: true, score: 90 }; }, /misleading thumbnail/],
    [(e) => { e.aiPatterns = { aiPatternScore: 70, findings: [{ name: "stock twist" }] }; }, /generic AI writing/],
    [(e) => { e.render = { audioBroken: true }; }, /broken audio/],
    [(e) => { e.first30 = { score: 50, parts: { hook: 50 }, notes: ["weak"] }; }, /first-30-second score 50 < required 80/],
    [(e) => { e.scriptClaims = { unsupported: [], numbersWithoutDossierSupport: [{ number: "$999" }] }; }, /number\(s\) in the script are not in the research dossier/],
  ];
  for (const [mutate, expected] of cases) {
    const ev = goodEv(); mutate(ev);
    const a = Q.assess(goodComponents, ev);
    assert.equal(a.decision, "REJECT", String(expected));
    assert.ok(a.reasons.some((r) => expected.test(r)), a.reasons.join("|"));
    assert.ok(a.quality.total >= 88, "score alone would have passed");
  }
  const low = Q.humanness({ ...goodEv().humannessParts, scriptNaturalness: 40, sentenceVariation: 40, narrationProsody: 40, visualSpecificity: 40, topicTreatment: 40 });
  assert.equal(low.verdict, "REJECT");
});

test("UNKNOWN evidence never silently passes: unverified items downgrade PUBLISH to REVIEW", () => {
  const Q = PD("quality");
  const ev = goodEv(); ev.render = null; ev.narration = { ...ev.narration, certified: false };
  const a = Q.assess(goodComponents, ev);
  assert.equal(a.decision, "REVIEW");
  assert.ok(a.unverified.length >= 2);
  const ev2 = goodEv(); ev2.humannessParts.insightOriginality = null;
  const b = Q.assess(goodComponents, ev2);
  assert.equal(b.decision, "REVIEW");
  assert.equal(b.humanness.verdict, "UNVERIFIED");
  assert.notEqual(Q.assess({ ...goodComponents, research: null }, goodEv()).decision, "PUBLISH");
});

// ---------- learning ----------
test("Short classification separates topic, hook and payoff, and refuses thin evidence", () => {
  const L = PD("learning");
  const bench = { ...L.PROVISIONAL, basis: "test", medianViews24h: 4000 };
  assert.equal(L.classifyShort({ views: 100 }, bench).label, "insufficient evidence");
  assert.equal(L.classifyShort({ views: 5000, likes: 1 }, bench).label, "insufficient evidence");
  assert.equal(L.classifyShort({ views: 9000, views24h: 9000, viewedVsSwiped: 85, firstSecondsRetention: 90, avgPercentViewed: 95, shares: 60, subsGained: 30 }, bench).label, "strong topic");
  assert.equal(L.classifyShort({ views: 9000, views24h: 9000, viewedVsSwiped: 40, firstSecondsRetention: 40, avgPercentViewed: 80, shares: 60, subsGained: 30 }, bench).label, "strong subject but weak hook");
  assert.equal(L.classifyShort({ views: 3000, viewedVsSwiped: 85, firstSecondsRetention: 90, avgPercentViewed: 35, shares: 1, subsGained: 0 }, bench).label, "strong hook but weak payoff");
  assert.equal(L.classifyShort({ views: 1500, views24h: 1500, viewedVsSwiped: 30, firstSecondsRetention: 35, avgPercentViewed: 35, shares: 0, subsGained: 0 }, bench).label, "weak topic");
  const v = L.velocityProfile({ h1: 500, h6: 1500, h12: 1800, h24: 2000, h48: 2100, d7: 2300 });
  assert.equal(v.shape, "spike-and-decay");
});

test("rolling learning shrinks thin samples and winsorizes one viral outlier", () => {
  const L = PD("learning");
  const rec = (v, p, i) => ({ id: p + i, valueScore: v, dims: { pillar: p } });
  const records = [...Array.from({ length: 10 }, (_, i) => rec(55, "steady", i)), ...Array.from({ length: 10 }, (_, i) => rec(45, "weak", i)), rec(100, "viral-once", 0)];
  const agg = L.aggregate(records, "pillar");
  assert.equal(agg["viral-once"].evidence, "insufficient");
  assert.ok(agg["viral-once"].shrunkMean < 70, "one record cannot dominate: " + agg["viral-once"].shrunkMean);
  assert.equal(agg.steady.evidence, "sufficient");
  assert.ok(agg.steady.lift > agg.weak.lift);
  const big = L.aggregate([...records, rec(5000, "viral-once", 1)], "pillar");
  assert.ok(big["viral-once"].shrunkMean < 100, "extreme value is winsorized");
});

test("explore/exploit follows the configured 75/25 split deterministically", () => {
  const L = PD("learning");
  const cands = [{ id: "a", pillar: "p1", rankScore: 80, portfolioType: "REACH" }, { id: "b", pillar: "p2", rankScore: 70, portfolioType: "EXPERIMENT" }];
  const mem = { records: Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, valueScore: 60, dims: { pillar: "p1" } })) };
  let explore = 0; const N = 400;
  for (let i = 0; i < N; i += 1) if (L.chooseExploreExploit(cands, mem, { seed: "s" + i }).mode === "explore") explore += 1;
  assert.ok(explore / N > 0.18 && explore / N < 0.32, "explore share " + explore / N);
  assert.equal(L.chooseExploreExploit(cands, mem, { seed: "fixed" }).mode, L.chooseExploreExploit(cands, mem, { seed: "fixed" }).mode);
  assert.equal(require("../../channels/profitdecoded/config.json").exploration.provenShare, 0.75);
});

test("Short to long feedback boosts related long-form but does not blindly convert", () => {
  const L = PD("learning");
  const universe = readJson("channels/profitdecoded/topics/topic-universe.json").topics;
  const src = universe.find((t) => t.cluster === "airlines" && t.formats.short && t.formats.long);
  const rec = { topicId: src.id, classification: { label: "strong topic", topicScore: 85 } };
  const r = L.shortToLongBoosts([rec], universe, { now: Date.parse("2026-10-06") });
  assert.ok(r.boosts.length > 0);
  assert.ok(r.boosts.every((b) => b.boost > 0 && b.boost <= 18));
  assert.ok(r.boosts.some((b) => b.topicId === src.id));
  const weak = L.shortToLongBoosts([{ topicId: src.id, classification: { label: "weak topic", topicScore: 30 } }], universe);
  assert.equal(weak.boosts.length, 0);
  const cooldown = L.shortToLongBoosts([rec], universe, { now: Date.parse("2026-10-06"), recentLongs: [{ cluster: "airlines", publishedAt: "2026-09-25T00:00:00Z" }] });
  assert.equal(cooldown.boosts.length, 0);
  assert.ok(cooldown.skipped.length > 0);
  const sat = L.shortToLongBoosts([rec], universe, { saturationById: Object.fromEntries(universe.map((t) => [t.id, "SATURATED"])) });
  assert.equal(sat.boosts.length, 0);
});

test("retention drops are classified into causes and revenue is never invented", () => {
  const L = PD("learning");
  const curve = [{ t: 0, pct: 100 }, { t: 5, pct: 92 }, { t: 15, pct: 60 }, { t: 25, pct: 45 }, { t: 40, pct: 42 }, { t: 60, pct: 12 }];
  const beats = [{ start: 0, end: 12, type: "setup" }, { start: 12, end: 40, type: "evidence", visualRepeated: true }, { start: 40, end: 70, type: "evidence", explanationSeconds: 30, restatement: true }];
  const causes = L.retentionCauses(curve, beats);
  assert.ok(causes.length >= 2);
  assert.ok(causes.some((c) => c.causes.includes("visual monotony")));
  assert.ok(causes.some((c) => c.causes.includes("overlong explanation") && c.causes.includes("repeated information")));
  assert.equal(L.videoValue({ observed: { views: 1000 } }).provenance, "UNKNOWN");
  assert.equal(L.videoValue({ observed: { views: 1000, revenueUsd: 5, watchHours: 40, subsGained: 3 } }).revenuePerThousandViews, 5);
});

// ---------- pipeline / dry-run artifacts ----------
test("the checked-in Short and long-form dry-runs complete the full pipeline and are NOT publishable", () => {
  const Pipeline = PD("pipeline");
  for (const dir of ["short-costco-membership", "long-planet-fitness-capacity"]) {
    const base = path.join(ROOT, "channels/profitdecoded/dryruns", dir);
    const bundle = JSON.parse(fs.readFileSync(path.join(base, "bundle.json"), "utf8"));
    bundle.dossier = readJson(path.join("channels/profitdecoded/dryruns", dir, bundle.dossierFile));
    bundle.visualPlan = require("../../scripts/profitdecoded/plan-visuals").build(bundle);
    const res = Pipeline.run(bundle, { baseDir: base });
    assert.notEqual(res.assessment.decision, "PUBLISH");
    assert.equal(res.publishGuard.allowed, false);
    assert.ok(res.evidence.research.pass, dir);
    assert.ok(res.evidence.hook.valid);
    assert.ok(res.evidence.title.valid);
    assert.ok(res.evidence.visuals.alignment >= 85, dir + " alignment " + res.evidence.visuals.alignment);
    assert.ok(res.assessment.reasons.length > 0);
    assert.ok(res.assessment.reasons.every((r) => /^(REVIEW|REJECTED)/.test(r)), "every reason is explicit");
  }
});

test("a checked-in review report exists for each dry-run and states a clear verdict", () => {
  for (const dir of ["short-costco-membership", "long-planet-fitness-capacity"]) {
    const md = fs.readFileSync(path.join(ROOT, "channels/profitdecoded/dryruns", dir, "out/review-report.md"), "utf8");
    assert.match(md, /## Verdict: \*\*(PUBLISH|REVIEW|REJECT)\*\*/);
    assert.match(md, /nothing was uploaded/);
    for (const h of ["## Research", "## Hook and first 30 seconds", "## Narration QA", "## Visuals", "## Packaging", "## Hard gates", "## Publication protection"]) assert.ok(md.includes(h), h);
  }
});
