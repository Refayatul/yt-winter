# ProfitDecoded: Phase 2 implementation (topic intelligence)

*Branch `feat/profitdecoded-topic-intelligence`. Completed 2026-10-09. Scope: topic selection only. There are no script-generation changes, no changes to other channels or schedules, and publishing stays disabled.*

**First long-form recommendation:** **"Billions Sit on Unused Gift Cards. Who Keeps the Money?"** (inventory `hbm-073`). The reasoning is in section 7.

---

## 1. What changed

| Area | Change | Files |
|---|---|---|
| Title saturation | Six crowded title templates are now detected: `how-x-actually-makes-money`, `not-what-you-think`, `business-model-explained`, `economics-of-owning`, `so-expensive` and `decline-what-happened`. Their saturation classes come from dated evidence. A topic whose inventory title uses a SATURATED or HOT template and has no curated angle gets a `genericTitle` penalty (up to 8) and a "needs angle" note. It is **never rejected for its title**: the REJECT gate uses a title-neutral originality score. | `competitive.js`, `topic-scoring.js`, `decision.js`, `intel/coverage-2026-10-08.json` |
| Narrative angles | `topics/angles.json` holds 12 curated working titles. Each one records its premise, a status (`VERIFIED`, `SUPPORTED_SECONDARY` or `NEEDS_RESEARCH`), evidence with URLs, and rejected wordings with the reason. Inventory titles are never overwritten. | `topics/angles.json` |
| Ranking | An editorial lens with eight dimensions (section 3). Three are new: narrative conflict, competitive saturation and angle originality. The rest reuse existing signals, so nothing is double-counted. | `topic-scoring.editorialLens`, `decision.js`, `config.js` |
| Freshness | A new module, `freshness.js`, combines a sourced watchlist of 11 dated events covering 21 topics with a phrasing heuristic. An outdated or contradicted premise yields `REFRESH_RESEARCH`. A dossier or a checked angle written after the event resolves the flag; a contradicted claim needs a dossier. Titles are never rewritten. | `freshness.js`, `topics/freshness-watchlist.json`, CLI `freshness` |
| Competitor list | 12 niche-relevant channels, each with a role and reason; 11 mega or off-niche channels removed. Discovery queries were rewritten around patterns that perform, replacing the oversupplied "how X makes money" phrasing. The existing collector reads the structured list; there is no second implementation. | `intel/reference-channels.json`, `yt-collector.js` |
| Observed evidence | The collector now keeps video duration. The breakout feed can compare long-form only (Shorts never set a long-form baseline). New `topicEvidenceFromSnapshot` gives per-topic related videos, saturation and demand (see its rules in section 4). `rank --snapshot` feeds this into the decision engine. | `competitive.js`, `profitdecoded.js` |
| Saturation sources | Manual sample (INFERRED) and collector snapshot (OBSERVED) measure different things: entrenched older hits versus the last year. **The more crowded reading wins** and keeps its provenance. Only an OBSERVED SATURATED reading can block a topic. | `topic-scoring.js`, `decision.js` |

New CLI:
- `node profitdecoded.js freshness [--all]`
- `node profitdecoded.js rank --top 20 --snapshot channels/profitdecoded/intel/snapshot-2026-10-08.json --write`

## 2. Observed vs estimated

| Label | Where it comes from in this phase |
|---|---|
| **OBSERVED** | YouTube Data API v3 snapshot, run 37856970158 on 2026-10-08 23:00 UTC: view and subscriber counts, durations, publish dates. Outlier scores, same-format medians and collector saturation are computed from them. Research-gate scores for the two existing dossiers. |
| **INFERRED** | Saturation classes from manual public-search samples (`coverage-2026-10-08.json`; counts observed by a person, the class derived). Watchlist events (a person read the cited sources). Source reliability of checked angles. |
| **ESTIMATED** | Curation priors (curiosity, evergreen, advertiser fit, visual feasibility), title-template penalties, narrative conflict (a title reading). |
| **UNKNOWN** | Every topic the snapshot did not cover: 432 of 594 have no saturation reading at all, and 521 have no observed demand. UNKNOWN still scores pessimistically (35), never favourably. |

No RPM, CPM, revenue or CTR figure appears anywhere.

## 3. The eight lens dimensions

