#!/usr/bin/env python3
"""Storyboard and source/licence manifest for an FR premium film, built from the actual render
(shots.json, media-resolved.json), the measured narration (timeline.json), the script's evidence
and the per-shot notes. Nothing is estimated here.

    python build_manifests.py <filmDir> <workDir> <timeline.json> <commons-meta.json> <fonts.json> <outDir>
"""
import hashlib, json, os, sys

film, work, tlf, cmf, fontsf, out = sys.argv[1:7]
shots = json.load(open(os.path.join(work, "shots.json")))
media = json.load(open(os.path.join(work, "media-resolved.json")))
script = json.load(open(os.path.join(film, "script.json")))
notes = json.load(open(os.path.join(film, "storyboard-notes.json")))
tl = json.load(open(tlf)); commons = {m["title"]: m for m in json.load(open(cmf))}
fonts = json.load(open(fontsf))
lines = {l["id"]: l for b in script["beats"] for l in b["lines"]}

board = []
for s in shots["shots"]:
    spoken = [l for l in tl["lines"] if l["end"] > s["start"] + 0.05 and l["start"] < s["end"] - 0.05]
    words = [w["text"] for w in tl["words"] if s["start"] <= w["start"] < s["end"]]
    src = None
    if s.get("source"):
        m = media[s["source"]]; c = commons.get(m.get("commons"), {})
        src = {"key": s["source"], "file": m["file"], "commons": m.get("commons"), "url": c.get("page"), "license": c.get("license"),
               "author": c.get("artist"), "clipRange": [m["from"], m["to"]] if "from" in m else None}
    n = notes[s["id"]]
    board.append({"sceneId": s["id"], "start": round(s["start"], 3), "end": round(s["end"], 3), "duration": round(s["end"] - s["start"], 3),
        "narration": " ".join(words), "lines": [l["id"] for l in spoken],
        "evidence": sorted(set(s["evidence"] + [e.split(":")[0] for l in spoken for e in lines[l["id"]]["evidence"] if e.startswith("E")])),
        "evidenceNotes": [e for l in spoken for e in lines[l["id"]]["evidence"]],
        "mediaType": s["kind"], "onScreenLabel": s["label"], "visualSubject": s["subject"], "sourceAsset": src or {"original": "SVG drawn in scenes.js / fr-lib.js (no external asset)"},
        "camera": n["camera"], "animation": n["animation"], "typography": n["typography"],
        "captionPlacement": "centred, top of text at y=1318 px (band 1318-1460), at most 2 lines x 24 chars, current word highlighted; hidden for L12 (set as typography)",
        "sound": n["sound"], "transition": s.get("transition") if s.get("transition") != "cut" else n["transition"], "fallback": n["fallback"]})

storyboard = {"schema": "fr-premium.storyboard.v1", "film": script["film"], "format": {"width": 1080, "height": 1920, "fps": 30, "codec": "H.264"},
    "narration": {"voice": tl["voice"], "provider": tl["provider"], "durationSec": tl["duration"]}, "evidence": script["evidence"],
    "hookAlternatives": script["hooks"], "chosenHook": script["chosenHook"], "chosenHookReason": script["chosenHookReason"],
    "shots": board, "captions": shots["cues"]}
json.dump(storyboard, open(os.path.join(out, "storyboard.json"), "w"), indent=1, ensure_ascii=False)

assets = []
for key, m in media.items():
    c = commons.get(m.get("commons"), {}); raw = m["file"]
    used = [s["id"] for s in shots["shots"] if s.get("source") == key]
    assets.append({"key": key, "file": raw, "title": m.get("commons"), "page": c.get("page"), "downloadUrl": c.get("url"), "license": c.get("license"), "usageTerms": c.get("usage"),
        "author": c.get("artist"), "credit": c.get("credit"), "description": c.get("desc"), "usedIn": used, "kind": "archival film" if "from" in m else "archival photograph" if key != "fig14" else "official report figure",
        "transform": (f"frames {m['from']}-{m['to']} s, crop {m['sourceCrop']}, scaled to {m['iw']}x{m['ih']}" if "from" in m else f"downscaled to {m['iw']}x{m['ih']}, camera crops only; colour not altered except S10 saturate(0.85)" if key == "breakup" else f"downscaled to {m['iw']}x{m['ih']}; camera crops only")})
manifest = {"film": script["film"], "rule": "Archival media is labelled on screen as NASA photo/film or Commission record; every original diagram is labelled Explanatory diagram/animation or Reconstruction. No AI imagery, no generated footage, no stock.",
    "archival": assets,
    "original": [
        {"item": "explanatory diagrams and animations (S02, S05, S06, S09, S13)", "author": "this production", "method": "SVG in scenes.js using fr-lib.js", "license": "original work"},
        {"item": "typeset quote card S12", "author": "this production", "method": "typesetting of the Commission's quoted text; not a facsimile", "license": "original layout; quoted text from a U.S. Government report (public domain)"},
        {"item": "sound design", "author": "this production", "method": "procedural synthesis (sound_design.py, numpy, seed 1986)", "license": "original work; no samples"}],
    "narration": {"voice": tl["voice"], "provider": tl["provider"], "cost": "free endpoint; no paid call", "approval": "en-US-AndrewNeural is the voice the published FR Challenger Short used; the Kokoro sample is NOT approved"},
    "fonts": fonts,
    "rejected": [{"file": "STS-51-L Recovered Debris (O-Ring Tracks on Right SRB Joint) - GPN-2004-00010.jpg", "reason": "NASA caption says the tracks were not O-ring material; showing it as 'the O-ring' would mislead"},
                 {"file": "Rogers-report-front-page.png", "reason": "it is the cover of the Senate hearings, not the Commission report"}]}
json.dump(manifest, open(os.path.join(out, "source-licensing-manifest.json"), "w"), indent=1, ensure_ascii=False)
print(f"storyboard: {len(board)} shots; manifest: {len(assets)} archival assets")
