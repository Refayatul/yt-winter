"use strict";
// Narrow editorial exceptions: a human may accept ONE heuristic (non-factual) finding for ONE exact script version.
// The global thresholds never change. An exception is valid only when all of these hold:
//   * the finding is a retention heuristic (WAIVABLE); factual, attribution, source, arithmetic, editorial-rule,
//     copyright and security findings are never waivable
//   * topicId and format match, and the script's beats hash to the recorded scriptHash (any edit invalidates it)
//   * the blocking message is exactly the recorded findingText (a changed reading needs a new approval)
//   * approvedBy names a person (not an automated identity), with a reason and a date
// Exceptions live in channels/profitdecoded/editorial-exceptions.json, so each one is a reviewed, committed change.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CHANNEL_DIR, readJson } = require("./config");

const FILE = path.join(CHANNEL_DIR, "editorial-exceptions.json");
const WAIVABLE = new Set(["weak-opening", "dead-stretch", "thin-section", "mechanical-loops", "predictable-ending", "essay-ending", "no-escalation", "unpaid-question"].map((t) => "retention:" + t));
const AUTOMATED = /\b(claude|anthropic|gpt|gemini|groq|bot|automation|automated|ai|assistant|github-actions)\b/i;

// "retention: weak-opening: ..." or "retention (s9): dead-stretch: ..." -> "retention:weak-opening"; anything else -> null
function findingKey(message) { const m = /^retention(?: \([^)]*\))?: ([a-z-]+):/.exec(String(message || "")); return m ? "retention:" + m[1] : null; }
const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
function scriptHash(beats) { return crypto.createHash("sha256").update(JSON.stringify((beats || []).map((b) => [b.id, norm(b.text), b.claimId || null]))).digest("hex"); }

function validate(x) {
  const problems = [];
  if (!WAIVABLE.has(x.finding)) problems.push(`finding "${x.finding}" is not waivable (only retention heuristics are)`);
  if (!x.approvedBy || !String(x.approvedBy).trim()) problems.push("no approver");
  else if (AUTOMATED.test(x.approvedBy)) problems.push(`approver "${x.approvedBy}" looks automated: a person must approve`);
  if (!x.reason || String(x.reason).trim().length < 20) problems.push("reason missing or too short (20+ characters)");
  if (!x.approvedAt || Number.isNaN(Date.parse(x.approvedAt))) problems.push("approvedAt is not a date");
  if (!x.topicId || !x.format || !x.scriptHash || !x.findingText) problems.push("topicId, format, scriptHash and findingText are required");
  return problems;
}

// Returns the blocking list with valid exceptions removed, plus an audit trail of what was waived and what was not.
function apply(blocking, ctx, exceptions = load()) {
  const hash = scriptHash(ctx.beats); const remaining = []; const waived = []; const rejected = [];
  const candidates = (exceptions || []).filter((x) => x.topicId === ctx.topicId && x.format === ctx.format);
  for (const b of blocking || []) {
    const key = findingKey(b);
    const match = key && candidates.find((x) => x.finding === key);
    if (!match) { remaining.push(b); continue; }
    const why = validate(match);
    if (match.scriptHash !== hash) why.push("the script changed since approval (scriptHash differs)");
    if (norm(match.findingText) !== norm(b)) why.push("the finding changed since approval");
    if (match.expiresAt && Date.parse(match.expiresAt) < (ctx.now || Date.now())) why.push("the exception expired");
    if (why.length) { remaining.push(b); rejected.push({ id: match.id, finding: key, why }); }
    else waived.push({ id: match.id, finding: key, findingText: b, approvedBy: match.approvedBy, approvedAt: match.approvedAt, reason: match.reason });
  }
  return { blocking: remaining, waived, rejected, scriptHash: hash };
}

function load(file = FILE) { const j = readJson(file, { exceptions: [] }); return Array.isArray(j.exceptions) ? j.exceptions : []; }

// Build an exception record for a human to commit. Refuses non-waivable findings and automated approvers.
function propose({ topicId, format, beats, findingText, approvedBy, reason, approvedAt = new Date().toISOString(), approvalRef = null }) {
  const x = { id: `ex-${topicId}-${format}-${findingKey(findingText) || "invalid"}-${scriptHash(beats).slice(0, 8)}`, topicId, format, finding: findingKey(findingText), findingText: norm(findingText), scriptHash: scriptHash(beats), approvedBy, approvedAt, reason, approvalRef };
  const problems = validate(x);
  if (problems.length) { const e = new Error("editorial exception refused: " + problems.join("; ")); e.code = "EXCEPTION_REFUSED"; throw e; }
  return x;
}
function save(x, file = FILE) {
  const j = readJson(file, { schema: "", exceptions: [] }); j.exceptions = (j.exceptions || []).filter((e) => e.id !== x.id).concat([x]);
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + "\n");
}

module.exports = { apply, propose, save, load, validate, findingKey, scriptHash, WAIVABLE, FILE };
