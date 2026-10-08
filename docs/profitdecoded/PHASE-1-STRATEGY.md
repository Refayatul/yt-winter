# ProfitDecoded — Phase 1 Strategy (niche & topic validation)

*Prepared 2026-10-08. Scope: Phase 1 only. Nothing in production was changed: no schedules, flags, configs, other channels or publishing settings.*

**Verdict: REFINE.** The niche, "The Business Behind Everyday Life", has strong, observed demand. Small faceless channels in this space get 1–16× their subscriber count in views. The current topic strategy, though, is built on a title template ("How X (Really) Makes Money") that is now flooded with near-identical AI uploads getting fewer than 500 views. Keep the channel identity. Change how topics are framed and which clusters lead, and connect live data before any long-form decision.

---

## 0. Method, provenance and cost

| Label | Meaning in this report |
|---|---|
| **OBSERVED** | Public YouTube numbers read on 2026-10-08 (search results and channel `/videos` pages): view counts, subscriber counts (rounded as YouTube displays them), video lengths and upload ages. |
| **ESTIMATED** | Values from the existing ProfitDecoded engine (`topic-universe.json` → `score.score`; `node profitdecoded.js rank`). These are curation heuristics, not market data. |
| **ASSUMPTION** | My judgment. Always labelled. |

**How the data was collected:** The repo's collector (`scripts/profitdecoded/collect-competitors.js`) could not run because no `PD_YT_API_KEY` exists in the repo secrets or the local `.env` (checked by name only). Instead I read public YouTube pages in a browser: about 75 keyword searches and about 20 channel video pages, plus 3 thumbnail-grid screenshots.

**Cost:** $0 in API spend. No YouTube Data API quota, no Anthropic, Groq or Serper calls.

**Limitations (stated, not papered over):**
- The browser session was in a Turkish locale. Search ranking may differ slightly from what a US viewer sees.
- Search results are a relevance-ranked sample, not complete coverage.
- Views are not normalised for video age.
- I saw no likes, comments, CTR, retention or revenue for any channel, and the report infers none of them.
- Faceless status is marked "observed" only where I saw thumbnails.
- No RPM or income figures appear anywhere in this report.

---

## 1. Current ProfitDecoded assessment

**What exists and works (do not rebuild):**

| Area | Status | Notes |
|---|---|---|
| Positioning & brand | Done | `config.json` tagline "The business behind everyday life", US-weighted, premium editorial style, explicit avoid-list. This is sound and matches the demand observed below. |
| Topic inventory | 594 hypotheses | Pillars: hidden-business-models 184, pricing-psychology 156, money-traps 104, strange-economics 96, company-stories 54. All are status `qualified`; none were validated against the market. |
| Topic scoring | Implemented | `topic-scoring.js`: 18 dimensions plus a geometric familiar × surprising × money × curious core. Demand, competition, freshness and outlier inputs are `UNKNOWN` for every topic. |
| Revenue opportunity / EBV | Implemented | `revenue.js`, `decision.js`. Relative categories only, with no invented CPM. That is correct. |
| Competitive intelligence | Code ready, never run on real data | `competitive.js`, `yt-collector.js`, `profitdecoded-competitors.yml`. They are blocked only by the missing `PD_YT_API_KEY`. |
| Research gate | Strong | Primary-source tiers, quote verification, SEC 10-K discovery. Two dossiers pass: Costco (96) and Planet Fitness (88). |
| Production | Dry-run only | Two dry-runs, both verdict **REVIEW**. The long-form ran 355 s against the 600–1080 s target: thin evidence, correctly not padded. Voice: Kokoro `am_michael`, still awaiting a human listen. |
| Publishing | Blocked (correct) | `enabled:false`, `status:shadow`, publish guard on. |

**Assessment:** The machinery (research rigor, gates, provenance) is a real advantage over the AI-mill competitors identified below. It is aimed at an under-informed topic list, however: every decision so far rests on hand-rated priors, and the engine itself reports `UNKNOWN` for demand and saturation.

---

## 2. Ten relevant competitors (OBSERVED 2026-10-08)

"Typical views" is the approximate median of the most recent ~18–30 uploads. The ratio is typical views ÷ subscribers.

