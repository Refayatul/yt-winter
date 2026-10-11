"use strict";
// Shorts quality recovery (2026-10-11): FR 9:16 framing, continuous narration timing, word-timed
// captions, title grammar and spoken-number simplification. All behind SHORTS_CRAFT_V2 except the
// title grammar gate, which only removes broken English from selection.
const test = require("node:test");
const assert = require("node:assert/strict");
const Odak = require("../../lib/odak");
const Kadraj = require("../../lib/dikey-kadraj");
const Narration = require("../../lib/edge-narration");
const Pacing = require("../../core/growth/pacing");
const Grammar = require("../../core/growth/title-grammar");
const Craft = require("../../core/rendering/craft");

const profile = (n, hot) => Array.from({ length: n }, (_, i) => (hot.includes(i) ? 50 : 1));

test("subject window: concentrated detail is found; an even spread is reported as such", () => {
  const concentrated = Odak.analyse({ col: profile(128, [96, 97, 98, 99, 100, 101, 102]), row: Array(72).fill(1) }, 0.316);
  assert.ok(Math.abs(concentrated.cx - 0.78) < 0.08, `cx ${concentrated.cx}`);
  assert.ok(concentrated.coverage >= concentrated.uniform * Kadraj.FOCUS_RATIO);
  const even = Odak.analyse({ col: Array(128).fill(5), row: Array(72).fill(1) }, 0.316);
  assert.ok(even.coverage < even.uniform * Kadraj.FOCUS_RATIO);
});

test("FR v2 composition: subject crop when the subject is clear, documentary layout otherwise, portrait unchanged", () => {
  const odak = { cx: 0.6, cx2: 0.2, cy: 0.5, coverage: 0.62, uniform: 0.375 };
  assert.equal(Kadraj.kompozisyon({ w: 1200, h: 800, odak }), "odak");
  assert.equal(Kadraj.kompozisyon({ w: 1038, h: 594, odak: { ...odak, coverage: 0.376, uniform: 0.32 } }), "belge");
  assert.equal(Kadraj.kompozisyon({ w: 1038, h: 594, odak: null }), "belge", "unknown subject: never crop blindly");
  assert.equal(Kadraj.kompozisyon({ w: 900, h: 1600, odak: null }), "dikey");
  const belge = Kadraj.fotoFiltreV2({ w: 1038, h: 594, n: 60, odak: { ...odak, coverage: 0.3, uniform: 0.32 } });
  assert.match(belge, /scale=1080:618/, "the whole frame is shown at full width");
  assert.doesNotMatch(belge, /boxblur|gblur/, "no blurred fill");
  const crop = Kadraj.fotoFiltreV2({ w: 1200, h: 800, n: 60, odak });
  assert.match(crop, /crop=2160:3840:\d+:0/);
  assert.notEqual(Kadraj.detay({ w: 1200, h: 800, odak, kullanim: 0 }).x, Kadraj.detay({ w: 1200, h: 800, odak, kullanim: 1 }).x, "a returning cut shows another region");
  assert.equal(Kadraj.fotoFiltre({ w: 1200, h: 800, n: 60 }), Kadraj.fotoFiltre({ w: 1200, h: 800, n: 60 }), "v1 unchanged");
});

test("continuous narration: lines are aligned on Edge word boundaries; text is XML-escaped", () => {
  const words = ["What", "if", "ice", "sank", "Most", "substances", "shrink", "Water", "does", "not"].map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const times = Narration.align(["What if ice sank?", "Most substances shrink.", "Water does not."], words, 4.5);
  assert.deepEqual(times.map((t) => +t.start.toFixed(1)), [0, 1.6, 2.8]);
  assert.equal(times[2].end, 4.5);
  assert.equal(Narration.align(["Something else entirely."], words.slice(0, 2), 1), null, "a mismatch is reported, never guessed");
  assert.match(Narration.ssml("en-US-BrianMultilingualNeural", "+2%", ["AT&T <and> co"], [], false), /AT&amp;T &lt;and&gt; co/);
  assert.ok(Narration.BEAT_GAPS.afterHook < 0.6 && Narration.BEAT_GAPS.beforePayoff < 0.6, "no gap long enough to read as an exit point");
});

