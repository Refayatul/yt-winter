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

const REQUIRED_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
]);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

class YouTubeAuthError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "YouTubeAuthError";
    this.code = code;
    this.status = details.status || null;
    this.retryable = !!details.retryable;
    this.errorSubtype = details.errorSubtype || null;
  }
}

function parseJson(value) {
  try { return JSON.parse(String(value || "{}")); } catch (error) { return {}; }
}

function classifyOAuthFailure(status, body) {
  const parsed = parseJson(body);
  const error = String(parsed.error || "");
  const description = String(parsed.error_description || "");
  const errorSubtype = String(parsed.error_subtype || "") || null;
  if (error === "invalid_client" || error === "unauthorized_client") return { code: "CLIENT_MISMATCH", errorSubtype };
  if (error === "invalid_grant") {
    if (/revok/i.test(description)) return { code: "TOKEN_REVOKED", errorSubtype };
    return { code: "INVALID_GRANT", errorSubtype };
  }
  if (error === "access_denied" || error === "admin_policy_enforced") return { code: "TOKEN_REVOKED", errorSubtype };
  if (RETRYABLE_STATUS.has(Number(status))) return { code: "TRANSIENT_AUTH_ERROR", errorSubtype };
  return { code: "UNKNOWN_AUTH_ERROR", errorSubtype };
}

function classifyApiFailure(response) {
  const status = Number(response && response.durum);
  const reason = String(response && response.neden || "");
  if (status === 401) return "TOKEN_REVOKED";
  if (status === 403 && /scope|permission|insufficient/i.test(reason)) return "INSUFFICIENT_SCOPE";
  if (status === 403 && /quota|rate/i.test(reason)) return "QUOTA_ERROR";
  if (status === 403 && /disabled|not been used|accessNotConfigured/i.test(reason)) return "API_DISABLED";
  if (status === 429) return "QUOTA_ERROR";
  return "UNKNOWN_AUTH_ERROR";
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function token(_istek = istek, channel = Channel.getChannel(), options = {}) {
  const c = kimlik(channel);
  const missing = [];
  if (!c.clientId) missing.push(c.names.clientId[0]);
  if (!c.clientSecret) missing.push(c.names.clientSecret[0]);
  if (!c.refreshToken) missing.push(c.names.refreshToken[0]);
  if (missing.length) throw new YouTubeAuthError("MISSING_SECRET", `missing ${missing.join(", ")} for ${channel.slug}`);
  const g = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret,
    refresh_token: c.refreshToken, grant_type: "refresh_token" }).toString();
  const attempts = Math.max(1, Number(options.attempts || 3));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const y = await _istek({ hostname: "oauth2.googleapis.com", path: "/token", method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(g) } }, g);
      if (y.durum === 200) {
        const j = parseJson(y.govde);
        if (!j.access_token) throw new YouTubeAuthError("UNKNOWN_AUTH_ERROR", "OAuth response did not include an access token", { status: y.durum });
        return { erisim: j.access_token, kapsam: String(j.scope || ""), expiresIn: Number(j.expires_in || 0) || null };
      }
      const classified = classifyOAuthFailure(y.durum, y.govde);
      lastError = new YouTubeAuthError(classified.code, `access-token refresh failed (HTTP ${y.durum}) for ${channel.slug}`, {
        status: y.durum, retryable: RETRYABLE_STATUS.has(Number(y.durum)), errorSubtype: classified.errorSubtype,
      });
    } catch (error) {
      lastError = error instanceof YouTubeAuthError ? error
        : new YouTubeAuthError("TRANSIENT_AUTH_ERROR", `access-token refresh request failed for ${channel.slug}`, { retryable: true });
    }
    if (!lastError.retryable || attempt === attempts) throw lastError;
    await (options.delay || delay)(attempt * 250);
  }
  throw lastError;
}

async function authenticatedChannel(api) {
  const response = await api.data("channels?part=id,snippet&mine=true");
  const item = response.ok && response.veri && response.veri.items && response.veri.items[0];
  if (!item || !item.id) throw new Error("CHANNEL_ID_UNAVAILABLE: authenticated YouTube channel could not be read");
  return { id: item.id, title: item.snippet && item.snippet.title };
}

async function verifyChannelIdentity(api, channel = Channel.getChannel()) {
  const expected = channel.expectedChannelId();
  if (!expected) throw new YouTubeAuthError("CHANNEL_ID_MISSING", `set ${channel.credentialNames.channelId[0]} for ${channel.name}; write action blocked`);
  const actual = await authenticatedChannel(api);
  if (actual.id !== expected) {
    throw new YouTubeAuthError("CHANNEL_MISMATCH", `authenticated ${actual.id} (${actual.title || "unknown"}) but ${channel.name} expects ${expected}; upload/write blocked`);
  }
  return { ok: true, expected, actual: actual.id, title: actual.title || null, channel: channel.slug };
}

function istemci(tok, _istek = istek) {
  const bas = { Authorization: "Bearer " + tok.erisim };
  const cevir = (r) => {
    let veri = null; try { veri = JSON.parse(r.govde); } catch (e) {}
    if (r.durum >= 200 && r.durum < 300) return { ok: true, veri };
    const neden = (veri && veri.error && (veri.error.message || veri.error.status)) || ("HTTP " + r.durum);
    return { ok: false, durum: r.durum, neden, kod: classifyApiFailure({ durum: r.durum, neden }) };
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

async function getYouTubeClient(channel = Channel.getChannel(), options = {}) {
  const tok = await token(options.request || istek, channel, options);
  const api = istemci(tok, options.request || istek);
  const identity = options.verifyIdentity === false ? null : await verifyChannelIdentity(api, channel);
  return Object.freeze({
    channel: channel.slug,
    api,
    accessToken: tok.erisim,
    scopes: tok.kapsam,
    expiresIn: tok.expiresIn,
    identity,
  });
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

module.exports = {
  REQUIRED_SCOPES, YouTubeAuthError, istek, token, istemci, getYouTubeClient,
  classifyOAuthFailure, classifyApiFailure, satirlar, yuklemeler, videolar, sureSn,
  kimlik, kimlikVar, authenticatedChannel, verifyChannelIdentity,
};
