// Phase 1 prototype C: flame -> tank failure (replaces V2 S08, S09).
// V2 showed the tracking film in a square box over a void, then a clip-art stack where the tank only
// turned grey. Here the film fills the frame (blurred plate behind it), the camera closes on the flame,
// and the reconstruction starts at the same screen point and the same vehicle angle as the film
// (registered match), then rights itself and plays the Commission's documented sequence on an event
// clock: plume on the tank -> hydrogen leak -> lower strut lets go and the booster rotates -> aft dome
// fails. No explosion is drawn; the film cuts to the authentic breakup photograph (V2 S10, unchanged).
(window.OVERRIDES = window.OVERRIDES || []).push(function (FR) {
  const { C, E, p, lerp, clamp, W, H, X, text } = FR; const L = FR.L, Wd = FR.word;
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  // ---- data -----------------------------------------------------------------------------------
  const DIMS = { et: { len: 46.9, dia: 8.4 }, srb: { len: 45.6, dia: 3.7 }, offset: 6.3, srbAftBelowEt: 2.4 }; // NASA published dimensions; offset approximate
  const FILM = { flame: [515, 458], axisDeg: -28, srbWidthPx: 50 }; // flame and vehicle axis measured on the extracted E-207 frames (1000 px panel)
  const T = { s08: L("L7").start - 0.1, s09: Wd("L7", "swept") - 0.05, s10: Wd("L8", "broke") - 0.05 };
  const EV = [ // E1: Rogers Commission Vol. 1, Ch. III, sequence of major events (seconds after liftoff)
    { at: 59.262, screen: T.s09, key: "plume", label: null, ev: "E1 59.262 continuous well defined plume" },
    { at: 60.238, screen: T.s09 + 0.3, key: "deflect", dur: 0.8, label: "PLUME TURNS ONTO THE TANK", ev: "E1 60.238 plume deflection; 60.248 attaching to ET ring frame" },
    { at: 64.660, screen: Wd("L7", "tank"), key: "leak", dur: 0.6, label: "HYDROGEN TANK LEAKS", ev: "E1 64.660 LH2 tank leak near 2058 ring frame" },
    { at: 72.204, screen: Wd("L8", "seventy-three"), key: "strut", dur: 0.7, label: "LOWER STRUT BREAKS", ev: "E1 72.204 lower strut severed; right SRB rotates about upper strut" },
    { at: 73.124, screen: Wd("L8", "failed"), key: "dome", dur: 0.8, label: "TANK’S AFT DOME FAILS", ev: "E1 73.124 aft dome dropping away" },
  ];
  const filmBox = { x: 0, y: 290, w: W, h: W };

  // ---- S08: authentic tracking film, full width, camera closes on the flame ---------------------------
  const filmCam = (t) => { const z = lerp(1, 1.7, ease(t, T.s08 + 0.4, T.s09 + 0.02)); const cw = 1000 / z; const cx = lerp(500, FILM.flame[0], ease(t, T.s08 + 0.4, T.s09)), cy = lerp(500, FILM.flame[1], ease(t, T.s08 + 0.4, T.s09));
    return { x: clamp(cx - cw / 2, 0, 1000 - cw), y: clamp(cy - cw / 2, 0, 1000 - cw), w: cw, h: cw }; };
  const flameOnScreen = (t) => { const c = filmCam(t); return { x: filmBox.x + (FILM.flame[0] - c.x) * filmBox.w / c.w, y: filmBox.y + (FILM.flame[1] - c.y) * filmBox.h / c.h, s: filmBox.w / c.w }; };
  FR.replace("S08", { start: T.s08, end: T.s09, kind: "archival", label: "NASA tracking film E-207", subject: "flame at the right SRB aft field joint, full width with plate", source: "e207", evidence: ["E1"],
    trans: "cut", transReason: "cut on the narration beat into the documented film (V2 grammar)", framing: "full-width film + blurred plate of the same film",
    states: [{ t: T.s08 + 0.1, what: "ring on the flame", ev: "E1 58.788" }, { t: T.s08 + 0.4, what: "camera closes on the flame", ev: null }],
    render: (t) => { const lt = t - T.s08; const fl = FR.clip("e207", lt, { box: filmBox, crop: filmCam(t) }); const f = flameOnScreen(t);
      const ringR = 70 + 3 * Math.sin(lt * 6);
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [X.plate(FR.clip("e207", lt, { box: filmBox }), { blur: 34, dim: 0.45 }), fl],
        svg: `<rect y="${filmBox.y + filmBox.h - 200}" width="${W}" height="200" fill="url(#botShade)"/>`,
        hud: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">${FR.ring(f.x, f.y, ringR, p(t, T.s08 + 0.1, T.s08 + 0.5), "#000", 15)}${FR.ring(f.x, f.y, ringR, p(t, T.s08 + 0.1, T.s08 + 0.5), C.hot2, 9)}</svg>`
          // a documented time stamp, not a running clock (the film's playback speed is not documented here)
          + FR.clock(58.788, 1, { label: "FIRST FLAME" }) + FR.chip("NASA tracking film E-207", "archival") }; } });

  // ---- S09: registered reconstruction on an event clock ------------------------------------------------
  FR.replace("S09", { start: T.s09, end: T.s10, kind: "reconstruction", label: "Reconstruction · proportions approximate", subject: "Commission event sequence 59.3-73.1 s on the stack: plume, leak, strut, rotation, aft dome", evidence: ["E1"],
    trans: "match", transReason: "match cut on position and angle: the flame in the film becomes the joint in the reconstruction",
    register: { from: "S08", asset: "e207", anchors: ["flame -> right SRB aft field joint (inner side)", "vehicle axis -28°"] }, framing: "full-frame reconstruction",
    states: EV.filter((e) => e.label).map((e) => ({ t: e.screen, what: e.label.toLowerCase(), ev: e.ev })),
    events: EV,
    render: (t) => {
      const ev = X.events(EV, t); const flick = 0.85 + 0.15 * Math.sin(t * 21) * Math.sin(t * 5.3);
      const st0 = X.stack({ cx: 540, top: 0, pxPerM: 24, dims: DIMS, jointFromAft: 0.2 }); // geometry probe
      const f = flameOnScreen(T.s09);
      // the booster in the closed-up film frame is about 50 film px wide (estimated on the frames) = 50 * f.s screen px
      const cam0 = { fx: st0.joint.inner, fy: st0.joint.y, z: (FILM.srbWidthPx * f.s) / (DIMS.srb.dia * 24), rot: FILM.axisDeg };
      const cam1 = { fx: 540, fy: st0.et.top + (st0.srb.bot - st0.et.top) * 0.845, z: 1.9, rot: 0 }; // Phase 1b: the aft ~22 m, where every documented event happens (was z 1.32: 58% empty ground)
      const k = ease(t, T.s09, T.s09 + 1.0, E.inOut);
      // V3 (phone-scale check): from the strut event on, a localized push onto the aft attachment and the
      // tank's aft dome, where the last two documented events happen (they read small at z 1.9)
      const cam2 = { fx: 600, fy: st0.et.top + (st0.srb.bot - st0.et.top) * 0.88, z: 2.4, rot: 0 };
      const k2 = ease(t, EV[3].screen - 0.3, EV[3].screen + 0.5);
      const cam = X.mix(X.mix(cam0, cam1, k), cam2, k2); const sx = lerp(f.x, 540, k), sy = lerp(f.y, 760, k);
      const st = X.stack({ cx: 540, top: 0, pxPerM: 24, dims: DIMS, jointFromAft: 0.2, plume: 1, deflect: ev.k("deflect"), leak: ev.k("leak") * flick,
        strut: ev.k("strut"), rot: -5 * ev.k("strut"), dome: ev.k("dome"), orbiter: 0.16, flick }); // Phase 1b: fainter outline at the tighter framing (read as stray lines at 0.35)
      const at = (x, y) => X.apply(cam, x, y, sx, sy);
      const lab = (() => { const e = ev.last; if (!e || !e.label) return "";
        const anchor = e.key === "deflect" ? at(st.joint.inner - 30, st.joint.y + 40) : e.key === "leak" ? at(st.leakAt.x, st.leakAt.y) : e.key === "strut" ? at(st.aft.x, st.aft.y) : at(st.et.x, st.et.domeY + 40);
        const ly = anchor.y < 760 ? anchor.y + 260 : anchor.y - 300;
        return FR.callout(anchor.x, anchor.y, 120, clamp(ly, 520, 1180), e.label, p(t, e.screen, e.screen + 0.35) * (k > 0.6 ? 1 : 0), { size: 40, anchor: "start" }); })();
      const hold = p(t, EV[4].screen + 0.9, T.s10);
      // V3: the drawing is clipped above the caption band (the falling aft dome no longer passes under the captions)
      return { svg: FR.blueprint() + `<clipPath id="c9"><rect width="${W}" height="1290"/></clipPath><g clip-path="url(#c9)"><g transform="${X.xf(cam, sx, sy)}">${st.svg}</g></g>` + lab + `<rect width="${W}" height="${H}" fill="#000" opacity="${0.35 * hold}"/>`
          + `<rect y="1290" width="${W}" height="${H}" fill="#000" opacity="0.4"/>`,
        hud: FR.clock(ev.now, 1, { decimals: ev.now >= 73 ? 3 : 1 }) + FR.chip("Reconstruction", "reconstruction")
          + FR.source("Times: Rogers Commission, Vol. 1, Ch. III", 1, 1556) }; } });
});
