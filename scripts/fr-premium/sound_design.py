#!/usr/bin/env python3
"""FR premium sound design: original, procedurally synthesised bed and cues (no samples, no third-party
audio), placed from the rendered shot list and the measured narration. Restrained by design: one low
drone, a few mechanical cues, and real silence under the loss of the vehicle and the crew portrait.

    python sound_design.py <shots.json> <timeline.json> <out.wav> [--cues cues.json]

Writes a 48 kHz stereo bed+cues stem (narration is mixed later by mix-audio.sh with ducking).
"""
import json, sys, wave
import numpy as np

SR = 48000
shots_file, tl_file, out = sys.argv[1:4]
meta = json.load(open(shots_file)); tl = json.load(open(tl_file))
S = {s["id"]: s for s in meta["shots"]}
dur = max(s["end"] for s in meta["shots"])
N = int(dur * SR) + 1
t = np.arange(N) / SR
rng = np.random.default_rng(1986)
word = lambda line, w: next(x["start"] for x in tl["words"] if x["line"] == line and x["text"].lower().strip(".,").startswith(w))


def env(points):
    """piecewise-linear gain envelope from [(time, gain), ...]"""
    xs, ys = zip(*points); return np.interp(t, xs, ys)


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y


def pinkish(n):
    w = rng.standard_normal(n); return lowpass(w, 400) * 6


# --- bed: low drone (two sines a fifth apart + filtered noise), slow breathing ---------------------
lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * t)
drone = (0.55 * np.sin(2 * np.pi * 49 * t) + 0.28 * np.sin(2 * np.pi * 73.5 * t + 0.6) + 0.12 * np.sin(2 * np.pi * 98.2 * t)) * lfo
air = pinkish(N) * 0.22
bed_gain = env([
    (0, 0.0), (0.25, 0.07), (S["S06"]["start"], 0.075), (S["S06"]["end"], 0.10),   # tension rises through the mechanism
    (S["S09"]["start"], 0.11), (S["S10"]["start"] - 0.05, 0.11), (S["S10"]["start"] + 0.35, 0.0),  # silence at the loss
    (S["S12"]["start"], 0.0), (S["S12"]["start"] + 1.2, 0.05), (S["S15"]["start"], 0.06), (dur - 1.4, 0.06), (dur, 0.0)])
bed = (drone + air) * bed_gain

# --- pad for the investigation and payoff (sine chord, slow attack) ------------------------------------
chord = sum(np.sin(2 * np.pi * f * t + ph) * a for f, ph, a in [(110, 0, 0.5), (164.8, 1.1, 0.32), (220.0, 2.0, 0.22), (261.6, 0.4, 0.12)])
pad_gain = env([(0, 0), (S["S12"]["start"], 0), (S["S12"]["start"] + 2.0, 0.035), (S["S14"]["start"], 0.04),
                (S["S15"]["start"], 0.05), (dur - 1.2, 0.05), (dur, 0)])
pad = chord * pad_gain * (0.85 + 0.15 * np.sin(2 * np.pi * 0.2 * t))

# room tone under the silence (so it is not digital zero)
room = pinkish(N) * 0.004

cues = []
sfx = np.zeros(N)


def place(at, sig, gain, name):
    i = int(at * SR); j = min(N, i + len(sig)); sfx[i:j] += sig[: j - i] * gain
    cues.append({"t": round(at, 3), "cue": name, "gain": gain})


def impact(d=0.9):  # soft low thump: falling sine with fast attack
    n = int(d * SR); tt = np.arange(n) / SR; f = 70 * np.exp(-tt * 3) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 5.5) * np.minimum(1, tt * 200)


def tick():  # HUD marker: short band-limited blip
    n = int(0.06 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1850 * tt) * 0.6 + np.sin(2 * np.pi * 2770 * tt) * 0.3) * np.exp(-tt * 70)


def clunk():  # mechanical: metal-ish partials + noise transient
    n = int(0.5 * SR); tt = np.arange(n) / SR
    tone = sum(np.sin(2 * np.pi * f * tt) * a * np.exp(-tt * d) for f, a, d in [(180, 0.6, 9), (431, 0.3, 14), (1033, 0.15, 22)])
    return tone + rng.standard_normal(n) * np.exp(-tt * 90) * 0.4


def hiss(d):  # pressure leak: band-passed noise swelling in
    n = int(d * SR); tt = np.arange(n) / SR; w = rng.standard_normal(n)
    hp = w - lowpass(w, 1800); bp = lowpass(hp, 6000)
    return bp * np.minimum(1, tt / (d * 0.6)) * np.minimum(1, (d - tt) / 0.25)


place(0.0, impact(), 0.55, "low impact on frame 0")
place(0.5, tick(), 0.22, "marker tick: smoke ring")
place(S["S02"]["start"], clunk(), 0.18, "mechanical: diagram in")
place(S["S03"]["start"] + 0.15, tick(), 0.15, "marker tick: figure labels")
place(word("L5", "ignition"), impact(0.7), 0.35, "ignition: joint flexes")
place(word("L5", "hot") - 0.1, hiss(1.8), 0.10, "hot gas blow-by hiss")
place(S["S08"]["start"] + 0.3, tick(), 0.2, "marker tick: flame ring")
place(S["S13"]["start"] + 0.05, clunk(), 0.12, "mechanical: decision chain in")
place(word("L11", "never") - 0.4, impact(0.8), 0.22, "broken link")
place(S["S15"]["start"], impact(1.2), 0.30, "payoff low note")

mix = bed + pad + room + sfx
# subtle stereo: decorrelated air on each side, centred cues
air_r = pinkish(N) * 0.22 * bed_gain
L = mix; R = mix - air * bed_gain + air_r
st = np.stack([L, R], 1)
pk = np.max(np.abs(st)); st = st * (0.5 / pk) if pk > 0.5 else st
with wave.open(out, "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes((st * 32767).astype("<i2").tobytes())
json.dump({"duration": round(dur, 3), "method": "procedural synthesis (numpy), seed 1986; no samples or third-party audio", "cues": cues,
           "silence": [S["S10"]["start"] + 0.35, S["S12"]["start"]]}, open(out.replace(".wav", "-cues.json"), "w"), indent=1)
print(f"sound design {dur:.2f} s, {len(cues)} cues -> {out}")
