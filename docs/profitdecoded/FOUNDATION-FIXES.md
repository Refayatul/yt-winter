# ProfitDecoded: foundation fixes before production

Date: 2026-10-09.
Branch: `feat/profitdecoded-foundation-gates`, stacked on `docs/profitdecoded-model-benchmark`, which is stacked on PR #204.

Architecture decision recorded by the owner:
- Claude Opus writes the story.
- Gemini is the independent editorial reviewer.
- Groq is the free research assistant and fallback.
- No paid API call without explicit approval.

This work called no paid API and used no Groq quota.

## 1. Corrected dossier: the Darden arithmetic

File: `channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json`.

Inference i2 said Darden "took in $760.2 million … released $751.9 million …, **so** the unspent pool still grew by $7.9 million". That reasoning is wrong:

| Step | Figure |
| --- | --- |
| Activations − redemptions and breakage = 760.2 − 751.9 | **$8.3 million** |
| Balance change, $628.8M → $636.7M | **$7.9 million** |
| Difference, 8.3 − 7.9 | **$0.4 million**: the "Sale of Olive Garden Canada gift card balances (0.4)" line in Darden's gift-card rollforward, which was already in c5's verbatim evidence passage |

Check: 628.8 − 0.4 + 760.2 − 751.9 = 636.7.

Changes:
- **c5** now states the $0.4 million reduction.
- **i2** now gives both figures and the reason they differ.
- **Every inference has a `calc`** (expressions and expected results) and a `kind` ("arithmetic" or "rounding"). The research gate evaluates each calc, using only digits and operators, and rejects:
  - a wrong result, e.g. "760.2 - 751.9 = 8.3, not 7.9";
  - any figure in an inference that neither its basis claims nor its calc produce.
- **A `corrections` log** records the old text and the reason.
- **Entity map:** Starbucks, Darden (alias Olive Garden), Bankrate (alias YouGov), and federal rules (CFPB, Regulation E).
- **Per-claim attribution rules:**
  - scope: c8 and c9 are about US adults, not households;
  - required context: c8 needs the survey method and the word "estimate"; the combined $1,751.7M Starbucks balance needs "loyalty" or "Stars";
  - figure labels: $751.9M is "redemptions **and breakage**".
- **Editorial rules x1 and x3 as script rules:** never "gift cards never expire"; never "knows how much".

Gate result: pass, long-form score 94, Short score 100, no warnings. The other two dossiers (`cs-001`, `hbm-001`) still pass, with warnings that their arithmetic and attribution are not machine-checkable yet.

## 2. Story-plan validation (`research.planEvidenceIssues`, called from `evaluatePlan`)

- **Thesis and payoff cite evidence.** The plan schema now requires `thesisClaimIds` and `payoffClaimIds`. Unknown ids are rejected. A payoff may only cite claims that a section establishes.
- **Unsupported conclusions are rejected before drafting.**
  - Overclaim words ("most", "only a small", "exact", "always", "never", "knows", "the biggest"…) in the thesis, payoff or angle must appear in the cited claims or the verified thesis.
  - Figures must be in the cited claims.
  - Script rules apply to these fields too.
- **Repeated facts.**
  - A figure-bearing claim may have only one home among the story sections. Hook, caveat and payoff sections may refer back to it.
  - A figure-free claim used in three or more sections gives a warning.
- **Prompt (`story.md`):** two short rules ask for the evidence ids and one home per figure.

On the Phase 3.5 free-model plan, the gate now rejects:
- the uncited thesis and payoff;
- "most" and "only a small" in the payoff;
- "exact" in the angle;
- c1, c4, i1 and i2 each planned in two story sections. c8 now passes: its other section, s1, is the hook, which may preview a fact. Its restated figures are still caught in the script.

## 3. Attribution validation (`research.attributionIssues`, called from `check()` on every script)

