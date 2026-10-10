# First film: publication readiness and metadata (NOT published)

"Billions Sit on Unused Gift Cards. Who Keeps the Money?" runs 8:58 and is unpublished. Nothing has been uploaded. Publication waits for the owner's approval after watching it.

## 1. Delivered files (verified 2026-10-10)

Folder (local, on the production Mac): `youtube-otomasyon/.claude/pd-prototype-review/final/`

| File | Size | Check |
| --- | --- | --- |
| `profitdecoded-gift-cards-documentary.mp4` (master) | 144,660,046 B | 1920×1080, 30 fps, H.264, BT.709, AAC 48 kHz stereo, 537.77 s, 0 decode errors; sha256 `a2877524…1509a29` |
| `preview-720p-phone.mp4` | 27,658,969 B | 1280×720, 537.77 s, 0 decode errors (preview only) |
| `final-script.md` | 9,634 B | 54 beats with timecodes and claim ids; source list |
| `profitdecoded-gift-cards-documentary.en.srt` | 11,401 B | 136 cues; identical to the narrated script |
| `narration-carl-cartesia.m4a` | 11,803,901 B | 537.76 s, AAC 48 kHz stereo (voice only) |
| `thumb-a-drawer-question.png`, `thumb-b-27-billion-unspent.png`, `thumb-c-three-claimants.png` | 75–194 KB | 1280×720 PNG |
| `QUALITY-REPORT.md` (= `docs/profitdecoded/FIRST-FILM-QA.md`) | 7.8 KB | |

