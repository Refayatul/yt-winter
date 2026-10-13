"use strict";

// Reproducible installs. Until 2026-10-13 package-lock.json was gitignored and every workflow ran
// `npm install`, so each run resolved the newest matching versions. That is how an unreviewed
// msedge-tts release silently changed the narration endpoint between two production runs
// (docs/ops/INCIDENT-2026-10-12-EDGE-TTS.md). Every install now reproduces the committed lockfile.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const manifest = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const EXACT = /^\d+\.\d+\.\d+$/;

test("package-lock.json is tracked, not ignored", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "package-lock.json")));
  assert.doesNotMatch(read(".gitignore"), /^package-lock\.json$/m);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.name, manifest.name);
});

test("every direct dependency is pinned to an exact version", () => {
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(manifest[group] || {})) assert.match(range, EXACT, `${group}.${name} = ${range}`);
  }
});

test("the lockfile matches package.json exactly", () => {
  const root = lock.packages[""];
  assert.deepEqual(root.dependencies || {}, manifest.dependencies || {});
  assert.deepEqual(root.devDependencies || {}, manifest.devDependencies || {});
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(manifest[group] || {})) {
      const entry = lock.packages[`node_modules/${name}`];
      assert.ok(entry, `${name} is locked`);
      assert.equal(entry.version, version, `${name} locked at its pin`);
    }
  }
});

test("the working Edge read-aloud client stays at 2.1.0 in the manifest and the lockfile", () => {
  assert.equal(manifest.dependencies["msedge-tts"], "2.1.0");
  assert.equal(lock.packages["node_modules/msedge-tts"].version, "2.1.0");
});

test("every locked package comes from the npm registry with an integrity hash", () => {
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key) continue;
    assert.match(entry.resolved || "", /^https:\/\/registry\.npmjs\.org\//, `${key} resolved from the npm registry`);
    assert.match(entry.integrity || "", /^sha(256|384|512)-/, `${key} has an integrity hash`);
  }
});

test("workflows install with npm ci, never npm install", () => {
  const dir = path.join(ROOT, ".github", "workflows");
  let installs = 0;
  for (const file of fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n").filter((line) => !/^\s*#/.test(line));
    for (const line of lines) {
      assert.doesNotMatch(line, /\bnpm (install|i)\b/, `${file}: ${line.trim()}`);
      if (/\bnpm ci\b/.test(line)) installs += 1;
    }
  }
  assert.ok(installs >= 20, `npm ci is used by the workflows (${installs})`);
});