| Defect | Rule | Caught in the Groq script |
| --- | --- | --- |
| Our calculation presented as a reported figure | A figure that exists only in an inference needs "our math", "we add", "that addition is ours"… in the beat. A rounding needs "about"/"roughly". Company + reporting verb + our figure, with no disclosure in that sentence, is rejected. | s7-1 "Starbucks recorded $222.4 million…", s9-2 "$7.9 million" |
| Wrong company | A figure is attributed to the entities whose sources report it. A sentence that names only other entities is rejected. | (unit tests: "Darden reported $200.4 million") |
| Internal ids spoken | Any claim, source or contradiction id, or "claim N", in narration | s2-3 "as shown in i3" |
| Unnamed company | A beat may not use a company's facts before that company is named. Teaser hooks and pure questions without figures are exempt. | s4-1 to s4-4 (Darden explained before it is named) |
| Scope | Claim `scope.avoid` words near the claim or its figures | s7-3 "households" |
| Required context | Claim `disclose` groups, optionally only where given figures are spoken | the benchmark Claude script (survey method missing) |
| Figure labels | Claim `figureContext` | s9-2 "$751.9 million in redemptions" |
| Repeated figures | Same value and unit stated in two or more sections | 12 figures repeated across s1–s9 |

On the real scripts:

| Script | Attribution findings |
| --- | --- |
| Groq Phase 3.5 script | 24 findings; every defect in the Phase 3.5 source check that can be checked mechanically |
| Revised Claude script | 0 |
| Phase 3 Claude packages | Real defects. The hook said the annual report "counts $222.4 million", but that is our sum of two lines. Also "Starbucks' $222.4 million is what one company recorded", "households", and repeated figures. Both packages were corrected (below). Claude makes these mistakes too, so these gates are model-independent safeguards. |

Retention critic fix (`retention.js`): a question now counts as answered when the answer uses an inflected form of the same word ("keeps"/"keep"), or when the next line shares a key word and gives a figure. A question that is never answered is still rejected (tested).

## 4. Updated Claude script (`story-tests/hbm-073-gift-cards-long-claude/`)

Files:
- `plan.json` and `latest.json` (current);
- `draft.json` (the benchmark version);
- `script.md`;
- `review.md` (from `profitdecoded.js story-review`).

Changes:
- **Survey method (rule x2).** It opens on the finding, then the source: "43 percent of American adults say they're holding at least one unused gift card, voucher or store credit. That's from a Bankrate survey, run online by YouGov in August 2024 with 2,373 adults." Also: "Bankrate doesn't publish how it calculated" the $27 billion.
- **Darden pool.** It states the reported balances ("ended the year at $636.7 million, up from $628.8 million") instead of the dossier's old "so" arithmetic.
- **Scope and wording.**
  - "One in five **adults**";
  - "Starbucks still turns part of that waiting money into revenue" (was "every year");
  - "breakage is only one part of that outflow" (was the unlabelled "thin slice" comparison).
- **Plan.**
  - The thesis cites c2, c4, c1, c7; the payoff cites c2, c4, c10, with no "never".
  - Darden's "estimates may differ" line moved into Darden's section, so each figure-bearing fact has one home.

Revalidation against the corrected dossier and all gates:
- plan issues 0;
- attribution findings 0;
- numbers outside the dossier: none;
- 1,098 words (about 8.4 min at 130 wpm);
- spoken naturalness 97, AI-pattern 0, retention 90.

Three blocking items remain. None is factual:
1. No title candidates (20 needed).
2. No thumbnail concepts (3 needed). Packaging was never produced in the benchmark.
3. A **first-30-seconds reading of 79, against a pass mark of 80.** The heuristic scores the scene-style opening line ("Somewhere in a drawer…") at 64. The blind Gemini judge scored the same hook 9/10 in all three runs. I did not rewrite the hook to clear the heuristic.

The Phase 3 Claude packages were corrected the same way:
- hook: "Yet by our math, Starbucks booked $222.4 million … in fiscal 2025";
- b19 refers back to the hook's figure instead of restating it;
- b30: "One in five adults";
- b33: no repeated figures, "adults", our sum disclosed.

Both now pass every gate with 0 blocking.

## 5. Tests

- New `tests/js/profitdecoded-foundation.test.js`: 13 tests, one or more per defect class. They cover:
  - dossier arithmetic, the stray-figure check and safe evaluation;
  - plan evidence: rejection of the real free-model plan, a bounded payoff passing, overclaims, numbers, uncited, unknown or unestablished evidence, repeated facts, the exemptions, warnings;
  - attribution: our math vs reported figures, rounding, the wrong company, spoken ids, unnamed companies, teaser and question exemptions, scope, survey context, figure labels, the loyalty caveat only where its figure is spoken, script rules, repeated figures with units;
  - the real Groq script's defect list;
  - the Claude script before and after;
  - the Phase 3 hook regression;
  - retention question-answering in both directions.
