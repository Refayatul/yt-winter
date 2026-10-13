"use strict";
// CriticalThread skipped every slot from 2026-10-07: its unused A topics scored 68-73 viral (minimum 75)
// and the two topics at 75+ were bucket B (selection is A-only by the portfolio overlay). The daily
// decision log recorded reason null, so the cause was invisible. These tests pin the diagnosis.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Channel = require("../../core/channel-context");
const Growth = require("../../core/growth");
const Config = require("../../core/growth/config");

const row = (id, bucket, viral) => ({
  topic: { id, slug: id.toLowerCase(), title: id, cluster: "WATER" },
  score: { bucket, ViralPotentialScore: viral, VideoPotentialScore: 80, SelectionScore: viral, reasons: [] },
});
// CT on 2026-10-12: A topics just under the minimum, B topics at or above it.
const ranked = { rows: [row("CT-234", "A", 72), row("CT-160", "A", 73), row("CT-437", "B", 76), row("CT-265", "B", 75)], context: { clusterPerformance: {} } };

test("CT selection: nothing is chosen below the 75 minimum or outside bucket A, and the decision log says why", () => {
  const ct = Channel.getChannel("critical-thread");
  assert.equal(Config.forChannel(ct).viralScoring.minimumToProduce, 75, "the threshold is not lowered");
  for (const date of ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]) { // both EXPLOIT and EXPLORE days
    const result = Growth.selectShortTopic(ct, { ranked, date, write: false });
    assert.equal(result.selected, null);
    assert.ok(result.decision.reason, `${date}: the logged decision carries a reason (was null)`);
    assert.equal(result.decision.reason, result.reason, "the log and the caller see the same reason");
    if (result.mode === "EXPLOIT") assert.match(result.decision.reason, /best viral score 73 < minimum 75; 2 topic\(s\) at the minimum are bucket B, not selectable/);
  }
});

test("CT selection: an A topic at the minimum is chosen, with its reason logged", () => {
  const ct = Channel.getChannel("critical-thread");
  const qualified = { ...ranked, rows: [...ranked.rows, row("CT-999", "A", 75)] };
  const result = Growth.selectShortTopic(ct, { ranked: qualified, date: "2026-10-12", write: false });
  assert.equal(result.selected.topic.id, "CT-999");
  assert.ok(result.decision.reason && result.decision.selected.topicId === "CT-999");
});

test("selection buckets: the portfolio overlay keeps every active channel A-only, and no channel config claims otherwise", () => {
  for (const slug of Channel.activeSlugs()) {
    const channel = Channel.getChannel(slug);
    const selection = Config.forChannel(channel).selection;
    assert.deepEqual([selection.exploitBuckets, selection.exploreBuckets], [["A"], ["A"]], slug);
    const override = path.join(Channel.ROOT, "channels", slug, "growth-engine.json");
    const raw = fs.existsSync(override) ? JSON.parse(fs.readFileSync(override, "utf8")) : {};
    assert.ok(!(raw.selection && (raw.selection.exploitBuckets || raw.selection.exploreBuckets)),
      `${slug}: a bucket override in growth-engine.json is silently replaced by config/viral-quality-v2.json; remove it`);
  }
});

test("footage signal: confirmed licensed pictures count as archival stills; guesses and invalid entries do not", () => {
  const Model = require("../../core/growth/topic-model");
  const Discovery = require("../../core/discovery");
  const ct = Channel.getChannel("critical-thread");
  const pic = (n, host = "upload.wikimedia.org") => ({ file: `p${n}.jpg`, imageUrl: `https://${host}/wikipedia/commons/a/a${n}/p${n}.jpg`, sourceUrl: `https://commons.wikimedia.org/wiki/File:p${n}.jpg`, licence: "CC BY-SA 4.0" });
  const raw = Discovery.universe(ct).topics.find((t) => t.id === "CT-160");
  assert.equal(Model.normalize(ct, raw).archival, false, "no curated pictures: unconfirmed");
  assert.equal(Model.normalize(ct, { ...raw, curatedVisuals: [pic(1), pic(2)] }).archival, false, "two are not enough for a Short");
  assert.equal(Model.normalize(ct, { ...raw, curatedVisuals: [pic(1), pic(2), pic(3, "example.com")] }).archival, false, "only licensed Commons files count");
  assert.equal(Model.normalize(ct, { ...raw, curatedVisuals: [pic(1), pic(2), pic(3)] }).archival, true);
  assert.equal(Config.forChannel(ct).viralScoring.minimumToProduce, 75, "the threshold itself is unchanged");
});
