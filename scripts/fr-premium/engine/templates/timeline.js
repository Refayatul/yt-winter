// Template: timeline. A chronology on its own: rail + time stamp over a dark ground or a dimmed photo,
// advancing on narration anchors. Every tick is a claim (its display is shown). Not used by Challenger
// V3 (its timeline lives inside the document desk); covered by tests.
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "timeline", version: 1, provenance: ["document", "explanatory"], minStates: 2,
    params: { type: "object", required: ["ticks", "steps", "chip"], additionalProperties: false, properties: {
      ticks: { type: "array", minItems: 2, items: S.claim },
      steps: { type: "array", minItems: 1, items: { type: "object", required: ["at"], additionalProperties: false, properties: { at: S.timeRef } } },
      ground: { enum: ["ink", "photo"] }, media: S.asset, chip: S.chip, source: S.source,
      // hero: the current documented time large and centred (phone-first), the rail under it shows the progression
      hero: { type: "boolean" }, groundGrade: { enum: ["dim", "soft"] } } },
    states: ["clock-advances"],
    build(FR, shot, ctx) {
      const P = shot.params; const { E, p, lerp, C, W, H: HH, X } = FR;
      const ticks = P.ticks.map((c) => H.text(`{${c.slice(6)}}`, ctx)); const steps = P.steps.map((s) => ctx.time(s.at));
      const render = (t) => { let now = 0; steps.forEach((s, i) => { if (t >= s - 0.1) now = lerp(i, i + 1, E.inOut(p(t, s - 0.1, s + 0.4))); });
        const idx = steps.filter((s) => t >= s).length;
        const media = P.ground === "photo" && P.media ? [FR.photo(ctx.assetKey(P.media), { fx: FR.media[ctx.assetKey(P.media)].iw / 2, fy: FR.media[ctx.assetKey(P.media)].ih / 2, z: P.groundGrade === "soft" ? 1.08 : 1, filter: P.groundGrade === "soft" ? "blur(10px) brightness(0.3)" : "brightness(0.4)" })] : [];
        // step i advances the clock from tick i to tick i + 1
        const cur = Math.min(ticks.length - 1, idx); const split = (v) => { const m = /^(.*?)\s+([A-Za-z.]+)$/.exec(v); return m ? [m[1], m[2]] : [v, ""]; };
        const hero = () => { const k = cur > 0 ? E.out(p(t, steps[cur - 1] - 0.1, steps[cur - 1] + 0.35)) : E.out(p(t, shot.start, shot.start + 0.4)); const [v, u] = split(ticks[cur]);
          return `<div style="position:absolute;left:0;right:0;top:560px;text-align:center"><div style="opacity:${0.35 + 0.65 * k};transform:translateY(${(1 - k) * 30}px);font:600 168px/1 ${FR.F.num};color:${C.text};letter-spacing:2px">${FR.esc(v)}</div>${u ? `<div style="font:800 40px ${FR.F.sans};letter-spacing:6px;color:${C.steel};margin-top:22px;text-transform:uppercase">${FR.esc(u)}</div>` : ""}</div>`; };
        return { under: `<rect width="${W}" height="${HH}" fill="${C.ink}"/>`, media, svg: P.hero ? X.rail(ticks.map((_, i) => ({ at: i, label: "" })), now, { y: 1000, x0: 140, x1: 940 }) : X.rail(ticks.map((_, i) => ({ at: i, label: ticks[i] })), now, { y: 860, x0: 160, x1: 920 }),
          hud: (P.hero ? hero() : X.stamp("", ticks[Math.min(ticks.length - 1, idx)], 1, { size: 64 })) + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || shot.provenance.kind) + (P.source ? FR.source(H.text(P.source.text, ctx), 1, P.source.y) : "") }; };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
