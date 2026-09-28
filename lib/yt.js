// YT — YouTube Data API v3 + YouTube Analytics API v2 icin kucuk istemci.
//
// Ilke: veri yoksa UYDURMA. Her cagri {ok, veri} ya da {ok:false, neden} doner;
// ust katman eksik metrigi "unavailable" olarak isaretler.
//
// Analytics icin OAuth kapsaminda yt-analytics.readonly gerekir
// (youtube-yetki.js yeni yetkide ister). Eski jetonla Analytics 403 verir ->
// rapor "unavailable (scope)" yazar, sistem calismaya devam eder.
"use strict";
const https = require("https");
const Channel = require("../core/channel-context");

function istek(opt, govde) {
  return new Promise((coz, red) => {
    const r = https.request(opt, (res) => {
      const p = [];
      res.on("data", (d) => p.push(d));
      res.on("end", () => coz({ durum: res.statusCode, govde: Buffer.concat(p).toString("utf8") }));
    });
    r.on("error", red);
    r.setTimeout(30000, () => r.destroy(new Error("zaman asimi")));
    if (govde) r.write(govde);
    r.end();
  });
}

const kimlik = (channel = Channel.getChannel()) => channel.credentials();
const kimlikVar = (channel = Channel.getChannel()) => {
  const c = kimlik(channel);
  return !!(c.clientId && c.clientSecret && c.refreshToken);
};

async function token(_istek = istek, channel = Channel.getChannel()) {
  const c = kimlik(channel);
  if (!kimlikVar(channel)) throw new Error(`YouTube kimlik bilgileri yok (${c.prefix}_YT_CLIENT_ID/SECRET/REFRESH_TOKEN)`);
  const g = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret,
    refresh_token: c.refreshToken, grant_type: "refresh_token" }).toString();
  const y = await _istek({ hostname: "oauth2.googleapis.com", path: "/token", method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(g) } }, g);
  if (y.durum !== 200) throw new Error("OAuth jetonu alinamadi (HTTP " + y.durum + ") — jeton suresi dolmus olabilir: node youtube-yetki.js");
  const j = JSON.parse(y.govde);
  return { erisim: j.access_token, kapsam: String(j.scope || "") };
}

async function authenticatedChannel(api) {
  const response = await api.data("channels?part=id,snippet&mine=true");
  const item = response.ok && response.veri && response.veri.items && response.veri.items[0];
  if (!item || !item.id) throw new Error("CHANNEL_ID_UNAVAILABLE: authenticated YouTube channel could not be read");
  return { id: item.id, title: item.snippet && item.snippet.title };
}

async function verifyChannelIdentity(api, channel = Channel.getChannel()) {
  const expected = channel.expectedChannelId();
  if (!expected) throw new Error(`CHANNEL_ID_MISSING: set ${channel.prefix}_YT_CHANNEL_ID for ${channel.name}; upload is blocked`);
  const actual = await authenticatedChannel(api);
  if (actual.id !== expected) {
    throw new Error(`CHANNEL_ID_MISMATCH: authenticated ${actual.id} (${actual.title || "unknown"}) but ${channel.name} expects ${expected}; upload blocked`);
  }
  return { ok: true, expected, actual: actual.id, title: actual.title || null, channel: channel.slug };
}

function istemci(tok, _istek = istek) {
  const bas = { Authorization: "Bearer " + tok.erisim };
  const cevir = (r) => {
    let veri = null; try { veri = JSON.parse(r.govde); } catch (e) {}
    if (r.durum >= 200 && r.durum < 300) return { ok: true, veri };
    const neden = (veri && veri.error && (veri.error.message || veri.error.status)) || ("HTTP " + r.durum);
    return { ok: false, durum: r.durum, neden };
  };
  const data = (yol) => _istek({ hostname: "www.googleapis.com", path: "/youtube/v3/" + yol, headers: bas }).then(cevir);
  const yazma = (yontem) => async (yol, obj) => {
    const body = JSON.stringify(obj);
    return cevir(await _istek({ hostname: "www.googleapis.com", path: "/youtube/v3/" + yol, method: yontem,
      headers: { ...bas, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body));
  };
  const analytics = (q) => {
    if (!/yt-analytics/.test(tok.kapsam) && tok.kapsam) {
      return Promise.resolve({ ok: false, neden: "unavailable (OAuth scope lacks yt-analytics.readonly — re-run youtube-yetki.js)" });
    }
    const p = new URLSearchParams({ ids: "channel==MINE", ...q }).toString();
    return _istek({ hostname: "youtubeanalytics.googleapis.com", path: "/v2/reports?" + p, headers: bas }).then(cevir);
  };
  return { data, post: yazma("POST"), put: yazma("PUT"), analytics, kapsam: tok.kapsam };
}

// Analytics yaniti -> [{kolon: deger}] satirlari
function satirlar(yanit) {
  if (!yanit || !yanit.ok || !yanit.veri || !yanit.veri.columnHeaders) return [];
  const ad = yanit.veri.columnHeaders.map((c) => c.name);
  return (yanit.veri.rows || []).map((r) => Object.fromEntries(r.map((v, i) => [ad[i], v])));
}

// Kanalin tum yuklemeleri (sayfalama ile)
async function yuklemeler(api, max = 200) {
  const ch = await api.data("channels?part=contentDetails,snippet,statistics&mine=true");
  if (!ch.ok || !ch.veri.items || !ch.veri.items.length) throw new Error("Kanal okunamadi: " + (ch.neden || "bos"));
  const kanal = ch.veri.items[0];
  const up = kanal.contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let sayfa = "";
  do {
    const r = await api.data("playlistItems?part=contentDetails&maxResults=50&playlistId=" + up + (sayfa ? "&pageToken=" + sayfa : ""));
    // Callers such as the production watchdog use an empty result as proof
    // that no upload exists. Returning a partial/empty list on an API error
    // would therefore be unsafe and could authorize a duplicate upload.
    if (!r.ok) throw new Error("Kanal yuklemeleri okunamadi: " + (r.neden || "bilinmeyen API hatasi"));
    for (const i of r.veri.items || []) ids.push(i.contentDetails.videoId);
    sayfa = r.veri.nextPageToken || "";
  } while (sayfa && ids.length < max);
  return { kanal, ids };
}

async function videolar(api, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api.data("videos?part=snippet,statistics,contentDetails,status&id=" + ids.slice(i, i + 50).join(","));
    if (r.ok) out.push(...(r.veri.items || []));
  }
  return out;
}

// ISO 8601 sure -> saniye
function sureSn(iso) {
  const m = String(iso || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

module.exports = { istek, token, istemci, satirlar, yuklemeler, videolar, sureSn, kimlik, kimlikVar, authenticatedChannel, verifyChannelIdentity };