| # | Channel | Subs | Typical views (ratio) | Biggest observed hits | Length | Cadence | Format notes |
|---|---|---|---|---|---|---|---|
| 1 | **Micro** @Micro-Econ-YT | 208K (42 videos) | ~290K (**≈1.4×**) | "How A Single Costco Changes Its Local Economy" 3.0M; "Why Only Three Countries Bother Building Ships Anymore" 3.1M; "Your Favorite YouTube Channel is (Probably) Owned By Private Equity" 1.8M | 13–30 min | ~2/month | Faceless (observed): 3D-rendered isometric buildings/objects plus a 2–4-word caps teaser ("THIS IS POWER", "IT'S NOW OVER"). |
| 2 | **Neu** @neu-youtube | 37.5K (47) | ~47K (**≈1.25×**) | "The Economics of Owning A Ship" 619K (16×); "How This Port Dominates Global Shipping" 232K | 8–10 min | ~2/week | Faceless (observed): 3D hero object plus huge number/word ("$309 BILLION", "TOO MANY?"). Logistics-heavy. |
| 3 | **The Fat Files** @TheFatFiles | 881K (55) | ~1.3M (**≈1.5×**) | Buc-ee's 2.8M; Lunchables 2.4M; Sriracha 2.1M; Subway 2.0M; mattress stores 1.96M; **Planet Fitness 1.9M (5 months ago)** | 15–32 min | ~2–3/month | **Not faceless** (host on every thumbnail). US consumer-brand stories. Shows the demand ceiling of our exact niche; its edge is the persona, which we can't copy. |
| 4 | **Established Context** @EstablishedContext | 66.7K (106) | ~36K (≈0.5×) | "How Costco Mastered Capitalism Without Being Greedy" 1.58M (24×); "Why Fast-Casual Just Collapsed" 512K | 8–12 min | Was ~weekly; **last upload 4 months ago** | US consumer economy. Shows a single breakout carrying a small channel. |
| 5 | **Tony Talks Business** @tony99.studios | 12.7K (164) | ~9K (≈0.7×) | "How Gameshows PAYOUT Their Money" 54K; "How Motels Make Money" 53K; "How Phone Companies Make Money Off You" 40K; dollar stores 179K | 16–24 min | **Daily** | The template we planned, executed at volume. It works modestly. "…Off YOU" framing outperforms. |
| 6 | **Brimm.** @brimm-tv | 21.2K (46) | ~9K (≈0.4×) | "Why Are the Dutch So Good at Ecommerce?" 328K (15×); "Why Cheap Gyms Are Actually Genius" 8.5K | 8–10 min | ~weekly | Same 8-minute "economics of X" format. One outlier, otherwise flat. |
| 7 | **Modern MBA** @ModernMBA | 832K (83) | ~276K (≈0.33×) | "Why Buffets Suddenly Disappeared" 795K (2 weeks); "Texas BBQ" 694K; "Xbox" 646K; "How Pizzerias Really Make Money" 637K; self-storage 1.2M (3 years) | 25–67 min | ~2/month | The long, rigorous end of our niche. Already covered cruises, movie theaters, airlines, car rental and self-storage. |
| 8 | **Company Man** @companyman114 | 1.8M (499) | ~160K (≈0.09×) | Decline series: RadioShack 3.4M, Blockbuster 2.1M; recent Fazoli's 304K (8 days), Gatorade vs Powerade 620K | 11–14 min | ~weekly | A fixed series title ("The Decline of X…What Happened?") that has kept producing hits for ~9 years. |
| 9 | **Logically Answered** @LogicallyAnswered | 928K | ~147K (≈0.16×) | "$1 Billion To Forgotten: How Dollar Shave Club Lost Everything" 1.4M | 13–19 min | ~2/week | Mostly tech/company decline. More news-driven than our niche. |
| 10 | **Wendover Productions** @Wendoverproductions | 4.92M | ~1.0M (≈0.21×) | Red Bull 1.7M; "Why Fast Food Got So Expensive" 1.5M; car dealerships 1.1M; IKEA 956K | 14–23 min | ~3/month | Category benchmark. Covers many of our "obvious" topics. |

