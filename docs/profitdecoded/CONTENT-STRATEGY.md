# ProfitDecoded content strategy: consistency plan, 104-topic pool and 52-week calendar

Date: 2026-10-09.
Channel: "The Business Behind Everyday Life" (premium, English, faceless documentary, US-weighted).

Scope of this document:
- Phases B–F of the strategy request.
- Deliverables 4–10.

Deliverables 1–3 (the final benchmark summary, the primary model and the fallback model) are in `docs/profitdecoded/MODEL-SELECTION.md`. That decision waits for the Gemini benchmark, which is paused until the free quota resets (see §1).

How it was built:
- No paid API call, no LLM call and no new topic engine.
- The pool and the calendar come from the existing decision engine (`Decision.rank`), the inventory classification (`eligibility.inventory`), the 2026-10-08 competitor snapshot and the three research dossiers.
- The one new piece is a thin layer, `core/profitdecoded/calendar.js`, reached through `node profitdecoded.js calendar`.

## Provenance: read this before the tables

| Label | Meaning |
| --- | --- |
| **OBSERVED** | Competitor outlier evidence from the 2026-10-08 YouTube snapshot. It is evidence that a topic performed on *other* channels. It is never this channel's audience data. |
| **ESTIMATED** | Curation heuristics derived from titles: narrative conflict, angle originality, long-form potential, visual potential, evergreen value, advertiser relevance. These are useful for sorting, not proof. |
| **UNKNOWN** | No evidence either way. Unknown demand is never scored as proven demand. |
| **VERIFIED** | A research dossier whose claims were checked against primary sources and passed the research gate. Today only `hbm-073` (gift cards) qualifies. |

Every thesis in this document except the gift-card one is a **hypothesis**. No figure, date or claim reaches a script until the topic's dossier passes the research gate.

## Deliverable index

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | Final benchmark summary | `MODEL-SELECTION.md`, pending the Gemini run (§1) |
| 2 | Primary storytelling model | `MODEL-SELECTION.md`, pending |
| 3 | Fallback model | `MODEL-SELECTION.md`, pending |
| 4 | Consistency evaluation plan | §2 |
| 5 | 104-topic pool (52 + 52) | §3 and Appendix A |
| 6 | 52-week calendar | §4 |
| 7 | Detailed plan for weeks 1–12 | §5 |
| 8 | Monthly replenishment strategy | §7 |
| 9 | Readiness classification | §6 |
| 10 | Blockers and next steps | §9 |

## 1. Phase A status: model selection is waiting for measured Gemini results

The instruction was: "If the Gemini benchmark is still running or paused, do not interrupt or duplicate it. Wait for its results before making a final decision." The benchmark is paused, so no final model decision is made here.

**What has been measured** (no invented scores):

| Item | Claude Opus 5.5 (A) | Groq GPT-OSS 120B (B) | Gemini 3.7 Flash (C) |
| --- | --- | --- | --- |
| Script exists | Yes (`story-tests/hbm-073-gift-cards-long-claude`) | Yes (`…-free-models`) | **Not yet** |
| Words | 1,098 | 1,143 | – |
| Deterministic factual findings | 0 | 24 | – |
| Figures repeated across sections | 0 | 12 | – |
| Spoken-language reading | 97 | 91 | – |
| Earlier blind Gemini evaluation (MODEL-BENCHMARK.md) | 9.08 / 10 | 2.83 / 10 | – |

**Why C is missing:**
- Run 37958796165 (free tier, `gemini-3.7-flash`) first hit an HTTP 503 overload at the plan stage.
- On re-run it hit the **daily free quota** for that model.
- Per the rule "if free-tier quota is exhausted, pause safely", it paused. No paid tier was used.
- The Gemini quota resets at midnight Pacific (07:00 UTC).

**What happens after the reset:**
1. One generation run on the throwaway bench branch.
2. A blinded three-way evaluation. Scripts are relabelled X/Y/Z with identical formatting and checked for identity leaks.
3. A Groq judge scores each script alone.
4. A Gemini judge model that is **not** the writer scores all three, in both orders.
5. The deterministic checks and a manual source check of C.
6. `MODEL-SELECTION.md` records the result.

**The decision rule, fixed in advance:**
- Factual accuracy is mandatory.
- If Gemini matches Claude's quality, Gemini is preferred, because its cost is $0 on the free tier.
- If Gemini is materially worse, Claude is preferred.
- Production defaults are not switched without the owner's approval.

**Cost per four documentaries a month** (from `MODEL-BENCHMARK.md` and verified list prices; 1.3 attempts per accepted script):

| Writer | Expected | High |
| --- | --- | --- |
| Claude Opus 5.5 | $3.62 | $8.89 |
| Claude Sonnet 5.5 | $1.82 | $4.46 |
| Gemini 3.7 Flash, paid | $0.67 | $1.66 |
| Gemini free tier | $0 | $0 |

The Gemini free tier has quota risk: the limits are unpublished and per project.

## 2. Phase B: consistency evaluation plan (deliverable 4)

One good script on one topic does not prove the channel can produce good scripts every week. Consistency will not be claimed until scripts from **at least three different categories** have been evaluated with the method below. The gift-card result alone counts as one data point.

### 2.1 Five representative topics

Each topic is drawn from the calendar, so the test work becomes production work.

| Category | Representative topic | Calendar slot | Required dossier (primary sources) | Factual risk | Narrative complexity | Visual requirements |
| --- | --- | --- | --- | --- | --- | --- |
| **Everyday economics** | Billions Sit on Unused Gift Cards. Who Keeps the Money? (`hbm-073`) | Week 1 | **Exists, verified.** Starbucks FY2025 10-K, Darden FY2026 10-K, CFPB Regulation E gift-card rule, Bankrate/YouGov 2024 survey | Low (dossier verified, arithmetic checked) | Medium: one question, three claimants (issuer, holder, state) | Balance counters, filing excerpts, breakage money flow, three-claimant panel |
| **Company failure** | The Year JCPenney Stopped Running Sales (`pp-017`) | Week 12 | J. C. Penney 10-Ks and earnings releases for FY2011–FY2013; the company's statements announcing and reversing the pricing strategy; dated press coverage only as secondary | Medium: causation (pricing vs other factors) must stay as the filings frame it | High: decision → rollout → results → reversal, a chronology with a turn | Strategy timeline, sales-trend chart from filings, before/after price-tag graphics. No copyrighted ad footage. |
| **Consumer psychology** | Why Costco Won't Touch the Price of Its Hot Dog (`pp-037`) | Week 4 | Costco FY2025 10-K (membership fees vs operating income: one claim already verified in dossier `cs-001`); dated, attributed executive statements on the food-court price | Medium: price-history claims need dated sources; no profit or loss claim on the hot dog unless Costco states it | Medium: a single price as a signal of value | Price-over-time line, membership-fee vs operating-income bars, store-traffic diagram |
| **Technology business models** | Why Console Makers Can Sell Hardware at a Loss (`hbm-031`) | Week 6 | Sony Group annual report (Game & Network Services segment), Microsoft 10-K (gaming), public exhibits and testimony from FTC v. Microsoft | Medium: per-unit loss figures only where a filing or sworn testimony states them | Medium-High: platform economics across two companies | Hardware vs software revenue stack, razor-and-blades diagram, subscription chart |
| **Financial mechanisms** | How Interchange Fees Make Cards Expensive for Stores (backup, week 8) | Week 8 backup | Federal Reserve Regulation II interchange fee and revenue reports; the Durbin amendment text; Visa and Mastercard published US interchange rate schedules | Medium-High: rate tables are complex and change; every rate dated | High: an abstract mechanism with no single protagonist; needs a concrete purchase as the spine | Money flow for one $100 purchase, rate-table excerpts, regulated vs unregulated comparison |

