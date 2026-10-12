"use strict";
// Documentary #2 (hbm-034) stays production-consistent: the scene spec validates against an estimated
// timeline built from the approved story, every spoken and on-screen number is in the dossier, and the
// title carries the timeframe of the $8.2B figure.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const SceneSpec = require("../../core/profitdecoded/scene-spec");
const Research = require("../../core/profitdecoded/research");

const FILM = path.join(__dirname, "..", "..", "channels", "profitdecoded", "films", "hbm-034-airline-miles");
const story = require(path.join(FILM, "story", "latest.json"));
const spec = require(path.join(FILM, "scene-spec.json"));
const dossier = require(path.join(__dirname, "..", "..", "channels", "profitdecoded", "research", "hbm-034-how-airlines-make-money-from-credit-cards.json"));

function estimatedTimeline() {
  const WPS = 1180 / 537.8; let t = 0.35; const tl = [];
  for (const b of story.beats) { for (const sentence of b.text.split(/(?<=[.!?])\s+(?=[A-Z"])/)) { const d = sentence.split(/\s+/).length / WPS; tl.push({ beatId: b.id, text: sentence, start: t, end: t + d }); t += d + 0.35; } t += 0.6; }
  return tl;
}
const dossierNumbers = () => [...new Set(JSON.stringify([dossier.claims, dossier.inferences]).replace(/,(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g))];

test("documentary #2: research gate passes and every inference calculation holds", () => {
  assert.equal(Research.gate(dossier, { format: dossier.format }).pass, true);
  for (const inf of dossier.inferences) for (const c of inf.calc || []) {
    const value = Function(`return (${c.expr})`)();
    assert.ok(Math.abs(value - c.equals) <= (Math.abs(c.equals) < 100 ? 0.051 : 0.5), `${inf.id}: ${c.expr} = ${value}, stated ${c.equals}`);
  }
});

test("documentary #2: every spoken number is in the dossier", () => {
  const allowed = new Set(dossierNumbers());
  for (const b of story.beats) for (const n of b.text.replace(/,(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) || []) assert.ok(allowed.has(n), `${b.id}: ${n}`);
});

test("documentary #2: scene spec passes every gate on the estimated timeline", () => {
  const v = SceneSpec.validate(spec, { timeline: estimatedTimeline(), allowedNumbers: dossierNumbers() });
  assert.deepEqual(v.blockers, []);
  assert.ok(spec.scenes.filter((s) => s.type === "composition").length >= 15);
  const ids = new Set(story.beats.map((b) => b.id));
  for (const s of spec.scenes) assert.ok(ids.has(s.beat || s.afterBeat), `${s.id}: beat ${s.beat || s.afterBeat} exists`);
  assert.equal(spec.scenes[0].beat, story.beats[0].id, "the film opens on the first beat");
  assert.equal(spec.scenes[spec.scenes.length - 1].afterBeat, story.beats[story.beats.length - 1].id, "the end card follows the last beat");
});

test("documentary #2: the title states the timeframe of the $8.2B figure", () => {
  assert.match(story.title || require(path.join(FILM, "story", "meta.json")).title, /\$8\.2 Billion in One Year/);
  assert.match(spec.title, /in One Year$/);
});

test("documentary #2: narration bundle matches the approved story and fits the credit cap", () => {
  const N = require("../../core/profitdecoded/narration");
  const T = require("../../core/profitdecoded/text");
  const bundle = require(path.join(FILM, "bundle.json"));
  assert.deepEqual(bundle.beats.map((b) => b.text), story.beats.map((b) => b.text));
  let chars = 0; for (const b of bundle.beats) for (const s of T.sentences(b.text)) chars += N.spokenText(s).length;
  assert.ok(chars > 7000 && chars <= 9000, `spoken characters ${chars} within PD_CARTESIA_MAX_CHARS 9000`);
  assert.deepEqual(N.textChecks(bundle.beats.map((b) => b.text).join(" ")).problems, []);
});
