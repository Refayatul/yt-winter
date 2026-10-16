#!/usr/bin/env python3
"""Anchor review package: one card per anchor suggestion, for a human to VERIFY or REJECT.

    python3 -I scripts/fr-premium/anchor_review.py --plan-dir <topic>/plan --asset-dir DIR --out DIR

Each card shows the original image (whole, with the suggestion drawn) and a close-up, the suggested
anchor, the intended component, the supporting source (the claim passage it was found in, or only the
image's own caption), the engine's confidence and the expected use in the current plan (from the
planner report). It writes review-sheet-N.png pages and anchor-review.json. It never changes a status:
every suggestion stays SUGGESTED until a human edits anchor-suggestions.json (status, review.by, review.at).
"""
import argparse, json, os, re, subprocess

KEEP = {"leader-target", "diagram-label", "subject-box", "region-of-interest", "claim-line", "figure-boundary"}


def magick(*a):
    subprocess.run(["magick", *a], check=True, capture_output=True, timeout=120)


def uses(report, plan):
    """suggestion id -> expected use, from the planner's issues and upgrades."""
    out = {}
    for i in report.get("issues", []):
        for sid in re.findall(r"SG-[a-z0-9-]+", i.get("detail", "")):
            out[sid] = f"{i.get('line')}: {i['code']} - would become the shot's point of interest once verified and tied to a claim"
    for u in report.get("upgrades", []):
        for sid in u.get("suggestions", []):
            out[sid] = f"{u['line']}: {u['code']} - candidate part geometry for the component scene (measured mode)"
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--plan-dir", required=True); ap.add_argument("--asset-dir", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--all", action="store_true", help="include raw OCR lines")
    a = ap.parse_args(argv)
    J = lambda f: json.load(open(os.path.join(a.plan_dir, f)))
    assets, ev, sug = J("assets.json")["assets"], J("evidence.json")["claims"], J("anchor-suggestions.json")["suggestions"]
    rep = J("auto/planner-report.json"); plan = J("auto/shot-plan.auto.json"); use = uses(rep, plan)
    parts = {q["kind"]: q["id"] for sc in plan.get("shared", {}).values() for q in sc.get("parts", [])}
    os.makedirs(a.out, exist_ok=True); cards = []; rows = []
    pick = [s for s in sug if a.all or s["method"] in KEEP or s["id"] in use]
    # suggestions with a planned use first, then by confidence
    pick.sort(key=lambda s: (s["id"] not in use, -s.get("confidence", 0)))
    for s in pick:
        A = assets[s["asset"]]; src = os.path.join(a.asset_dir, A["file"]); fw = int(subprocess.run(["magick", "identify", "-format", "%w", src + "[0]"], capture_output=True, text=True).stdout)
        k = fw / A["width"]  # asset px -> file px
        if "rect" in s:
            r = s["rect"]; x0, y0, x1, y1 = r["x"] * k, r["y"] * k, (r["x"] + r["w"]) * k, (r["y"] + r["h"]) * k
            draw = f"rectangle {x0:.0f},{y0:.0f} {x1:.0f},{y1:.0f}"; cx, cy, ext = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) * 1.6 + 60 * k
        else:
            px, py = s["point"][0] * k, s["point"][1] * k; rad = max(6, fw / 80)
            draw = f"circle {px:.0f},{py:.0f} {px + rad:.0f},{py:.0f}"; cx, cy, ext = px, py, max(120, fw / 6)
        sw = max(2, fw / 300)
        whole, close = os.path.join(a.out, f"_{s['id']}_w.png"), os.path.join(a.out, f"_{s['id']}_c.png")
        magick(src + "[0]", "-colorspace", "sRGB", "-fill", "none", "-stroke", "#ff3b30", "-strokewidth", f"{sw:.1f}", "-draw", draw, "-resize", "520x300", "-background", "#222", "-gravity", "center", "-extent", "520x300", whole)
        cw = max(40, ext); gx, gy = max(0, cx - cw / 2), max(0, cy - cw / 2)
        magick(src + "[0]", "-colorspace", "sRGB", "-fill", "none", "-stroke", "#ff3b30", "-strokewidth", f"{sw:.1f}", "-draw", draw, "-crop", f"{cw:.0f}x{cw:.0f}+{gx:.0f}+{gy:.0f}", "+repage", "-filter", "point", "-resize", "520x300", "-background", "#222", "-gravity", "center", "-extent", "520x300", close)
        comp = s.get("component") or s.get("label") or "-"
        intended = f"scene part '{parts[k2]}'" if (k2 := next((kk for kk in parts if comp and kk in str(comp).lower()), None)) else (comp if comp != "-" else ("photo subject (no claim attached)" if s["method"] in ("subject-box", "region-of-interest") else "-"))
        support = f"{s['claim']}: \"{ev[s['claim']]['passage'][:150]}\"" if s.get("claim") and s["claim"] in ev else f"no claim; image caption only: \"{(A['source'].get('caption') or A['source']['title'])[:140]}\""
        row = {"id": s["id"], "asset": s["asset"], "file": A["file"], "method": s["method"], "role": s["role"], "rect": s.get("rect"), "point": s.get("point"),
               "label": s.get("label") or s.get("text"), "intendedComponent": intended, "supportingSource": support, "confidence": s.get("confidence"),
               "expectedUse": use.get(s["id"], "not used by the current plan"), "status": s["status"], "basis": s["basis"],
               "rawConfidence": s.get("rawConfidence"), "assessment": s.get("assessment", "-"), "assessmentReason": s.get("assessmentReason")}
        rows.append(row)
        txt = (f"{s['id']}  [{s['status']}]{'  ASSESSED NEEDS_HUMAN_REVIEW' if s.get('assessment') else ''}\nasset: {s['asset']}  method: {s['method']}  confidence: {s.get('confidence')} (raw {s.get('rawConfidence')})\n"
               + (f"why: {s['assessmentReason']}\n" if s.get("assessmentReason") else "") +
               f"intended: {intended}\nsource: {support}\nuse: {row['expectedUse']}\nhuman: [ ] VERIFY   [ ] REJECT   by ____  date ____")
        tf = os.path.join(a.out, f"_{s['id']}_t.png")
        magick("-size", "1040x230", "-background", "#111", "-fill", "#eee", "-font", "DejaVu-Sans" if False else "Helvetica", "-pointsize", "17", f"caption:{txt}", tf)
        card = os.path.join(a.out, f"_{s['id']}.png")
        magick("(", whole, close, "+append", ")", tf, "-append", "-bordercolor", "#444", "-border", "3", card)
        cards.append(card)
    pages = []
    for n in range(0, len(cards), 6):
        out = os.path.join(a.out, f"review-sheet-{n // 6 + 1}.png")
        subprocess.run(["magick", "montage", *cards[n:n + 6], "-tile", "2x3", "-geometry", "+8+8", "-background", "#000", out], check=True, timeout=180)
        pages.append(os.path.basename(out))
    for f in os.listdir(a.out):
        if f.startswith("_"):
            os.remove(os.path.join(a.out, f))
    json.dump({"schema": "fr-premium.anchor-review.v1", "note": "every suggestion is SUGGESTED; a human edits anchor-suggestions.json to VERIFIED or REJECTED with review.by and review.at",
               "pages": pages, "cards": rows}, open(os.path.join(a.out, "anchor-review.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(rows)} cards on {len(pages)} pages -> {a.out}")


if __name__ == "__main__":
    main()
