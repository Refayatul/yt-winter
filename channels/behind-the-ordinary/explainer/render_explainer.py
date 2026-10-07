#!/usr/bin/env python3
"""The Hidden Logic of Things — 2D explainer clips.

Renders one storyboard scene as a short 1080x1920 animated clip (Pillow frames
piped into FFmpeg). Every primitive is drawn from vectors, so nothing here is
presented as documentary footage; it is a diagram that explains the narration.

Usage: render_explainer.py <spec.json> <output.mp4> <ffmpeg>
Spec: {"kind": ..., "duration": seconds, ...kind fields}
Kinds: glyph-merge, unite, name-card, shortlist, diagram, timeline, qr-finder.
"""

import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
# Burned captions sit around y≈1250-1400; explainer content stays above them.
CY = 680
SS = 2  # supersampling for clean anti-aliased strokes

# Brand palette (brand.json): warm charcoal, paper, amber, teal.
BG = (21, 19, 15)
BG2 = (34, 31, 25)
PAPER = (243, 234, 216)
MUTED = (150, 142, 128)
AMBER = (242, 173, 69)
TEAL = (78, 179, 165)
RED = (226, 96, 80)

FONT_CANDIDATES = {
    "bold": [
        "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ],
    "regular": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
}


def font(weight, size):
    for candidate in FONT_CANDIDATES[weight]:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size * SS)
    return ImageFont.load_default()


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def phase(t, start, end):
    return ease((t - start) / max(1e-6, end - start))


def lerp(a, b, k):
    return a + (b - a) * k


def mix(c1, c2, k):
    return tuple(int(lerp(a, b, k)) for a, b in zip(c1, c2))