**Format warnings (OBSERVED, not counted in the ten):**
- *Mr. Finance* (79.8K subs): near-daily "The Economics of Owning a ___" at 22–25 min gets about 4–16K per video. *Useless Money* (2.8K subs) runs the same template at a few hundred views.
- *Hidden Economics* (@hidden.eco.nomics, 26 subs) got 7–17K on 25-minute animated videos. That is an extreme ratio from a sample of 4 videos, cause unknown.

**Institutional benchmarks** (not beatable head-on, but they prove demand): WSJ *The Economics Of* (Costco 2.6M, Chick-fil-A 4.7M, Starbucks-as-a-bank 2.7M), Business Insider *So Expensive* (multi-million, mostly 6–8 years old), CNBC, More Perfect Union (subscriptions 3.3M, Uber 1.4M a month ago).

### What the data says

1. **Saturation of our default template (OBSERVED).**
   - Searching "how costco makes money": about 13 of 20 results came from channels that uploaded in the past 3 days to 5 months and got **2–505 views**. Costco itself is covered by Micro (3M), Established Context (1.58M), WSJ (5.2M) and CNBC (4.8M).
   - "how mcdonalds really makes money" and "why gas stations don't make money on gas" show the same pattern: 10+ fresh uploads per query, almost all under 600 views.
2. **Winning title patterns (OBSERVED from hits):**
   - A claim or tension statement: "Nobody Makes Money Renting Cars", "Movie Theaters Are Just Airlines With Popcorn", "How Costco Mastered Capitalism Without Being Greedy".
   - "A Single X changes Y": Micro, 3.0M and 251K.
   - "Why X Suddenly Disappeared/Collapsed".
   - A fixed series title: "The Decline of X…What Happened?".
   - "The Economics of Owning A ___" works for Neu, but it is now being cloned.
3. **Losing title patterns (OBSERVED):** "How X (Really/Actually) Makes Money (It's Not What You Think)" and "X Business Model Explained".
4. **Thumbnails (OBSERVED for Micro, Neu, Fat Files only):**
   - One hero object, often a clean 3D render of a store, ship or building.
   - 2–4 huge words that tease rather than repeat the title.
   - Frequent big money figures ("$309 BILLION", "$8B").
   - Strong red/white contrast.
5. **Length:** Faceless hits cluster at **8–10 min** (Neu, Brimm) and **15–25 min** (Micro, Fat Files). Modern MBA proves 30–60 min works only with deep material. *ASSUMPTION:* 10–14 min suits our evidence-gated pipeline better than 8, because the gyms dry-run already found 6 minutes of supportable material on a single company.
6. **Audience interests (OBSERVED via hits):**
   - Familiar US chains: Costco, Chick-fil-A, Subway, Buc-ee's, Aldi.
   - "Why is everything worse/more expensive": fast food, tipping, subscriptions, Uber.
   - Corporate decline: RadioShack, Red Lobster, Dollar Shave Club.
   - Hidden logistics: ships, ports.

---

## 3. Niche evaluation and three priority clusters

The niche **is commercially attractive** in the sense we can measure. Dozens of videos in it have passed 1M views, including on channels with fewer than 250K subscribers, and US consumer, finance and tech subjects carry relatively advertiser-friendly framing (`CLUSTER_ADVERTISER` priors). Whether it reaches $2–3K/month cannot be estimated without observed RPM, and I am not inventing one.

