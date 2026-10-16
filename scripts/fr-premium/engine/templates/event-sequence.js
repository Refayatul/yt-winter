// Template: event-sequence. A reconstruction that plays a documented event table on an evidence clock
// (FR.X.events) over a failure-state vehicle (FR.X.stack). It starts as a registered match on a
// previous archival shot's anchor (same screen point, angle and scale), then settles and optionally
// pushes in from a given event. Every event time and every dimension is a claim; illustrative values
// (rotation, offsets) must be labelled. Generalises V3 S09 (prototype C).
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const FT = 0.3048;
  const T = {
    id: "event-sequence", version: 1, provenance: ["reconstruction"], minStates: 2,
    params: { type: "object", required: ["dims", "events", "camera", "chip", "source"], additionalProperties: false, properties: {
      dims: { type: "object", required: ["etLength", "etDiameter", "srbLength", "srbDiameter", "srbOffsetM", "srbAftBelowEtM"], additionalProperties: false, properties: {
        etLength: S.claim, etDiameter: S.claim, srbLength: S.claim, srbDiameter: S.claim,
        srbOffsetM: { type: "number", "x-illustrative": true }, srbAftBelowEtM: { type: "number", "x-illustrative": true } } },
      jointFromAft: { type: "number", minimum: 0, maximum: 1 },
      events: { type: "array", minItems: 2, items: { type: "object", required: ["claim", "at", "key"], additionalProperties: false, properties: {
        claim: S.claim, at: S.timeRef, key: { enum: ["plume", "deflect", "leak", "strut", "dome"] }, dur: { type: "number", minimum: 0 }, label: S.text } } },
      rotationDeg: { type: "number", "x-illustrative": true },
      register: { type: "object", required: ["fromShot", "anchor", "axis", "width"], additionalProperties: false, properties: {
        fromShot: { type: "string", pattern: "^S[0-9]{2}$" }, anchor: S.anchor, axis: S.anchor, width: S.anchor } },
      camera: { type: "object", required: ["settle"], additionalProperties: false, properties: {
        settle: { type: "object", required: ["dur", "focusFrac", "zoom", "screenY"], additionalProperties: false, properties: { dur: { type: "number" }, fx: { type: "number" }, focusFrac: { type: "number" }, zoom: { type: "number" }, screenY: { type: "number" } } },
        push: { type: "object", required: ["afterEvent", "lead", "lag", "fx", "focusFrac", "zoom"], additionalProperties: false, properties: { afterEvent: { enum: ["deflect", "leak", "strut", "dome"] }, lead: { type: "number" }, lag: { type: "number" }, fx: { type: "number" }, focusFrac: { type: "number" }, zoom: { type: "number" } } } } },
      orbiterOpacity: { type: "number", minimum: 0, maximum: 1 },
      clipAboveY: { type: "number" },
      endDim: { type: "object", required: ["afterEvent", "delay", "opacity"], additionalProperties: false, properties: { afterEvent: { enum: ["dome"] }, delay: { type: "number" }, opacity: { type: "number" } } },
      chip: S.chip, source: S.source,
    } },
    states: ["match-from-film", "deflect", "leak", "strut", "dome"],
    build(FR, shot, ctx) {
      const P = shot.params; const { E, p, lerp, clamp, W, H: HH, X } = FR;
      const m = (ref) => ctx.value(ref) * FT;
      const DIMS = { et: { len: m(P.dims.etLength), dia: m(P.dims.etDiameter) }, srb: { len: m(P.dims.srbLength), dia: m(P.dims.srbDiameter) }, offset: P.dims.srbOffsetM, srbAftBelowEt: P.dims.srbAftBelowEtM };
      const jf = P.jointFromAft == null ? 0.2 : P.jointFromAft; const px = 24;
      const EV = P.events.map((e) => ({ at: ctx.value(e.claim), screen: ctx.time(e.at), key: e.key, dur: e.dur || 0, label: e.label ? H.text(e.label, ctx) : null, approx: !!ctx.claim(e.claim.slice(6)).approximate }));
      const st0 = X.stack({ cx: 540, top: 0, pxPerM: px, dims: DIMS, jointFromAft: jf });
      const reg = P.register; const C = P.camera; const frac = (f) => st0.et.top + (st0.srb.bot - st0.et.top) * f;
      const f = reg ? ctx.shotApi(reg.fromShot).screenOf(reg.anchor, shot.start) : { x: 540, y: C.settle.screenY, s: 1 };
      const cam0 = reg ? { fx: st0.joint.inner, fy: st0.joint.y, z: (ctx.anchor(reg.width).lengthPx * f.s) / (DIMS.srb.dia * px), rot: ctx.anchor(reg.axis).angleDeg }
        : { fx: C.settle.fx || 540, fy: frac(C.settle.focusFrac), z: C.settle.zoom, rot: 0 };
      const cam1 = { fx: C.settle.fx || 540, fy: frac(C.settle.focusFrac), z: C.settle.zoom, rot: 0 };
      const pe = C.push ? EV.find((e) => e.key === C.push.afterEvent) : null; const cam2 = pe ? { fx: C.push.fx, fy: frac(C.push.focusFrac), z: C.push.zoom, rot: 0 } : null;
      const de = P.endDim ? EV.find((e) => e.key === P.endDim.afterEvent) : null;
      const render = (t) => {
        const ev = X.events(EV, t); const flick = 0.85 + 0.15 * Math.sin(t * 21) * Math.sin(t * 5.3);
        const k = E.inOut(p(t, shot.start, shot.start + C.settle.dur)); const k2 = pe ? E.inOut(p(t, pe.screen - C.push.lead, pe.screen + C.push.lag)) : 0;
        const cam = cam2 ? X.mix(X.mix(cam0, cam1, k), cam2, k2) : X.mix(cam0, cam1, k); const sx = lerp(f.x, 540, k), sy = lerp(f.y, C.settle.screenY, k);
        const st = X.stack({ cx: 540, top: 0, pxPerM: px, dims: DIMS, jointFromAft: jf, plume: 1, deflect: ev.k("deflect"), leak: ev.k("leak") * flick,
          strut: ev.k("strut"), rot: -(P.rotationDeg || 0) * ev.k("strut"), dome: ev.k("dome"), orbiter: P.orbiterOpacity == null ? 0.3 : P.orbiterOpacity, flick });
        const at = (x, y) => X.apply(cam, x, y, sx, sy);
        const lab = (() => { const e = ev.last; if (!e || !e.label) return "";
          const a = e.key === "deflect" ? at(st.joint.inner - 30, st.joint.y + 40) : e.key === "leak" ? at(st.leakAt.x, st.leakAt.y) : e.key === "strut" ? at(st.aft.x, st.aft.y) : at(st.et.x, st.et.domeY + 40);
          const ly = a.y < 760 ? a.y + 260 : a.y - 300;
          return FR.callout(a.x, a.y, 120, clamp(ly, 520, 1180), e.label, p(t, e.screen, e.screen + 0.35) * (k > 0.6 ? 1 : 0), { size: 40, anchor: "start" }); })();
        const hold = de ? p(t, de.screen + P.endDim.delay, shot.end) : 0; const clipY = P.clipAboveY || HH;
        return { svg: FR.blueprint() + `<clipPath id="c9"><rect width="${W}" height="${clipY}"/></clipPath><g clip-path="url(#c9)"><g transform="${X.xf(cam, sx, sy)}">${st.svg}</g></g>` + lab
            + `<rect width="${W}" height="${HH}" fill="#000" opacity="${(de ? P.endDim.opacity : 0) * hold}"/>` + `<rect y="${clipY}" width="${W}" height="${HH}" fill="#000" opacity="0.4"/>`,
          // the clock says APPROX. while the latest documented event is an approximate time (e.g. "about 72.20 s")
          hud: FR.clock(ev.now, 1, { decimals: ev.now >= 73 ? 3 : 1, label: "TIME AFTER LIFTOFF" + (ev.last && ev.last.approx ? " · APPROX." : "") }) + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "reconstruction") + FR.source(H.text(P.source.text, ctx), 1, P.source.y) };
      };
      return { render, events: EV };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
