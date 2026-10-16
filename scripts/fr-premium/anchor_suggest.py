#!/usr/bin/env python3
"""Anchor Suggestion Engine V1: free, local suggestions for image and document anchors.

    python3 -I scripts/fr-premium/anchor_suggest.py --assets assets.json --asset-dir DIR --evidence evidence.json \
        --out anchor-suggestions.json [--only key1,key2] [--eval]

Methods (all local: tesseract + ImageMagick for decoding + numpy):
  ocr-text          text lines (tesseract TSV), on 3x-upscaled copies of small images
  document-heading  tall or upper-case lines near the top of a document
  diagram-label     upper-case labels on drawings; matched to the component vocabulary
  claim-line        an OCR line whose words are in a claim's passage (document-line + claim)
  leader-target     the far end of the thin leader line that starts at a diagram label (technical component)
  figure-boundary   the largest non-text ink region of a document page
  subject-box       the largest region that differs from the frame border (photos)
  region-of-interest  the window with the highest edge density (photos)

Every output has status SUGGESTED. Nothing here verifies an anchor, ties an anchor to a claim it did
not find verbatim, or writes assets.json: a human changes the status to VERIFIED or REJECTED
(review.by, review.at), and only VERIFIED suggestions may be cited from assets.json (validator).
Downloaded files are untrusted: the type is checked from magic bytes, size and pixel count are
capped, decoding runs in ImageMagick/tesseract subprocesses with timeouts, and OCR text is data
(it never becomes on-screen text unless it is in a verified claim's passage).
"""
import argparse, json, os, re, subprocess, sys, time

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

MAGIC = {b"\xff\xd8\xff": "jpeg", b"\x89PNG": "png", b"GIF8": "gif"}
MAX_BYTES, MAX_PIXELS = 60 * 1024 * 1024, 60_000_000
VOCAB = ["heater", "heating element", "switch", "thermostat", "sensor", "probe", "fan", "motor", "wire", "wiring", "tank", "valve",
         "o-ring", "seal", "pin", "tang", "clevis", "insulation", "supply", "gage", "gaging", "pump", "line", "tube", "joint"]


# Confidence calibration (V1.1). A raw score says how clean the signal was, not whether it names the right object.
# Each method gets a ceiling from what it can know; methods with no way to tell WHICH object they found (no subject
# model, no held-out accuracy) are always assessed NEEDS_HUMAN_REVIEW. Ceilings were set from the failure analysis of
# the Apollo review cards, not by re-tuning on the Challenger evaluation images (whose recall is reported unchanged).
CEILING = {"claim-line": 0.8, "ocr-text": 0.7, "document-heading": 0.5, "figure-boundary": 0.6, "diagram-label": 0.6,
           "leader-target": 0.35, "subject-box": 0.3, "region-of-interest": 0.15}
ALWAYS_REVIEW = {"leader-target": "the leader's far end is where a line stops, not proven to be the named part (no held-out accuracy)",
                 "subject-box": "separates foreground from background; it cannot tell which object is the subject",
                 "region-of-interest": "the densest-edge window; it has no subject model (on a launch photo it picks the gantry lattice)"}
LEAD = re.compile(r"^\s*TO\s+", re.I)  # "TO HEATER", "TO FAN 2": a connection lead's destination, not the part itself


class Unsafe(Exception):
    pass


def check_file(path):
    st = os.stat(path)
    if st.st_size > MAX_BYTES:
        raise Unsafe(f"{path}: {st.st_size} bytes exceeds {MAX_BYTES}")
    with open(path, "rb") as f:
        head = f.read(8)
    kind = next((v for k, v in MAGIC.items() if head.startswith(k)), None)
    if not kind:
        raise Unsafe(f"{path}: not a JPEG/PNG/GIF image (magic {head[:4]!r})")
    return kind


def run(cmd, timeout=120):
    return subprocess.run(cmd, capture_output=True, timeout=timeout, check=True).stdout


def load_gray(path):
    """8-bit grayscale array via ImageMagick (first frame only)."""
    out = run(["magick", path + "[0]", "-strip", "-colorspace", "Gray", "-depth", "8", "pgm:-"])
    m = re.match(rb"P5\s+(?:#[^\n]*\n\s*)*(\d+)\s+(?:#[^\n]*\n\s*)*(\d+)\s+(?:#[^\n]*\n\s*)*(\d+)\s", out)
    w, h = int(m.group(1)), int(m.group(2))
    if w * h > MAX_PIXELS:
        raise Unsafe(f"{path}: {w}x{h} exceeds {MAX_PIXELS} pixels")
    return np.frombuffer(out[m.end():m.end() + w * h], np.uint8).reshape(h, w).astype(np.float32)