def canvas():
    img = Image.new("RGB", (W * SS, H * SS), BG)
    d = ImageDraw.Draw(img)
    # Soft radial lift behind the subject, no grid, no neon.
    for r in range(9, 0, -1):
        k = r / 9
        rad = int(820 * k * SS)
        d.ellipse([W * SS // 2 - rad, CY * SS - rad, W * SS // 2 + rad, CY * SS + rad], fill=mix(BG2, BG, k))
    return img, d


def finish(img):
    return img.resize((W, H), Image.LANCZOS)


def text(d, xy, value, size, color, weight="bold", anchor="mm", alpha=1.0):
    if alpha <= 0.01:
        return
    color = mix(BG, color, alpha)
    d.text((xy[0] * SS, xy[1] * SS), value, font=font(weight, size), fill=color, anchor=anchor)


def stroke(d, points, color, width, progress=1.0):
    """Polyline drawn up to `progress` of its length (animated path)."""
    if progress <= 0:
        return
    segs = list(zip(points, points[1:]))
    lengths = [math.dist(a, b) for a, b in segs]
    total = sum(lengths) * progress
    for (a, b), length in zip(segs, lengths):
        if total <= 0:
            break
        k = min(1.0, total / length) if length else 1.0
        end = (lerp(a[0], b[0], k), lerp(a[1], b[1], k))
        d.line([(a[0] * SS, a[1] * SS), (end[0] * SS, end[1] * SS)], fill=color, width=int(width * SS), joint="curve")
        r = width * SS / 2
        for p in (a, end):
            d.ellipse([p[0] * SS - r, p[1] * SS - r, p[0] * SS + r, p[1] * SS + r], fill=color)
        total -= length


# Rune geometry in unit space: stem from (0,-1) to (0,1), y down.
RUNES = {
    # Long-branch hagall: a stem crossed by two diagonals.
    "hagall": [[(0, -1), (0, 1)], [(-0.5, -0.5), (0.5, 0.5)], [(0.5, -0.5), (-0.5, 0.5)]],
    # Berkanan: a stem with two angular bowls.
    "berkanan": [[(0, -1), (0, 1)], [(0, -1), (0.5, -0.5), (0, 0), (0.5, 0.5), (0, 1)]],
}


def rune(d, name, cx, cy, scale, color, width, progress=1.0):
    for path in RUNES[name]:
        stroke(d, [(cx + x * scale, cy + y * scale) for x, y in path], color, width, progress)


def glyph_merge(spec, t, T):
    """Two runes drawn apart, then slid together into one bind-rune."""
    img, d = canvas()
    reveal = spec.get("mode", "reveal")  # "tease" hides the letter labels
    labels = spec.get("labels", ["H", "B"])
    draw_in = phase(t, 0.0, T * 0.28)
    slide = phase(t, T * 0.42, T * 0.72)
    settle = phase(t, T * 0.72, T * 0.9)
    left_x = lerp(300, 540, slide)
    right_x = lerp(780, 540, slide)
    cy, scale = CY - 40, 330
    hag_color = mix(PAPER, AMBER, settle)
    ber_color = mix(PAPER, AMBER, settle)
    rune(d, "hagall", left_x, cy, scale * 0.62, hag_color, 26, draw_in)
    rune(d, "berkanan", right_x, cy, scale * 0.62, ber_color, 26, draw_in)
    label_alpha = phase(t, T * 0.22, T * 0.36) * (1 - slide)
    if reveal == "reveal":
        text(d, (300, 1000), labels[0], 110, TEAL, alpha=label_alpha)
        text(d, (780, 1000), labels[1], 110, TEAL, alpha=label_alpha)
        text(d, (300, 1085), spec.get("leftCaption", "rune for H"), 46, MUTED, "regular", alpha=label_alpha)
        text(d, (780, 1085), spec.get("rightCaption", "rune for B"), 46, MUTED, "regular", alpha=label_alpha)
    else:
        text(d, (300, 1000), "?", 110, TEAL, alpha=label_alpha)
        text(d, (780, 1000), "?", 110, TEAL, alpha=label_alpha)
    final = spec.get("result")
    if final:
        text(d, (540, 1010), final, 72, PAPER, alpha=settle)
    if spec.get("resultCaption"):
        text(d, (540, 1090), spec["resultCaption"], 46, MUTED, "regular", alpha=settle)
    return finish(img)


def unite(spec, t, T):
    """Rows of two nodes joined by a drawn link, each with a centre label."""
    img, d = canvas()
    rows = spec["rows"]
    n = len(rows)
    span = T / n
    top = CY - (n - 1) * 230
    for i, row in enumerate(rows):
        y = top + i * 460
        start = i * span
        a = phase(t, start, start + span * 0.3)
        link = phase(t, start + span * 0.25, start + span * 0.7)
        lab = phase(t, start + span * 0.55, start + span * 0.85)
        color = TEAL if i % 2 == 0 else AMBER
        for x, name in ((250, row[0]), (830, row[1])):
            r = 120
            d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], outline=mix(BG, PAPER, a), width=8 * SS)
            text(d, (x, y), name, 46 if len(name) < 9 else 38, PAPER, alpha=a)
        stroke(d, [(370, y), (710, y)], color, 14, link)
        if len(row) > 2:
            text(d, (540, y - 175), row[2], 50, color, alpha=lab)
        if len(row) > 3:
            text(d, (540, y + 170), row[3], 44, MUTED, "regular", alpha=lab)
    return finish(img)


def name_card(spec, t, T):
    """A dated typographic card that builds line by line."""
    img, d = canvas()
    lines = spec["lines"]
    step = (T * 0.75) / max(1, len(lines))
    y = CY - (len(lines) - 1) * 95
    for i, line in enumerate(lines):
        k = phase(t, i * step, i * step + step * 0.6)
        size = line.get("size", 60)
        color = {"amber": AMBER, "teal": TEAL, "muted": MUTED}.get(line.get("color"), PAPER)
        text(d, (540, y + (1 - k) * 30), line["text"], size, color, line.get("weight", "bold"), alpha=k)
        if line.get("stamp"):
            bw = 30 + len(line["text"]) * size * 0.32
            box = [(540 - bw) * SS, (y - size * 0.85) * SS, (540 + bw) * SS, (y + size * 0.85) * SS]
            d.rounded_rectangle(box, radius=16 * SS, outline=mix(BG, color, k), width=6 * SS)
        y += 190
    return finish(img)


