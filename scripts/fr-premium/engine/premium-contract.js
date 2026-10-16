// Premium quality contract: one verdict for one premium video, built only from the outputs of the
// existing gates (validate.js, qa-vertical.js, text-qa.js, creative_qa.py) and a human approval record.
// It never renders, uploads or publishes, and no workflow calls it. It keeps five passes separate:
//   technical   qa-vertical.js hard checks
//   evidence    validate.js (claims, provenance, licences, on-screen numbers) + licence allowlist
//   creative    creative_qa.py is WARN-only by gate policy: any warning needs a human creative sign-off
//   human       owner approvals: script, voice (for this video), creative sign-off, remake (if the topic
//               was already published), publish
//   publishing  eligible only when all of the above pass; a technical or evidence pass never implies it
//
//   node scripts/fr-premium/engine/premium-contract.js --channel failure-reconstructed --plan final/shot-plan.final.json \
//        --technical qa-technical.json --text text-qa.json --creative creative-qa.json [--sync word-sync.json] \
//        [--approvals approvals.json] [--out contract.json]
"use strict";
const fs = require("fs"); const path = require("path");
const { validatePlan, loadPlanFiles } = require("./validate.js");
const POLICY = require("./channels/premium-policy.json");

const LICENCES = ["public-domain", "cc0", "cc-by", "cc-by-sa"]; // cc-by/-sa also need an attribution (validate.js)
const SYNC_MAX_MS = 150; // same limit as qa-vertical.js caption sync
const APPROVALS = ["script", "voice", "creative", "publish"];
const signed = (a) => !!(a && typeof a.by === "string" && a.by.trim() && typeof a.at === "string" && !Number.isNaN(Date.parse(a.at)));

