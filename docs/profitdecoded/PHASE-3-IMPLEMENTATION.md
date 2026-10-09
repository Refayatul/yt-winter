# ProfitDecoded: Phase 3 implementation (Claude storytelling engine)

*Branch `feat/profitdecoded-storytelling-engine`, stacked on Phase 2 (`feat/profitdecoded-topic-intelligence`, PR #202, not merged). Completed 2026-10-09. Scope: script development only. Narration, rendering, publishing settings and other channels are untouched, and nothing was uploaded.*

## Read this first: what ran live, and what did not

- **No live Claude run.** No `ANTHROPIC_API_KEY` exists in the repository secrets or the local environment (only Groq and Serper keys are set). The new engine (`script-agent.develop`) is therefore tested end to end with a mock Claude client, but it was **not** run live.
- **How the gift-card production test was made instead:** I (Claude Opus 5.5, in this Claude Code session) wrote each stage's output by hand in the engine's own formats. Every deterministic part of the engine then assessed it for real:
  - research gate
  - plan checks
  - hook engineering
  - local script gates
  - Retention Critic
  - spoken-naturalness and AI-pattern readings
  - claim map
- **The editorial critique is NOT independent.** I wrote it in the same session that wrote the script. In the engine, that stage runs in a fresh context with no access to the drafting conversation. The Retention Critic *is* independent of the writer: it is deterministic code that only reads the beats.
- **Every score in this report is a heuristic reading of text** (provenance ESTIMATED). None of them measures or predicts audience retention; only YouTube Analytics after publishing can.

---

## 1. Script-engine audit (before Phase 3)

| Area | Existing capability | Gap found |
|---|---|---|
| Research | `research-agent` (Claude web search/fetch, or Groq + own page download), programmatic quote verification, `research.gate` (source tiers, central-claim support, disclosed inferences) | Strong. No change needed. |
| Script writing | `script-agent.write`: **one** structured call produces hooks, beats, graphics, 22 titles and thumbnails; up to 2 rewrite rounds in the same conversation | Story structure was implicit: no separate thesis, conflict or outline stage that could be checked. Each rewrite regenerated everything (titles and graphics included), and the conversation grew with every round. |
| Hooks | `hooks.compete` (>=5 candidates, >=4 mechanisms, paraphrase check) + `first30` | Hooks were scored by regex for information gap only. **No factual check of the hook** (its numbers or absolutes against the dossier), and no clarity, visual or originality dimensions. |
| Critique | Local issue list (word count, AI-pattern score, numbers not in the dossier, hook, titles, graphics) fed back to the writer | **No independent critique**: the same model and conversation judged its own draft. |
| Retention | `first30` (0-5 / 5-15 / 15-30 s); pipeline `storytelling()` (beat-type variety) | Nothing after second 30: no section-level reading, no dead-stretch or repetition detection, no check that questions are paid off, no detection of forced teasers. |
| Naturalness | `ai-patterns.analyze`: stock phrases, rhythm, dashes, tricolons, repeated openers | It catches written AI tics but **not narration problems**: sentences too long to follow by ear, number pile-ups, corporate words, unexplained acronyms, passive voice. It also missed "but here *is* the twist". |
| Claude integration | `llm.run`: Opus 5.5, adaptive thinking, streaming, structured output, refusal fallbacks, `$` guard | **No prompt caching.** The cost estimate billed cache writes at 0.25x input instead of 1.25x. There was no per-stage cost and no reuse of stage outputs. |
| Citations | Beats carry one `claimId`; numbers are checked against the dossier | There was no readable claim-to-source report for review. |

## 2. What changed (incremental, existing modules)

| Stage (task list) | Where | What it does |
|---|---|---|
| 1 Research verification | existing `research.gate` | `develop()` refuses to write on a dossier that fails the gate. Nothing is relaxed. |
| 2-5 Thesis, conflict, hooks, structure | `script-agent.develop` → PLAN stage + `evaluatePlan` | One structured call returns the thesis, central question, conflict (wants/obstacle/stakes), misconception, original angle, >=6 hooks and a section outline (purpose, claim ids, questions raised and resolved). The checks require: valid claim ids; every question resolved later; a turn or complication; a caveat; the payoff last; all central claims (long-form) or at least one (Short); and a factual winning hook. One repair round is allowed. |
| 4 Hook engineering | `hooks.engineer` / `evaluateHook` | Six dimensions: curiosity, clarity, originality, tension, visual, and **factual as a gate**. A number not in the dossier, or an absolute or superlative the dossier doesn't make ("nobody", "the biggest", "secretly"), disqualifies a hook. An editor may pick a different factual hook within 10 points of the top, with a written reason (`selectedHook`). |
| 6 Script generation | DRAFT stage | Writes from the approved plan and winning hook, tagging every beat with its section. |
| 7 Independent critique | CRITIQUE stage, `prompts/editor.md` | Runs in a **fresh context** (one user turn, no drafting conversation) with the dossier, plan, beats and all automated readings. It returns structured problems (section, beats, quote, concrete fix), what to keep, and any automated readings it disputes. Optional `PD_AUTO_CRITIC_MODEL` override; the default is the same model. |
| 8 Targeted rewriting | REWRITE stage | Fixes only the listed problems. Titles, thumbnails and unchanged graphics are kept rather than regenerated. Later rounds target only what the deterministic checks still find. |
| 9 Final assessment | `script-agent.assess` | Combines the existing local gates, the Retention Critic, spoken naturalness, hook engineering and a section-by-section editorial report. |
| Retention Critic | new `core/profitdecoded/retention.js` | Reads the script section by section. It looks for: sections with no new claim, number or name (needs >=40 words to count as a dead stretch); repetition; teasers and forced drama ("stay with me", "more on that later"); filler; generic phrasing; lines that are hard to say; long sections without a turn. Across the whole script it checks: questions never answered, questions on a metronome, no escalation in the middle third, a missing or predictable payoff, and an essay-style ending. Every finding comes with a recommendation, and the output always carries the "not a retention measurement" disclaimer. |
| Spoken naturalness | `ai-patterns.spoken` | Flags: sentences over 32 words, 3+ numbers in a sentence, semicolons or brackets, 4+ commas, corporate or academic wording, filler adverbs, unexplained acronyms, passive voice, and long average sentences. It is separate from `aiPatternScore`, so existing calibration is unchanged. |
| Prompts | new `story.md` and `editor.md`; craft rules added to `script.md` | These cover: writing for the ear, one number per sentence, survey and accounting estimates labelled as estimates, curiosity coming from the evidence, and no teasers. |
| Cost control | `llm.js`, `develop()` | Per-model prices (Opus 5.5 $4/$20; Sonnet 5.5 $2/$10; Haiku 5.5 $0.10/$0.50; cache reads $0.20, $0.20 and $0.01; cache writes 1.25x input). **Fixed cache-write cost (was 0.25x).** Top-level prompt caching, plus a shared stage prefix (system + dossier block, with `cache_control`). A per-stage cost ledger. A disk stage cache (`state/story-cache/`, gitignored), so a re-run of an unchanged story makes **no API calls and needs no key**. The existing `PD_AUTO_MAX_USD` guard still applies. |
| Orchestration | `produce.js`, `auto-produce.js` | The story engine is the default; `PD_STORY_ENGINE=legacy` keeps the original single-call writer. The CLI prints per-stage tokens and cost. |
| Review | `profitdecoded.js story-review <dir>`, `report.renderStory` | Renders a story package as `review.md`: plan, hooks, draft vs final, retention critique, section report and claim-to-source map. It also writes a pipeline-compatible `bundle.json`. The pipeline review report now shows the Retention Critic and spoken readings, without new gates. |

Compatibility: the bundle shape is unchanged; `storyPlan` and `editorial` are added as extra fields. All existing tests pass, and the two orchestrator tests that exercise the single-call writer now pin `storyEngine: "legacy"`.

## 3. First production test: "Billions Sit on Unused Gift Cards. Who Keeps the Money?"

### 3.1 Research (gate: long-form **94 PASS**, Short **100 PASS**)

`channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json` has 6 sources, 4 of them primary, and 10 claims. Every claim carries the verbatim passage it rests on, plus 4 disclosed inferences of our own arithmetic or rounding.

| Source | Type | What it supports |
|---|---|---|
| Starbucks FY2025 Form 10-K (SEC, filed 2025-11-14) | primary | Breakage $200.4M + $22.0M (FY25), $187.6M + $20.0M (FY24), $196.1M + $18.9M (FY23); no expiration or service fees in company-operated markets; breakage in proportion to redemptions; market-by-market rates; unclaimed property remittance; stored value + loyalty balance $1,751.7M |
| Darden Restaurants FY2026 Form 10-K (SEC, filed 2026-07-24) | primary | No expiry or dormancy fees; breakage over generally 12 years; a 50 bp change ≈ $3.6M; gift-card rollforward $628.8M → $636.7M; unclaimed property laws listed among subjective estimates |
| CFPB, 12 CFR 1005.20 (Regulation E) | primary | Expiry only if funds stay valid at least five years; inactivity fees only after one year, at most one a month |
| CFPB blog (2012, archived) | primary (archived) | Corroborates the five-year and 12-month rules |
| Bankrate press release and article (2024-09-23) | survey publisher | 43% of adults; about $27B; $244 average, $100 median; 2,373 adults (1,010 with unused value), YouGov, online non-probability sample; 34% lost money, 20% let a card expire |

**Limits logged as contradictions:**
- The survey's 20% "let a card expire" versus no-expiry cards at Starbucks and Darden: different scopes, both true.
- The $27B total's calculation is not published, and it includes vouchers and store credit.
- Breakage is an estimate that companies revise.
- The $1.75B Starbucks balance mixes cards with loyalty rewards.

**Not reached (no bypasses):**
- The eCFR copy of Reg E sat behind a bot check; the CFPB copy was used instead.
- The SEC full-text search host was refused in the browser.

### 3.2 Competitor comparison and original angle

| Video | Published | Views (2026-10-08) | What it covers (from title, description and chapters; captions were not retrievable) |
|---|---|---|---|
| CNBC: What Happens To Unspent Gift Cards? | 2020-05-25 | 696K | Market size (its 2019 figures), unspent totals |
| PolyMatter: How Unused Gift Cards Power Delaware's Economy | 2023-09-01 | 251K | State escheat / Delaware revenue |
| WSJ: Why Starbucks Operates Like a Bank | 2022-01-12 | 2.67M | Starbucks app and stored-value float; only the first ~52 s are on the "bank" idea (chapters) |

The live collector snapshot also found three new low-view clone videos (3–13 views, last week) on the same subject.

**Original angle:** follow one card through the companies' **current** filings:
- the card as a debt;
- breakage as a forecast, built market by market (Starbucks) and spread over about 12 years (Darden);
- the federal five-year floor;
- the state's claim.

The angle also separates the survey estimate ($27B, households, all brands) from what one company records ($222.4M), which none of the three does. It corrects the common misconception that the store "takes" a forgotten balance: the balance stays spendable, and breakage is a forecast, not a transfer.

### 3.3 Hook evaluation (long-form plan; six heuristic dimensions, factual gate)

| Hook | Mechanism | Curiosity | Clarity | Originality | Tension | Visual | Factual | Total |
|---|---|---|---|---|---|---|---|---|
| **In the US, Starbucks cards don't expire. Its latest annual report still counts $222.4 million of card money as sales, and no drink was served for it.** | contradiction | 76 | 90 | 80 | 86 | 95 | pass | **85** |
| Darden's gift cards have no expiry date. Its accountants still plan, 12 years ahead, for the money that won't come back. | contradiction | 76 | 90 | 81 | 86 | 95 | pass | 85 |
| 43% of American adults are holding an unused gift card, voucher or store credit, according to one survey. Here is where that money goes. | number | 70 | 90 | 57 | 61 | 95 | pass | 75 |
| Look at the gift card in your kitchen drawer. The company that sold it has already estimated how likely you are to spend it. | visual mystery | 54 | 90 | 80 | 61 | 80 | pass | 73 |
| A gift card is money the store owes you. Some of that debt slowly turns into the store's sales. | hidden incentive | 48 | 90 | 77 | 61 | 80 | pass | 71 |
| When a gift card balance goes unspent, who ends up with the money? | question | 46 | 90 | 57 | 61 | 70 | pass | 66 |

**Selected:** the Starbucks contradiction. It ties the Darden hook, but it is built on a brand nearly every US viewer has used and on the film's headline number. Darden's 12-year detail pays off better in the middle of the film.

**Hooks rejected along the way by the factual gate:**
- "…gift cards **nobody** will ever use": the 10-K says "not expected to be redeemed".
- "Who keeps the money on a gift card **nobody** spends?"

### 3.4 Narrative outline (long-form)

**Central question:** when a gift card balance goes unspent, who ends up with the money?
**Misconception:** the store gets the money when a card is forgotten or expires, all at once.

| # | Section | Purpose | Claims |
|---|---|---|---|
| 1 | The money nobody spent | hook (raises the central question) | i1, c2 |
| 2 | The drawer | evidence (survey, clearly an estimate) | c8, c9 |
| 3 | A debt, not a sale | mechanism (deferred revenue, the filing table) | c3, i3, i4 |
| 4 | Breakage | mechanism (the forecast; raises "if cards don't expire, how is money gone?") | c2, c1, i1 |
| 5 | A forecast twelve years long | turn (Darden: 12 years, ±0.5 pt ≈ $3.6M, pool still growing) | c4, c6, c5, i2 |
| 6 | Why cards don't just expire | complication (federal floor; 20% still let a card expire) | c7, c9 |
| 7 | A third claimant | consequence (unclaimed property laws) | c2, c10 |
| 8 | Two numbers that don't belong together | caveat (survey versus books; breakage revised) | c8, i1, c4 |
| 9 | Who keeps it | payoff (answers the central question) | c2, c4, c7 |

### 3.5 Retention critique (draft → final)

**Long-form draft** (987 words): 6 blocking findings.
- Too short for 8 minutes.
- The first beat was not the selected hook.
- The first 30 seconds read 68: the first explanation only arrived after second 30.
- Two questions were never answered in matching words.
- The "third claimant" section added no new evidence (dead stretch).

The editorial critique (same session, see the caveat above) added:
- a three-part teaser in the opening;
- a three-number sentence;
- the median left unexplained;
- an unshown basis for "almost all comes back out".

In the final read it also caught a **factual** problem the heuristics could not: the payoff implied the predicted share stops being the holder's. It doesn't, because breakage is an accounting forecast and the card stays spendable.

**Long-form final** (1,223 words, about 8.2 min at 150 wpm): 0 blocking findings.

| Reading | Score |
|---|---|
| Retention reading | 100 |
| Spoken naturalness | 100 |
| AI-pattern | 0 |
| First 30 seconds | 81 (hook 76, validates title 89, momentum 80) |

The section-by-section report is in `story-tests/hbm-073-gift-cards-long/review.md`. All nine sections score 100 on the retention reading, with evidence 100 everywhere.

**Short:**

| | Words | Blocking | Notes |
|---|---|---|---|
| Draft | 99 | 1 (after calibration) | unanswered payoff question |
| Final | 111 (about 42 s) | 0 | retention 100, spoken 100, AI-pattern 1 |

**Calibration changes made during the test** (both stated here because they loosen a check):
- A **dead stretch** now needs at least 40 words of narration (about 15 seconds). A single 6-second beat in a Short cannot be a "stretch". The long-form's "third claimant" section (57 words) is still flagged and was fixed with new evidence.
- The **plan check** requires every central claim in long-form, but only one in a Short.

### 3.6 Final long-form script (about 8.2 minutes)

Claim ids in brackets; `i*` = our own disclosed arithmetic or rounding.

**The money nobody spent**

In the US, Starbucks cards don't expire. Its latest annual report still counts $222.4 million of card money as sales, and no drink was served for it. `[i1]`
That money came from unused gift card balances. `[c2]`
The reason is a forecast. Starbucks keeps the share of card money that its own history says will never be spent, and it counts that share as sales. `[c2]`
That's only part of the story. Who else ends up with a piece of the money, and what can you still do about yours? `[c2]`

**The drawer**

Start with the drawer. In August 2024, Bankrate paid the polling firm YouGov to ask 2,373 American adults about gift cards they hadn't used. `[c8]`
43% said they had at least one unused gift card, voucher or store credit. `[c8]`
The average holder was sitting on $244. The median was $100, which means half of the people with leftover value had $100 or less. `[c8]`
Bankrate turned that into a national figure of about $27 billion. Treat that as an estimate. It comes from an online survey, it counts vouchers and store credit too, and Bankrate doesn't publish the calculation behind the total. `[c8]`
Of the 2,373 people asked, 1,010 had some unused value. Everything after that is an estimate stretched across the whole country. `[c8]`
The same survey found that 34% of adults had already lost money to a gift card mistake. 20% let a card expire. 17% lost one. 12% watched the store close before they could spend it. `[c9]`

**A debt, not a sale**

Now look at the other side of the counter. When you load money onto a card, the store gets the cash right away. But it can't call that cash sales, because it hasn't sold you anything yet. `[c3]`
Until you spend it, the money sits on the company's books as something it owes you. Accountants call it deferred revenue. `[c3]`
Starbucks keeps a small table for this in its annual report. Money goes in as card loads, reloads and loyalty rewards. In fiscal 2025, that added about $15.2 billion. `[i3]`
Money comes out of the same table as purchases and breakage. That side was also about $15.2 billion. So almost everything loaded in a year gets used. The interesting part is the slice that doesn't. `[i3]`
By the end of that year, Starbucks still owed customers about $1.75 billion, up from about $1.72 billion a year earlier. That figure mixes card balances with loyalty rewards, so it isn't a count of forgotten gift cards. `[i4]`

**Breakage**

Starbucks has years of data on how people use its cards. From that history, it estimates how much of the money will not be redeemed. `[c2]`
Accountants have a name for that share. They call it breakage. `[c2]`
And the forecast isn't one number for the whole world. Starbucks says it builds its redemption rates market by market, using when each card was activated or reloaded, and through which channel. `[c2]`
Starbucks doesn't wait for a card to go quiet and then take the balance. It books breakage gradually, in step with the cards that do get spent. `[c2]`
Its filing puts the whole idea in one dry line. A portion of stored value cards is not expected to be redeemed. `[c2]`
Every time a regular customer taps a card at the register, a small predicted share of the unspent money moves into sales along with it. `[c2]`
Add up the two breakage lines in its filing and you get $222.4 million for fiscal 2025. That addition is ours. The year before, it was $207.6 million. The year before that, $215.0 million. `[i1]`
So money that customers never spend doesn't vanish. It shows up, a little at a time, as revenue the company never had to brew anything for. `[c1]`

**A forecast twelve years long**

Which raises an awkward question. If the cards don't expire, how does a company decide that any of the money is gone? `[c4]`
It makes a forecast. Darden, the company that runs Olive Garden, spells this out in its own annual report. `[c4]`
Its gift cards have no expiry date and no dormancy fees. It still estimates how much will never be used, and it spreads that money into sales over the expected life of the cards, generally 12 years. `[c4]`
Twelve years is the window over which Darden expects its remaining card balances to come in. Some of that money will be spent in the next decade. Some of it, the company predicts, never will. `[c4]`
It also admits the estimate could be off. Darden says moving its breakage rate by half a percentage point would have changed its breakage income by about $3.6 million in fiscal 2026. `[c6]`
And the pool of unspent cards isn't shrinking. In fiscal 2026, Darden took in $760.2 million on new cards. `[i2]`
It released $751.9 million through spending and breakage. By our math, the pile still grew by $7.9 million. `[i2]`
So breakage isn't a tally of cards people forgot. It's a bet, placed years in advance, on how a whole crowd of card holders will behave. `[c4]`

**Why cards don't just expire**

There's a reason companies plan this way instead of letting cards die. Federal rules make that hard. `[c7]`
A store gift card in the US can only carry an expiration date if its money stays good for at least five years from when it was issued or last loaded. `[c7]`
Fees for not using the card are allowed only after a full year with no activity, and then no more than one a month. `[c7]`
So the law doesn't let a store run out the clock on you quickly. What's left is the slow version. Wait, watch how people use their cards, and estimate. `[c7]`
That doesn't mean money never disappears. 20% of adults in the Bankrate survey said they'd let a card expire. That survey covered every kind of card and voucher, and some cards can still expire once the five-year minimum has passed. `[c9]`

**A third claimant**

There's also a third party with a claim. Starbucks says its breakage estimate takes into account money it may have to hand over to government agencies under unclaimed property laws. `[c2]`
The filing doesn't say how much goes where. It only confirms that part of an unspent balance can end up with the government instead of the company. `[c2]`
Darden is just as careful. It lists unclaimed property laws among the rules that are highly complex and that involve many subjective assumptions, estimates and judgments. Even the state's share is a judgment call. `[c10]`

**Two numbers that don't belong together**

It's tempting to put these numbers side by side. Don't. Bankrate's $27 billion is a survey estimate of what households say they hold, across every brand. Starbucks' $222.4 million is what one company recorded under accounting rules. `[c8]`
Breakage itself is an estimate too, and the companies say so. Darden updates its breakage rate from time to time. If people spend old cards more than history suggests, the numbers change. `[c4]`

**Who keeps it**

So who keeps the money from an unspent gift card? `[c2]`
The store keeps a piece of the money, but only the share its own history says won't come back, and only a little at a time. And that's a forecast, not a transfer. The balance on your card is still yours to spend. The government may end up with another piece under unclaimed property laws. `[c2]`
At Starbucks and Darden, that balance has no expiry date. The forecast about you was made long before the card reached your drawer. If there's a card in there now, spending it is the only way to prove the forecast wrong. `[c4]`

### 3.7 Final Short script (about 42 seconds)

**Hook**

In the US, Starbucks cards don't expire. Its latest annual report still counts $222.4 million of card money as sales, and no drink was served for it. `[i1]`

**The forecast**

The reason is a forecast. From its own history, Starbucks estimates how much will never be redeemed, and calls that share breakage. `[c2]`

**In step with others**

None of this touches your balance. Each time a card gets spent, a predicted slice moves into sales. `[c2]`

**The state**

Part can also go to the government under unclaimed property laws. `[c2]`

**Who keeps it**

So who keeps the money? The store keeps the money it predicted you'd never spend, but only if you never do. Your balance is still yours. Spend it, and prove the forecast wrong. `[c2]`

### 3.8 Five alternative opening hooks (long-form)

All pass the factual gate:
1. "Darden's gift cards have no expiry date. Its accountants still plan, 12 years ahead, for the money that won't come back." (85)
2. "43% of American adults are holding an unused gift card, voucher or store credit, according to one survey. Here is where that money goes." (75)
3. "Look at the gift card in your kitchen drawer. The company that sold it has already estimated how likely you are to spend it." (73)
4. "A gift card is money the store owes you. Some of that debt slowly turns into the store's sales." (71)
5. "When a gift card balance goes unspent, who ends up with the money?" (66)

### 3.9 Claim and source verification

- **Every number traces to the dossier.** For both final scripts, the review reports: "Numbers in the final script that are not in the dossier: none". `story-tests/hbm-073-gift-cards-long/review.md` has the full beat → claim → source → verbatim passage table.
- **Survey figures are attributed and labelled.** The script names Bankrate and YouGov, the sample (2,373 adults, 1,010 with unused value), the method (online), the scope (vouchers and store credit), and that the total's calculation isn't published.
- **Own arithmetic is said aloud** ("That addition is ours", "By our math"). Roundings ($15.2B, $1.75B, $1.72B) are disclosed inferences in the dossier.
- **One loose mapping for a human reviewer:** "Darden, the company that runs Olive Garden" rests on the Olive Garden line inside Darden's own gift-card table (claim c5's passage), not on a dedicated claim.

