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

test("captions: a line spoken in under 1 s stays up 1 s, extending into the pause, never over the next cue", () => {
  const cues = captions([{ text: "It won't.", start: 10, end: 10.78 }, { text: "So Starbucks looks backward.", start: 11.2, end: 13 }, { text: "Go.", start: 13.1, end: 13.5 }, { text: "Next.", start: 13.8, end: 15 }]);
  assert.equal(cues[0].end, 11); assert.ok(cues[1].start >= cues[0].end);
  assert.ok(Math.abs(cues[2].end - 13.8) < 1e-9, "capped at the next cue's start");
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

const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");

test("render dependencies are declared with exact versions; fonts are OFL and match the pins", () => {
  const dev = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies || {};
  for (const k of ["playwright-core", "@fontsource/source-serif-4", "@fontsource/inter", "@fontsource/barlow-semi-condensed"]) assert.match(dev[k] || "", /^\d+\.\d+\.\d+$/, `${k} must be pinned exactly`);
  const Fonts = require(path.join(ROOT, "scripts/profitdecoded/motion/fonts.js"));
  for (const f of Fonts.manifest()) { assert.equal(f.license, "OFL-1.1", f.package); assert.equal(f.version, dev[f.package], `${f.package} installed version differs from the pin`); }
  assert.ok(Fonts.css().includes("@font-face") && Fonts.css().includes("data:font/woff2;base64,"));
});

test("brand library uses only the embedded open-licence fonts (no system font names)", () => {
  const lib = fs.readFileSync(path.join(ROOT, "scripts/profitdecoded/motion/brand-lib.js"), "utf8");
  assert.doesNotMatch(lib, /Georgia|Avenir|DIN Alternate|Helvetica|Times New Roman|Arial/);
  assert.match(lib, /'PD Serif'/); assert.match(lib, /'PD Sans'/); assert.match(lib, /'PD Num'/);
});

test("licence register: every asset is cleared for commercial use and every font package is listed", () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "channels/profitdecoded/prototypes/gift-cards-first-minute/licenses.json"), "utf8"));
  for (const a of reg.assets) { assert.equal(a.commercialUse, true, a.id); assert.ok(a.license && a.evidence, a.id); }
  const Fonts = require(path.join(ROOT, "scripts/profitdecoded/motion/fonts.js"));
  for (const pkg of new Set(Fonts.FACES.map((f) => f[1]))) assert.ok(reg.assets.some((a) => a.kind === "font" && a.source.includes(pkg)), pkg);
  assert.ok(reg.notUsed.some((x) => /macOS system fonts/.test(x)));
  const shots = JSON.parse(fs.readFileSync(path.join(ROOT, "channels/profitdecoded/prototypes/gift-cards-first-minute/evidence/shots.json"), "utf8"));
  for (const s of shots) assert.match(s.license, /^owned/, s.id);
});

test("qa-media parses SRT cues", () => {
  const { parseSrt } = require(path.join(ROOT, "scripts/profitdecoded/motion/qa-media.js"));
  const c = parseSrt("1\n00:00:01,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nA\nB\n");
  assert.equal(c.length, 2); assert.equal(c[0].start, 1); assert.equal(c[0].end, 2.5); assert.deepEqual(c[1].lines, ["A", "B"]);
});
