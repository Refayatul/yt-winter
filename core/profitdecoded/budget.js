"use strict";
// Persistent, fail-closed budget for PAID API calls (Anthropic). Free providers (Groq, Gemini free tier) never touch it.
//
// Every paid call is RESERVED at its maximum possible cost before the request is sent, then SETTLED with the
// provider's reported usage. The ledger is one JSON document stored with compare-and-swap semantics:
//   * GitHubStore: the GitHub Contents API on a dedicated branch (the PUT carries the blob sha it read; a concurrent
//     writer makes it fail with 409/422 and the reservation is re-checked against the newer document). Survives
//     GitHub Actions runs and is safe across concurrent workflows.
//   * FileStore: a local file with an exclusive lock file (tests and local dry runs). Refused inside GitHub Actions,
//     where a runner-local file would not persist between runs.
// Fail-closed rules: no policy, no store, an unreadable or missing ledger, a write that cannot be confirmed, a
// stale in-flight reservation, or an identical request that was already paid for: the paid call does not happen.
// Interrupted calls: a reservation that never settled stays charged at its estimate ("uncertain") until a human
// reconciles it against the provider console (budget reconcile). Application limits do not cap provider billing:
// the Anthropic Console spend limit is the backstop (see docs/profitdecoded/PRODUCTION-READINESS.md).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CHANNEL_DIR, readJson } = require("./config");

class BudgetError extends Error {
  constructor(code, message) { super(message); this.name = "BudgetError"; this.code = code; }
}

const POLICY_FILE = path.join(CHANNEL_DIR, "budget-policy.json");
const POOLS = ["script", "experiment"];
const CATEGORIES = ["research", "script", "review", "voiceover", "visuals", "render", "storage"];

// Policy: committed to the repository, so enabling paid calls is a reviewed change. Missing or malformed = no paid calls.
function loadPolicy(file = POLICY_FILE) {
  const p = readJson(file, null);
  if (!p) throw new BudgetError("NO_POLICY", `budget policy not found (${path.basename(file)}): paid calls are disabled`);
  const num = (k) => { const v = p[k]; if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new BudgetError("BAD_POLICY", `budget policy field ${k} must be a non-negative number`); return v; };
  for (const k of ["targetPerScriptUsd", "maxPerScriptUsd", "reservationTtlMinutes", "maxAutoRewrites"]) num(k);
  for (const pool of POOLS) if (!p.monthlyUsd || typeof p.monthlyUsd[pool] !== "number" || p.monthlyUsd[pool] < 0) throw new BudgetError("BAD_POLICY", `budget policy monthlyUsd.${pool} must be a non-negative number`);
  return { ...p, paidEnabled: p.paidEnabled === true };
}

const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const round = (x) => Math.round(x * 1e6) / 1e6;
const emptyLedger = () => ({ version: 1, entries: [] });
const COUNTED = new Set(["reserved", "settled", "uncertain"]);

// A reserved entry older than the TTL is an interrupted run: it is charged at its estimate (uncertain) until reconciled.
function effectiveStatus(e, policy, now) {
  if (e.status === "reserved" && now - Date.parse(e.createdAt) > policy.reservationTtlMinutes * 60000) return "uncertain";
  return e.status;
}
const chargeOf = (e, st) => (st === "settled" ? e.actualUsd : COUNTED.has(st) ? e.estimateUsd : 0);

function totals(doc, policy, now, filter = {}) {
  const out = { settledUsd: 0, reservedUsd: 0, uncertainUsd: 0, committedUsd: 0, calls: 0 };
  for (const e of doc.entries || []) {
    if (e.type && e.type !== "spend") continue;
    if (filter.month && e.month !== filter.month) continue;
    if (filter.pool && e.pool !== filter.pool) continue;
    if (filter.scriptId && e.scriptId !== filter.scriptId) continue;
    const st = effectiveStatus(e, policy, now); const c = chargeOf(e, st);
    if (st === "settled") out.settledUsd += c; else if (st === "reserved") out.reservedUsd += c; else if (st === "uncertain") out.uncertainUsd += c;
    if (COUNTED.has(st)) out.calls += 1;
  }
  for (const k of ["settledUsd", "reservedUsd", "uncertainUsd"]) out[k] = round(out[k]);
  out.committedUsd = round(out.settledUsd + out.reservedUsd + out.uncertainUsd);
  return out;
}