## 4. Tests

- **New:** `tests/js/profitdecoded-story.test.js`, 12 tests covering:
  - cost accounting and cache pricing; caching, model override and stage ledger in `llm.run`
  - hook engineering with the factual gate
  - spoken naturalness
  - Retention Critic, editorial report, plan checks and the bounded hook override
  - `develop()` end to end with a mock client (stage order, shared cached prefix, independent critique, targeted rewrite, disk-cache rerun with zero calls and no key, bundle into the existing pipeline)
  - gates never relaxed
  - orchestrator default
  - calibration rules
  - a regression that re-runs `story-review` on both committed gift-card packages
- **Results:** `npm run test:profitdecoded` **132/132 pass**. Full `npm test` **449/449 JavaScript tests pass, 24/24 Python OK**.
- **Pre-existing, unchanged by this work:** the stored Costco Short dry run now assesses as REJECT on narration naturalness (83 < 88). Phase 2 code gives the same result, so it was not caused by Phase 3.

## 5. Estimated API cost per story (not measured: no API key)

Token counts are sized from the real gift-card dossier and package files (characters ÷ 4, ESTIMATED), priced at Opus 5.5 list rates with the shared prefix cached across stages. Thinking tokens (billed as output, amount unknown in advance) are given as a range.

| Stage | Long-form | Short |
|---|---|---|
| Plan (writes the cached prefix, ~2.3K tokens) | $0.08–$0.20 | $0.07–$0.19 |
| Draft | $0.17–$0.41 | $0.09–$0.33 |
| Independent critique (effort medium) | $0.07–$0.16 | $0.05–$0.14 |
| One targeted rewrite | $0.13–$0.29 | $0.06–$0.22 |
| **Total** | **≈ $0.46–$1.07** | **≈ $0.26–$0.87** |

**Notes on these estimates:**
- **Research is extra.** Live web research is not included; this time it was done by hand. Its cost depends on searches and fetches and is capped by the existing guard.
- **Caching saves little here.** On this dossier it saves about 5%, because the shared prefix is only ~2.3K tokens and may sit below the model's minimum cacheable size; larger dossiers benefit more.
- **The bigger savings** come from the disk stage cache (a re-run of an unchanged story costs $0) and from rewrites no longer regenerating titles, thumbnails and graphics.
- **Measurement after one live run:** with a key set, `node scripts/profitdecoded/auto-produce.js --topic hbm-073-how-gift-cards-make-money-for-retailers --format long --through script` prints the measured per-stage tokens and cost. The research dossier is reused, so no research spend.

## 6. Not done (by design or blocked)

- **Live Claude run of the new stages** (no `ANTHROPIC_API_KEY`). Adding the repository secret enables the existing workflow (`profitdecoded-produce.yml`, provider `anthropic`). The Groq free tier (8K tokens per minute) is too small for a long-form draft stage.
- **Narration and rendering:** Phase 4 scope.
- **Competitor transcripts:** YouTube caption downloads returned empty without a session token, and PolyMatter's source list host failed TLS verification. The comparison above uses public titles, descriptions and chapters only.