- Updated fixtures: the Costco plan in `profitdecoded-story.test.js` (evidence ids, no repeated figure-bearing fact) and the two Phase 3 packages.
- Groq fallback size. The longer plan prompt plus the corrected i2 pushed the Groq plan request to about 7,960 tokens, against the 8,000 tokens-per-minute limit. I tightened the prompt wording and lowered the Groq plan output cap from 4,500 to 4,300 tokens. The live free runs used 2,049–2,780 plan output tokens, and a truncated plan is already retried at low effort. The request now fits with about 240 tokens to spare (it passes at a 7,800-token limit).
- Results: `npm run test:profitdecoded` **159/159**. Full `npm test` **476/476 JS** and **24/24 Python**.

## 6. Isolation and safeguards

- Changed paths: `core/profitdecoded/`, `channels/profitdecoded/`, `docs/profitdecoded/`, `tests/js/profitdecoded-*`. No other channel, no workflow and no schedule was touched.
- `node profitdecoded.js publish-check` → **BLOCKED**: dry-run default, channel `enabled=false`, YouTube platform disabled.
- `main` is 14 commits ahead of #202's base. All of them are automated state commits for other channels, and none touches a file in this stack (checked by file overlap).

## 7. PR stack and safe merge order

| Order | PR / branch | Base | Content | CI |
| --- | --- | --- | --- | --- |
| 1 | #202 `feat/profitdecoded-topic-intelligence` | `main` | Phase 2: topic intelligence | pass, mergeable |
| 2 | #203 `feat/profitdecoded-storytelling-engine` | #202 | Phase 3: story engine, gift-card packages | pass, mergeable |
| 3 | #204 `feat/profitdecoded-free-model-validation` | #203 | Phase 3.5: Gemini provider, free-model run, $0 guard | pass, mergeable |
| 4 | `docs/profitdecoded-model-benchmark` | #204 | Benchmark (docs and the Claude script, data only) | new PR |
| 5 | `feat/profitdecoded-foundation-gates` | (4) | This work | new PR |

How to merge:
- Merge strictly in this order, one at a time, and re-run CI after each.
- After a base PR merges, retarget the next PR to `main` before merging it. GitHub does this automatically if the merged branch is deleted.
- Use a merge commit (not squash) for #202–#204: later branches contain their commits, and squashing would make each later PR show the earlier diffs again.
- Do not merge (5) without (4).
- None of the PRs enables publishing or changes a schedule.
- The throwaway branch `bench/profitdecoded-model-benchmark` holds only the one-off judge workflow. It has no PR and should be deleted, not merged.

## 8. Remaining blockers

1. **The Claude script's packaging** (20 or more truthful titles, 3 thumbnails) does not exist yet.
2. **The 79-vs-80 opening reading** is an editorial call: keep the scene-style hook (judge-preferred) as a documented override, or switch to the contradiction hook.
3. **The other dossiers (`cs-001`, `hbm-001`) have no `calc` or `entities`.** Their arithmetic and company attribution are unchecked (gate warnings). Add both before writing on them.
4. **The gates are lexical.** They catch attribution, scope, labels, ids and repeats, but not invented details such as "updated each quarter" or "analysts treat…". The independent Gemini evaluation remains a required second gate.
5. **The Groq fallback plan request has about 240 tokens to spare at 8K TPM** on this dossier. A larger dossier will need a compact claim block for Groq plans.
6. **No `ANTHROPIC_API_KEY` secret.** The paid path is untested end to end.

## 9. Suggested next step: one controlled paid Claude API test (needs your explicit approval)

1. Add the `ANTHROPIC_API_KEY` repository secret.
2. Pick one topic with a dossier that passes the gate with the new `calc` and `entities` fields. Either finish `hbm-001` (data only, no API), or rerun gift cards as a direct comparison with the session-written script.
3. Dispatch once, script only:
   `gh workflow run profitdecoded-produce.yml --ref feat/profitdecoded-foundation-gates -f topic=<id> -f format=long -f provider=anthropic -f critic=gemini -f max_usd=5 -f through=script`
   Stage routing would be Claude for plan, draft and rewrite, and Gemini for critique and the final evaluation (free).
   - The `$5` cap is enforced by the spend guard.
   - The estimate is ~$1.60 for the run (range $1.20–$3.50; see `MODEL-BENCHMARK.md` §6).
   - Nothing is narrated, rendered or published.
4. Report actual tokens and dollars from `usage.json`, the gate results, Gemini's verdict and a manual source check, before any decision on the monthly budget.
