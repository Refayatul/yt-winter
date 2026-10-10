// First-minute prototype: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (INTERNAL TEST).
// Shot list for sentences 0-10 of the reference opening (beats s1-1..s1-5). Every figure on screen
// comes from dossier claim c8 or the s1/s2 filing metadata; every illustration is original.
window.SCENES = function (PD) {
  const { C, F, E, p, lerp, clamp, svg, defs, vignette } = PD;
  const s = PD.s, w = PD.w, ent = PD.ent;
  const cam = (k, z0, z1, inner, cx = 960, cy = 540) => { const z = lerp(z0, z1, k); return `<g transform="translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})">${inner}</g>`; };
  const at = (x, y, inner, rot = 0, sc = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
  const SRC_SURVEY = "Bankrate survey, conducted online by YouGov, Aug 19-21, 2024 (2,373 US adults)";

  // ---- times (from the measured narration) ----
  const tWallet = w(0, "a wallet"), tCoat = w(0, "or a coat"), tThere = w(0, "there's a"), tMoney = w(0, "money still");
  const tEnd = s(10).end;

  // ---- the card anchor: drawer, wallet and pocket all hold the card at the same screen position and angle,
  //      so the three fast cuts read as one object moving through three places (true match cuts) ----
  const A = { cx: 960, cy: 500, w: 420, rot: -6 }; const AH = A.w / 1.586;
  const anchoredCard = (rise = 0, extra = {}) => `<g transform="translate(${A.cx} ${A.cy + rise}) rotate(${A.rot}) translate(${-A.w / 2} ${-AH / 2})">${PD.giftCard({ w: A.w, balance: 0.62, ...extra })}</g>`;

  // ---- line-art props (outline only, so the card stays the only colour) ----
  const ln = (d, op = 0.55, wdt = 3) => `<path d="${d}" fill="none" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="${wdt}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const key = () => `${ln("M0 0 a34 34 0 1 0 0.1 0")}${ln("M34 0 H190 M150 0 v22 M172 0 v16")}`;
  const receipt = () => `<rect width="190" height="300" fill="${C.paper}" opacity="0.12"/>${[40, 70, 100, 130, 160, 220, 250].map((y, i) => ln(`M22 ${y} H${i % 3 === 2 ? 120 : 168}`, 0.35, 2.5)).join("")}`;
  const pen = () => `<rect width="300" height="22" rx="11" fill="none" stroke="${C.mist}" stroke-opacity="0.5" stroke-width="3"/>${ln("M300 11 l26 0", 0.5)}`;
  const band = () => `<ellipse rx="70" ry="40" fill="none" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="5"/>`;

  const shots = [];
  // 1. Drawer (top-down): opens to reveal everyday clutter around the card.
  shots.push({ id: "drawer", start: 0, end: tWallet, in: "cut", visual: "Original line-art drawer opening; the card is the only colour", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0.1, 1.4)); const off = lerp(-430, 0, k);
      const inner = `<rect x="330" y="130" width="1260" height="800" rx="18" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="3"/>
        <g transform="translate(0 ${off})">
          ${at(420, 240, receipt(), -9)}${at(1260, 690, key(), 18)}${at(470, 780, pen(), -4)}${at(1400, 300, band(), 0)}
          ${anchoredCard()}
          ${at(560, 330, receipt(), 11)}
        </g>
        <rect x="300" y="${lerp(130, -320, k) - 40}" width="1320" height="300" fill="${C.ink}" />
        <rect x="300" y="${lerp(130, -320, k) + 250}" width="1320" height="10" fill="${C.mist}" opacity="0.25"/>`;
      return svg(defs() + cam(p(lt, 0, tWallet), 1.0, 1.04, inner, A.cx, A.cy) + vignette(), C.ink); } });
  // 2. Wallet (match cut): the card rises out of a card slot.
  shots.push({ id: "wallet", start: tWallet, end: tCoat, in: "cut", visual: "Original line-art open wallet; same card in a slot (match cut)", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0, 0.6));
      const inner = `<rect x="560" y="260" width="800" height="620" rx="40" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.45" stroke-width="3"/>
        <rect x="584" y="284" width="752" height="572" rx="28" fill="none" stroke="${C.mist}" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="9 8"/>
        ${anchoredCard(lerp(40, 0, k))}
        ${[560, 630, 700].map((y) => `<path d="M640 ${y} H1280 V${y + 150} H640 Z" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.45" stroke-width="3"/>`).join("")}`;
      return svg(defs() + cam(p(lt, 0, 1.2), 1.02, 1.05, inner, A.cx, A.cy) + vignette(), C.ink); } });
  // 3. Coat pocket: stitched fabric, the card peeking out.
  shots.push({ id: "pocket", start: tCoat, end: tThere, in: "cut", visual: "Original line-art coat pocket; same card peeking out", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0, 0.7));
      const inner = `<rect width="1920" height="1080" fill="#1a1d22"/>${ln("M260 0 L700 1080", 0.25, 4)}${ln("M300 0 L740 1080", 0.18, 2)}
        ${anchoredCard(lerp(50, 0, k))}
        <path d="M640 600 H1280 L1250 1000 H670 Z" fill="#1a1d22" stroke="${C.mist}" stroke-opacity="0.5" stroke-width="3"/>
        <path d="M660 626 H1260" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="2.5" stroke-dasharray="10 9"/>`;
      return svg(defs() + cam(p(lt, 0, 1.4), 1.0, 1.04, inner, A.cx, A.cy) + vignette(), C.ink); } });
  // 4. The card comes forward from the anchor; its unspent-balance meter glows on "money still on it";
  //    a slow 3D turn toward the viewer on "Maybe it's yours."
  shots.push({ id: "card", start: tThere, end: s(2).start, in: "cut", visual: "Card moves from the anchor to centre; unspent-balance meter (no amount printed); slow 3D turn", asset: "original vector illustration", license: "owned",
    draw: (lt, t) => { const k = E.inOut(p(lt, 0, 1.1)); const cw = lerp(A.w, 820, k); const ch = cw / 1.586;
      const glow = p(t, tMoney, tMoney + 0.6) * (1 - p(t, s(1).end, s(1).end + 0.6));
      const ry = lerp(0, 9, E.inOut(p(lt, 0.8, s(2).start - tThere))) - 12 * Math.sin(Math.PI * p(lt, 0.8, s(2).start - tThere)); const rot = lerp(A.rot, 0, k);
      const sheen = p(t, s(1).start, s(1).start + 1.2); const bg = p(lt, 0, 0.5);
      const card = `<div style="position:absolute;left:${960 - cw / 2}px;top:${lerp(A.cy, 540, k) - ch / 2}px;width:${cw}px;height:${ch}px;transform:perspective(1600px) rotateY(${ry}deg) rotate(${rot}deg);">
        <svg width="${cw}" height="${ch + 60}" viewBox="0 0 ${cw} ${ch + 60}" style="overflow:visible">${defs()}${PD.giftCard({ w: cw, balance: 0.62, glow, sheen })}</svg></div>`;
      return `<div style="position:absolute;inset:0;background:${C.ink}"></div><div style="position:absolute;inset:0;opacity:${bg};background:radial-gradient(ellipse at 50% 45%, #22262d 0%, ${C.ink} 70%)"></div>${card}<div style="position:absolute;inset:0">${svg(defs() + vignette())}</div>`; } });
  // 5. 43%: unit chart of 100 adults, 43 filled; survey method chips on the source sentence.
  const G = { x: 1090, y: 250, gap: 66 };
  shots.push({ id: "share", start: s(2).start, end: s(4).start, in: "fade", inDur: 0.35, visual: "Unit chart: 100 dots, 43 filled; count-up 0-43%; survey method chips", asset: "original data graphic (claim c8)", license: "owned",
    draw: (lt, t) => { const t0 = s(2).start; const n = Math.round(43 * E.out(p(t, t0 + 0.1, t0 + 1.1)));
      const lab = 1 - 0.5 * p(t, s(3).start, s(3).start + 0.5);
      const hl = [w(2, "holding"), w(2, "unused"), w(2, "or store")].map((ct) => 0.5 + 0.5 * ent(t, ct - 0.1));
      const chips = PD.chips([["BANKRATE SURVEY", w(3, "bankrate")], ["ONLINE, BY YOUGOV", w(3, "yougov")], ["AUG 19-21, 2024", w(3, "august")], ["2,373 US ADULTS", w(3, "two thousand")]], { x: 150, y: 740, maxW: 820, size: 26, t });
      const body = `${PD.number(140, 470, `${n}%`, { size: 260, fill: C.signal })}
        ${["of US adults hold at least one", "unused gift card, voucher", "or store credit"].map((l, i) => PD.lines(152, 560 + i * 56, [l], { size: 44, op: lab * hl[i] })).join("")}
        ${PD.unitChart({ x: G.x, y: G.y, gap: G.gap, r: 23, filled: 43, t, at: t0 })}${chips}`;
      return svg(defs() + cam(p(lt, 0, s(4).start - t0), 1.0, 1.025, body, 960, 560) + `
        ${PD.source(SRC_SURVEY, 1 - p(t, s(3).start, s(3).start + 0.4) + p(t, s(4).start - 0.3, s(4).start))}
        ${PD.label(G.x + 4.5 * G.gap, G.y + 10 * G.gap + 14, "EACH DOT = 1 IN 100 ADULTS", { size: 26, anchor: "middle", fill: C.text, op: 0.8 * p(t, t0 + 0.8, t0 + 1.4) })}` + vignette(), C.ink); } });
  // 6. ~$27 billion: the 43 dots converge into the figure; it is marked as an estimate and placed on an
  //    order-of-magnitude ruler ("the scale, not the exact amount").
  shots.push({ id: "total", start: s(4).start, end: s(6).start, in: "cut", visual: "Dots converge into ~$27B; ESTIMATE stamp; log-scale ruler showing scale, not precision", asset: "original data graphic (claim c8)", license: "owned",
    draw: (lt, t) => { const t0 = s(4).start; const conv = E.inOut(p(lt, 0.0, 0.8)); const numIn = E.back(p(t, w(4, "national") - 0.1, w(4, "national") + 0.5));
      const dots = Array.from({ length: 100 }, (_, i) => { const g = PD.unitPos(i, G); if (i >= 43) return `<circle cx="${g.x}" cy="${g.y}" r="23" fill="none" stroke="${C.mist}" stroke-opacity="${0.4 * (1 - p(lt, 0, 0.35))}" stroke-width="2.5"/>`;
        const x = lerp(g.x, 960, conv), y = lerp(g.y, 430, conv); const breathe = 1 + 0.25 * Math.sin(lt * 5) * p(lt, 0.8, 1.0); return `<circle cx="${x}" cy="${y}" r="${23 * (1 - conv * 0.9) * breathe + 30 * p(lt, 0.8, 1.6)}" fill="${C.signal}" opacity="${(i === 0 ? 1 : 1 - p(lt, 0.65, 0.85)) * (1 - clamp(numIn * 1.6))}"/>`; }).join("");
      const old = 1 - p(lt, 0, 0.3); const blur = 3.5 * E.inOut(p(t, w(5, "the scale"), w(5, "the scale") + 0.8));
      const stamp = E.back(p(t, w(5, "estimate") - 0.05, w(5, "estimate") + 0.3)); const box = p(t, w(5, "not a count") - 0.1, w(5, "not a count") + 0.5);
      const method = ent(t, w(5, "doesn't publish")); const ruler = E.out(p(t, w(5, "the scale") - 0.3, w(5, "the scale") + 0.6));
      return svg(defs() + `<g transform="translate(960 470) scale(${lerp(1, 1.03, p(lt, 0, s(6).start - t0))}) translate(-960 -470)">
        <g opacity="${old}">${PD.number(140, 470, "43%", { size: 260, fill: C.signal })}</g>
        ${dots}
        <g transform="translate(960 430) scale(${lerp(0.9, 1, numIn)}) translate(-960 -430)" opacity="${clamp(numIn)}">
          <g style="filter:blur(${blur}px)">${PD.number(960, 505, "$27 billion", { size: 220, anchor: "middle" })}</g>
          ${PD.label(960, 316, "ABOUT", { size: 32, anchor: "middle", fill: C.text, ls: 8 })}
          ${PD.label(960, 594, "UNUSED VALUE NATIONWIDE  ·  SURVEY ESTIMATE", { size: 28, anchor: "middle", fill: C.text, ls: 3, op: 0.85 })}
          <rect x="${960 - 580}" y="268" width="1160" height="362" rx="10" fill="none" stroke="${C.mist}" stroke-width="3" stroke-dasharray="14 12" opacity="${0.7 * box}"/>
        </g>
        ${PD.stamp(1400, 296, "ESTIMATE", stamp)}
        ${PD.label(960, 690, "METHOD NOT PUBLISHED", { size: 28, anchor: "middle", fill: C.text, ls: 5, op: method * (1 - ruler * 0.4) })}
        ${PD.logRuler({ x0: 460, x1: 1460, y: 820, min: 1, max: 100, value: 27, k: ruler })}</g>
        ${PD.source(SRC_SURVEY, p(lt, 0.3, 0.8))}` + vignette(), C.ink); } });
  // 7. "None of those cards answer": a tilted wall of many unbranded cards drifting past (3D perspective,
  //    a different visual register from the flat charts before it).
  const PAL = [[C.ledger, C.signal], ["#2a2d33", C.gold], ["#26343b", C.mist], ["#3a3328", C.signal], ["#1f3a3f", C.gold], ["#33302c", C.mist]];
  const wall = (lt, op = 1) => { const cols = 9, rows = 6, cw = 250, gap = 34; let cells = "";
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const i = r * cols + c; const [b, bd] = PAL[(i * 7 + r) % PAL.length]; const d = Math.hypot(c - 4, r - 2.5); const a = E.out(p(lt, d * 0.07, d * 0.07 + 0.5));
      cells += `<g transform="translate(${c * (cw + gap)} ${r * (cw / 1.586 + gap)})" opacity="${a * 0.9}">${PD.giftCard({ w: cw, base: b, band: bd, meter: false, dim: 0.25 })}</g>`; }
    const W2 = cols * (cw + gap), H2 = rows * (cw / 1.586 + gap);
    return `<div style="position:absolute;inset:0;background:${C.ink};opacity:${op}"><div style="position:absolute;left:${960 - W2 / 2}px;top:${540 - H2 / 2}px;width:${W2}px;height:${H2}px;transform:perspective(1400px) rotateX(38deg) rotateZ(-10deg) translateX(${lerp(60, -60, p(lt, 0, 4))}px) scale(1.25);transform-origin:50% 50%">
      <svg width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">${defs()}${cells}</svg></div>${svg(defs() + vignette())}</div>`; };
  shots.push({ id: "wall", start: s(6).start, end: s(7).start, in: "fade", inDur: 0.45, visual: "Tilted 3D wall of 54 unbranded cards (varied brand tints) drifting past", asset: "original motion graphic", license: "owned",
    draw: (lt) => wall(lt) });
  // 8. "Who ends up with it?": one card, three unlabelled destinations (the claimants are revealed later in the film).
  const dest = [{ x: 330, y: 330 }, { x: 850, y: 270 }, { x: 1370, y: 330 }];
  shots.push({ id: "question", start: s(7).start, end: s(8).start, in: "cut", visual: "One card, three dashed paths to three unlabelled boxes; headline question", asset: "original motion graphic", license: "owned",
    draw: (lt, t) => { const cw = 300; const head = ent(t, w(7, "who ends") - 0.2);
      const paths = dest.map((d, i) => { const k = E.inOut(p(t, w(7, "who ends") - 0.6 + i * PD.T.stagger, w(7, "who ends") + 0.3 + i * PD.T.stagger)); const x0 = 960, y0 = 720; const x1 = d.x + 110, y1 = d.y + 150;
        return `${PD.path(`M${x0} ${y0} C ${x0} ${(y0 + y1) / 2}, ${x1} ${(y0 + y1) / 2 + 60}, ${x1} ${y1}`, 900, k, { stroke: C.mist, width: 3, op: 0.75 })}
          <g opacity="${p(k, 0.7, 1)}" transform="translate(${d.x} ${d.y})"><rect width="220" height="140" rx="12" fill="none" stroke="${C.mist}" stroke-width="3" stroke-dasharray="12 10"/>${PD.serif(110, 102, "?", { size: 84, fill: C.mist })}</g>`; }).join("");
      const cardIn = ent(lt, 0); return wall(4 + lt, 1 - p(lt, 0, 0.5)) + `<div style="position:absolute;inset:0">${svg(defs() + `
        ${cam(p(lt, 0, s(8).start - s(7).start), 1.0, 1.03, paths + `<g opacity="${cardIn}">${at(960 - cw / 2, lerp(760, 720, cardIn), PD.giftCard({ w: cw, balance: 0.62 }))}</g>`, 960, 600)}
        ${PD.serif(960, 175, "Who ends up with it?", { size: 84, op: head })}` + vignette())}</div>`; } });
  // 9-10. The filings: typeset cover information of the two 10-Ks (not facsimiles), then the naive answer.
  shots.push({ id: "filings", start: s(8).start, end: tEnd + 1.6, in: "fade", inDur: 0.35, visual: "Typeset 10-K cover information (Starbucks FY2025, Darden FY2026); then the naive answer in quotes, 'just' circled", asset: "original typography from public filing metadata (dossier s1, s2)", license: "owned (facts from public SEC filings; no logos, no facsimile)",
    draw: (lt, t) => { const a = E.out(p(t, s(8).start + 0.15, s(8).start + 0.95)); const b = E.out(p(t, w(9, "darden") - 0.2, w(9, "darden") + 0.6));
      const og = ent(t, w(9, "olive garden") - 0.1); const head = E.out(p(lt, 0.1, 0.8));
      const q = E.out(p(t, w(10, "the store") - 0.25, w(10, "the store") + 0.35)); const dimDocs = 0.93 * q;
      const circ = E.inOut(p(t, w(10, "just") - 0.05, w(10, "just") + 0.55)); const fadeOut = p(t, tEnd + 0.9, tEnd + 1.6);
      const hi = (d) => E.inOut(p(t, w(9, "annual filings") - 0.1 + d, w(9, "annual filings") + 0.5 + d));
      return svg(defs() + `<rect width="1920" height="1080" fill="${C.paper}"/><rect width="1920" height="1080" fill="#000" opacity="0.5" filter="url(#paperTex)"/>
        ${PD.label(960, 112, "WHAT THE COMPANIES TOLD REGULATORS", { size: 30, fill: C.ledger, anchor: "middle", ls: 6, op: head * (1 - q) })}
        ${cam(p(t, s(8).start, w(10, "the store")), 1.0, 1.04, PD.docCover({ co: "Starbucks Corporation", fy: "September 28, 2025", x: 330, y: 180, rot: -2, k: a, hi: hi(0) }) + PD.docCover({ co: "Darden Restaurants, Inc.", fy: "May 31, 2026", x: 1070, y: 190, rot: 1.6, k: b, hi: hi(0.25) }), 960, 540)}
        ${PD.label(1330, 940, "PARENT COMPANY OF OLIVE GARDEN", { size: 28, fill: C.ink, anchor: "middle", ls: 3, op: og * (1 - q) })}
        ${PD.source("Starbucks FY2025 and Darden FY2026 Form 10-K cover pages, SEC EDGAR (typeset, not facsimiles)", a * (1 - q), 1030, { dark: false })}
        <rect width="1920" height="1080" fill="${C.paper}" opacity="${dimDocs}"/>
        <g opacity="${q}" transform="translate(0 ${lerp(20, 0, q)})">${PD.serif(960, 580, "“The store just keeps it.”", { size: 100, fill: C.ink, italic: true })}</g>
        ${(() => { const q1 = "“The store ", q2 = "just", full = "“The store just keeps it.”"; const o = { size: 100, family: F.serif, italic: true };
          const x0 = 960 - PD.measure(full, o) / 2 + PD.measure(q1, o); const jw = PD.measure(q2, o); const cx = x0 + jw / 2, cy = 546, rx = jw / 2 + 26, ry = 64;
          return PD.path(`M ${cx + rx * 0.2} ${cy + ry} C ${cx - rx * 1.25} ${cy + ry}, ${cx - rx * 1.25} ${cy - ry}, ${cx} ${cy - ry} C ${cx + rx * 1.3} ${cy - ry}, ${cx + rx * 1.25} ${cy + ry * 1.05}, ${cx - rx * 0.15} ${cy + ry * 1.08}`, 900, circ, { stroke: C.signal, width: 6 }); })()}
        <rect width="1920" height="1080" fill="${C.ink}" opacity="${fadeOut}"/>`); } });
  return { shots, duration: tEnd + 1.6 };
};
