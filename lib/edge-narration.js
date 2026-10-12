// EDGE NARRATION (continuous) — the script read as a passage instead of one Edge request per line.
//
// Line-by-line synthesis gives every line its own start-of-sentence and end-of-sentence intonation
// and a uniform gap: it reads like a list. Here the script is read in three beats: the hook, the body
// (all middle lines in ONE request, so intonation runs across sentences) and the payoff, joined by
// deliberate silences. Line timing is MEASURED from Edge's own word boundaries, so captions and cuts
// stay synchronised. (The free Edge service returns no audio for SSML <break> tags, so pauses between
// beats are inserted as silence rather than in SSML.)
//
//   narrate({ lines, voice, rate, pausesMs, out, probe }) -> { file, durationSec, lineTimes, words, mode }
//
// Modes, in order: "beats" (3 requests, pauses after the hook and before the payoff); "plain" (one
// request, the voice's own sentence pauses). Any other failure throws; callers fall back to their
// line-by-line path and record that they did. Free Edge voices only; nothing here is paid.
"use strict";

const fs = require("fs");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const xml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "");

function ssml(voice, rate, lines, pausesMs, withBreaks) {
  const locale = (voice.match(/^[a-z]{2}-[A-Z]{2}/) || ["en-US"])[0];
  const body = lines.map((line, i) => xml(line) + (withBreaks && i < lines.length - 1 && pausesMs[i] > 0 ? ` <break time="${Math.round(pausesMs[i])}ms"/> ` : " ")).join("");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody pitch="+0Hz" rate="${rate}" volume="+0%">${body.trim()}</prosody></voice></speak>`;
}

async function request(voice, requestSsml) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const res = await tts.rawToStream(requestSsml);
  const chunks = []; const meta = [];
  // Word boundaries can arrive after the last audio chunk: wait for both streams (bounded).
  const metaDone = res.metadataStream ? new Promise((ok) => { res.metadataStream.on("end", ok); res.metadataStream.on("close", ok); setTimeout(ok, 4000); }) : Promise.resolve();
  if (res.metadataStream) res.metadataStream.on("data", (d) => { try { meta.push(JSON.parse(d.toString())); } catch (e) { /* partial frame */ } });
  res.audioStream.on("data", (d) => chunks.push(d));
  await new Promise((ok, no) => { res.audioStream.on("end", ok); res.audioStream.on("close", ok); res.audioStream.on("error", no); });
  await metaDone;
  const words = meta.flatMap((m) => m.Metadata || []).filter((m) => m.Type === "WordBoundary")
    .map((m) => ({ text: m.Data.text.Text, start: m.Data.Offset / 1e7, end: (m.Data.Offset + m.Data.Duration) / 1e7 }));
  return { audio: Buffer.concat(chunks), words };
}

// Each line starts at its first word; it ends where the next line starts (its pause belongs to it).
function align(lines, words, durationSec) {
  const starts = [];
  let w = 0;
  for (const line of lines) {
    const target = norm(line).length;
    if (!target) return null;
    if (w >= words.length) return null;
    starts.push(words[w].start);
    let got = 0;
    while (w < words.length && got < target) { got += norm(words[w].text).length; w += 1; }
    if (got < target * 0.8) return null;
  }
  return lines.map((_, i) => ({ start: i === 0 ? 0 : starts[i], end: i + 1 < lines.length ? starts[i + 1] : durationSec }));
}

async function withRetry(fn, attempts) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fn(); } catch (error) { last = error; if (attempt < attempts) await new Promise((ok) => setTimeout(ok, 1500 * attempt)); }
  }
  throw last;
}

// One continuous read of `lines`: audio buffer, words and per-line times relative to its own start.
async function read(voice, rate, lines, attempts) {
  const { audio, words } = await withRetry(() => request(voice, ssml(voice, rate, lines, [], false)), attempts);
  if (audio.length < 2000) throw new Error("no audio");
  return { audio, words };
}

// Silence added between beats, after trimming each beat to its first and last word. What the ear
// hears is longer: the added gap plus the last word's decay and the next word's onset (measured
// 2026-10-11: an added 0.55 s gave a 0.94 s acoustic pause). Edge's own sentence pauses inside the
// body measure about 0.44 s acoustically; these give about 0.5 s after the hook and 0.8 s before
// the payoff: a beat, never a gap long enough to read as an exit point.
const BEAT_GAPS = { afterHook: 0.30, beforePayoff: 0.40 };

async function narrate({ lines, voice, rate = "+0%", pausesMs = [], out, attempts = 4, probe, gaps = BEAT_GAPS }) {
  if (!lines.length) throw new Error("no lines");
  const cp = require("child_process");
  const FF = require("../ff-yol.js");
  const n = lines.length;
  // Beats: hook | body | payoff, when there is a body to read as one passage.
  const groups = n >= 4 ? [[0], Array.from({ length: n - 2 }, (_, i) => i + 1), [n - 1]] : null;
  if (groups) {
    try {
      const parts = []; let offset = 0; const lineTimes = new Array(n); const allWords = [];
      for (const [g, idx] of groups.entries()) {
        const { audio, words } = await read(voice, rate, idx.map((i) => lines[i]), attempts);
        const raw = `${out}.beat${g}.raw.mp3`;
        fs.writeFileSync(raw, audio);
        if (!words.length) throw new Error(`beat ${g}: no word boundaries`);
        // Trim the service's own lead-in and tail: from just before the first word to just after the last.
        const from = Math.max(0, words[0].start - 0.04);
        const to = Math.min(probe(raw), words[words.length - 1].end + 0.12);
        const file = `${out}.beat${g}.wav`;
        cp.execFileSync(FF.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af", `atrim=start=${from.toFixed(3)}:end=${to.toFixed(3)},asetpts=PTS-STARTPTS`, file], { stdio: "ignore" });
        const shifted = words.map((word) => ({ ...word, start: word.start - from, end: word.end - from }));
        const duration = to - from;
        const times = align(idx.map((i) => lines[i]), shifted, duration);
        if (!times) throw new Error(`beat ${g}: word boundaries did not align with the lines`);
        const pause = g === 0 ? gaps.afterHook : g === groups.length - 2 ? gaps.beforePayoff : 0;
        idx.forEach((lineIndex, k) => { lineTimes[lineIndex] = { start: offset + times[k].start, end: offset + times[k].end + (k === idx.length - 1 ? pause : 0) }; });
        shifted.forEach((word) => allWords.push({ ...word, start: word.start + offset, end: word.end + offset }));
        parts.push({ file, pause, raw });
        offset += duration + pause;
      }
      const inputs = parts.flatMap((part) => ["-i", part.file]);
      const chain = parts.map((part, i) => `[${i}:a]aresample=24000,aformat=channel_layouts=mono${part.pause ? `,apad=pad_dur=${part.pause.toFixed(3)}` : ""}[p${i}]`).join(";");
      cp.execFileSync(FF.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", `${chain};${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=0:a=1[a]`,
        "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", out], { stdio: "ignore" });
      for (const part of parts) for (const temp of [part.file, part.raw]) try { fs.unlinkSync(temp); } catch (error) { /* temp */ }
      const durationSec = probe(out);
      lineTimes[0].start = 0;
      lineTimes[n - 1].end = durationSec;
      return { file: out, durationSec, lineTimes, words: allWords, mode: "beats" };
    } catch (error) {
      console.error(`continuous narration: beats mode failed (${String(error.message).slice(0, 100)}); one plain read instead`);
    }
  }
  const { audio, words } = await read(voice, rate, lines, attempts);
  fs.writeFileSync(out, audio);
  const durationSec = probe(out);
  const lineTimes = align(lines, words, durationSec);
  if (!lineTimes) throw new Error("plain: word boundaries did not align with the lines");
  return { file: out, durationSec, lineTimes, words, mode: "plain" };
}

module.exports = { narrate, align, ssml, xml, BEAT_GAPS };
