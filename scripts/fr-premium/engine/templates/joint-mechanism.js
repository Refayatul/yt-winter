// Template: joint-mechanism. A seal joint drawn from a technical drawing's measured geometry
// (FR.X.jointSection): the joint opens over a documented time, the rings recover at an (illustrative)
// rate, and hot gas flows down the gap past any ring that has not kept up. The gap is scaled from
// evidence: ring diameter and maximum gap are claims, and the on-screen gap is that ratio times a
// declared exaggeration factor, which must be shown (placeholder "{scale}" -> "8").
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "joint-mechanism", version: 1, provenance: ["explanatory"], minStates: 2,
    params: { type: "object", required: ["drawing", "geometry", "view", "ringDiameter", "gapMax", "scale", "open", "recovery", "chip", "source"], additionalProperties: false, properties: {
      drawing: S.asset,
      geometry: { type: "object", required: ["tang", "innerLeg", "rings", "ringSize"], additionalProperties: false, properties: {
        tang: S.anchor, innerLeg: S.anchor, outerLeg: S.anchor, pin: S.anchor, rings: { type: "array", minItems: 1, maxItems: 3, items: S.anchor }, ringSize: S.anchor } },
      view: { type: "object", required: ["region", "box"], additionalProperties: false, properties: { region: S.rect, box: S.rect } },
      ringDiameter: S.claim, gapMax: S.claim,
      scale: { type: "object", required: ["mode", "factor"], additionalProperties: false, properties: { mode: { const: "declared-exaggeration" }, factor: { type: "number", minimum: 1 } } },
      open: { type: "object", required: ["startAt", "duration"], additionalProperties: false, properties: { startAt: S.timeRef, duration: S.claim } },
      recovery: { type: "object", required: ["tauSec", "squeeze"], additionalProperties: false, properties: {
        temperature: S.claim, tauSec: { type: "number", exclusiveMinimum: 0, "x-illustrative": true }, squeeze: { type: "number", minimum: 0, maximum: 0.6, "x-illustrative": true } } },
      // gas: main flow window; leadIn = earlier, weaker blow-by (e.g. right after the joint opens), as a fraction of full flow
      gas: { type: "object", required: ["window"], additionalProperties: false, properties: { window: S.window2, leadIn: { type: "object", required: ["from", "level"], additionalProperties: false, properties: { from: S.timeRef, level: { type: "number", minimum: 0, maximum: 1 } } } } },
      // the drawing itself, registered under the model (same region -> box mapping), dissolving into it
      fromDrawing: { type: "object", required: ["window"], additionalProperties: false, properties: { window: S.window2 } },
      push: { type: "object", required: ["window", "zoom"], additionalProperties: false, properties: { window: S.window2, zoom: { type: "number", minimum: 1, maximum: 1.3 } } },
      labels: { type: "array", maxItems: 6, items: { type: "object", required: ["text", "target", "window", "to"], additionalProperties: false, properties: {
        text: S.text, target: { enum: ["ring0", "ring1", "gap", "gas"] }, window: S.window2, to: S.point } } },
      lightDeg: { type: "number" },
      chip: S.chip, source: S.source,
    } },
    states: ["joint-opens", "rings-lag", "gas-through"],
    // the exaggeration actually drawn (validator checks it equals the declared factor shown on screen)
    exaggeration: (params) => params.scale.factor,
    build(FR, shot, ctx) {
      const P = shot.params; const { E, p, W, H: HH } = FR; const W2 = (w) => H.win(w, ctx);
      const rect = (ref) => ctx.anchor(ref).rect; const ringPx = ctx.anchor(P.geometry.ringSize).lengthPx;
      const geom = { tang: rect(P.geometry.tang), innerLeg: rect(P.geometry.innerLeg), outerLeg: P.geometry.outerLeg ? rect(P.geometry.outerLeg) : null, pin: P.geometry.pin ? rect(P.geometry.pin) : null,
        rings: P.geometry.rings.map((r) => ctx.point(r)), ringPx };
      const gapDrawPx = (ctx.value(P.gapMax) / ctx.value(P.ringDiameter)) * ringPx * P.scale.factor; // evidence ratio x declared factor
      const t0 = ctx.time(P.open.startAt), dur = ctx.seconds(P.open.duration); const gw = P.gas ? W2(P.gas.window) : null; const gl = P.gas && P.gas.leadIn ? { t: ctx.time(P.gas.leadIn.from), level: P.gas.leadIn.level } : null; const fd = P.fromDrawing ? W2(P.fromDrawing.window) : null; const dkey = ctx.assetKey(P.drawing); const pw = P.push ? W2(P.push.window) : null;
      const labels = (P.labels || []).map((l) => ({ ...l, w: W2(l.window), text: H.text(String(l.text).replace("{scale}", String(P.scale.factor)), ctx) }));
      const view = { region: P.view.region, box: { ...P.view.box } };
      const render = (t) => {
        const g = E.sine(p(t, t0, t0 + dur)); const rel = Math.max(0, t - t0);
        const rec = geom.rings.map(() => 1 - Math.exp(-rel / P.recovery.tauSec));
        const full = gw ? E.out(p(t, gw[0], gw[1])) : 0; const lead = gl ? E.out(p(t, gl.t, gl.t + 0.6)) * gl.level : 0;
        const reach = Math.max(full, gl ? E.out(p(t, gl.t, gl.t + 0.6)) : 0); const gasLevel = Math.max(lead, full); // reach = how far the gas got; level = how strong
        const z = pw ? 1 + (P.push.zoom - 1) * E.inOut(p(t, pw[0], pw[1])) : 1;
        // combustion pressure rises with the opening (Commission: the gap "opens as the combustion gas pressure rises")
        const pressure = E.out(p(t, t0 - 0.1, t0 + dur * 0.6));
        const js = FR.X.jointSection({ geom, view, gapPx: gapDrawPx * g, rec, squeeze: P.recovery.squeeze, gas: reach, gasLevel, pressure, t, lightDeg: P.lightDeg == null ? -135 : P.lightDeg, uid: "jm" + shot.id });
        const anchorOf = (tg) => tg === "ring0" ? { x: js.rings[0].left - 6, y: js.rings[0].y } : tg === "ring1" ? { x: js.rings[1].left - 6, y: js.rings[1].y } : tg === "gap" ? js.gap : { x: js.gap.x, y: js.gap.y - 60 };
        const lab = labels.map((l) => { const a = anchorOf(l.target); return FR.callout(a.x, a.y, l.to[0], l.to[1], l.text, p(t, l.w[0], l.w[0] + 0.3) * (1 - p(t, l.w[1], l.w[1] + 0.3)), { size: 36, anchor: l.to[0] < 540 ? "start" : "end" }); }).join(""); // window = [show, hide]
        const zg = z !== 1 ? `transform="translate(540 820) scale(${z.toFixed(4)}) translate(-540 -820)"` : "";
        const dm = FR.media[dkey]; const R = view.region; const drawing = fd && t < fd[1] ? [FR.photo(dkey, { crop: { x: R.x * dm.scale, y: R.y * dm.scale, w: R.w * dm.scale, h: R.h * dm.scale }, box: view.box, opacity: 1 - E.inOut(p(t, fd[0], fd[1])), filter: "contrast(1.05)" })] : [];
        const mk = fd ? E.inOut(p(t, fd[0], fd[1])) : 1; // the model fades in over the registered drawing
        return { under: `<rect width="${W}" height="${HH}" fill="#090c11"/>`, media: drawing, svg: `<g opacity="${mk}" ${zg}>${js.svg}</g>` + lab + `<rect y="1300" width="${W}" height="${HH}" fill="#000" opacity="0.5"/>`,
          hud: FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "explanatory") + FR.source(H.text(String(P.source.text).replace("{scale}", String(P.scale.factor)), ctx), 1, P.source.y) };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
