# ProfitDecoded model benchmark: Claude Opus vs the free Groq + Gemini pipeline

Date: 2026-10-09.
Topic: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (`hbm-073`, long form).
Evidence: the existing verified dossier only (`channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json`).
No production code was changed. No Groq tokens and no paid API were used.

## Verdict in one paragraph

On this topic, the Claude Opus script is clearly better than the free pipeline's final script.
- Three blind Gemini evaluations, including one with the order swapped, all preferred it with high confidence. The weighted score averaged **9.08 vs 2.83 out of 10**.
- The deterministic readings agree: 20 number mentions vs 67, and the main figures stated once instead of three to five times.
- The manual source checks agree: no high-severity errors vs four wrong statements and two production defects.

Most of the gap, however, comes from **process, not only the model**.
- The free pipeline's plan promised an answer the evidence cannot give.
- The free tier's 8,000 tokens-per-minute limit forces section-by-section drafting, which produces repetition.
- The Claude script was written in one pass, with the whole story in view, by an author who had already read the Groq script and its critiques.

The benchmark therefore supports "Claude writes better scripts" with **moderate** confidence. It cannot say how much of the gap would survive an automated Claude API run. **Recommendation: C, the hybrid.** Details and costs are in §6.

## 1. Task 1: why the free-pipeline script failed

Sources:
- `docs/profitdecoded/PHASE-3.5-FREE-MODEL-VALIDATION.md`;
- the dossier;
- the final Groq script (`story-tests/hbm-073-gift-cards-long-free-models/latest.json`, `script.md`);
- Gemini's critique and evaluations (`critique.json`, `evaluation-1.json`, `evaluation-2.json`).

Root causes, from upstream to downstream:

| # | Root cause | Evidence |
| --- | --- | --- |
| 1 | **The plan promised an answer the dossier cannot give.** Nothing checks the plan's payoff and angle for truth. | Plan payoff: "Retailers capture most of the unspent gift-card value… only a small slice stays with the consumer." Angle: "reveal the exact split". No claim supports a split. The ending had nothing true to deliver, so it recited figures. Gemini, in its critique: "Rewrite Section 9 to resolve the film's central question… instead of reciting numbers." |
| 2 | **Claims were assigned to several sections.** | Plan: c1/i1 in s2, s3, s7 and s9; c8 in s1, s7 and s9; c7 in s6, s7 and s8; c10 in s4, s6 and s8. In the script, the Starbucks breakage figures appear in 5 beats, the survey in 3 and Darden's card flow in 3. 67 number mentions, 15 figures repeated. |
| 3 | **Section-by-section drafting, forced by the free tier.** At 8K tokens per minute, the full plan plus dossier plus a 1,200-word draft does not fit in one request, so each section was written seeing only its own claims. | No section knows what was already said. Section 4 explains Darden's accounting without naming Darden. Both Gemini and the manual check flagged this. |
| 4 | **The writing model's defaults.** GPT-OSS writes in filing register, stacks numbers and fills gaps with invented detail. | "Breakage is recognized over time in proportion to actual card redemptions, not by reducing an estimate as cards are spent." "The estimates are updated each quarter" (invented). "Analysts treat the figure as an estimate" (invented). "Federal unclaimed-property laws" (wrong law; fixed in a later round). |
| 5 | **The rewrite loop optimised the metrics, not the story.** | The deterministic readings went from 79 to 99 (retention) and from 29 to 91 (spoken), while Gemini still scored structure 3/10. The spoken fix split number-heavy sentences into short fact lists. It did not cut the repeats. |
| 6 | **The factual gate checks that numbers exist, not who said them or what they cover.** | "Starbucks recorded $222.4 million" passes because 222.4 is in the dossier, but that figure is our own sum (i1). "Households" passes although the survey covers adults. |
| 7 | **No gate catches script hygiene problems.** | "…roughly flat, as shown in i3." reads an internal claim id aloud. |

The dossier also has its own error, which every evaluator missed, including the authors of both scripts:
- Inference i2 says Darden "took in $760.2 million … released $751.9 million …, so the unspent pool still grew by $7.9 million".
- But 760.2 − 751.9 = 8.3. The balance did grow by 7.9 ($628.8M → $636.7M), but only because the filing also lists a $0.4M sale of Olive Garden Canada card balances.
- Both scripts repeat i2's "so".
- Correcting i2 is a data fix, not done here.

