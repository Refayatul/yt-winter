#!/usr/bin/env node
"use strict";
// Asset Matching Engine V1: ranks licensed assets for each narration beat.
//   node scripts/fr-premium/engine/asset-matcher.js --script narration-script.json --evidence evidence.json
//        --assets assets.json [--suggestions anchor-suggestions.json] [--out asset-matches.json]
//
// Criteria (each 0..1, recorded per candidate): evidence relevance, historical subject, exact depiction,
// resolution, aspect ratio, licensing, mobile readability, template compatibility.
// Hard rules, never scores:
// - a caption or title naming another mission, vehicle or accident of the same family rejects the asset
//   (WRONG_SUBJECT); a year outside the topic's documented period rejects it (WRONG_PERIOD);
// - a test, concept, model, simulation or redesign is never a depiction of the event: it can only be
//   used with an on-screen reconstruction disclosure (DISCLOSURE_REQUIRED);
// - word overlap between a caption and a claim is a candidate, not proof: only a human-confirmed
//   `depicts` entry makes an exact depiction (otherwise CONFIRM_DEPICTION);
// - an unknown or attribution-less licence rejects the asset; provenance is copied from assets.json,
//   never written or completed here;
// - with no suitable candidate the beat is NEEDS_HUMAN_REVIEW (NO_SUITABLE_VISUAL).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STOP = new Set("that this with from were was have been their there which when where while into onto than then them they this those these such also only about after before during under over between including used each very most more".split(" "));
const stem = (w) => w.toLowerCase().replace(/(?:ing|ed|es|s)$/, "").replace(/e$/, "");
const terms = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem));
const NONEVENT = /\b(artist'?s?\s+concept|concept|illustration|rendering|model|mock-?up|replica|simulat\w*|test|tests|redesign\w*|reconstruction|animation|re-?enactment)\b/i;

// topic identity from verified evidence: designation claims ("APOLLO 13", "THE STS-51-L CREW") and date claims (years)
function identity(evidence) {
  const C = Object.values(evidence.claims).filter((c) => c.status === "verified");
  const designations = C.filter((c) => c.role === "designation").map((c) => String(c.display || c.text));
  const fams = []; for (const d of designations) { const m = /\b([A-Za-z]+)[\s-]?(\d+[A-Za-z0-9-]*)\b/.exec(d.replace(/^THE\s+/i, "")); if (m) fams.push({ prefix: m[1].toLowerCase(), id: m[2].toLowerCase() }); }
  const years = C.filter((c) => c.role === "date" && Number.isInteger(c.value)).map((c) => c.value);
  for (const c of C) for (const y of String(c.passage || "").match(/\b(19|20)\d\d\b/g) || []) years.push(+y);
  return { designations, fams, period: years.length ? [Math.min(...years), Math.max(...years)] : null };
}
// years written as dates ("17 April 1970", "in 1971", "(1986)"), never digits inside archive identifiers (GPN-2000-001167)
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const DATED = new RegExp(`(?:${MONTH}\\s+(?:\\d{1,2},?\\s+)?|\\b(?:in|on|of|circa|during)\\s+|\\()((?:19|20)\\d\\d)(?![\\w-])`, "gi");
const flat = (x) => String(x).toLowerCase().replace(/-/g, "");
function subjectCheck(asset, id) {
  const text = `${asset.source.title} ${asset.source.caption || ""}`; const low = text.toLowerCase(); const out = { score: 0.4, reasons: [] };
  for (const f of id.fams) { const re = new RegExp(`\\b${f.prefix}[\\s_-]?(\\d+[a-z0-9-]*)`, "gi"); let m; let same = false, other = null;
    while ((m = re.exec(low))) { const got = flat(m[1]).replace(/[^a-z0-9]+$/, ""); if (got === flat(f.id) || got.startsWith(flat(f.id))) same = true; else other = m[0]; }
    if (other && !same) return { score: 0, reject: "WRONG_SUBJECT", reasons: [`names ${other.trim()} (topic: ${f.prefix} ${f.id})`] };
    if (other && same) out.reasons.push(`names both the topic and ${other.trim()}: confirm the subject`);
    if (same) { out.score = 1; out.reasons.push(`caption/title names the topic (${f.prefix} ${f.id})`); } }
  if (id.period) { const ys = [...text.matchAll(DATED)].map((m) => +m[1]);
    if (ys.length && !ys.some((y) => y >= id.period[0] - 1 && y <= id.period[1] + 1)) return { score: 0, reject: "WRONG_PERIOD", reasons: [`dated ${ys.join(", ")}; topic period ${id.period.join("-")}`] }; }
  if (out.score < 1) out.reasons.push("subject not named in title or caption: confirm");
  return out;
}

// templates a beat can use, and the asset kinds/tags each accepts
const BEAT_TEMPLATES = { hook: ["archival-plate"], setting: ["archival-plate"], evidence: ["archival-plate", "component-section"], "human-cost": ["archival-plate"],
  mechanism: ["component-section", "joint-mechanism", "trace-over-photo"], "event-sequence": ["archival-plate", "timeline"], decision: ["document-desk", "document-excerpt"], payoff: ["payoff"] };
const ACCEPTS = { "archival-plate": (a) => a.kind === "photo" || a.kind === "clip", payoff: (a) => a.kind === "photo",
  "document-desk": (a) => a.kind === "document" && Object.values(a.anchors || {}).some((x) => x.role === "document-line" || x.role === "document-block"),
  "component-section": (a) => (a.tags || []).includes("drawing"), "joint-mechanism": (a) => (a.tags || []).includes("drawing"), "trace-over-photo": (a) => a.kind === "photo",
  timeline: () => false, "document-excerpt": () => false };

function matchLine({ line, beat, evidence, assets, id, suggestions = [], hashes = {} }) {
  const C = evidence.claims; const claims = line.claims.filter((c) => C[c]);
  const want = new Set(claims.flatMap((c) => [...terms(C[c].passage || C[c].text)]));
  const tpls = BEAT_TEMPLATES[beat] || ["archival-plate"]; const cands = [];
  const seen = new Map();
  for (const [key, a] of Object.entries(assets.assets)) {
    const r = { asset: key, criteria: {}, reasons: [], verdict: null, codes: [] };
    // licensing (gate)
    const lic = a.licence || {}; r.criteria.licensing = ["public-domain", "cc0"].includes(lic.id) ? 1 : ["cc-by", "cc-by-sa"].includes(lic.id) && lic.attribution ? 0.8 : 0;
    if (!r.criteria.licensing) r.codes.push("LICENCE");
    // historical subject (gate on a contradiction)
    const sj = subjectCheck(a, id); r.criteria.subject = sj.score; r.reasons.push(...sj.reasons); if (sj.reject) r.codes.push(sj.reject);
    // evidence relevance: claim-passage terms found in the caption/title (a candidate signal only)
    const have = terms(`${a.source.title} ${a.source.caption || ""}`); const hit = [...want].filter((w) => have.has(w));
    r.criteria.evidence = Math.min(1, hit.length / Math.max(3, Math.min(8, want.size / 2))); if (hit.length) r.reasons.push(`shares terms with the claims: ${hit.slice(0, 6).join(", ")}`);
    // exact depiction: only a human-confirmed depicts entry; a test/concept never depicts the event
    const nonEvent = NONEVENT.exec(`${a.source.title} ${a.source.caption || ""}`);
    const confirmed = (a.depicts || []).filter((c) => claims.includes(c));
    if (nonEvent) { r.criteria.exact = 0; r.codes.push("DISCLOSURE_REQUIRED"); r.reasons.push(`caption describes a ${nonEvent[0].toLowerCase()}: not the event; usable only with a reconstruction/test label`); }
    else if (confirmed.length) { r.criteria.exact = 1; r.reasons.push(`depicts ${confirmed.join(", ")} (confirmed in assets.json)`); }
    else if (hit.length >= 2) { r.criteria.exact = 0.5; r.codes.push("CONFIRM_DEPICTION"); r.reasons.push("caption overlap only: confirm what the image depicts"); }
    else r.criteria.exact = 0;
    // resolution, aspect ratio, mobile readability
    const long = Math.max(a.width, a.height); const need = a.kind === "document" ? 1200 : 2000; r.criteria.resolution = +Math.min(1, long / need).toFixed(2);
    const arImg = a.width / a.height, arBox = 1080 / 1400; r.criteria.aspect = +Math.min(arImg / arBox, arBox / arImg).toFixed(2);
    const labels = suggestions.filter((s) => s.asset === key && s.rect && s.method === "ocr-text" && s.status !== "REJECTED");
    if (a.kind === "document" || (a.tags || []).includes("drawing")) {
      if (labels.length) { const hmed = labels.map((s) => s.rect.h).sort((x, y) => x - y)[Math.floor(labels.length / 2)]; const onPhone = hmed * 900 / a.width; r.criteria.mobile = +Math.min(1, onPhone / 30).toFixed(2); r.reasons.push(`text ~${onPhone.toFixed(0)} px tall on a phone at 900 px width (from OCR boxes)`); }
      else { r.criteria.mobile = a.width >= 1000 ? 0.8 : a.width >= 600 ? 0.5 : 0.2; r.reasons.push("mobile readability estimated from width (no OCR boxes)"); r.mobileEstimated = true; }
    } else r.criteria.mobile = r.criteria.resolution;
    // template compatibility for this beat
    const fits = tpls.filter((t) => ACCEPTS[t] && ACCEPTS[t](a)); r.criteria.template = fits.length ? 1 : 0; r.templates = fits;
    // duplicates: same file bytes or the same source page as a better candidate
    const dupKey = hashes[key] || `${a.source.page} ${a.source.title} ${a.file}`; if (seen.has(dupKey)) { r.codes.push("DUPLICATE"); r.reasons.push(`duplicate of ${seen.get(dupKey)}`); } else seen.set(dupKey, key);
    const w = { evidence: 0.2, subject: 0.15, exact: 0.3, resolution: 0.08, aspect: 0.05, licensing: 0.05, mobile: 0.07, template: 0.1 };
    r.score = +Object.entries(w).reduce((s, [k, v]) => s + v * r.criteria[k], 0).toFixed(3);
    const reject = r.codes.some((c) => ["LICENCE", "WRONG_SUBJECT", "WRONG_PERIOD", "DUPLICATE"].includes(c));
    r.verdict = reject ? "REJECT" : !r.criteria.template ? "INCOMPATIBLE" : r.codes.includes("DISCLOSURE_REQUIRED") ? "DISCLOSURE_REQUIRED" : r.criteria.exact === 1 ? "ACCEPT" : r.criteria.exact > 0 ? "NEEDS_HUMAN_REVIEW" : "NOT_DEPICTED";
    cands.push(r);
  }
  const order = { ACCEPT: 0, NEEDS_HUMAN_REVIEW: 1, DISCLOSURE_REQUIRED: 2, NOT_DEPICTED: 3, INCOMPATIBLE: 4, REJECT: 5 };
  cands.sort((x, y) => order[x.verdict] - order[y.verdict] || y.score - x.score || x.asset.localeCompare(y.asset));
  const best = cands.find((c) => c.verdict === "ACCEPT");
  return { line: line.id, beat, templates: tpls, decision: best ? best.asset : null,
    status: best ? "MATCHED" : cands.some((c) => c.verdict === "NEEDS_HUMAN_REVIEW") ? "NEEDS_HUMAN_REVIEW" : "NO_SUITABLE_VISUAL", candidates: cands };
}

function matchAll({ script, evidence, assets, beats, suggestions = [], assetDir = null }) {
  const id = identity(evidence); const hashes = {};
  if (assetDir) for (const [k, a] of Object.entries(assets.assets)) { const f = path.join(assetDir, a.file); if (fs.existsSync(f)) hashes[k] = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); }
  for (const [k, a] of Object.entries(assets.assets)) if (a.sha256 && !hashes[k]) hashes[k] = a.sha256;
  const t0 = process.hrtime.bigint();
  const lines = script.lines.map((l, i) => matchLine({ line: l, beat: beats ? beats[i] : l.beat || "evidence", evidence, assets, id, suggestions, hashes }));
  return { schema: "fr-premium.asset-matches.v1", topic: script.topic, identity: id, lines, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

module.exports = { matchAll, matchLine, identity, subjectCheck, terms, NONEVENT };

if (require.main === module) {
  const a = process.argv.slice(2); const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null); const J = (f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
  const { makePlanner } = require("./planner");
  const script = J(opt("--script")), evidence = J(opt("--evidence")), assets = J(opt("--assets")); const sugg = opt("--suggestions") ? J(opt("--suggestions")).suggestions : [];
  const tl = opt("--timeline") ? J(opt("--timeline")) : null; const beats = tl ? makePlanner({ script, evidence, assets, timeline: tl, channel: "failure-reconstructed" }).beats : null;
  const r = matchAll({ script, evidence, assets, beats, suggestions: sugg, assetDir: opt("--asset-dir") });
  if (opt("--out")) fs.writeFileSync(opt("--out"), JSON.stringify(r, null, 1) + "\n");
  for (const l of r.lines) console.log(`${l.line} ${l.beat.padEnd(14)} ${l.status.padEnd(18)} ${l.candidates.slice(0, 3).map((c) => `${c.asset}:${c.verdict}(${c.score})`).join("  ")}`);
}
