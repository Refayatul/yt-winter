// TIKTOK YUKLEYICI — bitmis MP4'u TikTok gelen kutusuna gonderir.
//
// Guvenlik ilkeleri (youtube-yukle.js ile ayni):
//   1) Kendiliginden CALISMAZ: yalnizca acikca cagrildiginda ve uc kimlik
//      bilgisi de varken calisir.
//   2) Hicbir sey HERKESE ACIK yapilmaz. Video TikTok uygulamasindaki gelen
//      kutusuna duser; yayinlama karari ve son duzenleme SENDE kalir.
//   3) Ek npm bagimliligi yok.
//
// Ayni video iki kez gonderilmez: icerik/tiktok.json kaydi tutulur.
//
// Kullanim:
//   node tiktok-yukle.js <slug>              # gelen kutusuna gonder
//   node tiktok-yukle.js <slug> --dogrula    # KURU CALISMA: hicbir sey gonderilmez
//   node tiktok-yukle.js --gecmis            # YouTube'da olup TikTok'ta olmayan EN ESKI
//                                            # videoyu uretip gonderir (arayi kapatma)
"use strict";
const fs = require("fs");
const path = require("path");
const { KOK, jsonOku, jsonYaz, slugGecerli } = require("./lib/ortak");
const TT = require("./lib/tiktok");

const KAYIT = path.join(KOK, "icerik", "tiktok.json");
const kayitlar = () => jsonOku(KAYIT, []);
const kayitBul = (slug) => kayitlar().find((x) => x.slug === slug) || null;

function kaydet(k) {
  const l = kayitlar().filter((x) => x.slug !== k.slug);
  l.push(k);
  jsonYaz(KAYIT, l);
}

function videoYolu(slug) {
  const vd = path.join(KOK, "uretim", slug, "Videos");
  const tam = path.join(vd, slug + ".mp4");
  if (fs.existsSync(tam)) return tam;
  const l = fs.existsSync(vd) ? fs.readdirSync(vd).filter((f) => f.toLowerCase().endsWith(".mp4")).sort() : [];
  return l.length ? path.join(vd, l.pop()) : null;
}

// TikTok aciklamasi — YouTube'unkinden AYRI. Akista yalnizca ilk satir gorunur, gerisi
// "more" arkasinda kalir; o yuzden sira: kanca -> sebep -> yorum sorusu -> etiketler.
// Etiketler her videoda ayni iskelette: #FailureReconstructed (marka, birikimi bulunur
// kilar) + #engineering, sonra kumeye ozel iki tane. #fyp / #foryou gibi doldurma
// etiketi KULLANILMAZ: erisim getirmiyor ve spam sinyali veriyor.
const KUME_ETIKET = {
  "spaceflight-disasters": ["#space", "#nasa"], "aviation-failures": ["#aviation", "#planecrash"],
  "maritime-disasters": ["#ships", "#maritime"], "bridge-failures": ["#bridges", "#civilengineering"],
  "structural-failures": ["#architecture", "#civilengineering"], "nuclear-accidents": ["#nuclear", "#coldwar"],
  "fire-and-explosions": ["#fire", "#safety"], "industrial-disasters": ["#industrial", "#safety"],
  "infrastructure-failures": ["#infrastructure", "#civilengineering"], "materials-failures": ["#materials", "#science"],
  "natural-hazards": ["#nature", "#science"],
};

// Ilk cumleyi al ve TikTok'a uygun kisaliga indir.
function kisaCumle(t, sinir = 120) {
  const c = String(t || "").trim().replace(/\s+/g, " ");
  if (!c) return "";
  const ilk = (c.match(/^[^.!?]*[.!?]/) || [c])[0].trim();
  return ilk.length <= sinir ? ilk : ilk.slice(0, sinir - 1).replace(/\s+\S*$/, "") + "…";
}

// Tartisma metninden SORUYU cikar (yorum getiren kisim odur; genelde son cumle).
// Soru yoksa ilk cumleye duser.
function soruCumlesi(t, sinir = 150) {
  const c = String(t || "").trim().replace(/\s+/g, " ");
  if (!c) return "";
  const sorular = c.match(/[^.!?]*\?/g);
  const sec = sorular && sorular.length ? sorular[sorular.length - 1].trim() : null;
  if (!sec) return kisaCumle(c, sinir);
  return sec.length <= sinir ? sec : sec.slice(0, sinir - 1).replace(/\s+\S*$/, "") + "…";
}

function aciklama(slug) {
  const K = require("./lib/kutuphane");
  const konu = K.uretimKonusu(slug) || {};
  const v = konu.vaka || {};
  const t = jsonOku(K.paketYolu(slug, "titles.json"), null);
  const baslik = String((t && t.secilen) || konu.baslik || slug).trim();
  const kume = v.kume || K.kumeBul(konu);
  const sebep = v.mekanizma ? "The cause: " + kisaCumle(v.mekanizma, 110).replace(/[.…]$/, "") + "."
    : kisaCumle(konu.aciklama, 110);
  // Tartisma sorusu yorum getirir; yoksa videodaki ekran sorusu kullanilir.
  const soru = v.tartisma ? soruCumlesi(v.tartisma, 150) : String(konu.soru || "").trim();
  return [baslik, sebep, soru,
    "Synthetic narration. Footage is real archival film or licensed stock.",
    [...new Set(["#FailureReconstructed", "#engineering", ...(KUME_ETIKET[kume] || ["#history", "#science"])])].join(" "),
  ].filter(Boolean).join("\n\n").slice(0, 2100);
}

