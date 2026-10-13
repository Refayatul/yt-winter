// YOUTUBE PLAYLIST — videoyu dogru seriye (playlist) ekler; liste yoksa olusturur.
//
// Seriler binge izlemeyi artirir (oturum suresi = algoritma odulu) ve kanal
// sayfasini duzenli gosterir. force-ssl izni gerekir.
//
// Modul:  const pl = require("./youtube-playlist"); await pl.ekle(token, videoId, listeAdi)
// CLI:    node youtube-playlist.js <video-id> "<liste adi>"
//         node youtube-playlist.js --hepsi     # kanaldaki tum videolari serilere dagit

const fs = require("fs");
const path = require("path");
const https = require("https");
const Channel = require("./core/channel-context");
const SELECTED = Channel.selectFromArgv(process.argv.slice(2));
const CHANNEL = SELECTED.channel;

const KOK = __dirname;

// Konu turune gore varsayilan seri
const SERILER = {
  arsiv: { ad: "Disasters Caught on Film",
    aciklama: "Real archival footage of history's greatest disasters and engineering failures - reconstructed in under a minute." },
  stok: { ad: "The Science of Failure",
    aciklama: "How bridges, buildings, planes and ships actually fail - the physics and engineering behind disaster." },
  everyday: { ad: "Everyday Things, Unexpected Reasons",
    aciklama: "The hidden logic behind things you see, use and experience every day." },
};
function seriAdi(konu) {
  if (konu && konu.playlist) return konu.playlist;
  if (CHANNEL.slug === "critical-thread") return "Systems Holding the World Together";
  if (CHANNEL.slug === "impossible-brief") return "Impossible Questions, Scientific Answers";
  if (CHANNEL.slug === "behind-the-ordinary") return SERILER.everyday.ad;
  return (konu && konu.tur === "stok") ? SERILER.stok.ad : SERILER.arsiv.ad;
}

function istek(opt, govde) {
  return new Promise((coz, red) => {
    const r = https.request(opt, (res) => { const p = []; res.on("data", d => p.push(d));
      res.on("end", () => coz({ durum: res.statusCode, govde: Buffer.concat(p).toString("utf8") })); });
    r.on("error", red); if (govde) r.write(govde); r.end();
  });
}
async function token() {
  return (await require("./lib/yt").getYouTubeClient(CHANNEL)).accessToken;
}
const get = (tok, yol) => istek({ hostname: "www.googleapis.com", path: "/youtube/v3/" + yol,
  headers: { Authorization: "Bearer " + tok } }).then(r => JSON.parse(r.govde));
async function post(tok, yol, obj) {
  const body = JSON.stringify(obj);
  const r = await istek({ hostname: "www.googleapis.com", path: "/youtube/v3/" + yol, method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body);
  if (r.durum !== 200) throw new Error(yol.split("?")[0] + " HTTP " + r.durum + ": " + r.govde.slice(0, 200));
  return JSON.parse(r.govde);
}

// Playlist kimlikleri kaydi (ic baglanti / aciklama linkleri icin)
const PL_KAYIT = path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "playlistler.json" : "playlists.json");
function kaydet(ad, id) {
  let k = {}; try { k = JSON.parse(fs.readFileSync(PL_KAYIT, "utf8")); } catch (e) {}
  if (k[ad] === id) return;
  k[ad] = id; fs.mkdirSync(path.dirname(PL_KAYIT), { recursive: true }); fs.writeFileSync(PL_KAYIT, JSON.stringify(k, null, 2) + "\n");
}

// Adi verilen listeyi bul; yoksa herkese acik olarak olustur.
async function listeBulYaDaOlustur(tok, ad) {
  const d = await get(tok, "playlists?part=snippet&mine=true&maxResults=50");
  const var_ = (d.items || []).find(p => p.snippet.title === ad);
  if (var_) { kaydet(ad, var_.id); return var_.id; }
  const kume = Object.values(require("./lib/kutuphane").KUMELER).find(k => k.ad === ad);
  const bilgi = Object.values(SERILER).find(s => s.ad === ad) || (kume && { aciklama: kume.aciklama + " A Failure Reconstructed series." });
  const yeni = await post(tok, "playlists?part=snippet,status", {
    snippet: { title: ad, description: bilgi ? bilgi.aciklama : "" },
    status: { privacyStatus: "public" },
  });
  console.log("  + yeni seri olusturuldu: " + ad);
  kaydet(ad, yeni.id);
  return yeni.id;
}

