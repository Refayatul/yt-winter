"use strict";
const test = require("node:test"); const assert = require("node:assert");
const C = require("../../core/profitdecoded/captions");
test("captions: phrases stay short and keep every word", () => {
  const t = "Costco did not make most of its profit in the aisles. Of $10.4 billion in operating income, about half came from one line.";
  const p = C.phrases(t, 5); assert.ok(p.every((x) => x.split(" ").length <= 8));
  assert.strictEqual(p.join(" "), t);
});
test("captions: cues stay inside the beat and are ordered", () => {
  const cues = C.build([{ text: "one two three four five six seven eight nine ten", start: 1, end: 6 }, { text: "no timing" }], { short: true });
  assert.ok(cues.length >= 2); assert.strictEqual(cues[0].start, 1); assert.ok(Math.abs(cues[cues.length - 1].end - 6) < 0.01);
  for (let i = 1; i < cues.length; i += 1) assert.ok(cues[i].start >= cues[i - 1].end - 0.002);
});
test("captions: SRT format", () => { assert.match(C.toSrt([{ start: 0.5, end: 2.25, text: "hi" }]), /1\n00:00:00,500 --> 00:00:02,250\nhi/); });
