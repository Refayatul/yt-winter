// ODAK — where the subject of a landscape picture or clip sits, for 9:16 framing (Failure Reconstructed).
//
// A small grey frame (128 px wide) is read from ffmpeg; detail energy is the sum of horizontal and
// vertical brightness differences, with a mild centre bias. The 9:16 window (the share of the width a
// full-height crop keeps) that holds the most energy is the subject window.
//   coverage = share of all energy inside that window. A uniform picture gives about the window's
//   own width share; a picture whose detail sits in one place gives much more.
// Deterministic and dependency-free. It is a heuristic: lib/dikey-kadraj.js uses it only to decide
// between a full-screen crop on the subject and a documentary layout that keeps the whole frame.
"use strict";

const cp = require("child_process");
const FF = require("../ff-yol.js");

const COLS = 128;

function grey(file, { w, h, at = null }) {
  const rows = Math.max(8, Math.round(COLS * h / w / 2) * 2);
  const args = ["-v", "error", ...(at != null ? ["-ss", String(at)] : []), "-i", file, "-frames:v", "1",
    "-vf", `scale=${COLS}:${rows},format=gray`, "-f", "rawvideo", "-"];
  const buffer = cp.execFileSync(FF.ffmpeg, args, { maxBuffer: 1 << 22 });
  return { buffer, cols: COLS, rows };
}

// Energy map -> per-column and per-row sums.
function profiles({ buffer, cols, rows }) {
  const col = new Float64Array(cols);
  const row = new Float64Array(rows);
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      const i = y * cols + x;
      const e = Math.abs(buffer[i + 1] - buffer[i - 1]) + Math.abs(buffer[i + cols] - buffer[i - cols]);
      // Mild centre bias: a subject at the very edge is more often a border or a caption strip.
      const bias = 1 - 0.25 * Math.abs(x / (cols - 1) - 0.5) * 2;
      col[x] += e * bias;
      row[y] += e;
    }
  }
  return { col: [...col], row: [...row] };
}

function bestWindow(values, width, exclude = null) {
  let best = -1; let bestStart = 0;
  for (let start = 0; start + width <= values.length; start += 1) {
    if (exclude && start < exclude.end && start + width > exclude.start) continue;
    let sum = 0;
    for (let k = start; k < start + width; k += 1) sum += values[k];
    if (sum > best) { best = sum; bestStart = start; }
  }
  return { start: bestStart, end: bestStart + width, sum: Math.max(0, best) };
}

// Pure analysis of profiles (exported for tests): window share of the width -> centre and coverage.
function analyse({ col, row }, windowShare) {
  const cols = col.length;
  const width = Math.max(2, Math.min(cols, Math.round(cols * windowShare)));
  const total = col.reduce((a, b) => a + b, 0) || 1;
  // Centre the best window on the energy inside it (ties between windows otherwise favour the left).
  const centred = (win) => {
    let mass = 0; let moment = 0;
    for (let k = win.start; k < win.end; k += 1) { mass += col[k]; moment += col[k] * (k + 0.5); }
    const centre = mass > 0 ? moment / mass : (win.start + win.end) / 2;
    const start = Math.max(0, Math.min(cols - width, Math.round(centre - width / 2)));
    let sum = 0;
    for (let k = start; k < start + width; k += 1) sum += col[k];
    return { start, end: start + width, sum };
  };
  const first = centred(bestWindow(col, width));
  // A second subject window that overlaps the first by at most ~30%: a returning picture shows it.
  const keep = Math.round(width * 0.7);
  const second = bestWindow(col, width, { start: first.start + width - keep, end: first.end - (width - keep) });
  const rowTotal = row.reduce((a, b) => a + b, 0) || 1;
  let acc = 0; let cy = 0.5;
  for (let y = 0; y < row.length; y += 1) { acc += row[y]; if (acc >= rowTotal / 2) { cy = y / Math.max(1, row.length - 1); break; } }
  return {
    cx: (first.start + width / 2) / cols,
    cx2: (second.start + width / 2) / cols,
    cy: Math.max(0.25, Math.min(0.75, cy)),
    coverage: +(first.sum / total).toFixed(3),
    uniform: +(width / cols).toFixed(3),
  };
}

// focus(file, {w, h, video, duration}) -> { cx, cx2, cy, coverage, uniform } for a full-height 9:16 crop.
function focus(file, { w, h, video = false, duration = 0 } = {}) {
  if (!(w > 0 && h > 0)) return null;
  const windowShare = (1080 / 1920) / (w / h);
  if (windowShare >= 1) return { cx: 0.5, cx2: 0.5, cy: 0.5, coverage: 1, uniform: 1 };
  try {
    return analyse(profiles(grey(file, { w, h, at: video ? Math.max(0, duration * 0.4) : null })), windowShare);
  } catch (error) {
    return null;
  }
}

module.exports = { focus, analyse, bestWindow };
