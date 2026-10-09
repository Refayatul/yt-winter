// First-minute prototype: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (INTERNAL TEST).
// Shot list for sentences 0-10 of the reference opening (beats s1-1..s1-5). Every figure on screen
// comes from dossier claim c8 or the s1/s2 filing metadata; every illustration is original.
window.SCENES = function (PD) {
  const { C, F, E, p, lerp, clamp, svg, defs, vignette } = PD;
  const s = PD.s, w = PD.w;
  const cam = (k, z0, z1, inner, cx = 960, cy = 540) => { const z = lerp(z0, z1, k); return `<g transform="translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})">${inner}</g>`; };
  const at = (x, y, inner, rot = 0, sc = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
  const SRC_SURVEY = "Bankrate survey, conducted online by YouGov, Aug 19-21, 2024 (2,373 US adults)";

  // ---- times (from the measured narration) ----
  const tWallet = w(0, "a wallet"), tCoat = w(0, "or a coat"), tThere = w(0, "there's a"), tMoney = w(0, "money still");
  const tEnd = s(10).end;

  // ---- line-art props (outline only, so the card stays the only colour) ----
  const ln = (d, op = 0.55, wdt = 3) => `<path d="${d}" fill="none" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="${wdt}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const key = () => `${ln("M0 0 a34 34 0 1 0 0.1 0")}${ln("M34 0 H190 M150 0 v22 M172 0 v16")}`;
  const receipt = () => `<rect width="190" height="300" fill="${C.paper}" opacity="0.12"/>${[40, 70, 100, 130, 160, 220, 250].map((y, i) => ln(`M22 ${y} H${i % 3 === 2 ? 120 : 168}`, 0.35, 2.5)).join("")}`;
  const pen = () => `<rect width="300" height="22" rx="11" fill="none" stroke="${C.mist}" stroke-opacity="0.5" stroke-width="3"/>${ln("M300 11 l26 0", 0.5)}`;
  const band = () => `<ellipse rx="70" ry="40" fill="none" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="5"/>`;

  const shots = [];
  // 1. Drawer (top-down): opens to reveal everyday clutter, the card half under a receipt.
  shots.push({ id: "drawer", start: 0, end: tWallet, in: "cut", visual: "Original line-art drawer opening; the card is the only colour", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0.1, 1.5)); const off = lerp(-430, 0, k);
      const inner = `<rect x="330" y="150" width="1260" height="780" rx="18" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="3"/>
        <g transform="translate(0 ${off})">
          ${at(470, 300, receipt(), -9)}${at(1200, 640, key(), 18)}${at(520, 760, pen(), -4)}${at(1340, 330, band(), 0)}
          ${at(760, 430, PD.giftCard({ w: 420, balance: 0.62 }), -7)}
          ${at(820, 250, receipt(), 11)}
        </g>
        <rect x="300" y="${lerp(150, -300, k) - 40}" width="1320" height="300" fill="${C.ink}" />
        <rect x="300" y="${lerp(150, -300, k) + 250}" width="1320" height="10" fill="${C.mist}" opacity="0.25"/>`;
      return svg(defs() + cam(p(lt, 0, tWallet), 1.0, 1.05, inner) + vignette(), C.ink); } });
  // 2. Wallet (match cut on the card): the same card rises out of a card slot.
  shots.push({ id: "wallet", start: tWallet, end: tCoat, in: "cut", visual: "Original line-art open wallet; same card in a slot (match cut)", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0, 0.9));
      const inner = `<rect x="420" y="250" width="1080" height="600" rx="40" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="3"/>
        ${ln("M960 262 V838", 0.3)}
        ${at(1010 + 30, 400 - lerp(0, 70, k), PD.giftCard({ w: 400, balance: 0.62 }), 0)}
        ${[470, 560, 650].map((y) => `<path d="M1000 ${y} H1460 V${y + 230} H1000 Z" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="3"/>`).join("")}
        ${ln("M520 380 H880 M520 430 H800", 0.25)}`;
      return svg(defs() + cam(p(lt, 0, 1.4), 1.02, 1.06, inner) + vignette(), C.ink); } });
  // 3. Coat pocket: stitched fabric, the card peeking out.
  shots.push({ id: "pocket", start: tCoat, end: tThere, in: "cut", visual: "Original line-art coat pocket; same card peeking out", asset: "original vector illustration", license: "owned",
    draw: (lt) => { const k = E.out(p(lt, 0, 0.9));
      const inner = `<rect width="1920" height="1080" fill="#1a1d22"/>${ln("M300 0 L760 1080", 0.25, 4)}${ln("M340 0 L800 1080", 0.18, 2)}
        ${at(1040, 470 - lerp(0, 90, k), PD.giftCard({ w: 400, balance: 0.62 }), 6)}
        <path d="M880 560 H1580 L1540 980 H920 Z" fill="#1a1d22" stroke="${C.mist}" stroke-opacity="0.45" stroke-width="3"/>
        <path d="M900 585 H1560" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="2.5" stroke-dasharray="10 9"/>`;
      return svg(defs() + cam(p(lt, 0, 1.6), 1.0, 1.04, inner) + vignette(), C.ink); } });
  // 4. The card comes forward; its unspent-balance meter glows on "money still on it"; then holds,
  //    turning slightly toward the viewer on "Maybe it's yours."
  shots.push({ id: "card", start: tThere, end: s(2).start, in: "fade", inDur: 0.3, visual: "Card moves to centre; unspent-balance meter (no amount printed); slow 3D turn", asset: "original vector illustration", license: "owned",
    draw: (lt, t) => { const k = E.inOut(p(lt, 0, 1.1)); const cw = lerp(520, 820, k); const ch = cw / 1.586;
      const fill = 0.62 * E.out(p(t, tMoney, tMoney + 0.9)) + 0.0; const glow = p(t, tMoney, tMoney + 0.6) * (1 - p(t, s(1).end, s(1).end + 0.6));
      const ry = lerp(-16, 9, E.inOut(p(lt, 0, s(2).start - tThere))); const rot = lerp(10, 0, k);
      const sheen = p(t, s(1).start, s(1).start + 1.2);
      const card = `<div style="position:absolute;left:${960 - cw / 2}px;top:${lerp(640, 540, k) - ch / 2}px;width:${cw}px;height:${ch}px;transform:perspective(1600px) rotateY(${ry}deg) rotate(${rot}deg);">
        <svg width="${cw}" height="${ch + 60}" viewBox="0 0 ${cw} ${ch + 60}" style="overflow:visible">${defs()}${PD.giftCard({ w: cw, balance: Math.max(0.0, fill), glow, sheen })}</svg></div>`;
      return `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, #22262d 0%, ${C.ink} 70%)"></div>${card}<div style="position:absolute;inset:0">${svg(defs() + vignette())}</div>`; } });
  // 5. 43%: unit chart of 100 adults, 43 filled; survey method chips on the source sentence.
  const grid = (i) => ({ x: 1080 + (i % 10) * 68, y: 250 + Math.floor(i / 10) * 68 });
  shots.push({ id: "share", start: s(2).start, end: s(4).start, in: "fade", inDur: 0.35, visual: "Unit chart: 100 dots, 43 filled; count-up 0-43%; survey method chips", asset: "original data graphic (claim c8)", license: "owned",
    draw: (lt, t) => { const t0 = s(2).start; const n = Math.round(43 * E.out(p(t, t0 + 0.1, t0 + 1.1)));
      const dots = Array.from({ length: 100 }, (_, i) => { const g = grid(i); const app = E.out(p(t, t0 + i * 0.004, t0 + 0.3 + i * 0.004)); const fill = i < 43 && p(t, t0 + 0.25 + i * 0.03, t0 + 0.4 + i * 0.03) > 0;
        return `<circle cx="${g.x}" cy="${g.y}" r="${23 * app}" fill="${fill ? C.signal : "none"}" stroke="${fill ? C.signal : C.mist}" stroke-opacity="${fill ? 1 : 0.35}" stroke-width="2.5"/>`; }).join("");
      const lab = 1 - 0.55 * p(t, s(3).start, s(3).start + 0.5);
      const chips = [["BANKRATE SURVEY", w(3, "bankrate")], ["ONLINE, BY YOUGOV", w(3, "yougov")], ["AUG 19-21, 2024", w(3, "august")], ["2,373 US ADULTS", w(3, "two thousand")]].map(([txt, ct], i) => {
        const a = E.out(p(t, ct - 0.1, ct + 0.35)); const cx = 160 + [0, 330, 0, 310][i]; const y = i < 2 ? 740 : 822;
        return `<g opacity="${a}" transform="translate(${cx} ${lerp(y + 20, y, a)})"><rect width="${[300, 330, 290, 290][i]}" height="62" rx="31" fill="none" stroke="${C.mist}" stroke-opacity="0.6" stroke-width="2"/>${PD.label([300, 330, 290, 290][i] / 2, 40, txt, { size: 22, fill: C.text, anchor: "middle", ls: 2.5 })}</g>`; }).join("");
      const hl = [w(2, "holding"), w(2, "unused"), w(2, "or store")].map((ct) => 0.45 + 0.55 * E.out(p(t, ct - 0.1, ct + 0.4)));
      const body = `${PD.number(150, 470, `${n}%`, { size: 250, fill: C.signal })}
        ${["of US adults hold at least one", "unused gift card, voucher", "or store credit"].map((l, i) => PD.lines(160, 560 + i * 52, [l], { size: 40, op: lab * hl[i] })).join("")}
        ${dots}${chips}`;
      return svg(defs() + cam(p(lt, 0, s(4).start - t0), 1.0, 1.025, body, 960, 560) + `
        ${PD.source(SRC_SURVEY, 1 - p(t, s(3).start, s(3).start + 0.4) + p(t, s(4).start - 0.3, s(4).start))}
        ${PD.label(1080 + 4.5 * 68, 250 + 10 * 68 + 10, "EACH DOT = 1 IN 100 ADULTS", { size: 22, anchor: "middle", op: 0.75 * p(t, t0 + 0.8, t0 + 1.4) })}` + vignette(), C.ink); } });
  // 6. ~$27 billion: the 43 dots converge into the figure; then it is marked as an estimate and placed
  //    on an order-of-magnitude ruler ("the scale, not the exact amount").
  shots.push({ id: "total", start: s(4).start, end: s(6).start, in: "cut", visual: "Dots converge into ~$27B; ESTIMATE stamp; log-scale ruler showing scale, not precision", asset: "original data graphic (claim c8)", license: "owned",
    draw: (lt, t) => { const t0 = s(4).start; const conv = E.inOut(p(lt, 0.0, 0.8)); const numIn = E.back(p(t, w(4, "national") - 0.1, w(4, "national") + 0.5));
      const dots = Array.from({ length: 100 }, (_, i) => { const g = grid(i); if (i >= 43) return `<circle cx="${g.x}" cy="${g.y}" r="23" fill="none" stroke="${C.mist}" stroke-opacity="${0.35 * (1 - p(lt, 0, 0.35))}" stroke-width="2.5"/>`;
        const x = lerp(g.x, 960, conv), y = lerp(g.y, 430, conv); const breathe = 1 + 0.25 * Math.sin(lt * 5) * p(lt, 0.8, 1.0); return `<circle cx="${x}" cy="${y}" r="${23 * (1 - conv * 0.9) * breathe + 30 * p(lt, 0.8, 1.6)}" fill="${C.signal}" opacity="${(i === 0 ? 1 : 1 - p(lt, 0.65, 0.85)) * (1 - clamp(numIn * 1.6))}"/>`; }).join("");
      const old = 1 - p(lt, 0, 0.3); const blur = 3.5 * E.inOut(p(t, w(5, "the scale"), w(5, "the scale") + 0.8));
      const stamp = E.back(p(t, w(5, "estimate") - 0.05, w(5, "estimate") + 0.3)); const box = p(t, w(5, "not a count") - 0.1, w(5, "not a count") + 0.5);
      const method = E.out(p(t, w(5, "doesn't publish"), w(5, "doesn't publish") + 0.5)); const ruler = E.out(p(t, w(5, "the scale") - 0.3, w(5, "the scale") + 0.6));
      const rx = (v) => 460 + 1000 * (Math.log10(v) / 2); // $1B..$100B
      const band = `<defs><radialGradient id="band"><stop offset="0" stop-color="${C.signal}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.signal}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${rx(27)}" cy="830" rx="${70 * ruler}" ry="34" fill="url(#band)"/>`;
      return svg(defs() + `<g transform="translate(960 470) scale(${lerp(1, 1.03, p(lt, 0, s(6).start - t0))}) translate(-960 -470)">
        <g opacity="${old}">${PD.number(150, 470, "43%", { size: 250, fill: C.signal })}</g>
        ${dots}
        <g transform="translate(960 430) scale(${lerp(0.9, 1, numIn)}) translate(-960 -430)" opacity="${clamp(numIn)}">
          <g style="filter:blur(${blur}px)">${PD.number(960, 500, "$27 billion", { size: 210, anchor: "middle" })}</g>
          ${PD.label(960, 320, "ABOUT", { size: 30, anchor: "middle", fill: C.mist, ls: 8 })}
          ${PD.label(960, 590, "UNUSED VALUE NATIONWIDE  ·  SURVEY ESTIMATE", { size: 24, anchor: "middle", fill: C.mist, ls: 4, op: 0.85 })}
          <rect x="${960 - 560}" y="275" width="1120" height="350" rx="10" fill="none" stroke="${C.mist}" stroke-width="3" stroke-dasharray="14 12" opacity="${0.7 * box}"/>
        </g>
        <g transform="translate(1390 300) rotate(-8) scale(${lerp(1.6, 1, clamp(stamp))})" opacity="${clamp(stamp)}"><rect x="-130" y="-38" width="260" height="76" rx="6" fill="none" stroke="${C.signal}" stroke-width="5"/>${PD.label(0, 13, "ESTIMATE", { size: 38, fill: C.signal, anchor: "middle", ls: 6 })}</g>
        ${PD.label(960, 680, "METHOD NOT PUBLISHED", { size: 24, anchor: "middle", fill: C.text, ls: 5, op: method * (1 - ruler * 0.4) })}
        <g opacity="${ruler}">${band}<line x1="460" y1="830" x2="1460" y2="830" stroke="${C.mist}" stroke-width="3"/>
          ${[1, 10, 100].map((v) => `<line x1="${rx(v)}" y1="808" x2="${rx(v)}" y2="852" stroke="${C.mist}" stroke-width="3"/>${PD.label(rx(v), 900, `$${v}B`, { size: 26, anchor: "middle", fill: C.mist, ls: 1 })}`).join("")}
          ${[2, 3, 4, 5, 6, 7, 8, 9, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => `<line x1="${rx(v)}" y1="820" x2="${rx(v)}" y2="840" stroke="${C.mist}" stroke-opacity="0.5" stroke-width="2"/>`).join("")}
          ${PD.label(1500, 838, "SCALE", { size: 22, fill: C.mist, ls: 5 })}</g></g>
        ${PD.source(SRC_SURVEY, p(lt, 0.3, 0.8) * (1 - ruler * 0))}` + vignette(), C.ink); } });
  // 7. "None of those cards answer": a field of silent card outlines.
  const field = Array.from({ length: 84 }, (_, i) => ({ x: 70 + (i % 12) * 152, y: 120 + Math.floor(i / 12) * 122, d: Math.hypot((i % 12) - 5.5, Math.floor(i / 12) - 3) }));
  shots.push({ id: "field", start: s(6).start, end: s(7).start, in: "fade", inDur: 0.45, visual: "Field of 84 card outlines appearing outward from the centre", asset: "original motion graphic", license: "owned",
    draw: (lt) => svg(defs() + cam(p(lt, 0, 3), 1.04, 1.0, field.map((c) => { const a = E.out(p(lt, c.d * 0.06, c.d * 0.06 + 0.5)); return `<g transform="translate(${c.x} ${c.y})" opacity="${a}">${PD.cardOutline(120, C.mist, 0.3)}</g>`; }).join("")) + vignette(), C.ink) });
  // 8. "Who ends up with it?": one card, three unlabelled destinations (the three claimants are revealed later in the film).
  const dest = [{ x: 330, y: 330 }, { x: 850, y: 270 }, { x: 1370, y: 330 }];
  shots.push({ id: "question", start: s(7).start, end: s(8).start, in: "cut", visual: "One card, three dashed paths to three unlabelled boxes; headline question", asset: "original motion graphic", license: "owned",
    draw: (lt, t) => { const cw = 300; const fadeField = 1 - p(lt, 0, 0.5); const head = E.out(p(t, w(7, "who ends") - 0.2, w(7, "who ends") + 0.4));
      const paths = dest.map((d, i) => { const k = E.inOut(p(t, w(7, "who ends") - 0.6 + i * 0.12, w(7, "who ends") + 0.3 + i * 0.12)); const x0 = 960, y0 = 720; const x1 = d.x + 110, y1 = d.y + 150;
        return `${PD.path(`M${x0} ${y0} C ${x0} ${(y0 + y1) / 2}, ${x1} ${(y0 + y1) / 2 + 60}, ${x1} ${y1}`, 900, k, { stroke: C.mist, width: 3, op: 0.7 })}
          <g opacity="${p(k, 0.7, 1)}" transform="translate(${d.x} ${d.y})"><rect width="220" height="140" rx="12" fill="none" stroke="${C.mist}" stroke-width="3" stroke-dasharray="12 10"/>${PD.serif(110, 102, "?", { size: 84, fill: C.mist })}</g>`; }).join("");
      return svg(defs() + `<g opacity="${fadeField}">${field.map((c) => `<g transform="translate(${c.x} ${c.y})">${PD.cardOutline(120, C.mist, 0.3)}</g>`).join("")}</g>
        ${cam(p(lt, 0, s(8).start - s(7).start), 1.0, 1.03, paths + at(960 - cw / 2, 720, PD.giftCard({ w: cw, balance: 0.62 })), 960, 600)}
        ${PD.serif(960, 170, "Who ends up with it?", { size: 76, op: head })}` + vignette(), C.ink); } });
  // 9-10. The filings: typeset cover information of the two 10-Ks (not facsimiles), then the naive answer.
  const doc = (co, fy, x, y, rot, k, hi = 0) => `<g transform="translate(${x} ${lerp(y + 140, y, k)}) rotate(${rot})" opacity="${clamp(k * 1.4)}" filter="url(#soft)">
      <rect width="520" height="680" fill="#fbf8f1"/><rect width="520" height="680" fill="#000" opacity="0" filter="url(#paperTex)"/>
      ${PD.label(260, 70, "UNITED STATES", { size: 15, fill: "#3a3a3a", anchor: "middle", ls: 3 })}
      ${PD.label(260, 96, "SECURITIES AND EXCHANGE COMMISSION", { size: 15, fill: "#3a3a3a", anchor: "middle", ls: 2 })}
      ${PD.label(260, 120, "Washington, D.C. 20549", { size: 14, fill: "#555", anchor: "middle", ls: 0.5, weight: 500 })}
      <line x1="60" y1="160" x2="460" y2="160" stroke="#222" stroke-width="2"/>
      <rect x="80" y="196" width="${360 * clamp(hi)}" height="74" fill="${C.gold}" opacity="0.45"/>
      ${PD.serif(260, 250, "FORM 10-K", { size: 64, fill: "#141414" })}
      <line x1="60" y1="295" x2="460" y2="295" stroke="#222" stroke-width="2"/>
      ${PD.label(260, 350, "ANNUAL REPORT", { size: 16, fill: "#3a3a3a", anchor: "middle", ls: 3 })}
      ${PD.label(260, 390, "For the fiscal year ended", { size: 20, fill: "#333", anchor: "middle", ls: 0.5, weight: 500 })}
      ${PD.label(260, 424, fy, { size: 24, fill: "#141414", anchor: "middle", ls: 0.5, weight: 700 })}
      ${PD.serif(260, 540, co, { size: 40, fill: "#141414" })}
      ${[600, 620, 640].map((yy) => `<line x1="90" y1="${yy}" x2="${yy === 640 ? 330 : 430}" y2="${yy}" stroke="#bbb" stroke-width="3"/>`).join("")}</g>`;
  shots.push({ id: "filings", start: s(8).start, end: tEnd + 1.6, in: "fade", inDur: 0.35, visual: "Typeset 10-K cover information (Starbucks FY2025, Darden FY2026); then the naive answer in quotes, 'just' circled", asset: "original typography from public filing metadata (dossier s1, s2)", license: "owned (facts from public SEC filings; no logos, no facsimile)",
    draw: (lt, t) => { const a = E.out(p(t, s(8).start + 0.15, s(8).start + 0.95)); const b = E.out(p(t, w(9, "darden") - 0.2, w(9, "darden") + 0.6));
      const og = E.out(p(t, w(9, "olive garden") - 0.1, w(9, "olive garden") + 0.4)); const head = E.out(p(lt, 0.1, 0.8));
      const q = E.out(p(t, w(10, "the store") - 0.25, w(10, "the store") + 0.35)); const dimDocs = 0.93 * q;
      const circ = E.inOut(p(t, w(10, "just") - 0.05, w(10, "just") + 0.55)); const fadeOut = p(t, tEnd + 0.9, tEnd + 1.6);
      return svg(defs() + `<rect width="1920" height="1080" fill="${C.paper}"/><rect width="1920" height="1080" fill="#000" opacity="0.5" filter="url(#paperTex)"/>
        ${PD.label(960, 110, "WHAT THE COMPANIES TOLD REGULATORS", { size: 26, fill: C.ledger, anchor: "middle", ls: 6, op: head * (1 - q) })}
        ${cam(p(t, s(8).start, w(10, "the store")), 1.0, 1.04, doc("Starbucks Corporation", "September 28, 2025", 330, 190, -2, a, E.inOut(p(t, w(9, "annual filings") - 0.1, w(9, "annual filings") + 0.5))) + doc("Darden Restaurants, Inc.", "May 31, 2026", 1070, 200, 1.6, b, E.inOut(p(t, w(9, "annual filings") + 0.15, w(9, "annual filings") + 0.75))), 960, 560)}
        ${PD.label(1330, 950, "PARENT COMPANY OF OLIVE GARDEN", { size: 22, fill: C.ink, anchor: "middle", ls: 4, op: og * (1 - q) })}
        ${PD.label(960, 1040, "Typeset from the filings' cover information on SEC EDGAR  ·  not facsimiles", { size: 20, fill: "#6b675d", anchor: "middle", ls: 1, weight: 500, op: a * (1 - q) })}
        <rect width="1920" height="1080" fill="${C.paper}" opacity="${dimDocs}"/>
        <g opacity="${q}" transform="translate(0 ${lerp(20, 0, q)})">${PD.serif(960, 580, "“The store just keeps it.”", { size: 96, fill: C.ink, italic: true })}</g>
        ${(() => { const q1 = "\u201CThe store ", q2 = "just", full = "\u201CThe store just keeps it.\u201D"; const o = { size: 96, family: F.serif, italic: true };
          const x0 = 960 - PD.measure(full, o) / 2 + PD.measure(q1, o); const jw = PD.measure(q2, o); const cx = x0 + jw / 2, cy = 548, rx = jw / 2 + 26, ry = 62;
          return PD.path(`M ${cx + rx * 0.2} ${cy + ry} C ${cx - rx * 1.25} ${cy + ry}, ${cx - rx * 1.25} ${cy - ry}, ${cx} ${cy - ry} C ${cx + rx * 1.3} ${cy - ry}, ${cx + rx * 1.25} ${cy + ry * 1.05}, ${cx - rx * 0.15} ${cy + ry * 1.08}`, 900, circ, { stroke: C.signal, width: 6 }); })()}
        <rect width="1920" height="1080" fill="${C.ink}" opacity="${fadeOut}"/>`); } });
  return { shots, duration: tEnd + 1.6 };
};
