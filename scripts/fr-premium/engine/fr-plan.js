// Shot-plan resolver (runs in the render page). Replaces a film's hand-written window.SCENES with shots
// built from data: window.FR_PLAN = { plan, evidence, assets } plus window.FR_TEMPLATES (the registry).
// The legacy SCENES/OVERRIDES (if loaded) are captured first, only so that "legacy-code" shots can run
// unchanged; nothing else from them is kept.
(function () {
  const legacyScenes = window.SCENES, legacyOverrides = window.OVERRIDES || [];
  window.OVERRIDES = [];
  window.SCENES = function (FR) {
    const { plan, evidence, assets } = window.FR_PLAN; const TPL = window.FR_TEMPLATES || {};
    // 1. legacy shots (for legacy-code only)
    const legacy = new Map();
    if (legacyScenes) { legacyScenes(FR); legacyOverrides.forEach((fn) => fn(FR)); FR.shots.forEach((s) => legacy.set(s.id, s)); }
    FR.shots.length = 0; FR.overlays.length = 0; FR.captionSkip.clear(); delete FR.captionFrom;
    // 2. film settings
    const time = (ref) => window.FR_TIME.resolve(ref, FR.tl, FR.duration);
    (plan.film.captionSkip || []).forEach((l) => FR.captionSkip.add(l));
    if (plan.film.captionFrom) FR.captionFrom = time(plan.film.captionFrom);
    // 3. context shared by all templates
    const api = new Map();
    const claimOf = (id) => { const c = evidence.claims[id]; if (!c) throw new Error("claim " + id); return c; };
    const anchorOf = (ref) => { const m = /^asset:([a-z0-9-]+)#([a-z0-9-]+)$/.exec(ref); if (!m) throw new Error("anchor ref " + ref); const a = assets.assets[m[1]].anchors[m[2]]; if (!a) throw new Error("anchor " + ref); return a; };
    const ctxFor = (shot) => ({
      time, claim: claimOf, source: (id) => evidence.sources[id],
      value: (ref) => { const c = claimOf(String(ref).replace(/^claim:/, "")); return c.value; },
      seconds: (ref) => { const c = claimOf(String(ref).replace(/^claim:/, "")); return c.unit === "ms" ? c.value / 1000 : c.value; },
      anchor: anchorOf, point: (ref) => { const a = anchorOf(ref); return a.point || [a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2]; },
      assetKey: (ref) => String(ref).replace(/^asset:/, "").split("#")[0],
      shared: (name) => { const s = (plan.shared || {})[name]; if (!s) throw new Error("shared " + name); return s; },
      shotApi: (id) => { const a = api.get(id); if (!a) throw new Error(`shot ${shot.id}: ${id} has no API (it must come earlier and expose screenOf)`); return a; },
      legacy: (id) => legacy.get(id),
    });
    // 4. shots
    for (const ps of plan.shots) {
      const T = TPL[ps.template]; if (!T) throw new Error(`shot ${ps.id}: unknown template ${ps.template}`);
      const shot = { ...ps, start: time(ps.start), end: time(ps.end) };
      // preview only: a planner shot awaiting human input renders as a labelled placeholder (it stays invalid for production)
      const built = ps.review && (!ps.params || !Object.keys(ps.params).length) ? { render: () => ({ under: `<rect width="${FR.W}" height="${FR.H}" fill="#1b0f12"/>`,
          hud: `<div style="position:absolute;left:80px;right:80px;top:600px;text-align:center;font:800 64px ${FR.F.sans};color:#ffb547">NEEDS HUMAN REVIEW</div><div style="position:absolute;left:80px;right:80px;top:720px;text-align:center;font:600 34px ${FR.F.sans};color:#e8e3da">${FR.esc(ps.review.codes.join(" · "))}</div>` }) } : T.build(FR, shot, ctxFor(shot));
      if (built.api) api.set(ps.id, built.api);
      const L = built.legacyShot;
      FR.shot({ id: ps.id, start: shot.start, end: shot.end, kind: ps.provenance.kind, label: ps.provenance.label, subject: L ? L.subject : `${ps.template} (${ps.beat})`,
        source: (ps.assets || [])[0] || null, evidence: ps.evidence, fade: ps.transition.fade || (L ? L.fade : 0) || 0, drift: L ? L.drift : undefined,
        trans: ps.transition.type, transReason: ps.transition.reason || null, template: ps.template,
        states: (ps.qa.states || []).map((s) => ({ t: time(s.at), what: s.what, ev: s.claim || null })),
        register: ps.qa.registered ? { from: (ps.params.register || {}).fromShot || (ps.params.drawing ? "drawing" : "previous"), asset: (ps.assets || [])[0] } : null,
        primitives: [ps.template], framing: ps.template, render: built.render });
    }
    // 5. standard overlays: handle + word-aligned captions
    FR.overlay((t) => ({ hud: FR.handle() + FR.captionAt(t) }));
  };
})();
