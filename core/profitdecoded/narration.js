"use strict";
// Narration normalisation + QA (spec 13-14). Premium narration is a HARD
// requirement: nothing is certified from text alone, and the fallback voice
// (edge-tts) cannot be certified without a recorded human listen.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const T = require("./text");
const S = require("./signals");
const { CHANNEL_DIR, readJson, thresholds } = require("./config");

// Brands/terms whose default TTS pronunciation is a known risk. If one appears in
// a script and has no lexicon entry, the script is rejected before rendering.
const RISK_TERMS = ["IKEA", "Aldi", "Hermès", "Hermes", "Nespresso", "Spotify", "Hulu", "Shein", "Temu", "Zara", "Lululemon", "Sotheby's", "Louis Vuitton", "Rolex", "Hyundai", "Peloton", "Etsy", "Kroger", "Ryanair", "Costco", "Chipotle", "Aaron's"];

function lexicon() { return (readJson(path.join(CHANNEL_DIR, "pronunciation.json"), { terms: {} }).terms) || {}; }

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function intToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + intToWords(n % 100) : "");
  for (const [v, name] of [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]) if (n >= v) return intToWords(Math.floor(n / v)) + " " + name + (n % v ? " " + intToWords(n % v) : "");
  return String(n);
}
function yearToWords(y) {
  const a = Math.floor(y / 100), b = y % 100;
  if (y >= 2000 && y < 2010) return "two thousand" + (b ? " " + intToWords(b) : "");
  return intToWords(a) + " " + (b === 0 ? "hundred" : b < 10 ? "oh " + intToWords(b) : intToWords(b));
}
function decimalToWords(s) { const [i, d] = s.split("."); return intToWords(Number(i.replace(/,/g, ""))) + " point " + d.split("").map((x) => ONES[+x]).join(" "); }

const letters = (n) => String.fromCharCode(97 + Math.floor(n / 26)) + String.fromCharCode(97 + (n % 26));
const unletters = (s) => (s.charCodeAt(0) - 97) * 26 + (s.charCodeAt(1) - 97);

function spokenText(text, options = {}) {
  const lex = options.lexicon || lexicon();
  let t = String(text);
  // Lexicon first (longest terms first), so "U.S." is not eaten by number rules.
  const terms = Object.keys(lex).sort((a, b) => b.length - a.length);
  const placeholders = [];
  for (const term of terms) {
    const re = new RegExp("(?<![\\w])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w])", "g");
    t = t.replace(re, () => { placeholders.push(lex[term].tts); return `\u0001${letters(placeholders.length - 1)}\u0001`; });
  }
  t = t
    .replace(/\$(\d[\d,]*)\.(\d{2})\b(?!\s*(million|billion|trillion))/g, (m, d, c) => `${intToWords(Number(d.replace(/,/g, "")))} dollars${Number(c) ? " and " + intToWords(Number(c)) + " cents" : ""}`)
    .replace(/\$(\d[\d,]*(?:\.\d+)?)\s*(million|billion|trillion)\b/gi, (m, n, u) => `${n.includes(".") ? decimalToWords(n) : intToWords(Number(n.replace(/,/g, "")))} ${u.toLowerCase()} dollars`)
    .replace(/\$(\d[\d,]*)\b/g, (m, d) => `${intToWords(Number(d.replace(/,/g, "")))} dollar${Number(d.replace(/,/g, "")) === 1 ? "" : "s"}`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?%/g, (m, n) => `${n.includes(".") ? decimalToWords(n) : intToWords(Number(n.replace(/,/g, "")))} percent`)
    .replace(/\b(1[5-9]\d\d|20\d\d)\b(?!\s*(?:dollars|percent|people|members|stores))/g, (m) => yearToWords(Number(m)))
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (m) => intToWords(Number(m.replace(/,/g, ""))))
    .replace(/\b\d+\.\d+\b/g, (m) => decimalToWords(m))
    .replace(/\b\d+\b/g, (m) => intToWords(Number(m)))
    .replace(/&/g, " and ").replace(/\s+—\s+/g, ", ").replace(/\s{2,}/g, " ");
  t = t.replace(/\u0001([a-z]+)\u0001/g, (m, i) => placeholders[unletters(i)]);
  return t.trim();
}

