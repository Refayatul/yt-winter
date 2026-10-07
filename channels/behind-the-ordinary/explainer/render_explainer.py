#!/usr/bin/env python3
"""The Hidden Logic of Things — 2D explainer clips.

Renders one storyboard scene as a short 1080x1920 animated clip (Pillow frames
piped into FFmpeg). Every primitive is drawn from vectors, so nothing here is
presented as documentary footage; it is a diagram that explains the narration.

Usage: render_explainer.py <spec.json> <output.mp4> <ffmpeg>
Spec: {"kind": ..., "duration": seconds, ...kind fields}
Kinds: glyph-merge, unite, name-card, shortlist.
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


KINDS = {"glyph-merge": glyph_merge, "unite": unite, "name-card": name_card, "shortlist": shortlist}


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
