// Failure Reconstructed premium motion library (runs inside the page built by render-vertical.js).
// Every frame is a pure function of time t: no CSS animations or clocks, so a render is reproducible
// and any frame can be re-rendered alone. 1080x1920 (9:16).
//
// A film's scenes.js calls FR.shot({...}) for each shot and FR.overlay(fn) for global layers.
// A shot's render(t, k) returns { under: "<g>" (below media), media: [layer], svg: "<g>..</g>" (above media), hud: "<div>..</div>" }:
//   media layer = { src, iw, ih, crop: {x,y,w,h} (source px), box: {x,y,w,h} (screen px), opacity, filter, radius }
// Provenance is explicit on every shot (kind + label): archival media and explanatory reconstructions
// are always labelled differently on screen.
(function () {
  const W = 1080, H = 1920;
  const C = { ink: "#090c11", ink2: "#111821", panel: "#151d28", line: "#2b3747", steel: "#a9b7c8", steel2: "#6d7c8f",
    paper: "#ece6da", text: "#f5f2ec", hot: "#ff6a2a", hot2: "#ffb547", cold: "#7cc6ff", red: "#e5484d", muted: "#8b95a3",
    et: "#b8673a", et2: "#8f4e2c", srb: "#e9e7e1", srb2: "#c9c6bd" };
  const F = { sans: "'PD Sans', sans-serif", num: "'PD Num', sans-serif", serif: "'PD Serif', serif" };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const p = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
  const E = {
    out: (k) => 1 - Math.pow(1 - k, 3),
    in: (k) => k * k * k,
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
    back: (k) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

  const FR = { W, H, C, F, E, clamp, lerp, p, esc, tl: null, shots: [], overlays: [], media: {}, captionSkip: new Set() };

  // ---- timing from the measured narration --------------------------------------------------
  FR.L = (id) => { const l = FR.tl.lines.find((x) => x.id === id); if (!l) throw new Error("line " + id); return l; };
  // Start (or end) of the n-th occurrence of a word inside a line.
  FR.Wd = (id, word, n = 0, edge = "start") => {
    const ws = FR.tl.words.filter((w) => w.line === id && norm(w.text) === norm(word));
    if (!ws[n]) throw new Error(`word "${word}" #${n} not in ${id}`);
    return ws[n][edge];
  };
  FR.word = (id, word, n = 0) => FR.Wd(id, word, n, "start");
  FR.wordEnd = (id, word, n = 0) => FR.Wd(id, word, n, "end");

  // ---- framing -------------------------------------------------------------------------------
  // Crop rect (source px) with the box's aspect that covers the box at zoom z, with the focus
  // point (fx, fy) placed at (ax, ay) of the box, clamped inside the image.
  FR.cover = (m, { fx, fy, z = 1, ax = 0.5, ay = 0.5, box = { x: 0, y: 0, w: W, h: H } }) => {
    const ar = box.w / box.h; let cw, ch;
    if (m.iw / m.ih > ar) { ch = m.ih / z; cw = ch * ar; } else { cw = m.iw / z; ch = cw / ar; }
    const x = clamp(fx - cw * ax, 0, m.iw - cw), y = clamp(fy - ch * ay, 0, m.ih - ch);
    return { x, y, w: cw, h: ch };
  };
  FR.toScreen = (crop, box, px, py) => ({ x: box.x + (px - crop.x) * box.w / crop.w, y: box.y + (py - crop.y) * box.h / crop.h, s: box.w / crop.w });
  FR.photo = (key, o = {}) => { const m = FR.media[key]; if (!m) throw new Error("media " + key); const box = o.box || { x: 0, y: 0, w: W, h: H };
    const crop = o.crop || FR.cover(m, { ...o, box }); return { src: m.src, iw: m.iw, ih: m.ih, crop, box, opacity: o.opacity == null ? 1 : o.opacity, filter: o.filter || "", radius: o.radius || 0 }; };
  // A frame of an extracted clip at local time tl (seconds from the clip's first extracted frame).
  FR.clip = (key, tl, o = {}) => { const m = FR.media[key]; if (!m) throw new Error("clip " + key);
    const n = clamp(Math.floor(tl * m.fps) + 1, 1, m.frames);
    const layer = FR.photo(key, { ...o, crop: o.crop || m.crop }); layer.src = `${m.dir}/${String(n).padStart(4, "0")}.jpg`; return layer; };

  // ---- shared drawing ------------------------------------------------------------------------
  FR.text = (x, y, s, { size = 40, weight = 700, fill = C.text, family = F.sans, anchor = "middle", ls = 0, op = 1, extra = "" } = {}) =>
    `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}" fill="${fill}" text-anchor="${anchor}" opacity="${op}" ${extra}>${esc(s)}</text>`;
  // Leader label: a dot at (x,y), a line to (lx,ly) and the label beside it.
  FR.callout = (x, y, lx, ly, label, k = 1, { color = C.hot2, size = 34, anchor = "start" } = {}) => {
    if (k <= 0) return "";
    const e = E.out(clamp(k)); const mx = lerp(x, lx, e), my = lerp(y, ly, e);
    return `<g opacity="${clamp(k * 2)}"><circle cx="${x}" cy="${y}" r="9" fill="${color}"/><line x1="${x}" y1="${y}" x2="${mx}" y2="${my}" stroke="${color}" stroke-width="4"/>
      ${FR.text(lx + (anchor === "start" ? 14 : anchor === "end" ? -14 : 0), ly + size * 0.35, label, { size, weight: 800, fill: C.text, anchor, ls: 1.5, op: clamp(k * 1.6 - 0.4), extra: `paint-order="stroke" stroke="#000" stroke-width="8" stroke-opacity="0.55"` })}</g>`;
  };
  // A ring that draws itself around (x,y).
  FR.ring = (x, y, r, k, color = C.hot2, w = 7) => k <= 0 ? "" :
    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="${2 * Math.PI * r}" stroke-dashoffset="${2 * Math.PI * r * (1 - E.out(clamp(k)))}" transform="rotate(-90 ${x} ${y})" stroke-linecap="round"/>`;
  FR.defs = () => `<defs>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient>
    <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.72"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="botShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient>
    <linearGradient id="etGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7b4024"/><stop offset="0.45" stop-color="#c3713f"/><stop offset="1" stop-color="#6c381f"/></linearGradient>
    <linearGradient id="srbGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9b9a95"/><stop offset="0.4" stop-color="#f3f1ec"/><stop offset="1" stop-color="#8d8c87"/></linearGradient>
    <linearGradient id="steelGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4d5866"/><stop offset="0.5" stop-color="#7c8898"/><stop offset="1" stop-color="#46505d"/></linearGradient>
    <radialGradient id="hotGlow"><stop offset="0" stop-color="#fff2c0" stop-opacity="1"/><stop offset="0.35" stop-color="#ffb547" stop-opacity="0.9"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#1d2734" stroke-width="1.5"/></pattern>
    <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter><filter id="blur14"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.5"/></filter>
  </defs>`;
  FR.blueprint = (op = 1) => `<g opacity="${op}"><rect width="${W}" height="${H}" fill="${C.ink}"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect width="${W}" height="${H}" fill="url(#vig)"/></g>`;

  // The shuttle stack seen from the orbiter's side (so the vehicle's right booster is on the right).
  // cx: centre x; top/bot: y of the ET nose tip and of the booster nozzles. Returns geometry for callouts.
  FR.stack = ({ cx = 540, top = 260, bot = 1700, joint = 0, plume = 0, etHeat = 0, dimLeft = 0.0, orbiterOp = 0.96 } = {}) => {
    const hgt = bot - top, etW = hgt * 0.165, srbW = hgt * 0.072, gap = hgt * 0.012;
    const etTop = top, etBot = top + hgt * 0.93, srbTop = top + hgt * 0.07, srbBot = top + hgt * 0.94;
    const lx = cx - etW / 2 - gap - srbW, rx = cx + etW / 2 + gap;
    const seg = (x) => { const L = srbBot - srbTop; const ys = [0.2, 0.39, 0.58, 0.77].map((f) => srbTop + L * f); return ys; };
    const srb = (x, hl) => { const ys = seg(x); const L = srbBot - srbTop;
      return `<g>
      <path d="M${x} ${srbTop + L * 0.09} Q${x} ${srbTop} ${x + srbW / 2} ${srbTop - L * 0.025} Q${x + srbW} ${srbTop} ${x + srbW} ${srbTop + L * 0.09} Z" fill="url(#srbGrad)"/>
      <rect x="${x}" y="${srbTop + L * 0.09}" width="${srbW}" height="${L * 0.84}" fill="url(#srbGrad)"/>
      <path d="M${x - srbW * 0.06} ${srbTop + L * 0.93} H${x + srbW * 1.06} L${x + srbW * 0.92} ${srbBot} H${x + srbW * 0.08} Z" fill="#7e7c76"/>
      <path d="M${x + srbW * 0.22} ${srbBot} L${x + srbW * 0.12} ${srbBot + L * 0.035} H${x + srbW * 0.88} L${x + srbW * 0.78} ${srbBot} Z" fill="#3a3d42"/>
      ${ys.map((y, i) => `<rect x="${x - 3}" y="${y - 4}" width="${srbW + 6}" height="8" fill="${hl && i === 3 ? C.hot2 : "#5f6268"}" opacity="${hl && i === 3 ? 0.4 + 0.6 * joint : 1}"/>`).join("")}
      </g>`; };
    const jy = seg(0)[3];
    const etHeatGlow = etHeat > 0 ? `<ellipse cx="${cx + etW * 0.32}" cy="${jy - hgt * 0.02}" rx="${etW * 0.42}" ry="${hgt * 0.12}" fill="url(#hotGlow)" opacity="${0.8 * etHeat}" filter="url(#blur14)"/>` : "";
    const orb = `<g opacity="${orbiterOp}">
      <path d="M${cx - etW * 0.36} ${top + hgt * 0.83} L${cx - etW * 0.36} ${top + hgt * 0.42} Q${cx - etW * 0.36} ${top + hgt * 0.3} ${cx} ${top + hgt * 0.27} Q${cx + etW * 0.36} ${top + hgt * 0.3} ${cx + etW * 0.36} ${top + hgt * 0.42} L${cx + etW * 0.36} ${top + hgt * 0.83} Z" fill="#f2f0ea"/>
      <path d="M${cx - etW * 0.36} ${top + hgt * 0.64} L${cx - etW * 1.05} ${top + hgt * 0.83} L${cx - etW * 0.36} ${top + hgt * 0.84} Z M${cx + etW * 0.36} ${top + hgt * 0.64} L${cx + etW * 1.05} ${top + hgt * 0.83} L${cx + etW * 0.36} ${top + hgt * 0.84} Z" fill="#e4e1d9"/>
      <path d="M${cx - etW * 0.12} ${top + hgt * 0.29} Q${cx} ${top + hgt * 0.275} ${cx + etW * 0.12} ${top + hgt * 0.29} L${cx + etW * 0.1} ${top + hgt * 0.32} H${cx - etW * 0.1} Z" fill="#1d2228"/>
      <rect x="${cx - etW * 0.3}" y="${top + hgt * 0.835}" width="${etW * 0.6}" height="${hgt * 0.03}" fill="#2b2f35"/></g>`;
    const pl = plume > 0 ? (() => { const x0 = rx + srbW * 0.08, y0 = jy; const reach = 60 + 200 * plume;
      return `<g opacity="${clamp(plume * 1.5)}"><path d="M${x0} ${y0 - 10} C${x0 - 30} ${y0 + 10}, ${x0 - reach * 0.6} ${y0 + 40}, ${x0 - reach} ${y0 + 120 * plume} L${x0 - reach + 30} ${y0 + 150 * plume} C${x0 - 20} ${y0 + 60}, ${x0} ${y0 + 30}, ${x0 + 6} ${y0 + 6} Z" fill="url(#hotGlow)" filter="url(#blur6)"/>
        <circle cx="${x0}" cy="${y0}" r="${18 + 14 * plume}" fill="url(#hotGlow)" filter="url(#blur6)"/></g>`; })() : "";
    const svg = `<g>
      <path d="M${cx - etW / 2} ${etTop + hgt * 0.12} Q${cx - etW / 2} ${etTop + hgt * 0.02} ${cx} ${etTop} Q${cx + etW / 2} ${etTop + hgt * 0.02} ${cx + etW / 2} ${etTop + hgt * 0.12} V${etBot} Q${cx} ${etBot + hgt * 0.02} ${cx - etW / 2} ${etBot} Z" fill="url(#etGrad)"/>
      ${etHeatGlow}
      <g opacity="${1 - dimLeft}">${srb(lx, false)}</g>${srb(rx, true)}${orb}${pl}</g>`;
    return { svg, joint: { x: rx + srbW / 2, y: jy, w: srbW }, et: { x: cx, w: etW, top: etTop, bot: etBot }, srb: { lx, rx, w: srbW, top: srbTop, bot: srbBot } };
  };

  // ---- registration ----------------------------------------------------------------------------
  FR.shot = (s) => { FR.shots.push(s); return s; };
  // Phase 1: a scene-only prototype replaces one shot of an existing film by id (window.OVERRIDES).
  FR.replace = (id, s) => { const i = FR.shots.findIndex((x) => x.id === id); if (i < 0) throw new Error("replace: no shot " + id); FR.shots[i] = { id, ...s }; return FR.shots[i]; };
  FR.overlay = (fn) => FR.overlays.push(fn);

  // ---- captions (word-aligned, from the measured timeline) ---------------------------------------
  FR.cues = [];
  FR.buildCaptions = ({ maxChars = 24, maxWords = 6 } = {}) => {
    const ws = FR.tl.words.filter((w) => !FR.captionSkip.has(w.line)); const cues = []; let cur = [];
    const lineLen = (arr) => arr.map((w) => w.text).join(" ").length;
    const flush = () => { if (cur.length) cues.push(cur); cur = []; };
    ws.forEach((w, i) => {
      const prev = cur[cur.length - 1];
      if (prev && (prev.line !== w.line)) flush();
      cur.push(w);
      const ends = /[.,;:!?]$/.test(w.text); const nxt = ws[i + 1];
      if (cur.length >= maxWords || lineLen(cur) > maxChars * 2 - 8 || (ends && cur.length >= 2) || (nxt && lineLen([...cur, nxt]) > maxChars * 2)) flush();
    });
    flush();
    FR.cues = cues.map((c, i) => {
      // two balanced lines when needed
      const txt = c.map((w) => w.text); let lines = [c];
      if (txt.join(" ").length > maxChars) { let best = null; for (let k = 1; k < c.length; k += 1) { const a = txt.slice(0, k).join(" "), b = txt.slice(k).join(" "); const sc = Math.max(a.length, b.length); if (!best || sc < best.sc) best = { sc, k }; } lines = [c.slice(0, best.k), c.slice(best.k)]; }
      const nextStart = cues[i + 1] ? cues[i + 1][0].start : Infinity;
      return { start: c[0].start, end: Math.min(nextStart, c[c.length - 1].end + 0.45), lines };
    });
    return FR.cues;
  };
  // FR.captionFrom (optional, V3): no caption is shown before this time (the opening headline owns the
  // screen); a cue already running then fades in at captionFrom. Absent on V1/V2.
  FR.cueShownAt = (c) => (FR.captionFrom ? Math.max(c.start, FR.captionFrom) : c.start);
  FR.captionAt = (t, { y = 1318 } = {}) => {
    if (FR.captionFrom && t < FR.captionFrom) return "";
    const cue = FR.cues.find((c) => t >= c.start - 0.03 && t < c.end); if (!cue) return "";
    const st = FR.cueShownAt(cue); const k = p(t, st - 0.03, st + 0.09);
    const line = (ws) => ws.map((w) => { const on = t >= w.start - 0.02; const now = on && t < w.end + 0.06;
      return `<span style="color:${now ? C.hot2 : on ? C.text : "rgba(245,242,236,0.78)"}">${esc(w.text)}</span>`; }).join(" ");
    return `<div data-role="caption" style="position:absolute;left:110px;right:110px;top:${y}px;transform:translate(0,${(1 - E.out(k)) * 14}px);opacity:${k};text-align:center;font:800 62px/1.16 ${F.sans};letter-spacing:-0.4px;text-shadow:0 3px 0 rgba(0,0,0,.55),0 0 22px rgba(0,0,0,.85),0 0 4px #000;">${cue.lines.map(line).join("<br>")}</div>`;
  };

  // ---- HUD components -----------------------------------------------------------------------------
  // Provenance chip: archival media vs explanatory reconstruction, always visible on every shot.
  FR.chip = (label, kind, op = 1) => { const dot = kind === "archival" ? C.paper : kind === "document" ? C.cold : C.hot;
    return `<div style="position:absolute;right:56px;top:188px;opacity:${op};display:flex;align-items:center;gap:12px;padding:10px 18px;border-radius:30px;background:rgba(6,9,13,.66);border:1.5px solid rgba(255,255,255,.14);font:700 28px ${F.sans};letter-spacing:2px;color:${C.text};text-transform:uppercase"><span style="width:13px;height:13px;border-radius:50%;background:${dot}"></span>${esc(label)}</div>`; };
  FR.clock = (sec, op = 1, { label = "TIME AFTER LIFTOFF", decimals = 3 } = {}) => op <= 0 ? "" :
    `<div style="position:absolute;left:44px;top:170px;opacity:${op};padding:12px 20px 14px;border-radius:14px;background:rgba(6,9,13,.7);font:600 24px ${F.sans};letter-spacing:2.4px;color:${C.steel}">${label}<div style="font:600 70px/1 ${F.num};letter-spacing:1px;color:${C.text};margin-top:6px">T+${sec.toFixed(decimals)}<span style="font-size:40px;color:${C.steel}"> s</span></div></div>`;
  FR.handle = (op = 0.78) => `<div data-role="handle" style="position:absolute;left:0;right:0;top:112px;text-align:center;opacity:${op};font:700 27px ${F.sans};letter-spacing:1px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.7)">@FailureReconstructed</div>`;
  FR.source = (s, op = 1, y = 1556) => `<div style="position:absolute;left:60px;right:60px;top:${y}px;opacity:${op};text-align:center;font:500 24px ${F.sans};letter-spacing:.6px;color:rgba(236,230,218,.82);text-shadow:0 1px 4px #000">${esc(s)}</div>`;

  // ---- frame composition --------------------------------------------------------------------------
  const pool = new Map();
  let stage, underEl, mediaEl, svgEl, hudEl;
  FR.init = (timeline, media, duration) => {
    FR.tl = timeline; FR.media = media; FR.duration = duration;
    stage = document.getElementById("stage"); underEl = document.getElementById("under"); mediaEl = document.getElementById("media"); svgEl = document.getElementById("svg"); hudEl = document.getElementById("hud");
    if (window.SCENES) window.SCENES(FR);
    (window.OVERRIDES || []).forEach((fn) => fn(FR));
    FR.shots.forEach((s, i) => { s.index = i; if (!(s.end > s.start)) throw new Error(`shot ${s.id} has no duration (${s.start}..${s.end})`); });
    FR.buildCaptions();
    return { shots: FR.shots.map((s) => ({ id: s.id, start: +s.start.toFixed(3), end: +s.end.toFixed(3), kind: s.kind, label: s.label, subject: s.subject, source: s.source || null, evidence: s.evidence || [], transition: s.trans || "cut",
      // creative-plan metadata read by creative_qa.py (Phase 0); absent on V1/V2 shots
      plan: { transitionReason: s.transReason || null, states: (s.states || []).map((x) => ({ t: +x.t.toFixed(3), what: x.what, ev: x.ev || null })),
        register: s.register || null, primitives: s.primitives || [], framing: s.framing || null } })), cues: FR.cues.filter((c) => c.end > FR.cueShownAt(c)).map((c) => ({ start: FR.cueShownAt(c), end: c.end, lines: c.lines.map((l) => l.map((w) => w.text).join(" ")) })) }; // displayed timing
  };
  const active = (t) => {
    const out = [];
    FR.shots.forEach((s, i) => {
      const fade = s.fade || 0; // crossfade length into this shot
      if (t >= s.start && t < s.end) out.push({ s, op: fade > 0 && i > 0 ? E.sine(p(t, s.start, s.start + fade)) : 1 });
    });
    // the previous shot stays underneath during a crossfade
    const cur = out[out.length - 1];
    if (cur && cur.s.fade && cur.op < 1 && cur.s.index > 0) out.unshift({ s: FR.shots[cur.s.index - 1], op: 1, held: true });
    return out;
  };
  FR.frame = async (t) => {
    const layers = active(t); const media = []; let svg = FR.defs(); let under = FR.defs(); let hud = "";
    // During a crossfade the pictures dissolve, but text is sequenced: the outgoing shot's HUD text clears
    // in the first half of the fade and the incoming shot's appears in the second half (v2: v1 ghosted
    // two sets of text over each other for 0.2-0.35 s).
    const fading = layers.length > 1 && layers[0].held; const fk = fading ? layers[1].op : 1;
    for (const { s, op, held } of layers) {
      const tt = held ? Math.min(t, s.end + (s.fadeOutHold || 0.5)) : t;
      const r = s.render(tt, p(tt, s.start, s.end), s) || {};
      (r.media || []).forEach((m) => media.push({ ...m, opacity: (m.opacity == null ? 1 : m.opacity) * op }));
      // shot.drift = [z0, z1]: a slow push on a locked diagram so it never reads as a frozen frame
      const z = s.drift ? lerp(s.drift[0], s.drift[1], E.sine(p(tt, s.start, s.end))) : 1;
      const g = z !== 1 ? `transform="translate(540 860) scale(${z.toFixed(5)}) translate(-540 -860)"` : "";
      if (r.under) under += `<g opacity="${op}">${r.under}</g>`;
      // the outgoing shot's SVG sits above the incoming picture, so it must clear too, or the dissolve never shows
      if (r.svg) svg += `<g opacity="${held && fading ? Math.max(0, 1 - 2 * fk) : op}" ${g}>${r.svg}</g>`;
      const hop = !fading ? op : held ? Math.max(0, 1 - 2 * fk) : Math.max(0, 2 * fk - 1);
      if (r.hud) hud += `<div style="position:absolute;inset:0;opacity:${hop};${z !== 1 ? `transform:scale(${z.toFixed(5)});transform-origin:540px 860px` : ""}">${r.hud}</div>`;
    }
    for (const fn of FR.overlays) { const o = fn(t) || {}; if (o.svg) svg += o.svg; if (o.hud) hud += o.hud; }
    // media pool: one <div><img></div> per layer slot, reused across frames
    const decodes = [];
    media.forEach((m, i) => {
      let slot = pool.get(i);
      if (!slot) { const d = document.createElement("div"); d.style.position = "absolute"; d.style.overflow = "hidden"; const im = document.createElement("img"); im.style.position = "absolute"; im.style.transformOrigin = "0 0"; d.appendChild(im); mediaEl.appendChild(d); slot = { d, im, src: "" }; pool.set(i, slot); }
      if (slot.src !== m.src) { slot.im.src = m.src; slot.src = m.src; decodes.push(slot.im.decode().catch((e) => { throw new Error("image failed: " + m.src); })); }
      const sx = m.box.w / m.crop.w, sy = m.box.h / m.crop.h;
      Object.assign(slot.d.style, { left: m.box.x + "px", top: m.box.y + "px", width: m.box.w + "px", height: m.box.h + "px", opacity: String(m.opacity), display: "block", borderRadius: (m.radius || 0) + "px", filter: m.filter || "none",
        // optional rotation about the box centre (documents lying on a desk); absent on V1/V2 layers
        transform: m.rotate ? `rotate(${m.rotate}deg)` : "none", transformOrigin: "50% 50%" });
      Object.assign(slot.im.style, { width: m.iw + "px", height: m.ih + "px", transform: `translate(${-m.crop.x * sx}px, ${-m.crop.y * sy}px) scale(${sx}, ${sy})` });
    });
    for (const [i, slot] of pool) if (i >= media.length) slot.d.style.display = "none";
    underEl.innerHTML = under; svgEl.innerHTML = svg; hudEl.innerHTML = hud;
    await Promise.all(decodes);
    return media.length;
  };
  // Text inspection (run after FR.frame(t)): every visible text box on screen, in screen px. A box is
  // an SVG <text>, an element holding its own text, or a whole caption (data-role="caption").
  // Visible = cumulative opacity >= 0.5 and on screen.
  FR.inspectText = () => {
    const vis = (el) => { let o = 1; for (let n = el; n && n.id !== "stage"; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return 0; o *= Number(cs.opacity); if (n.getAttribute && n.getAttribute("opacity") != null) o *= Number(n.getAttribute("opacity")); } return o; };
    const out = [];
    // HTML boxes are measured on the rendered text itself (a Range over the element's contents), not on
    // the container, which can be full-width while the centred text is much narrower.
    const rectOf = (el) => { if (el instanceof SVGElement) return el.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); };
    const add = (el, role) => { const r = rectOf(el); if (r.width < 2 || r.height < 2 || r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) return;
      const o = vis(el); if (o < 0.5) return;
      const fs = parseFloat(el.getAttribute && el.getAttribute("font-size")) || parseFloat(getComputedStyle(el).fontSize) || 0;
      const sc = el instanceof SVGElement && el.getScreenCTM ? Math.hypot(el.getScreenCTM().a, el.getScreenCTM().b) : 1;
      out.push({ role, text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), fontPx: +(fs * sc).toFixed(1), opacity: +o.toFixed(2) }); };
    document.querySelectorAll("#svg text, #hud svg text").forEach((el) => add(el, "svg"));
    document.querySelectorAll('#hud [data-role="caption"]').forEach((el) => add(el, "caption"));
    document.querySelectorAll("#hud div, #hud span").forEach((el) => {
      if (el.closest('[data-role="caption"]')) return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (own) add(el, el.closest('[data-role="handle"]') ? "handle" : "hud");
    });
    return out;
  };
  window.FR = FR;
})();
