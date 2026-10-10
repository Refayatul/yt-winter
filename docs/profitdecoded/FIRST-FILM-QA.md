# First film: final quality report

"Billions Sit on Unused Gift Cards. Who Keeps the Money?" is ready for the owner's final review. **Not published, not uploaded.**

**The file:**
- `profitdecoded-gift-cards-documentary.mp4` (144.7 MB, 8:57.8);
- sha256 `a2877524e5863e0fce8ce19b9e4ef9f010d05a65f24c37f2cc97380df1509a29`;
- rendered locally with the PR #213 motion renderer, from branch `feat/profitdecoded-first-film`.

## 1. Script selection

| | Opus reference + approved opening (film edit) | Claude Haiku 5.5 |
| --- | --- | --- |
| Outcome | Selected | **No script produced.** The plan stage hit its 12,000-token output cap (adaptive thinking used up the budget), so the run stopped by design, with no retry and no fallback. |
| Gates | `story-review`: 0 plan issues, 0 blocking findings, retention 100, spoken 97, AI-pattern 0, opening 85 (gate 80) | n/a |
| Cost | $0 API (written in a Claude Code session) | **$0.0067**, ledger-settled: 5,864 input tokens, 12,000 output |

- **The run:** GitHub Actions run 37989368313.
  - It ran from `feat/profitdecoded-experiment-guard`, the branch where PR #215 was merged. That is exactly `main`'s ProfitDecoded code plus the approval.
  - The preflight passed every check, including `claude-haiku-5-5` on the Models API (not billed).
- **The approval** `exp-2026-10-haiku55-gift-cards-1` was closed in the ledger when the step ended.
- **The rule applied:** the owner's "if Haiku fails, use the quality-approved Opus script".
- **The Gemini blind comparison was not needed**, because there was nothing to compare. Gemini use was one probe request on the free tier.

## 2. Narration (Cartesia)

- **Voice:** Carl, "Steady Storyteller" (`ed82c17b-…`), on the pinned snapshot `sonic-3.6-2026-08-27`, API version `2026-08-14`.
- **One pass:** run 37989826045, 101 sentence requests, **7,203 credits**. With the auditions (2,082) the month's total is **9,285**.
- **Credit check:** Cartesia's usage endpoint needs an admin key. The pre-check therefore used this repository's recorded usage (2,082 of 100,000) and stated that in the log.
- **Cache:** every sentence is cached. The local re-mix (music level) made **0** requests and reproduced an identical timeline.
- **Pace (measured):** 149 words a minute while speaking, 134 including pauses, the title card and section breaths.

## 3. Automated technical QA (on the delivered MP4)

| Check | Result | Target |
| --- | --- | --- |
| Resolution, aspect | 1920×1080, 16:9 | 1920×1080 |
| Frame rate | 30/1 | 30 |
| Codec | H.264 High, yuv420p | H.264 |
| Colour tags | BT.709 / BT.709 / BT.709 | BT.709 |
| Audio | AAC, 2 ch, 48 kHz | stereo 48 kHz |
| Decode errors | 0 | 0 |
| Black frames ≥ 0.2 s | 0 | 0 |
| Integrated loudness | −14.3 LUFS | −14 ± 1 |
| True peak | −2.4 dBTP | ≤ −1 |
| Loudness range | 3.8 LU | ≤ 8 |
| Unintended silence ≥ 0.8 s | 0 | 0 |
| Static holds > 3 s | none (longest 2.8 s) | none |
| A/V duration match | 0.008 s | ≤ 0.1 s |
| Duration | 537.8 s (8:58) | 8–12 min |
| Captions | 136 cues, 0 out of limits | ≤ 2×42 chars, ≥ 1 s, ≤ 20 chars/s |

- **Captions** match the narrated script word for word: 1,179 words, every sentence cued, no overlaps.
- **Music balance:** the score sits about 19 LU under the narration (stems −36.2 and −17.5 LUFS). The earlier mix had it at about 27 LU under, effectively inaudible.

### What QA caught and what was fixed (targeted; no gate changed)

