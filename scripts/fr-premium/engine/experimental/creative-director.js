// Creative Director V1 (EXPERIMENTAL, not used by production or the planner). A deterministic decision
// layer that reads a planner shot plan plus the topic's evidence, assets and matcher verdicts, scores each
// shot for storytelling (curiosity, novelty, explanation, density, emotion, rhythm, continuity) and writes
// (a) per-line recommendations and (b) a storyboard plan that only re-sequences existing templates, claims
// and licensed assets. It adds no claim, number, geometry or asset; every output plan is re-checked by
// validate.js like any other plan. Scores are rule-based heuristics, not measured retention.
//
//   node scripts/fr-premium/engine/experimental/creative-director.js --plan auto/shot-plan.auto.json \
//        --script narration-script.json --evidence evidence.json --assets assets.json \
//        --timeline timeline-estimated.json --matches auto/asset-matches.json \
//        --out experimental/shot-plan.cd.json --report experimental/creative-director.json
"use strict";
const fs = require("fs"); const path = require("path"); const TIME = require("../timeref.js");

// Rules (numbers are craft defaults for 9:16 documentary Shorts, chosen before measuring this pilot)
const RULE = {
  maxModeSeconds: 18,    // R1 one visual mode held longer than this is split (leading setup line peeled off)
  maxModeLines: 3,       // R1 ... or longer than this many narration lines
  minShot: 1.5,          // R8 no shot shorter than this (readability)
  hookHeadline: 1.2,     // R5 the hook headline stays readable at least this long
  hookZoom: 1.12,        // R5 hook push (centre focus unless a VERIFIED point of interest exists)
  aheadShare: 0.6,       // R6 an image depicting a claim cued after this share of the line is "ahead of the narration"
};
const CONTRAST = /\b(but|already|could not|cannot|may have|only|lost|never)\b/i;
const STOP = new Set(["the", "and", "with", "from", "that", "this", "were", "was", "into", "only", "about", "apollo", "thirteen"]);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
const stem = (w) => norm(w).replace(/(ing|ed|es|s)$/, "");
const TIMEISH = /\d+:\d{2}(:\d{2})?/;

function context({ plan, script, evidence, assets, timeline, matches }) {
  const dur = timeline.duration + plan.film.tail; const at = (r) => TIME.resolve(r, timeline, dur);
  const C = evidence.claims, A = assets.assets; const lines = script.lines; const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const words = (id) => timeline.words.filter((w) => w.line === id);
  const verdict = {}; for (const m of matches.lines) for (const c of m.candidates) (verdict[c.asset] = verdict[c.asset] || {})[m.line] = c.verdict;
  const onTopic = (k) => Object.values(verdict[k] || {}).some((v) => v === "ACCEPT" || v === "NEEDS_HUMAN_REVIEW");
  const isTest = (k) => /\btest\b/i.test(`${A[k].provenanceLabel} ${A[k].source.caption || ""}`);
  return { plan, script, C, A, lines, L, words, at, dur, verdict, onTopic, isTest };
}

// visual mode of a shot (what the viewer sees, not the template name)
function modeOf(s, X) {
  if (s.template === "component-section") return "conceptual-mechanism";
  if (s.template === "document-excerpt") return "document";
  if (s.template === "timeline") return "evidence-highlight";
  if (s.template === "payoff") return "payoff";
  const k = String(s.params.media || "").slice(6); const a = X.A[k] || {}; const tags = a.tags || [];
  if (a.kind === "document") return "historical-document";
  if (tags.includes("damage")) return "event-consequence";
  if (tags.includes("portrait") || tags.includes("setting")) return "human-outcome";
  return "archival-photo";
}
const stage = (beat, text, i, n) => i === 0 ? "hook" : i === n - 1 ? "payoff" : /^but\b/i.test(text) ? "turn" : /could not|cannot/i.test(text) ? "escalation"
  : /damag|thousand|fire/i.test(text) && beat === "mechanism" ? "climax" : beat === "human-cost" && /lost|pressure|separat/i.test(text) ? "consequence"
  : beat === "decision" ? "verdict" : beat === "human-cost" ? "relief" : "setup";

