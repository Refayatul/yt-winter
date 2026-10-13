#!/usr/bin/env node
"use strict";

// EDGE TTS DIAGNOSTICS: why does the free Edge read-aloud service refuse this machine?
// Read-only and free: no key, no account, no upload. It records, for a few spaced attempts,
//   - the WebSocket handshake result (HTTP status and the service's response headers),
//   - the voices-list HTTP status (same token scheme, plain HTTPS),
//   - the clock offset against the service's Date header (the Sec-MS-GEC token is time based),
//   - a full one-sentence synthesis through the production client (msedge-tts).
// Nothing is retried beyond the fixed attempts and nothing tries to get around a refusal.
//
//   node scripts/tts-diagnostics.js [--attempts 3] [--gap-ms 8000] [--out edge-diagnostics.json]

const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const ATTEMPTS = Number(option("attempts", 3));
const GAP_MS = Number(option("gap-ms", 8000));
const OUT = option("out", "edge-diagnostics.json");
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
};
const KEEP = /^(date|server|x-ms-|x-msedge|x-cache|retry-after|content-type|x-azure|x-fd|ms-|www-authenticate)/i;
const pick = (headers) => Object.fromEntries(Object.entries(headers || {}).filter(([key]) => KEEP.test(key)));

function handshake() {
  return new Promise(async (resolve) => {
    const started = Date.now();
    const url = await MsEdgeTTS.getSynthUrl();
    const ws = new WebSocket(url, { headers: HEADERS });
    const done = (result) => { try { ws.terminate(); } catch (error) { /* closed */ } resolve({ ms: Date.now() - started, ...result }); };
    ws.on("upgrade", (res) => done({ ok: true, status: res.statusCode, headers: pick(res.headers) }));
    ws.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => done({ ok: false, status: res.statusCode, headers: pick(res.headers), body: body.slice(0, 300) }));
    });
    ws.on("error", (error) => done({ ok: false, error: error.message }));
    setTimeout(() => done({ ok: false, error: "handshake timeout (15 s)" }), 15000);
  });
}

function voicesList() {
  return new Promise(async (resolve) => {
    const gec = await MsEdgeTTS.generateSecMsGec(MsEdgeTTS.TRUSTED_CLIENT_TOKEN);
    const url = `${MsEdgeTTS.VOICES_URL}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.96`;
    const started = Date.now();
    https.get(url, { headers: HEADERS }, (res) => {
      let size = 0;
      res.on("data", (chunk) => { size += chunk.length; });
      res.on("end", () => resolve({ status: res.statusCode, bytes: size, ms: Date.now() - started, headers: pick(res.headers) }));
    }).on("error", (error) => resolve({ error: error.message }));
  });
}

function synthesis(voice) {
  return new Promise(async (resolve) => {
    const started = Date.now();
    const timer = setTimeout(() => resolve({ ok: false, error: "timeout (20 s)" }), 20000);
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream("This is a short diagnostic sentence.", { rate: "+0%" });
      const chunks = [];
      audioStream.on("data", (chunk) => chunks.push(chunk));
      audioStream.on("end", () => { clearTimeout(timer); const bytes = Buffer.concat(chunks).length; resolve({ ok: bytes > 2000, bytes, ms: Date.now() - started }); });
      audioStream.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, error: error.message }); });
    } catch (error) { clearTimeout(timer); resolve({ ok: false, error: error.message }); }
  });
}

(async () => {
  const report = {
    at: new Date().toISOString(),
    client: `msedge-tts ${require("msedge-tts/package.json").version}`,
    runner: { region: process.env.RUNNER_REGION || null, os: process.env.ImageOS || process.platform, github: !!process.env.GITHUB_ACTIONS },
    attempts: [],
  };
  for (let i = 1; i <= ATTEMPTS; i += 1) {
    const attempt = { attempt: i, at: new Date().toISOString(), handshake: await handshake(), voices: await voicesList() };
    attempt.synthesis = await synthesis("en-US-AndrewMultilingualNeural");
    const serverDate = (attempt.handshake.headers || {}).date || (attempt.voices.headers || {}).date;
    attempt.clockOffsetSeconds = serverDate ? Math.round((Date.now() - Date.parse(serverDate)) / 1000) : null;
    report.attempts.push(attempt);
    console.log(`attempt ${i}: handshake ${attempt.handshake.status || attempt.handshake.error}, voices ${attempt.voices.status || attempt.voices.error}, synthesis ${attempt.synthesis.ok ? "ok" : attempt.synthesis.error}, clock offset ${attempt.clockOffsetSeconds}s`);
    if (i < ATTEMPTS) await new Promise((ok) => setTimeout(ok, GAP_MS));
  }
  const statuses = report.attempts.map((a) => a.handshake.status);
  report.summary = {
    handshakeStatuses: statuses,
    voicesStatuses: report.attempts.map((a) => a.voices.status),
    synthesisOk: report.attempts.filter((a) => a.synthesis.ok).length,
    maxAbsClockOffsetSeconds: Math.max(...report.attempts.map((a) => Math.abs(a.clockOffsetSeconds || 0))),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
})();
