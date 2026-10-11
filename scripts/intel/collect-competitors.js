#!/usr/bin/env node
"use strict";
// Per-channel competitor snapshot + outlier insight records. Read-only; never touches our videos.
//
//   node scripts/intel/collect-competitors.js --channel <slug> [--auth key|oauth] [--budget 400] [--searches] [--dry]
//   node scripts/intel/collect-competitors.js --channel <slug> --from-snapshot <file>   (insights only, no API)
//
// Channel isolation: --auth key reads only <PREFIX>_YT_API_KEY; --auth oauth uses only that channel's own
// YouTube OAuth credentials (core/channel-context.js), behind an allowlist of GET channels/playlistItems/
// videos/search reads. Reference channels come from channels/<slug>/intel/reference-channels.json; a handle
// that does not resolve is reported, never guessed. Keyword searches (100 units each) run only with
// --searches. Output: channels/<slug>/intel/reference-snapshot-<date>.json (snapshot-<date>.json with --searches),
// competitor-insights.json and .md.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const Channel = require(path.join(root, "core/channel-context"));
const Collector = require(path.join(root, "core/profitdecoded/yt-collector"));
const Insights = require(path.join(root, "core/intel/competitor-insights"));

const ALLOWED = [
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/token$/ },
  { method: "POST", host: "oauth2.googleapis.com", path: /^\/tokeninfo$/ },
  { method: "GET", host: "www.googleapis.com", path: /^\/youtube\/v3\/(channels|playlistItems|videos|search)\?/ },
];
function readOnly(inner, log = []) {
  return (opt = {}, body) => {
    const method = String(opt.method || "GET").toUpperCase(); const host = String(opt.hostname || ""); const p = String(opt.path || "");
    const ok = ALLOWED.some((a) => a.method === method && a.host === host && a.path.test(p));
    log.push({ method, host, path: p.split("?")[0], allowed: ok });
    return ok ? inner(opt, body) : Promise.reject(Object.assign(new Error(`refused ${method} ${host}${p.split("?")[0]}`), { code: "BLOCKED_NON_READ_REQUEST" }));
  };
}
const flag = (argv, n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

function writeInsights(channel, snapshot, snapshotFile) {
  const result = Insights.insights(snapshot, { ourChannel: channel.slug, snapshotFile: path.basename(snapshotFile) });
  const dir = path.join(channel.paths.base, "intel");
  fs.writeFileSync(path.join(dir, "competitor-insights.json"), JSON.stringify({ generatedAt: new Date().toISOString(), snapshot: path.basename(snapshotFile), ...result }, null, 1) + "\n");
  fs.writeFileSync(path.join(dir, "competitor-insights.md"), Insights.markdown(result, `${channel.name}: competitor outliers (${snapshot.fetchedAt.slice(0, 10)})`));
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const channel = Channel.getChannel(flag(argv, "--channel", null) || (() => { throw new Error("--channel <slug> is required"); })());
  const dir = path.join(channel.paths.base, "intel");
  const from = flag(argv, "--from-snapshot", null);
  if (from) { const r = writeInsights(channel, JSON.parse(fs.readFileSync(from, "utf8")), from); console.log(`${r.records.length} records written to ${path.relative(root, dir)}`); return 0; }
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "reference-channels.json"), "utf8"));
  const budget = Number(flag(argv, "--budget", 400));
  const searches = argv.includes("--searches") ? (cfg.queries || []).length * (cfg.windowsDays || [30]).length : 0;
  console.log(`plan: ${Collector.referenceHandles(cfg).length} handles, ${searches} searches, ~${Collector.referenceHandles(cfg).length * 3 + searches * 100} units (budget ${budget})`);
  if (argv.includes("--dry")) return 0;
  const auth = flag(argv, "--auth", "key");
  let client; const log = [];
  if (auth === "key") {
    const name = `${channel.prefix}_YT_API_KEY`; const key = process.env[name];
    if (!key) { console.error(`${name} is not set: no snapshot written, competitor data stays UNKNOWN. Use --auth oauth with this channel's own credentials, or add the key.`); return 2; }
    client = Collector.client({ apiKey: key, quotaBudget: budget });
  } else {
    const YouTube = require(path.join(root, "lib/yt"));
    const tok = await YouTube.token(readOnly(YouTube.istek, log), channel);
    client = Collector.oauthClient({ accessToken: tok.erisim, request: readOnly(YouTube.istek, log), quotaBudget: budget });
  }
  const { snapshot, report } = await Collector.collect({ ...cfg, queries: searches ? cfg.queries : [], baselineVideos: cfg.baselineVideos || 50 }, { client });
  const stamp = snapshot.fetchedAt.slice(0, 10);
  // A reference-only collection (no keyword discovery) must not become the "latest snapshot" that the
  // ProfitDecoded decision engine reads (profitdecoded.js picks the newest snapshot-*.json), because it
  // lacks the small-channel discovery coverage. Only a run with --searches writes snapshot-<date>.json.
  const file = path.join(dir, `${searches ? "snapshot" : "reference-snapshot"}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot) + "\n");
  fs.writeFileSync(path.join(dir, `collection-report-${stamp}.json`), JSON.stringify({ ...report, auth, refusedRequests: log.filter((r) => !r.allowed).length }, null, 1) + "\n");
  const r = writeInsights(channel, snapshot, file);
  console.log(`${snapshot.channels.length} channels, ${r.records.length} videos, quota ${report.quotaUsed}/${report.quotaBudget}, unresolved handles: ${report.unresolvedHandles.join(", ") || "none"}`);
  return 0;
}

if (require.main === module) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(`competitor collection failed: ${e.code || ""} ${String(e.message).slice(0, 200)}`); process.exitCode = 4; });
module.exports = { main, readOnly, writeInsights, ALLOWED };