// Pre-render text QA: what would go wrong if this text were sent to a voice as-is.
function textChecks(script, options = {}) {
  const lex = options.lexicon || lexicon();
  const problems = []; const warnings = [];
  const spoken = spokenText(script, { lexicon: lex });
  if (/[$%]|\d/.test(spoken)) problems.push("normalisation left digits/symbols in spoken text: " + (spoken.match(/[$%]|\d[\w.,]*/g) || []).slice(0, 5).join(" "));
  const missing = RISK_TERMS.filter((term) => new RegExp("(?<![\\w])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w])").test(script) && !lex[term]);
  if (missing.length) problems.push("no pronunciation override for: " + missing.join(", "));
  const acronyms = [...new Set((script.match(/\b[A-Z]{2,6}\b/g) || []).filter((a) => !lex[a] && !/^(I|A|OK|TV|AI|PC|DVD|CD)$/.test(a)))];
  if (acronyms.length) problems.push("unhandled acronym(s): " + acronyms.join(", ") + " (add to lexicon)");
  const long = T.sentences(spoken).filter((s) => T.words(s).length > 38);
  if (long.length) warnings.push(`${long.length} sentence(s) over 38 words need splitting for natural breath`);
  return { spoken, problems, warnings };
}

// ---- Audio measurement (real ffmpeg; returns UNKNOWN when ffmpeg or file are missing) ----
function measureAudio(file) {
  if (!file || !fs.existsSync(file)) return { status: "UNKNOWN", reason: "no audio file" };
  if (/\.wav$/i.test(file)) { try { return require("./wav").analyze(fs.readFileSync(file)); } catch (e) { /* fall through to ffmpeg */ } }
  try {
    const out = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true,silencedetect=n=-45dB:d=0.35", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 });
    return parseAudio(out);
  } catch (e) {
    const err = String((e && (e.stderr || e.stdout)) || "");
    if (/ebur128|Summary/.test(err)) return parseAudio(err);
    return { status: "UNKNOWN", reason: "ffmpeg unavailable or failed" };
  }
}
function parseAudio(log) {
  const lufs = /I:\s+(-?\d+(?:\.\d+)?) LUFS/.exec(log.split("Summary:")[1] || "");
  const peak = /Peak:\s+(-?\d+(?:\.\d+)?) dBFS/.exec(log.split("Summary:")[1] || "");
  const silences = [...log.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ end: +m[1], duration: +m[2] }));
  return { status: "OBSERVED", integratedLufs: lufs ? +lufs[1] : null, truePeakDbfs: peak ? +peak[1] : null, pauses: silences.map((s) => s.duration), silenceCount: silences.length };
}

