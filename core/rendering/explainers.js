"use strict";

// Animated 2D explainer clips (diagrams, typographic cards, merges) declared by
// a topic's `explainerScenes`. Only topics that declare them are affected, so
// every other channel renders exactly as before.
//
// explainerScenes: [{ match: "<text in the narration line>" | claim: <index>, kind, ...kind fields }]
// Kinds are drawn by channels/behind-the-ordinary/explainer/render_explainer.py
// (Pillow + FFmpeg, free tooling).

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCRIPT = path.join(__dirname, "..", "..", "channels", "behind-the-ordinary", "explainer", "render_explainer.py");
const KINDS = new Set(["glyph-merge", "unite", "name-card", "shortlist"]);

let pythonCache;
function python() {
  if (pythonCache !== undefined) return pythonCache;
  const candidates = [process.env.EXPLAINER_PYTHON, "python3", "/opt/anaconda3/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].filter(Boolean);
  pythonCache = candidates.find((candidate) => {
    try { cp.execFileSync(candidate, ["-c", "import PIL"], { stdio: "ignore", timeout: 15000 }); return true; } catch (error) { return false; }
  }) || null;
  return pythonCache;
}

function available() { return !!python(); }

// Explainer spec for each narration line (by claim index), or null.
function forClaims(topic, claims) {
  const scenes = Array.isArray(topic && topic.explainerScenes) ? topic.explainerScenes.filter((scene) => KINDS.has(scene.kind)) : [];
  return (claims || []).map((claim, index) => {
    const text = String(claim && claim.text || "").toLowerCase();
    return scenes.find((scene) => scene.claim === index) ||
      scenes.find((scene) => scene.claim == null && scene.match && text.includes(String(scene.match).toLowerCase())) || null;
  });
}

function specKey(spec) {
  const { match, claim, ...drawn } = spec;
  return crypto.createHash("sha1").update(JSON.stringify(drawn)).digest("hex").slice(0, 12);
}

// Renders (or reuses) the clip for one shot; duration is the shot's length.
function renderClip(spec, duration, cacheDirectory, ffmpeg) {
  const interpreter = python();
  if (!interpreter) throw new Error("explainer clips need Python with Pillow (set EXPLAINER_PYTHON or pip install pillow)");
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const drawn = { ...spec, duration: Math.round(duration * 1000) / 1000 };
  delete drawn.match; delete drawn.claim;
  const file = path.join(cacheDirectory, `explainer-${spec.kind}-${specKey(drawn)}.mp4`);
  if (!fs.existsSync(file)) {
    const specFile = file.replace(/\.mp4$/, ".json");
    fs.writeFileSync(specFile, JSON.stringify(drawn));
    try { cp.execFileSync(interpreter, [SCRIPT, specFile, file, ffmpeg], { stdio: ["ignore", "ignore", "pipe"], timeout: 300000 }); }
    catch (error) { throw new Error(`explainer render failed (${spec.kind}): ${String(error.stderr || error.message).trim().slice(-1500)}`); }
    finally { try { fs.unlinkSync(specFile); } catch (error) {} }
  }
  return file;
}

module.exports = { KINDS, available, forClaims, specKey, renderClip };