def ocr_lines(path, w, psm):
    """Tesseract TSV -> lines [{text, rect (source px), conf, h}] (small images are upscaled 3x first)."""
    scale = 3 if w < 1400 else 1
    src = path
    if scale > 1:
        src = path + ".x3.png"
        run(["magick", path + "[0]", "-colorspace", "Gray", "-resize", "300%", "-sharpen", "0x1", src])
    tsv = run(["tesseract", src, "stdout", "--psm", str(psm), "tsv"], timeout=180).decode("utf8", "replace")
    if scale > 1:
        os.remove(src)
    rows = [r.split("\t") for r in tsv.splitlines()[1:]]
    words = [dict(b=r[2], p=r[3], l=r[4], x=int(r[6]), y=int(r[7]), w=int(r[8]), h=int(r[9]), conf=float(r[10]), t=r[11].strip())
             for r in rows if len(r) >= 12 and r[11].strip() and float(r[10]) >= 30]
    groups = {}
    for wd in words:
        groups.setdefault((wd["b"], wd["p"], wd["l"]), []).append(wd)
    lines = []
    for g in groups.values():
        x0 = min(a["x"] for a in g); y0 = min(a["y"] for a in g); x1 = max(a["x"] + a["w"] for a in g); y1 = max(a["y"] + a["h"] for a in g)
        lines.append({"text": " ".join(a["t"] for a in g), "rect": {"x": round(x0 / scale), "y": round(y0 / scale), "w": max(1, round((x1 - x0) / scale)), "h": max(1, round((y1 - y0) / scale))},
                      "conf": round(sum(a["conf"] for a in g) / len(g), 1)})
    return sorted(lines, key=lambda l: (l["rect"]["y"], l["rect"]["x"]))


def norm_words(s):
    return [w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 1]


def is_label(t):
    """Short upper-case ("HEATING ELEMENT") or title-case ("Primary O-Ring") text, not a caption sentence."""
    ws = re.findall(r"[A-Za-z][A-Za-z-]*", t)
    if not ws or len(ws) > 4 or len("".join(ws)) < 3:
        return False
    return t.upper() == t or all(w[0].isupper() for w in ws if len(w) > 2)