Alternate topic for consumer psychology: "How Dark Patterns Make You Click Yes" (week 29), using the FTC's 2022 staff report "Bringing Dark Patterns to Light" as the primary source.

### 2.2 Method

1. **Dossier first.** For each topic, build the dossier and pass `Research.gate` (calc, entity and attribution checks) **before** any script is written. A topic whose dossier cannot reach two primary sources is replaced by its backup; it is not written from weak evidence.
2. **Reuse what exists.** The gift-card topic already has three scripts: Claude, Groq, and Gemini once the run completes. No new gift-card script is generated for the consistency test.
3. **Generation with the selected primary model.**
   - If the primary is a free model, generation costs nothing beyond quota.
   - If the primary is Claude, each script is a separate paid experiment. That means a single-use approval PR, a $2 per-script cap, and the experiment pool.
   - Scripts are **never generated automatically in a batch**.
4. **The same evaluation for every script:**
   - deterministic gates (`story-review`);
   - a manual claim-by-claim source check against the dossier;
   - two blind judges that are not the writer, with the 8-criterion rubric from the benchmark: hook, storytelling, curiosity, structure, naturalness, pacing, accuracy, visual.
5. **Record per script:** model, tokens, cost, the number of rewrites, and whether it passed on the first attempt.

### 2.3 Metrics and pass thresholds

