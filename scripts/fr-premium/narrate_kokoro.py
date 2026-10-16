#!/usr/bin/env python3
"""FR premium narration with local Kokoro (kokoro_mlx, Apple Silicon), offline and free.

Same contract as narrate-edge.js: reads script.json beat by beat, writes <out>/narration.wav
(48 kHz mono) and <out>/timeline.json with lines and words on the final clock.

Word timing is not estimated: the model's own predicted phoneme durations (the alignment it
decodes with) are kept, and each script word owns the phonemes G2P produced for it.

    python narrate_kokoro.py <script.json> <outDir> [--voice am_michael]

Kokoro is the configured FR *fallback* voice. It is NOT approved for publishing; output is
for evaluation only.
"""
import json, os, subprocess, sys, wave
import numpy as np
import mlx.core as mx
from kokoro_mlx import KokoroTTS

args = sys.argv[1:]
voice = args[args.index("--voice") + 1] if "--voice" in args else "am_michael"
script_file, out_dir = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))][:2]
SR = 24000

tts = KokoroTTS.from_pretrained()
model, vm = tts._model, tts._voices
ph = tts._get_phonemizer(None, voice)
vocab = model.vocab


def forward_with_durations(phonemes, ref_s, speed):
    """KokoroModel.forward (kokoro_mlx 0.1.2) with the duration vector returned as well."""
    if ref_s.ndim == 1:
        ref_s = ref_s[None, :]
    ids = [vocab[c] for c in phonemes if c in vocab]
    kept = [c for c in phonemes if c in vocab]
    input_ids = mx.array([[0, *ids, 0]]); T = input_ids.shape[1]
    lengths = mx.array([T]); mask = mx.zeros((1, T), dtype=mx.bool_)
    d_en = model.bert_encoder(model.bert(input_ids)).transpose(0, 2, 1)
    s_pros, s_dec = ref_s[:, 128:], ref_s[:, :128]
    d = model.predictor.text_encoder(d_en, s_pros, lengths, mask)
    dur = mx.sigmoid(model.predictor.duration_proj(model.predictor.lstm(d))).sum(axis=-1) / speed
    pd = mx.maximum(mx.clip(mx.round(dur), 0, None).astype(mx.int32).squeeze(0), 1)
    mx.eval(pd); pdn = np.array(pd.tolist())
    aln = np.zeros((T, int(pdn.sum())), dtype=np.float32); col = 0
    for i, n in enumerate(pdn):
        aln[i, col:col + n] = 1.0; col += n
    aln = mx.array(aln)[None]
    en = d.transpose(0, 2, 1) @ aln
    f0, nn = model.predictor.F0Ntrain(en, s_pros)
    asr = model.text_encoder(input_ids, lengths, mask) @ aln
    audio = np.array(model.decoder(asr, f0, nn, s_dec).squeeze().tolist(), dtype=np.float32)
    return audio, pdn, kept


def g2p(text):
    p, _ = ph.phonemize(text)
    return p


script = json.load(open(script_file))
os.makedirs(out_dir, exist_ok=True)
va = vm.load_voice(voice)
pieces, lines, words, beats_log = [], [], [], []
clock = 0.0
for beat in script["beats"]:
    speed = 1.0 + float(beat["rate"].replace("%", "")) / 100.0
    disp = [(l["id"], w) for l in beat["lines"] for w in l["text"].split()]
    # Phonemes per script word, joined with spaces: each word keeps an exact span of tokens.
    per = [g2p(w).strip() for _, w in disp]
    phon = " ".join(per)
    # owner[k] = script word of the k-th kept token (-1 for the separating spaces)
    owner = []
    for i, p in enumerate(per):
        if i: owner.append(-1) if " " in vocab else None
        # punctuation tokens carry the pause after a word, not the word itself
        owner.extend((-1 if c in ",.!?;:—…\"'" else i) for c in p if c in vocab)
    style = vm.get_style(va, len(owner) + 2)
    audio, pdn, kept = forward_with_durations(phon, style, speed)
    assert len(kept) == len(owner), f"token count mismatch in {beat['id']}"
    spf = len(audio) / pdn.sum()  # samples per duration unit
    starts = np.concatenate([[0], np.cumsum(pdn)]) * spf / SR  # token 0 is BOS
    spans = [[None, None] for _ in disp]
    for k, wi in enumerate(owner):
        if wi < 0: continue
        s, e = starts[k + 1], starts[k + 2]
        if spans[wi][0] is None: spans[wi][0] = s
        spans[wi][1] = e
    assert all(s[0] is not None for s in spans), f"a word got no phonemes in {beat['id']}"
    # trim: from 60 ms before the first word to 200 ms after the last
    a = max(0.0, spans[0][0] - 0.06); z = min(len(audio) / SR, spans[-1][1] + 0.20)
    seg = audio[int(a * SR):int(z * SR)]
    for (lid, w), (s, e) in zip(disp, spans):
        words.append({"line": lid, "text": w, "start": round(clock + s - a, 3), "end": round(clock + e - a, 3)})
    for l in beat["lines"]:
        lw = [x for x in words if x["line"] == l["id"]]
        lines.append({"id": l["id"], "beat": beat["id"], "text": l["text"], "start": lw[0]["start"], "end": lw[-1]["end"]})
    pieces.append(seg); clock += len(seg) / SR
    beats_log.append({"beat": beat["id"], "speed": speed, "phonemeTokens": len(kept), "speechSec": round(len(seg) / SR, 3)})
    if beat.get("pauseAfterMs", 0) > 0:
        n = int(SR * beat["pauseAfterMs"] / 1000); pieces.append(np.zeros(n, dtype=np.float32)); clock += n / SR
    print(f"  {beat['id']}: {len(seg)/SR:.2f} s", flush=True)

full = np.concatenate(pieces)
pk = float(np.max(np.abs(full)))
if pk > 0.98: full = full * (0.98 / pk)
raw = os.path.join(out_dir, "narration-24k.wav")
with wave.open(raw, "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((full * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "aresample=48000:filter_size=64", "-c:a", "pcm_s16le", os.path.join(out_dir, "narration.wav")], check=True)
os.remove(raw)
json.dump({"voice": f"kokoro {voice}", "provider": "Kokoro-82M v1.0 (mlx-community/Kokoro-82M-bf16, Apache-2.0) via kokoro_mlx 0.1.2, local",
           "approved": False, "duration": round(len(full) / SR, 3), "beats": beats_log, "lines": lines, "words": words},
          open(os.path.join(out_dir, "timeline.json"), "w"), indent=1)
print(f"narration {len(full)/SR:.2f} s, {len(words)} words, peak {pk:.3f}")
