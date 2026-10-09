# ProfitDecoded: production blockers resolved and readiness for the first full documentary

Date: 2026-10-09.
Episode: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (`hbm-073`).
Branch: `feat/profitdecoded-production-prototype` (PR #213).
This follows `PRODUCTION-PROTOTYPE.md` and supersedes its font, dependency and blocker sections.

**Status:**
- Internal creative test.
- No paid API call, no upload; publishing stays blocked.
- No other channel changed.
- PR #212 and the Gemini benchmark untouched.
- The full documentary is **not** rendered.

## Summary

| Task | Result |
| --- | --- |
| 1. Voice auditions | The nine existing files were packaged (not regenerated) into `profitdecoded-voice-auditions.zip` (4.6 MB, `.m4a`, plays anywhere), with `manifest.csv` and a listening sheet. **No voice is selected. A human listen is required** (§1). |
| 2. Publishing blockers | macOS system fonts replaced with OFL fonts. Render dependencies pinned. A clean-runner CI render job was added. A licence register covers every asset (§2). |
| 3. Visual quality | Larger text for phones, a readable source line, true match cuts, a new 3D shot for variety, shared timing constants (§3). A new prototype was rendered locally and measured. |
| 4. Scalability | 13 reusable components, each needed by a specific shot type in the gift-card script. No framework (§4). |
| 5. Opening | A targeted draft fixes the real weakness. It scores 85 under the gate (79 before) and 85 at real narration pace (75 before), with no attribution issue. **Draft only, not applied** (§5). |
| 6. Delivery | ZIP, MP4, thumbnails, licence register, dependency manifest, blockers, readiness (§6–§8) |
| 7. CI | PR #213 had 8/8 checks passing before this round. This round's run is reported in §6. |

## 1. Voice auditions

**File:** `profitdecoded-voice-auditions.zip`. It contains 9 `.m4a` files (AAC 96 kb/s), `manifest.csv` and `README.txt`.

**How it was made:**
- These are the same files rendered in CI run 37969918667, converted from the original WAVs (lossless originals are in that run's artifact `profitdecoded-voice-audition`). No audio was regenerated.
- Every file is the same 45-second opening excerpt at the channel rate (−3%).

| # | File | Voice / model | Duration | Pace | Commercial use | Narration cost per 10-min video |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `01-kokoro-am_michael.m4a` | Kokoro-82M `am_michael` (US male) | 44.8 s | 150 wpm | Yes: Apache-2.0 | $0 |
| 2 | `02-kokoro-af_heart.m4a` | Kokoro-82M `af_heart` (US female) | 41.5 s | 162 wpm | Yes: Apache-2.0 | $0 |
| 3 | `03-kokoro-af_bella.m4a` | Kokoro-82M `af_bella` (US female) | 42.4 s | 158 wpm | Yes: Apache-2.0 | $0 |
| 4 | `04-kokoro-am_fenrir.m4a` | Kokoro-82M `am_fenrir` (US male) | 36.3 s | 185 wpm (too fast) | Yes: Apache-2.0 | $0 |
| 5 | `05-kokoro-am_puck.m4a` | Kokoro-82M `am_puck` (US male) | 35.6 s | 189 wpm (too fast) | Yes: Apache-2.0 | $0 |
| 6 | `06-kokoro-bm_george.m4a` | Kokoro-82M `bm_george` (British male) | 42.5 s | 158 wpm | Yes: Apache-2.0 | $0 |
| 7 | `07-edge-tts-…AndrewMultilingualNeural.m4a` | Microsoft neural (via edge-tts) | 42.5 s | 158 wpm | **No** through edge-tts. Officially available through Azure AI Speech. | $0 within Azure's 0.5 M characters/month free tier; about $0.13 above it (unverified) |
| 8 | `08-edge-tts-…BrianMultilingualNeural.m4a` | Microsoft neural (via edge-tts) | 40.8 s | 165 wpm | No (edge-tts); Azure officially | as above |
| 9 | `09-edge-tts-…ChristopherNeural.m4a` | Microsoft neural (via edge-tts) | 45.3 s | 148 wpm | No (edge-tts); Azure officially | as above |

**Recommendation from the evidence (not a selection):**
- **Listen to files 1–3 first.** They are the only voices that are free **and** publishable today.
- Kokoro `am_michael` is the incumbent:
  - the owner picked it earlier;
  - it has the best measured pace for documentary narration (150 wpm, 14 natural pauses);
  - but its model card grades it C+.
- `af_heart` has the highest model-card grade (A) and a slightly faster pace (162 wpm).
- If a Microsoft voice (7–9) clearly wins by ear, the legal route is Azure AI Speech. That needs an Azure account, which is the owner's decision.
- Google Chirp 3 HD remains the strongest untested option. Its free tier covers about 4 videos a month, but testing it needs a GCP billing account.
- **Quality cannot be judged from measurements.** Please score each file with the five questions in `README.txt`.

## 2. Publishing blockers

### 2.1 Fonts (macOS system fonts replaced)

| Role | Before (not cleared) | Now | Licence | Pinned as |
| --- | --- | --- | --- | --- |
| Headlines, quotes | Georgia | **Source Serif 4** (600, 700, 700 italic) | SIL OFL 1.1 | `@fontsource/source-serif-4` 5.3.0 |
| Labels, body | Avenir Next | **Inter** (400–800) | SIL OFL 1.1 | `@fontsource/inter` 5.3.0 |
| Figures | DIN Alternate | **Barlow Semi Condensed** (500, 600) | SIL OFL 1.1 | `@fontsource/barlow-semi-condensed` 5.3.0 |

How the fonts are enforced:
- The woff2 files are embedded in each render as data URIs (`scripts/profitdecoded/motion/fonts.js`).
- The page checks that every face loaded and **fails the render** otherwise, so a silent fallback to a system font is impossible.
- Tests assert that the brand library names no system font and that each font's licence is OFL and its version matches the pin.

Quality comparison: the replacements are close in role and weight.
- Source Serif 4 is a more contemporary editorial serif than Georgia.
- Inter is slightly wider than Avenir, so chip widths are now measured, not hard-coded.
- Barlow Semi Condensed keeps the condensed, tabular feel of DIN.
- The frames were inspected after the switch (evidence contact sheet). No asset was replaced with a lower-quality one.

### 2.2 Rendering dependency manifest

| Dependency | Version | How it is pinned | Licence |
| --- | --- | --- | --- |
| Node.js | 20 (CI) | `actions/setup-node` | MIT |
| `playwright-core` | **1.56.1** | exact version, `package.json` devDependencies | Apache-2.0 |
| Chromium headless shell | **141.0.7390.37 (build 1194)** | fixed by playwright-core 1.56.1; installed with `npx playwright-core install --only-shell chromium`; CI cache key `ms-playwright-headless-shell-1.56.1` | BSD-3-Clause and others |
| `@fontsource/source-serif-4`, `@fontsource/inter`, `@fontsource/barlow-semi-condensed` | **5.3.0** each | exact versions, devDependencies | OFL-1.1 |
| ffmpeg | runner apt package (CI), 8.1 (local) | `scripts/ci-apt.sh ffmpeg` | LGPL/GPL (tool only) |
| Python | 3.12 (CI) | `actions/setup-python` | PSF |
| `kokoro-onnx` | **0.6.1** | `pip install kokoro-onnx==0.6.1` (motion job) | MIT |
| `soundfile` | **0.14.0** | pinned in the motion job | BSD-3-Clause |
| Kokoro model files | v1.0 | **sha256-verified** in CI (`kokoro-v1.0.onnx` 7d5df8ec…, `voices-v1.0.bin` bca610b8…) | Apache-2.0 |

Notes:
- This repo gitignores `package-lock.json`, so pinning is by exact version. The four render packages have no transitive dependencies.
- The older audition and Short-render jobs still install `kokoro-onnx` unpinned. That is unchanged here (out of scope); it is a one-line follow-up.

### 2.3 Clean-runner render

`profitdecoded-render.yml` gains a `motion-prototype` job. On a fresh `ubuntu-latest` runner, it:
1. installs the pinned packages;
2. installs the headless shell;
3. narrates with Kokoro and verifies the model checksums;
4. renders the prototype;
5. runs `qa-media.js` (hard checks fail the job);
6. renders the thumbnails and component sheet;
7. uploads everything as the artifact `profitdecoded-motion-prototype`.

No secrets, no upload, no paid calls.

### 2.4 Licence register

`channels/profitdecoded/prototypes/gift-cards-first-minute/licenses.json` (checked by tests) lists every asset with its licence and evidence:
- original graphics and thumbnails (owned);
- the three OFL fonts;
- Kokoro narration (Apache-2.0, checksums);
- the procedural music bed (owned; generated by `produce-audio.js`, no samples);
- survey facts and filing metadata (facts, attributed on screen, no facsimiles or logos);
- the tools.

**Not used:** stock footage, AI imagery, logos, document facsimiles, third-party music, edge-tts voices, macOS fonts.

## 3. Visual quality changes

| Area | Change | Why |
| --- | --- | --- |
| Mobile readability | Minimum label size 24 px; key labels 26–32 px; survey label lines 44 px; ruler labels 30 px; document date and company name larger | The smallest 1080p text was 18–22 px, too small on a phone |
| Source labels | 30 px Inter (was 26 px), brighter (text colour at 88%), heavier SOURCE tag; a dark-on-paper variant for document scenes; the filings' footnote became a proper SOURCE line | The source line was the hardest text to read |
| Variety | The flat grid of card outlines became a **tilted 3D wall** of 54 unbranded cards in brand tints, drifting past | Six of the earlier shots were flat 2D on the same dark background |
| Match cuts | Drawer, wallet and pocket now hold the card at the **same screen position and angle**; the hero shot starts from that anchor | The 0.6 s wallet beat read as a jump; now the object stays put and only its surroundings change |
| Motion consistency | Shared timing constants (`PD.T`: 0.5 s entrances, 0.8 s moves, 0.12 s stagger); entrances use one easing | Mixed durations across scenes |
| Glitches fixed | A stray dot from a not-yet-drawn line (round line cap); the balance meter briefly emptying on the card shot; timeline final marks not appearing | Found by inspecting extracted frames |

The identity is unchanged: dark documentary look, coral-red highlights, teal card, clean financial type, original explanatory motion graphics. There is no stock footage and no fabricated documents.

## 4. Reusable components (only what the gift-card film needs)

The full reference script asks for these visual types:
- 10 typography beats;
- 9 money flows;
- 7 charts;
- 5 animated numbers;
- 5 comparison panels;
- 5 filing excerpts;
- 4 timelines;
- 3 diagrams;
- 2 UI callouts;
- 1 unit-economics beat.

**No maps are needed, so none were built.**

| Component (`brand-lib.js`) | Covers | Reusable for future films |
| --- | --- | --- |
| `giftCard` (palette and meter options) | episode object, UI callouts | Pattern: one hero object per episode |
| `unitChart`, `unitPos` | shares ("43 of 100") | Any percentage |
| `number`, `stamp`, `logRuler` | animated numbers, estimates, scale | Any headline figure, with estimate marking |
| `chips` | survey or method facts | Any methodology line |
| `barChart` | 7 chart beats (e.g. Starbucks breakage FY2023–FY2025) | Any short series |
| `moneyFlow` | 9 money-flow beats (e.g. $15,245.8M loaded → $1,751.7M balance → $15,199.5M recognized) | Any transaction flow |
| `timeline` | 4 timeline beats (12 CFR 1005.20: 1 year, 5 years) | Any rule or history timeline |
| `docCover` | filing presentations | Any company filing (typeset, not facsimile) |
| `filingQuote` | 5 filing excerpts with highlighted phrase and citation | Any quoted document |
| `compare` | 5 comparison panels (holder, issuer, government) | Any side-by-side |
| `statement` | 10 typography beats | Any headline line |
| `source`, `label`, `serif`, `lines`, `path`, `vignette` | everywhere | Base kit |

The component sheet is `evidence/components-sheet.jpg`. It uses exact dossier quotes and figures and was rendered on this machine; CI renders it as well.

**Effect on authoring time:** about 45 of the script's 51 visual specs map directly onto one of these components plus data. The bespoke work left is the 3–5 hero illustrations per episode (here: drawer, wallet and pocket, the card wall).

## 5. Opening: targeted draft

**File:** `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/opening-draft.json`. It is **not applied**; `latest.json` is unchanged and the gate is not overridden.

**Actual weakness, measured:**
- The gate times the script at 2.6 words per second and scores it **79**: hook 64, title validation 77, momentum 100.
- At the measured narration pace (144 wpm) it reads **75**.
- The first 5 seconds have no concrete name or number.
- The title's question ("who keeps the money?") arrives only about 45 s in, after 15–30 s of survey method.
- The obvious fix (open on "$27 billion", attribute later) **fails the non-waivable attribution rule** ("uses Bankrate's facts before naming it").

**Draft (replaces s1-1 to s1-4; s1-5 onward unchanged):**

> By Bankrate's estimate, Americans are still sitting on about $27 billion in gift cards, vouchers and store credit they haven't used.
> Some of it may be yours. And if that money never gets spent, who keeps it?
> That figure comes from a survey run online by YouGov in August 2024 with 2,373 adults. 43 percent said they're holding at least one.
> It's an estimate, not a count, and Bankrate doesn't publish how it calculated it, which means it tells you the scale, not the exact amount.

| Measure | Current | Draft |
| --- | --- | --- |
| First-30 s gate | 79 (blocked) | **85** |
| At measured pace (144 wpm) | 75 | **85** |
| Retention critique | 90; weak-opening (high) | **100**; no issues |
| Attribution issues | 0 | 0 |
| Numbers not in the dossier | 0 | 0 (27, 2024, 2,373, 43, all in claim c8) |
| AI-pattern score | 0 | 4 |
| Words before s1-5 | 113 | 85 (the question arrives about 30 s earlier) |

The draft keeps the survey's method and the estimate caveat in full; only the order changes. The selected writing model (or the editor) should review it, and the full story gates should re-run on the whole script, before it replaces the current opening.

## 6. Prototype delivery and measurements

**Deliverables:**
- **New prototype MP4:** rendered locally from the updated scenes, OFL fonts and the same measured narration (`out/prototype.mp4`, 1847 frames in 339 s). Delivered with this report.
- **Evidence, committed:**
  - `channels/profitdecoded/prototypes/gift-cards-first-minute/evidence/`: `contact-sheet.jpg` (18 frames from the final MP4), `components-sheet.jpg`, the three thumbnail JPEGs, `thumbnails-mobile-check.jpg`, `qa.json`, `captions.srt`, `timeline.json`, `shots.json`, `audio-master.json`;
  - `licenses.json`;
  - the opening draft.
- **Not committed:** the MP4 and audio, per the repo's media rules.

**Technical QA on the final MP4** (`qa-media.js`, measured):

| Check | Measured | Target | Result |
| --- | --- | --- | --- |
| Resolution / frame rate | 1920×1080 / 30 fps | 1920×1080 / 30 | PASS |
| Codec / colour | H.264 High yuv420p, BT.709 tags set at encode | H.264, BT.709 | PASS |
| Audio | AAC stereo 48 kHz | stereo 48 kHz | PASS |
| Decode errors / black frames | 0 / 0 | 0 / 0 | PASS |
| Loudness / true peak / LRA | −14.7 LUFS / −2.5 dBTP / 1.8 LU | −14 ±1 / ≤ −1 / ≤ 8 | PASS |
| Unintended silence | none | none ≥ 0.8 s | PASS |
| Static holds | 2 holds of 1.8 s (the $27B figure; the closing quote) | none over 3 s | PASS |
| A/V duration match | 13 ms | ≤ 100 ms | PASS |
| Captions | 16 cues, 0 outside limits | ≤ 2×42 characters, ≥ 1 s, ≤ 20 characters/s | PASS |
| Duration | 61.58 s | 45–60 s | **WARN: 1.6 s over** (the full opening section; the draft opening would bring it to about 50 s) |

**Editorial notes from the extracted frames** (human judgement; audio not heard):
- Every shot now reads at phone size. The source line is legible in both modes.
- The wallet beat is still short (0.6 s), but the card no longer jumps.
- The card wall adds a second visual register.
- Voice and music are **not** judged; that is the owner's listen.

**CI, clean runner** (run 37976847812, `motion-prototype` job):
- The prototype rendered from pinned dependencies only: 1847 frames in 507 s on a GitHub-hosted runner.
- The same QA figures as the local render (−14.7 LUFS, −2.5 dBTP, A/V 12 ms, 16 caption cues within limits); hard QA PASS.
- The only failure was the last step: the thumbnail mobile board called ImageMagick, which the runner lacks. Fixed by drawing the board with the pinned headless browser, so the render path no longer needs ImageMagick.
- All other PR checks passed.

## 7. Remaining production blockers

| # | Blocker | Owner | Status |
| --- | --- | --- | --- |
| 1 | Writing model selection (Gemini benchmark at 07:05 UTC, 2026-10-10) | Benchmark, then the owner | Open, untouched here |
| 2 | Opening rewrite review (draft ready, gate passing) | Selected model or editor, then the owner | Draft ready |
| 3 | Narrator chosen by ear (ZIP delivered) | **Owner** | Open: needs a human listen |
| 4 | Music bed judged by ear (procedural bed, owned; possibly too quiet) | **Owner** | Open |
| 5 | Thumbnail concept choice (A recommended) | Owner | Open |
| 6 | Pin `kokoro-onnx` in the two older workflows | Engineering | One-line follow-up |
| ~~7~~ | ~~Fonts not cleared~~ | — | **Resolved** (OFL, pinned, enforced) |
| ~~8~~ | ~~Renderer dependency undeclared~~ | — | **Resolved** (pinned, CI job) |
| ~~9~~ | ~~QA checks manual~~ | — | **Resolved** (`qa-media.js`, used in CI) |

## 8. Full-video production readiness

| Area | Ready? | Evidence or gap |
| --- | --- | --- |
| Research | **Yes** | Verified dossier `hbm-073` |
| Script | **No** | Writing model not selected; opening draft awaiting review |
| Narration | **No** | Technically ready (Kokoro in CI, deterministic); voice not approved by ear |
| Visual system | **Yes, for this episode** | Components cover 45 of the 51 visual specs directly; the remaining 3 diagrams, 2 UI callouts and 1 unit-economics beat compose from existing parts; hero illustrations built |
| Audio mastering | **Yes** | −14 LUFS target, true peak ≤ −1 dBTP, stereo 48 kHz, verified by `qa-media.js` |
| Music | **Partly** | Licence clean; quality unjudged |
| Licensing | **Yes, for every asset used** | Licence register, tests |
| Rendering | **Yes** locally; CI result in §6 | Pinned dependencies; about 5 s of compute per 1 s of video locally |
| Captions | **Yes** | Sidecar SRT within limits (tested) |
| QA | **Yes (technical)** | `qa-media.js`; editorial review is still human |
| Thumbnail | **Partly** | Three mockups; final art after the concept pick |
| Publishing | **Blocked by design** | `publishGuard` fail-closed; no upload |

**Verdict:** the production system is ready to make the full film **once three owner decisions are in**:
1. the writing model (benchmark);
2. the narrator (by ear);
3. the music (by ear).

Expected effort after approval:
- about 1 day of scene authoring, mostly components plus data;
- about 1 hour to render locally;
- about 1 hour of QA and review.

Cash cost: $0 to about $1, depending on the writing model.
