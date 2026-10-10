"use strict";

// Editorial diagnostics for the measured ProfitDecoded shot list. These are prompts for
// review, not invented audience-retention measurements or hard creative quotas.
const CATEGORIES = new Set([
  "real-world illustration", "motion graphic", "data visualization", "financial evidence",
  "visual metaphor", "explanatory diagram", "branded title card",
]);

function inferCategory(shot) {
  const s = `${shot.asset || ""} ${shot.visual || ""}`.toLowerCase();
  if (/quotation|filing|10-k|paper:/.test(s)) return "financial evidence";
  if (/data graphic|chart|survey answers|timeline of the federal/.test(s)) return "data visualization";
  if (/vector illustration|line-art|drawer|cafe|restaurant/.test(s)) return "real-world illustration";
  if (/diagram|schematic|money flow/.test(s)) return "explanatory diagram";
  if (/typography|title card|end card/.test(s)) return "branded title card";
  return "motion graphic";
}

function normalize(shots) {
  return shots.map((shot, i) => {
    const start = Number(shot.start), end = Number(shot.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`invalid shot timing: ${shot.id || i}`);
    const category = shot.category || inferCategory(shot);
    if (!CATEGORIES.has(category)) throw new Error(`invalid visual category: ${category}`);
    return {
      ...shot, start, end, duration: +(end - start).toFixed(2), category,
      classification: shot.category ? "authored" : "inferred",
      background: shot.background || (/paper|10-k|quotation|filing/.test(`${shot.visual} ${shot.asset}`.toLowerCase()) ? "paper" : "dark"),
      layout: shot.layout || (/chart|bars|dots|ruler/.test(`${shot.visual} ${shot.asset}`.toLowerCase()) ? "chart" : "other"),
      textWeight: shot.textWeight || (/typography|title card|dictionary-style/.test(`${shot.visual} ${shot.asset}`.toLowerCase()) ? "high" : "low"),
      motion: shot.motion || "unspecified",
      sourceQualified: shot.sourceQualified,
      semanticAnchor: shot.semanticAnchor || "",
    };
  });
}

function runs(shots, key) {
  const found = []; let first = 0;
  for (let i = 1; i <= shots.length; i += 1) {
    if (i < shots.length && shots[i][key] === shots[first][key]) continue;
    found.push({ value: shots[first][key], count: i - first, start: shots[first].start,
      end: shots[i - 1].end, duration: +(shots[i - 1].end - shots[first].start).toFixed(2),
      ids: shots.slice(first, i).map((s) => s.id) });
    first = i;
  }
  return found;
}

// Rolling windows over the shot list. A window "lacks variety" when one visual category fills
// nearly all of it; the window length is an editorial scale, not a pacing quota.
function varietyWindows(shots, windowSeconds = 90, step = 15) {
  const total = shots.length ? shots[shots.length - 1].end : 0; const out = [];
  for (let from = 0; from + windowSeconds <= total + 1e-6 || (from === 0 && total > 0); from += step) {
    const to = Math.min(total, from + windowSeconds); const secs = {};
    for (const s of shots) { const o = Math.min(to, s.end) - Math.max(from, s.start); if (o > 0) secs[s.category] = (secs[s.category] || 0) + o; }
    const span = to - from; const [dominant, sec] = Object.entries(secs).sort((a, b) => b[1] - a[1])[0] || ["none", 0];
    out.push({ start: from, end: to, distinctCategories: Object.keys(secs).length, dominant, dominantShare: span ? +(sec / span).toFixed(3) : 0 });
    if (to >= total) break;
  }
  return out;
}

function longestRun(shots, predicate) {
  let best = 0, cur = 0, start = null;
  for (const s of shots) { if (predicate(s)) { if (start === null) start = s.start; cur = s.end - start; best = Math.max(best, cur); } else { start = null; cur = 0; } }
  return +best.toFixed(2);
}