| Cluster | Demand (OBSERVED) | Competition | Verdict |
|---|---|---|---|
| **A. Hidden economics of everyday places & products** | Micro 3.0M, Neu 619K, Modern MBA 795K, WSJ series at millions | High for famous brands, **open for specific mechanisms** (gift-card breakage, store cards, car-wash memberships) | **PRIORITY 1** |
| **B. Company success & failure stories (US consumer brands)** | Fat Files ~1.3M per video, Company Man 150–600K per video, Dollar Shave Club 1.4M | Strong incumbents, but the topic supply is effectively endless | **PRIORITY 2** *(currently only 10% pillar weight / 54 topics; the evidence suggests that is too low)* |
| **C. Consumer psychology & pricing (fees, tipping, cards)** | Tipping 351K (9 months), BNPL 6.0M, BI "Sneaky ways" 5–10M, subscriptions 3.3M | Mixed. Classic stores and menus are old and saturated; **2025–26 fee rules and pricing shifts are open** | **PRIORITY 3** |
| Business-model documentaries ("How X makes money") as a *format* | Proven historically | **Oversupplied right now** (see §2) | Keep as a *mechanism inside* A–C, not as a title template |
| Technology business models | High, but news-driven (OpenAI, Wix, LinkedIn) | Logically Answered, ColdFusion, How Money Works | Deprioritise: low evergreen value, weak "everyday" fit |
| Business strategy explainers (abstract) | Think School-type hits are India-centric | Generic | Deprioritise: weak thumbnails, low US fit |

No identity change is warranted. All three priority clusters sit inside "The Business Behind Everyday Life".

---

## 4. Twenty ranked video ideas

**Ranking method** (uses the existing engine wherever possible):
1. **Tier**, from OBSERVED signals:
   - **A** = proven adjacent demand (a related video ≥300K) and no ≥300K treatment of the *same angle* in the last 12 months.
   - **B** = demand weaker or the angle partly covered.
   - **C** = proven demand but covered heavily in the last 12 months.
2. **Within each tier**, the existing engine's `score.score` (ESTIMATED; `—` = topic not in the inventory, or a proxy topic noted).

Facts marked *verify* must pass the existing research gate before scripting.

