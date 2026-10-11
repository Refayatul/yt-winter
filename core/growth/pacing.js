"use strict";

// PACING (PHASE 9) and MOBILE CAPTIONS (PHASE 11).
// Dynamic segment durations: fast progression in the first 3 s, frequent
// meaningful change until ~10 s, longer holds later when the story needs it.
// Captions: semantic chunks (break at punctuation/phrase), ≤ 2 short lines,
// raised above the Shorts UI safe zone, numbers highlighted sparingly.

function segments(duration, config, options = {}) {
  const p = config.pacing.shorts;
  const out = [];
  let t = 0;
  let index = 0;
  const pick = (range) => {
    const [low, high] = range;
    // deterministic variation so shots never share one mechanical length
    const wave = (Math.sin((index + 1) * 2.399) + 1) / 2;
    return low + (high - low) * wave;
  };
  while (t < duration - 0.05) {
    const range = t < p.openingWindowSeconds ? p.openingSegmentSeconds : t < p.earlyWindowSeconds ? p.earlySegmentSeconds : p.laterSegmentSeconds;
    let length = Math.min(pick(range), duration - t);
    if (duration - (t + length) < 0.6) length = duration - t;
    out.push(Math.round(length * 1000) / 1000);
    t += length;
    index += 1;
  }
  const min = options.minimumSegments || 0;
  while (out.length < min) {
    const longest = out.indexOf(Math.max(...out));
    const half = out[longest] / 2;
    out.splice(longest, 1, half, half);
  }
  return out;
}

function pacingReport(durations) {
  const first3 = [];
  let t = 0;
  for (const value of durations) { if (t < 3) first3.push(value); t += value; }
  const unique = new Set(durations.map((value) => value.toFixed(2))).size;
  return {
    segments: durations.length,
    cutsInFirst3Seconds: first3.length,
    averageSeconds: Math.round(durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length) * 100) / 100,
    longestSeconds: Math.max(...durations),
    mechanical: unique <= 2 && durations.length > 4,
  };
}

// Semantic caption chunks: never split inside a number/unit, prefer breaks at
// punctuation and before function words, ≤ maxWords, ≤ maxChars per line.
const BREAK_BEFORE = new Set(["and", "but", "then", "so", "which", "because", "when", "until", "while", "that", "before", "after", "without", "with", "into", "from"]);

function chunkWords(text, captionConfig) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = [];
  const flush = () => { if (current.length) chunks.push(current.join(" ")); current = []; };
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1] || "";
    const candidate = [...current, word].join(" ");
    const closesPhrase = /[.,;:!?]$/.test(word) && current.length === captionConfig.maxWordsPerChunk;
    const tooLong = (current.length >= captionConfig.maxWordsPerChunk && !closesPhrase) || candidate.length > captionConfig.maxCharsPerLine * captionConfig.maxLines;
    if (tooLong) flush();
    current.push(word);
    const unitNext = /^(V|nm|km|kg|mph|%|percent|seconds?|minutes?|hours?|miles?|feet|tons?|million|billion|thousand)\b/i.test(next);
    if (/[.,;:!?—]$/.test(word) && !unitNext) flush();
    else if (BREAK_BEFORE.has(next.toLowerCase()) && current.length >= 2) flush();
  }
  flush();
  return chunks;
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  const pad = (value) => String(value).padStart(2, "0");
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

// Timing inside a claim is proportional to characters (closer to speech than
// equal splits). With measured word timings (continuous Edge narration), each chunk starts on its
// first spoken word instead; a claim whose words do not line up keeps the proportional timing.
const alnum = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
function wordTimedChunks(chunks, claim, words, cursor) {
  const starts = [];
  let w = cursor.index;
  for (const chunk of chunks) {
    const target = alnum(chunk).length;
    while (w < words.length && words[w].start < claim.start - 0.25) w += 1;
    if (w >= words.length || words[w].start > claim.end + 0.25) return null;
    starts.push(Math.max(claim.start, words[w].start));
    let got = 0;
    while (w < words.length && got < target) { got += alnum(words[w].text).length; w += 1; }
    if (got < target * 0.8) return null;
  }
  cursor.index = w;
  return starts;
}

