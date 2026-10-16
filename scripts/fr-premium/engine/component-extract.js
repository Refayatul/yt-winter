"use strict";
// Component extraction: reads verified claim passages and returns the parts, relations and documented
// states of a mechanical or electrical system (heaters, switches, valves, wiring, tanks, pressure
// systems). Deterministic text rules over a shared vocabulary; nothing is inferred beyond the passage.
//
// Every part, link and state carries the claim it comes from and the exact passage phrase that
// supports it, so the validator can check that each on-screen label is in its claim's passage.
// It returns topology only. Geometry (where parts sit, how big they are) is never in a passage, so
// a scene built from this output is a conceptual diagram unless a drawing has verified part anchors.
const VOCAB = {
  // kind -> phrases, longest first (the longest phrase found at a position wins)
  supply: ["gse power supply", "spacecraft power supply", "power supply", "battery", "generator"],
  switch: ["thermostatic switches", "thermostatic switch", "switches", "switch", "relay", "breaker"],
  heater: ["heater tube assembly", "heater assembly", "heater tube", "heating element", "heaters", "heater"],
  insulation: ["teflon insulation", "insulation"],
  wire: ["fan motor wires", "motor wires", "wiring", "wires", "wire", "conductors"],
  motor: ["fan motors", "fan motor", "motors", "pump"],
  vessel: ["oxygen tank no. 2", "oxygen tank", "pressure vessel", "tank", "bottle"],
  valve: ["relief valve", "check valve", "valve", "regulator"],
  sensor: ["temperature sensor", "quantity probe", "sensor", "probe"],
  seal: ["o-rings", "o-ring", "seal", "gasket"],
};
// plurals and assemblies name the same part ("heaters", "heater tube assembly" -> heater)
const canon = (kind, phrase) => {
  if (kind === "supply") return phrase.replace(/s$/, "");
  return kind;
};
// relation cues: the text between mention A and the next mention B (same sentence, at most 70 characters)
const LINKS = [
  { re: /\b(?:energized|powered|supplied|fed)\s+(?:with|from|by)\b/, kind: "powered-by" },
  { re: /\bprotected\s+(?:with|by)\b/, kind: "protected-by" },
  { re: /\bmounted\s+(?:on|to)\b/, kind: "mounted-on" },
  { re: /\b(?:in the vicinity of|near|adjacent to|next to)\b/, kind: "near" },
  { re: /\brated\b[^.]*\bfor\b/, kind: "rated-for" },
  { re: /^\s+on\s+(?:the\s+)?$/, kind: "layer-of" },
  { re: /^\s+(?:in|inside|within)\s+(?:the\s+)?$/, kind: "inside" },
];
// documented states: a cue in the sentence attaches to a part kind
const STATES = [
  { re: /\b(?:could not|did not|failed to|unable to)\s+open\b/, state: "stuck-closed", kinds: ["switch", "valve"], label: (m) => m[0] },
  { re: /\b(?:intended|designed|set)\s+to\s+open\b/, state: "threshold", kinds: ["switch", "valve"], needs: "temperature", label: () => "open" },
  { re: /\btemperature of\b/, state: "hot", kinds: ["heater", "wire", "vessel", "insulation"], needs: "temperature", after: true },
  { re: /\b(?:damage|damaged|damaging|crack|cracked|burn|burned|melt|melted)\b/, state: "damaged", kinds: ["insulation", "wire", "seal"], after: true, label: (m) => m[0] },
  { re: /\b(?:energized|powered)\b/, state: "on", kinds: ["supply", "heater", "motor"], needs: "voltage" },
  { re: /\brated\b/, state: "rated", kinds: ["switch", "valve", "motor"], needs: "voltage" },
  { re: /\blost pressure\b|\bruptur\w*|\bburst\b/, state: "pressure-loss", kinds: ["vessel"] },
];

function mentions(passage) {
  const low = passage.toLowerCase(); const out = []; const taken = new Array(low.length).fill(false);
  const all = Object.entries(VOCAB).flatMap(([kind, ps]) => ps.map((ph) => ({ kind, ph }))).sort((a, b) => b.ph.length - a.ph.length);
  for (const { kind, ph } of all) { let i = -1;
    while ((i = low.indexOf(ph, i + 1)) >= 0) { const end = i + ph.length;
      if (/[a-z]/.test(low[i - 1] || "") || /[a-z]/.test(low[end] || "")) continue; if (taken.slice(i, end).some(Boolean)) continue;
      for (let j = i; j < end; j += 1) taken[j] = true; out.push({ kind, phrase: passage.slice(i, end), at: i, end }); } }
  return out.sort((a, b) => a.at - b.at);
}
// sentence ends: ". " not after an abbreviation used in technical reports ("65 V dc. GSE", "tank no. 2")
const ABBR = /(?:^|[^A-Za-z])(?:dc|ac|no|nos|vol|fig|approx|ca|e\.s\.t|p\.m|a\.m|ft|in|lb|psi|psia)$/i;
const ends = (passage) => { const out = []; const re = /\.\s+/g; let m; while ((m = re.exec(passage))) if (!ABBR.test(passage.slice(0, m.index))) out.push(m.index); return out; };
const sentenceOf = (passage, at) => { const e = ends(passage); const s = e.filter((x) => x < at).pop(); const n = e.find((x) => x >= at); return [s == null ? 0 : s + 1, n == null ? passage.length : n]; };
const crossesSentence = (passage, a, b) => ends(passage).some((x) => x >= a && x < b);

