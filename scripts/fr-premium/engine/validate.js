#!/usr/bin/env node
"use strict";
// Premium engine validator: evidence, assets, shot plan, channel pack and template parameters.
//   node scripts/fr-premium/engine/validate.js <shot-plan.json> [--json report.json]
// Exit 1 on any ERROR. Errors are blocking (a plan with errors must not be rendered for production);
// warnings are reported (e.g. legacy shots that still need manual work).
const fs = require("fs");
const path = require("path");
const { validate: schemaCheck } = require("./jsonschema");
const TIME = require("./timeref");
const CAM = require("./camera-presets");
const COMP = require("./component-extract");
const MATCH = require("./asset-matcher");

const ENGINE = __dirname; const ROOT = path.join(ENGINE, "..", "..", "..");
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const SCHEMA = (n) => readJSON(path.join(ENGINE, "schemas", `${n}.schema.json`));

function loadRegistry() {
  const dir = path.join(ENGINE, "templates"); const reg = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && !x.startsWith("_"))) { const t = require(path.join(dir, f)); reg[t.id] = t; }
  return reg;
}

// Walk a value alongside its schema and collect annotated leaves (x-onscreen, x-factual, x-anchor, x-time, x-illustrative).
function annotated(schema, value, root, at, out) {
  if (!schema || value === undefined) return out;
  if (schema.$ref) return annotated(schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root), value, root, at, out);
  for (const k of ["x-onscreen", "x-factual", "x-anchor", "x-time", "x-illustrative"]) if (schema[k]) out.push({ kind: k, at, value });
  if (schema.oneOf) { const ok = schema.oneOf.find((s) => schemaCheck(s, value, root).length === 0); if (ok) annotated(ok, value, root, at, out); }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => annotated(schema.items, v, root, `${at}[${i}]`, out));
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) for (const [k, v] of Object.entries(value)) if (schema.properties[k]) annotated(schema.properties[k], v, root, `${at}.${k}`, out);
  return out;
}

