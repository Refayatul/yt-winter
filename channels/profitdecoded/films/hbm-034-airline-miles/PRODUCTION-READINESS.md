# Documentary #2: production readiness (2026-10-10)

**Film:** "What American Express Bought From Delta for $8.2 Billion" (topic `hbm-034`)

**Stage reached:** research, script and storyboard are complete. **No narration, scenes or MP4 exist.** Production stopped at the last stage that needs no approval: the next stage needs paid narration, and the topic and script need owner sign-off first.

## Deliverables

| # | Deliverable | File |
| --- | --- | --- |
| 1 | Topic selection report | `TOPIC-SELECTION.md` |
| 2 | Research dossier (16 claims, 6 inferences, 8 primary sources, 38 passages verified verbatim, every calculation checked) | `channels/profitdecoded/research/hbm-034-how-airlines-make-money-from-credit-cards.json` |
| 3 | Script (1,234 words) | `SCRIPT.md`; machine form `story/latest.json`; gate report `story/review.md` |
| 4 | Visual storyboard (41 shots) | `STORYBOARD.md`, `storyboard.json`, `storyboard-visual-diversity.md` |
| 5 | Titles (21) and thumbnail concepts (3) | `story/latest.json` (`titleCandidates`, `thumbnailCandidates`); summary below |
| 6 | Production readiness: the pipeline audit | `PIPELINE-AUDIT.md` |
| 7 | Cost estimate | below |
| 8 | Quality-control report | below |
| 9 | Remaining approvals | below |
| 10 | Weekly calendar | `docs/profitdecoded/WEEKLY-PRODUCTION.md` |

## Title and thumbnail

- **Recommended title:** *What American Express Bought From Delta for $8.2 Billion*. It is accurate: the film answers *what* was bought (miles, perks and the use of the brand), not Amex's motives. The working title was changed after the independent critique pointed this out.
- **Alternatives:**
  - "What Banks Really Buy When They Pay Airlines Billions"
  - "Your Airline Miles Are Someone Else's Currency"
  - "American Airlines Owes More in Miles Than in Tickets"
- **Thumbnail A (recommended):** an unbranded card mid-tap over a checkout terminal, with a miles counter rising. Text: **"$8.2B FOR WHAT?"**
- **Thumbnail B:** a stack of boarding passes beside a taller stack of miles statements. Text: **"OWED IN MILES"**.
- **Thumbnail C:** a banknote-style "mile" with an airplane watermark, half faded. Text: **"WHO SETS ITS VALUE?"**

No logos appear in any concept. Thumbnails are not rendered yet; they come with the scenes.

## Cost estimate

| Item | Projection | Paid? |
| --- | --- | --- |
| Narration (Cartesia, approved voice "Carl", model pinned as in film 1) | About 6,950 script characters, which is about 7,600 credits once numbers are spoken in full. Recommended run cap: `PD_CARTESIA_MAX_CHARS=9000`. Film 1 actually used 7,203. | Uses the existing Pro plan allowance ($5 a month for 100K credits, per film 1's records). The project has recorded about 9,300 credits this month (2,082 for auditions and 7,203 for film 1). **No extra charge is expected if the subscription is active.** |
| Research, script, critique, storyboard, scenes, render, QA, packaging | Local tools; Claude Code session | $0 |
| Anthropic API | not used | $0 (`paidEnabled: false` unchanged) |
| SEC EDGAR and YouTube read APIs | free | $0 |

**Not verified:** the live Cartesia credit balance. Reading it is an API call, which I did not make. Check it in the Cartesia dashboard before approving.

## Quality-control report

### A. Hard technical checks (all passed at this stage)

- Research gate: PASS, score 97, 0 rejections, 0 warnings. 8 tier-1 sources, 0 Wikipedia.
- Every evidence passage is verbatim in its source: 38 of 38, checked by the build script against the downloaded text. All 6 inferences have calculations that recompute.
- `story-review`: 0 plan issues and 0 blocking findings. The checks covered numbers only from the dossier, our arithmetic voiced as ours, one home per figure, entities named before their facts, and the editorial rules x1–x5 (for example, no "appraisal", no "profit" for card cash, no claimed outcome for the DOT inquiry).
- Narration text gate: 0 problems and 0 warnings. Numbers convert cleanly to spoken form.
- **Not yet possible** (no audio or video exists): A/V sync, subtitle sync, render integrity, measured loudness, rendered phone-text sizes.

### B. Editorial warnings (advisory)

- **Topic eligibility:** DEFER. The engine estimates angle originality at 20 and infers HOT saturation; the main competitors are Wendover at 7.35M views and WSJ at 1.35M. The only differentiation I can verify is newer evidence. The owner has to decide.
- **Hook score:** the engine rated an alternative hook ("In 2020, United borrowed against its frequent flyer program…") 74, against 72 for the chosen one. The chosen hook keeps the filed number and the title in the first sentence.
- **Payoff section:** a heuristic note says "thin-section: tighten" (AI-pattern 20 in that section). The independent reviewer judged the rewritten ending acceptable.
- **Storyboard diagnostics:** 5 low-severity long shots (22–24 s, estimated), each with planned internal reveals tied to separate beats. Everyday settings cover 56% of the film and the dark stage 12%. There are no dark runs, chart runs, repeated layouts or low-variety windows.
- **Independent critique:** verdict "revise", with 4 blocking and 18 should-fix items. All were applied or answered; see `story/critique.json`. The reviewer's main remaining concern was the s4 number density, which was reduced from seven figures to five.

### C. Needs a human

- Read the script aloud once and judge whether the accounting section (s3–s4) holds attention.
- Pronunciation: "AAdvantage" (does the voice say "advantage" or spell the A's?), "Buttigieg" (a lexicon entry is proposed: BOOT-edge-edge), "MileagePlus", "SkyMiles", Chopra, and every dollar amount.
- Whether the American Airlines "net income vs partner cash" pair (s8) reads as fair to you. It is caveated as different kinds of money, and the reviewer approved the reworded version.
- A visual check of the style frames, once scenes exist.

No retention prediction or quality score is offered beyond the heuristics labelled above.

## Exact remaining approvals

1. **Topic:** approve producing `hbm-034` as documentary #2, despite the engine's DEFER on differentiation.
2. **Script:** approve `SCRIPT.md`, or send changes.
3. **Narration credits:** approve one Cartesia narration run for this script with `PD_CARTESIA_MAX_CHARS=9000` (about 7,600 credits expected), with the approved voice "Carl".
4. **Lexicon:** confirm the pronunciation of "AAdvantage" and "Buttigieg".
5. After the render: a full watch and listen, packaging, and the publication decision (approval 2 of the first 5).

## Next steps once approved

- **Day 3–4:** write `films/hbm-034-airline-miles/scenes.js` from the storyboard, adding the two proposed environments to `brand-lib.js`. Run `render-motion.js --analyze-only` and `--stills`, and review phone-size frames before narration. Then narrate (cached), mix and fully render.
- **Day 5:** `qa-media.js`, diagnostics with `--qa`, contact sheet, 720p preview.
- **Day 6–7:** a full human review, targeted fixes with `revise-master.js` if needed, then the package and a manual upload after approval.

Nothing has been uploaded, scheduled, published or paid for.
