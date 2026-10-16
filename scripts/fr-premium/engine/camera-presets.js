"use strict";
// Camera presets: default camera values computed from asset dimensions, verified anchors, narration
// timings, template constraints and the mobile safe zone. Pure functions (Node); the planner calls them,
// and the validator uses project()/checkCover() to reject camera positions that put a marked anchor
// outside the safe zone or crop outside the image. Presets never invent anchors: every point comes from
// assets.json; without an anchor a preset falls back to the asset centre and says so (fallback: true).
const W = 1080, H = 1920;
// mobile safe zone for subjects and labels: below the handle/chip row, above the captions, clear of the right-side UI
const SAFE = { x: 64, y: 300, w: 886, h: 990 }; // x 64..950, y 300..1290
const PHOTO_BOX = { x: 0, y: 0, w: W, h: 1400 }; // V3 framing for vertical photos with the caption band below
const FILM_BOX = { x: 0, y: 290, w: W, h: W };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// the renderer's FR.cover maths (fr-lib.js), in source px
function cover(asset, { fx, fy, z = 1, box = { x: 0, y: 0, w: W, h: H } }) {
  const ar = box.w / box.h; let cw, ch;
  if (asset.width / asset.height > ar) { ch = asset.height / z; cw = ch * ar; } else { cw = asset.width / z; ch = cw / ar; }
  return { x: clamp(fx - cw / 2, 0, asset.width - cw), y: clamp(fy - ch / 2, 0, asset.height - ch), w: cw, h: ch };
}
const project = (crop, box, [px, py]) => ({ x: box.x + (px - crop.x) * box.w / crop.w, y: box.y + (py - crop.y) * box.h / crop.h });
const inSafe = (p, m = 0) => p.x >= SAFE.x + m && p.x <= SAFE.x + SAFE.w - m && p.y >= SAFE.y + m && p.y <= SAFE.y + SAFE.h - m;
const centre = (a) => [a.width / 2, a.height / 2];
const pointOf = (anchor) => anchor.point || (anchor.rect ? [anchor.rect.x + anchor.rect.w / 2, anchor.rect.y + anchor.rect.h / 2] : null);

