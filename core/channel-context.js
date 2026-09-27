"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "config", "channels.json");
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function registry() {
  const value = readJson(REGISTRY_PATH, null);
  if (!value || !value.channels || !value.defaultChannel) throw new Error("Invalid channel registry: config/channels.json");
  return value;
}

function parseChannelArgv(argv = process.argv.slice(2), options = {}) {
  let slug = null;
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--channel") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("--channel requires a channel slug");
      slug = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--channel=")) {
      slug = arg.slice("--channel=".length);
    } else rest.push(arg);
  }
  slug = slug || options.defaultSlug || process.env.YOUTUBE_CHANNEL_SLUG || registry().defaultChannel;
  if (!SLUG_PATTERN.test(slug)) throw new Error("Invalid channel slug: " + slug);
  if (!registry().channels[slug]) throw new Error("Unknown channel: " + slug);
  return { slug, argv: rest };
}

function selectChannel(slug) {
  if (!SLUG_PATTERN.test(String(slug || "")) || !registry().channels[slug]) throw new Error("Unknown channel: " + slug);
  process.env.YOUTUBE_CHANNEL_SLUG = slug;
  return getChannel(slug);
}

function currentSlug() {
  return process.env.YOUTUBE_CHANNEL_SLUG || registry().defaultChannel;
}

function envFileValue(name) {
  if (Object.prototype.hasOwnProperty.call(process.env, name) && String(process.env[name]).trim()) return String(process.env[name]).trim();
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && match[1] === name) return match[2].trim();
    }
  } catch (error) {}
  return "";
}

function buildPaths(slug, config) {
  const base = path.join(ROOT, "channels", slug);
  if (config.pathMode === "legacy-adapter") {
    return Object.freeze({
      base,
      topics: path.join(ROOT, "icerik", "konular"),
      topicUniverse: path.join(base, "topics", "topic-universe.json"),
      analytics: path.join(ROOT, "analytics"),
      analysis: path.join(ROOT, "analysis"),
      state: path.join(ROOT, "icerik"),
      memory: path.join(base, "memory"),
      reports: path.join(base, "reports"),
      prompts: path.join(base, "prompts"),
      packages: path.join(ROOT, "icerik", "paket"),
      production: path.join(ROOT, "uretim"),
      channelOutput: path.join(ROOT, "channel"),
      secrets: path.join(ROOT, "secrets", slug),
    });
  }
  return Object.freeze({
    base,
    topics: path.join(base, "topics", "specs"),
    topicUniverse: path.join(base, "topics", "topic-universe.json"),
    analytics: path.join(base, "analytics"),
    analysis: path.join(base, "analytics", "analysis"),
    state: path.join(base, "state"),
    memory: path.join(base, "memory"),
    reports: path.join(base, "reports"),
    prompts: path.join(base, "prompts"),
    packages: path.join(base, "reports", "packages"),
    production: path.join(base, "state", "production"),
    channelOutput: path.join(base, "reports"),
    secrets: path.join(ROOT, "secrets", slug),
  });
}

function getChannel(slug = currentSlug()) {
  const entry = registry().channels[slug];
  if (!entry) throw new Error("Unknown channel: " + slug);
  const configPath = path.join(ROOT, entry.config);
  const brandPath = path.join(ROOT, entry.brand);
  const config = readJson(configPath, null);
  const brand = readJson(brandPath, null);
  if (!config || config.slug !== slug || !brand) throw new Error("Channel config is incomplete: " + slug);
  const paths = buildPaths(slug, config);
  const prefix = config.credentialsPrefix;
  const scopedEnv = (name) => {
    const namespaced = envFileValue(prefix + "_" + name);
    if (namespaced) return namespaced;
    return config.allowLegacyYouTubeEnv ? envFileValue(name) : "";
  };
  const expectedChannelId = () => scopedEnv("YT_CHANNEL_ID") || String(config.youtubeChannelId || "").trim();
  const credentials = () => ({
    clientId: scopedEnv("YT_CLIENT_ID"),
    clientSecret: scopedEnv("YT_CLIENT_SECRET"),
    refreshToken: scopedEnv("YT_REFRESH_TOKEN"),
    expectedChannelId: expectedChannelId(),
    prefix,
  });
  return Object.freeze({ slug, name: config.name, entry, config, brand, paths, prefix, scopedEnv, expectedChannelId, credentials });
}

function selectFromArgv(argv = process.argv.slice(2), options = {}) {
  const parsed = parseChannelArgv(argv, options);
  return { channel: selectChannel(parsed.slug), argv: parsed.argv };
}

function ensureChannelDirectories(channel = getChannel()) {
  for (const key of ["analytics", "state", "memory", "reports", "prompts", "topics", "packages", "production"]) {
    fs.mkdirSync(channel.paths[key], { recursive: true });
  }
  return channel.paths;
}

module.exports = {
  ROOT, REGISTRY_PATH, SLUG_PATTERN, registry, parseChannelArgv, selectChannel, selectFromArgv,
  currentSlug, getChannel, ensureChannelDirectories,
};
