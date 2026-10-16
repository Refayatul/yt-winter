// Template: legacy-code. A bridge for shots that are still hand-written (V3 scenes.js / phase1 overrides).
// The shot runs unchanged from the legacy film, but the plan must say why (shot.manual.reason), and the
// validator counts it as manual intervention. Target: zero legacy shots.
(function (root) {
  const T = {
    id: "legacy-code", version: 1, provenance: ["archival", "document", "explanatory", "reconstruction"], minStates: 0, legacy: true,
    params: { type: "object", required: ["shot"], additionalProperties: false, properties: { shot: { type: "string", pattern: "^S[0-9]{2}$" } } },
    states: [],
    build(FR, shot, ctx) { const s = ctx.legacy(shot.params.shot); if (!s) throw new Error(`legacy shot ${shot.params.shot} not found`); return { render: s.render, legacyShot: s }; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
