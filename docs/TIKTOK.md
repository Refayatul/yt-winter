# TikTok — kurulum ve işleyiş

Aynı videolar, aynı otomasyon. YouTube yayını bundan **hiç etkilenmez**: TikTok kimlik
bilgileri yoksa adım sessizce atlanır, TikTok tarafında bir hata olursa gün bozulmaz.

## Neden "gelen kutusu" yolu

TikTok'un Content Posting API'sinde iki yol var:

| Yol | Kapsam | Denetim | Sonuç |
|---|---|---|---|
| **Gelen kutusu** (kullanılan) | `video.upload` | gerekmez | Video TikTok uygulamana düşer, bildirime dokunup yayınlarsın. Gönderi **herkese açık** olabilir. |
| Doğrudan gönderi | `video.publish` | TikTok denetimi gerekir | Denetimden geçene kadar gönderiler **yalnızca gizli** olabilir — yani kimse göremez. |

Bu yüzden gelen kutusu yolu seçildi: günde bir dokunuş, ama gerçek erişim. TikTok
uygulamayı denetleyip onaylarsa doğrudan gönderiye geçilebilir (kod hazır, tek satır
değişir).

## Senin yapman gerekenler (bir kerelik)

Hesap açmayı ve şartları kabul etmeyi ben yapamam — bu adımlar sende.

1. **TikTok hesabı aç** (telefondan, `tiktok.com`). Kullanıcı adı olarak kanal adıyla
   uyumlu bir şey seç, örn. `failurereconstructed`. Profil fotoğrafı ve açıklamayı
   YouTube kanalıyla aynı yap.
2. **developers.tiktok.com** → **Sign up**. Burası TikTok uygulama hesabından
   **tamamen ayrı** bir hesaptır: sadece bir e‑posta adresi ister, e‑postaya PIN
   gönderir. TikTok hesabına e‑posta eklemene gerek yok; telefonla açılmış hesap
   olduğu gibi kalır. Videonun hangi hesaba gideceği 4. adımda (`tiktok-yetki.js`
   çalışırken tarayıcıda "izin ver" dediğin hesapla) belirlenir.
3. Portalda **Manage apps** → **Connect an app**. Uygulama adı:
   `Failure Reconstructed uploader`.
4. Uygulamada **Content Posting API** ürününü ekle ve **Upload to inbox** (scope
   `video.upload`) iznini seç. *Direct Post'u işaretleme.*
5. TikTok **Login Kit**'i de otomatik ekler (OAuth izni için gerekli). Doldurulması
   zorunlu alanlar şunlarla doldurulur:

   | Alan | Değer |
   |---|---|
   | Terms of Service URL | `https://github.com/eyazan/youtube-otomasyon/blob/main/docs/TERMS.md` |
   | Privacy Policy URL | `https://github.com/eyazan/youtube-otomasyon/blob/main/docs/PRIVACY.md` |
   | Website / App URL | `https://github.com/eyazan/youtube-otomasyon` |
   | Platform | Web (Desktop/Mobile app değil) |
   | Category | Tools / Productivity (ya da en yakını) |

   Ayrıca *Content Posting API* kartında **Direct Post kapalı** kalmalı ve
   *Verify domains* adımı **atlanır** — o yalnızca `pull_by_url` içindir, biz dosyayı
   doğrudan gönderiyoruz (`push_by_file`).

6. **Redirect URI** olarak sahibi olduğun bir HTTPS adresi gir. TikTok `http://localhost`
   kabul etmez. Elinde bir şey yoksa şunu kullan:
   `https://eyazan.github.io/youtube-otomasyon/`
   Sayfanın var olması gerekmiyor; 404 verse de olur, tarayıcının adres çubuğu yeterli.
7. Uygulamadan **Client key** ve **Client secret** değerlerini al.

## Sonra (bunu birlikte yaparız)

`.env` dosyasına üç satır ekle:

```
TT_CLIENT_KEY=...
TT_CLIENT_SECRET=...
TT_REDIRECT=https://eyazan.github.io/youtube-otomasyon/
```

Sonra bir kez çalıştır:

```bash
node tiktok-yetki.js
```

Tarayıcıda izin verirsin, dönen adresi yapıştırırsın, `TT_REFRESH_TOKEN` `.env`'e yazılır.
Bu jeton **365 gün** geçerli (YouTube'un 7 günlük jetonunun aksine).

Son olarak GitHub → Settings → Secrets and variables → Actions altına üç secret ekle:
`TT_CLIENT_KEY`, `TT_CLIENT_SECRET`, `TT_REFRESH_TOKEN`. Ve `config/yetki.json`
değişikliğini commit et (sağlık kontrolü bu tarihi okuyup süre bitmeden uyarır).

## Günlük işleyiş

1. Günlük üretim videoyu yapar ve YouTube'a yükler (21:00'de otomatik yayın).
2. Hemen ardından `tiktok-yukle.js` aynı MP4'ü TikTok gelen kutusuna gönderir.
3. Telefonundaki TikTok bildirimine dokunur, açıklamayı görür, **Post**'a basarsın.
4. Aynı video ikinci kez gönderilmez (`icerik/tiktok.json` kaydı).

Sağlık kontrolü TikTok'u da izler; jeton bozulursa ya da bitmesine 30 gün kalırsa
GitHub bildirimi gelir. TikTok sorunu YouTube yayınını **durdurmaz**.

## Bilmen gerekenler

- **TikTok açıklaması YouTube'unkinden farklı:** kısa, bağlantısız, en fazla 4 etiket.
  Her gönderide "Narration uses a synthetic voice" ibaresi var.
- **Yapay zekâ etiketi:** yayınlarken TikTok uygulamasındaki "AI-generated content"
  anahtarını **aç**. Seslendirme sentetik; bunu gizlemiyoruz.
- **TikTok'tan doğrudan gelir beklemeyelim:** Creator Rewards programı 1 dakikadan uzun
  videolar istiyor; bizimkiler ~28 saniye. TikTok'un faydası kitle ve takipçi.
- **Video boyutu:** tek parça gönderim sınırı 128 MB. Bizim videolar 10–40 MB.
