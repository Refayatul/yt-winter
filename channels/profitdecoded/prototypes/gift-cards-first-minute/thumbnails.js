// Three thumbnail concepts for "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (MOCKUPS, not final art).
// Original artwork only: the episode's unbranded card, line icons, brand type. No retailer marks, no cash piles.
window.THUMBS = function (PD) {
  const { C, F, defs } = PD;
  const sv = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/>${defs()}${inner}</svg>`;
  const at = (x, y, inner, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})">${inner}</g>`;
  const ln = (d, op = 0.6, w = 5) => `<path d="${d}" fill="none" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const glow = (x, y, r, col, op) => `<defs><radialGradient id="g${x}${y}"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#g${x}${y})"/>`;
  return [
    // A. The card in the drawer: one object, one question. Curiosity: an unresolved owner.
    { id: "a-drawer-question", html: sv(`${glow(400, 330, 480, C.gold, 0.2)}
        ${at(90, 150, PD.giftCard({ w: 600, balance: 0.62, glow: 1, sheen: 0.55 }), -8)}
        <rect x="-20" y="455" width="860" height="300" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="4"/>
        <rect x="-20" y="440" width="860" height="22" fill="#0e1013"/>
        <rect x="330" y="560" width="180" height="26" rx="13" fill="none" stroke="${C.mist}" stroke-opacity="0.55" stroke-width="5"/>
        <text font-family="${F.serif}" font-weight="700" fill="${C.text}" font-size="118" text-anchor="end"><tspan x="1230" y="270">WHO</tspan><tspan x="1230" y="390">KEEPS</tspan><tspan x="1230" y="510" fill="${C.signal}">IT?</tspan></text>`, C.ink) },
    // B. The scale: the survey estimate as the hero number, labelled as an estimate on the image itself.
    { id: "b-27-billion-unspent", html: sv(`${[0, 1, 2, 3, 4].map((i) => at(760 + i * 34, 120 + i * 30, PD.cardOutline(420, C.mist, 0.22 + i * 0.08), 8 - i * 3)).join("")}
        ${at(830, 300, PD.giftCard({ w: 400, balance: 0.62, glow: 0.8 }), -4)}
        <text x="70" y="390" font-family="${F.num}" font-size="250" fill="${C.text}">$27B</text>
        <rect x="78" y="430" width="390" height="92" fill="${C.signal}"/><text x="273" y="496" font-family="${F.sans}" font-weight="800" font-size="58" letter-spacing="6" fill="${C.ink}" text-anchor="middle">UNSPENT</text>
        <text x="80" y="590" font-family="${F.sans}" font-weight="600" font-size="30" letter-spacing="3" fill="${C.mist}">SURVEY ESTIMATE · US</text>`, C.ink) },
    // C. Three claimants: the film's real answer has three parties (issuer, holder, state). Curiosity: which one.
    { id: "c-three-claimants", html: sv(`${glow(640, 470, 360, C.signal, 0.12)}
        ${at(510, 360, PD.giftCard({ w: 260, balance: 0.62 }))}
        ${[[230, 150], [640, 120], [1050, 150]].map(([x, y], i) => `${ln(`M640 360 C 640 ${y + 190}, ${x} ${y + 200}, ${x} ${y + 125}`, 0.55, 5)}
          <g transform="translate(${x - 95} ${y - 90})"><rect width="190" height="215" rx="18" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.6" stroke-width="4"/>
          ${i === 0 ? ln("M40 95 H150 V170 H40 Z M30 95 L55 55 H135 L160 95 M80 170 V125 H110 V170", 0.95, 6) : i === 1 ? ln("M95 52 a30 30 0 1 0 0.1 0 M40 175 C 40 120, 150 120, 150 175", 0.95, 6) : ln("M30 80 L95 45 L160 80 Z M45 90 V160 M75 90 V160 M115 90 V160 M145 90 V160 M30 172 H160", 0.95, 6)}</g>
          <circle cx="${x + 95}" cy="${y - 90}" r="34" fill="${C.signal}"/><text x="${x + 95}" y="${y - 70}" font-family="${F.serif}" font-weight="700" font-size="58" fill="${C.ink}" text-anchor="middle">?</text>`).join("")}
        <text x="640" y="680" font-family="${F.serif}" font-weight="700" font-size="96" fill="${C.text}" text-anchor="middle">WHO GETS IT?</text>`, C.ink) },
  ];
};
