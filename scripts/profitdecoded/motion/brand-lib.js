// ProfitDecoded motion library (runs in the browser page built by render-motion.js).
// Reusable brand components: every component is a pure function of its inputs (no clocks, no CSS
// animations), so frame N always renders the same image. Colours come from channels/profitdecoded/brand.json.
(function () {
  const C = { ink: "#14161a", ink2: "#1d2026", ink3: "#2a2d33", text: "#f7f3ea", paper: "#f4efe6", signal: "#e8553d", ledger: "#2f5d62", gold: "#c99a2e", mist: "#d9d4c7", muted: "#8d8a82" };
  // Open-licence fonts (SIL OFL 1.1), embedded by fonts.js: Source Serif 4, Inter, Barlow Semi Condensed.
  // No system-font fallback by name: a missing face fails the render (fonts.PAGE_CHECK).
  const F = { serif: "'PD Serif', serif", sans: "'PD Sans', sans-serif", num: "'PD Num', sans-serif" };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const p = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
  const E = {
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    back: (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const PD = { C, F, E, clamp, lerp, p, esc, tl: [], shots: [] };
  // Timing from the measured narration: sentence k, and the estimated start of a phrase inside it
  // (proportional to spoken characters; the TTS reports sentence timings only).
  PD.s = (k) => PD.tl[k];
  PD.w = (k, phrase) => {
    const s = PD.tl[k]; const src = (s.spoken || s.text).toLowerCase(); let i = src.indexOf(String(phrase).toLowerCase());
    if (i < 0) { const alt = s.text.toLowerCase(); const j = alt.indexOf(String(phrase).toLowerCase()); if (j < 0) throw new Error(`phrase "${phrase}" not in sentence ${k}`); i = Math.round(j / alt.length * src.length); }
    return s.start + (s.end - s.start) * (i / src.length);
  };

  // Beat-addressed timing (long films): the beat's span, its n-th sentence, and a phrase anywhere inside the beat.
  PD.bss = (id) => { const ss = PD.tl.filter((x) => x.beatId === id); if (!ss.length) throw new Error(`beat ${id} not in the timeline`); return ss; };
  PD.b = (id) => { const ss = PD.bss(id); return { start: ss[0].start, end: ss[ss.length - 1].end }; };
  PD.bs = (id, n = 0) => PD.bss(id)[n];
  PD.bw = (id, phrase) => { const ss = PD.bss(id); for (const s of ss) { const k = PD.tl.indexOf(s); if ((s.spoken || s.text).toLowerCase().includes(String(phrase).toLowerCase()) || s.text.toLowerCase().includes(String(phrase).toLowerCase())) return PD.w(k, phrase); } throw new Error(`phrase "${phrase}" not in beat ${id}`); };

  // ---------- components (SVG strings) ----------
  PD.svg = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${bg ? `<rect width="1920" height="1080" fill="${bg}"/>` : ""}${inner}</svg>`;
  PD.defs = () => `<defs>
    <radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/></filter>
    <filter id="paperTex"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.27  0 0 0 0.07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  </defs>`;
  PD.vignette = () => `<rect width="1920" height="1080" fill="url(#vig)"/>`;

  // Original, unbranded places for everyday examples. These are editorial illustrations,
  // never footage or a representation of a named company's actual premises.
  PD.environment = (kind, t = 0) => {
    const drift = Math.sin(t * 0.32) * 18;
    const sets = {
      desk: { wall: "#51483f", floor: "#8b755e", trim: "#c5a27c" },
      cafe: { wall: "#32484b", floor: "#6a5345", trim: "#d5a670" },
      checkout: { wall: "#38444a", floor: "#594f46", trim: "#bfa380" },
      restaurant: { wall: "#51423e", floor: "#6b5144", trim: "#d3ae81" },
    };
    const s = sets[kind]; if (!s) throw new Error(`unknown environment: ${kind}`);
    const shelf = kind === "checkout" ? `<g opacity="0.55">${[0, 1, 2].map((i) => `<rect x="${80 + i * 230}" y="230" width="180" height="190" rx="6" fill="#9a8268"/><rect x="${95 + i * 230}" y="280" width="150" height="8" fill="#e8d4b5"/><rect x="${95 + i * 230}" y="360" width="150" height="8" fill="#e8d4b5"/>`).join("")}</g>` : "";
    const window = kind === "cafe" || kind === "restaurant" ? `<g transform="translate(${drift} 0)"><rect x="130" y="80" width="650" height="590" rx="14" fill="#789193" opacity="0.42"/><rect x="160" y="110" width="590" height="530" fill="#c7c2a1" opacity="0.24"/><path d="M455 95 V650 M160 385 H750" stroke="#c8b69a" stroke-width="24" opacity="0.68"/></g>` : "";
    const desk = kind === "desk" ? `<g opacity="0.7"><rect x="100" y="145" width="430" height="575" rx="24" fill="#2e302e" transform="rotate(-10 315 430)"/><rect x="1470" y="130" width="190" height="350" rx="14" fill="#d6c7aa" transform="rotate(8 1565 305)"/><circle cx="1660" cy="720" r="95" fill="#d6c7aa"/><circle cx="1660" cy="720" r="61" fill="#51483f"/></g>` : "";
    const lamp = kind === "restaurant" ? `<path d="M1320 0 V220 M1190 220 H1450 L1390 345 H1250 Z" fill="#d0aa72" opacity="0.65"/><ellipse cx="1320" cy="355" rx="285" ry="55" fill="#e8bd79" opacity="0.13"/>` : "";
    return `<rect width="1920" height="1080" fill="${s.wall}"/><rect y="690" width="1920" height="390" fill="${s.floor}"/><path d="M0 700 H1920" stroke="${s.trim}" stroke-width="18" opacity="0.62"/>${window}${shelf}${desk}${lamp}
      <rect width="1920" height="1080" fill="#10171a" opacity="0.26"/><rect width="1920" height="1080" fill="url(#vig)"/>`;
  };

  // The episode's gift card: original, unbranded design (no real retailer marks).
  // w = width in px; balance = 0..1 fill of the "unspent balance" meter (no amount is ever printed);
  // sheen = 0..1 position of a light sweep (<0 or >1 = off).
  PD.giftCard = ({ w = 560, balance = 1, sheen = -1, glow = 0, dim = 0, base = C.ledger, band = C.signal, meter = true } = {}) => {
    const h = w / 1.586, r = w * 0.045, s = w / 560;
    const sheenX = lerp(-w * 0.6, w * 1.1, clamp(sheen, -0.2, 1.2));
    return `<g filter="url(#soft)" data-role="decorative">
      <clipPath id="cardClip${Math.round(w)}"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
      <g clip-path="url(#cardClip${Math.round(w)})">
        <rect width="${w}" height="${h}" fill="${base}"/>
        <rect x="${w * 0.62}" y="0" width="${w * 0.075}" height="${h}" fill="${band}"/>
        <rect x="0" y="${h * 0.38}" width="${w}" height="${h * 0.075}" fill="${band}"/>
        <circle cx="${w * 0.657}" cy="${h * 0.417}" r="${w * 0.055}" fill="none" stroke="${C.paper}" stroke-width="${3 * s}" opacity="0.9"/>
        <text x="${w * 0.07}" y="${h * 0.2}" font-family="${F.sans}" font-weight="700" font-size="${26 * s}" letter-spacing="${4 * s}" fill="${C.paper}">GIFT CARD</text>
        ${meter ? "" : "<!--"}<text x="${w * 0.07}" y="${h * 0.69}" font-family="${F.sans}" font-weight="600" font-size="${15 * s}" letter-spacing="${2.5 * s}" fill="${C.paper}" opacity="0.8">UNSPENT BALANCE</text>
        <rect x="${w * 0.07}" y="${h * 0.74}" width="${w * 0.5}" height="${12 * s}" rx="${6 * s}" fill="#000" opacity="0.25"/>
        <rect x="${w * 0.07}" y="${h * 0.74}" width="${w * 0.5 * clamp(balance)}" height="${12 * s}" rx="${6 * s}" fill="${C.gold}"/>
${meter ? "" : "-->"}
        ${glow > 0 ? `<rect x="${w * 0.07 - 6 * s}" y="${h * 0.74 - 6 * s}" width="${w * 0.5 * clamp(balance) + 12 * s}" height="${24 * s}" rx="${12 * s}" fill="${C.gold}" opacity="${0.25 * glow}"/>` : ""}
        <rect x="${sheenX}" y="${-h * 0.2}" width="${w * 0.45}" height="${h * 1.4}" fill="url(#sheen)" transform="rotate(14 ${w / 2} ${h / 2})"/>
        ${dim > 0 ? `<rect width="${w}" height="${h}" fill="${C.ink}" opacity="${dim}"/>` : ""}
      </g>
      <rect width="${w}" height="${h}" rx="${r}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="${1.5 * s}"/>
    </g>`;
  };
  PD.cardOutline = (w, stroke = C.mist, op = 0.35, dash = "") => `<rect width="${w}" height="${w / 1.586}" rx="${w * 0.045}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;

  // Small-caps label + source line (bottom left). Every on-screen figure carries one.
  PD.source = (text, k = 1, y = 1016, { dark = true } = {}) => `<g opacity="${k}" data-role="source"><rect x="96" y="${y - 34}" width="5" height="44" fill="${C.signal}"/>
    <text x="120" y="${y - 2}" font-family="${F.sans}" font-weight="500" font-size="30" fill="${dark ? C.text : "#3a372f"}" fill-opacity="${dark ? 0.88 : 1}"><tspan font-weight="700" letter-spacing="3">SOURCE</tspan>  ${esc(text)}</text></g>`;
  // A short, accurate on-screen citation for phone viewing. Keep the full reference in the
  // episode dossier/description; this component does not remove the source qualification.
  PD.sourceCompact = (text, k = 1, { dark = true, y = 1010 } = {}) => `<g opacity="${clamp(k)}" data-role="source"><rect x="94" y="${y - 48}" width="7" height="55" fill="${C.signal}"/>
    <text x="125" y="${y}" font-family="${F.sans}" font-weight="650" font-size="40" fill="${dark ? C.text : "#332f2b"}">${esc(text)}</text></g>`;
  // Reusable documentary evidence card: a figure and its meaning share one visual object.
  // Its large type survives a 640 px wide phone preview; callers supply sourced values.
  PD.evidenceCard = ({ x, y, w = 610, h = 450, kicker, value, detail, k = 1, accent = C.signal, paper = true }) => {
    const fg = paper ? C.ink : C.text, bg = paper ? "#f6f0e5" : C.ink2;
    return `<g opacity="${clamp(k)}" transform="translate(${x} ${lerp(y + 28, y, clamp(k))})" filter="url(#soft)"><rect width="${w}" height="${h}" rx="18" fill="${bg}"/>
      <rect width="${w}" height="16" rx="8" fill="${accent}"/>${PD.label(44, 78, kicker, { size: 34, fill: fg, ls: 2 })}
      ${PD.number(44, 245, value, { size: Math.min(116, (w - 90) / (value.length * 0.59)), fill: fg })}
      <path d="M44 290 H${w - 44}" stroke="${accent}" stroke-width="4" opacity="0.65"/>
      ${PD.label(44, 365, detail, { size: 34, fill: fg, ls: 0.5, weight: 600 })}</g>`;
  };
  PD.label = (x, y, text, { size = 24, fill = C.mist, anchor = "start", op = 1, ls = 4, weight = 700 } = {}) => `<text x="${x}" y="${y}" font-family="${F.sans}" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(text)}</text>`;
  PD.serif = (x, y, text, { size = 84, fill = C.text, anchor = "middle", op = 1, italic = false } = {}) => `<text x="${x}" y="${y}" font-family="${F.serif}" font-weight="700" ${italic ? 'font-style="italic"' : ""} font-size="${size}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(text)}</text>`;
  PD.number = (x, y, text, { size = 220, fill = C.text, anchor = "start", op = 1 } = {}) => `<text x="${x}" y="${y}" font-family="${F.num}" font-weight="600" font-size="${size}" fill="${fill}" text-anchor="${anchor}" opacity="${op}" style="font-variant-numeric: tabular-nums">${esc(text)}</text>`;
  // Multi-line sans paragraph (short lines only: on-screen text never carries the narration).
  PD.lines = (x, y, lines, { size = 38, lh = 1.3, fill = C.text, op = 1, weight = 500, anchor = "start" } = {}) => `<text font-family="${F.sans}" font-weight="${weight}" font-size="${size}" fill="${fill}" opacity="${op}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${x}" y="${y + i * size * lh}">${esc(l)}</tspan>`).join("")}</text>`;
  // Hand-off line drawn progressively (k = 0..1).
  PD.path = (d, len, k, { stroke = C.signal, width = 4, dash = "", op = 1 } = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${dash || k > 0.001 ? op : 0}" ${dash ? `stroke-dasharray="${dash}" ` : `stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - clamp(k))}"`}/>`;

  // Text width in px for layout (canvas measureText: deterministic for a given font and size).
  const cv = document.createElement("canvas").getContext("2d");
  PD.measure = (text, { size = 40, family = F.sans, weight = 700, italic = false } = {}) => { cv.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`; return cv.measureText(text).width; };

  // ---------- reusable documentary components (needed by the gift-card film) ----------
  // Standard timings so every entrance and move feels the same across scenes.
  PD.T = { enter: 0.5, move: 0.8, stagger: 0.12 };
  const ent = (t, at) => E.out(p(t, at, at + PD.T.enter));
  PD.ent = ent;

  // Unit chart: n units in a grid, the first `filled` highlighted (shares: 1 unit = 1%).
  PD.unitPos = (i, { x = 0, y = 0, cols = 10, gap = 68 } = {}) => ({ x: x + (i % cols) * gap, y: y + Math.floor(i / cols) * gap });
  PD.unitChart = ({ x, y, n = 100, filled, cols = 10, gap = 68, r = 23, t, at = 0, fillAt = 0.25, fillStep = 0.03 }) =>
    Array.from({ length: n }, (_, i) => { const g = PD.unitPos(i, { x, y, cols, gap }); const app = E.out(p(t, at + i * 0.004, at + 0.3 + i * 0.004)); const on = i < filled && t >= at + fillAt + i * fillStep;
      return `<circle cx="${g.x}" cy="${g.y}" r="${r * app}" fill="${on ? C.signal : "none"}" stroke="${on ? C.signal : C.mist}" stroke-opacity="${on ? 1 : 0.4}" stroke-width="2.5"/>`; }).join("");

  // Fact chips (method, date, sample...), laid out by measured text width and wrapped to rows.
  PD.chips = (items, { x, y, maxW = 860, size = 26, t }) => {
    let cx = x, cy = y; const h = size * 2.5;
    return items.map(([txt, at]) => { const wd = PD.measure(txt, { size, family: F.sans, weight: 700 }) + txt.length * 2.5 + size * 1.6;
      if (cx + wd > x + maxW) { cx = x; cy += h + 16; } const gx = cx; cx += wd + 18; const a = ent(t, at - 0.1);
      return `<g opacity="${a}" transform="translate(${gx} ${lerp(cy + 18, cy, a)})"><rect width="${wd}" height="${h}" rx="${h / 2}" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.7" stroke-width="2"/>${PD.label(wd / 2, h / 2 + size * 0.36, txt, { size, fill: C.text, anchor: "middle", ls: 2.5 })}</g>`; }).join("");
  };

  // Rubber stamp for qualifiers such as ESTIMATE (k = 0..1 entrance, with overshoot).
  PD.stamp = (x, y, text, k, { rot = -8, size = 40, color = C.signal } = {}) => { const wd = PD.measure(text, { size, family: F.sans, weight: 700 }) + text.length * 6 + 60;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${lerp(1.6, 1, clamp(k))})" opacity="${clamp(k)}"><rect x="${-wd / 2}" y="${-size}" width="${wd}" height="${size * 2}" rx="6" fill="none" stroke="${color}" stroke-width="5"/>${PD.label(0, size * 0.36, text, { size, fill: color, anchor: "middle", ls: 6 })}</g>`; };

  // Order-of-magnitude ruler (log scale) with a soft band at the value: shows scale, not precision.
  PD.logRuler = ({ x0 = 460, x1 = 1460, y = 830, min = 1, max = 100, value, k, unit = (v) => `$${v}B`, label = "SCALE" }) => {
    const span = Math.log10(max / min); const rx = (v) => x0 + (x1 - x0) * (Math.log10(v / min) / span); const ticks = [];
    for (let d = min; d <= max; d *= 10) { ticks.push(`<line x1="${rx(d)}" y1="${y - 24}" x2="${rx(d)}" y2="${y + 24}" stroke="${C.mist}" stroke-width="3"/>${PD.label(rx(d), y + 72, unit(d), { size: 30, anchor: "middle", fill: C.text, ls: 1 })}`);
      if (d < max) for (let m = 2; m < 10; m += 1) ticks.push(`<line x1="${rx(d * m)}" y1="${y - 11}" x2="${rx(d * m)}" y2="${y + 11}" stroke="${C.mist}" stroke-opacity="0.5" stroke-width="2"/>`); }
    return `<g opacity="${k}"><defs><radialGradient id="rband"><stop offset="0" stop-color="${C.signal}" stop-opacity="0.8"/><stop offset="1" stop-color="${C.signal}" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="${rx(value)}" cy="${y}" rx="${80 * k}" ry="38" fill="url(#rband)"/><line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.mist}" stroke-width="3"/>${ticks.join("")}
      ${PD.label(x1 + 44, y + 9, label, { size: 26, fill: C.mist, ls: 5 })}</g>`;
  };

  // Typeset cover information of a public filing (a labelled recreation, never a facsimile).
  // hi = 0..1 highlighter sweep over the form name.
  PD.docCover = ({ co, fy, form = "FORM 10-K", x, y, rot = 0, k = 1, hi = 0 }) => `<g transform="translate(${x} ${lerp(y + 140, y, k)}) rotate(${rot})" opacity="${clamp(k * 1.4)}" filter="url(#soft)">
      <rect width="520" height="680" fill="#fbf8f1"/>
      <g data-role="decorative">${PD.label(260, 70, "UNITED STATES", { size: 16, fill: "#3a3a3a", anchor: "middle", ls: 3 })}
      ${PD.label(260, 98, "SECURITIES AND EXCHANGE COMMISSION", { size: 16, fill: "#3a3a3a", anchor: "middle", ls: 1.5 })}
      ${PD.label(260, 124, "Washington, D.C. 20549", { size: 15, fill: "#555", anchor: "middle", ls: 0.5, weight: 500 })}</g>
      <line x1="60" y1="160" x2="460" y2="160" stroke="#222" stroke-width="2"/>
      <rect x="70" y="196" width="${380 * clamp(hi)}" height="74" fill="${C.gold}" opacity="0.45"/>
      ${PD.serif(260, 252, form, { size: 64, fill: "#141414" })}
      <line x1="60" y1="295" x2="460" y2="295" stroke="#222" stroke-width="2"/>
      <g data-role="decorative">${PD.label(260, 350, "ANNUAL REPORT", { size: 18, fill: "#3a3a3a", anchor: "middle", ls: 3 })}
      ${PD.label(260, 392, "For the fiscal year ended", { size: 22, fill: "#333", anchor: "middle", ls: 0.3, weight: 500 })}</g>
      ${PD.label(260, 430, fy, { size: 28, fill: "#141414", anchor: "middle", ls: 0.3, weight: 700 })}
      ${PD.serif(260, 548, co, { size: co.length > 22 ? 36 : 42, fill: "#141414" })}
      ${[604, 624, 644].map((yy) => `<line x1="90" y1="${yy}" x2="${yy === 644 ? 330 : 430}" y2="${yy}" stroke="#bbb" stroke-width="3"/>`).join("")}</g>`;

  // Excerpt from a filing or regulation: the exact quoted words on paper, the key phrase highlighted,
  // the citation underneath. k = entrance, hk = highlight sweep.
  PD.filingQuote = ({ x = 260, y = 250, w = 1400, quote, highlight = "", cite, k = 1, hk = 0, size = 54 }) => {
    const o = { size, family: F.serif, weight: 600 }; const words = quote.split(/\s+/); const lines = []; let l = "";
    for (const wd of words) { const tryL = (l + " " + wd).trim(); if (PD.measure(tryL, o) > w - 160 && l) { lines.push(l); l = wd; } else l = tryL; }
    lines.push(l); const lh = size * 1.32; const h = lines.length * lh + 190;
    // character range of the highlighted phrase in the re-joined text, mapped onto each wrapped line
    const joined = lines.join(" "); const hs = highlight ? joined.indexOf(highlight) : -1; const he = hs + highlight.length; let off = 0;
    const rows = lines.map((ln2, i) => { const a = off, b = off + ln2.length; off = b + 1; const yy = 110 + i * lh; let mark = "";
      if (hs >= 0 && hs < b && he > a) { const s0 = Math.max(hs, a) - a, s1 = Math.min(he, b) - a; const x0 = PD.measure(ln2.slice(0, s0), o), x1 = PD.measure(ln2.slice(0, s1), o);
        mark = `<rect x="${84 + x0 - 6}" y="${yy - size * 0.95}" width="${(x1 - x0 + 12) * clamp(hk)}" height="${size * 1.2}" fill="${C.gold}" opacity="0.42"/>`; }
      return `${mark}<text x="84" y="${yy}" font-family="${F.serif}" font-weight="600" font-size="${size}" fill="#141414">${esc(ln2)}</text>`; }).join("");
    return `<g transform="translate(${x} ${lerp(y + 40, y, k)})" opacity="${k}" filter="url(#soft)"><rect width="${w}" height="${h}" fill="#fbf8f1"/><rect width="10" height="${h}" fill="${C.signal}"/>
      ${rows}<g data-role="source">${PD.label(84, h - 46, cite, { size: 26, fill: "#4a463e", ls: 1.5, weight: 600 })}</g></g>`;
  };

  // Bar chart for a short series (years, survey answers). Values animate up on k; labels never overlap bars.
  PD.barChart = ({ x = 360, y = 220, w = 1200, h = 560, series, k = 1, fmt = (v) => String(v), highlight = -1, unitLabel = "" }) => {
    const max = Math.max(...series.map((d) => d.value)) * 1.12; const bw = Math.min(220, (w / series.length) * 0.56); const step = w / series.length;
    return `<g>${unitLabel ? PD.label(x, y - 30, unitLabel, { size: 26, fill: C.mist, ls: 3 }) : ""}<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="${C.mist}" stroke-opacity="0.6" stroke-width="3"/>
      ${series.map((d, i) => { const kk = E.out(clamp(k * series.length - i * 0.6)); const bh = (d.value / max) * h * kk; const bx = x + step * i + (step - bw) / 2; const col = i === highlight ? C.signal : C.ledger;
        return `<rect x="${bx}" y="${y + h - bh}" width="${bw}" height="${bh}" fill="${col}"/>${PD.number(bx + bw / 2, y + h - bh - 22, fmt(d.value * (kk >= 0.999 ? 1 : kk)), { size: 58, anchor: "middle", fill: C.text, op: kk })}${PD.label(bx + bw / 2, y + h + 52, d.label, { size: 28, anchor: "middle", fill: C.text, ls: 2 })}`; }).join("")}</g>`;
  };

  // Horizontal timeline with marks at fractions 0..1 (k = draw progress; marks appear as the line reaches them).
  PD.timeline = ({ x0 = 260, x1 = 1660, y = 560, marks, k = 1 }) => `<g><line x1="${x0}" y1="${y}" x2="${lerp(x0, x1, clamp(k))}" y2="${y}" stroke="${C.mist}" stroke-width="5" stroke-linecap="round"/>
    ${marks.map((m, i) => { const mx = lerp(x0, x1, m.at); const a = clamp((k - m.at + 0.08) / 0.08); const up = i % 2 === 0;
      return `<g opacity="${a}"><circle cx="${mx}" cy="${y}" r="${16 * a}" fill="${m.accent ? C.signal : C.text}"/>${PD.label(mx, up ? y - 54 : y + 78, m.label, { size: 32, anchor: "middle", fill: C.text, ls: 1.5 })}${m.sub ? PD.label(mx, up ? y - 96 : y + 118, m.sub, { size: 24, anchor: "middle", fill: C.mist, ls: 1.5, weight: 600 }) : ""}</g>`; }).join("")}</g>`;

  // Money flow: boxes joined by flowing links (moving dashes show direction). t drives the flow.
  PD.moneyFlow = ({ nodes, links, t, k = 1 }) => {
    const box = (n) => { const wd = Math.max(260, PD.measure(n.label, { size: 32, family: F.sans, weight: 700 }) + 70);
      return `<g transform="translate(${n.x - wd / 2} ${n.y - 60})"><rect width="${wd}" height="120" rx="16" fill="${n.accent ? C.signal : C.ink2}" stroke="${n.accent ? C.signal : C.mist}" stroke-opacity="0.8" stroke-width="3"/>${PD.label(wd / 2, 72, n.label, { size: 32, anchor: "middle", fill: n.accent ? C.ink : C.text, ls: 1.5 })}${n.sub ? PD.label(wd / 2, 160, n.sub, { size: 24, anchor: "middle", fill: C.mist, ls: 1.5, weight: 600 }) : ""}</g>`; };
    const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const link = (l, i) => { const a = by[l.from], b = by[l.to]; const kk = clamp(k * links.length - i); const d = `M${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
      return `<g opacity="${kk}"><path d="${d}" fill="none" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="${l.width || 10}"/><path d="${d}" fill="none" stroke="${l.accent ? C.signal : C.gold}" stroke-width="${(l.width || 10) * 0.5}" stroke-dasharray="14 22" stroke-dashoffset="${-t * 60}"/>
        ${l.label ? PD.label((a.x + b.x) / 2, (a.y + b.y) / 2 - 36, l.label, { size: 26, anchor: "middle", fill: C.text, ls: 1.5 }) : ""}</g>`; };
    return `<g>${links.map(link).join("")}${nodes.map((n, i) => `<g opacity="${clamp(k * nodes.length - i * 0.5)}">${box(n)}</g>`).join("")}</g>`;
  };

  // Side-by-side comparison panels (e.g. "on paper" vs "in practice"). k staggers the columns.
  PD.compare = ({ x = 160, y = 220, w = 1600, h = 600, columns, k = 1 }) => { const gap = 40; const cw = (w - gap * (columns.length - 1)) / columns.length;
    return `<g>${columns.map((c, i) => { const a = E.out(clamp(k * columns.length - i)); const cx = x + i * (cw + gap);
      return `<g opacity="${a}" transform="translate(${cx} ${lerp(y + 30, y, a)})"><rect width="${cw}" height="${h}" rx="18" fill="${C.ink2}" stroke="${c.accent ? C.signal : C.mist}" stroke-opacity="${c.accent ? 1 : 0.5}" stroke-width="3"/>
        ${PD.label(40, 70, c.kicker, { size: 26, fill: c.accent ? C.signal : C.mist, ls: 4 })}${PD.serif(40, 160, c.title, { size: 54, anchor: "start" })}${PD.lines(40, 250, c.body, { size: 34, fill: C.text, op: 0.92 })}</g>`; }).join("")}</g>`; };

  // One-line statement in the headline serif (typography beats: "Not counted. Predicted.").
  PD.statement = (text, { y = 560, size = 96, k = 1, accent = "" } = {}) => { const parts = accent && text.includes(accent) ? text.split(accent) : [text];
    return `<text x="960" y="${lerp(y + 24, y, k)}" font-family="${F.serif}" font-weight="700" font-size="${size}" fill="${C.text}" text-anchor="middle" opacity="${k}">${esc(parts[0])}${parts.length > 1 ? `<tspan fill="${C.signal}">${esc(accent)}</tspan>${esc(parts[1])}` : ""}</text>`; };

  // ---------- shot engine ----------
  // A shot: {id, start, end, in: 'cut'|'fade'|'dip', inDur, draw(t) -> HTML}. Overlaps render both.
  PD.init = (timeline, audioDur) => {
    PD.tl = timeline; PD.audioDur = audioDur;
    const spec = window.SCENES(PD); PD.shots = spec.shots; PD.duration = spec.duration;
    const stage = document.getElementById("stage");
    stage.innerHTML = PD.shots.map((s, i) => `<div class="layer" id="L${i}" style="display:none"></div>`).join("") + `<div class="layer" id="Lover"></div>`;
    return { duration: PD.duration, shots: PD.shots.map((s) => ({ id: s.id, start: +s.start.toFixed(2), end: +s.end.toFixed(2), in: s.in || "cut", visual: s.visual, asset: s.asset, license: s.license,
      category: s.category, background: s.background, layout: s.layout, textWeight: s.textWeight, motion: s.motion,
      sourceQualified: s.sourceQualified, semanticAnchor: s.semanticAnchor })) };
  };
  PD.frame = (t) => {
    PD.shots.forEach((s, i) => {
      const el = document.getElementById("L" + i); const inDur = s.inDur || (s.in === "cut" ? 0 : 0.4);
      const next = PD.shots[i + 1]; const nextIn = next ? (next.inDur || (next.in === "cut" ? 0 : 0.4)) : 0;
      const visible = t >= s.start - (s.in === "dip" ? inDur : 0) && t < s.end + (next && next.in === "fade" ? nextIn : 0);
      if (!visible) { el.style.display = "none"; return; }
      let op = 1;
      if (s.in === "fade" && inDur > 0) op = E.inOut(p(t, s.start, s.start + inDur));
      if (s.in === "dip" && inDur > 0) op = t < s.start ? 0 : E.inOut(p(t, s.start, s.start + inDur));
      el.style.display = "block"; el.style.opacity = op; el.style.zIndex = i;
      // SVG ids (clip paths, filters, gradients) are made unique per layer: a duplicate id inside a hidden
      // layer would otherwise capture the reference and blank the visible element.
      el.innerHTML = s.draw(t - s.start, t).replace(/id="([^"]+)"/g, `id="$1_L${i}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_L${i})`);
    });
    const over = document.getElementById("Lover"); over.style.zIndex = 999; over.innerHTML = window.OVERLAY ? window.OVERLAY(t) : "";
  };
  window.PD = PD;
})();
