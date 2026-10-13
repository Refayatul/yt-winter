// SHORTS SIRA — otomatik Shorts orkestratoru.
//
// icerik/konular/<slug>.json altindaki onayli konulari sirayla uretir:
//   konu spec -> uretim/<slug>/konu.json -> arsiv-bul (goruntu) ->
//   shorts-yap (render) -> (istege bagli) youtube-yukle (private).
//
// Kalite once gelir (quality-gate.js):
//   pre-gate  (render oncesi: baslik/hook/senaryo/ozgunluk/muhendislik/kaynak)
//   final-gate (render sonrasi: ses yuksekligi, cozunurluk, sure, kaynak kaydi)
//   BLOCK -> render/yukleme YOK, konu icerik/engellenen.json'a yazilir (spec
//            degisince otomatik yeniden denenir), sonraki konuya gecilir.
//   REVIEW -> yuklenmez; ayni spec tekrar pahali bicimde uretilmez ve siradaki
//             konu denenir. Rapor icerik/paket/<slug>/quality-gate.md'dedir.
// Takvim (yayin-plani.js): gunluk modda slot dolmamissa hicbir sey uretilmez.
//
// Uretilenler icerik/uretilenler.json'a yazilir; sonraki calisma sonrakini alir.
// Hicbir sey elle yapilmaz. Tek istisna: YouTube'a yukleme kimlik bilgileri
// (bir kerelik OAuth) ve PUBLISH=1 varsa yukler; yoksa sadece uretir.
//
// Kullanim:
//   node shorts-sira.js              # sonraki uretilmemis konuyu uret
//   node shorts-sira.js <slug>       # belirli konuyu uret
//   node shorts-sira.js --hepsi      # tum uretilmemis konulari uret

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const Channel = require("./core/channel-context");
const SELECTED = Channel.selectFromArgv(process.argv.slice(2));
const CHANNEL = SELECTED.channel;

const KOK = __dirname;
const KONULAR = CHANNEL.paths.topics;
const DURUM = path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "uretilenler.json" : "generated.json");
const BASARISIZ = path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "basarisiz.json" : "failed.json");
const ENGELLENEN = path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "engellenen.json" : "blocked.json");
const INCELEME = path.join(CHANNEL.paths.state, CHANNEL.config.pathMode === "legacy-adapter" ? "inceleme.json" : "review.json");
const crypto = require("crypto");

function slugGecerli(s) { return /^[a-z0-9][a-z0-9-]{0,79}$/.test(s); }

const oku = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return []; } };
const yaz = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const uretilenler = () => oku(DURUM);
const basarisizlar = () => oku(BASARISIZ);
function isaretle(slug) { const u = uretilenler(); if (!u.includes(slug)) { u.push(slug); yaz(DURUM, u); } }
function basarisizIsaretle(slug) { const b = basarisizlar(); if (!b.includes(slug)) { b.push(slug); yaz(BASARISIZ, b); } }
// Engellenen: { slug: { hash, neden, tarih } } — spec degisirse (hash farkli) tekrar denenir
const specHash = (slug) => crypto.createHash("sha1").update(fs.readFileSync(path.join(KONULAR, slug + ".json"))).digest("hex").slice(0, 12);
const engellenenler = () => { try { return JSON.parse(fs.readFileSync(ENGELLENEN, "utf8")); } catch (e) { return {}; } };
function engelle(slug, neden) { const e = engellenenler(); e[slug] = { hash: specHash(slug), neden, tarih: new Date().toISOString() }; yaz(ENGELLENEN, e); }
const engelliMi = (slug) => { const e = engellenenler()[slug]; return !!(e && e.hash === specHash(slug)); };
const incelemedekiler = () => { try { return JSON.parse(fs.readFileSync(INCELEME, "utf8")); } catch (e) { return {}; } };
function incelemeyeAl(slug, quality) {
  const items = incelemedekiler();
  items[slug] = { hash: specHash(slug), neden: `final gate ${quality.toplam}: human review required`, kalite: quality.toplam, tarih: new Date().toISOString() };
  yaz(INCELEME, items);
}
const incelemedeMi = (slug) => { const item = incelemedekiler()[slug]; return !!(item && item.hash === specHash(slug)); };