function captionRows(claims, captionConfig, options = {}) {
  const rows = [];
  const words = Array.isArray(options.words) ? options.words : null;
  const cursor = { index: 0 };
  for (const claim of claims) {
    const chunks = chunkWords(claim.text, captionConfig);
    const timed = words ? wordTimedChunks(chunks, claim, words, cursor) : null;
    if (timed) {
      chunks.forEach((text, index) => rows.push({ start: timed[index], end: index + 1 < chunks.length ? timed[index + 1] : claim.end, text }));
      continue;
    }
    const weights = chunks.map((chunk) => Math.max(3, chunk.replace(/\s/g, "").length));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = claim.start;
    chunks.forEach((text, index) => {
      const length = (claim.end - claim.start) * weights[index] / total;
      rows.push({ start: t, end: t + length, text });
      t += length;
    });
  }
  return rows;
}

function wrap(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  // The first split that keeps both lines within the limit; when none does ("Dinosaur-Killing" +
  // "Asteroid Hit Today?"), the most balanced split. One unwrapped 36-character line ran past
  // both edges of the frame once captions were set larger.
  let balanced = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (a.length <= maxChars && b.length <= maxChars) return [a, b];
    const longest = Math.max(a.length, b.length);
    if (!balanced || longest < balanced.longest) balanced = { lines: [a, b], longest };
  }
  return balanced ? balanced.lines : [text];
}

function srt(claims, captionConfig, options = {}) {
  return captionRows(claims, captionConfig, options).map((row, index) => `${index + 1}\n${srtTime(row.start)} --> ${srtTime(row.end)}\n${wrap(row.text, captionConfig.maxCharsPerLine).join("\n")}\n`).join("\n");
}

// Each channel keeps its own caption look (channels/<slug>/growth-engine.json
// "captions"): one shared template across channels reads as mass-produced.
function ass(claims, captionConfig, options = {}) {
  const rows = captionRows(claims, captionConfig, options).map((row) => captionConfig.uppercase ? { ...row, text: row.text.toUpperCase() } : row);
  const font = String(captionConfig.font || "Arial").replace(/,/g, " ");
  const outline = Number.isFinite(captionConfig.outline) ? captionConfig.outline : 5;
  const spacing = Number.isFinite(captionConfig.spacing) ? captionConfig.spacing : 0;
  const scaleX = Number.isFinite(captionConfig.scaleX) ? captionConfig.scaleX : 100;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,${font},${captionConfig.fontSize},&H00FFFFFF,&H000000FF,${captionConfig.outlineColor || "&H00101824"},&H90000000,-1,0,0,0,${scaleX},100,${spacing},0,1,${outline},0,2,120,120,${captionConfig.marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const highlight = (text) => captionConfig.highlightNumbers ? text.replace(/(\d[\d.,]*\s?(?:%|V|nm|km|mph|seconds?|minutes?)?)/g, `{\\c${captionConfig.highlightColor}}$1{\\c&HFFFFFF&}`) : text;
  return header + rows.map((row) => `Dialogue: 0,${assTime(row.start)},${assTime(row.end)},Caption,,0,0,0,,${wrap(row.text.replace(/[{}]/g, ""), captionConfig.maxCharsPerLine).map(highlight).join("\\N")}`).join("\n") + "\n";
}

function captionAudit(claims, captionConfig) {
  const rows = captionRows(claims, captionConfig);
  const maxWords = Math.max(0, ...rows.map((row) => row.text.split(/\s+/).length));
  const maxLines = Math.max(0, ...rows.map((row) => wrap(row.text, captionConfig.maxCharsPerLine).length));
  const tooFast = rows.filter((row) => row.end - row.start < 0.25).length;
  return { events: rows.length, maxWords, maxLines, tooFast, safeZoneMarginV: captionConfig.marginV, passes: maxWords <= captionConfig.maxWordsPerChunk + 1 && maxLines <= captionConfig.maxLines };
}

module.exports = { segments, pacingReport, chunkWords, captionRows, srt, ass, captionAudit, wrap, srtTime, assTime };