// Pure decision: may this reservation be added to this ledger document?
function decide(doc, req, policy, now, opts = {}) {
  if (!policy.paidEnabled) return { ok: false, code: "PAID_DISABLED", reason: "paid calls are disabled in the budget policy (paidEnabled=false)" };
  if (!POOLS.includes(req.pool)) return { ok: false, code: "BAD_REQUEST", reason: `unknown budget pool "${req.pool}"` };
  if (!CATEGORIES.includes(req.category)) return { ok: false, code: "BAD_REQUEST", reason: `unknown cost category "${req.category}"` };
  if (!req.scriptId || !req.id) return { ok: false, code: "BAD_REQUEST", reason: "a reservation needs an idempotency id and a scriptId" };
  if (!(req.estimateUsd > 0) || !Number.isFinite(req.estimateUsd)) return { ok: false, code: "BAD_REQUEST", reason: "the maximum cost estimate must be a positive number" };
  const prior = (doc.entries || []).find((e) => e.id === req.id && (!e.type || e.type === "spend"));
  if (prior) {
    const st = effectiveStatus(prior, policy, now);
    if (st === "reserved") return { ok: false, code: "IN_FLIGHT", reason: `an identical request is already in flight (entry ${req.id}, run ${prior.runId || "?"})` };
    if ((st === "settled" || st === "uncertain") && opts.allowRepeat !== req.id) return { ok: false, code: "DUPLICATE", reason: `this exact request was already ${st === "settled" ? "paid for" : "sent (outcome uncertain)"} (entry ${req.id}); its output belongs in the stage cache. Paying again needs PD_BUDGET_ALLOW_REPEAT=${req.id}` };
  }
  const cap = Math.min(policy.maxPerScriptUsd, req.scriptCapUsd != null ? req.scriptCapUsd : Infinity);
  const perScript = totals(doc, policy, now, { scriptId: req.scriptId });
  if (perScript.committedUsd + req.estimateUsd > cap + 1e-9) return { ok: false, code: "BUDGET", reason: `script ${req.scriptId}: $${perScript.committedUsd.toFixed(4)} committed + $${req.estimateUsd.toFixed(4)} maximum for this call exceeds the per-script limit $${cap.toFixed(2)}` };
  const month = totals(doc, policy, now, { month: req.month, pool: req.pool });
  const monthly = policy.monthlyUsd[req.pool];
  if (month.committedUsd + req.estimateUsd > monthly + 1e-9) return { ok: false, code: "BUDGET", reason: `${req.pool} budget ${req.month}: $${month.committedUsd.toFixed(4)} committed + $${req.estimateUsd.toFixed(4)} maximum exceeds the monthly limit $${monthly.toFixed(2)}` };
  return { ok: true };
}

// ---- Stores (compare-and-swap) ------------------------------------------------------------------------------------
class FileStore {
  constructor(file, options = {}) { this.file = file; this.create = !!options.create; this.lock = file + ".lock"; this.kind = "file"; }
  async read() {
    let text;
    try { text = fs.readFileSync(this.file, "utf8"); } catch (e) {
      if (e.code === "ENOENT" && this.create) return { doc: emptyLedger(), version: null };
      throw new BudgetError("STATE_MISSING", `budget ledger ${this.file} is missing: refusing paid calls`);
    }
    try { return { doc: JSON.parse(text), version: crypto.createHash("sha256").update(text).digest("hex") }; } catch (e) { throw new BudgetError("STATE_CORRUPT", `budget ledger ${this.file} is not valid JSON`); }
  }
  async write(doc, version) {
    let fd;
    try { fd = fs.openSync(this.lock, "wx"); } catch (e) { throw new BudgetError("CONFLICT", "budget ledger is locked by another writer"); }
    try {
      let cur = null; try { cur = crypto.createHash("sha256").update(fs.readFileSync(this.file, "utf8")).digest("hex"); } catch (e) { cur = null; }
      if (cur !== version) throw new BudgetError("CONFLICT", "budget ledger changed since it was read");
      const tmp = this.file + ".tmp-" + process.pid;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 1) + "\n"); fs.renameSync(tmp, this.file);
    } finally { fs.closeSync(fd); try { fs.unlinkSync(this.lock); } catch (e) { /* already gone */ } }
  }
}

