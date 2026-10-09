# ProfitDecoded production preparation: first-minute prototype

Date: 2026-10-09.
Episode: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (`hbm-073`).
Branch: `feat/profitdecoded-production-prototype`.

**Status:**
- **INTERNAL CREATIVE TEST.** Not approved for publishing. Nothing was uploaded.
- No paid API call was made. Publishing stays blocked.
- No other channel and no production default was changed.
- The Gemini benchmark and PR #212 were not touched.

**What the prototype uses:**
- The script is the Claude reference opening, beats s1-1 to s1-5, used **unedited** as a temporary production reference.
- That opening still carries its blocking heuristic reading (first 30 seconds: 79 against a threshold of 80). The prototype does **not** override that gate.
- The writing model for the full documentary is undecided until the benchmark finishes.

## Summary

| Deliverable | Result |
| --- | --- |
| 1. Architecture audit | §1. The existing renderer works but produces static text cards (a slideshow look), so it needed a new motion layer. Narration, mixing and QA plumbing are reusable. |
| 2. Narration | §2. Primary: Kokoro `am_michael` (free, Apache-2.0, owner's earlier pick), **provisional until a human listen**. Backup: Google Chirp 3 HD, **unverified**. |
| 3. Voice auditions | 9 real auditions of the same 45-second excerpt (6 Kokoro, 3 edge-tts), measured in §2.2 |
| 4. Storyboard | §3: shot-by-shot, timed to the measured narration |
| 5. Visual standard | §4 |
| 6. Thumbnails | §6: three rendered mockups (original art) with a mobile-size check |
| 7. MP4 prototype | **Produced**: 1920×1080, 30 fps, 61.6 s (1.6 s over the 60-second target, see §7) |
| 8. Technical report | §8.1: measured on the actual MP4 |
| 9. Editorial concerns | §8.2 |
| 10. Licensing | §9 |
| 11. Costs | §10: MEASURED, ESTIMATED or UNKNOWN, per item |
| 12. Blockers | §11 |
| 13. Steps to the full video | §12 |

**Verdict:**
- The prototype demonstrates a repeatable standard that is clearly above the existing renderer: original explanatory motion graphics, a source line on every figure, measured audio and captions.
- It is **not yet a polished premium result**. The narrator has not been heard by a human. The music bed's quality is unknown. Fonts must be replaced with licensed open fonts before publishing. The opening is still gate-blocked.
- The full documentary should wait for those three decisions (§11).

---

## 1. Audit of the existing production system

Evidence:
- the code on `main` (ce9e790);
- CI runs of `profitdecoded-render.yml` and `profitdecoded-voice-audition.yml`;
- the latest render-check artifact (run 37968714332, the Costco Short), which was downloaded and inspected;
- a fresh audition run on this branch (run 37969918667).

| Component | What exists | What actually works | Tested how | Missing | Improve? |
| --- | --- | --- | --- | --- | --- |
| Video rendering | `scripts/profitdecoded/render.js`: ImageMagick text frames, ffmpeg `zoompan`, concat | Yes: renders a valid MP4 on every ProfitDecoded PR | CI render check (latest: 1080×1920, 53.9 s, −16.3 LUFS); artifact inspected | Real motion: every shot is a still card with a push or pan. The inspected Short repeats a card ("It sells the discount" twice). | **Yes.** This is the "AI slideshow" look the brief rules out. A new motion layer was built (§5). `render.js` is kept for Shorts until the new layer is proven. |
| FFmpeg integration | ffmpeg/ffprobe calls in render, QA and narration | Yes: ffmpeg 8.1 locally with libass, loudnorm, ebur128, xfade, sidechaincompress | Local runs and CI | — | No |
| Narration generation | `produce-audio.js`: per-sentence TTS, role-based rate variation, measured sentence timeline | Yes: 11 sentences, 61.6 s, timeline written | This branch's CI run (MEASURED) | Word-level timings (only sentence starts and ends) | Later: forced alignment for word-accurate cues |
| Voice providers | `tts-provider.js`: kokoro, edge-tts, google, openai, elevenlabs | **kokoro** works in CI. **edge-tts** works but has a licensing problem (§9). google, openai and elevenlabs exist as code and unit-tested request builders only. | Kokoro and edge-tts produced audio in CI. The three paid providers have **never been called** (no keys, no spend). | A human listen of any voice | Decision needed (§2) |
| Audio normalisation | Voice to −17.5 LUFS, mix to −14.3 with a tanh soft limiter | Partly: the mix measured **−16.2 LUFS**, not −14, because the limiter eats the gain | ebur128 on `mix.wav` (MEASURED) | A true-peak-safe master stage | **Yes, done:** a mastering step (−14 LUFS target, limiter at −2 dBFS, stereo 48 kHz) in `render-motion.js` |
| Music mixing | A procedurally generated original pad, ducked under speech | Mixes correctly; licence is clean (owned) | RMS measured (§8.1) | Musical quality is **unknown** (sine-chord synthesis, no human listen); no licensed library track | Human listen first; see §9 for the licensed alternative |
| Visual sourcing | `brand.json` priority list (filings, regulator documents, licensed footage…), licence fields in the visual plan | Only original graphics are produced. No retrieval of filings, photos or footage exists for ProfitDecoded. | Code review | A pipeline for documents, licensed photos and footage, with a licence register | Yes, for the full film (§12) |
| Motion graphics | None in ProfitDecoded (zoom and pan on stills) | — | — | Everything | **Built:** `scripts/profitdecoded/motion/` |
| Charts and diagrams | `render.js` draws one percentage bar or three money-flow boxes | Works but static and generic | Artifact inspection | Data-driven animated charts | **Built:** unit chart, number with estimate marking, log-scale ruler, document cards |
| Transitions | Fades approximated with `fade` in/out | Works | CI | Cut, fade and dip with overlap | **Built** (per-shot `in: cut, fade, dip`) |
| Subtitles | `core/profitdecoded/captions.js`: timing estimated within each beat; burned in with libass | Works | Unit tests | Balanced cues from measured sentence timings | **Built:** sidecar SRT, ≤ 2 lines × 42 characters, balanced, ≤ 20 characters/s (tested) |
| Thumbnails | `storyboard.js` concept boards ("not final art"); `core/profitdecoded/thumbnails.js` scores concepts, not pixels | Concept boards only | Code review | Real mockups | **Built:** `render-thumbnails.js`, three concepts (§6) |
| Asset licensing | Licence status per visual-plan shot and per music asset; `publishGuard` fail-closed | Works for original assets | Unit tests | A register for third-party assets (licence, URL, terms, expiry) | Yes, before any licensed footage is used |
| Quality validation | `quality.js` (hard gates, premium media test), `profitdecoded.js dry-run` on the real MP4 (decode errors, black frames, duration) | Yes | CI | Freeze (static-frame) detection, loudness and true-peak checks, caption checks on the real file | Partly done in this prototype by hand (§8.1). Fold into `dry-run` next. |
| Cost tracking | Persistent budget ledger for paid LLM calls | Yes (paid disabled) | Unit tests | TTS and render costs (all free today) | Only if a paid voice is adopted |

**Reused unchanged:** `produce-audio.js`, `tts-provider.js`, `kokoro_tts.py`, `core/profitdecoded/narration.js` (number normalisation), the brand colours, the dossier.

**Changed:**
- `voice-audition.js` gained `--text-file`, `--voices` and `--rate` for a fair fixed-excerpt comparison.
- The audition workflow renders the excerpt and the prototype narration.

## 2. Narration

### 2.1 Candidates and how each was assessed

| Option | Tested here? | Naturalness and emotional control | Pronunciation | Consistency | API / automation | Commercial rights | Cost per 10-min video (≈8,500 characters) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Kokoro-82M** (`am_michael`, `am_fenrir`, `am_puck`, `af_heart`, `af_bella`, `bm_george`) | **Yes**, audio generated | Unknown until heard. Only speed is controllable; no emphasis or emotion controls. Kokoro's own voice card grades `am_michael` C+, `am_fenrir` C+, `am_puck` C+, `af_heart` A, `af_bella` A−. That is the model maker's grading, not ours. | Numbers handled by our normaliser (`spokenText`); brand names need lexicon entries | Deterministic per voice and text | Local and CI, no key | Apache-2.0 model and voices: commercial use allowed | **$0** (MEASURED: CI minutes only) |
| **edge-tts** (Andrew, Brian, Christopher) | **Yes**, audio generated | Unknown until heard | Same normaliser | Service can change without notice | Unofficial endpoint of the Edge read-aloud feature | **Not licensed for monetised use**: comparison only | $0, but not usable |
| Azure AI Speech (the same Microsoft neural voices, official) | No (no key) | Unverified | Unverified | Stable, versioned | Official API | Commercial use under Azure terms | 0.5 M characters/month free (F0), which covers about 50 videos; paid neural around $15 per 1 M (third-party figure, unverified) |
| **Google Cloud TTS, Chirp 3 HD** | No (no key; the code path exists) | Unverified | Unverified | Stable | Official API; `googleRequest` already written and unit-tested | Commercial use under Google Cloud terms (to confirm) | **1 M characters/month free**, then $30 per 1 M: **$0 for 4 videos a month** (needs a GCP billing account) |
| OpenAI `gpt-4o-mini-tts` | No | Unverified; supports style instructions | Unverified | Some forum reports of run-to-run variance | Code path exists | OpenAI policy requires disclosure that the voice is AI | About $0.015 per minute, so **≈ $0.15 per video** (ESTIMATED from OpenAI's published estimate) |
| ElevenLabs (Multilingual v2) | No | Unverified for this channel | Unverified | Stable per voice id | Code path exists | Paid plans only (the free tier is non-commercial and needs attribution) | About $0.10 per 1,000 characters, so **≈ $0.85 per video**, plus a $5–22 monthly plan (third-party figures, unverified) |

### 2.2 Measured auditions (the same 45-second excerpt, channel rate −3%)

The excerpt is the gift-card opening through "who ends up with it?" (112 written words). Measurements were taken from the CI-rendered WAV files.

| Voice | Duration | Words per minute | Pauses ≥ 0.25 s | Notes |
| --- | --- | --- | --- | --- |
| Kokoro `am_michael` | 44.8 s | **150** | 14 | Documentary pace at the channel rate |
| Kokoro `am_fenrir` | 36.3 s | 185 | 7 | Too fast; would need speed ≈ 0.8 (untested) |
| Kokoro `am_puck` | 35.6 s | 189 | 8 | Too fast |
| Kokoro `af_heart` | 41.5 s | 162 | 14 | Highest-graded Kokoro voice |
| Kokoro `af_bella` | 42.4 s | 158 | 14 | |
| Kokoro `bm_george` | 42.5 s | 158 | 16 | British: off-brief for a US-weighted channel |
| edge-tts Andrew | 42.5 s | 158 | 14 | Comparison only (licence) |
| edge-tts Brian | 40.8 s | 165 | 11 | Comparison only |
| edge-tts Christopher | 45.3 s | 148 | 15 | Comparison only |

**What these measurements cannot tell you:** whether a voice sounds natural, whether it mispronounces anything, or whether its intonation is right. No speech recogniser was available, and Gemini quota was not spent on this, to protect the benchmark. **A human listen is required.** The audition files are delivered with this report and are also in the workflow artifact `profitdecoded-voice-audition` (run 37969918667).

### 2.3 Recommendation

- **PRIMARY: Kokoro `am_michael`, provisional.** Reasons:
  - the owner chose it earlier by ear;
  - it is the only candidate that is free, commercially licensed **and** already running in CI;
  - its measured pace (150 wpm) fits documentary narration without retiming;
  - it is deterministic, so episodes stay consistent.

  Risks:
  - Kokoro's own C+ grade for this voice;
  - no emphasis control.

  It **must** pass a human listen of the prototype before the full film.
- **BACKUP: Google Chirp 3 HD**, starting with `en-US-Chirp3-HD-Charon`. **UNVERIFIED.**
  - The free tier covers four documentaries a month at $0.
  - The integration already exists.
  - Testing it needs a `GOOGLE_TTS_API_KEY`, which means a GCP billing account. That is the owner's decision.
  - A 45-second audition costs nothing within the free tier.
- If the human listen rejects `am_michael`, audition `af_heart` next (free, highest Kokoro grade, measured pace 162 wpm). Then the backup.

**Disclosure:** the narrator is synthetic. YouTube's altered-content label targets realistic synthetic content that could be mistaken for a real person. A generic AI narrator is generally outside it, but the project's earlier policy is to disclose at upload, and that stays.

## 3. First-minute storyboard (as rendered)

Timings come from the measured narration (`out/timeline.json`). Cues inside a sentence are estimated from character position (±0.3 s). Every asset is original. Figures come from dossier claim c8 (the Bankrate/YouGov survey) and sources s1 and s2 (the filing metadata).

| # | Time | Narration | Visual objective | Asset type / source | Licence | Motion | Transition | Intended viewer effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.0–1.8 | "Somewhere in a drawer," | Place the card in an everyday spot | Line-art drawer opening; the card is the only colour | Owned (original) | Drawer slides open; slow push | Cold open | Recognition: "I have one of those" |
| 2 | 1.8–2.4 | "a wallet" | The same card, a different place | Line-art wallet; card rises from a slot | Owned | Rise | Match cut on the card | Rhythm; the card is the protagonist |
| 3 | 2.4–3.6 | "or a coat pocket," | Third place | Stitched pocket; card peeks out | Owned | Rise | Match cut | Completes the triad |
| 4 | 3.6–8.6 | "…there's a gift card with money still on it. Maybe it's yours." | Make the unspent value visible without inventing an amount | Card large; "UNSPENT BALANCE" meter fills and glows (no figure printed) | Owned | Card comes forward, slow 3D turn, light sweep | Fade 0.3 s | Personal stake |
| 5 | 8.6–16.5 | "43 percent of American adults…" | Show the share honestly | Unit chart: 100 dots, 43 fill; count-up to 43%; label lines brighten as spoken | Owned data graphic (c8) | Dots fill in sequence; slight drift | Fade 0.35 s | Scale you can see at a glance |
| 6 | 16.8–25.4 | "That's from a Bankrate survey…" | Put the method on screen as it is spoken | Four chips: Bankrate survey · Online, by YouGov · Aug 19–21, 2024 · 2,373 US adults | Owned (c8 facts) | Chips appear on their words | Within the shot | Trust: where the number comes from |
| 7 | 25.9–30.7 | "…about $27 billion." | Turn the share into the total | The 43 dots converge into one point, which becomes "$27 billion" ("ABOUT", "SURVEY ESTIMATE") | Owned (c8) | Converge, then the figure scales in | Cut (continuous) | Surprise at the size |
| 8 | 31.1–40.8 | "That's an estimate… the scale, not the exact amount." | Show that the figure is an estimate without a lecture | ESTIMATE stamp; dashed outline on "not a count"; "METHOD NOT PUBLISHED"; the figure softens; a log-scale ruler ($1B–$100B) places it by order of magnitude | Owned | Stamp pop, outline draw, ruler reveal | Within the shot | Honesty as a feature: scale yes, precision no |
| 9 | 41.3–45.0 | "So here's the question none of those cards answer." | Many cards, no answer | Field of 84 card outlines appearing outward from the centre | Owned | Staggered reveal; slow pull | Fade 0.45 s | Pause before the question |
| 10 | 45.0–48.6 | "If the money never gets spent, who ends up with it?" | Three possible destinations, deliberately unlabelled (the film reveals them later) | One card; three dashed paths to three "?" boxes; headline "Who ends up with it?" | Owned | Paths draw; slow push | Cut | The central question, visualised |
| 11 | 48.6–50.0 | "We don't have to guess." | Switch to evidence mode | Paper background; "WHAT THE COMPANIES TOLD REGULATORS"; the first filing rises | Owned | Rise | Fade 0.35 s | Tone change: from question to documents |
| 12 | 50.1–56.4 | "Starbucks, and Darden, the company behind Olive Garden, explain it in their annual filings." | Name the two sources exactly | Typeset cover information of the two 10-Ks (fiscal years ended Sept 28, 2025 and May 31, 2026); "PARENT COMPANY OF OLIVE GARDEN"; highlighter on "FORM 10-K" at "annual filings"; footnote "typeset… not facsimiles" | Owned typography of public facts; no logos | Documents rise; highlighter sweep; slow push | Within the shot | Authority without fake documents |
| 13 | 56.6–59.9 | "And the answer is stranger than 'the store just keeps it.'" | Set up the next section | Documents dim; the naive answer in serif italic; a hand-drawn circle around "just" | Owned | Fade-up; circle draws | Within the shot | Curiosity: the obvious answer is incomplete |
| 14 | 59.9–61.6 | (tail) | Close | Fade to ink | — | Fade | — | — |

No stock footage, no AI imagery, no real logos and no reconstructed documents were used. Synthetic imagery was never needed, because every shot is a diagram or an illustration that is visibly an illustration.

## 4. ProfitDecoded visual standard

This builds on the existing `brand.json`; nothing is redesigned. The brand colours were already coherent, and the gap was motion and typography.

| Element | Standard |
| --- | --- |
| Palette | Ink `#14161a` (story, data), Paper `#f4efe6` (documents, evidence), Signal `#e8553d` (the one thing to look at), Ledger `#2f5d62` (the episode object), Gold `#c99a2e` (value or balance), Mist `#d9d4c7` (secondary lines and labels). **One Signal element per frame.** |
| Two modes | **Ink** = narrative and data. **Paper** = documents, filings, quotes from sources. A mode switch marks the move from story to evidence. |
| Typography | Headline: heavy editorial serif. Labels: geometric sans in small caps with wide tracking. Numbers: condensed grotesque with tabular figures. **Prototype uses macOS system fonts (Georgia, Avenir Next, DIN Alternate) as stand-ins: not cleared for publishing.** Production: vendor OFL fonts, for example Source Serif 4 (headline), Inter (labels), and Inter or IBM Plex Sans Condensed with tabular numbers (figures). |
| On-screen text | Never the narration verbatim. ≤ 7 words per label; ≤ 3 short lines per block; nothing smaller than 22 px at 1080p (readable on a phone). |
| Charts | Unit charts for shares (1 dot = 1%); the number large and labelled with what it counts; estimates marked as **ESTIMATE**; ranges and uncertainty shown as soft bands, never as false precision; log scales for orders of magnitude. |
| Sources | Every figure on screen carries a bottom-left **SOURCE** line (Signal tick, small caps). |
| Documents | Typeset recreations of public filing information, labelled "not facsimiles". Real document images only with a recorded licence and source. |
| Motion | Ease-out cubic for entrances, in-out for moves, a small overshoot only for stamps. Camera drift ≤ 3% per shot and **only where the frame would otherwise freeze**: no repeated slow zooms on stills. Elements appear on the word that names them. |
| Transitions | Cut by default; match cuts on the episode object; fades of 0.3–0.45 s between ideas; a dip or mode switch between story and evidence. No wipes or whooshes. |
| Lower thirds | Signal tick plus small-caps label (`SOURCE`, a person's role, a company); one line; bottom left at 96 px. |
| Captions | Sidecar SRT for YouTube (not burned in). ≤ 2 lines × 42 characters, ≤ 20 characters/s, balanced line breaks. |
| Banned | Dollar signs as decoration, cash piles, rockets, candlesticks, generic offices or skylines, typing hands, stock "business people", retailer logos, AI imagery presented as real. |

Reusable components in `scripts/profitdecoded/motion/brand-lib.js`:
- `giftCard` (the episode-object pattern);
- `source`, `label`, `serif`, `number`, `lines`;
- `path` (progressive line draw);
- `cardOutline`, `vignette`;
- `measure` (layout);
- the shot engine (cut, fade or dip, time-pure frames).

## 5. How the prototype was produced (repeatable)

1. **Narration (CI, free).** Run `profitdecoded-voice-audition.yml` on the branch. It calls `produce-audio.js` with Kokoro `am_michael`, which writes `mix.wav`, `narration-only.wav` and `timeline.json`.
2. **Scenes.** `channels/profitdecoded/prototypes/gift-cards-first-minute/scenes.js` builds the shot list from the measured timeline. It uses phrase lookups (`PD.w(sentence, "phrase")`), so visuals follow the voice.
3. **Render (local).** Run `node scripts/profitdecoded/motion/render-motion.js <dir>`. It:
   - draws every frame in headless Chromium as a pure function of time;
   - pipes PNG frames to ffmpeg;
   - masters the audio (−14 LUFS, limiter, stereo 48 kHz);
   - encodes H.264 High at CRF 17 with BT.709 tags and a fixed-pattern dither (this removed the gradient banding measured in the first encode);
   - writes `captions.srt`, `shots.json` and `audio-master.json`.
4. **Stills and thumbnails.** `--stills t1,t2,…` for inspection; `render-thumbnails.js <dir>` for the thumbnail mockups and the mobile check board.

**Dependency note:** the renderer needs `playwright-core` with a Chromium headless shell. This machine had both in caches, so nothing new was installed. For CI and other machines, the smallest step is to add `playwright-core` as a devDependency plus `npx playwright install chromium-headless-shell` in the workflow. That is not done in this branch.

## 6. Thumbnail concepts (rendered mockups, original art)

Committed copies (JPEG) are in `channels/profitdecoded/prototypes/gift-cards-first-minute/evidence/`:
- `thumb-a-drawer-question.jpg`, `thumb-b-27-billion-unspent.jpg`, `thumb-c-three-claimants.jpg`;
- `thumbnails-mobile-check.jpg` (each concept at 360×202 and 168×94).

`render-thumbnails.js` regenerates them as full-resolution PNGs in `out/`.

| | A: "Who keeps it?" | B: "$27B unspent" | C: "Who gets it?" |
| --- | --- | --- | --- |
| Main visual | The episode's card rising out of a closed drawer, with a gold glow on the unspent-balance meter | "$27B" as the hero figure, a Signal "UNSPENT" block, card stack | The card at the centre with paths to three outlined icons (shop, person, government building), each with a "?" |
| Composition | Card left (60%), three-line serif stack right | Number left, cards right | Symmetric: three boxes above, card below, headline at the bottom |
| Text | WHO / KEEPS / IT? | $27B · UNSPENT · "SURVEY ESTIMATE · US" | WHO GETS IT? |
| Curiosity mechanism | An unresolved owner; complements the title rather than repeating it | Scale plus "unspent": where does it go? | Three candidates: which one, or how much each? |
| Mobile readability | Strong: three large words, one object | Strong figure; "survey estimate" unreadable at 168 px (accuracy marker only) | Headline readable; icons readable at 360 px, weak at 168 px |
| Factual accuracy | Accurate: the film asks exactly this | "$27B" is a **survey estimate** of unused gift cards, vouchers and store credit. The thumbnail says "survey estimate", but the claim is broader than gift cards. Acceptable with the title; avoid "lost" or "stolen". | Accurate: issuer, holder and state are the three parties in the payoff (c2, c4, c10). It does **not** imply equal shares. |
| Assets and licence | Original vector; no retailer marks | Original | Original line icons |
| Recommendation | **Lead A/B test candidate** | Second | Third: most explanatory, busiest at small sizes |

## 7. The prototype MP4

- **File:** `channels/profitdecoded/prototypes/gift-cards-first-minute/out/prototype.mp4`. It is not committed (repo media rules). It is delivered with this report and reproducible with §5.
- **Length:** 61.6 s.
  - The narration of the complete opening section ends at 59.9 s.
  - Ending at 60.0 s would clip the last line, and stopping one sentence earlier would cut the section's bridge into the documents.
  - So the prototype keeps the full opening and runs **1.6 s over the 45–60 s target**.
- **Captions:** `out/captions.srt` (sidecar, 16 cues).
- **Committed evidence** (`…/gift-cards-first-minute/evidence/`):
  - `contact-sheet.jpg` (18 frames extracted from the final MP4);
  - `captions.srt`;
  - `timeline.json` (measured narration);
  - `shots.json`;
  - `audio-master.json`;
  - the audition indexes.

## 8. Quality evaluation

### 8.1 Automated technical checks (measured on the final MP4)

| Check | Target | Measured | Result |
| --- | --- | --- | --- |
| Container and codec | MP4, H.264, yuv420p | H.264 High, yuv420p, AAC-LC, faststart | PASS |
| Resolution and frame rate | 1920×1080, 30 fps | 1920×1080, 30/1 | PASS |
| Colour tagging | BT.709 | bt709 primaries, transfer and matrix, tv range | PASS (tags added by remux after the render; the renderer now sets them at encode) |
| Duration | 45–60 s | 61.58 s | **1.6 s over** (see §7) |
| Decode errors | 0 | 0 | PASS |
| Black frames (≥ 0.2 s) | 0 | 0 | PASS |
| Static frames (freezedetect n=0.001, ≥ 1.5 s) | Only deliberate holds | 2: 28.7 s (1.6 s, on the $27B figure) and 59.1 s (1.7 s, closing quote and tail). The first encode had 15. | PASS (both holds are reading time) |
| Static frames, stricter (n=0.003) | Informational | 6 holds of 1.6–4.4 s; the longest is 27.3–31.7 s on the $27B figure while it is spoken | Review by eye |
| Gradient banding | None visible | Dark-gradient rings in the first encode (contrast-stretched comparison); none after the dither | PASS after fix |
| Integrated loudness | −14 LUFS ±1 | −14.7 LUFS | PASS |
| True peak | ≤ −1.0 dBTP | −2.5 dBTP (after AAC) | PASS |
| Loudness range | ≤ 6 LU, narration-led | 1.8 LU | PASS (very even, typical of TTS) |
| Clipping | 0 flat runs | Flat factor 0; peak count 2 at −2.5 dBFS (limiter ceiling) | PASS |
| Unintended silence | None ≥ 0.8 s at −45 dB | None | PASS |
| Music vs voice | Bed audible, never masking | −21 to −25 dB under the voice in pauses; about −32 to −36 dB under speech (ducked) | Never masks the voice; **possibly too quiet** (needs a human listen) |
| A/V sync | Video and audio lengths within 50 ms; cues from measured timings | 61.567 s vs 61.579 s (12 ms); shots start on measured sentence times; phrase cues estimated ±0.3 s | PASS (word-level cues are estimates) |
| Audio format | Stereo, 48 kHz | Stereo, 48 kHz, AAC 256 kb/s | PASS |
| Video bitrate | ≥ 8 Mb/s recommended by YouTube for 1080p30 uploads | 2.6 Mb/s average (flat graphics compress well) | Acceptable for flat graphics; raise only if YouTube's re-encode shows artifacts |
| Captions | ≤ 2 lines × 42 characters, ≥ 1 s per cue, ≤ 20 characters/s | 16 cues, maximum 18.7 characters/s, no violations (unit-tested) | PASS |
| Render time | — | 1,847 frames in 314 s on this Mac (about 5.1× real time) | MEASURED |

### 8.2 Human editorial judgement (from inspecting extracted frames; audio not heard)

Claude cannot hear the audio. Everything about the voice and music below is either measured or explicitly marked for a human listen.

| # | Area | Assessment |
| --- | --- | --- |
| 1 | Opening hook | The visual triad (drawer, wallet, pocket) puts a concrete object on screen in the first second, and the meter shows "money still on it" without inventing an amount. **But the script's opening is still gate-blocked (79/80)** and starts with a familiar "somewhere in a drawer" device. The editorial fix belongs to the script, not the edit. |
| 2 | Narration naturalness | **Not judged: requires a human listen.** Measured: 144 wpm overall, natural sentence gaps of 0.22–0.67 s, a 0.62 s pause after the hook question, no clipping. Kokoro's own grade for this voice is C+. |
| 3 | Visual relevance | Every shot explains something said: share as a unit chart, total as converging dots, "estimate" as stamp and ruler, "annual filings" as 10-K covers. No decorative shots. |
| 4 | Scene rhythm | Visual change about every 2–4 s through within-shot reveals. The wallet beat (0.6 s) may read too fast; human judgement. Two holds of about 2 s remain on the $27 billion figure (deliberate reading time). |
| 5 | Audio clarity | Measured clean (no clipping, no long silences). Artifacts in TTS (breathiness, glitches) can only be found by listening. |
| 6 | Music balance | The bed sits about 21–25 dB under the voice in pauses and about 32–36 dB under it during speech. It cannot overpower the narration, but it may be **too quiet to register**, and its musical quality (simple synthesised chords) is unverified. |
| 7 | Motion graphics quality | Consistent, restrained, on-brand. Not yet "premium": illustrations are flat line art, there is no texture or depth beyond a vignette, and the card is the only rich object. |
| 8 | Brand consistency | Palette, two modes (ink and paper), source lines and typography roles applied throughout. |
| 9 | Source accuracy | Every on-screen figure matches dossier claim c8 (43%, ≈ $27 billion, 2,373 adults, Aug 19–21, 2024, online by YouGov) and sources s1 and s2 (10-K fiscal years ended Sept 28, 2025 and May 31, 2026). The 43% label says "gift card, voucher or store credit", as the survey does. |
| 10 | Licensing risks | Visuals are owned. Fonts are not cleared (macOS system fonts). Music is owned. The voice is Apache-2.0. See §9. |
| 11 | Subtitle quality | Balanced, ≤ 2 × 42 characters, ≤ 20 characters/s, timed from measured sentences. One cue break splits "Olive / Garden" across cues (word timings are estimated). |
| 12 | Mobile viewing | Main labels ≥ 22 px at 1080p. The source line (26 px) is readable on a phone in landscape and small in portrait. The ruler tick labels are at the lower limit. |

**The three most important remaining improvements:**
1. **Narrator decision by ear.** Listen to the prototype and the nine auditions. If `am_michael` is not convincing, audition Chirp 3 HD (free tier) before the full film. The voice carries 100% of the runtime.
2. **Fix the opening in the script, then re-time.** The first 30 seconds are gate-blocked, and the edit can only follow the words. The winning benchmark model or the editor should rewrite the opening; the scenes re-time automatically from the new timeline.
3. **Premium finish of the visual layer.** Licensed open fonts (a publishing blocker); richer illustration for the 3–5 key moments per episode; a real music bed (YouTube Audio Library track or an improved procedural bed, chosen by ear).

## 9. Commercial licensing assessment

| Asset | Status | Risk |
| --- | --- | --- |
| Motion graphics, illustrations, thumbnails | Original, generated by our code | None |
| Figures and filing metadata | Facts from public sources, cited on screen | Low (facts are not copyrightable; attribution shown) |
| Fonts (Georgia, Avenir Next, DIN Alternate, from macOS) | **Not cleared** for video distribution under the macOS licence; internal test only | **Blocker for publishing.** Replace with OFL fonts (Source Serif 4, Inter or IBM Plex), which are free, permit commercial use and are vendored in the repo. |
| Voice: Kokoro | Apache-2.0 model and voices | Low; disclosure policy as in §2.3 |
| Voice: edge-tts | Unofficial use of a consumer read-aloud service | **Do not use for published videos** |
| Music: procedural pad | Owned (generated by `produce-audio.js`) | None |
| Music: YouTube Audio Library (proposed) | Monetisable on YouTube; some tracks need attribution (CC BY); standard-licence tracks are YouTube-only | Low on YouTube; record the track and licence per episode |
| Real documents, photos or footage (future) | Not used | Each needs a recorded licence in an asset register before use |

## 10. Cost and scalability (one 8–12 minute documentary)

| Item | Free/local approach | Cost | Label | Paid alternative (only where it may improve quality) |
| --- | --- | --- | --- | --- |
| Script generation | Depends on the benchmark: Gemini free tier or Claude Opus 5.5 | $0 (Gemini free) or about $0.70 expected / $1.71 high per script; about $0.90 per **accepted** script at 1.3 attempts | ESTIMATED (MODEL-BENCHMARK.md) | — |
| Research (dossier) | Operator plus free models; paid research disabled by policy | $0 cash; about 2–4 hours | ESTIMATED | — |
| Narration | Kokoro in CI | $0; the prototype's 61.6 s took one CI job (about 3 min including setup) | MEASURED (prototype); full film ESTIMATED | Chirp 3 HD $0 within the free tier; OpenAI ≈ $0.15; ElevenLabs ≈ $0.85 plus a plan. All UNVERIFIED for quality. |
| Visual assets | Original motion graphics (code) | $0 cash. **Authoring time is the real cost**: about 2–3 working hours for this 60 s, including building the library. | MEASURED (this session, approximate) | Licensed footage or stills: UNKNOWN, per asset |
| Music | Procedural pad or YouTube Audio Library | $0 | MEASURED / ESTIMATED | Paid library subscription: not needed now |
| Rendering | Local headless Chromium plus ffmpeg | $0; about 5 s of compute per 1 s of video on this Mac, so **≈ 50–60 min for a 10-minute film** | MEASURED rate; full film ESTIMATED | — |
| Thumbnail | `render-thumbnails.js` | $0, seconds | MEASURED | — |
| Quality evaluation | Automated checks plus a human listen and watch | $0; about 45–60 min of human time | ESTIMATED | — |
| **Total per accepted video** | | **$0 to about $1 cash** (depending on the writer) plus **about 1–1.5 working days** of research, scene authoring and review | ESTIMATED | |

**Weekly cadence:**
- **Rendering, narration and QA are not the bottleneck** (about 1–2 hours of machine time).
- **Scene authoring is.** This prototype hand-wrote about 60 seconds of bespoke scenes. A 10-minute film needs about 120–150 visual beats.
- Weekly production is realistic only if:
  1. most beats come from **parameterised templates** (unit chart, figure with source, document card, money flow, timeline, comparison);
  2. bespoke illustration is limited to 3–5 key moments;
  3. research dossiers are ready one to two weeks ahead (see CONTENT-STRATEGY.md in PR #212).
- One prototype does **not** prove consistency. The first full film will measure the real authoring time.

## 11. Remaining blockers

1. **Writing model**: pending the Gemini benchmark (07:05 UTC, 2026-10-10). Not decided here.
2. **Opening gate**: the reference opening is blocked at 79/80. A rewrite is needed before the full film.
3. **Narrator by ear**: no human has listened to `am_michael` on this material. Required before the full film.
4. **Fonts**: replace the macOS system fonts with vendored OFL fonts (a publishing blocker).
5. **Renderer dependency**: `playwright-core` plus a Chromium headless shell must become a declared dependency (`package.json` and the workflow) for anyone other than this machine to render.
6. **Music**: choose the bed by ear (raise the procedural bed or pick an Audio Library track) and record its licence.
7. **QA automation**: fold freeze detection, loudness/true peak and caption checks into `profitdecoded.js dry-run`.

## 12. Exact steps to produce the complete video (after approval)

1. Benchmark result → owner approves the writing model (MODEL-SELECTION.md in PR #212).
2. Produce the full script with that model through the existing story engine (`develop`, gates, independent review). If Claude is chosen, this is one paid experiment under the single-use approval (PR #211), max $2. The opening must pass its gate. No automatic regeneration.
3. Owner listens to the prototype and the auditions → confirms the narrator (or authorises a Chirp 3 HD audition, free tier).
4. Vendor the OFL fonts; add `playwright-core` (devDependency) and the headless shell to the render workflow.
5. Narration: `produce-audio.js` on the full bundle (CI, Kokoro or the chosen voice) gives `mix.wav` and `timeline.json`.
6. Scenes: template beats for the about 120 standard moments, bespoke illustration for 3–5 key moments; every figure from the dossier with a source line.
7. Music: chosen bed plus licence record.
8. Render with `render-motion.js` (about 1 hour), then QA (§8.1 checks), a human watch and listen, and editorial sign-off.
9. Thumbnail: the chosen concept, final art.
10. Stop for approval. Publishing stays blocked until the owner enables it.

## Sources (pricing and policy, checked 2026-10-09)

- Google Cloud Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing
- Azure AI Speech pricing: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/
- OpenAI gpt-4o-mini-tts model page: https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- ElevenLabs pricing (third-party summaries; verify on the official page): https://www.happyrobot.ai/hub/elevenlabs-pricing , https://developer.puter.com/tutorials/elevenlabs-api-pricing/
- YouTube Audio Library and monetisation: https://support.google.com/youtube/answer/3376882
- YouTube altered or synthetic content disclosure: https://blog.youtube/news-and-events/disclosing-ai-generated-content
- Kokoro-82M voice grades and licence (local model card: VOICES.md, README).
