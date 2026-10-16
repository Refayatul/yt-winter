// Challenger premium v1: shot list. Every boundary is anchored to a measured spoken word (timeline.json),
// so the film re-times itself to any narration of the same script. Coordinates in photos are given in
// the ORIGINAL file's pixels and converted with P() (the renderer downsizes large files).
window.SCENES = function (FR) {
  const { C, F, E, clamp, lerp, p, text, callout, ring, W, H } = FR;
  const L = FR.L, Wd = FR.word, WE = FR.wordEnd;
  const P = (key, x, y) => { const m = FR.media[key]; return [x * m.scale, y * m.scale]; };
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  const pre = 0.1; // the picture lands just before its first word
  const END = FR.duration;
  FR.captionSkip.add("L12"); // the payoff is set as typography instead of captions

  const T = {
    s01: 0, s02: L("L2").start - pre, s03: Wd("L2", "sealed") - 0.05, s04: L("L3").start - pre, s05: L("L4").start - pre,
    s06: L("L5").start - pre, s07: L("L6").start - pre, s08: L("L7").start - pre, s09: Wd("L7", "swept") - 0.05,
    s10: Wd("L8", "broke") - 0.05, s11: L("L9").start - 0.15, s12: L("L10").start - pre, s13: L("L11").start - pre,
    s14: L("L12").start - pre, s15: Wd("L12", "But") - 0.05, end: END,
  };
  const headline = (top, big, y = 360, op = 1, color = C.text) => `<div style="position:absolute;left:60px;right:60px;top:${y}px;text-align:center;opacity:${op};text-shadow:0 3px 18px rgba(0,0,0,.9),0 0 3px #000">
    ${top ? `<div style="font:700 30px ${F.sans};letter-spacing:5px;color:${C.steel};margin-bottom:10px">${FR.esc(top)}</div>` : ""}
    <div style="font:800 96px/1.02 ${F.sans};letter-spacing:-1.5px;color:${color}">${big}</div></div>`;

  // S01 — authentic NASA photo, liftoff; the grey smoke at the right booster joint is circled.
  const SMOKE = [1972, 2885];
  FR.shot({ id: "S01", start: T.s01, end: T.s02, kind: "archival", label: "NASA photo", subject: "liftoff close-up with smoke at the right SRB aft field joint",
    source: "liftoff", evidence: ["E1", "E2", "E4"], render: (t, k) => {
      // The smoke is near the photo's bottom edge: a 1080x1400 box keeps it above the caption band.
      const box = { x: 0, y: 0, w: W, h: 1400 }; const e = ease(t, 0, T.s02 + 0.3);
      const z = lerp(1.0, 1.38, e); const [fx0, fy0] = P("liftoff", 1300, 2200), [fx1, fy1] = P("liftoff", SMOKE[0] - 260, SMOKE[1] - 150);
      const ph = FR.photo("liftoff", { fx: lerp(fx0, fx1, e), fy: lerp(fy0, fy1, e), z, box });
      const s = FR.toScreen(ph.crop, ph.box, ...P("liftoff", ...SMOKE));
      const rk = p(t, 0.5, 1.15), lk = p(t, 0.95, 1.4);
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [ph],
        svg: `<rect width="${W}" height="640" fill="url(#topShade)"/><rect y="1120" width="${W}" height="290" fill="url(#botShade)"/><rect y="1400" width="${W}" height="520" fill="${C.ink}"/>
          ${ring(s.x, s.y, 86, rk)}${lk > 0 ? `<line x1="${s.x - 64}" y1="${s.y - 58}" x2="${lerp(s.x - 64, 330, E.out(lk))}" y2="${lerp(s.y - 58, s.y - 200, E.out(lk))}" stroke="${C.hot2}" stroke-width="5" opacity="${lk}"/>` : ""}`,
        // Review v1.1: frame 0 carries only the photo, the subject kicker and the headline; the time moves
        // into the evidence label, which arrives with the ring (no separate clock box competing at frame 0).
        hud: headline("CHALLENGER · 1986", "Already<br>leaking", 330) + FR.chip("NASA photo", "archival")
          + `<div style="position:absolute;left:60px;top:${s.y - 300}px;opacity:${lk};padding:12px 20px;border-radius:12px;background:rgba(6,9,13,.8);border:2px solid ${C.hot2};font:800 38px/1.18 ${F.sans};letter-spacing:1px;color:${C.text}">SMOKE AT THE<br>RIGHT BOOSTER JOINT<div style="font:600 30px ${F.num};color:${C.hot2};margin-top:6px;letter-spacing:.5px">0.678 s after liftoff</div></div>` };
    } });

  // S02 — explanatory diagram: the stack, the right booster, its lowest field joint.
  FR.shot({ id: "S02", start: T.s02, end: T.s03, kind: "explanatory", label: "Explanatory diagram", subject: "shuttle stack, right SRB aft field joint highlighted",
    evidence: ["E2"], render: (t) => {
      const a = T.s02, b = T.s03; const st = FR.stack({ cx: 540, top: 330, bot: 1230, joint: 0.5 + 0.5 * Math.sin(t * 7) });
      const z = lerp(1, 2.1, ease(t, a + 1.0, b + 0.2)); const j = st.joint;
      const tx = lerp(0, 560 - j.x * z, ease(t, a + 1.0, b + 0.2)), ty = lerp(0, 780 - j.y * z, ease(t, a + 1.0, b + 0.2));
      const g = `<g transform="translate(${tx} ${ty}) scale(${z})">${st.svg}${ring(j.x, j.y, j.w * 1.25, p(t, a + 0.35, a + 0.9), C.hot2, 5 / z)}</g>`;
      const s = { x: tx + j.x * z, y: ty + j.y * z };
      return { svg: FR.blueprint() + g + callout(s.x + 40, s.y - 10, 690, s.y - 260 * (1 - 0.4 * ease(t, a + 1, b)), "RIGHT BOOSTER", p(t, a + 0.15, a + 0.7), { size: 36 })
          + callout(s.x - 40, s.y - 10, 200, Math.min(s.y - 150, 1150), "LOWEST JOINT", p(t, a + 0.9, a + 1.5), { size: 36, anchor: "end" }).replace(/text-anchor="end"/, 'text-anchor="middle"'), // v2: kept out of the caption band
        hud: FR.chip("Explanatory diagram", "explanatory") };
    } });

  // S03 — the Commission's own drawing (Rogers Report Vol. 1, Fig. 14), O-ring labels marked.
  FR.shot({ id: "S03", start: T.s03, end: T.s04, kind: "document", label: "Commission record", subject: "Rogers Commission Fig. 14 field joint cross-section",
    source: "fig14", evidence: ["E2"], render: (t) => {
      // Review v1.1: the whole figure was unreadable on a phone. Show the joint detail (original px
      // x 150-500, y 140-370) at about 2.9x: the Commission's own labels read at about 40 px, and the
      // two O-rings it labels (measured at 242,305 and 242,337) are ringed.
      const a = T.s03, b = T.s04; const zx = lerp(1, 1.05, ease(t, a, b));
      const cw = 350 / zx, chh = 230 / zx, cx0 = 150 + (350 - cw) * 0.3, cy0 = 140 + (230 - chh) * 0.7;
      const box = { x: 40, y: 380, w: 1000, h: 657 };
      const [x0, y0] = P("fig14", cx0, cy0), [x1, y1] = P("fig14", cx0 + cw, cy0 + chh);
      const ph = FR.photo("fig14", { crop: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, box });
      const map = (x, y) => FR.toScreen(ph.crop, box, ...P("fig14", x, y));
      const l1 = map(352, 172), l2 = map(390, 218), o1 = map(242, 305), o2 = map(242, 337); const sc = box.w / (x1 - x0) * FR.media.fig14.scale;
      const mk = (q, k, w, h) => k <= 0 ? "" : `<rect x="${q.x}" y="${q.y}" width="${w * sc * E.out(clamp(k))}" height="${h * sc}" fill="${C.hot2}" opacity="0.45" rx="4"/>`;
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/><rect x="${box.x - 16}" y="${box.y - 16}" width="${box.w + 32}" height="${box.h + 32}" fill="#ffffff" rx="8" filter="url(#soft)"/>`,
        media: [ph], hud: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">${mk(l1, p(t, a + 0.1, a + 0.5), 132, 22)}${mk(l2, p(t, a + 0.4, a + 0.8), 96, 40)}
            ${ring(o1.x, o1.y, 30, p(t, a + 0.2, a + 0.6), C.hot, 6)}${ring(o2.x, o2.y, 30, p(t, a + 0.5, a + 0.9), C.hot, 6)}</svg>`
          + FR.source("Rogers Commission Report, Vol. 1, Figure 14 (detail)", 1, box.y + box.h + 40) + FR.chip("Commission record", "document") };
    } });

  // S04 — authentic NASA photo: icicles on the launch tower that morning.
  FR.shot({ id: "S04", start: T.s04, end: T.s05, kind: "archival", label: "NASA photo", subject: "icicles on the launch tower, launch morning", source: "icicles", evidence: ["E1"],
    render: (t) => { const a = T.s04, b = T.s05; const [fx, fy] = P("icicles", 1250, lerp(1300, 1700, ease(t, a, b)));
      const ph = FR.photo("icicles", { fx, fy, z: lerp(1.04, 1.16, ease(t, a, b)) });
      const k = p(t, a + 0.1, a + 0.45);
      return { media: [ph], svg: `<rect width="${W}" height="${H}" fill="#06121c" opacity="0.28"/><rect width="${W}" height="760" fill="url(#topShade)"/><rect y="1180" width="${W}" height="740" fill="url(#botShade)"/>`,
        hud: `<div style="position:absolute;left:0;right:0;top:330px;text-align:center;opacity:${k};transform:translateY(${(1 - E.out(k)) * 24}px);text-shadow:0 4px 24px rgba(0,0,0,.9)">
          <div style="font:600 220px/0.9 ${F.num};color:${C.cold}">36°F</div>
          <div style="font:700 38px/1.3 ${F.sans};color:${C.text};margin-top:18px">at launch — 15° colder<br>than any launch before</div></div>` + FR.chip("NASA photo · launch morning", "archival") };
    } });

  // S05 — explanatory animation: warm vs cold rubber recovering after a squeeze.
  FR.shot({ id: "S05", drift: [1.0, 1.05], start: T.s05, end: T.s06, kind: "explanatory", label: "Explanatory animation", subject: "O-ring resilience: warm vs cold", evidence: ["E2"],
    // Review v1.1: "springs back" was abstract. Each panel now shows the sealing job itself: the ring sits
    // in its groove against a wall; the wall moves away (as the joint does at ignition); warm rubber
    // expands to follow and keeps the seal, cold rubber lags and leaves an open gap.
    render: (t) => { const a = T.s05, b = T.s06; const rel = a + 0.3;
      const wall = 70 * ease(t, rel, rel + 0.45, E.out);
      const warmF = wall * E.out(p(t, rel + 0.05, rel + 0.5)); const coldF = wall * 0.18 * (1 - Math.exp(-p(t, rel, rel + 6) * 2));
      const panel = (cx, follow, col, title, ok) => { const gx = cx - 150, cy = 830, r = 70;
        const wx = gx + 2 * r + wall; const rx = r + follow / 2, ringCx = gx + rx; const gap = wx - (gx + 2 * rx);
        const res = p(t, rel + 0.55, rel + 0.9);
        return `<g><rect x="${gx - 120}" y="${cy - 170}" width="120" height="340" fill="url(#steelGrad)"/>
          <rect x="${wx}" y="${cy - 170}" width="90" height="340" fill="url(#steelGrad)"/>
          <ellipse cx="${ringCx}" cy="${cy}" rx="${rx}" ry="${r * (1 - follow / 400)}" fill="#26292e" stroke="${col}" stroke-width="8"/>
          ${gap > 6 ? `<rect x="${gx + 2 * rx + 4}" y="${cy - 60}" width="${gap - 8}" height="120" fill="${C.hot}" opacity="${0.7 * res}"/>` : ""}
          ${text(cx, 590, title, { size: 50, weight: 800, fill: col, ls: 2 })}
          ${text(cx - 30, 1080, ok ? "follows: still sealed" : "lags: gap left open", { size: 36, weight: 800, fill: ok ? "#7be0a0" : C.hot, op: res })}</g>`; };
      return { svg: FR.blueprint() + panel(290, warmF, C.hot2, "WARM", true) + panel(790, coldF, C.cold, "COLD", false)
          + `<line x1="540" y1="560" x2="540" y2="1120" stroke="${C.line}" stroke-width="3"/>` + text(540, 1190, "O-ring cross-section · illustration, not to scale", { size: 26, weight: 500, fill: C.muted }),
        hud: FR.chip("Explanatory animation", "explanatory") };
    } });

  // S06 — explanatory animation: the field joint opens at ignition; cold O-rings lag; hot gas blows by.
  FR.shot({ id: "S06", drift: [1.0, 1.06], start: T.s06, end: T.s07, kind: "explanatory", label: "Explanatory animation · not to scale", subject: "field joint rotation, O-ring lag and hot-gas blow-by", evidence: ["E2"],
    render: (t) => {
      const tIgn = Wd("L5", "ignition"), tOpen = WE("L5", "open"), tHot = Wd("L5", "hot");
      const g = 30 * ease(t, tIgn, tOpen + 0.2, E.out);           // gap opening (exaggerated)
      const follow = g * 0.12;                                     // a cold ring barely follows
      const tangX = 500 + g;
      const X0 = 300, X1 = 780, top = 300, slot = [470, 610];
      const pressure = p(t, tIgn - 0.1, tIgn + 0.4);
      const flick = 0.8 + 0.2 * Math.sin(t * 23) * Math.sin(t * 7);
      // hot gas path: chamber -> putty channel -> down the inner gap -> under the tang -> up the outer gap -> outside
      const gx = 504 + g * 0.55; // inner gap, between the O-rings and the tang
      const path = [[60, 640], [300, 655], [gx, 655], [gx, 1080], [tangX + 40, 1105], [slot[1] - 4 + g * 0.3, 1080], [slot[1] - 4 + g * 0.3, 660], [X1, 655], [1000, 640]];
      const seglen = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1])); const tot = seglen.reduce((s, x) => s + x, 0);
      const at = (u) => { let d = u * tot; for (let i = 0; i < seglen.length; i += 1) { if (d <= seglen[i]) { const f = d / seglen[i]; return [lerp(path[i][0], path[i + 1][0], f), lerp(path[i][1], path[i + 1][1], f)]; } d -= seglen[i]; } return path[path.length - 1]; };
      const flowK = p(t, tHot - 0.15, tHot + 1.0); let gas = "";
      if (flowK > 0) for (let i = 0; i < 46; i += 1) { const u = ((t - tHot) * 0.42 + i / 46) % 1; if (u < 0 || u > flowK * 1.02) continue; const [x, y] = at(u); gas += `<circle cx="${x}" cy="${y}" r="${9 + 5 * Math.sin(i * 2.3)}" fill="${u > 0.86 ? "#3b3a39" : C.hot}" opacity="${0.85}"/>`; }
      const puffs = flowK > 0.85 ? [0, 1, 2].map((i) => { const age = (t - tHot - 0.9 - i * 0.35); if (age < 0) return ""; const r = 30 + age * 90; return `<circle cx="${880 + i * 30 + age * 60}" cy="${620 - age * 140}" r="${r}" fill="#4a4846" opacity="${clamp(0.55 - age * 0.3)}" filter="url(#blur6)"/>`; }).join("") : "";
      const oring = (cy) => `<ellipse cx="${476 + follow * 0.5}" cy="${cy}" rx="${24 + follow * 0.5}" ry="26" fill="#1d1f22" stroke="${C.cold}" stroke-width="5"/>`;
      const arrows = pressure > 0 ? [520, 760, 980].map((y) => `<path d="M${120 + 40 * pressure} ${y} h${90 * pressure}" stroke="${C.hot2}" stroke-width="10" marker-end="url(#ah)" opacity="${pressure}"/>`).join("") : "";
      const svg = `<defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0 0L4 2L0 4Z" fill="${C.hot2}"/></marker>
          <linearGradient id="chamber" x1="0" x2="1"><stop offset="0" stop-color="#ff6a2a" stop-opacity="${0.55 * flick}"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></linearGradient></defs>
        <rect x="0" y="${top}" width="${X0}" height="940" fill="url(#chamber)"/>
        <!-- upper segment with tang -->
        <rect x="${X0}" y="${top}" width="${X1 - X0}" height="340" fill="url(#steelGrad)"/>
        <rect x="${X0}" y="${top}" width="${X1 - X0}" height="340" fill="none" stroke="#9aa6b5" stroke-width="2"/>
        <path d="M${tangX} 640 V1060 Q${tangX + 50} 1100 ${tangX + 100} 1060 V640 Z" fill="url(#steelGrad)" stroke="#9aa6b5" stroke-width="2"/>
        <!-- lower segment with clevis -->
        <path d="M${X0} 1240 V680 H${slot[0]} V1120 H${slot[1]} V680 H${X1} V1240 Z" fill="#596473" stroke="#9aa6b5" stroke-width="2"/>
        <rect x="${X0}" y="640" width="${slot[0] - X0 + 10}" height="40" fill="#bfa77e" opacity="0.9"/>
        <path d="M${slot[0] - 46} 770 h46 v60 h-46 Z M${slot[0] - 46} 890 h46 v60 h-46 Z" fill="${C.ink}"/>
        ${oring(800)}${oring(920)}${gas}${puffs}${arrows}`;
      const lab = (x, y, lx, ly, s, k, anchor) => callout(x, y, lx, ly, s, k, { size: 32, anchor });
      // Enlarged 1.45x around the joint: the O-rings read at phone size; the case wall beyond is cropped.
      const zoom = (inner) => `<g transform="translate(540 860) scale(1.45) translate(-540 -860)">${inner}</g>`;
      return { svg: FR.blueprint() + zoom(svg + lab(452, 790, 215, 610, "PRIMARY O-RING", p(t, T.s06 + 0.1, T.s06 + 0.6), "start")
          + lab(452, 930, 215, 1110, "SECONDARY O-RING", p(t, T.s06 + 0.4, T.s06 + 0.9), "start")
          + (g > 4 ? lab(tangX - 4, 990, 680, 990, "GAP", p(t, tIgn + 0.2, tIgn + 0.6), "start") : ""))
          + text(150, 330, "INSIDE", { size: 32, weight: 800, fill: C.hot2, ls: 3 }) + text(930, 330, "OUTSIDE", { size: 32, weight: 800, fill: C.steel, ls: 3 })
          // Review v1.1: one numbered step at a time, each landing on its spoken words.
          + (() => { const steps = [[tIgn - 0.05, "1  Ignition flexes the joint open"], [Wd("L5", "couldn't") - 0.05, "2  Cold O-rings can't follow"], [tHot - 0.05, "3  Hot gas blows past both seals"]];
              let cur = null; for (const st of steps) if (t >= st[0]) cur = st; if (!cur) return "";
              return text(540, 410, cur[1].toUpperCase(), { size: 38, weight: 800, fill: C.hot2, ls: 1, op: p(t, cur[0], cur[0] + 0.2), extra: `paint-order="stroke" stroke="#000" stroke-width="8"` }); })(),
        hud: FR.chip("Animation · not to scale", "explanatory") };
    } });

  // S07 — authentic NASA film: Challenger climbing; the clock runs on to 58 s.
  const filmBox = { x: 40, y: 330, w: 1000, h: 1000 };
  FR.shot({ id: "S07", start: T.s07, end: T.s08, kind: "archival", label: "NASA film", subject: "Challenger climbing normally", source: "climb", evidence: ["E1"],
    render: (t) => { const a = T.s07, b = T.s08; const sec = lerp(2.7, 58.0, E.in(p(t, a + 0.2, b)));
      return { under: FR.blueprint(), media: [FR.clip("climb", t - a, { box: filmBox, radius: 6 })], hud: FR.clock(sec, 1, { decimals: 1 }) + FR.chip("NASA film", "archival") }; } });

  // S08 — authentic NASA engineering film E-207: the flame at the joint.
  FR.shot({ id: "S08", start: T.s08, end: T.s09, kind: "archival", label: "NASA tracking film E-207", subject: "flame at the right SRB aft field joint", source: "e207", evidence: ["E1"],
    render: (t) => { const a = T.s08, b = T.s09; const lt = t - a; const fl = FR.clip("e207", lt, { box: filmBox, radius: 6 });
      // flame position inside the 1000 px panel (measured on the extracted frames)
      const fx = filmBox.x + 515, fy = filmBox.y + 458; const sec = 58.788 + lt * 0.95;
      return { under: FR.blueprint(), media: [fl], // Review v1.1: the ring arrives by 0.5 s (was 0.9 s), has a dark outline for contrast on the bright
          // plume, pulses gently, and stays to the end of the shot; the label follows at 0.6 s.
          hud: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">${ring(fx, fy, 78 + 4 * Math.sin(lt * 6), p(t, a + 0.1, a + 0.5), "#000", 15)}${ring(fx, fy, 78 + 4 * Math.sin(lt * 6), p(t, a + 0.1, a + 0.5), C.hot2, 9)}${callout(fx + 60, fy + 50, 470, 1150, "FLAME AT THE JOINT", p(t, a + 0.3, a + 0.7), { size: 40 })}</svg>`
          + FR.clock(sec, 1) + FR.chip("NASA tracking film E-207", "archival") }; } });

  // S09 — reconstruction: the plume swings onto the External Tank; the tank fails at 73 s. No explosion is drawn.
  FR.shot({ id: "S09", start: T.s09, end: T.s10, kind: "reconstruction", label: "Reconstruction", subject: "plume deflected onto the External Tank; tank failure", evidence: ["E1"],
    render: (t) => { const a = T.s09, b = T.s10; const t73 = Wd("L8", "seventy-three") ;
      const plume = ease(t, a, a + 0.9, E.out); const heat = ease(t, a + 0.5, t73 + 0.3);
      const st = FR.stack({ cx: 540, top: 330, bot: 1230, joint: 1, plume, etHeat: heat, orbiterOp: 0.28 }); // orbiter ghosted so the tank behind it shows
      const z = lerp(1.3, 1.5, ease(t, a, b)), tx = 700 - st.joint.x * z, ty = 820 - st.joint.y * z;
      const sec = t < t73 - 0.1 ? lerp(60.2, 64.66, ease(t, a, t73 - 0.2)) : 73.1;
      const fail = p(t, t73 + 0.1, b - 0.1);
      const lbl = t < t73 - 0.1 ? callout(st.et.x * z + tx + 70, st.joint.y * z + ty - 40, 120, 440, "FLAME REACHES THE TANK", p(t, a + 0.5, a + 1.0), { size: 36 })
        : text(540, 460, "THE TANK FAILS", { size: 54, weight: 800, fill: C.text, op: p(t, t73, t73 + 0.3), extra: `paint-order="stroke" stroke="#000" stroke-width="8"` });
      return { svg: FR.blueprint() + `<g transform="translate(${tx} ${ty}) scale(${z})">${st.svg}</g>` + `<rect width="${W}" height="${H}" fill="#000" opacity="${0.75 * fail}"/>` + lbl,
        hud: FR.clock(sec, 1, { decimals: t < t73 - 0.1 ? 1 : 0 }) + FR.chip("Reconstruction", "reconstruction") }; } });

  // S10 — authentic NASA photo, about 76 s after launch. Held once, quietly; no replay, no slow motion.
  FR.shot({ id: "S10", start: T.s10, end: T.s11, kind: "archival", label: "NASA photo", subject: "breakup, about 76 s after launch", source: "breakup", evidence: ["E1"], fade: 0.25,
    render: (t) => { const a = T.s10, b = T.s11; const [fx, fy] = P("breakup", 780, 1000);
      return { media: [FR.photo("breakup", { fx, fy, z: lerp(1.0, 1.04, ease(t, a, b)), filter: "saturate(0.85)" })], svg: `<rect y="1180" width="${W}" height="740" fill="url(#botShade)"/>`,
        hud: FR.chip("NASA photo · about 76 s after launch", "archival") }; } });

  // S11 — the crew's official portrait, whole frame (nobody cropped out), slow and still.
  FR.shot({ id: "S11", start: T.s11, end: T.s12, kind: "archival", label: "NASA portrait", subject: "STS-51-L crew official portrait", source: "crew", evidence: ["E1"], fade: 0.35,
    render: (t) => { const a = T.s11, b = T.s12; const m = FR.media.crew; const bw = 1080, bh = bw * m.ih / m.iw; const z = lerp(1.0, 1.05, ease(t, a, b));
      const crop = { x: m.iw * (1 - 1 / z) / 2, y: m.ih * (1 - 1 / z) / 2, w: m.iw / z, h: m.ih / z };
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [FR.photo("crew", { crop, box: { x: 0, y: 420, w: bw, h: bh } })],
        hud: `<div style="position:absolute;left:0;right:0;top:330px;text-align:center;font:700 28px ${F.sans};letter-spacing:4px;color:${C.steel}">THE STS-51-L CREW</div>` + FR.chip("NASA portrait · 1985", "archival") }; } });

  // S12 — the engineers' position, typeset from the Commission's record (not a facsimile).
  FR.shot({ id: "S12", drift: [1.0, 1.035], start: T.s12, end: T.s13, kind: "document", label: "Commission record · typeset", subject: "Thiokol engineering recommendation, 27 Jan 1986", evidence: ["E3"], fade: 0.3,
    // Review v1.1: text-heavy. Now one comparison (53 vs 36) carries the point, with a short exact
    // fragment of the quote and no typing animation; about 15 words on screen instead of about 40.
    render: (t) => { const a = T.s12; const t53 = Wd("L10", "fifty-three");
      const k = p(t, a + 0.1, a + 0.4), bar = ease(t, a + 1.2, a + 1.8); // both columns on screen for about 3 s
      const col = (x, f, label, c, kk) => { const h = 560 * (f / 60) * kk; return `<g opacity="${clamp(kk * 2)}"><rect x="${x}" y="${1200 - h}" width="300" height="${h}" rx="8" fill="${c}" opacity="0.9"/>
          ${text(x + 150, 1200 - h - 30, f + "°F", { size: 96, weight: 600, family: F.num, fill: c })}${text(x + 150, 1250, label, { size: 32, weight: 800, fill: C.text, ls: 1.5 })}</g>`; };
      return { svg: FR.blueprint() + `<line x1="120" y1="1200" x2="960" y2="1200" stroke="${C.line}" stroke-width="3"/>`
          + col(160, 53, "ENGINEERS’ LIMIT", C.hot2, k) + col(620, 36, "LAUNCH MORNING", C.cold, bar),
        hud: `<div style="position:absolute;left:90px;right:90px;top:300px;opacity:${k};text-align:center">
            <div style="font:700 26px ${F.sans};letter-spacing:3px;color:${C.steel}">THE NIGHT BEFORE · THIOKOL ENGINEERS</div>
            <div style="font:700 50px/1.2 ${F.serif};color:${C.paper};margin-top:16px">“would not recommend a launch below 53 degrees”</div>
            <div style="font:500 24px ${F.sans};color:${C.muted};margin-top:12px">quoted in the Rogers Commission Report, Vol. 1, Ch. V</div></div>` + FR.chip("Commission record", "document") }; } });

  // S13 — explanatory diagram: where the warning stopped.
  FR.shot({ id: "S13", drift: [1.0, 1.04], start: T.s13, end: T.s14, kind: "explanatory", label: "Explanatory diagram", subject: "decision chain: engineers, managers, top launch officials", evidence: ["E3"],
    render: (t) => { const a = T.s13; const tRev = Wd("L11", "reversed"), tNever = Wd("L11", "never");
      const node = (y, title, sub, col, k, struck) => k <= 0 ? "" : `<g opacity="${clamp(k * 1.5)}" transform="translate(0 ${(1 - E.out(clamp(k))) * 30})"><rect x="140" y="${y}" width="800" height="150" rx="16" fill="${C.panel}" stroke="${col}" stroke-width="4"/>
          ${text(540, y + 64, title, { size: 44, weight: 800, fill: C.text, ls: 1 })}${text(540, y + 112, sub, { size: 32, weight: 600, fill: col })}${struck ? `<line x1="300" y1="${y + 102}" x2="${300 + 480 * E.out(clamp(struck))}" y2="${y + 102}" stroke="${C.red}" stroke-width="6"/>` : ""}</g>`;
      const k1 = p(t, a, a + 0.4), k2 = p(t, tRev - 0.3, tRev + 0.1), k3 = p(t, tNever - 0.5, tNever - 0.1);
      const dash = k3 > 0 ? `<g opacity="${k3}"><line x1="540" y1="840" x2="540" y2="980" stroke="${C.steel2}" stroke-width="6" stroke-dasharray="14 14"/>
        <g transform="translate(540 910)"><circle r="40" fill="${C.ink}" stroke="${C.red}" stroke-width="5"/><path d="M-16 -16L16 16M16 -16L-16 16" stroke="${C.red}" stroke-width="7" stroke-linecap="round"/></g></g>` : "";
      const link = k2 > 0 ? `<line x1="540" y1="530" x2="540" y2="${530 + 110 * E.out(k2)}" stroke="${C.steel}" stroke-width="6"/>` : "";
      return { svg: FR.blueprint() + node(380, "ENGINEERS", "Don’t launch below 53°F", C.hot2, k1, 0) + link
          + node(690, "THEIR MANAGERS", "Reversed it", C.steel, k2, 0) + dash
          + node(1000, "TOP NASA OFFICIALS", "Never heard it", C.red, k3, 0)
          + text(540, 1220, "Source: Rogers Commission Report, Vol. 1, Ch. V", { size: 24, weight: 500, fill: C.muted, op: k1 }),
        hud: FR.chip("Explanatory diagram", "explanatory") }; } });

  // S14 — authentic NASA photo: the scorched hole in the recovered right motor segment.
  FR.shot({ id: "S14", start: T.s14, end: T.s15, kind: "archival", label: "NASA photo · recovered hardware", subject: "scorched hole in the recovered right Solid Rocket Motor segment", source: "burn", evidence: ["E5", "E2"], fade: 0.2,
    render: (t) => { const a = T.s14, b = T.s15; const [fx, fy] = P("burn", 1250, 1480);
      return { media: [FR.photo("burn", { fx, fy, z: lerp(1.0, 1.08, ease(t, a, b + 1)) })], svg: `<rect width="${W}" height="820" fill="url(#topShade)"/><rect y="1180" width="${W}" height="740" fill="url(#botShade)"/>`,
        hud: headline("", "The seal failed<br>in the cold.", 340, p(t, a, a + 0.3)) + FR.source("Scorched hole in the recovered right motor segment · NASA", 1, 1250) + FR.chip("NASA photo · recovered", "archival") }; } });

  // S15 — back to the opening photograph, pulling out to the whole vehicle (the loop returns to frame 0).
  FR.shot({ id: "S15", start: T.s15, end: T.end, kind: "archival", label: "NASA photo", subject: "liftoff close-up, pull back", source: "liftoff", evidence: ["E3"], // hard cut: a crossfade would overlap two headlines
    render: (t) => { const a = T.s15, b = T.end; const e = ease(t, a, b);
      // Review v1.1: end on the exact frame-0 framing (1080x1400 box, same focus, zoom 1.0) so the loop
      // does not jump; the payoff fades out over the last 0.35 s.
      const box = { x: 0, y: 0, w: W, h: 1400 };
      const [fx1, fy1] = P("liftoff", 1300, 2200), [fx0, fy0] = P("liftoff", SMOKE[0] - 260, SMOKE[1] - 150);
      const ph = FR.photo("liftoff", { fx: lerp(fx0, fx1, e), fy: lerp(fy0, fy1, e), z: lerp(1.38, 1.0, e), box });
      const out = 1 - p(t, b - 0.35, b - 0.02);
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [ph], svg: `<rect width="${W}" height="${H}" fill="#000" opacity="${0.25 * out}"/><rect width="${W}" height="640" fill="url(#topShade)"/><rect y="1120" width="${W}" height="290" fill="url(#botShade)"/><rect y="1400" width="${W}" height="520" fill="${C.ink}"/>`,
        hud: `<div style="position:absolute;left:60px;right:60px;top:330px;text-align:center;opacity:${out};text-shadow:0 3px 18px rgba(0,0,0,.9)">
            <div style="font:800 64px/1.1 ${F.sans};color:rgba(245,242,236,.55)">The seal failed in the cold.</div>
            <div style="font:800 76px/1.08 ${F.sans};letter-spacing:-1px;color:${C.hot2};margin-top:26px;opacity:${p(t, a, a + 0.35)}">But the warning failed<br>the night before.</div></div>`
          + FR.chip("NASA photo", "archival") }; } });

  // Global layers: handle and captions (captions sit in the y 1318-1460 band, clear of the evidence above
  // and of the Shorts UI below and at the right edge).
  FR.overlay((t) => ({ hud: FR.handle() + FR.captionAt(t) }));
};