// ---- QA over timed segments ----
// segments: [{text, start, end}]  (seconds, from the actual rendered audio or aligned)
function qa(segments, options = {}) {
  const th = thresholds();
  const required = options.required != null ? options.required : th.narration;
  const provider = options.provider || "unknown";
  const rejections = []; const warnings = []; const parts = {};
  const textInfo = textChecks(segments.map((s) => s.text).join(" "), options);
  rejections.push(...textInfo.problems); warnings.push(...textInfo.warnings);
  parts.normalisation = textInfo.problems.length ? 40 : 100;

  const timed = segments.filter((s) => s.end > s.start);
  if (timed.length >= 6) {
    const wps = timed.map((s) => T.words(textChecksSpoken(s.text)).length / (s.end - s.start));
    const wpm = T.mean(wps) * 60;
    const cadenceCv = T.cv(wps);
    parts.cadenceVariation = S.clamp(Math.round(cadenceCv / 0.14 * 100));
    if (cadenceCv < 0.06) rejections.push(`robotic cadence: sentence pace varies only ${(cadenceCv * 100).toFixed(1)}% (needs >=6%)`);
    if (wpm < 130 || wpm > 200) warnings.push(`average pace ${Math.round(wpm)} wpm is outside 130-200 (spoken words per speaking minute)`);
    const gaps = []; for (let i = 1; i < timed.length; i += 1) gaps.push(Math.max(0, timed[i].start - timed[i - 1].end));
    const gapCv = T.cv(gaps);
    parts.pauseVariation = S.clamp(Math.round(gapCv / 0.35 * 100));
    if (gaps.length >= 6 && gapCv < 0.1) rejections.push(`unnatural pauses: gaps between sentences are near-identical (CV ${gapCv.toFixed(2)})`);
    const longGap = gaps.filter((g) => g > 1.8).length;
    if (longGap > Math.max(1, timed.length * 0.1)) rejections.push(`${longGap} unusually long silent gaps (>1.8s)`);
    const tinyGap = gaps.filter((g) => g < 0.08).length;
    if (tinyGap > timed.length * 0.3) warnings.push(`${tinyGap} sentences run together with <80 ms between them`);
  } else { parts.cadenceVariation = S.UNKNOWN_SCORE; parts.pauseVariation = S.UNKNOWN_SCORE; warnings.push("fewer than 6 timed segments: cadence/pause naturalness is UNKNOWN"); }

  const audio = options.audio || (options.audioFile ? measureAudio(options.audioFile) : { status: "UNKNOWN" });
  if (audio.status === "OBSERVED") {
    let a = 100;
    if (audio.clippedSamples > 0) { rejections.push(`clipping: ${audio.clippedSamples} samples at full scale`); a -= 50; }
    if (audio.truePeakDbfs != null && audio.truePeakDbfs > -0.5) { rejections.push(`clipping risk: peak ${audio.truePeakDbfs} dBFS > -0.5`); a -= 50; }
    if (audio.integratedLufs != null && (audio.integratedLufs < -19 || audio.integratedLufs > -12)) { warnings.push(`loudness ${audio.integratedLufs} LUFS outside -19..-12 (target about -16 to -14)`); a -= 15; }
    parts.audioTechnical = Math.max(0, a);
  } else parts.audioTechnical = S.UNKNOWN_SCORE;

  const measured = ["cadenceVariation", "pauseVariation", "audioTechnical"].every((k) => parts[k] !== S.UNKNOWN_SCORE);
  let naturalness = S.round(0.2 * parts.normalisation + 0.3 * parts.cadenceVariation + 0.25 * parts.pauseVariation + 0.25 * parts.audioTechnical, 0);
  // Premium certification: acoustic metrics cannot prove human-like prosody. Cap until a human listen is recorded.
  const premium = /elevenlabs|azure.*(hd|dragon)|openai.*(tts|gpt-4o)|google.*(chirp|neural2|studio|tts)|studio|recorded|human/i.test(provider);
  const certified = !!options.humanListenApproved || premium;
  const measuredNaturalness = naturalness;
  // Acoustic metrics alone cannot prove human-like prosody, so an uncertified voice is capped and can
  // never reach PUBLISH (it becomes REVIEW). A measured score below the bar is still a hard rejection.
  if (!certified) { naturalness = Math.min(naturalness, 80); warnings.push(`voice provider "${provider}" is not certified as premium; reported naturalness capped at 80 (measured ${measuredNaturalness}) until a human listen is approved or a premium voice is used`); }
  if (measuredNaturalness < required) rejections.push(`narration naturalness ${measuredNaturalness} < required ${required}`);
  return { naturalness, measuredNaturalness, parts, certified, provider, audio, measured, rejections, warnings, pass: rejections.length === 0, spokenPreview: textInfo.spoken.slice(0, 200) };
}
function textChecksSpoken(text) { return spokenText(text); }

module.exports = { spokenText, textChecks, measureAudio, qa, intToWords, yearToWords, lexicon, RISK_TERMS };
