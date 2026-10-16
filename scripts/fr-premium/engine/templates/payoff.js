// Template: payoff. The closing lines over an authentic photo, with the camera returning to the
// film's opening framing so the loop lands on frame 0. Generalises V3 S15.
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "payoff", version: 1, provenance: ["archival"], minStates: 0,
    params: { type: "object", required: ["media", "camera", "lines", "chip"], additionalProperties: false, properties: {
      media: S.asset, box: S.rect,
      camera: { type: "object", required: ["keys"], additionalProperties: false, properties: { keys: S.cameraKeys } },
      lines: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", required: ["text", "tier"], additionalProperties: false, properties: {
        text: S.text, tier: { enum: ["setup", "payoff"] }, in: { type: "number", minimum: 0 } } } },
      y: { type: "number" }, fadeOut: { type: "number", minimum: 0 }, dim: { type: "number", minimum: 0, maximum: 1 },
      shades: S.shades, chip: S.chip,
    } },
    states: ["return-to-frame-0", "payoff-line"],
    build(FR, shot, ctx) {
      const P = shot.params; const key = ctx.assetKey(P.media); const m = FR.media[key]; const { E, p, C, F, W, H: HH } = FR;
      const box = P.box || { x: 0, y: 0, w: W, h: HH }; const keys = H.resolveKeys(P.camera.keys, ctx);
      const render = (t) => { const c = H.camAt(keys, t, E.inOut); const ph = FR.photo(key, { fx: c.fx * m.scale, fy: c.fy * m.scale, z: c.z, box });
        const out = 1 - p(t, shot.end - (P.fadeOut || 0.35), shot.end - 0.02);
        const lines = P.lines.map((l, i) => l.tier === "setup"
          ? `<div style="font:800 64px/1.1 ${F.sans};color:rgba(245,242,236,.55)">${H.text(l.text, ctx)}</div>`
          : `<div style="font:800 76px/1.08 ${F.sans};letter-spacing:-1px;color:${C.hot2};margin-top:26px;opacity:${p(t, shot.start, shot.start + (l.in || 0.35))}">${H.text(l.text, ctx)}</div>`).join("\n            ");
        return { under: `<rect width="${W}" height="${HH}" fill="${C.ink}"/>`, media: [ph],
          svg: `<rect width="${W}" height="${HH}" fill="#000" opacity="${(P.dim || 0) * out}"/>` + H.shades(FR, P.shades),
          hud: `<div style="position:absolute;left:60px;right:60px;top:${P.y || 330}px;text-align:center;opacity:${out};text-shadow:0 3px 18px rgba(0,0,0,.9)">
            ${lines}</div>` + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "archival") };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
