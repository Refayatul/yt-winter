"use strict";

const fs = require("fs");
const path = require("path");
const { getChannel } = require("../channel-context");
const Discovery = require("../discovery");
const Quality = require("../quality/impossible-brief");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function legacyTopics(channel) {
  if (channel.config.pathMode !== "legacy-adapter" || !fs.existsSync(channel.paths.topics)) return [];
  return fs.readdirSync(channel.paths.topics)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const spec = read(path.join(channel.paths.topics, file), null);
      if (!spec) return null;
      const slug = path.basename(file, ".json");
      return {
        id: slug,
        slug,
        status: "qualified",
        category: spec.vaka?.kume || "uncategorized",
        sources: (spec.vaka?.kaynakca || []).map((source) => ({ name: source.ad || "documented source" })),
        sourceReady: !!(spec.vaka?.kaynakca || []).length,
        visualReady: !!(spec.sahneler || []).length,
        longFormPotential: { score: (spec.sahneler || []).length >= 8 ? 75 : 0 },
        confidence: "VERIFIED",
      };
    })
    .filter(Boolean);
}

function calculate(channel = getChannel()) {
  const library = Discovery.universe(channel);
  const legacy = channel.config.pathMode === "legacy-adapter";
  const topics = library.topics?.length ? library.topics : legacyTopics(channel);
  const generated = read(path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "uretilenler.json" : "generated.json"), []);
  const published = read(path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "yayinlananlar.json" : "published.json"), []);
  const blockedValue = read(path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "basarisiz.json" : "blocked.json"), legacy ? [] : {});
  const blockedObject = Array.isArray(blockedValue)
    ? Object.fromEntries(blockedValue.map((item) => [typeof item === "string" ? item : item.topicId || item.slug, true]))
    : blockedValue;
  const used = new Set([...generated.map((item) => typeof item === "string" ? item : item.topicId), ...published.map((item) => item.topicId || item.slug)]);
  const audits = legacy
    ? topics.map(() => ({ decision: "PUBLISH", blockers: [] }))
    : topics.map((topic) => Quality.evaluateTopic(topic, topics));
  const qualified = topics.filter((topic, index) => topic.status === "qualified" && audits[index].decision !== "BLOCK");
  const readyShorts = qualified.filter((topic) => !used.has(topic.id) && !used.has(topic.slug) && !blockedObject[topic.id]);
  const readyLong = readyShorts.filter((topic) => topic.longFormPotential && topic.longFormPotential.score >= 75);
  const categories = {};
  for (const topic of qualified) categories[topic.category] = (categories[topic.category] || 0) + 1;
  const authorityCoverage = {};
  for (const topic of qualified) for (const source of topic.sources || []) authorityCoverage[source.name] = (authorityCoverage[source.name] || 0) + 1;
  const cadence = channel.config.publishingCadence.shorts.everyDays || 1;
  const days = readyShorts.length * cadence;
  const minimumDays = 365;
  const minimumQualifiedTopics = channel.slug === "failure-reconstructed" ? 500 : 1000;
  const sourceReady = qualified.filter((topic) => topic.sourceReady !== false && (topic.sources || []).length >= 2).length;
  const visualReady = qualified.filter((topic) => topic.visualReady === true || (topic.visualPotential && topic.visualPotential.score >= 70)).length;
  const duplicateTopics = audits.filter((audit) => audit.blockers.includes("exact duplicate topic")).length;
  return {
    channel: channel.slug,
    channelName: channel.name,
    calculatedAt: new Date().toISOString(),
    qualifiedTopics: qualified.length,
    readyShorts: readyShorts.length,
    readyLongForm: readyLong.length,
    daysOfInventory: days,
    monthsOfInventory: Math.round(days / 30.4375 * 10) / 10,
    categoryDistribution: categories,
    sourceCoverage: authorityCoverage,
    blockedTopics: Object.keys(blockedObject).length,
    lowConfidenceTopics: qualified.filter((topic) => !["VERIFIED", "SUPPORTED"].includes(topic.confidence)).length,
    duplicateTopics,
    duplicateRate: topics.length ? Math.round(duplicateTopics / topics.length * 10000) / 100 : 0,
    sourceReadyRate: qualified.length ? Math.round(sourceReady / qualified.length * 10000) / 100 : 0,
    visualReadyRate: qualified.length ? Math.round(visualReady / qualified.length * 10000) / 100 : 0,
    acceptance: {
      minimumDays,
      minimumQualifiedTopics,
      daysPass: days >= minimumDays,
      topicTargetPass: qualified.length >= minimumQualifiedTopics,
      passes: days >= minimumDays && qualified.length >= minimumQualifiedTopics,
    },
  };
}

function write(channel = getChannel()) {
  const status = calculate(channel);
  fs.mkdirSync(channel.paths.state, { recursive: true });
  const file = path.join(channel.paths.state, "library-status.json");
  fs.writeFileSync(file, JSON.stringify(status, null, 2) + "\n");
  return { status, file };
}

module.exports = { calculate, write };
