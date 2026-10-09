"use strict";
// Research dossier + source verification gate (spec 9-10, 30).
// Pipeline order: topic -> research -> sources -> facts -> contradictions ->
// thesis -> angle -> hooks -> structure -> visual plan -> script -> fact-check.
// This module enforces the first half before any script is allowed.

const T = require("./text");
const S = require("./signals");

// Source tiers. 1 = primary/authoritative, 2 = credible secondary, 3 = weak (never sole support), 0 = excluded as backbone.
const TIER1_HOSTS = [/(^|\.)sec\.gov$/, /(^|\.)ftc\.gov$/, /(^|\.)cfpb\.gov$/, /(^|\.)bls\.gov$/, /(^|\.)census\.gov$/, /(^|\.)federalreserve\.gov$/, /(^|\.)fdic\.gov$/, /(^|\.)transportation\.gov$/, /(^|\.)bts\.gov$/, /(^|\.)usda\.gov$/, /(^|\.)congress\.gov$/, /(^|\.)gao\.gov$/, /(^|\.)fcc\.gov$/, /(^|\.)justice\.gov$/, /\.gov$/, /\.gov\.[a-z]{2}$/, /\.edu$/, /(^|\.)doi\.org$/, /(^|\.)nber\.org$/, /(^|\.)ssrn\.com$/, /(^|\.)jstor\.org$/, /(^|\.)sciencedirect\.com$/, /(^|\.)nature\.com$/, /(^|\.)pnas\.org$/, /(^|\.)oecd\.org$/, /(^|\.)worldbank\.org$/, /(^|\.)imf\.org$/, /(^|\.)europa\.eu$/];
const TIER2_HOSTS = [/(^|\.)reuters\.com$/, /(^|\.)apnews\.com$/, /(^|\.)bloomberg\.com$/, /(^|\.)wsj\.com$/, /(^|\.)ft\.com$/, /(^|\.)nytimes\.com$/, /(^|\.)economist\.com$/, /(^|\.)washingtonpost\.com$/, /(^|\.)cnbc\.com$/, /(^|\.)forbes\.com$/, /(^|\.)hbr\.org$/, /(^|\.)theatlantic\.com$/, /(^|\.)npr\.org$/, /(^|\.)bbc\.(com|co\.uk)$/, /(^|\.)fortune\.com$/, /(^|\.)businessinsider\.com$/, /(^|\.)axios\.com$/, /(^|\.)vox\.com$/, /(^|\.)statista\.com$/, /(^|\.)mckinsey\.com$/, /(^|\.)bain\.com$/, /(^|\.)pewresearch\.org$/, /(^|\.)consumerreports\.org$/];
const COMPANY_PRIMARY_TYPES = new Set(["annual-report", "10-k", "10-q", "earnings-release", "investor-presentation", "filing", "regulator", "government", "academic", "court-document", "company-primary"]);

function host(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } }

function classifySource(src) {
  const h = host(src.url || "");
  if (/(^|\.)wikipedia\.org$/.test(h) || /(^|\.)wikimedia\.org$/.test(h)) return { tier: 0, reason: "Wikipedia may help discovery but is not a factual backbone" };
  if (COMPANY_PRIMARY_TYPES.has(String(src.type || "").toLowerCase())) return { tier: 1, reason: "declared primary source type: " + src.type };
  if (TIER1_HOSTS.some((re) => re.test(h))) return { tier: 1, reason: "government/academic/standards host" };
  if (/^(investors?|ir)\./.test(h) || /\/investors?\//.test(String(src.url || ""))) return { tier: 1, reason: "company investor-relations page" };
  if (TIER2_HOSTS.some((re) => re.test(h))) return { tier: 2, reason: "respected business journalism / research" };
  if (!h) return { tier: 3, reason: "no resolvable host" };
  return { tier: 3, reason: "unvetted publisher" };
}

function gate(dossier, options = {}) {
  const kind = options.format || dossier.format || "long";
  const minSources = kind === "short" ? 3 : 6;
  const rejections = []; const warnings = []; const claimReports = [];
  const sources = (dossier.sources || []).map((s) => ({ ...s, ...classifySource(s) }));
  const byId = new Map(sources.map((s) => [s.id, s]));
  if (!dossier.thesis || T.words(dossier.thesis).length < 12) rejections.push("no unique thesis (>=12 words stating what the video actually argues)");
  else if (/^\s*[\w' ]+ makes? money (from|by|through) [\w' ]+\.?\s*$/i.test(dossier.thesis)) rejections.push("thesis is a generic summary, not an argument");
  if (sources.length < minSources) rejections.push(`only ${sources.length} sources (need >=${minSources} for ${kind})`);
  const tier1 = sources.filter((s) => s.tier === 1).length;
  if (tier1 < (kind === "short" ? 1 : 2)) rejections.push(`only ${tier1} primary/authoritative source(s) (need >=${kind === "short" ? 1 : 2})`);
  const wikiShare = sources.length ? sources.filter((s) => s.tier === 0).length / sources.length : 0;
  if (wikiShare > 0.2) rejections.push(`Wikipedia is ${Math.round(wikiShare * 100)}% of sources (max 20%)`);
  if (!dossier.contradictionsChecked) rejections.push("contradiction check not recorded");
  const claims = dossier.claims || [];
  const central = claims.filter((c) => c.central);
  if (!central.length) rejections.push("no central claim declared");
  let supportedCentral = 0;
  for (const c of claims) {
    const used = (c.sourceIds || []).map((id) => byId.get(id)).filter(Boolean);
    const missingIds = (c.sourceIds || []).filter((id) => !byId.has(id));
    const t1 = used.filter((s) => s.tier === 1); const t2 = used.filter((s) => s.tier === 2);
    const publishers = new Set(used.filter((s) => s.tier <= 2 && s.tier > 0).map((s) => s.publisher || host(s.url)));
    let status;
    if (c.contradicted) status = "contradicted";
    else if (t1.length >= 1 && (publishers.size >= 2 || c.primaryOnlyOk)) status = "supported";
    else if (t1.length >= 1) status = "supported-single-primary";
    else if (t2.length >= 2 && publishers.size >= 2) status = "supported-secondary";
    else if (used.length) status = "weak";
    else status = "unsourced";
    const ok = ["supported", "supported-single-primary", "supported-secondary"].includes(status);
    claimReports.push({ id: c.id, central: !!c.central, text: c.text, status, tier1: t1.length, tier2: t2.length, missingSourceIds: missingIds });
    if (c.central) { if (ok) supportedCentral += 1; else rejections.push(`central claim "${String(c.text).slice(0, 80)}" is ${status}${used.length ? ` (${used.length} weak/secondary source${used.length > 1 ? "s" : ""})` : ""}`); }
    else if (!ok && /\d/.test(c.text || "")) warnings.push(`numeric claim "${String(c.text).slice(0, 60)}" is ${status}: remove it from the script`);
    if (c.quote && !c.quoteSourceId) rejections.push(`quote in claim ${c.id} has no quoteSourceId`);
    if (missingIds.length) rejections.push(`claim ${c.id} cites unknown source ids ${missingIds.join(", ")}`);
  }
  // Inferences (our own arithmetic/analysis) must be disclosed and rest only on supported claims.
  const supportedIds = new Set(claimReports.filter((c) => ["supported", "supported-single-primary", "supported-secondary"].includes(c.status)).map((c) => c.id));
  for (const inf of dossier.inferences || []) {
    if (!inf.disclosed) rejections.push(`inference ${inf.id} is not marked as our own analysis (disclosed:true)`);
    const bad = (inf.basisClaimIds || []).filter((id) => !supportedIds.has(id));
    if (!(inf.basisClaimIds || []).length || bad.length) rejections.push(`inference ${inf.id} rests on unsupported/missing claim(s): ${(bad.length ? bad : ["none cited"]).join(", ")}`);
    for (const p of inferenceArithmetic(inf, dossier)) rejections.push(p);
    if (!(inf.calc || []).length) warnings.push(`inference ${inf.id} has no checkable calculation (calc): its arithmetic is not verified`);
  }
  // Entity map (who reported what): every entity must point at known sources.
  for (const e of dossier.entities || []) { const unknown = (e.sourceIds || []).filter((id) => !byId.has(id)); if (unknown.length) rejections.push(`entity ${e.id} cites unknown source ids ${unknown.join(", ")}`); }
  if (!(dossier.entities || []).length) warnings.push("no entity map (entities): company attribution in the script cannot be checked");
  if (central.length && dossier.contradictions && dossier.contradictions.some((x) => x.status === "open")) rejections.push("an open contradiction is unresolved");
  const dated = sources.filter((s) => s.date).length;
  if (sources.length && dated / sources.length < 0.6) warnings.push("fewer than 60% of sources carry a publication date");
  // Score: coverage of tier-1, central support, breadth.
  const score = S.clamp(Math.round(
    35 * (central.length ? supportedCentral / central.length : 0)
    + 25 * Math.min(1, tier1 / (kind === "short" ? 2 : 4))
    + 15 * Math.min(1, sources.length / (kind === "short" ? 4 : 10))
    + 10 * (dossier.contradictionsChecked ? 1 : 0)
    + 10 * (dossier.thesis ? 1 : 0)
    + 5 * (1 - wikiShare)));
  const pass = rejections.length === 0 && score >= (options.minScore || 80);
  if (!rejections.length && score < (options.minScore || 80)) rejections.push(`research score ${score} < required ${options.minScore || 80}`);
  return { pass, score, rejections, warnings, claims: claimReports, sources: sources.map((s) => ({ id: s.id, publisher: s.publisher || host(s.url), tier: s.tier, tierReason: s.reason })), stats: { sources: sources.length, tier1, wikipediaShare: S.round(wikiShare, 2) } };
}

// Claims that failed support must not appear in the script. Returns offending sentences.
function unsupportedClaimsInScript(script, dossier) {
  const gateResult = gate(dossier, { minScore: 0 });
  const bad = gateResult.claims.filter((c) => !["supported", "supported-single-primary", "supported-secondary"].includes(c.status));
  const hits = [];
  for (const c of bad) { for (const s of T.sentences(script)) if (T.wordSetSimilarity(s, c.text) > 0.45) hits.push({ claim: c.text, sentence: s }); }
  // Any number in the script that is absent from supported claims/facts is suspicious.
  const known = new Set(((dossier.claims || []).concat(dossier.facts || [], dossier.inferences || [])).flatMap((c) => (String((c.text || c.claim || "") + " " + (c.numbers || []).join(" ")).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, ""))));
  const orphan = [];
  for (const s of T.sentences(script)) for (const n of (s.match(/\$?\d[\d,.]*\d|\$?\d/g) || [])) { const bare = n.replace(/^\$/, "").replace(/[,.]+$/, ""); if (!known.has(bare) && !/^(19|20)\d\d$/.test(bare) && bare.length > 1) orphan.push({ number: n, sentence: s }); }
  return { unsupported: hits, numbersWithoutDossierSupport: orphan };
}