function evaluate({ channel, plan, files, technical, text, creative, sync, approvals = {}, remake = false }) {
  const pol = POLICY.channels[channel];
  if (!pol || pol.mode !== "offline-review") return { channel, verdict: "PREMIUM_NOT_AVAILABLE", publishingEligible: false, reason: pol ? pol.note || `premium mode "${pol.mode}"` : "channel not in premium-policy.json" };
  const crit = []; const add = (n, name, status, detail) => crit.push({ n, name, status, detail });
  // evidence
  const v = files ? validatePlan(files) : { errors: ["no plan"], warnings: [] };
  const used = new Set((plan ? plan.shots : []).flatMap((s) => s.assets || []));
  const badLic = files ? [...used].filter((k) => !files.assets.assets[k] || !LICENCES.includes(files.assets.assets[k].licence.id)) : ["no assets"];
  const evid = v.errors.length === 0;
  // technical
  const hard = technical && Array.isArray(technical.checks) ? technical.checks.filter((c) => c.hard && !c.ok) : null;
  const tech = !!technical && technical.pass === true && hard && hard.length === 0;
  const soft = technical && Array.isArray(technical.checks) ? technical.checks.filter((c) => !c.hard && !c.ok).map((c) => `${c.name}: ${c.measured}`) : [];
  const textPass = !!text && text.pass === true && (text.fails || []).length === 0;
  const cs = creative && creative.summary ? creative.summary : null; const cWarn = cs ? cs.warns : null;
  const syncOk = sync ? sync.maxAbsMs <= SYNC_MAX_MS : null;
  // the 12 contract criteria, each mapped to the gate that measures it (or to a human)
  add(1, "hook strength", "NEEDS_HUMAN", "no automatic measure is trusted for this; creative sign-off");
  add(2, "factual accuracy", evid ? "PASS" : "FAIL", evid ? "validate.js: every claim verified, numbers from claims" : v.errors.slice(0, 3).join("; "));
  add(3, "evidence provenance", evid ? "PASS" : "FAIL", "validate.js passages, sources and asset provenance");
  add(4, "narrative clarity", "NEEDS_HUMAN", "script approval");
  add(5, "visual variety", cs ? (cs.slide_like ? "WARN" : "PASS") : "MISSING", cs ? `slide-like shots ${cs.slide_like}` : "no creative QA");
  add(6, "mobile readability", textPass ? "PASS" : (text ? "FAIL" : "MISSING"), text ? `text gate ${text.pass ? "PASS" : "FAIL"}` : "no text QA");
  add(7, "shot continuity", tech ? "PASS" : (technical ? "FAIL" : "MISSING"), "qa-vertical.js static holds, black frames, A/V match");
  add(8, "narration alignment", syncOk == null ? "MISSING" : syncOk ? "PASS" : "WARN", sync ? `word onsets mean ${sync.meanAbsMs} ms, max ${sync.maxAbsMs} ms (<= ${SYNC_MAX_MS})` : "no word-sync measurement");
  add(9, "scene composition", cs ? (cs.time_weighted_empty > 0.35 ? "WARN" : "PASS") : "MISSING", cs ? `time-weighted empty ${cs.time_weighted_empty} (<= 0.35)` : "no creative QA");
  add(10, "creative quality", cWarn == null ? "MISSING" : cWarn ? "WARN" : "PASS", cWarn == null ? "no creative QA" : `${cWarn} creative QA warnings on ${cs.warn_shots}/${cs.shots} shots`);
  add(11, "technical rendering quality", tech ? (soft.length ? "WARN" : "PASS") : (technical ? "FAIL" : "MISSING"), tech ? (soft.join("; ") || "all checks") : hard ? hard.map((c) => c.name).join(", ") : "no technical QA");
  add(12, "licensing compliance", badLic.length ? "FAIL" : "PASS", badLic.length ? `not on the allowlist: ${badLic.join(", ")}` : `${used.size} assets: ${[...new Set([...used].map((k) => files.assets.assets[k].licence.id))].join(", ")}`);
  // passes
  const need = [...APPROVALS, ...(remake ? ["remake"] : [])];
  const missing = need.filter((k) => !signed(approvals[k]));
  const passes = {
    technical: tech && textPass ? "PASS" : "FAIL",
    evidence: evid && !badLic.length ? "PASS" : "FAIL",
    creative: cWarn == null ? "MISSING" : cWarn === 0 ? "PASS" : signed(approvals.creative) ? "PASS_WITH_HUMAN_SIGNOFF" : "NEEDS_HUMAN_REVIEW",
    human: missing.length ? "MISSING" : "PASS",
  };
  const blocked = passes.technical === "FAIL" || passes.evidence === "FAIL" || crit.some((c) => c.status === "MISSING" && [6, 7, 10, 11].includes(c.n));
  const eligible = !blocked && passes.human === "PASS" && ["PASS", "PASS_WITH_HUMAN_SIGNOFF"].includes(passes.creative) && syncOk !== false;
  return { schema: "fr-premium.premium-contract.v1", channel, mode: pol.mode, autoPublish: false, criteria: crit, passes, missingApprovals: missing,
    verdict: blocked ? "BLOCKED" : eligible ? "PUBLISH_ELIGIBLE" : "NEEDS_HUMAN_REVIEW", publishingEligible: eligible,
    note: "Eligibility only allows the video to enter the normal pipeline's own gates; this tool never uploads or publishes." };
}

module.exports = { evaluate, LICENCES, APPROVALS, POLICY };

if (require.main === module) {
  const a = process.argv.slice(2); const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null); const J = (f) => (f ? JSON.parse(fs.readFileSync(path.resolve(f), "utf8")) : null);
  const planFile = opt("--plan"); const files = planFile ? loadPlanFiles(path.resolve(planFile)) : null;
  const r = evaluate({ channel: opt("--channel"), plan: files && files.plan, files, technical: J(opt("--technical")), text: J(opt("--text")), creative: J(opt("--creative")), sync: J(opt("--sync")), approvals: J(opt("--approvals")) || {}, remake: a.includes("--remake") });
  if (opt("--out")) fs.writeFileSync(opt("--out"), JSON.stringify(r, null, 1) + "\n");
  console.log(`${r.channel}: ${r.verdict}${r.passes ? ` · technical ${r.passes.technical} · evidence ${r.passes.evidence} · creative ${r.passes.creative} · human ${r.passes.human}` : ` (${r.reason})`} · publishing eligible: ${r.publishingEligible}`);
  if (r.missingApprovals && r.missingApprovals.length) console.log(`missing approvals: ${r.missingApprovals.join(", ")}`);
}
