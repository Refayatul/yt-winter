"use strict";
// ProfitDecoded configuration: channel config + decision weights. Every weight
// is overridable from channels/profitdecoded/decision-weights.json.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const CHANNEL_DIR = path.join(ROOT, "channels", "profitdecoded");

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; } }

const DEFAULT_WEIGHTS = Object.freeze({
  // Topic score dimensions (sum need not be 100; normalised).
  topic: { broadAudience: 9, curiosityGap: 10, surprise: 8, familiarBrand: 7, businessInsight: 7, moneyRelevance: 6, evergreen: 6, freshness: 3, evidenceQuality: 8, visualAvailability: 6, titlePotential: 6, thumbnailPotential: 4, shortsPotential: 4, longformPotential: 6, advertiserFit: 4, competitionOpenness: 3, novelty: 4, productionFeasibility: 4 },
  // Expected business value factors (weighted geometric mean with a floor).
  ebv: { viralPotential: 1.0, revenueOpportunity: 1.2, longformPotential: 1.2, evergreenValue: 1.0, subscriberQuality: 0.8, sponsorFit: 0.6, brandFit: 1.0 },
  ebvFloor: 20,
  // Final decision composition.
  decision: { demand: 8, outlierEvidence: 8, broadAppeal: 8, curiosity: 8, brandFit: 8, originalAngle: 6, researchQuality: 7, visualPotential: 6, longformPotential: 7, revenueOpportunity: 7, evergreenValue: 6, subscriberValue: 5 },
  decisionPenalties: { saturation: 18, copyrightRisk: 14, factualRisk: 16, productionRisk: 10 },
  // Quality score (spec section 23).
  quality: { topic: 15, hook: 15, storytelling: 15, visual: 15, visualScriptMatch: 10, narration: 10, research: 8, editing: 5, title: 4, thumbnail: 3 },
  // Humanness (spec section 56): weights sum to 100.
  humanness: { scriptNaturalness: 14, sentenceVariation: 8, narrationProsody: 14, visualSpecificity: 12, visualRepetition: 8, editingVariation: 7, sourceDepth: 9, insightOriginality: 9, transitions: 5, emotionalRhythm: 4, graphicSpecificity: 5, topicTreatment: 5 },
});

function deepMerge(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = v && typeof v === "object" && !Array.isArray(v) && base && typeof base[k] === "object" ? deepMerge(base[k], v) : v;
  return out;
}

function channelConfig() { return readJson(path.join(CHANNEL_DIR, "config.json"), null); }
function weights() { return deepMerge(DEFAULT_WEIGHTS, readJson(path.join(CHANNEL_DIR, "decision-weights.json"), {})); }
function thresholds() { return (channelConfig() || {}).qualityThresholds || { autoPublish: 88, review: 76, humanness: { target: 90, hardReject: 85 }, firstThirtySeconds: 80, narration: 88, researchGate: 80, visualScriptMatch: 85, topicDecisionMinimum: 60 }; }

module.exports = { ROOT, CHANNEL_DIR, readJson, DEFAULT_WEIGHTS, deepMerge, channelConfig, weights, thresholds };
