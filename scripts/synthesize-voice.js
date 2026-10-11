#!/usr/bin/env node
"use strict";

const fs = require("fs");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

// One Edge request. The free service intermittently drops or refuses a request (seen on
// 2026-10-11: 4 of 8 line requests failed in one render); without a retry the caller substitutes a
// non-speech tone and the readiness gate then blocks the whole Short. Worst case 20+5+20+15+20 s,
// inside the 90 s the renderer allows per line.
function synthesizeOnce(text, voice, rate, timeoutMs) {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Edge TTS timed out")), timeoutMs);
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: false, sentenceBoundaryEnabled: false });
      const { audioStream } = tts.toStream(text, { rate });
      const chunks = [];
      audioStream.on("data", (chunk) => chunks.push(chunk));
      audioStream.on("end", () => { clearTimeout(timer); chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error("Edge TTS returned no audio")); });
      audioStream.on("error", (error) => { clearTimeout(timer); reject(error); });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

async function main() {
  const [input, output, voice = "en-US-AndrewMultilingualNeural", rate = "+10%"] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: synthesize-voice.js <text-file> <output.mp3> [voice] [rate]");
  const text = fs.readFileSync(input, "utf8").trim();
  const attempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.writeFileSync(output, await synthesizeOnce(text, voice, rate, 20000));
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 15000));
    }
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