// GitHub Contents API on a dedicated branch. token: GITHUB_TOKEN (contents: write) or a PAT; never logged.
class GitHubStore {
  constructor({ repo, branch, file, token, fetchImpl }) {
    if (!repo || !branch || !file) throw new BudgetError("NO_STORE", "GitHub budget store needs repo, branch and file");
    if (!token) throw new BudgetError("NO_STORE", "GitHub budget store needs a token (GITHUB_TOKEN with contents: write): refusing paid calls");
    Object.assign(this, { repo, branch, file, token, fetch: fetchImpl || fetch, kind: "github" });
  }
  headers() { return { authorization: `Bearer ${this.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" }; }
  url(p) { return `https://api.github.com/repos/${this.repo}/${p}`; }
  async read() {
    let res;
    try { res = await this.fetch(this.url(`contents/${this.file}?ref=${encodeURIComponent(this.branch)}`), { headers: this.headers() }); } catch (e) { throw new BudgetError("STATE_UNREACHABLE", `budget ledger unreachable: ${e.message}`); }
    if (res.status === 404) throw new BudgetError("STATE_MISSING", `budget ledger ${this.branch}:${this.file} not found (run: node profitdecoded.js budget init): refusing paid calls`);
    if (!res.ok) throw new BudgetError("STATE_UNREACHABLE", `budget ledger read failed: HTTP ${res.status}`);
    const j = await res.json();
    try { return { doc: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")), version: j.sha }; } catch (e) { throw new BudgetError("STATE_CORRUPT", "budget ledger is not valid JSON"); }
  }
  async write(doc, version) {
    let res;
    const body = { message: "chore(profitdecoded): budget ledger update", content: Buffer.from(JSON.stringify(doc, null, 1) + "\n").toString("base64"), branch: this.branch, ...(version ? { sha: version } : {}) };
    try { res = await this.fetch(this.url(`contents/${this.file}`), { method: "PUT", headers: this.headers(), body: JSON.stringify(body) }); } catch (e) { throw new BudgetError("STATE_UNCONFIRMED", `budget ledger write not confirmed: ${e.message}`); }
    if (res.status === 409 || res.status === 422) throw new BudgetError("CONFLICT", "budget ledger changed since it was read");
    if (!res.ok) throw new BudgetError("STATE_UNCONFIRMED", `budget ledger write failed: HTTP ${res.status}`);
  }
  // One-time setup: an orphan branch holding only the ledger file (no copy of the repository, no CI on it).
  async init() {
    const H = this.headers(); const f = this.fetch;
    const ref = await f(this.url(`git/ref/heads/${encodeURIComponent(this.branch)}`), { headers: H });
    if (ref.ok) return { created: false };
    const tree = await (await f(this.url("git/trees"), { method: "POST", headers: H, body: JSON.stringify({ tree: [{ path: this.file, mode: "100644", type: "blob", content: JSON.stringify(emptyLedger(), null, 1) + "\n" }] }) })).json();
    const commit = await (await f(this.url("git/commits"), { method: "POST", headers: H, body: JSON.stringify({ message: "chore(profitdecoded): initialise the paid-API budget ledger", tree: tree.sha, parents: [] }) })).json();
    const made = await f(this.url("git/refs"), { method: "POST", headers: H, body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: commit.sha }) });
    if (!made.ok) throw new BudgetError("STATE_UNCONFIRMED", `could not create the ledger branch: HTTP ${made.status}`);
    return { created: true };
  }
}

// Store from the policy + environment. Inside GitHub Actions only the GitHub store is accepted.
function storeFromEnv(policy, env = process.env, fetchImpl) {
  const want = env.PD_BUDGET_STORE || (policy.ledger && policy.ledger.store) || "github";
  if (want === "file") {
    if (env.GITHUB_ACTIONS === "true") throw new BudgetError("NO_STORE", "a runner-local budget file cannot enforce a monthly budget in GitHub Actions: use the GitHub ledger");
    return new FileStore(env.PD_BUDGET_FILE || path.join(CHANNEL_DIR, "state", "budget-ledger.local.json"), { create: env.PD_BUDGET_FILE_CREATE === "1" });
  }
  const L = policy.ledger || {};
  return new GitHubStore({ repo: env.PD_BUDGET_REPO || L.repo || env.GITHUB_REPOSITORY, branch: env.PD_BUDGET_BRANCH || L.branch, file: L.file || "ledger.json", token: env.PD_BUDGET_TOKEN || env.GITHUB_TOKEN, fetchImpl });
}

// ---- The guard used by the paid call path ---------------------------------------------------------------------------
class Budget {
  constructor({ store, policy, context = {}, now = Date.now, maxConflicts = 6 }) {
    if (!store) throw new BudgetError("NO_STORE", "no budget store: refusing paid calls");
    if (!policy) throw new BudgetError("NO_POLICY", "no budget policy: refusing paid calls");
    Object.assign(this, { store, policy, context, now, maxConflicts });
  }
  // CAS loop: re-read on conflict so a concurrent reservation is always counted before ours is accepted.
  async mutate(fn) {
    for (let i = 0; i < this.maxConflicts; i += 1) {
      const { doc, version } = await this.store.read();
      if (!doc || !Array.isArray(doc.entries)) throw new BudgetError("STATE_CORRUPT", "budget ledger has no entries array");
      const result = fn(doc);
      try { await this.store.write(doc, version); return result; } catch (e) { if (e.code === "CONFLICT") continue; throw e; }
    }
    throw new BudgetError("STATE_CONTENDED", "budget ledger kept changing during the reservation: refusing the paid call");
  }
  idFor(parts) { return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24); }
  async reserve(req) {
    const now = this.now(); const c = this.context;
    const full = { type: "spend", month: monthKey(now), pool: c.pool || "script", category: req.category || "script", topicId: c.topicId || null, scriptId: c.scriptId || null, videoId: c.videoId || null, runId: c.runId || null, scriptCapUsd: c.scriptCapUsd, ...req };
    const entry = await this.mutate((doc) => {
      const d = decide(doc, full, this.policy, now, { allowRepeat: c.allowRepeat });
      if (!d.ok) throw new BudgetError(d.code, d.reason);
      // an earlier entry with the same id (released, or an explicitly allowed repeat) keeps its history under a new id
      (doc.entries || []).forEach((x, i) => { if (x.id === full.id) x.id = `${x.id}#superseded-${i}`; });
      const e ={ ...full, status: "reserved", estimateUsd: round(full.estimateUsd), actualUsd: null, createdAt: new Date(now).toISOString() };
      doc.entries.push(e); return e;
    });
    return entry;
  }
  async settle(id, actualUsd, usage) {
    return this.mutate((doc) => { const e = doc.entries.find((x) => x.id === id); if (!e) throw new BudgetError("STATE_CORRUPT", `reservation ${id} vanished from the ledger`); Object.assign(e, { status: "settled", actualUsd: round(actualUsd), usage: usage || null, settledAt: new Date(this.now()).toISOString() }); return e; });
  }
  // The provider definitely did not bill (request rejected before processing): the reservation is returned.
  async release(id, why) { return this.mutate((doc) => { const e = doc.entries.find((x) => x.id === id); if (e) Object.assign(e, { status: "released", note: why, settledAt: new Date(this.now()).toISOString() }); return e; }); }
  // Outcome unknown (timeout, dropped stream, 5xx after sending): stays charged at the estimate until reconciled.
  async markUncertain(id, why) { return this.mutate((doc) => { const e = doc.entries.find((x) => x.id === id); if (e) Object.assign(e, { status: "uncertain", note: why }); return e; }); }
  async recordOutcome(outcome) {
    const c = this.context; const now = this.now();
    return this.mutate((doc) => { doc.entries.push({ type: "outcome", id: this.idFor(["outcome", c.scriptId, outcome.status, now]), month: monthKey(now), topicId: c.topicId || null, scriptId: c.scriptId || null, videoId: c.videoId || null, runId: c.runId || null, ...outcome, at: new Date(now).toISOString() }); return true; });
  }
  async status(month) { const { doc } = await this.store.read(); const now = this.now(); const m = month || monthKey(now); return { month: m, script: totals(doc, this.policy, now, { month: m, pool: "script" }), experiment: totals(doc, this.policy, now, { month: m, pool: "experiment" }), limits: this.policy.monthlyUsd, perScriptLimitUsd: this.policy.maxPerScriptUsd, targetPerScriptUsd: this.policy.targetPerScriptUsd, paidEnabled: this.policy.paidEnabled }; }
}

// Human reconciliation of an uncertain (or settled) entry against the provider console.
function reconcile(doc, id, actualUsd, by, reason, now = Date.now()) {
  const e = (doc.entries || []).find((x) => x.id === id);
  if (!e) throw new BudgetError("NOT_FOUND", `no ledger entry ${id}`);
  if (!by || !reason) throw new BudgetError("BAD_REQUEST", "reconciliation needs who reconciled it and why");
  Object.assign(e, { status: "settled", actualUsd: round(actualUsd), reconciledBy: by, reconcileReason: reason, settledAt: new Date(now).toISOString() });
  return e;
}

// Cost accounting from the ledger: per attempt, per accepted script, per completed and published video.
function costReport(doc, policy, now = Date.now(), filter = {}) {
  const spend = (doc.entries || []).filter((e) => (!e.type || e.type === "spend") && (!filter.month || e.month === filter.month));
  const outcomes = (doc.entries || []).filter((e) => e.type === "outcome" && (!filter.month || e.month === filter.month));
  const byCategory = {}; const byScript = {};
  for (const e of spend) {
    const st = effectiveStatus(e, policy, now); const c = chargeOf(e, st); const kind = st === "settled" ? "actualUsd" : "estimatedUsd";
    const cat = byCategory[e.category] = byCategory[e.category] || { actualUsd: 0, estimatedUsd: 0 }; cat[kind] = round(cat[kind] + c);
    const s = byScript[e.scriptId] = byScript[e.scriptId] || { topicId: e.topicId, videoId: e.videoId, actualUsd: 0, estimatedUsd: 0, calls: 0 }; s[kind] = round(s[kind] + c); s.calls += 1;
  }
  const attempts = new Set(outcomes.map((o) => o.runId || o.id)).size;
  const accepted = outcomes.filter((o) => o.status === "accepted").length;
  const completed = outcomes.filter((o) => o.status === "video-completed").length;
  const published = outcomes.filter((o) => o.status === "published").length;
  const total = Object.values(byCategory).reduce((a, c) => ({ actualUsd: round(a.actualUsd + c.actualUsd), estimatedUsd: round(a.estimatedUsd + c.estimatedUsd) }), { actualUsd: 0, estimatedUsd: 0 });
  const per = (n) => (n ? round((total.actualUsd + total.estimatedUsd) / n) : null);
  return { month: filter.month || "all", total, byCategory, byScript, counts: { attempts, accepted, completed, published }, perAttemptUsd: per(attempts), perAcceptedScriptUsd: per(accepted), perCompletedVideoUsd: per(completed), perPublishedVideoUsd: per(published), note: "actualUsd = settled provider usage at list price; estimatedUsd = reservations still open or uncertain, charged at their maximum. Free providers and local rendering are not in this ledger (their usage is in each run's usage.json)." };
}

module.exports = { Budget, BudgetError, FileStore, GitHubStore, storeFromEnv, loadPolicy, decide, totals, reconcile, costReport, monthKey, emptyLedger, effectiveStatus, POLICY_FILE, POOLS, CATEGORIES };