| Dimension | Source | Provenance | Enters the decision as |
|---|---|---|---|
| Audience curiosity | existing `curiosityGap` | ESTIMATED | `curiosity` (unchanged) |
| Competitive saturation | collector snapshot, or manual sample, the more crowded wins | OBSERVED / INFERRED / UNKNOWN | saturation penalty (blocks only if OBSERVED SATURATED) |
| Narrative conflict | mechanism base plus tension markers in the working title | ESTIMATED | new input `narrativeConflict` (weight 5) |
| Evergreen potential | existing prior minus a freshness drop | ESTIMATED | `evergreenValue` |
| Advertiser relevance | existing `advertiserFit` | ESTIMATED | via `revenueOpportunity` (unchanged) |
| Visual feasibility | visual availability + production feasibility − IP risk | ESTIMATED | `visualPotential` |
| Source reliability | research score > checked angle > capped prior; capped at 40 if the premise is stale | OBSERVED / INFERRED / ESTIMATED | factual-risk penalty |
| Angle originality | template class, inventory repetition, curated angle, angle coverage | ESTIMATED / INFERRED | `originalAngle`, used when there is no gap analysis |

The lens score is reported but not added to the rank a second time.

## 4. Live YouTube data

**API verification:**
- **The secret works and stays hidden.** `PD_YT_API_KEY` exists as a repository secret. The existing workflow `profitdecoded-competitors.yml` ran it from the **feature branch** (`--ref feat/profitdecoded-topic-intelligence`) and used the branch's competitor configuration. The log shows the key only as `***`; a scan of the full log found no key material.
- **All handles resolved.** Every one of the 12 reference handles resolved, so none were reported as unresolved.
- **The quota was respected.** The budget was 6,000 units, under the 10,000/day free quota; the run used exactly 6,000. There were 54 keyword searches (5,400 units). Collection stopped cleanly at the budget while fetching channel baselines; the last channel (More Perfect Union) was not collected.
- **One controlled run.** There were no schedule changes and no second collection.
- **Scheduling:** the branch's version of the workflow ran fine. `workflow_dispatch` on a non-default branch was not restricted.

**Collected:** 288 channels (239 under 100K subscribers) and 6,022 videos: 2,654 long-form (over 180 s) and 3,368 Shorts. The snapshot is committed as `intel/snapshot-2026-10-08.json`.

**Limits of this data:**
- **Market mix.** Discovery used `regionCode=US` and `relevanceLanguage=en`, but returned many Indian, Malayalam, Polish and Portuguese channels. Non-Latin-script titles are excluded from topic evidence; Latin-script non-US channels (e.g. HinExp) remain and are labelled in the analysis.
- **Recent uploads only.** The sample covers each channel's last 25 uploads plus one-year search windows, so entrenched older hits (Business Insider 2019, WSJ 2021) are invisible to it. That is why manual coverage is kept and the more crowded reading wins.
- **Literal matching.** A video counts toward a topic when it names the entity, or shares two subject words with the topic title; topics whose title names an entity need the entity. This is inspectable but imperfect. Example: it misses Wendover's "Why the Ikea Business Model Wins" (about 956K views, one month old) for the IKEA layout topic.
- **Demand needs two channels.** Observed demand requires at least two independent channels, and saturation counts each channel once, so a one-channel series cannot fake a crowded field.

### 4.1 The 12 reference competitors (OBSERVED, last 25 uploads, long-form only)

