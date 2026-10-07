# Voice audition — The Hidden Logic of Things (2026-10-07)

Same 39-word Bluetooth excerpt, free Edge TTS, rate `+1%` (`scripts/synthesize-voice.js`).
Objective measurements only; the final call needs a blind listen (samples are
regenerated locally with the command below, not committed).

| Voice | Duration | Pace | Pauses (silent share) | Loudness |
|---|---|---|---|---|
| en-US-EmmaMultilingualNeural (current) | 14.88 s | 153 wpm | 6 (16.1%) | -18.2 LUFS |
| en-US-BrianMultilingualNeural | 15.94 s | 143 wpm | 7 (18.3%) | -20.3 LUFS |
| en-US-AndrewMultilingualNeural | 16.30 s | 140 wpm | 7 (19.0%) | -20.4 LUFS |
| en-US-AvaMultilingualNeural | 16.51 s | 138 wpm | 7 (17.4%) | -18.9 LUFS |
| en-GB-RyanNeural | 16.78 s | 136 wpm | 7 (27.7%) | -21.3 LUFS |

Decision: keep **Emma** for Shorts — the brisk, even pace (least dead air) suits
30–50 s retention and the brand's "smart curious" tone. Andrew is the
candidate for long-form, where a slower 140 wpm delivery fits 8–12 minutes.
One narrator per format; never rotate voices per video.

Regenerate: `for v in en-US-EmmaMultilingualNeural en-US-AndrewMultilingualNeural en-US-BrianMultilingualNeural en-US-AvaMultilingualNeural en-GB-RyanNeural; do node scripts/synthesize-voice.js sample.txt $v.mp3 $v "+1%"; done`
