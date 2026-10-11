"use strict";

// Task -> model routing for paid Anthropic calls (config/llm-routing.json).
// * Cheap model by default; the configured stronger model is used only when the caller asks for an
//   escalation explicitly. There is no automatic fallback to another model.
// * Overrides: <PREFIX>_LLM_MODEL_<TASK> (channel) > LLM_MODEL_<TASK> (global) > config.
// * Channel isolation: each channel reads only its own key, <PREFIX>_ANTHROPIC_API_KEY. The shared
//   ANTHROPIC_API_KEY is never used here, so one channel cannot spend another channel's credentials.

const fs = require("fs");
const path = require("path");
const Channel = require("../channel-context");

const ROUTING_FILE = path.join(Channel.ROOT, "config", "llm-routing.json");

function loadRouting(file = ROUTING_FILE) {
  const routing = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!routing || !routing.tasks || !routing.prices) throw new Error(`invalid LLM routing config: ${file}`);
  return routing;
}

const envName = (task) => task.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

function envValue(name, env) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// resolve("short-script", channel) -> the model and limits for one call. Throws on an unknown task or model.
function resolve(task, channel, options = {}) {
  const env = options.env || process.env;
  const routing = options.routing || loadRouting();
  const spec = routing.tasks[task];
  if (!spec) throw new Error(`unknown LLM task "${task}"`);
  const prefix = channel.prefix || channel.config.credentialsPrefix;
  const overridden = envValue(`${prefix}_LLM_MODEL_${envName(task)}`, env) || envValue(`LLM_MODEL_${envName(task)}`, env);
  let model = overridden || spec.model;
  let escalated = false;
  if (options.escalate) {
    if (!spec.escalateTo) throw new Error(`task "${task}" has no escalation model configured`);
    model = spec.escalateTo; escalated = true;
  }
  const price = routing.prices[model];
  if (!price) throw new Error(`model "${model}" has no price in config/llm-routing.json: refusing to run an unpriced model`);
  return {
    task, model, escalated, overridden: !!overridden && !escalated,
    maxInputTokens: spec.maxInputTokens, maxOutputTokens: spec.maxOutputTokens, effort: spec.effort,
    category: spec.category, price, keyName: `${prefix}_ANTHROPIC_API_KEY`, channel: channel.slug,
  };
}

module.exports = { ROUTING_FILE, loadRouting, resolve, envName };
