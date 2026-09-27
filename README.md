# Otomasyon Paneli — konudan bitmiş videoya

## Multi-channel YouTube Growth OS

Tek kod tabanı iki bağımsız kanalı çalıştırır:

- **Failure Reconstructed** — mevcut davranış ve eski `icerik/`, `analytics/`, `channel/` yolları geriye uyumlu adaptörle korunur.
- **ImpossibleBrief** — what-if science, space, physics, Earth, humanity and future technology; tüm konu, durum, bellek, analiz ve kimlik bilgileri `channels/impossible-brief/` altında izole edilir.

Her büyük komut `--channel` kabul eder. Bayrak verilmezse güvenli geriye uyumluluk için `failure-reconstructed` seçilir.

```bash
node shorts-sira.js --channel impossible-brief --no-render
node library-health.js --channel impossible-brief
node post-publish-analyzer.js --channel impossible-brief --due
node channel-plan.js --channel impossible-brief
node portfolio-scheduler.js
node portfolio-dashboard.js
node e2e-impossible-brief.js --render       # yerel kuru çalışma; upload yok
node simulate-portfolio.js                  # 30 gün + enjekte hatalar
```

YouTube sırları kanal bazında `FR_YT_*` ve `IB_YT_*` adlarıyla tutulur. Her yüklemeden önce OAuth ile doğrulanan kanal kimliği, `FR_YT_CHANNEL_ID` veya `IB_YT_CHANNEL_ID` ile birebir karşılaştırılır; eksik ya da farklıysa yükleme başlamadan bloklanır. Ayrıntılar: [multi-channel architecture](docs/MULTI-CHANNEL-ARCHITECTURE.md), [ImpossibleBrief](docs/IMPOSSIBLE-BRIEF.md), [adding a channel](docs/ADDING-NEW-CHANNEL.md).

## Failure Reconstructed — Forensic Engineering Documentaries

Bu depo artık **veriye dayalı bir adli mühendislik belgeseli üretim ve büyüme sistemi**. Yapay zekâ yalnızca bir üretim aracı; neyin yayınlanacağına kalite ve editoryal değer karar verir.

| Ne | Nasıl | Belge |
|---|---|---|
| Günlük Shorts (otomatik, GitHub Actions) | `shorts-sira.js` → takvim → ön kalite kapısı → arşiv/stok → `shorts-yap.js` → final kapı → private yükleme | [docs/GROWTH-ARCHITECTURE.md](docs/GROWTH-ARCHITECTURE.md) |
| Uzun belgesel (5 günde bir) | `python -m shortslab run <iş>` → senaryo brifi → kanıt öncelikli görseller + mühendislik diyagramları → `video-yap.js` | aynı |
| Paketleme | başlık · kapak · hook · tempo · hikâye yapısı · açıklama · sabit yorum · telaffuz | `icerik/paket/<slug>/` |
| Kalite | `quality-gate.js`: 9 bileşen, PUBLISH ≥85 / REVIEW 70–84 / BLOCK <70 · `originality-check.js` | [config/growth.json](config/growth.json) |
| Mevcut videolar | `node existing-video-optimizer.js --all` → `analysis/<id>/` + `migration/` | [migration/EXISTING-VIDEOS-PLAN.md](migration/EXISTING-VIDEOS-PLAN.md) |
| Yayın sonrası | `post-publish-analyzer.js --due` (24 s/72 s/7 g/14 g/30 g) · panel → **📈 Büyüme** · `experiments.js` | [docs/GROWTH-ARCHITECTURE.md](docs/GROWTH-ARCHITECTURE.md) |
| Konu seçimi | `node konu-puan.js "<konu>"` / `--adaylar` (11 ölçüt, ücretsiz sinyaller) | [icerik/aday-konular-puan.md](icerik/aday-konular-puan.md) |
| Kurallar | sahte etkileşim yok, yanıltıcı başlık/kapak yok, kopya yükleme yok, sentetik içerik beyan edilir | [docs/YOUTUBE-CONTENT-QUALITY.md](docs/YOUTUBE-CONTENT-QUALITY.md) |

Denetim bulguları: [docs/CHANNEL-AUDIT.md](docs/CHANNEL-AUDIT.md) · Değişiklik raporu: [docs/IMPLEMENTATION-REPORT.md](docs/IMPLEMENTATION-REPORT.md) · Marka: [channel/BRAND.md](channel/BRAND.md)

Sık kullanılan komutlar:

```bash
npm test                                   # JS + Python testleri
node quality-gate.js <slug> [--final]      # kalite kapısı raporu
node title-engine.js <slug>                # 10+ başlık adayı ve puanları
node existing-video-optimizer.js --all     # kanal videoları için optimizasyon raporları
node youtube-guncelle.js <id> <slug> --dogrula   # açıklama güncellemesinin kuru çalıştırması
node yayin-plani.js                        # yayın takvimi durumu
```

