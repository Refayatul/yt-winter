#!/usr/bin/env node
"use strict";
// Shot Planner V1: deterministic rules that turn an approved narration script + verified evidence +
// licensed assets + word timings + the channel pack into a shot-plan.json.
//   node scripts/fr-premium/engine/planner.js --script narration-script.json --evidence evidence.json
//        --assets assets.json --timeline timeline.json --channel failure-reconstructed --out shot-plan.json [--report report.json]
//
// Rules, never guesses:
// - it states nothing new: on-screen text comes only from claim placeholders, approved script fields
//   (headline/kicker), asset provenance labels and anchor labels entered by a human;
// - it never invents a point in an image: marks, traces, registrations and mechanism geometry use only
//   anchors from assets.json; a shot that needs a missing anchor or claim is emitted for review and
//   listed as NEEDS_HUMAN_REVIEW with a structured reason;
// - every value it generates is counted (metrics.generated), so automation can be measured honestly.
const fs = require("fs");
const path = require("path");
const CAM = require("./camera-presets");
const TIME = require("./timeref");
const { validatePlan, loadRegistry } = require("./validate");
const { validate: schemaCheck } = require("./jsonschema");
const COMP = require("./component-extract");
const MATCH = require("./asset-matcher");

const ENGINE = __dirname;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
// add seconds to a time reference, merging offsets ("line:L4 -0.1" + 0.5 -> "line:L4 +0.4")
const shift = (ref, d) => { const m = /^(.*?)(?: ([+-]\d+(?:\.\d+)?))?$/.exec(String(ref)); const base = m[1]; const o = +(m[2] || 0) + d;
  if (/^-?\d+(\.\d+)?$/.test(base)) return String(+(+base + o).toFixed(3)); const r = +o.toFixed(3); return r === 0 ? base : `${base} ${r > 0 ? "+" : ""}${r}`; };
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function words(n) { // integers 0..9999, as spoken in the narration ("fifty-three")
  if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + words(n % 100) : "");
  return words(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + words(n % 1000) : "");
}
const KEY = { mechanismTrigger: /^(ignition|ignited|opened|open|flexed|flex|switched|powered|heated|cracked|ruptured|burst|failed)$/, gas: /^(gas|flame|fire|leak|leaked|blew|smoke)$/,
  human: /\b(crew|crews|perished|killed|died|lost|astronauts|survived|lives)\b/i, decision: /\b(recommend|recommended|decision|decided|warning|reversed|approved|signed|memo|advice|officials)\b/i,
  event: /\b(seconds|minutes|hours|later)\b/i, mechanism: /\b(seal|seals|joint|o-rings?|gap|pressure|heater|heaters|switch|switches|insulation|valve|weld|crack|wires?|fan|fans|tank)\b/i,
  setting: /\b(morning|weather|cold|temperature|degrees|colder|ice)\b/i };