test("captions start on their first spoken word when word timings exist; proportional otherwise", () => {
  const config = { maxWordsPerChunk: 3, maxCharsPerLine: 18, maxLines: 2, fontSize: 64, marginV: 560 };
  const claims = [{ text: "Most substances shrink as they freeze.", start: 0, end: 3 }];
  const words = ["Most", "substances", "shrink", "as", "they", "freeze"].map((text, i) => ({ text, start: [0.1, 0.4, 1.4, 2.0, 2.2, 2.4][i], end: 0 }));
  const timed = Pacing.srt(claims, config, { words });
  assert.match(timed, /00:00:00,100 --> 00:00:02,000\n/);
  assert.match(timed, /00:00:02,000 --> 00:00:03,000\nas they freeze\./);
  assert.doesNotMatch(Pacing.srt(claims, config), /00:00:02,000/, "without words the old proportional timing is unchanged");
  const long = Pacing.srt([{ text: "Dinosaur-Killing Asteroid Hit Today?", start: 0, end: 3 }], config);
  assert.match(long, /\nDinosaur-Killing\nAsteroid Hit Today\?\n/, "a chunk that cannot fit two 18-character lines is still split, never left as one long line");
  const style = Craft.captionStyle(config);
  assert.ok(style.fontSize >= 76 && style.marginV >= 600);
});

test("title grammar gate: clauses in noun slots, missing articles and hyphen case are caught", () => {
  const ib = { subject: "fusion reached practical power-plant gain" };
  assert.ok(Grammar.isClause(ib.subject));
  assert.ok(Grammar.problems("How Fusion Reached Practical Power-Plant Gain Would Unfold", ib).length > 0);
  assert.deepEqual(Grammar.problems("What If Fusion Reached Practical Power-Plant Gain?", ib), []);
  const ct = { subject: "high-lift water pump" };
  assert.ok(Grammar.problems("Inside High-Lift Water Pump: The Hidden Dependency", ct).includes("a singular noun without an article"));
  assert.deepEqual(Grammar.problems("Inside the High-Lift Water Pump: The Hidden Dependency", ct), []);
  assert.equal(Grammar.nounPhrase("high-lift water pump"), "the high-lift water pump");
  assert.equal(Grammar.nounPhrase("submarine cables"), "submarine cables");
  assert.equal(Grammar.nounPhrase("Suez Canal traffic system"), "Suez Canal traffic system");
  assert.equal(Grammar.hyphenCase("Practical Power-plant Gain"), "Practical Power-Plant Gain");
  assert.deepEqual(Grammar.problems("The Pumps That Left 150,000 People Without Water", ct), []);
  assert.deepEqual(Grammar.problems("What If Ice Sank Instead of Floating?", { subject: "ice" }), [], "an uncountable noun needs no article");
  assert.deepEqual(Grammar.problems("What Survives If Air Resistance Reverses for One Second?", { subject: "air resistance" }), []);
  assert.ok(Grammar.needsArticle("main bearing"), "a countable -ing part still takes an article");
  assert.deepEqual(Grammar.problems("Could a One-Percent Change in the Speed of Light Remake the Universe?", {}), []);
  assert.ok(Grammar.problems("A Ocean Without a Atmosphere", {}).includes("'a' before a vowel sound"));
  assert.equal(Grammar.hyphenCase("Inside the Weigh-in-motion Station"), "Inside the Weigh-In-Motion Station");
});

