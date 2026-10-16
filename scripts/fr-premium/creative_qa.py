#!/usr/bin/env python3
"""Creative QA (Phase 0): WARN-only measurements of the Forensic Reconstruction acceptance criteria.

  python3 creative_qa.py --mp4 film.mp4 --shots shots.json [--text text-inspection.json]
                         [--offset 0] [--range from,to] [--baseline-plan plan.json] [--out creative-qa.json]

Never fails a build (exit 0); the existing technical gates (qa-vertical.js, text-qa.js) are unchanged.
--offset: film time of the MP4's first frame (a scene-only clip rendered with --from).
--range: only measure shots overlapping this film-time window.
--baseline-plan: plan annotations for films rendered before plan metadata existed (V2), keyed by shot id.

Measurements (all from the MP4 unless marked "plan"):
  empty      share of 6x6 blocks (270x480) that are flat (sd < 2.5) bare ground: dark (< 45) or blank paper (> 215).
             Caption band excluded.                                      WARN > 0.35
  subject    motion left after removing the best global camera move (scale + translation, fitted per frame
             pair) in the picture area y 300-1318, mean abs luma residual at 135x240 (0-255).
  camera     the fitted camera move per second (|log scale| + |translation| as share of width).
             WARN for explanatory/reconstruction/document shots: subject < SUBJECT_MIN (motion is only drift).
  states     plan: narration-timed state changes; each is "verified" when the subject residual peaks within
             -0.15..+0.6 s of it. WARN if < 2 per shot or < 1 per 2 s (non-archival), or any unverified.
  framing    archival shots: inset void = empty share. WARN > 0.25. Reports framing classes for consistency.
  continuity plan: registered shots; MP4: picture correlation across the boundary after the camera fit.
             WARN if an explanatory/reconstruction shot is not registered to archival media.
  text       text-inspection samples: tiers (distinct non-caption sizes), labels, words, smallest label,
             headline+caption competing. WARN > 3 tiers, > 3 labels, > 8 words, label < 32 px.
  slide      plan primitives in {bar-chart, flowchart, bullets} or (empty > 0.5 and subject < SUBJECT_MIN).
  transition plan: every shot's transition has a type from the grammar and a reason. MP4: measured cut/dissolve.
"""
import argparse, json, subprocess, sys
import numpy as np

W, H, FPS = 270, 480, 10
CAP0, CAP1 = 1318, 1470            # caption band (1920-px frame)
PIC0, PIC1 = 300, 1318             # picture area for motion (below handle/chip row, above captions)
T = dict(empty=0.35, inset=0.25, subject_min=0.25, tiers=3, labels=3, words=8, label_px=32, states_per_2s=1, states_min=2)
GRAMMAR = {"match", "push-in", "follow-cause", "cut", "hard-cut", "dip", "loop", "continuous"}
SLIDE_PRIMS = {"bar-chart", "flowchart", "bullets"}