def shortlist(spec, t, T):
    """Candidate names; rejected ones are struck through with a reason."""
    img, d = canvas()
    items = spec["items"]
    y0 = CY - (len(items) - 1) * 150
    text(d, (540, y0 - 200), spec.get("heading", ""), 48, MUTED, "regular", alpha=phase(t, 0, T * 0.2))
    appear_end = T * (0.15 if spec.get("struck") else 0.6)
    for i, item in enumerate(items):
        y = y0 + i * 300
        k = phase(t, i * appear_end / len(items), (i + 1) * appear_end / len(items)) if not spec.get("struck") else 1.0
        name = item["name"]
        color = AMBER if item.get("keep") else PAPER
        text(d, (540, y), name, 96, color, alpha=k)
        if item.get("tag"):
            text(d, (540, y + 90), item["tag"], 44, MUTED, "regular", alpha=k)
        if spec.get("struck") and item.get("reject"):
            idx = [j for j, it in enumerate(items) if it.get("reject")].index(i)
            count = len([it for it in items if it.get("reject")])
            s = phase(t, T * 0.1 + idx * T * 0.75 / count, T * 0.1 + idx * T * 0.75 / count + T * 0.18)
            width = len(name) * 30 + 40
            stroke(d, [(540 - width, y + 5), (540 + width, y - 5)], RED, 12, s)
            text(d, (540, y + 90), item["reject"], 44, RED, "regular", alpha=s)
        if spec.get("struck") and item.get("keep"):
            kk = phase(t, T * 0.8, T * 0.95)
            bw = len(name) * 30 + 70
            d.rounded_rectangle([(540 - bw) * SS, (y - 85) * SS, (540 + bw) * SS, (y + 70) * SS], radius=20 * SS, outline=mix(BG, AMBER, kk), width=7 * SS)
    return finish(img)


COLORS = {"paper": PAPER, "amber": AMBER, "teal": TEAL, "red": RED, "muted": MUTED}


def step_phase(t, T, step, steps):
    span = T * 0.8 / max(1, steps)
    return phase(t, step * span, step * span + span * 0.75)


def arrow(d, a, b, color, width, progress):
    stroke(d, [a, b], color, width, progress)
    if progress < 0.98:
        return
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for side in (-1, 1):
        tip = (b[0] - 34 * math.cos(ang + side * 0.5), b[1] - 34 * math.sin(ang + side * 0.5))
        stroke(d, [b, tip], color, width)


def diagram(spec, t, T):
    """Generic labelled line drawing whose elements appear in numbered steps.
    Elements: path (points, closed), dot (at, r, pulse), arrow (from, to),
    label (at, text, size). Coordinates are 1080x1920 pixels above the captions."""
    img, d = canvas()
    elements = spec["elements"]
    steps = max(e.get("step", 0) for e in elements) + 1
    for e in elements:
        k = step_phase(t, T, e.get("step", 0), steps)
        if k <= 0:
            continue
        color = COLORS.get(e.get("color", "paper"), PAPER)
        kind = e["type"]
        if kind == "path":
            pts = [tuple(p) for p in e["points"]] + ([tuple(e["points"][0])] if e.get("closed") else [])
            stroke(d, pts, mix(BG, color, 1.0), e.get("width", 10), k)
        elif kind == "dot":
            r = e.get("r", 20) * (0.4 + 0.6 * k)
            x, y = e["at"]
            d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=mix(BG, color, k))
            if e.get("pulse") and k >= 1:
                pr = r + 14 + 10 * math.sin(t * 5)
                d.ellipse([(x - pr) * SS, (y - pr) * SS, (x + pr) * SS, (y + pr) * SS], outline=mix(BG, color, 0.7), width=5 * SS)
        elif kind == "arrow":
            arrow(d, tuple(e["from"]), tuple(e["to"]), color, e.get("width", 10), k)
        elif kind == "label":
            text(d, tuple(e["at"]), e["text"], e.get("size", 48), color, e.get("weight", "bold"), alpha=k)
    return finish(img)


