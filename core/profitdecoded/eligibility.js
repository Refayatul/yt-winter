"use strict";
// Pre-generation filter: may this topic spend PAID script-generation tokens? Every check here is free (local data).
// It reuses the decision engine (demand, saturation, freshness, original angle, research gate) and adds the
// dossier checks that a paid script needs. A topic that fails is DEFERRED (fixable with free research) or REJECTED.
//
//   production pool: format must be cleared by the decision engine (PRODUCE_LONG / PRODUCE_SHORT)
//   experiment pool: the engine's demand requirement is waived (an experiment is how demand is learnt), nothing else is

const Research = require("./research");
const Decision = require("./decision");

const LONG_MIN_CLAIMS = 8;          // supported claims for an 8-12 minute documentary
const LONG_MIN_PRIMARY = 2;         // distinct primary (tier-1) sources
const MAX_AGE_DAYS_TIME_SENSITIVE = 120;

function check(topic, dossier, options = {}) {
  const format = options.format || "long"; const pool = options.pool || "script"; const now = options.now || Date.now();
  const out = []; const add = (name, pass, severity, detail) => out.push({ check: name, pass: !!pass, severity, detail });
  const gate = dossier ? Research.gate(dossier, { format }) : null;
  const row = options.row || Decision.evaluate(topic, { research: gate ? { ...gate, researchedAt: dossier.researchedAt } : null, ...(options.evidence || {}) }, options.decisionOptions || {});

  // 1. Decision engine: rejection, outdated premise, and (production pool) the format clearance.
  add("decision-engine", row.decision !== "REJECT", "reject", `decision ${row.decision}${row.blockers.length ? ": " + row.blockers.join("; ") : ""}`);
  add("freshness", row.decision !== "REFRESH_RESEARCH", "reject", `premise ${row.freshness.status}`);
  const cleared = format === "long" ? row.decision === "PRODUCE_LONG" : ["PRODUCE_LONG", "PRODUCE_SHORT"].includes(row.decision);
  add("format-clearance", pool === "experiment" || cleared, "defer", cleared ? `cleared for ${format}` : `not cleared for ${format} production (${(row.notes.find((n) => /blocked until/.test(n)) || row.decision)}); only the experiment pool may test it`);
  // 2. Verified research.
  add("verified-dossier", !!dossier, "defer", dossier ? `dossier researched ${dossier.researchedAt || "?"}` : "no research dossier: research it with free tools first");
  if (dossier) {
    add("research-gate", gate.pass, "defer", gate.pass ? `score ${gate.score}` : gate.rejections.join("; "));
    add("primary-sources", gate.stats.tier1 >= (format === "long" ? LONG_MIN_PRIMARY : 1), "defer", `${gate.stats.tier1} primary/authoritative source(s)`);
    // 3. Thesis and promised payoff: no conclusion beyond the supported claims.
    const supported = new Set(gate.claims.filter((c) => /^supported/.test(c.status)).map((c) => c.id));
    const support = (dossier.claims || []).filter((c) => supported.has(c.id)).concat(dossier.inferences || []).map((c) => c.text).join(" ");
    const thesisIssues = Research.textEvidenceIssues("thesis", dossier.thesis || "", support, { pattern: Research.QUANT_OVERCLAIM, supportLabel: "the supported claims" });
    add("thesis-evidence", thesisIssues.length === 0, "defer", thesisIssues.join("; ") || "thesis stays within the supported claims");
    const angleIssues = Research.textEvidenceIssues("angle", dossier.angle || "", support, { pattern: Research.QUANT_OVERCLAIM, supportLabel: "the supported claims" });
    add("payoff-evidence", !!dossier.angle && angleIssues.length === 0, "defer", !dossier.angle ? "no documented angle (what the film shows and answers)" : angleIssues.join("; ") || "angle promises nothing the claims cannot deliver");
    // 4. Narrative depth for 8-12 minutes.
    if (format === "long") {
      const material = (dossier.inferences || []).length + (dossier.contradictions || []).filter((x) => x.status === "resolved").length;
      add("narrative-depth", supported.size >= LONG_MIN_CLAIMS && material >= 1 && row.inputs.longformPotential.value >= 70, "defer", `${supported.size} supported claims (need ${LONG_MIN_CLAIMS}), ${material} inference/complication item(s), long-form potential ${row.inputs.longformPotential.value} (ESTIMATED)`);
    }
    // 5. Checkable arithmetic and attribution (the gates that caught real errors).
    const noCalc = (dossier.inferences || []).filter((i) => !(i.calc || []).length).map((i) => i.id);
    add("attribution-data", (dossier.entities || []).length > 0 && noCalc.length === 0, "defer", [(dossier.entities || []).length ? null : "no entity map", noCalc.length ? `no calc for ${noCalc.join(", ")}` : null].filter(Boolean).join("; ") || "entity map and checked calculations present");
    // 6. Factual freshness of the research itself for time-sensitive premises.
    const ageDays = dossier.researchedAt ? (now - Date.parse(dossier.researchedAt)) / 864e5 : Infinity;
    const timeSensitive = ["TIME_SENSITIVE", "CHANGED_CONTEXT"].includes(row.freshness.status);
    add("research-age", !timeSensitive || ageDays <= MAX_AGE_DAYS_TIME_SENSITIVE, "defer", timeSensitive ? `time-sensitive premise; research is ${Math.round(ageDays)} days old (max ${MAX_AGE_DAYS_TIME_SENSITIVE})` : "premise not flagged as time-sensitive");
  }
  // 7. Competitive differentiation and realistic visuals (decision-engine lens, ESTIMATED unless stated).
  const orig = row.lens.dimensions.angleOriginality || {}; const sat = row.saturation;
  add("differentiation", (orig.value == null || orig.value >= 60) && !(["SATURATED", "HOT"].includes(sat) && row.saturationProvenance === "OBSERVED" && !(dossier && dossier.angle)), "defer", `angle originality ${orig.value} (${orig.provenance}), saturation ${sat} (${row.saturationProvenance})`);
  const visual = row.inputs.visualPotential.value; const copyright = (topic.copyrightRisk && topic.copyrightRisk.value) || 0;
  add("visual-production", visual >= 60 && copyright <= 60, "defer", `visual potential ${visual} (ESTIMATED), copyright risk ${copyright}`);

  const failed = out.filter((c) => !c.pass);
  const status = failed.some((c) => c.severity === "reject") ? "REJECT" : failed.length ? "DEFER" : "ELIGIBLE";
  return { topicId: topic.id, format, pool, status, decision: row.decision, checks: out, reasons: failed.map((c) => `${c.check}: ${c.detail}`), warnings: pool === "experiment" && !cleared ? ["experiment: audience demand is not verified for this topic"] : [] };
}

