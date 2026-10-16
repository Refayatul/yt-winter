// Forensic Reconstruction components (Phase 1), loaded after fr-lib.js. Parameterised, topic-free
// building blocks: every coordinate that makes a factual claim is passed in by the film (with its
// evidence id), never hard-coded here. Each returns SVG/HTML strings for one frame (pure functions of t).
//
//   FR.X.cam        camera state {fx, fy, z, rot} interpolation and registered hand-off between shots
//   FR.X.trace      line work registered to an image (source px), drawn on progressively
//   FR.X.events     evidence clock: maps documented event times (e.g. mission seconds) to screen times
//   FR.X.groove     seal groove cross-section: squeeze, gap opening, recovery time constant, gas path
//   FR.X.stack      shuttle-type stack with failure states (plume, deflection, leak, strut, rotation, dome)
//   FR.X.doc        authentic document scan on a paper plate, camera over source px, highlight sweeps
//   FR.X.rail       timeline rail with dated ticks and a moving "now" marker
//   FR.X.scale      a single temperature (or any unit) scale with labelled markers
//   FR.X.jointSection tang-and-clevis seal joint from measured drawing geometry (Engineering Visual System v1)
//   FR.X.desk       document camera: real scans on a desk, camera path, page-space highlights
//   FR.X.stamp      dated evidence stamp (wall-clock times), same family as the mission clock
//   FR.X.plate      fills a 9:16 frame behind non-9:16 media with a blurred copy of the same media
(function () {
  const FR = window.FR; const { C, F, E, clamp, lerp, p, esc, text, W, H } = FR;
  const X = {};

  // ---- camera ---------------------------------------------------------------------------------
  // A camera is {fx, fy, z, rot}: focus point (source px), zoom, rotation (deg). mix() interpolates;
  // handoff() returns the camera for shot B whose anchor lands on the same screen point and scale as
  // shot A's anchor did (registered match): anchorA/anchorB are the same physical point in two sources.
  X.mix = (a, b, k) => ({ fx: lerp(a.fx, b.fx, k), fy: lerp(a.fy, b.fy, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)), rot: lerp(a.rot || 0, b.rot || 0, k) });
  X.path = (keys, t, ease = E.inOut) => { // keys: [[t, cam], ...] sorted
    if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i += 1) if (t <= keys[i][0]) return X.mix(keys[i - 1][1], keys[i][1], ease(p(t, keys[i - 1][0], keys[i][0])));
    return keys[keys.length - 1][1]; };
  // SVG transform that shows source-space point (fx,fy) at screen (sx,sy) with scale z and rotation rot.
  X.xf = (cam, sx = 540, sy = 860) => `translate(${sx} ${sy}) rotate(${cam.rot || 0}) scale(${cam.z}) translate(${-cam.fx} ${-cam.fy})`;
  X.apply = (cam, x, y, sx = 540, sy = 860) => { const r = (cam.rot || 0) * Math.PI / 180, dx = (x - cam.fx) * cam.z, dy = (y - cam.fy) * cam.z;
    return { x: sx + dx * Math.cos(r) - dy * Math.sin(r), y: sy + dx * Math.sin(r) + dy * Math.cos(r) }; };

  // ---- registered trace -------------------------------------------------------------------------
  // paths: [{ d: [[x,y],...] (source px), w, color, dash, k0, k1 }]; map(x,y) -> {x,y} screen.
  // Drawn on between t-fractions k0..k1 of the given progress k.
  X.trace = (paths, map, k, { color = C.hot2, w = 5, glow = true } = {}) => paths.map((pa) => {
    const kk = E.out(p(k, pa.k0 || 0, pa.k1 || 1)); if (kk <= 0) return "";
    const pts = pa.d.map(([x, y]) => map(x, y)); let len = 0; for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const d = "M" + pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" L");
    const st = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${pa.dash ? pa.dash : `${len} ${len}`}" ${pa.dash ? "" : `stroke-dashoffset="${len * (1 - kk)}"`} opacity="${pa.dash ? kk : 1}"`;
    return (glow ? `<path d="${d}" stroke="#000" stroke-opacity="0.55" stroke-width="${(pa.w || w) + 6}" ${st}/>` : "") + `<path d="${d}" stroke="${pa.color || color}" stroke-width="${pa.w || w}" ${st}/>`;
  }).join("");

  // ---- evidence clock -----------------------------------------------------------------------------
  // events: [{ at: documented time, screen: screen time, key, label, ev }] sorted by screen time.
  // Returns { now: documented time at screen t (piecewise linear between events), last: latest event
  // reached, k(key): 0..1 progress of an event's visual state over its `dur` screen seconds }.
  X.events = (events, t) => {
    let now = events[0].at; for (let i = 0; i < events.length; i += 1) { const e = events[i], n = events[i + 1];
      if (t >= e.screen) now = n ? (t < n.screen ? lerp(e.at, n.at, p(t, e.screen, n.screen)) : n.at) : e.at; }
    let last = null; for (const e of events) if (t >= e.screen) last = e;
    const k = (key) => { const e = events.find((x) => x.key === key); return e ? E.out(p(t, e.screen, e.screen + (e.dur || 0.5))) : 0; };
    return { now, last, k };
  };

  // ---- seal groove (explanatory, not to scale) ---------------------------------------------------------
  // One O-ring in its groove against a moving sealing face. All motion is parametric:
  //   gap(t) 0..1   sealing face moving away (joint opening)
  //   tau           recovery time constant of the rubber in "gap units" (small = resilient, large = slow)
  //   squeeze       initial compression of the ring (0..0.4)
  // Returns { svg, sealed } where sealed = the ring still touches the face.
  X.groove = ({ x, y, w, h, gap, tRel, tau, squeeze = 0.3, tint = "warm", frost = 0, gas = 0, follow = 0.9 }) => {
    // gap 0..1: the sealing face moves away by `follow` x the ring's squeeze (so a fully recovered ring
    // still touches it); tau: recovery time constant (s) after the face starts moving; tRel: time since then.
    const r = h * 0.24; const gx = x + w * 0.4; const cy = y + h / 2;
    const free0 = 2 * r * (1 - squeeze); const face = gx + free0 + 2 * r * squeeze * follow * gap;
    const rec = 1 - Math.exp(-Math.max(0, tRel) / Math.max(1e-3, tau));
    const wFree = free0 + 2 * r * squeeze * rec; const ringW = Math.min(face - gx, wFree);
    const ringH = Math.min(2 * r * 1.35, (2 * r) * (2 * r) / ringW); const sealed = wFree >= face - gx - 1;
    const gapW = face - (gx + ringW); const col = tint === "cold" ? C.cold : C.hot2;
    const frostG = frost > 0 ? `<g opacity="${0.6 * frost}">${Array.from({ length: 30 }, (_, i) => { const fx = x + 20 + ((i * 137) % (w - 40)), fy = y + 20 + ((i * 71) % (h - 40)); const s = 7 + (i % 3) * 3; return `<path d="M${fx - s} ${fy}h${2 * s}M${fx} ${fy - s}v${2 * s}M${fx - s * 0.7} ${fy - s * 0.7}l${s * 1.4} ${s * 1.4}M${fx + s * 0.7} ${fy - s * 0.7}l${-s * 1.4} ${s * 1.4}" stroke="#e4f3ff" stroke-width="2.5"/>`; }).join("")}</g>` : "";
    const gasIn = `<path d="M${x + 20} ${cy} H${gx - 12}" stroke="${C.hot}" stroke-width="18" stroke-linecap="round" opacity="${0.9 * gas}"/>`;
    const gasThrough = !sealed && gapW > 6 ? `<path d="M${gx - 12} ${cy} C${gx + ringW * 0.6} ${cy}, ${gx + ringW + gapW / 2} ${cy}, ${gx + ringW + gapW / 2} ${cy - r * 1.6} L${gx + ringW + gapW / 2} ${y + 14}" fill="none" stroke="${C.hot}" stroke-width="${Math.max(8, Math.min(20, gapW * 0.7))}" stroke-linecap="round" stroke-dasharray="${h * 2} ${h * 2}" stroke-dashoffset="${h * 2 * (1 - gas)}"/>` : "";
    const svg = `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#steelGrad)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${tint === "cold" ? "#2a6fa8" : "#a8642a"}" opacity="${tint === "cold" ? 0.22 + 0.18 * frost : 0.2}"/>
      <rect x="${gx}" y="${cy - r * 1.45}" width="${face - gx}" height="${r * 2.9}" fill="#0b0f14"/>
      <rect x="${gx}" y="${y}" width="${face - gx}" height="${cy - r * 1.45 - y}" fill="#0b0f14" opacity="${!sealed ? 1 : 0.0}"/>
      <line x1="${face}" y1="${y}" x2="${face}" y2="${y + h}" stroke="#c9d2dc" stroke-width="3" opacity="0.7"/>
      ${frostG}${gasIn}
      <ellipse cx="${gx + ringW / 2}" cy="${cy}" rx="${ringW / 2}" ry="${ringH / 2}" fill="#25282c" stroke="${col}" stroke-width="8"/>
      ${!sealed && gapW > 4 ? `<rect x="${gx + ringW + 3}" y="${cy - r * 1.2}" width="${gapW - 6}" height="${r * 2.4}" fill="${C.hot}" opacity="0.3"/>` : ""}
      ${sealed ? `<line x1="${face - 2}" y1="${cy - ringH * 0.32}" x2="${face - 2}" y2="${cy + ringH * 0.32}" stroke="#7be0a0" stroke-width="9" stroke-linecap="round"/>` : ""}
      ${gasThrough}</g>`;
    return { svg, sealed, face, gapX: gx + ringW + gapW / 2, cy, r, gapW };
  };

  // ---- stack with failure states (reconstruction) ------------------------------------------------------
  // Proportions from published dimensions passed in `dims` (metres): et {len, dia}, srb {len, dia},
  // offset (SRB centreline from ET centreline). View: orbiter side, orbiter drawn as an outline so the
  // tank and the inner side of the right booster stay visible. States 0..1:
  //   plume (flame at the joint), deflect (plume bent onto the tank), leak (tank leak glow),
  //   strut (lower aft strut gone), rot (right booster rotation about its forward attach, degrees),
  //   dome (tank aft dome drops away).
  X.stack = ({ cx = 540, top = 300, pxPerM = 22, dims, jointFromAft = 0.2, plume = 0, deflect = 0, leak = 0, strut = 0, rot = 0, dome = 0, orbiter = 0.3, flick = 1 }) => {
    const et = dims.et, sb = dims.srb, s = pxPerM;
    const etW = et.dia * s, etL = et.len * s, sbW = sb.dia * s, sbL = sb.len * s;
    const etTop = top, etBot = top + etL; const sbBot = etBot + (dims.srbAftBelowEt || 1.5) * s, sbTop = sbBot - sbL;
    const rx = cx + dims.offset * s - sbW / 2, lx = cx - dims.offset * s - sbW / 2;   // left edges of the boosters
    const jy = sbBot - sbL * jointFromAft;                                             // aft field joint height
    const fwd = { x: rx, y: sbTop + sbL * 0.12 };                                      // forward attach (pivot)
    const aftY = jy + sbL * 0.035;                                                     // aft attach ring
    const booster = (x0, hl) => `<g>
      <path d="M${x0} ${sbTop + sbW * 1.4} Q${x0} ${sbTop} ${x0 + sbW / 2} ${sbTop - sbW * 0.6} Q${x0 + sbW} ${sbTop} ${x0 + sbW} ${sbTop + sbW * 1.4} Z" fill="url(#srbGrad)"/>
      <rect x="${x0}" y="${sbTop + sbW * 1.4}" width="${sbW}" height="${sbBot - sbTop - sbW * 1.4 - sbW * 0.9}" fill="url(#srbGrad)"/>
      <path d="M${x0} ${sbBot - sbW * 0.9} H${x0 + sbW} L${x0 + sbW * 1.18} ${sbBot} H${x0 - sbW * 0.18} Z" fill="#8a8882"/>
      ${[0.2, 0.39, 0.58, 0.8].map((f) => { const yy = sbBot - sbL * f; const isJ = Math.abs(f - jointFromAft) < 1e-6;
        return `<rect x="${x0 - 3}" y="${yy - 5}" width="${sbW + 6}" height="10" fill="${hl && isJ ? C.hot2 : "#5c5f65"}"/>`; }).join("")}</g>`;
    const domeH = etW * 0.32;
    const tank = `<g>
      <path d="M${cx - etW / 2} ${etTop + etW * 0.9} Q${cx - etW / 2} ${etTop + etW * 0.1} ${cx} ${etTop} Q${cx + etW / 2} ${etTop + etW * 0.1} ${cx + etW / 2} ${etTop + etW * 0.9} V${etBot - domeH} H${cx - etW / 2} Z" fill="url(#etGrad)"/>
      <line x1="${cx - etW / 2}" y1="${etTop + etL * 0.38}" x2="${cx + etW / 2}" y2="${etTop + etL * 0.38}" stroke="#5c2f18" stroke-width="5"/>
      <line x1="${cx - etW / 2}" y1="${etTop + etL * 0.45}" x2="${cx + etW / 2}" y2="${etTop + etL * 0.45}" stroke="#5c2f18" stroke-width="5"/>
      <g transform="translate(0 ${dome * etW * 1.4})" opacity="${1 - 0.6 * dome}"><path d="M${cx - etW / 2} ${etBot - domeH} H${cx + etW / 2} Q${cx + etW / 2} ${etBot} ${cx} ${etBot + domeH * 0.25} Q${cx - etW / 2} ${etBot} ${cx - etW / 2} ${etBot - domeH} Z" fill="url(#etGrad)" stroke="${dome > 0 ? "#fff" : "none"}" stroke-width="${dome > 0 ? 6 : 0}"/></g>
      ${dome > 0 ? `<ellipse cx="${cx}" cy="${etBot - domeH}" rx="${etW * (0.55 + 0.4 * dome)}" ry="${etW * 0.18 * (0.5 + dome)}" fill="#f4f7fb" opacity="${0.75 * dome}" filter="url(#blur14)"/>` : ""}</g>`;
    const leakG = leak > 0 ? `<ellipse cx="${cx + etW * 0.38}" cy="${aftY - sbL * 0.05}" rx="${etW * 0.35}" ry="${sbL * (0.08 + 0.07 * leak)}" fill="url(#hotGlow)" opacity="${0.85 * leak}" filter="url(#blur14)"/>
      <ellipse cx="${cx + etW * 0.42}" cy="${aftY - sbL * 0.02}" rx="${etW * 0.12}" ry="${sbL * 0.1 * leak}" fill="#fff6dc" opacity="${0.6 * leak}" filter="url(#blur6)"/>` : "";
    // plume from the joint's inner side (facing the tank); deflect bends it down and onto the tank wall
    const jx = rx; const reach = sbW * (0.6 + 1.2 * plume); const bend = deflect;
    const plumeG = plume > 0 ? `<g opacity="${clamp(plume * 1.5) * flick}" filter="url(#blur6)">
      <path d="M${jx + 4} ${jy - 8} C${jx - reach * 0.4} ${jy - 6}, ${jx - reach * (0.8 - 0.4 * bend)} ${jy + 30 * bend}, ${jx - reach * (1 - 0.5 * bend)} ${jy + sbL * 0.12 * bend + 20} L${jx - reach * (1 - 0.5 * bend) + 26} ${jy + sbL * 0.14 * bend + 34} C${jx - 10} ${jy + 40 * bend}, ${jx} ${jy + 12}, ${jx + 6} ${jy + 8} Z" fill="url(#hotGlow)"/>
      <circle cx="${jx}" cy="${jy}" r="${sbW * (0.25 + 0.2 * plume)}" fill="url(#hotGlow)"/></g>` : "";
    const strutG = (on) => [-0.012, 0, 0.012].map((f, i) => { const y1 = aftY + sbL * f, y2 = aftY + sbL * (f - 0.01 + 0.01 * i);
      const broken = on && i === 2; return `<line x1="${rx}" y1="${y1}" x2="${broken ? lerp(cx + etW / 2, rx, 0.45) : cx + etW / 2}" y2="${broken ? y1 + 18 * strut : y2}" stroke="${broken ? C.red : "#7d8794"}" stroke-width="7" opacity="${broken ? 1 - 0.3 * strut : 1}"/>`; }).join("");
    const orb = `<g opacity="${orbiter}" fill="none" stroke="#e8e6df" stroke-width="4">
      <path d="M${cx - etW * 0.36} ${etBot - etL * 0.12} V${etTop + etL * 0.42} Q${cx - etW * 0.36} ${etTop + etL * 0.31} ${cx} ${etTop + etL * 0.28} Q${cx + etW * 0.36} ${etTop + etL * 0.31} ${cx + etW * 0.36} ${etTop + etL * 0.42} V${etBot - etL * 0.12} Z"/>
      <path d="M${cx - etW * 0.36} ${etTop + etL * 0.64} L${cx - etW * 1.1} ${etBot - etL * 0.12} H${cx - etW * 0.36} M${cx + etW * 0.36} ${etTop + etL * 0.64} L${cx + etW * 1.1} ${etBot - etL * 0.12} H${cx + etW * 0.36}"/></g>`;
    const right = `<g transform="rotate(${rot} ${fwd.x + sbW / 2} ${fwd.y})">${booster(rx, true)}${plumeG}</g>`;
    const svg = `<g>${tank}${leakG}<g>${booster(lx, false)}</g>${strutG(strut > 0)}${right}${orb}</g>`;
    return { svg, joint: { x: rx + sbW / 2, y: jy, inner: rx }, et: { x: cx, w: etW, top: etTop, bot: etBot, domeY: etBot - domeH }, srb: { rx, lx, w: sbW, top: sbTop, bot: sbBot }, aft: { x: (rx + cx + etW / 2) / 2, y: aftY }, fwd, leakAt: { x: cx + etW * 0.38, y: aftY - sbL * 0.05 } };
  };

  // ---- authentic document on a paper plate ---------------------------------------------------------
  // key: media key of the scan; crop: source px window (the camera); box: screen rect; marks:
  // [{ x, y, w, h (source px), k }] highlight sweeps drawn left-to-right over the scan.
  X.doc = (key, { crop, box, marks = [], op = 1, paper = C.paper }) => {
    const ph = FR.photo(key, { crop: FR.X.px(key, crop), box, opacity: op, filter: "contrast(1.08)" });
    const m = FR.media[key]; const sx = box.w / ph.crop.w, sy = box.h / ph.crop.h;
    const to = (x, y) => ({ x: box.x + (x * m.scale - ph.crop.x) * sx, y: box.y + (y * m.scale - ph.crop.y) * sy });
    const hl = marks.map((q) => { if (q.k <= 0) return ""; const a = to(q.x, q.y), b = to(q.x + q.w, q.y + q.h);
      return `<rect x="${a.x - 6}" y="${a.y - 4}" width="${(b.x - a.x + 12) * E.out(clamp(q.k))}" height="${b.y - a.y + 8}" fill="${q.color || C.hot2}" opacity="${0.42 * op}" style="mix-blend-mode:multiply"/>`; }).join("");
    return { layer: ph, plate: `<rect x="0" y="${box.y - 40}" width="${W}" height="${box.h + 80}" fill="${paper}" opacity="${op}"/>`, marks: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">${hl}</svg>`, to };
  };
  // source-px rect -> resized-media px rect
  X.px = (key, r) => { const s = FR.media[key].scale; return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }; };

  // ---- timeline rail -------------------------------------------------------------------------------
  // ticks: [{ at (minutes on any axis), label, sub }]; now: position on the same axis; y: screen y.
  X.rail = (ticks, now, { y = 300, x0 = 90, x1 = 990, a, b, op = 1, color = C.hot2 } = {}) => {
    const lo = a == null ? ticks[0].at : a, hi = b == null ? ticks[ticks.length - 1].at : b; const X0 = (v) => lerp(x0, x1, clamp((v - lo) / (hi - lo)));
    const nx = X0(now);
    return `<g opacity="${op}"><line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.line}" stroke-width="6" stroke-linecap="round"/>
      <line x1="${x0}" y1="${y}" x2="${nx}" y2="${y}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
      ${ticks.map((tk) => { const tx = X0(tk.at), on = now >= tk.at - 1e-6; return `<circle cx="${tx}" cy="${y}" r="${on ? 13 : 10}" fill="${on ? color : C.ink}" stroke="${on ? color : C.steel2}" stroke-width="4"/>
        ${tk.label ? text(tx, y + 62, tk.label, { size: 32, weight: 800, fill: on ? C.text : C.muted, anchor: tk.anchor || "middle", ls: 1 }) : ""}`; }).join("")}
      <circle cx="${nx}" cy="${y}" r="20" fill="none" stroke="${color}" stroke-width="4"/></g>`;
  };

  // ---- one scale with markers (replaces bar charts) ---------------------------------------------------------
  X.scale = ({ x0 = 110, x1 = 970, y = 1180, lo, hi, unit = "°F", markers = [], op = 1 }) => {
    const sx = (v) => lerp(x0, x1, (v - lo) / (hi - lo));
    const ticks = []; for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) ticks.push(`<line x1="${sx(v)}" y1="${y - 10}" x2="${sx(v)}" y2="${y + 10}" stroke="${C.steel2}" stroke-width="3"/>`);
    const grad = `<defs><linearGradient id="tscale" x1="0" x2="1"><stop offset="0" stop-color="${C.cold}"/><stop offset="1" stop-color="${C.hot2}"/></linearGradient></defs>`;
    return `<g opacity="${op}">${grad}<rect x="${x0}" y="${y - 8}" width="${x1 - x0}" height="16" rx="8" fill="url(#tscale)" opacity="0.55"/>${ticks.join("")}
      ${markers.map((m) => { if (m.k <= 0) return ""; const mx = sx(m.v), up = m.side !== "below"; const e = E.out(clamp(m.k));
        return `<g opacity="${clamp(m.k * 2)}"><line x1="${mx}" y1="${y}" x2="${mx}" y2="${up ? y - 120 * e : y + 120 * e}" stroke="${m.color}" stroke-width="6"/>
          <circle cx="${mx}" cy="${y}" r="14" fill="${m.color}"/>
          ${text(mx, up ? y - 140 : y + 200, `${m.v}${unit}`, { size: 88, weight: 600, family: F.num, fill: m.color })}
          ${text(mx, up ? y - 236 : y + 246, m.label, { size: 32, weight: 800, fill: C.text, ls: 1.5 })}</g>`; }).join("")}</g>`;
  };

  // ---- plate behind non-9:16 media -------------------------------------------------------------------
  X.plate = (layer, { blur = 30, dim = 0.5 } = {}) => ({ ...layer, box: { x: -60, y: -60, w: W + 120, h: H + 120 }, crop: (() => { const c = layer.crop; const ar = (W + 120) / (H + 120); const h = c.h, w = h * ar; return { x: c.x + (c.w - w) / 2, y: c.y, w, h }; })(), filter: `blur(${blur}px) brightness(${dim}) saturate(1.1)`, radius: 0 });

  // ---- dated stamp (same visual family as FR.clock, for wall-clock evidence times) ------------------------
  X.stamp = (label, value, op = 1, { sub = "", size = 70 } = {}) => op <= 0 ? "" :
    `<div style="position:absolute;left:44px;top:170px;opacity:${op};padding:12px 20px 14px;border-radius:14px;background:rgba(6,9,13,.7);font:600 24px ${F.sans};letter-spacing:2.4px;color:${C.steel}">${label ? esc(label) : ""}<div style="font:600 ${size}px/1 ${F.num};letter-spacing:1px;color:${C.text};margin-top:${label ? 6 : 0}px">${esc(value)}${sub ? `<span style="font-size:36px;color:${C.steel}"> ${esc(sub)}</span>` : ""}</div></div>`;

  // ---- document desk (document camera) ---------------------------------------------------------------
  // docs: [{ key, x, y (world centre), w (world width), rot (deg), op, marks: [{ x, y, w, h (source px), k, color }] }]
  // cam: { cx, cy, z } world point at screen (540, sy). Pages are real scans lying on a desk; the camera
  // travels over them and highlights are drawn in each page's own (rotated) coordinates.
  X.desk = (docs, cam, { sy = 860, shadow = true } = {}) => {
    const media = [], svg = [];
    for (const d of docs) { if ((d.op == null ? 1 : d.op) <= 0) continue; const m = FR.media[d.key];
      const sw = d.w * cam.z, sh = sw * m.ih / m.iw; const sx = 540 + (d.x - cam.cx) * cam.z, syy = sy + (d.y - cam.cy) * cam.z;
      media.push({ src: m.src, iw: m.iw, ih: m.ih, crop: { x: 0, y: 0, w: m.iw, h: m.ih }, box: { x: sx - sw / 2, y: syy - sh / 2, w: sw, h: sh }, opacity: d.op == null ? 1 : d.op,
        filter: `contrast(1.08)${shadow ? " drop-shadow(0 18px 26px rgba(0,0,0,.6))" : ""}${d.dim ? ` brightness(${1 - d.dim})` : ""}`, radius: 2, rotate: d.rot || 0 });
      const k = sw / (m.iw / m.scale); // screen px per source px
      const marks = (d.marks || []).map((q) => q.k <= 0 ? "" : `<rect x="${q.x - 5}" y="${q.y - 3}" width="${(q.w + 10) * E.out(clamp(q.k))}" height="${q.h + 6}" fill="${q.color || C.hot2}" opacity="${0.45 * (d.op == null ? 1 : d.op)}" style="mix-blend-mode:multiply"/>`).join("");
      if (marks) svg.push(`<g transform="translate(${sx} ${syy}) rotate(${d.rot || 0}) translate(${-sw / 2} ${-sh / 2}) scale(${k})">${marks}</g>`); }
    return { media, svg: svg.join("") };
  };

  // ---- joint section (Engineering Visual System v1) ----------------------------------------------------
  // A tang-and-clevis seal joint drawn from measured drawing geometry (rects/points in drawing px), mapped
  // to the screen by view {region (drawing px), box (screen px)}. Materials: brushed-steel bodies with the
  // drawing's 45° hatch on cut faces, matte rubber rings with a rim light, ambient occlusion in grooves,
  // one fixed key light. State: gapPx (drawing px, already scaled by any declared exaggeration),
  // rec[i] 0..1 (how far ring i has recovered), squeeze (0..1 initial compression), gas 0..1 (flow progress).
  // Returns { svg, rings: [{x, y, sealed}], gap: {x, y} } in screen px for labels.
  X.jointSection = ({ geom, view, gapPx = 0, rec = [], squeeze = 0.3, gas = 0, lightDeg = -135, uid = "js", ringRim = "#7cc6ff", pressure = 0, t = 0, gasLevel = 1 }) => {
    const R = view.region, B = view.box, s = B.w / R.w; const map = (x, y) => ({ x: B.x + (x - R.x) * s, y: B.y + (y - R.y) * s });
    const rect = (r, dx = 0) => { const a = map(r.x + dx, r.y), b = map(r.x + r.w + dx, r.y + r.h); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; };
    const L = (lightDeg * Math.PI) / 180, gx = 0.5 - 0.5 * Math.cos(L), gy = 0.5 - 0.5 * Math.sin(L);
    const defs = `<defs><clipPath id="${uid}c"><rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}"/></clipPath>
      <linearGradient id="${uid}st" x1="${gx}" y1="${gy}" x2="${1 - gx}" y2="${1 - gy}"><stop offset="0" stop-color="#9aa6b4"/><stop offset="0.55" stop-color="#6d7987"/><stop offset="1" stop-color="#3f4853"/></linearGradient>
      <pattern id="${uid}h" width="${9}" height="${9}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#1d232b" stroke-width="2.2" opacity="0.55"/></pattern>
      <filter id="${uid}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.10 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="${uid}ao"><feGaussianBlur stdDeviation="${0.9 * s}"/></filter>
      <radialGradient id="${uid}rb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#3b4047"/><stop offset="0.5" stop-color="#1c1f23"/><stop offset="1" stop-color="#111316"/></radialGradient>
      <linearGradient id="${uid}ch" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff6a2a" stop-opacity="0.85"/><stop offset="0.7" stop-color="#ff8a3a" stop-opacity="0.35"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0.1"/></linearGradient>
      <radialGradient id="${uid}gl"><stop offset="0" stop-color="#fff1c2"/><stop offset="0.4" stop-color="#ffb547"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient></defs>`;
    const body = (r) => `<g><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#${uid}st)"/><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff" filter="url(#${uid}n)"/>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#${uid}h)"/><rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" fill="none" stroke="#c9d3de" stroke-opacity="0.45" stroke-width="2"/></g>`;
    const tang = rect(geom.tang, -gapPx), inner = rect(geom.innerLeg), outer = geom.outerLeg ? rect(geom.outerLeg) : null;
    // clevis pin (fixed with the clevis): a steel cylinder seen side-on, lit from the key light
    const pin = geom.pin ? (() => { const r = rect(geom.pin); return `<defs><linearGradient id="${uid}pn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3ccd6"/><stop offset="0.45" stop-color="#8a96a4"/><stop offset="1" stop-color="#424b56"/></linearGradient></defs>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.h * 0.18}" fill="url(#${uid}pn)" stroke="#20262e" stroke-width="3"/><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.h * 0.18}" fill="#fff" filter="url(#${uid}n)"/>`; })() : "";
    const W = geom.ringPx * s, depth = W * (1 - squeeze), xb = inner.x + depth, xt = tang.x + tang.w;
    let grooves = "", rings = "", info = [];
    geom.rings.forEach((rp, i) => { const c = map(rp[0], rp[1]); const gh = W * 1.25;
      grooves += `<rect x="${inner.x - 1}" y="${c.y - gh / 2}" width="${depth + 1}" height="${gh}" fill="#07090c"/><rect x="${inner.x}" y="${c.y - gh / 2}" width="${depth}" height="${gh}" fill="none" stroke="#000" stroke-width="${0.6 * s}" opacity="0.8" filter="url(#${uid}ao)"/>`;
      const need = xb - xt, wr = W * (1 - squeeze) + W * squeeze * (rec[i] == null ? 1 : rec[i]); const w = Math.max(W * (1 - squeeze), Math.min(wr, need)); const sealed = wr >= need - 0.5;
      const h = Math.min(W * 1.2, (W * W) / w); const cx = xb - w / 2;
      rings += `<ellipse cx="${cx}" cy="${c.y}" rx="${w / 2}" ry="${h / 2}" fill="url(#${uid}rb)" stroke="${ringRim}" stroke-width="5"/>
        <path d="M${cx - w * 0.28} ${c.y - h * 0.3} q${w * 0.2} ${-h * 0.14} ${w * 0.42} ${-h * 0.05}" fill="none" stroke="#9aa4ae" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
        ${sealed ? `<line x1="${xb - w}" y1="${c.y - h * 0.3}" x2="${xb - w}" y2="${c.y + h * 0.3}" stroke="#7be0a0" stroke-width="6" stroke-linecap="round"/>` : ""}`;
      info.push({ x: cx, y: c.y, left: xb - w, sealed, h }); });
    // gap channel between the tang face and the inner leg (darker air), gas flowing down it when rings leak
    const gapX = (xt + inner.x) / 2; const top = inner.y - 40 * s / 7, bottom = B.y + B.h;
    let flow = "";
    if (gas > 0) { const pts = []; let blocked = null; info.forEach((r) => { if (blocked == null && r.sealed) blocked = r.y - r.h / 2; });
      const end = blocked == null ? bottom : blocked; const len = end - top; const n = 26; const reach = top + len * Math.min(1, gas * 1.4);
      const xAt = (y) => { const rr = info.find((r) => Math.abs(y - r.y) < r.h / 2); return rr ? (xt + rr.left) / 2 : gapX; };
      const line = []; for (let y = top; y <= Math.min(end, reach); y += 6) line.push(`${xAt(y).toFixed(1)} ${y.toFixed(1)}`);
      // particles keep flowing with time once the path is open
      for (let i = 0; i < n; i += 1) { const u = ((i / n) + t * 0.9) % 1; const y = top + u * len * Math.min(1, gas * 1.4); if (y > end) continue;
        pts.push(`<circle cx="${xAt(y)}" cy="${y}" r="${(10 + 5 * Math.sin(i * 1.7)) * s / 7}" fill="url(#${uid}gl)"/>`); }
      flow = `<g opacity="${Math.min(1, gas * 2) * gasLevel}">${line.length > 1 ? `<path d="M${line.join(" L")}" fill="none" stroke="#ff8a3a" stroke-width="${2.2 * s}" stroke-linecap="round" opacity="0.55" filter="url(#${uid}ao)"/><path d="M${line.join(" L")}" fill="none" stroke="#ffd27a" stroke-width="${0.7 * s}" stroke-linecap="round" opacity="0.9"/>` : ""}${pts.join("")}<rect x="${inner.x}" y="${top - 30}" width="${inner.w}" height="30" fill="url(#${uid}gl)" opacity="0.6"/></g>`; }
    // combustion side (inside, beyond the inner leg): hot gas pressure builds from ignition and pushes on the joint
    const ix = inner.x + inner.w; const fl = 0.85 + 0.15 * Math.sin(t * 19) * Math.sin(t * 5.7);
    const chamber = pressure > 0 ? `<rect x="${ix}" y="${B.y}" width="${B.x + B.w - ix}" height="${B.h}" fill="url(#${uid}ch)" opacity="${0.9 * pressure * fl}"/>
      <rect x="${inner.x - 4}" y="${B.y}" width="${B.x + B.w - inner.x + 4}" height="${Math.max(0, inner.y - B.y)}" fill="url(#${uid}ch)" opacity="${0.7 * pressure * fl}"/>
      ${[0.3, 0.55, 0.8].map((f, i) => { const y = B.y + B.h * f, d = ((t * 0.9 + i * 0.33) % 1); const x0 = B.x + B.w - 20 - d * (B.x + B.w - ix - 40);
        return `<path d="M${x0} ${y} h${-40} m14 -16 l-14 16 l14 16" fill="none" stroke="#ffd27a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="${0.8 * pressure * (1 - d * 0.6)}"/>`; }).join("")}` : "";
    const svg = `${defs}<g clip-path="url(#${uid}c)"><rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" fill="#0b0f14"/>${chamber}
      <rect x="${xt}" y="${B.y}" width="${Math.max(0, inner.x - xt)}" height="${B.h}" fill="#05070a"/>
      ${outer ? body(outer) : ""}${body(tang)}${body(inner)}${pin}${grooves}${rings}${flow}</g>`;
    return { svg, rings: info, gap: { x: gapX, y: (info[0] ? info[0].y : B.y + B.h / 2) - W * 1.3 }, map, s, tangFace: xt };
  };

  FR.X = X;
})();