async function main() {
  const argv = process.argv.slice(2);
  const kuru = argv.includes("--dogrula");
  let slug = argv.find((a) => !a.startsWith("--"));
  if (!slug && argv.includes("--gecmis")) {
    const kuyruk = gecmisKuyrugu();
    if (!kuyruk.length) { console.log("TikTok arasi kapali — gonderilecek eski video yok."); return; }
    slug = kuyruk[0].slug;
    console.log(`Gecmis: ${kuyruk.length} video eksik, sirada "${slug}" (${kuyruk.slice(1, 4).map((x) => x.slug).join(", ") || "son"})`);
    // Video yerelde yoksa uret (Actions'ta uretim klasoru her calismada bostur)
    if (!videoYolu(slug)) {
      console.log("  yerelde video yok — uretiliyor...");
      const r = require("child_process").spawnSync("node", ["shorts-sira.js", slug], { cwd: KOK, stdio: "inherit" });
      if (r.status !== 0 || !videoYolu(slug)) { console.error("  uretilemedi — bu calismada atlandi"); return; }
    }
  }
  if (!slug) { console.error("Kullanim: node tiktok-yukle.js <slug> | --gecmis [--dogrula]"); process.exit(1); }
  if (!slugGecerli(slug)) { console.error("Gecersiz slug: " + slug); process.exit(1); }

  const dosya = videoYolu(slug);
  if (!dosya) { console.error("Yuklenecek MP4 yok: uretim/" + slug + "/Videos/"); process.exit(1); }
  const boyut = fs.statSync(dosya).size;

  console.log("Dosya    : " + path.relative(KOK, dosya) + "  (" + (boyut / 1e6).toFixed(1) + " MB)");
  console.log("Aciklama : " + aciklama(slug).split("\n")[0]);

  const varOlan = kayitBul(slug);
  if (varOlan && varOlan.publishId) {
    console.log("✓ Bu video TikTok'a zaten gonderilmis (" + varOlan.tarih.slice(0, 10) + ") — tekrar GONDERILMEDI.");
    return;
  }
  if (boyut > TT.TEK_PARCA_SINIR) { console.error("Video 128 MB sinirini asiyor."); process.exit(1); }

  if (kuru) {
    console.log("\n[--dogrula] KURU CALISMA. Hicbir sey gonderilmedi.");
    console.log("Kimlik bilgileri: " + (TT.kimlikVar() ? "hazir" : "EKSIK (TT_CLIENT_KEY/TT_CLIENT_SECRET/TT_REFRESH_TOKEN)"));
    return;
  }
  if (!TT.kimlikVar()) { console.log("TikTok kimligi yok — gonderim atlandi (bkz. docs/TIKTOK.md)."); return; }

  const tok = await TT.token();
  if (!/video\.upload/.test(tok.kapsam) && tok.kapsam) throw new Error("TikTok yetkisinde video.upload kapsami yok — node tiktok-yetki.js");
  console.log("Gonderiliyor (" + (boyut / 1e6).toFixed(1) + " MB)...");
  const { publishId } = await TT.inboxYukle(tok.erisim, dosya);
  const d = await TT.durumBekle(tok.erisim, publishId);
  const basarili = d.status === "SEND_TO_USER_INBOX";
  console.log(basarili ? "\n✓ TikTok gelen kutusuna dustu. Uygulamadaki bildirime dokunup yayinla."
    : "\n⚠ TikTok durumu: " + (d.status || "?") + (d.fail_reason ? " (" + d.fail_reason + ")" : ""));

  kaydet({ slug, publishId, durum: d.status || "?", tarih: new Date().toISOString(), boyut,
    aciklama: aciklama(slug), hata: d.fail_reason || null });
  if (!basarili && d.status === "FAILED") process.exit(1);
}

// YouTube'da yayinda olup TikTok'a hic gonderilmemis videolar, eskiden yeniye.
// TikTok sonradan baslatildigi icin arada fark olusur; gunluk is bunu birer birer kapatir.
function gecmisKuyrugu() {
  const K = require("./lib/kutuphane");
  const gonderilmis = new Set(kayitlar().map((x) => x.slug));
  return K.yayinlananlar()
    .filter((y) => y.slug && !gonderilmis.has(y.slug) && K.konuOku(y.slug))
    .sort((a, b) => String(a.publishAt || a.tarih).localeCompare(String(b.publishAt || b.tarih)));
}

module.exports = { aciklama, kayitBul, videoYolu, gecmisKuyrugu };

if (require.main === module) main().catch((e) => { console.error("Hata: " + e.message); process.exit(1); });