def timeline(spec, t, T):
    """Vertical dated timeline: each event appears in turn; the last stays lit."""
    img, d = canvas()
    events = spec["events"]
    n = len(events)
    top, bottom = CY - 330, CY + 330
    ys = [top + (bottom - top) * i / max(1, n - 1) for i in range(n)]
    stroke(d, [(300, top), (300, bottom)], MUTED, 6, phase(t, 0, T * 0.2))
    for i, (ev, y) in enumerate(zip(events, ys)):
        k = phase(t, T * (0.1 + 0.75 * i / n), T * (0.1 + 0.75 * i / n) + T * 0.15)
        color = COLORS.get(ev.get("color", "amber"), AMBER)
        r = 20 * (0.5 + 0.5 * k)
        d.ellipse([(300 - r) * SS, (y - r) * SS, (300 + r) * SS, (y + r) * SS], fill=mix(BG, color, k))
        text(d, (360, y - 28), str(ev["year"]), 64, color, anchor="lm", alpha=k)
        text(d, (360, y + 36), ev["label"], 42, PAPER, "regular", anchor="lm", alpha=k)
    return finish(img)


def qr_code_image(size, seed=7):
    """A 21x21 QR-style symbol: three 7x7 position detection patterns plus
    pseudo-random modules (illustrative; it does not encode data)."""
    n, quiet = 21, 2
    cell = size // (n + 2 * quiet)
    im = Image.new("RGBA", (cell * (n + 2 * quiet),) * 2, (250, 248, 242, 255))
    dr = ImageDraw.Draw(im)
    rnd = seed

    def finder_at(r, c):
        return (r < 8 and c < 8) or (r < 8 and c >= n - 8) or (r >= n - 8 and c < 8)

    for r in range(n):
        for c in range(n):
            if finder_at(r, c):
                continue
            rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF
            if rnd % 100 < 46:
                x, y = (c + quiet) * cell, (r + quiet) * cell
                dr.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(20, 18, 16, 255))
    for (r, c) in ((0, 0), (0, n - 7), (n - 7, 0)):
        x, y = (c + quiet) * cell, (r + quiet) * cell
        dr.rectangle([x, y, x + 7 * cell - 1, y + 7 * cell - 1], fill=(20, 18, 16, 255))
        dr.rectangle([x + cell, y + cell, x + 6 * cell - 1, y + 6 * cell - 1], fill=(250, 248, 242, 255))
        dr.rectangle([x + 2 * cell, y + 2 * cell, x + 5 * cell - 1, y + 5 * cell - 1], fill=(20, 18, 16, 255))
    return im, cell, quiet


