# Documentary #2: narration request (awaiting approval; nothing sent)

| | |
|---|---|
| Bundle | `channels/profitdecoded/films/hbm-034-airline-miles/bundle.json` (51 beats, 106 sentences, from the approved `story/latest.json`) |
| Voice | Cartesia **Carl - Steady Storyteller**, `ed82c17b-4704-4d34-be43-5d19065acdf1` (the owner's choice for film #1, from `config.json`), Sonic model as configured in `core/profitdecoded/tts-provider.js` |
| Characters to send | **7,526** spoken characters, measured with the pipeline's own normalisation (`narration.spokenText`): numbers become words, e.g. "$8.2 billion" → "eight point two billion dollars". **7,533** if the pronunciation proposal is applied. 1 credit = 1 character. |
| Cap | `PD_CARTESIA_MAX_CHARS=9000`. Every request is counted before it is sent and refused past the cap, with no retries. Sentences are cached in `tts-cache/`, so a re-mix never pays twice. |
| Text QA | No digits or symbols left after normalisation; no over-long sentences. |
| Pronunciation | `pronunciation-proposal.json`: Buttigieg → "Boot-edge-edge", AAdvantage → "Advantage", Chopra → "Choh-pruh". **Not applied; owner to confirm.** |

## Credits

- **Recorded in this repository for October:**
  - 2,082 credits before film #1;
  - 9,285 for film #1's narration (`docs/profitdecoded/FIRST-FILM-QA.md`);
  - **at least 11,367 of the Pro plan's 100,000**;
  - plus an unknown amount from the eight voice-audition runs on 2026-10-10.
- **Expected remaining:** about 88,000 or more, so this request (≤ 9,000) fits with a wide margin.
- **Live balance:** **NOT CHECKED.** Cartesia's usage endpoint needs an admin key, and the narration key is only a GitHub secret. Before approving, read the exact figure in the Cartesia dashboard (Usage).
- **Workflow fix:** the dispatch's fallback figure was the stale 2,082. It is now 11,367, so the automatic pre-check is no longer optimistic.

## How it runs once approved (no other spend)

1. Dispatch *ProfitDecoded voice audition* with `cartesia=narrate`, `cartesia_max_chars=9000`, `cartesia_bundle=channels/profitdecoded/films/hbm-034-airline-miles/bundle.json`. It runs the credit pre-check and then `produce-audio.js`. The artifact holds `out/` (`mix.wav`, `timeline.json`) and `tts-cache/`.
2. Locally, with the artifact restored into the film folder, everything after this is free:
   - `render-motion.js <film> --analyze-only`: the scene spec is validated against the **measured** timeline (cue timing, cut points, text, sources);
   - `render-motion.js <film>`: full render at 30 fps with mastered audio and `captions.srt`;
   - `qa-media.js` (freezes, loudness, captions), the visual-diversity review with `--qa`, and a contact sheet;
   - human watch-and-listen, the licensing review (all visuals are original SVG, quotations are from public filings), then the publication package. Upload stays manual.
