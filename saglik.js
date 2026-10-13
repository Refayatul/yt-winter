// SAGLIK — her calismanin BASINDA sistemin yayin yapabilir durumda oldugunu dogrular.
//
// Neden: yetki bitince (Test modundaki OAuth jetonu 7 gunde olur) video uretilip
// YUKLENEMEZ; eskiden konu "uretildi" sayilip kayboluyordu ve bildirim gitmiyordu.
// Simdi sorun uretimden ONCE yakalanir, konu harcanmaz, GitHub issue ile haber verilir.
//
// Kontroller (her biri: ok | uyari | kritik):
//   youtube-yetki   refresh token calisiyor mu (invalid_grant = suresi dolmus/iptal)
//   youtube-kapsam  youtube.force-ssl + yt-analytics.readonly var mi
//   oauth-reauth-deadline — yalniz Testing/explicit deadline icin esik uyarisi
//   pexels          PEXELS_KEY calisiyor mu (stok konular icin)
//   kutuphane       kac gunluk uretilmemis konu kaldi (<7 uyari, 0 kritik)
//   nitelikli-konu  kalite cubugunu (bucket + ViralPotential minimum) gecen secilebilir konu var mi
//   seslendirme     Edge sesi su an calisiyor mu; calismiyorsa onayli yedek ses (lib/shorts-tts.js) hazir mi
//   render-araclari ffmpeg/ffprobe ve gereken filtreler (subtitles, loudnorm, zoompan)
//   disk            bos alan (render + arsiv indirmeleri icin)
//
// Cikti: icerik/saglik.json (bildirim.js okur). Cikis kodu: 0 = yuklemeye uygun,
// 5 = yukleme yapilamaz (kritik: yetki, kanal, seslendirme, render araclari, disk) —
// shorts-sira ve IB/CT hatti bu durumda konu harcamaz ve hicbir sey render etmez.
// Kullanim: node saglik.js [--sessiz]
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { KOK, jsonOku, jsonYaz, env } = require("./lib/ortak");
const SELECTED = require("./core/channel-context").selectFromArgv(process.argv.slice(2));
const CHANNEL = SELECTED.channel;
const yt = require("./lib/yt");
const OAuthHealth = require("./oauth-health");

const GEREKLI_KAPSAM = yt.REQUIRED_SCOPES;

function getir(url, basliklar = {}) {
  return new Promise((coz) => {
    const r = https.get(url, { headers: { "User-Agent": "failure-reconstructed-bot", ...basliklar } }, (res) => {
      res.resume(); res.on("end", () => coz(res.statusCode));
    });
    r.on("error", () => coz(0));
    r.setTimeout(20000, () => r.destroy());
  });
}

function kalanKonu() {
  if (CHANNEL.config.pathMode !== "legacy-adapter") return require("./core/analytics/library-health").calculate(CHANNEL).readyShorts;
  const K = require("./lib/kutuphane");
  const bitti = new Set([...jsonOku(K.YOL.uretildi, []), ...jsonOku(K.YOL.basarisiz, []),
    ...K.yayinlananlar().map((y) => y.slug)]);
  return K.konular().filter((k) => !bitti.has(k.slug) && K.formatBul(k) === "short").length;
}

// Kalite cubugunu gecen ve henuz uretilmemis konular (yazmadan; uretimdeki secimle ayni dislamalar).
function nitelikliKonu() {
  try {
    const Growth = require("./core/growth");
    if (CHANNEL.config.pathMode !== "legacy-adapter") {
      const exclude = [...require("./core/discovery").usedIds(CHANNEL)];
      const selection = Growth.selectShortTopic(CHANNEL, { exclude, write: false });
      return { count: selection.selected ? (selection.candidatePool || {}).count || 1 : 0, first: selection.selected ? selection.selected.topic.slug : null, reason: selection.reason };
    }
    const K = require("./lib/kutuphane");
    const durum = (ad) => jsonOku(path.join(CHANNEL.paths.state, ad), null);
    const exclude = [...(durum("uretilenler.json") || []), ...(durum("basarisiz.json") || []), ...K.yayinlananlar().map((y) => y.slug),
      ...Object.keys(durum("engellenen.json") || {}), ...Object.keys(durum("inceleme.json") || {})].filter(Boolean);
    const queue = Growth.orderedQueue(CHANNEL, { exclude, write: false });
    const order = queue.order.filter((slug) => !exclude.includes(slug));
    return { count: order.length, first: order[0] || null, reason: queue.reason };
  } catch (error) {
    return { count: -1, first: null, reason: "could not evaluate: " + String(error.message).slice(0, 120) };
  }
}