// ---- Arithmetic, attribution and plan-evidence checks -----------------------------------------------
// Dossier fields used (all optional; a dossier without them gets warnings, never silent passes):
//   inferences[].calc        [{ expr: "628.8 - 0.4 + 760.2 - 751.9", equals: 636.7, tolerance? }] verified numerically
//   inferences[].kind        "arithmetic" (voice as our math) | "rounding" (voice with "about"/"roughly" or as ours)
//   entities[]               { id, name, kind, aliases[], sourceIds[] }: who reported which claim
//   claims[].scope           { population: "US adults", avoid: ["households"] }
//   claims[].disclose        [{ any: ["YouGov", "online"], why }]: context that must accompany the claim when used
//   scriptRules[]            { pattern, flags?, reason }: statements the narration must never make

// Only digits, operators, dots, spaces and parentheses: anything else is refused before evaluation.
function evalExpr(expr) {
  if (!/^[\d\s.+\-*/()]+$/.test(String(expr || ""))) throw new Error(`unsafe or empty expression "${expr}"`);
  return Function(`"use strict"; return (${expr});`)();
}
const decimals = (n) => ((String(n).split(".")[1] || "").length);
function inferenceArithmetic(inf, dossier) {
  const problems = [];
  for (const c of inf.calc || []) {
    let v; try { v = evalExpr(c.expr); } catch (e) { problems.push(`inference ${inf.id}: ${e.message}`); continue; }
    const tol = c.tolerance != null ? c.tolerance : 0.5 * 10 ** -decimals(c.equals) + 1e-9;
    if (!Number.isFinite(v) || Math.abs(v - Number(c.equals)) > tol) problems.push(`inference ${inf.id} arithmetic does not hold: ${c.expr} = ${Math.round(v * 1000) / 1000}, not ${c.equals}`);
  }
  if ((inf.calc || []).length) {
    // every figure the inference states must come from its basis claims or its own checked calculation
    const basis = (inf.basisClaimIds || []).map((id) => ((dossier.claims || []).find((x) => x.id === id) || {}).text || "").join(" ");
    const known = new Set([...figuresOf(basis), ...(inf.calc || []).flatMap((c) => [...figuresOf(c.expr), ...figuresOf(String(c.equals))])].map((f) => f.value));
    for (const f of figuresOf(inf.text)) if (!known.has(f.value)) problems.push(`inference ${inf.id} states ${f.raw} that neither its basis claims nor its calc produce`);
  }
  return problems;
}

