"use strict";

const impossibleBrief = require("./impossible-brief");
const criticalThread = require("./critical-thread");

function engineFor(channelOrTopic) {
  const slug = typeof channelOrTopic === "string" ? channelOrTopic : channelOrTopic && (channelOrTopic.channel || channelOrTopic.slug);
  return slug === "critical-thread" ? criticalThread : impossibleBrief;
}

function evaluateTopic(topic, allTopics = []) { return engineFor(topic).evaluateTopic(topic, allTopics); }
function evaluatePackage(pkg) { return engineFor(pkg.channel || pkg.topic).evaluatePackage(pkg); }

module.exports = { engineFor, evaluateTopic, evaluatePackage };