| # | Working title | Tier | Engine score (EST.) | Curiosity hook | Evidence of interest (OBSERVED) | Competitive opportunity | Evergreen | Monetisation relevance (EST.) | Production difficulty | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **America Stopped Making Pennies. Who Pays Now?** | A | 88.7 / 87.5 (*inventory title "Why the US Still Makes the Penny" is now stale*) | A coin that cost more to make than it was worth; now cash totals get rounded | CGP Grey "Zero Is Technically an Amount" 2.9M (1 yr); DeFranco "The Penny Is Dead" 1.0M (10 mo); news clips 92–339K | No business documentary in results; coverage is news/commentary | High (stays relevant) | VERY HIGH (US Mint/Treasury, retail) | Low: US Mint annual reports (*verify* unit cost), Treasury notice | Medium-high |
| 2 | **Why America Pays to Store Things It Never Uses** (self-storage) | A | 88.3 | Millions of people pay monthly rent for boxes they never open | Modern MBA 1.2M (3 yr); CNBC 373K (5 yr); Self Storage Income 542K | Last major treatment is 3 years old | High | VERY HIGH | Low: Public Storage / Extra Space 10-Ks | Medium-high |
| 3 | **Your Movie Ticket Barely Pays for the Movie** | A | 87.6 | The studio takes most of the ticket; popcorn pays the rent | BI "Sneaky Ways Movie Theaters…" 4.95M (7 yr); Modern MBA 161K (5 mo) | No same-angle hit ≥300K in 12 months | High | HIGH | Low: AMC/Cinemark 10-K cost lines. Avoid film footage (own graphics) | High |
| 4 | **Your Grocery Store Is Secretly an Ad Company** | A | 84.6 (proxy: "How Loyalty Cards Make Money From Data") | Loyalty cards turn your receipts into an advertising business | CNBC "Why Even Your Local Grocery Store Wants Your Digital Data" 379K (2 yr) | Thin coverage; growing story | Medium-high | HIGH (retail/tech advertisers) | Medium: Walmart/Kroger 10-K advertising disclosures (*verify* figures) | Medium |
| 5 | **Why Car Washes Are Suddenly Everywhere** | A | 81.7 | Unlimited-wash memberships turned a $10 errand into a subscription | Bloomberg "How Private Equity Drove America's Car Wash Obsession" 328K (2 yr); "The Car Wash Conspiracy" 150K | 11 of 20 results under 1 month old are low-view; no recent hit | Medium-high | HIGH (autos/subscriptions) | Low: Mister Car Wash 10-K (membership share of sales, *verify*) | Medium-high |
| 6 | **Why Every Cashier Asks You to Open a Store Card** | A | 80.9 | The register pitch is worth more to the retailer than the sale | CNBC "Who Actually Pays For Credit Card Rewards?" 1.5M; Modern MBA credit cards 428K; Kohl's 499K (2 mo, different angle) | **Zero** ≥50K results for the exact angle | High | VERY HIGH (banks/cards) | Low: Target ("credit card profit sharing"), Macy's ("credit card revenues, net") 10-Ks | High |
| 7 | **The Billions Stuck on Gift Cards You Forgot** | A | 80.7 / 79.8 | Unused balances become profit ("breakage") | WSJ "Why Starbucks Operates Like a Bank" 2.67M (4 yr) | **Zero** ≥50K results for "gift card breakage" | High, plus holiday timing | HIGH | Low: Starbucks 10-K breakage disclosure (*verify*), state unclaimed-property rules | Medium-high |
| 8 | **Your Local Funeral Home Probably Isn't Local** | A | 75.3 (proxy) | Family names on the sign; a public company behind them | CNBC "Why Funerals Are So Expensive In The U.S." 406K (5 yr); Caitlin Doughty 437K (3 yr) | Consolidation angle uncovered in results | Very high | MEDIUM (sensitive subject: ASSUMPTION) | Medium: Service Corporation International 10-K, FTC Funeral Rule | Medium |
| 9 | **Why Stores Lock Up Everything (And Who It Really Hurts)** | A | — (not in inventory) | Toothpaste behind plexiglass; the shrink numbers are disputed | Inside Edition 1.35M (3 yr) and 496K; NBC 350K (2 yr) | News only; no business documentary | Medium | HIGH (retail) | Medium: NRF survey, retailer 10-K shrink statements. The contradiction must be logged | Medium |
| 10 | **The $9 Billion Mistake: Why Dollar Tree Gave Up on Family Dollar** | B | 86.0 (proxy: "Why Dollar Tree Raised Prices Above a Dollar") | Bought for ~$9B, sold for ~$1B (*verify both*) | CNBC "Why Dollar Stores Are Struggling" 1.07M (1 yr); WSJ 213K; Company Man 139K (9 mo) | Partly covered; the acquisition-failure angle is open | High | HIGH | Low: Dollar Tree 10-K/8-K | Medium |
| 11 | **Coca-Cola Doesn't Really Make Coke** | B | 86.0 | It sells concentrate and a brand; others bottle it | Generic Coca-Cola interest huge (factory videos 4M); case study 168K | Business angle under-covered in sampled results (*ASSUMPTION*: under-sampled) | Very high | HIGH | Low: Coca-Cola 10-K segments | Medium |
| 12 | **The Fee That Isn't in the Price** (resort & junk fees) | B | 84.7 | The advertised room price was never the price | Vegas resort-fee videos 213K (2 yr), 67K (2 days ago) | No business documentary; new FTC fee rule (2025, *verify*) | Medium-high | HIGH (travel) | Low: FTC rule text, MGM/Caesars 10-Ks | Medium |
| 13 | **Why Ticketmaster Doesn't Mind Being Hated** | B | 84.5 | The fees are partly the venue's and artist's money | BI 519K (9 mo); Infographics Show 327K (4 mo) | Recently covered, but not this mechanism | Medium (litigation shifts it) | HIGH | Medium: Live Nation 10-K, DOJ complaint | Medium |
| 14 | **Who Actually Wins When You Tip at a Kiosk** | B | 84.2 | The screen, not the worker, chose the default | Informed Insights 351K (9 mo); WSJ 199K; Phil Edwards 185K | Contested; payments-provider angle open | Medium-high | HIGH (fintech) | Medium: Square/Toast 10-Ks, Pew survey | Medium |
| 15 | **The Textbook Fee Hidden in Your Tuition Bill** | B | 81.3 | "Inclusive access" auto-bills students | BI "Why College Textbooks Are So Expensive" 437K (7 yr); 89K (1 yr) | Open, but a narrower audience | High | MEDIUM-HIGH | Medium: Dept. of Education rulemaking, publisher filings | Medium-low |
| 16 | **Why Hearing Aids Cost Thousands, and Why That's Breaking** | B | 81.2 | A $4K device meets over-the-counter rules and Costco | CNBC 287K (3 yr); Costco hearing-aid reviews 108–188K | Open business angle | High | HIGH (older demographic: ASSUMPTION) | Medium: FDA OTC rule (2022), manufacturer annual reports | Medium |
| 17 | **How Walgreens Went From Everywhere to Sold** | B | 80.7 (proxy: pharmacies) | The corner drugstore that couldn't make money | CNBC 1.93M (2 yr); More Perfect Union 620K (1 yr); Company Man Rite Aid 327K | Partly covered; take-private ending is new (*verify*) | Medium | MEDIUM-HIGH | Medium: Walgreens 10-K, deal filings | Medium |
| 18 | **Your Airline Is Really a Credit Card Company** | C | 87.5 | Miles earn more than seats | Wendover 7.3M (4 yr); WSJ 1.35M (1 yr); CNBC 1.5M | **Saturated** | High | VERY HIGH | Low | High demand / low opportunity |
| 19 | **The Gym Built for Members Who Don't Come** (existing dossier) | C | 87.3 (researched, PASS 88) | Capacity math only works if most members stay home | **Fat Files Planet Fitness 1.9M (5 mo)**; SunnyV2 10M (3 yr); Brimm 8.5K | **Recently saturated**; our angle (10-K capacity arithmetic) is different | High | HIGH | **Research done** | Research high / competition low |
| 20 | **The Mattress Store Mystery, Solved by the Balance Sheet** | C | 80.9 | Why there are so many stores (not laundering) | Fat Files 1.96M (9 mo); Zackary Smigel 2.29M (4 mo) | **Saturated recently** | High | HIGH | Medium: Tempur Sealy / Mattress Firm filings (*verify*) | High demand / low opportunity |