In the repository (branch `feat/profitdecoded-first-film`, PR #214):
- `channels/profitdecoded/films/hbm-073-gift-cards/`: `script.md`, `story/`, `scenes.js`, `licenses.json`, and `evidence/` (QA JSON, captions, shot list, narration record, frame sheet).
- The MP4 and the audio files are not committed.

## 2. Publication readiness

Policy sources (official YouTube Help, read 2026-10-10):
- [Disclosing use of altered or synthetic content](https://support.google.com/youtube/answer/14328491)
- [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392)
- [Video chapters](https://support.google.com/youtube/answer/9884579)

### Originality and reused content
- **Reused content:** nothing is taken from another video or creator.
  - Every visual is drawn in code for this film: 46 original shots.
  - The narration is an original script built on primary sources.
  - The policy's examples of what is not allowed ("content downloaded or copied from another online source without any substantive modifications"; "content that exclusively features readings of other materials you did not originally create") do not describe this film.
  - The three on-screen filing quotations are short, attributed and discussed.
- **Inauthentic content:** the policy names "image slideshows … with minimal or no narrative, commentary, or educational value" and "AI-generated content made with generic or unoriginal templates". This film has a researched argument, sourced data graphics and scene-specific motion.
  - **Remaining risk (channel level):** the policy applies to the channel as a whole. If later films reuse the same layouts with thin variation, the channel could look templated. Keep each film's visuals scene-specific.
- **AI personas on sensitive topics:** the rule targets content that "presents itself as a human expert providing advice to viewers" on topics such as finances.
  - The narrator is unnamed and presents no expertise. The film explains company accounting and federal rules and gives no financial advice. The closing "Go check it." refers to the viewer's own card.
  - **Do not** give the narrator a persona, name or expert title in the description or the channel branding.

### Monetization suitability
- **Content:** business and accounting explainer; no violence, profanity or shock content.
- **Copyright-claim risk is low but not zero.**
  - The music is original synthesis code with no samples, but automated matching can still produce false claims.
  - The Cartesia library voice is available to other Cartesia customers.
  - The short filing quotations are from public SEC filings.
  - Survey figures are facts, cited; no Bankrate text or graphics are reproduced.
- **YouTube Partner Program:** eligibility is a channel-level requirement that a single video does not establish. Check the channel's YPP status in YouTube Studio.

### AI disclosure
- **What YouTube requires:** disclosure for content that is "realistic" and "meaningfully altered or generated", and for making a real person appear to say something they did not.
  - Script help, captions and fully animated or unrealistic visuals do not require it.
  - The page does not mention text-to-speech narration. Our narrator is a library voice, not a clone of a real person.
  - The music is not generative AI. The page lists "AI generated music" under what to disclose; our score is procedural synthesis code.
- **Recommendation (conservative):**
  - In YouTube Studio → **AI use**, select **Yes**, because the voice is a realistic synthetic human voice.
  - Also state it in the description.
  - YouTube says disclosure "won't limit a video's audience or impact its eligibility to earn money."

### Commercial licensing evidence (`films/hbm-073-gift-cards/licenses.json`)
- **Graphics, thumbnails and music:** owned (generated by repository code).
- **Fonts:** Source Serif 4, Inter and Barlow Semi Condensed, all OFL-1.1 (licence files in the pinned npm packages).
- **Narration:** Cartesia Pro.
  - The pricing page lists a "Commercial use license".
  - Terms §5.3: Cartesia claims no ownership of outputs. It also does not warrant that you own them (§7.1).
  - The Pro subscription must have been active when the audio was generated (it was: 2026-10-09).
- **Facts:** public SEC filings, CFPB regulation (US federal, public domain), and the Bankrate/YouGov survey (facts cited, nothing reproduced).
- **Trademarks:** Starbucks, Darden and Olive Garden are named as subjects only. No logos appear in the video or the thumbnails.

### Financial claim accuracy
- **Narration:** every figure is in the verified research file, or is our arithmetic and says so (story gates: 0 numbers outside the research file).
- **On screen:**
  - Every rendered text string was collected every 0.5 s across the film and checked.
  - Every final figure matches the research file. The only other matches were intermediate count-up frames, the SEC's address on the typeset 10-K cover, the scale-ruler ticks ($1B/$10B/$100B), the illustrative calendar dates, and "AGE 6 → AGE 18" (the narration's example).
  - A suspected "$0.0M" and "0%" were checked frame by frame and are not visible.
- **Qualifiers kept:**
  - $27 billion is a survey estimate, method not published.
  - Breakage is a company estimate.
  - Starbucks' $1.75 billion includes loyalty Stars.
  - "Not every card works like Starbucks' or Darden's."

### Thumbnail and title consistency
- **Title:** "Billions" is supported by the $27 billion estimate, and "Who keeps the money?" is answered in the film: the holder, the company, the government.
- **A, "WHO KEEPS IT?":** consistent. **Recommended.**
- **B, "$27B UNSPENT":** the figure covers gift cards, **vouchers and store credit**. The "survey estimate" label is not readable at phone size, so B slightly overstates "gift cards". Use it only with that caveat visible.
- **C, "WHO GETS IT?":** consistent.

## 3. Metadata (draft for the owner)

### Titles (choose one)
1. Billions Sit on Unused Gift Cards. Who Keeps the Money?
2. Your Unused Gift Card Is Already in a Company's Forecast
3. Starbucks Cards Don't Expire. So How Does Unspent Money Become Revenue?

### Description
```
About $27 billion in gift cards, vouchers and store credit is sitting unused in the US, by Bankrate's survey estimate. If that money never gets spent, who keeps it?

We read Starbucks' and Darden's (the company behind Olive Garden) annual filings to find out. The answer is an accounting estimate called "breakage": companies forecast how much card value will never be redeemed, then book that share as revenue little by little as other cards are spent. Starbucks recognized $222.4 million of breakage in fiscal 2025 (our sum of its two reported lines). Darden spreads it over an expected redemption period of generally 12 years. And where unclaimed-property laws apply, part of the money may go to the government instead; neither filing says how much.

Chapters
0:00 $27 billion in unused gift cards
0:53 Starbucks cards don't expire. So why is there revenue?
1:21 How "breakage" is booked
2:20 What breakage is worth to Starbucks
3:54 Darden and the 12-year forecast
5:30 Predicted, not counted
6:03 The third player: unclaimed property
6:43 The federal floor, and our own mistakes
7:52 So, who keeps the money?

Sources
Starbucks Corporation, Form 10-K for the fiscal year ended September 28, 2025: https://www.sec.gov/Archives/edgar/data/829224/000082922425000114/sbux-20250928.htm
Darden Restaurants, Inc., Form 10-K for the fiscal year ended May 31, 2026: https://www.sec.gov/Archives/edgar/data/940944/000094094426000025/dri-20260531.htm
CFPB, 12 CFR 1005.20 (Regulation E), requirements for gift cards: https://www.consumerfinance.gov/rules-policy/regulations/1005/20/
CFPB, "Giving or receiving gift cards? Know the terms and avoid surprises": https://www.consumerfinance.gov/about-us/blog/giving-or-receiving-gift-cards-know-the-terms-and-avoid-surprises/
Bankrate gift card survey (press release): https://bankrate.com/f/102997/x/c53caa68d4/gift-card-survey-press-release.pdf
Bankrate gift card survey (article and methodology): https://www.bankrate.com/credit-cards/news/gift-cards-survey/

Notes
The $27 billion figure is Bankrate's estimate from an online YouGov survey of 2,373 US adults (Aug 19-21, 2024); Bankrate has not published how the total was calculated. Breakage figures are company estimates. Totals marked "our arithmetic" are our own calculations from the filings.
This video explains how companies account for gift cards. It is not financial or legal advice.
Narration uses an AI-generated voice (Cartesia). Visuals and music are original.
```

### Tags
gift cards, unused gift cards, gift card breakage, breakage revenue, Starbucks gift card, Starbucks card, Darden, Olive Garden gift card, deferred revenue, unclaimed property, Regulation E, gift card expiration, how companies make money, business documentary, accounting explained, consumer finance, annual report, 10-K explained

### Chapters
They come from the narration timeline in the delivered MP4.
- Every chapter is at least 10 s, and the first is 0:00, as YouTube requires.
- The 8.8 s end card is not a chapter.

### Thumbnail
**A, "WHO KEEPS IT?"** (`thumb-a-drawer-question.png`).

## 4. Repository housekeeping

| PR | Base | CI | Merge simulation |
| --- | --- | --- | --- |
| #213 production prototype | `main` | 9/9 pass | clean into `main` |
| #214 first film (contains #213) | #213's branch | 9/9 pass (the Cartesia job is dispatch-only) | `main` + #214: clean; ProfitDecoded tests 197/197, full suite 514/514; keeps #211's guarded workflow, `paidEnabled: false`, publishing disabled, Kokoro default |
| #212 strategy | `main` | 7/7 pass | clean on top of `main` + #214 (both touch `profitdecoded.js`; no conflict) |

**Safe merge order (owner):**
1. Merge #213 into `main` with a merge commit, and delete its branch. GitHub then retargets #214 to `main`; if it does not, change #214's base to `main`.
2. Let #214's CI re-run against `main`, then merge it.
3. Merge #212 at any time; it is independent.

### Paid-call safety of the experiment branch (verified)
- `feat/profitdecoded-experiment-guard` still says `paidEnabled: true` with approval `exp-2026-10-haiku55-gift-cards-1`. The ledger shows that approval **used and closed** (2026-10-09T20:49:20Z, $0.007 settled).
- A paid preflight using that branch's own policy returns **NO-GO** ("used and closed"). Every paid call reserves through the same check (`budget.js` `decide` → `approvalState`), so it would be refused too.
- The approval also expires on 2026-10-12 at 18:00 UTC.
- **Triggers:**
  - The produce workflow's `schedule` runs only from `main` (closed policy), and only when `PD_AUTO_SCHEDULE=true`.
  - Otherwise it runs only on a manual `workflow_dispatch`.
  - No ProfitDecoded workflow on any branch uses the Anthropic key on push or pull_request.
  - Cartesia is reachable only through the manual audition dispatch, which has a credit cap.
- **Backstops:** the Anthropic prepaid balance has auto-reload off, and new spending requires a new reviewed approval id.

### Cleanup procedure (each step needs the owner's go-ahead; nothing has been deleted)
1. After the merges above, delete:
   - `approve/profitdecoded-haiku55-experiment` (merged into the guard branch);
   - `feat/profitdecoded-experiment-guard` (#211 is merged; the only extra content is the closed approval);
   - `feat/profitdecoded-production-prototype` and `feat/profitdecoded-first-film`, once merged.
2. `bench/profitdecoded-model-selection` is a throwaway Gemini/Groq benchmark, free tier, triggered only by pushes to itself. Delete it if the paused Gemini benchmark is abandoned; keep it to resume.
3. **Keep** `profitdecoded-budget-ledger`. It is the persistent spending record.
4. Remove the local scratch worktrees (`git worktree prune` after deleting their folders).
5. Optional: revoke `PD_ANTHROPIC_API_KEY` in the Anthropic Console if no further paid runs are planned.

## 5. Waiting for

The owner's approval of the video after watching and listening, then the choice of title and thumbnail. **Do not upload until then.**
