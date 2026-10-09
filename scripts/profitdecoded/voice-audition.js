#!/usr/bin/env node
"use strict";
// Voice audition: renders the SAME three documentary sentences with every
// candidate voice so a human can pick by ear. Output: <dir>/<voice>.wav (+ .m4a on macOS).
//   node scripts/profitdecoded/voice-audition.js [outDir] [--provider edge-tts|kokoro|google|openai|elevenlabs|cartesia]
//     [--text-file excerpt.txt] [--voices a,b,c] [--rate -3%]
// --text-file: one continuous script excerpt (the same text for every voice, for a fair comparison).
// --voices for cartesia: label=voice-uuid pairs (the label names the file). Characters sent are reported as credits.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..", "..");
const TTS = require(path.join(root, "core/profitdecoded/tts-provider"));
const N = require(path.join(root, "core/profitdecoded/narration"));
const W = require(path.join(root, "core/profitdecoded/wav"));
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(root, "channels/profitdecoded/reports/voice-audition"));
const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : "edge-tts";
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const T = require(path.join(root, "core/profitdecoded/text"));
const textFile = opt("--text-file"); const rate = opt("--rate") || "+0%";
const TEXT = textFile ? T.sentences(fs.readFileSync(path.resolve(textFile), "utf8").trim()).map((t) => N.spokenText(t)).join(" ") : [
  "Costco did not make most of its profit in the aisles. Of $10.4 billion in operating income, about half came from one line most shoppers never see.",
  "That is easier when the card carries the profit. Fees were about 51% of operating income.",
  "So Costco isn't really selling you groceries at a discount. It sells the discount itself, once a year.",
].map((t) => N.spokenText(t)).join(" ... ");
const VOICES = { "edge-tts": ["en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural", "en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural", "en-US-GuyNeural", "en-GB-RyanNeural"], openai: ["onyx", "ash", "sage", "coral"], elevenlabs: [process.env.PD_ELEVENLABS_VOICE_ID].filter(Boolean), kokoro: ["am_michael", "am_adam", "bm_george", "bm_lewis", "af_heart", "bf_emma"], google: ["en-US-Chirp3-HD-Charon", "en-US-Chirp3-HD-Orus", "en-US-Chirp3-HD-Fenrir", "en-US-Chirp3-HD-Aoede", "en-US-Chirp3-HD-Kore", "en-US-Neural2-D"] };
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const report = [];
  const voices = opt("--voices") ? opt("--voices").split(",").filter(Boolean) : VOICES[providerArg] || [];
  for (const entry of voices) {
    const [label, voice] = entry.includes("=") ? entry.split("=") : [entry, entry];
    try {
      const samples = await TTS.synthesize(TEXT, { provider: providerArg, voice, rate, ...(providerArg === "openai" ? { voice } : {}) });
      const file = path.join(outDir, `${providerArg}-${label}.wav`); fs.writeFileSync(file, W.writeWav(samples, TTS.RATE));
      if (process.platform === "darwin") execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "128000", "-c", "1", file, file.replace(/\.wav$/, ".m4a")]);
      else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-c:a", "aac", "-b:a", "128k", file.replace(/\.wav$/, ".m4a")]);
      const m = W.analyze(fs.readFileSync(file)); report.push({ label, voice, seconds: +m.durationSec.toFixed(1), lufs: m.integratedLufs });
      console.log(`${voice}: ${m.durationSec.toFixed(1)} s`);
    } catch (e) { console.log(`${voice}: FAILED (${e.message})`); }
  }
  if (!report.length && voices.length) { console.error(`NO voice could be rendered for provider ${providerArg}`); process.exitCode = 1; }
  const credits = providerArg === "cartesia" ? { model: process.env.PD_CARTESIA_MODEL || TTS.CARTESIA.model, apiVersion: TTS.CARTESIA.version, requests: TTS.usage.cartesia.requests, charactersBilled: TTS.usage.cartesia.characters, creditsConsumed: TTS.usage.cartesia.characters, note: "Cartesia bills 1 credit per character sent, including requests that failed after sending" } : undefined;
  if (credits) console.log(`cartesia: ${credits.requests} request(s), ${credits.creditsConsumed} credits (characters sent)`);
  fs.writeFileSync(path.join(outDir, `${providerArg}-index.json`), JSON.stringify({ provider: providerArg, rate, textFile, text: TEXT, characters: TEXT.length, voices: report, ...(credits ? { credits } : {}) }, null, 1));
})();