**Deliberately excluded** despite high engine scores (OBSERVED saturation): Costco membership and hot dog, McDonald's real estate, gas stations, Chick-fil-A franchise, Trader Joe's/Aldi, Spirit Halloween (5 videos at 222K–1.07M), printer ink (two at ~10.7M), BNPL, shrinkflation, Red Lobster, Uber (two 1M+ videos in the last month). Casinos and sports betting were also excluded for limited-ads risk (engine prior).

---

## 5. Four recommended launch videos (30-day experiment)

| Order | Video | Cluster tested | Why it was selected |
|---|---|---|---|
| 1 | **#1 America Stopped Making Pennies. Who Pays Now?** | Strange economics / policy | The highest engine score (88.7), and the most US-specific topic on the list. The only sampled coverage is news and commentary. Thumbnail concept: one penny plus "3.7¢" (*verify the figure*). Primary sources are government documents. It also fixes a stale inventory item. |
| 2 | **#3 Your Movie Ticket Barely Pays for the Movie** | Hidden economics (A) | Broad appeal (everyone has bought popcorn), and the 4.95M BI video proves demand while being 7 years old. Story arc: ticket → studio split → popcorn margin → why theaters fight streaming. 10-K cost lines make it fully sourceable. Visuals are feasible as own graphics, with no film footage. |
| 3 | **#7 The Billions Stuck on Gift Cards You Forgot** | Consumer psychology (C) | An open gap (no ≥50K results), adjacent proof of 2.67M, and publishing in Nov–Dec matches gift-card season. Thumbnail: a gift card with a "$0.00 used" receipt. This is a clean test of the money-trap mechanism without scam-channel drift. |
| 4 | **#5 Why Car Washes Are Suddenly Everywhere** | Company strategy / "why is this everywhere" (B-style) | A visible local US phenomenon with a strong curiosity question. One public company (Mister Car Wash) gives primary numbers on the subscription model. Recent coverage is thin, and it tests the "Suddenly" title pattern observed in the winners. |

**Why these four together:** They test three different clusters plus one title pattern each:
- statement + question (penny)
- counter-intuitive claim (movie ticket)
- loss you didn't notice (gift cards)
- "Why X Is Suddenly Everywhere" (car washes)

Each has a single strong thumbnail object. None goes head-to-head with a 1M+ video from the last 12 months, and all four rest on SEC or government primary sources that the existing research agent already knows how to fetch.