function analyze(rawShots, { timeline = [], frameObservations = [], freezes = [], windowSeconds = 90 } = {}) {
  const shots = normalize(rawShots);
  const total = shots.reduce((n, s) => n + s.duration, 0);
  const distribution = {};
  for (const s of shots) {
    const d = distribution[s.category] || { shots: 0, seconds: 0 };
    d.shots += 1; d.seconds = +(d.seconds + s.duration).toFixed(2); distribution[s.category] = d;
  }
  const issues = [];
  const guidance = {
    "repeated background": ["medium", "Change the visual setting when the argument moves to a new concrete subject."],
    "chart-heavy run": ["medium", "Keep the figures; consider a document, transaction, or physical example between chart treatments."],
    "repeated layout": ["medium", "Vary the composition when the narrative function changes."],
    "text-heavy run": ["medium", "Turn one explanation into an object, action, or sourced visual example."],
    "long shot for review": ["low", "Inspect internal reveals against spoken beats before changing its length."],
    "context opportunity": ["medium", "Look for a truthful everyday object or transaction that can carry the explanation."],
    "repeated motion": ["low", "Change the motion grammar when the spoken idea changes."],
    "narration alignment": ["high", "Place the visual on its spoken beat or document an intentional silence."],
    "semantic alignment": ["medium", "Confirm the picture represents the claim spoken at this time."],
    "mobile text": ["medium", "Increase essential type or simplify the layout for a 640 px phone preview."],
    "source qualification": ["high", "Keep an accurate, readable on-screen source and qualifier."],
    "static visual": ["medium", "Review the hold in context; add an information beat only when the narration supports it."],
    "low variety": ["medium", "One kind of visual carries this whole stretch; check whether a document, place, or transaction would explain the next idea better."],
  };
  // Sustained runs escalate one level once they reach twice their review threshold.
  const raise = { low: "medium", medium: "high", high: "high" };
  const add = (kind, r, why, diagnostic = {}, threshold = 0) => { const [base, suggestion] = guidance[kind]; const severity = threshold && r.duration >= 2 * threshold ? raise[base] : base;
    issues.push({ kind, severity, start: r.start, end: r.end, seconds: r.duration, shots: r.ids, why, diagnostic: { ...diagnostic, ...(threshold ? { measuredSeconds: r.duration, thresholdSeconds: threshold } : {}) }, suggestion }); };
  for (const r of runs(shots, "background")) if (r.value === "dark" && r.count >= 3 && r.duration >= 25) add("repeated background", r, `${r.count} consecutive ${r.value} treatments`, { count: r.count }, 25);
  for (const r of runs(shots, "layout")) if (r.value === "chart" && r.count >= 2 && r.duration >= 20) add("chart-heavy run", r, `${r.count} adjacent chart layouts`, { count: r.count }, 20);
  for (const r of runs(shots, "layout")) if (r.value !== "other" && r.count >= 3 && r.duration >= 22) add("repeated layout", r, `${r.count} adjacent ${r.value} layouts`, { count: r.count }, 22);
  for (const r of runs(shots, "textWeight")) if (r.value === "high" && r.count >= 2 && r.duration >= 16) add("text-heavy run", r, `${r.count} adjacent text-led shots`, { count: r.count }, 16);
  for (const s of shots) if (s.duration >= 22) add("long shot for review", { ...s, ids: [s.id] }, "Review internal visual progression against narration; duration alone is not a fault.");
  const nonContext = runs(shots.map((s) => ({ ...s, context: s.category === "real-world illustration" || s.background === "context" || s.background === "mixed" ? "context" : "abstract" })), "context");
  for (const r of nonContext) if (r.value === "abstract" && r.duration >= 70) add("context opportunity", r, "A concrete everyday example may improve comprehension here.", { count: r.count }, 70);
  for (const r of runs(shots, "motion")) if (!new Set(["unspecified", "animated"]).has(r.value) && r.count >= 3 && r.duration >= 25) add("repeated motion", r, `${r.count} adjacent shots use ${r.value}.`, { pattern: r.value, count: r.count });
  for (const s of shots) {
    const speech = timeline.filter((x) => x.end > s.start && x.start < s.end);
    if (timeline.length && speech.length === 0 && s.duration > 8 && s.category !== "branded title card") add("narration alignment", { ...s, ids: [s.id] }, "No measured spoken sentence overlaps this visual.", { overlappingSentences: 0 });
    if (s.semanticAnchor && speech.length) {
      const text = speech.map((x) => x.text).join(" ").toLowerCase();
      const terms = s.semanticAnchor.toLowerCase().split(/\s*,\s*/).filter(Boolean);
      if (terms.length && !terms.some((term) => text.includes(term))) add("semantic alignment", { ...s, ids: [s.id] }, `Authored visual anchor (${s.semanticAnchor}) is absent from overlapping narration.`, { overlappingSentences: speech.length });
    }
    const obs = frameObservations.filter((x) => x.shotId === s.id);
    const tiny = obs.filter((x) => x.essentialTextPxOn640 > 0 && x.essentialTextPxOn640 < 10);
    if (tiny.length) add("mobile text", { ...s, ids: [s.id] }, `Essential text falls below 10 px in ${tiny.length}/${obs.length} sampled 640 px phone frames.`, { samples: obs.length, smallSamples: tiny.length, minimumPx: Math.min(...tiny.map((x) => x.essentialTextPxOn640)) });
    // Source lines are excluded from the essential-text check above but still need to be legible.
    const deficient = obs.filter((x) => !x.sourcePresent || x.sourceClipped || (x.sourceTextPxOn640 > 0 && x.sourceTextPxOn640 < 8));
    if ((s.sourceQualified || /\bc\d+\b|\bi\d+\b/.test(s.asset || "")) && obs.length && deficient.length)
      add("source qualification", { ...s, ids: [s.id] }, "A sampled claim frame lacks a visible source, clips it at the edge, or sets it below 8 px on a 640 px phone frame.",
        { samples: obs.length, deficientSamples: deficient.length, minimumSourcePx: Math.min(...deficient.map((x) => x.sourceTextPxOn640 || 0)) });
  }
  for (const f of freezes) if (f.duration >= 2.5) add("static visual", { start: f.start, end: f.start + f.duration, duration: +f.duration.toFixed(2), ids: shots.filter((s) => s.start < f.start + f.duration && s.end > f.start).map((s) => s.id) }, `A ${f.duration.toFixed(1)} s near-static interval was measured in the rendered video.`, { thresholdSeconds: 2.5, measuredSeconds: f.duration });
  const windows = varietyWindows(shots, windowSeconds);
  let open = null; // merge overlapping flagged windows into one finding
  const flush = () => { if (!open) return; add("low variety", { start: open.start, end: open.end, duration: +(open.end - open.start).toFixed(2), ids: shots.filter((s) => s.start < open.end && s.end > open.start).map((s) => s.id) },
    `${open.dominant} fills at least 85% of every ${windowSeconds} s window here.`, { windowSeconds, dominantCategory: open.dominant, maxDominantShare: open.share }); open = null; };
  for (const w of windows) {
    if (w.dominantShare >= 0.85 && w.end - w.start >= windowSeconds * 0.99) {
      if (open && open.dominant === w.dominant && w.start <= open.end) { open.end = w.end; open.share = Math.max(open.share, w.dominantShare); }
      else { flush(); open = { start: w.start, end: w.end, dominant: w.dominant, share: w.dominantShare }; }
    } else flush();
  }
  flush();
  issues.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
  const switches = shots.slice(1).filter((s, i) => s.category !== shots[i].category).length;
  const bg = countSeconds(shots, "background"); const share = (sec) => total ? +(sec / total).toFixed(3) : 0;
  const summary = {
    categorySwitchesPerMinute: total ? +(switches / (total / 60)).toFixed(2) : 0,
    contextShare: share((bg.context || 0) + (bg.mixed || 0)),
    darkShare: share(bg.dark || 0),
    longestDarkRunSeconds: longestRun(shots, (s) => s.background === "dark"),
    longestAbstractRunSeconds: longestRun(shots, (s) => !(s.category === "real-world illustration" || s.background === "context" || s.background === "mixed")),
    lowestWindowVariety: windows.length ? Math.min(...windows.map((w) => w.distinctCategories)) : 0,
    issuesBySeverity: issues.reduce((m, x) => ({ ...m, [x.severity]: (m[x.severity] || 0) + 1 }), {}),
  };
  return {
    schema: "profitdecoded.visual-diversity.v2", method: "authored shot metadata, measured narration, optional rendered-frame observations and freeze detections; editorial heuristics only",
    shots: shots.length, seconds: +total.toFixed(2), medianShotSeconds: median(shots.map((s) => s.duration)),
    categories: distribution, backgrounds: countSeconds(shots, "background"), layouts: countSeconds(shots, "layout"),
    inferredClassifications: shots.filter((s) => s.classification === "inferred").length,
    frameSamples: frameObservations.length, summary,
    issues, shotList: shots,
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b); const m = Math.floor(sorted.length / 2);
  return +((sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2)).toFixed(2);
}
function countSeconds(shots, key) {
  const out = {}; for (const s of shots) out[s[key]] = +(Number(out[s[key]] || 0) + s.duration).toFixed(2);
  return out;
}
function markdown(report) {
  const stamp = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  return `# ProfitDecoded visual-diversity review\n\n${report.method}. No audience-performance data is implied.\n\n${report.shots} shots · ${report.seconds}s · median ${report.medianShotSeconds}s · ${report.inferredClassifications} inferred classifications · ${report.frameSamples} sampled frames.\n\n## Measured summary\n\n| Measure | Value |\n| --- | ---: |\n${Object.entries(report.summary).map(([k, v]) => `| ${k} | ${typeof v === "object" ? Object.entries(v).map(([a, b]) => `${a} ${b}`).join(", ") || "none" : v} |`).join("\n")}\n\n## Categories\n\n| Category | Shots | Seconds |\n| --- | ---: | ---: |\n${Object.entries(report.categories).map(([k, v]) => `| ${k} | ${v.shots} | ${v.seconds} |`).join("\n")}\n\n## Review flags\n\n${report.issues.length ? report.issues.map((x) => `- ${stamp(x.start)}–${stamp(x.end)} · ${x.severity.toUpperCase()} · ${x.kind}: ${x.why} ${x.suggestion} (${x.shots.join(", ")})`).join("\n") : "No threshold flags. Review the film directly before approval."}\n`;
}