// ---- Inventory readiness: classify every topic from existing local data (no API calls) ------------------------------
// rows: Decision.rank() output (with observed snapshot evidence and dossiers). dossiers: { topicId: dossier }.
// Every count is labelled by provenance: OBSERVED (collector data / verified dossier) or ESTIMATED (curation heuristics).
const NON_US = /\b(UK|U\.K\.|British|Britain|England|London|Europe|European|EU|Germany|German|France|French|Japan|Japanese|China|Chinese|India|Indian|Korea|Korean|Australia|Australian|Canada|Canadian|Brazil|Mexico|Dubai|Singapore|Russia|Africa)\b/;
function inventory({ topics, rows, dossiers = {}, now = Date.now() }) {
  const Comp = require("./competitive");
  const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
  // Duplicates: same subject (template words removed), keep the better-ranked topic.
  const terms = rows.map((r) => ({ id: r.id, t: new Set(Comp.subjectTerms(byId[r.id].topic)) }));
  const dupOf = {};
  for (let i = 0; i < terms.length; i += 1) for (let j = i + 1; j < terms.length; j += 1) {
    const a = terms[i].t; const b = terms[j].t; if (a.size < 2 || b.size < 2 || dupOf[terms[j].id]) continue;
    const inter = [...a].filter((x) => b.has(x)).length; const jac = inter / (a.size + b.size - inter);
    if (jac >= 0.75) dupOf[terms[j].id] = terms[i].id; // rows are rank-sorted: i is the better-ranked one
  }
  const out = rows.map((r) => {
    const t = byId[r.id]; const d = dossiers[r.id] || null; const gate = d ? Research.gate(d, { format: "long" }) : null;
    const demand = r.inputs.demand;
    const flags = {
      rejected: r.decision === "REJECT",
      outdated: r.decision === "REFRESH_RESEARCH" || ["OUTDATED_PREMISE", "PREMISE_CONTRADICTED"].includes(r.freshness.status),
      questionable: ["CHANGED_CONTEXT", "TIME_SENSITIVE"].includes(r.freshness.status),
      duplicateOf: dupOf[r.id] || null,
      oversaturated: ["SATURATED", "HOT"].includes(r.saturation), saturationProvenance: r.saturationProvenance,
      demandObserved: demand.provenance === "OBSERVED", demandValue: demand.value, demandStrong: demand.provenance === "OBSERVED" && demand.value >= 60,
      longSuitable: !!t.formats.long && r.inputs.longformPotential.value >= 80 && r.decision !== "REJECT",
      primarySources: !!(gate && gate.stats.tier1 >= 2), dossier: !!d, gatePass: !!(gate && gate.pass),
      usFocus: !NON_US.test(`${t.topic} ${t.entity || ""}`),
    };
    let tier;
    if (flags.rejected || flags.outdated || flags.duplicateOf) tier = "EXCLUDE";
    else if (d) tier = check(t, d, { format: "long", pool: "experiment", row: r, now }).status === "ELIGIBLE" ? "PRODUCTION_READY" : "RESEARCH_REQUIRED";
    else tier = flags.oversaturated && r.saturationProvenance === "OBSERVED" ? "DEFER_SATURATED" : !flags.demandObserved ? "RESEARCH_REQUIRED_DEMAND_UNKNOWN" : "RESEARCH_REQUIRED";
    return { id: r.id, topic: t.topic, workingTitle: r.workingTitle, pillar: r.pillar, decision: r.decision, rankScore: r.rankScore, tier, flags };
  });
  const n = (f) => out.filter(f).length;
  const summary = {
    total: out.length,
    tiers: out.reduce((m, x) => ({ ...m, [x.tier]: (m[x.tier] || 0) + 1 }), {}),
    productionReady: n((x) => x.tier === "PRODUCTION_READY"),
    longFormSuitableEstimated: n((x) => x.flags.longSuitable && x.tier !== "EXCLUDE"),
    demandObserved: n((x) => x.flags.demandObserved), demandStrongObserved: n((x) => x.flags.demandStrong),
    primarySourcesVerified: n((x) => x.flags.primarySources), dossiers: n((x) => x.flags.dossier),
    usFocusHeuristic: n((x) => x.flags.usFocus), needsNewResearch: n((x) => !x.flags.dossier && x.tier !== "EXCLUDE"),
    outdated: n((x) => x.flags.outdated), questionable: n((x) => x.flags.questionable), duplicates: n((x) => x.flags.duplicateOf), oversaturated: n((x) => x.flags.oversaturated), oversaturatedObserved: n((x) => x.flags.oversaturated && x.flags.saturationProvenance === "OBSERVED"),
    insufficientDemandEvidence: n((x) => !x.flags.demandObserved), rejected: n((x) => x.flags.rejected),
  };
  return { summary, topics: out };
}

// Shortlist for long-form documentaries: usable, long-form suitable, not observed-saturated; observed strong demand
// first, then the decision engine's rank; balanced across pillars and clusters by the existing selector.
function shortlist(inv, rows, topics, count = 20) {
  const Decision = require("./decision");
  const ok = new Map(inv.topics.filter((x) => x.tier !== "EXCLUDE" && x.tier !== "DEFER_SATURATED" && x.flags.longSuitable && x.flags.usFocus).map((x) => [x.id, x]));
  const ordered = rows.filter((r) => ok.has(r.id)).sort((a, b) => (ok.get(b.id).tier === "PRODUCTION_READY") - (ok.get(a.id).tier === "PRODUCTION_READY") || ok.get(b.id).flags.demandStrong - ok.get(a.id).flags.demandStrong || b.rankScore - a.rankScore);
  return Decision.selectDiverse(ordered, count, { topicById: Object.fromEntries(topics.map((t) => [t.id, t])) }).map((r) => ({ ...ok.get(r.id), notes: r.notes }));
}

module.exports = { check, inventory, shortlist, LONG_MIN_CLAIMS, LONG_MIN_PRIMARY, NON_US };