Sırlar yalnızca `.env` ve GitHub Secrets'ta durur, depoya girmez. YouTube Analytics verisi için `node youtube-yetki.js` ile yeniden yetki gerekir (`yt-analytics.readonly`).

---

> **ShortsLab gelistirmesi:** Veriyle niche secimi ve deney katmaninin ilk
> surumu [`shortslab/README.md`](shortslab/README.md) altindadir.

Bir konu yaz, başlık yaz, **ÜRET**'e bas. Senaryoyu yazar, görselleri bulur, seslendirir, videoyu kurar. Bitmiş MP4 çıkar.

Kurgu programı yok. Abonelik yok. Her şey kendi bilgisayarında çalışır.

```
konu + başlık
   ↓
senaryo yazımı      → vidIQ
görsel bulma        → Pexels · Pixabay · Wikimedia · Openverse · NASA
seslendirme         → Microsoft Edge nöral sesler (ücretsiz)
video kurulumu      → ffmpeg
   ↓
bitmiş MP4 + altyazı
```

---

## Ne yapabilir

- **Herhangi bir konu.** Spor, reklam, tarih, bilim, tanıtım — fark etmez. Görsel arama kelimelerini senaryodan kendisi çıkarır.
- **Dört format:** YouTube uzun video (16:9, en az 15 dk) · YouTube Shorts (9:16, max 45 sn) · **Instagram Reels** (9:16, varsayılan 3 dk) · **TikTok** (9:16, varsayılan 60 sn). Süre sınırları otomatik uygulanır; Reels ve TikTok'ta abone-ol kapanışı çıkarılır.
- **Gömülü altyazı.** Seslendirmeyle aynı dilde otomatik üretilir. Farklı dilde altyazı istersen `Voice/ALTYAZI-TR.txt` gibi bir dosya koyman yeterli.
- **Prosedürel intro/outro.** Marka animasyonu, sinematik geri sayım, abone ol kapanışı — hepsi ffmpeg ile üretilir, hazır dosya gerekmez.
- **33 geçiş tipi, 5 hareket efekti, 6 renk tonu.** Panelden seçilir.
- **Türkçe seslendirme.** `konu.json`'a `"ses": "tr-TR-AhmetNeural"` yazınca hem seslendirme hem altyazı Türkçe olur. Konuşma hızı otomatik ayarlanır (Türkçe 113, İngilizce 151 kelime/dk).
- **GPU hızlandırma.** Açılışta NVIDIA/AMD donanım kodlayıcısını dener; varsa kullanır, yoksa sessizce CPU'ya döner. Ayar gerekmez.
- **Bilgisayarı kilitlemez.** Render düşük öncelikte çalışır; tarayıcı, mesajlaşma uygulaması normal açılır.

## Kurulum

**Windows:** depoyu indir, **PANEL.bat** dosyasina cift tikla. Hepsi bu.

Eksik olan her seyi kendisi kurar: Node.js, ffmpeg, bagimliliklar ve ayar
dosyasi. Sonra paneli acar. (Windows 10 1809+ / Windows 11 gerekir — winget
oradan itibaren hazir geliyor.)

```bash
git clone https://github.com/efecim1snn/youtube-otomasyon.git
```

**Mac / Linux:**

```bash
git clone https://github.com/efecim1snn/youtube-otomasyon.git
cd youtube-otomasyon
npm install
node panel.js
```

ffmpeg gerekiyor: `brew install ffmpeg` veya `sudo apt install ffmpeg`

### Anahtarlar

Hicbiri zorunlu degil, panel anahtarsiz da acilir.