**Alternates:** #6 store credit cards (strongest sourcing, slightly narrower appeal) and #2 self-storage.

**Length:** aim for **10–12 minutes**. Accept 8–10 if the research gate can't support more, consistent with the "never pad" rule. Note: `config.json` targets 10–18 minutes; this was not changed.

**Experiment readout:** Record impressions CTR, average view duration and returning viewers per video in the existing learning engine (OBSERVED only). Don't judge revenue in this window.

---

## 6. Existing implementation gaps

1. **No live market data.** `PD_YT_API_KEY` is absent, so demand, outlier, saturation and competitionOpenness are `UNKNOWN` for all 594 topics. The engine says so itself: "long-form stays blocked until observed evidence exists". The observations in this report were collected by hand and are **not** in the collector's snapshot format; the engine cannot consume them yet. *Fix (human): add the read-only key and run `profitdecoded-competitors.yml`. That uses ~5,700 of 10,000 free daily units per run.*
2. **Wrong reference set.** `intel/reference-channels.json` lists mostly mega or off-niche channels (Vox, Veritasium, CNBC, Business Insider, Infographics Show). The channels that actually perform in this niche are missing: Micro, Neu, The Fat Files, Established Context, Modern MBA, Company Man, Logically Answered, Tony Talks Business, Brimm.
3. **Discovery queries mirror the oversupplied template.** "how costco makes money", "how gyms make money" and similar queries will mostly surface AI-mill uploads. Outlier detection needs queries built on the patterns that win ("why X suddenly", "a single X", "the decline of").
4. **No title-saturation signal.** `titlePotential()` gives "How X Makes Money" only −4. Most of the 184 hidden-business-model topics use that template.
5. **Stale facts in the inventory.** For example, "Why the US Still Makes the Penny". `freshness` is `UNKNOWN` everywhere, and nothing re-checks a hypothesis against current events before ranking.
6. **Pillar weights versus evidence.** company-stories is 10% of the mix with 54 topics, yet that format has the most consistent observed performance (Company Man, Fat Files).
7. **Channel identity not wired.** `youtubeChannelId` is empty and the handle is undecided (`channel-setup.md` says @ProfitDecoded is taken). I observed at least six other YouTube channels with this name (@ProfitDecoded, @ProfitDecodedHQ, @ProfitDecodedOfficial, @ProfitDecodedNow, @ProfitDecoded-i5s, @TheProfitDecodedMedia). From the repo I could not tell which channel is ours. This creates a brand-search collision risk.
8. **Visual bar.** The renderer is typographic with simple motion. The faceless outliers (Micro, Neu) use 3D-rendered hero objects. The brand rule bans dollar signs, while observed winning thumbnails often lead with "$ + big number". This should be **tested**, not assumed either way.
9. **Long-form evidence depth.** The only long dry-run ran 355 s. Single-company topics may not reach 10 minutes without a multi-company structure (industry → 2–3 companies → consumer impact).
10. **Voice.** The narrator still needs a human listen. Synthetic-voice disclosure is required at upload.

---

## 7. Recommendation: **REFINE**

- **Not PIVOT.** The niche has observed, repeatable demand at the scale our goal needs: small faceless channels (Micro, Neu) reach 1M+ views. Our gated, primary-source research is a genuine differentiator against the wave of low-effort uploads.
- **Not GO as-is.** The current inventory and title style lead straight into the most oversupplied corner of the niche. All ranking is still blind (`UNKNOWN` demand).

**Refinements (Phase 2 candidates; not implemented here):**
1. Add `PD_YT_API_KEY`, then replace the reference handles and discovery queries using §2 and §6.
2. Retire "How X Makes Money" as a title form. Use the claim, "suddenly" and "a single X" patterns.
3. Re-weight toward clusters A, B and C. Raise company-stories.
4. Re-check inventory facts for freshness.
5. Run the four launch topics through the existing research → script → dry-run pipeline. Human review stays on, and publishing remains blocked until a human enables it.

*Revenue: no RPM or income projection is made. The $2–3K/month goal can only be assessed after monetisation, from observed RPM and views.*