// ------------------------------------------------------------------ Phase 1: diagnosis
function diagnose(X) {
  const shots = X.plan.shots; const out = []; let run = null; const seen = new Set(); const n = X.lines.length;
  const sharedStates = (s) => { const sc = s.params && typeof s.params.scene === "string" ? X.plan.shared[s.params.scene.slice(7)] : null; return sc ? sc.states : []; };
  shots.forEach((s, j) => {
    const a = X.at(s.start), b = X.at(s.end), d = b - a; const mode = modeOf(s, X); const li = X.lines.findIndex((l) => l.id === s.line); const line = X.lines[li];
    const sceneKey = s.params.scene || s.params.media || s.template;
    if (run && run.mode === mode && run.key === sceneKey) { run.sec += d; run.lines.add(s.line); } else run = { mode, key: sceneKey, sec: d, lines: new Set([s.line]), from: s.id };
    const assetsHere = s.assets || []; const fresh = assetsHere.filter((k) => !seen.has(k)); assetsHere.forEach((k) => seen.add(k));
    const prev = out[out.length - 1];
    const states = sharedStates(s).filter((st) => { const t = X.at(st.at); return t >= a && t < b; }).length + (s.params.stat ? 1 : 0) + (s.params.highlightAt ? 1 : 0) + (s.params.ticks ? s.params.ticks.length : 0) + (s.params.mark ? 1 : 0);
    const risks = [];
    if (run.sec > RULE.maxModeSeconds || run.lines.size > RULE.maxModeLines) risks.push({ code: "HOLD_TOO_LONG", detail: `${mode} held ${run.sec.toFixed(1)} s over ${run.lines.size} lines since ${run.from}` });
    if (s.beat !== "payoff" && assetsHere.length && !fresh.length && prev && prev.mode === mode && prev.key !== sceneKey) risks.push({ code: "REPEATED_VISUAL", detail: "asset already shown" });
    const timeClaims = (line ? line.claims : []).filter((c) => X.C[c] && TIMEISH.test(X.C[c].display || ""));
    const lineShowsTimes = shots.some((x) => x.line === s.line && x.template === "timeline");
    if (timeClaims.length >= 2 && !lineShowsTimes) risks.push({ code: "TIMES_NOT_SHOWN", detail: `${timeClaims.join(", ")} are documented times; the shot shows none of them` });
    // the hook image sets the scene before it is named, so it is exempt
    if (s.template === "archival-plate" && line && s.beat !== "hook" && X.A[String(s.params.media).slice(6)]) { const k = String(s.params.media).slice(6); const dep = (X.A[k].depicts || []).filter((c) => line.claims.includes(c));
      for (const c of dep) { const cue = cueOf(X, line.id, c); const L0 = X.L[line.id]; const lead = cue == null ? 0 : cue - a; // seconds the image is on screen before its claim is spoken
        if (cue != null && lead > 1 && (cue - L0.start) / (L0.end - L0.start) > RULE.aheadShare) risks.push({ code: "VISUAL_AHEAD_OF_NARRATION", detail: `${k} depicts ${c}, which the narration reaches only at ${cue.toFixed(2)} s, ${lead.toFixed(1)} s after the image appears` }); } }
    if (line) for (const [k, a2] of Object.entries(X.A)) { if (assetsUsed(X.plan).has(k) || !X.onTopic(k) || X.isTest(k) || !human(a2)) continue;
      const hit = nameHit(X, line.id, k); if (hit) risks.push({ code: "NAMED_BUT_NOT_SHOWN", detail: `the line names "${hit.text}"; unused on-topic asset ${k} shows it (caption: "${a2.source.caption.slice(0, 70)}…")` }); }
    const bd = s.params.backdrop; if (bd && bd.kind === "test-imagery") { const alt = Object.keys(X.A).filter((k) => !X.isTest(k) && (X.A[k].tags || []).includes("damage") && X.onTopic(k)); if (alt.length) risks.push({ code: "TEST_IMAGERY_WHERE_HISTORICAL_EXISTS", detail: `backdrop is a test photo; historical ${alt.join(", ")} show the event's result` }); }
    if (s.beat === "hook") { const hl = s.params.headline; if (hl && hl.out) { const vis = X.at(hl.out[1]) - a; if (vis < RULE.hookHeadline) risks.push({ code: "HOOK_TEXT_TOO_BRIEF", detail: `headline readable ${vis.toFixed(1)} s` }); }
      const box = s.params.box; if (box && box.h < 1500) risks.push({ code: "DEAD_ZONE", detail: `picture ends at y ${box.y + box.h}; ${Math.round(100 * (1920 - box.y - box.h) / 1920)}% of the frame is flat ink` });
      const z = Math.max(...s.params.camera.keys.map((k) => k.zoom)); if (z < RULE.hookZoom) risks.push({ code: "STATIC_OPENING", detail: `hook camera travels to zoom ${z} only` }); }
    if (d < RULE.minShot) risks.push({ code: "SHOT_TOO_SHORT", detail: `${d.toFixed(2)} s` });
    const novelty = (prev ? (prev.mode !== mode ? 1 : 0) : 1) + (fresh.length ? 1 : 0);
    const curiosity = !line ? 0 : (li === 0 || CONTRAST.test(line.text)) ? 2 : line.claims.some((c) => X.C[c] && X.C[c].display && /\d/.test(X.C[c].display)) ? 1 : 0;
    out.push({ shot: s.id, line: s.line, mode, key: sceneKey, start: +a.toFixed(2), dur: +d.toFixed(2), stage: line ? stage(s.beat, line.text, li, n) : "-",
      scores: { curiosity, novelty, explanatory: Math.min(2, states), density: line ? +((line.claims.length) / Math.max(d, 0.1)).toFixed(2) : 0 },
      run: +run.sec.toFixed(1), risks });
  });
  return out;
}
const human = (a) => (a.tags || []).some((t) => t === "portrait" || t === "setting");
function assetsUsed(plan) { const u = new Set(); for (const s of plan.shots) for (const k of s.assets || []) u.add(k); return u; }
// first word of a line that matches a claim's passage (content words only), searched from an optional time
function cueOf(X, lineId, claimId, from = -1) { const pass = new Set(String(X.C[claimId].passage).split(/\s+/).map(stem).filter((w) => w.length > 3 && !STOP.has(w)));
  const w = X.words(lineId).find((x) => x.start > from && pass.has(stem(x.text)) && !STOP.has(norm(x.text))); return w ? w.start : null; }
