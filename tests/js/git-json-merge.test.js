"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { merge } = require("../../scripts/git-json-merge");

test("state ledgers: concurrent appends are kept from both sides", () => {
  const base = [{ videoId: "A" }];
  assert.deepEqual(merge(base, [{ videoId: "A" }, { videoId: "B" }], [{ videoId: "A" }, { videoId: "C" }]), [{ videoId: "A" }, { videoId: "B" }, { videoId: "C" }]);
});

test("state ledgers: object keys merge three-way, deletions survive", () => {
  const base = { gonderilen: { old: 1, keep: 1 } };
  const ours = { gonderilen: { keep: 1, a: 2 } };
  const theirs = { gonderilen: { old: 1, keep: 1, b: 3 } };
  assert.deepEqual(merge(base, ours, theirs), { gonderilen: { keep: 1, a: 2, b: 3 } });
});

test("state ledgers: the same row edited on both sides is merged, incoming scalar wins", () => {
  const base = [{ videoId: "A", views: 1 }];
  const merged = merge(base, [{ videoId: "A", views: 5, title: "x" }], [{ videoId: "A", views: 7 }]);
  assert.deepEqual(merged, [{ videoId: "A", views: 7, title: "x" }]);
});
