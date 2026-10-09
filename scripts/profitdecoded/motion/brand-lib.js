// ProfitDecoded motion library (runs in the browser page built by render-motion.js).
// Reusable brand components: every component is a pure function of its inputs (no clocks, no CSS
// animations), so frame N always renders the same image. Colours come from channels/profitdecoded/brand.json.
(function () {
  const C = { ink: "#14161a", ink2: "#1d2026", ink3: "#2a2d33", text: "#f7f3ea", paper: "#f4efe6", signal: "#e8553d", ledger: "#2f5d62", gold: "#c99a2e", mist: "#d9d4c7", muted: "#8d8a82" };
  // Prototype fonts are macOS system fonts (internal test only). Production must vendor OFL fonts (see docs).
  const F = { serif: "Georgia, 'Times New Roman', serif", sans: "'Avenir Next', 'Helvetica Neue', Arial, sans-serif", num: "'DIN Alternate', 'Avenir Next', sans-serif" };
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

  // ---------- components (SVG strings) ----------
  PD.svg = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${bg ? `<rect width="1920" height="1080" fill="${bg}"/>` : ""}${inner}</svg>`;
  PD.defs = () => `<defs>
    <radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/></filter>
    <filter id="paperTex"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.27  0 0 0 0.07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  </defs>`;
  PD.vignette = () => `<rect width="1920" height="1080" fill="url(#vig)"/>`;

  // The episode's gift card: original, unbranded design (no real retailer marks).
  // w = width in px; balance = 0..1 fill of the "unspent balance" meter (no amount is ever printed);
  // sheen = 0..1 position of a light sweep (<0 or >1 = off).
  PD.giftCard = ({ w = 560, balance = 1, sheen = -1, glow = 0, dim = 0 } = {}) => {
    const h = w / 1.586, r = w * 0.045, s = w / 560;
    const sheenX = lerp(-w * 0.6, w * 1.1, clamp(sheen, -0.2, 1.2));
    return `<g filter="url(#soft)">
      <clipPath id="cardClip${Math.round(w)}"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
      <g clip-path="url(#cardClip${Math.round(w)})">
        <rect width="${w}" height="${h}" fill="${C.ledger}"/>
        <rect x="${w * 0.62}" y="0" width="${w * 0.075}" height="${h}" fill="${C.signal}"/>
        <rect x="0" y="${h * 0.38}" width="${w}" height="${h * 0.075}" fill="${C.signal}"/>
        <circle cx="${w * 0.657}" cy="${h * 0.417}" r="${w * 0.055}" fill="none" stroke="${C.paper}" stroke-width="${3 * s}" opacity="0.9"/>
        <text x="${w * 0.07}" y="${h * 0.2}" font-family="${F.sans}" font-weight="700" font-size="${26 * s}" letter-spacing="${4 * s}" fill="${C.paper}">GIFT CARD</text>
        <text x="${w * 0.07}" y="${h * 0.69}" font-family="${F.sans}" font-weight="600" font-size="${15 * s}" letter-spacing="${2.5 * s}" fill="${C.paper}" opacity="0.8">UNSPENT BALANCE</text>
        <rect x="${w * 0.07}" y="${h * 0.74}" width="${w * 0.5}" height="${12 * s}" rx="${6 * s}" fill="#000" opacity="0.25"/>
        <rect x="${w * 0.07}" y="${h * 0.74}" width="${w * 0.5 * clamp(balance)}" height="${12 * s}" rx="${6 * s}" fill="${C.gold}"/>
        ${glow > 0 ? `<rect x="${w * 0.07 - 6 * s}" y="${h * 0.74 - 6 * s}" width="${w * 0.5 * clamp(balance) + 12 * s}" height="${24 * s}" rx="${12 * s}" fill="${C.gold}" opacity="${0.25 * glow}"/>` : ""}
        <rect x="${sheenX}" y="${-h * 0.2}" width="${w * 0.45}" height="${h * 1.4}" fill="url(#sheen)" transform="rotate(14 ${w / 2} ${h / 2})"/>
        ${dim > 0 ? `<rect width="${w}" height="${h}" fill="${C.ink}" opacity="${dim}"/>` : ""}
      </g>
      <rect width="${w}" height="${h}" rx="${r}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="${1.5 * s}"/>
    </g>`;
  };
  PD.cardOutline = (w, stroke = C.mist, op = 0.35, dash = "") => `<rect width="${w}" height="${w / 1.586}" rx="${w * 0.045}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;

  // Small-caps label + source line (bottom left). Every on-screen figure carries one.
  PD.source = (text, k = 1, y = 1012) => `<g opacity="${k}"><rect x="96" y="${y - 30}" width="4" height="38" fill="${C.signal}"/>
    <text x="116" y="${y - 3}" font-family="${F.sans}" font-size="26" letter-spacing="1" fill="${C.mist}"><tspan font-weight="700" letter-spacing="3" fill="${C.text}">SOURCE</tspan>  ${esc(text)}</text></g>`;
  PD.label = (x, y, text, { size = 22, fill = C.mist, anchor = "start", op = 1, ls = 4, weight = 700 } = {}) => `<text x="${x}" y="${y}" font-family="${F.sans}" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(text)}</text>`;
  PD.serif = (x, y, text, { size = 84, fill = C.text, anchor = "middle", op = 1, italic = false } = {}) => `<text x="${x}" y="${y}" font-family="${F.serif}" font-weight="700" ${italic ? 'font-style="italic"' : ""} font-size="${size}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(text)}</text>`;
  PD.number = (x, y, text, { size = 220, fill = C.text, anchor = "start", op = 1 } = {}) => `<text x="${x}" y="${y}" font-family="${F.num}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" opacity="${op}" style="font-variant-numeric: tabular-nums">${esc(text)}</text>`;
  // Multi-line sans paragraph (short lines only: on-screen text never carries the narration).
  PD.lines = (x, y, lines, { size = 38, lh = 1.3, fill = C.text, op = 1, weight = 500, anchor = "start" } = {}) => `<text font-family="${F.sans}" font-weight="${weight}" font-size="${size}" fill="${fill}" opacity="${op}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${x}" y="${y + i * size * lh}">${esc(l)}</tspan>`).join("")}</text>`;
  // Hand-off line drawn progressively (k = 0..1).
  PD.path = (d, len, k, { stroke = C.signal, width = 4, dash = "", op = 1 } = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${op}" ${dash ? `stroke-dasharray="${dash}" ` : `stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - clamp(k))}"`}/>`;

  // Text width in px for layout (canvas measureText: deterministic for a given font and size).
  const cv = document.createElement("canvas").getContext("2d");
  PD.measure = (text, { size = 40, family = F.sans, weight = 700, italic = false } = {}) => { cv.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`; return cv.measureText(text).width; };

  // ---------- shot engine ----------
  // A shot: {id, start, end, in: 'cut'|'fade'|'dip', inDur, draw(t) -> HTML}. Overlaps render both.
  PD.init = (timeline, audioDur) => {
    PD.tl = timeline; PD.audioDur = audioDur;
    const spec = window.SCENES(PD); PD.shots = spec.shots; PD.duration = spec.duration;
    const stage = document.getElementById("stage");
    stage.innerHTML = PD.shots.map((s, i) => `<div class="layer" id="L${i}" style="display:none"></div>`).join("") + `<div class="layer" id="Lover"></div>`;
    return { duration: PD.duration, shots: PD.shots.map((s) => ({ id: s.id, start: +s.start.toFixed(2), end: +s.end.toFixed(2), in: s.in || "cut", visual: s.visual, asset: s.asset, license: s.license })) };
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
