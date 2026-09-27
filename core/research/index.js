"use strict";

const ALLOWED_CONFIDENCE = new Set(["VERIFIED", "SUPPORTED", "ESTIMATED", "SPECULATIVE"]);
const PRIMARY_HOSTS = ["nasa.gov", "jpl.nasa.gov", "esa.int", "noaa.gov", "usgs.gov", "cern", "nist.gov", "nih.gov", "osti.gov", "ipcc.ch"];

function auditTopic(topic) {
  const errors = [];
  if (!topic.scientificMechanism) errors.push("missing scientific mechanism");
  if (!Array.isArray(topic.sources) || topic.sources.length < 2) errors.push("fewer than two sources");
  for (const source of topic.sources || []) {
    let host = "";
    try { host = new URL(source.url).hostname; } catch (error) { errors.push("invalid source URL"); }
    if (host && !PRIMARY_HOSTS.some((allowed) => host.includes(allowed))) errors.push("non-primary source: " + host);
  }
  const layers = new Set((topic.claimFramework || []).map((claim) => claim.layer));
  if (!layers.has("KNOWN SCIENCE") || !layers.has("ESTIMATED CONSEQUENCE") || !layers.has("SPECULATIVE SCENARIO")) errors.push("claim layers are incomplete");
  if ((topic.claimFramework || []).some((claim) => !ALLOWED_CONFIDENCE.has(claim.confidence))) errors.push("invalid confidence label");
  return { pass: errors.length === 0, errors, sourceCount: (topic.sources || []).length, sourceQuality: topic.sourceQuality && topic.sourceQuality.score };
}

module.exports = { ALLOWED_CONFIDENCE, PRIMARY_HOSTS, auditTopic };
