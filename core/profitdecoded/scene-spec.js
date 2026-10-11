"use strict";

// ProfitDecoded scene specification (profitdecoded.scene-spec.v1): a declarative shot list that a model
// (Haiku, task "scene-spec" in config/llm-routing.json) can write and that
// scripts/profitdecoded/motion/spec-scenes.js renders with the brand library. It replaces the
// handwritten scenes.js for films that ship a scene-spec.json; films with a scenes.js are unchanged.
//
// Objective gates (validate): known scene types and their required fields, beat ids that exist in the
// timeline, phrase cues that occur in the beat, text-length limits that keep every on-screen line at or
// above the mobile font floor, a source line on every figure, and on-screen numbers that appear in the
// research dossier when one is supplied. Editorial judgement (is this the right picture?) stays human.

const Diversity = require("./visual-diversity");

const ENVIRONMENTS = ["desk", "cafe", "checkout", "restaurant"];
const PROPS = ["payment-card", "phone", "terminal", "document", "envelope", "calendar", "stack", "drawer", "folder", "coin", "ticket"];
const BACKGROUNDS = ["dark", "paper", "context"];
const CAMERAS = ["push", "drift", "pull", "none"];

// type -> diversity role and required fields. Text limits are characters at the component's fixed size;
// at those sizes every essential line is >= 11 px tall on a 640 px wide phone preview (render-motion
// measures this per shot in visual-frame-samples.json).
const TYPES = {
  "environment": { category: "real-world illustration", layout: "environment", background: "context", required: ["environment"] },
  "evidence-card": { category: "financial evidence", layout: "evidence card", required: ["kicker", "value", "detail", "source"] },
  "counter": { category: "data visualization", layout: "chart", required: ["value", "label", "source"] },
  "money-flow": { category: "explanatory diagram", layout: "diagram", required: ["nodes", "links"] },
  "comparison": { category: "data visualization", layout: "comparison", required: ["items", "source"] },
  "timeline": { category: "explanatory diagram", layout: "timeline", required: ["marks"] },
  "filing-quote": { category: "financial evidence", layout: "document", background: "paper", required: ["quote", "cite"] },
  "statement": { category: "branded title card", layout: "statement", required: ["text"] },
  "rule-card": { category: "explanatory diagram", layout: "rule card", required: ["title", "lines", "source"] },
  "sum": { category: "data visualization", layout: "chart", required: ["items", "total", "source"] },
  "map": { category: "explanatory diagram", layout: "map", required: ["points", "routes"] },
};
const TEXT = { kicker: 30, value: 12, detail: 40, label: 34, statement: 42, title: 34, line: 44, lines: 5, quoteChars: 260, cite: 80, source: 70, node: 22, mark: 18, item: 24, prop: 22, point: 18 };