## 2. Task 2: the Claude script

Files are in `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/`:
- `script.md`: narration, claim per line, visual per line, alternative hooks;
- `story.json`: plan, 51 beats, 51 visuals, hook candidates (the benchmark version, at commit 5950a10; later superseded by `plan.json` + `latest.json` in the foundation pass).

How it was written:
- **Author:** Claude Opus 5.5, in this Claude Code session. No Anthropic API call was made.
- **Facts:** only from the dossier's claims, verbatim passages and editorial rules x1–x4. The quoted filing phrases are verbatim passages.
- **Length:** 1,068 words, about 8.2 minutes at the engine's 130 words per minute (about 7.1 minutes at 150).
- **Structure:** nine sections:
  1. the card in the drawer;
  2. a card with no end date;
  3. forecasting what won't be spent;
  4. how big the slice is;
  5. twelve years;
  6. half a point;
  7. the third player;
  8. what the law protects, and what it can't;
  9. who keeps the money.
- **Ending:** the payoff answers the title with three claimants. On paper, the holder. In practice, the company's forecast, booked gradually. Where unclaimed-property laws apply, government, in an amount the filings don't disclose and the script says it won't guess. It closes on what only the holder controls.

**Independence: a limitation the user should weigh.** The instruction was not to read the Groq script before drafting. That could not be met.
- I had already read the Groq script line by line in the previous task, while writing its source verification.
- I also knew Gemini's critique of it.
- The draft does not copy it: the structure, wording and opening are different. But it was written knowing which mistakes to avoid. On a new topic, the free pipeline would have no such advantage.
- Separately, an earlier Claude-session script for this topic exists (Phase 3, `story-tests/hbm-073-gift-cards-long/`). I did not open it before finishing this draft. A later grep of the Phase 3 report surfaced fragments of it. One fragment says "what households say they hold": the same scope error Groq made.

**Revision.**
- Draft v1 (1,025 words) failed 6 deterministic gate findings.
- I made one revision pass, matching the rewrite rounds the Groq script got. It:
  - added the $1.75B pool with its loyalty caveat;
  - removed a threshold number ("above $200 million") that is not in the dossier;
  - replaced an absolute ("nobody") in an alternative hook;
  - rephrased two lines.
- Three heuristic findings remain. I left them in place rather than writing to the detector (§4.2).

## 3. Task 3: the comparison method

