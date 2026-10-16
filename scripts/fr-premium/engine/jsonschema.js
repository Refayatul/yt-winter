"use strict";
// Minimal JSON Schema validator for the premium engine's own schemas (no dependency).
// Supported keywords (draft 2020-12 semantics): type, enum, const, required, properties,
// additionalProperties (boolean or schema), patternProperties, minProperties, items, minItems, maxItems, minLength,
// pattern, minimum, maximum, exclusiveMinimum, oneOf, anyOf, $ref to "#/$defs/...". Unknown keywords
// are ignored except "x-*" annotations, which the engine reads itself (e.g. x-factual).
// The schemas are standard, so a full validator (e.g. Ajv) can replace this later without changes.
function typeOf(v) { return v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v; }
function okType(v, t) { const a = typeOf(v); return t === a || (t === "number" && a === "integer"); }
function validate(schema, value, root = schema, path = "$", errs = []) {
  if (schema === true || schema == null) return errs;
  if (schema === false) { errs.push(`${path}: not allowed`); return errs; }
  if (schema.$ref) { const ref = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => (o ? o[k] : undefined), root);
    if (!ref) { errs.push(`${path}: unresolved $ref ${schema.$ref}`); return errs; } return validate(ref, value, root, path, errs); }
  if (schema.type) { const ts = [].concat(schema.type); if (!ts.some((t) => okType(value, t))) { errs.push(`${path}: expected ${ts.join("|")}, got ${typeOf(value)}`); return errs; } }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errs.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: "${value}" does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: above ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) errs.push(`${path}: must be > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, root, `${path}[${i}]`, errs));
  }
  if (typeOf(value) === "object") {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${path}: missing required "${k}"`);
    if (schema.minProperties != null && Object.keys(value).length < schema.minProperties) errs.push(`${path}: fewer than ${schema.minProperties} properties`);
    const props = schema.properties || {}, pats = Object.entries(schema.patternProperties || {}).map(([p, s]) => [new RegExp(p), s]);
    for (const [k, v] of Object.entries(value)) {
      let matched = false;
      if (props[k] !== undefined) { matched = true; validate(props[k], v, root, `${path}.${k}`, errs); }
      for (const [re, s] of pats) if (re.test(k)) { matched = true; validate(s, v, root, `${path}.${k}`, errs); }
      if (!matched && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) errs.push(`${path}: unsupported property "${k}"`);
        else validate(schema.additionalProperties, v, root, `${path}.${k}`, errs);
      }
    }
  }
  for (const key of ["oneOf", "anyOf"]) if (schema[key]) {
    const passing = schema[key].filter((s) => validate(s, value, root, path, []).length === 0).length;
    if (key === "oneOf" ? passing !== 1 : passing < 1) errs.push(`${path}: must match ${key === "oneOf" ? "exactly one" : "at least one"} of ${schema[key].length} alternatives (matched ${passing})`);
  }
  return errs;
}
module.exports = { validate };
