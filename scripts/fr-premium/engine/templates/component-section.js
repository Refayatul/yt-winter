// Template: component-section. A cutaway of one mechanical or electrical system (heaters, switches,
// valves, wiring, tanks, pressure systems) whose documented states change in step with the narration.
//
// Two modes, never mixed:
//  - "conceptual": the parts and how they connect come from claim passages (component-extract.js);
//    no passage gives geometry, so the layout is a neutral schematic computed here from the topology,
//    and the scene must show a visible "conceptual" disclosure and "not to scale".
//  - "measured": every part is drawn on a VERIFIED anchor (role mechanism-part) of a drawing asset;
//    suggested anchors are never accepted (validator).
// The scene is shared by consecutive shots ("shared:<name>") so the camera travels over one model.
// Materials: layered conductors (copper core, insulation sheath), brushed metal tube, switch housing.
// States: on (current flows), rated / threshold (value tags), stuck-closed (the contact never opens;
// the intended opening is a dashed ghost), hot (heat tint and glow), damaged (the sheath chars and
// cracks), pressure-loss (vessel outline breaks). Nothing is drawn that no state or part claim supports.
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const KINDS = ["supply", "switch", "heater", "insulation", "wire", "motor", "vessel", "valve", "sensor", "seal"];
  const scene = { type: "object", required: ["mode", "disclosure", "scale", "parts", "links", "states", "camera"], additionalProperties: false, properties: {
    mode: { enum: ["conceptual", "measured"] }, disclosure: S.text, drawing: S.asset,
    scale: { type: "object", required: ["mode"], additionalProperties: false, properties: { mode: { enum: ["schematic", "true-scale"] } } },
    parts: { type: "array", minItems: 1, items: { type: "object", required: ["id", "kind", "label", "claim"], additionalProperties: false, properties: {
      id: { type: "string", pattern: "^[a-z0-9-]+$" }, kind: { enum: KINDS }, label: S.text, claim: S.claim, layerOf: { type: "string" }, anchor: S.anchor } } },
    links: { type: "array", items: { type: "object", required: ["from", "to", "kind", "claim"], additionalProperties: false, properties: {
      from: { type: "string" }, to: { type: "string" }, kind: { enum: ["powered-by", "in-series", "mounted-on", "near", "rated-for", "layer-of", "inside"] }, claim: S.claim } } },
    states: { type: "array", minItems: 1, items: { type: "object", required: ["part", "state", "at", "claim"], additionalProperties: false, properties: {
      part: { type: "string" }, state: { enum: ["on", "rated", "threshold", "stuck-closed", "hot", "damaged", "pressure-loss"] }, at: S.timeRef, claim: S.claim, value: S.claim, tag: S.text } } },
    camera: { type: "array", minItems: 1, items: { type: "object", required: ["at", "focus"], additionalProperties: false, properties: {
      at: S.timeRef, focus: { type: "array", minItems: 1, items: { type: "string" } }, zoom: { type: "number", minimum: 1, maximum: 2.4 } } } },
    span: S.window2,
    stamps: { type: "array", items: { type: "object", required: ["value", "window"], additionalProperties: false, properties: { value: S.text, window: S.window2 } } },
    // archival plates shown before the model (unmarked, unregistered): kind says what the image is
    archival: { type: "array", items: { type: "object", required: ["asset", "kind", "label", "window"], additionalProperties: false, properties: {
      asset: S.asset, kind: { enum: ["historical-photo", "historical-drawing", "historical-footage", "test-imagery"] }, label: S.text, window: S.window2 } } },
    // one bar per quantity: fill and marks are claim values (proportional; no other numbers drawn)
    meters: { type: "array", items: { type: "object", required: ["quantity", "entries"], additionalProperties: false, properties: {
      quantity: { enum: ["voltage", "temperature", "pressure"] }, entries: { type: "array", minItems: 1, items: { type: "object", required: ["role", "at", "value", "tag"], additionalProperties: false, properties: {
        role: { enum: ["fill", "mark"] }, at: S.timeRef, value: S.claim, tag: S.text, tagClaim: S.claim } } } } } } } };

  // neutral schematic layout from topology (world px; the camera maps world to screen). Conceptual only:
  // positions say "connected to / mounted on / near", never a size or a distance.
  // measured mode: each part sits on its verified anchor rect, the drawing fitted into the world frame
  const fitDrawing = (dw, dh) => { const s = Math.min(900 / dw, 820 / dh); return { s, x0: 540 - dw * s / 2, y0: 380 + (820 - dh * s) / 2 }; };
  function layout(sc, ext = {}) {
    if (sc.mode === "measured" && ext.anchorRect && ext.drawing) { const f = fitDrawing(ext.drawing.w, ext.drawing.h); const pos = {};
      for (const q of sc.parts) if (q.anchor) { const r = ext.anchorRect(q.anchor); pos[q.id] = { x: f.x0 + (r.x + r.w / 2) * f.s, y: f.y0 + r.y * f.s, w: r.w * f.s, h: r.h * f.s,
        shape: q.kind === "heater" ? "tube" : q.kind === "supply" ? "supply" : ["switch", "valve"].includes(q.kind) ? q.kind : ["wire", "insulation"].includes(q.kind) ? "run" : q.kind === "vessel" ? "vessel" : "box" }; }
      const host = (sc.parts.find((q) => q.kind === "heater" && pos[q.id]) || {}).id || null; return { pos, host, refOnly: new Set(), fit: f }; }
    const P = Object.fromEntries(sc.parts.map((p) => [p.id, p])); const L = sc.links;
    const refOnly = new Set(sc.parts.filter((p) => L.some((l) => l.to === p.id && l.kind === "rated-for") && !L.some((l) => (l.from === p.id || l.to === p.id) && l.kind !== "rated-for")).map((p) => p.id));
    const drawn = sc.parts.filter((p) => !refOnly.has(p.id) && !p.layerOf);
    const degree = (id) => L.filter((l) => l.to === id && ["mounted-on", "near", "in-series", "inside"].includes(l.kind)).length;
    const hostC = drawn.filter((p) => ["heater", "valve", "motor", "sensor"].includes(p.kind)).sort((a, b) => degree(b.id) - degree(a.id))[0] || drawn[0];
    const pos = {};
    if (hostC) pos[hostC.id] = { x: 620, y: 560, w: 170, h: 640, shape: hostC.kind === "heater" ? "tube" : "box" };
    const h = hostC ? pos[hostC.id] : { x: 610, y: 600, w: 130, h: 600 };
    for (const l of L) { if (!pos[l.from] && P[l.from] && !refOnly.has(l.from) && l.to === (hostC && hostC.id)) {
      if (l.kind === "mounted-on" || l.kind === "in-series") pos[l.from] = { x: h.x - h.w / 2 - 140, y: h.y + 40, w: 240, h: 180, shape: P[l.from].kind };
      else if (l.kind === "near") pos[l.from] = { x: h.x + h.w / 2 + 120, y: h.y - 40, w: 60, h: h.h + 80, shape: "run" }; } }
    for (const l of L) if (l.kind === "powered-by" && P[l.to] && !pos[l.to]) pos[l.to] = { x: 230, y: 420, w: 280, h: 170, shape: "supply" };
    const vessel = drawn.find((p) => p.kind === "vessel");
    let k = 0; for (const p of drawn) if (!pos[p.id] && p !== vessel) { pos[p.id] = { x: 200 + 260 * (k % 3), y: 1180, w: 200, h: 120, shape: "box" }; k += 1; }
    if (vessel) { const inner = Object.values(pos); const x0 = Math.min(...inner.map((b) => b.x - b.w / 2)) - 70, x1 = Math.max(...inner.map((b) => b.x + b.w / 2)) + 70;
      const y0 = Math.min(...inner.map((b) => b.y)) - 70, y1 = Math.max(...inner.map((b) => b.y + b.h)) + 70; pos[vessel.id] = { x: (x0 + x1) / 2, y: y0, w: x1 - x0, h: y1 - y0, shape: "vessel" }; }
    return { pos, host: hostC ? hostC.id : null, refOnly };
  }

  const T = {
    id: "component-section", version: 1, provenance: ["explanatory"], minStates: 1,
    params: { type: "object", required: ["scene", "chip"], additionalProperties: false, properties: {
      scene: { oneOf: [{ type: "string", pattern: "^shared:[a-z0-9-]+$" }, scene] }, chip: S.chip, source: S.source, enter: S.window2 } },
    sceneSchema: scene, layout,
    states: ["current-flows", "value-tag", "contact-stuck", "heat-rises", "insulation-damaged", "pressure-lost"],
    build(FR, shot, ctx) {
      const P = shot.params; const sc = typeof P.scene === "string" ? ctx.shared(P.scene.slice(7)) : P.scene; const { E, p, lerp, C, F, W, H: HH, X, esc } = FR;
      const dkey = sc.drawing ? ctx.assetKey(sc.drawing) : null; const dm = dkey ? FR.media[dkey] : null;
      const { pos, host, fit: dfit } = layout(sc, dm ? { anchorRect: (ref) => ctx.anchor(ref).rect, drawing: { w: dm.iw / dm.scale, h: dm.ih / dm.scale } } : {}); const byId = Object.fromEntries(sc.parts.map((q) => [q.id, q]));
      const st = sc.states.map((s) => ({ ...s, t: ctx.time(s.at) })).sort((s1, s2) => s1.t - s2.t); const kOf = (part, state, t, d = 0.6) => { const s = st.find((x) => x.part === part && x.state === state); return s ? E.inOut(p(t, s.t, s.t + d)) : 0; };
      const center = (id) => { const b = pos[id]; return b ? [b.x, b.y + b.h / 2] : null; };
      const fit = (ids, zoom) => { const bs = ids.map((id) => pos[id] || (byId[id] && byId[id].layerOf && pos[byId[id].layerOf])).filter(Boolean); if (!bs.length) return { fx: 540, fy: 860, z: 1 };
        const x0 = Math.min(...bs.map((b) => b.x - b.w / 2)) - 60, x1 = Math.max(...bs.map((b) => b.x + b.w / 2)) + 60, y0 = Math.min(...bs.map((b) => b.y)) - 60, y1 = Math.max(...bs.map((b) => b.y + b.h)) + 60;
        // the parts that change fill the model band (y 430-1030) up to 3x; the overview stays at 1x+
        const z = zoom || Math.max(1, Math.min(3.0, 920 / (x1 - x0), 600 / (y1 - y0))); return { fx: (x0 + x1) / 2, fy: (y0 + y1) / 2, z }; };
      const keys = sc.camera.map((k) => [ctx.time(k.at), fit(k.focus, k.zoom)]);
      const SY = 730; const scr = (x, y, c) => [540 + (x - c.fx) * c.z, SY + (y - c.fy) * c.z];
      const stamps = (sc.stamps || []).map((s) => ({ v: H.text(s.value, ctx), w: H.win(s.window, ctx) }));
      const tagOf = (s) => s.tag ? H.text(s.tag, ctx) : s.value ? H.text(`{${s.value.slice(6)}}`, ctx) : "";
      const conductor = (d, flow, t, dmg = 0) => `<path d="${d}" fill="none" stroke="#1d242d" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="#56606d" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="#c9824a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        ${flow > 0 ? `<path d="${d}" fill="none" stroke="#ffe08a" stroke-width="7" stroke-linecap="round" stroke-dasharray="16 30" stroke-dashoffset="${(-t * 140).toFixed(1)}" opacity="${(0.9 * flow).toFixed(3)}"/>` : ""}`;
      const plates = (sc.archival || []).map((a) => ({ ...a, w: H.win(a.window, ctx), key: ctx.assetKey(a.asset) }));
      const KIND = { estimate: "ESTIMATE", quote: "REPORT", measurement: "MEASURED" };
      const render = (t) => {
        // continuous travel: a slow push and a small lateral drift on every line, so no section holds still
        const c = X.path(keys, t); const sp = sc.span ? H.win(sc.span, ctx) : [shot.start, shot.end]; const u = p(t, sp[0], sp[1]); const drift = 1 + 0.04 * u;
        const cam = { fx: c.fx + 16 * Math.sin(Math.PI * 2 * u) / c.z, fy: c.fy, z: c.z * drift };
        let world = "";
        // backing plate under the model: one key light from the upper left, soft falloff (presentation only, not part geometry)
        const all = Object.values(pos); if (all.length) { const x0 = Math.min(...all.map((b) => b.x - b.w / 2)) - 110, x1 = Math.max(...all.map((b) => b.x + b.w / 2)) + 110, y0 = Math.min(...all.map((b) => b.y)) - 110, y1 = Math.max(...all.map((b) => b.y + b.h)) + 150;
          world += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="36" fill="url(#csPlate)" stroke="#2b3747" stroke-width="3"/>
            <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="36" fill="url(#csGrid)" opacity="0.55"/>
            <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="36" fill="url(#csKey)"/>`; }
        // measured mode: the registered drawing lies under the model (parts are drawn on its verified anchors)
        if (dm && dfit) world += `<image href="${dm.src}" x="${dfit.x0}" y="${dfit.y0}" width="${dm.iw / dm.scale * dfit.s}" height="${dm.ih / dm.scale * dfit.s}" opacity="0.55"/>`;
        const hb = host ? pos[host] : null;
        // vessel outline (pressure-loss breaks it)
        for (const q of sc.parts.filter((x) => pos[x.id] && pos[x.id].shape === "vessel")) { const b = pos[q.id]; const loss = kOf(q.id, "pressure-loss", t);
          world += `<rect x="${b.x - b.w / 2}" y="${b.y}" width="${b.w}" height="${b.h}" rx="120" fill="#0e151d" stroke="#6d7c8f" stroke-width="10" ${loss > 0 ? `stroke-dasharray="${lerp(4000, 60, loss)} ${lerp(0, 40, loss)}"` : ""}/>`; }
        // conductors: supply -> mounted switch -> host top; host bottom -> supply
        const sup = sc.parts.find((x) => pos[x.id] && pos[x.id].shape === "supply"); const sw = sc.parts.find((x) => pos[x.id] && ["switch", "valve"].includes(pos[x.id].shape));
        const on = sup || host ? Math.max(...st.filter((s) => s.state === "on").map((s) => E.inOut(p(t, s.t, s.t + 0.5))), 0) : 0;
        if (sup && hb) { const s = pos[sup.id]; const top = hb.y + 30; const sx = s.x + s.w / 2, sy = s.y + 50;
          const path1 = sw ? `M${sx} ${sy} H${pos[sw.id].x} V${pos[sw.id].y}` : `M${sx} ${sy} H${hb.x} V${top}`;
          const path2 = sw ? `M${pos[sw.id].x + pos[sw.id].w / 2} ${pos[sw.id].y + pos[sw.id].h / 2} H${hb.x - hb.w / 2 + 10}` : "";
          const path3 = `M${hb.x} ${hb.y + hb.h} V${hb.y + hb.h + 70} H${s.x} V${s.y + s.h}`;
          world += conductor(path1, on, t) + (path2 ? conductor(path2, on, t) : "") + conductor(path3, on, t); }
        // host tube: brushed metal, resistive coil inside, heat tint and glow
        if (hb) { const heat = kOf(host, "hot", t, 1.4);
          const coil = Array.from({ length: 13 }, (_, i) => `${i ? "L" : "M"}${hb.x + (i % 2 ? 34 : -34)} ${hb.y + 40 + i * ((hb.h - 80) / 12)}`).join(" ");
          const tint = heat > 0 ? `rgb(${Math.round(lerp(120, 255, heat))},${Math.round(lerp(130, 150 + 80 * heat, heat))},${Math.round(lerp(150, 60, heat))})` : "#7c8898";
          world += `${heat > 0 ? `<ellipse cx="${hb.x}" cy="${hb.y + hb.h / 2}" rx="${hb.w * (0.9 + 0.8 * heat)}" ry="${hb.h * 0.62}" fill="#ff7a2a" opacity="${(0.42 * heat).toFixed(3)}" filter="url(#csBlur)"/>` : ""}
            <rect x="${hb.x - hb.w / 2}" y="${hb.y}" width="${hb.w}" height="${hb.h}" rx="${hb.w / 2}" fill="url(#csSteel)" stroke="#2a323d" stroke-width="5" filter="url(#csShadow)"/>
            <rect x="${hb.x - hb.w / 2 + 14}" y="${hb.y + 14}" width="${hb.w - 28}" height="${hb.h - 28}" rx="${hb.w / 2 - 14}" fill="${tint}" opacity="${(0.25 + 0.6 * heat).toFixed(3)}"/>
            <path d="${coil}" fill="none" stroke="${heat > 0.5 ? "#fff1c4" : "#c9824a"}" stroke-width="9" stroke-linejoin="round" opacity="0.95"/>
            <rect x="${hb.x - hb.w / 2 + 12}" y="${hb.y + 10}" width="16" height="${hb.h - 20}" rx="8" fill="#fff" opacity="0.16"/>`;
          if (heat > 0) for (let i = 0; i < 4; i += 1) { const ph = (t * 0.7 + i / 4) % 1; const yy = hb.y + hb.h * (0.9 - 0.8 * ph);
            world += `<path d="M${hb.x - 90} ${yy} q 30 -24 60 0 t 60 0 t 60 0" fill="none" stroke="#ffb547" stroke-width="5" opacity="${(heat * 0.55 * Math.sin(Math.PI * ph)).toFixed(3)}"/>`; } }
        // wire run near the host: insulated conductors (sheath over copper); damage chars and cracks the sheath
        for (const q of sc.parts.filter((x) => pos[x.id] && pos[x.id].shape === "run")) { const b = pos[q.id]; const lay = sc.parts.find((x) => x.layerOf === q.id);
          const dmg = lay ? kOf(lay.id, "damaged", t, 1.2) : kOf(q.id, "damaged", t, 1.2);
          for (const dx of [-16, 16]) { const x = b.x + dx; const d = `M${x} ${b.y} V${b.y + b.h}`;
            world += `<path d="${d}" stroke="#1b1f25" stroke-width="30" stroke-linecap="round"/><path d="${d}" stroke="#e8e2d4" stroke-width="24" stroke-linecap="round"/><path d="${d}" stroke="#c9824a" stroke-width="7" opacity="${(0.25 + 0.75 * dmg).toFixed(3)}"/>`;
            if (dmg > 0) { const mid = hb ? hb.y + hb.h / 2 : b.y + b.h / 2; for (let i = 0; i < 9; i += 1) { const yy = mid - 220 + i * 55 + (i % 3) * 7; const len = 22 + (i * 13) % 26;
              world += `<rect x="${x - 13}" y="${yy}" width="26" height="${len}" rx="6" fill="#2a1a10" opacity="${(Math.min(1, dmg * 1.6 - i * 0.07)).toFixed(3)}"/>`;
              world += `<path d="M${x - 12} ${yy + len + 6} l 9 7 l -5 8 l 10 6" fill="none" stroke="#120c08" stroke-width="3" opacity="${(dmg * 0.9).toFixed(3)}"/>`; } } } }
        // supply: panel with terminals and a lamp that lights when the circuit is energized
        if (sup) { const b = pos[sup.id]; world += `<rect x="${b.x - b.w / 2}" y="${b.y}" width="${b.w}" height="${b.h}" rx="18" fill="url(#csPanel)" stroke="#6d7c8f" stroke-width="6" filter="url(#csShadow)"/>
          <rect x="${b.x - b.w / 2 + 18}" y="${b.y + 18}" width="${b.w - 36}" height="${b.h - 36}" rx="10" fill="#0d131a"/>
          <circle cx="${b.x - 70}" cy="${b.y + b.h / 2}" r="26" fill="${on > 0 ? "#ffd27a" : "#2b3747"}" opacity="${(0.4 + 0.6 * on).toFixed(3)}"/>${on > 0 ? `<circle cx="${b.x - 70}" cy="${b.y + b.h / 2}" r="60" fill="#ffd27a" opacity="${(0.25 * on).toFixed(3)}" filter="url(#csBlur)"/>` : ""}
          <path d="M${b.x + 10} ${b.y + b.h / 2} h36 M${b.x + 28} ${b.y + b.h / 2 - 18} v36 M${b.x + 70} ${b.y + b.h / 2} h36" stroke="#a9b7c8" stroke-width="7" stroke-linecap="round"/>`; }
        // switch housing on the host: the contact stays closed when stuck; the intended opening is a dashed ghost
        if (sw) { const b = pos[sw.id]; const thr = kOf(sw.id, "threshold", t); const stuck = kOf(sw.id, "stuck-closed", t, 0.4); const px = b.x - b.w / 2 + 40, py = b.y + b.h / 2 + 18;
          const ghostAng = -32 * thr; const weld = stuck;
          world += `<rect x="${b.x - b.w / 2}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="url(#csPanel)" stroke="#8b95a3" stroke-width="5" filter="url(#csShadow)"/>
            <rect x="${b.x - b.w / 2 + 8}" y="${b.y + 6}" width="${b.w - 16}" height="10" rx="5" fill="#fff" opacity="0.08"/>
            <circle cx="${px}" cy="${py}" r="11" fill="#c9824a"/><circle cx="${b.x + b.w / 2 - 40}" cy="${py}" r="11" fill="#c9824a"/>
            <line x1="${px}" y1="${py}" x2="${b.x + b.w / 2 - 40}" y2="${py}" stroke="${weld > 0 ? `rgb(255,${Math.round(lerp(231, 120, weld))},${Math.round(lerp(225, 80, weld))})` : "#e9e7e1"}" stroke-width="${10 + 4 * weld}" stroke-linecap="round"/>
            ${thr > 0 ? `<line x1="${px}" y1="${py}" x2="${px + (b.w - 80) * Math.cos(ghostAng * Math.PI / 180)}" y2="${py + (b.w - 80) * Math.sin(ghostAng * Math.PI / 180)}" stroke="#7cc6ff" stroke-width="7" stroke-dasharray="12 10" stroke-linecap="round" opacity="${(thr * (1 - 0.65 * stuck)).toFixed(3)}"/>` : ""}
            ${weld > 0 ? `<circle cx="${b.x + b.w / 2 - 40}" cy="${py}" r="${22 + 6 * Math.sin(t * 9)}" fill="#e5484d" opacity="${(0.55 * weld).toFixed(3)}" filter="url(#csBlur)"/><circle cx="${b.x + b.w / 2 - 40}" cy="${py}" r="14" fill="#ffb547" opacity="${weld.toFixed(3)}"/>` : ""}`; }
        // other parts (valves, sensors, motors without a host relation): neutral boxes
        for (const q of sc.parts.filter((x) => pos[x.id] && pos[x.id].shape === "box" && x.id !== host)) { const b = pos[q.id];
          world += `<rect x="${b.x - b.w / 2}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="#18212c" stroke="#6d7c8f" stroke-width="5"/>`; }
        const svgWorld = `<defs><linearGradient id="csSteel" x1="0" x2="1"><stop offset="0" stop-color="#46505d"/><stop offset="0.45" stop-color="#9aa6b5"/><stop offset="1" stop-color="#3f4955"/></linearGradient>
          <filter id="csBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
          <filter id="csShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="10" dy="16" stdDeviation="12" flood-color="#000" flood-opacity="0.55"/></filter>
          <linearGradient id="csPlate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2532"/><stop offset="1" stop-color="#0c1219"/></linearGradient>
          <linearGradient id="csPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3644"/><stop offset="1" stop-color="#151d27"/></linearGradient>
          <radialGradient id="csKey" cx="25%" cy="15%" r="85%"><stop offset="0" stop-color="#9fc4ff" stop-opacity="0.13"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <linearGradient id="csHeat" x1="0" x2="1"><stop offset="0" stop-color="#7cc6ff"/><stop offset="0.5" stop-color="#ffb547"/><stop offset="1" stop-color="#ff5a2a"/></linearGradient>
          <pattern id="csGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#2a3a4d" stroke-width="1.2"/></pattern></defs>
          <g transform="translate(540 ${SY}) scale(${cam.z.toFixed(4)}) translate(${(-cam.fx).toFixed(2)} ${(-cam.fy).toFixed(2)})">${world}</g>`;
        // labels and tags in screen space (constant size for phones): the focused parts of the current camera key and the latest state tag
        const cur = sc.camera.filter((k) => ctx.time(k.at) <= t + 0.3).pop() || sc.camera[0];
        // one label: the focused part whose documented state changed last (a layer such as insulation names itself)
        const focusAll = cur.focus.filter((id) => byId[id]); const withLayers = focusAll.concat(focusAll.flatMap((i) => sc.parts.filter((x) => x.layerOf === i || x.id === i && x.layerOf).map((x) => x.id)));
        const latest = st.filter((x) => x.t <= t + 0.2 && withLayers.includes(x.part)).pop();
        const ids = [latest ? latest.part : focusAll[0]].filter(Boolean); const out = []; const used = [];
        // a clear label band (y 330-420) above the model; leaders run down to the parts, labels never cross them
        const marks = ids.map((id) => { const part = byId[id]; const b = pos[id] || (part.layerOf && pos[part.layerOf]); return b ? { id, part, b, sx: scr(b.x, b.y, cam)[0] } : null; }).filter(Boolean).sort((m1, m2) => m1.sx - m2.sx);
        // label placement: candidates around the part itself (above, below, top inside), the first that crosses no other part
        // and stays inside the model band and the side margins; leader from the part edge
        const scrBox = (b) => { const [a0, b0] = scr(b.x - b.w / 2, b.y, cam), [a1, b1] = scr(b.x + b.w / 2, b.y + b.h, cam); return { x0: a0, y0: b0, x1: a1, y1: b1 }; };
        for (const m of marks) { const { part, id } = m; const own = scrBox(m.b); const others = Object.entries(pos).filter(([k]) => k !== id && k !== part.layerOf).map(([, b]) => scrBox(b));
          const txt = H.text(part.label, ctx).toUpperCase(); const tw = 25 * txt.length; const clampX = (x) => Math.max(70 + tw / 2, Math.min(1010 - tw / 2, x));
          const mid = (Math.max(own.x0, 0) + Math.min(own.x1, 1080)) / 2; const xs = [clampX(mid), clampX(own.x0 + tw / 2), clampX(own.x1 - tw / 2)];
          const ys = [own.y0 - 30, own.y1 + 52, Math.max(own.y0, 400) + 52].filter((y) => y >= 360 && y <= 1020);
          const free = (x, y) => !others.some((q) => q.x0 < x + tw / 2 + 14 && q.x1 > x - tw / 2 - 14 && q.y0 < y + 22 && q.y1 > y - 40);
          const pick = ys.flatMap((y) => xs.map((x) => [x, y])).find(([x, y]) => free(x, y)) || [xs[0], ys[ys.length - 1] || 400];
          const [cx, ly] = pick; const x0 = cx - tw / 2, x1 = cx + tw / 2;
          const ey = ly < own.y0 ? own.y0 : ly > own.y1 ? own.y1 : null;
          out.push(`<rect x="${x0 - 14}" y="${ly - 38}" width="${tw + 28}" height="56" rx="12" fill="#06090d" opacity="0.8"/>`);
          if (ey != null) out.push(`<line x1="${cx.toFixed(1)}" y1="${(ly < own.y0 ? ly + 18 : ly - 38).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#ffb547" stroke-width="4"/><circle cx="${cx.toFixed(1)}" cy="${ey.toFixed(1)}" r="8" fill="#ffb547"/>`);
          out.push(FR.text(cx, ly, txt, { size: 40, weight: 800, anchor: "middle", ls: 1.5 })); }
        const metered = new Set((sc.meters || []).flatMap((mt) => mt.entries.map((e) => `${(e.tagClaim || e.value)}|${e.tag}`)));
        const live = st.filter((s) => s.t <= t && tagOf(s) && !metered.has(`${s.claim}|${s.tag}`) && !metered.has(`${s.value}|${s.tag}`) && withLayers.includes(s.part)).pop();
        if (live) { const k = E.out(p(t, live.t, live.t + 0.35)); const txt = esc(tagOf(live).toUpperCase()); const wpx = 26 * txt.length + 60; const alert = ["stuck-closed", "damaged", "hot", "pressure-loss"].includes(live.state);
          out.push(`<g opacity="${k.toFixed(3)}" transform="translate(540 ${1236 - 18 * (1 - k)})"><rect x="${-wpx / 2}" y="-44" width="${wpx}" height="76" rx="38" fill="${alert ? "#e5484d" : "#0f1720"}" stroke="${alert ? "#ffb547" : "#7cc6ff"}" stroke-width="3" opacity="0.92"/>`
            + FR.text(0, 8, tagOf(live).toUpperCase(), { size: 44, weight: 800, ls: 1 }) + `</g>`); }
        // evidence meters (screen space, y 1060-1200): one quantity at a time; fill and marks are claim values
        const MT = (sc.meters || []).map((mt) => ({ ...mt, es: mt.entries.map((e) => ({ ...e, t: ctx.time(e.at), v: ctx.value(e.value), txt: H.text(e.tag, ctx).toUpperCase() })) })).map((mt) => ({ ...mt, t0: Math.min(...mt.es.map((e) => e.t)) })).sort((m1, m2) => m1.t0 - m2.t0);
        MT.forEach((mt, i) => { const next = MT[i + 1]; const vis = p(t, mt.t0 - 0.4, mt.t0) * (next ? 1 - p(t, next.t0 - 0.5, next.t0 - 0.1) : 1); if (vis <= 0) return;
          const max = 1.15 * Math.max(...mt.es.map((e) => e.v)); const X0 = 90, X1 = 990, Y = 1110; const xs = (v) => X0 + (X1 - X0) * Math.max(0, v) / max;
          let fill = 0; let last = null; for (const e of mt.es.filter((x) => x.role === "fill")) { if (t >= e.t - 0.2) { const k = E.inOut(p(t, e.t - 0.2, e.t + 0.9)); fill = lerp(fill, e.v, k); last = e; } }
          const hot = mt.quantity === "temperature"; const firstMark = mt.es.filter((e) => e.role === "mark" && t >= e.t).sort((a, b) => a.v - b.v)[0];
          const over = firstMark && fill > firstMark.v ? `<rect x="${xs(firstMark.v)}" y="${Y - 16}" width="${xs(fill) - xs(firstMark.v)}" height="32" rx="6" fill="#e5484d" opacity="${(0.85 * vis).toFixed(3)}"/>` : "";
          out.push(`<g opacity="${vis.toFixed(3)}"><rect x="${X0 - 30}" y="${Y - 70}" width="${X1 - X0 + 60}" height="150" rx="22" fill="#06090d" opacity="0.82"/>
            <rect x="${X0}" y="${Y - 16}" width="${X1 - X0}" height="32" rx="16" fill="#1b2633"/>
            <rect x="${X0}" y="${Y - 16}" width="${Math.max(0, xs(fill) - X0)}" height="32" rx="16" fill="${hot ? "url(#csHeat)" : "#ffcf6a"}"/>${over}
            ${mt.es.filter((e) => e.role === "mark" && t >= e.t - 0.1).map((e) => { const k = E.out(p(t, e.t - 0.1, e.t + 0.3)); const x = xs(e.v); const breach = fill > e.v + 1e-6;
              return `<g opacity="${k.toFixed(3)}"><line x1="${x}" y1="${Y - 34}" x2="${x}" y2="${Y + 34}" stroke="${breach ? "#ff6a6f" : "#7cc6ff"}" stroke-width="7"/>` + FR.text(Math.min(Math.max(x, X0 + 200), 940 - 11 * e.txt.length), Y - 30, e.txt, { size: 36, weight: 800, fill: breach ? "#ffb4b6" : "#cfe8ff", ls: 1 }) + `</g>`; }).join("")}
            ${last ? FR.text(Math.min(Math.max(xs(fill), X0 + 340), 930), Y + 66, last.txt, { size: 38, weight: 800, fill: hot ? "#ffd0a0" : "#ffe3a3", ls: 1, anchor: "end" }) : ""}
            ${last && KIND[ctx.claim(last.value.slice(6)).kind] ? FR.text(930, Y - 30, KIND[ctx.claim(last.value.slice(6)).kind], { size: 32, weight: 800, fill: "#9fb3c8", ls: 2, anchor: "end" }) : ""}</g>`); });
        const enter = P.enter ? E.inOut(p(t, ctx.time(P.enter[0]), ctx.time(P.enter[1]))) : 1;
        // archival plates (historical photos/drawings, or test imagery with its label): unmarked, unregistered; the model fades in after them
        let plateK = 0; const media = []; let plateChip = null;
        plates.forEach((a, i) => { const isLast = i === plates.length - 1; const kIn = i === 0 ? 1 : E.inOut(p(t, a.w[0], a.w[0] + 0.45)); const kOut = 1 - E.inOut(p(t, a.w[1] - 0.45, a.w[1]));
          const k = t < a.w[0] ? 0 : kIn * kOut; if (k <= 0) return; const m = FR.media[a.key]; const z = 1 + 0.08 * p(t, a.w[0], a.w[1]);
          // the plate sits between the chip row and the caption band (y 340-1220) whatever its aspect
          const bw = Math.min(1000, m.iw / m.scale * 2.2, 860 * m.iw / m.ih / 1.08), bh = bw * m.ih / m.iw; const box = { x: 540 - bw * z / 2, y: 780 - bh * z / 2, w: bw * z, h: bh * z };
          media.push(FR.photo(a.key, { fx: m.iw / 2, fy: m.ih / 2, z: 1, opacity: 0.55 * k, filter: "blur(28px) brightness(0.35)" }), { ...FR.photo(a.key, { box, crop: { x: 0, y: 0, w: m.iw, h: m.ih } }), opacity: k, filter: "drop-shadow(0 18px 30px rgba(0,0,0,.6))", radius: 6 });
          plateK = Math.max(plateK, isLast ? k : 1 * (t <= a.w[1] ? 1 : 0)); if (k > 0.5) plateChip = a; });
        if (plates.length && t >= plates[plates.length - 1].w[1]) plateK = 0;
        const stampNow = stamps.filter((s) => t >= s.w[0] && t <= s.w[1] + 0.4).pop();
        const band = `<rect y="1150" width="${W}" height="${HH - 1150}" fill="url(#botShade)"/><rect y="1290" width="${W}" height="${HH - 1290}" fill="#06090d" opacity="0.72"/><rect width="${W}" height="440" fill="url(#topShade)" opacity="0.8"/>`;
        const wop = enter * (1 - plateK);
        return { under: FR.blueprint(1), media, svg: `<g opacity="${wop.toFixed(3)}">${svgWorld}${band}${out.join("")}</g>`,
          hud: (plateChip ? FR.chip(H.text(plateChip.label, ctx), plateChip.kind === "test-imagery" ? "reconstruction" : "archival") : FR.chip(H.text(sc.mode === "conceptual" ? sc.disclosure : P.chip.label, ctx), P.chip.kind || "explanatory")) + (stampNow ? X.stamp("", stampNow.v, H.fadeWin(FR, t, [stampNow.w[0], stampNow.w[0] + 0.3], [stampNow.w[1], stampNow.w[1] + 0.4])) : "")

            + (P.source ? FR.source(H.text(P.source.text, ctx), 1, P.source.y) : "") };
      };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
