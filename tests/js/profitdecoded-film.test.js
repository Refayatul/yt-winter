"use strict";
// First full film (gift cards): the script stays inside every story gate, the shot list only addresses beats that exist,
// the licence register is complete, and a re-mix can never call a paid TTS provider for an uncached sentence.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FILM = path.join(ROOT, "channels/profitdecoded/films/hbm-073-gift-cards");
const rj = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

test("film script: every story gate passes (no blocking finding, no plan issue)", () => {
  const W = require(path.join(ROOT, "core/profitdecoded/auto/script-agent"));
  const d = rj(path.join(ROOT, "channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json"));
  const plan = rj(path.join(FILM, "story/plan.json")); const fin = rj(path.join(FILM, "story/latest.json")); const draft = rj(path.join(FILM, "story/draft.json"));
  const pe = W.evaluatePlan(plan, d, "long"); assert.deepEqual(pe.issues, []);
  const graphics = [...(draft.graphics || []).filter((g) => fin.beats.some((b) => b.id === g.beatId) && !(fin.graphics || []).some((n) => n.beatId === g.beatId)), ...(fin.graphics || [])];
  const out = { ...draft, beats: fin.beats, graphics, hookCandidates: plan.hookCandidates.map((h) => h.text), titleCandidates: fin.titleCandidates, thumbnailCandidates: fin.thumbnailCandidates };
  const a = W.assess(out, d, "long", { plan, winningHook: pe.selected.text, hookCandidates: plan.hookCandidates, words: W.wordsFor("long", [8, 12]), title: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" });
  assert.deepEqual(a.blocking, []);
  assert.ok(a.retention.first30.score >= 80, "opening gate");
});

test("film bundle matches the script, and the shot list addresses only beats that exist", () => {
  const b = rj(path.join(FILM, "bundle.json")); const fin = rj(path.join(FILM, "story/latest.json"));
  assert.deepEqual(b.beats.map((x) => [x.id, x.text]), fin.beats.map((x) => [x.id, x.text]));
  const ids = new Set(b.beats.map((x) => x.id)); const scenes = fs.readFileSync(path.join(FILM, "scenes.js"), "utf8");
  const used = [...scenes.matchAll(/\b(?:B|BW|BS)\("([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 80); for (const id of used) assert.ok(ids.has(id), `scenes.js uses unknown beat ${id}`);
  for (const id of ids) assert.ok(used.includes(id), `beat ${id} has no shot timing`);
});

test("film licence register: every asset cleared for commercial use; Cartesia voice is the configured one", () => {
  const reg = rj(path.join(FILM, "licenses.json")); const cfg = rj(path.join(ROOT, "channels/profitdecoded/config.json")).voice;
  for (const a of reg.assets) { assert.equal(a.commercialUse, true, a.id); assert.ok(a.license && a.evidence, a.id); }
  const n = reg.assets.find((a) => a.id === "narration-cartesia"); assert.ok(n.source.includes(cfg.cartesiaVoiceId));
  assert.equal(cfg.provider, "kokoro", "the channel default provider is unchanged (Cartesia only when PD_TTS_PROVIDER=cartesia)");
});

test("produce-audio --tts-cache-only refuses to synthesize an uncached sentence (no paid call on a re-mix)", () => {
  const { spawnSync } = require("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-film-")); const bundle = path.join(dir, "bundle.json");
  fs.writeFileSync(bundle, JSON.stringify({ id: "t", beats: [{ id: "b1", type: "setup", text: "Nothing quietly eats the balance." }] }));
  const env = { ...process.env, PD_TTS_PROVIDER: "cartesia", PD_CARTESIA_API_KEY: "not-a-key", PD_CARTESIA_MAX_CHARS: "100" };
  const r = spawnSync("node", [path.join(ROOT, "scripts/profitdecoded/produce-audio.js"), bundle, "--tts-cache-only"], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /refusing to synthesize/);
});
