"use strict";
// Caption builder: splits each narration beat into short on-screen phrases and
// times them proportionally to word count inside the beat's observed window.
// Timing is therefore an ESTIMATE within a beat (beat bounds come from the audio).

function phrases(text, maxWords) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out = []; let cur = [];
  for (const w of words) {
    cur.push(w);
    const end = /[.!?;:,]$/.test(w);
    if (cur.length >= maxWords || (end && cur.length >= Math.ceil(maxWords / 2))) { out.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) { if (out.length && cur.length < 3) out[out.length - 1] += " " + cur.join(" "); else out.push(cur.join(" ")); }
  return out;
}
function build(beats, { short = false } = {}) {
  const cues = []; const maxWords = short ? 5 : 8;
  for (const b of beats || []) {
    if (b.start == null || b.end == null || !(b.end > b.start)) continue;
    const ph = phrases(b.text, maxWords); const total = ph.reduce((n, p) => n + p.split(" ").length, 0) || 1;
    let t = b.start;
    for (const p of ph) { const d = (b.end - b.start) * p.split(" ").length / total; cues.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3), text: p }); t += d; }
  }
  return cues;
}
const ts = (s) => { const ms = Math.round(s * 1000); const p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
function toSrt(cues) { return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n"); }
module.exports = { phrases, build, toSrt };
