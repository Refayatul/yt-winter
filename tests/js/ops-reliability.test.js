"use strict";
// Reliability fixes for scheduled workflows: the BTO research wiring step and the watchdog's state push.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ops-rel-"));

test("BTO wiring keeps the native authority import, applies once, and leaves valid JavaScript", () => {
  const dir = tmp();
  const copy = path.join(dir, "bto-research.js");
  fs.copyFileSync(path.join(ROOT, "scripts", "bto-research.js"), copy);
  const run = () => spawnSync(process.execPath, [path.join(ROOT, "scripts", "bto-wire-discovery-v2.js"), copy], { encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const once = fs.readFileSync(copy, "utf8");
  assert.equal((once.match(/const AuthorityDiscovery = /g) || []).length, 1, "no duplicate import");
  assert.equal((once.match(/const ResearchFallback = /g) || []).length, 1);
  assert.match(once, /ResearchFallback\.relatedArticles/);
  assert.equal(spawnSync(process.execPath, ["--check", copy]).status, 0);
  assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(copy, "utf8"), once, "idempotent");
});

// --- push-state.sh against a local bare remote ---------------------------------------------------------
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (cwd, ...args) => { const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }); if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
const write = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };

function setup() {
  const base = tmp();
  const origin = path.join(base, "origin.git");
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  const seed = path.join(base, "seed");
  git(base, "clone", "-q", origin, seed);
  write(seed, "reports/daily-operations.md", "report v0\n");
  write(seed, "channels/ib/state/notification-state.json", "{\"a\":1}\n");
  write(seed, "notes.txt", "line\n");
  git(seed, "add", "."); git(seed, "commit", "-q", "-m", "seed"); git(seed, "push", "-q", "origin", "main");
  const clone = (name) => { const d = path.join(base, name); git(base, "clone", "-q", origin, d); return d; };
  return { origin, a: clone("a"), b: clone("b"), base };
}
const pushState = (cwd, extraEnv = {}) => spawnSync("bash", [path.join(ROOT, "scripts", "ops", "push-state.sh"), "main", "2"], { cwd, encoding: "utf8", env: { ...GIT_ENV, PUSH_STATE_SLEEP: "0", REGEN_CMD: "echo regenerated > reports/daily-operations.md", ...extraEnv } });

test("push-state: a concurrent change to the generated report no longer blocks the state push", () => {
  const { a, b, base } = setup();
  write(a, "reports/daily-operations.md", "report from CT job\n");
  git(a, "commit", "-q", "-am", "ct"); git(a, "push", "-q", "origin", "main");
  write(b, "reports/daily-operations.md", "report from IB job\n");
  write(b, "channels/ib/state/notification-state.json", "{\"a\":2}\n");
  git(b, "commit", "-q", "-am", "ib");
  const r = pushState(b);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const check = path.join(base, "check"); git(base, "clone", "-q", path.join(base, "origin.git"), check);
  assert.equal(fs.readFileSync(path.join(check, "channels/ib/state/notification-state.json"), "utf8"), "{\"a\":2}\n", "IB state kept");
  assert.equal(fs.readFileSync(path.join(check, "reports/daily-operations.md"), "utf8"), "regenerated\n", "report rebuilt after the merge");
});

test("push-state: a conflict outside generated files aborts cleanly instead of retrying mid-rebase", () => {
  const { a, b } = setup();
  write(a, "notes.txt", "from a\n"); git(a, "commit", "-q", "-am", "a"); git(a, "push", "-q", "origin", "main");
  write(b, "notes.txt", "from b\n"); git(b, "commit", "-q", "-am", "b");
  const r = pushState(b);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /conflict outside generated reports/);
  assert.equal(git(b, "status", "--porcelain"), "", "working tree left clean, no rebase in progress");
  assert.ok(!fs.existsSync(path.join(b, ".git", "rebase-merge")));
});

test("every watchdog state commit uses the push helper (no retry loop left that pulls mid-rebase)", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "production-watchdog.yml"), "utf8");
  assert.ok(!/git pull --rebase/.test(yml), "no raw pull --rebase loop remains");
  const commits = (yml.match(/git commit -m/g) || []).length;
  const helpers = (yml.match(/bash scripts\/ops\/push-state\.sh "\$GITHUB_REF_NAME" 5/g) || []).length;
  assert.ok(commits >= 6);
  assert.equal(helpers, commits, "each committing step pushes through the helper");
});

test("CriticalThread viral exception: off by default, preview refused in Actions, enabled needs an approver, cannot open B", () => {
  const Config = require(path.join(ROOT, "core", "growth", "config"));
  const Channel = require(path.join(ROOT, "core", "channel-context"));
  const ct = Channel.getChannel("critical-thread");
  Config.clearCache();
  assert.equal(Config.forChannel(ct).viralScoring.minimumToProduce, 75, "committed config keeps the portfolio minimum");
  const merged = () => ({ viralScoring: { minimumToProduce: 75 }, selection: { exploitBuckets: ["A"], exploreBuckets: ["A"] } });
  const ex = { minimumToProduce: 70, buckets: ["A"], enabled: false, approvedBy: null };
  assert.equal(Config.applyViralMinimumException(merged(), ex, ct, {}), null);
  assert.throws(() => Config.applyViralMinimumException(merged(), ex, ct, { GROWTH_VIRAL_EXCEPTION_PREVIEW: "critical-thread", GITHUB_ACTIONS: "true" }), /refused in GitHub Actions/);
  const m = merged(); Config.applyViralMinimumException(m, ex, ct, { GROWTH_VIRAL_EXCEPTION_PREVIEW: "critical-thread" });
  assert.equal(m.viralScoring.minimumToProduce, 70);
  assert.throws(() => Config.applyViralMinimumException(merged(), { ...ex, enabled: true }, ct, {}), /without approvedBy/);
  const withB = { viralScoring: { minimumToProduce: 75 }, selection: { exploitBuckets: ["A"], exploreBuckets: ["A", "B"] } };
  assert.throws(() => Config.applyViralMinimumException(withB, { ...ex, enabled: true, approvedBy: "owner" }, ct, {}), /must all be listed/);
  assert.throws(() => Config.applyViralMinimumException(merged(), { ...ex, minimumToProduce: 50, enabled: true, approvedBy: "owner" }, ct, {}), />= 65/);
  Config.clearCache();
});
