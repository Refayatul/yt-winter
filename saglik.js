// SAGLIK — her calismanin BASINDA sistemin yayin yapabilir durumda oldugunu dogrular.
//
// Neden: yetki bitince (Test modundaki OAuth jetonu 7 gunde olur) video uretilip
// YUKLENEMEZ; eskiden konu "uretildi" sayilip kayboluyordu ve bildirim gitmiyordu.
// Simdi sorun uretimden ONCE yakalanir, konu harcanmaz, GitHub issue ile haber verilir.
//
// Kontroller (her biri: ok | uyari | kritik):
//   youtube-yetki   refresh token calisiyor mu (invalid_grant = suresi dolmus/iptal)
//   youtube-kapsam  youtube.force-ssl + yt-analytics.readonly var mi
//   yetki-yasi      config/yetki.json — Test modunda 5. gunde uyari, 7. gunde kritik
//   pexels          PEXELS_KEY calisiyor mu (stok konular icin)
//   kutuphane       kac gunluk uretilmemis konu kaldi (<7 uyari, 0 kritik)
//
// Cikti: icerik/saglik.json (bildirim.js okur). Cikis kodu: 0 = yuklemeye uygun,
// 5 = yukleme yapilamaz (kritik) — shorts-sira bu durumda konu harcamaz.
// Kullanim: node saglik.js [--sessiz]
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { KOK, jsonOku, jsonYaz, env } = require("./lib/ortak");
const SELECTED = require("./core/channel-context").selectFromArgv(process.argv.slice(2));
const CHANNEL = SELECTED.channel;
const yt = require("./lib/yt");

const GEREKLI_KAPSAM = ["youtube.force-ssl", "yt-analytics.readonly"];

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
  if (CHANNEL.slug === "impossible-brief") return require("./core/analytics/library-health").calculate(CHANNEL).readyShorts;
  const K = require("./lib/kutuphane");
  const bitti = new Set([...jsonOku(K.YOL.uretildi, []), ...jsonOku(K.YOL.basarisiz, []),
    ...K.yayinlananlar().map((y) => y.slug)]);
  return K.konular().filter((k) => !bitti.has(k.slug) && K.formatBul(k) === "short").length;
}

async function denetle(ops = {}) {
  const b = [];
  const ekle = (ad, durum, mesaj, cozum) => b.push({ ad, durum, mesaj, ...(cozum ? { cozum } : {}) });
  const publish = (ops.publish ?? process.env.PUBLISH) === "1";

  // 1) YouTube yetkisi
  if (!yt.kimlikVar()) {
    ekle("youtube-yetki", publish ? "kritik" : "uyari", `YouTube kimlik bilgileri yok (${CHANNEL.prefix}_YT_CLIENT_ID/SECRET/REFRESH_TOKEN)`,
      `GitHub → Settings → Secrets and variables → Actions: ${CHANNEL.prefix}_YT_* secret'larını ekle.`);
  } else {
    try {
      const t = await (ops.token || yt.token)();
      ekle("youtube-yetki", "ok", "refresh token çalışıyor");
      const eksik = GEREKLI_KAPSAM.filter((k) => !t.kapsam.includes(k));
      ekle("youtube-kapsam", eksik.length ? "uyari" : "ok", eksik.length ? "eksik yetki kapsamı: " + eksik.join(", ") : "gerekli kapsamlar tamam",
        eksik.length ? `Yerelde \`node youtube-yetki.js --channel ${CHANNEL.slug}\` çalıştırıp yeni token'ı ${CHANNEL.prefix}_YT_REFRESH_TOKEN secret'ına koy.` : null);
      if (!CHANNEL.expectedChannelId()) {
        ekle("youtube-kanal", publish ? "kritik" : "uyari", `Beklenen YouTube kanal kimliği yok (${CHANNEL.prefix}_YT_CHANNEL_ID)`,
          `Doğru kanalın UC... kimliğini ${CHANNEL.prefix}_YT_CHANNEL_ID olarak ekle; yükleme o zamana kadar bloklanır.`);
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
      ekle("youtube-yetki", "kritik", "YouTube yetkisi geçersiz: " + String(e.message).slice(0, 160),
        "Yerelde `node youtube-yetki.js` → tarayıcıda izin ver → .env'deki YT_REFRESH_TOKEN'ı GitHub secret'ına kopyala. Kalıcı çözüm: Google Cloud → OAuth consent screen → Publish app (Production).");
    }
  }

  // 2) Yetki yasi (Test modunda Google jetonu 7 gunde iptal eder)
  const y = jsonOku(CHANNEL.config.pathMode === "legacy-adapter" ? path.join(KOK, "config", "yetki.json") : path.join(CHANNEL.paths.state, "auth-state.json"), null);
  if (y && y.mod === "testing" && y.yetkiTarihi) {
    const gun = (Date.now() - Date.parse(y.yetkiTarihi)) / 86400000;
    const bitis = new Date(Date.parse(y.yetkiTarihi) + 7 * 86400000);
    const tr = require("./lib/zamanlama").trSaat(bitis);
    if (gun >= 7) ekle("yetki-yasi", "kritik", `Test modundaki YouTube yetkisinin süresi doldu (${tr})`,
      "`node youtube-yetki.js` ile yenile ya da uygulamayı Production'a al (Publish app).");
    else if (gun >= 5) ekle("yetki-yasi", "uyari", `YouTube yetkisi ${tr} tarihinde bitecek (${(7 - gun).toFixed(1)} gün kaldı)`,
      "Bitmeden `node youtube-yetki.js` ile yenile ya da Google Cloud'da Publish app yap.");
    else ekle("yetki-yasi", "ok", `yetki ${tr} tarihine kadar geçerli`);
  }

  // 2b) TikTok (istege bagli — kimlik yoksa hic bahsedilmez)
  if (["TT_CLIENT_KEY", "TT_CLIENT_SECRET", "TT_REFRESH_TOKEN"].some((k) => env(k))) {
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
  if (CHANNEL.slug === "impossible-brief") ekle("gorsel-kaynak", "ok", "resmî bilim medyası ve prosedürel görsel motoru hazır; Pexels zorunlu değil");
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

  const kritik = b.some((x) => x.durum === "kritik" && ["youtube-yetki", "youtube-kanal", "yetki-yasi"].includes(x.ad));
  return { channel: CHANNEL.slug, channelName: CHANNEL.name, tarih: new Date().toISOString(), yuklemeUygun: !kritik || !publish, bulgular: b };
}

module.exports = { denetle, GEREKLI_KAPSAM };

if (require.main === module) {
  denetle().then((r) => {
    jsonYaz(path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "saglik.json" : "health.json"), r);
    if (!process.argv.includes("--sessiz"))
      for (const x of r.bulgular) console.log(`${{ ok: "✓", uyari: "⚠", kritik: "✗" }[x.durum]} ${x.ad.padEnd(15)} ${x.mesaj}`);
    process.exit(r.yuklemeUygun ? 0 : 5);
  }).catch((e) => { console.error("Saglik kontrolu hatasi: " + e.message); process.exit(0); });
}