def decode(mp4):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def empty_share(f):
    rows = np.ones(H // 6, bool); rows[CAP0 // 24: CAP1 // 24 + 1] = False   # 1920/480 = 4 px per row, 6 rows per block
    b = f[: H // 6 * 6, : W // 6 * 6].reshape(H // 6, 6, W // 6, 6).swapaxes(1, 2)
    sd, mu = b.std((2, 3)), b.mean((2, 3))
    flat = (sd < 2.5) & ((mu < 45) | (mu > 215))
    return float(flat[rows].mean())


def small(f):  # picture area at half resolution
    a = f[PIC0 // 4: PIC1 // 4]
    return a[: a.shape[0] // 2 * 2, : a.shape[1] // 2 * 2].reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).mean((1, 3))


def zoom(a, s):
    h, w = a.shape; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ys, xs = (yy - h / 2) / s + h / 2, (xx - w / 2) / s + w / 2
    y0, x0 = np.clip(np.floor(ys).astype(int), 0, h - 2), np.clip(np.floor(xs).astype(int), 0, w - 2)
    fy, fx = np.clip(ys - y0, 0, 1), np.clip(xs - x0, 0, 1)
    return (a[y0, x0] * (1 - fy) * (1 - fx) + a[y0 + 1, x0] * fy * (1 - fx) + a[y0, x0 + 1] * (1 - fy) * fx + a[y0 + 1, x0 + 1] * fy * fx)


def _shift(A, dx, dy):
    h, w = A.shape; ky = np.fft.fftfreq(h)[:, None]; kx = np.fft.fftfreq(w)[None, :]
    return np.fft.ifft2(np.fft.fft2(A) * np.exp(-2j * np.pi * (kx * dx + ky * dy))).real


def _peak(c):
    h, w = c.shape; y, x = np.unravel_index(np.argmax(c), c.shape)
    def sub(m1, c0, p1): d = m1 - 2 * c0 + p1; return 0.0 if abs(d) < 1e-9 else 0.5 * (m1 - p1) / d
    fy = sub(c[(y - 1) % h, x], c[y, x], c[(y + 1) % h, x]); fx = sub(c[y, (x - 1) % w], c[y, x], c[y, (x + 1) % w])
    y, x = y + fy, x + fx
    return (x - w if x > w / 2 else x), (y - h if y > h / 2 else y)


def fit(a, b):
    """Best global camera move (scale about the centre + sub-pixel translation) taking a to b.
    Returns (residual normalised by b's texture, scale, dx, dy, corr). Normalising by the mean gradient
    makes a pure camera move on a detailed photo and on a flat diagram read alike (near 0)."""
    h, w = a.shape; m = 10; B = b - b.mean(); FB = np.fft.fft2(B)
    gy, gx = np.gradient(b); tex = float(np.hypot(gx, gy)[m:-m, m:-m].mean()) + 1.0
    def score(s):
        A = zoom(a, s); A0 = A - A.mean(); R = np.fft.fft2(A0) * np.conj(FB); R /= np.abs(R) + 1e-6
        dx, dy = _peak(np.fft.ifft2(R).real)
        if abs(dx) > w / 4 or abs(dy) > h / 4: return None
        As = _shift(A, -dx, -dy)
        return float(np.abs(As[m:-m, m:-m] - b[m:-m, m:-m]).mean()), s, dx, dy, As
    best = None
    for s in np.linspace(0.96, 1.04, 17):
        r = score(s)
        if r and (best is None or r[0] < best[0]): best = r
    if best is None: return (float(np.abs(a - b).mean()) / tex, 1.0, 0.0, 0.0, 0.0)
    for s in np.linspace(best[1] - 0.005, best[1] + 0.005, 11):
        r = score(s)
        if r and r[0] < best[0]: best = r
    res, s, dx, dy, As = best
    x, y = As[m:-m, m:-m].ravel(), b[m:-m, m:-m].ravel(); sx, sy = x.std(), y.std()
    corr = float(((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)) if sx > 1e-3 and sy > 1e-3 else 1.0
    return (res / tex, float(s), float(dx), float(dy), corr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mp4", required=True); ap.add_argument("--shots", required=True); ap.add_argument("--text")
    ap.add_argument("--offset", type=float, default=0.0); ap.add_argument("--range"); ap.add_argument("--baseline-plan"); ap.add_argument("--out")
    a = ap.parse_args()
    meta = json.load(open(a.shots)); shots = meta["shots"]
    base = json.load(open(a.baseline_plan)) if a.baseline_plan else {}
    fr = decode(a.mp4); n = len(fr); t_of = lambda i: a.offset + i / FPS
    lo, hi = (map(float, a.range.split(","))) if a.range else (a.offset, a.offset + n / FPS)
    sm = [small(f) for f in fr]
    # per-pair camera fit and subject residual (pairs that straddle a shot boundary are marked)
    bounds = [s["start"] for s in shots[1:]]
    pairs = []
    for i in range(n - 1):
        t0, t1 = t_of(i), t_of(i + 1); cross = any(t0 - 0.05 < b <= t1 + 0.05 for b in bounds)  # one-frame margin: fps sampling can land across a cut
        r, s, dx, dy, corr = fit(sm[i], sm[i + 1])
        pairs.append(dict(t=t0 + 0.05, res=r, cam=abs(np.log(s)) + (abs(dx) + abs(dy)) / sm[i].shape[1], corr=corr, cross=cross))
    texts = json.load(open(a.text))["samples"] if a.text else []
    out = []
    for s in shots:
        s0, s1 = max(s["start"], lo, a.offset), min(s["end"], hi, a.offset + n / FPS)
        if s1 - s0 < 0.2: continue
        plan = dict(s.get("plan") or {}); plan.update(base.get(s["id"], {}))
        idx = [i for i in range(n) if s0 <= t_of(i) < s1]
        P = [q for q in pairs if s0 + 0.05 <= q["t"] < s1 - 0.05 and not q["cross"]]
        res = np.array([q["res"] for q in P]) if P else np.array([0.0])
        warns = []
        emp = float(np.mean([empty_share(fr[i]) for i in idx[::2]]))
        subj = float(np.median(res)); subj_mean = float(res.mean()); cam = float(np.mean([q["cam"] for q in P])) * FPS if P else 0.0
        kind = s["kind"]; nonarch = kind != "archival"
        if emp > T["empty"]: warns.append(f"empty background {emp:.0%} > {T['empty']:.0%}")
        if nonarch and subj_mean < T["subject_min"]: warns.append(f"subject motion {subj_mean:.2f} < {T['subject_min']} (camera drift only)")
        # narration-timed states
        st = plan.get("states") or []; ver = []
        for x in st:
            win = [q["res"] for q in P if x["t"] - 0.15 <= q["t"] <= x["t"] + 0.6]
            ok = bool(win) and max(win) >= max(1.5 * subj, subj + 0.15)
            ver.append(dict(t=x["t"], what=x["what"], ev=x.get("ev"), verified=ok, peak=round(max(win), 2) if win else None))
        dur = s["end"] - s["start"]
        if nonarch:
            if not st: warns.append("no narration-timed state changes declared")
            elif len(st) < T["states_min"] or len(st) / dur * 2 < T["states_per_2s"]: warns.append(f"{len(st)} state changes in {dur:.1f} s (< 2, or < 1 per 2 s)")
            if any(not v["verified"] for v in ver): warns.append(f"{sum(not v['verified'] for v in ver)} declared state change(s) not visible in the MP4")
        if kind == "archival" and emp > T["inset"]: warns.append(f"archival inset over void {emp:.0%} > {T['inset']:.0%}")
        # continuity at the incoming boundary
        bi = [i for i in range(n - 1) if t_of(i) < s["start"] <= t_of(i + 1)]
        bcorr = None
        if bi and bi[0] >= 1 and bi[0] + 2 < n:
            i = bi[0]; bcorr = round(fit(sm[i - 1], sm[i + 2])[4], 3)
        reg = plan.get("register"); reg = reg if reg and reg.get("from") else None
        if kind in ("explanatory", "reconstruction") and not reg: warns.append("mechanism shot not registered to archival media")
        # transitions
        ttype = s.get("transition") or "cut"; reason = plan.get("transitionReason")
        meas = None
        if bi and 1 <= bi[0] < n - 2:
            i = bi[0]; d = [float(np.abs(fr[j + 1] - fr[j]).mean()) for j in range(max(0, i - 3), min(n - 1, i + 4))]
            meas = "cut" if max(d) > 3 * (np.median(d) + 0.5) else "gradual"
        if s["start"] > 0.01:
            if not reason: warns.append(f"transition '{ttype}' has no declared reason")
            elif ttype not in GRAMMAR: warns.append(f"transition type '{ttype}' not in the grammar")
        # text hierarchy over the shot
        TX = [x for x in texts if s0 <= x["t"] < s1]
        tiers = labels = words = 0; minlab = None; compete = 0
        for x in TX:
            bx = [b for b in x["boxes"] if b["role"] not in ("caption", "handle") and not (b["y"] < 260 and b["x"] > 560)]  # provenance chip zone excluded
            sizes = {round(b["fontPx"] / 2) * 2 for b in bx if b["fontPx"] > 0}
            tiers = max(tiers, len(sizes)); lab = [b for b in bx if 0 < b["fontPx"] < 60]; labels = max(labels, len(lab))
            words = max(words, sum(len(b["text"].split()) for b in bx))
            for b in lab: minlab = b["fontPx"] if minlab is None else min(minlab, b["fontPx"])
            if any(b["fontPx"] >= 72 for b in bx) and any(b["role"] == "caption" for b in x["boxes"]): compete += 1
        if TX:
            if tiers > T["tiers"]: warns.append(f"{tiers} text tiers > {T['tiers']}")
            if labels > T["labels"]: warns.append(f"{labels} labels at once > {T['labels']}")
            if words > T["words"]: warns.append(f"{words} non-caption words on screen > {T['words']}")
            if minlab is not None and minlab < T["label_px"]: warns.append(f"smallest label {minlab:.0f} px < {T['label_px']}")
            if compete and s["id"] not in ("S14", "S15"): warns.append(f"headline competes with caption in {compete} samples")
        prims = set(plan.get("primitives") or [])
        slide = bool(prims & SLIDE_PRIMS) or (emp > 0.5 and subj_mean < T["subject_min"] and nonarch)
        if slide: warns.append("slide-like composition" + (f" ({', '.join(sorted(prims & SLIDE_PRIMS))})" if prims & SLIDE_PRIMS else ""))
        out.append(dict(id=s["id"], kind=kind, start=round(s["start"], 3), end=round(s["end"], 3), measured_from=round(s0, 3), measured_to=round(s1, 3),
                        empty=round(emp, 3), subject_motion=round(subj_mean, 3), subject_median=round(subj, 3), camera_per_s=round(cam, 3),
                        states=ver, registered=reg, boundary_corr=bcorr, transition=dict(type=ttype, reason=reason, measured=meas),
                        text=dict(max_tiers=tiers, max_labels=labels, max_words=words, smallest_label_px=minlab, competing_samples=compete),
                        framing=plan.get("framing"), primitives=sorted(prims), slide_like=slide, warns=warns))
    mech = [x for x in out if x["kind"] in ("explanatory", "reconstruction")]
    summ = dict(shots=len(out), warn_shots=sum(1 for x in out if x["warns"]), warns=sum(len(x["warns"]) for x in out),
                time_weighted_empty=round(sum(x["empty"] * (x["measured_to"] - x["measured_from"]) for x in out) / max(1e-6, sum(x["measured_to"] - x["measured_from"] for x in out)), 3),
                mechanism_registered=f"{sum(1 for x in mech if x['registered'])}/{len(mech)}", slide_like=sum(1 for x in out if x["slide_like"]))
    res = dict(schema="fr-premium.creative-qa.v1", mode="WARN-only", thresholds=T, grammar=sorted(GRAMMAR), mp4=a.mp4.split("/")[-1], offset=a.offset, summary=summ, shots=out)
    for x in out:
        print(f"{x['id']:4} {x['kind'][:5]:5} empty {x['empty']:.2f} subj {x['subject_motion']:.2f} cam {x['camera_per_s']:.2f} states {sum(v['verified'] for v in x['states'])}/{len(x['states'])} "
              f"tiers {x['text']['max_tiers']} labels {x['text']['max_labels']} words {x['text']['max_words']} min {x['text']['smallest_label_px']} | " + ("; ".join(x["warns"]) or "ok"))
    print("summary:", json.dumps(summ))
    if a.out: open(a.out, "w").write(json.dumps(res, indent=1) + "\n")


if __name__ == "__main__":
    main()
