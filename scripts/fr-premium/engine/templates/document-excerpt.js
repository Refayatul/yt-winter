// Template: document-excerpt. A finding or quotation typeset from its verified passage when no scan
// with a measured region exists. It never imitates a scan: a plain card, set type, a visible
// "typeset, not a scan" disclosure, and the citation from evidence.json. The text shown is the claim's
// passage verbatim (an ellipsis only at word boundaries); the highlight sweeps the claim's display
// words, which must occur in the passage (validator).
(function (root) {
  const { S, H } = typeof module !== "undefined" && module.exports ? require("./_common.js") : root.FR_TPL_COMMON;
  const T = {
    id: "document-excerpt", version: 1, provenance: ["document"], minStates: 2,
    params: { type: "object", required: ["claim", "highlightAt", "disclosure", "chip"], additionalProperties: false, properties: {
      claim: S.claim, highlightAt: S.timeRef, enter: S.window2, disclosure: S.text, chip: S.chip, source: S.source,
      // a related image behind the card, dimmed; test imagery must say it is a test and not the accident (validator)
      backdrop: { type: "object", required: ["asset", "kind", "label"], additionalProperties: false, properties: { asset: S.asset, kind: { enum: ["historical-photo", "historical-drawing", "test-imagery"] }, label: S.text } },
      push: { type: "object", required: ["window", "zoom"], additionalProperties: false, properties: { window: S.window2, zoom: { type: "number", minimum: 1, maximum: 1.3 } } } } },
    states: ["card-enters", "highlight"],
    // the words shown: the passage, trimmed to the sentence that holds the highlighted display
    excerpt(claim) { const pass = claim.passage; const hl = String(claim.display || "").replace(/\|/g, " ");
      const i = hl ? pass.indexOf(hl) : -1; return { text: pass, hl, at: i }; },
    build(FR, shot, ctx) {
      const P = shot.params; const { E, p, lerp, C, F, W, H: HH, esc } = FR; const cl = ctx.claim(P.claim.slice(6)); const ex = T.excerpt(cl);
      const src = ctx.source(cl.source); const cite = `${src.title.replace(/\s*\(.*?\)\s*/g, " ").replace(/,?\s*NSSDC plain-text edition/, "").trim()}${cl.locator ? ` · ${cl.locator}` : ""}`;
      // wrap the passage into lines of <= 26 characters, keeping the highlight's span index per word
      const words = ex.text.split(/\s+/); let pos = 0; const marks = words.map((w) => { const a = ex.text.indexOf(w, pos); pos = a + w.length; return { w, hot: ex.at >= 0 && a >= ex.at && a < ex.at + ex.hl.length }; });
      const lines = []; let cur = []; let n = 0; for (const m of marks) { if (n + m.w.length > 26 && cur.length) { lines.push(cur); cur = []; n = 0; } cur.push(m); n += m.w.length + 1; } if (cur.length) lines.push(cur);
      const tH = ctx.time(P.highlightAt); const ent = P.enter ? H.win(P.enter, ctx) : [shot.start, shot.start + 0.4]; const pw = P.push ? H.win(P.push.window, ctx) : null;
      const render = (t) => { const k = E.out(p(t, ent[0], ent[1])); const hk = E.inOut(p(t, tH - 0.05, tH + 0.5)); const z = pw ? lerp(1, P.push.zoom, E.inOut(p(t, pw[0], pw[1]))) : 1;
        const lh = 74, top = 820 - (lines.length * lh) / 2; let hotSeen = 0; const hotTotal = marks.filter((m) => m.hot).length;
        const body = lines.map((ln, i) => `<div style="height:${lh}px;white-space:nowrap">${ln.map((m) => { if (!m.hot) return `<span>${esc(m.w)}</span>`; hotSeen += 1; const on = hk * hotTotal >= hotSeen - 0.5;
          return `<span style="background:linear-gradient(90deg, rgba(229,72,77,.42) ${on ? 100 : 0}%, transparent 0);color:#15181d">${esc(m.w)}</span>`; }).join(" ")}</div>`).join("");
        const bk = P.backdrop ? ctx.assetKey(P.backdrop.asset) : null; const bm = bk ? FR.media[bk] : null; const u = p(t, shot.start, shot.end);
        const media = bm ? [FR.photo(bk, { fx: bm.iw / 2, fy: bm.ih * 0.45, z: 1.05 + 0.1 * u, opacity: 0.9, filter: "brightness(0.42) saturate(0.85)" })] : [];
        const bl = P.backdrop ? `<div style="position:absolute;left:60px;top:${top - 190}px;right:60px;line-height:42px;opacity:${k};font:800 32px ${F.sans};letter-spacing:2px;color:#ffd0a0;text-transform:uppercase;text-shadow:0 2px 8px #000">${P.backdrop.kind === "test-imagery" ? "◆ " : ""}${esc(H.text(P.backdrop.label, ctx))}</div>` : "";
        return { media, under: `<rect width="${W}" height="${HH}" fill="${C.ink}"/><rect width="${W}" height="${HH}" fill="url(#vig)"/>`,
          hud: `<div style="position:absolute;left:70px;right:70px;top:${top - 70}px;transform:translateY(${(1 - k) * 60}px) scale(${z.toFixed(4)});transform-origin:50% 50%;opacity:${k};background:#f3eee3;border-radius:6px;padding:46px 44px 40px;box-shadow:0 24px 60px rgba(0,0,0,.55)">
            <div style="font:700 32px ${F.sans};letter-spacing:2px;color:#5b574e;margin-bottom:22px;text-transform:uppercase">${esc(H.text(P.disclosure, ctx))}</div>
            <div style="font:600 52px/${lh}px ${F.serif};color:#2b2a27">${body}</div>
            <div style="font:600 32px ${F.sans};color:#4a4740;margin-top:24px">${esc(cite)}</div></div>`
            + bl + FR.chip(H.text(P.chip.label, ctx), P.chip.kind || "document") + (P.source ? FR.source(H.text(P.source.text, ctx), k, P.source.y) : "") }; };
      return { render };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T; else (root.FR_TEMPLATES = root.FR_TEMPLATES || {})[T.id] = T;
})(typeof window !== "undefined" ? window : globalThis);