| | |
|---|---|
| **vidIQ** | senaryo yazimi + baslik puanlama — [app.vidiq.com/account/settings/mcp](https://app.vidiq.com/account/settings/mcp) |
| **Anthropic** | senaryo yazimi (daha iyi kalite, ~10 sent/senaryo) |
| **Pexels / Pixabay** | gorsel kalitesini belirgin artirir, ikisi de ucretsiz |

Gorsel uretimi icin anahtar gerekmiyor (Pollinations varsayilan).
Seslendirme icin de gerekmiyor (Microsoft nöral sesler, ucretsiz).

Panelin **Kaynaklar** sekmesinden girilebilir; `.env` dosyasini elle
duzenlemek de olur.

## Çalıştırma

Windows'ta `PANEL.bat` dosyasına çift tıkla. Ya da:

```bash
node panel.js
```

Tarayıcıda `http://localhost:4173` açılır.

## Tek tek kullanım

Panel istemiyorsan her adım ayrı çalışır:

```bash
node senaryo-yaz.js <is-adi>     # konudan senaryo
node gorsel-bul.js  <is-adi>     # senaryodan görseller
node seslendir.js   <is-adi>     # seslendirme + altyazı zamanlaması
node video-yap.js   <is-adi>     # kurgu ve render
```

İşler `uretim/<is-adi>/` altında durur. Ayarlar o klasördeki `konu.json` dosyasında.

## Karşılaştırma Shorts'u (VS formatı)

Belgesel akışından farklı, ikinci bir video tipi: ekran ortadan ikiye bölünür, iki
konu yarışır, arada şimşek ayraç, altta animasyonlu ölçü barları ve dövüş müziği.
YouTube Shorts ve Instagram Reels için 9:16.

```bash
node vs-kur.js                   # örnek eşleşmeleri kurar + görselleri indirir
node vs-yap.js <is-adi>          # 9:16 VS videosunu render eder
node vs-gorsel-duzelt.js         # yanlış tür gelen görselleri değiştirir
```

Eşleşmeler `vs-kur.js` içindeki `ISLER` dizisinde tanımlı; yeni bir tane eklemek
için bir satır yazmak yeterli. Her ölçü için `ustDeger`/`altDeger` sayısal,
`ustMetin`/`altMetin` ekranda görünen metin, `kazanan` o turu kim alıyor.

Bar uzunluğu 0.35 kuvvetiyle ölçeklenir — doğrusal olsaydı 11 cm ile 5.59 m yan
yana çizilince kısa bar görünmez olurdu, logaritmik olsaydı aradaki fark yok gibi
dururdu.

**Görsel uyarısı:** stok siteleri bazen yanlış tür döndürüyor (bal porsuğu yerine
bronz heykel, kutup ayısı yerine müze maketi). `vs-gorsel-duzelt.js` aday metnini
eleyip Wikimedia'nın tür sayfalarından çekiyor.

## Kanal markası

```bash
node marka-yap.js "KANAL ADI" "SLOGAN" [cikis-klasoru]
```

Profil resmi (1024x1024, daireye kırpılınca doğru duracak şekilde) ve banner
(2560x1440, yazılar 1546x423 güvenli alanın içinde) üretir. Kanalın kendi
görsellerini kullanır, videolardaki şimşek ve VS rozetiyle aynı dili taşır.

Yanında çıkan `_banner-guvenli-alan-kontrol.png` yüklenmez — telefon/tablet
sınırlarını gösteren kontrol kopyasıdır.

## Nasıl çalışıyor

**Senaryo.** vidIQ'nun senaryo üretecine konu, başlık ve hedef süre gider. Dönen markdown temizlenip düz paragraflara indirilir. vidIQ istenen süreden ~1.55 kat uzun yazdığı için hedef süre bu katsayıya bölünerek istenir.

**Görseller.** Her paragraf bir sahne olur. Paragrafın özel isimleri (kişi, takım, yer) ve en ayırt edici kelimeleri arama terimi olarak kullanılır; hiçbiri sonuç vermezse senaryonun genel konusuna düşülür. Böylece hiçbir sahne boş kalmaz. Görsel sayısı konuşma süresinden hesaplanır (~8 saniyeye bir görsel).

**Seslendirme.** `msedge-tts` ile Microsoft'un nöral sesleri kullanılır — ücretsiz, anahtar istemez. Altyazı zamanlaması, her paragrafın gerçek ses süresinden karakter sayısına göre dağıtılarak çıkarılır.

**Render.** Bellek taşmasını önlemek için üç aşamalı: klipler → sekizli gruplar → final. Ken Burns zoom, xfade geçişler, gömülü altyazı, sentezlenmiş fon müziği.

## AI görsel üretimi

Stok fotoğrafın bulamadığı soyut sahneler için. `konu.json`'da bir sahne
kelimesini `uret:` ile başlatman yeterli — zincir onu otomatik üretir, kalan
sahneler stok fotoğraftan gelmeye devam eder.

```json
"uretStil": "cinematic, dark background, volumetric light, high detail",
"uretAdet": 2,
"sahneKelimeleri": [
  ["polar bear arctic"],                                    // stok fotoğraf
  ["uret: a lattice of glowing light suspended in darkness"] // AI üretimi
]
```

Ayrı da çalışır:

```bash
node gorsel-uret.js <is-adi>            # "uret:" ile işaretli sahneler
node gorsel-uret.js <is-adi> --hepsi    # tüm sahneler
node gorsel-uret.js --istem "..." --cikti out.jpg
```

**Servisler** — sırayla denenir, ilk çalışan kullanılır:

| servis | anahtar | not |
|---|---|---|
| **Pollinations** | **gerekmez** | varsayılan, ~1 sn |
| Cloudflare Workers AI | `CF_ACCOUNT_ID` + `CF_API_TOKEN` | FLUX, ücretsiz kademe |
| Together | `TOGETHER_KEY` | FLUX.1 schnell, ücretsiz kademe |
| Hugging Face | `HF_TOKEN` | ücretsiz, yavaş olabilir |

Hiç anahtar girmezsen de çalışır.

**Ne zaman üretme:** gerçek bir şey anlatıyorsan — bir hayvan, bir bilim insanı,
bir bina, bir olay — stok fotoğraf kullan. Üretilmiş görsel orada yalan söyler.
Üretim soyut kavramlar için: "kuantum dolanıklığı", "sinir ağı", "hiçliğin
içinden çıkan yapı".

## Trend arama — YouTube + Instagram + TikTok

Panelde **Trendler** sekmesi. Ya da:

```bash
node trend-ara.js "animal comparison"        # ucu birden
node trend-ara.js "konu" --dil tr            # Turkce icerik
node trend-ara.js "konu" --platform yt       # sadece YouTube (yt | ig | tt)
node trend-ara.js "konu" --siki              # YouTube basliginda tum kelimeler gecsin
node trend-ara.js                            # konu vermeden genel trend
```

Rapor `trend/<tarih>-<konu>.md` olarak yazilir.

**Iki farkli sey olculuyor, o yuzden iki ayri bolum var:**

- **YouTube — hiz.** Saatlik izlenme. Su an ne buyuyor. Toplam izlenme esigi
  koymak yanlis olur: taze bir video saatte 3000 izlenme aliyor olsa da henuz
  500 bine ulasmamis olur ve esige takilir.
- **Instagram / TikTok — asiri performans.** Videonun, o hesabin kendi
  ortalamasini kac kat astigi. Buyuk hesap olmak gerekmiyor; kalibi tutan
  kucuk hesap da listeye giriyor.

Instagram/TikTok bolumu her video icin **ilk uc saniyeyi** ayirir:
`hook_0_3s` alani ekranda ne oldugunu, ne yazdigini ve ne duyuldugunu
soyler. Yaninda `format`, `effort` (ne kadar emek) ve `audio_mix` durur.
Kalip orada; bir sey bir saatlik emekle milyonlar aliyorsa o formati kendi
konunla tekrarlamak en hizli yol.

Ayni kalibi iki farkli hesapta gorduysen o bir trend. Bir kere gorduysen
tesadüf olabilir.

## Viral Shorts analizi

```bash
node viral-analiz.js                      # bu hafta, 10M+ izlenen Shorts
node viral-analiz.js "animal comparison"  # konuya göre
node viral-analiz.js "" tr 1000000        # Türkçe başlıklar, 1M+ eşik
```

O hafta patlayan Shorts'ları bulur ve **neden** patladıklarını çıkarır: ortanca
süre, abone sayısının gerçekte ne kadar etkilediği, etkileşim oranı, ve aynı
sesi/formatı kullanan kanal kümeleri. Rapor `viral-analiz/<tarih>.md` olarak yazılır.

Son çalıştırmadan çıkan örnek bulgu: ilk 20'nin 7'si **aynı sesin** farklı
kanallardaki versiyonuydu — 12 bin aboneli bir kanal 44 milyon izlenme aldı.
Shorts'ta abone sayısı neredeyse önemsiz; trend penceresini yakalamak her şey.

Amaç kalıbı görmek — hangi süre, hangi format, ilk iki saniyede ne oluyor — ve o
kalıpla kendi videonu yapmak. Araç video indirmez; indirmek için `video-indirici/` var.

## Video İndirici

Ayrı bir mini panel: link yapıştır → indir. Reklamlı indirme sitelerine son.

```bash
cd video-indirici
BASLAT.bat        # → http://localhost:4190
```

- YouTube, TikTok, X, Instagram, Facebook, Reddit — tek kutu
- Kalite seçimi (4K/1440p/1080p/720p/480p) + MP3 çıkarma, oynatma listesi desteği
- **Keşfet** sekmesi: haftanın viral videoları (YouTube Shorts + TikTok + Reels,
  30M+ filtreli) ve canlı YouTube araması — karttan tek tıkla indirme.
  `VIDIQ_KEY` girildiyse "vidIQ'dan tazele" ile liste canlı güncellenir.
- npm install gerekmez; motor `yt-dlp` (`pip install -U --pre yt-dlp`) + ffmpeg

Detay: [video-indirici/README.md](video-indirici/README.md)

## Lisans

MIT. İstediğin gibi kullan.