test("generated titles: the broken templates are no longer produced or selected", () => {
  const Channel = require("../../core/channel-context");
  const Model = require("../../core/growth/topic-model");
  const Discovery = require("../../core/discovery");
  const Titles = require("../../core/growth/titles");
  const Config = require("../../core/growth/config");
  for (const [slug, topicSlug] of [["impossible-brief", "what-if-fusion-power-actually-worked"], ["critical-thread", "why-high-lift-water-pump-is-so-hard-to-replace"]]) {
    const channel = Channel.getChannel(slug);
    const raw = (Discovery.universe(channel).topics || []).find((t) => t.slug === topicSlug);
    if (!raw) continue;
    const titles = Titles.generate(Model.normalize(channel, raw), Config.forChannel(channel));
    assert.ok(titles.selected && !titles.selected.ungrammatical, `${slug}: ${titles.selected && titles.selected.title}`);
    assert.ok(!titles.candidates.some((c) => /Would Unfold$/.test(c.title) && Grammar.isClause(Model.normalize(channel, raw).subject)));
    assert.ok(!titles.candidates.some((c) => /Inside High-Lift Water Pump/.test(c.title)));
  }
});

test("spoken figures: long decimals become 'about'; story shape is measured, not scored", () => {
  assert.equal(Craft.simplifyNumbers("It's 11.611 kilometres long."), "It's about 11.6 kilometres long.");
  assert.equal(Craft.simplifyNumbers("about 27.123 bar"), "about 27.1 bar");
  assert.equal(Craft.simplifyNumbers("8.3% less, 2.9-5.5 kWh, 66 million"), "8.3% less, 2.9-5.5 kWh, 66 million");
  const shape = Craft.storyShape(["A truck fire shut Mont Blanc until 2002.", "That's why ventilation matters."]);
  assert.deepEqual([shape.figures, shape.causalLinks], [1, 1]);
});

test("relevance: an off-subject picture is rejected and reported; the ending never falls to abstract filler", () => {
  const V = require("../../core/rendering/topic-visuals");
  const topic = { channel: "impossible-brief", slug: "ice", topic: "What If Ice Sank Instead of Floating?", canonicalTopic: "ice density anomaly",
    subject: "floating ice", visualScenes: ["lake ice", "sea ice"] };
  const stills = [
    { file: "Anchor ice under sea ice.JPG", description: "anchor ice under sea ice", width: 1600, height: 1200 },
    { file: "A Melange of Ice - NASA Earth Observatory.jpg", description: "sea ice melange", width: 1600, height: 1200 },
    { file: "Ice sculptor at work.jpg", description: "an ice sculptor carving a block", width: 1600, height: 1200 },
    { file: "Frozen lake ice sheet.jpg", description: "lake ice in winter", width: 1600, height: 1200 },
  ];
  const lines = ["What if ice sank instead of floating?", "Most substances shrink as they freeze.", "Water doesn't.", "It expands by about 9%.",
    "So ice floats and lakes freeze from the top.", "Floating ice insulates the water beneath it.", "So a strange quirk of water keeps lakes alive in winter."];
  const claims = lines.map((text, i) => ({ text, start: i * 4, end: (i + 1) * 4 }));
  const build = (craft) => V.buildVisualPlan(topic, { claims, targetSeconds: 28 }, stills.map((s) => ({ ...s })), Array(14).fill(2), 28, [], { opening: "number", craft });
  const after = build({ opening: true, repeats: true });
  assert.ok(!after.some((shot) => shot.still && /sculptor/.test(shot.still.file)), "the sculptor is not shown");
  assert.ok(after.rejectedVisuals.some((r) => /sculptor/.test(r.asset) && /sculptor/.test(r.reason)), "and the rejection is reported");
  const closing = after.filter((shot) => shot.claimIndex >= 5);
  assert.ok(closing.every((shot) => shot.type !== "procedural"), `closing lines: ${closing.map((s) => s.type).join(",")}`);
  const before = build(false);
  assert.ok(before.some((shot) => shot.still && /sculptor/.test(shot.still.file)), "flag off: the plan is unchanged (the sculptor is still used)");
});