def qr_finder(spec, t, T):
    """QR position detection patterns: locate, label, or the 1:1:3:1:1 ratio."""
    img, d = canvas()
    mode = spec.get("mode", "locate")
    size = 640 * SS
    code, cell, quiet = qr_code_image(size)
    side = code.size[0]
    finders = [(quiet + 3.5, quiet + 3.5), (quiet + 3.5, quiet + 21 - 3.5), (quiet + 21 - 3.5, quiet + 3.5)]

    def place(image, angle=0.0, scale=1.0):
        im = image if scale == 1.0 else image.resize((int(image.size[0] * scale), int(image.size[1] * scale)), Image.LANCZOS)
        rot = im.rotate(angle, resample=Image.BICUBIC, expand=True)
        x, y = W * SS // 2 - rot.size[0] // 2, CY * SS - rot.size[1] // 2
        img.paste(rot, (x, y), rot)
        return im.size[0], angle, scale

    def finder_xy(rc, angle, scale):
        r, c = rc
        off_x, off_y = (c * cell - side / 2) * scale, (r * cell - side / 2) * scale
        a = math.radians(-angle)
        return (W / 2 + (off_x * math.cos(a) - off_y * math.sin(a)) / SS, CY + (off_x * math.sin(a) + off_y * math.cos(a)) / SS)

    if mode == "ratio":
        # One pattern, large, with a scan line and its 1:1:3:1:1 runs.
        zoom = phase(t, 0, T * 0.25)
        unit = 70
        x0, y0 = 540 - 3.5 * unit, CY - 3.5 * unit
        d.rectangle([(x0 - unit) * SS, (y0 - unit) * SS, (x0 + 8 * unit) * SS, (y0 + 8 * unit) * SS], fill=(250, 248, 242))
        for (a, b, colr) in ((0, 7, (20, 18, 16)), (1, 6, (250, 248, 242)), (2, 5, (20, 18, 16))):
            d.rectangle([(x0 + a * unit) * SS, (y0 + a * unit) * SS, (x0 + b * unit) * SS - 1, (y0 + b * unit) * SS - 1], fill=colr)
        scan = phase(t, T * 0.2, T * 0.5)
        stroke(d, [(x0 - 60, CY), (x0 + 7 * unit + 60, CY)], RED, 8, scan)
        runs = [(0, 1, "1"), (1, 2, "1"), (2, 5, "3"), (5, 6, "1"), (6, 7, "1")]
        for i, (a, b, lab) in enumerate(runs):
            k = phase(t, T * (0.45 + i * 0.07), T * (0.5 + i * 0.07))
            text(d, (x0 + (a + b) / 2 * unit, y0 + 7 * unit + 110), lab, 72, AMBER, alpha=k)
        text(d, (540, y0 - 150), spec.get("caption", "1 : 1 : 3 : 1 : 1"), 56, PAPER, alpha=phase(t, T * 0.8, T * 0.95))
        return finish(img)

    angle = 0.0
    if mode == "orient":
        angle = lerp(0, spec.get("angle", 135), phase(t, T * 0.25, T * 0.75))
    _, angle, scale = place(code, angle, 0.7 if mode == "orient" else 1.0)
    order = range(3)
    for i in order:
        if mode == "locate":
            k = phase(t, T * (0.2 + 0.2 * i), T * (0.3 + 0.2 * i))
        else:
            k = phase(t, T * 0.1, T * 0.3)
        if k <= 0:
            continue
        x, y = finder_xy(finders[i], angle, scale)
        r = 7 * cell / SS * 0.75 * scale + 18
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], outline=mix(BG, AMBER, k), width=9 * SS)
    if mode == "locate":
        # Scanner reticle closing in on the symbol.
        k = phase(t, 0, T * 0.25)
        m = lerp(470, 380, k)
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            cx, cy = 540 + sx * m, CY + sy * m
            stroke(d, [(cx, cy - sy * 70), (cx, cy), (cx - sx * 70, cy)], TEAL, 10, k)
    if spec.get("label"):
        text(d, (540, CY + 430), spec["label"], 50, AMBER, alpha=phase(t, T * 0.35, T * 0.55))
    return finish(img)


KINDS = {"glyph-merge": glyph_merge, "unite": unite, "name-card": name_card, "shortlist": shortlist,
         "diagram": diagram, "timeline": timeline, "qr-finder": qr_finder}


def main():
    spec_file, output, ffmpeg = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(spec_file, encoding="utf-8") as handle:
        spec = json.load(handle)
    draw = KINDS[spec["kind"]]
    T = float(spec["duration"])
    frames = max(1, int(math.ceil(T * FPS)))
    proc = subprocess.Popen([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                             "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast",
                             "-crf", "18", "-pix_fmt", "yuv420p", output], stdin=subprocess.PIPE)
    # Start a little into the first beat, so a cut never lands on an empty frame.
    lead = min(0.4, T * 0.1)
    for frame in range(frames):
        image = draw(spec, lead + frame / FPS * (T - lead) / T, T)
        proc.stdin.write(image.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed while encoding explainer clip")


if __name__ == "__main__":
    main()