| Found on an earlier render | Fix |
| --- | --- |
| 5 black-frame events (dips to black) | Crossfades; the film opens on the brand background |
| 19 holds over 3 s (camera drift shorter than the shot; static between camera keys) | Drift spans each shot's real length (at least 0.22% a second, also between keys); continuous motion on the "choice" shot |
| 2 caption cues under 1 s ("It won't.", "Go check it.") | Short cues extend into the following pause, never past the next cue |
| Near-empty shot openings (2–3 s) | Context on screen from the first word (7 shots); the opening survey sentence got a full visual |
| "$0.0M" visible before a count-up | Figures appear only when they start counting |
| A title cropped by a camera zoom | The title steps aside during the zoom |
| A render stopped by a stalled frame capture | The renderer retries a frame (frames are deterministic); renders run under `caffeinate` |

## 4. Editorial review (frames inspected, not watched in real time)

What was done:
- frames sampled every 10 s across the whole film;
- every shot at its start, middle and end;
- the first 30 s every 2 s.

Findings:
- **Opening 30 s:**
  - Bankrate is named first, with about $27 billion on a 3D card wall.
  - "Some of it may be yours", then "Who keeps it?" with three unnamed claimants.
  - The survey method, with the 2,373 sample counted up.
  - 43% with a 100-dot chart, then an ESTIMATE stamp and a scale ruler.
  - Gate reading: 85.
- **Progression:** cold open → Starbucks terms → how breakage is booked → what it is worth → the money flow → Darden (sale on redemption, "redemption is remote", 12 years, balance) → "Predicted, not counted" → the government's share → the federal floor and owner mistakes → the answer → "Go check it."
- **Visual variety:** 46 original shots in five registers:
  - data charts;
  - paper documents;
  - line-art scenes;
  - the 3D card wall;
  - typography.

  There is no stock footage, no logos and no AI imagery. Camera moves follow the narration on long builds.
- **Source integrity:**
  - Every figure carries a source line.
  - Our own arithmetic is labelled "our arithmetic" or "our math".
  - The three filing quotations are the exact passages recorded in the research file and are labelled "wording as filed".
  - The 10-K covers are typeset recreations labelled "not facsimiles".
  - Illustrations are labelled "schematic", "not to scale" or "illustration" wherever they could be mistaken for data.
- **Limits of this review:**
  - Nobody has listened to the narration or the music yet; only measurements were taken.
  - Pronunciation is unverified (Bankrate, YouGov, Darden, Olive Garden, the numbers).
  - Pacing and the music still need a human listen.

## 5. Costs

| Item | Cost |
| --- | --- |
| Anthropic API (the one Haiku call) | **$0.0067** (prepaid credit; auto-reload off) |
| Opus reference script | $0 API |
| Cartesia | 9,285 credits of the Pro plan's 100,000 a month ($5/month subscription; no extra charge) |
| Gemini | 1 free-tier probe request; $0 |
| GitHub Actions | public repository; $0 |
| Rendering, music, mastering, captions, thumbnails | local and owned; $0 |
| **Incremental spend for this film** | **$0.0067**, plus the existing Cartesia subscription |

## 6. Remaining items before publication (owner)

1. **Watch and listen to the full film:** narration pronunciation and pacing, music level and character, and any shot that feels slow.
2. **Pick a thumbnail.** A ("Who keeps it?") is recommended. All three are readable at phone size, apart from B's small "survey estimate" label.
3. **Pick a title.** "Billions Sit on Unused Gift Cards. Who Keeps the Money?" plus 21 alternatives are in `story/latest.json`.
4. **AI-voice disclosure** at upload, per channel policy.
5. **Housekeeping:**
   - `feat/profitdecoded-experiment-guard` still has `paidEnabled: true`. It is inert: the approval is closed in the ledger and `main` is closed. Delete that branch, or close the policy on it.
   - PRs #213 and #214 await review.
6. **Findings for later:**
   - The pre-call cost reservation was $0.0001 below the actual Haiku charge, because the tokenizer outran the estimator's characters-per-token ratio.
   - A future Haiku script run would need a larger plan-stage output cap, and that needs a new approval.