| Metric | Definition | Pass threshold |
| --- | --- | --- |
| Average quality | Mean blind weighted score across topics (0–10) | ≥ 8.0 |
| Worst-case quality | Lowest blind weighted score of any topic | ≥ 7.0 |
| Variance | Standard deviation of the weighted score across topics | ≤ 0.75 |
| Factual error rate | High-severity errors (wrong figure, wrong attribution, invented fact) per script, from the manual source check | 0 high; ≤ 1 medium per script |
| First-pass acceptance | Share of scripts that pass every gate without a rewrite | ≥ 60% |
| Rewrite count | Rewrites per accepted script | ≤ 1 (the pipeline's hard cap) |
| Cost per accepted script | Total spend ÷ accepted scripts, including failed attempts | ≤ $2 (hard); target ≤ $1 |

Consistency is reported for the categories actually tested. If only two categories have scripts, the report says "two of five tested", not "consistent".

### 2.4 Budget fit

Today's experiment pool allows **$2 a month**. At Claude Opus 5.5's expected cost of about $0.70 per script, one paid experiment fits per month. The four new categories would then take up to four months on Claude.

Doing them sooner needs an explicit owner decision to raise the experiment pool within the $8 monthly script budget. This document does not change the pool. With a free primary model, the plan is limited only by quota and research time.

## 3. Phase C: the 104-topic pool (deliverable 5)

### 3.1 Standards

A topic enters the pool only if it meets every standard below (`Cal.STANDARDS`, tested).

| Standard | Rule | Signal type |
| --- | --- | --- |
| Not blocked | Not EXCLUDE in the inventory (decision engine, freshness, duplicate) | Mixed |
| 8–12 minute potential | Long-form allowed and long-form potential ≥ 80 | ESTIMATED |
| Storytelling potential | Narrative conflict ≥ 60, or evidence override | ESTIMATED |
| Broad audience | Broad appeal ≥ 70 | ESTIMATED |
| Differentiated angle | Angle originality ≥ 60, or evidence override | ESTIMATED |
| Visual feasibility | Visual potential ≥ 60 and copyright risk ≤ 60 | ESTIMATED |
| Advertiser relevance | ≥ 60 | ESTIMATED |
| Evergreen value | ≥ 55 | ESTIMATED |
| Competitive opportunity | Not observed HOT or SATURATED | OBSERVED where available |
| US relevance | US focus and a central question | ESTIMATED |

**Evidence override.** Narrative conflict and angle originality are read from titles. A topic with **observed** competitor demand ≥ 60 that is not observed-saturated may enter even when those title readings are low. It is then flagged **⚑ ANGLE_REQUIRED**: the working title and angle must be rewritten before research, as weeks 2, 3 and 5–10 already are. Generic "How X Makes Money" titles are also flagged.

**One subject per year.** A lower-ranked candidate is dropped when it repeats a kept topic's subject. That means one of the following:
- at least 50% of subject terms shared;
- three subject terms shared;
- the same named company where either topic is a company story;
- the same named company in the same pillar and cluster.

16 duplicates were removed (Appendix B).

### 3.2 Funnel: how many topics actually qualify

| Step | Topics |
| --- | --- |
| Topic universe | 594 |
| Fail the first standard they miss | −448 (blocked 12; long-form potential 262; storytelling 96; angle 69; broad appeal 1; advertiser 4; evergreen 4) |
| Meet all standards | 146 |
| Duplicate subjects removed | −16 |
| **Candidates meeting the standards** | **130** |
| Selected: 52 primary + 52 backup | 104 |
| Left in reserve (meet the standards, ranked below 104) | 26 |

130 topics meet the standards, so the 104 slots are filled without lowering them. That statement needs a caveat:
- The standards rest mostly on **estimated** signals.
- Only **19 of the 104** have any observed evidence: 1 verified, and 18 with observed competitor demand.
- 85 have **unknown** demand.

The pool is a ranked list of plausible topics, **not** a list of proven ones. It is not production-ready.

### 3.3 Pool composition

| | Primary (52) | Backup (52) | Pool (104) |
| --- | --- | --- | --- |
| VERIFIED | 1 | 0 | 1 |
| RESEARCH_REQUIRED (observed demand, dossier needed) | 12 | 6 | 18 |
| DEMAND_UNVERIFIED (no observed demand, dossier needed) | 39 | 46 | 85 |
| SATURATED (observed HOT or SATURATED) | not admitted | not admitted | 0 (13 in the universe) |
| BLOCKED (excluded) | not admitted | not admitted | 0 (12 in the universe) |

Primary topics by category:
- Consumer Brands & Business Stories: 16
- Hidden Economics of Everyday Life: 12
- Technology Business Models: 9
- Business Failures & Comebacks: 9
- Pricing Psychology & Hidden Fees: 6

Limits used: at least 6 and at most 16 per category, and at most 3 per cluster.

Primary topics by production difficulty: Low 1, Medium 47, High 4. Difficulty combines copyright risk, factual risk, production risk, visual potential and regulatory or legal subject matter; verified research lowers it.

11 pool topics carry ⚑ ANGLE_REQUIRED. The full ranked list is in Appendix A.

## 4. Phase D: the 52-week calendar (deliverable 6)

The calendar starts on the week of 2026-11-02, a Monday. It is generated by `node profitdecoded.js calendar --start 2026-11-02` and stored in `channels/profitdecoded/reports/content-calendar.json`.

Scheduling rules (tested):
- Weeks 1–12 take evidence first: the verified topic in week 1, then observed-demand topics.
- Seasonal topics are placed in their months and held out of season:
  - gift cards in the holiday season (week 1);
  - the Super Bowl ad topic in February (week 14).
- No category runs two weeks in a row.
- No cluster repeats within 3 weeks.
- No subject entity (a company or an industry) repeats within 8 weeks.
- Each week has its own backup from the same category and, where possible, a different cluster. No backup is used twice.
- Weeks 13–52 are **provisional**. They are reassessed monthly (§7) as evidence arrives, so the later weeks will change.

Columns:
- "Research confidence" is the evidence class.
- "Competitive evidence" is observed demand and saturation from the snapshot. "unknown / no data" means none was observed, not that there is none.
- Thesis, hook and audience for weeks 1–12 are in §5. For weeks 13–52 they are written when the topic enters the 12-week window.
- Titles in weeks 13–52 are inventory titles. They are rewritten, and ⚑ titles must be, before research.

| Wk | Week of | Category | Cluster | Primary (working title) | Backup | Research confidence | Competitive evidence | Evergreen / seasonal | Difficulty |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-11-02 | Consumer Brands & Business Stories | banks-cards | Billions Sit on Unused Gift Cards. Who Keeps the Money? | Why Dollar Tree Raised Prices Above a Dollar | VERIFIED | unknown / EARLY (inferred) | Seasonal: holiday shopping | Low |
| 2 | 2026-11-09 | Hidden Economics of Everyday Life | coffee-beverages | Why an Energy Drink Company Spends Like a Media Company ⚑ | Why Banks Pay You Nothing for Your Savings | RESEARCH_REQUIRED | 99 (observed) / GROWING (observed) | Evergreen | Medium |
| 3 | 2026-11-16 | Consumer Brands & Business Stories | luxury-fashion | Why a Used Watch Can Cost More Than a New One ⚑ | How Enron Hid Its Losses | RESEARCH_REQUIRED | 83 (observed) / GROWING (observed) | Evergreen | High |
| 4 | 2026-11-23 | Pricing Psychology & Hidden Fees | grocery-retail | Why Costco Won't Touch the Price of Its Hot Dog | How Credit Card Interest Compounds Against You | RESEARCH_REQUIRED | 18 (observed) / EARLY (observed) | Evergreen | Medium |
| 5 | 2026-11-30 | Consumer Brands & Business Stories | furniture-home | Why IKEA Sells Meatballs ⚑ | How Target Became Where You Go for More Than Toilet Paper | RESEARCH_REQUIRED | 93 (observed) / GROWING (observed) | Evergreen | Medium |
| 6 | 2026-12-07 | Technology Business Models | gaming | Why Console Makers Can Sell Hardware at a Loss ⚑ | How Broadcasting Rights Shape What You Pay for Sports | RESEARCH_REQUIRED | 73 (observed) / GROWING (observed) | Evergreen | Medium |
| 7 | 2026-12-14 | Consumer Brands & Business Stories | fast-food | Who Really Pays for a Subway Restaurant? ⚑ | Who Actually Pays for Your Free Credit Score | RESEARCH_REQUIRED | 88 (observed) / GROWING (observed) | Evergreen | Medium |
| 8 | 2026-12-21 | Hidden Economics of Everyday Life | luxury-fashion | Why Sneaker Drops Are Designed to Sell Out ⚑ | How Interchange Fees Make Cards Expensive for Stores | RESEARCH_REQUIRED | 95 (observed) / GROWING (observed) | Evergreen | High |
| 9 | 2026-12-28 | Consumer Brands & Business Stories | travel-hotels | Who Sets the Price on Airbnb, and Who Collects the Fees? ⚑ | How Domino's Became a Technology Company | RESEARCH_REQUIRED | 75 (observed) / GROWING (observed) | Evergreen | Medium |
| 10 | 2027-01-04 | Hidden Economics of Everyday Life | entertainment-venues | The One NFL Team That Shows Its Books ⚑ | Why Bananas Are So Cheap | RESEARCH_REQUIRED | 65 (observed) / GROWING (observed) | Evergreen | High |
| 11 | 2027-01-11 | Consumer Brands & Business Stories | autos | Ford's Real Business Is Trucks | Why Airports Make Money From Shops Not Flights | RESEARCH_REQUIRED | 46 (observed) / EARLY (observed) | Evergreen | Medium |
| 12 | 2027-01-18 | Business Failures & Comebacks | online-shopping | The Year JCPenney Stopped Running Sales | How Sears Collapsed | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 13 | 2027-01-25 | Consumer Brands & Business Stories | fast-food | How Chipotle Prices Its Burritos ⚑ | Why Beef Prices Keep Rising | RESEARCH_REQUIRED | 65 (observed) / DECLINING (observed) | Evergreen | Medium |
| 14 | 2027-02-01 | Hidden Economics of Everyday Life | entertainment-venues | Why the Super Bowl Ad Costs What It Does | Why Chocolate Is Cheap While Cocoa Farmers Stay Poor | DEMAND_UNVERIFIED | unknown / no data | Seasonal: Super Bowl | Medium |
| 15 | 2027-02-08 | Business Failures & Comebacks | banks-cards | How Silicon Valley Bank Failed in Days | Why Retail Chains Go Bankrupt When They Look Busy | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 16 | 2027-02-15 | Consumer Brands & Business Stories | online-shopping | How Amazon Prime Pays for Itself | How Whole Foods Changed After Amazon | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 17 | 2027-02-22 | Hidden Economics of Everyday Life | grocery-retail | Why Some Companies Lose Money on Their Most Popular Product | Why Chicken Sandwiches Started a War | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 18 | 2027-03-01 | Pricing Psychology & Hidden Fees | luxury-fashion | Why Luxury Brands Destroy Unsold Products | How Lehman Brothers Collapsed | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 19 | 2027-03-08 | Hidden Economics of Everyday Life | banks-cards | How Credit Card Rewards Are Paid For | Why Airlines Overbook Flights on Purpose | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Evergreen | Medium |
| 20 | 2027-03-15 | Business Failures & Comebacks | streaming-media | Why Blockbuster Failed | How Credit Suisse Collapsed | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 21 | 2027-03-22 | Consumer Brands & Business Stories | coffee-beverages | How Starbucks Makes More From Cups Than Coffee | Why Luxury Brands Don't Hold Sales | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 22 | 2027-03-29 | Business Failures & Comebacks | grocery-retail | Why Toys R Us Collapsed | How Quibi Lost 1.75 Billion | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 23 | 2027-04-05 | Technology Business Models | tech-platforms | How Wikipedia Stays Alive Without Ads | Why Vinyl Records Are Back | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 24 | 2027-04-12 | Business Failures & Comebacks | payments-fintech | How FTX Lost Customer Money | How Lego Almost Went Bankrupt | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 25 | 2027-04-19 | Technology Business Models | streaming-media | Why Netflix Ended Password Sharing | How Fitbit Disappeared | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 26 | 2027-04-26 | Business Failures & Comebacks | housing-realestate | How WeWork Lost Billions | Why Checked Bags Became So Expensive | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 27 | 2027-05-03 | Pricing Psychology & Hidden Fees | autos | Why Used Car Prices Jumped | Why Eggs Cost What They Do | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 28 | 2027-05-10 | Consumer Brands & Business Stories | online-shopping | How Amazon Became a Logistics Company | Why Dunkin Sold Coffee Not Donuts | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 29 | 2027-05-17 | Pricing Psychology & Hidden Fees | subscriptions | How Dark Patterns Make You Click Yes | Why Business Class Seats Exist at All | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 30 | 2027-05-24 | Hidden Economics of Everyday Life | travel-hotels | Why Ski Resorts Sell Cheap Season Passes | Why Economy Seats Keep Shrinking | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 31 | 2027-05-31 | Technology Business Models | tech-platforms | Why Free Apps Are Never Really Free | How Barnes and Noble Came Back | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 32 | 2027-06-07 | Consumer Brands & Business Stories | airlines | Why Spirit Airlines Can Charge for Carry-Ons | Why Coffee Is Cheaper Than It Should Be | RESEARCH_REQUIRED | 15 (observed) / EARLY (observed) | Evergreen | Medium |
| 33 | 2027-06-14 | Business Failures & Comebacks | autos | How Boeing Lost Its Way | Why Wings Cost More Than They Used To | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Evergreen | Medium |
| 34 | 2027-06-21 | Consumer Brands & Business Stories | fast-food | Why McDonald's Ice Cream Machines Break | Why Landlords Prefer Empty Apartments | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 35 | 2027-06-28 | Technology Business Models | gaming | How Free-to-Play Games Make Billions | Why Netflix Produces So Many Shows | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 36 | 2027-07-05 | Consumer Brands & Business Stories | insurance-warranties | How Extended Warranties Became Retail's Best Profit Center | Why Dollar Stores Open in Poor Areas | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 37 | 2027-07-12 | Hidden Economics of Everyday Life | airlines | Why Airlines Sometimes Prefer Empty Seats | Why Cheap Chicken Is So Cheap | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 38 | 2027-07-19 | Technology Business Models | streaming-media | Why Music Streaming Pays So Little per Stream | Why Steam Takes a Cut of Every Game | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 39 | 2027-07-26 | Hidden Economics of Everyday Life | housing-realestate | Why Houses Cost So Much | Why Online Banks Offer Higher Rates | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 40 | 2027-08-02 | Technology Business Models | electronics-printers | How Kodak Missed Digital | How GoPro Fell | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 41 | 2027-08-09 | Business Failures & Comebacks | telecom | How Nokia Lost the Phone Market | Why Planes Fly Slower Than They Could | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 42 | 2027-08-16 | Hidden Economics of Everyday Life | insurance-warranties | How Auto Insurance Prices Your Risk | Why Movie Budgets Are Sometimes Cheaper Than Marketing | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 43 | 2027-08-23 | Consumer Brands & Business Stories | coffee-beverages | Why Starbucks Opens Stores Near Each Other | Why Costco's Gas Prices Are Low | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 44 | 2027-08-30 | Technology Business Models | gig-economy | How Uber Spent Billions Before Making Money | Why Avocados Cost What They Do | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 45 | 2027-09-06 | Business Failures & Comebacks | telecom | How BlackBerry Lost Everything | Why Colleges Build Luxury Dorms | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 46 | 2027-09-13 | Consumer Brands & Business Stories | airlines | Why Airlines Keep Making Economy Class Worse | How Stanley Cups Became a Craze | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 47 | 2027-09-20 | Pricing Psychology & Hidden Fees | entertainment-venues | Why Disney Parks Keep Raising Prices | Why Seat Selection Costs Extra | DEMAND_UNVERIFIED | unknown / no data | Evergreen | High |
| 48 | 2027-09-27 | Hidden Economics of Everyday Life | housing-realestate | Why Starter Homes Disappeared | Why Hollywood Accounting Makes Hits Look Like Losses | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 49 | 2027-10-04 | Technology Business Models | telecom | How Your Phone Plan Is Priced | Why Rent Keeps Going Up | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 50 | 2027-10-11 | Consumer Brands & Business Stories | pets | How Pets.com Burned Through Money | How GE Fell Apart | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 51 | 2027-10-18 | Hidden Economics of Everyday Life | beauty | Why Cheap Razors Cost Less Than Replacement Blades | Why Banks Close Branches Yet Keep Opening Some | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |
| 52 | 2027-10-25 | Pricing Psychology & Hidden Fees | subscriptions | How Cancel Buttons Became Hard to Find | Why College Sports Make Money Without Paying Players | DEMAND_UNVERIFIED | unknown / no data | Evergreen | Medium |

## 5. Weeks 1–12 in detail (deliverable 7)

Every thesis below is labelled HYPOTHESIS, except week 1's. Sources listed are the ones to verify; they have not been checked yet, except week 1's. Each week's fallback is its backup topic: if the dossier cannot reach two primary sources or the premise fails the freshness check, the backup moves up.

### Week 1 (2026-11-02): Billions Sit on Unused Gift Cards. Who Keeps the Money?

| Field | Plan |
|---|---|
| Primary topic | `hbm-073-how-gift-cards-make-money-for-retailers` (VERIFIED) |
| Backup | Why Dollar Tree Raised Prices Above a Dollar (`se-090-why-dollar-tree-raised-prices-above-a-dollar`, RESEARCH_REQUIRED) |
| Central hook | Somewhere in a drawer, there's a gift card with money still on it. If it's never spent, who ends up with that money? |
| Thesis | An unused balance on a non-expiring card stays spendable, but issuers estimate from their own history how much will not be redeemed and book that share as revenue gradually; unclaimed-property laws may send part to government agencies; federal rules block the quickest ways of taking it (verified dossier hbm-073). |
| Audience | US adults who give or hold gift cards; holiday shoppers |
| Category / cluster | Consumer Brands & Business Stories / banks-cards |
| Evergreen / seasonal | Seasonal: holiday shopping |
| Competitive evidence | demand unknown; saturation EARLY (inferred) |
| Sources (verified in the dossier) | Starbucks FY2025 10-K; Darden FY2026 10-K; CFPB Regulation E gift-card rule; Bankrate/YouGov 2024 survey |
| Factual risk | Low (dossier verified; arithmetic checked; attribution rules in place) |
| Visual plan | Card balance counters, filing excerpts, money-flow of breakage, three-claimant comparison panel |
| Difficulty | Low |
| Status | Script exists (session-written, gates passed except packaging + one heuristic opening reading); timed for the holiday gift-card season |

### Week 2 (2026-11-09): Why an Energy Drink Company Spends Like a Media Company

| Field | Plan |
|---|---|
| Primary topic | `hbm-175-how-energy-drinks-make-money` (RESEARCH_REQUIRED) |
| Backup | Why Banks Pay You Nothing for Your Savings (`se-058-why-banks-pay-you-nothing-for-your-savings`, DEMAND_UNVERIFIED) |
| Central hook | One energy drink brand owns sports teams, events and a media house. What is it actually selling? |
| Thesis | HYPOTHESIS: leading energy drink brands earn their margin on brand and distribution rather than manufacturing; the public-company case (outsourced production, bottler distribution) can be documented from filings, the private one only from its own releases. |
| Audience | US adults 18-44; sports and gaming viewers |
| Category / cluster | Hidden Economics of Everyday Life / coffee-beverages |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 99 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Monster Beverage 10-K (manufacturing, distribution agreements, segment results); Red Bull GmbH annual sales releases (private: company statements only) |
| Factual risk | Medium: the private company's finances are self-reported; keep claims to what each source states |
| Visual plan | Can-cost breakdown, distribution map, sponsorship timeline, filing excerpts |
| Difficulty | Medium |

### Week 3 (2026-11-16): Why a Used Watch Can Cost More Than a New One

| Field | Plan |
|---|---|
| Primary topic | `se-024-why-rolex-watches-appreciate` (RESEARCH_REQUIRED) |
| Backup | How Enron Hid Its Losses (`cs-031-how-enron-hid-its-losses`, DEMAND_UNVERIFIED) |
| Central hook | Walk into a dealer and the watch you want isn't available. Walk across the street and it is, for more. Why? |
| Thesis | HYPOTHESIS: controlled supply, allocation lists and a secondary market create prices above retail; how far this holds today must be checked against current market data. |
| Audience | US adults 25-54 interested in luxury, collecting and investing |
| Category / cluster | Consumer Brands & Business Stories / luxury-fashion |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 83 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Federation of the Swiss Watch Industry export statistics; Brand statements on production and authorised dealers; Secondary-market price indices (secondary source: label as such) |
| Factual risk | High: private company, no filings; price claims move quickly; avoid naming prices without dated sources |
| Visual plan | Retail vs secondary price chart (dated), supply funnel, dealer-allocation diagram |
| Difficulty | High |
| Fallback rule | If the research gate cannot reach two primary sources, promote the backup |

### Week 4 (2026-11-23): Why Costco Won't Touch the Price of Its Hot Dog

| Field | Plan |
|---|---|
| Primary topic | `pp-037-why-costcos-food-court-hot-dog-never-changed-pri` (RESEARCH_REQUIRED) |
| Backup | How Credit Card Interest Compounds Against You (`mt-025-how-credit-card-interest-compounds-against-you`, DEMAND_UNVERIFIED) |
| Central hook | The cheapest thing at Costco may be the most strategic. Why would a company refuse to raise one price for decades? |
| Thesis | HYPOTHESIS: the food-court price works as a signal of value that supports the membership model; Costco's own filings show how much of its operating income comes from membership fees (cs-001 dossier has a verified claim on this). |
| Audience | US Costco shoppers and members; adults 25-64 |
| Category / cluster | Pricing Psychology & Hidden Fees / grocery-retail |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 18 (observed); saturation EARLY (observed) |
| Sources to verify | Costco FY2025 10-K (membership fees, operating income) - partly verified in dossier cs-001; Costco executive statements on the food-court price (dated, attributed) |
| Factual risk | Medium: price-history claims need dated sources; keep loss/profit claims to what Costco states |
| Visual plan | Price-over-time line, membership-fee vs operating-income bars, store-traffic diagram |
| Difficulty | Medium |

### Week 5 (2026-11-30): Why IKEA Sells Meatballs

| Field | Plan |
|---|---|
| Primary topic | `hbm-129-how-ikea-makes-money-from-meatballs-and-candles` (RESEARCH_REQUIRED) |
| Backup | How Target Became Where You Go for More Than Toilet Paper (`cs-018-how-target-became-where-you-go-for-more-than-toi`, RESEARCH_REQUIRED) |
| Central hook | A furniture company sells millions of meatballs. Is the restaurant really about food? |
| Thesis | HYPOTHESIS: food service and small add-on items keep visitors in the store longer and raise what they spend; the size of the food business can be sourced from the group's own reporting. |
| Audience | US adults who shop at IKEA; home and design viewers |
| Category / cluster | Consumer Brands & Business Stories / furniture-home |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 93 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Ingka Group / Inter IKEA annual summaries (food revenue, visits); IKEA store-layout statements and patents where public |
| Factual risk | Medium: 'keeps shoppers longer' needs a documented source, not assumption |
| Visual plan | Store floor-plan path, food revenue chart, basket diagram |
| Difficulty | Medium |

### Week 6 (2026-12-07): Why Console Makers Can Sell Hardware at a Loss

| Field | Plan |
|---|---|
| Primary topic | `hbm-031-how-video-game-consoles-make-money-while-being-s` (RESEARCH_REQUIRED) |
| Backup | How Broadcasting Rights Shape What You Pay for Sports (`hbm-047-how-broadcasting-rights-shape-what-you-pay-for-s`, DEMAND_UNVERIFIED) |
| Central hook | The console under your TV may have been sold at a loss. So where does the money come from? |
| Thesis | HYPOTHESIS: platform holders recover hardware losses through games, platform fees and subscriptions; segment reporting and public court filings document the economics. |
| Audience | US gamers 16-44; tech and business viewers |
| Category / cluster | Technology Business Models / gaming |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 73 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Sony Group annual report (Game & Network Services segment); Microsoft 10-K (gaming revenue); Public filings from FTC v. Microsoft (testimony on console margins) |
| Factual risk | Medium: per-unit loss figures only where a filing or sworn testimony states them |
| Visual plan | Hardware vs software revenue stack, razor-and-blades diagram, subscription growth chart |
| Difficulty | Medium |

### Week 7 (2026-12-14): Who Really Pays for a Subway Restaurant?

| Field | Plan |
|---|---|
| Primary topic | `hbm-022-how-subway-makes-money-on-sandwiches-it-doesnt-o` (RESEARCH_REQUIRED) |
| Backup | Who Actually Pays for Your Free Credit Score (`hbm-012-who-actually-pays-for-your-free-credit-score`, DEMAND_UNVERIFIED) |
| Central hook | Subway owns almost none of its restaurants. So who pays for them, and who gets paid? |
| Thesis | HYPOTHESIS: the franchisor earns royalties and advertising fees on franchisee sales while franchisees carry the costs; the exact fees are published in the Franchise Disclosure Document. |
| Audience | US adults; small-business and franchise-curious viewers |
| Category / cluster | Consumer Brands & Business Stories / fast-food |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 88 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Subway Franchise Disclosure Document (state filings, e.g. Wisconsin/California registries); Company statements on restaurant counts |
| Factual risk | Medium: fees and counts change by year; cite the FDD year |
| Visual plan | Money-flow from one sandwich to franchisor/franchisee, FDD excerpts, store-count chart |
| Difficulty | Medium |

### Week 8 (2026-12-21): Why Sneaker Drops Are Designed to Sell Out

| Field | Plan |
|---|---|
| Primary topic | `hbm-101-how-sneakers-make-money-from-resale-hype` (RESEARCH_REQUIRED) |
| Backup | How Interchange Fees Make Cards Expensive for Stores (`hbm-072-how-interchange-fees-make-cards-expensive-for-st`, DEMAND_UNVERIFIED) |
| Central hook | Some sneakers sell out in minutes and resell for far more. Who benefits from the shortage? |
| Thesis | HYPOTHESIS: limited releases build brand heat that supports full-price sales elsewhere, while resale platforms capture fees on the secondary market; brand filings and platform disclosures bound what can be said. |
| Audience | US sneaker fans 16-34; streetwear and resale viewers |
| Category / cluster | Hidden Economics of Everyday Life / luxury-fashion |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 95 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Nike 10-K (direct-to-consumer, demand creation); Resale platform disclosures (fees; label private-company data as self-reported) |
| Factual risk | High: resale-market sizes are often estimates; attribute every figure |
| Visual plan | Release-day timeline, retail vs resale price comparison (dated), fee waterfall |
| Difficulty | High |

### Week 9 (2026-12-28): Who Sets the Price on Airbnb, and Who Collects the Fees?

| Field | Plan |
|---|---|
| Primary topic | `hbm-037-how-airbnb-makes-money-when-hosts-set-the-price` (RESEARCH_REQUIRED) |
| Backup | How Domino's Became a Technology Company (`hbm-023-how-dominos-became-a-technology-company`, RESEARCH_REQUIRED) |
| Central hook | The host sets the nightly rate. So why is the total at checkout so different? |
| Thesis | HYPOTHESIS: the platform earns service fees from guests and/or hosts and a take rate on bookings, while hosts carry cleaning and pricing decisions; the 10-K documents the fee model and its changes. |
| Audience | US travellers 25-54; hosts and would-be hosts |
| Category / cluster | Consumer Brands & Business Stories / travel-hotels |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 75 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Airbnb 10-K (revenue recognition, fee structure, take rate); Airbnb fee-policy announcements (dated) |
| Factual risk | Low-Medium: fee rules changed over time; date every rule |
| Visual plan | Checkout receipt breakdown, money-flow host/guest/platform, policy timeline |
| Difficulty | Medium |

### Week 10 (2027-01-04): The One NFL Team That Shows Its Books

| Field | Plan |
|---|---|
| Primary topic | `hbm-046-how-sports-teams-make-money-even-when-they-lose` (RESEARCH_REQUIRED) |
| Backup | Why Bananas Are So Cheap (`se-034-why-bananas-are-so-cheap`, DEMAND_UNVERIFIED) |
| Central hook | Most NFL teams never publish their finances. One does. What do its numbers say about losing seasons? |
| Thesis | HYPOTHESIS: shared national revenue keeps team income steady regardless of results; the Green Bay Packers' published annual financials document the national revenue share. |
| Audience | US sports fans 18-54 |
| Category / cluster | Hidden Economics of Everyday Life / entertainment-venues |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 65 (observed); saturation GROWING (observed); ANGLE_REQUIRED (entered on observed demand; the title-derived angle signals are low) |
| Sources to verify | Green Bay Packers annual financial report (publicly released); League statements on revenue sharing |
| Factual risk | Medium: one team's books cannot be generalised to all; say so |
| Visual plan | Revenue-source stack from the Packers report, win-loss vs revenue chart, revenue-sharing diagram |
| Difficulty | High |

### Week 11 (2027-01-11): Ford's Real Business Is Trucks

| Field | Plan |
|---|---|
| Primary topic | `cs-047-how-ford-makes-more-from-trucks-than-cars` (RESEARCH_REQUIRED) |
| Backup | Why Airports Make Money From Shops Not Flights (`se-016-why-airports-make-money-from-shops-not-flights`, DEMAND_UNVERIFIED) |
| Central hook | Ford sells cars, trucks and electric vehicles. Only some of them make money. Which? |
| Thesis | HYPOTHESIS: segment reporting shows where Ford's profits and losses sit (commercial and combustion businesses vs electric); the 10-K segments document it. |
| Audience | US adults 25-64; truck owners and auto fans |
| Category / cluster | Consumer Brands & Business Stories / autos |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand 46 (observed); saturation EARLY (observed) |
| Sources to verify | Ford 10-K segment results (Ford Blue, Ford Model e, Ford Pro); Ford earnings releases |
| Factual risk | Low-Medium: segment definitions change; cite fiscal years |
| Visual plan | Segment EBIT bars, product-mix chart, F-Series vs EV unit chart |
| Difficulty | Medium |

### Week 12 (2027-01-18): The Year JCPenney Stopped Running Sales

| Field | Plan |
|---|---|
| Primary topic | `pp-017-why-jcpenney-lost-customers-when-it-stopped-runn` (DEMAND_UNVERIFIED) |
| Backup | How Sears Collapsed (`cs-034-how-sears-collapsed`, DEMAND_UNVERIFIED) |
| Central hook | A retailer decided to stop running sales and simply charge fair prices. What happened next? |
| Thesis | HYPOTHESIS: the end of constant promotions coincided with a sharp drop in sales; filings and earnings calls from that period document the decline and the reversal. |
| Audience | US shoppers 25-64; marketing and pricing-psychology viewers |
| Category / cluster | Business Failures & Comebacks / online-shopping |
| Evergreen / seasonal | Evergreen |
| Competitive evidence | demand unknown; saturation no data |
| Sources to verify | J. C. Penney 10-K and earnings releases for the fiscal years around the pricing change; Company statements announcing and reversing the strategy |
| Factual risk | Medium: causation (pricing vs other factors) must stay as the filings frame it |
| Visual plan | Sales-trend chart, before/after price tag graphics, strategy timeline |
| Difficulty | Medium |


## 6. Readiness classification (deliverable 9)

**The inventory** (`node profitdecoded.js readiness`, 594 topics):

| Tier | Topics | Meaning |
| --- | --- | --- |
| PRODUCTION_READY | 1 | Verified dossier, eligible: gift cards (`hbm-073`) |
| RESEARCH_REQUIRED | 56 | Observed demand, no verified dossier |
| RESEARCH_REQUIRED_DEMAND_UNKNOWN | 512 | No observed demand, no verified dossier |
| DEFER_SATURATED | 13 | Observed HOT or SATURATED competition |
| EXCLUDE | 12 | Blocked: outdated premise, duplicate or rejected |

**The 52-week calendar:**

| Class | Primary weeks | In weeks 1–12 |
| --- | --- | --- |
| VERIFIED: script can be produced now (after model selection) | 1 | Week 1 |
| RESEARCH_REQUIRED: observed demand, dossier needed | 12 | Weeks 2–11 |
| DEMAND_UNVERIFIED: dossier needed, demand unknown | 39 | Week 12 |

**Only one week is ready for production today.** Every other week needs a dossier that passes the research gate. Weeks 2–4 need theirs by mid-November 2026 to keep a one-week buffer.

Narration, rendering and publishing are out of scope, and publishing stays blocked.

## 7. Phase E: monthly replenishment (deliverable 8)

This uses existing tools only: no duplicate topic engine and no paid research. It runs in the first week of each month and takes about one hour of operator time.

| Step | Tool (exists today) | Cost | Output |
| --- | --- | --- | --- |
| 1. Refresh competitor evidence | `profitdecoded-competitors.yml` (manual dispatch) | YouTube Data API free quota (≤ 10,000 units a day) | New `intel/snapshot-YYYY-MM-DD.json` |
| 2. Check premises | `node profitdecoded.js freshness`; add sourced events to `topics/freshness-watchlist.json` | Free (local) | Outdated or contradicted topics are blocked before they are scheduled |
| 3. Re-classify readiness | `node profitdecoded.js readiness --out channels/profitdecoded/reports/readiness.json` | Free (local) | Tier changes; topics newly observed as HOT or SATURATED move out of the pool |
| 4. Rebuild the pool and calendar | `node profitdecoded.js calendar --start <next unplanned Monday> --out channels/profitdecoded/reports/content-calendar.json` | Free (local) | Updated pool; reserve topics (26 today) fill gaps |
| 5. Roll the 12-week window | Write `topics/calendar-notes.json` entries (hook, thesis as HYPOTHESIS, audience, sources, risk, visuals) for the four weeks entering the window; rewrite ⚑ titles | Operator time | Weeks 1–12 always detailed |
| 6. Research only what is due | Build dossiers for the next 4–6 weeks only, never all 104 | Operator time plus free models | Dossiers that pass `Research.gate`; a failing topic is swapped for its backup |
| 7. Learn from published videos | `core/profitdecoded/learning.js` (records per video; rolling evidence) | Free (local) | Once videos exist, the channel's own retention and CTR data begin to replace competitor proxies |
| 8. Add new topics (quarterly) | `scripts/profitdecoded/build-inventory.js` with new seed titles | Free (local) | New candidates go through the same standards; the deterministic build rejects duplicates |

Rules:
- A published topic is never rescheduled.
- A week already researched is not replaced unless its premise fails the freshness check.
- Unknown demand stays unknown until a snapshot or the channel's own data says otherwise.
- **Known gap:** the calendar command does not yet read which topics were already produced. Before the first refresh (early December 2026), the produced list must be passed to it. One option is to read the learning memory; another is a small `produced` list in `calendar-notes.json`. Until then, step 4 starts from the next unplanned Monday, and the operator keeps already-produced weeks by hand.

## 8. Phase F: safeguards preserved

This branch changes no production default, workflow schedule, budget policy, secret or publishing setting.

| Safeguard | State | Where enforced |
| --- | --- | --- |
| Paid API disabled by default | `paidEnabled: false`, `paidApproval: null` | `channels/profitdecoded/budget-policy.json` (unchanged) |
| Maximum $2 per script | Unchanged | Budget policy, persistent ledger, `max_usd` |
| $8 monthly script budget | Unchanged | Budget policy and ledger |
| Independent editorial review | Unchanged: the critique and evaluation come from a different provider than the writer | Story engine stage providers |
| Source verification | Unchanged: research gate, factual checks, attribution checks | `research.js`, story gates |
| No automatic full-script regeneration | Unchanged: at most one rewrite; no paid retries | Story engine, SDK `maxRetries: 0` |
| Fail-closed publishing | Unchanged: `publishGuard` returns BLOCKED | `publish-check` |
| Explicit approval for paid experiments | Unchanged: single-use approval (PR #211, open) | Budget ledger |
| Other channels | Untouched | Only `channels/profitdecoded/`, `core/profitdecoded/`, `profitdecoded.js`, tests and docs changed |

No paid API call was made for this strategy. The only model calls in this phase are the paused free-tier Gemini benchmark, plus its judge runs on the free tiers once quota resets.

## 9. Blockers and next steps (deliverable 10)

**Blockers:**
1. **The model decision.** It waits for the Gemini free-quota reset (07:00 UTC) and one benchmark run. If the free quota or overload fails again, the run pauses and the decision stays with the measured A vs B result plus the owner's call.
2. **Only one verified dossier.** Weeks 2–12 need dossiers. With no dossiers, the calendar cannot move past week 1.
3. **Demand evidence.** 85 of the 104 pool topics have unknown demand. The pool's later weeks rest on estimated signals until snapshots or the channel's own data arrive.
4. **The experiment budget.** With Claude as primary, the $2 a month experiment pool allows about one paid consistency script a month (§2.4). Raising it is the owner's decision.
5. **The guard PR.** PR #211 (single-use approval, ProfitDecoded-only secret) is open. Any paid experiment requires it to be merged first.
6. **The produced-topics gap** in the calendar (§7) must be closed before the December refresh.

**Next steps, in order:**
1. After 07:00 UTC: run the paused Gemini benchmark, blind-judge A/B/C and write `MODEL-SELECTION.md` (deliverables 1–3). Production defaults stay unchanged until approved.
2. Owner: choose the primary and fallback model from that report; merge PR #211 if Claude is chosen.
3. Build and gate the dossiers for weeks 2–4: energy drinks, the watch secondary market, the Costco hot dog. The Costco dossier extends `cs-001`.
4. Run the consistency plan (§2) category by category, recording the metrics in §2.3.
5. Close the produced-topics gap, then run the first monthly replenishment in early December 2026.

Narration, rendering and publishing are **not** started.

## Appendix A: the 104-topic pool (ranked)

These are inventory titles. ⚑ marks ANGLE_REQUIRED (the title and angle must be rewritten before research). Weeks 1–12 use the rewritten working titles shown in §4 and §5.

| # | Pool | Topic (inventory title) | Category | Class | Competitive evidence (demand / saturation) | Difficulty |
|---|---|---|---|---|---|---|
| 1 | primary | How Gift Cards Make Money for Retailers | Consumer Brands & Business Stories | VERIFIED | unknown / EARLY (inferred) | Low |
| 2 | primary | Why Rolex Watches Appreciate ⚑ | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 83 (observed) / GROWING (observed) | High |
| 3 | primary | How Energy Drinks Make Money ⚑ | Hidden Economics of Everyday Life | RESEARCH_REQUIRED | 99 (observed) / GROWING (observed) | Medium |
| 4 | primary | How IKEA Makes Money From Meatballs and Candles ⚑ | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 93 (observed) / GROWING (observed) | Medium |
| 5 | primary | How Subway Makes Money on Sandwiches It Doesn't Own ⚑ | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 88 (observed) / GROWING (observed) | Medium |
| 6 | primary | How Airbnb Makes Money When Hosts Set the Price ⚑ | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 75 (observed) / GROWING (observed) | Medium |
| 7 | primary | Why Costco's Food Court Hot Dog Never Changed Price | Pricing Psychology & Hidden Fees | RESEARCH_REQUIRED | 18 (observed) / EARLY (observed) | Medium |
| 8 | primary | How Video Game Consoles Make Money While Being Sold at a Loss ⚑ | Technology Business Models | RESEARCH_REQUIRED | 73 (observed) / GROWING (observed) | Medium |
| 9 | primary | How Sneakers Make Money From Resale Hype ⚑ | Hidden Economics of Everyday Life | RESEARCH_REQUIRED | 95 (observed) / GROWING (observed) | High |
| 10 | primary | Why JCPenney Lost Customers When It Stopped Running Sales | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 11 | primary | How Ford Makes More From Trucks Than Cars | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 46 (observed) / EARLY (observed) | Medium |
| 12 | primary | How Silicon Valley Bank Failed in Days | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 13 | primary | How Chipotle Prices Its Burritos ⚑ | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 65 (observed) / DECLINING (observed) | Medium |
| 14 | primary | How Credit Card Rewards Are Paid For | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 15 | primary | How Amazon Prime Pays for Itself | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 16 | primary | Why Some Companies Lose Money on Their Most Popular Product | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 17 | primary | Why Luxury Brands Destroy Unsold Products | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 18 | primary | Why Toys R Us Collapsed | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 19 | primary | Why Blockbuster Failed | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 20 | primary | How Starbucks Makes More From Cups Than Coffee | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 21 | primary | Why Netflix Ended Password Sharing | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 22 | primary | How FTX Lost Customer Money | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 23 | primary | How Wikipedia Stays Alive Without Ads | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 24 | primary | How WeWork Lost Billions | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 25 | primary | Why Used Car Prices Jumped | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 26 | primary | How Amazon Became a Logistics Company | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 27 | primary | How Sports Teams Make Money Even When They Lose ⚑ | Hidden Economics of Everyday Life | RESEARCH_REQUIRED | 65 (observed) / GROWING (observed) | High |
| 28 | primary | How Dark Patterns Make You Click Yes | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 29 | primary | Why Ski Resorts Sell Cheap Season Passes | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 30 | primary | Why Free Apps Are Never Really Free | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 31 | primary | Why Spirit Airlines Can Charge for Carry-Ons | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 15 (observed) / EARLY (observed) | Medium |
| 32 | primary | Why McDonald's Ice Cream Machines Break | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 33 | primary | How Extended Warranties Became Retail's Best Profit Center | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 34 | primary | How Boeing Lost Its Way | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 35 | primary | Why Airlines Keep Making Economy Class Worse | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 36 | primary | How Free-to-Play Games Make Billions | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 37 | primary | Why Airlines Sometimes Prefer Empty Seats | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 38 | primary | Why Music Streaming Pays So Little per Stream | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 39 | primary | Why the Super Bowl Ad Costs What It Does | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 40 | primary | Why Houses Cost So Much | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 41 | primary | How Kodak Missed Digital | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 42 | primary | Why Starter Homes Disappeared | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 43 | primary | How Nokia Lost the Phone Market | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 44 | primary | How BlackBerry Lost Everything | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 45 | primary | How Auto Insurance Prices Your Risk | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 46 | primary | Why Starbucks Opens Stores Near Each Other | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 47 | primary | How Your Phone Plan Is Priced | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 48 | primary | How Uber Spent Billions Before Making Money | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 49 | primary | Why Disney Parks Keep Raising Prices | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / no data | High |
| 50 | primary | How Pets.com Burned Through Money | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 51 | primary | Why Cheap Razors Cost Less Than Replacement Blades | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 52 | primary | How Cancel Buttons Became Hard to Find | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 53 | backup | Why Dollar Tree Raised Prices Above a Dollar | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 43 (observed) / GROWING (observed) | Medium |
| 54 | backup | How Sears Collapsed | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 55 | backup | How Enron Hid Its Losses | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 56 | backup | Why Banks Pay You Nothing for Your Savings | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 57 | backup | How Interchange Fees Make Cards Expensive for Stores | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 58 | backup | Why Bananas Are So Cheap ⚑ | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 59 | backup | How Target Became Where You Go for More Than Toilet Paper | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 39 (observed) / GROWING (observed) | Medium |
| 60 | backup | How Lehman Brothers Collapsed | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 61 | backup | Why Chocolate Is Cheap While Cocoa Farmers Stay Poor | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 62 | backup | Why Retail Chains Go Bankrupt When They Look Busy | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 63 | backup | How Credit Suisse Collapsed | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 64 | backup | Why Chicken Sandwiches Started a War | Hidden Economics of Everyday Life | RESEARCH_REQUIRED | 13 (observed) / EARLY (observed) | Medium |
| 65 | backup | How Domino's Became a Technology Company | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 25 (observed) / GROWING (observed) | Medium |
| 66 | backup | How Quibi Lost 1.75 Billion | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 67 | backup | Why Airlines Overbook Flights on Purpose | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 68 | backup | Who Actually Pays for Your Free Credit Score | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 69 | backup | Why Checked Bags Became So Expensive | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 70 | backup | How Broadcasting Rights Shape What You Pay for Sports | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 71 | backup | Why Airports Make Money From Shops Not Flights | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 72 | backup | Why Eggs Cost What They Do | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 73 | backup | Why Beef Prices Keep Rising | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 74 | backup | How Whole Foods Changed After Amazon | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 75 | backup | Why Business Class Seats Exist at All | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 76 | backup | Why Vinyl Records Are Back | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 77 | backup | How Barnes and Noble Came Back | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 78 | backup | Why Economy Seats Keep Shrinking | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 79 | backup | Why Dunkin Sold Coffee Not Donuts | Consumer Brands & Business Stories | RESEARCH_REQUIRED | 36 (observed) / GROWING (observed) | Medium |
| 80 | backup | Why Wings Cost More Than They Used To | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 81 | backup | Why Cheap Chicken Is So Cheap ⚑ | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 82 | backup | Why Online Banks Offer Higher Rates | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 83 | backup | How Lego Almost Went Bankrupt | Business Failures & Comebacks | DEMAND_UNVERIFIED | unknown / EARLY (observed) | High |
| 84 | backup | Why Netflix Produces So Many Shows | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 85 | backup | Why Luxury Brands Don't Hold Sales | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 86 | backup | Why Coffee Is Cheaper Than It Should Be | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 87 | backup | Why Planes Fly Slower Than They Could | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 88 | backup | Why Landlords Prefer Empty Apartments | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 89 | backup | Why Movie Budgets Are Sometimes Cheaper Than Marketing | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 90 | backup | Why Avocados Cost What They Do | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 91 | backup | Why Dollar Stores Open in Poor Areas | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 92 | backup | Why Costco's Gas Prices Are Low | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 93 | backup | How Fitbit Disappeared | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 94 | backup | Why Colleges Build Luxury Dorms | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 95 | backup | How Stanley Cups Became a Craze | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / EARLY (observed) | High |
| 96 | backup | Why Seat Selection Costs Extra | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 97 | backup | Why Rent Keeps Going Up | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 98 | backup | Why Hollywood Accounting Makes Hits Look Like Losses | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 99 | backup | How GE Fell Apart | Consumer Brands & Business Stories | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 100 | backup | Why Steam Takes a Cut of Every Game | Technology Business Models | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 101 | backup | Why Banks Close Branches Yet Keep Opening Some | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | Medium |
| 102 | backup | Why College Sports Make Money Without Paying Players | Hidden Economics of Everyday Life | DEMAND_UNVERIFIED | unknown / no data | High |
| 103 | backup | How Credit Card Interest Compounds Against You | Pricing Psychology & Hidden Fees | DEMAND_UNVERIFIED | unknown / EARLY (observed) | Medium |
| 104 | backup | How GoPro Fell | Technology Business Models | RESEARCH_REQUIRED | 26 (observed) / GROWING (observed) | Medium |

## Appendix B: duplicate subjects removed

| Removed | Kept instead |
|---|---|
| How Nike Makes Money Without Making Shoes | How Sneakers Make Money From Resale Hype |
| Why Rotisserie Chicken Costs $4.99 at Costco | Why Costco's Food Court Hot Dog Never Changed Price |
| Why Hot Dogs Cost So Little at Costco | Why Costco's Food Court Hot Dog Never Changed Price |
| Why Credit Cards Pay You to Spend | How Credit Card Rewards Are Paid For |
| How Store Credit Cards Make Money | How Credit Card Rewards Are Paid For |
| How Blockbuster Passed on Netflix | Why Blockbuster Failed |
| Why Airlines Make Economy Worse on Purpose | Why Airlines Keep Making Economy Class Worse |
| How JCPenney Lost Its Way | Why JCPenney Lost Customers When It Stopped Running Sales |
| How Best Buy Survived Amazon | How Extended Warranties Became Retail's Best Profit Center |
| How Netflix Went From DVDs to Streaming | Why Netflix Ended Password Sharing |
| Why Streaming Shows Get Canceled Quickly | Why Netflix Produces So Many Shows |
| How Airlines Make Money From Credit Cards | How Credit Card Rewards Are Paid For |
| Why Costco Wants Membership More Than Sales | Why Costco's Food Court Hot Dog Never Changed Price |
| Why Streaming Services Added Ads After Promising Not To | Why Netflix Ended Password Sharing |
| Why Amazon Prime Cancellation Used to Take Several Clicks | How Amazon Became a Logistics Company |
| Why Streaming Services Keep Raising Prices | Why Netflix Ended Password Sharing |
