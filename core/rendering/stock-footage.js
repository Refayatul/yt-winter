"use strict";

// Moving footage for ImpossibleBrief / CriticalThread Shorts from the Pexels
// video API (documented, https://www.pexels.com/api/documentation/, key in
// PEXELS_KEY; Pexels License: free, no attribution required — credits are
// still written to the description). Failure Reconstructed already uses the
// same source (stok-bul.js).
//
// Stock footage is context, never evidence: it is tagged STOCK FOOTAGE on
// screen. A clip is used only when its descriptive page slug names the topic
// (a topic term from core/rendering/nasa-images.js), it is not about people,
// it is portrait HD, at least 5 seconds long and not mostly dark.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const https = require("https");
const Nasa = require("./nasa-images");

// Pexels needs an Authorization header and its file links redirect to a CDN.
function httpGet(url, options = {}, redirects = 5) {
  return new Promise((resolve) => {
    const request = https.get(url, { headers: { "User-Agent": "youtube-otomasyon/1.0", ...(options.headers || {}) }, timeout: 60000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && redirects > 0) {
        response.resume();
        // The key is for api.pexels.com only; never forward it to a CDN.
        return resolve(httpGet(new URL(response.headers.location, url).toString(), { ...options, headers: {} }, redirects - 1));
      }
      const parts = [];
      response.on("data", (chunk) => parts.push(chunk));
      response.on("end", () => { const buffer = Buffer.concat(parts); resolve({ status: response.statusCode, body: options.binary ? buffer : buffer.toString("utf8") }); });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () => resolve({ status: 0, body: options.binary ? Buffer.alloc(0) : "" }));
  });
}

const API = "https://api.pexels.com/videos/search";
const LICENCE = "Pexels License";
const MAX_CLIPS = 3;
// A Short about a port should not cut to a smiling stranger.
const PEOPLE = /\b(?:woman|women|man|men|girl|girls|boy|boys|person|people|couple|family|portrait|selfie|lady|guy|kid|kids|child|children|businessman|businesswoman|worker|workers|model|dancing|smiling|face)\b/i;

function slugWords(pageUrl) {
  const match = String(pageUrl || "").match(/\/video\/([^/]+?)(?:-\d+)?\/?$/);
  return match ? Nasa.contentWords(match[1].replace(/-/g, " ")) : [];
}

function queries(topic) {
  const scenes = (Array.isArray(topic.visualScenes) ? topic.visualScenes : (topic.visualPotential || {}).scenes || [])
    .map((scene) => typeof scene === "string" ? scene : scene && scene.text).filter(Boolean);
  const short = (text) => Nasa.contentWords(text).slice(0, 3).join(" ");
  return [...new Set([
    short(topic.canonicalTopic),
    ...Nasa.queries(topic).slice(0, 2).map(short),
    ...scenes.slice(0, 3).map(short),
    String(topic.category || "").toLowerCase(),
  ].filter((query) => query && query.split(/\s+/).length >= 1))].slice(0, 6);
}

function accept(video, terms) {
  if (!video || !(video.duration >= 5)) return false;
  const words = slugWords(video.url);
  if (!words.length || PEOPLE.test(words.join(" "))) return false;
  return words.some((word) => terms.anchors.has(word));
}

function pickFile(video) {
  return (video.video_files || [])
    .filter((file) => file.height >= file.width && file.height >= 960 && /mp4/i.test(file.file_type || "mp4") && file.link)
    .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0] || null;
}

// Mean luma of three frames; mostly dark clips read as black on a phone.
function brightness(file) {
  const { ffmpeg } = require("../../ff-yol");
  const out = cp.spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-vf", "fps=1/2,scale=64:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-frames:v", "3", "-f", "null", "-"], { encoding: "utf8", timeout: 60000 });
  const values = [...String(out.stderr || "").matchAll(/YAVG=([\d.]+)/g)].map((match) => Number(match[1]));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

async function search(topic, directory, key, options = {}) {
  const get = options.get || httpGet;
  const limit = options.limit || MAX_CLIPS;
  const terms = Nasa.topicTerms(topic);
  if (!key || !terms.anchors.size) return [];
  const seen = new Set(options.exclude || []);
  const candidates = [];
  for (const query of queries(topic)) {
    const response = await get(`${API}?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`, { json: true, headers: { Authorization: key } });
    if (!(response.status >= 200 && response.status < 300)) continue;
    let body;
    try { body = typeof response.body === "string" ? JSON.parse(response.body) : response.body; } catch (error) { continue; }
    for (const video of (body && body.videos) || []) {
      if (seen.has(video.id) || !accept(video, terms)) continue;
      const file = pickFile(video);
      if (!file) continue;
      seen.add(video.id);
      const score = slugWords(video.url).filter((word) => terms.anchors.has(word)).length;
      candidates.push({ video, file, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.video.id - b.video.id);
  const clips = [];
  for (const { video, file, score } of candidates) {
    if (clips.length >= limit) break;
    const cachedFile = `pexels-${video.id}.mp4`;
    const target = path.join(directory, cachedFile);
    const response = await get(file.link, { binary: true });
    if (!(response.status >= 200 && response.status < 300) || !Buffer.isBuffer(response.body) || !response.body.length) continue;
    fs.writeFileSync(target, response.body);
    if ((options.brightness || brightness)(target) < 40) { fs.unlinkSync(target); continue; }
    clips.push({
      id: video.id,
      file: `Pexels video ${video.id}`,
      cachedFile,
      duration: video.duration,
      width: file.width,
      height: file.height,
      licence: LICENCE,
      author: (video.user && video.user.name) || "Pexels contributor",
      sourceUrl: video.url,
      origin: "pexels",
      score,
    });
  }
  return clips;
}

module.exports = { API, LICENCE, MAX_CLIPS, httpGet, slugWords, queries, accept, pickFile, brightness, search };
