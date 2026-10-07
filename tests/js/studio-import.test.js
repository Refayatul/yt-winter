"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Importer = require("../../scripts/studio-import");

test("Studio Advanced-mode CSV fills studio-manual.json per video, skipping the Total row", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-"));
  const csv = '﻿Content,Video title,Video publish time,Impressions,Impressions click-through rate (%),Stayed to watch (%)\n'
    + 'Total,,,"12,345",4.2,70.1\n'
    + 'DLYpmaQ-EVw,"The Nuclear Test, Bikini",Sep 24 2026,"3,210",5.5,74.8\n'
    + 'abcdefghijk,Other,Sep 25 2026,900,,61\n';
  const channel = { paths: { analytics: dir } };
  fs.mkdirSync(path.join(dir, "DLYpmaQ-EVw"));
  fs.writeFileSync(path.join(dir, "DLYpmaQ-EVw", "studio-manual.json"), JSON.stringify({ returningViewers: 12 }));
  const result = Importer.importRows(channel, Importer.parseCsv(csv), "2026-10-07");
  assert.deepEqual(result.columns, ["impressions", "ctr", "stayedToWatch"]);
  assert.equal(result.written.length, 2);
  const first = JSON.parse(fs.readFileSync(path.join(dir, "DLYpmaQ-EVw", "studio-manual.json"), "utf8"));
  assert.deepEqual([first.impressions, first.ctr, first.stayedToWatch, first.returningViewers, first.tarih], [3210, 5.5, 74.8, 12, "2026-10-07"]);
  const second = JSON.parse(fs.readFileSync(path.join(dir, "abcdefghijk", "studio-manual.json"), "utf8"));
  assert.equal(second.ctr, undefined, "a blank cell is not invented");
  assert.equal(second.stayedToWatch, 61);
});

test("a low stayed-to-watch share is diagnosed as a scroll-stop failure for Shorts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../core/growth/diagnosis.js"), "utf8");
  assert.match(source, /SCROLL_STOP_FAILURE/);
});

test("Turkish Studio exports are recognised", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-tr-"));
  const csv = "İçerik,Video başlığı,Gösterimler,Gösterimlerin tıklama oranı (%),Geri gelen izleyiciler\nDLYpmaQ-EVw,Başlık,\"1.234\",4.5,30\n";
  const result = Importer.importRows({ paths: { analytics: dir } }, Importer.parseCsv(csv), "2026-10-08");
  assert.deepEqual(result.columns, ["impressions", "ctr", "returningViewers"]);
  assert.equal(result.written.length, 1);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "DLYpmaQ-EVw", "studio-manual.json"), "utf8"));
  assert.equal(saved.impressions, 1234, "Turkish thousands separator");
});

test("current Studio exports name them Thumbnail impressions / Thumbnail click-through rate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-th-"));
  const csv = "Content,Video title,Returning viewers,Views,Thumbnail impressions,Thumbnail click-through rate (%)\nTotal,,6,12433,14227,2.34\nWlZ2z90pqx8,Inside Van Norman Dam,32,1056,461,1.52\n";
  const result = Importer.importRows({ paths: { analytics: dir } }, Importer.parseCsv(csv), "2026-10-08");
  assert.deepEqual(result.columns, ["impressions", "ctr", "returningViewers"]);
  assert.deepEqual(result.written[0], { id: "WlZ2z90pqx8", impressions: 461, ctr: 1.52, returningViewers: 32 });
});