function makePlanner({ script, evidence, assets, timeline, channel, tail = 0.8, suggestions = [] }) {
  const C = evidence.claims, A = assets.assets; const ID = MATCH.identity(evidence); const upgrades = [];
  // assets the matcher rejects outright (wrong mission/vehicle/period, licence) are never picked
  const banned = new Set(Object.entries(A).filter(([, a]) => { const sj = MATCH.subjectCheck(a, ID); const lic = a.licence || {};
    return sj.reject || !(["public-domain", "cc0"].includes(lic.id) || (["cc-by", "cc-by-sa"].includes(lic.id) && lic.attribution)); }).map(([k]) => k));
  const nonEvent = (a) => MATCH.NONEVENT.test(`${a.source.title} ${a.source.caption || ""}`); const issues = []; const gen = { values: 0, shots: 0 }; const reviewShots = new Set();
  const need = (line, code, detail, needed) => { issues.push({ line, code, detail, needed }); };
  const count = (o) => { if (typeof o === "number") gen.values += 1; else if (Array.isArray(o)) o.forEach(count); else if (o && typeof o === "object") Object.values(o).forEach(count); return o; };
  const dur = timeline.duration + tail; const at = (ref) => TIME.resolve(ref, timeline, dur);
  const L = Object.fromEntries(timeline.lines.map((l) => [l.id, l])); const lineWords = (id) => timeline.words.filter((w) => w.line === id);
  // the narration word that states a claim's number (e.g. 53 -> "fifty-three"), else null
  const wordFor = (lineId, claimId) => { const c = C[claimId]; if (!c || c.value == null || !Number.isInteger(c.value) || c.value < 0) return null;
    const target = norm(words(c.value)); const ws = lineWords(lineId); let w = ws.find((x) => norm(x.text) === target);
    // "a thousand", "a hundred": the spoken article form of 1000 / 100
    if (!w && [100, 1000].includes(c.value)) w = ws.find((x, j) => norm(x.text) === (c.value === 100 ? "hundred" : "thousand") && j > 0 && norm(ws[j - 1].text) === "a");
    return w ? `word:${lineId}:${w.text.replace(/[^\w'-]/g, "")}` : null; };
  const firstWord = (lineId, re) => { const w = lineWords(lineId).find((x) => re.test(x.text.toLowerCase().replace(/[^a-z'-]/g, ""))); return w ? `word:${lineId}:${w.text.replace(/[^\w'-]/g, "")}` : null; };
  const anchorsOf = (key) => Object.entries(A[key].anchors || {}).map(([n, v]) => ({ name: n, ref: `asset:${key}#${n}`, ...v }));
  const claimsWithRole = (ids, role) => ids.filter((id) => C[id] && C[id].role === role);
  // asset choice: depicts a claim of the line (+3), has an anchor stating one (+2), tag fits the beat (+1)
  const TAGS = { hook: ["damage", "vehicle"], setting: ["setting"], "human-cost": ["portrait"], decision: ["document"], mechanism: ["drawing"], evidence: ["recovered-hardware", "damage"], "event-sequence": ["film"], payoff: [] };
  const pickAsset = (line, beat, filter = () => true) => { let best = null;
    for (const [k, a] of Object.entries(A)) { if (!filter(k, a) || banned.has(k) || nonEvent(a)) continue; let sc = 0;
      if ((a.depicts || []).some((c) => line.claims.includes(c))) sc += 3; if (anchorsOf(k).some((x) => x.claim && line.claims.includes(x.claim))) sc += 2;
      if ((a.tags || []).some((t) => (TAGS[beat] || []).includes(t))) sc += 1; if (sc >= 2 && (!best || sc > best.sc)) best = { k, sc }; } // a tag alone never selects footage
    return best ? best.k : null; };
  const classify = (line, i, n) => { if (line.beat) return line.beat; if (i === 0) return "hook"; if (i === n - 1) return "payoff";
    const cl = line.claims.map((id) => C[id]).filter(Boolean);
    if (cl.filter((c) => ["ring-diameter", "gap-max", "opening-duration"].includes(c.role)).length >= 2) return "mechanism"; // the evidence decides first
    if (KEY.human.test(line.text)) return "human-cost";
    if (cl.some((c) => ["quote", "finding"].includes(c.role)) || KEY.decision.test(line.text)) return "decision"; // a chronology claim alone is not a decision
    if (cl.filter((c) => c.role === "event").length >= 2 || (KEY.event.test(line.text) && cl.some((c) => c.role === "event"))) return "event-sequence";
    if (KEY.mechanism.test(line.text) && cl.some((c) => ["ring-diameter", "gap-max", "opening-duration", "temperature"].includes(c.role))) return "mechanism";
    // a temperature whose passage is about a component (a switch threshold, a heater) is a mechanism, not the weather
    if (cl.some((c) => c.role === "temperature" && COMP.mentions(c.passage || "").some((m) => ["switch", "heater", "valve", "sensor", "vessel", "wire", "insulation"].includes(m.kind)))) return "mechanism";
    if (KEY.setting.test(line.text)) return "setting"; return "evidence"; };
  const chipFor = (k, kind) => ({ label: A[k].provenanceLabel || (kind === "document" ? "Document" : "Archival"), kind });
  const upperLabel = (s) => { const w = String(s).toUpperCase().split(" "); if (w.length < 4) return w.join(" "); const m = Math.ceil(w.length / 2); return w.slice(0, m).join(" ") + "<br>" + w.slice(m).join(" "); };

  const lines = script.lines; const n = lines.length; const beats = lines.map((l, i) => classify(l, i, n));
  // ---- component scenes: lines whose claims describe parts and documented states of a system, with no
  // archival asset that depicts them (evidence) or no mechanism evidence for the joint templates (mechanism)
  const verified = (ids) => ids.filter((c) => C[c] && C[c].status === "verified");
  const compOf = (i) => COMP.extract(verified(lines[i].claims), C);
  const isComponent = (i, prevAsset) => { const l = lines[i], b = beats[i]; if (!["evidence", "mechanism"].includes(b)) return false;
    if (b === "evidence" && pickAsset(l, b, (kk, a) => a.kind !== "document")) return false;
    if (b === "mechanism") { const has = (r) => claimsWithRole(l.claims, r).length; if (has("ring-diameter") && has("gap-max") && has("opening-duration")) return false;
      if (prevAsset && anchorsOf(prevAsset).some((x) => x.role === "traceable-part")) return false; }
    return compOf(i).states.length > 0; };
  const CUE = { "stuck-closed": /^(not|failed|couldn't|stuck)$/, damaged: /^damag/, hot: /^(thousand|hot|heat\w*|reached)$/, on: /^(powered|energized|on|supply)$/, rated: /^rated$/, threshold: /^(open|opens)$/, "pressure-loss": /^(pressure|lost)$/ };
  const TAG = { rated: (s) => `RATED {${s.value}}`, threshold: (s) => `OPEN AT {${s.value}}`, on: (s) => `ENERGIZED {${s.value}}`, hot: (s) => `{${s.value}}`, "stuck-closed": () => "COULD NOT OPEN", damaged: (s, part) => `${part.kind === "insulation" ? "INSULATION" : part.label.toUpperCase()} DAMAGED`, "pressure-loss": () => "LOST PRESSURE" };
  const stateAt = (st, idxs) => { const L0 = idxs.filter((j) => lines[j].claims.includes(st.claim));
    for (const j of L0) { const w = (st.value && wordFor(lines[j].id, st.value)) || (CUE[st.state] && firstWord(lines[j].id, CUE[st.state])); if (w) return { j, at: w }; }
    const j = L0[0] != null ? L0[0] : idxs[0]; return { j, at: `line:${lines[j].id} +0.4`, guessed: true }; };
  function componentScene(i0, idxs) {
    const ids = [...new Set(idxs.flatMap((j) => verified(lines[j].claims)))]; const ex = COMP.extract(ids, C); const name = `component-${lines[i0].id.toLowerCase()}`;
    const parts = Object.values(ex.parts).map((q) => ({ id: q.id, kind: q.kind, label: q.label, claim: `claim:${q.claim}`, ...(q.layerOf ? { layerOf: q.layerOf } : {}) }));
    const links = ex.links.map((l) => ({ from: l.from, to: l.to, kind: l.kind, claim: `claim:${l.claim}` }));
    const placed = ex.states.map((st) => { const w = stateAt(st, idxs); const part = ex.parts[st.part];
      return { line: w.j, guessed: !!w.guessed, s: { part: st.part, state: st.state, at: w.at, claim: `claim:${st.claim}`, ...(st.value ? { value: `claim:${st.value}` } : {}), tag: TAG[st.state](st, part) } }; });
    for (const x of placed.filter((y) => y.guessed)) need(lines[x.line].id, "REVIEW_TIMING", `component state "${x.s.state}" of ${x.s.part} has no spoken cue in the line (placed at +0.4 s)`, "confirm or anchor the state to a word");
    // measured mode only when a drawing has VERIFIED mechanism-part anchors for every drawn part (suggestions never count)
    const drawn = parts.filter((q) => !q.layerOf && !links.some((l) => l.to === q.id && l.kind === "rated-for"));
    const drawing = Object.keys(A).find((k) => (A[k].tags || []).includes("drawing") && !banned.has(k) && drawn.every((q) => anchorsOf(k).some((x) => x.role === "mechanism-part" && x.label && COMP.mentions(x.label).some((m) => m.kind === q.kind))));
    if (drawing) for (const q of drawn) q.anchor = anchorsOf(drawing).find((x) => x.role === "mechanism-part" && COMP.mentions(x.label).some((m) => m.kind === q.kind)).ref;
    else { const sug = suggestions.filter((g) => g.status === "SUGGESTED" && g.assessment !== "NEEDS_HUMAN_REVIEW" && g.label && A[g.asset] && (A[g.asset].tags || []).includes("drawing") && COMP.mentions(g.label).some((m) => drawn.some((q) => q.kind === m.kind)));
      const unreliable = suggestions.filter((g) => g.status === "SUGGESTED" && g.assessment === "NEEDS_HUMAN_REVIEW" && g.component && drawn.some((q) => COMP.mentions(g.component).some((m) => m.kind === q.kind)));
      if (!sug.length && unreliable.length) upgrades.push({ line: lines[i0].id, code: "MEASURED_MODE_NEEDS_MANUAL_ANCHORS", detail: `no reliable suggestion for the drawn parts; ${unreliable.length} candidates on ${[...new Set(unreliable.map((g) => g.asset))].join(", ")} need a human (${[...new Set(unreliable.map((g) => g.assessmentReason))].join("; ")})`, suggestions: unreliable.map((g) => g.id) });
      if (sug.length) upgrades.push({ line: lines[i0].id, code: "MEASURED_MODE_AFTER_VERIFICATION", detail: `${sug.length} suggested anchors on ${[...new Set(sug.map((g) => g.asset))].join(", ")} name drawn parts (${[...new Set(sug.map((g) => g.label))].join(", ")}); conceptual mode until a human verifies part geometry`, suggestions: sug.map((g) => g.id) }); }
    // archival plates before the model: historical images whose own title/caption names the topic AND the
    // system the scene's parts belong to (the vessel named in these or the previous line's passages).
    // Unmarked and unregistered; tests/concepts never qualify as historical plates.
    const ctxKinds = new Set([...parts.map((q) => q.kind), ...(i0 > 0 ? verified(lines[i0 - 1].claims) : []).flatMap((c) => COMP.mentions(C[c].passage || "").map((m) => m.kind)), ...ids.flatMap((c) => COMP.mentions(C[c].passage || "").map((m) => m.kind))]);
    const firstState = Math.min(...placed.filter((x) => x.line === i0).map((x) => at(x.s.at)).concat([at(endRef(i0))]));
    const t0s = at(startRef(i0)); const room = firstState - 0.4 - t0s;
    const cand = Object.entries(A).filter(([k, a]) => !banned.has(k) && !nonEvent(a) && a.kind !== "clip" && MATCH.subjectCheck(a, ID).score === 1
      && COMP.mentions(`${a.source.title} ${a.source.caption || ""}`).some((m) => ctxKinds.has(m.kind)) && !Object.values(A).some((o) => o !== a && o.sha256 && o.sha256 === a.sha256 && Object.keys(A).indexOf(k) > Object.keys(A).indexOf(Object.keys(A).find((kk) => A[kk] === o))))
      .sort(([, a], [, b]) => (/\b(location|relative|overview|cutaway)\b/i.test(b.source.caption || "") - /\b(location|relative|overview|cutaway)\b/i.test(a.source.caption || "")) || (a.width * a.height) - (b.width * b.height))
      .slice(0, room >= 2.8 ? 2 : room >= 1.4 ? 1 : 0);
    const archival = cand.map(([k, a], j) => ({ asset: `asset:${k}`, kind: (a.tags || []).includes("drawing") || a.kind === "document" ? "historical-drawing" : "historical-photo", label: a.provenanceLabel || "Archival",
      window: [shift(startRef(i0), +(j * (room / cand.length)).toFixed(2)), shift(startRef(i0), +(((j + 1) * room) / cand.length + (j + 1 < cand.length ? 0.45 : 0)).toFixed(2))] }));
    const lead = archival.length ? room : 0;
    // meters: a claim value per fill or mark (voltage: energized vs rated; temperature: threshold, the stuck contact reaching it, the documented peak)
    const unitQ = (c) => /^V$/.test((C[c] || {}).unit || "") ? "voltage" : /°?[FC]$/.test((C[c] || {}).unit || "") ? "temperature" : /psi/i.test((C[c] || {}).unit || "") ? "pressure" : null;
    const M = {}; const add = (q, e) => { (M[q] = M[q] || { quantity: q, entries: [] }).entries.push(e); };
    for (const { s: x } of placed) { const v = x.value && x.value.slice(6); const q = v && unitQ(v); if (!q) continue;
      add(q, { role: ["on", "hot"].includes(x.state) ? "fill" : "mark", at: x.at, value: x.value, tag: x.tag }); }
    const thr = placed.find((x) => x.s.state === "threshold"); const stk = placed.find((x) => x.s.state === "stuck-closed" && thr && x.s.part === thr.s.part);
    if (thr && stk && unitQ(thr.s.value.slice(6))) add(unitQ(thr.s.value.slice(6)), { role: "fill", at: stk.s.at, value: thr.s.value, tag: stk.s.tag, tagClaim: stk.s.claim });
    for (const m of Object.values(M)) m.entries.sort((a, b) => at(a.at) - at(b.at));
    const meters = Object.values(M).filter((m) => m.entries.length >= 2);
    // camera: overview, then each line frames the parts whose states it states
    const cam = [{ at: shift(startRef(i0), +lead), focus: drawn.map((q) => q.id) }]; let last = drawn.map((q) => q.id);
    idxs.forEach((j, k) => { const here = placed.filter((x) => x.line === j).map((x) => x.s.part); const extra = placed.filter((x) => x.line === j && x.s.state === "on").flatMap((x) => links.filter((l) => l.from === x.s.part && l.kind === "powered-by").map((l) => l.to));
      const f = [...new Set([...here, ...extra])].filter((id) => parts.some((q) => q.id === id)); const focus = f.length ? f : last;
      const ls = at(startRef(j)) + (k === 0 ? lead + 0.6 : 0), le = at(endRef(j)); const cue = Math.min(...placed.filter((x) => x.line === j).map((x) => at(x.s.at)).concat([le]));
      // arrive and settle at least 0.6 s before the cue (the state change then reads on a still frame); the move stays inside the line
      // if there is no room to settle before the cue, the camera waits until the state has read (cue + 0.9) and moves after it:
      // it never moves during a documented state change
      const room = cue - 0.6 >= ls + 0.5; const go = room ? Math.max(ls, Math.min(cue - 0.6, le - 0.3) - 1.2) : Math.min(le - 0.8, Math.max(ls, cue + 0.9));
      const arrive = room ? Math.min(cue - 0.6, le - 0.3) : Math.min(le - 0.3, go + 1.2); const rel = (x) => shift(startRef(j), +(x - at(startRef(j))).toFixed(2));
      cam.push({ at: rel(go), focus: last }, { at: rel(arrive), focus }); last = focus; });
    const stamps = idxs.flatMap((j) => claimsWithRole(lines[j].claims, "chronology").map((c) => ({ value: `{${c}}`, window: [shift(startRef(j), +0.2), shift(endRef(j), -0.2)] })));
    shared[name] = { mode: drawing ? "measured" : "conceptual", disclosure: drawing ? "Drawing geometry · parts registered" : "Conceptual · not to scale", ...(drawing ? { drawing: `asset:${drawing}` } : {}),
      scale: { mode: drawing ? "true-scale" : "schematic" }, parts, links, states: placed.map((x) => x.s), camera: dedupeCam(cam), span: [startRef(i0), endRef(idxs[idxs.length - 1])], ...(stamps.length ? { stamps } : {}), ...(archival.length ? { archival } : {}), ...(meters.length ? { meters } : {}) };
    return { name, placed, drawing, archivalAssets: archival.map((a) => a.asset.slice(6)) };
  }
  const dedupeCam = (cam) => cam.filter((k, j) => !cam.slice(0, j).some((x) => x.at === k.at));
  let comp = null; // the scene being continued by consecutive component lines
  const startRef = (i) => (i === 0 ? "0" : `line:${lines[i].id} -0.1`); const endRef = (i) => (i === n - 1 ? "end" : `line:${lines[i + 1].id} -0.1`);
  const shots = []; const film = { tail, captionSkip: [] }; const shared = {}; let hookKeys = null, hookAsset = null;
  const emit = (i, s, review) => { const codes = issues.filter((x) => x.line === lines[i].id).map((x) => x.code); if (review || codes.length) s.review = { codes: [...new Set(codes)] };
    shots.push(s); gen.shots += 1; if (review) reviewShots.add(s.id); };
  for (let i = 0; i < n; i += 1) {
    const line = lines[i], beat = beats[i], id = `S${String(i + 1).padStart(2, "0")}`; const t0 = startRef(i), t1 = endRef(i);
    const base = { id, beat, line: line.id, start: t0, end: t1, evidence: line.claims.filter((c) => C[c]), qa: { states: [] } };
    if (!line.claims.length && beat !== "payoff") need(line.id, "UNSUPPORTED_CLAIM", `line "${line.text}" states facts but cites no claim`, "add a verified claim for the statement, or rewrite the line");
    const missing = line.claims.filter((c) => !C[c]); for (const c of missing) need(line.id, "UNSUPPORTED_CLAIM", `line cites ${c}, which is not in evidence.json`, "add the claim with a verified passage or remove it from the line");
    const prev = shots[shots.length - 1];
    // ---------------------------------------------------------------- component section (conceptual or measured)
    if (comp && comp.idxs.includes(i) || isComponent(i, prev && prev.assets && prev.assets[0])) {
      if (!comp || !comp.idxs.includes(i)) { const idxs = [i]; while (idxs[idxs.length - 1] + 1 < n && isComponent(idxs[idxs.length - 1] + 1, null)) idxs.push(idxs[idxs.length - 1] + 1); comp = { idxs, ...componentScene(i, idxs) }; }
      const mine = comp.placed.filter((x) => x.line === i).map((x) => x.s); const first = comp.idxs[0] === i;
      base.qa.states.push(...mine.map((s0) => ({ at: s0.at, what: `${s0.part}: ${s0.state}`, claim: s0.claim.slice(6) })));
      if (!base.qa.states.length) base.qa.states.push({ at: `line:${line.id}`, what: "camera holds on the component" });
      const P = { scene: `shared:${comp.name}`, chip: { label: comp.drawing ? "Animation · drawing geometry" : "Conceptual · not to scale", kind: "explanatory" }, ...(first ? { enter: [t0, shift(t0, +0.4)] } : {}) };
      if (first && comp.archivalAssets.length) base.qa.states.unshift({ at: shift(t0, +0.1), what: "historical image (unmarked) before the model" });
      emit(i, { ...base, template: "component-section", provenance: { kind: "explanatory", label: comp.drawing ? "Explanatory animation · drawing geometry" : "Conceptual diagram · not to scale" }, assets: [...new Set([...(comp.drawing ? [comp.drawing] : []), ...comp.archivalAssets])], params: count(P),
        transition: first ? (i === 0 ? { type: "cut" } : { type: "cut", reason: "into the component the narration describes" }) : { type: "continuous", reason: "same component model; the camera travels to the next documented state" } }, false); continue;
    }
    const trans = (() => { if (i === 0) return { type: "cut" };
      if (beat === "payoff") return { type: "loop", reason: "returns to the opening framing for the replay" };
      if (beat === "human-cost") return { type: "dip", reason: "loss beat: slow dissolve, no animation", fade: 0.35 };
      if (prev && prev.beat === "human-cost") return { type: "dip", reason: "slow dissolve after the loss beat", fade: 0.3 };
      if (prev && prev.beat === "decision" && beat === "decision") return { type: "continuous", reason: "continuous document camera on the same desk" };
      return { type: "cut", reason: "cut on the narration beat" }; })();
    // ---------------------------------------------------------------- hook / setting / evidence / human-cost (archival plates)
    if (["hook", "setting", "evidence", "human-cost"].includes(beat)) {
      const k = pickAsset(line, beat, (kk, a) => a.kind !== "document" || beat === "evidence") || (beat === "hook" ? null : null);
      if (!k) { need(line.id, "MISSING_ASSET", `no licensed asset depicts the line's claims (${line.claims.join(", ") || "none"})`, "add an asset with depicts/tags, or a claim the asset depicts"); emit(i, { ...base, template: "archival-plate", provenance: { kind: "archival", label: "NEEDS ASSET" }, assets: [], params: {}, transition: trans }, true); continue; }
      const a = A[k]; const portrait = a.height > a.width; const kind = a.kind === "document" ? "document" : "archival";
      const P = { media: `asset:${k}`, chip: chipFor(k, kind) }; let review = false;
      if (a.kind === "clip") { const poi = anchorsOf(k).find((x) => x.role === "point-of-interest" && x.point); const fp = CAM.filmPlate({ clip: a, anchor: poi, t0: shift(t0, +0.4), t1: shift(t1, +0.02) });
        Object.assign(P, { box: fp.box, camera: fp.camera, plate: { blur: 34, dim: 0.45 }, under: "ink", shades: [{ kind: "bottom", y: fp.box.y + fp.box.h - 200, h: 200 }] });
        if (poi) P.mark = { anchor: poi.ref, radius: 70, pulse: true, outline: true, layer: "hud", in: [shift(t0, +0.1), shift(t0, +0.5)] };
        const ev = line.claims.find((c) => C[c] && C[c].role === "event"); if (ev) P.stamp = { label: "DOCUMENTED TIME", value: `claim:${ev}` };
      } else if (beat === "hook") { const poi = anchorsOf(k).find((x) => x.role === "point-of-interest" && x.point && line.claims.includes(x.claim));
        if (!poi) { const sg = suggestions.filter((g) => g.asset === k && g.status === "SUGGESTED"); const weak = sg.filter((g) => g.assessment === "NEEDS_HUMAN_REVIEW").length;
          need(line.id, "MISSING_ANCHOR", `hook asset ${k} has no point-of-interest anchor stating one of the line's claims${sg.length ? ` (${sg.length} suggested, unverified${weak ? `, ${weak} assessed unreliable` : ""}: ${sg.map((g) => g.id).join(", ")})` : ""}`, sg.length ? "verify or reject the suggested anchor (a suggestion is never used as a verified point)" : "measure the point of interest on the photo (manual anchor) and tie it to the claim"); review = true; }
        const box = portrait ? CAM.PHOTO_BOX : { x: 0, y: 0, w: CAM.W, h: CAM.H };
        const cam = poi ? CAM.evidencePushIn({ asset: a, anchor: poi, t0: "0", t1: shift(t1, +0.3), box }) : CAM.establishing({ asset: a, t0: "0", t1, box });
        Object.assign(P, { box, camera: { keys: cam.keys }, under: "ink", shades: portrait ? [{ kind: "top", h: 640 }, { kind: "bottom", y: 1120, h: 290 }, { kind: "ink", y: 1400, h: 520 }] : [{ kind: "top", h: 640 }, { kind: "bottom", y: 1180, h: 740 }] });
        if (line.headline) { P.headline = { ...(line.kicker ? { kicker: line.kicker } : {}), text: line.headline, y: 330, out: ["0.3", "0.5"] }; film.captionFrom = "0.5"; }
        if (poi) { const valueClaim = poi.claim && C[poi.claim] && C[poi.claim].display && /\d/.test(C[poi.claim].display) ? poi.claim : line.claims.find((c) => C[c] && C[c].display && /\d/.test(C[c].display) && C[c].role === "event");
          P.mark = { anchor: poi.ref, radius: 86, in: ["0.5", "1.15"], layer: "svg", ...(poi.label ? { label: { lines: upperLabel(poi.label), ...(valueClaim ? { value: `{${valueClaim}}` } : {}), in: ["0.95", "1.4"] } } : {}) };
          base.qa.states.push({ at: "0.5", what: "ring on the anchored point of interest", claim: poi.claim }); }
        hookKeys = P.camera.keys; hookAsset = k;
      } else if (beat === "human-cost" && (a.tags || []).includes("portrait")) {
        Object.assign(P, { box: { x: 0, y: 420, w: 1080, h: "auto" }, camera: { keys: [{ at: t0, focus: [a.width / 2, a.height / 2], zoom: 1.0 }, { at: t1, focus: [a.width / 2, a.height / 2], zoom: 1.05 }] }, under: "ink" });
        const des = claimsWithRole(line.claims, "designation")[0]; if (des) P.kicker = { text: `{${des}}`, y: 330 };
      } else { const cam = CAM.establishing({ asset: a, subject: anchorsOf(k).find((x) => x.role === "subject"), t0, t1 }); P.camera = { keys: cam.keys };
        P.shades = beat === "setting" ? [{ kind: "tint", color: "#06121c", opacity: 0.28 }, { kind: "top", h: 760 }, { kind: "bottom", y: 1180, h: 740 }] : [{ kind: "top", h: 820 }, { kind: "bottom", y: 1180, h: 740 }];
        const shown = line.claims.filter((c) => C[c] && C[c].display && /\d/.test(C[c].display) && ["temperature", "context"].includes(C[c].role));
        if (beat === "setting" && shown.length) P.stat = { value: `{${shown[0]}}`, sub: shown[1] ? `{${shown[1]}}` : "", y: 330, in: [shift(t0, +0.1), shift(t0, +0.45)] };
        if (line.headline) P.headline = { text: line.headline, y: 340, in: [t0, shift(t0, +0.3)] }; }
      const stateClaim = line.claims.find((c) => wordFor(line.id, c)); if (stateClaim) base.qa.states.push({ at: wordFor(line.id, stateClaim), what: "the stated number is spoken", claim: stateClaim });
      if (!base.qa.states.length) base.qa.states.push({ at: `line:${line.id}`, what: "shot on the narration beat" });
      emit(i, { ...base, template: "archival-plate", provenance: { kind, label: a.provenanceLabel || kind }, assets: [k], params: count(P), transition: trans }, review); continue;
    }
    // ---------------------------------------------------------------- mechanism
    if (beat === "mechanism") {
      const ring = claimsWithRole(line.claims, "ring-diameter")[0], gap = claimsWithRole(line.claims, "gap-max")[0], open = claimsWithRole(line.claims, "opening-duration")[0];
      const temps = claimsWithRole(line.claims, "temperature").filter((c) => C[c].value != null);
      const drawing = Object.keys(A).find((k) => (A[k].tags || []).includes("drawing") && ["tang", "clevis-inner-leg", "oring-size"].every((nm) => (A[k].anchors || {})[nm]));
      const trigger = firstWord(line.id, KEY.mechanismTrigger) || `line:${line.id} +0.4`; const gasWord = firstWord(line.id, KEY.gas);
      if (temps.length >= 2 && ring && gap && open) { // two temperatures -> the warm/cold seal comparison
        const [cold, warm] = temps.slice().sort((x, y) => C[x].value - C[y].value); const squeeze = 0.3, follow = 0.9;
        const factor = +((squeeze * follow) / (C[gap].value / C[ring].value)).toFixed(1);
        const P = { scale: { mode: "declared-exaggeration", factor }, ringDiameter: `claim:${ring}`, gapMax: `claim:${gap}`, squeeze, follow,
          panels: [{ tint: "warm", label: C[warm].approximate ? `{${warm}}` : `{${warm}.value}°F`, temperature: `claim:${warm}`, tauSec: 0.06 }, { tint: "cold", label: C[cold].approximate ? `{${cold}}` : `{${cold}.value}°F`, temperature: `claim:${cold}`, tauSec: 4.0 }],
          gap: { duration: `claim:${open}`, startAt: shift(trigger, -0.2) }, gas: { window: [shift(trigger, +0.22), shift(t1, -0.2)] }, frost: { window: [t0, shift(t0, +0.6)] },
          gapLabel: { text: "GAP ×{scale}", window: [shift(trigger, +0.15), shift(trigger, +0.5)], to: [780, 1190] }, chip: { label: "Animation · not to scale", kind: "explanatory" },
          source: { text: `{${warm}}, {${cold}} · speeds illustrative`, y: 1494 } };
        base.qa.states.push({ at: shift(trigger, -0.2), what: "sealing face moves (joint opens)", claim: open }, { at: shift(trigger, +0.4), what: "cold ring lags: gap open", claim: cold });
        emit(i, { ...base, template: "joint-section", provenance: { kind: "explanatory", label: "Explanatory animation · not to scale" }, assets: [], params: count(P), transition: prev && prev.beat === "setting" ? { type: "follow-cause", reason: "from the setting into the mechanism it causes", fade: 0.3 } : trans }, false); continue;
      }
      if (drawing && ring && gap && open) {
        const an = A[drawing].anchors; const ref = (nm) => `asset:${drawing}#${nm}`; const rings = Object.entries(an).filter(([, v]) => v.role === "mechanism-ring" && v.point).sort((x, y) => x[1].point[1] - y[1].point[1]);
        if (!rings.length) { need(line.id, "MISSING_ANCHOR", `drawing ${drawing} has no mechanism-ring anchors`, "measure the ring positions on the drawing"); }
        const parts = ["tang", "clevis-inner-leg", "clevis-outer-leg", "clevis-pin"].filter((nm) => an[nm]); const cu = CAM.mechanismCloseUp({ rects: parts.map((nm) => an[nm].rect) });
        const s = cu.box.w / cu.region.w; const gapDraw = (C[gap].value / C[ring].value) * an["oring-size"].lengthPx; const factor = Math.max(1, Math.ceil(50 / (gapDraw * s))); // >= 50 screen px of visible gap
        const lead = line.claims.find((c) => C[c] && C[c].role === "event" && C[c].unit === "s" && C[c].value < 5);
        const P = { drawing: `asset:${drawing}`, geometry: { tang: ref("tang"), innerLeg: ref("clevis-inner-leg"), ...(an["clevis-outer-leg"] ? { outerLeg: ref("clevis-outer-leg") } : {}), ...(an["clevis-pin"] ? { pin: ref("clevis-pin") } : {}), rings: rings.map(([nm]) => ref(nm)), ringSize: ref("oring-size") },
          view: cu, fromDrawing: { window: [t0, shift(t0, +0.6)] }, ringDiameter: `claim:${ring}`, gapMax: `claim:${gap}`, scale: { mode: "declared-exaggeration", factor },
          open: { startAt: trigger, duration: `claim:${open}` }, recovery: { ...(temps[0] ? { temperature: `claim:${temps[0]}` } : {}), tauSec: temps[0] && C[temps[0]].value < 40 ? 4.0 : 0.3, squeeze: 0.3 },
          gas: { window: [gasWord ? shift(gasWord, -0.15) : shift(t1, -1.5), gasWord ? shift(gasWord, +1.0) : t1], ...(lead ? { leadIn: { from: shift(trigger, +(C[lead].value.toFixed(1))), level: 0.45 } } : {}) },
          push: { window: [t0, t1], zoom: 1.06 },
          labels: [...rings.slice(0, 2).map(([nm, v], j) => (v.label ? { text: v.label.toUpperCase(), target: `ring${j}`, window: [shift(t0, +((0.1 + 0.3 * j).toFixed(1))), shift(trigger, +0.3)], to: [90, j ? 1000 : 470] } : null)).filter(Boolean),
            { text: "GAP ×{scale}", target: "gap", window: [shift(trigger, +0.6), t1], to: [990, 420] }],
          chip: { label: "Animation · drawing geometry", kind: "explanatory" }, source: { text: "Drawing geometry · gap ×{scale} · recovery illustrative", y: 1494 } };
        base.qa.states.push({ at: t0, what: "drawing dissolves into the model" }, { at: trigger, what: "joint opens over the documented time", claim: open }, ...(gasWord ? [{ at: gasWord, what: "gas passes the rings" }] : []));
        emit(i, { ...base, template: "joint-mechanism", provenance: { kind: "explanatory", label: "Explanatory animation · drawing geometry, gap exaggerated" }, assets: [drawing], params: count(P), transition: trans, qa: { ...base.qa, registered: true } }, !rings.length); continue;
      }
      // photo with labelled traceable parts -> trace over the photo (continuing the previous shot's camera)
      const k = prev && prev.assets && prev.assets[0] && anchorsOf(prev.assets[0]).some((x) => x.role === "traceable-part") ? prev.assets[0] : null;
      if (k) { const parts = anchorsOf(k).filter((x) => x.role === "traceable-part" && x.rect); const poi = anchorsOf(k).find((x) => x.role === "point-of-interest");
        const paths = []; parts.forEach((p0, j) => { const r = p0.rect; paths.push({ basis: p0.ref, points: [[r.x, r.y], [r.x, r.y + r.h]], window: [shift(t0, +((0.1 * j).toFixed(1))), shift(t0, +((0.6 + 0.1 * j).toFixed(1)))], color: "line", width: 5 }, { basis: p0.ref, points: [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]], window: [shift(t0, +((0.1 + 0.1 * j).toFixed(1))), shift(t0, +((0.7 + 0.1 * j).toFixed(1)))], color: "line", width: 5 }); });
        const lastKey = prev.params.camera.keys[prev.params.camera.keys.length - 1]; const target = poi ? CAM.pointOf(poi) : lastKey.focus;
        const P = { media: `asset:${k}`, box: CAM.PHOTO_BOX, camera: { keys: [...prev.params.camera.keys, { at: t1, focus: target.map(Math.round), zoom: 2.4 }], zoomInterp: "log" },
          reveal: { fromH: 1400, window: [t0, shift(t0, +0.7)] }, grade: { window: [t0, shift(t0, +0.6)], saturate: 0.45, brightness: 0.65 }, fadeOut: { window: [shift(t1, -0.55), shift(t1, +0.05)], to: 0.25 },
          paths, ...(poi ? { marks: [{ anchor: poi.ref, radius: 86 }] } : {}),
          callouts: parts.filter((p0) => p0.label).map((p0, j) => ({ from: { basis: p0.ref, point: CAM.pointOf(p0).map(Math.round) }, to: { x: 150, dy: -360, minY: 470 }, label: p0.label.toUpperCase(), window: [shift(t0, +((0.4 + 0.5 * j).toFixed(1))), shift(t0, +((0.8 + 0.5 * j).toFixed(1)))], size: 40 })),
          shades: [{ kind: "top", h: 640, opacity: 0.6 }, { kind: "bottom", y: 1060, h: 520 }, { kind: "ink", y: 1290, color: "#000000", opacity: 0.35 }], chip: { label: `${A[k].provenanceLabel || "Archival"} · traced`, kind: "explanatory" } };
        base.qa.states.push({ at: shift(t0, +0.1), what: "trace draws on the measured parts" }, { at: shift(t1, -0.55), what: "camera pushes in" });
        emit(i, { ...base, template: "trace-over-photo", provenance: { kind: "explanatory", label: `${A[k].provenanceLabel || "Archival"} · traced outline` }, assets: [k], params: count(P), transition: { type: "continuous", reason: "same photograph, same camera: the trace is registered to it" }, qa: { ...base.qa, registered: true } }, false); continue;
      }
      if (!ring || !gap || !open) need(line.id, "MISSING_EVIDENCE", `mechanism line lacks ring-diameter / gap-max / opening-duration claims (${[ring, gap, open].map((x) => x || "missing").join(", ")})`, "add the claims (with roles) or choose a non-mechanism template");
      need(line.id, "NO_TEMPLATE", "mechanism line: no drawing with mechanism anchors and no photo with traceable parts", "add mechanism anchors, or a mechanism template for this component (see the component-section spec)");
      emit(i, { ...base, template: "joint-mechanism", provenance: { kind: "explanatory", label: "NEEDS MECHANISM TEMPLATE" }, assets: [], params: {}, transition: trans }, true); continue;
    }
    // ---------------------------------------------------------------- event sequence
    if (beat === "event-sequence") {
      const ev = claimsWithRole(line.claims, "event").filter((c) => C[c].value != null).sort((x, y) => C[x].value - C[y].value);
      const film = pickAsset(line, beat, (kk, a) => a.kind === "clip");
      if (film && ev.length <= 1) { const a = A[film]; const poi = anchorsOf(film).find((x) => x.role === "point-of-interest" && x.point); const fp = CAM.filmPlate({ clip: a, anchor: poi, t0: shift(t0, +0.4), t1: shift(t1, +0.02) });
        const P = { media: `asset:${film}`, box: fp.box, camera: fp.camera, plate: { blur: 34, dim: 0.45 }, under: "ink", shades: [{ kind: "bottom", y: fp.box.y + fp.box.h - 200, h: 200 }], chip: chipFor(film, "archival"),
          ...(poi ? { mark: { anchor: poi.ref, radius: 70, pulse: true, outline: true, layer: "hud", in: [shift(t0, +0.1), shift(t0, +0.5)] } } : {}), ...(ev[0] ? { stamp: { label: "DOCUMENTED TIME", value: `claim:${ev[0]}` } } : {}) };
        base.qa.states.push({ at: shift(t0, +0.1), what: poi ? "ring on the anchored point" : "film plays", ...(poi && poi.claim ? { claim: poi.claim } : {}) });
        emit(i, { ...base, template: "archival-plate", provenance: { kind: "archival", label: a.provenanceLabel || "Archival film" }, assets: [film], params: count(P), transition: trans }, false); continue; }
      const dims = ["tank-length", "tank-diameter", "booster-length", "booster-diameter"].map((r) => Object.keys(C).find((id) => C[id].role === r));
      if (ev.length >= 2 && dims.every(Boolean)) { const ws = lineWords(line.id); const step = (ws[ws.length - 1].end - ws[0].start) / ev.length;
        const events = ev.map((c, j) => ({ claim: `claim:${c}`, at: j === 0 ? t0 : (wordFor(line.id, c) || `line:${line.id} +${(step * j).toFixed(2)}`), key: ["plume", "deflect", "leak", "strut", "dome"][Math.min(4, j)], dur: 0.7, ...(C[c].display && !/\d/.test(C[c].display) ? { label: `{${c}}` } : {}) }));
        need(line.id, "REVIEW_EVENT_KEYS", "event-sequence: the mapping of events to vehicle states (plume/deflect/leak/strut/dome) is positional; confirm it", "confirm or set each event's state key");
        const P = { dims: { etLength: `claim:${dims[0]}`, etDiameter: `claim:${dims[1]}`, srbLength: `claim:${dims[2]}`, srbDiameter: `claim:${dims[3]}`, srbOffsetM: 6.3, srbAftBelowEtM: 2.4 }, events, rotationDeg: 5,
          camera: CAM.eventTimeline(), orbiterOpacity: 0.16, clipAboveY: 1290, chip: { label: "Reconstruction", kind: "reconstruction" }, source: { text: "Times: event table · proportions approximate", y: 1556 } };
        base.qa.states.push(...events.map((e) => ({ at: e.at, what: `documented event ${e.claim.slice(6)}`, claim: e.claim.slice(6) })));
        emit(i, { ...base, template: "event-sequence", provenance: { kind: "reconstruction", label: "Reconstruction · proportions approximate" }, assets: [], params: count(P), transition: trans }, true); continue; }
      if (ev.length >= 2) { // generic: the documented times as a timeline
        const P = { ticks: ev.map((c) => `claim:${c}`), steps: ev.slice(1).map((c, j) => ({ at: wordFor(line.id, c) || `line:${line.id} +${(0.8 * (j + 1)).toFixed(1)}` })), ground: "ink", chip: { label: "Timeline · documented times", kind: "document" } };
        base.qa.states.push(...P.steps.map((s0, j) => ({ at: s0.at, what: `clock to ${ev[j + 1]}`, claim: ev[j + 1] })));
        emit(i, { ...base, template: "timeline", provenance: { kind: "document", label: "Timeline · documented times" }, assets: [], params: count(P), transition: trans }, false); continue; }
      need(line.id, "MISSING_EVIDENCE", "event line: fewer than two event claims and no film", "add event claims (role event) or a film asset");
      emit(i, { ...base, template: "timeline", provenance: { kind: "document", label: "NEEDS EVENTS" }, assets: [], params: {}, transition: trans }, true); continue;
    }
    // ---------------------------------------------------------------- decision (document desk; consecutive decision lines share one desk)
    if (beat === "decision") {
      const deskName = `desk-${(() => { let j = i; while (j > 0 && beats[j - 1] === "decision") j -= 1; return lines[j].id.toLowerCase(); })()}`; const _unused = `${beats.slice(0, i + 1).lastIndexOf("decision") === i && (i === 0 || beats[i - 1] !== "decision") ? line.id : (() => { let j = i; while (j > 0 && beats[j - 1] === "decision") j -= 1; return lines[j].id; })()}`;
      const docs = Object.keys(A).filter((k) => A[k].kind === "document" && anchorsOf(k).some((x) => x.claim && line.claims.includes(x.claim)));
      const fq = line.claims.find((c) => C[c] && C[c].status === "verified" && ["finding", "quote"].includes(C[c].role) && C[c].display && C[c].passage && C[c].passage.includes(String(C[c].display).replace(/\|/g, " ")));
      if (!docs.length && fq) { const hw = firstWord(line.id, new RegExp(`^${norm(String(C[fq].display).split(/\s+/).find((w) => w.length > 4) || "").slice(0, 6)}`)) || `line:${line.id} +0.6`;
        // backdrop: a related image behind the card. A test/concept image qualifies only as labelled test imagery
        // ("... · not the accident"); it must share at least two terms with the finding's passage and not contradict the subject.
        const want = MATCH.terms(C[fq].passage); const bd = Object.entries(A).filter(([k, a]) => !banned.has(k) && a.kind === "photo" && [...MATCH.terms(`${a.source.title} ${a.source.caption || ""}`)].filter((w) => want.has(w)).length >= 2)
          .sort(([, a], [, b]) => nonEvent(b) - nonEvent(a))[0];
        const P = { claim: `claim:${fq}`, highlightAt: hw, enter: [t0, shift(t0, +0.45)], disclosure: "Report text · typeset, not a scan", chip: { label: "Report text", kind: "document" }, push: { window: [t0, t1], zoom: 1.04 },
          ...(bd ? { backdrop: { asset: `asset:${bd[0]}`, kind: nonEvent(bd[1]) ? "test-imagery" : "historical-photo", label: `${bd[1].provenanceLabel || "Archival photo"}${nonEvent(bd[1]) ? " · not the accident" : ""}` } } : {}) };
        base.qa.states.push({ at: shift(t0, +0.1), what: "excerpt card enters" }, { at: hw, what: "the finding's words are highlighted", claim: fq });
        upgrades.push({ line: line.id, code: "SCAN_REGION_WOULD_UPGRADE", detail: `no document asset has a measured region for ${fq}; a scan of the source page with a verified region would let document-desk show the original` });
        emit(i, { ...base, template: "document-excerpt", provenance: { kind: "document", label: "Report text · typeset" }, assets: bd ? [bd[0]] : [], params: count(P), transition: trans }, false); continue; }
      if (!docs.length) { need(line.id, "MISSING_ANCHOR", "decision line: no document asset has a region anchor stating one of the line's claims", "measure the quoted line on the document scan and tie it to the claim");
        emit(i, { ...base, template: "document-desk", provenance: { kind: "document", label: "NEEDS DOCUMENT REGION" }, assets: [], params: {}, transition: trans }, true); continue; }
      if (!shared[deskName]) shared[deskName] = { pages: [], camera: [], _lines: [] };
      const D = shared[deskName]; D._lines.push(line.id);
      for (const k of docs) { if (D.pages.find((p0) => p0.asset === `asset:${k}`)) continue; const j = D.pages.length;
        D.pages.push({ asset: `asset:${k}`, x: 540, y: 700 + 80 * j, w: 1000 + 40 * j, rot: j ? 1 : -1.5, ...(j ? { slideIn: { window: [shift(t0, +0.05), shift(t0, +0.65)], fromDy: 1500, fromRot: 4 } } : {}), marks: [] });
        if (j) { D.pages[0].dimBy = { event: "slide", amount: 0.25 }; D.pages[0].hideMarksWhenCovered = true; } }
      const marks = []; for (const k of docs) for (const an of anchorsOf(k).filter((x) => x.claim && line.claims.includes(x.claim) && x.rect)) {
        const w = wordFor(line.id, an.claim) || `line:${line.id} +0.5`; marks.push({ page: `asset:${k}`, rect: an.rect, at: w });
        D.pages.find((p0) => p0.asset === `asset:${k}`).marks.push({ region: an.ref, window: [shift(w, -0.05), shift(w, +0.6)] }); }
      const page0 = A[docs[0]]; const ra = CAM.documentReadAlong({ page: page0, world: D.pages.find((p0) => p0.asset === `asset:${docs[0]}`), marks, t0, t1 });
      D.camera.push(...ra.keys.filter((kk) => !D.camera.some((c) => c.at === kk.at)));
      const chron = claimsWithRole(line.claims, "chronology"); if (chron.length) { D.rail = D.rail || { ticks: [], steps: [] };
        const fresh = chron.filter((c) => !D.rail.ticks.includes(`claim:${c}`)); const span = L[line.id].end - L[line.id].start;
        fresh.forEach((c) => { if (D.rail.ticks.length) { const j = D.rail.steps.length; D.rail.steps.push({ at: `line:${line.id} +${(span * (0.15 + 0.7 * (fresh.indexOf(c) / Math.max(1, fresh.length)))).toFixed(2)}`, lead: 0.1, lag: 0.4 }); } D.rail.ticks.push(`claim:${c}`); });
        if (fresh.length) need(line.id, "REVIEW_TIMING", `timeline steps for ${fresh.join(", ")} are spaced evenly across the line (no spoken time to anchor them)`, "confirm or anchor each step to a word"); }
      const finding = claimsWithRole(line.claims, "finding")[0]; if (finding && C[finding].display && C[finding].display.includes("|")) D.finding = { claim: `claim:${finding}`, window: [shift(t1, -1.8), shift(t1, -1.35)], highlight: "", highlightAt: shift(t1, -1.0) };
      const P = { desk: `shared:${deskName}`, ...(D._lines.length === 1 ? { enter: [t0, shift(t0, +0.4)] } : {}), chip: { label: A[docs[0]].provenanceLabel || "Document", kind: "document" } };
      base.qa.states.push(...marks.map((m) => ({ at: m.at, what: "camera reads the quoted line; highlight follows" })), { at: shift(t0, +0.1), what: "documents on the desk" });
      emit(i, { ...base, template: "document-desk", provenance: { kind: "document", label: A[docs[0]].provenanceLabel || "Document" }, assets: docs, params: count(P), transition: trans }, false); continue;
    }
    // ---------------------------------------------------------------- payoff
    if (beat === "payoff") {
      if (!hookAsset) { need(line.id, "MISSING_ASSET", "payoff needs the hook's asset for the loop", "plan a hook with an asset first"); continue; }
      const parts = line.text.split(/(?<=\.)\s+/); const P = { media: `asset:${hookAsset}`, box: A[hookAsset].height > A[hookAsset].width ? CAM.PHOTO_BOX : { x: 0, y: 0, w: CAM.W, h: CAM.H },
        camera: CAM.payoffLoop({ hookKeys, t0, t1: "end" }), lines: parts.length > 1 ? [{ text: parts[0], tier: "setup" }, { text: parts.slice(1).join(" "), tier: "payoff", in: 0.35 }] : [{ text: parts[0], tier: "payoff", in: 0.35 }],
        y: 330, fadeOut: 0.35, dim: 0.25, shades: [{ kind: "top", h: 640 }, { kind: "bottom", y: 1120, h: 290 }, { kind: "ink", y: 1400, h: 520 }], chip: chipFor(hookAsset, "archival") };
      if (/\d/.test(line.text)) need(line.id, "UNSUPPORTED_CLAIM", "payoff text contains a number; numbers on screen must come from claims", "rewrite the payoff line without digits or reference the claim");
      film.captionSkip.push(line.id); base.qa.states.push({ at: `line:${line.id}`, what: "payoff line" }, { at: "end -0.35", what: "returns to the opening frame" });
      emit(i, { ...base, template: "payoff", provenance: { kind: "archival", label: A[hookAsset].provenanceLabel || "Archival" }, assets: [hookAsset], params: count(P), transition: trans }, false); continue;
    }
  }
  for (const d of Object.values(shared)) delete d._lines; count(shared);
  const plan = { schema: "fr-premium.shot-plan.v1", topic: script.topic, channel, style: `${channel}/forensic-v1`, narration: "", evidence: "evidence.json", assets: "assets.json", film, shared, shots };
  return { plan, issues, reviewShots: [...reviewShots], gen, beats, upgrades };
}

function run({ script, evidence, assets, timeline, channel, root, suggestions = [] }) {
  const errs = schemaCheck(JSON.parse(fs.readFileSync(path.join(ENGINE, "schemas/narration-script.schema.json"), "utf8")), script);
  if (errs.length) return { status: "INVALID_INPUT", issues: errs.map((e) => ({ code: "SCRIPT_SCHEMA", detail: e })) };
  const r = makePlanner({ script, evidence, assets, timeline, channel, suggestions });
  const v = validatePlan({ plan: r.plan, evidence, assets, timeline, ...(root ? { root } : {}) });
  for (const e of v.errors) { const m = /^(S\d\d): (.*)$/.exec(e); r.issues.push({ shot: m ? m[1] : null, code: "VALIDATION", detail: m ? m[2] : e }); if (m) r.reviewShots.push(m[1]); }
  if (script.status !== "approved") r.issues.push({ code: "SCRIPT_NOT_APPROVED", detail: "narration script status is draft", needed: "owner approval of the script" });
  if (script.timeline && script.timeline.kind === "estimated") r.issues.push({ code: "ESTIMATED_TIMELINE", detail: "word timings are estimated, not measured from narration", needed: "record narration and re-plan" });
  const review = [...new Set(r.reviewShots)]; const total = r.plan.shots.length;
  const status = r.issues.length ? "NEEDS_HUMAN_REVIEW" : "PLANNED";
  return { status, plan: r.plan, issues: r.issues, upgrades: r.upgrades, beats: r.beats, metrics: { shots: total, autoPlannedClean: total - review.length, needsReview: review.length, reviewShots: review, generatedValues: r.gen.values, manualValues: 0, validation: { errors: v.errors.length, warnings: v.warnings.length } } };
}

if (require.main === module) {
  const a = process.argv.slice(2); const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null); const J = (f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
  const res = run({ script: J(opt("--script")), evidence: J(opt("--evidence")), assets: J(opt("--assets")), timeline: J(opt("--timeline")), channel: opt("--channel") || "failure-reconstructed", suggestions: opt("--suggestions") ? J(opt("--suggestions")).suggestions : [] });
  if (res.plan) { const out = opt("--out"); const tl = opt("--timeline"); if (out) { const rel = (f) => path.relative(path.dirname(path.resolve(out)), path.resolve(f)); res.plan.narration = rel(tl); res.plan.evidence = rel(opt("--evidence")); res.plan.assets = rel(opt("--assets")); fs.writeFileSync(out, JSON.stringify(res.plan, null, 1) + "\n"); } }
  const rep = { status: res.status, metrics: res.metrics, issues: res.issues, upgrades: res.upgrades || [] }; if (opt("--report")) fs.writeFileSync(opt("--report"), JSON.stringify(rep, null, 1) + "\n");
  console.log(`${res.status}: ${res.metrics ? `${res.metrics.shots} shots, ${res.metrics.autoPlannedClean} clean, ${res.metrics.needsReview} need review; ${res.metrics.generatedValues} generated values` : ""}`);
  for (const i of res.issues) console.log(`  ${i.code}${i.line ? " " + i.line : ""}${i.shot ? " " + i.shot : ""}: ${i.detail}`);
  process.exit(res.status === "PLANNED" ? 0 : 2);
}
module.exports = { run, makePlanner, words };
