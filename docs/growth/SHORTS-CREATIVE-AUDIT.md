# Shorts performance and creative audit (2026-10-11)

**Scope**
- Failure Reconstructed (FR), ImpossibleBrief (IB) and CriticalThread (CT) Shorts; ProfitDecoded (PD) status.
- Behind the Ordinary is inactive and is not analysed here.

**Sources**
- The repository's stored YouTube Analytics: per-video checkpoints and warehouse tables on `main`, synced through 2026-10-11.
- Public YouTube pages, inspected in a browser. Frames were sampled from the playing video, and the first spoken lines were read from YouTube's own captions where they loaded.
- Local renders of the current engine, made with the production Edge voice.

**What this does not use**
- No paid calls were made.
- No competitor-private metrics were used; only public view counts.
- No published video was changed.

## 1. Diagnosis per channel

Our Shorts top out at 1,731 views (FR), 1,207 (IB) and 1,049 (CT). On every channel, 80–98% of views come from the Shorts feed. YouTube is therefore testing each Short, then stops widening its audience.

The two numbers that move with views (section 6) are:
- how many viewers stay past the opening, measured as engaged views ÷ views;
- how much of the video they watch.

Our internal scores do not move with views.

| Channel | Shorts with ≥ 3-day data | Median views | Max | Median avg % viewed | Median engaged ÷ views | Subs per 1,000 views | Main problem (evidence) | Confidence |
|---|---|---|---|---|---|---|---|---|
| FR | 16 | 1,005 | 1,731 | 67.8% | 0.39 | 1.95 | **B (weak opening) and C (early retention loss).** About 6 in 10 starts never become an engaged view. The best FR Shorts are the ones viewers finish or replay: Challenger (92% viewed), Eastern 212 (119%), "The Nuclear Test That Poisoned a Paradise" (109%). Every frame is horizontal footage letterboxed into the middle third, and the first frame is often blurred. | medium |
| IB | 6 | 829 | 1,207 | 63.0% | 0.33 | 1.26 | **B, C and E (poor visual engagement).** The dinosaur Short (311 views) shows one image, unchanged, from 0 to 15 s. The current engine opens on data maps and charts (section 3). | medium |
| CT | 5 | 62 | 1,049 | 65.9% | 0.33 | 0 | **A (insufficient distribution), then B and E.** Two Shorts barely entered the feed: 43 views (7% from the feed) and 62. The 62-view Short shows an unrelated official in front of flags at 3 s, over generic control-room stock. CT has also published nothing since 2026-10-06 because no topics qualify. | medium for A; low for the rest |
| PD | 0 Shorts; 1 long video | — | — | — | — | — | **G (insufficient data).** Documentary #1 was 19 hours old with 1 public view when inspected. The repository collects no PD analytics. | — |

**Removed uploads.** Six uploads with zero recorded views were removed by the uploader; their public pages say so. They are excluded from the medians: Nk7vmybWY98, 4Mo58FxCr4A, fGCiri0k_s8, NobEECFBrwo, wG9a6kQL8Kc, 7q3E09HMIGI.

## 2. Analytics metrics: available and unavailable

| Metric | Status | Source |
|---|---|---|
| Views, likes, comments | AVAILABLE | Data API |
| Watch time, average view duration, average % viewed | AVAILABLE | Analytics API |
| Audience retention curve (watch ratio and relative retention, per 1% of length) | AVAILABLE | Analytics API |
| Engaged views | AVAILABLE | Analytics API; used here as the proxy for "stayed to watch" |
| Subscribers gained and lost | AVAILABLE | Analytics API |
| Traffic sources (per video and per channel) | AVAILABLE | Analytics API |
| Publishing date and time | AVAILABLE | upload state |
| Shorts feed impressions | **UNAVAILABLE** | Studio only |
| Stayed to watch vs swiped away | **UNAVAILABLE** | Studio only; importable by hand with `scripts/studio-import.js` |
| Click-through rate | **UNAVAILABLE** | Studio only |
| Returning viewers per video | **UNAVAILABLE** | not exposed per video |
| 1-day checkpoints | views only | the rest arrives at 3 and 7 days |

## 3. Competitor benchmark (what was actually inspected)

