// Phase 1 prototype A: opening photo -> registered trace -> Commission Fig. 14 (replaces V2 S02, S03).
// V2 cut from the NASA photo to a clip-art stack (a second visual world) and then to Fig. 14 as a card
// on black. Here one camera stays on the same photograph: the right booster and its aft field joint are
// traced over the photo at their measured positions, the camera follows the joint band to the booster
// wall, and the Commission's own cross-section of that joint grows out of the band (push-in through the
// point of interest). Data: every coordinate is measured in the original files' pixels (anchors below).
(window.OVERRIDES = window.OVERRIDES || []).push(function (FR) {
  const { C, E, p, lerp, clamp, W, H, X } = FR; const L = FR.L, Wd = FR.word;
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  const P = (key, x, y) => { const m = FR.media[key]; return [x * m.scale, y * m.scale]; };

  // ---- anchors (original px). Liftoff photo GPN-2000-001347, 2308x3458: the near white booster is the
  // right SRB (orbiter belly faces the tank, nose up, so the orbiter's right side faces the camera).
  const A = {
    smoke: [1972, 2885],                 // V2 S01 ring (E1: grey smoke at the aft field joint, 0.678 s)
    booster: { x0: 1500, x1: 1910, y0: 1950, y1: 2990 }, // visible edges of the right SRB (measured)
    joint: 2895,                         // aft field joint band, same height as the smoke (measured)
    fig14: { orings: [[242, 305], [242, 337]], wall: [242, 321], primaryLabel: [353, 172, 128, 22], secondaryLabel: [393, 218, 96, 40],
      wide: { x: 0, y: 120, w: 527, h: 360 }, close: { x: 160, y: 153, w: 355, h: 243 } }, // crops chosen so no Commission label is sliced
  };
  const T = { s02: L("L2").start - 0.1, s03: Wd("L2", "sealed") - 0.05, s04: L("L3").start - 0.1 };
  const tJoint = Wd("L2", "joint"), tRight = Wd("L2", "right"), tRings = Wd("L2", "O-rings");
  const box = { x: 0, y: 0, w: W, h: 1400 };

  // one camera on the photo, continuous with V2 S01 (same formula up to its end), then along the joint
  const camPhoto = (t) => {
    const e = ease(t, 0, T.s02 + 0.3); const [fx0, fy0] = P("liftoff", 1300, 2200), [fx1, fy1] = P("liftoff", A.smoke[0] - 260, A.smoke[1] - 150);
    let c = { fx: lerp(fx0, fx1, e), fy: lerp(fy0, fy1, e), z: lerp(1.0, 1.38, e) };
    const [jx, jy] = P("liftoff", A.booster.x0 + 60, A.joint);
    const k = ease(t, T.s02 + 0.3, T.s03 + 0.05); return { fx: lerp(c.fx, jx, k), fy: lerp(c.fy, jy, k), z: Math.exp(lerp(Math.log(c.z), Math.log(3.1), E.in(k) * 0.4 + k * 0.6)) };
  };
  // reveal: the photo window grows from V2 S01's 1080x1400 to the full frame without changing scale
  // (the picture stays put; more of it appears below), so the frame is no longer half empty.
  const reveal = (t) => lerp(1400, H, ease(t, T.s02, T.s02 + 0.7));
  const photoAt = (t, op = 1, filter = "") => { const ph = FR.photo("liftoff", { ...camPhoto(t), box, opacity: op, filter }); const bh = reveal(t), s = ph.box.w / ph.crop.w;
    return { ...ph, box: { ...ph.box, h: bh }, crop: { ...ph.crop, h: Math.min(FR.media.liftoff.ih - ph.crop.y, ph.crop.h + (bh - 1400) / s) } }; };
  const mapPhoto = (ph) => (x, y) => FR.toScreen(ph.crop, ph.box, ...P("liftoff", x, y));

  FR.replace("S02", { start: T.s02, end: T.s03, kind: "explanatory", label: "NASA photo · traced outline", subject: "right SRB and its aft field joint traced over the opening photo", source: "liftoff", evidence: ["E1", "E2", "E4"],
    trans: "continuous", transReason: "continuous camera on the same photograph (no cut)",
    register: { from: "S01", asset: "liftoff", anchors: ["smoke", "joint band"] }, framing: "full-bleed photo (1080x1400) + caption band",
    states: [{ t: T.s02 + 0.2, what: "trace of the right booster draws on", ev: "E4" }, { t: tJoint, what: "aft field joint band lights", ev: "E1" }, { t: tRight, what: "label: right booster", ev: "E1" }, { t: T.s03 - 0.6, what: "photo dims, camera pushes into the joint", ev: null }],
    render: (t) => {
      const fade = ease(t, T.s02, T.s02 + 0.6), out = ease(t, T.s03 - 0.55, T.s03 + 0.05);
      const ph = photoAt(t, 1 - 0.75 * out, `saturate(${1 - 0.55 * fade}) brightness(${1 - 0.35 * fade})`); const m = mapPhoto(ph); const b = A.booster;
      const tk = p(t, T.s02 + 0.1, T.s02 + 1.1);
      const trace = X.trace([
        { d: [[b.x0, b.y0], [b.x0, b.y1]], k0: 0, k1: 0.6, color: "#e8eef5", w: 5 },
        { d: [[b.x1, b.y0], [b.x1, b.y1]], k0: 0.1, k1: 0.7, color: "#e8eef5", w: 5 },
      ], m, tk);
      const jk = p(t, tJoint - 0.15, tJoint + 0.35);
      const band = X.trace([{ d: [[b.x0 - 10, A.joint], [b.x1 + 10, A.joint]], color: C.hot2, w: 11 }], m, jk)
        + X.trace([{ d: [[b.x1 + 10, A.joint], [A.smoke[0] - 60, A.joint - 4]], color: C.hot2, w: 5, dash: "10 12" }], m, jk);
      const sm = m(...A.smoke); const j0 = m(b.x0, A.joint), j1 = m(b.x1, A.joint), mid = m((b.x0 + b.x1) / 2, 2350);
      const ringK = 1 - out;
      const lk = p(t, tRight - 0.1, tRight + 0.3) * (1 - out);
      const svg = `<rect width="${W}" height="640" fill="url(#topShade)" opacity="${0.6}"/><rect y="1060" width="${W}" height="520" fill="url(#botShade)"/><rect y="1290" width="${W}" height="${H}" fill="#000" opacity="0.35"/><rect y="${reveal(t)}" width="${W}" height="${H}" fill="${C.ink}"/>`
        + trace + band + `<g opacity="${ringK}">${FR.ring(sm.x, sm.y, 86, 1)}</g>`
        + FR.callout(mid.x - 40, mid.y, 150, Math.max(470, mid.y - 360), "RIGHT BOOSTER", lk, { size: 40, anchor: "start" })
        + FR.callout(lerp(j0.x, j1.x, 0.3), j0.y + 8, 150, Math.min(1180, j0.y + 210), "AFT FIELD JOINT", p(t, tJoint, tJoint + 0.4) * (1 - out), { size: 40, anchor: "start" });
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [ph], svg, hud: FR.chip("NASA photo · traced", "explanatory") };
    } });

  // Fig. 14 grows out of the joint band: its wall section is anchored to the traced wall position.
  FR.replace("S03", { start: T.s03, end: T.s04, kind: "document", label: "Commission record", subject: "Rogers Commission Fig. 14 field joint cross-section, registered to the traced joint", source: "fig14", evidence: ["E2"], fade: 0.4,
    trans: "push-in", transReason: "push-in through the traced joint band into the Commission's cross-section of that joint",
    register: { from: "S02", asset: "fig14", anchors: ["joint band -> wall section"] }, framing: "full-width document plate",
    states: [{ t: T.s03, what: "cross-section grows out of the joint band", ev: "E2" }, { t: tRings - 0.2, what: "camera closes on the two O-rings; rings drawn", ev: "E2" }],
    render: (t) => {
      const bx = { x: 0, y: 340, w: W, h: 740 }; const f = A.fig14; const sc = FR.media.fig14.scale;
      // start: wall section at the band's screen position, small; then the whole joint (no sliced labels); then the O-rings
      const ph0 = photoAt(T.s03 + 0.05); const anc = mapPhoto(ph0)(A.booster.x0 + 60, A.joint);
      const s0 = 0.55, s1 = bx.w / f.wide.w, s2 = bx.w / f.close.w;
      const cropAt = (s, ox, oy, ax, ay) => ({ x: ox - (ax - bx.x) / s, y: oy - (ay - bx.y) / s, w: bx.w / s, h: bx.h / s });
      const c0 = cropAt(s0, f.wall[0], f.wall[1], anc.x, anc.y), c1 = f.wide, c2 = f.close;
      const k1 = ease(t, T.s03, T.s03 + 0.6, E.out), k2 = ease(t, tRings - 0.45, tRings + 0.35);
      const mixc = (a, b, k) => { const lw = Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)); const cxA = a.x + a.w / 2, cyA = a.y + a.h / 2, cxB = b.x + b.w / 2, cyB = b.y + b.h / 2;
        return { x: lerp(cxA, cxB, k) - lw / 2, y: lerp(cyA, cyB, k) - lw * bx.h / bx.w / 2, w: lw, h: lw * bx.h / bx.w }; };
      const cr = k2 > 0 ? mixc(c1, c2, k2) : mixc(c0, c1, k1);
      const ph = FR.photo("fig14", { crop: { x: cr.x * sc, y: cr.y * sc, w: cr.w * sc, h: cr.h * sc }, box: bx, filter: "contrast(1.05)" });
      const to = (x, y) => ({ x: bx.x + (x - cr.x) * bx.w / cr.w, y: bx.y + (y - cr.y) * bx.h / cr.h }); const ss = bx.w / cr.w;
      const mk = (q, k) => k <= 0 ? "" : (() => { const a = to(q[0], q[1]); return `<rect x="${a.x - 4}" y="${a.y - 3}" width="${(q[2] * ss + 8) * E.out(clamp(k))}" height="${q[3] * ss + 6}" fill="${C.hot2}" opacity="0.42"/>`; })();
      const o1 = to(...f.orings[0]), o2 = to(...f.orings[1]); const rk = p(t, tRings - 0.1, tRings + 0.35);
      const paperOp = ease(t, T.s03, T.s03 + 0.4);
      const ground = photoAt(T.s03, 0.3, "saturate(0.4) brightness(0.55)"); // the traced photo stays underneath (same space)
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, svg: `<rect y="1120" width="${W}" height="${H}" fill="#000" opacity="0.35"/>`,
        media: [ground, ph],
        hud: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">${mk(f.primaryLabel, rk)}${mk(f.secondaryLabel, p(t, tRings + 0.1, tRings + 0.45))}
            ${FR.ring(o1.x, o1.y, 15 * ss, rk, C.hot, 6)}${FR.ring(o2.x, o2.y, 15 * ss, p(t, tRings + 0.1, tRings + 0.45), C.hot, 6)}</svg>`
          + FR.source("Rogers Commission Report, Vol. 1, Figure 14 · the field joint", paperOp, bx.y + bx.h + 30) + FR.chip("Commission record", "document", paperOp) };
    } });
});