function cueWord(X, lineId, claimId, from = -1) { const pass = new Set(String(X.C[claimId].passage).split(/\s+/).map(stem).filter((w) => w.length > 3 && !STOP.has(w)));
  return X.words(lineId).find((x) => x.start > from && pass.has(stem(x.text)) && !STOP.has(norm(x.text))) || null; }
// a narration word (>= 5 letters, not the topic name) that the asset's own caption also uses
function nameHit(X, lineId, k) { const cap = new Set(String(X.A[k].source.caption || "").split(/\s+/).map(stem).filter((w) => w.length >= 5));
  return X.words(lineId).find((w) => norm(w.text).length >= 5 && !STOP.has(norm(w.text)) && cap.has(stem(w.text))) || null; }
const wref = (X, lineId, w, off = 0) => { const same = X.words(lineId).filter((x) => norm(x.text) === norm(w.text)); const k = same.indexOf(w);
  return `word:${lineId}:${w.text.replace(/[^\w'-]/g, "")}${k > 0 ? `#${k}` : ""}${off ? ` ${off > 0 ? "+" : ""}${off}` : ""}`; };

// ------------------------------------------------------------------ Phase 2-4: direction + storyboard
function direct(X, diag) {
  const P = JSON.parse(JSON.stringify(X.plan)); const log = []; const apply = (rule, what) => log.push({ rule, what });
  const byId = (id) => P.shots.find((s) => s.id === id);
  // R5 hook: readable headline, a real push, full use of the frame above the caption band
  const hook = P.shots.find((s) => s.beat === "hook");
  if (hook && hook.template === "archival-plate" && X.A[String(hook.params.media).slice(6)]) { const hl = hook.params.headline; const k = String(hook.params.media).slice(6); const a = X.A[k];
    const poiVerified = Object.values(a.anchors || {}).some((v) => v.role === "point-of-interest");
    if (hl) { hl.out = [String(RULE.hookHeadline), String(RULE.hookHeadline + 0.3)]; P.film.captionFrom = String(RULE.hookHeadline + 0.3); apply("R5", `${hook.id}: headline held to ${RULE.hookHeadline + 0.3} s; captions start after it`); }
    // a marked (verified) anchor keeps the planner's framing: its safe-zone check was made for that box
    if (!hook.params.mark && hook.params.box && hook.params.box.h < 1500) { hook.params.box = { x: 0, y: 0, w: 1080, h: 1920 }; hook.params.shades = [{ kind: "top", h: 640 }, { kind: "bottom", y: 1080, h: 840 }]; apply("R5", `${hook.id}: full-bleed photo with a bottom shade for the caption (no flat ink band)`); }
    if (!poiVerified && !hook.params.mark) { const keys = hook.params.camera.keys; keys[keys.length - 1].zoom = RULE.hookZoom; apply("R5", `${hook.id}: centre push to ${RULE.hookZoom} (no VERIFIED point of interest, so no aimed move)`); }
    const pay = P.shots.find((s) => s.template === "payoff"); if (pay && pay.params.media === hook.params.media && !hook.params.mark) { pay.params.box = { ...hook.params.box }; pay.params.shades = hook.params.shades.map((x) => ({ ...x })); pay.params.camera.keys[0].zoom = RULE.hookZoom; apply("R5", `${pay.id}: payoff mirrors the hook framing so the loop lands on frame 0`); } }
  // R1 mode-run cap: peel the leading line of an over-long conceptual scene onto the scene's own historical plates
  for (const [name, sc] of Object.entries(P.shared || {})) {
    const own = P.shots.filter((s) => s.params.scene === `shared:${name}`); if (own.length < 2) continue;
    const secs = X.at(own[own.length - 1].end) - X.at(own[0].start);
    if (!(secs > RULE.maxModeSeconds || own.length > RULE.maxModeLines) || !(sc.archival || []).length) continue;
    const first = own[0]; const lineId = first.line; const plates = sc.archival.filter((ap) => !X.isTest(ap.asset.slice(6)));
    if (!plates.length) continue;
    // value cue of the peeled line (its first numeric state), to land a stat on the last plate
    const vstate = sc.states.find((st) => st.value && String(st.at).startsWith(`word:${lineId}:`));
    const L0 = X.L[lineId]; const vt = vstate ? X.at(vstate.at) : L0.end; const words = X.words(lineId);
    const splitW = plates.length > 1 ? words.reduce((b, w) => Math.abs(w.start - (L0.start + vt) / 2) < Math.abs(b.start - (L0.start + vt) / 2) ? w : b) : null;
    const bounds = [first.start, ...(splitW ? [wref(X, lineId, splitW, -0.1)] : []), first.end];
    const part = vstate && sc.parts.find((q) => q.claim === vstate.value && q.kind === "supply");
    const newShots = plates.slice(0, bounds.length - 1).map((ap, j) => { const k = ap.asset.slice(6); const a = X.A[k]; const last = j === bounds.length - 2;
      // fit between the top UI (y 280, or under the stat) and the caption band (y 1280)
      const top = last && vstate ? 560 : 280; const w = Math.min(1080, Math.round((1280 - top) * a.width / a.height)); const h = Math.round(w * a.height / a.width);
      const y = Math.round(top + (1280 - top - h) / 2); const x = Math.round((1080 - w) / 2);
      const p = { media: ap.asset, chip: { label: a.provenanceLabel, kind: "document" }, box: { x, y, w, h }, plate: { blur: 40, dim: 0.38 }, under: "ink",
        camera: { keys: [{ at: bounds[j], focus: [a.width / 2, a.height / 2], zoom: 1 }, { at: bounds[j + 1], focus: [a.width / 2, a.height / 2], zoom: 1.08 }] } };
      const stamp = (sc.stamps || [])[0]; if (j === 0 && stamp) p.kicker = { text: stamp.value, y: Math.max(200, y - 70) };
      if (last && vstate) p.stat = { value: `{${vstate.value.slice(6)}}`, sub: (part ? part.label : vstate.tag.replace(/\{[^}]+\}/g, "")).toUpperCase().trim(), y: 250, in: [vstate.at, `${vstate.at} +0.4`] };
      return { id: `${first.id}${String.fromCharCode(97 + j)}`, beat: first.beat, line: lineId, start: bounds[j], end: bounds[j + 1], evidence: [...first.evidence],
        qa: { states: last && vstate ? [{ at: vstate.at, what: `stat ${vstate.value.slice(6)}`, claim: vstate.value.slice(6) }] : [{ at: bounds[j], what: "historical drawing (unmarked)" }] },
        template: "archival-plate", provenance: { kind: "document", label: a.provenanceLabel }, assets: [k], params: p,
        transition: j === 0 ? { type: "cut", reason: "setup line on the historical drawing before the conceptual model" } : { type: "cut", reason: "second drawing on the narration's subject word" } }; });
    // the scene now starts on the next line; its plates move out, camera keys and stamps of the peeled line drop
    const next = own[1]; sc.span = [next.start, sc.span[1]]; sc.archival = sc.archival.filter((ap) => !plates.includes(ap)); if (!sc.archival.length) delete sc.archival;
    sc.camera = sc.camera.filter((k) => !String(k.at).startsWith(`line:${lineId} `)); sc.stamps = (sc.stamps || []).filter((st) => !String(st.window[0]).startsWith(`line:${lineId} `)); if (!sc.stamps.length) delete sc.stamps;
    for (const s of own) s.assets = (s.assets || []).filter((k) => !plates.some((ap) => ap.asset === `asset:${k}`));
    next.params.enter = [next.start, `${next.start.replace(/ [+-][\d.]+$/, "")} +0.3`]; next.transition = { type: "cut", reason: "into the conceptual model on the contrast line" };
    next.qa.states.unshift({ at: next.start, what: "conceptual model enters (prior state already set: fill from the drawing's stat)" });
    P.shots.splice(P.shots.indexOf(first), 1, ...newShots);
    apply("R1", `${name}: ${secs.toFixed(1)} s / ${own.length} lines over the cap; ${lineId} moved to ${newShots.map((s) => s.assets[0]).join(" → ")}, model enters on ${next.line}`); }
  // R2 documented times: a line with >= 2 time claims becomes a timeline; R6 an image that depicts a late-cued claim moves to that cue
  for (const s of [...P.shots]) { if (s.template !== "archival-plate" || !s.line) continue; const line = X.lines.find((l) => l.id === s.line);
    const tc = line.claims.filter((c) => X.C[c] && TIMEISH.test(X.C[c].display || "")); if (tc.length < 2) continue;
    const cues = []; let from = -1; for (const c of tc) { const w = cueWord(X, line.id, c, from); if (!w) break; cues.push({ c, w }); from = w.start; }
    if (cues.length < 2) continue;
    // a word marks the second time only if it is the line's phrase about it: prefer an explicit "later"
    const later = X.words(line.id).find((w) => /^later$/i.test(norm(w.text))); if (later) cues[1].w = later;
    const k = String(s.params.media).slice(6); if (!X.A[k]) continue; const dep = (X.A[k].depicts || []).find((c) => line.claims.includes(c) && !tc.includes(c));
    const cw = dep ? cueWord(X, line.id, dep, cues[1].w.start) : null; const cut = cw ? wref(X, line.id, cw, -0.3) : null;
    // ground: a historical drawing already in the film whose caption names the line's subject (a drawing implies no moment;
    // a photo under a clock would read as "taken at that time")
    const drawing = Object.keys(X.A).find((k2) => X.A[k2].kind === "document" && assetsUsed(P).has(k2) && X.words(line.id).some((w) => norm(w.text).length > 3 && String(X.A[k2].source.caption || "").toLowerCase().split(/\W+/).map(stem).includes(stem(w.text))));
    const tl = { id: `${s.id}a`, beat: s.beat, line: s.line, start: s.start, end: cut || s.end, evidence: tc, qa: { states: cues.map((q) => ({ at: wref(X, line.id, q.w), what: `clock to ${q.c}`, claim: q.c })) },
      template: "timeline", provenance: { kind: "document", label: "Mission time · Review Board report" }, assets: drawing ? [drawing] : [],
      params: { hero: true, ...(drawing ? { ground: "photo", groundGrade: "soft", media: `asset:${drawing}` } : {}), ticks: tc.map((c) => `claim:${c}`), steps: cues.slice(1).map((q) => ({ at: wref(X, line.id, q.w) })), chip: { label: drawing ? `Report · ${X.A[drawing].provenanceLabel}` : "Mission time · report", kind: "document" } },
      transition: { type: "cut", reason: "documented times: the clock carries the ninety seconds" } };
    const rest = cut ? [{ ...s, id: `${s.id}b`, start: cut, evidence: [dep], params: { ...s.params, camera: { keys: [{ ...s.params.camera.keys[0], at: cut }, { ...s.params.camera.keys[1], zoom: 1.1 }] } },
      qa: { states: [{ at: cut, what: "result image lands on the narration's consequence", claim: dep }] }, transition: { type: "hard-cut", reason: "the consequence lands on its word" } }] : [];
    P.shots.splice(P.shots.indexOf(s), 1, tl, ...rest);
    apply("R2", `${s.id}: ${tc.join(" → ")} on a timeline${cut ? `; ${k} moves to "${cw.text}" (${X.at(cut).toFixed(2)} s), where the narration reaches ${dep}` : ""}`); }
  // R3 finding backdrop: a historical image of the event's result, not a test photo, when one is licensed and on topic
  for (const s of P.shots) { const bd = s.params.backdrop; if (!bd || bd.kind !== "test-imagery") continue;
    const near = new Set(P.shots.slice(Math.max(0, P.shots.indexOf(s) - 1), P.shots.indexOf(s)).flatMap((x) => x.assets || []));
    const alt = Object.keys(X.A).filter((k) => !X.isTest(k) && (X.A[k].tags || []).includes("damage") && X.onTopic(k) && !near.has(k))
      .sort((p, q) => (X.verdict[q][s.line] === "ACCEPT") - (X.verdict[p][s.line] === "ACCEPT") || Object.values(X.verdict[q]).filter((v) => v === "ACCEPT").length - Object.values(X.verdict[p]).filter((v) => v === "ACCEPT").length)[0];
    if (!alt) continue; const old = bd.asset.slice(6);
    s.params.backdrop = { asset: `asset:${alt}`, kind: "historical-photo", label: X.A[alt].provenanceLabel }; s.assets = (s.assets || []).filter((k) => k !== old).concat(alt);
    apply("R3", `${s.id}: backdrop ${old} (test) → ${alt} (historical: the result of the event the finding names)`); }
  // R4 a line that names what an unused on-topic photo shows gets that photo from the naming phrase
  for (const s of [...P.shots]) { if (s.template !== "archival-plate" || !s.line) continue; const used = assetsUsed(P);
    for (const [k, a] of Object.entries(X.A)) { if (used.has(k) || !X.onTopic(k) || X.isTest(k) || !human(a)) continue; const w = nameHit(X, s.line, k); if (!w) continue;
      const ws = X.words(s.line); let i = ws.indexOf(w); while (i > 0 && i > ws.indexOf(w) - 2 && !/^(and|or|by|to)$/i.test(norm(ws[i - 1].text)) && !/[,.]$/.test(ws[i - 1].text)) i -= 1;
      const cut = wref(X, s.line, ws[i], -0.1); const end = X.at(s.end); if (end - X.at(cut) < RULE.minShot || X.at(cut) - X.at(s.start) < RULE.minShot) continue;
      const portrait = a.height > a.width; const box = portrait ? s.params.box : { x: 0, y: 520, w: 1080, h: "auto" };
      const b = { id: `${s.id}b`, beat: s.beat, line: s.line, start: cut, end: s.end, evidence: [...s.evidence], qa: { states: [{ at: cut, what: `${k} on "${w.text}"` }] },
        template: "archival-plate", provenance: { kind: "archival", label: a.provenanceLabel }, assets: [k], review: { codes: ["CONFIRM_DEPICTION"] },
        params: { media: `asset:${k}`, chip: { label: a.provenanceLabel, kind: "archival" }, box, plate: { blur: 40, dim: 0.5 }, under: "ink",
          camera: { keys: [{ at: cut, focus: [a.width / 2, a.height / 2], zoom: 1 }, { at: s.end, focus: [a.width / 2, a.height / 2], zoom: 1.06 }] } },
        transition: { type: "cut", reason: `the narration names "${w.text}"` } };
      s.end = cut; if (s.params.camera) s.params.camera.keys[s.params.camera.keys.length - 1].at = cut; s.params.plate = s.params.plate || { blur: 40, dim: 0.5 };
      P.shots.splice(P.shots.indexOf(s) + 1, 0, b); apply("R4", `${s.id}: "${w.text}" is named; ${k} (unused, on topic, matcher ${Object.values(X.verdict[k]).find((v) => v !== "NOT_DEPICTED")}) from ${X.at(cut).toFixed(2)} s`); break; } }
  // R7 a consequence photo shown under a timeline-free line keeps its dip; everything else keeps the planner's grammar
  // R8 readability floor
  for (const s of P.shots) { const d = X.at(s.end) - X.at(s.start); if (d < RULE.minShot) apply("R8", `WARN ${s.id} is ${d.toFixed(2)} s (< ${RULE.minShot})`); }
  // shot ids stay S01..Snn (plan schema); the map is kept in the report
  const ren = P.shots.map((s, j) => { const id = `S${String(j + 1).padStart(2, "0")}`; const was = s.id; s.id = id; return { id, was }; }); apply("ids", ren.filter((r) => r.id !== r.was).map((r) => `${r.was}→${r.id}`).join(", "));
  return { plan: P, log };
}