Videos were sampled at 0, 0.5, 1, 2, 3, 5 and 8 s, plus a later frame. "First spoken line" appears only where YouTube's captions loaded during playback; otherwise it is marked NOT CAPTURED. Audio was not listened to, and no competitor-private metric is used.

| Niche | Video | Public views | Length | First frame and opening | First spoken line | Technique |
|---|---|---|---|---|---|---|
| FR | Fascinating Horror, aI7Bl-0uFvg | 61K | 59 s | black, then a full-frame archival portrait with a slow push | "This is Vesna Vulović, a Serbian flight attendant who survived a fall longer than any other human…" | one person, one record-breaking fact; calm narrator; almost no on-screen text |
| FR | Plainly Difficult, mRZ_4-M17M4 | 39K | 44 s | full-frame fire footage from frame 0, with the date as a title | "What caused this town to burn down? So when they say don't try this at home, this is why you shouldn't." | a question plus wry stakes |
| FR | Brick Immortar, pyBUlUPZBI4 | 1.5M | 105 s | animated weather map with labelled radio-call text | NOT CAPTURED | **an authentic artifact**: a real distress call, according to the title |
| IB | What If, WdPUtf3IZvM (same topic as our IB-311) | 979K | 159 s | split screen: cinematic CGI on top, changing every 0.5–1 s, with bold captions; presenter on camera below | NOT CAPTURED | presenter, constant motion, big captions |
| IB | What If, 2d6Ciu3INeA | 3.3M | 172 s | split screen: presenter and a CGI character | NOT CAPTURED | humour and escalating scale |
| IB | minutephysics, bU9xvXyWrdk | 196K | 44 s | a hand-drawn line being drawn at frame 0 | NOT CAPTURED | continuous drawn animation; motion from the first frame |
| CT | Practical Engineering, 3GUpquh6ctc | 3.2M | 58 s | a mystery object close-up on top, presenter below | NOT CAPTURED | **participation**: the viewer guesses "Name That Infrastructure" |
| CT | Real Engineering, rW_tgmNIh9Y | 3.4M | 74 s | full-frame vertical footage with 1–2-word captions | NOT CAPTURED | full-frame motion; minimal captions |
| CT | Asianometry, x4qPbKFxnsc | 31K (966K subscribers) | 90 s | a static title card over a still photo for about 3 s, then captioned archival images | NOT CAPTURED | the closest to our format, and also the lowest performer here |

**Our Shorts inspected the same way**
- FR Challenger (1,731 views) opens on a blurred, letterboxed clip with no text at frame 0. It starts speaking at 0.0 s: "73 seconds after launch, Challenger broke apart."
- FR Rana Plaza (103 views).
- IB dinosaurs (311 views): one image held from 0 to 15 s. Its first words, "110 km asteroid", land at about 1.8 s.
- CT tunnel fire (1,049 views): opens on a rack of gas cylinders.
- CT San Diego (62 views): an unrelated official at 3 s.

**Techniques we can adopt without copying creative work**
1. A clear subject fills the first frame: a person, an object or the event. Never a map, chart or establishing view.
2. Motion from frame 0: drawn animation or moving footage, not a still with a slow drift.
3. A participation hook where it is honest. An original CT format along the lines of "What does this machine do?" fits our evidence model.
4. Authentic primary artifacts: public-domain investigation transcripts, recorded calls in public records, official photographs. For FR this is the strongest original lever, and it needs respectful handling.
5. A presenter is the most common factor among the top Shorts. We use synthetic narration, which is an owner decision rather than an engineering one.

## 4. Five biggest creative problems

Ranked by likely viewer impact. "Defect" means measurable; "Editorial" means a judgment.

