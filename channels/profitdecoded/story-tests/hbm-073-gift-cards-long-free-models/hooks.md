# Hook competition: Billions Sit on Unused Gift Cards. Who Keeps the Money?

Source: the live Groq story plan (`plan.json`, `openai/gpt-oss-120b`), scored by the existing hook engine (`hooks.engineer`).
Every score is a heuristic editorial reading (ESTIMATED). None of them predicts audience retention.

The deterministic factual gate only checks that each number appears in the verified dossier.
The "Editorial fact note" column is a manual check of what each hook *says* against the claims, and it is stricter than that gate.

## Opening hook (selected by the engine)

| Total | Mechanism | Hook | Factual gate | Editorial fact note |
| --- | --- | --- | --- | --- |
| 81 | contradiction | You've been told gift cards expire, but Starbucks' cards never do. | pass | Supported: c2 (no expiration date in company-operated markets, including the US). "You've been told gift cards expire" is a framing, not a claim. |

The planner proposed the "$222.4 million" hook (score 70). It was ignored because it scored more than 10 points below the best factual hook (`evaluatePlan` override rule).

## Five alternative hooks

| # | Total | Mechanism | Hook | Factual gate | Editorial fact note |
| --- | --- | --- | --- | --- | --- |
| 1 | 79 | consumer pain | 43 % of Americans hold an average of $244 in gift cards they'll never use. | pass | **Overstated.** c8 gives 43% of *adults* with at least one *unused* card. The $244 average is among holders, and "unused" is not "never use". Usable as: "43 percent of US adults are sitting on an unused gift card, $244 on average among them." |
| 2 | 72 | hidden incentive | Every time a consumer reloads a Starbucks card, the company already knows how much of that money will never be spent. | pass | **Overstated.** c2 says the company *estimates* breakage from historical redemption patterns. It does not *know*. Usable with "already estimates". |
| 3 | 70 | number | Starbucks booked $222.4 million in breakage revenue in fiscal 2025. | pass | **Misattributed.** $222.4M is *our* sum (i1 = $200.4M + $22.0M from c1). Starbucks reports two lines and no single figure. The independent Gemini evaluation flagged the same error in the script (s7-1). |
| 4 | 69 | financial paradox | Unclaimed gift-card balances boost a retailer's earnings while the money never leaves the consumer's wallet. | pass | **Wrong.** The money left the consumer's wallet when the card was bought. Not usable. |
| 5 | 63 | visual mystery | Imagine a $1 billion pile of stored value sitting on a balance sheet, waiting to become profit. | **FAIL** (number "1" is not in the dossier) | Invented figure. The dossier's balance is $1,751.7M (c3), and it mixes card value with loyalty Stars. Not usable. |

Result: only the selected opening and alternative 1 (after rewording) are both factual and strong. The hook factual gate checks numbers only, so it passes attribution and scope errors (#1–#4). The Phase 3.5 report lists this as a remaining issue.
