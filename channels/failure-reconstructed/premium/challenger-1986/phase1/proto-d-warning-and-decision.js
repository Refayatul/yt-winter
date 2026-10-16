// Phase 1 prototype D, revision 3: the night before as a document camera (replaces V2 S12, S13).
// r2 (archive/proto-d-r2-*.js) put the right evidence on screen but as still pages with highlights.
// r3: the two Thiokol documents lie on a desk and the camera reads them with the narration:
//   "engineers had recommended not launching below fifty-three degrees"
//       -> the camera travels along the engineers' handwritten line and lands on "≥ 53 °F"   (p. 90)
//   "their managers reversed that advice"
//       -> the signed telefax slides over the engineers' chart and covers it; the camera reads
//          "MTI recommends STS-51L launch proceed", then the signature                       (p. 97)
//   "and NASA's top launch officials never heard it"
//       -> the clock runs to launch; the Commission's finding is laid on top                (p. 82)
// Cause and effect is physical: the reversal literally lies on top of the warning.
// Text tiers: 64 px (time stamp), 56 px (finding), 24 px (source lines); captions and the provenance chip are system elements.
(window.OVERRIDES = window.OVERRIDES || []).push(function (FR) {
  const { C, F, E, p, lerp, clamp, W, H, X, esc } = FR; const L = FR.L, Wd = FR.word, WE = FR.wordEnd;
  const ease = (t, a, b, f = E.inOut) => f(p(t, a, b));
  // ---- data: source px on the NASA scans, chronology times (EST) from Rogers Vol. 1 Ch. V -----------------
  const CHART = { key: "chart53", line: { x: 52, y: 44, w: 470, h: 26 }, value: { x: 262, y: 44, w: 118, h: 26 }, why: { x: 58, y: 78, w: 500, h: 50 } }; // p. 90
  const FAX = { key: "fax", rec: { x: 44, y: 418, w: 560, h: 20 }, sig: { x: 58, y: 468, w: 300, h: 92 } };                                   // p. 97
  const FINDING = { lines: ["Those who made that decision", "were unaware…"], hl: "unaware", cite: "Rogers Commission, Vol. 1, p. 82" };          // p. 82
  const TIMES = [{ at: 0, v: "8:45 PM" }, { at: 1, v: "11:00 PM" }, { at: 2, v: "11:45 PM" }, { at: 3, v: "11:38 AM" }]; // teleconference, reversal, signed fax, launch
  const T = { s12: L("L10").start - 0.1, s13: L("L11").start - 0.1, s14: L("L12").start - 0.1 };
  const w = { eng: Wd("L10", "engineers"), rec: Wd("L10", "recommended"), below: Wd("L10", "below"), f53: Wd("L10", "fifty-three"), deg: WE("L10", "degrees."),
    man: Wd("L11", "managers"), rev: Wd("L11", "reversed"), adv: Wd("L11", "advice"), and: Wd("L11", "and"), nasa: Wd("L11", "NASA's"), never: Wd("L11", "never") };

  // ---- world layout (desk px) -----------------------------------------------------------------------------
  const chartW = 1000, chartH = chartW * 186 / 599, chartC = { x: 540, y: 700 }, cs = chartW / 599;
  const chartPt = (x, y) => ({ x: chartC.x - chartW / 2 + x * cs, y: chartC.y - chartH / 2 + y * cs });   // (rotation ignored for the camera: 1.5°)
  const faxW = 1040, faxH = faxW * 689 / 804, faxC = { x: 540, y: 780 }, fs = faxW / 804;
  const faxPt = (x, y) => ({ x: faxC.x - faxW / 2 + x * fs, y: faxC.y - faxH / 2 + y * fs });
  const lineStart = chartPt(CHART.line.x + 150, 57), at53 = chartPt(CHART.value.x + 59, 57), whole = chartPt(300, 90);
  const recA = faxPt(200, 428), recB = faxPt(470, 428), sig = faxPt(210, 514);
  // camera keys: [time, {cx, cy, z}] — reads the documents in step with the words
  const CAM = [
    [T.s12, { cx: 540, cy: 700, z: 1.0 }], [w.eng, { cx: 540, cy: 690, z: 1.15 }],
    [w.rec, { cx: lineStart.x, cy: lineStart.y, z: 2.2 }], [w.below + 0.15, { cx: lerp(lineStart.x, at53.x, 0.8), cy: at53.y, z: 2.35 }],
    [w.f53 + 0.2, { cx: at53.x, cy: at53.y + 4, z: 2.7 }], [w.deg + 0.25, { cx: whole.x, cy: whole.y, z: 1.55 }],
    [w.man, { cx: 540, cy: 760, z: 1.35 }], // repair 2: was z 1.05 (a small chart strip on an empty desk for ~0.4 s before the fax arrived) [w.rev, { cx: recA.x, cy: recA.y, z: 1.7 }], [w.adv - 0.05, { cx: recB.x, cy: recB.y, z: 1.75 }],
    [w.adv + 0.45, { cx: sig.x + 60, cy: sig.y, z: 1.6 }], [w.nasa + 0.2, { cx: 540, cy: 800, z: 1.0 }], [T.s14, { cx: 540, cy: 805, z: 1.03 }],
  ];
  const cam = (t) => X.path(CAM.map(([tt, c]) => [tt, { fx: c.cx, fy: c.cy, z: c.z }]), t);
  const timeIdx = (t) => (t < w.rev ? 0 : t < w.adv ? 1 : t < w.nasa ? 2 : 3);
  const railNow = (t) => t < w.rev ? 0 : t < w.adv ? lerp(0, 1, ease(t, w.rev - 0.1, w.rev + 0.4)) : t < w.nasa ? lerp(1, 2, ease(t, w.adv - 0.1, w.adv + 0.4)) : lerp(2, 3, ease(t, w.nasa - 0.1, w.nasa + 0.6));

  const scene = (t) => {
    const c = cam(t); const camW = { cx: c.fx, cy: c.fy, z: c.z };
    const faxIn = ease(t, w.man - 0.05, w.rev + 0.05, E.out);           // the telefax slides over the chart
    const fin = ease(t, w.nasa, w.nasa + 0.45, E.out);                    // the finding is laid on top
    const docs = [
      { key: CHART.key, x: chartC.x, y: chartC.y, w: chartW, rot: -1.5, dim: 0.25 * faxIn, marks: faxIn > 0.05 ? [] : [
        { ...CHART.line, k: p(t, w.rec - 0.05, w.below + 0.3) }, { ...CHART.value, k: p(t, w.f53 - 0.05, w.f53 + 0.3), color: C.hot }, { ...CHART.why, k: p(t, w.deg - 0.1, w.deg + 0.5), color: "#9bc7ff" }] },
      { key: FAX.key, x: faxC.x, y: lerp(faxC.y + 1500, faxC.y, faxIn), w: faxW, rot: lerp(4, 1, faxIn), op: faxIn > 0 ? 1 : 0, dim: 0.3 * fin, marks: [
        { ...FAX.rec, k: p(t, w.rev, w.adv + 0.05) }, { ...FAX.sig, k: p(t, w.adv + 0.1, w.adv + 0.5) }] },
    ];
    const d = X.desk(docs, camW);
    // the Commission's finding: a typeset clipping (labelled) laid on the desk
    // repair 1 (hard text gate): the clipping rises 40 px in place (it no longer slides through the caption
    // band), the type is 56 px with 96 px line spacing (no box overlap), and it stays clear of the right-side UI.
    const clip = fin <= 0 ? "" : (() => { const y = lerp(1000, 960, fin), hk = p(t, w.never - 0.05, w.never + 0.3);
      return `<g opacity="${fin}" transform="translate(540 ${y}) rotate(-1)"><rect x="-430" y="-150" width="860" height="300" fill="#f6f1e6" filter="url(#soft)"/>
        <rect x="-86" y="-2" width="${262 * E.out(hk)}" height="54" fill="${C.red}" opacity="0.38"/>
        <text x="0" y="-52" font-family="${F.serif}" font-weight="700" font-size="56" fill="#15181d" text-anchor="middle">“${esc(FINDING.lines[0])}</text>
        <text x="0" y="40" font-family="${F.serif}" font-weight="700" font-size="56" fill="#15181d" text-anchor="middle">${esc(FINDING.lines[1])}”</text>
        <text x="0" y="118" font-family="${F.sans}" font-weight="600" font-size="24" fill="#4a4740" text-anchor="middle">${esc(FINDING.cite)}</text></g>`; })();
    return { d, clip, now: railNow(t) };
  };
  const desk = `<rect width="${W}" height="${H}" fill="#17130f"/><rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  const top = (t, now, op = 1) => `<rect y="1250" width="${W}" height="${H - 1250}" fill="url(#botShade)"/><rect y="1300" width="${W}" height="${H - 1300}" fill="#000" opacity="0.55"/><rect width="${W}" height="440" fill="url(#topShade)"/><rect x="350" y="312" width="600" height="66" rx="33" fill="#06090d" opacity="${0.78 * op}"/>` + X.rail(TIMES.map((x) => ({ at: x.at })), now, { y: 345, x0: 390, x1: 910, op });
  const src = (s, op) => FR.source(s, op, 1494); // in the dark band under the captions, never on a page

  FR.replace("S12", { start: T.s12, end: T.s13, kind: "document", label: "Commission record", subject: "document camera over Thiokol's initial recommendation chart (Rogers Vol. 1 p. 90), 27 Jan 1986", source: "chart53", evidence: ["E3"], fade: 0.3,
    trans: "dip", transReason: "slow dissolve from the crew portrait (loss beat, respectful pace)", framing: "document camera on a desk", primitives: ["document", "document-camera", "timeline"],
    states: [{ t: w.rec, what: "camera reads the engineers' line; highlight follows the words", ev: "E3 p. 90" }, { t: w.f53, what: "camera lands on '≥ 53 °F'", ev: "E3 p. 90" }, { t: w.deg, what: "pull back to the engineers' reason (47-52 °F motors, no blow-by)", ev: "E3 p. 90" }],
    render: (t) => { const s = scene(t); const k = ease(t, T.s12, T.s12 + 0.4);
      return { under: desk, media: s.d.media, svg: s.d.svg + top(t, s.now, k), hud: X.stamp("", TIMES[timeIdx(t)].v, k, { size: 64 }) + FR.chip("Commission record", "document", k) + src("Thiokol chart, Rogers Commission p. 90", k) }; } });

  FR.replace("S13", { start: T.s13, end: T.s14, kind: "document", label: "Commission record", subject: "signed telefax slides over the chart (p. 97); Commission finding (p. 82); clock to launch", source: "fax", evidence: ["E3"],
    trans: "continuous", transReason: "continuous document camera: the reversal is laid on top of the warning", framing: "document camera on a desk", primitives: ["document", "document-camera", "timeline", "quote"],
    states: [{ t: w.man, what: "telefax slides over the engineers' chart", ev: "E3 p. 97; Finding 4" }, { t: w.rev, what: "camera reads 'MTI recommends ... launch proceed'", ev: "E3 p. 97" },
      { t: w.adv + 0.1, what: "signature (Kilminster) highlighted", ev: "E3 p. 97" }, { t: w.nasa, what: "clock to launch; the Commission's finding laid on top", ev: "E3 p. 82" }],
    render: (t) => { const s = scene(t); const q = ease(t, w.nasa, w.nasa + 0.45);
      return { under: desk, media: s.d.media, svg: s.d.svg + s.clip + top(t, s.now), hud: X.stamp("", TIMES[timeIdx(t)].v, 1, { size: 64 }) + FR.chip("Commission record", "document") + src("Thiokol telefax, Rogers Commission p. 97", 1 - q) }; } });
});