function validatePlan({ plan, evidence, assets, timeline, root = ROOT, registry = loadRegistry(), suggestions = null }) {
  const errors = [], warnings = []; const E = (shot, msg) => errors.push(shot ? `${shot}: ${msg}` : msg); const Wn = (shot, msg) => warnings.push(shot ? `${shot}: ${msg}` : msg);
  // 1. schemas
  for (const [name, doc] of [["shot-plan", plan], ["evidence", evidence], ["assets", assets]]) for (const e of schemaCheck(SCHEMA(name), doc)) E(null, `${name} schema: ${e}`);
  if (errors.length) return { errors, warnings, stats: null };
  // 2. channel configuration
  const chDir = path.join(root, "channels", plan.channel); let pack = null;
  if (!fs.existsSync(path.join(chDir, "config.json"))) E(null, `channel "${plan.channel}" has no channels/${plan.channel}/config.json`);
  else { const cfg = readJSON(path.join(chDir, "config.json")); if (cfg.slug !== plan.channel) E(null, `channel config slug "${cfg.slug}" does not match plan channel "${plan.channel}"`); if (cfg.enabled === false) E(null, `channel "${plan.channel}" is disabled`); }
  const packFile = path.join(ENGINE, "channels", `${plan.channel}.json`);
  if (!fs.existsSync(packFile)) E(null, `no channel pack engine/channels/${plan.channel}.json`);
  else { pack = readJSON(packFile); for (const e of schemaCheck(SCHEMA("channel-pack"), pack)) E(null, `channel pack: ${e}`);
    if (!pack.styles.includes(plan.style)) E(null, `style "${plan.style}" is not a ${plan.channel} style (${pack.styles.join(", ")})`); }
  if (evidence.topic !== plan.topic || assets.topic !== plan.topic) E(null, `topic mismatch: plan ${plan.topic}, evidence ${evidence.topic}, assets ${assets.topic}`);
  // 3. evidence: sources, verification, numbers present in their passages
  const claims = evidence.claims;
  for (const [id, c] of Object.entries(claims)) {
    if (!evidence.sources[c.source]) E(null, `claim ${id}: unknown source ${c.source}`);
    if (["fact", "estimate", "quote", "measurement"].includes(c.kind) && c.status === "verified" && !c.passage) E(null, `claim ${id}: verified ${c.kind} without a source passage`);
    // the value must appear in its passage as written (valueAsWritten for forms like "27 1/2"); every number in the
    // on-screen display must be the value itself or appear in the passage
    const nums = (x) => (String(x).match(/\d+(?:\.\d+)?/g) || []);
    if (c.status === "verified" && c.passage) { const pass = c.passage.replace(/,/g, "");
      if (c.value != null) { const v = c.value; const forms = c.valueAsWritten ? [c.valueAsWritten] : [String(v), v.toFixed(1), v.toFixed(2), v.toFixed(3)];
        if (!forms.some((f) => (/^\d+$/.test(f) ? new RegExp(`(^|[^\\d.])${f}(?![\\d]|\\.\\d)`).test(pass) : pass.includes(f)))) E(null, `claim ${id}: value ${v} does not appear in its source passage`); }
      // a displayed number must be the value or occur in the passage as a whole number (digit boundaries, so "53" is found in "55:54:53.555" but not in "530")
      for (const n of nums((c.display || "").replace(/\|/g, " "))) if (!(c.value != null && +n === c.value) && !new RegExp(`(^|[^\\d])${n.replace(".", "\\.")}(?!\\d)`).test(pass)) E(null, `claim ${id}: displayed number ${n} is neither its value nor in its passage`); }
  }
  const useClaim = (shot, id, where) => { const c = claims[id]; if (!c) { E(shot, `${where}: unknown claim ${id}`); return null; }
    if (c.status !== "verified") E(shot, `${where}: claim ${id} is ${c.status}${c.note ? ` (${c.note})` : ""}`); return c; };
  // an approximate claim shown with a number must say so on screen
  const APPROX = /(~|≈|\babout\b|\bapprox|\best\.|\bestimated\b|\bapproximately\b)/i;
  // asValue: the text shows the bare number ({C-x.value}), so the display's own marker does not count
  const showClaim = (shot, id, where, context, asValue = false) => { const c = useClaim(shot, id, where); if (!c || !c.approximate) return;
    const shown = String(!asValue && c.display != null ? c.display : c.value);
    if (/\d/.test(shown) && !APPROX.test(shown) && !APPROX.test(context || "")) E(shot, `${where}: approximate claim ${id} is shown as "${shown}" without an approximation marker (~, about, approx., est.)`); };
  // 4. assets: licences, anchors in bounds and referencing evidence
  for (const [key, a] of Object.entries(assets.assets)) {
    if (["cc-by", "cc-by-sa"].includes(a.licence.id) && !a.licence.attribution) E(null, `asset ${key}: ${a.licence.id} requires an attribution`);
    const fw = a.kind === "clip" ? a.clip && a.clip.out.w : a.width, fh = a.kind === "clip" ? a.clip && a.clip.out.h : a.height;
    if (a.kind === "clip" && !a.clip) E(null, `asset ${key}: clip without clip window`);
    for (const [an, v] of Object.entries(a.anchors || {})) {
      const space = v.space; if (space === "clip-frame" && a.kind !== "clip") E(null, `asset ${key}#${an}: clip-frame anchor on a ${a.kind}`);
      const [bw, bh] = space === "clip-frame" ? [fw, fh] : [a.width, a.height];
      const pts = v.point ? [v.point] : v.rect ? [[v.rect.x, v.rect.y], [v.rect.x + v.rect.w, v.rect.y + v.rect.h]] : [];
      for (const [x, y] of pts) if (x < 0 || y < 0 || x > bw || y > bh) E(null, `asset ${key}#${an}: (${x}, ${y}) outside the ${bw}x${bh} ${space}`);
      if (v.claim) useClaim(null, v.claim, `asset ${key}#${an}`);
    }
  }
  // duplicates: two asset keys for the same file or source page
  const byPage = new Map(); for (const [key, a] of Object.entries(assets.assets)) { for (const k2 of [`${a.source.page} ${a.source.title} ${a.file}`, a.sha256].filter(Boolean)) { if (byPage.has(k2) && byPage.get(k2) !== key) E(null, `duplicate asset: ${key} and ${byPage.get(k2)} are the same ${k2 === a.sha256 ? "file (sha256)" : "source page"}`); byPage.set(k2, key); } }
  // suggested anchors stay suggestions: an assets.json anchor may cite a suggestion only once a human VERIFIED it,
  // and may not copy the coordinates of a suggestion that is still SUGGESTED or was REJECTED
  const SG = suggestions ? suggestions.suggestions || [] : [];
  for (const g of SG) { if (!["SUGGESTED", "VERIFIED", "REJECTED"].includes(g.status)) E(null, `anchor suggestion ${g.id}: status "${g.status}" (SUGGESTED / VERIFIED / REJECTED)`);
    if (g.status === "VERIFIED" && !(g.review && g.review.by && g.review.at)) E(null, `anchor suggestion ${g.id}: VERIFIED without a human reviewer and date (review.by, review.at)`); }
  const same = (v, g) => (v.rect && g.rect && ["x", "y", "w", "h"].every((k) => Math.abs(v.rect[k] - g.rect[k]) < 0.5)) || (v.point && g.point && Math.hypot(v.point[0] - g.point[0], v.point[1] - g.point[1]) < 0.5);
  for (const [key, a] of Object.entries(assets.assets)) for (const [an, v] of Object.entries(a.anchors || {})) {
    if (v.suggestion) { const g = SG.find((x) => x.id === v.suggestion); if (!g) E(null, `asset ${key}#${an}: cites suggestion ${v.suggestion}, which is not in anchor-suggestions.json`); else if (g.status !== "VERIFIED") E(null, `asset ${key}#${an}: suggested anchor used as verified (suggestion ${g.id} is ${g.status})`); }
    const copy = SG.find((g) => g.asset === key && g.status !== "VERIFIED" && same(v, g)); if (copy) E(null, `asset ${key}#${an}: suggested anchor used as verified (coordinates of ${copy.id}, status ${copy.status})`); }
  const ID = MATCH.identity(evidence);
  const anchorOf = (shot, ref, where) => { const m = /^asset:([a-z0-9-]+)#([a-z0-9-]+)$/.exec(ref); if (!m) { E(shot, `${where}: bad anchor ref ${ref}`); return null; }
    const a = assets.assets[m[1]]; if (!a) { E(shot, `${where}: unknown asset ${m[1]}`); return null; }
    const v = (a.anchors || {})[m[2]]; if (!v) { E(shot, `${where}: asset ${m[1]} has no anchor "${m[2]}"`); return null; } return v; };
  // 5. narration timing
  const duration = timeline.duration + plan.film.tail; const tRes = (shot, ref, where) => { try { return TIME.resolve(ref, timeline, duration); } catch (e) { E(shot, `${where}: ${e.message}`); return null; } };
  if (plan.film.captionFrom) tRes(null, plan.film.captionFrom, "film.captionFrom");
  for (const l of plan.film.captionSkip || []) if (!timeline.lines.some((x) => x.id === l)) E(null, `film.captionSkip: no line ${l}`);
  // on-screen text: digits only via claim placeholders, citation locators, or identifiers from the shot's assets
  const onscreen = (sid, s, x) => { const stripped = String(x.value).replace(/\{C-[a-z0-9-]+(\.value)?\}/g, "").replace(/\{scale\}/g, "");
        for (const m of String(x.value).matchAll(/\{(C-[a-z0-9-]+)(\.value)?\}/g)) { showClaim(sid, m[1], x.at, m[2] ? String(x.value).replace(m[0], "") : "", !!m[2]); stats.claimsUsed.add(m[1]); }
        // allowed without a claim: citation locators (Vol. 1, p. 90, Ch. III, Fig. 14) and identifiers that are part of
        // a listed asset's own provenance label or title (e.g. "E-207"); any other digit must come from a claim
        const CITE = /\b(?:(?:Vol|p|pp|Fig|Ch|No)\.|Figure|Chapter|Volume)\s?\d+/g; const clean = (tok) => tok.replace(/^[^\w]+|[^\w]+$/g, "");
        const ids = new Set((s.assets || []).flatMap((k) => assets.assets[k] ? [assets.assets[k].provenanceLabel || "", assets.assets[k].source.title] : [])
          .join(" ").replace(CITE, "").split(/\s+/).map(clean).filter((tok) => /\d/.test(tok) && /[A-Za-z]/.test(tok))); // identifiers only, never bare numbers
        const rest = stripped.replace(/<br>/g, " ").replace(CITE, "").split(/\s+/).map(clean).filter((tok) => /\d/.test(tok) && !ids.has(tok));
        if (rest.length) E(sid, `${x.at}: on-screen number "${rest.join(" ")}" in "${x.value}" is not taken from a claim`); };
  // 6. shots
  const stats = { shots: plan.shots.length, dataDriven: 0, legacy: 0, manual: [], byTemplate: {}, claimsUsed: new Set(), assetsUsed: new Set() };
  let prevEnd = 0; const ids = new Set();
  plan.shots.forEach((s, i) => {
    const sid = s.id; if (ids.has(sid)) E(sid, "duplicate shot id"); ids.add(sid);
    const T = registry[s.template];
    if (!T) { E(sid, `unsupported template "${s.template}"`); return; }
    if (pack && !pack.templates.includes(s.template)) E(sid, `template "${s.template}" is not allowed on ${plan.channel}`);
    if (!T.provenance.includes(s.provenance.kind)) E(sid, `template ${s.template} cannot carry provenance "${s.provenance.kind}"`);
    if (pack && !pack.provenanceKinds.includes(s.provenance.kind)) E(sid, `provenance "${s.provenance.kind}" not used on ${plan.channel}`);
    stats.byTemplate[s.template] = (stats.byTemplate[s.template] || 0) + 1;
    if (T.legacy) { stats.legacy += 1; if (!s.manual) E(sid, "legacy-code shot without manual.reason"); else { stats.manual.push({ shot: sid, reason: s.manual.reason }); Wn(sid, `custom code (manual): ${s.manual.reason}`); } } else stats.dataDriven += 1;
    // timing
    const a = tRes(sid, s.start, "start"), b = tRes(sid, s.end, "end");
    if (a != null && b != null) { if (!(b > a)) E(sid, `invalid timing: end ${b.toFixed(3)} <= start ${a.toFixed(3)}`);
      if (Math.abs(a - prevEnd) > 1e-6) E(sid, `invalid timing: starts at ${a.toFixed(3)} but the previous shot ends at ${prevEnd.toFixed(3)} (gap or overlap)`);
      if (b > duration + 1e-6) E(sid, `invalid timing: ends after the film (${duration.toFixed(3)} s)`); prevEnd = b; }
    // transitions
    if (pack && !pack.transitions.includes(s.transition.type)) E(sid, `wrong transition type "${s.transition.type}" (allowed: ${pack.transitions.join(", ")})`);
    if (i > 0 && !s.transition.reason) E(sid, "transition has no reason");
    // evidence
    for (const c of s.evidence) { useClaim(sid, c, "evidence"); stats.claimsUsed.add(c); }
    if (["explanatory", "reconstruction"].includes(s.provenance.kind) && !T.legacy && s.evidence.length === 0) E(sid, `unsupported visual reconstruction: ${s.provenance.kind} shot cites no evidence`);
    for (const k of s.assets || []) { if (!assets.assets[k]) E(sid, `unknown asset ${k}`); else stats.assetsUsed.add(k); }
    // params
    if (!T.legacy || true) for (const e of schemaCheck(T.params, s.params, T.params)) E(sid, `unsupported parameter: ${e.replace(/^\$/, "params")}`);
    const ann = annotated(T.params, s.params, T.params, "params", []);
    const visibleText = [s.provenance.label];
    for (const x of ann) {
      if (x.kind === "x-onscreen") { visibleText.push(String(x.value)); onscreen(sid, s, x); }
      if (x.kind === "x-factual") { if (typeof x.value !== "string" || !/^claim:C-/.test(x.value)) E(sid, `${x.at}: factual value must reference a claim`); else { useClaim(sid, x.value.slice(6), x.at); stats.claimsUsed.add(x.value.slice(6)); } }
      if (x.kind === "x-anchor") { const v = anchorOf(sid, x.value, x.at); const k = x.value.split("#")[0].slice(6); if (v && s.assets && !s.assets.includes(k)) E(sid, `${x.at}: anchor on asset ${k} not listed in shot.assets`); }
      if (x.kind === "x-time") tRes(sid, x.value, x.at);
    }
    for (const r of JSON.stringify(s.params).match(/"asset:[a-z0-9-]+"/g) || []) { const k = r.slice(7, -1); if (!assets.assets[k]) E(sid, `params: unknown asset ${k}`); else if (s.assets && !s.assets.includes(k)) E(sid, `params: asset ${k} not listed in shot.assets`); }
    // a running film clock needs a verified continuous segment of the film covering the excerpt (timeline.segments),
    // whose time base is the clock's claim; a caption alone ("video starts at T-10") does not map an edited film
    if (s.params.filmClock) { const k = String(s.params.media || "").replace(/^asset:/, ""); const as = assets.assets[k]; const tb = String(s.params.filmClock.timeBase || "").replace(/^claim:/, "");
      const seg = as && as.clip && as.timeline ? as.timeline.segments.find((g) => g.timeBase === tb && g.from <= as.clip.from && g.to >= as.clip.to) : null;
      if (!seg) E(sid, `unsupported film clock: asset ${k} has no verified continuous segment covering ${as && as.clip ? `${as.clip.from}-${as.clip.to} s` : "the excerpt"} with time base ${tb}${as && as.timeline && as.timeline.edited ? " (the film is an edited compilation)" : ""}`); }
    // camera positions: zoom range, focus inside the image, and a marked anchor inside the mobile safe zone at the last key
    if (["archival-plate", "trace-over-photo", "payoff"].includes(s.template) && s.params.camera && s.params.camera.mode !== "crop" && Array.isArray(s.params.camera.keys)) {
      const k = String(s.params.media || "").replace(/^asset:/, ""); const as = assets.assets[k];
      if (as && as.kind !== "clip") { const b0 = s.params.box || { x: 0, y: 0, w: CAM.W, h: CAM.H }; const box = { ...b0, h: b0.h === "auto" ? b0.w * as.height / as.width : b0.h };
        const keys = s.params.camera.keys; let last = null; const tpl = s.template;
        keys.forEach((key, j) => { const f = typeof key.focus === "string" ? (() => { const v = anchorOf(sid, key.focus, `params.camera.keys[${j}].focus`); return v ? CAM.pointOf(v) : null; })() : key.focus || (last && last.focus); last = { ...key, focus: f };
          const zmax = tpl === "trace-over-photo" ? 4 : 4; if (!(key.zoom >= 1 && key.zoom <= zmax)) E(sid, `invalid camera position: params.camera.keys[${j}].zoom ${key.zoom} outside 1..${zmax}`);
          if (f && (f[0] < 0 || f[1] < 0 || f[0] > as.width || f[1] > as.height)) E(sid, `invalid camera position: params.camera.keys[${j}].focus (${f}) outside the ${as.width}x${as.height} image`); });
        const mark = s.params.mark && s.params.mark.anchor ? anchorOf(sid, s.params.mark.anchor, "params.mark.anchor") : null;
        if (mark && last && last.focus) for (const msg of CAM.checkCover(as, box, last, CAM.pointOf(mark))) if (/safe zone/.test(msg)) E(sid, `invalid camera position: at the last camera key the ${msg}`); } }
    // channel style: label sizes at or above the channel's mobile minimum
    if (pack && pack.minLabelPx) { const sizes = []; const walk = (o, at) => { if (Array.isArray(o)) o.forEach((v, j) => walk(v, `${at}[${j}]`)); else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) { if (kk === "size" && typeof v === "number") sizes.push([at, v]); else walk(v, `${at}.${kk}`); } };
      walk(s.params, "params"); for (const [at2, v] of sizes) if (v < pack.minLabelPx) E(sid, `mobile typography: ${at2}.size ${v} px is below the ${plan.channel} minimum of ${pack.minLabelPx} px`); }
    // traced geometry must lie on the measured anchor it cites (rect +15 px, point within 150 px)
    const near = (v, x, y) => v.rect ? (x >= v.rect.x - 15 && x <= v.rect.x + v.rect.w + 15 && y >= v.rect.y - 15 && y <= v.rect.y + v.rect.h + 15) : v.point ? Math.hypot(x - v.point[0], y - v.point[1]) <= 150 : false;
    const traced = [...(s.params.paths || []).map((pa, i) => ({ basis: pa.basis, pts: pa.points, at: `params.paths[${i}]` })), ...(s.params.callouts || []).map((c, i) => ({ basis: c.from.basis, pts: [c.from.point], at: `params.callouts[${i}]` }))];
    for (const tr of traced) { const v = anchorOf(sid, tr.basis, tr.at); if (v) for (const [x, y] of tr.pts) if (!near(v, x, y)) E(sid, `unsupported visual reconstruction: ${tr.at} point (${x}, ${y}) is not on its basis ${tr.basis}`); }
    // shared desks are validated against the template's desk schema
    if (s.template === "document-desk" && typeof s.params.desk === "string") { const name = s.params.desk.slice(7); const d = (plan.shared || {})[name];
      if (!d) E(sid, `params.desk: no shared "${name}"`); else { for (const e of schemaCheck(T.deskSchema, d, T.deskSchema)) E(sid, `shared.${name}: ${e}`);
        for (const x of annotated(T.deskSchema, d, T.deskSchema, `shared.${name}`, [])) {
          if (x.kind === "x-anchor") anchorOf(sid, x.value, x.at); if (x.kind === "x-time") tRes(sid, x.value, x.at);
          if (x.kind === "x-factual") { if (!/^claim:C-/.test(x.value)) E(sid, `${x.at}: factual value must reference a claim`); else { useClaim(sid, x.value.slice(6), x.at); stats.claimsUsed.add(x.value.slice(6)); } } }
        if (d.finding) { useClaim(sid, d.finding.claim.slice(6), "finding"); stats.claimsUsed.add(d.finding.claim.slice(6)); }
        for (const tk of (d.rail || {}).ticks || []) showClaim(sid, tk.slice(6), `shared.${name}.rail.ticks`); } }
    if (s.template === "timeline") for (const tk of s.params.ticks || []) showClaim(sid, tk.slice(6), "params.ticks");
    // component scenes: schema, claims, labels in their passages, disclosure by mode, geometry only from verified anchors
    if (T.sceneSchema && s.params.scene) { const name = typeof s.params.scene === "string" ? s.params.scene.slice(7) : null; const sc = name ? (plan.shared || {})[name] : s.params.scene;
      if (!sc) E(sid, `params.scene: no shared "${name}"`); else { const at0 = name ? `shared.${name}` : "params.scene"; const before = errors.length;
        for (const e of schemaCheck(T.sceneSchema, sc, T.sceneSchema)) E(sid, `${at0}: ${e.replace(/^\$/, "")}`);
        if (errors.length === before) {
          for (const x of annotated(T.sceneSchema, sc, T.sceneSchema, at0, [])) { if (x.kind === "x-onscreen") { visibleText.push(String(x.value)); onscreen(sid, s, x); }
            if (x.kind === "x-anchor") { const v = anchorOf(sid, x.value, x.at); const k = x.value.split("#")[0].slice(6); if (v && !(s.assets || []).includes(k)) E(sid, `${x.at}: anchor on asset ${k} not listed in shot.assets`); }
            if (x.kind === "x-time") tRes(sid, x.value, x.at);
            if (x.kind === "x-factual") { if (!/^claim:C-/.test(x.value)) E(sid, `${x.at}: factual value must reference a claim`); else { useClaim(sid, x.value.slice(6), x.at); stats.claimsUsed.add(x.value.slice(6)); } } }
          const ids = new Set(sc.parts.map((q) => q.id)); const passage = (ref) => (claims[String(ref).slice(6)] || {}).passage || "";
          for (const q of sc.parts) { const miss = COMP.labelSupported(q.label, passage(q.claim)); if (miss.length) E(sid, `unsupported visual claim: part ${q.id} label "${q.label}" has words not in ${q.claim.slice(6)}'s passage (${miss.join(", ")})`); }
          for (const l of sc.links) { if (!ids.has(l.from) || !ids.has(l.to)) E(sid, `${at0}.links: ${l.from} -> ${l.to} names an unknown part`);
            const ps = passage(l.claim).toLowerCase(); const ph = (id) => COMP.mentions(passage(l.claim)).some((m) => m.kind === (sc.parts.find((q) => q.id === id) || {}).kind);
            if (!ph(l.from) || !ph(l.to)) E(sid, `unsupported visual claim: link ${l.from} ${l.kind} ${l.to} is not stated in ${l.claim.slice(6)}'s passage`); void ps; }
          for (const st of sc.states) { if (!ids.has(st.part)) E(sid, `${at0}.states: unknown part ${st.part}`);
            if (st.tag) { const miss = COMP.labelSupported(st.tag, passage(st.claim)); if (miss.length) E(sid, `unsupported visual claim: state tag "${st.tag}" has words not in ${st.claim.slice(6)}'s passage (${miss.join(", ")})`); }
            if (st.value) showClaim(sid, st.value.slice(6), `${at0}.states`, st.tag || ""); }
          // archival plates: historical kinds only for images that are not tests/concepts; test imagery must say so on screen
          for (const [j, ap] of (sc.archival || []).entries()) { const k = ap.asset.slice(6); const a2 = assets.assets[k]; if (!a2) { E(sid, `${at0}.archival[${j}]: unknown asset ${k}`); continue; }
            if (!(s.assets || []).includes(k)) E(sid, `${at0}.archival[${j}]: asset ${k} not listed in shot.assets`);
            const ne = MATCH.NONEVENT.exec(`${a2.source.title} ${a2.source.caption || ""}`);
            if (ap.kind !== "test-imagery" && ne) E(sid, `misleading reconstruction visual: ${k} shows a ${ne[0].toLowerCase()} but is labelled ${ap.kind}`);
            if (ap.kind === "test-imagery" && !(/\btest/i.test(ap.label) && /not the accident/i.test(ap.label))) E(sid, `misleading reconstruction visual: test imagery ${k} must be labelled as a test and "not the accident"`);
            if (ap.kind === "historical-footage" && a2.kind !== "clip") E(sid, `${at0}.archival[${j}]: ${k} is a ${a2.kind}, not footage`); }
          // meters: each tag uses only words of its claim's passage; values are verified claims (approximate ones keep their marker)
          for (const mt of sc.meters || []) for (const e of mt.entries) { const src = e.tagClaim || e.value; const miss = COMP.labelSupported(e.tag, passage(src)); if (miss.length) E(sid, `unsupported visual claim: meter tag "${e.tag}" has words not in ${src.slice(6)}'s passage (${miss.join(", ")})`);
            showClaim(sid, e.value.slice(6), `${at0}.meters`, e.tag); }
          if (sc.states.length < 3) E(sid, `qa: component scene ${name || ""} has ${sc.states.length} documented states, component-section expects >= 3`);
          const vis = visibleText.join(" ").toLowerCase();
          if (sc.mode === "conceptual") { if (!/conceptual/.test(String(sc.disclosure).toLowerCase())) E(sid, "misleading reconstruction visual: conceptual component scene without a visible \"conceptual\" disclosure");
            if (sc.scale.mode !== "schematic") E(sid, "unsupported geometry: a conceptual scene has no measured geometry, so its scale must be \"schematic\"");
            if (sc.drawing || sc.parts.some((q) => q.anchor)) E(sid, "unsupported geometry: conceptual scenes do not take drawing anchors (use mode \"measured\")");
            if (pack && !pack.illustrativeLabels.some((l) => vis.includes(l))) E(sid, `unsupported visual reconstruction: conceptual scene without a visible scale label (${pack.illustrativeLabels.join(" / ")})`); }
          else { const dk = sc.drawing ? sc.drawing.slice(6) : null; if (!dk) E(sid, "unsupported geometry: measured scene without a drawing");
            const rated = new Set(sc.links.filter((l) => l.kind === "rated-for").map((l) => l.to));
            for (const q of sc.parts.filter((x) => !x.layerOf && !(rated.has(x.id) && !sc.links.some((l) => (l.from === x.id || l.to === x.id) && l.kind !== "rated-for")))) {
              if (!q.anchor) { E(sid, `unsupported geometry: measured part ${q.id} has no verified anchor`); continue; }
              const v = anchorOf(sid, q.anchor, `${at0}.parts.${q.id}`); if (v && v.role !== "mechanism-part") E(sid, `unsupported geometry: part ${q.id} anchor ${q.anchor} has role ${v.role}, not mechanism-part`);
              if (dk && !q.anchor.startsWith(`asset:${dk}#`)) E(sid, `unsupported geometry: part ${q.id} is anchored on another asset than the scene drawing`); } } } } }
    // document excerpts: the highlighted words are in the passage, and the card says it is typeset
    if (s.template === "document-excerpt") { const c = claims[String(s.params.claim).slice(6)];
      if (c) { if (!["finding", "quote"].includes(c.role)) E(sid, `document-excerpt: ${s.params.claim.slice(6)} is a ${c.role || "claim"} claim, not a finding or quote`);
        const hl = String(c.display || "").replace(/\|/g, " "); if (!hl || !(c.passage || "").includes(hl)) E(sid, `unsupported visual claim: excerpt highlight "${hl}" is not verbatim in the passage`); }
      if (!/typeset|not a scan/i.test(String(s.params.disclosure))) E(sid, "misleading reconstruction visual: a typeset excerpt must say it is typeset, not a scan");
      const bd = s.params.backdrop; if (bd) { const k = bd.asset.slice(6); const a2 = assets.assets[k]; const ne = a2 && MATCH.NONEVENT.exec(`${a2.source.title} ${a2.source.caption || ""}`);
        if (ne && bd.kind !== "test-imagery") E(sid, `misleading reconstruction visual: backdrop ${k} shows a ${ne[0].toLowerCase()} but is labelled ${bd.kind}`);
        if (bd.kind === "test-imagery" && !(/\btest/i.test(bd.label) && /not the accident/i.test(bd.label))) E(sid, `misleading reconstruction visual: test imagery ${k} must be labelled as a test and "not the accident"`); } }
    // imagery from another mission, vehicle or period, and tests/concepts shown as if they were the event
    for (const k of s.assets || []) { const a2 = assets.assets[k]; if (!a2) continue; const sj = MATCH.subjectCheck(a2, ID);
      if (sj.reject) E(sid, `wrong subject imagery: asset ${k} ${sj.reasons.join("; ")}`);
      const ne = MATCH.NONEVENT.exec(`${a2.source.title} ${a2.source.caption || ""}`);
      if (ne && !new RegExp(ne[0].split(/\s+/)[0].slice(0, 5), "i").test(`${s.provenance.label} ${visibleText.join(" ")}`) && !/reconstruction|test|concept|model/i.test(s.provenance.label))
        E(sid, `misleading reconstruction visual: asset ${k} shows a ${ne[0].toLowerCase()}, but the shot does not say so`); }
    // illustrative values must be labelled on screen
    const illus = ann.some((x) => x.kind === "x-illustrative") || (s.params.scale && s.params.scale.mode === "schematic");
    if (illus && pack) { const vis = visibleText.join(" ").toLowerCase(); if (!pack.illustrativeLabels.some((l) => vis.includes(l))) E(sid, `unsupported visual reconstruction: illustrative values without a visible label (${pack.illustrativeLabels.join(" / ")})`); }
    // visual exaggeration must be derived from evidence, declared, and shown with its factor
    const vis = visibleText.join(" "); const sc = s.params.scale; const shownF = (f) => vis.includes("×{scale}") || vis.includes(`×${f}`);
    if (T.exaggeration) { let f = null; try { f = T.exaggeration(s.params, (ref) => claims[String(ref).replace(/^claim:/, "")] || {}); } catch (e) { f = null; }
      if (f == null || !isFinite(f)) E(sid, `visual scale cannot be derived from evidence (template ${s.template} needs its ring-diameter and gap claims)`);
      else if (f > 1.05 && (!sc || sc.mode !== "declared-exaggeration")) E(sid, `visual exaggeration ×${f.toFixed(1)} must be declared (scale.mode "declared-exaggeration") and shown`);
      else if (sc && sc.mode === "declared-exaggeration") { if (!sc.factor) E(sid, "declared exaggeration without a factor");
        else if (Math.abs(f - sc.factor) / sc.factor > 0.05) E(sid, `declared exaggeration ×${sc.factor} does not match the evidence (×${f.toFixed(2)})`);
        else if (!shownF(sc.factor)) E(sid, `declared exaggeration ×${sc.factor} is not shown on screen`); } }
    else if (sc && sc.mode === "declared-exaggeration") { if (!sc.factor) E(sid, "declared exaggeration without a factor"); else if (!shownF(sc.factor)) E(sid, `declared exaggeration ×${sc.factor} is not shown on screen`); }
    // QA expectations
    const min = s.qa.minStates != null ? s.qa.minStates : T.minStates;
    if (!T.legacy && s.qa.states.length < min) E(sid, `qa: ${s.qa.states.length} narration-timed states, template ${s.template} expects >= ${min}`);
    for (const st of s.qa.states) { const t = tRes(sid, st.at, "qa.states"); if (t != null && a != null && b != null && (t < a - 1e-6 || t > b + 1e-6)) E(sid, `qa state "${st.what}" at ${t.toFixed(2)} s is outside the shot`); if (st.claim) useClaim(sid, st.claim, "qa.states"); }
    // registered = tied to archival geometry: an explicit register block, a trace over a photo, or a mechanism drawn from a document's measured anchors
    if (s.qa.registered && !(s.params.register || s.template === "trace-over-photo" || (s.template === "joint-mechanism" && s.params.drawing))) E(sid, "qa.registered is set but the shot declares no registration");
  });
  if (Math.abs(prevEnd - duration) > 1e-3) E(null, `invalid timing: shots end at ${prevEnd.toFixed(3)} s, the film at ${duration.toFixed(3)} s`);
  stats.claimsUsed = stats.claimsUsed.size; stats.assetsUsed = stats.assetsUsed.size;
  return { errors, warnings, stats };
}

