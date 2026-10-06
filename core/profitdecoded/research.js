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
  }
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

module.exports = { classifySource, gate, unsupportedClaimsInScript, host };