function recommend(X, diag, P) {
  const n = X.lines.length; return X.lines.map((l, i) => { const shots = P.shots.filter((s) => s.line === l.id); const L0 = X.L[l.id];
    const modes = shots.map((s) => modeOf(s, X)); const mech = shots.find((s) => s.template === "component-section");
    const sc = mech ? P.shared[mech.params.scene.slice(7)] : null; const reveal = sc ? sc.states.filter((st) => String(st.at).startsWith(`word:${l.id}:`)).map((st) => `${st.state} @ ${X.at(st.at).toFixed(2)} s`) : [];
    return { line: l.id, text: l.text, stage: stage((shots[0] || {}).beat, l.text, i, n), duration: +(L0.end - L0.start + 0.48).toFixed(2),
      visual: modes.join(" → "), source: modes.map((m) => (m === "conceptual-mechanism" ? "reconstruction (conceptual, disclosed)" : m === "evidence-highlight" || m === "document" ? "document" : "archival")).join(" → "),
      camera: shots.map((s) => s.template === "component-section" ? "scene-continuous drift; settles 0.6 s before each cue" : s.template === "timeline" ? "static rail; the clock is the motion" : s.template === "document-excerpt" ? "slow push 1.04; highlight sweep" : (s.params.camera && Array.isArray(s.params.camera.keys) ? `push ${Math.max(...s.params.camera.keys.map((k) => k.zoom))}` : s.template)).join(" | "),
      emphasis: [...new Set([...shots.flatMap((s) => JSON.stringify(s.params).match(/\{C-[a-z0-9-]+\}/g) || []), ...(sc ? sc.states.filter((st) => String(st.at).startsWith(`word:${l.id}:`) && st.value).map((st) => `{${st.value.slice(6)}}`) : [])])].map((x) => X.C[x.slice(1, -1)] ? (X.C[x.slice(1, -1)].display || x).replace(/\|/g, " ") : x).slice(0, 3),
      transition: shots.map((s) => s.transition.type).join(" / "), captions: i === 0 ? "headline first, captions from 1.5 s" : "spoken-word captions only; at most one on-screen label besides the chip",
      mechanismReveal: reveal }; }); }