// claims: { id: claim } (verified only). Returns { parts, links, states, unsupported }.
function extract(claimIds, claims) {
  const parts = {}; const links = []; const states = []; const skipped = [];
  const partFor = (m, claimId) => { const id = canon(m.kind, m.phrase.toLowerCase()).replace(/[^a-z0-9]+/g, "-");
    if (!parts[id]) parts[id] = { id, kind: m.kind, label: m.phrase, claim: claimId, mentions: [] };
    // the most specific phrase becomes the label ("heater tube" over "heaters")
    if (m.phrase.length > parts[id].label.length && m.kind !== "vessel") Object.assign(parts[id], { label: m.phrase, claim: claimId });
    parts[id].mentions.push({ claim: claimId, phrase: m.phrase }); return id; };
  for (const cid of claimIds) { const c = claims[cid]; if (!c || c.status !== "verified" || !c.passage) { skipped.push(cid); continue; }
    const P = c.passage; const ms = mentions(P); const ids = ms.map((m) => partFor(m, cid));
    for (let i = 0; i + 1 < ms.length; i += 1) { const gap = P.slice(ms[i].end, ms[i + 1].at); if (gap.length > 70 || crossesSentence(P, ms[i].end, ms[i + 1].at)) continue;
      const L = LINKS.find((x) => x.re.test(gap.toLowerCase())); if (!L || ids[i] === ids[i + 1]) continue;
      const [a, b] = L.kind === "protected-by" ? [ids[i + 1], ids[i]] : [ids[i], ids[i + 1]];
      links.push({ from: a, to: b, kind: L.kind === "protected-by" ? "in-series" : L.kind, claim: cid, phrase: P.slice(ms[i].at, ms[i + 1].end) }); }
    const isTemp = c.value != null && /°?F$|°?C$|^K$/.test(c.unit || ""); const isVolt = c.value != null && /^V$/.test(c.unit || "");
    let valueUsed = false; // a claim's number belongs to one state (80 F is the switch threshold, not a heater temperature)
    for (const S of STATES) { const m = S.re.exec(P.toLowerCase()); if (!m) continue;
      if (S.needs === "temperature" && !isTemp) continue; if (S.needs === "voltage" && !isVolt) continue; if (S.needs && valueUsed) continue;
      const [s0, s1] = sentenceOf(P, m.index); const inS = ms.map((x, j) => ({ ...x, id: ids[j] })).filter((x) => x.at >= s0 && x.at < s1 && S.kinds.includes(x.kind));
      // a cue that names its object ("temperature of the heater tube", "damage the insulation") takes the next mention; otherwise the sentence's subject
      const target = S.after ? inS.find((x) => x.at > m.index) || inS[0] : inS.find((x) => x.at < m.index) || inS[0];
      if (!target) continue; if (S.needs) valueUsed = true;
      states.push({ part: target.id, state: S.state, claim: cid, phrase: P.slice(Math.min(m.index, target.at), Math.max(m.index + m[0].length, target.end)),
        ...(S.label ? { label: S.label(m) } : {}), ...(S.needs ? { value: cid } : {}) }); }
  }
  // a layer ("insulation on the wires") belongs to its wire: drawn as the wire's sheath, not a separate part
  for (const l of links.filter((x) => x.kind === "layer-of")) { if (parts[l.from]) parts[l.from].layerOf = l.to; }
  return { parts, links, states, skipped };
}

// on-screen label check: every word of a label (ignoring claim placeholders) must occur in the claim's passage
const stem = (w) => w.toLowerCase().replace(/(?:ing|ed|es|s)$/, "").replace(/e$/, "");
function labelSupported(label, passage) {
  const words = String(label).replace(/\{[^}]+\}/g, " ").replace(/<br>/g, " ").split(/[^A-Za-z]+/).filter((w) => w.length > 2);
  const have = new Set(String(passage).split(/[^A-Za-z]+/).filter(Boolean).map(stem));
  return words.filter((w) => !have.has(stem(w)));
}

module.exports = { extract, mentions, labelSupported, VOCAB };