function renderAraclari() {
  const cp = require("child_process");
  const FF = require("./ff-yol");
  for (const tool of [FF.ffmpeg, FF.ffprobe]) {
    const r = cp.spawnSync(tool, ["-version"], { encoding: "utf8" });
    if (r.status !== 0) return { ok: false, reason: `${path.basename(tool)} çalışmıyor` };
  }
  const filters = cp.spawnSync(FF.ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout || "";
  const missing = ["subtitles", "loudnorm", "zoompan", "drawtext"].filter((name) => !new RegExp(`\\s${name}\\s`).test(filters));
  return missing.length ? { ok: false, reason: `ffmpeg filtreleri eksik: ${missing.join(", ")}` } : { ok: true };
}

function diskGB() {
  try { const s = fs.statfsSync(KOK); return (s.bavail * s.bsize) / 1e9; } catch (error) { return 99; }
}

// The blocking findings of the last health check, in one line (shorts-sira and the stage record).
function kritikOzet(channel = CHANNEL) {
  const s = jsonOku(path.join(channel.paths.state, channel.config.pathMode === "legacy-adapter" ? "saglik.json" : "health.json"), null);
  const k = s ? (s.bulgular || []).filter((x) => x.durum === "kritik") : [];
  return k.length ? k.map((x) => `${x.ad}: ${x.mesaj}`).join("; ") : "health pre-flight failed";
}

async function denetle(ops = {}) {
  const b = [];
  const ekle = (ad, durum, mesaj, cozum) => b.push({ ad, durum, mesaj, ...(cozum ? { cozum } : {}) });
  const publish = (ops.publish ?? process.env.PUBLISH) === "1";

  // 1) YouTube yetkisi
  if (!yt.kimlikVar()) {
    const required = [CHANNEL.credentialNames.clientId[0], CHANNEL.credentialNames.clientSecret[0], CHANNEL.credentialNames.refreshToken[0]];
    ekle("youtube-yetki", publish ? "kritik" : "uyari", `YouTube kimlik bilgileri yok (${required.join(", ")})`,
      `GitHub → Settings → Secrets and variables → Actions: ${required.join(", ")} değerlerini ekle.`);
  } else {
    try {
      const t = await (ops.token || yt.token)();
      ekle("youtube-yetki", "ok", "refresh token çalışıyor");
      const kapsamlar = new Set(String(t.kapsam || "").split(/\s+/).filter(Boolean));
      const eksik = GEREKLI_KAPSAM.filter((k) => !kapsamlar.has(k));
      ekle("youtube-kapsam", eksik.length ? "uyari" : "ok", eksik.length ? "eksik yetki kapsamı: " + eksik.join(", ") : "gerekli kapsamlar tamam",
        eksik.length ? `Yerelde \`node youtube-yetki.js --channel ${CHANNEL.slug} --github\` çalıştır; yeni token ${CHANNEL.credentialNames.refreshToken[0]} secret'ına güvenle kaydedilir.` : null);
      if (!CHANNEL.expectedChannelId()) {
        ekle("youtube-kanal", publish ? "kritik" : "uyari", `Beklenen YouTube kanal kimliği yok (${CHANNEL.credentialNames.channelId[0]})`,
          `Doğru kanalın UC... kimliğini ${CHANNEL.credentialNames.channelId[0]} olarak ekle; yükleme o zamana kadar bloklanır.`);
      } else {
        try {
          const identity = await (ops.identity || ((tokenValue) => yt.verifyChannelIdentity(yt.istemci(tokenValue), CHANNEL)))(t);
          ekle("youtube-kanal", "ok", `doğru kanal doğrulandı (${identity.actual || identity.authenticatedChannelId || CHANNEL.expectedChannelId()})`);
        } catch (error) {
          ekle("youtube-kanal", publish ? "kritik" : "uyari", String(error.message).slice(0, 180),
            `OAuth'u \`node youtube-yetki.js --channel ${CHANNEL.slug}\` ile doğru kanal hesabından yenile.`);
        }
      }
    } catch (e) {
      ekle("youtube-yetki", "kritik", `YOUTUBE_AUTH_FAILURE channel=${CHANNEL.slug} reason=${e.code || "UNKNOWN_AUTH_ERROR"}`,
        `Yerelde \`node youtube-yetki.js --channel ${CHANNEL.slug} --github\` çalıştır. Kalıcı çözüm: Google Auth Platform → Audience → In production.`);
    }
  }

  // 2) Re-authorization deadline (advisory; it alerts but never blocks an
  // upload whose live refresh and identity checks passed). This is not a universal refresh-token
  // expiry: it is derived only for a recorded Testing-mode authorization or
  // an explicit operator deadline. Live refresh validation above remains the
  // authoritative proof that the token works now.
  const deadline = OAuthHealth.authorizationDeadline(CHANNEL, {
    ...(ops.now ? { now: ops.now } : {}),
    ...(Object.prototype.hasOwnProperty.call(ops, "authorizationState") ? { authorizationState: ops.authorizationState } : {}),
  });
  ekle("oauth-reauth-deadline", { PASS: "ok", WARNING: "uyari", ERROR: "uyari", CRITICAL: "kritik" }[deadline.status], deadline.message,
    deadline.status === "PASS" ? null : `Run \`node youtube-yetki.js --channel ${CHANNEL.slug} --oauth-mode=production --github\` after confirming Google Auth Platform → Audience is In production.`);

  // 2b) TikTok (istege bagli — kimlik yoksa hic bahsedilmez)
  if (CHANNEL.config.platforms.tiktok.enabled && ["TT_CLIENT_KEY", "TT_CLIENT_SECRET", "TT_REFRESH_TOKEN"].some((k) => env(k))) {
    const TT = require("./lib/tiktok");
    if (!TT.kimlikVar()) ekle("tiktok", "uyari", "TikTok kimlik bilgileri eksik (TT_CLIENT_KEY/TT_CLIENT_SECRET/TT_REFRESH_TOKEN)",
      "Eksik secret'i GitHub → Settings → Secrets → Actions altina ekle.");
    else {
      try {
        const t = await (ops.ttToken || TT.token)();
        ekle("tiktok", /video\.upload/.test(t.kapsam) || !t.kapsam ? "ok" : "uyari",
          /video\.upload/.test(t.kapsam) || !t.kapsam ? "TikTok yetkisi çalışıyor" : "TikTok yetkisinde video.upload kapsamı yok",
          /video\.upload/.test(t.kapsam) || !t.kapsam ? null : "Yerelde `node tiktok-yetki.js` çalıştır.");
      } catch (e) {
        ekle("tiktok", "uyari", "TikTok yetkisi geçersiz: " + String(e.message).slice(0, 140),
          "Yerelde `node tiktok-yetki.js` → yeni TT_REFRESH_TOKEN'ı GitHub secret'ına koy. (YouTube yayını bundan etkilenmez.)");
      }
    }
    // Jeton yasi: TikTok refresh token 365 gun; 30 gun kala haber ver
    const y2 = jsonOku(path.join(KOK, "config", "yetki.json"), null);
    if (y2 && y2.tiktokYetkiTarihi) {
      const kalan = 365 - (Date.now() - Date.parse(y2.tiktokYetkiTarihi)) / 86400000;
      if (kalan <= 30) ekle("tiktok-yasi", kalan <= 0 ? "uyari" : "uyari",
        kalan <= 0 ? "TikTok yetkisinin süresi doldu" : `TikTok yetkisi ${Math.round(kalan)} gün sonra bitiyor`,
        "`node tiktok-yetki.js` ile yenile.");
    }
  }

  // 3) Pexels (stok konular)
  const pk = env("PEXELS_KEY");
  if (CHANNEL.config.pathMode !== "legacy-adapter") ekle("gorsel-kaynak", "ok", "kanala özel kaynak öncelikleri ve prosedürel görsel motoru hazır; Pexels zorunlu değil");
  else if (!pk) ekle("pexels", "uyari", "PEXELS_KEY yok — stok konular üretilemez", "GitHub secret PEXELS_KEY ekle.");
  else {
    const d = await (ops.pexels || ((k) => getir("https://api.pexels.com/videos/search?query=ocean&per_page=1", { Authorization: k })))(pk);
    ekle("pexels", d === 200 ? "ok" : "uyari", d === 200 ? "Pexels anahtarı çalışıyor" : `Pexels yanıtı HTTP ${d}`,
      d === 200 ? null : "Pexels anahtarını kontrol et (pexels.com/api).");
  }

  // 4) Kutuphane
  const n = ops.kalan ?? kalanKonu();
  ekle("kutuphane", n === 0 ? "kritik" : n < 7 ? "uyari" : "ok", `${n} günlük üretilmemiş konu var`,
    n < 7 ? "Kütüphaneye yeni konu eklenmeli (icerik/konular/)." : null);

  // 5) Nitelikli konu: "N gunluk konu" kalite cubugunu gecenlerin sayisi DEGILDIR (2026-10-12: FR 327
  // gun gosterirken 0 nitelikli konu vardi). Yayin icin secilebilecek konu yoksa bugun Short cikmaz.
  const nitelikli = ops.nitelikli ?? nitelikliKonu();
  ekle("nitelikli-konu", nitelikli.count === 0 ? "kritik" : nitelikli.count < 7 ? "uyari" : "ok",
    nitelikli.count === 0 ? `kalite çubuğunu geçen konu yok — ${nitelikli.reason}` : `${nitelikli.count} nitelikli konu (ilk: ${nitelikli.first})`,
    nitelikli.count < 7 ? "Konu araştırması/görsel kürasyonu gerekiyor; eşik düşürülmez." : null);

  // 6) Seslendirme: Edge sesi; reddedilirse yalnizca ONAYLI yedek ses uretimi kurtarir.
  if (publish || ops.seslendirme) {
    const voice = (CHANNEL.config.voice || {}).voice || "en-US-AndrewMultilingualNeural";
    const TTS = require("./lib/shorts-tts");
    const probe = await (ops.seslendirme || ((v) => TTS.edgeProbe(v)))(voice);
    const policy = ops.fallbackPolicy || TTS.fallbackPolicy(CHANNEL);
    if (probe.ok) ekle("seslendirme", "ok", `Edge sesi çalışıyor (${voice})`);
    else if (policy.allowed && policy.approved) ekle("seslendirme", "uyari", `Edge sesi reddedildi (${probe.tries.join(", ")}); onaylı yedek ses kullanılacak (${policy.voice})`);
    else ekle("seslendirme", "kritik", `NARRATION_UNAVAILABLE: Edge sesi reddedildi (${probe.tries.join(", ")}); yedek ses yok — ${policy.reason}`,
      "Yedek sesi (config.voice.fallback) dinleyip onaylayın ya da Edge'in düzelmesini bekleyin. Konu harcanmaz, hiçbir şey render edilmez.");
  }

  // 7) Render araclari ve disk
  const araclar = ops.araclar || renderAraclari();
  ekle("render-araclari", araclar.ok ? "ok" : "kritik", araclar.ok ? "ffmpeg, ffprobe ve gereken filtreler hazır" : araclar.reason,
    araclar.ok ? null : "Runner'da `bash scripts/ci-apt.sh ffmpeg` adımını kontrol edin.");
  const bos = ops.diskGB ?? diskGB();
  ekle("disk", bos < 2 ? "kritik" : bos < 5 ? "uyari" : "ok", `${bos.toFixed(1)} GB boş alan`, bos < 5 ? "Eski uretim/ ve render çıktıları temizlenmeli." : null);

  const kritik = b.some((x) => x.durum === "kritik" && ["youtube-yetki", "youtube-kanal", "seslendirme", "render-araclari", "disk"].includes(x.ad));
  return { channel: CHANNEL.slug, channelName: CHANNEL.name, tarih: new Date().toISOString(), aggregateManaged: true, yuklemeUygun: !kritik || !publish, bulgular: b };
}

module.exports = { denetle, kritikOzet, nitelikliKonu, renderAraclari, GEREKLI_KAPSAM };

if (require.main === module) {
  denetle().then((r) => {
    jsonYaz(path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "saglik.json" : "health.json"), r);
    if (!process.argv.includes("--sessiz"))
      for (const x of r.bulgular) console.log(`${{ ok: "✓", uyari: "⚠", kritik: "✗" }[x.durum]} ${x.ad.padEnd(15)} ${x.mesaj}`);
    process.exit(r.yuklemeUygun ? 0 : 5);
  }).catch((e) => { console.error("Saglik kontrolu hatasi: " + e.message); process.exit(0); });
}
