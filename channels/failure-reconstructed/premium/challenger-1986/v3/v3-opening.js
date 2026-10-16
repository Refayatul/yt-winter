// V3 opening (replaces V2 S01's text timing only). The NASA photo, camera, ring and evidence label are
// V2's, unchanged. V2 showed the headline "Already leaking" and the first caption at the same time for
// ~3.9 s (two reading tasks at frame 0). V3: the headline holds alone, clears by 0.5 s (V3 render: 1.0 s),
// and the synchronized captions take over from then (FR.captionFrom). Narration is unchanged.
(window.OVERRIDES = window.OVERRIDES || []).push(function (FR) {
  const { C, F, E, clamp, lerp, p, W, H } = FR; const L = FR.L;
  const P = (key, x, y) => { const m = FR.media[key]; return [x * m.scale, y * m.scale]; };
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  // V3.1 caption correction: the first cue (33 chars) must end at 1.948 s, when "Challenger" is spoken.
  // Shown from 1.0 s it read at 34.8 chars/s; from 0.5 s it reads at 22.8 chars/s with every word captioned.
  // The headline still stands alone for 0.5 s (the minimum of the owner's 0.5-1.0 s range).
  const HEAD = { hold: 0.3, out: 0.5 };
  FR.captionFrom = HEAD.out;
  const T = { s02: L("L2").start - 0.1 };
  const headline = (top, big, y, op) => `<div style="position:absolute;left:60px;right:60px;top:${y}px;text-align:center;opacity:${op};text-shadow:0 3px 18px rgba(0,0,0,.9),0 0 3px #000">
    ${top ? `<div style="font:700 30px ${F.sans};letter-spacing:5px;color:${C.steel};margin-bottom:10px">${FR.esc(top)}</div>` : ""}
    <div style="font:800 96px/1.02 ${F.sans};letter-spacing:-1.5px;color:${C.text}">${big}</div></div>`;
  const SMOKE = [1972, 2885];
  FR.replace("S01", { start: 0, end: T.s02, kind: "archival", label: "NASA photo", subject: "liftoff close-up with smoke at the right SRB aft field joint", source: "liftoff", evidence: ["E1", "E2", "E4"],
    trans: "cut", transReason: "film start", framing: "photo 1080x1400 (V2)",
    render: (t) => {
      // identical to V2 S01 except the headline's opacity
      const box = { x: 0, y: 0, w: W, h: 1400 }; const e = ease(t, 0, T.s02 + 0.3);
      const z = lerp(1.0, 1.38, e); const [fx0, fy0] = P("liftoff", 1300, 2200), [fx1, fy1] = P("liftoff", SMOKE[0] - 260, SMOKE[1] - 150);
      const ph = FR.photo("liftoff", { fx: lerp(fx0, fx1, e), fy: lerp(fy0, fy1, e), z, box });
      const s = FR.toScreen(ph.crop, ph.box, ...P("liftoff", ...SMOKE));
      const rk = p(t, 0.5, 1.15), lk = p(t, 0.95, 1.4);
      const hop = 1 - p(t, HEAD.hold, HEAD.out);
      return { under: `<rect width="${W}" height="${H}" fill="${C.ink}"/>`, media: [ph],
        svg: `<rect width="${W}" height="640" fill="url(#topShade)"/><rect y="1120" width="${W}" height="290" fill="url(#botShade)"/><rect y="1400" width="${W}" height="520" fill="${C.ink}"/>
          ${FR.ring(s.x, s.y, 86, rk)}${lk > 0 ? `<line x1="${s.x - 64}" y1="${s.y - 58}" x2="${lerp(s.x - 64, 330, E.out(lk))}" y2="${lerp(s.y - 58, s.y - 200, E.out(lk))}" stroke="${C.hot2}" stroke-width="5" opacity="${lk}"/>` : ""}`,
        hud: (hop > 0 ? headline("CHALLENGER · 1986", "Already<br>leaking", 330, hop) : "") + FR.chip("NASA photo", "archival")
          + `<div style="position:absolute;left:60px;top:${s.y - 300}px;opacity:${lk};padding:12px 20px;border-radius:12px;background:rgba(6,9,13,.8);border:2px solid ${C.hot2};font:800 38px/1.18 ${F.sans};letter-spacing:1px;color:${C.text}">SMOKE AT THE<br>RIGHT BOOSTER JOINT<div style="font:600 30px ${F.num};color:${C.hot2};margin-top:6px;letter-spacing:.5px">0.678 s after liftoff</div></div>` };
    } });
});
