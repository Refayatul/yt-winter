"use strict";

const fs = require("fs");
const path = require("path");
const { getChannel } = require("../channel-context");
const Overrides = require("../topic-overrides");

function universe(channel = getChannel()) {
  if (!fs.existsSync(channel.paths.topicUniverse)) return { topics: [] };
  const data = JSON.parse(fs.readFileSync(channel.paths.topicUniverse, "utf8"));
  data.topics = Overrides.apply(channel, data.topics || []);
  return data;
}

function usedIds(channel = getChannel()) {
  const files = ["published.json", "generated.json", "blocked.json"];
  const ids = new Set();
  // Upload rows (youtube-yukle.js, manual publish runs) carry the slug, not
  // always the topic id; without this a published topic stayed "unused" and
  // could be produced and uploaded again.
  let bySlug = null;
  const idForSlug = (slug) => {
    if (!slug) return null;
    if (!bySlug) {
      bySlug = new Map();
      try { for (const topic of universe(channel).topics || []) bySlug.set(topic.slug, topic.id); } catch (error) {}
    }
    return bySlug.get(slug) || null;
  };
  for (const file of files) {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(channel.paths.state, file), "utf8"));
      if (Array.isArray(value)) value.forEach((item) => {
        if (typeof item === "string") { ids.add(item); return; }
        const id = item && (item.topicId || idForSlug(item.slug));
        if (id) ids.add(id);
      });
      else Object.keys(value || {}).forEach((id) => ids.add(id));
    } catch (error) {}
  }
  return ids;
}

function discover(channel = getChannel(), options = {}) {
  const used = usedIds(channel);
  return universe(channel).topics
    .filter((topic) => topic.status === "qualified" && !used.has(topic.id))
    .filter((topic) => channel.slug !== "behind-the-ordinary" || topic.productionReady === true)
    .filter((topic) => !options.category || topic.category === options.category)
    .sort((a, b) => b.curiosityScore + b.visualPotential.score - a.curiosityScore - a.visualPotential.score)
    .slice(0, options.limit || 20);
}

module.exports = { universe, usedIds, discover };