| Element | How |
| --- | --- |
| Judge | Google Gemini, free tier, through a one-off GitHub Actions workflow on the throwaway branch `bench/profitdecoded-model-benchmark` (not for merge, no PR). Every response reported `gemini-3.8-flash`, including the run that requested `gemini-3.7-flash`, so all three verdicts come from one judge model. Key-prefix search in all logs: 0 matches. |
| Blinding | Both scripts were rendered identically: numbered parts with no section titles; plain ASCII punctuation (GPT-OSS's typographic characters normalised); claim ids removed; one `[VISUAL: type - overlay]` line per beat. They were labelled only "Script A" and "Script B". A leak check rejected any model name. The A/B key stayed out of the judged payloads (`benchmark/blinding-key.json`). The judge saw the dossier, its "our arithmetic" items and the editorial rules. |
| Order bias | Run 1: A = Groq. Run 2: a repeat of run 1, which also tests consistency. Run 3: swapped, A = Claude. |
| Criteria | Hook 20%, storytelling 25%, spoken naturalness 15%, pacing 15%, factual accuracy 15%, visual storytelling 10%. Same instructions for both scripts. "Do not reward length; do not assume either script is better because of its position." |
| Deterministic check | The existing engine checks (`check`, `assess`: retention critic, spoken naturalness, AI-pattern, hook engineering), run locally on both with the same title. Packaging checks were excluded for both, since neither file has titles or thumbnails. |
| Manual source check | The same claim-by-claim method as the Phase 3.5 report, applied to both scripts. |

**Limitations:**
- one topic;
- one judge model, a Flash-tier model whose scores show halo effects (uniform 9s);
- the Claude author had prior exposure to the Groq script;
- the Claude script came from an interactive session, not from the automated pipeline;
- Gemini cannot be fully blind to style;
- the author of one script did the manual check of both. That check is the same method as Phase 3.5, but it is not independent.

## 4. Results

### 4.1 Blind Gemini scores (1–10)

| Run (order) | Script | Hook | Story | Natural | Pacing | Accuracy | Visual | **Weighted** | Would publish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 (Groq=A, Claude=B) | Groq | 3 | 2 | 3 | 2 | 4 | 5 | **2.95** | Claude, high |
| | Claude | 9 | 9 | 9 | 9 | 9 | 9 | **9.00** | |
| R2 (repeat of R1) | Groq | 3 | 2 | 3 | 2 | 3 | 4 | **2.70** | Claude, high |
| | Claude | 9 | 10 | 9 | 9 | 10 | 9 | **9.40** | |
| R3 (swapped: Claude=A) | Groq | 3 | 2 | 3 | 2 | 4 | 4 | **2.85** | Claude, high |
| | Claude | 9 | 9 | 9 | 9 | 8 | 9 | **8.85** | |
| **Mean** | Groq | 3.0 | 2.0 | 3.0 | 2.0 | 3.7 | 4.3 | **2.83** | |
| | Claude | 9.0 | 9.3 | 9.0 | 9.0 | 9.0 | 9.0 | **9.08** | |

Swapping the order changed the weighted scores by at most 0.55, so position bias was not a material factor.

The judge's criticisms of the Claude script were real, and mild:
- It omits the survey method (YouGov, online, 2,373 adults, August 2024), which editorial rule x2 requires.
- It omits the $244 average and $100 median.

Its criticisms of the Groq script were:
- figures repeated "three to four times";
- "as shown in i3" spoken aloud;
- "households";
- "updated each quarter";
- the $222.4M sum attributed to Starbucks;
- Darden not named in Part 4;
- a "robotic cadence that reads like an unedited bulleted dossier".

### 4.2 Deterministic readings (existing engine; heuristic, ESTIMATED)

| Reading | Groq final | Claude final | Claude v1 |
| --- | --- | --- | --- |
| Words (min at 130 wpm) | 1,143 (8.8) | 1,068 (8.2) | 1,025 (7.9) |
| Number mentions / distinct / repeated figures | 67 / 36 / 15 | **20 / 18 / 2** (the "12 years" callback; "$15.2 billion" in and out) | same |
| Spoken naturalness | 91 | **100** | 100 |
| AI-pattern score (lower is better) | 7 | **0** | 5 |
| Retention reading | **99** | 70 | 59 |
| First 30 s reading | **85** | 78 | 71 |
| Blocking findings | **0** | 3 | 6 |
| Best hook total (engine) | **81** | 78 | 78 |

On these readings the Groq script wins retention and blocking count. Each of the Claude script's three remaining findings has a specific explanation:

- **"So what is this worth to Starbucks?" flagged as unanswered.** The answer is the next sentence: "it recognized breakage worth $200.4 million". The detector needs two of the question's content words repeated, and the answer says "it", not "Starbucks".
- **"So, who keeps the money?" flagged as unanswered.** The answer is "you keep the money". The detector's exact-word match does not count "keep" as "keeps".
- **First-30 reading of 78, pass mark 80.** The only note it gives is a positive one ("opens an unresolved tension").

The Groq script reached 99 and 0 by being rewritten against these detectors. That is root cause 5: these readings measure form, and they can be gamed. They did not see the repetition or the misattribution that every human and model reader saw.

### 4.3 Manual source check (same method for both)

| | Groq final (33 statements) | Claude final (51 beats) |
| --- | --- | --- |
| Wrong | 4: "updated each quarter"; "Starbucks recorded $222.4 million"; the "pocket-share" claims of s8-3; "$751.9 million in redemptions" | **0** |
| High severity | 2 (Gemini) | **0** |
| Overstated / imprecise | 9 | 5, all low or medium (below) |
| Production defects | 2: the claim id "i3" spoken aloud; the Darden section never names Darden | **0** |
| Inherited dossier error (i2 "so" arithmetic) | yes (s9-2) | yes (s5-4 to s5-6) |

Claude-script issues found in my own check:
- **Survey method omitted** (rule x2). Medium; Gemini caught it too.
- **i2's "so" arithmetic** in s5-6. Medium; it comes from the dossier.
- **"One in five had let a card expire."** It follows "34 percent of adults…", so it can be heard as one in five *of those* 34%. Survey: 20% of all adults. Low to medium.
- **"Breakage is a thin slice of a very wide river."** A qualitative comparison of c1 against c3 that the dossier does not state. Low.
- **"Every year, Starbucks turns part of that waiting money into revenue."** Supported for three fiscal years, not in general. Low.

### 4.4 Concrete differences

| Dimension | Groq (free pipeline) | Claude |
| --- | --- | --- |
| First 10 seconds | "You've been told gift cards expire, but Starbucks' cards never do. Every unused dollar stays on the retailer's ledger." The second line is overstated, and the story starts at a company, not the viewer. | "Somewhere in a drawer, a wallet or a coat pocket, there's a gift card with money still on it. Maybe it's yours." The survey's 43% and the title's question both land within about 30 seconds. |
| Explaining breakage | "Breakage is recognized over time in proportion to actual card redemptions, not by reducing an estimate as cards are spent." | "Picture someone tapping a card for a latte. As that balance gets spent, a matching sliver of the money the company doesn't expect anyone to spend moves over into revenue." |
| Repetition | Starbucks breakage figures in 5 beats (s2-2, s3-2, s3-3, s7-1, s9-1); survey in 3; Darden flow in 3; the federal rule in 3. | Each appears once (s4-1/s4-3; s1-3; s5-4). The federal rule is stated once (s8-2) and recalled once to reconcile the survey (s8-6). Later sections refer back without restating: "Now, back to that phrase about government agencies." |
| Attribution | s7-1: "Starbucks recorded $222.4 million of breakage revenue." | s4-3: "Together, by our own math, that's $222.4 million in one year." |
| Unknowns | The plan claimed an "exact split". An earlier round had "Only a small remainder stays with the cardholder." | s7-4: "What neither filing tells us is how much unspent money actually ends up with the government. So we won't guess." |
| Turn | None: the "When estimates miss the mark" section restates the 12-year rule. | s6: "Breakage isn't counted. It's predicted." That leads to the $3.6M price of being wrong half a point, then the third claimant. |
| Ending | s9 recites the $222.4M, $7.9M and $27B again. | "The company can estimate. The government may take a slice. But only the person holding the card decides whether that balance becomes a meal and a coffee, or a line in someone else's annual report. So, about that drawer. Go check it." |
| Visuals | 30 beats, 7 graphic types; overlays mostly restate the line ("No expiration, breakage recorded over time"). | 51 beats, 10 types, including verbatim filing excerpts ("remittance to government agencies under unclaimed property laws, if applicable"), a birthday-to-graduation timeline and a three-claimant comparison panel. |

### 4.5 What this benchmark does not show

1. **How an automated Claude API run would score.** The Claude script came from an interactive session in one pass (plus one gate revision), with the whole dossier and story in context. The engine's Anthropic mode does the same (single-call draft, prompt caching, no per-minute limit), but no Anthropic API run has happened: the key is absent.
2. **How much is the model, and how much is hindsight.** The author knew the Groq script's failures. Root causes 1, 2, 3, 6 and 7 are process issues that would affect any model.
3. **Generalisation.** One topic, one judge model.

## 5. Usage and cost of this benchmark

**Actual usage:**

| What | Usage | Charge |
| --- | --- | --- |
| Groq | 0 tokens (constraint respected) | $0 |
| Gemini `gemini-3.8-flash` (free tier) | 3 successful calls: 24,960 input / 2,896 output / 4,534 thinking tokens. Two failed attempts (daily quota on 3.8; a retired fallback model, `gemini-2.5-flash`) recorded no usage. | $0 |
| Anthropic API | not called | $0 |
| Claude Code (this session) | Runs on the account's **Claude Pro subscription**. "Extra usage" is disabled, so there is no per-token charge. It consumes plan allowance: at writing, the 5-hour window is 11% used and the weekly all-models window 64% used. That covers all of this week's work, not this task alone; Claude Code does not report per-task tokens. The session context is 264K tokens. | $0 incremental (subscription) |

Claude Code is not a production path. It needs a person in an interactive session and cannot run unattended in GitHub Actions on a schedule.

## 6. Task 4: recommendation

| Option | For | Against |
| --- | --- | --- |
| **A. Groq + Gemini, after fixing planning** | $0. The plan fixes (payoff and angle must cite claims, one home section per claim, attribution gate, hygiene gate) would remove root causes 1, 2, 6 and 7. | Root cause 3 is structural on the free tier: 8K tokens per minute forces chunked drafting, so the writer never sees the whole story. Root cause 4 (model register, invented details) remains. The daily quota allows about two long-form attempts and is shared with FR/IB. Today's run used 199.5K tokens without one passing script. |
| **B. Claude Opus for everything** | Best expected writing quality and the simplest pipeline (the Phase 3 engine's default mode). | The critic and evaluator would be the same model family as the writer, which loses the independent check. In this benchmark Gemini caught real errors in *both* scripts (e.g. the omitted survey method in Claude's). B is also the higher cost. |
| **C. Hybrid: Claude storytelling, Gemini review (Groq optional)** | Claude does the plan, single-pass draft and targeted rewrites, which addresses root causes 3 and 4. Free Gemini stays the independent critic and final fact-check (it found real errors). Groq stays a $0 fallback, or does mechanical work. Already supported by configuration (`PD_STORY_PROVIDERS="plan=anthropic,draft=anthropic,rewrite=anthropic,critique=gemini"`), so no new feature is needed. | Costs money (below). Needs an `ANTHROPIC_API_KEY` secret and an explicit paid budget. Not yet validated by a real API run. |

**Recommendation: C.** One caveat: "Groq research" adds nothing yet. Research today comes from manually verified primary sources, and the research gate should stay the gatekeeper whatever produces the dossier. So in practice C is **Claude writes, Gemini reviews, Groq is the free fallback**. Two steps should come before relying on it:
1. Fix the planning and gate issues (root causes 1, 2, 6, 7 and the i2 dossier error). They hurt any model.
2. Run one budget-capped Claude API run (`max_usd` ≈ $5, `critic=gemini`) on a new topic, as the real test this benchmark could not be.

### Estimated Claude API cost for four long-form scripts per month (estimates, not measurements)

Assumptions:
- Opus 5.5 list prices as coded in `llm.js`: $4 per 1M input tokens, $20 per 1M output tokens (adaptive thinking is billed as output), cache writes 1.25× input, cache reads $0.20 per 1M.
- A shared, cached prefix of about 12K tokens per call (system prompt plus dossier).
- Output per stage, including thinking:

| Stage | Output tokens (incl. thinking) |
| --- | --- |
| Plan | ~8K |
| Draft (with packaging) | ~20K |
| Each rewrite round (two rounds) | ~15K |
| Fact-fix | ~10K |

| Option | Claude calls per script | Est. input cost | Est. output cost | **Est. per script** | **Est. 4 scripts / month** | Worst case at the engine's max-token caps, 4 / month |
| --- | --- | --- | --- | --- | --- | --- |
| C (Claude writes; Gemini critique and evaluation free) | 5 | ~$0.25 | ~$1.36 | **~$1.60** (range $1.20–$3.50) | **~$6.50** (range $5–$14) | ~$18 |
| B (Claude also critiques and evaluates twice) | 8 | ~$0.40 | ~$1.76 | **~$2.15** (range $1.60–$4.50) | **~$8.60** (range $6.50–$18) | ~$26 |
| A (free) | 0 | – | – | $0 | $0 | $0 |

These are planning estimates. No Anthropic API call has been made in this project, so none are measured. The existing `PD_AUTO_MAX_USD` guard (default $3 per run) caps each run. Re-runs replay from the stage cache at no cost. At the channel's revenue goal of $2,000–3,000 per month, either paid option costs well under 1% of revenue.

## 7. Artifacts

- Claude script: `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/script.md`, `story.json`.
- Benchmark data, same folder, `benchmark/`:
  - `eval-1.txt`, `eval-2.txt`: the blinded judge payloads, exactly as sent;
  - `blinding-key.json`;
  - `verdicts-unblinded.json`: all three verdicts with scores, quotes and usage;
  - `deterministic-v1.json`, `deterministic-final.json`.
- Groq script and its reviews: `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-free-models/`.
- Judge harness: branch `bench/profitdecoded-model-benchmark` (throwaway; delete when no longer needed).
