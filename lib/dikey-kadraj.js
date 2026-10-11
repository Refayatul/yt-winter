// DIKEY KADRAJ — Shorts icin tam ekran 9:16 kadraj filtreleri (Failure Reconstructed).
//
// Eskiden her goruntu bulanik bir arka planin ORTASINA yerlestiriliyordu: yatay bir
// arsiv fotografi ekranin ~%42'sini kapliyor, kalan alan bulanik bant oluyordu
// (Shorts akisinda "slayt gosterisi" hissi, ilk karede zayif goruntu).
//
//   Fotograf: ekrani TAMAMEN doldurur. Yatay fotografta 9:16 pencere fotografin
//             uzerinde yavasca saga/sola kayar (pan) — hem hareket hem de goruntunun
//             tamami ekrana gelir. Dikey/kareye yakin fotografta yavas yakinlasma.
//   Video:    dikey (<= 0.6 en/boy) klip tam ekran; yatay klip ekran yuksekliginin
//             ~%60'ini kaplayacak kadar buyutulur (yanlar kirpilir), bulanik dolgu
//             yalnizca kalan bantlarda.
//   Arsiv:    siyah-beyaz/soluk fotograflarda hafif kontrast + keskinlik (eq/unsharp).
//
// Tum hareketler 2x ara olcekte hesaplanir (alt-piksel titreme olmasin).
"use strict";

const W = 1080, H = 1920;
const VIDEO_FG_HEIGHT = 1150;         // yatay klibin ekrandaki yuksekligi (~%60)
const PAN_SPAN = 0.42;                // yatay fotografta tasan genisligin kayilan payi

const ARSIV_TON = "eq=contrast=1.12:brightness=0.015:saturation=1.04,unsharp=5:5:0.55:5:5:0";
const DOKU = "noise=alls=6:allf=t+u,vignette=angle=PI/4.5";

function oran(w, h) { return w > 0 && h > 0 ? w / h : W / H; }