function loadPlanFiles(planFile) {
  const plan = readJSON(planFile); const dir = path.dirname(planFile);
  const assetsFile = path.resolve(dir, plan.assets); const sg = path.join(path.dirname(assetsFile), "anchor-suggestions.json");
  return { plan, evidence: readJSON(path.resolve(dir, plan.evidence)), assets: readJSON(assetsFile), timeline: readJSON(path.resolve(dir, plan.narration)), ...(fs.existsSync(sg) ? { suggestions: readJSON(sg) } : {}) };
}

if (require.main === module) {
  const file = process.argv[2]; if (!file) { console.error("usage: validate.js <shot-plan.json> [--json out]"); process.exit(2); }
  const r = validatePlan(loadPlanFiles(path.resolve(file)));
  for (const e of r.errors) console.log("ERROR  " + e);
  for (const w of r.warnings) console.log("WARN   " + w);
  if (r.stats) console.log(`shots ${r.stats.shots}: ${r.stats.dataDriven} data-driven, ${r.stats.legacy} legacy code; templates ${JSON.stringify(r.stats.byTemplate)}; claims used ${r.stats.claimsUsed}; assets used ${r.stats.assetsUsed}`);
  console.log(r.errors.length ? `INVALID (${r.errors.length} errors, ${r.warnings.length} warnings)` : `VALID (${r.warnings.length} warnings)`);
  const j = process.argv.indexOf("--json"); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(r, null, 1) + "\n");
  process.exit(r.errors.length ? 1 : 0);
}
module.exports = { validatePlan, loadPlanFiles, loadRegistry };
