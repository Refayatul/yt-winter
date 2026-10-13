"use strict";
// IB/CT Shorts opened by reading the topic's headline question aloud ("What If Ice Sank Instead of
// Floating?"), repeating the on-screen title and displacing a sourced first line.
const test = require("node:test");
const assert = require("node:assert/strict");
const Channel = require("../../core/channel-context");
const Growth = require("../../core/growth");
const Discovery = require("../../core/discovery");

test("restatement check: the headline read aloud is caught; a different factual line is not", () => {
  assert.ok(Growth.restates("What If Ice Sank Instead of Floating?", "What if ice sank instead of floating"));
  assert.ok(Growth.restates("What If the Dinosaur-Killing Asteroid Hit Today?", "What If the Dinosaur-Killing Asteroid Hit Today?"));
  assert.ok(!Growth.restates("Ice floats because freezing water expands about 9%.", "What If Ice Sank Instead of Floating?"));
});

test("IB plans: the spoken opening is never the topic headline or the selected title", () => {
  const ib = Channel.getChannel("impossible-brief");
  for (const slug of ["what-if-ice-sank-instead-of-floating", "what-if-the-dinosaur-killing-asteroid-hit-today"]) {
    const topic = Discovery.universe(ib).topics.find((t) => t.slug === slug);
    const plan = Growth.planShort(ib, topic.id, { write: false, skipDuplicate: true });
    const first = plan.script.claims[0].text;
    const title = plan.titles.selected && (plan.titles.selected.title || plan.titles.selected);
    assert.ok(!Growth.restates(first, topic.topic || topic.title) && !Growth.restates(first, title), `${slug}: "${first}"`);
    assert.ok(plan.script.retention.passes, "the production script lint still passes");
  }
});
