# Documentary #2: production preparation (2026-10-11)

Film: **What American Express Bought From Delta for $8.2 Billion in One Year** (hbm-034). Nothing was narrated, rendered as video, uploaded or published. No paid API was called.

## 1. Originality warning: reviewed

**Observed** in the competitor snapshots (`intel/snapshot-2026-10-08.json`, plus the reference snapshot of 2026-10-11 on the growth branch):
- The generic angle "airlines are really banks / how airlines make money from credit cards" is crowded and old. Wendover's video has 7.35M views over 4 years, and WSJ's 1.35M.
- In the last 30 days, small channels re-published that generic angle with almost no response:
  - "How Airlines Actually Make Money (It's Not Selling Seats)": 554 views;
  - "Airline Miles Explained: Who Really Profits?": 97 views;
  - "Airlines Don't Sell Flights. They Print Money.": 30 views.
- Separately, an airline subject from a small channel broke out: Brimm.'s "Why Airlines Use This Exact Layout" runs at 63× its channel's median.

**Inference** (not proven): demand for airline-economics subjects exists, but a repeat of the generic thesis does not earn it.

**Differentiated angle used by this film**, all from 2025 and 2024 primary sources that the older videos cannot contain:
1. **The miles are a promise.** The film follows the accounting treatment, not just "banks buy miles": Delta defers the award-travel part and owes it until the flight. The recurring motif is the card that splits into envelopes; the award-travel envelope goes into a STILL OWED drawer, which reopens full in the ending.
2. **The size of the IOU.** American owes more in miles ($10.6B) than in tickets ($7.2B), which is our arithmetic. The three airlines together hold about $27.6B, labelled "our sum".
3. **Who sets the exchange rate:** the DOT inquiry of September 2024 and United's own warning that rule changes move its balances. The film presents it as an inquiry, not a verdict.

Recommendation:
- Keep the subject, and keep the generic thesis out of the title and thumbnail.
- The title now names the timeframe, "in One Year", because $8.2B is one year of payments, not a single purchase.
- The owner decides. The engine's originality score (20) was computed on the generic angle and has not been re-scored.

## 2. Headline and financial claims: verified

| Check | Result |
| --- | --- |
| $8.2B headline vs evidence | **PASS**: the Delta 10-K says "In 2025, remuneration from American Express totaled $8.2 billion". The script says "In 2025, American Express paid Delta Air Lines $8.2 billion" and never calls it profit (the dossier's scope note is respected). The title previously lacked the year; it is fixed. |
| Research gate (`core/profitdecoded/research.js`) | **PASS**, no warnings |
| Calculations i1–i6, recomputed independently | **PASS**: 12 of 12 match their stated results (436; 3,406; 7,777; 27,603 → 27.6; 1.825 → 1.8; roundings 10.6, 7.2, 3.4, 7.8) |
| Every number spoken in the 51 beats | **PASS**: each appears in the dossier's claims or inferences |
| On-screen numbers in the scene spec | **PASS**: validated against the dossier's numbers |

## 3. Scene specification (`scene-spec.json`)

- 50 scenes over all 51 beats, plus an end card.
- 4 recurring motifs: the miles card, the STILL OWED drawer, the COLLATERAL folder, and the member's phone. There are also 3 stacks.
- 21 multi-phase compositions; the other 29 scenes use the 11 standard types.
- Every quotation is verbatim from the dossier.

| Gate | Status |
| --- | --- |
| Spec validation (types, motifs, cues spoken in their beats, cues before the cut, text lengths, figures with sources, numbers in dossier) | **PASS** on the estimated timeline |
| Renders in Chromium (all 50 scenes) | **PASS**: 0 scene errors |
| Smallest essential text at a 640 px preview | **PASS**: 12 px (V3: 10 px) |
| Figure shots carry a source line | **PASS**. The 17 shots without one show no figure. |
| Intermediate count-up figures | **PASS**: none; values appear whole at their spoken cue |
| Visual diversity (estimated timings) | context share 46%, dark 37%, longest abstract run 71 s, 3.5 category switches/min. One medium flag: the s7 quotations run (458–529 s) has few everyday frames. Accepted, because quotations belong on paper. |
| Full-length video with measured narration | **NOT TESTED**: needs narration (Cartesia, approval required) |
| Motion and pacing in playback | **NOT TESTED**: only stills were rendered |
| Side-by-side with V3 | **REQUIRES HUMAN REVIEW**. Stills are in the same visual family; V3's bespoke diagrams are still richer. Not claimed equivalent. |

Timing note: cues were checked against an **estimated** timeline (words ÷ 2.19 words/s, film #1's measured pace). After narration, rerun the checks with `render-motion.js <dir> --analyze-only` against `out/timeline.json`. A cue that lands after its shot's cut is then a blocker.

## 4. What is needed before production

| Item | Owner action |
| --- | --- |
| Approve the subject and differentiated angle (section 1) | decision |
| Approve the title "…in One Year" (68 characters) | decision |
| Read the script aloud once (the s3–s4 accounting section) | human review |
| Approve Cartesia narration: about 7,000 characters, within the existing plan; the pronunciation list is in `PRODUCTION-READINESS.md` | approval, no spend without it |
| After narration: measured timeline → spec gates → full render → QA (qa-media, visual diversity, captions) | engineering, free and local |
| Final A/B/C quality review and publication decision | human; publishing stays manual |
