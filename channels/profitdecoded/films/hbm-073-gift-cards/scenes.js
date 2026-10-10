// "Billions Sit on Unused Gift Cards. Who Keeps the Money?" - full film shot list (INTERNAL REVIEW, not published).
// Every figure and quotation on screen comes from dossier hbm-073 (claims c1-c10, our arithmetic i1-i4), with the exact
// filing wording where quotation marks are shown. Every illustration is original (no logos, no stock, no facsimiles).
// Timing: beat-addressed (PD.b / PD.bw) against the measured narration in out/timeline.json.
window.SCENES = function (PD) {
  const { C, F, E, p, lerp, clamp, svg, defs, vignette } = PD;
  const B = PD.b, BW = PD.bw, BS = PD.bs, ent = PD.ent;
  // The shot being drawn (set by the engine wrapper below): camera moves span the shot's real duration, at least
  // 0.22% zoom per second, so no picture holds still while the narration runs.
  let CUR = { start: 0, end: 1 }; const DUR = () => Math.max(0.5, CUR.end - CUR.start); const pp = (lt) => p(lt, 0, DUR());
  const cam = (k, z0, z1, inner, cx = 960, cy = 540) => { const z = lerp(z0, Math.max(z1, z0 + 0.0022 * DUR()), k); return `<g transform="translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})">${inner}</g>`; };
  // Camera keyframes [{t, x, y, z}] (x, y = point of interest; eased between keys): moves the eye between phases of a long build.
  const camKeys = (t, keys, inner) => { let a = keys[0], b = keys[0]; for (const k of keys) { if (t >= k.t) a = k; } b = keys[Math.min(keys.length - 1, keys.indexOf(a) + 1)];
    const k = b === a ? 0 : E.inOut(p(t, b.t - 1.0, b.t)); const T0 = t < keys[0].t ? keys[0] : a; const x = lerp(T0.x, b.x, k), y = lerp(T0.y, b.y, k), z = lerp(T0.z, b.z, k) * (1 + 0.0022 * Math.max(0, t - CUR.start));
    return `<g transform="translate(960 540) scale(${z}) translate(${-x} ${-y})">${inner}</g>`; };
  const at = (x, y, inner, rot = 0, sc = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
  const dark = (inner) => svg(defs() + inner + vignette(), C.ink);
  const paperBg = () => `<rect width="1920" height="1080" fill="${C.paper}"/><rect width="1920" height="1080" fill="#000" opacity="0.5" filter="url(#paperTex)"/>`;
  const ln = (d, op = 0.6, wdt = 3, col = C.mist) => `<path d="${d}" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="${wdt}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const kicker = (text, k = 1, y = 128, fill = C.mist) => PD.label(960, y, text, { size: 30, anchor: "middle", fill, ls: 6, op: k });
  const head = (text, k = 1, y = 210, size = 68, fill = C.text) => PD.serif(960, lerp(y + 16, y, k), text, { size, op: k, fill });

  const SRC = {
    survey: "Bankrate survey, conducted online by YouGov, Aug 19-21, 2024 (2,373 US adults)",
    sbux: "Starbucks Form 10-K, fiscal year ended Sept 28, 2025 (SEC EDGAR)",
    sbuxMath: "Starbucks Form 10-K, fiscal 2025; totals are our arithmetic",
    drd: "Darden Restaurants Form 10-K, fiscal year ended May 31, 2026 (SEC EDGAR)",
    drdMath: "Darden Form 10-K, fiscal 2026; the change is our arithmetic",
    regE: "CFPB, 12 CFR 1005.20 (Regulation E: gift cards)",
    both: "Starbucks FY2025 and Darden FY2026 Form 10-K (SEC EDGAR)",
  };

  // ---------- original line-art props (outline only, so data colours stay meaningful) ----------
  const cup = (s = 1, op = 0.7) => `<g transform="scale(${s})">${ln("M-60 -40 L-46 110 H46 L60 -40 Z", op, 4)}${ln("M-70 -40 H70 M-64 -62 H64 L70 -40", op, 4)}${ln("M-56 10 H56 M-53 50 H53", op * 0.7, 3)}${ln("M-10 -100 C 0 -88, -20 -78, -6 -66 M14 -104 C 24 -92, 4 -82, 18 -70", op * 0.6, 3)}</g>`;
  const plate = (s = 1, op = 0.7) => `<g transform="scale(${s})"><ellipse rx="130" ry="44" fill="none" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="4"/><ellipse rx="86" ry="27" fill="none" stroke="${C.mist}" stroke-opacity="${op * 0.6}" stroke-width="3"/>${ln("M170 -60 V40 M158 -60 V-20 M182 -60 V-20 M158 -20 Q170 -6 182 -20", op, 3.5)}${ln("M-170 -60 V40 M-170 -60 Q-150 -40 -170 -10", op, 3.5)}</g>`;
  const terminal = (op = 0.7) => `<rect x="-110" y="-170" width="220" height="340" rx="28" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="4"/><rect x="-80" y="-140" width="160" height="90" rx="8" fill="none" stroke="${C.mist}" stroke-opacity="${op * 0.8}" stroke-width="3"/>
    ${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<circle cx="${-50 + c * 50}" cy="${-10 + r * 42}" r="11" fill="none" stroke="${C.mist}" stroke-opacity="${op * 0.6}" stroke-width="2.5"/>`).join("")).join("")}`;
  const contactless = (k) => [0, 1, 2].map((i) => `<path d="M ${30 + i * 22} -40 A ${40 + i * 22} ${40 + i * 22} 0 0 1 ${30 + i * 22} 40" fill="none" stroke="${C.gold}" stroke-width="5" stroke-linecap="round" opacity="${clamp(k * 3 - i)}"/>`).join("");
  const storefront = (kind, op = 0.7) => `<rect x="-300" y="-260" width="600" height="520" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="4"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M${-300 + i * 75} -260 h75 v70 q-37 26 -75 0 Z" fill="${i % 2 ? C.ink3 : "none"}" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="3"/>`).join("")}
    <rect x="-250" y="-120" width="250" height="200" fill="none" stroke="${C.mist}" stroke-opacity="${op * 0.8}" stroke-width="3"/><rect x="60" y="-120" width="180" height="380" fill="none" stroke="${C.mist}" stroke-opacity="${op}" stroke-width="3"/><circle cx="215" cy="70" r="7" fill="${C.mist}" opacity="${op}"/>
    ${kind === "cafe" ? at(-125, -10, cup(0.75, op * 0.8)) : at(-125, 0, plate(0.62, op * 0.8))}`;
  const calendar = (label, sub, op = 1) => `<g opacity="${op}"><rect x="-150" y="-170" width="300" height="340" rx="14" fill="#fbf8f1"/><rect x="-150" y="-170" width="300" height="80" rx="14" fill="${C.signal}"/><rect x="-150" y="-110" width="300" height="20" fill="${C.signal}"/>
    ${PD.label(0, -116, label, { size: 34, anchor: "middle", fill: "#fff", ls: 5 })}${PD.number(0, 70, sub, { size: 120, anchor: "middle", fill: "#1b1b1b" })}</g>`;
  const cake = (op = 0.75) => `${ln("M-80 0 H80 V70 H-80 Z M-80 30 Q-40 50 0 30 Q40 10 80 30", op, 4)}${ln("M-40 0 V-40 M0 0 V-46 M40 0 V-40", op, 4)}${[-40, 0, 40].map((x) => `<ellipse cx="${x}" cy="${x === 0 ? -58 : -52}" rx="7" ry="11" fill="${C.gold}"/>`).join("")}`;
  const gradCap = (op = 0.75) => `${ln("M-110 -20 L0 -70 L110 -20 L0 30 Z", op, 4)}${ln("M-60 0 V50 Q0 80 60 50 V0", op, 4)}${ln("M110 -20 V50", op, 3)}<circle cx="110" cy="56" r="8" fill="${C.gold}"/>`;
  const govBuilding = (op = 0.75) => `${ln("M-160 -60 L0 -140 L160 -60 Z", op, 4)}${ln("M-170 -60 H170 M-170 120 H170 M-180 140 H180", op, 4)}${[-120, -60, 0, 60, 120].map((x) => ln(`M${x} -50 V110`, op, 5)).join("")}`;
  const reportDoc = (k, hk) => `<g opacity="${k}"><rect x="-200" y="-260" width="400" height="520" fill="#fbf8f1" filter="url(#soft)"/>${PD.label(0, -200, "ANNUAL REPORT", { size: 26, anchor: "middle", fill: "#222", ls: 5 })}
    ${[-130, -96, -62, -28, 6, 74, 108, 142, 176].map((y, i) => `<line x1="-150" y1="${y}" x2="${i % 3 === 2 ? 60 : 150}" y2="${y}" stroke="#bbb" stroke-width="5"/>`).join("")}
    <rect x="-162" y="22" width="${324 * clamp(hk)}" height="40" fill="${C.gold}" opacity="0.5"/>${PD.label(-150, 52, "Breakage", { size: 28, fill: "#141414", ls: 1, weight: 700 })}${PD.number(150, 52, "$  ·  ·  ·", { size: 28, anchor: "end", fill: "#141414" })}</g>`;
  const check = (x, y, label, k, { size = 40, color = C.text } = {}) => `<g opacity="${k}" transform="translate(${x} ${lerp(y + 14, y, k)})"><circle cx="26" cy="-14" r="26" fill="${C.ledger}"/>${ln("M13 -14 l9 10 l18 -22", 1, 5, C.paper)}${PD.label(76, 0, label, { size, fill: color, ls: 3 })}</g>`;
  const box = (x, y, wd, h, label, { k = 1, accent = false, dashed = false, sub = "" } = {}) => `<g opacity="${k}" transform="translate(${x - wd / 2} ${y - h / 2})"><rect width="${wd}" height="${h}" rx="16" fill="${accent ? C.signal : C.ink2}" stroke="${accent ? C.signal : C.mist}" stroke-opacity="0.8" stroke-width="3" ${dashed ? 'stroke-dasharray="12 10"' : ""}/>
    ${PD.label(wd / 2, h / 2 + (sub ? -4 : 11), label, { size: 30, anchor: "middle", fill: accent ? C.ink : C.text, ls: 2 })}${sub ? PD.label(wd / 2, h / 2 + 38, sub, { size: 28, anchor: "middle", fill: accent ? C.ink : C.mist, ls: 1.5, weight: 600 }) : ""}</g>`;
  const card = (x, y, wd, opts = {}, rot = 0) => at(x, y, `<g transform="translate(${-wd / 2} ${-wd / 1.586 / 2})">${PD.giftCard({ w: wd, balance: 0.62, ...opts })}</g>`, rot);

  // ---------- the card wall (3D, a different register from the flat charts) ----------
  const PAL = [[C.ledger, C.signal], ["#2a2d33", C.gold], ["#26343b", C.mist], ["#3a3328", C.signal], ["#1f3a3f", C.gold], ["#33302c", C.mist]];
  const wall = (lt, { op = 1, dimAll = 0, fadeSome = 0, tilt = 38 } = {}) => { const cols = 9, rows = 6, cw = 250, gap = 34; let cells = "";
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const i = r * cols + c; const [bb, bd] = PAL[(i * 7 + r) % PAL.length]; const d = Math.hypot(c - 4, r - 2.5); const a = E.out(p(lt, d * 0.07, d * 0.07 + 0.5));
      const gone = ((i * 37) % 11) < 2 ? fadeSome : 0;
      cells += `<g transform="translate(${c * (cw + gap)} ${r * (cw / 1.586 + gap)})" opacity="${a * 0.9 * (1 - gone)}">${PD.giftCard({ w: cw, base: bb, band: bd, meter: false, dim: 0.25 + dimAll })}</g>${gone > 0 ? `<g transform="translate(${c * (cw + gap)} ${r * (cw / 1.586 + gap)})" opacity="${gone}">${PD.cardOutline(cw, C.mist, 0.5, "10 8")}</g>` : ""}`; }
    const W2 = cols * (cw + gap), H2 = rows * (cw / 1.586 + gap);
    return `<div style="position:absolute;inset:0;background:${C.ink};opacity:${op}"><div style="position:absolute;left:${960 - W2 / 2}px;top:${540 - H2 / 2}px;width:${W2}px;height:${H2}px;transform:perspective(1400px) rotateX(${tilt}deg) rotateZ(-10deg) translateX(${lerp(60, -60, p(lt, 0, 8))}px) scale(1.25);transform-origin:50% 50%">
      <svg width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">${defs()}${cells}</svg></div>${svg(defs() + vignette())}</div>`; };
  const over = (inner) => `<div style="position:absolute;inset:0">${svg(defs() + inner)}</div>`;

  // ---------- the drawer (opening and closing callback) ----------
  const A = { cx: 960, cy: 520, w: 420, rot: -6 };
  const receipt = () => `<rect width="190" height="300" fill="${C.paper}" opacity="0.12"/>${[40, 70, 100, 130, 160, 220, 250].map((y, i) => ln(`M22 ${y} H${i % 3 === 2 ? 120 : 168}`, 0.35, 2.5)).join("")}`;
  const key = () => `${ln("M0 0 a34 34 0 1 0 0.1 0", 0.55)}${ln("M34 0 H190 M150 0 v22 M172 0 v16", 0.55)}`;
  const drawer = (k, { glow = 0, balance = 0.62 } = {}) => { const off = lerp(-430, 0, k);
    return `<rect x="330" y="150" width="1260" height="800" rx="18" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.35" stroke-width="3"/>
      <clipPath id="drawerClip"><rect x="330" y="150" width="1260" height="800" rx="18"/></clipPath><g clip-path="url(#drawerClip)"><g transform="translate(0 ${off})">${at(420, 260, receipt(), -9)}${at(1260, 710, key(), 18)}${at(1400, 320, `<ellipse rx="70" ry="40" fill="none" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="5"/>`)}
        ${card(A.cx, A.cy, A.w, { glow, balance }, A.rot)}${at(560, 350, receipt(), 11)}</g></g>
      <rect x="300" y="${lerp(150, -300, k) - 40}" width="1320" height="300" fill="${C.ink}"/><rect x="300" y="${lerp(150, -300, k) + 250}" width="1320" height="10" fill="${C.mist}" opacity="0.25"/>`; };

  // ---------- three claimants (question, recurring) ----------
  const DEST = [{ x: 330, y: 330, label: "THE HOLDER" }, { x: 850, y: 270, label: "THE COMPANY" }, { x: 1370, y: 330, label: "THE GOVERNMENT" }];
  const claimants = (t, tq, { reveal = [0, 0, 0], cardY = 720 } = {}) => DEST.map((d, i) => { const k = E.inOut(p(t, tq - 0.6 + i * PD.T.stagger, tq + 0.3 + i * PD.T.stagger)); const x0 = 960, y0 = cardY; const x1 = d.x + 110, y1 = d.y + 150;
    return `${PD.path(`M${x0} ${y0} C ${x0} ${(y0 + y1) / 2}, ${x1} ${(y0 + y1) / 2 + 60}, ${x1} ${y1}`, 900, k, { stroke: C.mist, width: 3, op: 0.75 })}
      <g opacity="${p(k, 0.7, 1)}" transform="translate(${d.x - 55} ${d.y})"><rect width="330" height="140" rx="12" fill="${reveal[i] > 0.5 ? C.ink2 : "none"}" stroke="${reveal[i] > 0.5 ? C.signal : C.mist}" stroke-width="3" ${reveal[i] > 0.5 ? "" : 'stroke-dasharray="12 10"'}/>
        ${PD.serif(165, 102, "?", { size: 84, fill: C.mist, op: 1 - reveal[i] })}${PD.label(165, 84, d.label, { size: 29, anchor: "middle", fill: C.text, ls: 1.5, op: reveal[i] })}</g>`; }).join("");

  const shots = [];
  // Authored visual roles make repetition review possible without guessing from pixels.
  const roles = {
    "real-world illustration": ["open-wall", "drawer", "sbux-terms", "waits", "latte", "street", "deferred", "twelve", "owner", "choice", "check-it"],
    "data visualization": ["method", "estimate", "sbux-200", "sbux-22", "sbux-3yr", "pool", "darden-pool", "sensitivity", "rules", "lost-34", "mistakes", "avg-244"],
    "financial evidence": ["filings", "phrase", "remote", "complex"],
    "explanatory diagram": ["inputs", "over-time", "flows", "forecast", "input", "plain"],
    "visual metaphor": ["question", "sliver", "no-expiry", "never-back", "third", "unknown", "ask", "answer", "unknowable"],
    "branded title card": ["title", "breakage-def", "predicted", "end"],
  };
  const roleOf = (id) => Object.keys(roles).find((role) => roles[role].includes(id));
  const contextIds = new Set(["open-wall", "drawer", "sbux-terms", "waits", "latte", "pool", "street", "deferred", "twelve", "input", "owner", "avg-244", "choice", "check-it"]);
  const paperIds = new Set(["filings", "breakage-def", "phrase", "remote", "complex", "answer"]);
  const shot = (id, start, o, draw) => {
    const category = o.category || roleOf(id); if (!category) throw new Error(`shot ${id} needs a visual role`);
    const background = o.background || (contextIds.has(id) ? "context" : paperIds.has(id) ? "paper" : "dark");
    const layout = o.layout || (category === "data visualization" ? "chart" : category === "financial evidence" ? "document" : category === "explanatory diagram" ? "diagram" : category === "branded title card" ? "statement" : category === "real-world illustration" ? "environment" : "metaphor");
    const textWeight = o.textWeight || (category === "branded title card" || id === "answer" || id === "filings" ? "high" : "low");
    const s = { id, start, in: o.in || "cut", inDur: o.inDur, visual: o.visual, asset: o.asset || "original motion graphic", license: o.license || "owned", category, background, layout, textWeight, motion: o.motion || "animated", sourceQualified: o.sourceQualified, semanticAnchor: o.semanticAnchor || "" };
    s.draw = (lt, t) => { CUR = s; return draw(lt, t); }; shots.push(s);
  };
  const contextual = (kind, inner, t) => svg(defs() + PD.environment(kind, t) + inner);
  const lead = 0.12; // pictures land just before the words

  // ===================== COLD OPEN (s1) =====================
  shot("open-wall", 0, { in: "cut", visual: "A gift card on a household desk gives way to a 3D wall; Bankrate's ~$27 billion estimate lands over it", asset: "original environment illustration + motion graphic + data (c8)", background: "mixed", layout: "environment" }, (lt, t) => {
    const tb = BW("s1-1", "bankrate"), tn = BW("s1-1", "27 billion"), tv = BW("s1-1", "vouchers"); const nk = E.back(p(t, tn - 0.15, tn + 0.45));
    const reveal = E.inOut(p(lt, 2.1, 3.3));
    const livedIn = `<div style="position:absolute;inset:0">${contextual("desk", cam(p(lt, 0, 3.3), 1, 1.08,
      `${card(900, 535, 700, { sheen: p(lt, 0.5, 2.5) }, -8)}${PD.label(960, 830, "A CARD WAITING TO BE USED", { size: 34, anchor: "middle", fill: C.text, ls: 5 })}`, 960, 540), t)}</div>`;
    return livedIn + wall(lt + 2, { op: reveal, dimAll: 0.35 * p(t, tn - 0.3, tn + 0.3) }) + over(`
      ${PD.label(960, 300, "BY BANKRATE'S ESTIMATE", { size: 34, anchor: "middle", fill: C.text, ls: 8, op: ent(t, tb - 0.1) })}
      <g opacity="${clamp(nk)}" transform="translate(960 500) scale(${lerp(0.88, 1, clamp(nk))}) translate(-960 -500)">${PD.label(960, 400, "ABOUT", { size: 34, anchor: "middle", fill: C.text, ls: 8 })}${PD.number(960, 610, "$27 billion", { size: 230, anchor: "middle" })}</g>
      ${PD.label(960, 700, "UNUSED GIFT CARDS, VOUCHERS AND STORE CREDIT", { size: 34, anchor: "middle", fill: C.text, ls: 3, op: ent(t, tv - 0.3) })}
      ${PD.source(SRC.survey, ent(t, tn + 0.3))}`); });

  shot("drawer", BS("s1-2", 0).start - lead, { visual: "Illustrated household desk and drawer open on an unused card ('Some of it may be yours')", asset: "original vector illustration" }, (lt, t) =>
    contextual("desk", cam(p(lt, 0, 2.5), 1.0, 1.05, drawer(E.out(p(lt, 0.05, 1.1)), { glow: p(lt, 0.9, 1.5) }), A.cx, A.cy), t));

  shot("question", BS("s1-2", 1).start - lead, { visual: "One card, three dashed paths to three unlabelled boxes; 'Who keeps it?'" }, (lt, t) => { const tq = BW("s1-2", "who keeps");
    return dark(cam(pp(lt), 1.0, 1.03, claimants(t, tq) + `<g opacity="${ent(lt, 0)}">${card(960, lerp(780, 740, ent(lt, 0)), 300)}</g>`, 960, 600) + head("Who keeps it?", ent(t, tq - 0.1), 175, 84)); });

  shot("method", B("s1-3").start - lead, { in: "fade", inDur: 0.35, visual: "Survey method chips, then 43% with a 100-dot unit chart (1 dot = 1 in 100 adults)", asset: "original data graphic (c8)" }, (lt, t) => {
    const t2 = BS("s1-3", 1).start; const n = Math.round(43 * E.out(p(t, t2, t2 + 1.0))); const G = { x: 1090, y: 250, gap: 66 };
    const chips = PD.chips([["BANKRATE SURVEY", B("s1-3").start + 0.2], ["ONLINE, BY YOUGOV", BW("s1-3", "yougov")], ["AUG 19-21, 2024", BW("s1-3", "august")], ["2,373 US ADULTS", BW("s1-3", "2,373")]], { x: 150, y: lerp(470, 760, E.inOut(p(t, t2 - 0.4, t2 + 0.4))), maxW: 820, size: 30, t });
    // Sentence 1 (the method): where the figure comes from, and the sample counted up as it is named.
    const s1 = ent(lt, 0.05) * (1 - E.inOut(p(t, t2 - 0.5, t2 + 0.1))); const tc = BW("s1-3", "2,373"); const cnt = Math.round(2373 * E.out(p(t, tc - 0.6, tc + 0.8)));
    const people = Array.from({ length: 60 }, (_, i) => { const x = 1060 + (i % 12) * 58, y = 470 + Math.floor(i / 12) * 74; const a2 = E.out(p(t, B("s1-3").start + 0.3 + i * 0.03, B("s1-3").start + 0.7 + i * 0.03));
      return `<g opacity="${a2 * 0.75}" transform="translate(${x} ${y})"><circle cx="0" cy="-16" r="10" fill="none" stroke="${C.mist}" stroke-width="3"/><path d="M-17 22 C -17 2, 17 2, 17 22" fill="none" stroke="${C.mist}" stroke-width="3"/></g>`; }).join("");
    const method = `<g opacity="${s1}">${PD.label(150, 300, "WHERE THE FIGURE COMES FROM", { size: 30, fill: C.mist, ls: 6 })}${PD.serif(150, 390, "One online survey", { size: 72, anchor: "start" })}
      ${PD.number(1400, 330, cnt.toLocaleString("en-US"), { size: 150, anchor: "middle", op: ent(t, tc - 0.7) })}${PD.label(1400, 390, "US ADULTS ASKED", { size: 30, anchor: "middle", fill: C.text, ls: 5, op: ent(t, tc - 0.7) })}${people}</g>`;
    return dark(cam(pp(lt), 1.0, 1.025, `${method}<g opacity="${ent(t, t2 - 0.1)}">${PD.number(140, 470, `${n}%`, { size: 260, fill: C.signal })}${PD.lines(152, 560, ["of US adults said they hold at least", "one unused gift card, voucher", "or store credit"], { size: 42 })}</g>
      <g opacity="${ent(t, t2 - 0.2)}">${PD.unitChart({ x: G.x, y: G.y, gap: G.gap, r: 23, filled: 43, t, at: t2 - 0.2 })}</g>${chips}`, 960, 560)
      + PD.label(G.x + 4.5 * G.gap, G.y + 10 * G.gap + 14, "EACH DOT = 1 IN 100 ADULTS", { size: 26, anchor: "middle", fill: C.text, op: 0.8 * ent(t, t2 + 0.6) }) + PD.source(SRC.survey, ent(t, B("s1-3").start + 0.3))); });

  shot("estimate", B("s1-4").start - lead, { visual: "The 43 dots converge into ~$27 billion; ESTIMATE stamp; method not published; log ruler (scale, not precision)", asset: "original data graphic (c8)" }, (lt, t) => {
    const G = { x: 1090, y: 250, gap: 66 }; const conv = E.inOut(p(lt, 0, 0.8)); const numIn = E.back(p(lt, 0.55, 1.1));
    const dots = Array.from({ length: 100 }, (_, i) => { const g = PD.unitPos(i, G); if (i >= 43) return `<circle cx="${g.x}" cy="${g.y}" r="23" fill="none" stroke="${C.mist}" stroke-opacity="${0.4 * (1 - p(lt, 0, 0.35))}" stroke-width="2.5"/>`;
      return `<circle cx="${lerp(g.x, 960, conv)}" cy="${lerp(g.y, 430, conv)}" r="${23 * (1 - conv * 0.9) + 30 * p(lt, 0.6, 1.0)}" fill="${C.signal}" opacity="${(1 - clamp(numIn * 1.6))}"/>`; }).join("");
    const blur = 3.5 * E.inOut(p(t, BW("s1-4", "the scale"), BW("s1-4", "the scale") + 0.8)); const stamp = E.back(p(t, BW("s1-4", "estimate") - 0.05, BW("s1-4", "estimate") + 0.3));
    const boxK = p(t, BW("s1-4", "not a count") - 0.1, BW("s1-4", "not a count") + 0.5); const method = ent(t, BW("s1-4", "doesn't publish")); const ruler = E.out(p(t, BW("s1-4", "the scale") - 0.3, BW("s1-4", "the scale") + 0.6));
    return dark(`<g transform="translate(960 470) scale(${lerp(1, 1.03, p(lt, 0, 9))}) translate(-960 -470)"><g opacity="${1 - p(lt, 0, 0.3)}">${PD.number(140, 470, "43%", { size: 260, fill: C.signal })}</g>${dots}
      <g transform="translate(960 430) scale(${lerp(0.9, 1, clamp(numIn))}) translate(-960 -430)" opacity="${clamp(numIn)}"><g style="filter:blur(${blur}px)">${PD.number(960, 505, "$27 billion", { size: 220, anchor: "middle" })}</g>
        ${PD.label(960, 316, "ABOUT", { size: 32, anchor: "middle", fill: C.text, ls: 8 })}${PD.label(960, 594, "SURVEY ESTIMATE, NOT A COUNT", { size: 30, anchor: "middle", fill: C.text, ls: 4, op: 0.9 })}
        <rect x="380" y="268" width="1160" height="362" rx="10" fill="none" stroke="${C.mist}" stroke-width="3" stroke-dasharray="14 12" opacity="${0.7 * boxK}"/></g>
      ${PD.stamp(1400, 296, "ESTIMATE", stamp)}${PD.label(960, 690, "BANKRATE HAS NOT PUBLISHED THE METHOD", { size: 28, anchor: "middle", fill: C.text, ls: 4, op: method * (1 - ruler * 0.4) })}
      ${PD.logRuler({ x0: 460, x1: 1460, y: 820, min: 1, max: 100, value: 27, k: ruler })}</g>${PD.source(SRC.survey, p(lt, 0.3, 0.8))}`); });

  shot("filings", B("s1-5").start - lead, { in: "fade", inDur: 0.35, visual: "Typeset 10-K cover information (Starbucks FY2025, Darden FY2026); then the naive answer, 'just' circled", asset: "original typography from public filing metadata", license: "owned (facts from public SEC filings; no logos, no facsimile)" }, (lt, t) => {
    const a = E.out(p(t, B("s1-5").start, Math.min(B("s1-5").start + 0.8, BW("s1-5", "starbucks") + 0.4))); const b = E.out(p(t, B("s1-5").start + 0.3, Math.max(B("s1-5").start + 1.1, BW("s1-5", "darden") + 0.4)));
    const og = ent(t, BW("s1-5", "olive garden") - 0.1); const q = E.out(p(t, BW("s1-5", "the store") - 0.25, BW("s1-5", "the store") + 0.35));
    const circ = E.inOut(p(t, BW("s1-5", "just") - 0.05, BW("s1-5", "just") + 0.55)); const hi = (d) => E.inOut(p(t, BW("s1-5", "annual filings") - 0.1 + d, BW("s1-5", "annual filings") + 0.5 + d));
    const o = { size: 100, family: F.serif, italic: true }; const full = "“The store just keeps it.”"; const x0 = 960 - PD.measure(full, o) / 2 + PD.measure("“The store ", o); const jw = PD.measure("just", o); const cx = x0 + jw / 2, cy = 546, rx = jw / 2 + 26, ry = 64;
    return svg(defs() + paperBg() + PD.label(960, 112, "WE DON'T HAVE TO GUESS", { size: 30, fill: C.ledger, anchor: "middle", ls: 6, op: ent(lt, 0.1) * (1 - q) })
      + cam(p(t, B("s1-5").start, BW("s1-5", "the store")), 1.0, 1.04, PD.docCover({ co: "Starbucks Corporation", fy: "September 28, 2025", x: 330, y: 180, rot: -2, k: a, hi: hi(0) }) + PD.docCover({ co: "Darden Restaurants, Inc.", fy: "May 31, 2026", x: 1070, y: 190, rot: 1.6, k: b, hi: hi(0.25) }), 960, 540)
      + PD.label(1330, 940, "PARENT COMPANY OF OLIVE GARDEN", { size: 28, fill: C.ink, anchor: "middle", ls: 3, op: og * (1 - q) }) + PD.source("Form 10-K cover pages, SEC EDGAR (typeset, not facsimiles)", a * (1 - q), 1030, { dark: false })
      + `<rect width="1920" height="1080" fill="${C.paper}" opacity="${0.93 * q}"/><g opacity="${q}" transform="translate(0 ${lerp(20, 0, q)})">${PD.serif(960, 580, full, { size: 100, fill: C.ink, italic: true })}</g>`
      + PD.path(`M ${cx + rx * 0.2} ${cy + ry} C ${cx - rx * 1.25} ${cy + ry}, ${cx - rx * 1.25} ${cy - ry}, ${cx} ${cy - ry} C ${cx + rx * 1.3} ${cy - ry}, ${cx + rx * 1.25} ${cy + ry * 1.05}, ${cx - rx * 0.15} ${cy + ry * 1.08}`, 900, circ, { stroke: C.signal, width: 6 })); });

  // ===================== TITLE =====================
  const tTitle = B("s1-5").end + 0.35;
  shot("title", tTitle, { in: "fade", inDur: 0.5, visual: "Title card: WHO KEEPS THE MONEY? with a card sliding through a coral rule", asset: "original typography" }, (lt) => {
    const k = E.out(p(lt, 0.15, 0.9)); const r = E.inOut(p(lt, 0.3, 1.6)); const out = p(lt, 2.7, 3.3);
    return dark(`<g opacity="${1 - out}">${PD.label(960, 400, "PROFITDECODED", { size: 30, anchor: "middle", fill: C.mist, ls: 10, op: k })}
      ${PD.serif(960, lerp(560, 540, k), "Who Keeps the Money?", { size: 120, op: k })}<rect x="${960 - 520 * r}" y="600" width="${1040 * r}" height="5" fill="${C.signal}"/>
      ${PD.label(960, 680, "THE BUSINESS BEHIND UNUSED GIFT CARDS", { size: 30, anchor: "middle", fill: C.text, ls: 6, op: ent(lt, 0.9) })}
      <g opacity="${0.9 * p(lt, 0.2, 0.6) * (1 - p(lt, 2.2, 2.7))}">${card(lerp(200, 1720, E.inOut(p(lt, 0.2, 3.0))), 820, 170, { meter: false })}</g></g>`); });

  // ===================== s2 STARBUCKS: NO EXPIRY, YET REVENUE =====================
  shot("sbux-terms", B("s2-1").start - lead, { in: "fade", inDur: 0.5, visual: "Starbucks card terms: no expiration date, no service fees (company-operated markets incl. US)", asset: "original illustration + filing facts (c2)" }, (lt, t) => {
    const k = ent(lt, 0.1);
    return contextual("cafe", cam(pp(lt), 1.0, 1.03, `${at(560, 560, cup(1.6, 0.7 * k))}${card(560, 700, 360, { sheen: p(lt, 0.4, 1.6) }, -8)}
      ${PD.label(1060, 330, "STARBUCKS", { size: 34, fill: C.mist, ls: 8, op: ent(t, BW("s2-1", "starbucks") - 0.2) })}${PD.label(1060, 380, "US AND OTHER COMPANY-OPERATED MARKETS", { size: 26, fill: C.mist, ls: 3, op: ent(t, BW("s2-1", "company-operated") - 0.2) })}
      ${check(1060, 520, "NO EXPIRATION DATE", ent(t, BW("s2-1", "no expiration") - 0.1))}${check(1060, 620, "NO SERVICE FEES", ent(t, BW("s2-1", "no service") - 0.1))}`, 960, 560) + PD.source(SRC.sbux, ent(lt, 0.4)), t); });

  shot("waits", B("s2-2").start - lead, { visual: "Calendar pages flip; the card's balance meter does not move", asset: "original motion graphic (illustrative, no figures)" }, (lt, t) => {
    const flips = Math.floor(lt * 2.6); const M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]; const frac = (lt * 2.6) % 1;
    return contextual("desk", cam(pp(lt), 1.0, 1.03, `${at(560, 540, calendar(M[(flips + 1) % 12], String((flips + 1) % 28 + 1)))}${at(560, 540, `<g transform="scale(1 ${1 - E.inOut(frac)})" transform-origin="0 -170">${calendar(M[flips % 12], String(flips % 28 + 1))}</g>`)}
      ${card(1260, 520, 520)}${PD.label(1260, 760, "BALANCE: UNCHANGED", { size: 32, anchor: "middle", fill: C.gold, ls: 5, op: ent(t, BW("s2-2", "just waits") - 0.3) })}`, 960, 540), t); });

  shot("sliver", B("s2-3").start - lead, { visual: "A sliver of the waiting balance moves into a REVENUE box ('And yet...')", asset: "original motion graphic (illustrative)" }, (lt, t) => {
    const go = E.inOut(p(t, BW("s2-3", "into revenue") - 0.9, BW("s2-3", "into revenue") + 0.3)); const rk = ent(t, BW("s2-3", "into revenue") - 0.5);
    return dark(cam(pp(lt), 1.0, 1.03, `${card(620, 540, 560, { balance: lerp(0.62, 0.56, go) })}
      <rect x="${lerp(620 - 280 + 560 * 0.07 + 560 * 0.5 * 0.56, 1350, go)}" y="${lerp(540 - 176 + 353 * 0.74, 520, go)}" width="${lerp(560 * 0.5 * 0.06, 90, go)}" height="${lerp(14, 40, go)}" rx="7" fill="${C.gold}" opacity="${0.4 + 0.6 * p(lt, 0.2, 0.6)}"/>
      ${box(1400, 540, 340, 150, "REVENUE", { k: rk, accent: true })}${PD.label(960, 880, "STARBUCKS · FISCAL 2025 FILING", { size: 26, anchor: "middle", fill: C.mist, ls: 4, op: ent(lt, 0.3) })}`)); });

  shot("breakage-def", B("s2-4").start - lead, { in: "fade", inDur: 0.4, visual: "Dictionary-style entry on paper: breakage (accounting)", asset: "original typography (definition as narrated)" }, (lt, t) => {
    const k0 = ent(lt, 0.05); const k = ent(t, BW("s2-4", "breakage") - 0.2); const d = ent(t, BW("s2-4", "the share") - 0.2);
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.03, `${PD.label(380, 330, "THE ACCOUNTING NAME", { size: 28, fill: C.ledger, ls: 6, op: k0 })}
      <text x="380" y="${lerp(470, 450, k)}" font-family="${F.serif}" font-weight="700" font-size="150" fill="#141414" opacity="${k}">breakage</text>${PD.label(1080, 450, "noun", { size: 34, fill: "#6b665c", ls: 1, weight: 500, op: k })}
      <rect x="380" y="500" width="${1160 * Math.max(0.15 * k0, k)}" height="4" fill="${C.signal}"/>
      ${PD.lines(380, 600, ["The share of card value a company", "doesn't expect anyone to ever redeem."], { size: 56, fill: "#1b1b1b", op: d, weight: 500 })}`, 960, 520)); });

  // ===================== s3 HOW IT IS BOOKED =====================
  shot("no-expiry", B("s3-1").start - lead, { in: "cut", visual: "A time axis runs on with no expiry marker; 'How do you book money that can still be spent?'", asset: "original motion graphic" }, (lt, t) => {
    const s1 = BS("s3-1", 1).start, s2 = BS("s3-1", 2).start; const run = E.inOut(p(t, s1 - 0.2, s2 + 0.6)); const no = E.back(p(t, s2 - 0.05, s2 + 0.35));
    return dark(`${head("How do you book money", ent(lt, 0.05), 220, 72)}${head("that can still be spent?", ent(lt, 0.25), 310, 72)}
      ${cam(pp(lt), 1.0, 1.04, `${card(300, 650, 240)}<line x1="430" y1="650" x2="${lerp(430, 1900, run)}" y2="650" stroke="${C.mist}" stroke-width="5" stroke-linecap="round"/>
      ${Array.from({ length: 14 }, (_, i) => { const x = 520 + i * 110; return `<line x1="${x}" y1="632" x2="${x}" y2="668" stroke="${C.mist}" stroke-width="3" opacity="${clamp((run * 1470 - (x - 430)) / 80)}"/>`; }).join("")}
      <g transform="translate(${lerp(560, 1500, run)} 560)" opacity="${clamp(run * 4) * (1 - no * 0.2)}">${box(0, 0, 300, 90, "EXPIRY DATE?", { dashed: true })}</g>`, 960, 650)}
      ${PD.stamp(1500, 820, "NONE", no, { rot: -6 })}`); });

  shot("inputs", B("s3-2").start - lead, { visual: "Rewind arrow ('looks backward'); filing inputs flow into HISTORICAL REDEMPTION PATTERNS", asset: "original diagram (inputs as listed in the filing, c2)" }, (lt, t) => {
    const back = ent(t, BW("s3-2", "looks backward") - 0.2); const items = [["EACH MARKET", BW("s3-2", "each market")], ["WHEN A CARD WAS ACTIVATED OR RELOADED", BW("s3-2", "activated")], ["THROUGH WHICH CHANNEL", BW("s3-2", "which channel")]];
    const spin = -360 * E.inOut(p(t, BW("s3-2", "looks backward") - 0.2, BW("s3-2", "looks backward") + 0.9));
    return dark(cam(pp(lt), 1.0, 1.03, `<g transform="translate(300 300) rotate(${spin})" opacity="${back * (1 - p(t, items[0][1] - 0.6, items[0][1]))}">${ln("M-70 0 A70 70 0 1 1 0 70", 0.9, 8, C.gold)}${ln("M-92 -10 L-70 0 L-50 -18", 0.9, 8, C.gold)}</g>
      ${PD.label(300, 430, "LOOKS BACKWARD", { size: 30, anchor: "middle", fill: C.text, ls: 6, op: back * (1 - p(t, items[0][1] - 0.6, items[0][1])) })}
      ${items.map(([lab, ti], i) => { const k = ent(t, ti - 0.2); const y = 340 + i * 170; const flow = E.inOut(p(t, ti + 0.1, ti + 0.9));
        return `<g opacity="${k}">${box(560, y, 860, 110, lab)}${PD.path(`M990 ${y} C 1080 ${y}, 1100 540, 1190 540`, 300, flow, { stroke: C.gold, width: 4 })}</g>`; }).join("")}
      ${box(1450, 540, 520, 170, "HISTORICAL REDEMPTION", { k: ent(t, items[0][1] + 0.2), sub: "PATTERNS, MARKET BY MARKET" })}`) + PD.source(SRC.sbux, ent(lt, 0.4))); });

  shot("never-back", B("s3-3").start - lead, { visual: "On the household desk, a card splits: the share expected never to be redeemed is set apart, stamped ESTIMATE (no percentage shown)", asset: "original environment illustration + motion graphic (illustrative, no figures)", background: "context" }, (lt, t) => {
    const sp = E.inOut(p(t, BW("s3-3", "never coming back") - 0.6, BW("s3-3", "never coming back") + 0.3)); const wd = 700, h = wd / 1.586; const cut = 0.82;
    return contextual("desk", cam(pp(lt), 1.0, 1.03, `<g transform="translate(${960 - wd / 2 - 40 * sp} ${540 - h / 2})"><clipPath id="cutA"><rect width="${wd * cut}" height="${h + 40}"/></clipPath><g clip-path="url(#cutA)">${PD.giftCard({ w: wd, meter: false })}</g></g>
      <g transform="translate(${960 - wd / 2 + 120 * sp} ${540 - h / 2 + 30 * sp}) rotate(${6 * sp} ${wd * (cut + 0.09)} ${h / 2})" opacity="${1 - 0.35 * sp}"><clipPath id="cutB"><rect x="${wd * cut}" width="${wd * (1 - cut)}" height="${h + 40}"/></clipPath><g clip-path="url(#cutB)">${PD.giftCard({ w: wd, meter: false, dim: 0.35 * sp })}</g></g>
      ${PD.label(960, 240, "EXPECTED NEVER TO BE REDEEMED", { size: 36, anchor: "middle", fill: C.text, ls: 4, op: sp })}${PD.stamp(400, 880, "ESTIMATE", E.back(p(t, BW("s3-3", "estimates") - 0.1, BW("s3-3", "estimates") + 0.3)))}
      ${PD.label(960, 960, "ILLUSTRATION: THE SHARE IS NOT TO SCALE", { size: 30, anchor: "middle", fill: C.text, ls: 3, op: 0.9 * sp })}`), t); });

  shot("over-time", B("s3-4").start - lead, { visual: "'Not in one go' (single block crossed out) -> two synchronised bars: redemptions and breakage recognised in proportion", asset: "original schematic (illustrative, no figures)" }, (lt, t) => {
    const x1 = ent(lt, 0.05); const cross = E.inOut(p(t, BW("s3-4", "in one go") + 0.2, BW("s3-4", "in one go") + 0.6)); const ot = p(t, BW("s3-4", "over time") - 0.2, B("s3-4").end + 0.8);
    const steps = (k) => Math.floor(k * 6) / 6 + E.inOut((k * 6) % 1) / 6; const sk = steps(clamp(ot)); const swap = E.inOut(p(t, BW("s3-4", "over time") - 0.5, BW("s3-4", "over time")));
    return dark(cam(pp(lt), 1.0, 1.02, `<g opacity="${x1 * (1 - swap)}">${PD.label(960, 360, "HERE'S THE CLEVER PART", { size: 30, anchor: "middle", fill: C.gold, ls: 6 })}${box(960, 520, 520, 160, "BOOK IT ALL AT ONCE")}${ln("M720 420 L1200 620 M1200 420 L720 620", cross, 8, C.signal)}</g>
      <g opacity="${swap}">${PD.label(330, 380, "CARD REDEMPTIONS", { size: 30, fill: C.text, ls: 4 })}<rect x="330" y="410" width="1260" height="70" rx="10" fill="${C.ink2}"/><rect x="330" y="410" width="${1260 * sk}" height="70" rx="10" fill="${C.ledger}"/>
        ${PD.label(330, 600, "BREAKAGE RECOGNIZED, IN PROPORTION", { size: 30, fill: C.text, ls: 4 })}<rect x="330" y="630" width="1260" height="70" rx="10" fill="${C.ink2}"/><rect x="330" y="630" width="${1260 * sk}" height="70" rx="10" fill="${C.gold}"/>
        ${Array.from({ length: 6 }, (_, i) => `<line x1="${330 + 1260 * (i + 1) / 6}" y1="490" x2="${330 + 1260 * (i + 1) / 6}" y2="620" stroke="${C.mist}" stroke-width="2" stroke-dasharray="6 8" opacity="${0.6 * (sk >= (i + 1) / 6 - 0.001 ? 1 : 0)}"/>`).join("")}
        ${PD.label(960, 800, "SCHEMATIC: THE TWO MOVE TOGETHER", { size: 26, anchor: "middle", fill: C.mist, ls: 3 })}</g>`) + PD.source(SRC.sbux, ent(lt, 0.4))); });

  shot("latte", B("s3-5").start - lead, { visual: "Illustrated checkout: a card taps for a latte; its balance drops and a matching sliver moves into revenue", asset: "original vector illustration (illustrative)" }, (lt, t) => {
    const tap = E.inOut(p(t, BW("s3-5", "tapping") - 0.3, BW("s3-5", "tapping") + 0.5)) * (1 - E.inOut(p(t, BW("s3-5", "tapping") + 0.9, BW("s3-5", "tapping") + 1.5)));
    const spent = E.inOut(p(t, BW("s3-5", "gets spent") - 0.2, BW("s3-5", "gets spent") + 0.8)); const sl = E.inOut(p(t, BW("s3-5", "matching sliver") - 0.1, BW("s3-5", "into revenue") + 0.3)); const rk = ent(t, BW("s3-5", "matching sliver") - 0.3);
    return contextual("checkout", cam(pp(lt), 1.0, 1.03, `${at(560, 560, terminal())}${at(640, 520, contactless(tap))}${at(300, 760, cup(1.0, ent(t, BW("s3-5", "latte") - 0.3)))}
      ${card(lerp(900, 700, tap), lerp(560, 480, tap), 380, { balance: lerp(0.62, 0.42, spent) }, lerp(-4, -14, tap))}
      <rect x="${lerp(1100, 1430, sl)}" y="${lerp(600, 540, sl)}" width="60" height="22" rx="8" fill="${C.gold}" opacity="${p(sl, 0.01, 0.1) * (1 - p(sl, 0.95, 1))}"/>
      ${box(1500, 540, 300, 140, "REVENUE", { k: rk, accent: true })}${PD.label(960, 900, "AS BALANCES ARE SPENT, A MATCHING SLIVER IS RECOGNIZED", { size: 28, anchor: "middle", fill: C.mist, ls: 3, op: ent(t, BW("s3-5", "matching sliver")) })}`), t); });

  shot("phrase", B("s3-6").start - lead, { in: "fade", inDur: 0.4, visual: "Paper: the exact filing phrase, highlighted; a REMEMBER THIS tab slides in", asset: "exact quotation from the Starbucks FY2025 10-K (c2)", license: "owned layout; quotation from a public SEC filing" }, (lt, t) => {
    const k = ent(lt, 0.05); const hk = E.inOut(p(t, BW("s3-6", "remittance"), B("s3-6").end)); const tab = E.out(p(t, BW("s3-6", "will matter later") - 0.2, BW("s3-6", "will matter later") + 0.5));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.03, PD.filingQuote({ x: 260, y: 300, w: 1400, quote: "The estimate accounts for remittance to government agencies under unclaimed property laws, if applicable.", highlight: "remittance to government agencies under unclaimed property laws, if applicable", cite: "STARBUCKS FORM 10-K · FISCAL 2025 · STORED VALUE CARDS (WORDING AS FILED)", k, hk, size: 58 }), 960, 540)
      + `<g transform="translate(${lerp(1920, 1500, tab)} 200)"><rect width="420" height="84" fill="${C.signal}"/>${PD.label(30, 54, "REMEMBER THIS", { size: 32, fill: C.ink, ls: 5 })}</g>`); });

  // ===================== s4 WHAT IT IS WORTH (STARBUCKS) =====================
  const sbuxBar = (t, tA, tB) => { const a = E.out(p(t, tA - 0.1, tA + 0.9)), b = E.out(p(t, tB - 0.1, tB + 0.7)); const H = 560, max = 240, x = 820, y0 = 860; const ha = H * 200.4 / max * a, hb = H * 22.0 / max * b;
    return `<rect x="${x}" y="${y0 - ha}" width="280" height="${ha}" fill="${C.ledger}"/><rect x="${x}" y="${y0 - ha - hb}" width="280" height="${hb}" fill="${C.signal}"/><line x1="${x - 60}" y1="${y0}" x2="${x + 340}" y2="${y0}" stroke="${C.mist}" stroke-width="3"/>
      ${PD.label(x + 140, y0 + 50, "FISCAL 2025", { size: 28, anchor: "middle", fill: C.text, ls: 3 })}`; };
  shot("sbux-200", B("s4-1").start - lead, { in: "fade", inDur: 0.5, visual: "A large fiscal-2025 evidence card connects $200.4M recognized breakage to company-operated stores in an illustrated café", asset: "original environment and sourced evidence graphic (c1)", category: "financial evidence", background: "context", layout: "evidence card", motion: "document reveal", sourceQualified: true, semanticAnchor: "200.4" }, (lt, t) => {
    const t2 = BS("s4-1", 1).start; const tn = BW("s4-1", "200.4"); const v = 200.4 * E.out(p(t, tn - 0.3, tn + 0.9));
    return contextual("cafe", cam(pp(lt), 1.0, 1.025, `${PD.label(960, 170, "STARBUCKS · FISCAL 2025", { size: 42, anchor: "middle", fill: C.text, ls: 4 })}
      <g opacity="${1 - ent(t, tn - 0.3)}">${card(960, 540, 480, { meter: true })}</g>
      ${PD.evidenceCard({ x: 505, y: 290, w: 910, h: 500, kicker: "BREAKAGE RECOGNIZED", value: `$${v.toFixed(1)}M`, detail: "COMPANY-OPERATED STORES", k: ent(t, tn - 0.3), accent: C.ledger })}
      ${PD.label(960, 895, "BREAKAGE FIGURES ARE COMPANY ESTIMATES", { size: 38, anchor: "middle", fill: C.text, ls: 1, op: ent(t, t2) })}`, 960, 540) + PD.sourceCompact("STARBUCKS FY2025 FORM 10-K · SEC EDGAR", ent(t, t2 + 0.2)), t); });
  shot("sbux-22", B("s4-2").start - lead, { visual: "The company-operated and licensed-store breakage figures become two distinct evidence cards", asset: "original environment and sourced evidence graphic (c1)", category: "financial evidence", background: "context", layout: "evidence pair", motion: "document reveal", sourceQualified: true, semanticAnchor: "22.0" }, (lt, t) => {
    const tB = B("s4-2").start + 0.2;
    return contextual("cafe", cam(pp(lt), 1.0, 1.02, `${PD.label(960, 165, "TWO STORE TYPES · TWO BREAKAGE FIGURES", { size: 40, anchor: "middle", fill: C.text, ls: 2 })}
      ${PD.evidenceCard({ x: 200, y: 310, w: 710, h: 480, kicker: "COMPANY-OPERATED", value: "$200.4M", detail: "RECOGNIZED BREAKAGE", accent: C.ledger })}
      ${PD.evidenceCard({ x: 1010, y: 310, w: 710, h: 480, kicker: "LICENSED STORES", value: "+$22.0M", detail: "RECOGNIZED BREAKAGE", k: ent(t, tB), accent: C.signal })}`, 960, 540) + PD.sourceCompact("STARBUCKS FY2025 FORM 10-K · SEC EDGAR", 1), t); });
  shot("sbux-3yr", B("s4-3").start - lead, { in: "fade", inDur: 0.4, visual: "Three fiscal-year evidence cards replace the repeated bars; totals are explicitly labelled as our arithmetic", asset: "original sourced evidence graphic (c1, i1)", category: "financial evidence", background: "paper", layout: "year cards", motion: "sequential document reveal", sourceQualified: true, semanticAnchor: "222.4,207.6,215.0" }, (lt, t) => {
    const k1 = p(t, BS("s4-3", 0).start, BS("s4-3", 0).start + 0.8), k2 = p(t, BS("s4-3", 1).start, BS("s4-3", 1).start + 0.8), k3 = p(t, BS("s4-3", 2).start, BS("s4-3", 2).start + 0.8);
    const cards = [["FY2023", "$215.0M", E.out(k3)], ["FY2024", "$207.6M", E.out(k2)], ["FY2025", "$222.4M", E.out(k1)]];
    const stream = E.inOut(p(t, B("s4-3b").start + 0.6, B("s4-3b").start + 2.4));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.02, `${PD.serif(960, 155, "A recurring estimate", { size: 78, fill: C.ink })}
      ${PD.label(960, 230, "STARBUCKS · BOTH STORE TYPES · OUR ARITHMETIC", { size: 38, anchor: "middle", fill: C.ledger, ls: 2 })}
      ${cards.map(([yr, val, k], i) => PD.evidenceCard({ x: 185 + i * 530, y: 330, w: 490, h: 440, kicker: yr, value: val, detail: "COMBINED BREAKAGE", k, accent: i === 2 ? C.signal : C.ledger })).join("")}
      ${PD.label(960, 870, "A STEADY STREAM, YEAR AFTER YEAR", { size: 46, anchor: "middle", fill: C.ledger, ls: 2, op: stream })}`) + PD.sourceCompact("STARBUCKS FY2023–25 FORM 10-K · TOTALS: OUR MATH", 1, { dark: false })); });

  const poolG = (t, { k = 1, v = "$1.75 billion" } = {}) => `<g opacity="${k}"><circle cx="960" cy="540" r="${lerp(120, 250, k)}" fill="${C.ledger}" opacity="0.85"/><circle cx="960" cy="540" r="${lerp(120, 250, k) + 18}" fill="none" stroke="${C.mist}" stroke-opacity="0.4" stroke-width="3"/>
    ${PD.number(960, 560, v, { size: 86, anchor: "middle" })}${PD.label(960, 620, "CARD BALANCES + STARS", { size: 30, anchor: "middle", fill: C.text, ls: 3 })}</g>`;
  shot("pool", B("s4-4a").start - lead, { visual: "The balance pool is brought into an illustrated café: about $1.75 billion including loyalty Stars, up from about $1.72 billion", asset: "original environment illustration + data graphic (c3, i4)", layout: "environment" }, (lt, t) => {
    const k = E.out(p(lt, 0.05, 1.0)); const nk = E.out(p(t, BW("s4-4a", "1.75 billion") - 0.4, BW("s4-4a", "1.75 billion") + 0.4)); const up = ent(t, BW("s4-4a", "up from") - 0.1); const na = E.back(p(t, BW("s4-4a", "not all") - 0.1, BW("s4-4a", "not all") + 0.3));
    return contextual("cafe", cam(pp(lt), 1.0, 1.04, `${PD.label(960, 150, "STARBUCKS · END OF FISCAL 2025", { size: 30, anchor: "middle", fill: C.mist, ls: 6, op: ent(lt, 0.1) })}${poolG(t, { k, v: nk > 0.02 ? "$1.75 billion" : "" })}<g opacity="${nk}"></g>
      ${PD.label(960, 880, "UP FROM ABOUT $1.72 BILLION A YEAR EARLIER", { size: 30, anchor: "middle", fill: C.text, ls: 3, op: up })}`, 960, 540) + PD.stamp(1480, 330, "NOT ALL GIFT CARD MONEY", na, { size: 30, rot: -6, color: C.gold }) + PD.source(SRC.sbux + "; rounding ours", ent(lt, 0.4)), t); });

  shot("flows", B("s4-4").start - lead, { visual: "Money flow: ~$15.2B loaded in -> the pool -> ~$15.2B out (card purchases, Star redemptions, breakage; strands not to scale)", asset: "original data graphic (c3, i3)" }, (lt, t) => {
    const pull = E.inOut(p(lt, 0, 1.4)); const ink = E.out(p(t, B("s4-5").start - 0.1, B("s4-5").start + 1.2)); const outk = E.out(p(t, B("s4-6").start - 0.1, B("s4-6").start + 1.2)); const split = E.inOut(p(t, BW("s4-6", "card purchases") - 0.2, BW("s4-6", "breakage") + 0.4));
    const hl = E.inOut(p(t, BS("s4-7", 1).start - 0.1, BS("s4-7", 1).start + 0.6)); const flow = t * 70;
    const pipe = (d, k, col, wd) => `<path d="${d}" fill="none" stroke="${C.mist}" stroke-opacity="${0.25 * k}" stroke-width="${wd + 8}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-dasharray="16 22" stroke-dashoffset="${-flow}" opacity="${k}"/>`;
    const outs = [["CARD PURCHASES", 360], ["STAR REDEMPTIONS", 540], ["BREAKAGE", 720]];
    const keys = [{ t: B("s4-4").start, x: 960, y: 540, z: 1.5 }, { t: B("s4-4").start + 1.4, x: 960, y: 540, z: 1.0 }, { t: B("s4-5").start + 0.4, x: 640, y: 560, z: 1.18 }, { t: B("s4-6").start + 0.4, x: 1240, y: 540, z: 1.12 }, { t: B("s4-7").start + 0.2, x: 960, y: 540, z: 1.0 }, { t: BS("s4-7", 1).start + 0.3, x: 1300, y: 590, z: 1.2 }];
    return dark(`<g>${camKeys(t, keys, `<g>
      ${pipe("M120 540 H 710", ink, C.gold, 22)}${outs.map(([, y], i) => pipe(`M1210 540 C 1350 540, 1350 ${y}, 1470 ${y}`, outk * (i === 0 ? 1 : split), i === 2 ? C.signal : C.gold, 14)).join("")}
      ${poolG(t, { k: 1 })}
      <g opacity="${ink}">${PD.number(380, 470, "~$15.2B", { size: 90, anchor: "middle" })}${PD.label(380, 625, "LOADED: NEW CARDS,", { size: 34, anchor: "middle", fill: C.text, ls: 2 })}${PD.label(380, 672, "RELOADS, STARS EARNED", { size: 34, anchor: "middle", fill: C.text, ls: 2 })}</g>
      <g opacity="${outk}">${PD.number(1420, 250, "~$15.2B OUT", { size: 64, anchor: "middle" })}</g>
      ${outs.map(([lab, y], i) => PD.label(1495, y + 12, lab, { size: 33, fill: i === 2 ? C.signal : C.text, ls: 2, op: (i === 0 ? outk : split) * (i === 2 ? 1 : 1 - 0.5 * hl) })).join("")}
      ${PD.label(1860, 790, "ONE PART OF THE OUTFLOW", { size: 30, anchor: "end", fill: C.signal, ls: 2, op: hl })}</g>`)}</g>
      ${PD.label(1830, 930, "STRANDS NOT TO SCALE", { size: 30, anchor: "end", fill: C.text, ls: 2, op: 0.9 * split })}${PD.source(SRC.sbux + "; rounding ours", ink)}`); });

  // ===================== s5 DARDEN =====================
  shot("street", B("s5-1").start - lead, { in: "cut", visual: "Illustrated restaurant setting takes over from the cafe; Darden card terms tick in", asset: "original vector illustration + filing facts (c4)" }, (lt, t) => {
    const pan = E.inOut(p(t, B("s5-1").start, BW("s5-1", "darden") + 0.4)); const k = ent(t, BS("s5-1", 1).start);
    return contextual("restaurant", `${ln("M0 860 H1920", 0.5, 4)}${at(lerp(960, -500, pan), 560, storefront("cafe"))}${at(lerp(2400, 640, pan), 560, storefront("diner"))}
      ${PD.label(lerp(2400, 640, pan), 920, "DARDEN RESTAURANTS · PARENT OF OLIVE GARDEN", { size: 26, anchor: "middle", fill: C.mist, ls: 3, op: pan })}
      <g opacity="${k}">${check(1080, 470, "NO EXPIRATION DATES", ent(t, BW("s5-1", "no expiration") - 0.1))}${check(1080, 580, "NO DORMANCY FEES", ent(t, BW("s5-1", "no dormancy") - 0.1))}</g>`
      + PD.source(SRC.drd, k), t); });

  shot("deferred", B("s5-1b").start - lead, { visual: "Restaurant counter: gift card purchase becomes a deferred-revenue receipt, then a redeemed meal becomes a sale", asset: "original illustrated transaction (c4, c5)" }, (lt, t) => {
    const ns = E.back(p(t, BW("s5-1b", "as a sale") - 0.1, BW("s5-1b", "as a sale") + 0.3)); const red = E.inOut(p(t, BW("s5-1b", "records the sale") - 0.3, BW("s5-1b", "records the sale") + 0.6)); const dv = ent(t, BW("s5-1b", "deferred revenue") - 0.2); const pf = ent(t, BW("s5-1b", "paid for") - 0.1);
    const receipt = `<g opacity="${dv}" transform="translate(780 245)"><rect width="460" height="540" fill="${C.paper}" filter="url(#soft)"/><path d="M0 520 l20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20 20 -20 20 20" fill="${C.paper}"/>
      ${PD.label(230, 95, "ACCOUNTING ENTRY", { size: 27, anchor: "middle", fill: C.ledger, ls: 5 })}<path d="M55 135 H405 M55 380 H405" stroke="#897f70" stroke-width="3"/>
      ${PD.serif(230, 235, "Deferred", { size: 70, fill: C.ink })}${PD.serif(230, 320, "revenue", { size: 70, fill: C.ink })}${PD.label(230, 435, "PAID FOR · NOT YET EARNED", { size: 23, anchor: "middle", fill: C.ink, ls: 2, op: pf })}</g>`;
    return contextual("restaurant", cam(pp(lt), 1.0, 1.035, `${card(330, 470, 300)}${PD.label(330, 650, "GIFT CARD BOUGHT", { size: 28, anchor: "middle", fill: C.text, ls: 3 })}${PD.stamp(330, 300, "NOT A SALE YET", ns, { size: 30 })}
      ${PD.path("M520 470 H 735", 215, dv, { stroke: C.gold, width: 5 })}${receipt}
      ${PD.path("M1250 470 H 1400", 150, red, { stroke: C.gold, width: 5 })}<g opacity="${red}">${at(1600, 470, plate(0.86))}${PD.label(1600, 660, "SALE RECORDED", { size: 31, anchor: "middle", fill: C.text, ls: 3 })}</g>
      ${PD.label(1600, 760, "WHEN THE CARD IS REDEEMED", { size: 24, anchor: "middle", fill: C.mist, ls: 3, op: red })}`, 960, 540) + PD.source(SRC.drd, ent(lt, 0.4)), t); });

  shot("remote", B("s5-2").start - lead, { in: "fade", inDur: 0.4, visual: "Paper: Darden's exact wording 'for which redemption is remote', highlighted; then a 12-year redemption period", asset: "exact quotation from the Darden FY2026 10-K (c4)", license: "owned layout; quotation from a public SEC filing" }, (lt, t) => {
    const k = ent(lt, 0.1); const hk = E.inOut(p(t, BW("s5-2", "for which redemption") - 0.2, BW("s5-2", "for which redemption") + 1.0)); const tw = p(t, BW("s5-2", "adds a detail") - 0.3, BW("s5-2", "adds a detail") + 0.3); const ty = E.inOut(p(t, BW("s5-2", "12 years") - 2.4, BW("s5-2", "12 years") - 0.1));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.03, `<g opacity="${1 - tw}">${(PD.filingQuote({ x: 260, y: 300, w: 1400, quote: "we can reasonably estimate the amount of gift cards for which redemption is remote, which is referred to as “breakage.”", highlight: "for which redemption is remote", cite: "DARDEN RESTAURANTS FORM 10-K · FISCAL 2026 (WORDING AS FILED)", k, hk, size: 58 }))}</g>`
      + `<g opacity="${tw}">${PD.label(960, 300, "BREAKAGE IS SPREAD OVER THE EXPECTED REDEMPTION PERIOD", { size: 30, anchor: "middle", fill: C.ledger, ls: 4 })}
        <line x1="260" y1="560" x2="${lerp(260, 1660, ty)}" y2="560" stroke="#2a2a2a" stroke-width="6" stroke-linecap="round"/>${Array.from({ length: 13 }, (_, i) => { const x = 260 + i * (1400 / 12); return `<g opacity="${clamp((ty * 12 - i) + 1)}"><line x1="${x}" y1="535" x2="${x}" y2="585" stroke="#2a2a2a" stroke-width="4"/>${PD.label(x, 640, i === 0 ? "SOLD" : String(i), { size: 26, anchor: "middle", fill: "#3a372f", ls: 1 })}</g>`; }).join("")}
        ${PD.number(960, 820, "generally 12 years", { size: 96, anchor: "middle", fill: C.signal, op: p(ty, 0.8, 1) })}</g>`, 960, 560) + PD.source(SRC.drd, 1, 1030, { dark: false })); });

  shot("twelve", B("s5-3").start - lead, { visual: "A 6th birthday to a high-school graduation, 12 years later: one card travels the line", asset: "original vector illustration (illustrative example from the narration)" }, (lt, t) => {
    const go = E.inOut(p(t, BW("s5-3", "birthday"), BW("s5-3", "graduation") + 0.4)); const g2 = ent(t, BW("s5-3", "graduation") - 0.3);
    return contextual("restaurant", cam(pp(lt), 1.0, 1.03, `${PD.serif(960, 210, "Twelve years.", { size: 90, op: ent(lt, 0) })}<line x1="360" y1="620" x2="1560" y2="620" stroke="${C.mist}" stroke-width="5" stroke-linecap="round"/>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${360 + i * 100}" y1="604" x2="${360 + i * 100}" y2="636" stroke="${C.mist}" stroke-width="3" opacity="0.7"/>`).join("")}
      ${at(360, 470, cake(ent(t, BW("s5-3", "birthday") - 0.4)))}${PD.label(360, 700, "AGE 6", { size: 30, anchor: "middle", fill: C.text, ls: 3, op: ent(t, BW("s5-3", "birthday") - 0.4) })}
      ${at(1560, 470, gradCap(g2))}${PD.label(1560, 700, "AGE 18", { size: 30, anchor: "middle", fill: C.text, ls: 3, op: g2 })}
      ${card(lerp(360, 1560, go), 790, 180, { meter: true })}${PD.label(960, 920, "STILL INSIDE THE FORECAST", { size: 28, anchor: "middle", fill: C.gold, ls: 4, op: g2 })}`), t); });

  shot("darden-pool", B("s5-4").start - lead, { in: "fade", inDur: 0.35, visual: "Darden FY2026 reconciliation as transaction evidence: cards loaded, redeemed and broken, then opening-to-closing balance", asset: "original restaurant illustration + sourced evidence graphic (c5, i2)", category: "financial evidence", background: "context", layout: "reconciliation", motion: "sequential evidence reveal", sourceQualified: true, semanticAnchor: "760.2,751.9" }, (lt, t) => {
    const a = E.out(p(t, BW("s5-4", "760.2") - 0.3, BW("s5-4", "760.2") + 0.8)); const b = E.out(p(t, BW("s5-5", "751.9") - 0.3, BW("s5-5", "751.9") + 0.8)); const c = ent(t, BW("s5-6", "ended the year") - 0.2); const d = E.back(p(t, BW("s5-6", "by our math") - 0.1, BW("s5-6", "by our math") + 0.4));
    const gt = E.back(p(t, B("s5-6").start - 0.1, B("s5-6").start + 0.4)) * (1 - c);
    return contextual("restaurant", cam(pp(lt), 1.0, 1.018, `${PD.label(960, 150, "DARDEN GIFT CARDS · FISCAL 2026", { size: 40, anchor: "middle", fill: C.text, ls: 3 })}
      ${PD.evidenceCard({ x: 180, y: 265, w: 720, h: 410, kicker: "CARDS LOADED", value: "$760.2M", detail: "VALUE ENTERING", k: a * (1 - c), accent: C.gold })}
      ${PD.evidenceCard({ x: 1020, y: 265, w: 720, h: 410, kicker: "REDEEMED + BREAKAGE", value: "$751.9M", detail: "LIABILITY REDUCED", k: b * (1 - c), accent: C.ledger })}
      <g opacity="${gt}"><circle cx="960" cy="470" r="52" fill="${C.gold}"/>${PD.number(960, 500, ">", { size: 84, anchor: "middle", fill: C.ink })}</g>
      ${PD.label(960, 760, "MORE WENT IN THAN CAME OUT", { size: 42, anchor: "middle", fill: C.text, ls: 2, op: gt })}
      <g opacity="${c}" transform="translate(0 ${lerp(24, 0, c)})"><rect x="230" y="270" width="1460" height="420" rx="18" fill="#f6f0e5" filter="url(#soft)"/><rect x="230" y="270" width="1460" height="16" rx="8" fill="${C.gold}"/>
        ${PD.label(560, 380, "START OF YEAR", { size: 38, anchor: "middle", fill: C.ink, ls: 2 })}${PD.number(560, 540, "$628.8M", { size: 118, anchor: "middle", fill: C.ink })}
        ${ln("M880 500 H1030 M995 465 L1035 500 L995 535", 1, 7, C.gold)}
        ${PD.label(1360, 380, "END OF YEAR", { size: 38, anchor: "middle", fill: C.ink, ls: 2 })}${PD.number(1360, 540, "$636.7M", { size: 118, anchor: "middle", fill: C.ink })}
        ${PD.label(960, 640, "UNREDEEMED GIFT CARD BALANCE", { size: 34, anchor: "middle", fill: C.ledger, ls: 2 })}</g>
      ${PD.label(960, 800, "+$7.9M IN ONE YEAR · OUR ARITHMETIC", { size: 46, anchor: "middle", fill: C.gold, ls: 2, op: d })}`, 960, 540) + PD.sourceCompact("DARDEN FY2026 FORM 10-K · CHANGE: OUR MATH", ent(lt, 0.3)), t); });

  shot("forecast", B("s5-7").start - lead, { visual: "A numbered estimate sheet beside the gift card: a forecast, actual breakage income may differ, estimates updated periodically", asset: "original restaurant illustration + explanatory document (c4)", category: "explanatory diagram", background: "context", layout: "step document", motion: "sequential evidence reveal", sourceQualified: true, semanticAnchor: "forecast,may differ,periodically" }, (lt, t) => {
    const k = E.out(p(lt, 0.1, 1.0)); const s2 = ent(t, BW("s5-7", "redeem differently") - 0.2); const s3 = ent(t, BW("s5-7", "periodically") - 0.3);
    const step = (y, n, head, detail, a, col) => `<g opacity="${a}" transform="translate(0 ${lerp(18, 0, a)})"><circle cx="720" cy="${y - 16}" r="42" fill="${col}"/>${PD.label(720, y, n, { size: 44, anchor: "middle", fill: C.paper, ls: 0 })}
      ${PD.label(800, y - 22, head, { size: 46, fill: C.ink, ls: 1 })}${PD.label(800, y + 30, detail, { size: 34, fill: C.ledger, ls: 0.5, weight: 600 })}</g>`;
    const swing = 8 * Math.sin(E.inOut(p(t, BW("s5-7", "periodically") - 0.2, B("s5-7").end + 1.0)) * Math.PI * 2);
    return contextual("restaurant", cam(pp(lt), 1.0, 1.02, `<rect x="170" y="150" width="1580" height="760" rx="18" fill="#f6f0e5" filter="url(#soft)"/>
      ${PD.serif(960, 255, "Breakage is a forecast", { size: 76, fill: C.ink, op: k })}
      <g opacity="${k}">${card(410, 560, 380, { meter: true }, -6 + swing * s3)}${PD.label(410, 760, "DARDEN GIFT CARDS", { size: 30, anchor: "middle", fill: C.ink, ls: 2 })}</g>
      ${step(400, "1", "AN ESTIMATE", "BASED ON ITS OWN REDEMPTION HISTORY", k, C.ledger)}
      ${step(580, "2", "BREAKAGE INCOME MAY DIFFER", "IF PEOPLE REDEEM DIFFERENTLY", s2, C.signal)}
      ${step(760, "3", "ESTIMATES ARE UPDATED", "PERIODICALLY", s3, C.gold)}`, 960, 540) + PD.sourceCompact("DARDEN FY2026 FORM 10-K · SEC EDGAR", k), t); });

  // ===================== s6 PREDICTED =====================
  shot("predicted", B("s6-1").start - lead, { in: "fade", inDur: 0.5, visual: "Typography: 'Not counted. Predicted.'", asset: "original typography" }, (lt, t) => {
    const a = ent(t, BS("s6-1", 1).start - 0.1), b = ent(t, BS("s6-1", 2).start - 0.1); const strike = E.inOut(p(t, BS("s6-1", 1).end - 0.2, BS("s6-1", 1).end + 0.3));
    return dark(cam(pp(lt), 1.0, 1.04, `${PD.label(960, 330, "FROM BOOKKEEPING TO A STORY", { size: 30, anchor: "middle", fill: C.mist, ls: 6, op: ent(lt, 0.1) * (1 - b) })}
      ${PD.serif(960, 520, "Not counted.", { size: 120, op: a * (1 - 0.45 * b) })}<rect x="${960 - 360}" y="482" width="${720 * strike}" height="8" fill="${C.mist}" opacity="${0.7 * a}"/>${PD.serif(960, 690, "Predicted.", { size: 140, fill: C.signal, op: b })}`, 960, 600)); });

  shot("sensitivity", B("s6-3").start - lead, { visual: "A breakage-assumption evidence sheet links a 50-basis-point change to about $3.6M of income, up or down", asset: "original sourced evidence graphic (c6)", category: "financial evidence", background: "paper", layout: "sensitivity sheet", motion: "assumption reveal", sourceQualified: true, semanticAnchor: "50 basis" }, (lt, t) => {
    const k = ent(lt, 0.1); const tb = BW("s6-3", "50 basis"); const sw = Math.sin(E.inOut(p(t, tb - 0.2, tb + 1.0)) * Math.PI / 2) + (t > B("s6-3").end ? -2 * E.inOut(p(t, B("s6-3").end + 0.2, B("s6-3").end + 1.2)) : 0);
    const hp = ent(t, BW("s6-3", "half of one") - 0.1); const m = E.back(p(t, BW("s6-3", "3.6 million") - 0.2, BW("s6-3", "3.6 million") + 0.4));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.018, `${PD.serif(960, 150, "The estimate changes the income line", { size: 70, fill: C.ink })}
      <rect x="210" y="255" width="1500" height="610" rx="18" fill="#fbf7ef" filter="url(#soft)"/>
      ${PD.label(320, 340, "BREAKAGE-RATE ASSUMPTION", { size: 42, fill: C.ledger, ls: 1, op: k })}
      <line x1="400" y1="465" x2="1520" y2="465" stroke="${C.ledger}" stroke-width="7" opacity="${k}"/>
      ${[-1, 0, 1].map((i) => `${PD.label(960 + i * 370, 535, i === 0 ? "AS ESTIMATED" : i < 0 ? "−50 BP" : "+50 BP", { size: 38, anchor: "middle", fill: C.ink, ls: 1, op: k })}`).join("")}
      <circle cx="${960 + 370 * sw}" cy="465" r="29" fill="${C.signal}" opacity="${k}"/>
      ${PD.label(960, 625, "50 BASIS POINTS = HALF A PERCENTAGE POINT", { size: 37, anchor: "middle", fill: C.ledger, ls: 0.5, op: hp })}
      ${PD.number(960, 770, "ABOUT $3.6M", { size: 104, anchor: "middle", fill: C.ink, op: m })}
      ${PD.label(960, 825, "BREAKAGE INCOME FOR THE YEAR", { size: 38, anchor: "middle", fill: C.ink, ls: 1, op: m })}`) + PD.sourceCompact("DARDEN FY2026 FORM 10-K · SEC EDGAR", k, { dark: false })); });

  shot("input", B("s6-4").start - lead, { visual: "On a household desk, the unused card feeds a forecast whose output line moves company income", asset: "original environment illustration + motion graphic (illustrative)", layout: "environment" }, (lt, t) => {
    const ud = Math.sin(lt * 2.4) * (1 - p(t, BS("s6-4", 1).start, BS("s6-4", 1).start + 0.6)); const d = ent(t, BW("s6-4", "your drawer") - 0.3); const f = E.inOut(p(t, BW("s6-4", "an input") - 0.3, BW("s6-4", "an input") + 0.5)); const inc = E.inOut(p(t, BW("s6-4", "moves a company") - 0.3, BW("s6-4", "moves a company") + 0.8));
    return contextual("desk", cam(pp(lt), 1.0, 1.03, `${PD.serif(960, lerp(470, 440, ent(lt, 0)), "Up or down.", { size: 110, op: ent(lt, 0) * (1 - d) })}${at(960, 650, ln(`M-60 ${-40 * ud} L0 ${40 * ud} L60 ${-40 * ud}`, ent(lt, 0) * (1 - d), 6, C.signal))}
      <g opacity="${d}">${card(330, 540, 300)}${PD.label(330, 700, "THE CARD IN YOUR DRAWER", { size: 26, anchor: "middle", fill: C.text, ls: 2 })}</g>
      ${PD.path("M500 540 H 760", 260, f, { stroke: C.gold, width: 5 })}${box(960, 540, 380, 150, "FORECAST", { k: f })}
      ${PD.path("M1150 540 H 1300", 150, inc, { stroke: C.gold, width: 5 })}<g opacity="${inc}"><rect x="1320" y="380" width="420" height="320" rx="16" fill="${C.ink2}" stroke="${C.mist}" stroke-opacity="0.6" stroke-width="3"/>${PD.label(1530, 430, "COMPANY INCOME", { size: 26, anchor: "middle", fill: C.text, ls: 3 })}
        ${PD.path(`M1350 620 L1430 590 L1510 610 L1590 ${560 - 40 * Math.sin(lt * 1.6)} L1700 ${520 - 50 * Math.sin(lt * 1.6)}`, 450, inc, { stroke: C.signal, width: 5 })}</g>`, 960, 540), t); });

  // ===================== s7 THE THIRD PLAYER =====================
  shot("third", B("s7-1").start - lead, { visual: "The bookmarked filing phrase returns; the third box becomes THE GOVERNMENT", asset: "original motion graphic" }, (lt, t) => {
    const tab = E.out(p(lt, 0, 0.6)); const rv = E.inOut(p(t, BW("s7-1", "third player") - 0.3, BW("s7-1", "third player") + 0.5));
    return dark(cam(pp(lt), 1.0, 1.03, `${claimants(t, B("s7-1").start + 0.2, { reveal: [rv * 0.0, rv * 0.0, rv] })}${card(960, 760, 280)}`, 960, 600) + `<g transform="translate(${lerp(-440, 60, tab)} 60)" opacity="${1 - p(t, BW("s7-1", "third player"), BW("s7-1", "third player") + 0.6)}"><rect width="420" height="84" fill="${C.signal}"/>${PD.label(30, 54, "REMEMBER THIS", { size: 32, fill: C.ink, ls: 5 })}</g>`
      + `<g opacity="${rv}">${at(1480, 250, govBuilding(0.7), 0, 0.38)}</g>`); });

  shot("plain", B("s7-2").start - lead, { in: "fade", inDur: 0.35, visual: "Plain English: where unclaimed-property laws apply -> some unspent money may go to the government -> built into Starbucks' estimate", asset: "original diagram (c2)" }, (lt, t) => {
    const a = ent(lt, 0.15), b = ent(t, BW("s7-2", "the government") - 0.4), c = ent(t, BW("s7-2", "builds that") - 0.3);
    return dark(cam(pp(lt), 1.0, 1.02, `${PD.label(960, 170, "IN PLAIN ENGLISH", { size: 32, anchor: "middle", fill: C.mist, ls: 6, op: a })}
      ${box(380, 520, 520, 170, "UNCLAIMED-PROPERTY", { k: a, sub: "LAWS, WHERE THEY APPLY" })}${PD.path("M640 520 H 760", 120, b, { stroke: C.gold, width: 5 })}
      <g opacity="${b}">${at(960, 470, govBuilding(0.7), 0, 0.55)}${PD.label(960, 605, "SOME UNSPENT MONEY", { size: 32, anchor: "middle", fill: C.text, ls: 2 })}${PD.label(960, 648, "MAY GO TO THE GOVERNMENT", { size: 32, anchor: "middle", fill: C.text, ls: 2 })}</g>
      ${PD.path("M1160 520 H 1280", 120, c, { stroke: C.gold, width: 5 })}${box(1540, 520, 500, 170, "IN STARBUCKS'", { k: c, accent: true, sub: "BREAKAGE ESTIMATE" })}`) + PD.source(SRC.sbux, a)); });

  shot("complex", B("s7-3").start - lead, { in: "fade", inDur: 0.4, visual: "Paper: Darden's exact wording on unclaimed property laws ('highly complex ... subjective assumptions, estimates, and judgments')", asset: "exact quotation from the Darden FY2026 10-K (c10)", license: "owned layout; quotation from a public SEC filing" }, (lt, t) => {
    const k = ent(lt, 0.1); const hk = E.inOut(p(t, BW("s7-3", "highly complex") - 0.2, BW("s7-3", "subjective") + 1.2));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.03, PD.filingQuote({ x: 220, y: 270, w: 1480, quote: "unclaimed property laws and litigation, and stock-based compensation, are highly complex and involve many subjective assumptions, estimates, and judgments by us", highlight: "highly complex and involve many subjective assumptions, estimates, and judgments", cite: "DARDEN RESTAURANTS FORM 10-K · FISCAL 2026 (EXCERPT, WORDING AS FILED)", k, hk, size: 56 }), 960, 540)); });

  shot("unknown", B("s7-4").start - lead, { visual: "The government box keeps its question mark: NOT DISCLOSED; 'So we won't guess.'", asset: "original motion graphic" }, (lt, t) => {
    const st = E.back(p(t, BW("s7-4", "actually ends up") - 0.1, BW("s7-4", "actually ends up") + 0.4)); const g = ent(t, BW("s7-4", "won't guess") - 0.2);
    return dark(cam(pp(lt), 1.0, 1.04, `${at(960, 430, govBuilding(0.75), 0, 1.1)}${PD.serif(960, 560, "?", { size: 220, fill: C.mist, op: 0.9 })}${PD.stamp(960, 720, "NOT DISCLOSED IN EITHER FILING", st, { size: 34, rot: -4 })}
      ${PD.serif(960, 900, "So we won't guess.", { size: 64, op: g })}`, 960, 540) + PD.source(SRC.both, ent(lt, 0.4))); });

  // ===================== s8 THE FLOOR, AND THE OWNER =====================
  shot("rules", B("s8-1").start - lead, { in: "fade", inDur: 0.5, visual: "A regulation card sits on a household desk; one-year inactivity fee and five-year funds-expiry floors are revealed beside an unbranded gift card", asset: "original desk illustration + regulation graphic (c7)", category: "financial evidence", background: "context", layout: "rule document", motion: "sequential rule reveal", sourceQualified: true, semanticAnchor: "regulation e,five years" }, (lt, t) => {
    const k = E.inOut(p(t, B("s8-1").start + 0.6, BW("s8-2", "five years") + 0.4)); const f = ent(t, BW("s8-3", "full year") - 0.3); const m = ent(t, BW("s8-3", "one a month") - 0.2);
    return contextual("desk", cam(pp(lt), 1.0, 1.018, `<rect x="180" y="165" width="1560" height="700" rx="18" fill="#f6f0e5" filter="url(#soft)"/>
      ${PD.serif(960, 260, "The federal floor", { size: 76, fill: C.ink, op: ent(lt, 0) })}
      ${PD.label(960, 325, "REGULATION E · GIFT CARDS", { size: 38, anchor: "middle", fill: C.ledger, ls: 2 })}
      <g opacity="${1 - f}">${card(580, 590, 470, { meter: true })}</g>
      ${PD.evidenceCard({ x: 250, y: 390, w: 680, h: 420, kicker: "AFTER 1 INACTIVE YEAR", value: "FEES", detail: "AT MOST ONE A MONTH", k: f, accent: C.gold })}
      ${PD.evidenceCard({ x: 990, y: 390, w: 680, h: 420, kicker: "FUNDS VALID AT LEAST", value: "5 YEARS", detail: "FROM ISSUE OR LAST LOAD", k, accent: C.signal })}`, 960, 540) + PD.sourceCompact("CFPB · 12 CFR 1005.20 (REGULATION E)", ent(lt, 0.4)), t); });

  shot("owner", B("s8-4").start - lead, { visual: "The rules form a ring around the card; then the drawer slides shut on it ('can't protect a card from its owner')", asset: "original motion graphic" }, (lt, t) => {
    const ring = E.out(p(lt, 0.1, 1.0)); const shut = E.inOut(p(t, BS("s8-4", 1).start + 0.3, BS("s8-4", 1).end + 0.3));
    return contextual("desk", cam(pp(lt), 1.0, 1.04, `${drawer(1 - shut)}<g opacity="${ring * (1 - shut)}"><ellipse cx="${A.cx}" cy="${A.cy}" rx="330" ry="250" fill="none" stroke="${C.ledger}" stroke-width="8" stroke-dasharray="${2 * Math.PI * 290 * ring} 4000"/>
      ${PD.label(A.cx, A.cy - 280, "5-YEAR FLOOR · FEE LIMITS", { size: 26, anchor: "middle", fill: C.text, ls: 3 })}</g>`, A.cx, A.cy), t); });

  shot("lost-34", B("s8-5").start - lead, { in: "fade", inDur: 0.35, visual: "A household card and a single large survey finding: 34% of US adults reported losing money through a gift-card mistake", asset: "original desk illustration + sourced survey graphic (c9)", category: "data visualization", background: "context", layout: "survey finding", motion: "card-to-survey reveal", sourceQualified: true, semanticAnchor: "34 percent" }, (lt, t) => {
    const t0 = BW("s8-5", "34 percent"); const n = Math.round(34 * E.out(p(t, t0, t0 + 1.0))); const G = { x: 1090, y: 250, gap: 66 };
    return contextual("desk", cam(pp(lt), 1.0, 1.025, `${card(470, 540, 570, { meter: true })}
      <rect x="900" y="250" width="850" height="580" rx="18" fill="#f6f0e5" filter="url(#soft)"/>
      ${PD.label(980, 340, "BANKRATE / YOUGOV SURVEY", { size: 38, fill: C.ledger, ls: 1 })}
      ${PD.number(980, 600, `${n}%`, { size: 210, fill: C.signal, op: ent(t, t0 - 0.2) })}
      ${PD.lines(985, 680, ["OF US ADULTS SAID THEY LOST", "MONEY TO A GIFT-CARD MISTAKE"], { size: 43, fill: C.ink, op: ent(t, t0 - 0.2), lh: 1.25 })}`, 960, 540) + PD.sourceCompact("BANKRATE / YOUGOV · AUG 2024 · 2,373 US ADULTS", ent(lt, 0.3)), t); });

  shot("mistakes", B("s8-6").start - lead, { visual: "Three large survey response cards replace the small bar chart; the card-expiry caveat remains explicit", asset: "original sourced survey evidence (c9, c7; contradiction x1 resolved on screen)", category: "financial evidence", background: "paper", layout: "survey cards", motion: "sequential response reveal", sourceQualified: true, semanticAnchor: "expire,lost a card" }, (lt, t) => {
    const cav = ent(t, BS("s8-6", 1).start - 0.1) * (1 - p(t, B("s8-7").start - 0.3, B("s8-7").start + 0.2));
    const cards = [["LET A CARD EXPIRE", "20%", "ONE IN FIVE ADULTS", B("s8-6").start], ["LOST A CARD", "17%", "OF ADULTS", B("s8-7").start], ["OUT OF BUSINESS", "12%", "STORE CLOSED FIRST", BS("s8-7", 1).start]];
    const spread = E.inOut(p(t, B("s8-7").start - 0.2, B("s8-7").start + 0.8));
    return svg(defs() + paperBg() + cam(pp(lt), 1.0, 1.018, `${PD.serif(960, 190, "How people said they lost it", { size: 76, fill: C.ink })}
      ${PD.label(960, 258, "SHARE OF US ADULTS · SURVEY RESPONSES", { size: 37, anchor: "middle", fill: C.ledger, ls: 2 })}
      ${cards.map(([lab, val, det, ti], i) => PD.evidenceCard({ x: i === 0 ? lerp(700, 160, spread) : 160 + i * 540, y: 340, w: 500, h: 450, kicker: lab, value: val, detail: det, k: E.out(p(t, ti - 0.1, ti + 0.8)), accent: i === 0 ? C.signal : C.ledger })).join("")}
      <g opacity="${cav}"><rect x="210" y="835" width="1500" height="98" rx="12" fill="${C.ledger}"/>${PD.label(960, 900, "SOME CARDS CAN EXPIRE · FEDERAL FLOOR: 5 YEARS", { size: 38, anchor: "middle", fill: C.text, ls: 1 })}</g>`) + PD.sourceCompact("BANKRATE / YOUGOV · AUG 2024 · 2,373 US ADULTS", ent(lt, 0.3), { dark: false })); });

  shot("avg-244", B("s8-8").start - lead, { visual: "$244 average unused value among holders, staged with cards on a household desk", asset: "original data graphic + environment illustration (c8)", layout: "environment" }, (lt, t) => {
    const tn = BW("s8-8", "244"); const v = 244 * E.out(p(t, tn - 0.4, tn + 0.8));
    return contextual("desk", cam(pp(lt), 1.0, 1.04, `${PD.serif(960, 300, "The amounts aren't trivial.", { size: 64, op: ent(lt, 0.05) * (1 - ent(t, BS("s8-8", 1).start - 0.2)) })}${PD.label(960, 300, "AVERAGE UNUSED VALUE", { size: 34, anchor: "middle", fill: C.mist, ls: 6, op: ent(t, BS("s8-8", 1).start - 0.2) })}
      ${PD.number(960, 580, `$${Math.round(v)}`, { size: 280, anchor: "middle", fill: C.gold, op: ent(t, tn - 0.5) })}${PD.label(960, 680, "PER PERSON HOLDING SOME", { size: 34, anchor: "middle", fill: C.text, ls: 5, op: ent(t, tn) })}
      ${[0, 1, 2].map((i) => `<g opacity="${0.5 * ent(lt, 0.2 + i * 0.12)}">${card(640 + i * 320, 880, 200, { meter: false, dim: 0.3 })}</g>`).join("")}`, 960, 560) + PD.source(SRC.survey, ent(lt, 0.3)), t); });

  // ===================== s9 PAYOFF =====================
  shot("ask", B("s9-1").start - lead, { in: "fade", inDur: 0.55, visual: "Callback: one card, three claimants, now named; 'So, who keeps the money?'", asset: "original motion graphic" }, (lt, t) =>
    dark(cam(pp(lt), 1.0, 1.03, claimants(t, B("s9-1").start + 0.1, { reveal: [ent(lt, 0.8), ent(lt, 1.0), ent(lt, 1.2)] }) + card(960, 760, 280), 960, 600) + head("So, who keeps the money?", ent(lt, 0), 175, 80)));

  shot("answer", B("s9-2").start - lead, { in: "fade", inDur: 0.4, visual: "Three illustrated destinations revealed beat by beat: holder, issuer, and where laws apply, the government", asset: "original editorial illustration (summary of c2, c4, c10)", layout: "editorial tableau", textWeight: "low" }, (lt, t) => {
    const k = (B("s9-2").start < t ? 1 / 3 : 0) * E.out(p(t, B("s9-2").start, B("s9-2").start + 0.6)) + (1 / 3) * E.out(p(t, B("s9-3").start, B("s9-3").start + 0.6)) + (1 / 3) * E.out(p(t, B("s9-4").start, B("s9-4").start + 0.6));
    const keys = [{ t: B("s9-2").start, x: 960, y: 540, z: 1.0 }, { t: B("s9-2").start + 1.4, x: 400, y: 560, z: 1.3 }, { t: B("s9-3").start + 0.4, x: 960, y: 560, z: 1.3 }, { t: B("s9-4").start + 0.4, x: 1520, y: 560, z: 1.3 }, { t: B("s9-4").end + 0.6, x: 960, y: 540, z: 1.0 }];
    const a = E.out(p(t, B("s9-2").start, B("s9-2").start + 0.7));
    const b = E.out(p(t, B("s9-3").start, B("s9-3").start + 0.7));
    const c = E.out(p(t, B("s9-4").start, B("s9-4").start + 0.7));
    const diagram = `<path d="M470 600 H750 M1170 600 H1430" stroke="${C.ledger}" stroke-width="5" stroke-dasharray="16 18" opacity="${0.6 * k}"/>
      <g opacity="${a}">${card(390, 530, 310)}${PD.label(390, 760, "ON PAPER · YOU", { size: 30, anchor: "middle", fill: C.ink, ls: 2 })}${PD.label(390, 805, "THE BALANCE WAITS", { size: 24, anchor: "middle", fill: C.ledger, ls: 2 })}</g>
      <g opacity="${b}"><rect x="820" y="370" width="300" height="370" rx="12" fill="${C.ledger}"/><path d="M800 370 H1140 l-35 -80 H835 Z" fill="${C.signal}"/><rect x="940" y="520" width="100" height="220" fill="${C.paper}" opacity="0.28"/>${PD.label(970, 800, "THE COMPANY", { size: 30, anchor: "middle", fill: C.ink, ls: 2 })}${PD.label(970, 845, "ESTIMATES BREAKAGE", { size: 24, anchor: "middle", fill: C.ledger, ls: 2 })}</g>
      <g opacity="${c}"><path d="M1370 450 L1580 340 L1790 450 Z" fill="${C.ledger}"/><rect x="1400" y="450" width="360" height="270" fill="${C.paper}" stroke="${C.ledger}" stroke-width="8"/>${[1450,1530,1610,1690].map((x) => `<rect x="${x}" y="465" width="35" height="230" fill="${C.ledger}"/>`).join("")}<path d="M1380 730 H1780" stroke="${C.ledger}" stroke-width="20"/>${PD.label(1580, 800, "GOVERNMENT", { size: 30, anchor: "middle", fill: C.ink, ls: 2 })}${PD.label(1580, 845, "MAY TAKE PART · AMOUNT UNKNOWN", { size: 22, anchor: "middle", fill: C.ledger, ls: 1 })}</g>`;
    return svg(defs() + paperBg() + camKeys(t, keys, diagram) + PD.serif(960, 175, "Who keeps the money?", { size: 70, fill: C.ink, op: ent(lt, 0.05) }) + PD.source(SRC.both, ent(lt, 0.4), 1020, { dark: false })); });

  shot("unknowable", B("s9-5").start - lead, { in: "fade", inDur: 0.45, visual: "The card wall again: some cards fade to outlines ('how many of us never come back'), unknowable in advance", asset: "original motion graphic (illustrative, not to scale)" }, (lt, t) => {
    const fade = E.inOut(p(t, BW("s9-5", "never come back") - 1.0, BW("s9-5", "never come back") + 0.6));
    return wall(lt + 3, { fadeSome: fade, tilt: 30 }) + over(`${PD.label(960, 980, "UNKNOWABLE IN ADVANCE", { size: 32, anchor: "middle", fill: C.text, ls: 8, op: fade })}`); });

  shot("choice", B("s9-6").start - lead, { visual: "Split: a meal and a coffee (line art) vs a highlighted line in someone else's annual report", asset: "original vector illustration" }, (lt, t) => {
    const a = ent(t, BS("s9-6", 2).start); const m = ent(t, BW("s9-6", "a meal") - 0.3); const r2 = ent(t, BW("s9-6", "annual report") - 0.6); const hk = E.inOut(p(t, BW("s9-6", "annual report") - 0.2, BW("s9-6", "annual report") + 0.8));
    const pre = 1 - a; const s0 = ent(t, B("s9-6").start), s1 = ent(t, BS("s9-6", 1).start);
    return contextual("restaurant", cam(pp(lt), 1.0, 1.07, `<g opacity="${pre}">${PD.serif(960, 430, "The company can estimate.", { size: 76, op: s0 })}${PD.serif(960, 560, "The government may take a slice.", { size: 76, op: s1 })}</g>
      <g opacity="${a}"><line x1="960" y1="200" x2="960" y2="900" stroke="${C.mist}" stroke-opacity="0.3" stroke-width="3"/>${card(960 + 240 * Math.sin(lt * 0.55), 160, 220, {}, 6 * Math.sin(lt * 0.55))}
        <g opacity="${m}">${at(500, 560 + 10 * Math.sin(lt * 0.7 + 1), plate(1.1))}${at(720, 500 + 12 * Math.sin(lt * 0.9), cup(0.9))}${PD.label(560, 800, "A MEAL AND A COFFEE", { size: 32, anchor: "middle", fill: C.text, ls: 4 })}</g>
        <g opacity="${r2}">${at(1420, 560 + 14 * Math.sin(lt * 0.8), reportDoc(1, hk), 3 + 2.5 * Math.sin(lt * 0.6), 0.95)}${PD.label(1420, 880, "A LINE IN SOMEONE ELSE'S REPORT", { size: 28, anchor: "middle", fill: C.text, ls: 3 })}</g></g>`), t); });

  shot("check-it", B("s9-7").start - lead, { in: "fade", inDur: 0.4, visual: "Callback: the drawer opens; the card's balance glows; 'Go check it.'", asset: "original vector illustration" }, (lt, t) => {
    const g = ent(t, BS("s9-7", 1).start - 0.1);
    return contextual("desk", cam(pp(lt), 1.0, 1.08, drawer(E.out(p(lt, 0.05, 1.2)), { glow: 0.6 + 0.4 * Math.sin(lt * 3) }), A.cx, A.cy) + `<rect width="1920" height="1080" fill="${C.ink}" opacity="${0.55 * g}"/>` + PD.serif(960, 560, "Go check it.", { size: 120, op: g }), t); });

  shot("end", B("s9-7").end + 1.0, { in: "fade", inDur: 0.8, visual: "End card: channel name and the four sources", asset: "original typography" }, (lt) => {
    const k = ent(lt, 0.2); const srcs = ["Starbucks Corporation, Form 10-K, fiscal 2025 (SEC EDGAR)", "Darden Restaurants, Form 10-K, fiscal 2026 (SEC EDGAR)", "CFPB, 12 CFR 1005.20 (Regulation E)", "Bankrate survey by YouGov, Aug 19-21, 2024 (2,373 US adults)"];
    return dark(cam(pp(lt), 1.0, 1.03, `${PD.label(960, 260, "PROFITDECODED", { size: 40, anchor: "middle", fill: C.text, ls: 12, op: k })}<rect x="${960 - 300 * k}" y="290" width="${600 * k}" height="4" fill="${C.signal}"/>
      ${PD.label(960, 400, "SOURCES", { size: 28, anchor: "middle", fill: C.mist, ls: 6, op: ent(lt, 0.6) })}${srcs.map((s, i) => PD.label(960, 470 + i * 58, s, { size: 30, anchor: "middle", fill: C.text, ls: 1, weight: 500, op: ent(lt, 0.8 + i * 0.15) })).join("")}
      ${PD.label(960, 800, "BREAKAGE FIGURES ARE COMPANY ESTIMATES · TOTALS MARKED 'OUR ARITHMETIC' ARE OURS", { size: 28, anchor: "middle", fill: C.mist, ls: 2, op: ent(lt, 1.6) })}
      <g opacity="${0.8 * ent(lt, 0.4)}">${card(960, 940, 150 + 6 * Math.sin(lt), { meter: false })}</g>`)); });

  shots.sort((a, b) => a.start - b.start);
  shots.forEach((s, i) => { s.end = i + 1 < shots.length ? shots[i + 1].start : PD.audioDur; });
  return { shots, duration: PD.audioDur };
};
