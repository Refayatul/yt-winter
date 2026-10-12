#!/usr/bin/env python3
"""Kokoro-82M (ONNX, CPU) narration for Shorts: one model load, one WAV per script line.

Apache-2.0 model and voices, runs offline on CPU, no key or account. The Linux runner and the
Mac use the same implementation (kokoro-onnx), so what is heard locally is what CI produces.

  kokoro_lines.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin --spec spec.json
  spec.json: {"voice": "am_michael", "speed": 1.0, "lines": ["...", "..."], "outDir": "dir"}

Writes outDir/line-1.wav ... (24 kHz mono 16-bit) and prints a JSON summary on stdout:
  {"voice": ..., "rate": 24000, "loadSeconds": ..., "lines": [{"file", "seconds", "synthSeconds"}]}
Any problem exits non-zero with the reason on stderr; nothing is substituted.
"""
import argparse
import json
import os
import sys
import time
import traceback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--spec", required=True)
    a = ap.parse_args()
    with open(a.spec, encoding="utf-8") as handle:
        spec = json.load(handle)
    lines = [str(line).strip() for line in spec.get("lines", [])]
    if not lines or not all(lines):
        sys.exit("kokoro_lines: the spec has no lines or an empty line")
    for label, path in (("model", a.model), ("voices", a.voices)):
        if not os.path.isfile(path) or os.path.getsize(path) < 1000:
            sys.exit(f"kokoro_lines: {label} file missing or too small: {path}")
    import soundfile as sf
    from kokoro_onnx import Kokoro

    started = time.time()
    kokoro = Kokoro(a.model, a.voices)
    load = time.time() - started
    voice = spec.get("voice", "am_michael")
    voices = kokoro.get_voices() if hasattr(kokoro, "get_voices") else []
    if voices and voice not in voices:
        sys.exit(f"kokoro_lines: unknown voice {voice!r}")
    speed = max(0.5, min(1.6, float(spec.get("speed", 1.0))))
    out_dir = spec["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    result = {"voice": voice, "speed": speed, "rate": None, "loadSeconds": round(load, 2), "lines": []}
    for index, line in enumerate(lines, start=1):
        t = time.time()
        samples, rate = kokoro.create(line, voice=voice, speed=speed, lang=spec.get("lang", "en-us"))
        if samples is None or len(samples) == 0:
            sys.exit(f"kokoro_lines: no samples for line {index}")
        path = os.path.join(out_dir, f"line-{index}.wav")
        sf.write(path, samples, rate, subtype="PCM_16")
        if not os.path.isfile(path) or os.path.getsize(path) < 1000:
            sys.exit(f"kokoro_lines: line {index} was not written")
        result["rate"] = rate
        result["lines"].append({"file": path, "seconds": round(len(samples) / rate, 3), "synthSeconds": round(time.time() - t, 3)})
    print(json.dumps(result))


try:
    main()
except SystemExit:
    raise
except Exception:
    traceback.print_exc()
    sys.exit(1)