const words = (s) => String(s || "").split(/\s+/).filter(Boolean);
const numbersIn = (text) => (String(text || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || []);

// On-screen strings of one scene, for the text and number gates.
function textsOf(scene) {
  const out = [];
  const add = (field, value, max) => { if (value != null && value !== "") out.push({ field, value: String(value), max }); };
  add("kicker", scene.kicker, TEXT.kicker); add("value", scene.value, TEXT.value); add("detail", scene.detail, TEXT.detail);
  add("label", scene.label, TEXT.label); add("title", scene.title, TEXT.title); add("source", scene.source, TEXT.source); add("cite", scene.cite, TEXT.cite);
  add("caption", scene.caption, TEXT.label);
  if (scene.type === "statement") add("text", scene.text, TEXT.statement);
  if (scene.quote) add("quote", scene.quote, TEXT.quoteChars);
  (scene.lines || []).forEach((line, i) => add(`lines[${i}]`, line, TEXT.line));
  (scene.nodes || []).forEach((node, i) => { add(`nodes[${i}].label`, node.label, TEXT.node); add(`nodes[${i}].sub`, node.sub, TEXT.node); });
  (scene.links || []).forEach((link, i) => add(`links[${i}].label`, link.label, TEXT.node));
  (scene.marks || []).forEach((mark, i) => { add(`marks[${i}].label`, mark.label, TEXT.mark); add(`marks[${i}].sub`, mark.sub, TEXT.mark); });
  (scene.items || []).forEach((item, i) => { add(`items[${i}].label`, item.label, TEXT.item); add(`items[${i}].value`, item.display || item.value, TEXT.value); });
  if (scene.total) { add("total.label", scene.total.label, TEXT.item); add("total.value", scene.total.display || scene.total.value, TEXT.value); }
  (scene.props || []).forEach((prop, i) => add(`props[${i}].label`, prop.label, TEXT.prop));
  (scene.points || []).forEach((point, i) => add(`points[${i}].label`, point.label, TEXT.point));
  if (scene.overlay) for (const t of textsOf({ ...scene.overlay, type: "evidence-card" })) out.push({ ...t, field: `overlay.${t.field}` });
  return out;
}

function beatSpan(timeline, id) {
  const sentences = timeline.filter((s) => s.beatId === id);
  return sentences.length ? { start: sentences[0].start, end: sentences[sentences.length - 1].end, text: sentences.map((s) => `${s.text} ${s.spoken || ""}`).join(" ").toLowerCase() } : null;
}

// validate(spec, { timeline, allowedNumbers }) -> { passes, blockers, warnings, shots }
function validate(spec, options = {}) {
  const blockers = []; const warnings = [];
  const timeline = options.timeline || null;
  const allowed = options.allowedNumbers ? new Set(options.allowedNumbers.map(String)) : null;
  if (!spec || spec.schema !== "profitdecoded.scene-spec.v1") blockers.push('spec.schema must be "profitdecoded.scene-spec.v1"');
  const scenes = Array.isArray(spec && spec.scenes) ? spec.scenes : [];
  if (!scenes.length) blockers.push("spec has no scenes");
  const ids = new Set();
  scenes.forEach((scene, index) => {
    const at = `scene ${index + 1} (${scene && scene.id || "no id"})`;
    if (!scene || !scene.id) { blockers.push(`${at}: missing id`); return; }
    if (ids.has(scene.id)) blockers.push(`${at}: duplicate id`); ids.add(scene.id);
    const type = TYPES[scene.type];
    if (!type) { blockers.push(`${at}: unknown type "${scene.type}" (${Object.keys(TYPES).join(", ")})`); return; }
    for (const field of type.required) if (scene[field] == null || (Array.isArray(scene[field]) && !scene[field].length)) blockers.push(`${at}: ${scene.type} needs "${field}"`);
    if (scene.background && !BACKGROUNDS.includes(scene.background)) blockers.push(`${at}: background ${scene.background} (${BACKGROUNDS.join(", ")})`);
    if (scene.camera && !CAMERAS.includes(scene.camera)) blockers.push(`${at}: camera ${scene.camera} (${CAMERAS.join(", ")})`);
    if (scene.environment && !ENVIRONMENTS.includes(scene.environment)) blockers.push(`${at}: environment ${scene.environment} (${ENVIRONMENTS.join(", ")})`);
    for (const prop of scene.props || []) if (!PROPS.includes(prop.kind)) blockers.push(`${at}: prop ${prop.kind} (${PROPS.join(", ")})`);
    if (scene.type === "money-flow") {
      const nodeIds = new Set((scene.nodes || []).map((n) => n.id));
      for (const link of scene.links || []) if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) blockers.push(`${at}: link ${link.from}->${link.to} names a missing node`);
      if ((scene.nodes || []).length > 6) blockers.push(`${at}: ${(scene.nodes || []).length} nodes (max 6 for phone legibility)`);
    }
    if (scene.type === "map") {
      const pointIds = new Set((scene.points || []).map((p) => p.id));
      for (const route of scene.routes || []) if (!pointIds.has(route.from) || !pointIds.has(route.to)) blockers.push(`${at}: route ${route.from}->${route.to} names a missing point`);
    }
    if (scene.type === "comparison" && (scene.items || []).length !== 2) warnings.push(`${at}: comparison reads best with exactly 2 items`);
    if ((scene.lines || []).length > TEXT.lines) blockers.push(`${at}: ${(scene.lines || []).length} text lines (max ${TEXT.lines})`);
    // timing
    if (!scene.beat && !(typeof scene.start === "number")) blockers.push(`${at}: needs a beat id (or an absolute start)`);
    if (timeline && scene.beat) {
      const span = beatSpan(timeline, scene.beat);
      if (!span) blockers.push(`${at}: beat ${scene.beat} is not in the timeline`);
      for (const cue of [scene.cue, ...(scene.cues || []), ...((scene.items || []).map((i) => i.cue)), ...((scene.marks || []).map((m) => m.cue)), ...((scene.props || []).map((p) => p.cue))].filter(Boolean)) {
        if (span && !span.text.includes(String(cue).toLowerCase())) blockers.push(`${at}: cue "${cue}" is not spoken in beat ${scene.beat}`);
      }
    }
    // text: mobile floor via length limits, and sourcing
    const texts = textsOf(scene);
    for (const t of texts) if (t.value.length > t.max) blockers.push(`${at}: ${t.field} is ${t.value.length} characters (max ${t.max} at the mobile font floor)`);
    const figures = texts.filter((t) => !/^(source|cite)$/.test(t.field) && numbersIn(t.value).length);
    if (figures.length && !scene.source && !scene.cite && !(scene.overlay && scene.overlay.source)) blockers.push(`${at}: shows a figure (${figures[0].value}) without a source line`);
    if (allowed) {
      for (const t of figures) for (const n of numbersIn(t.value)) if (!allowed.has(n)) blockers.push(`${at}: number ${n} in ${t.field} is not in the dossier`);
    }
    if (scene.estimate === true && !/estimate|our (arithmetic|math|sum)/i.test(texts.map((t) => t.value).join(" ") + " " + (scene.stamp || ""))) warnings.push(`${at}: marked estimate but no on-screen qualifier (stamp "ESTIMATE" or "OUR ARITHMETIC")`);
    if (!scene.visual) warnings.push(`${at}: no "visual" description (needed for the diversity review)`);
  });
  return { passes: blockers.length === 0, blockers, warnings };
}