// The automated pipeline's visual plan (scripts/profitdecoded/plan-visuals.js) names a graphic
// type per shot. Map those types onto the same editorial roles the motion films author by hand.
const PLAN_TYPES = {
  "chart": ["data visualization", "chart"], "animated-number": ["data visualization", "chart"], "price-animation": ["data visualization", "chart"],
  "filing-excerpt": ["financial evidence", "document"], "receipt": ["real-world illustration", "document"], "product-image": ["real-world illustration", "environment"],
  "stock": ["real-world illustration", "environment"], "comparison-panel": ["explanatory diagram", "comparison"], "unit-economics": ["explanatory diagram", "comparison"],
  "floor-plan": ["explanatory diagram", "diagram"], "money-flow": ["explanatory diagram", "diagram"], "money-flow-ui": ["explanatory diagram", "diagram"],
  "timeline": ["explanatory diagram", "diagram"], "diagram": ["explanatory diagram", "diagram"], "map": ["explanatory diagram", "diagram"],
  "ui-callout": ["explanatory diagram", "interface"], "typography": ["branded title card", "statement"],
};
const PAPER_TYPES = new Set(["filing-excerpt", "receipt", "comparison-panel", "unit-economics"]);
function fromPlanShot(shot, { id, start, end } = {}) {
  const [category, layout] = PLAN_TYPES[shot.type] || ["motion graphic", "other"];
  return { id, start, end, visual: shot.overlayText || shot.type, asset: `${shot.type} graphic${shot.evidenceClaimId ? ` (${shot.evidenceClaimId})` : ""}`,
    category, layout, background: PAPER_TYPES.has(shot.type) ? "paper" : "dark", textWeight: shot.type === "typography" ? "high" : "low",
    motion: shot.motion || "unspecified", sourceQualified: !!shot.evidenceClaimId };
}

module.exports = { analyze, markdown, inferCategory, normalize, varietyWindows, fromPlanShot };
