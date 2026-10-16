// Template: trace-over-photo. The camera stays on an authentic photo; line work is traced over it at
// measured anchors (each path cites the anchor it traces and must lie inside it), a band marks the
// point of interest, callouts name parts, and the photo dims as the camera pushes in for a hand-off.
// Generalises V3 S02 (prototype A).
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "trace-over-photo", version: 1, provenance: ["explanatory"], minStates: 2,
    params: { type: "object", required: ["media", "camera", "paths", "chip"], additionalProperties: false, properties: {
      media: S.asset,
      camera: { type: "object", required: ["keys"], additionalProperties: false, properties: { keys: S.cameraKeys, zoomInterp: { enum: ["linear", "log"] } } },
      box: S.rect,
      reveal: { type: "object", required: ["fromH", "window"], additionalProperties: false, properties: { fromH: { type: "number" }, window: S.window2 } },
      grade: { type: "object", required: ["window", "saturate", "brightness"], additionalProperties: false, properties: { window: S.window2, saturate: { type: "number" }, brightness: { type: "number" } } },
      fadeOut: { type: "object", required: ["window", "to"], additionalProperties: false, properties: { window: S.window2, to: { type: "number", minimum: 0, maximum: 1 } } },
      paths: { type: "array", minItems: 1, items: { type: "object", required: ["basis", "points", "window"], additionalProperties: false, properties: {
        basis: S.anchor, points: { type: "array", minItems: 2, items: S.point }, window: S.window2,
        color: { enum: ["line", "accent"] }, width: { type: "number", minimum: 1 }, dash: { type: "string", pattern: "^[0-9]+ [0-9]+$" } } } },
      marks: { type: "array", items: { type: "object", required: ["anchor", "radius"], additionalProperties: false, properties: { anchor: S.anchor, radius: { type: "number" } } } },
      callouts: { type: "array", items: { type: "object", required: ["from", "label", "window", "to"], additionalProperties: false, properties: {
        from: { type: "object", required: ["basis", "point"], additionalProperties: false, properties: { basis: S.anchor, point: S.point } },
        to: { type: "object", required: ["x"], additionalProperties: false, properties: { x: { type: "number" }, dy: { type: "number" }, minY: { type: "number" }, maxY: { type: "number" } } },
        label: S.text, window: S.window2, size: { type: "number", minimum: 24 } } } },
      shades: S.shades,
      chip: S.chip,
    } },
    states: ["trace-draws", "band-lights", "callout", "push-in"],
    build(FR, shot, ctx) {
      const P = shot.params; const key = ctx.assetKey(P.media); const m = FR.media[key]; const sc = m.scale;
      const { E, p, lerp, C, W, H: HH, X } = FR; const box0 = P.box || { x: 0, y: 0, w: W, h: 1400 };
      const keys = H.resolveKeys(P.camera.keys, ctx); const W2 = (w) => H.win(w, ctx);
      const rv = P.reveal ? { from: P.reveal.fromH, w: W2(P.reveal.window) } : null, gr = P.grade ? { ...P.grade, w: W2(P.grade.window) } : null, fo = P.fadeOut ? { ...P.fadeOut, w: W2(P.fadeOut.window) } : null;
      const cam = (t) => { const ks = keys; if (t <= ks[0].t) return ks[0];
        for (let i = 1; i < ks.length; i += 1) if (t <= ks[i].t) { const a = ks[i - 1], b = ks[i], k = E.inOut((t - a.t) / Math.max(1e-6, b.t - a.t));
          const z = P.camera.zoomInterp === "log" ? Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) : lerp(a.z, b.z, k);
          return { fx: lerp(a.fx, b.fx, k), fy: lerp(a.fy, b.fy, k), z }; }
        return ks[ks.length - 1]; };
      const revealH = (t) => (rv ? lerp(rv.from, HH, E.inOut(p(t, rv.w[0], rv.w[1]))) : box0.h);
      const layerAt = (t, op = 1, filter = "") => { const c = cam(t); const ph = FR.photo(key, { fx: c.fx * sc, fy: c.fy * sc, z: c.z, box: box0, opacity: op, filter });
        const bh = revealH(t), s = ph.box.w / ph.crop.w; return { ...ph, box: { ...ph.box, h: bh }, crop: { ...ph.crop, h: Math.min(m.ih - ph.crop.y, ph.crop.h + (bh - box0.h) / s) } }; };
      const screenOf = (anchorRef, t, pt) => { const q = pt || ctx.point(anchorRef); const ly = layerAt(t); return FR.toScreen(ly.crop, ly.box, q[0] * sc, q[1] * sc); };
      const paths = P.paths.map((pa) => ({ ...pa, w: W2(pa.window) })); const calls = (P.callouts || []).map((c) => ({ ...c, w: W2(c.window) }));
      const render = (t) => {
        const g = gr ? E.inOut(p(t, gr.w[0], gr.w[1])) : 0; const out = fo ? E.inOut(p(t, fo.w[0], fo.w[1])) : 0;
        const ph = layerAt(t, 1 - (fo ? (1 - fo.to) * out : 0), gr ? `saturate(${1 - (1 - gr.saturate) * g}) brightness(${1 - (1 - gr.brightness) * g})` : "");
        const map = (x, y) => FR.toScreen(ph.crop, ph.box, x * sc, y * sc);
        let svg = H.shades(FR, P.shades) + (rv ? `<rect y="${revealH(t)}" width="${W}" height="${HH}" fill="${C.ink}"/>` : "");
        for (const pa of paths) { const k = p(t, pa.w[0], pa.w[1]);
          svg += X.trace([{ d: pa.points, color: pa.color === "accent" ? C.hot2 : "#e8eef5", w: pa.width || 5, ...(pa.dash ? { dash: pa.dash } : {}) }], map, k); }
        for (const mk of P.marks || []) { const s = map(...ctx.point(mk.anchor)); svg += `<g opacity="${1 - out}">${FR.ring(s.x, s.y, mk.radius, 1)}</g>`; }
        for (const c of calls) { const a = map(...c.from.point); const ty = c.to.dy != null ? a.y + c.to.dy : a.y; const y = Math.min(c.to.maxY == null ? Infinity : c.to.maxY, Math.max(c.to.minY == null ? -Infinity : c.to.minY, ty));
          svg += FR.callout(a.x, a.y, c.to.x, y, H.text(c.label, ctx), p(t, c.w[0], c.w[1]) * (1 - out), { size: c.size || 40, anchor: "start" }); }
        return { under: `<rect width="${W}" height="${HH}" fill="${C.ink}"/>`, media: [ph], svg, hud: FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "explanatory") };
      };
      return { render, api: { screenOf, layerAt } };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