def merge_labels(lines):
    """Stack vertically adjacent label lines into one label ("CAPACITANCE / GAGING / PROBE", "Secondary / O-Ring")."""
    caps = [l for l in lines if is_label(l["text"]) and l["conf"] >= 60 and not re.match(r"^(Figure|Fig\.)", l["text"])]
    out = []
    for l in caps:
        r = l["rect"]
        for o in out:
            q = o["rect"]
            cap = 3 if o["text"].upper() == o["text"] else 2
            if o.get("n", 1) < cap and abs((q["x"] + q["w"] / 2) - (r["x"] + r["w"] / 2)) < max(q["w"], r["w"]) * 0.6 and 0 <= r["y"] - (q["y"] + q["h"]) < r["h"] * 0.9:
                x0, y0 = min(q["x"], r["x"]), q["y"]; x1, y1 = max(q["x"] + q["w"], r["x"] + r["w"]), r["y"] + r["h"]
                o.update(text=o["text"] + " " + l["text"], rect={"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}, conf=min(o["conf"], l["conf"]), n=o.get("n", 1) + 1)
                break
        else:
            out.append(dict(l))
    return out


def components(mask, min_px=1):
    """4-connected components of a boolean array: list of (count, y0, x0, y1, x1, pixels)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    ys, xs = np.nonzero(mask)
    n = 0
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]:
            continue
        n += 1
        stack = [(sy, sx)]; lab[sy, sx] = n; pts = []
        while stack:
            y, x = stack.pop(); pts.append((y, x))
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; stack.append((yy, xx))
        if len(pts) >= min_px:
            py = [p[0] for p in pts]; px = [p[1] for p in pts]
            out.append((len(pts), min(py), min(px), max(py), max(px), pts))
    return out


def box_mean(a, r):
    """Mean over a (2r+1)^2 window via summed-area tables."""
    p = np.pad(a, r + 1, mode="edge").cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = p[k:, k:] - p[:-k, k:] - p[k:, :-k] + p[:-k, :-k]
    return s[:a.shape[0], :a.shape[1]] / (k * k)


def leader_target(g, label_rect, max_len=320):
    """Cast straight rays from just outside a label box; the longest dark run is the leader line, and its
    far end is the suggested part point (source px). Leaders on technical drawings are straight segments."""
    dark = g < 170
    hgt, wid = g.shape
    r = label_rect; off = 3
    xs = list(range(r["x"] - off, r["x"] + r["w"] + off + 1, 3)); ys = list(range(r["y"] - off, r["y"] + r["h"] + off + 1, 3))
    starts = [(x, r["y"] - off) for x in xs] + [(x, r["y"] + r["h"] + off) for x in xs] + [(r["x"] - off, y) for y in ys] + [(r["x"] + r["w"] + off, y) for y in ys]
    ang = np.deg2rad(np.arange(0, 360, 2.0)); steps = np.arange(0, max_len)
    dx, dy = np.cos(ang)[:, None], np.sin(ang)[:, None]
    best = (0, None)
    cx, cy = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
    for sx, sy in starts:
        X = np.rint(sx + dx * steps).astype(int); Y = np.rint(sy + dy * steps).astype(int)
        inb = (X >= 1) & (X < wid - 1) & (Y >= 1) & (Y < hgt - 1)
        Xc, Yc = np.clip(X, 1, wid - 2), np.clip(Y, 1, hgt - 2)
        d = (dark[Yc, Xc] | dark[Yc, Xc + 1] | dark[Yc + 1, Xc]) & inb
        # never along or back into the label itself
        inside = (X >= r["x"] - 1) & (X <= r["x"] + r["w"] + 1) & (Y >= r["y"] - 1) & (Y <= r["y"] + r["h"] + 1)
        d &= ~inside
        # bridge gaps of up to 2 px, then the run from the start
        dd = d.copy()
        for k in range(1, 5):
            dd[:, :-k] |= d[:, k:]
        run = np.argmin(dd, axis=1); run[dd.all(axis=1)] = max_len
        ok = dd[:, :4].any(axis=1) & ((sx + dx[:, 0] * 10 - cx) ** 2 + (sy + dy[:, 0] * 10 - cy) ** 2 > (sx - cx) ** 2 + (sy - cy) ** 2)
        run = np.where(ok, run, 0)
        k = int(np.argmax(run))
        if run[k] > best[0]:
            best = (int(run[k]), (sx + dx[k, 0] * run[k], sy + dy[k, 0] * run[k]))
    if best[1] is None or best[0] < 25 or best[0] >= max_len:
        return None
    return [int(round(best[1][0])), int(round(best[1][1]))]


def figure_boundary(g):
    s = max(1, int(max(g.shape) / 400))
    small = g[::s, ::s]
    ink = (small < 150).astype(np.float32)
    blob = box_mean(ink, 4) > 0.06
    comps = [c for c in components(blob, 50) if (c[3] - c[1]) > 0.12 * small.shape[0] and (c[4] - c[2]) > 0.12 * small.shape[1]]
    out = []
    for c in sorted(comps, key=lambda c: -c[0])[:2]:
        hh, ww = c[3] - c[1] + 1, c[4] - c[2] + 1
        fill = c[0] / (hh * ww)
        if ww / hh > 8:  # a text line, not a figure
            continue
        out.append(({"x": c[2] * s, "y": c[1] * s, "w": ww * s, "h": hh * s}, round(min(0.9, 0.4 + fill), 2)))
    return out


def subject_box(g):
    s = max(1, int(max(g.shape) / 300))
    small = g[::s, ::s]
    border = np.concatenate([small[0], small[-1], small[:, 0], small[:, -1]])
    med = float(np.median(border)); spread = float(np.percentile(np.abs(border - med), 90)) + 8
    diff = np.abs(small - med) > max(28.0, 2.5 * spread)
    diff = box_mean(diff.astype(np.float32), 2) > 0.5
    comps = components(diff, 30)
    if not comps:
        return None
    c = max(comps, key=lambda c: c[0])
    area = (c[3] - c[1] + 1) * (c[4] - c[2] + 1) / (small.shape[0] * small.shape[1])
    if area > 0.85:
        return None  # the "subject" is the whole frame: nothing separable
    return {"x": c[2] * s, "y": c[1] * s, "w": (c[4] - c[2] + 1) * s, "h": (c[3] - c[1] + 1) * s}, round(min(0.85, 0.35 + c[0] / ((c[3] - c[1] + 1) * (c[4] - c[2] + 1)) * 0.5), 2)


def region_of_interest(g):
    s = max(1, int(max(g.shape) / 400))
    small = g[::s, ::s]
    gy, gx = np.gradient(small)
    mag = np.hypot(gx, gy)
    r = max(6, int(min(small.shape) * 0.08))
    m = box_mean(mag, r)
    y, x = np.unravel_index(int(np.argmax(m)), m.shape)
    return {"x": max(0, (x - r) * s), "y": max(0, (y - r) * s), "w": (2 * r + 1) * s, "h": (2 * r + 1) * s}, round(float(min(0.7, m[y, x] / (mag.mean() * 6 + 1e-6))), 2)


def suggest(key, asset, path, claims):
    t0 = time.time()
    check_file(path)
    g = load_gray(path)
    fh, fw = g.shape
    sx, sy = asset["width"] / fw, asset["height"] / fh  # file px -> asset (source) px
    S = lambda r: {"x": round(r["x"] * sx), "y": round(r["y"] * sy), "w": max(1, round(r["w"] * sx)), "h": max(1, round(r["h"] * sy))}
    out = []; n = [0]

    def add(method, role, conf, basis, rect=None, point=None, **kw):
        n[0] += 1
        s = {"id": f"SG-{key}-{n[0]}", "asset": key, "method": method, "role": role, "confidence": round(min(conf, CEILING.get(method, 0.5)), 2), "rawConfidence": conf, "status": "SUGGESTED", "basis": basis}
        why = ALWAYS_REVIEW.get(method) or kw.pop("review", None)
        if why: s["assessment"] = "NEEDS_HUMAN_REVIEW"; s["assessmentReason"] = why
        if rect: s["rect"] = S(rect)
        if point: s["point"] = [round(point[0] * sx), round(point[1] * sy)]
        s.update({k: v for k, v in kw.items() if v is not None})
        out.append(s)

    is_doc = asset["kind"] == "document" or "drawing" in (asset.get("tags") or [])
    timings = {}
    if is_doc:
        t = time.time(); lines = ocr_lines(path, fw, 11 if "drawing" in (asset.get("tags") or []) else 4); timings["ocr"] = round(time.time() - t, 2)
        med = float(np.median([l["rect"]["h"] for l in lines])) if lines else 0
        for l in lines:
            add("ocr-text", "text-line", round(l["conf"] / 100, 2), f"tesseract line '{l['text'][:60]}' conf {l['conf']}", rect=l["rect"], text=l["text"])
        for l in lines:
            if l["rect"]["y"] < fh * 0.25 and (l["rect"]["h"] > 1.3 * med or (l["text"].isupper() and len(l["text"]) > 6)):
                add("document-heading", "document-block", round(0.5 * l["conf"] / 100, 2), f"heading-like line '{l['text'][:60]}'", rect=l["rect"], label=l["text"])
        # claim lines: most of an OCR line's words occur in a claim passage (and are distinctive)
        for cid, c in claims.items():
            pw = set(norm_words(c.get("passage", "")))
            if not pw:
                continue
            for l in lines:
                lw = norm_words(l["text"])
                if len(lw) >= 3:
                    share = sum(w in pw for w in lw) / len(lw)
                    if share >= 0.75:
                        add("claim-line", "document-line", round(share * l["conf"] / 100, 2), f"{share:.0%} of OCR line '{l['text'][:50]}' is in {cid}'s passage", rect=l["rect"], claim=cid, text=l["text"])
        if "drawing" in (asset.get("tags") or []):
            t = time.time()
            for lab in merge_labels(lines):
                lead = bool(LEAD.match(lab["text"]))
                # a part-named label inside a cluster of lead labels ("TO" within ~2 lines, overlapping columns) may itself be a
                # lead whose "TO" was not read; it is never trusted as the part
                r0 = lab["rect"]; near_lead = not lead and any(re.match(r"^\s*TO\b", l["text"], re.I) and l["rect"] is not r0 and abs(l["rect"]["y"] - r0["y"]) <= 2.5 * max(r0["h"], 6)
                    and l["rect"]["x"] < r0["x"] + r0["w"] + 20 and l["rect"]["x"] + l["rect"]["w"] > r0["x"] - 20 for l in lines)
                comp = None if lead else next((v for v in VOCAB if v in lab["text"].lower()), None)
                add("diagram-label", "document-block", round(lab["conf"] / 100, 2), f"upper-case label '{lab['text']}'", rect=lab["rect"], label=lab["text"].title(), component=comp,
                    leadTo=(LEAD.sub("", lab["text"]).title() if lead else None), review=("a 'TO ...' label names where a lead goes, not the part" if lead else "label sits among 'TO ...' lead labels: it may name a lead's destination, not the part" if near_lead else None))
                tgt = leader_target(g, lab["rect"])
                if tgt:
                    add("leader-target", "connection-lead" if lead else "mechanism-part", round(0.45 * lab["conf"] / 100, 2), f"far end of the leader line from label '{lab['text']}'", point=tgt, label=lab["text"].title(), component=comp)
            timings["labels"] = round(time.time() - t, 2)
        t = time.time()
        for r, conf in figure_boundary(g):
            add("figure-boundary", "document-block", conf, "largest non-text ink region", rect=r)
        timings["figure"] = round(time.time() - t, 2)
    else:
        t = time.time(); sb = subject_box(g); timings["subject"] = round(time.time() - t, 2)
        if sb:
            add("subject-box", "subject", sb[1], "largest region that differs from the frame border", rect=sb[0])
        t = time.time(); roi = region_of_interest(g); timings["roi"] = round(time.time() - t, 2)
        add("region-of-interest", "point-of-interest", roi[1], "highest edge-density window (no claim attached)", rect=roi[0])
    return out, {"asset": key, "seconds": round(time.time() - t0, 2), "steps": timings, "file_px": [fw, fh]}


def iou(a, b):
    x0, y0 = max(a["x"], b["x"]), max(a["y"], b["y"]); x1, y1 = min(a["x"] + a["w"], b["x"] + b["w"]), min(a["y"] + a["h"], b["y"] + b["h"])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    return inter / (a["w"] * a["h"] + b["w"] * b["h"] - inter) if inter else 0.0


COMPATIBLE = {  # which suggestion methods may stand for which verified anchor role (a text box centre is not a ring)
    "point-of-interest": {"subject-box", "region-of-interest", "leader-target"}, "subject": {"subject-box", "region-of-interest", "leader-target"},
    "traceable-part": {"subject-box", "leader-target"}, "mechanism-ring": {"leader-target"}, "mechanism-part": {"leader-target", "diagram-label"},
    "registration": set(), "mechanism-scale": set(),
    "document-line": {"claim-line", "ocr-text"}, "document-block": {"ocr-text", "document-heading", "diagram-label", "figure-boundary", "claim-line"},
}


def same_part(s, name, v):
    """A leader-target stands for a named part only if its label names it ("Clevis Pin" -> clevis-pin)."""
    if s["method"] != "leader-target":
        return True
    want = set(re.findall(r"[a-z]{3,}", (name + " " + v.get("label", "")).lower())) - {"ring", "oring"}
    return bool(want & set(re.findall(r"[a-z]{3,}", s.get("label", "").lower())))


def evaluate(assets, sugg):
    """Compare role-compatible suggestions with verified anchors (rect: IoU >= 0.5; point: within 12 px or 3% of the diagonal)."""
    rows = []
    for key, a in assets["assets"].items():
        allmine = [s for s in sugg if s["asset"] == key]
        diag = (a["width"] ** 2 + a["height"] ** 2) ** 0.5
        for name, v in (a.get("anchors") or {}).items():
            if v.get("space") != "source-px":
                continue
            ok = COMPATIBLE.get(v.get("role"), set())
            mine = [s for s in allmine if s["method"] in ok and same_part(s, name, v)]
            if not ok:
                rows.append({"asset": key, "anchor": name, "kind": "point" if "point" in v else "rect" if "rect" in v else "other", "role": v.get("role"), "best": None, "hit": False, "by": None, "suggestion": None, "outOfScope": True})
                continue
            if "rect" in v:
                cands = [(iou(v["rect"], s["rect"]), s) for s in mine if "rect" in s]
                best = max(cands, key=lambda c: c[0], default=(0.0, None))
                R = v["rect"]; pin = [s for s in mine if "point" in s and R["x"] <= s["point"][0] <= R["x"] + R["w"] and R["y"] <= s["point"][1] <= R["y"] + R["h"]]
                rows.append({"asset": key, "anchor": name, "kind": "rect", "role": v.get("role"), "best": round(best[0], 3), "hit": best[0] >= 0.5 or bool(pin), "by": (best[1]["method"] if best[0] >= 0.5 else pin[0]["method"] if pin else best[1]["method"] if best[1] else None),
                             "suggestion": best[1]["id"] if best[0] >= 0.5 else pin[0]["id"] if pin else None, **({"pointInRect": pin[0]["id"]} if pin and best[0] < 0.5 else {})})
            elif "point" in v:
                pts = [(s["point"] if "point" in s else [s["rect"]["x"] + s["rect"]["w"] / 2, s["rect"]["y"] + s["rect"]["h"] / 2], s) for s in mine]
                best = min(((((p[0] - v["point"][0]) ** 2 + (p[1] - v["point"][1]) ** 2) ** 0.5, s) for p, s in pts), key=lambda c: c[0], default=(None, None))
                tol = max(12, 0.03 * diag)
                rows.append({"asset": key, "anchor": name, "kind": "point", "role": v.get("role"), "best": None if best[0] is None else round(best[0], 1), "tolerance": round(tol, 1),
                             "hit": best[0] is not None and best[0] <= tol, "by": best[1]["method"] if best[1] else None, "suggestion": best[1]["id"] if best[1] else None})
    rows = [r for r in rows if r["kind"] in ("rect", "point")]
    hits = sum(r["hit"] for r in rows); scope = [r for r in rows if not r.get("outOfScope")]
    return {"anchors": len(rows), "hits": hits, "recall": round(hits / len(rows), 3) if rows else None, "inScope": len(scope), "recallInScope": round(hits / len(scope), 3) if scope else None, "rows": rows,
            "note": "a hit means a suggestion lands on a known verified anchor; it does not make the suggestion verified"}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", required=True); ap.add_argument("--asset-dir", required=True); ap.add_argument("--evidence")
    ap.add_argument("--out", required=True); ap.add_argument("--only"); ap.add_argument("--eval", action="store_true")
    a = ap.parse_args(argv)
    if np is None:
        sys.exit("numpy is required")
    assets = json.load(open(a.assets)); claims = {k: c for k, c in (json.load(open(a.evidence))["claims"] if a.evidence else {}).items() if c.get("status") == "verified"}
    only = set(a.only.split(",")) if a.only else None
    allsug, times, skipped = [], [], []
    for key, asset in assets["assets"].items():
        if only and key not in only:
            continue
        p = os.path.join(a.asset_dir, asset["file"])
        if asset["kind"] == "clip" or not os.path.exists(p):
            skipped.append({"asset": key, "reason": "clip" if asset["kind"] == "clip" else "file not available"}); continue
        try:
            s, t = suggest(key, asset, p, claims)
        except Unsafe as e:
            skipped.append({"asset": key, "reason": f"unsafe: {e}"}); continue
        allsug += s; times.append(t)
    doc = {"schema": "fr-premium.anchor-suggestions.v1", "topic": assets["topic"], "engine": "anchor_suggest.py v1 (tesseract + numpy, local)",
           "states": "SUGGESTED until a human sets VERIFIED or REJECTED with review.by and review.at", "suggestions": allsug, "timing": times, "skipped": skipped}
    if a.eval:
        doc["evaluation"] = evaluate(assets, allsug)
    json.dump(doc, open(a.out, "w"), indent=1, ensure_ascii=False); open(a.out, "a").write("\n")
    print(f"{len(allsug)} suggestions on {len(times)} assets in {sum(t['seconds'] for t in times):.1f} s; skipped {len(skipped)}")
    if a.eval:
        e = doc["evaluation"]; print(f"known anchors: {e['anchors']}, hits {e['hits']} (recall {e['recall']}; in scope {e['inScope']}, recall {e['recallInScope']})")
        for r in e["rows"]:
            print(f"  {r['asset']}#{r['anchor']:<18} {r['kind']:<5} {'HIT ' if r['hit'] else 'miss'} best={r['best']} by={r['by']}")


if __name__ == "__main__":
    main()
