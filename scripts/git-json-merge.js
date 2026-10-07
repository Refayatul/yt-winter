#!/usr/bin/env node
"use strict";

// Git merge driver for channel state JSON (see .gitattributes). Workflows that
// append to the same ledgers (published.json, blocked.json, notification
// state, growth records) used to fail their push with rebase conflicts and
// lose the state. This merges both sides instead:
//   • arrays: union, rows matched by a stable identity (videoId,
//     idempotencyKey, id, slug+date, or the whole row)
//   • objects: key-wise three-way merge
//   • scalars changed on both sides: the incoming side (%B) wins
// Unparseable JSON exits 1 so git reports a normal conflict.
//
// git config merge.json-union.driver "node scripts/git-json-merge.js %O %A %B"

const fs = require("fs");

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

function identity(row) {
  if (!isObject(row)) return JSON.stringify(row);
  for (const key of ["videoId", "idempotencyKey", "id", "topicId", "cycleId", "key"]) if (row[key] != null) return `${key}:${row[key]}`;
  if (row.slug != null) return `slug:${row.slug}|${row.tarih || row.at || row.date || row.generatedAt || ""}`;
  return JSON.stringify(row);
}

function mergeArrays(base, ours, theirs) {
  const removed = new Set((base || []).map(identity).filter((id) => !ours.some((row) => identity(row) === id) || !theirs.some((row) => identity(row) === id)));
  const out = [];
  const index = new Map();
  for (const row of [...ours, ...theirs]) {
    const id = identity(row);
    if (removed.has(id)) continue;
    if (index.has(id)) {
      const at = index.get(id);
      const baseRow = (base || []).find((item) => identity(item) === id);
      out[at] = merge(baseRow, out[at], row);
    } else {
      index.set(id, out.length);
      out.push(row);
    }
  }
  return out;
}

function merge(base, ours, theirs) {
  if (same(ours, theirs)) return ours;
  if (base !== undefined && same(base, ours)) return theirs;
  if (base !== undefined && same(base, theirs)) return ours;
  if (Array.isArray(ours) && Array.isArray(theirs)) return mergeArrays(Array.isArray(base) ? base : [], ours, theirs);
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : {};
    const out = {};
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const inOurs = key in ours;
      const inTheirs = key in theirs;
      if (inOurs && inTheirs) out[key] = merge(b[key], ours[key], theirs[key]);
      else if (inOurs) { if (!(key in b) || !same(b[key], ours[key])) out[key] = ours[key]; }
      else if (!(key in b) || !same(b[key], theirs[key])) out[key] = theirs[key];
    }
    return out;
  }
  return theirs;
}

function main([basePath, oursPath, theirsPath]) {
  let base, ours, theirs;
  try {
    ours = JSON.parse(fs.readFileSync(oursPath, "utf8"));
    theirs = JSON.parse(fs.readFileSync(theirsPath, "utf8"));
    const raw = fs.existsSync(basePath) ? fs.readFileSync(basePath, "utf8") : "";
    base = raw.trim() ? JSON.parse(raw) : undefined;
  } catch (error) {
    return 1;
  }
  fs.writeFileSync(oursPath, JSON.stringify(merge(base, ours, theirs), null, 2) + "\n");
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { merge, identity };
