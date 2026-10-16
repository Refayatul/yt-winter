// Template: archival-plate. An authentic photo or film clip with a keyed camera, optional evidence mark
// (ring + label on a measured anchor), headline, stat, kicker, time stamp, chip and source line.
// Generalises V2/V3 shots S01, S04, S08, S10, S11, S14.
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "archival-plate", version: 1, provenance: ["archival", "document"], minStates: 0,
    params: { type: "object", required: ["media", "camera", "chip"], additionalProperties: false, properties: {
      media: S.asset,
      box: S.rect,
      camera: { type: "object", required: ["keys"], additionalProperties: false, properties: {
        mode: { enum: ["cover", "crop"] }, ease: { enum: ["inOut", "sine", "in"] }, keys: S.cameraKeys } },
      clipStart: S.timeRef,
      filter: { enum: ["saturate(0.85)"] },
      under: { enum: ["ink"] },
      plate: { type: "object", required: ["blur", "dim"], additionalProperties: false, properties: { blur: { type: "number", minimum: 0 }, dim: { type: "number", minimum: 0, maximum: 1 } } },
      shades: S.shades,
      headline: { type: "object", required: ["text", "y"], additionalProperties: false, properties: {
        kicker: S.text, text: S.text, y: { type: "number" }, in: S.window2, out: S.window2 } },
      stat: { type: "object", required: ["value", "sub", "y", "in"], additionalProperties: false, properties: {
        value: S.text, sub: S.text, y: { type: "number" }, in: S.window2 } },
      mark: { type: "object", required: ["anchor", "radius", "in"], additionalProperties: false, properties: {
        anchor: S.anchor, radius: { type: "number", minimum: 10 }, in: S.window2, layer: { enum: ["svg", "hud"] }, pulse: { type: "boolean" }, outline: { type: "boolean" },
        label: { type: "object", required: ["lines", "in"], additionalProperties: false, properties: { lines: S.text, value: S.text, in: S.window2 } } } },
      kicker: { type: "object", required: ["text", "y"], additionalProperties: false, properties: { text: S.text, y: { type: "number" } } },
      stamp: { type: "object", required: ["label", "value"], additionalProperties: false, properties: { label: S.text, value: S.claim } },
      // running clock on archival film: mission time = clip source time + the film's documented time base (a claim)
      filmClock: { type: "object", required: ["label", "timeBase"], additionalProperties: false, properties: { label: S.text, timeBase: S.claim, decimals: { type: "integer", minimum: 0, maximum: 3 } } },
      chip: S.chip,
      source: S.source,
    } },
    states: ["camera-move", "mark-on", "label-on", "headline-on", "headline-off"],
    build(FR, shot, ctx) {
      const P = shot.params; const key = ctx.assetKey(P.media); const m = FR.media[key]; const isClip = !!m.dir;
      const sc = isClip ? 1 : m.scale; const { E, p, lerp, clamp, C, F, W, H: HH } = FR;
      const box0 = P.box || { x: 0, y: 0, w: W, h: HH }; const box = { ...box0, h: box0.h === "auto" ? box0.w * m.ih / m.iw : box0.h };
      const keys = H.resolveKeys(P.camera.keys, ctx); const ease = E[P.camera.ease || "inOut"];
      const clip0 = P.clipStart ? ctx.time(P.clipStart) : shot.start;
      const cropAt = (t) => { const c = H.camAt(keys, t, ease); const cw = m.iw / c.z, ch = cw * box.h / box.w;
        return { x: clamp(c.fx - cw / 2, 0, m.iw - cw), y: clamp(c.fy - ch / 2, 0, m.ih - ch), w: cw, h: ch }; };
      const layerAt = (t) => {
        if (isClip) return FR.clip(key, t - clip0, { box, ...(P.camera.mode === "crop" ? { crop: cropAt(t) } : {}) });
        const c = H.camAt(keys, t, ease); return FR.photo(key, { fx: c.fx * sc, fy: c.fy * sc, z: c.z, box, filter: P.filter || "" });
      };
      const screenOf = (anchorRef, t) => { const pt = ctx.point(anchorRef); const ly = layerAt(t); const s = FR.toScreen(ly.crop, ly.box, pt[0] * sc, pt[1] * sc); return s; };
      const W2 = (w) => H.win(w, ctx);
      const hw = P.headline ? { in: W2(P.headline.in), out: W2(P.headline.out) } : null;
      const st = P.stat ? W2(P.stat.in) : null; const mk = P.mark ? { in: W2(P.mark.in), lab: P.mark.label ? W2(P.mark.label.in) : null } : null;
      const render = (t) => {
        const ly = layerAt(t); // blurred full-bleed backing plate: a film frame, or the still itself
        const media = P.plate ? [FR.X.plate(isClip ? FR.clip(key, t - clip0, { box }) : FR.photo(key, { fx: m.iw / 2, fy: m.ih / 2, box }), P.plate), ly] : [ly];
        let svg = H.shades(FR, P.shades), hud = "";
        if (P.mark) { const s = screenOf(P.mark.anchor, t); const rk = p(t, mk.in[0], mk.in[1]);
          const r = P.mark.radius + (P.mark.pulse ? 3 * Math.sin((t - shot.start) * 6) : 0);
          const ring = (P.mark.outline ? FR.ring(s.x, s.y, r, rk, "#000", 15) + FR.ring(s.x, s.y, r, rk, C.hot2, 9) : FR.ring(s.x, s.y, r, rk));
          if (P.mark.layer === "hud") hud += `<svg style="position:absolute;left:0;top:0" width="${W}" height="${HH}">${ring}</svg>`; else svg += ring;
          if (P.mark.label) { const lk = p(t, mk.lab[0], mk.lab[1]);
            if (lk > 0) svg += `<line x1="${s.x - 64}" y1="${s.y - 58}" x2="${lerp(s.x - 64, 330, E.out(lk))}" y2="${lerp(s.y - 58, s.y - 200, E.out(lk))}" stroke="${C.hot2}" stroke-width="5" opacity="${lk}"/>`;
            hud += `<div style="position:absolute;left:60px;top:${s.y - 300}px;opacity:${lk};padding:12px 20px;border-radius:12px;background:rgba(6,9,13,.8);border:2px solid ${C.hot2};font:800 38px/1.18 ${F.sans};letter-spacing:1px;color:${C.text}">${H.text(P.mark.label.lines, ctx)}${P.mark.label.value ? `<div style="font:600 30px ${F.num};color:${C.hot2};margin-top:6px;letter-spacing:.5px">${FR.esc(H.text(P.mark.label.value, ctx))}</div>` : ""}</div>`; } }
        if (P.headline) hud += H.headline(FR, P.headline, H.fadeWin(FR, t, hw.in, hw.out), ctx);
        if (P.stat) { const k = p(t, st[0], st[1]);
          hud += `<div style="position:absolute;left:0;right:0;top:${P.stat.y}px;text-align:center;opacity:${k};transform:translateY(${(1 - E.out(k)) * 24}px);text-shadow:0 4px 24px rgba(0,0,0,.9)">
          <div style="font:600 220px/0.9 ${F.num};color:${C.cold}">${H.text(P.stat.value, ctx)}</div>
          <div style="font:700 38px/1.3 ${F.sans};color:${C.text};margin-top:44px">${H.text(P.stat.sub, ctx)}</div></div>`; }
        if (P.kicker) hud += `<div style="position:absolute;left:0;right:0;top:${P.kicker.y}px;text-align:center;font:700 28px ${F.sans};letter-spacing:4px;color:${C.steel}">${FR.esc(H.text(P.kicker.text, ctx))}</div>`;
        if (P.stamp) hud += FR.clock(ctx.value(P.stamp.value), 1, { label: H.text(P.stamp.label, ctx) });
        if (P.filmClock) { const tb = ctx.claim(P.filmClock.timeBase.slice(6)); const src = (isClip ? m.from || 0 : 0) + (t - clip0); // seconds into the source film
          hud += FR.clock(src + tb.value, 1, { label: H.text(P.filmClock.label, ctx) + (tb.approximate ? " · APPROX." : ""), decimals: P.filmClock.decimals == null ? 1 : P.filmClock.decimals }); }
        hud += FR.chip(H.text(P.chip.label, ctx), P.chip.kind || shot.provenance.kind);
        if (P.source) hud += FR.source(H.text(P.source.text, ctx), 1, P.source.y);
        return { under: P.under === "ink" ? `<rect width="${W}" height="${HH}" fill="${C.ink}"/>` : undefined, media, svg, hud };
      };
      return { render, api: { screenOf } };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
