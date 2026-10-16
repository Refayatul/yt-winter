// Phase 1 prototype B: warm vs cold O-ring (replaces V2 S05).
// V2 showed two small static shapes on black (79% empty, no change of state). Here the same mechanical
// event happens to two rings at once, in real time: the joint's sealing face moves away over 0.6 s
// (Commission: opening "essentially complete at 600 milliseconds"); the warm ring springs out and keeps
// touching it; the cold ring stays squeezed, a gap opens, and hot gas goes through it.
// Temperatures and the 0.6 s come from the Commission; the recovery rates are illustrative (labelled).
(window.OVERRIDES = window.OVERRIDES || []).push(function (FR) {
  const { C, F, E, p, lerp, clamp, W, H, X, text } = FR; const L = FR.L, Wd = FR.word;
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  const P = {
    warm: { temp: "75°F", note: "warm test", tau: 0.06 },          // E2 Ch. IV: tests ran 10-75 °F; warm rubber returns quickly
    cold: { temp: "28°F", note: "this joint, est.", tau: 4.0 },    // E2 Finding 6a: right SRB aft joint est. 28 ±5 °F; "very slow in returning"
    openSec: 0.6,                                                  // E2 Finding 8a: gap opening essentially complete at 600 ms
  };
  const T = { s05: L("L4").start - 0.1, s06: L("L5").start - 0.1 };
  const tOpen = Wd("L4", "springs") - 0.2, tSlow = Wd("L4", "slowly");

  FR.replace("S05", { start: T.s05, end: T.s06, kind: "explanatory", label: "Explanatory animation · not to scale", subject: "warm vs cold O-ring following the opening joint (0.6 s, real time)", evidence: ["E2"], fade: 0.3,
    trans: "follow-cause", transReason: "follow the cause: from the frozen launch tower into the cold rubber (frost carries across)",
    framing: "full-bleed cross-section, two stacked panels",
    register: { from: null, reason: "generic seal behaviour, not a photographed point; continuity with S04 is tonal (frost), not geometric" },
    states: [{ t: tOpen, what: "sealing face starts moving away (joint opens)", ev: "E2 F8a" }, { t: tOpen + 0.15, what: "warm ring springs out and keeps contact", ev: "E2" },
      { t: tOpen + P.openSec, what: "cold ring still squeezed: gap open", ev: "E2" }, { t: tSlow, what: "hot gas passes the cold ring only", ev: "E2" }],
    render: (t) => {
      const g = ease(t, tOpen, tOpen + P.openSec, E.sine); const rel = t - tOpen; const gas = ease(t, tOpen + P.openSec * 0.7, tSlow + 0.4, E.out);
      const frost = ease(t, T.s05, T.s05 + 0.6);
      const pw = { x: 0, y: 300, w: W, h: 470 }, pc = { x: 0, y: 790, w: W, h: 470 };
      const gw = X.groove({ ...pw, gap: g, tRel: rel, tau: P.warm.tau, tint: "warm", gas });
      const gc = X.groove({ ...pc, gap: g, tRel: rel, tau: P.cold.tau, tint: "cold", frost, gas });
      // simplification (Phase 1b): only the two temperatures, the GAP label and one source line are on screen;
      // the notes ("warm test", "this joint, est.") moved into the source line, the clock was removed.
      const temp = (y, d, col) => text(60, y + 140, d.temp, { size: 112, weight: 600, family: F.num, fill: col, anchor: "start", extra: `paint-order="stroke" stroke="#000" stroke-width="6" stroke-opacity="0.5"` });
      const gapLbl = !gc.sealed && gc.gapW > 10 ? FR.callout(gc.gapX, gc.cy + gc.r * 1.1, 860, pc.y + pc.h - 70, "GAP", p(t, tOpen + 0.35, tOpen + 0.7), { size: 44, anchor: "middle" }) : "";
      const ground = `<rect width="${W}" height="${H}" fill="url(#steelGrad)"/><rect width="${W}" height="${H}" fill="#0b1520" opacity="0.72"/>`;
      return { under: ground,
        svg: gw.svg + gc.svg + `<rect y="${pw.y + pw.h}" width="${W}" height="${pc.y - pw.y - pw.h}" fill="${C.ink}"/>`
          + temp(pw.y, P.warm, C.hot2) + temp(pc.y, P.cold, C.cold) + gapLbl
          + `<rect y="1270" width="${W}" height="${H}" fill="#000" opacity="0.45"/>`,
        hud: FR.chip("Animation · not to scale", "explanatory")
          + FR.source("75°F test, 28°F est. · Rogers Commission Ch. IV · speeds illustrative", 1, 1494) };
    } });
});
