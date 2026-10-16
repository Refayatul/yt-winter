// Template: document-zoom. An authentic document (e.g. a technical drawing) grows out of a registered
// anchor on the previous shot: it starts at the screen point and scale where that anchor was, then a crop
// camera moves through declared crops (source px, e.g. whole drawing -> detail). Rings and highlight
// sweeps mark measured anchors on the document; the previous shot's picture stays underneath, dimmed.
// Generalises V3 S03 (prototype A).
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const crop = { type: "object", required: ["x", "y", "w", "h"], additionalProperties: false, properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } };
  const T = {
    id: "document-zoom", version: 1, provenance: ["document"], minStates: 2,
    params: { type: "object", required: ["media", "box", "register", "crops", "chip"], additionalProperties: false, properties: {
      media: S.asset, box: S.rect,
      register: { type: "object", required: ["fromShot", "fromAnchor", "toAnchor", "at", "startScale"], additionalProperties: false, properties: {
        fromShot: { type: "string", pattern: "^S[0-9]{2}$" }, fromAnchor: S.anchor, toAnchor: S.anchor, at: S.timeRef, startScale: { type: "number", exclusiveMinimum: 0 } } },
      crops: { type: "array", minItems: 1, items: { type: "object", required: ["at", "rect"], additionalProperties: false, properties: { at: S.timeRef, rect: crop, ease: { enum: ["out", "inOut"] } } } },
      ground: { type: "object", required: ["fromShot", "at", "opacity"], additionalProperties: false, properties: { fromShot: { type: "string" }, at: S.timeRef, opacity: { type: "number" }, grade: { enum: ["dim"] } } },
      rings: { type: "array", items: { type: "object", required: ["anchor", "radiusPx", "window"], additionalProperties: false, properties: { anchor: S.anchor, radiusPx: { type: "number" }, window: S.window2 } } },
      highlights: { type: "array", items: { type: "object", required: ["anchor", "window"], additionalProperties: false, properties: { anchor: S.anchor, window: S.window2 } } },
      enter: S.window2, shades: S.shades, chip: S.chip, source: S.source,
    } },
    states: ["grows-from-anchor", "camera-to-detail", "marks"],
    build(FR, shot, ctx) {
      const P = shot.params; const key = ctx.assetKey(P.media); const m = FR.media[key]; const sc = m.scale; const { E, p, lerp, clamp, C, W, H: HH } = FR; const W2 = (w) => H.win(w, ctx);
      const bx = P.box; const R = P.register; const prev = ctx.shotApi(R.fromShot);
      const anc = prev.screenOf(R.fromAnchor, ctx.time(R.at)); const to = ctx.point(R.toAnchor); const s0 = R.startScale;
      const c0 = { x: to[0] - (anc.x - bx.x) / s0, y: to[1] - (anc.y - bx.y) / s0, w: bx.w / s0, h: bx.h / s0 };
      const keys = [{ t: shot.start, c: c0 }, ...P.crops.map((k) => ({ t: ctx.time(k.at), c: k.rect, ease: k.ease || "inOut" }))];
      const mixc = (a, b, k) => { const lw = Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)); return { x: lerp(a.x + a.w / 2, b.x + b.w / 2, k) - lw / 2, y: lerp(a.y + a.h / 2, b.y + b.h / 2, k) - lw * bx.h / bx.w / 2, w: lw, h: lw * bx.h / bx.w }; };
      const cropAt = (t) => { if (t <= keys[0].t) return keys[0].c; for (let i = 1; i < keys.length; i += 1) if (t <= keys[i].t) { const a = keys[i - 1], b = keys[i]; return mixc(a.c, b.c, E[b.ease](p(t, a.t, b.t))); } return keys[keys.length - 1].c; };
      const gr = P.ground ? (() => { const api = ctx.shotApi(P.ground.fromShot); return api.layerAt ? api.layerAt(ctx.time(P.ground.at), P.ground.opacity, "saturate(0.4) brightness(0.55)") : null; })() : null;
      const rings = (P.rings || []).map((r) => ({ ...r, w: W2(r.window) })), hls = (P.highlights || []).map((h) => ({ ...h, w: W2(h.window) })); const ew = P.enter ? W2(P.enter) : null;
      const render = (t) => {
        const cr = cropAt(t); const ph = FR.photo(key, { crop: { x: cr.x * sc, y: cr.y * sc, w: cr.w * sc, h: cr.h * sc }, box: bx, filter: "contrast(1.05)" });
        const map = (x, y) => ({ x: bx.x + (x - cr.x) * bx.w / cr.w, y: bx.y + (y - cr.y) * bx.h / cr.h }); const ss = bx.w / cr.w;
        const hl = hls.map((h) => { const k = p(t, h.w[0], h.w[1]); if (k <= 0) return ""; const r = ctx.anchor(h.anchor).rect; const a = map(r.x, r.y);
          return `<rect x="${a.x - 4}" y="${a.y - 3}" width="${(r.w * ss + 8) * E.out(clamp(k))}" height="${r.h * ss + 6}" fill="${C.hot2}" opacity="0.42"/>`; }).join("");
        const rg = rings.map((r) => { const q = map(...ctx.point(r.anchor)); return FR.ring(q.x, q.y, r.radiusPx * ss, p(t, r.w[0], r.w[1]), C.hot, 6); }).join("");
        const op = ew ? E.inOut(p(t, ew[0], ew[1])) : 1;
        return { under: `<rect width="${W}" height="${HH}" fill="${C.ink}"/>`, svg: H.shades(FR, P.shades), media: gr ? [gr, ph] : [ph],
          hud: `<svg style="position:absolute;left:0;top:0" width="${W}" height="${HH}">${hl}
            ${rg}</svg>` + (P.source ? FR.source(H.text(P.source.text, ctx), op, P.source.y) : "") + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "document", op) };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
