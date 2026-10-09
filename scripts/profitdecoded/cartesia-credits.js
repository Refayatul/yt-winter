#!/usr/bin/env node
"use strict";
// Credit check before a paid Cartesia narration (GET /usage/credits: reads usage, uses no credits).
//   PD_CARTESIA_API_KEY=... node scripts/profitdecoded/cartesia-credits.js --need 7300 [--allowance 100000]
// Exit 1 when this month's recorded usage + --need would exceed the plan allowance (Pro: 100K credits a month).
// Exit 1 too when usage cannot be read, unless --allow-unknown is given. The key is never printed.
const path = require("path");
const { CARTESIA } = require(path.join(__dirname, "..", "..", "core/profitdecoded/tts-provider"));
const args = process.argv.slice(2); const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
(async () => {
  const need = Number(opt("--need", 0)); const allowance = Number(opt("--allowance", 100000));
  const now = new Date(); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const q = new URLSearchParams({ interval: "day", start, end: now.toISOString() });
  let used = null;
  try {
    const res = await fetch(`https://api.cartesia.ai/usage/credits?${q}`, { headers: { authorization: "Bearer " + process.env.PD_CARTESIA_API_KEY, "cartesia-version": CARTESIA.version } });
    const body = await res.json().catch(() => null);
    if (!res.ok) console.log(`usage endpoint: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    else { const rows = (body && (body.data || body.buckets || body.usage)) || []; const vals = rows.map((r) => Number(r.credits ?? r.credits_used ?? r.value)); used = vals.some((v) => Number.isNaN(v)) ? null : vals.reduce((s, v) => s + v, 0); console.log(`usage endpoint: ${rows.length} bucket(s) this month; raw sample ${JSON.stringify(rows.slice(-2)).slice(0, 300)}`); }
  } catch (e) { console.log("usage endpoint unreachable: " + e.message); }
  if (used == null || Number.isNaN(used)) { console.log("credits used this month: UNKNOWN"); process.exit(args.includes("--allow-unknown") ? 0 : 1); }
  const left = allowance - used; console.log(`credits used this month: ${used}; plan allowance ${allowance}; left ${left}; this run needs at most ${need}`);
  if (left < need) { console.log("INSUFFICIENT CREDITS: stopping before any narration request"); process.exit(1); }
  console.log("CREDITS OK");
})();