function run(inputs) { const X = context(inputs); const before = diagnose(X); const { plan, log } = direct(X, before); const X2 = { ...X, plan }; const after = diagnose(X2);
  const tally = (d) => { const r = {}; for (const s of d) for (const x of s.risks) r[x.code] = (r[x.code] || 0) + 1; return r; };
  const modeRuns = (d) => { const runs = []; for (const s of d) { const l = runs[runs.length - 1]; if (l && l.mode === s.mode && l.key === s.key) l.sec += s.dur; else runs.push({ mode: s.mode, key: s.key, sec: s.dur }); } return runs; };
  const summary = (d) => { const r = modeRuns(d); return { shots: d.length, modes: [...new Set(d.map((s) => s.mode))].length, visualChanges: r.length, longestHold: +Math.max(...r.map((x) => x.sec)).toFixed(1), meanHold: +(r.reduce((a, x) => a + x.sec, 0) / r.length).toFixed(1), risks: tally(d) }; };
  return { plan, report: { schema: "fr-premium.creative-director.v1", experimental: true, rules: RULE, before: { summary: summary(before), shots: before }, decisions: log, after: { summary: summary(after), shots: after }, recommendations: recommend(X, after, plan) } }; }

module.exports = { run, diagnose, direct, modeOf, RULE };

if (require.main === module) {
  const a = process.argv.slice(2); const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null); const J = (f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
  const res = run({ plan: J(opt("--plan")), script: J(opt("--script")), evidence: J(opt("--evidence")), assets: J(opt("--assets")), timeline: J(opt("--timeline")), matches: J(opt("--matches")) });
  const out = opt("--out"); if (out) { const src = path.dirname(path.resolve(opt("--plan"))); const rel = (f) => path.relative(path.dirname(path.resolve(out)), path.resolve(src, f));
    for (const k of ["narration", "evidence", "assets"]) res.plan[k] = rel(res.plan[k]); fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res.plan, null, 1) + "\n"); }
  if (opt("--report")) fs.writeFileSync(opt("--report"), JSON.stringify(res.report, null, 1) + "\n");
  const s = res.report; console.log(`before: ${JSON.stringify(s.before.summary)}\nafter:  ${JSON.stringify(s.after.summary)}`); for (const d of s.decisions) console.log(` ${d.rule} ${d.what}`);
}