| Channel | Subs | Long-form in last 25 | Long-form median views | Median ÷ subs | Median length | Best long-form vs own median |
|---|---|---|---|---|---|---|
| Micro | 208K | 25 | 306,287 | 1.47× | 17 min | 10.5× ("Why Only Three Countries Bother Building Ships…", 3.18M) |
| Neu | 37.5K | 25 | 49,974 | 1.33× | 9 min | 13.1× ("The Economics of Owning A Ship", 619K) |
| The Fat Files | 881K | 25 | 1,368,970 | 1.55× | 21 min | 2.2× (Buc-ee's, 2.86M) |
| Established Context | 66.7K | 24 | 37,011 | 0.55× | 10 min | 13.8× ("Why Fast-Casual Just Collapsed", 512K) |
| Tony Talks Business | 12.8K | 4 (21 Shorts) | 7,537 | 0.59× | 21 min | UNKNOWN (fewer than 5 long-form for a baseline) |
| Brimm. | 21.2K | 25 | 9,006 | 0.42× | 8 min | 62.9× ("Why Airlines Use This Exact Layout", 552K) |
| Modern MBA | 832K | 25 | 276,016 | 0.33× | 39 min | 6.0× ("The Crumbling Business of Marijuana", 1.65M) |
| Wendover Productions | 4.92M | 25 | 999,947 | 0.20× | 19 min | 2.3× ("How the Channel Tunnel Works", 2.17M) |
| Logically Answered | 928K | 14 (11 Shorts) | 142,227 | 0.15× | 17 min | 1.9× |
| Mr. Finance | 79.8K | 25 | 10,155 | 0.13× | 23 min | 2.9× ("The Economics of Owning a Port", 32K) |
| Company Man | 1.8M | 25 | 153,388 | 0.09× | 12 min | 3.9× ("Gatorade vs. Powerade", 620K) |
| Hidden Economics | 26 | 4 (6 Shorts) | 9,450 | (meaningless at 26 subs) | 26 min | UNKNOWN (baseline too small) |

**Reading:**
- **Upload rhythm matters.** The faceless channels whose median beats their subscriber count (Micro, Neu) publish every 1–3 weeks at 9–17 minutes.
- **Volume templates earn little.** The daily template channels (Mr. Finance, and Tony Talks Business for long-form) earn a small fraction of their audience per video.

### 4.2 Small-channel breakouts (OBSERVED, long-form, under 100K subs, at least 5× own median)

The long-form breakout feed has 224 items scoring 55 or more; 203 have Latin-script titles and 177 come from small channels.

US/English-relevant examples:

| Views | Subs | × own median | Age | Channel | Video |
|---|---|---|---|---|---|
| 551,835 | 21.2K | 62.9× | 175 d | Brimm. | Why Airlines Use This Exact Layout |
| 213,254 | 2.8K | 382.9× | 66 d | Useless Money | The Economics Of Owning a Holding Company |
| 136,169 | 1.0K | 262.4× | 9 d | Lucas Explains Cars | The BANNED 1957 Chevy That GM Built In Secret |
| 108,634 | 0.3K | 255× | 24 d | Belezas do Mundo | The Sneaker Bubble BURST — And Resellers Got Caught Holding the Shoes |
| 79,720 | 1.9K | 174.1× | 32 d | Cost Anatomy | The Economics of Owning a Trading Firm Explained |
| 70,920 | 1.1K | 148.2× | 20 d | The American Shoe Arch | What Happened to Converse? … |
| 46,850 | 0.4K | 51.2× | 20 d | Toonie Economics | Why Canadians Pay 3x More For Phone Bills… |
| 40,753 | 1.1K | 85.2× | 12 d | The American Shoe Arch | What Happened to Sebago… |
| 13,072 | 0.1K | 102.9× | 5 d | Business Decoded | Why Outlet Stores Sell "Designer" Clothes So Cheap |
| 9,020 | 1.7K | 85.9× | 43 d | Andrew Silverstein | The Annoyance Economy: How Friction Became a Business Model |

**Patterns:**
- "economics of owning a [finance asset]"
- heritage US consumer-brand decline stories ("What happened to …?")
- resale and price bubbles
- consumer-friction economics

Multiples above 100× come from channels with tiny medians, so they show which topics break out, not reliable audience size. The largest small-channel breakouts overall (Blinkit, Patanjali, Indian ships and dhabas, up to 2.16M) serve the Indian market and are excluded from conclusions.

### 4.3 Saturation detected

- **Collector (recent uploads):** 125 topics keep an OBSERVED reading after merging (56 EARLY, 38 GROWING, 18 DECLINING, 13 HOT). The 13 HOT topics fall into four clusters:
  - fast food, 8 topics (Levi Hildebrand "Why Fast Food is DEAD" 1.0M, 14 days old; Wendover "Why Fast Food Got So Expensive" 1.5M, 4 months)
  - Tesla, 2
  - software ownership, 2
  - one each for package sizes and cash
- **Manual sample (entrenched):** SATURATED for mattress stores, BNPL, printer ink, Chick-fil-A, Aldi, Trader Joe's and subscriptions. HOT for Costco membership, gyms, airline cards, McDonald's, dollar stores, tipping, Uber, Ticketmaster, shrinkflation, self-storage, movie concessions and the penny.
- **Clone supply (new, OBSERVED):** low-view channels are now uploading our exact launch angles:
  - "Why Car Washes Are Suddenly Everywhere" (50 views)
  - three unused-gift-card videos (3–13 views, last 6 days)
  - five movie-theater popcorn videos, including "Why Your $15 Movie Ticket Makes Theaters Almost Nothing", which repeats the premise AMC's own 10-K contradicts

  These count as supply (GROWING at most), not audience demand.

## 5. Updated top 10 (`reports/topic-ranking.txt`, with snapshot evidence)

| # | Working title | Rank | Decision | Saturation | Demand | Notes |
|---|---|---|---|---|---|---|
| 1 | Why IKEA Makes You Walk Through the Entire Store | 69.7 | RESEARCH_FIRST | GROWING (OBS) | 93 (OBS) | Demand rests on one 4.5K small-channel video; Wendover's 956K IKEA business-model video (1 month old) was not matched. Treat as HOT in practice. |
| 2 | What Happened to Temu's Prices After the Loophole Closed | 69.2 | SHORT_TEST | UNKNOWN | UNKNOWN | Angle resolves the de minimis freshness flag |
| 3 | Why JCPenney Lost Customers When It Stopped Running Sales | 69.1 | SHORT_TEST | UNKNOWN | UNKNOWN | |
| 4 | Why Rotisserie Chicken Costs $4.99 at Costco | 68.8 | SHORT_TEST | UNKNOWN | UNKNOWN | Costco cluster is HOT manually |
| 5 | How Silicon Valley Bank Failed in Days | 68.6 | SHORT_TEST | UNKNOWN | UNKNOWN | |
| 6 | Why College Tuition Has a Sticker Price Nobody Pays | 68.2 | SHORT_TEST | UNKNOWN | UNKNOWN | |
| 7 | How Credit Card Rewards Are Paid For | 68.2 | SHORT_TEST | EARLY (OBS) | UNKNOWN | |
| 8 | Why Costco's Food Court Hot Dog Never Changed Price | 68.1 | RESEARCH_FIRST | EARLY (OBS) | 18 (OBS) | Hot-dog claims were too weak for the Costco dossier |
| 9 | The Rule That Forced Hotels to Show the Real Price | 68.1 | SHORT_TEST | EARLY (INF) | UNKNOWN | Angle resolves the outdated resort-fee premise |
| 10 | Why Diamond Prices Are Controlled | 68.0 | SHORT_TEST | UNKNOWN | UNKNOWN | |

Across the inventory:

| Decision | Topics |
|---|---|
| SHORT_TEST | 509 |
| RESEARCH_FIRST | 68 |
| REJECT | 8 (was 49 on `main`; no topic is newly rejected for its title, as tested) |
| HOLD | 4 |
| REFRESH_RESEARCH | 3 |
| PRODUCE_SHORT | 2 (the two researched dossiers) |

203 topics carry the "needs angle" flag.

The ranking spread is small: positions 1–25 lie within 2.4 points (69.7 to 67.3). With 521 topics lacking observed demand, the order inside the top 25 is not meaningful. It is a shortlist, not a ranking to follow blindly.

## 6. Four launch candidates, reassessed

| | Penny | Movie ticket | Gift cards | Car wash |
|---|---|---|---|---|
| Working title | America Stopped Making Pennies. Who Pays Now? | Half Your Movie Ticket Goes to the Studio. The Popcorn Doesn't. | Billions Sit on Unused Gift Cards. Who Keeps the Money? | Why Your Car Wash Wants a Monthly Subscription |
| Premise | **SUPPORTED_SECONDARY.** Final circulating strike 2025-11-12, unit cost 3.69¢ (several outlets citing the Mint). The usmint.gov page blocked automated reading behind a bot check, which I did not try to bypass. Federal rounding-law status conflicts between sources. | **VERIFIED (primary).** AMC FY2024 10-K: film costs 48.4% of admissions company-wide, 51.6% in US markets; F&B costs 18.8% (US 17.3%). After direct costs, tickets left $1,321.3M and F&B $1,319.3M (our arithmetic, disclosed). | **SUPPORTED_SECONDARY.** Starbucks FY2025 10-K (primary): breakage $200.4M + $22.0M; stored-value and loyalty balance $1,751.7M. The "billions" headline rests on Bankrate's ~$27B survey estimate (Sept 2024). | **VERIFIED (primary).** Mister Car Wash Q4 2024 8-K: memberships 75% of wash sales, over 2.1M members, 514 locations. |
| Phase-1 title | kept | **rejected:** "barely pays for the movie" overclaims | **rejected:** "you forgot" (survey measures unused, not forgotten) | **rejected:** "suddenly everywhere" (no reliable site-count data) |
| Observed (API) | not in sample | 2 channels, both **below** their own median (Modern MBA 161K = 0.6×; Mr. Finance 7.4K = 0.7×) plus 5 clones | 3 clones (3–13 views); no audience video | 2 clones (50–81 views) |
| Manual saturation | HOT (CGP Grey Canada 3.6M; DeFranco 1.0M and vlogbrothers 420K, 10 months) | HOT (Business Insider 4.95M, 7 yr) | **EARLY** (CNBC 696K, 6 yr; PolyMatter 251K, 3 yr; WSJ Starbucks 2.67M adjacent) | GROWING (Bloomberg 328K, 2 yr) |
| Freshness | TIME_SENSITIVE (rounding rules still moving) | current | current | current |
| Inventory rank | 210 | 313 | **19** | 157 |
| Lens / conflict / evergreen | 75.4 / 100 / 60 | 75.4 / 78 / 76 | **79.1 / 82 / 76** | 75.6 / 50 / 68 |

## 7. Recommendation: gift cards

**First long-form documentary:** "Billions Sit on Unused Gift Cards. Who Keeps the Money?"

Why it beats the alternatives:
- **Open field with proven adjacent demand.** It is the only launch candidate with no same-angle video above 300K in the last year and no million-view incumbent. Adjacent interest is proven (WSJ's Starbucks-as-a-bank 2.67M, CNBC 696K). The movie and penny topics each face a multi-million-view incumbent, and the movie subject *underperformed* for both channels that covered it in 2026.
- **Curiosity and US reach.** About 43% of US adults hold an unused card (survey); every viewer has one in a drawer.
- **Built-in conflict.** Consumer vs retailer vs state: breakage revenue, state unclaimed-property claims and federal card rules. The narrative-conflict score is 82, against 50 for car washes.
- **Reliable sources.** Starbucks' 10-K gives the mechanism and exact dollar figures. State escheat statutes and the federal CARD Act are primary documents the research agent can fetch.
- **Visual and safe.** Cards, receipts, balance sheets and a map of state claims; low IP risk, no film footage.
- **Evergreen with a timing bonus.** Gift-card season (Nov–Jan) returns every year, and production now lands in that window.
- **Clones are arriving.** Three clone channels found the angle in the last week, which argues for moving now with a sourced, better-crafted version rather than later.

**Runner-up:** the movie ticket. It has the strongest primary evidence of the four, but competition is entrenched and observed 2026 demand is weak. **Not now:** the penny (HOT commentary space, secondary-only premise, moving legislation) and car washes (verified mechanism but no demand signal and the weakest conflict).

**What the engine still requires (gates unchanged):** `hbm-073` is `SHORT_TEST`. Before long-form it needs:
1. A research dossier that passes the gate.
2. A written competitor gap analysis covering CNBC, PolyMatter and WSJ.
3. Observed demand: none exists in this snapshot, so the designed route is a Short on the same verified facts. If the Short wins, long-form unlocks.

This report recommends the topic editorially; it does not override those gates.

## 8. Tests

- `tests/js/profitdecoded-topic-intel.test.js`: **19 new tests** covering:
  - templates and coverage rules
  - freshness (dossier, angle and contradicted cases)
  - narrative conflict and lens provenance
  - the no-reject-for-title guarantee, checked on the real inventory
  - manual vs observed saturation, and feed evidence
  - data-file integrity and the reference list
  - duration parsing, same-format baselines, and snapshot matching and supply rules
- `npm run test:profitdecoded`: **120/120 pass** (101 existing + 19 new).
- Full regression `npm test`: **437/437 JavaScript tests pass, 24/24 Python tests OK.**

## 9. YouTube API configuration (now in place)

| Item | Status |
|---|---|
| Repository secret `PD_YT_API_KEY` (YouTube Data API v3, read-only key) | present and working (run 37856970158) |
| Workflow | `.github/workflows/profitdecoded-competitors.yml`, manual dispatch only, `budget` input; keep it at or under 6,500 |
| Quota | about 5,700 units per full run (56 searches × 100 + handles + baselines); free quota is 10,000/day; run weekly |
| Local runs | `PD_YT_API_KEY=... node scripts/profitdecoded/collect-competitors.js` (without the key it exits 2 with these instructions; `--dry` shows the quota plan) |

## 10. Known gaps (for Phase 3 planning, not done here)

- **Better matching.** Topic matching is literal; an explicit `matchTerms` field per topic, or the search query that produced each video, would fix misses like Wendover/IKEA.
- **Market tagging.** The collector does not record channel country or language; non-US channels are filtered by script only.
- **Fresh observed saturation needs targeted queries.** The four launch topics were not covered by the generic discovery queries. A weekly run with topic-specific queries would give them observed readings.
- **No live re-research.** The freshness watchlist is curated by hand: it flags known events but cannot discover new ones.
- **One stale doc.** `reports/top5-manual-review.md` (2026-10-06) predates this work and was left as-is.
