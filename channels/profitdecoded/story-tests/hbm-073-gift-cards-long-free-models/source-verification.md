# Source verification report: final script candidate (live free-model run)

Topic `hbm-073-how-gift-cards-make-money-for-retailers`, long form. Script: [script.md](script.md), from run 37921341822, `latest.json`.

## 1. Research verification (before writing)

The existing verified dossier from Phase 3 was reused unchanged: `channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json`.

The research gate passed: long-form score 94, no rejections, all 10 claims `supported`. Inferences i1–i4 are labelled as our own arithmetic or rounding.

| Source | Tier | Publisher / document |
| --- | --- | --- |
| s1 | 10-K | Starbucks Form 10-K, FY ended 2025-09-28 (SEC EDGAR) |
| s2 | 10-K | Darden Restaurants Form 10-K, FY ended 2026-05-31 (SEC EDGAR) |
| s3 | regulator | CFPB, 12 CFR 1005.20 (Regulation E gift-card rule) |
| s4 | regulator | CFPB blog on gift-card terms |
| s5, s6 | survey publisher | Bankrate/YouGov gift-card survey (press release; article with methodology) |

No new sources were fetched in Phase 3.5. No claim in the script cites anything outside c1–c10 and i1–i4.

## 2. What the automated checks verified

- **Numbers:** every number in the final text appears in the dossier. `check()` passed. The draft had five violations ($1.751, $1.718, $15.245, $15.199, 0.5), and the targeted rewrites removed them.
- **Claim ids:** every beat cites a known claim id.
- **Fact check:** two independent Gemini fact checks were run on later versions (`evaluation-1.json`, `evaluation-2.json`).
  - The first found 7 high-severity problems.
  - Groq rewrote the affected sections, and the second found 2 high-severity problems that remain.

## 3. Manual claim-by-claim check (this report)

Statuses:
- **OK:** supported by the cited claim.
- **OVER:** says more than the claim supports.
- **WRONG:** contradicts the claim or misattributes it.
- **DEFECT:** a script defect, not a factual problem.

The "Gemini" column shows whether the second independent evaluation also flagged the line.

