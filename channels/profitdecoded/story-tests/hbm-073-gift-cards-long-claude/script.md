# Billions Sit on Unused Gift Cards. Who Keeps the Money?

> Claude Opus 5.5, written in a Claude Code session (no API call) from the verified dossier only. Foundation-pass revision of the benchmark script (benchmark version: commit 5950a10). 1098 words, about 8.4 min at 130 wpm (7.3 min at 150 wpm). Each line ends with its claim; the visual follows in italics. Status: not final, see review.md (packaging not produced; one heuristic opening reading at 79 vs 80).

**Thesis** (c2, c4, c1, c7): An unused balance on a non-expiring gift card stays spendable, but the issuer estimates from its own redemption history how much will not be redeemed and books that share as revenue little by little as other cards are redeemed; unclaimed-property laws may send part of it to government agencies, and federal rules block the quickest ways of taking it.

**Payoff** (c2, c4, c10): On paper, the holder keeps a non-expiring balance: it stays spendable, with no fees. In practice, the issuer books the share it does not expect to be redeemed, gradually and from its own history. Where unclaimed-property laws apply, part may go to government agencies, and the filings do not say how much. Only the holder decides whether a given balance gets spent.

## The card in the drawer

Somewhere in a drawer, a wallet or a coat pocket, there's a gift card with money still on it. Maybe it's yours. `[c8]`
*Visual (typography): Money still on it*

43 percent of American adults say they're holding at least one unused gift card, voucher or store credit. That's from a Bankrate survey, run online by YouGov in August 2024 with 2,373 adults. `[c8]`
*Visual (animated-number): Bankrate · YouGov online survey · 2,373 US adults · Aug 2024 → 43% hold unused value*

Bankrate puts the national total at about $27 billion. That's an estimate from the survey, not a count, and Bankrate doesn't publish how it calculated it, which means it tells you the scale, not the exact amount. `[c8]`
*Visual (animated-number): ~$27 billion (survey estimate)*

So here's the question none of those cards answer. If the money never gets spent, who ends up with it? `[c8]`
*Visual (typography): Who ends up with it?*

We don't have to guess. Starbucks, and Darden, the company behind Olive Garden, explain it in their annual filings. And the answer is stranger than "the store just keeps it." `[c2]`
*Visual (filing-excerpt): Form 10-K covers: Starbucks FY2025, Darden FY2026*


## A card with no end date

Start with Starbucks. In the US and its other company-operated markets, Starbucks cards have no expiration date and no service fees. `[c2]`
*Visual (ui-callout): No expiration date · No service fees*

Nothing quietly eats the balance. The money just waits. `[c2]`
*Visual (animated-number): Balance unchanged*

And yet Starbucks still turns part of that waiting money into revenue. `[c2]`
*Visual (money-flow): Unspent balance → revenue?*

The accounting name for it is breakage: the share of card value a company doesn't expect anyone to ever redeem. `[c2]`
*Visual (typography): BREAKAGE: value not expected to be redeemed*


## Forecasting what won't be spent

But how do you book money that can still be spent? You can't wait for the card to expire. It won't. `[c2]`
*Visual (typography): No expiry → no end date to wait for*

So Starbucks looks backward. Its filing says it builds redemption rates from historical patterns in each market, including when a card was activated or reloaded, and through which channel. `[c2]`
*Visual (chart): Redemption rates: history by market, timing, channel*

From that history, it estimates how much of the money is never coming back. `[c2]`
*Visual (diagram): Estimated: never redeemed*

Here's the clever part. It doesn't book that amount in one go. It books it over time, in proportion to the cards that do get redeemed. `[c2]`
*Visual (money-flow): Booked over time, in proportion to redemptions*

Picture someone tapping a card for a latte. As that balance gets spent, a matching sliver of the money the company doesn't expect anyone to spend moves over into revenue. `[c2]`
*Visual (money-flow): Each redemption → matching sliver of breakage*

One phrase in that same filing will matter later. The estimate includes "remittance to government agencies under unclaimed property laws, if applicable." `[c2]`
*Visual (filing-excerpt): "remittance to government agencies under unclaimed property laws, if applicable"*


## How big the slice is

So what is this worth to Starbucks? In fiscal 2025, it recognized breakage worth $200.4 million in its company-operated stores. `[c1]`
*Visual (chart): FY2025 breakage, company-operated stores*

Licensed stores added another $22.0 million. `[c1]`
*Visual (chart): + licensed stores*

Together, by our own math, that's $222.4 million in one year. Our sums for the two years before land in the same range. `[i1]`
*Visual (chart): Our sum: FY2025 · FY2024 · FY2023*

At the end of that fiscal year, Starbucks was holding about $1.75 billion in card balances and loyalty Stars combined. Not all of that is gift card money, but it shows how big the pool is. `[i4]`
*Visual (animated-number): Card balances + loyalty Stars, end of FY2025 (combined)*

A big pool. But look at what flows through it. `[i3]`
*Visual (comparison-panel): Breakage vs. total flow*

In that same year, about $15.2 billion went onto Starbucks cards and into its loyalty program, as new cards, reloads and Stars earned. `[i3]`
*Visual (money-flow): In: ~$15.2B (cards + Stars)*

And about $15.2 billion came back out, as card purchases, Star redemptions and breakage. `[i3]`
*Visual (money-flow): Out: ~$15.2B (redemptions + breakage)*

In other words, the money flowing out almost matches the money flowing in. And breakage is only one part of that outflow. `[i3]`
*Visual (money-flow): Out = redemptions + breakage*