// Fotograf: [0:v] -> [v] (1080x1920, tam ekran). j = cekim sirasi (yon degisir), n = kare sayisi.
function fotoFiltre({ w, h, j = 0, n = 30, ton = "" }) {
  const ar = oran(w, h);
  const N = Math.max(1, n - 1);
  let hareket;
  if (ar > (W / H) * 1.25) {
    // Yatay ya da kare: 2x yukseklige olcekle, 9:16 pencereyi yatayda kaydir (tasan
    // genislik en az pencerenin %25'i, yoksa hareket fark edilmez). Yon sirayla degisir.
    const a = j % 2 === 0 ? 0.5 - PAN_SPAN / 2 : 0.5 + PAN_SPAN / 2;
    const b = j % 2 === 0 ? 0.5 + PAN_SPAN / 2 : 0.5 - PAN_SPAN / 2;
    hareket = `scale=-2:${H * 2},crop=${W * 2}:${H * 2}:x='(iw-ow)*(${a.toFixed(3)}${b >= a ? "+" : "-"}${Math.abs(b - a).toFixed(3)}*n/${N})':y=0,scale=${W}:${H}`;
  } else {
    // Dikeye yakin: ekrani kaplayacak kadar buyut, yavas yakinlas/uzaklas.
    const z = j % 2 === 0 ? `1+0.10*on/${N}` : `1.10-0.10*on/${N}`;
    hareket = `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
      `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30`;
  }
  return `[0:v]${hareket},setsar=1,${ARSIV_TON},${ton ? ton + "," : ""}${DOKU},fps=30,format=yuv420p[v]`;
}

// Video: [0:v] -> taban zinciri; ardindan kamera hareketi (punch/push/drift) eklenebilir.
// Donen deger son etiketi ACIK birakir (eski "taban" ile ayni sozlesme).
function videoTaban({ w, h, ton = "" }) {
  const ar = oran(w, h);
  const son = `${ton ? ton + "," : ""}${DOKU},fps=30,format=yuv420p`;
  if (ar <= 0.6) {
    return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,${son}`;
  }
  return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=26:2,eq=brightness=-0.20:contrast=1.05[bg];` +
    `[0:v]scale=-2:${VIDEO_FG_HEIGHT},crop='min(iw,${W})':${VIDEO_FG_HEIGHT},setsar=1[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,${son}`;
}

// Kaynagin ekrandaki kaplama orani (0-1): kalite denetimi ve testler icin.
function kaplama({ w, h, foto }) {
  if (foto) return 1;
  const ar = oran(w, h);
  if (ar <= 0.6) return 1;
  return VIDEO_FG_HEIGHT / H;
}

// ---------------------------------------------------------------------------------------------
// v2 (SHORTS_CRAFT_V2 for failure-reconstructed): subject-aware 9:16 compositions.
// A landscape source is either
//   * "odak"  — full-screen crop on the subject window (lib/odak.js) when the detail is
//               concentrated there (coverage at least FOCUS_RATIO x an even spread), with a gentle
//               push on the subject; a returning picture shows its second subject window instead;
//   * "belge" — a documentary layout when the detail is spread across the frame: the WHOLE frame at
//               full width (nothing cropped away) above a magnified detail of the subject, on a dark
//               ground with a thin accent rule. No blurred fill, no narrow strip.
// Portrait sources keep the v1 framing.
const FOCUS_RATIO = 1.35;
// ust: room above the whole frame for the hook, so the hook never covers the evidence.
const BELGE = { ust: 420, bosluk: 28, detayH: 640, detayPay: 0.40, zemin: "0x0b0d10", cizgi: "0xD87F36", kancaY: 250 };

function kompozisyon({ w, h, odak }) {
  const ar = oran(w, h);
  if (ar <= (W / H) * 1.25) return "dikey";
  if (!odak) return "belge";
  return odak.coverage >= odak.uniform * FOCUS_RATIO ? "odak" : "belge";
}

const kenet = (v, a, b) => Math.max(a, Math.min(b, v));

// Full-screen crop window (2x scale for smooth motion): x offset in the 2x-scaled frame.
function odakX({ w, h, cx }) {
  const sw = Math.round(H * 2 * oran(w, h));
  return kenet(Math.round(cx * sw - W), 0, Math.max(0, sw - W * 2));
}

// Detail crop for the documentary layout, in source pixels (aspect 1080:detayH).
function detay({ w, h, odak, kullanim = 0 }) {
  const cw = Math.round(w * BELGE.detayPay);
  const ch = Math.min(h, Math.round(cw * BELGE.detayH / W));
  // A returning cut looks at the second subject region: the detail moves to new evidence.
  const cx = odak ? (kullanim % 2 ? odak.cx2 : odak.cx) : 0.5;
  const x = kenet(Math.round(cx * w - cw / 2), 0, w - cw);
  const y = kenet(Math.round((odak ? odak.cy : 0.5) * h - ch / 2), 0, h - ch);
  return { cw, ch, x, y };
}

function belgeZinciri({ w, h, odak, n, foto, ton, kullanim = 0 }) {
  const N = Math.max(1, n - 1);
  const mainH = Math.round(W * h / w / 2) * 2;
  const d = detay({ w, h, odak, kullanim });
  const detayY = BELGE.ust + mainH + BELGE.bosluk;
  const push = foto ? `,scale=${W * 2}:${BELGE.detayH * 2},zoompan=z='1+0.06*on/${N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${BELGE.detayH}:fps=30` : `,scale=${W}:${BELGE.detayH}`;
  return `[0:v]split=2[ana][det];color=c=${BELGE.zemin}:s=${W}x${H}:r=30[zemin];` +
    `[ana]scale=${W}:${mainH},setsar=1[anas];` +
    `[det]crop=${d.cw}:${d.ch}:${d.x}:${d.y}${push},setsar=1[dets];` +
    `[zemin][anas]overlay=0:${BELGE.ust}:shortest=1[z1];[z1][dets]overlay=0:${detayY}:shortest=1,` +
    `drawbox=x=0:y=${BELGE.ust + mainH + Math.round(BELGE.bosluk / 2) - 2}:w=${W}:h=4:color=${BELGE.cizgi}@0.85:t=fill,setsar=1,` +
    `${ARSIV_TON},${ton ? ton + "," : ""}${DOKU},fps=30,format=yuv420p`;
}

// Photo v2: [0:v] -> [v]. kullanim = how many times this picture was already shown.
function fotoFiltreV2({ w, h, j = 0, n = 30, ton = "", odak = null, kullanim = 0 }) {
  const tip = kompozisyon({ w, h, odak });
  if (tip === "dikey") return fotoFiltre({ w, h, j, n, ton });
  if (tip === "belge") return belgeZinciri({ w, h, odak, n, foto: true, ton, kullanim }) + "[v]";
  const N = Math.max(1, n - 1);
  const x = odakX({ w, h, cx: kullanim % 2 ? odak.cx2 : odak.cx });
  const z = kullanim % 2 ? `1.06-0.06*on/${N}` : `1+0.06*on/${N}`;
  return `[0:v]scale=-2:${H * 2},crop=${W * 2}:${H * 2}:${x}:0,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,` +
    `setsar=1,${ARSIV_TON},${ton ? ton + "," : ""}${DOKU},fps=30,format=yuv420p[v]`;
}

// Video v2: same contract as videoTaban (last label left open for the camera move).
function videoTabanV2({ w, h, ton = "", odak = null, kullanim = 0 }) {
  const tip = kompozisyon({ w, h, odak });
  if (tip === "dikey") return videoTaban({ w, h, ton });
  if (tip === "belge") return belgeZinciri({ w, h, odak, n: 1, foto: false, ton, kullanim });
  const x = Math.round(odakX({ w, h, cx: odak.cx }) / 2);
  return `[0:v]scale=-2:${H},crop=${W}:${H}:${x}:0,setsar=1,${ton ? ton + "," : ""}${DOKU},fps=30,format=yuv420p`;
}

// Screen coverage of the source picture (v2): the documentary layout shows the whole frame plus a detail.
function kaplamaV2({ w, h, foto, odak }) {
  const tip = kompozisyon({ w, h, odak });
  if (tip === "belge") return +((W * h / w + BELGE.detayH) / H).toFixed(3);
  return foto || tip === "odak" ? 1 : kaplama({ w, h, foto });
}

module.exports = { W, H, VIDEO_FG_HEIGHT, PAN_SPAN, ARSIV_TON, fotoFiltre, videoTaban, kaplama,
  FOCUS_RATIO, BELGE, kompozisyon, detay, fotoFiltreV2, videoTabanV2, kaplamaV2 };