| Beat | Cites | Statement (short) | Status | Note | Gemini |
| --- | --- | --- | --- | --- | --- |
| s1-1 | c2 | Starbucks' cards never expire | OK | c2: no expiration date in company-operated markets including the US. Strictly, "never" holds only in those markets. | – |
| s1-1a | c2 | "Every unused dollar stays on the retailer's ledger" | OVER | c2 has breakage recognised as revenue and remittance under unclaimed-property laws where applicable. Not every dollar stays. | – |
| s1-2 | c8 | Survey: 2,373 adults; 43%; $27B; $244 avg; $100 median | OK | Matches c8. | – |
| s1-3 | c2 | Breakage estimated and recognised over time; "State unclaimed-property laws require a portion… so the revenue is net of any state claim" | OVER (minor) | c2 says the estimate accounts for remittance "to government agencies under unclaimed property laws **where applicable**". "Require" and "state" are stronger than the source. | – |
| s1-4 | c2 | Estimate from historical redemption data per market; "how often it is used, how long balances linger"; "not a one-time hit" | OVER (minor) | c2 names timing and the business channel of activation or reload. Usage frequency and "linger" are not in the source. The line "not by reducing an estimate as cards are spent" is leftover wording from the fix. | – |
| s2-1 | c3 | $1,751.7M combined balance at 2025-09-28, from $1,718.7M | OK | Matches c3 (cards plus loyalty, correctly stated). | – |
| s2-2 | c1 | $200.4M + $22.0M breakage FY2025 | OK | Matches c1. | – |
| s2-2 | – | "The estimates are updated each quarter" | WRONG | No frequency appears in any claim. Invented. | high |
| s2-2 | c1 | "part of company-operated store earnings" | OVER (minor) | c1 says *revenues*, not earnings. | – |
| s2-3 | c3 | $15,245.8M deferred, $15,199.5M recognised (includes breakage) | OK | Matches c3. | – |
| s2-3 | – | "…as shown in i3." | **DEFECT** | An internal claim id is spoken in the narration. No gate catches this. | – |
| s3-1 | c2 | Never expire, no fees; per-market history; estimate lowered for unclaimed property | OK | Matches c2 ("state" is a slight narrowing of "government agencies"). | – |
| s3-2 | c1 | FY2025/24/23 breakage lines | OK | Matches c1. Third listing of the same Starbucks figures (repetition). | – |
| s3-3 | i1 | Our sums $222.4M / $207.6M / $215.0M, labelled ours | OK | Correctly attributed as our arithmetic. | – |
| s4-1 | c4 | Gift-card sales recorded at redemption; no expiry or dormancy fees; 12-year period | OK, but **DEFECT** | The facts match c4, but the beat never says this is **Darden**. The company is first named in s5, so the section is unattributed for the viewer. | – |
| s4-2 | c5 | $760.2M loads; $751.9M redemptions + breakage; $628.8M → $636.7M | OK | Matches c5 (still unattributed to Darden). | – |
| s4-3 | i2 | Pool grew $7.9M, our arithmetic | OK | Correctly attributed. | – |
| s4-4 | c10 | Unclaimed-property laws are highly complex… | OK (unattributed) | c10 is what Darden says about its own business. The line states it as a general fact. | – |
| s5-1 | c6 | "half-percentage swing" → $3.6M FY2026 | OK (wording) | c6 says 50 basis points. "Half-percentage" can be heard as 0.5%. Say "half a percentage point". | – |
| s5-3 | c6 | "That $3.6M shift moves money from a future liability into current profit" | OVER | c6 is a two-way sensitivity. It can lower income too. | – |
| s5-4 | c4 | "Consumer behavior, economic shifts, or legal changes can alter redemption patterns" | OVER | c4 says only that the estimates may differ from actual outcomes. The causes are invented. | medium |
| s5-5 | c4 | Darden may have to turn balances over to the state | OVER | c4 does not mention remittance for Darden. c10 mentions only that the laws are complex. | – |
| s6-1 | c7 | Federal five-year floor; fee after one year, at most one per month | OK | Matches c7. The closing inference ("keep retailers from instantly converting every unused cent into revenue") is our framing and is not stated as such. | – |
| s6-2 | c10 | Darden: complex rules, subjective assumptions | OK | Matches c10. | – |
| s7-1 | i1 | "Starbucks recorded $222.4 million of breakage revenue" | WRONG | Misattribution: $222.4M is our sum (i1), and Starbucks reports two lines. The beat cites i1 but presents it as a Starbucks figure. | high |
| s7-2 | i2 | Darden pool +$7.9M, our arithmetic; loads and redemptions + breakage | OK | Correct. | – |
| s7-3 | c8 | "households hold about $27 billion" | OVER (minor) | c8 is about adults, not households. | – |
| s7-4 | c7 | Federal five-year and fee rules | OK | Duplicates s6-1 (repetition). | – |
| s8-2 | c10 | "Each fiscal year Darden revises the projection"; "Analysts treat the figure as an estimate" | OVER | c4 says "periodically", not each fiscal year. Analysts appear in no source. | medium |
| s8-3 | c7 | "The pocket-share we report…"; the five-year rule limits "how quickly unspent funds can be claimed" | WRONG | No pocket-share is computed anywhere. c7 governs expiration and fees, not claims on funds. | – |
| s9-1 | i1 | Our sums again | OK | Fourth listing of the Starbucks figures. | – |
| s9-2 | i2 | "$751.9 million in redemptions" | WRONG | c5: redemptions **and breakage**. | medium |
| s9-3 | c8 | Survey $27B, 43%, $244, $100 | OK | Third listing of the survey. | – |

### Totals
- 33 statements checked.
- 19 OK, a few of them with wording or attribution notes.
- 9 OVER.
- 4 WRONG: s2-2 "each quarter", s7-1 misattributed sum, s8-3, s9-2.
- 2 production defects: the spoken claim id "i3" and the unattributed Darden section.

The second Gemini evaluation flagged 3 of the 4 WRONG items (2 high, 1 medium) and 2 of the 9 OVER items (both medium). It missed s8-3 and both production defects.

## 4. Root causes (for the engine, not the script)

1. **The plan itself overclaims.**
   - The approved plan's `payoff` says "retailers capture most… only a small slice stays with the consumer".
   - Its `originalAngle` promises "the exact split".
   - The dossier supports neither. Plan checks verify structure and claim coverage, but not the truth of the payoff or angle text.
   - Every later stage writes toward a conclusion the evidence cannot reach, so the payoff section recycles numbers.
2. **Numbers repeat across sections.** Several sections share claims (c1, i1, i2, c8, c7), and each section is drafted separately for the 8K tokens-per-minute limit, so the same figures are restated up to four times. Gemini scored structure and pacing 3/10.
3. **The deterministic factual gate checks numbers, not attribution or scope.** "Starbucks recorded $222.4M" passes because 222.4 is in the dossier (i1).

## 5. Verdict

**Not approved for narration.** Factual integrity was protected by the gates: the run failed, and nothing was published or rendered. Paid fallback was never used.