// Establishing: whole subject, slow push (1.00 -> 1.06) on the asset centre or a "subject" anchor.
function establishing({ asset, subject, t0, t1, box }) {
  const f = subject ? pointOf(subject) : centre(asset);
  return { keys: [{ at: t0, focus: f.map(Math.round), zoom: 1.0 }, { at: t1, focus: f.map(Math.round), zoom: 1.06 }], fallback: !subject };
}
// Evidence push-in: from a wide framing to a framing that holds the anchor in the safe zone with room for
// its label above-left; the zoom is reduced until the anchor projects inside the safe zone (margin 80 px).
function evidencePushIn({ asset, anchor, t0, t1, box = PHOTO_BOX, zoomMax = 1.4 }) {
  const a = pointOf(anchor); const c0 = centre(asset); const start = [Math.round((c0[0] + a[0]) / 2), Math.round((c0[1] + a[1]) / 2)];
  for (let z = zoomMax; z >= 1.0; z -= 0.02) {
    const cr = cover(asset, { fx: a[0], fy: a[1], z, box }); const f = [cr.x + cr.w * 0.62, cr.y + cr.h * 0.58]; // anchor lands right of / below centre, label room above-left
    const crop = cover(asset, { fx: f[0], fy: f[1], z, box }); const s = project(crop, box, a);
    if (inSafe(s, 80)) return { keys: [{ at: t0, focus: start, zoom: 1.0 }, { at: t1, focus: f.map(Math.round), zoom: +z.toFixed(2) }], anchorScreen: s, fallback: false };
  }
  return { keys: [{ at: t0, focus: start, zoom: 1.0 }, { at: t1, focus: a.map(Math.round), zoom: 1.0 }], fallback: true };
}
// Film plate: full-width film over a blurred plate of itself; crop push toward an anchor (clip-frame px).
function filmPlate({ clip, anchor, t0, t1, zoom = 1.7 }) {
  const out = clip.clip.out; const c = [out.w / 2, out.h / 2];
  return { box: FILM_BOX, camera: anchor ? { mode: "crop", keys: [{ at: t0, focus: c, zoom: 1.0 }, { at: t1, focus: pointOf(anchor).map(Math.round), zoom }] } : { keys: [{ at: t0, focus: c, zoom: 1.0 }] } };
}
// Mechanism close-up: view region = union of the mechanism anchors (+15%), fitted to the safe box aspect.
function mechanismCloseUp({ rects, box = { x: 70, y: 300, w: 940, h: 1323 } }) {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y)), x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  let w = (x1 - x0) * 1.15, h = (y1 - y0) * 1.15; const ar = box.w / box.h; if (w / h > ar) h = w / ar; else w = h * ar;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { region: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) }, box };
}
// Document read-along: for each highlighted region (source px on a page placed at world {x,y,w}), a camera key
// at the region's narration time, zoomed so the region spans about 80% of the screen width; wide keys between.
function documentReadAlong({ page, world, marks, t0, t1 }) {
  const s = world.w / page.width; const wp = (x, y) => [world.x - world.w / 2 + x * s, world.y - (world.w * page.height / page.width) / 2 + y * s];
  const keys = [{ at: t0, world: [world.x, world.y], zoom: 1.0 }];
  for (const m of marks) { const r = m.rect; const z = clamp((W * 0.8) / (r.w * s), 1.0, 2.8);
    keys.push({ at: m.at, page: m.page, point: [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)], zoom: +z.toFixed(2) }); }
  keys.push({ at: t1, world: [world.x, world.y + 40], zoom: 1.0 });
  return { keys, worldPoint: wp };
}
// Payoff loop: the hook's keys reversed in time, ending on the hook's first framing (frame 0 of the loop).
function payoffLoop({ hookKeys, t0, t1 }) { const k = hookKeys; return { keys: [{ at: t0, focus: k[k.length - 1].focus, zoom: k[k.length - 1].zoom }, { at: t1, focus: k[0].focus, zoom: k[0].zoom }] }; }
// Event timeline (reconstruction): the template's settle defaults, from the template constraints.
const eventTimeline = () => ({ settle: { dur: 1.0, focusFrac: 0.845, zoom: 1.9, screenY: 760 } });
// Archival -> reconstruction match: register on the previous shot's anchor (only when the anchor declares registersTo).
const matchCut = ({ fromShot, fromAnchorRef, toAnchorRef, at }) => ({ fromShot, fromAnchor: fromAnchorRef, toAnchor: toAnchorRef, at, startScale: 0.55 });

// validator helper: a cover camera must keep the crop inside the image and a marked anchor inside the safe zone
function checkCover(asset, box, key, markPoint) {
  const issues = []; if (!(key.zoom >= 1 && key.zoom <= 4)) issues.push(`zoom ${key.zoom} outside 1..4`);
  const f = key.focus; if (f && (f[0] < 0 || f[1] < 0 || f[0] > asset.width || f[1] > asset.height)) issues.push(`focus (${f}) outside the ${asset.width}x${asset.height} image`);
  if (markPoint && f) { const s = project(cover(asset, { fx: f[0], fy: f[1], z: key.zoom, box }), box, markPoint); if (!inSafe(s)) issues.push(`marked anchor projects to (${Math.round(s.x)}, ${Math.round(s.y)}), outside the mobile safe zone`); }
  return issues;
}

module.exports = { W, H, SAFE, PHOTO_BOX, FILM_BOX, cover, project, inSafe, pointOf, establishing, evidencePushIn, filmPlate, mechanismCloseUp, documentReadAlong, payoffLoop, eventTimeline, matchCut, checkCover };
