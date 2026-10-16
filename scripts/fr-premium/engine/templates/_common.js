// Shared helpers and parameter-schema fragments for the template registry.
// Loaded in Node (schemas for the validator) and in the render page (builders, after fr-lib/fr-forensic).
//
// Parameter annotations read by the validator:
//   "x-onscreen": true   text shown on screen. Digits are only allowed via claim placeholders {C-...}.
//   "x-factual": true    a value that states a fact. It must be a "claim:C-..." reference, never a literal.
//   "x-anchor": true     an "asset:<key>#<anchor>" reference that must exist in assets.json.
//   "x-illustrative"     the parameter is illustrative; the shot's visible labels must say so.
(function (root) {
  const S = {
    timeRef: { type: "string", "x-time": true },
    anchor: { type: "string", pattern: "^asset:[a-z0-9-]+#[a-z0-9-]+$", "x-anchor": true },
    asset: { type: "string", pattern: "^asset:[a-z0-9-]+$" },
    claim: { type: "string", pattern: "^claim:C-[a-z0-9-]+$", "x-factual": true },
    text: { type: "string", "x-onscreen": true },
    point: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    rect: { type: "object", required: ["x", "y", "w", "h"], additionalProperties: false, properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: ["number", "string"] } } },
    window2: { type: "array", items: { type: "string", "x-time": true }, minItems: 2, maxItems: 2 },
    chip: { type: "object", required: ["label"], additionalProperties: false, properties: { label: { type: "string", "x-onscreen": true }, kind: { enum: ["archival", "document", "explanatory", "reconstruction"] } } },
    source: { type: "object", required: ["text", "y"], additionalProperties: false, properties: { text: { type: "string", "x-onscreen": true }, y: { type: "number" }, fadeWith: { enum: ["finding"] } } },
    shades: { type: "array", items: { type: "object", required: ["kind"], additionalProperties: false,
      properties: { kind: { enum: ["top", "bottom", "tint", "ink"] }, y: { type: "number" }, h: { type: "number" }, color: { type: "string", pattern: "^#[0-9a-f]{6}$" }, opacity: { type: "number", minimum: 0, maximum: 1 } } } },
  };
  S.cameraKeys = { type: "array", minItems: 1, items: { type: "object", required: ["at", "zoom"], additionalProperties: false,
    properties: { at: S.timeRef, focus: { oneOf: [S.point, S.anchor] }, zoom: { type: "number", exclusiveMinimum: 0 } } } };

  const H = {};
  // {C-x} -> claim display (or value); everything else is literal (HTML allowed: <br>)
  // {C-x} -> the claim's display text (or value); {C-x.value} -> its number. Everything else is literal (<br> allowed).
  H.text = (s, ctx) => String(s).replace(/\{(C-[a-z0-9-]+)(\.value)?\}/g, (_, id, v) => { const c = ctx.claim(id); return !v && c.display != null ? c.display : String(c.value); });
  H.shades = (FR, list = []) => list.map((d) => {
    const { W, H: HH, C } = FR; const y = d.y || 0, h = d.h == null ? HH - y : d.h;
    const op = d.opacity != null ? ` opacity="${d.opacity}"` : "";
    if (d.kind === "top") return `<rect width="${W}" height="${h}" fill="url(#topShade)"${op}/>`;
    if (d.kind === "bottom") return `<rect y="${y}" width="${W}" height="${h}" fill="url(#botShade)"${op}/>`;
    if (d.kind === "tint") return `<rect width="${W}" height="${HH}" fill="${d.color}" opacity="${d.opacity}"/>`;
    return `<rect y="${y}" width="${W}" height="${h}" fill="${d.color || C.ink}"${d.opacity != null ? ` opacity="${d.opacity}"` : ""}/>`;
  }).join("");
  // keyed camera on a photo (focus in source px, zoom), eased between consecutive keys like the V2 shots
  H.camAt = (keys, t, ease) => {
    if (t <= keys[0].t) return keys[0]; for (let i = 1; i < keys.length; i += 1) if (t <= keys[i].t) { const a = keys[i - 1], b = keys[i], k = ease((t - a.t) / Math.max(1e-6, b.t - a.t));
      return { fx: a.fx + (b.fx - a.fx) * k, fy: a.fy + (b.fy - a.fy) * k, z: a.z + (b.z - a.z) * k }; }
    return keys[keys.length - 1];
  };
  H.resolveKeys = (keys, ctx, assetKey) => { let last = null; return keys.map((k) => { const f = k.focus == null ? last : (typeof k.focus === "string" ? ctx.point(k.focus) : k.focus); last = f; return { t: ctx.time(k.at), fx: f[0], fy: f[1], z: k.zoom }; }); };
  H.headline = (FR, { kicker, text, y, size = 96 }, op, ctx) => op <= 0 ? "" : `<div style="position:absolute;left:60px;right:60px;top:${y}px;text-align:center;opacity:${op};text-shadow:0 3px 18px rgba(0,0,0,.9),0 0 3px #000">
    ${kicker ? `<div style="font:700 30px ${FR.F.sans};letter-spacing:5px;color:${FR.C.steel};margin-bottom:10px">${FR.esc(H.text(kicker, ctx))}</div>` : ""}
    <div style="font:800 ${size}px/1.02 ${FR.F.sans};letter-spacing:-1.5px;color:${FR.C.text}">${H.text(text, ctx)}</div></div>`;
  H.fadeWin = (FR, t, inW, outW) => (inW ? FR.p(t, inW[0], inW[1]) : 1) * (outW ? 1 - FR.p(t, outW[0], outW[1]) : 1);
  H.win = (w, ctx) => (w ? w.map((x) => ctx.time(x)) : null);

  const api = { S, H };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FR_TPL_COMMON = api;
})(typeof window !== "undefined" ? window : globalThis);
