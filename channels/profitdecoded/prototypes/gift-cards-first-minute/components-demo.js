// Component check sheet for the full gift-card film (NOT part of the prototype video). Every quote and figure is
// copied exactly from dossier hbm-073 (claims c1, c2, c3, c4, c7, c10); each frame shows a component's final state.
window.THUMBS = function (PD) {
  const { C, svg, defs, vignette } = PD;
  const ink = (inner) => svg(defs() + inner + vignette(), C.ink);
  return [
    { id: "filing-quote", html: svg(defs() + `<rect width="1920" height="1080" fill="${C.paper}"/>` + PD.filingQuote({ x: 230, y: 210, w: 1460,
        quote: "Based on historical redemption rates, a portion of stored value cards is not expected to be redeemed and will be recognized as breakage over time in proportion to stored value card redemptions.",
        highlight: "recognized as breakage over time in proportion to stored value card redemptions", cite: "STARBUCKS CORPORATION · FORM 10-K · FISCAL YEAR ENDED SEPTEMBER 28, 2025", k: 1, hk: 1 })) },
    { id: "bar-chart", html: ink(PD.serif(960, 130, "Starbucks breakage revenue", { size: 64 }) +
        PD.barChart({ x: 420, y: 260, w: 1080, h: 520, k: 1, highlight: 2, unitLabel: "COMPANY-OPERATED STORES · $ MILLIONS", fmt: (v) => v.toFixed(1),
          series: [{ label: "FY2023", value: 196.1 }, { label: "FY2024", value: 187.6 }, { label: "FY2025", value: 200.4 }] }) +
        PD.source("Starbucks Form 10-K, fiscal 2025 (company-operated store revenues)")) },
    { id: "money-flow", html: ink(PD.serif(960, 130, "Starbucks cards and Stars, fiscal 2025", { size: 60 }) +
        PD.moneyFlow({ t: 1.2, k: 1, nodes: [{ id: "in", x: 360, y: 520, label: "$15,245.8M LOADED", sub: "activations, reloads, Stars earned" }, { id: "bal", x: 960, y: 520, label: "$1,751.7M BALANCE", sub: "at Sept 28, 2025", accent: true }, { id: "out", x: 1560, y: 520, label: "$15,199.5M RECOGNIZED", sub: "redemptions and breakage" }],
          links: [{ from: "in", to: "bal" }, { from: "bal", to: "out" }] }) + PD.source("Starbucks Form 10-K, fiscal 2025 (stored value cards and loyalty program)")) },
    { id: "timeline", html: ink(PD.serif(960, 150, "What federal rules allow", { size: 64 }) +
        PD.timeline({ x0: 300, x1: 1620, y: 560, k: 1, marks: [{ at: 0, label: "ISSUED OR LAST LOADED" }, { at: 0.2, label: "1 YEAR INACTIVE", sub: "a fee is now allowed, max 1 a month" }, { at: 1, label: "5 YEARS", sub: "earliest the funds may expire", accent: true }] }) +
        PD.source("CFPB, 12 CFR 1005.20 (Regulation E: gift cards)")) },
    { id: "compare", html: ink(PD.serif(960, 140, "Who keeps the money?", { size: 72 }) +
        PD.compare({ x: 140, y: 230, w: 1640, h: 560, k: 1, columns: [
          { kicker: "ON PAPER", title: "The holder", body: ["A non-expiring balance", "stays spendable."] },
          { kicker: "IN PRACTICE", title: "The issuer", body: ["Books the share it expects", "never to be redeemed,", "little by little."], accent: true },
          { kicker: "WHERE LAWS APPLY", title: "Government", body: ["Unclaimed-property laws", "may take part. Filings", "don't say how much."] }] }) +
        PD.source("Starbucks FY2025 and Darden FY2026 Form 10-K")) },
    { id: "statement", html: ink(PD.statement("Not counted. Predicted.", { accent: "Predicted.", size: 110 })) },
  ];
};
