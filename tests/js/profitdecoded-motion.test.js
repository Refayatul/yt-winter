"use strict";
// Motion renderer captions (no browser, no ffmpeg): cue shape and timing come only from measured sentence timings.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { captions, toSrt } = require(path.join(__dirname, "..", "..", "scripts/profitdecoded/motion/render-motion.js"));

const timeline = [
  { text: "Somewhere in a drawer, a wallet or a coat pocket, there's a gift card with money still on it.", start: 0.35, end: 6.35 },
  { text: "Maybe it's yours.", start: 6.6, end: 7.91 },
  { text: "That's an estimate from the survey, not a count, and Bankrate doesn't publish how it calculated it, which means it tells you the scale, not the exact amount.", start: 31.06, end: 40.84 },
];

test("captions: at most two lines of 42 characters, no orphaned short cue, every word kept in order", () => {
  const cues = captions(timeline);
  for (const c of cues) {
    assert.ok(c.lines.length >= 1 && c.lines.length <= 2, JSON.stringify(c.lines));
    for (const l of c.lines) assert.ok(l.length <= 42, l);
    assert.ok(c.end - c.start >= 1, `cue shorter than 1 s: ${c.lines.join(" ")}`);
    assert.ok((c.lines.join(" ").length) / (c.end - c.start) <= 20, "reading speed above 20 characters per second");
  }
  assert.equal(cues.map((c) => c.lines.join(" ")).join(" "), timeline.map((s) => s.text).join(" "));
});

test("captions: cues stay inside their measured sentence and are contiguous within it", () => {
  const cues = captions(timeline); let i = 0;
  for (const s of timeline) {
    let t = s.start; const mine = [];
    while (i < cues.length && cues[i].start < s.end - 1e-6) mine.push(cues[i++]);
    assert.ok(mine.length > 0);
    for (const c of mine) { assert.ok(Math.abs(c.start - t) < 1e-6); t = c.end; }
    assert.ok(Math.abs(t - s.end) < 1e-6);
  }
});

test("srt: numbered cues with hh:mm:ss,mmm timestamps", () => {
  const srt = toSrt(captions(timeline.slice(0, 2)));
  assert.match(srt, /^1\n00:00:00,350 --> 00:00:0\d,\d{3}\n/);
  assert.match(srt, /\n00:00:06,600 --> 00:00:07,910\nMaybe it's yours\.\n/);
});
