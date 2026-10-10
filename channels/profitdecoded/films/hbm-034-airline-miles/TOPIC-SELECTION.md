# Documentary #2: topic selection (2026-10-10)

**Recommendation:** *How airlines make money from credit cards* (`hbm-034`). Working title: **"Why American Express Paid Delta $8.2 Billion"**.

## How the candidates were found

The method uses only data already in the repository, plus primary-source checks.

1. `node profitdecoded.js rank --snapshot channels/profitdecoded/intel/snapshot-2026-10-08.json`: the decision engine over 594 topics.
2. The collector snapshot (YouTube Data API v3, 2026-10-08): 288 reference channels and 6,022 videos.
3. The manual coverage sample `intel/coverage-2026-10-08.json`: public search pages read in a browser.
4. A quick check that primary sources exist for each finalist.

**What counts as real data.** Two inputs are real YouTube data, and both are labelled **OBSERVED** below:
- view counts from the API snapshot;
- view counts from the manual search sample, as YouTube displayed them.

Everything else is **ESTIMATED**: the engine's appeal, curiosity, visual and long-form scores are curation heuristics. No search-volume data exists in the repository. I did not invent any.

**What the engine says.** For long-form, the engine clears no topic. It reports "long-form blocked until observed demand/outlier evidence" for every candidate below. Gift Cards was made the same way: as an owner-approved production rather than an engine clearance. Documentary #2 therefore needs the owner's go-ahead too.

## The five strongest candidates

| | 1. Airlines and credit cards (hbm-034) | 2. Hidden hotel "resort fees" (pp-060) | 3. College sticker price nobody pays (pp-089) | 4. Gyms that profit when you stay home (hbm-001) | 5. Costco membership (cs-001) |
| --- | --- | --- | --- | --- | --- |
| **Central question** | What does a bank buy when it pays an airline billions for miles? | Why is the price you click not the price you pay? | Why publish a price almost no one pays? | How does a gym make money from members who don't come? | Why does Costco care more about the fee than the sale? |
| **Everyday link** | Card swipes, miles balances | Booking a hotel | Families paying for college | Monthly gym fees | Warehouse membership |
| **Demand evidence (OBSERVED)** | Same angle: Wendover 7.35M views (4 yrs), WSJ Case Study 1.35M (1 yr); adjacent: CNBC 1.51M | Small: top same-angle result 50K (7 yrs) | None in the sample (unknown, not low) | Same angle: The Fat Files 1.9M (5 months) | Same angle: Established Context 1.58M (1 yr) |
| **Saturation** | High (inferred HOT) | Low (EARLY*) | Unknown | High, and recent | High |
| **Primary sources** | Excellent: three FY2025 10-Ks, 2020 8-K and 10-Ks, DOT and CFPB pages (all read for this report) | Strong: FTC rule (16 CFR 464), Federal Register (not yet read) | Moderate: NACUBO summary, College Board (not yet read) | Planet Fitness 10-K plus an academic study (not yet read) | Costco 10-K; dossier exists |
| **Visual opportunities** | Checkout swipe, boarding passes vs miles statements, loan folder, award price changing | Hotel bill, checkout screen | Price tags, offer letters | Empty gym, sign-up desk | Warehouse, membership card |
| **Title potential** | "Why American Express Paid Delta $8.2 Billion" | "The Rule That Forced Hotels to Show the Real Price" | "The College Price Nobody Pays" | "Why Gyms Want You to Stay Home" | "Why Costco Wants Your Fee More Than Your Cart" |
| **Research risk** | Low. The care points are known and recorded: cash ≠ profit, $21.9B is United's own math, an inquiry ≠ a verdict. | Medium. Demand is uncertain, and the rule's status may change. | Medium. Data sources are partly paywalled. | High. No primary attendance data. | Low on facts; high on originality. |
| **Overall** | **Recommended** | Strong alternative if you prefer low competition | Hold: demand unknown | Hold: a strong, very recent competitor | Hold: heavily covered |

## Why the airline topic

- **Demand.** It has the strongest observed demand of any candidate: several same-angle or adjacent videos above 1M views on major channels.
- **Sources.** It has the strongest primary sources. Every central figure comes from 2025 or 2026 filings or federal pages, and each one was quoted verbatim in the dossier and checked.
- **The mechanism.** It is surprising and defensible: an airline sells a currency it issues, owes the seats, forecasts unused miles, borrowed against the program, and sets the price.
- **Continuity.** It is the natural next story after Gift Cards: the same "balance you hold, company forecasts" idea, with a much larger and more familiar subject. The film stands alone and does not tease or depend on the first one.
- **Freshness.** The largest competitor video predates the FY2025 filings and the September 2024 DOT inquiry, so the evidence is newer than the competitor coverage. That is the only differentiation I can verify. I have not watched the competitor videos, so I don't claim they missed anything else.

**Risk, stated plainly.** The engine still marks the topic DEFER on differentiation: its estimated originality score is 20, and saturation is inferred as HOT. I did not relax that check. The documented angle is in the dossier. Whether it is distinct enough is an owner decision.
