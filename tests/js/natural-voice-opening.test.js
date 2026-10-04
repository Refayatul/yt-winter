"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const Channel = require("../../core/channel-context");
const Pacing = require("../../scene-pacing");

const CHANNELS = ["failure-reconstructed", "impossible-brief", "critical-thread", "behind-the-ordinary"];

test("all four channels have explicit slower multilingual neural narration profiles", () => {
  for (const slug of CHANNELS) {
    const channel = Channel.getChannel(slug);
    const voice = channel.config.voice || {};
    assert.equal(voice.provider, "edge-tts", slug);
    assert.match(voice.voice || "", /MultilingualNeural$/, slug);
    const rate = Number(String(voice.rate || "0").replace(/[%+]/g, ""));
    assert.ok(Number.isFinite(rate) && rate <= 2, `${slug}: rate ${voice.rate}`);
  }
});

test("a three-second Short hook gets at least three sub-second-to-1.1s visual beats", () => {
  const plan = Pacing.sahnePlani("They saw the warning. Then everything failed.", 0, 5, 3, "short");
  assert.equal(plan.rol, "hook");
  assert.deepEqual(plan.cekimAraligi, [0.75, 1.1]);
  assert.ok(plan.cekimSayisi >= 3, String(plan.cekimSayisi));
  assert.ok(plan.cekimler.every((seconds) => seconds <= 1.1), JSON.stringify(plan.cekimler));
});

test("shared Shorts renderer reads the active channel voice and permits 0.75s opening cuts", () => {
  const source = fs.readFileSync(path.join(ROOT, "shorts-yap.js"), "utf8");
  assert.match(source, /const CURRENT_CHANNEL = Channel\.getChannel\(\);/);
  assert.match(source, /const VOICE_PROFILE = CURRENT_CHANNEL\.config\.voice \|\| \{\};/);
  assert.match(source, /VOICE_PROFILE\.voice/);
  assert.match(source, /VOICE_PROFILE\.rate/);
  assert.match(source, /p\.rol === "hook" \? 0\.75 : 1\.2/);
  assert.match(source, /voice: \{ provider: VOICE_PROFILE\.provider/);
});

test("Viral Quality v2 explicitly favors broad audience and first-frame stop power", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config/viral-quality-v2.json"), "utf8"));
  assert.ok(config.viralScoring.weights.audience_breadth >= 1.5);
  assert.ok(config.viralScoring.weights.recognizability >= 1.4);
  assert.ok(config.viralScoring.weights.first_frame_potential >= 1.4);
  assert.ok(config.hooks.weights.SwipeStoppingPower >= 1.75);
  assert.ok(config.hooks.weights.FirstFrameCompatibility >= 1.3);
  assert.ok(config.firstSeconds.firstCutWithinSeconds <= 1.0);
});