| # | Problem | Evidence | Kind | Impact | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | **Weak first frame.** IB opens on data maps and charts; CT on distant establishing shots; FR on letterboxed 16:9 footage filling about a third of the screen. The hook text is about 60 px on a 1080 px frame. | contact sheets in `reports/creative-audit/2026-10-11/`; the frame strips above | defect plus editorial | high | low (IB and CT); medium (FR legacy renderer) | **fixed behind a flag for IB and CT** (craft v2); FR not yet |
| 2 | **Pictures don't match the line, and repeat.** IB and CT draw on 4–6 licensed images per Short and repeat each 3–5 times. "39 people died" plays over a calm valley. Stock clips are loosely matched. | render plans: the Yucatán map 5 times in the dinosaur Short, the valley 4 times in the tunnel Short | defect | high | medium–high | repeats now return as detail crops (flag); **the thin image pool remains a blocker** |
| 3 | **Scripts are fact lists.** The CT tunnel Short has 7 numbers in 25 s, reads "11.611 kilometres" aloud, and ends on a payoff ("ventilation matters") the facts never set up. IB openings read the title aloud. | `script.txt` of each render | editorial | medium–high | medium | Haiku experiment arms prepared (PR #223); editorial rules proposed |
| 4 | **Flat synthetic delivery.** Each line is synthesised separately and joined with a uniform 0.18 s gap at one rate. The final mix is very compressed (loudness range about 2 LU) over a generic bed, with no sound effects. | measured: 143–154 words/min, speech from 0.1 s, −14 LUFS, range 1.9 LU | defect plus editorial | medium | low (pacing); high (better voice) | **pacing fixed behind a flag**; voice unchanged |
| 5 | **Broken titles.** Examples: "How Fusion Reached Practical Power-plant Gain Would Unfold"; "Inside High-lift Water Pump: The Hidden Dependency". | `published.json` | defect | medium (feed Shorts rely less on titles) | low | not fixed in this pass; a grammar check on titles is the next small task |

## 5. Implemented: Shorts craft v2 (`core/rendering/craft.js`, OFF by default)

It applies to the shared IB, CT and BTO renderer (`core/rendering`), and is enabled by `SHORTS_CRAFT_V2=1` or a comma-separated list of channels. A growth experiment on `opening_visual` with the arm value `craft-v2-opening` enables the opening change alone, for that one video. Facts, scripts, sources and every gate are unchanged.

1. **First frame.** The opening picture is the best-scoring photograph or illustration of the hook's subject. A data figure (map, chart, anomaly plot, topography) can never open. An illustration opens full-frame.
   - Dinosaur: was the Yucatán geological map; now the artist's impression of the impact.
   - Ice: now anchor ice under sea ice.
   - Tunnel: unchanged, because the pool has no better picture.
2. **Hook text.** One or two balanced lines, sized up to 132 px (about twice the old size), over a readability band, for the first 2 seconds.
3. **Repeats.** A picture appears at most 3 times, and every return is a 1.5× detail crop on a different region. A data figure appears at most twice, always whole. The payoff never closes on a procedural filler frame; it returns to the opening picture instead.
4. **Read pacing.**
   - A 0.32 s beat after the hook and 0.36 s before the payoff, with 0.13 s joins elsewhere, about the same total.
   - The payoff is read 5 percentage points slower.

**Tests**
- `tests/js/shorts-craft.test.js`: 7 tests, including "the plan is identical with the flag off" and "the experiment arm changes only the opening".
- Full suite on the branch: 544/544 pass.

**Before and after** (ignored by git; local only): `reports/creative-audit/2026-10-11/`

| Short | Before | After | Side by side | Frames |
|---|---|---|---|---|
| IB dinosaur | `ib-dinosaur-before.mp4` | `ib-dinosaur-after.mp4` | `ib-dinosaur-side-by-side.mp4` | `ib-dinosaur-contact-before-top-after-bottom.png` |
| IB ice | `ib-ice-before.mp4` | `ib-ice-after.mp4` | `ib-ice-side-by-side.mp4` | `ib-ice-contact-before-top-after-bottom.png` |
| CT tunnel fire | `ct-tunnel-fire-before.mp4` | `ct-tunnel-fire-after.mp4` | `ct-tunnel-fire-side-by-side.mp4` | `ct-tunnel-fire-contact-before-top-after-bottom.png` |

**What it does not fix**
- The thin licensed image pool. CT still has no picture of the fire.
- Fact-list scripts.
- The voice itself.
- FR, which uses the legacy renderer (`shorts-yap.js`).

## 6. Quality-score calibration

Rank correlation (Spearman ρ) across the Shorts with ≥ 3-day data, all channels pooled. n = 24–27 for the audience metrics and 16 for the internal scores, which are recorded only since the growth engine went live. These are small samples and several comparisons, so treat them as directions, not proof. No model was fitted.

| Pair | ρ | n | Reading |
|---|---|---|---|
| engaged ÷ views vs views | 0.60 | 24 | staying past the opening goes with reach |
| watch ratio at 3 s vs views | 0.57 | 27 | the first seconds go with reach |
| avg % viewed vs views | 0.54 | 27 | finishing and replaying go with reach |
| readiness vs views | 0.41 | 16 | weak; readiness spans only 88–92 |
| readiness vs avg % viewed | 0.17 | 16 | readiness does not predict watching |
| topic factors vs views | 0.37 | 16 | weak |
| hook score vs views | 0.04 | 16 | none |
| hook score vs engaged ÷ views | 0.01 | 16 | **none**: the hook score does not measure what viewers respond to |

**Findings**
- Every published Short scores 88–92 on readiness. That separates "safe to publish" from "broken", not good from great, and it is mostly technical compliance: sources, lint, loudness, captions, duration.
- The hook score rates the text. It never sees the first frame, and the first frame is what viewers react to.

**Proposals**
- Keep readiness as the compliance gate, unchanged, including the factual and safety rules.
- Report a separate **creative** read that measures the render itself:
  - first-frame type (data figure or letterbox counts against it);
  - opening-subject relevance;
  - picture repetition;
  - the longest static hold;
  - how many numbers are spoken per 10 s.
- Judge the creative read only against the audience metrics above, with at least 5 Shorts per arm.
- Import Studio's "stayed to watch" weekly (`scripts/studio-import.js`). It is the most important missing number.
- Fit no predictive model until there are at least 30 Shorts per channel with 7-day data.

## 7. The next 10 Shorts per channel: controlled experiments

These use the existing framework (`core/growth/experiments.js`):
- one variable per experiment;
- deterministic arms, assigned before production;
- 5 Shorts per arm;
- no duplicate uploads, and nothing that manipulates engagement.

An experiment starts only when the owner creates it (the commands are in the report). None is active.

| Channel | Variable | Control | Variant | Hypothesis | Primary metric |
|---|---|---|---|---|---|
| IB | `opening_visual` | current | `craft-v2-opening` | a vivid subject picture with large hook text keeps more viewers past the first seconds | engaged ÷ views at 72 h (stayed-to-watch if imported); then % viewed |
| CT | `opening_visual` | current | `craft-v2-opening` | same as IB; CT needs topics first (the 70 exception) | same |
| FR | `opening_visual` (full-frame vertical crop vs letterbox) | letterbox | full-frame | the clip filling the screen keeps more viewers | same; **blocked** until the FR legacy renderer can crop full-frame (not implemented) |
| all (second round) | `hook_style` | production line | the blind-review winner among the Haiku alternatives | a question or surprising-fact opening beats the current one | same |

For each video, record:
- the hypothesis, arm and value;
- publication date and time, and the video ID;
- views at 72 h and 7 d;
- engaged ÷ views, % viewed, watch ratio at 3 s, subscribers;
- the sample size per arm, the outcome, the confidence and the next decision.

`experiments.js` already stores the arm per video; `attachVideo` and `evaluate` report the result. The decision rule:
- a variant counts as better only with at least 5 per arm and a difference larger than the spread within each arm;
- otherwise the result is "insufficient data", and nothing is promised either way.

## 8. ProfitDecoded

- **Gift Cards V3:**
  - published by hand on 2026-10-10;
  - 1 public view when inspected, 19 hours after publishing;
  - the repository has no PD analytics collection;
  - **insufficient data**: poor early reach is not evidence of poor quality.
- **Documentary #2:** prepared in PR #226. The Gift Cards V3 quality standard is kept. Nothing is published, and narration waits for approval.

## 9. Remaining blockers

1. **Thin licensed image pool for IB and CT.** It is the root of problem 2.
   - Next step: event-specific Commons categories and public-domain agency imagery (NTSB, NASA, USGS, NOAA, national archives), plus animated explainers for mechanism lines.
2. **FR legacy renderer** letterboxes every clip, and craft v2 does not reach it.
3. **Studio-only metrics** (stayed to watch, impressions) need a manual export.
4. **CT has no qualifying topics** until the 70 exception is approved.
5. **The Haiku creative benchmark** needs the paid-run approvals (`docs/llm/CREATIVE-EXPERIMENTS.md`, PR #223).
6. **No presenter or face**, the strongest common factor among top Shorts. This is a strategic decision for the owner.
7. **No PD analytics pipeline.**

## Appendix: per-video data (latest checkpoint)

### Failure Reconstructed (18 Shorts with data; latest checkpoint per video)

| Published | Title | Checkpoint | Views | Avg view (s) | Avg % viewed | Engaged / views | Watch ratio at 3 s | Watch ratio at end | Subs gained | Shorts-feed share | Readiness | Hook score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-09 | Mount St. Helens: What Failed First | 1d | 446 | — | — | — | — | — | — | 0% | 91 | 82 |
| 2026-10-08 | What Engineers Changed After Beirut | 1d | 343 | — | — | — | — | — | — | 0% | 90 | 81 |
| 2026-10-07 | Why USS Thresher Was Lost | 3d | 1179 | 18 | 74.3 | 0.34 | 1.25 | 0.43 | 1 | 98% | 91 | 80 |
| 2026-10-06 | Inside Saudia 163: The Failure Chain | 3d | 419 | 15 | 62.0 | 0.08 | 1.16 | 0.32 | 0 | 73% | 92 | 80 |
| 2026-10-05 | San Bruno: What Failed First | 3d | 348 | 15 | 63.1 | 0.33 | 1.18 | 0.32 | 1 | 96% | 90 | 79 |
| 2026-10-04 | How Chernobyl Really Failed | removed by uploader, no data | | | | | | | | | 95 | 84 |
| 2026-10-04 | They Saw the Cracks. The Building Stayed Open. / | 3d | 103 | 11 | 44.2 | 0.17 | 0.94 | 0.18 | 0 | 73% | — | — |
| 2026-10-03 | Why Rana Plaza Collapsed With Garment Workers In | removed by uploader, no data | | | | | | | | | 92 | 82 |
| 2026-10-02 | Inside Van Norman Dam: The Failure Chain | 7d | 1057 | 14 | 64.5 | 0.45 | 1.16 | 0.30 | 0 | 95% | 90 | 82 |
| 2026-10-01 | Eastern 212: What Failed First | 7d | 1287 | 24 | 119.0 | 0.47 | 1.65 | 0.86 | 2 | 91% | 91 | 79 |
| 2026-09-30 | General Slocum: The Inspection That Killed | 7d | 963 | 22 | 91.9 | 0.40 | 1.46 | 0.47 | 1 | 97% | — | — |
| 2026-09-29 | 28 Volts vs 65: Apollo 13's Hidden Flaw | 7d | 1279 | 16 | 53.8 | 0.53 | 1.13 | 0.20 | 2 | 89% | — | — |
| 2026-09-28 | Vesuvius 1944: An Eruption in the Middle of a Wa | 7d | 1318 | 20 | 71.7 | 0.42 | 1.21 | 0.42 | 7 | 80% | — | — |
| 2026-09-27 | Deepwater Horizon: The Test Result Nobody Believ | 7d | 470 | 19 | 70.4 | 0.34 | 1.14 | 0.45 | 1 | 20% | — | — |
| 2026-09-26 | Why Challenger Broke Apart 73 Seconds After Laun | 7d | 1731 | 25 | 92.5 | 0.39 | 1.38 | 0.67 | 4 | 80% | — | — |
| 2026-09-25 | How a Single Step Triggers an Avalanche | 7d | 976 | 18 | 62.9 | 0.28 | 1.26 | 0.34 | 2 | 96% | — | — |
| 2026-09-24 | The Nuclear Test That Poisoned a Paradise Foreve | 7d | 1369 | 41 | 109.4 | 0.47 | 1.66 | 0.88 | 2 | 88% | — | — |
| 2026-09-23 | Why San Francisco Burned for Three Days | 7d | 113 | 22 | 63.8 | — | 1.15 | 0.36 | 2 | 91% | — | — |
| 2026-09-22 | The Disaster That Ended the Age of the Airship | 7d | 1033 | 28 | 75.2 | — | 1.22 | 0.46 | 2 | 88% | — | — |
| 2026-09-22 | Why the Tacoma Narrows Bridge Tore Itself Apart | 7d | 186 | 21 | 65.3 | — | 1.06 | 0.28 | 0 | 51% | — | — |

Lifetime traffic by source (warehouse, all Shorts): SHORTS 12110, YT_SEARCH 1867, YT_OTHER_PAGE 142, YT_CHANNEL 86, SUBSCRIBER 14, EXT_URL 7, NOTIFICATION 4, SOUND_PAGE 2, NO_LINK_OTHER 1.

### ImpossibleBrief (8 Shorts with data; latest checkpoint per video)

| Published | Title | Checkpoint | Views | Avg view (s) | Avg % viewed | Engaged / views | Watch ratio at 3 s | Watch ratio at end | Subs gained | Shorts-feed share | Readiness | Hook score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-09 | A Person Lived Past 120: What Happens Next? | 1d | 371 | — | — | — | — | — | — | 0% | 88 | 79 |
| 2026-10-08 | What If Every Fungus on Earth Vanished? | 1d | 1140 | — | — | — | — | — | — | 0% | 88 | 78 |
| 2026-10-07 | The Real Physics Behind Ice Sank Instead of Floa | 3d | 1207 | 24 | 77.5 | 0.34 | 1.40 | 0.54 | 2 | 98% | 89 | 84 |
| 2026-10-06 | You Spent a Summer in Death Valley — What Breaks | 3d | 1155 | 23 | 65.8 | 0.27 | 1.19 | 0.33 | 0 | 97% | 91 | 81 |
| 2026-10-05 | What If a Mountain Fell Into a Bay? | 3d | 438 | 17 | 50.7 | 0.28 | 1.16 | 0.24 | 0 | 96% | 90 | 80 |
| 2026-10-04 | Would Saturn Really Float in Water? | 3d | 1047 | 22 | 69.5 | 0.44 | 1.31 | 0.45 | 4 | 96% | 91 | 84 |
| 2026-10-03 | What If the Dinosaur Asteroid Hit Earth Today | removed by uploader, no data | | | | | | | | | — | — |
| 2026-10-03 | Why the Sky, Not the Crater, Killed the Dinosaur | 7d | 311 | 15 | 60.2 | 0.32 | 1.15 | 0.28 | 0 | 83% | 89 | 81 |
| 2026-10-02 | The Hidden Ocean on Jupiter's Moon | 7d | 610 | 20 | 57.6 | 0.43 | 1.14 | 0.33 | 0 | 89% | 89 | 76 |
| 2026-09-30 | What Breaks First If Sunlight Could Push a Space | removed by uploader, no data | | | | | | | | | 91 | 81 |

Lifetime traffic by source (warehouse, all Shorts): SHORTS 5134, YT_SEARCH 200, YT_OTHER_PAGE 68, YT_CHANNEL 26, EXT_URL 7, NO_LINK_OTHER 2, SUBSCRIBER 1.

### CriticalThread (5 Shorts with data; latest checkpoint per video)

| Published | Title | Checkpoint | Views | Avg view (s) | Avg % viewed | Engaged / views | Watch ratio at 3 s | Watch ratio at end | Subs gained | Shorts-feed share | Readiness | Hook score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-06 | Why a Cut Cable Needs a Ship to Fix It | 3d | 330 | 14 | 50.0 | 0.11 | 1.08 | 0.24 | 0 | 96% | 89 | 79 |
| 2026-10-05 | How One Line Blacked Out San Diego | 3d | 62 | 15 | 48.1 | 0.26 | 0.94 | 0.13 | 0 | 93% | 90 | 83 |
| 2026-10-04 | The Stuck Valve Behind Three Mile Island | 3d | 51 | 26 | 79.2 | 0.33 | 1.35 | 0.65 | 0 | 80% | 89 | 85 |
| 2026-10-03 | What Happens to Data Centres When the Grid Fails | removed by uploader, no data | | | | | | | | | — | — |
| 2026-10-03 | Why Servers Survive a Blackout | 7d | 43 | 19 | 65.9 | 0.35 | 1.20 | 0.33 | 0 | 7% | 88 | 77 |
| 2026-10-02 | The Tunnel Fire That Closed the Alps for 3 Years | 7d | 1049 | 37 | 107.0 | 0.50 | 1.62 | 0.77 | 0 | 95% | 90 | 81 |
| 2026-09-30 | Inside High-lift Water Pump: The Hidden Dependen | removed by uploader, no data | | | | | | | | | 91 | 82 |

Lifetime traffic by source (warehouse, all Shorts): SHORTS 1411, YT_SEARCH 109, YT_OTHER_PAGE 18, YT_CHANNEL 4, NO_LINK_OTHER 0.