## Twelve years

Now cross the street to Darden. Its gift cards also have no expiration dates, and no dormancy fees. `[c4]`
*Visual (ui-callout): No expiration dates · No dormancy fees*

It makes the same kind of forecast from its own redemption history. But its filing adds a detail that changes the picture. It spreads breakage over the expected redemption period, which is generally 12 years. `[c4]`
*Visual (timeline): Expected redemption period: generally 12 years*

Twelve years. A card bought for a six-year-old's birthday could still be inside that forecast at their high school graduation. `[c4]`
*Visual (timeline): Birthday → graduation*

And the pool isn't shrinking. In fiscal 2026, people loaded $760.2 million onto Darden gift cards. `[c5]`
*Visual (money-flow): FY2026 loaded onto cards*

Redemptions and breakage together took out $751.9 million. `[c5]`
*Visual (money-flow): Redemptions + breakage*

More went in than came out. So the pool didn't shrink: it ended the year at $636.7 million, up from $628.8 million. `[c5]`
*Visual (animated-number): Unspent pool: $628.8M → $636.7M*

Darden is careful to say it's a forecast. If people redeem differently than it expects, actual breakage income may differ from what it recorded, and it updates its estimates periodically. `[c4]`
*Visual (filing-excerpt): "actual gift card breakage income may differ from the amounts recorded"*


## Half a point

Here's what turns this from bookkeeping into a story. Breakage isn't counted. It's predicted. `[c6]`
*Visual (typography): Not counted. Predicted.*

It even puts a price on being wrong. Move the breakage-rate estimate by 50 basis points, that's half of one percentage point, and breakage income shifts by about $3.6 million for the year. `[c6]`
*Visual (unit-economics): ±50 basis points → ~$3.6M breakage income (FY2026)*

Up or down. So the money in your drawer isn't just sitting there. It's an input to a forecast, and that forecast moves a company's income. `[c6]`
*Visual (diagram): Your balance → their forecast → their income*


## The third player

Now, back to that phrase about government agencies. It brings a third player into the story. `[c2]`
*Visual (diagram): A third claimant*

In plain English: where unclaimed-property laws apply, some unspent money may have to go to the government instead, and Starbucks builds that into its estimate. `[c2]`
*Visual (money-flow): Where laws apply: part → government agencies*

Darden flags the same laws as a hard problem. It lists unclaimed-property laws among the rules it calls highly complex, involving many subjective assumptions, estimates and judgments. `[c10]`
*Visual (filing-excerpt): "highly complex and involve many subjective assumptions, estimates, and judgments"*

What neither filing tells us is how much unspent money actually ends up with the government. So we won't guess. `[c10]`
*Visual (typography): Government's share: not disclosed*


## What the law protects, and what it can't

There's also a floor under all of this, set by federal rules. `[c7]`
*Visual (filing-excerpt): 12 CFR 1005.20*

A store gift card can carry an expiration date only if its money stays valid for at least five years after it was issued or last loaded. `[c7]`
*Visual (timeline): Expiry allowed only if funds valid ≥ 5 years from issue or last load*

And an inactivity fee is allowed only after a full year with no activity, and no more than one a month. `[c7]`
*Visual (timeline): Fees only after 1 year inactive · max 1 per month*

Those rules close off the quickest ways of draining a card. What they can't do is protect a card from its owner. `[c7]`
*Visual (typography): Protects the card, not from its owner*

In that same Bankrate survey, 34 percent of adults said they'd lost money through a gift card mistake. `[c9]`
*Visual (chart): Lost money through a gift card mistake*

One in five adults said they'd let a card expire. That's possible, because not every card works like Starbucks' or Darden's, and federal rules do allow expiry after five years. `[c9]`
*Visual (chart): Let a card expire*

Seventeen percent had lost a card. And 12 percent saw the store go out of business before they could use it. `[c9]`
*Visual (chart): Lost a card · Store closed first*


## Who keeps the money

So, who keeps the money? `[c2]`
*Visual (typography): Who keeps the money?*

On paper, with cards like these, you keep the money. No expiration date, no fees. The balance waits. `[c4]`
*Visual (comparison-panel): On paper: the holder*

In practice, the company forecasts how much will never come back, using years of its own data, and moves that share into revenue a little at a time as other people spend. `[c2]`
*Visual (comparison-panel): In practice: the forecast books it, slowly*

Where unclaimed-property laws apply, part of it may go to the government instead. How much, the filings don't say. `[c10]`
*Visual (comparison-panel): Where laws apply: government (amount not disclosed)*

And all of it rests on a number nobody can know in advance: how many of us never come back. `[c4]`
*Visual (typography): How many of us never come back*

The company can estimate. The government may take a slice. But only the person holding the card decides whether that balance becomes a meal and a coffee, or a line in someone else's annual report. `[c2]`
*Visual (comparison-panel): A meal and a coffee — or a line in an annual report*

So, about that drawer. Go check it. `[c8]`
*Visual (typography): Check the drawer*

## Alternative hooks

1. (number) 43 percent of American adults say they're holding at least one unused gift card, voucher or store credit.
2. (contradiction) Starbucks cards have no expiration date. Starbucks still turns part of the money on them into revenue every year.
3. (hidden incentive) Every time someone spends a Starbucks card, a sliver of money the company doesn't expect anyone to spend becomes revenue.
4. (question) If you never spend a gift card, who ends up with the money?
5. (unexpected consequence) Darden's gift card forecast stretches over 12 years, and moving it by half a percentage point shifts its income by about $3.6 million.