// Figures in text: value normalised ("$1,751.7" -> "1751.7"), plus the unit word that follows (million, percent...).
function figuresOf(text) {
  const out = []; const re = /\$?\d[\d,]*(?:\.\d+)?(%?)(?:\s+(million|billion|thousand|percent|percentage|basis|years?|months?|days?|adults|people|cards))?/gi; let m;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    const raw = m[0]; const value = String(Number(raw.match(/\d[\d,]*(?:\.\d+)?/)[0].replace(/,/g, ""))); // "22.0" and "22" are the same figure
    if (/^(19|20)\d\d$/.test(value) && !raw.startsWith("$")) continue; // years are dates, not figures
    out.push({ raw: raw.trim(), value, unit: (m[1] ? "percent" : (m[2] || "").toLowerCase().replace(/^percentage$/, "percent")) });
  }
  return out;
}

const OURS = /\b(add (up )?the|you get|our (own )?(math|arithmetic|calculations?|count|sums?|estimate|rounding|total|addition)|by our (own )?(math|arithmetic|count|calculation)|we (add|added|calculate|calculated|get|got|estimate|count|work out)|(that|this) (addition|math|sum) is ours|is ours|are ours|adding (up )?(the|those|its) )/i;
const APPROX = /\b(about|around|roughly|nearly|almost|some|close to|just (over|under)|approximately)\b/i;
const REPORT_VERB = /\b(recorded|reported|reports|booked|books|recogni[sz]ed|recogni[sz]es|lists|listed|says|said|disclosed|posted|earned|shows)\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function entityIndex(dossier) {
  const ents = (dossier.entities || []).map((e) => ({ ...e, re: new RegExp("\\b(" + [e.name, ...(e.aliases || [])].filter(Boolean).map(esc).join("|") + ")\\b", "i") }));
  const bySource = (ids) => ents.filter((e) => (e.sourceIds || []).some((s) => (ids || []).includes(s))).map((e) => e.id);
  const claimEnt = {};
  for (const c of dossier.claims || []) claimEnt[c.id] = bySource(c.sourceIds);
  for (const i of dossier.inferences || []) claimEnt[i.id] = [...new Set((i.basisClaimIds || []).flatMap((b) => claimEnt[b] || []))];
  return { ents, claimEnt, named: (text) => ents.filter((e) => e.re.test(text)).map((e) => e.id), name: (id) => (ents.find((e) => e.id === id) || {}).name || id };
}

