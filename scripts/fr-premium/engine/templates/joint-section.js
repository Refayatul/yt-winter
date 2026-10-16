// Template: joint-section. Seal mechanics in a groove cross-section (FR.X.groove): the sealing face
// moves away over a documented time, rings of different temperatures recover at (labelled
// illustrative) rates, and gas passes only where a gap stays open. Generalises V3 S05 (prototype B).
// Scale must be declared: "schematic" requires a visible "not to scale" label; "declared-exaggeration"
// requires the factor on screen (ENGINEERING-VISUAL-SYSTEM.md); "true-scale" needs neither.
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "joint-section", version: 1, provenance: ["explanatory"], minStates: 2,
    params: { type: "object", required: ["panels", "gap", "scale", "chip", "source"], additionalProperties: false, properties: {
      scale: { type: "object", required: ["mode"], additionalProperties: false, properties: { mode: { enum: ["schematic", "declared-exaggeration", "true-scale"] }, factor: { type: "number", minimum: 1 } } },
      // evidence for the gap scale: the drawn gap / ring = squeeze x follow; the true gap / ring = gapMax / ringDiameter
      ringDiameter: S.claim, gapMax: S.claim,
      squeeze: { type: "number", minimum: 0, maximum: 0.6, "x-illustrative": true }, follow: { type: "number", minimum: 0, maximum: 1, "x-illustrative": true },
      panels: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", required: ["tint", "label", "temperature", "tauSec"], additionalProperties: false, properties: {
        tint: { enum: ["warm", "cold"] }, label: S.text, temperature: S.claim, tauSec: { type: "number", exclusiveMinimum: 0, "x-illustrative": true } } } },
      gap: { type: "object", required: ["duration", "startAt"], additionalProperties: false, properties: { duration: S.claim, startAt: S.timeRef } },
      gas: { type: "object", required: ["window"], additionalProperties: false, properties: { window: S.window2 } },
      frost: { type: "object", required: ["window"], additionalProperties: false, properties: { window: S.window2 } },
      gapLabel: { type: "object", required: ["text", "window", "to"], additionalProperties: false, properties: { text: S.text, window: S.window2, to: S.point } },
      chip: S.chip, source: S.source,
    } },
    states: ["face-moves", "warm-follows", "cold-lags", "gap-open", "gas-through"],
    // exaggeration actually drawn, from the claims (validator compares it with the declared factor)
    exaggeration: (params, claim) => { if (!params.ringDiameter || !params.gapMax) return null;
      const sq = params.squeeze == null ? 0.3 : params.squeeze, fo = params.follow == null ? 0.9 : params.follow;
      return (sq * fo) / (claim(params.gapMax).value / claim(params.ringDiameter).value); },
    build(FR, shot, ctx) {
      const P = shot.params; const { E, p, C, F, W, H: HH, X, text } = FR; const W2 = (w) => H.win(w, ctx);
      const t0 = ctx.time(P.gap.startAt), open = ctx.seconds(P.gap.duration); const gw = P.gas ? W2(P.gas.window) : null, fw = P.frost ? W2(P.frost.window) : null;
      const gl = P.gapLabel ? { ...P.gapLabel, w: W2(P.gapLabel.window) } : null;
      const boxes = [{ x: 0, y: 300, w: W, h: 470 }, { x: 0, y: 790, w: W, h: 470 }];
      const render = (t) => {
        const g = E.sine(p(t, t0, t0 + open)); const rel = t - t0; const gas = gw ? E.out(p(t, gw[0], gw[1])) : 0; const frost = fw ? E.inOut(p(t, fw[0], fw[1])) : 0;
        let svg = ""; const temps = []; let cold = null;
        P.panels.forEach((pn, i) => { const b = boxes[i]; const r = X.groove({ ...b, gap: g, tRel: rel, tau: pn.tauSec, tint: pn.tint, gas, ...(P.squeeze != null ? { squeeze: P.squeeze } : {}), ...(P.follow != null ? { follow: P.follow } : {}), ...(pn.tint === "cold" ? { frost } : {}) });
          svg += r.svg; if (pn.tint === "cold") cold = { r, b };
          temps.push(text(60, b.y + 140, H.text(pn.label, ctx), { size: 112, weight: 600, family: F.num, fill: pn.tint === "cold" ? C.cold : C.hot2, anchor: "start", extra: `paint-order="stroke" stroke="#000" stroke-width="6" stroke-opacity="0.5"` })); });
        if (P.panels.length > 1) svg += `<rect y="${boxes[0].y + boxes[0].h}" width="${W}" height="${boxes[1].y - boxes[0].y - boxes[0].h}" fill="${C.ink}"/>`;
        svg += temps.join("");
        if (gl && cold && !cold.r.sealed && cold.r.gapW > 10) svg += FR.callout(cold.r.gapX, cold.r.cy + cold.r.r * 1.1, gl.to[0], gl.to[1], H.text(String(gl.text).replace("{scale}", P.scale.factor != null ? String(P.scale.factor) : ""), ctx), p(t, gl.w[0], gl.w[1]), { size: 44, anchor: "middle" });
        svg += `<rect y="1270" width="${W}" height="${HH}" fill="#000" opacity="0.45"/>`;
        return { under: `<rect width="${W}" height="${HH}" fill="url(#steelGrad)"/><rect width="${W}" height="${HH}" fill="#0b1520" opacity="0.72"/>`, svg,
          hud: FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "explanatory") + FR.source(H.text(P.source.text, ctx), 1, P.source.y) };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
