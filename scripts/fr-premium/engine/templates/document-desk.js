// Template: document-desk. Authentic document scans lie on a desk; a document camera reads them in step
// with the narration (keys target points on a page in source px), highlights sweep measured page
// regions, a page can slide over another (cause and effect), a cited finding can be laid on top, and a
// timeline rail + time stamp follow the chronology. Several consecutive shots can share one desk
// (params.desk = "shared:<name>") so the camera and pages are continuous. Generalises V3 S12-S13 (D r3).
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const desk = { type: "object", required: ["pages", "camera"], additionalProperties: false, properties: {
    pages: { type: "array", minItems: 1, items: { type: "object", required: ["asset", "x", "y", "w"], additionalProperties: false, properties: {
      asset: S.asset, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, rot: { type: "number" },
      slideIn: { type: "object", required: ["window", "fromDy", "fromRot"], additionalProperties: false, properties: { window: S.window2, fromDy: { type: "number" }, fromRot: { type: "number" } } },
      dimBy: { type: "object", required: ["event", "amount"], additionalProperties: false, properties: { event: { enum: ["slide", "finding"] }, amount: { type: "number" } } },
      hideMarksWhenCovered: { type: "boolean" },
      marks: { type: "array", items: { type: "object", required: ["region", "window"], additionalProperties: false, properties: { region: S.anchor, window: S.window2, color: { enum: ["accent", "alert", "note"] } } } } } } },
    camera: { type: "array", minItems: 2, items: { type: "object", required: ["at", "zoom"], additionalProperties: false, properties: {
      at: S.timeRef, zoom: { type: "number", exclusiveMinimum: 0 }, page: S.asset, point: S.point, world: S.point } } },
    rail: { type: "object", required: ["ticks", "steps"], additionalProperties: false, properties: {
      ticks: { type: "array", minItems: 2, items: S.claim },
      steps: { type: "array", items: { type: "object", required: ["at", "lead", "lag"], additionalProperties: false, properties: { at: S.timeRef, lead: { type: "number" }, lag: { type: "number" } } } } } },
    finding: { type: "object", required: ["claim", "window", "highlight", "highlightAt"], additionalProperties: false, properties: {
      claim: { type: "string", pattern: "^claim:C-[a-z0-9-]+$" }, window: S.window2, highlight: { type: "string" }, highlightAt: S.timeRef } } } };
  const T = {
    id: "document-desk", version: 1, provenance: ["document"], minStates: 2,
    params: { type: "object", required: ["desk", "chip"], additionalProperties: false, properties: {
      desk: { oneOf: [{ type: "string", pattern: "^shared:[a-z0-9-]+$" }, desk] },
      enter: S.window2, chip: S.chip, source: S.source } },
    deskSchema: desk,
    states: ["camera-reads", "highlight", "page-slides-over", "finding-laid", "clock-advances"],
    build(FR, shot, ctx) {
      const P = shot.params; const D = typeof P.desk === "string" ? ctx.shared(P.desk.slice(7)) : P.desk; const { E, p, lerp, C, F, W, H: HH, X, esc } = FR;
      const W2 = (w) => H.win(w, ctx); const pages = D.pages.map((pg) => ({ ...pg, key: ctx.assetKey(pg.asset), sw: pg.slideIn ? W2(pg.slideIn.window) : null,
        marks: (pg.marks || []).map((mk) => ({ ...ctx.anchor(mk.region).rect, w2: W2(mk.window), color: mk.color })) }));
      const pagePt = (assetRef, pt) => { const pg = pages.find((x) => x.asset === assetRef); const m = FR.media[pg.key]; const iw = m.iw / m.scale, ih = m.ih / m.scale; const s = pg.w / iw;
        return { x: pg.x - pg.w / 2 + pt[0] * s, y: pg.y - (pg.w * ih / iw) / 2 + pt[1] * s }; };
      const keys = D.camera.map((k) => { const w = k.world ? { x: k.world[0], y: k.world[1] } : pagePt(k.page, k.point); return [ctx.time(k.at), { fx: w.x, fy: w.y, z: k.zoom }]; });
      const slide = pages.find((pg) => pg.sw); const fw = D.finding ? W2(D.finding.window) : null;
      const steps = D.rail ? D.rail.steps.map((s) => ({ t: ctx.time(s.at), lead: s.lead, lag: s.lag })) : [];
      const ticks = D.rail ? D.rail.ticks.map((c) => H.text(`{${c.slice(6)}}`, ctx)) : [];
      const railNow = (t) => { let now = 0; steps.forEach((s, i) => { if (t >= s.t - s.lead) now = lerp(i, i + 1, E.inOut(p(t, s.t - s.lead, s.t + s.lag))); }); return now; };
      const idx = (t) => steps.filter((s) => t >= s.t).length;
      const colors = { accent: C.hot2, alert: C.hot, note: "#9bc7ff" };
      const render = (t) => {
        const c = X.path(keys, t); const cam = { cx: c.fx, cy: c.fy, z: c.z };
        const sl = slide ? E.out(p(t, slide.sw[0], slide.sw[1])) : 0; const fin = fw ? E.out(p(t, fw[0], fw[1])) : 0;
        const docs = pages.map((pg) => { const dimK = pg.dimBy ? (pg.dimBy.event === "slide" ? sl : fin) * pg.dimBy.amount : 0;
          const marks = pg.hideMarksWhenCovered && sl > 0.05 ? [] : pg.marks.map((mk) => ({ x: mk.x, y: mk.y, w: mk.w, h: mk.h, k: p(t, mk.w2[0], mk.w2[1]), ...(mk.color && mk.color !== "accent" ? { color: colors[mk.color] } : {}) }));
          if (pg.sw) return { key: pg.key, x: pg.x, y: lerp(pg.y + pg.slideIn.fromDy, pg.y, sl), w: pg.w, rot: lerp(pg.slideIn.fromRot, pg.rot || 0, sl), op: sl > 0 ? 1 : 0, dim: dimK, marks };
          return { key: pg.key, x: pg.x, y: pg.y, w: pg.w, rot: pg.rot || 0, dim: dimK, marks }; });
        const d = X.desk(docs, cam);
        const clip = !D.finding || fin <= 0 ? "" : (() => { const cl = ctx.claim(D.finding.claim.slice(6)); const [l1, l2] = String(cl.display).split("|"); const hk = p(t, ctx.time(D.finding.highlightAt) - 0.05, ctx.time(D.finding.highlightAt) + 0.3); const y = lerp(1000, 960, fin);
          const cite = ctx.source(cl.source).title.replace(/^Rogers Commission Report, Vol\. 1, Ch\. [IVX]+:.*$/, "Rogers Commission, Vol. 1") + (cl.locator ? `, ${cl.locator.replace(/^Ch\. [IVX]+ /, "")}` : "");
          return `<g opacity="${fin}" transform="translate(540 ${y}) rotate(-1)"><rect x="-430" y="-150" width="860" height="300" fill="#f6f1e6" filter="url(#soft)"/>
        <rect x="-86" y="-2" width="${262 * E.out(hk)}" height="54" fill="${C.red}" opacity="0.38"/>
        <text x="0" y="-52" font-family="${F.serif}" font-weight="700" font-size="56" fill="#15181d" text-anchor="middle">“${esc(l1)}</text>
        <text x="0" y="40" font-family="${F.serif}" font-weight="700" font-size="56" fill="#15181d" text-anchor="middle">${esc(l2 || "")}”</text>
        <text x="0" y="118" font-family="${F.sans}" font-weight="600" font-size="24" fill="#4a4740" text-anchor="middle">${esc(cite)}</text></g>`; })();
        const k = P.enter ? E.inOut(p(t, ctx.time(P.enter[0]), ctx.time(P.enter[1]))) : 1;
        const top = `<rect y="1250" width="${W}" height="${HH - 1250}" fill="url(#botShade)"/><rect y="1300" width="${W}" height="${HH - 1300}" fill="#000" opacity="0.55"/><rect width="${W}" height="440" fill="url(#topShade)"/>`
          + (D.rail ? `<rect x="350" y="312" width="600" height="66" rx="33" fill="#06090d" opacity="${0.78 * k}"/>` + X.rail(ticks.map((_, i) => ({ at: i })), railNow(t), { y: 345, x0: 390, x1: 910, op: k }) : "");
        const src = P.source ? FR.source(H.text(P.source.text, ctx), P.source.fadeWith === "finding" ? 1 - E.inOut(p(t, fw[0], fw[1])) : k, P.source.y) : "";
        return { under: `<rect width="${W}" height="${HH}" fill="#17130f"/><rect width="${W}" height="${HH}" fill="url(#vig)"/>`, media: d.media,
          svg: d.svg + clip + top, hud: (D.rail ? X.stamp("", ticks[Math.min(ticks.length - 1, idx(t))], k, { size: 64 }) : "") + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "document", k) + src };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