// Growth engine (core/growth): topic buckets, hooks, first 3 s, retention lint,
// factual/visual integrity and ProductionReadinessScore. It runs AFTER the
// existing quality gate and can only make a decision stricter, never looser.
// GROWTH_GATE_MODE=shadow logs growth decisions without enforcing them
// (emergency lever; default is enforce).
const Growth = require("./core/growth");
const GrowthRuntime = require("./core/growth/runtime");
const growthPlans = {};
const growthSelections = {};
function buyumeKapisi(slug, legacy, final) {
  let plan;
  try {
    plan = GrowthRuntime.planLegacy(CHANNEL, slug, final ? {
      stage: "final",
      externalGate: Growth.externalFromLegacyGate(legacy),
      render: renderBilgisi(slug),
      write: true,
      assignExperiment: true,
      selection: growthSelections[slug] || null,
    } : { write: true, assignExperiment: true, selection: growthSelections[slug] || null });
  } catch (e) {
    // A planning error is a bug, not a quality verdict: never let it silently pass.
    engelle(slug, "growth plan error: " + e.message);
    throw new Engellendi("growth plan error: " + e.message);
  }
  growthPlans[slug] = plan;
  // The legacy renderer and uploader consume this audited overlay. Source case
  // files stay unchanged; only this production run gets the winning hook/title.
  fs.mkdirSync(path.join(CHANNEL.paths.packages, slug), { recursive: true });
  fs.writeFileSync(path.join(CHANNEL.paths.packages, slug, "growth-plan.json"), JSON.stringify(plan, null, 2) + "\n");
  const r = plan.readiness;
  console.log(`  growth readiness (${final ? "final" : "pre"}): ${r.decision} ${r.ProductionReadinessScore}/100 · topic ${plan.topicScore.bucket} ${plan.topicScore.VideoPotentialScore} · hook ${plan.hooks.selected ? plan.hooks.selected.family + " " + plan.hooks.selected.adjustedTotal : "none"} · first-3s ${plan.first3Seconds.score}` + (r.hardFails.length ? " — " + r.hardFails.join("; ") : ""));
  if (Growth.gateMode() === "shadow") return plan;
  if (r.decision === "BLOCK") { engelle(slug, `growth ${final ? "final" : "pre"} ${r.ProductionReadinessScore}: ${r.hardFails.join("; ") || "below threshold"}`); throw new Engellendi("growth readiness BLOCK"); }
  if (r.decision === "REVIEW") {
    incelemeyeAl(slug, { toplam: r.ProductionReadinessScore });
    GrowthRuntime.alert(CHANNEL, "PRODUCTION_READINESS_REVIEW", slug, { score: r.ProductionReadinessScore, dimensions: r.dimensions });
    throw new IncelemeGerekli("growth readiness REVIEW; upload blocked");
  }
  return plan;
}
function renderBilgisi(slug) {
  try {
    const video = path.join(KOK, "uretim", slug, "Videos", slug + ".mp4");
    if (!fs.existsSync(video)) return { completed: false };
    const FP = require("./ff-yol").ffprobe;
    const j = JSON.parse(cp.execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", video]).toString());
    const vs = (j.streams || []).find((x) => x.codec_type === "video") || {};
    const d = (() => { try { return JSON.parse(fs.readFileSync(path.join(KOK, "uretim", slug, "Videos", "denetim.json"), "utf8")); } catch (e) { return null; } })();
    return { completed: true, width: vs.width, height: vs.height, durationSeconds: +(j.format || {}).duration, hasAudio: (j.streams || []).some((x) => x.codec_type === "audio"),
      syntheticVoice: true, captionsBurned: d ? d.captionBurned === true : undefined };
  } catch (e) { return { completed: false }; }
}

class Engellendi extends Error {}
class IncelemeGerekli extends Error {}
class YuklemeHatasi extends Error {}
// Altyapi (seslendirme servisi) hatasi: her konu ayni sekilde patlar. 2026-10-12'de Edge TTS 403
// yuzunden 28 nitelikli konu tek tek "basarisiz" isaretlenip harcandi; artik dongu durur.
// Ayni durum gorsel kaynak kesintisi icin de gecerli (Wikimedia/archive.org/Pexels; lib/source-outage.js).
class AltyapiHatasi extends Error { constructor(kind, message) { super(message); this.kind = kind; } }
const { NARRATION_UNAVAILABLE_EXIT } = require("./lib/shorts-tts");
const { ASSET_SOURCE_UNAVAILABLE_EXIT } = require("./lib/source-outage");
// Hedef yayin gunu (takvim kararindan; lib/attempt-budget.js ve youtube-yukle.js SHORTS_TARGET_DAY).
// Gunluk yayin modunda dolu; elle/dogrudan slug calismalarinda null (eski davranis).
let HEDEF_GUN = null;
const Budget = require("./lib/attempt-budget");
class ButceBitti extends Error { constructor(result) { super(Budget.exhaustedReason(result)); this.result = result; } }
// youtube-yukle.js cikis 15: yuklendi ama YouTube geri okumasi (private + publishAt) tutmadi.
class YayinDogrulamaHatasi extends Error {}
// youtube-yukle.js cikis 16: hedef gunun slotu dolu ya da kacmis; baska gune kaydirilmaz.
class SlotHatasi extends Error {}
// Bu konu icin alinan butce kalemleri (altyapi kesintisinde geri verilir; yukleme asla).
let ALINAN = [];
function butce(kind) {
  if (!HEDEF_GUN) return;
  const r = Budget.take(CHANNEL, HEDEF_GUN, kind);
  if (!r.ok) throw new ButceBitti(r);
  ALINAN.push(kind);
}
function butceIade() {
  for (const kind of ALINAN.filter((k) => k !== "upload")) Budget.release(CHANNEL, HEDEF_GUN, kind);
  ALINAN = [];
}
function kapi(slug, final) {
  const r = require("./quality-gate").degerlendir(slug, { final });
  console.log(`  kalite kapisi (${final ? "final" : "pre"}): ${r.karar} ${r.toplam}/100` + (r.engelleyen.length ? " — " + r.engelleyen.join("; ") : ""));
  if (r.karar === "BLOCK") { engelle(slug, `${final ? "final" : "pre"} gate ${r.toplam}: ${r.engelleyen.join("; ") || "below threshold"}`); throw new Engellendi("kalite kapisi BLOCK"); }
  return r;
}

function konuListesi() {
  if (!fs.existsSync(KONULAR)) return [];
  return fs.readdirSync(KONULAR).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")).sort();
}

function calistir(script, slug) {
  const r = cp.spawnSync("node", [script, slug], { cwd: KOK, stdio: "inherit" });
  // Seslendirme servisi (ve onaylı yedek ses) yoksa hata konuya ait degildir: konu harcanmaz.
  if (r.status === NARRATION_UNAVAILABLE_EXIT) throw new AltyapiHatasi("NARRATION_UNAVAILABLE", script + ": seslendirme yok (slug: " + slug + ")");
  // Gorsel kaynak kesintisi ya da eksik PEXELS_KEY (stok-bul.js cikis 2): konunun degil altyapinin hatasi.
  if (r.status === ASSET_SOURCE_UNAVAILABLE_EXIT || (script === "stok-bul.js" && r.status === 2)) {
    throw new AltyapiHatasi("ASSET_SOURCE_UNAVAILABLE", script + ": gorsel kaynagi ulasilamaz (slug: " + slug + ", cikis " + r.status + ")");
  }
  if (r.status !== 0) throw new Error(script + " basarisiz (slug: " + slug + ")");
}

function productionResult(slug, quality) {
  const K = require("./lib/kutuphane");
  const publication = K.yayinBul(slug);
  const file = path.join(CHANNEL.paths.production, slug, "Videos", slug + ".mp4");
  const rendered = fs.existsSync(file);
  // A duplicate-guard hit proves a video exists on YouTube, but the freshly
  // rendered local binary is not necessarily the binary uploaded earlier. Only
  // a real upload in this run may authorize the "today exact MP4" TikTok step.
  const uploadedThisRun = !!(publication && publication.videoId && publication.kaynak === "upload"
    && Date.now() - Date.parse(publication.tarih || 0) < 30 * 60000);
  return {
    channel: CHANNEL.slug,
    slug,
    producedAt: new Date().toISOString(),
    uploaded: uploadedThisRun,
    videoId: publication && publication.videoId || null,
    publishAt: publication && publication.publishAt || null,
    quality: quality && (quality.karar || quality.decision) || publication && publication.kalite || null,
    mp4Path: rendered ? path.relative(KOK, file).split(path.sep).join("/") : null,
    mp4Sha256: rendered ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null,
  };
}

function writeProductionResult(slug, quality) {
  const target = process.env.PRODUCTION_RESULT_PATH;
  if (!target) return;
  yaz(path.resolve(target), productionResult(slug, quality));
}

function uploadHazir() {
  const credentials = CHANNEL.credentials();
  return !!(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
}

// Uretim asamalari (lib/run-stages.js): yesil workflow artik neyin gercekten tamamlandigini soyler.
let RUN = null;
const asama = () => RUN || { reset() { return this; }, topic() { return this; }, done() { return this; }, fail() { return this; }, skip() { return this; }, scheduled() { return this; }, outcome() { return this; } };

function uretBir(slug) {
  asama().reset().topic(slug).done("RESEARCH", "growth queue selected " + slug);
  ALINAN = [];
  if (!slugGecerli(slug)) throw new Error("Gecersiz slug: " + slug);
  const spec = path.join(KONULAR, slug + ".json");
  if (!fs.existsSync(spec)) throw new Error("Konu bulunamadi: " + spec);
  const job = path.join(KOK, "uretim", slug);
  fs.mkdirSync(job, { recursive: true });
  // spec -> konu.json (uretim slug'a sabit)
  const konu = JSON.parse(fs.readFileSync(spec, "utf8"));
  konu.slug = slug;
  fs.writeFileSync(path.join(job, "konu.json"), JSON.stringify(konu, null, 2));
  console.log(`\n=== ${slug} ===`);
  const oncekiKapi = kapi(slug, false);
  const preGrowth = buyumeKapisi(slug, oncekiKapi, false);
  // arsiv-bul.js and shorts-yap.js read this run-local file directly. Promote
  // the selected title/hook/script before either process starts; never modify
  // the editorial source in icerik/konular/.
  fs.writeFileSync(path.join(job, "konu.json"), JSON.stringify(Growth.applyLegacyOverlay(konu, preGrowth), null, 2) + "\n");
  asama().done("SCRIPT", "pre gate " + oncekiKapi.karar + " " + oncekiKapi.toplam);
  // Bu konu artik uretime giriyor: hedef gunun konu ve render butcesinden duser.
  butce("topics");
  // Goruntu kaynagi: "stok" (Pexels) ya da arsiv (kamu mali).
  try { calistir(konu.tur === "stok" ? "stok-bul.js" : "arsiv-bul.js", slug); }
  catch (e) { asama().fail("ASSETS", e.message); throw e; }
  asama().done("ASSETS");
  butce("render");
  try { calistir("shorts-yap.js", slug); }
  catch (e) { if (e instanceof AltyapiHatasi && e.kind === "NARRATION_UNAVAILABLE") asama().fail("NARRATION", e.message); else asama().fail("RENDER", e.message); throw e; }
  asama().done("NARRATION").done("RENDER");
  const son = kapi(slug, true);
  asama().done("QA", "final gate " + son.karar + " " + son.toplam);
  // Onizleme gorseli (8 kare) + denetim ozeti depoya kopyalanir; bildirimde gosterilir.
  try {
    const vd = path.join(job, "Videos");
    const K = require("./lib/kutuphane");
    if (fs.existsSync(path.join(vd, "onizleme.jpg"))) {
      fs.mkdirSync(K.paketYolu(slug), { recursive: true });
      fs.copyFileSync(path.join(vd, "onizleme.jpg"), K.paketYolu(slug, "onizleme.jpg"));
    }
    if (fs.existsSync(path.join(vd, "denetim.json"))) fs.copyFileSync(path.join(vd, "denetim.json"), K.paketYolu(slug, "denetim.json"));
    if (fs.existsSync(path.join(vd, "sahne-zamanlari.json"))) fs.copyFileSync(path.join(vd, "sahne-zamanlari.json"), K.paketYolu(slug, "sahne-zamanlari.json"));
  } catch (e) { console.log("  (onizleme kopyalanamadi: " + e.message + ")"); }
  try { require("./description-engine").calistir(slug); require("./pinned-comment").calistir(slug); } catch (e) { console.log("  (paket metni: " + e.message + ")"); }

  // REVIEW is not publishable. Keeping it off YouTube entirely is safer than a
  // private upload because later automation or a mistaken metadata edit could
  // schedule it. A spec edit changes the hash and makes it eligible again.
  if (son.karar === "REVIEW") {
    incelemeyeAl(slug, son);
    writeProductionResult(slug, son);
    throw new IncelemeGerekli("kalite kapisi REVIEW; upload blocked");
  }
  buyumeKapisi(slug, son, true);

  // Yukleme: yalnizca PUBLISH=1 ve kimlik varsa; her zaman private.
  const publish = process.env.PUBLISH === "1";
  if (publish && uploadHazir()) {
    butce("upload");
    const r = cp.spawnSync("node", ["youtube-yukle.js", "--channel", CHANNEL.slug, slug], { cwd: KOK, stdio: "inherit",
      env: { ...process.env, ...(HEDEF_GUN ? { SHORTS_TARGET_DAY: HEDEF_GUN } : {}) } });
    if (r.status === 15) {
      const yayin = require("./lib/kutuphane").yayinBul(slug) || {};
      asama().done("UPLOAD", yayin.videoId || null).fail("SCHEDULE", "PUBLISH_VERIFICATION_FAILED");
      // Video YouTube'da ve yayin kaydinda: konu harcandi, bir daha uretilmez (ikinci kopya olmaz).
      isaretle(slug);
      throw new YayinDogrulamaHatasi(`PUBLISH_VERIFICATION_FAILED: ${yayin.videoId || "video"} uploaded but YouTube did not confirm private + publishAt`);
    }
    if (r.status === 16) throw new SlotHatasi(`PUBLISH_SLOT_UNAVAILABLE: target day ${HEDEF_GUN} slot taken or missed; not moved to another day`);
    if (r.status !== 0) {
      // Yukleme olmadiysa konu HARCANMAZ: "uretildi" isaretlenmez, sonraki calisma tekrar dener.
      // Neden uretim/<slug>/YUKLEME-HATASI.json'da; bildirim.js issue acar.
      const h = path.join(job, "YUKLEME-HATASI.json");
      if (!fs.existsSync(h)) fs.writeFileSync(h, JSON.stringify({ slug, neden: "youtube-yukle.js cikis kodu " + r.status, tarih: new Date().toISOString() }, null, 2));
      throw new YuklemeHatasi("yukleme basarisiz (konu kuyrukta kaldi)");
    }
    console.log(`yukleme: tamam (kalite: ${son.karar})`);
    const yayin = require("./lib/kutuphane").yayinBul(slug) || {};
    asama().done("UPLOAD", yayin.videoId || null);
    if (yayin.publishAt) asama().done("SCHEDULE", yayin.publishAt).scheduled("PUBLISH", "YouTube makes it public at " + yayin.publishAt);
    else asama().skip("SCHEDULE", "uploaded private without publishAt (manual review)");
    const videoId = GrowthRuntime.afterUpload(CHANNEL, slug, growthPlans[slug]);
    console.log(GrowthRuntime.shortSummary(growthPlans[slug], { "Upload Status": "uploaded (scheduled)", "Video ID": videoId || "—" }));
  } else {
    asama().skip("UPLOAD", publish ? "no credentials" : "PUBLISH!=1");
    console.log("yukleme atlandi (" + (publish ? "kimlik yok" : "PUBLISH!=1") + "); video: uretim/" + slug + "/Videos/");
    console.log(GrowthRuntime.shortSummary(growthPlans[slug], { "Upload Status": "skipped (" + (publish ? "no credentials" : "PUBLISH!=1") + ")", "Video ID": "—" }));
  }
  isaretle(slug);
  // The workflow consumes this exact result. TikTok must never guess the latest
  // topic: it receives this slug and verifies this MP4's SHA-256 before upload.
  writeProductionResult(slug, son);
  return slug;
}

function main() {
  const argv = SELECTED.argv;
  const hepsi = argv.includes("--hepsi");
  const acikSlug = argv.find(a => !a.startsWith("--"));
  const tum = konuListesi();
  if (!tum.length) { console.log("icerik/konular/ bos. Once konu ekle."); return 0; }

  // Belirli slug: dogrudan uret (hata firlatir).
  if (acikSlug) { uretBir(acikSlug); return 0; }

  if (!hepsi) RUN = require("./lib/run-stages").start(CHANNEL);
  // Takvim: gunluk (varsayilan) modda slot dolmadiysa uretme (kalite > siklik).
  if (!hepsi && process.env.PUBLISH === "1") {
    const d = require("./yayin-plani").durum("short");
    if (!d.uygun) { asama().outcome("NOT_DUE", d.neden); console.log("Takvim: henuz degil — " + d.neden); return 0; }
    HEDEF_GUN = d.hedefGun || null;
    if (RUN) RUN.record.targetDay = HEDEF_GUN;
    console.log(`Takvim: ${d.neden} · hedef yayin gunu ${HEDEF_GUN} (${d.hedefYayin || "?"})`);
  }
  // Uretilmemis, kalici basarisiz olmamis ve (ayni spec ile) engellenmemis konular.
  // Yayin kaydindaki (icerik/yayinlananlar.json) slug'lar da atlanir: elle yuklenmis bir
  // video uretilenler listesinde olmasa bile IKINCI KEZ yuklenmez.
  const yuklenmis = require("./lib/kutuphane").yayinlananlar().map((y) => y.slug).filter(Boolean);
  const atla = new Set([...uretilenler(), ...basarisizlar(), ...yuklenmis,
    ...Object.keys(engellenenler()).filter(engelliMi), ...Object.keys(incelemedekiler()).filter(incelemedeMi)]);
  // Siralama: growth engine (A/B once, C yalnizca deney gunu ya da kanal izin
  // veriyorsa yedek; D asla). Growth kuyrugu bossa eski kutuphane sirasi DEGIL,
  // uyari: zayif konu takvimi doldurmak icin yayinlanmaz.
  const buyume = Growth.orderedQueue(CHANNEL, { exclude: [...atla], write: true });
  if (buyume.selected) growthSelections[buyume.selected] = buyume.decision;
  const kalan = buyume.order.filter((s) => !atla.has(s) && tum.includes(s));
  console.log(`growth queue: ${buyume.reason} · ${buyume.mode} · candidate pool ${buyume.candidatePool.count}/${buyume.candidatePool.target} (minimum ${buyume.candidatePool.minimum}) · inventory A${buyume.inventory.A}/B${buyume.inventory.B}/C${buyume.inventory.C}/D${buyume.inventory.D}`);
  if (!kalan.length) {
    asama().fail("RESEARCH", buyume.reason).outcome("NO_TOPIC", buyume.reason);
    GrowthRuntime.alert(CHANNEL, "NO_QUALIFIED_TOPIC", buyume.reason, { inventory: buyume.inventory });
    console.log("::warning::Uretilecek nitelikli konu yok (" + tum.length + " toplam) — " + buyume.reason);
    return 0;
  }

  // Saglik: yukleme yapilacaksa once YouTube yetkisi dogrulanir. Yetki yoksa hicbir konu
  // uretilmez (eskiden konu uretilip yuklenemeden "uretildi" sayiliyordu).
  if (!hepsi && process.env.PUBLISH === "1" && !process.env.SAGLIK_ATLA) {
    const sg = cp.spawnSync(process.execPath, ["saglik.js", "--channel", CHANNEL.slug], { cwd: KOK, stdio: "inherit" });
    if (sg.status === 5) {
      const neden = require("./saglik").kritikOzet(CHANNEL);
      asama().outcome("FAILED", "health pre-flight: " + neden);
      console.error("⛔ Saglik kontrolu: " + neden + " — uretim atlandi, konu harcanmadi (bkz. icerik/saglik.json).");
      return 0;
    }
  }

  // Gunluk: ilk BASARILI konuyu uret; biri patlarsa sonrakine gec (gun bosa gitmesin).
  // --hepsi: hepsini dene, basarisizlari atla.
  const hedefSayi = hepsi ? kalan.length : 1;
  let basari = 0;
  for (const slug of kalan) {
    if (basari >= hedefSayi) break;
    try { uretBir(slug); basari++; }
    catch (e) {
      if (e instanceof Engellendi) { asama().outcome("BLOCKED", `${slug}: ${e.message}`); console.error(`  ⛔ ${slug} kalite kapisinda engellendi — rapor: icerik/paket/${slug}/quality-gate.md`); continue; }
      if (e instanceof IncelemeGerekli) { asama().fail("QA", "REVIEW").outcome("BLOCKED", `${slug}: ${e.message}`); console.error(`  ⚠ ${slug} insan incelemesine ayrildi; YouTube'a yuklenmedi — rapor: icerik/paket/${slug}/quality-gate.md`); continue; }
      if (e instanceof ButceBitti) {
        asama().outcome("FAILED", e.message);
        GrowthRuntime.alert(CHANNEL, "RETRY_BUDGET_EXHAUSTED", slug, { ...e.result });
        console.log("::error::[" + CHANNEL.name + "] " + e.message + " — no more attempts for this day; topic kept");
        return 1;
      }
      if (e instanceof YayinDogrulamaHatasi || e instanceof SlotHatasi) {
        if (e instanceof SlotHatasi) asama().fail("UPLOAD", e.message);
        asama().outcome("FAILED", `${slug}: ${e.message}`);
        GrowthRuntime.alert(CHANNEL, e instanceof SlotHatasi ? "PUBLISH_SLOT_UNAVAILABLE" : "PUBLISH_VERIFICATION_FAILED", slug, { message: e.message });
        console.log("::error::[" + CHANNEL.name + "] " + e.message);
        return 1;
      }
      // Yukleme hatasi konuya ait degildir (yetki/ag): baska konuyu da harcamamak icin dur.
      if (e instanceof YuklemeHatasi) { asama().fail("UPLOAD", e.message).outcome("FAILED", `${slug}: ${e.message}`); console.error(`  ✗ ${slug}: ${e.message}`); return 1; }
      if (e instanceof AltyapiHatasi) {
        if (HEDEF_GUN) butceIade();
        asama().outcome("FAILED", `${e.kind} (${slug}): ${e.message}`);
        GrowthRuntime.alert(CHANNEL, e.kind, slug, { message: e.message });
        console.error(`  ✗ ${slug}: ${e.message} — konu harcanmadi; altyapi duzelene kadar baska konu denenmez`);
        console.log("::error::[" + CHANNEL.name + "] " + e.kind + (e.kind === "NARRATION_UNAVAILABLE"
          ? ": Edge TTS refused and no approved fallback voice; nothing rendered or uploaded"
          : ": an asset source (Wikimedia/archive.org/Pexels) is unreachable; topic kept for the next run"));
        return 1;
      }
      console.error(`  ✗ ${slug} basarisiz: ${e.message} — atlaniyor`);
      asama().outcome("FAILED", `${slug}: ${e.message}`);
      basarisizIsaretle(slug);
    }
  }
  if (!basari) { console.error("Hicbir konu uretilemedi."); return 1; }
  const son = RUN && RUN.record;
  if (son && son.stages.UPLOAD.status === "done") asama().outcome("UPLOADED", null, { videoId: son.stages.UPLOAD.detail || null });
  else if (process.env.PUBLISH !== "1") asama().outcome("DRY_RUN", "rendered without upload");
  else asama().outcome("FAILED", "rendered but not uploaded (" + ((son && son.stages.UPLOAD.detail) || "no upload") + ")");
  return 0;
}

try {
  if (CHANNEL.config.pathMode !== "legacy-adapter") process.exit(require("./core/pipeline/impossible-brief").runChannel(CHANNEL.slug, SELECTED.argv));
  process.exit(main());
}
catch (e) { console.error(`[${CHANNEL.name}] Hata: ` + e.message); process.exit(1); }
