"use strict";

// Regressions for the non-fatal errors seen in production run 38413360708 (2026-10-13):
//   - "growth afterUpload: Cannot read properties of undefined (reading 'some')" (Failure Reconstructed)
//   - "growth: Cannot read properties of undefined (reading 'map')" (growth.js report)
//   - "seriye eklenemedi: playlistItems HTTP 409 ... SERVICE_UNAVAILABLE"
//   - The Hidden Logic of Things (inactive) analytics failing with INVALID_CLIENT
//   - Edge narration recovering only because an unpinned msedge-tts 2.1.0 was installed

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function withSandbox(fn) {
  const previous = process.env.GROWTH_STATE_ROOT;
  process.env.GROWTH_STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "growth-sandbox-"));
  try { return fn(process.env.GROWTH_STATE_ROOT); } finally {
    if (previous === undefined) delete process.env.GROWTH_STATE_ROOT; else process.env.GROWTH_STATE_ROOT = previous;
  }
}

test("clusters.json written by the old backfill (statistics, no member lists) no longer breaks afterUpload or the report", () => {
  const Funnel = require("../../core/growth/funnel");
  const Channel = require("../../core/channel-context");
  const channel = Channel.getChannel("failure-reconstructed");
  withSandbox((root) => {
    const file = path.join(root, channel.slug, "state", "growth", "clusters.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ channel: channel.slug, updatedAt: "2026-09-30T20:12:22.543Z",
      clusters: { "aviation-failures": { n: 3, medianViews: 900 }, "nuclear-accidents": { n: 1, medianViews: 1351 } } }));
    assert.deepEqual(Funnel.clusterIntegrity(channel), { ok: true, problems: [], count: 2 }, "statistics rows read as empty membership");
    const row = Funnel.updateCluster(channel, "aviation-failures", { type: "short", slug: "united-232-1989", videoId: "BukKRJfO7zI", title: "t", channel: channel.slug });
    assert.deepEqual(row.shorts, [{ slug: "united-232-1989", videoId: "BukKRJfO7zI", title: "t" }]);
    assert.deepEqual([row.longs, row.futureLongs, row.anchorLong], [[], [], null]);
    const again = Funnel.updateCluster(channel, "aviation-failures", { type: "short", slug: "united-232-1989", videoId: "BukKRJfO7zI", channel: channel.slug });
    assert.equal(again.shorts.length, 1, "idempotent");
    assert.equal(Funnel.clusterIntegrity(channel).ok, true);
  });
});

test("the committed Failure Reconstructed clusters.json passes the integrity check (it crashed growth.js report)", () => {
  const Funnel = require("../../core/growth/funnel");
  const Channel = require("../../core/channel-context");
  for (const slug of ["failure-reconstructed", "impossible-brief", "critical-thread"]) {
    assert.doesNotThrow(() => Funnel.clusterIntegrity(Channel.getChannel(slug)), slug);
  }
});