// Figure index: which claims state each figure, and whether it is only ours (inference) or reported.
function figureIndex(dossier, idx) {
  const map = new Map();
  const add = (c, ours, kind) => { for (const f of figuresOf(c.text)) { const r = map.get(f.value) || { reported: false, oursKinds: new Set(), claims: new Set(), entities: new Set() }; if (ours) r.oursKinds.add(kind || "arithmetic"); else r.reported = true; r.claims.add(c.id); for (const e of idx.claimEnt[c.id] || []) r.entities.add(e); map.set(f.value, r); } };
  for (const c of dossier.claims || []) add(c, false);
  for (const i of dossier.inferences || []) add(i, true, i.kind);
  return map;
}

// Narration checks. beats: [{ id, section, text, claimId }] in spoken order. Returns issue strings.
function attributionIssues(beats, dossier) {
  const issues = []; const idx = entityIndex(dossier); const figs = figureIndex(dossier, idx);
  const all = [...(dossier.claims || []), ...(dossier.inferences || [])]; const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  // 1. Internal ids must never be spoken.
  const internal = [...all.map((c) => c.id), ...(dossier.sources || []).map((s) => s.id), ...(dossier.contradictions || []).map((x) => x.id)].filter(Boolean);
  const idRe = internal.length ? new RegExp("\\b(" + internal.map(esc).join("|") + ")\\b") : null;
  const named = new Set();
  for (const b of beats) {
    const m = idRe && idRe.exec(b.text) || /\b(claim|source|inference) [a-z]?\d+\b/i.exec(b.text);
    if (m) issues.push(`beat ${b.id} speaks an internal id ("${m[0]}"): narration must not mention claim or source ids`);
    // 2. A company or publisher must be named before its facts are used (no "the company" before we know which one).
    const ents = idx.claimEnt[b.claimId] || [];
    for (const e of idx.named(b.text)) named.add(e);
    // a hook or a pure question may tease before naming; any figure needs its named source
    const questionOnly = T.sentences(b.text).every((x) => x.trim().endsWith("?") || T.words(x).length <= 6);
    const teaser = !figuresOf(b.text).length && (["hook", "mystery", "question"].includes(b.type) || questionOnly);
    if (!teaser && idx.ents.length && ents.length && !ents.some((e) => named.has(e))) issues.push(`beat ${b.id} uses ${ents.map(idx.name).join("/")}'s ${byId[b.claimId] && byId[b.claimId].basisClaimIds ? "figures" : "facts"} before naming ${ents.length > 1 ? "any of them" : "it"}: name the company or publisher first`);
    // 3. Figures: our calculations voiced as ours; reported figures attributed to the right entity.
    const sents = T.sentences(b.text);
    sents.forEach((s, si) => {
      // "say so" may come in the same beat, before or after ("Add the two lines and you get $X. That addition is ours.")
      const inSentence = idx.named(s);
      for (const f of figuresOf(s)) {
        const r = figs.get(f.value); if (!r) continue;
        if (!r.reported) {
          const roundingOnly = [...r.oursKinds].every((k) => k === "rounding");
          if (roundingOnly ? !(APPROX.test(s) || OURS.test(b.text)) : !OURS.test(b.text)) issues.push(`beat ${b.id}: ${f.raw} is our ${roundingOnly ? "rounding" : "calculation"}, not a reported figure: say so ("${roundingOnly ? "about" : "by our math"}") (sentence: "${s.slice(0, 90)}")`);
          if (!roundingOnly && inSentence.length && REPORT_VERB.test(s) && !OURS.test(s)) issues.push(`beat ${b.id}: ${f.raw} is presented as reported by ${inSentence.map(idx.name).join("/")}, but it is our calculation (sentence: "${s.slice(0, 90)}")`);
        }
        if (inSentence.length && r.entities.size && !inSentence.some((e) => r.entities.has(e))) issues.push(`beat ${b.id}: ${f.raw} comes from ${[...r.entities].map(idx.name).join("/")}, but the sentence attributes it to ${inSentence.map(idx.name).join("/")} (sentence: "${s.slice(0, 90)}")`);
      }
    });
  }
  // 4. Scope: a claim about one population must not be voiced as another (adults vs households).
  for (const c of all) for (const avoid of (c.scope && c.scope.avoid) || []) {
    const re = new RegExp("\\b" + esc(avoid) + "\\b", "i"); const cfigs = new Set(figuresOf(c.text).map((f) => f.value));
    for (const b of beats) if ((b.claimId === c.id || figuresOf(b.text).some((f) => cfigs.has(f.value))) && re.test(b.text)) issues.push(`beat ${b.id}: "${avoid}" misstates the scope of ${c.id}, which is about ${c.scope.population || "a different population"}`);
  }
  // 5. Required context (e.g. survey method) must accompany a claim wherever the script relies on it.
  for (const c of all) {
    const used = beats.filter((b) => b.claimId === c.id); if (!used.length) continue;
    const text = used.map((b) => b.text).join(" ");
    for (const d of c.disclose || []) {
      // whenFigures: the context is required only where those figures are spoken (e.g. the combined balance of rule x4)
      const scope = d.whenFigures ? used.concat(beats.filter((b) => !used.includes(b))).filter((b) => figuresOf(b.text).some((f) => d.whenFigures.map((x) => String(Number(String(x).replace(/[$,]/g, "")))).includes(f.value))) : used;
      if (!scope.length) continue;
      if (!d.any.some((w) => new RegExp("\\b" + esc(w), "i").test(scope.map((b) => b.text).join(" ")))) issues.push(`${c.id} is used without ${d.why || "required context"} (say one of: ${d.any.join(", ")})`);
    }
  }
  // 5b. Figure labels: a figure must keep the words that say what it measures (e.g. $751.9M is redemptions AND breakage).
  for (const c of all) for (const fc of c.figureContext || []) {
    const v = String(Number(String(fc.figure).replace(/[$,]/g, "")));
    // the label may sit in the same sentence or elsewhere in the same beat ("It recognized $X. That amount includes breakage.")
    for (const b of beats) if (figuresOf(b.text).some((f) => f.value === v) && !fc.any.some((w) => new RegExp("\\b" + esc(w), "i").test(b.text))) issues.push(`beat ${b.id}: ${fc.figure} must be described as ${fc.label || fc.any.join("/")} (beat: "${b.text.slice(0, 90)}")`);
  }
  // 6. Editorial rules from the contradiction check (e.g. never say that gift cards never expire).
  const script = beats.map((b) => b.text).join(" ");
  for (const r of dossier.scriptRules || []) { const m = new RegExp(r.pattern, r.flags || "i").exec(script); if (m) issues.push(`editorial rule broken ("${m[0]}"): ${r.reason}`); }
  // 7. The same figure (value + unit) stated in more than one section: say it once, refer back elsewhere.
  const where = new Map();
  for (const b of beats) for (const f of figuresOf(b.text)) { if (!figs.has(f.value)) continue; const k = f.value + (f.unit ? " " + f.unit : ""); const s = where.get(k) || { raw: f.raw, sections: new Set() }; s.sections.add(b.section || "?"); where.set(k, s); }
  for (const [, s] of where) if (s.sections.size > 1) issues.push(`repeated figure: ${s.raw} is stated in sections ${[...s.sections].join(", ")}: state it once and refer back`);
  return issues;
}

