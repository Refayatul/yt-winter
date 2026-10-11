// Generic interpreter for profitdecoded.scene-spec.v1 (core/profitdecoded/scene-spec.js). Runs in the page
// built by render-motion.js after brand-lib.js, in place of a film's handwritten scenes.js; the spec is
// injected as window.SCENE_SPEC. Every frame is a pure function of time, like the handwritten films.
// Timing: each scene starts at its beat (PD.b) minus a short lead; element entrances use spoken phrase
// cues inside that beat (PD.bw) when the spec names them, otherwise a fixed stagger.
window.SCENES = function (PD) {
  const { C, F, E, p, lerp, clamp, svg, defs, vignette, esc } = PD;
  const spec = window.SCENE_SPEC; if (!spec || !Array.isArray(spec.scenes)) throw new Error("SCENE_SPEC missing");
  const LEAD = 0.12;
  const ROLE = {
    "environment": ["real-world illustration", "environment", "context"], "evidence-card": ["financial evidence", "evidence card", "dark"],
    "counter": ["data visualization", "chart", "dark"], "money-flow": ["explanatory diagram", "diagram", "dark"], "comparison": ["data visualization", "comparison", "dark"],
    "timeline": ["explanatory diagram", "timeline", "dark"], "filing-quote": ["financial evidence", "document", "paper"], "statement": ["branded title card", "statement", "dark"],
    "rule-card": ["explanatory diagram", "rule card", "dark"], "sum": ["data visualization", "chart", "dark"], "map": ["explanatory diagram", "map", "dark"],
  };
  const ent = (t, at, d = PD.T.enter) => E.out(p(t, at, at + d));
  const at = (x, y, inner, rot = 0, sc = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
  const ln = (d, op = 0.7, w = 4, col = C.mist) => `<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const fmt = (v, s) => `${s.prefix || ""}${Number(v).toFixed(s.decimals || 0)}${s.suffix || ""}`;
  // Count-up from 0 to the sourced value, starting at the cue. Intermediate values are shown only while the
  // count is visibly running (0.9 s) and only when it can finish at least 1 s before the shot ends; otherwise
  // the sourced value appears directly, so a still frame never holds a plausible but wrong figure.
  const COUNT = 0.9;
  const counted = (s, t, c0, X) => { if (s.countTo == null) return s.value; if (c0 + COUNT > X.start + X.dur - 1) return t >= c0 ? s.value : "—";
    if (t < c0) return "—"; const run = E.out(p(t, c0, c0 + COUNT)); return run < 0.999 ? fmt(s.countTo * run, s) : s.value; };

  // ---- backgrounds and camera ----
  const paperBg = () => `<rect width="1920" height="1080" fill="${C.paper}"/><rect width="1920" height="1080" fill="#000" opacity="0.5" filter="url(#paperTex)"/>`;
  // Data drawn over an everyday environment sits on a dark panel, so the scene behind never competes with the figures.
  const PANEL = `<rect x="150" y="70" width="1620" height="860" rx="28" fill="${C.ink}" fill-opacity="0.82"/>`;
  const PANELLED = new Set(["counter", "money-flow", "comparison", "timeline", "sum", "map", "statement"]);
  const frame = (bg, inner, t, env, type) => bg === "context" ? svg(defs() + PD.environment(env || "desk", t) + (PANELLED.has(type) ? PANEL : "") + inner)
    : bg === "paper" ? svg(defs() + paperBg() + inner) : svg(defs() + inner + vignette(), C.ink);
  // No picture holds still while the narration runs: at least 0.22% zoom per second, as in the films.
  const cam = (kind, lt, dur, inner, cx = 960, cy = 540) => {
    const k = E.inOut(p(lt, 0, dur)); const min = 0.0022 * dur;
    const z = kind === "pull" ? lerp(1.05 + min, 1.0, k) : kind === "push" ? lerp(1.0, Math.max(1.05, 1 + min), k) : 1 + min * k;
    const dx = kind === "drift" ? lerp(-24, 24, k) : 0;
    return `<g transform="translate(${cx + dx} ${cy}) scale(${z}) translate(${-cx} ${-cy})">${inner}</g>`;
  };
  const sourceLine = (s, k, bg) => s.source ? PD.sourceCompact(s.source, k, { dark: bg !== "paper" }) : "";
  const kicker = (text, k, y = 140, bg = "dark") => text ? PD.label(960, y, text.toUpperCase(), { size: 34, anchor: "middle", fill: bg === "paper" ? "#3a372f" : C.mist, ls: 6, op: k }) : "";
  const tag = (x, y, text, k, { fill = C.ink2, fg = C.text, size = 34 } = {}) => { if (!text) return ""; const w = PD.measure(text, { size, family: F.sans, weight: 700 }) + text.length * 2 + 48;
    return `<g opacity="${k}" transform="translate(${x - w / 2} ${y})"><rect width="${w}" height="${size * 1.7}" rx="${size * 0.5}" fill="${fill}" fill-opacity="0.92"/>${PD.label(w / 2, size * 1.17, text, { size, anchor: "middle", fill: fg, ls: 2 })}</g>`; };

  // ---- original, unbranded line-art props for everyday scenes ----
  const PROP = {
    "payment-card": (k) => `<g opacity="${k}" filter="url(#soft)"><rect x="-190" y="-120" width="380" height="240" rx="18" fill="${C.ledger}"/><rect x="-190" y="-40" width="380" height="18" fill="${C.signal}"/><rect x="-150" y="20" width="62" height="46" rx="8" fill="${C.gold}"/>${ln("M60 50 H150 M60 76 H120", 0.6, 6, C.paper)}</g>`,
    "phone": (k, label) => `<g opacity="${k}" filter="url(#soft)"><rect x="-130" y="-260" width="260" height="520" rx="36" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.7" stroke-width="4"/><rect x="-108" y="-220" width="216" height="430" rx="14" fill="#f6f0e5"/>${label ? PD.lines(0, -120, wrap(label, 12), { size: 34, fill: C.ink, weight: 700, anchor: "middle" }) : ""}</g>`,
    "terminal": (k) => `<g opacity="${k}"><rect x="-110" y="-170" width="220" height="340" rx="28" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.7" stroke-width="4"/><rect x="-80" y="-140" width="160" height="90" rx="8" fill="none" stroke="${C.mist}" stroke-opacity="0.6" stroke-width="3"/>${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<circle cx="${-50 + c * 50}" cy="${-10 + r * 42}" r="11" fill="none" stroke="${C.mist}" stroke-opacity="0.45" stroke-width="2.5"/>`).join("")).join("")}</g>`,
    "document": (k) => `<g opacity="${k}" filter="url(#soft)"><rect x="-170" y="-230" width="340" height="460" fill="#fbf8f1"/>${[-160, -120, -80, -40, 0, 40, 80, 120].map((y, i) => `<line x1="-120" y1="${y}" x2="${i % 3 === 2 ? 40 : 120}" y2="${y}" stroke="#bbb" stroke-width="6"/>`).join("")}</g>`,
    "envelope": (k) => `<g opacity="${k}" filter="url(#soft)"><rect x="-170" y="-110" width="340" height="220" rx="8" fill="#efe6d4"/>${ln("M-170 -110 L0 20 L170 -110", 0.9, 4, "#b9a888")}</g>`,
    "calendar": (k) => `<g opacity="${k}" filter="url(#soft)"><rect x="-150" y="-170" width="300" height="340" rx="14" fill="#fbf8f1"/><rect x="-150" y="-170" width="300" height="80" rx="14" fill="${C.signal}"/>${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${-120 + c * 50}" y="${-60 + r * 50}" width="36" height="34" rx="4" fill="#ddd5c4"/>`).join("")).join("")}</g>`,
    "stack": (k, label, s) => { const n = Math.max(3, Math.round(8 * (s.scale || 1))); return `<g opacity="${k}">${Array.from({ length: n }, (_, i) => `<rect x="-150" y="${100 - i * 26 * clamp(k * 1.2)}" width="300" height="22" rx="3" fill="${i % 2 ? "#efe6d4" : "#f8f2e6"}" stroke="#b9a888" stroke-width="2"/>`).join("")}</g>`; },
    "drawer": (k) => `<g opacity="${k}"><rect x="-230" y="-130" width="460" height="260" rx="12" fill="#6b5240" stroke="#3b2c22" stroke-width="5"/><rect x="-200" y="-100" width="400" height="200" rx="8" fill="#7c6049"/><rect x="-60" y="-12" width="120" height="24" rx="12" fill="${C.gold}"/></g>`,
    "folder": (k) => `<g opacity="${k}" filter="url(#soft)"><path d="M-200 -130 H-60 L-30 -100 H200 V150 H-200 Z" fill="#c9a66b"/><rect x="-200" y="-90" width="400" height="240" rx="6" fill="#d8b77c"/></g>`,
    "coin": (k) => `<g opacity="${k}"><circle r="56" fill="${C.gold}"/><circle r="40" fill="none" stroke="#8a6a1f" stroke-width="4"/></g>`,
    "ticket": (k) => `<g opacity="${k}" filter="url(#soft)"><rect x="-210" y="-90" width="420" height="180" rx="14" fill="#f6f0e5"/><line x1="90" y1="-80" x2="90" y2="80" stroke="#bbb" stroke-width="4" stroke-dasharray="10 8"/>${ln("M-170 -40 H40 M-170 0 H10 M-170 40 H-20", 0.8, 6, "#b9a888")}<path d="M130 -20 l40 20 l-40 20 Z" fill="${C.ledger}"/></g>`,
  };
  function wrap(text, max) { const out = []; let line = ""; for (const w of String(text).split(/\s+/)) { if ((line + " " + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; }

  // ---- scene types ----
  const DRAW = {
    "environment": (s, lt, t, X) => {
      const props = (s.props || []).map((pr, i) => { const k = ent(t, X.cue(pr.cue, 0.2 + i * 0.35)); const x = pr.x != null ? pr.x : 520 + i * 440, y = pr.y != null ? pr.y : 600;
        // Labels stay at full size whatever the prop's scale, so they keep the mobile font floor.
        const sc = pr.scale || 1;
        return at(x, lerp(y + 30, y, k), at(0, 0, PROP[pr.kind](k, pr.label, pr), 0, sc) + (pr.kind !== "phone" && pr.label ? tag(0, (pr.kind === "stack" ? 150 : 130) * sc, pr.label, k) : "")); }).join("");
      const ov = s.overlay ? (() => { const k = ent(t, X.cue(s.overlay.cue, 1.0)); return PD.evidenceCard({ x: 1180, y: 300, w: 620, h: 430, kicker: s.overlay.kicker, value: s.overlay.value, detail: s.overlay.detail, k }); })() : "";
      return frame("context", cam(s.camera || "push", lt, X.dur, props) + ov + tag(960, 900, s.caption, ent(lt, 0.8)) + (s.overlay ? PD.sourceCompact(s.overlay.source, ent(t, X.cue(s.overlay.cue, 1.0) + 0.3)) : sourceLine(s, ent(lt, 0.4), "context")), t, s.environment, s.type);
    },
    "evidence-card": (s, lt, t, X) => {
      // The card is on screen from the start of the shot; the spoken cue drives the count-up only.
      const c0 = X.cue(s.cue, 0.15); const k = ent(lt, 0.1); const value = counted(s, t, c0, X);
      const card = PD.evidenceCard({ x: 560, y: 250, w: 800, h: 460, kicker: s.kicker, value, detail: s.detail, k, paper: X.bg !== "paper" });
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, card + (s.stamp ? PD.stamp(1330, 760, s.stamp.toUpperCase(), E.back(p(t, c0 + 1.2, c0 + 1.6)), { size: 34 }) : "")) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "counter": (s, lt, t, X) => {
      const c0 = X.cue(s.cue, 0.2); const run = E.out(p(t, c0, c0 + COUNT)); const val = counted({ ...s, value: s.value || fmt(s.countTo, s) }, t, c0, X);
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, `${kicker(s.label, ent(lt, 0.05), 330, X.bg)}${PD.number(960, 640, val, { size: 230, anchor: "middle", fill: X.bg === "paper" ? C.ink : C.text, op: ent(t, c0 - 0.1) })}
        <rect x="${960 - 360 * run}" y="700" width="${720 * run}" height="6" fill="${C.signal}"/>${tag(960, 760, s.detail, ent(t, c0 + 1.2))}${s.stamp ? PD.stamp(1460, 470, s.stamp.toUpperCase(), E.back(p(t, c0 + 1.5, c0 + 1.9)), { size: 32 }) : ""}`) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "money-flow": (s, lt, t, X) => {
      const k = clamp((t - X.cue(s.cue, 0.2)) / Math.max(1.5, X.dur * 0.6));
      // Sub-labels and link labels are drawn here at 34 px (the library's 24-26 px falls below the mobile floor).
      const kk = E.inOut(k); const n = s.nodes.length; const by = Object.fromEntries(s.nodes.map((nd) => [nd.id, nd]));
      const subs = s.nodes.map((nd, i) => nd.sub ? PD.label(nd.x, nd.y + 112, nd.sub, { size: 34, anchor: "middle", fill: C.mist, ls: 1, weight: 600, op: clamp(kk * n - i * 0.5) }) : "").join("");
      const linkLabels = s.links.map((l, i) => l.label ? PD.label((by[l.from].x + by[l.to].x) / 2, (by[l.from].y + by[l.to].y) / 2 - 40, l.label, { size: 34, anchor: "middle", fill: C.text, ls: 2, op: clamp(kk * s.links.length - i) }) : "").join("");
      const flow = PD.moneyFlow({ nodes: s.nodes.map(({ sub, ...nd }) => nd), links: s.links.map(({ label, ...l }) => l), t: lt, k: kk });
      return frame(X.bg, cam(s.camera || "drift", lt, X.dur, kicker(s.kicker, ent(lt, 0.05)) + flow + subs + linkLabels) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "comparison": (s, lt, t, X) => {
      const items = s.items || []; const max = Math.max(...items.map((i) => i.value)); const base = 790, top = 290, gap = 520; const x0 = 960 - gap * (items.length - 1) / 2;
      const cols = items.map((it, i) => { const c0 = X.cue(it.cue, 0.3 + i * 0.6); const g = E.inOut(p(t, c0, c0 + 1.4)); const h = (base - top) * it.value / max * g; const x = x0 + i * gap;
        const sheets = Math.max(1, Math.floor(h / 22));
        return `<g>${Array.from({ length: sheets }, (_, j) => `<rect x="${x - 150}" y="${base - (j + 1) * 22}" width="300" height="20" rx="3" fill="${it.accent ? (j % 2 ? "#e8553d" : "#f06e57") : (j % 2 ? "#efe6d4" : "#f8f2e6")}" stroke="${it.accent ? "#a63a28" : "#b9a888"}" stroke-width="2"/>`).join("")}
          <rect x="${x - 150}" y="${base - (base - top) * it.value / max}" width="300" height="${(base - top) * it.value / max}" fill="none" stroke="${C.mist}" stroke-opacity="${0.35 * ent(lt, 0.1)}" stroke-width="2" stroke-dasharray="10 10"/>
          ${PD.number(x, base - h - 34, it.display || fmt(it.value * (g >= 0.999 ? 1 : g), s), { size: 64, anchor: "middle", fill: C.text, op: clamp(g * 3) })}${tag(x, base + 22, it.label, ent(lt, 0.2 + i * 0.15))}</g>`; }).join("");
      const ground = `<line x1="300" y1="${base}" x2="1620" y2="${base}" stroke="${C.mist}" stroke-width="4" opacity="0.6"/>`;
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, kicker(s.kicker, ent(lt, 0.05)) + ground + cols + tag(960, 895, s.caption, ent(t, Math.max(...items.map((it, i) => X.cue(it.cue, 0.3 + i * 0.6))) + 1.4))) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "timeline": (s, lt, t, X) => {
      const marks = s.marks || []; const x0 = 260, x1 = 1660, y = 560; const times = marks.map((m, i) => X.cue(m.cue, 0.3 + i * 0.7)); const last = Math.max(...times);
      const draw = clamp((t - X.start) / Math.max(0.6, last - X.start + 0.4));
      const ms = marks.map((m, i) => { const mx = lerp(x0, x1, m.at); const a = ent(t, times[i] - 0.1); const up = i % 2 === 0;
        return `<g opacity="${a}"><circle cx="${mx}" cy="${y}" r="${18 * a}" fill="${m.accent ? C.signal : C.text}"/>${PD.label(mx, up ? y - 62 : y + 86, m.label, { size: 36, anchor: "middle", fill: C.text, ls: 1.5 })}${m.sub ? PD.label(mx, up ? y - 110 : y + 134, m.sub, { size: 30, anchor: "middle", fill: C.mist, ls: 1.5, weight: 600 }) : ""}</g>`; }).join("");
      return frame(X.bg, cam(s.camera || "drift", lt, X.dur, kicker(s.kicker, ent(lt, 0.05)) + `<line x1="${x0}" y1="${y}" x2="${lerp(x0, x1, draw)}" y2="${y}" stroke="${C.mist}" stroke-width="6" stroke-linecap="round"/>` + ms) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "filing-quote": (s, lt, t, X) => {
      const k = ent(lt, 0.05); const c0 = X.cue(s.cue, 0.6); const hk = E.inOut(p(t, c0, c0 + 1.2));
      return frame("paper", cam(s.camera || "push", lt, X.dur, PD.filingQuote({ x: 260, y: 240, w: 1400, quote: s.quote, highlight: s.highlight || "", cite: s.cite, k, hk, size: 54 })), t);
    },
    "statement": (s, lt, t, X) => {
      const k = ent(t, X.cue(s.cue, 0.1), 0.6);
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, `${PD.statement(s.text, { y: 570, size: s.text.length > 28 ? 84 : 104, k, accent: s.accent || "" })}${s.stamp ? PD.stamp(960, 760, s.stamp.toUpperCase(), E.back(p(t, X.cue(s.cue, 0.1) + 0.7, X.cue(s.cue, 0.1) + 1.1)), { size: 34 }) : ""}`) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "rule-card": (s, lt, t, X) => {
      const k = ent(lt, 0.05); const lines = s.lines || []; const cues = s.cues || [];
      const rows = lines.map((line, i) => { const a = ent(t, X.cue(cues[i], 0.6 + i * 0.5)); const y = 430 + i * 96;
        return `<g opacity="${a}" transform="translate(${lerp(30, 0, a)} 0)"><circle cx="520" cy="${y - 13}" r="22" fill="${C.ledger}"/>${ln(`M509 ${y - 13} l8 9 l15 -19`, 1, 5, C.paper)}${PD.label(566, y, line, { size: 38, fill: C.ink, ls: 0.5, weight: 600 })}</g>`; }).join("");
      const card = `<g opacity="${k}" transform="translate(0 ${lerp(30, 0, k)})" filter="url(#soft)"><rect x="440" y="230" width="1040" height="${170 + lines.length * 96 + 30}" rx="24" fill="#f6f0e5"/><rect x="440" y="230" width="1040" height="16" rx="8" fill="${C.signal}"/>${PD.label(500, 320, s.title.toUpperCase(), { size: 40, fill: C.ink, ls: 3 })}</g>`;
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, card + `<g opacity="${k}">${rows}</g>`) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "sum": (s, lt, t, X) => {
      const items = s.items || []; const total = s.total; const sumV = items.reduce((a, i) => a + i.value, 0); const W = 1300, x0 = 310, y = 520; let cx = x0;
      const segs = items.map((it, i) => { const c0 = X.cue(it.cue, 0.3 + i * 0.7); const g = E.inOut(p(t, c0, c0 + 0.8)); const w = W * it.value / Math.max(sumV, total.value) * g; const x = cx; cx += W * it.value / Math.max(sumV, total.value);
        return `<g><rect x="${x}" y="${y}" width="${Math.max(0, w - 6)}" height="120" rx="10" fill="${[C.ledger, C.gold, C.signal, "#5b7d83", "#8a6f3a"][i % 5]}"/>${PD.label(x + 12, y - 68, it.label, { size: 32, fill: C.text, ls: 1.5, op: clamp(g * 2) })}${PD.number(x + 12, y - 22, it.display || String(it.value), { size: 42, fill: C.text, op: clamp(g * 2) })}</g>`; }).join("");
      const tk = ent(t, X.cue(s.cue, 0.3 + items.length * 0.7 + 0.4));
      return frame(X.bg, cam(s.camera || "push", lt, X.dur, `${kicker(s.kicker, ent(lt, 0.05))}${segs}<g opacity="${tk}">${ln(`M${x0} ${y + 160} V${y + 190} H${x0 + W} V${y + 160}`, 0.8, 4)}${PD.label(960, y + 260, total.label.toUpperCase(), { size: 34, anchor: "middle", fill: C.mist, ls: 4 })}${PD.number(960, y + 360, total.display || String(total.value), { size: 96, anchor: "middle", fill: C.text })}</g>${s.stamp ? PD.stamp(1500, y + 320, s.stamp.toUpperCase(), E.back(p(t, X.cue(s.cue, 0.3 + items.length * 0.7 + 0.4) + 0.5, X.cue(s.cue, 0.3 + items.length * 0.7 + 0.4) + 0.9)), { size: 32 }) : ""}`) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
    "map": (s, lt, t, X) => {
      const pts = Object.fromEntries((s.points || []).map((pt) => [pt.id, pt]));
      const grid = Array.from({ length: 13 }, (_, i) => Array.from({ length: 7 }, (__, j) => `<circle cx="${180 + i * 130}" cy="${220 + j * 110}" r="3" fill="${C.mist}" opacity="0.25"/>`).join("")).join("");
      const routes = (s.routes || []).map((r, i) => { const a = pts[r.from], b = pts[r.to]; const c0 = X.cue(r.cue, 0.4 + i * 0.8); const k = E.inOut(p(t, c0, c0 + 1.2)); const qx = a.x * 0.25 + b.x * 0.75, qy = a.y; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 20; const len = Math.hypot(b.x - a.x, b.y - a.y) * 1.25;
        return `${PD.path(`M${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`, len, k, { stroke: C.gold, width: 6 })}${r.label ? PD.label(mx, my, r.label, { size: 32, anchor: "middle", fill: C.text, ls: 1.5, op: k }) : ""}`; }).join("");
      const points = (s.points || []).map((pt, i) => { const k = ent(lt, 0.1 + i * 0.15); return `<g opacity="${k}"><circle cx="${pt.x}" cy="${pt.y}" r="16" fill="${C.signal}"/><circle cx="${pt.x}" cy="${pt.y}" r="${16 + 18 * ((lt * 0.8 + i * 0.3) % 1)}" fill="none" stroke="${C.signal}" stroke-opacity="${1 - ((lt * 0.8 + i * 0.3) % 1)}" stroke-width="3"/>${PD.label(pt.x, pt.y + 64, pt.label, { size: 34, anchor: "middle", fill: C.text, ls: 2 })}</g>`; }).join("");
      return frame(X.bg, cam(s.camera || "pull", lt, X.dur, kicker(s.kicker, ent(lt, 0.05)) + grid + routes + points + tag(960, 850, s.caption, ent(lt, 1.0))) + sourceLine(s, ent(lt, 0.4), X.bg), t, s.environment, s.type);
    },
  };

  // ---- shots ----
  const shots = spec.scenes.map((s) => {
    const role = ROLE[s.type]; if (!role) throw new Error(`unknown scene type ${s.type}`);
    const start = s.beat ? Math.max(0, PD.b(s.beat).start - LEAD) : s.start;
    const bg = s.background || role[2];
    const shot = { id: s.id, start, in: s.in || "cut", inDur: s.inDur, visual: s.visual || s.type, asset: "original SVG motion graphic (scene spec)", license: "owned",
      category: s.category || role[0], background: bg, layout: s.layout || role[1], textWeight: s.type === "statement" || s.type === "rule-card" ? "high" : "low",
      motion: s.camera || "animated", sourceQualified: !!(s.source || s.cite || (s.overlay && s.overlay.source)), semanticAnchor: s.anchor || "" };
    shot.draw = (lt, t) => {
      const X = { start: shot.start, dur: Math.max(0.5, shot.end - shot.start), bg,
        cue: (phrase, fallback) => (phrase && s.beat ? PD.bw(s.beat, phrase) - 0.15 : shot.start + fallback) };
      return DRAW[s.type](s, lt, t, X);
    };
    return shot;
  });
  shots.sort((a, b) => a.start - b.start);
  shots.forEach((s, i) => { s.end = i + 1 < shots.length ? shots[i + 1].start : PD.audioDur; });
  return { shots, duration: PD.audioDur };
};