// Shots for the pre-render visual-diversity review (timings from the timeline, else the spec's own).
function planShots(spec, timeline) {
  const scenes = spec.scenes || [];
  const starts = scenes.map((scene) => (timeline && scene.beat ? (beatSpan(timeline, scene.beat) || {}).start : scene.start) || 0);
  return scenes.map((scene, i) => {
    const type = TYPES[scene.type] || {};
    return {
      id: scene.id, start: starts[i], end: i + 1 < scenes.length ? starts[i + 1] : (timeline && timeline.length ? timeline[timeline.length - 1].end + 4 : starts[i] + 6),
      category: scene.category || type.category, background: scene.background || type.background || "dark", layout: scene.layout || type.layout,
      motion: scene.camera || "push", visual: scene.visual || scene.type, semanticAnchor: scene.anchor || "", sourceQualified: !!(scene.source || scene.cite),
      textWeight: scene.type === "statement" || scene.type === "rule-card" ? "high" : "low", asset: "original SVG motion graphic (scene spec)", license: "owned",
    };
  });
}

function diversity(spec, timeline) { return Diversity.analyze(planShots(spec, timeline), { timeline: timeline || [] }); }

// JSON schema for the model's structured output (one flat scene object; per-type rules are enforced by
// validate, because the output schema has to stay simple enough for every routed model).
function outputSchema() {
  const str = { type: "string" };
  const num = { type: "number" };
  const obj = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
  return obj({
    schema: { type: "string", enum: ["profitdecoded.scene-spec.v1"] },
    scenes: { type: "array", items: obj({
      id: str, type: { type: "string", enum: Object.keys(TYPES) }, beat: str, cue: str, visual: str, anchor: str,
      background: { type: "string", enum: BACKGROUNDS }, camera: { type: "string", enum: CAMERAS }, environment: { type: "string", enum: ENVIRONMENTS },
      kicker: str, value: str, countTo: num, prefix: str, suffix: str, decimals: num, detail: str, label: str, title: str, text: str, accent: str,
      quote: str, highlight: str, cite: str, source: str, stamp: str, caption: str, estimate: { type: "boolean" },
      lines: { type: "array", items: str },
      props: { type: "array", items: obj({ kind: { type: "string", enum: PROPS }, x: num, y: num, scale: num, label: str, cue: str }, ["kind"]) },
      overlay: obj({ kicker: str, value: str, detail: str, source: str, cue: str }, ["kicker", "value", "detail", "source"]),
      nodes: { type: "array", items: obj({ id: str, label: str, sub: str, x: num, y: num, accent: { type: "boolean" } }, ["id", "label", "x", "y"]) },
      links: { type: "array", items: obj({ from: str, to: str, label: str, accent: { type: "boolean" } }, ["from", "to"]) },
      items: { type: "array", items: obj({ label: str, value: num, display: str, cue: str, accent: { type: "boolean" } }, ["label", "value"]) },
      total: obj({ label: str, value: num, display: str }, ["label", "value"]),
      marks: { type: "array", items: obj({ at: num, label: str, sub: str, cue: str, accent: { type: "boolean" } }, ["at", "label"]) },
      points: { type: "array", items: obj({ id: str, label: str, x: num, y: num }, ["id", "label", "x", "y"]) },
      routes: { type: "array", items: obj({ from: str, to: str, label: str }, ["from", "to"]) },
    }, ["id", "type", "beat", "visual"]) },
  }, ["schema", "scenes"]);
}

module.exports = { TYPES, TEXT, ENVIRONMENTS, PROPS, BACKGROUNDS, CAMERAS, validate, planShots, diversity, outputSchema, textsOf, numbersIn };