// playlistItems.insert right after an upload can fail with HTTP 409 "SERVICE_UNAVAILABLE" (or a 5xx)
// while YouTube is still processing the new video (seen 2026-10-13 on Failure Reconstructed). Those
// are retried a bounded number of times; any other error (quota, auth, 404) is not.
function geciciHata(error) {
  const m = /HTTP (\d{3})/.exec(String(error && error.message || ""));
  const status = m ? Number(m[1]) : 0;
  return (status === 409 && /SERVICE_UNAVAILABLE/.test(error.message)) || status >= 500;
}
async function geciciTekrar(fn, { delays = [10000, 30000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 0; ; i += 1) {
    try { return await fn(); } catch (error) {
      if (i >= delays.length || !geciciHata(error)) throw error;
      console.log(`  (seri: gecici YouTube hatasi, ${delays[i] / 1000} sn sonra tekrar: ${error.message.slice(0, 120)})`);
      await sleep(delays[i]);
    }
  }
}

async function ekle(tok, videoId, ad) {
  const listeId = await listeBulYaDaOlustur(tok, ad);
  // Each attempt re-reads the playlist first, so a retried insert never adds the video twice.
  const eklendi = await geciciTekrar(async () => {
    const mevcut = await get(tok, "playlistItems?part=contentDetails&maxResults=50&playlistId=" + listeId);
    if ((mevcut.items || []).some(i => i.contentDetails.videoId === videoId)) return false;
    await post(tok, "playlistItems?part=snippet", {
      snippet: { playlistId: listeId, resourceId: { kind: "youtube#video", videoId } },
    });
    return true;
  });
  if (!eklendi) { console.log("  = zaten serinin icinde: " + ad); return; }
  console.log("  ✓ seriye eklendi: " + ad);
}

// Kume (konu ailesi) playlist'i: yalnizca kumede yeterli yayinlanmis video varsa
// (config clusters.minVideosForPlaylist) — tek videolu bos listeler acilmaz.
// Esik ilk asildiginda kumenin onceki videolari da listeye eklenir.
async function kumeyeEkle(tok, videoId, konu) {
  if (CHANNEL.config.pathMode !== "legacy-adapter") {
    const category = konu && (konu.category || konu.cluster);
    if (category) await ekle(tok, videoId, `${CHANNEL.name}: ${category}`);
    return;
  }
  const K = require("./lib/kutuphane");
  const min = require("./lib/ayar").ayar().clusters.minVideosForPlaylist;
  const kumeId = K.kumeBul(konu);
  const ad = K.KUMELER[kumeId].ad;
  const ayni = K.yayinlananlar().filter(y => y.slug && (K.konuOku(y.slug) ? K.kumeBul(K.konuOku(y.slug)) === kumeId : false));
  if (ayni.length < min) { console.log(`  · kume "${ad}": ${ayni.length}/${min} video — playlist henuz acilmiyor`); return; }
  for (const y of ayni) await ekle(tok, y.videoId, ad);
}

module.exports = { ekle, kumeyeEkle, seriAdi, token, SERILER, geciciHata, geciciTekrar };

// --- CLI ---
if (require.main === module) {
  (async () => {
    const tok = await token();
    const argv = SELECTED.argv;
    if (argv[0] === "--hepsi") {
      if (CHANNEL.config.pathMode !== "legacy-adapter") throw new Error("--hepsi is only supported by the legacy Failure Reconstructed topic layout");
      // Kanaldaki videolari basliga gore konu dosyasiyla eslestirip serilere dagit.
      const konular = fs.readdirSync(path.join(KOK, "icerik", "konular"))
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(KOK, "icerik", "konular", f), "utf8")));
      const ch = await get(tok, "channels?part=contentDetails&mine=true");
      const up = ch.items[0].contentDetails.relatedPlaylists.uploads;
      const vids = await get(tok, "playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=" + up);
      for (const v of vids.items || []) {
        const baslik = v.snippet.title;
        const k = konular.find(x => x.baslik === baslik) || null;
        console.log(`- ${baslik.slice(0, 50)}`);
        await ekle(tok, v.contentDetails.videoId, seriAdi(k));
      }
    } else {
      const [vid, ad] = argv;
      if (!vid || !ad) { console.error('Kullanim: node youtube-playlist.js <video-id> "<liste adi>"  |  --hepsi'); process.exit(1); }
      await ekle(tok, vid, ad);
    }
  })().catch(e => { console.error("Hata: " + e.message); process.exit(1); });
}