test("growth.js backfill writes cluster statistics to cluster-stats.json, never over the membership file", () => {
  const source = read("growth.js");
  assert.match(source, /Store\.writeState\(channel, "growth", "cluster-stats\.json", clusters\)/);
  assert.doesNotMatch(source, /writeState\(channel, "growth", "clusters\.json"/);
  assert.match(read("core/growth/funnel.js"), /Store\.writeState\(channel, "growth", "clusters\.json", clusters\)/, "only the funnel writes membership");
});

test("a transient playlist error right after upload is retried; other errors are not", async () => {
  const Playlist = require("../../youtube-playlist");
  const transient = new Error('playlistItems HTTP 409: {"error":{"code":409,"message":"The operation was aborted.","errors":[{"reason":"SERVICE_UNAVAILABLE"}]}}');
  assert.equal(Playlist.geciciHata(transient), true);
  assert.equal(Playlist.geciciHata(new Error("playlistItems HTTP 503: backendError")), true);
  assert.equal(Playlist.geciciHata(new Error('playlistItems HTTP 403: {"reason":"quotaExceeded"}')), false, "quota is never retried");
  assert.equal(Playlist.geciciHata(new Error("playlistItems HTTP 409: videoAlreadyInPlaylist")), false, "a real conflict is not retried");
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  let calls = 0;
  assert.equal(await Playlist.geciciTekrar(async () => { calls += 1; if (calls === 1) throw transient; return "ok"; }, { sleep }), "ok");
  assert.deepEqual([calls, sleeps], [2, [10000]]);
  calls = 0; sleeps.length = 0;
  await assert.rejects(() => Playlist.geciciTekrar(async () => { calls += 1; throw transient; }, { sleep }), /409/);
  assert.deepEqual([calls, sleeps], [3, [10000, 30000]], "bounded: one try plus two retries");
  calls = 0;
  await assert.rejects(() => Playlist.geciciTekrar(async () => { calls += 1; throw new Error("playlistItems HTTP 401: invalid"); }, { sleep }), /401/);
  assert.equal(calls, 1);
  const ekle = read("youtube-playlist.js").slice(read("youtube-playlist.js").indexOf("async function ekle"));
  const attempt = ekle.slice(ekle.indexOf("geciciTekrar(async () => {"), ekle.indexOf("return true;"));
  assert.ok(attempt.indexOf("playlistItems?part=contentDetails") < attempt.indexOf("playlistItems?part=snippet"),
    "every attempt re-reads the playlist before inserting, so a retry never adds the video twice");
});

test("inactive The Hidden Logic of Things is skipped by the portfolio analytics step unless BTO_PUBLISH=1", () => {
  const wf = read(".github/workflows/portfolio-production.yml");
  const step = wf.slice(wf.indexOf("- name: Channel-scoped analytics, plans, health and notifications"), wf.indexOf("- name: Production outcome (stages)"));
  assert.match(step, /BTO_ACTIVE: \$\{\{ vars\.BTO_PUBLISH \}\}/);
  assert.match(step, /CHANNELS="failure-reconstructed impossible-brief critical-thread"\n\s+if \[ "\$BTO_ACTIVE" = "1" \]; then CHANNELS="\$CHANNELS behind-the-ordinary"; fi/);
  assert.doesNotMatch(step, /for CHANNEL in [^\n]*behind-the-ordinary/);
});

test("the Edge read-aloud client is pinned exactly, installed at that version and named in every narration health line", async () => {
  const pinned = JSON.parse(read("package.json")).dependencies["msedge-tts"];
  assert.match(pinned, /^\d+\.\d+\.\d+$/, "exact version: an unreviewed release can neither break nor silently fix narration");
  assert.equal(pinned, "2.1.0", "2.1.0 moved to the endpoint that recovered production on 2026-10-13");
  assert.equal(require("msedge-tts/package.json").version, pinned, "npm install resolved the pinned version");
  const TTS = require("../../lib/shorts-tts");
  assert.equal(TTS.edgeLibraryVersion(), pinned);
  const keep = process.argv.slice();
  process.argv.push("--channel", "impossible-brief");
  try {
    const Health = require("../../saglik.js");
    const base = { publish: "1", token: async () => ({ kapsam: "" }), identity: async () => ({ actual: "UC" }), nitelikli: { count: 20, first: "x", reason: "ok" }, araclar: { ok: true }, diskGB: 50, kalan: 30 };
    const ok = await Health.denetle({ ...base, seslendirme: async () => ({ ok: true, tries: ["ok"] }) });
    assert.match(ok.bulgular.find((item) => item.ad === "seslendirme").mesaj, new RegExp(`msedge-tts ${pinned.replace(/\./g, "\\.")}`));
    const refused = await Health.denetle({ ...base, seslendirme: async () => ({ ok: false, tries: ["403", "403", "403"] }),
      fallbackPolicy: { allowed: false, approved: false, voice: "am_fenrir", reason: "not approved" } });
    const voice = refused.bulgular.find((item) => item.ad === "seslendirme");
    assert.equal(voice.durum, "kritik", "the narration gate is unchanged");
    assert.match(voice.mesaj, /NARRATION_UNAVAILABLE[\s\S]*msedge-tts 2\.1\.0/);
  } finally { process.argv.splice(0, process.argv.length, ...keep); }
});