// Plan-level evidence checks: the thesis and payoff must cite claims, may not conclude more than those claims say,
// and a figure-bearing fact gets one home section (the payoff may refer back to it).
const OVERCLAIM = /\b(most|majority|the bulk|bulk of|nearly all|almost all|virtually all|only a (small|tiny)|small slice|tiny slice|small remainder|exact|exactly|precise|precisely|always|never|every|all of|nobody|no one|guarantee[sd]?|proves?|proven|certainly|knows?|the biggest|the largest|the most|the only)\b/gi;
// Quantity / precision / certainty words only: used where the text is a researcher's own summary (the dossier thesis),
// where "never expire" may correctly paraphrase "no expiration date".
const QUANT_OVERCLAIM = /\b(most|majority|the bulk|bulk of|nearly all|almost all|virtually all|only a (small|tiny)|small slice|tiny slice|small remainder|exact|exactly|precise|precisely|all of|nobody|no one|guarantee[sd]?|proves?|proven|certainly|knows?|the biggest|the largest|the only)\b/gi;
// Does a piece of text conclude more than its supporting claims? (overclaim words not in the support, figures not in it)
function textEvidenceIssues(field, text, supportText, options = {}) {
  const issues = []; const re = options.pattern || OVERCLAIM;
  for (const m of new Set((String(text || "").match(re) || []).map((x) => x.toLowerCase()))) if (!new RegExp("\\b" + esc(m) + "\\b", "i").test(supportText)) issues.push(`${field} overclaims: "${m}" is not supported by ${options.supportLabel || "its cited claims"}. Conclude only what the evidence states, and say plainly what it does not show`);
  const known = new Set(figuresOf(supportText).map((f) => f.value));
  for (const f of figuresOf(text)) if (!known.has(f.value)) issues.push(`${field} states ${f.raw}, which ${options.supportLabel || "its cited claims"} do not contain`);
  return issues;
}
function planEvidenceIssues(plan, dossier) {
  const issues = []; const warnings = [];
  const all = [...(dossier.claims || []), ...(dossier.inferences || [])]; const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  const used = new Set((plan.sections || []).flatMap((s) => s.claimIds || []));
  const fields = [["thesis", plan.thesisClaimIds], ["payoff", plan.payoffClaimIds], ["originalAngle", plan.angleClaimIds || plan.payoffClaimIds]];
  for (const [field, ids] of fields.slice(0, 2)) {
    if (!(ids || []).length) { issues.push(`${field} cites no claim ids (${field}ClaimIds): every conclusion must rest on cited evidence`); continue; }
    for (const id of ids) if (!byId[id]) issues.push(`${field} cites unknown claim id "${id}"`);
    if (field === "payoff") for (const id of ids) if (byId[id] && !used.has(id)) issues.push(`payoff cites ${id}, which no section establishes: the payoff may only conclude what the film has shown`);
  }
  for (const [field, ids] of fields) {
    const text = String(plan[field] || ""); if (!text) continue;
    const support = (ids || []).map((id) => (byId[id] || {}).text || "").join(" ") + " " + (dossier.thesis || "");
    issues.push(...textEvidenceIssues(field, text, support, { supportLabel: `its cited claims (${(ids || []).join(", ") || "none"})` }).map((x) => x.replace(/ which its cited claims \([^)]*\) do not contain$/, " which its cited claims do not contain")));
    for (const r of dossier.scriptRules || []) { const m = new RegExp(r.pattern, r.flags || "i").exec(text); if (m) issues.push(`${field} breaks an editorial rule ("${m[0]}"): ${r.reason}`); }
  }
  // Repeated facts across planned sections.
  // A hook previews, a caveat qualifies and a payoff concludes: they may refer back to facts that a story section
  // establishes. Each figure-bearing fact gets one home among the other sections; restated numbers are caught in the script.
  const payoffIds = new Set((plan.sections || []).filter((s) => ["payoff", "hook", "caveat"].includes(s.purpose)).map((s) => s.id));
  const homes = new Map();
  for (const s of plan.sections || []) if (!payoffIds.has(s.id)) for (const id of new Set(s.claimIds || [])) homes.set(id, [...(homes.get(id) || []), s.id]);
  for (const [id, secs] of homes) {
    const figureBearing = byId[id] && figuresOf(byId[id].text).length > 0;
    if (figureBearing && secs.length > 1) issues.push(`repeated fact: ${id} (it carries figures) is planned in sections ${secs.join(", ")}: give it one home section; other sections may refer back without restating its numbers`);
    else if (secs.length > 2) warnings.push(`${id} is planned in ${secs.length} sections (${secs.join(", ")}): make sure each uses a different part of it`);
  }
  return { issues, warnings };
}

module.exports = { classifySource, gate, unsupportedClaimsInScript, host, figuresOf, evalExpr, inferenceArithmetic, entityIndex, attributionIssues, planEvidenceIssues, textEvidenceIssues, OVERCLAIM, QUANT_OVERCLAIM };
