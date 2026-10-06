#!/usr/bin/env python3
"""Kokoro-82M (ONNX) text-to-speech helper. Apache-2.0 model, runs on CPU, no key or account.
Reads the text from stdin, writes a 24 kHz mono 16-bit WAV. Fails LOUDLY: any problem exits non-zero
with the reason on stderr (the Node side shows it).
  kokoro_tts.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin --voice am_michael --speed 1.0 --out x.wav < text
"""
import argparse
import os
import sys
import traceback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--voice", default="am_michael")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    text = sys.stdin.read().strip()
    if not text:
        sys.exit("kokoro_tts: empty text on stdin")
    for label, path in (("model", a.model), ("voices", a.voices)):
        if not os.path.isfile(path) or os.path.getsize(path) < 1000:
            sys.exit(f"kokoro_tts: {label} file missing or too small: {path}")
    import soundfile as sf
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(a.model, a.voices)
    voices = kokoro.get_voices() if hasattr(kokoro, "get_voices") else []
    if voices and a.voice not in voices:
        sys.exit(f"kokoro_tts: unknown voice {a.voice!r}; available: {', '.join(sorted(voices))}")
    samples, rate = kokoro.create(text, voice=a.voice, speed=max(0.5, min(1.6, a.speed)), lang="en-us")
    if samples is None or len(samples) == 0:
        sys.exit("kokoro_tts: the model returned no samples")
    sf.write(a.out, samples, rate, subtype="PCM_16")
    size = os.path.getsize(a.out) if os.path.exists(a.out) else 0
    if size < 1000:
        sys.exit(f"kokoro_tts: output file missing or empty after write: {a.out} ({size} bytes)")
    print(f"kokoro_tts: wrote {size} bytes, {len(samples) / rate:.1f}s at {rate} Hz, voice {a.voice}", file=sys.stderr)


try:
    main()
except SystemExit:
    raise
except Exception:
    traceback.print_exc()
    sys.exit(1)
