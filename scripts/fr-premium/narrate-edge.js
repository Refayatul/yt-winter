#!/usr/bin/env node
"use strict";
// FR premium narration (offline prototype): reads script.json beat by beat with the free Edge voice,
// keeps Edge's word boundaries, trims each beat to its first and last word, and joins the beats with
// the pauses the script asks for. Writes <out>/narration.wav (48 kHz mono) and <out>/timeline.json
// (lines and words on the final clock, words in the script's own spelling for captions).
//
//   node scripts/fr-premium/narrate-edge.js <script.json> <outDir> [--voice en-US-AndrewNeural]
//
// Free service only; nothing here is paid. A beat that fails three times stops the run: no silent
// placeholder or tone is ever written in place of speech.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const telaffuz = require("../../pronunciation-check");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [scriptFile, outDir] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const VOICE = opt("--voice", "en-US-AndrewNeural");
// --rate-offset N shifts every beat's rate by N percentage points (Edge reads faster than Kokoro).
const RATE_OFFSET = +opt("--rate-offset", 0);
const rateOf = (r) => { const v = parseFloat(r) + RATE_OFFSET; return (v >= 0 ? "+" : "") + v + "%"; };
const SR = 48000;
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function request(text, rate) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const locale = VOICE.slice(0, 5);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${VOICE}"><prosody pitch="+0Hz" rate="${rate}" volume="+0%">${xml(text)}</prosody></voice></speak>`;
  const res = await tts.rawToStream(ssml);
  const chunks = [], meta = [];
  const metaDone = res.metadataStream ? new Promise((ok) => { res.metadataStream.on("end", ok); res.metadataStream.on("close", ok); setTimeout(ok, 5000); }) : Promise.resolve();
  if (res.metadataStream) res.metadataStream.on("data", (d) => { try { meta.push(JSON.parse(d.toString())); } catch (e) { /* partial frame */ } });
  res.audioStream.on("data", (d) => chunks.push(d));
  await new Promise((ok, no) => { res.audioStream.on("end", ok); res.audioStream.on("close", ok); res.audioStream.on("error", no); setTimeout(() => no(new Error("edge timeout")), 30000); });
  await metaDone;
  const words = meta.flatMap((m) => m.Metadata || []).filter((m) => m.Type === "WordBoundary")
    .map((m) => ({ text: m.Data.text.Text, start: m.Data.Offset / 1e7, end: (m.Data.Offset + m.Data.Duration) / 1e7 }));
  return { audio: Buffer.concat(chunks), words };
}

async function withRetry(fn, n = 3) {
  let last;
  for (let a = 1; a <= n; a += 1) { try { return await fn(); } catch (e) { last = e; process.stdout.write(`  (edge retry ${a}: ${String(e.message).slice(0, 60)})\n`); await new Promise((r) => setTimeout(r, 2500 * a)); } }
  throw last;
}

// Script words (display spelling) timed from Edge's spoken words by consuming normalised characters.
function alignWords(lines, edgeWords) {
  const out = []; let w = 0, carry = 0;
  for (const line of lines) {
    for (const word of line.text.split(/\s+/)) {
      const target = norm(word).length; let got = carry; const first = edgeWords[Math.min(w, edgeWords.length - 1)];
      let last = first;
      while (got < target && w < edgeWords.length) { last = edgeWords[w]; got += norm(edgeWords[w].text).length; w += 1; }
      carry = got - target; // an Edge token covering two script words ("O-rings" vs "O rings" both sum to 6)
      if (!first) throw new Error(`no Edge word left for "${word}"`);
      out.push({ line: line.id, text: word, start: first.start, end: last.end });
    }
  }
  if (w < edgeWords.length - 1) throw new Error(`alignment left ${edgeWords.length - w} Edge words unused`);
  return out;
}

(async () => {
  const script = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(outDir, ".beats-"));
  const pieces = []; const lines = []; const words = []; let clock = 0; const log = [];
  for (const beat of script.beats) {
    const spoken = beat.lines.map((l) => telaffuz.ttsMetni(l.text)).join(" ");
    const r = await withRetry(async () => { const x = await request(spoken, rateOf(beat.rate)); if (x.audio.length < 2000 || !x.words.length) throw new Error("no audio/words"); return x; });
    const mp3 = path.join(tmp, beat.id + ".mp3"); fs.writeFileSync(mp3, r.audio);
    // Trim to speech: 60 ms before the first word, 220 ms after the last word's boundary (decay).
    const a = Math.max(0, r.words[0].start - 0.06), z = r.words[r.words.length - 1].end + 0.22;
    const wav = path.join(tmp, beat.id + ".wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-af", `atrim=${a.toFixed(3)}:${z.toFixed(3)},asetpts=N/SR/TB,aresample=${SR}`, "-ac", "1", "-c:a", "pcm_s16le", wav]);
    const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString());
    const bw = alignWords(beat.lines, r.words).map((x) => ({ ...x, start: +(clock + x.start - a).toFixed(3), end: +(clock + x.end - a).toFixed(3) }));
    words.push(...bw);
    for (const l of beat.lines) { const lw = bw.filter((x) => x.line === l.id); lines.push({ id: l.id, beat: beat.id, text: l.text, start: lw[0].start, end: lw[lw.length - 1].end }); }
    pieces.push(wav); clock += dur;
    log.push({ beat: beat.id, rate: rateOf(beat.rate), requestChars: spoken.length, edgeWords: r.words.length, speechSec: +dur.toFixed(3) });
    if (beat.pauseAfterMs > 0) {
      const sil = path.join(tmp, beat.id + "-pause.wav");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `anullsrc=r=${SR}:cl=mono`, "-t", (beat.pauseAfterMs / 1000).toFixed(3), "-c:a", "pcm_s16le", sil]);
      pieces.push(sil); clock += beat.pauseAfterMs / 1000;
    }
    process.stdout.write(`  ${beat.id}: ${dur.toFixed(2)} s, ${r.words.length} words\n`);
  }
  const list = path.join(tmp, "list.txt"); fs.writeFileSync(list, pieces.map((p) => `file '${p}'`).join("\n"));
  const out = path.join(outDir, "narration.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", out]);
  const total = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify({ voice: VOICE, provider: "Microsoft Edge neural TTS (free endpoint, msedge-tts)", duration: +total.toFixed(3), beats: log, lines, words }, null, 1) + "\n");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`narration ${total.toFixed(2)} s, ${words.length} words -> ${out}`);
})().catch((e) => { console.error("NARRATION FAILED:", e.message); process.exit(1); });
