#!/usr/bin/env node
"use strict";
// Lists Cartesia's public voices for a locale (GET /voices: metadata only, no audio, no credits used).
//   PD_CARTESIA_API_KEY=... node scripts/profitdecoded/cartesia-voices.js [--language en-US] [--out voices.json]
// The key is read from the environment and never printed.
const fs = require("fs");
const path = require("path");
const { CARTESIA } = require(path.join(__dirname, "..", "..", "core/profitdecoded/tts-provider"));
const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

(async () => {
  const key = process.env.PD_CARTESIA_API_KEY;
  if (!key) { console.error("PD_CARTESIA_API_KEY is not set"); process.exit(2); }
  const voices = []; let after = null;
  for (let page = 0; page < 20; page += 1) {
    const q = new URLSearchParams({ language: opt("--language", "en-US"), limit: "100", ...(after ? { starting_after: after } : {}) });
    const res = await fetch(`https://api.cartesia.ai/voices?${q}`, { headers: { authorization: "Bearer " + key, "cartesia-version": CARTESIA.version } });
    if (!res.ok) { console.error(`voices: HTTP ${res.status} ${String(await res.text()).slice(0, 200)}`); process.exit(1); }
    const body = await res.json(); voices.push(...body.data);
    if (!body.has_more || !body.next_page) break; after = body.next_page;
  }
  const rows = voices.filter((v) => v.status !== "archived").map((v) => ({ id: v.id, name: v.name, gender: v.gender, accents: (v.accents || []).map((a) => a.locale + (a.is_native ? "" : " (non-native)")).join(", "), tagline: v.tagline, description: v.description, isPro: v.is_pro, access: v.access }));
  for (const r of rows) console.log(`${r.id}  ${String(r.gender || "-").padEnd(14)} ${r.name.padEnd(28)} ${r.tagline || ""} | ${String(r.description || "").replace(/\s+/g, " ").slice(0, 140)}`);
  console.log(`${rows.length} voices`);
  if (opt("--out", null)) fs.writeFileSync(opt("--out"), JSON.stringify({ listedAt: new Date().toISOString(), apiVersion: CARTESIA.version, voices: rows }, null, 1) + "\n");
})().catch((e) => { console.error(e.message); process.exit(1); });
