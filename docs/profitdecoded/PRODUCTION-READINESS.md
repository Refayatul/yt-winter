# ProfitDecoded: production readiness, cost control and quality assurance

Date: 2026-10-09.
Branch: `feat/profitdecoded-production-readiness`, from `main` at 8b45cea.

This phase:
- made no paid API calls;
- made no Groq or Gemini calls;
- left publishing and schedules unchanged.

## 1. Merge report: PRs #202–#209

Before the first merge I revalidated every PR against GitHub. The heads matched the validated SHAs, all PRs were mergeable and CLEAN, and each had 7/7 checks passing.

`main` had moved to dc7cdcd. The three new commits were automated state commits for other channels, with no overlap with the stack.

| Order | PR | Head | Merge commit | Checks at merge |
| --- | --- | --- | --- | --- |
| 1 | #202 Topic intelligence | 8eb8382 | 26af9d3 | 7/7 pass, CLEAN, 20 files in scope, config unchanged |
| 2 | #203 Storytelling engine | 99da182 | 1a1f971 | Retargeted to `main`. Parent 8eb8382 present. 33 files (as validated), 7/7, CLEAN |
| 3 | #204 Free-model integration | 5d59148 | 89b68c0 | Retargeted. Parent present. 26 files, 7/7, CLEAN. Workflow cron, gate and permissions rechecked as unchanged |
| 4 | #208 Model benchmark | 5950a10 | 325d111 | Retargeted. Parent present. 9 files, 7/7, CLEAN |
| 5 | #209 Foundation gates | 8418fd9 | 8b45cea | Retargeted. Parent present. 23 files, 7/7, CLEAN |

All five were merged as merge commits, never squash or rebase.

After the merges:
- **Tests:** full suite 476/476 JS and 24/24 Python; ProfitDecoded 159/159.
- **Scope:** the diff dc7cdcd → 8b45cea touches only the stack's files, so no other channel changed.
- **Publishing:** `publish-check` reports BLOCKED. No `PD_PUBLISH`, `PD_LONGFORM_PUBLISH` or `PD_AUTO_SCHEDULE` variable or secret exists.
- **Temporary branch:** `bench/profitdecoded-model-benchmark` was deleted. The judge payloads are byte-identical in `main` and the verdicts are kept there; its last commit was 76b247d.

## 2. Architecture audit (before this phase)

| Area | What exists (working) | What was missing (now addressed) |
| --- | --- | --- |
| Topic intelligence | Decision engine (`decision.js`) with demand (OBSERVED only), saturation, freshness, editorial lens, value score; 594-topic universe; long-form clearance rule `PRODUCE_LONG` | No per-topic production-readiness view → `profitdecoded.js readiness` |
| Competitor research | Collector + 2026-10-08 snapshot; 236 topics with observed coverage, 73 with observed outlier evidence | – (not repeated: it costs YouTube quota) |
| Research verification | Research gate (source tiers, central claims, contradictions); since #209, arithmetic `calc` and entity maps | Only 1 of 3 dossiers carries the new attribution data |
| Claude storytelling | `develop()`: plan, draft, independent critique, targeted rewrite, final evaluation; prompt caching; disk stage cache | **Never run against the real API.** Defaulted to Anthropic whenever `ANTHROPIC_API_KEY` existed → now refused without the budget ledger |
| Gemini review | Free-tier allowlist, RetryInfo, daily-quota pause, 503 fallback | Paid runs could review Claude with Claude → independent reviewer now enforced |
| Groq fallback | 8K TPM pacer, token guard, safe pause | – |
| Usage tracking | Per-run in-memory ledger and `usage.json` | **Nothing persisted across runs**, so no monthly view → persistent ledger |
| Token estimation | Groq request size (pacing) | **None for paid calls** → `estimateMaxUsd` |
| Budget limits | `PD_AUTO_MAX_USD`, checked against money *already spent* (one call could overshoot). The workflow default was **$3** | Pre-call maximum-cost reservation; per-script, monthly and pool limits; default $0 |
| Retries | Groq and Gemini bounded retries | The Anthropic SDK default (2 automatic retries) could resend paid requests unseen → `maxRetries: 0`. The `MAX_TOKENS` low-effort retry regenerated a full paid draft → off for paid runs |
| Cache | Stage cache keyed by dossier, prompts and providers; `actions/cache` restore and save | A lost cache could silently pay again → identical paid requests are refused (`DUPLICATE`) |
| Quality gates | Research, plan evidence, attribution, retention critic, spoken, AI-pattern, hooks, Gemini critique and evaluation | Central-claim coverage; a narrow editorial exception |
| Workflows | `produce` (dispatch; cron gated by `PD_AUTO_SCHEDULE`, unset), `render`, `competitors`, `voice-audition` | No concurrency control → one run per topic+format |
| Rendering and publishing | Kokoro TTS (local), documented-source visuals, render script; `publishGuard` (dry-run, `enabled=false`, YouTube disabled, flag, credentials, assessment, human approval for the first 5) | – (unchanged) |

## 3. Topic inventory readiness (594 topics)

Command: `node profitdecoded.js readiness --out channels/profitdecoded/reports/inventory-readiness.json`.

It uses local data only: the decision engine, the 2026-10-08 snapshot, the three dossiers, and the new filter.

Provenance:
- **Demand** is OBSERVED competitor outlier evidence from the snapshot, never audience data for this channel.
- **Long-form suitability, visual potential and US focus** are ESTIMATED heuristics.
- **Primary sources** count only where a verified dossier exists.

| Class | Count |
| --- | --- |
| **Production-ready** (verified dossier passes every pre-generation check) | **1** (gift cards; experiment pool only, see below) |
| **Research-required**, observed demand present | 56 |
| **Research-required**, demand unknown | 512 |
| **Deferred: observed HOT/SATURATED** | 13 |
| **Excluded** (8 rejected by the decision engine, 3 outdated or contradicted premises, 1 duplicate) | 12 |

Flags (they overlap):

| Flag | Count |
| --- | --- |
| Outdated or contradicted | 3 |
| Time-sensitive or changed context (questionable until re-researched) | 50 |
| Duplicated subject ("How Rewards Credit Cards Make You Spend More" ≈ "How Credit Card Rewards Are Paid For") | 1 |
| Oversaturated (13 observed, 31 inferred from the manual sample) | 44 |
| Insufficient demand evidence | 521 |
| Suitable for long-form (ESTIMATED) | 320 |

Answers:
1. **How many can genuinely support 8–12 minutes?**
   - **1 is verified**: gift cards, which has a verified dossier and passes the depth check of 8 or more supported claims plus complication material.
   - **320 are estimated** to be long-form-suitable by the curation heuristics. That is a hypothesis until each is researched.
2. **How many have verified audience demand?**
   - **0** for this channel, which has no published videos and no analytics.
   - **73** have observed competitor outlier evidence, and **20** of those are strong (60 or higher). That is evidence that similar videos outperformed their channels, not proof of our demand.
3. **How many have reliable primary sources?**
   - **3** have dossiers.
   - **1** fully passes the new checks (gift cards).
   - Gyms passes the research gate but lacks `calc` and `entities`.
   - Costco fails the long-form gate (3 sources).
4. **How many suit the US audience?** **593 by heuristic** (no non-US geographic marker in the title or entity). The inventory was curated US-weighted. This is ESTIMATED, not verified.
5. **How many need new research?** **579**: every non-excluded topic without a dossier.
6. **Do we have enough strong topics for 12 months?**
   - **Not verified ones, no.**
   - Four long-form videos a month means 48 topics a year.
   - Today there is 1 verified topic, 20 with strong observed demand, and 320 estimated candidates.
   - The pipeline is enough only if free research converts about 4–5 topics a month to verified dossiers.
   - The decision engine also clears long-form *production* only with observed demand, so a demand signal is needed too. That signal will come from competitor data until our own Shorts or videos exist, and publishing is disabled.

**Top-20 production shortlist.** Long-form-suitable, not excluded, not observed-saturated. Ordered by readiness, then strong observed demand, then the decision engine's rank, and balanced across pillars and clusters by the existing selector. "Sat" shows saturation flags; UNKNOWN saturation is not evidence of a gap.

| # | Working title | Pillar | Tier | Demand | Sat | Rank |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Billions Sit on Unused Gift Cards. Who Keeps the Money? | hidden-business-models | PRODUCTION_READY | UNKNOWN | none flagged | 73.1 |
| 2 | Why Rolex Watches Appreciate | strange-economics | RESEARCH_REQUIRED | 83 (OBSERVED) | none flagged | 64.3 |
| 3 | How Energy Drinks Make Money | hidden-business-models | RESEARCH_REQUIRED | 99 (OBSERVED) | none flagged | 64.3 |
| 4 | How IKEA Makes Money From Meatballs and Candles | hidden-business-models | RESEARCH_REQUIRED | 93 (OBSERVED) | none flagged | 64 |
| 5 | How Subway Makes Money on Sandwiches It Doesn't Own | hidden-business-models | RESEARCH_REQUIRED | 88 (OBSERVED) | none flagged | 63.1 |
| 6 | How Airbnb Makes Money When Hosts Set the Price | hidden-business-models | RESEARCH_REQUIRED | 75 (OBSERVED) | none flagged | 62.6 |
| 7 | How Video Game Consoles Make Money While Being Sold at a Loss | hidden-business-models | RESEARCH_REQUIRED | 73 (OBSERVED) | none flagged | 62 |
| 8 | How Sneakers Make Money From Resale Hype | hidden-business-models | RESEARCH_REQUIRED | 95 (OBSERVED) | none flagged | 61.3 |
| 9 | How Chipotle Prices Its Burritos | company-stories | RESEARCH_REQUIRED | 65 (OBSERVED) | none flagged | 60.4 |
| 10 | How Airlines Make Money From Credit Cards | hidden-business-models | RESEARCH_REQUIRED | 72 (OBSERVED) | HOT (inferred) | 59.5 |
| 11 | Why JCPenney Lost Customers When It Stopped Running Sales | pricing-psychology | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 69.1 |
| 12 | Why Rotisserie Chicken Costs $4.99 at Costco | pricing-psychology | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 68.8 |
| 13 | How Silicon Valley Bank Failed in Days | company-stories | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 68.6 |
| 14 | Why Costco's Food Court Hot Dog Never Changed Price | pricing-psychology | RESEARCH_REQUIRED | 18 (OBSERVED) | none flagged | 68.1 |
| 15 | Why Blockbuster Failed | strange-economics | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67.5 |
| 16 | Why Netflix Ended Password Sharing | pricing-psychology | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67.3 |
| 17 | How FTX Lost Customer Money | company-stories | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67.3 |
| 18 | How WeWork Lost Billions | company-stories | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67 |
| 19 | Why Used Car Prices Jumped | pricing-psychology | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67 |
| 20 | How Amazon Became a Logistics Company | company-stories | RESEARCH_REQUIRED_DEMAND_UNKNOWN | UNKNOWN | none flagged | 67 |

Editorial notes for using the shortlist:
- Research #2–#9 first. They combine strong observed demand with no observed saturation.
- #11–#20 are well-known failure or pricing stories. Their saturation is UNKNOWN, not low, and they need a coverage check before research effort.
- Several titles use the saturated "How X Makes Money" template. They need the curated angle that the gift-card topic got.

## 4. Cost control (implemented)

`core/profitdecoded/budget.js`, `channels/profitdecoded/budget-policy.json`, `core/profitdecoded/auto/llm.js`.

| Requirement | Implementation |
| --- | --- |
| Target $1, max $2 per script; $8 per month for scripts; $2 per month for experiments; default $0 | Policy file: `paidEnabled: false`. Enabling is a reviewed commit. Workflow `max_usd` default is now `0`. Each run declares a pool (`budget_pool`). A script is `topicId:format:version`, and all of its attempts and resumed runs share the $2 limit. |
| Estimate the maximum before every paid call | `estimateMaxUsd`: all input priced as a cache write (1.25× input), the full `max_tokens` as output (adaptive thinking is output), every allowed web search, and a conservative 2.8 chars per token. An unknown model is priced as Opus. |
| Enforced before the call; reserve first | `Budget.reserve` runs before `messages.stream`. Over the per-script or monthly limit → `BUDGET`, and the provider is never contacted (tested). |
| Safe across concurrent workflows | One JSON ledger written with compare-and-swap. The GitHub Contents API `PUT` carries the blob sha; on 409/422 the reservation is re-checked against the newer ledger (tested with interleaved readers). The workflow also runs one job per topic+format (`concurrency`). |
| Persist across Actions runs | Orphan branch `profitdecoded-budget-ledger` holding only `ledger.json`. It is initialised (empty, verified by reading it back). A runner-local file is refused inside GitHub Actions. |
| Recovery after interrupted runs | A reservation older than its TTL (120 minutes) counts as **uncertain**, charged at its maximum, until a human reconciles it against the Anthropic Console (`budget reconcile <id> --actual … --by … --reason …`). |
| No duplicate charges from retries | SDK `maxRetries: 0`; no paid `MAX_TOKENS` regeneration. Idempotency id = hash(script, stage, exact request). An identical request in flight → `IN_FLIGHT`; already paid → `DUPLICATE`. Paying again needs `PD_BUDGET_ALLOW_REPEAT=<id>`. Stage-cache replays make no new reservation. |
| Fail closed | Missing or malformed policy, policy disabled, no store, no token, unreadable, missing or corrupt ledger, an unconfirmed write, or contention: every one of these refuses the call. A paid call without a ledger is refused. All of them map to a safe **pause**, never an approval. |
| Reconcile with actual usage | `settle` records the provider's reported usage at list price (`spend`, which bills cache writes at 1.25×). A definite rejection (4xx except 408, or 529) **releases** the reservation. Anything else stays **uncertain**. |
| Track by topic, script, video, month | Every entry carries `month`, `pool`, `category`, `topicId`, `scriptId`, `videoId`, `runId`, `stage` and `model`. Outcome entries (accepted, rejected, paused, deferred) enable per-accepted-script cost. |
| One automatic targeted rewrite; no full regeneration | Paid runs: `maxAutoRewrites: 1` in total, and the fact-fix counts. Output caps from the policy: plan 12K, draft 32K, rewrite 24K tokens. |
| No silent paid fallback | Server-side model fallbacks are opt-in only (`PD_AUTO_FALLBACKS=1`) and never under a budget. Free stages never switch to Anthropic. |

Worst-case reservations for the gift-card script, using the real prompts against a local ledger with no network: plan **$0.27**, draft **$0.68**, the one rewrite **$0.53**, total **$1.47** if every call used its full output allowance. That is below the $2 limit; actual spend settles lower.

**What application limits cannot guarantee.** This ledger stops *our* code. It cannot stop:
- spend through the same key from elsewhere;
- a provider-side billing difference;
- a bug outside this path.

Account-level safeguards to set before the first paid test:
1. A **dedicated Anthropic Console workspace** for ProfitDecoded, with an API key created in that workspace only. Revoke it when not in use.
2. A **monthly spend limit** on the organisation or workspace in the Console, set to the policy total ($10) or a little above it, with usage alerts.
3. Store the key only as the repository secret `ANTHROPIC_API_KEY`. Never put it in `.env` on shared machines.
4. Check the Console's usage page against `node profitdecoded.js costs` after each paid run.

## 5. Pre-generation filter (implemented)

`core/profitdecoded/eligibility.js`. It runs in `produce()` before any paid call, research included. Every check is free.

| Check | Rule |
| --- | --- |
| Decision engine | Not REJECT. Not REFRESH_RESEARCH (outdated premise). Production pool: cleared for the format (`PRODUCE_LONG`). The experiment pool may waive only the demand clearance. |
| Verified research | A dossier exists and passes the research gate; 2 or more primary sources for long-form |
| Evidence-supported thesis | No quantity or certainty overclaims ("most", "exact", "only a small", "knows"…) and no figures outside the supported claims |
| Supported payoff | The dossier `angle` exists and promises nothing the claims cannot deliver |
| Narrative depth (long) | 8 or more supported claims, at least 1 inference or resolved contradiction, long-form potential 70 or higher (ESTIMATED) |
| Attribution data | Entity map present; every inference carries a checked `calc` |
| Differentiation | Angle originality 60 or higher; an observed HOT/SATURATED topic needs a documented angle |
| Visual production | Visual potential 60 or higher; copyright risk 60 or lower |
| Factual freshness | Time-sensitive premises need research 120 days old or newer |

Results: gift cards are **ELIGIBLE as an experiment** but **DEFERRED for production**, because the decision engine has no observed demand and no documented gap. Gyms are deferred (no attribution data). Costco is deferred (3 sources, 4 supported claims). A deferred topic is never researched with paid tokens.

## 6. Quality control (implemented)

- **Reused unchanged:**
  - deterministic factual checks (numbers, arithmetic `calc`, attribution, scope, labels, editorial rules, spoken ids);
  - plan evidence and repeated figures;
  - retention critic, spoken naturalness, AI-pattern and hook engineering (heuristics, labelled ESTIMATED);
  - Gemini critique and final evaluation.
- **Added:**
  - **Source coverage.** A long-form script must cite every central claim, directly or through our arithmetic on it.
  - **Independent reviewer required for paid runs.** If the critique or evaluation provider matches the writer, the run returns `config-error` before any paid call.
  - **Reviewer failure is never approval.** A Gemini quota or overload error pauses the run (tested).
  - **Critical factual errors block regardless of scores.** A high independent fact-check finding or a `fail` verdict blocks even when every heuristic score is high (tested).
- **Editorial exception mechanism** (`core/profitdecoded/exceptions.js`, `channels/profitdecoded/editorial-exceptions.json`, `profitdecoded.js editorial-exception`):
  - one **retention-heuristic** finding;
  - one **script version** (a hash of the beats);
  - one **exact finding text**;
  - a **named person** (automated identities are refused) and a reason;
  - committed, so the approval is reviewed and auditable;
  - it cannot waive factual, attribution, source, arithmetic, editorial-rule, copyright or security findings, and editing the script invalidates it.
  - `story-review` lists waived and not-applied exceptions.

**The gift-card hook stays blocked.** No exception is recorded, because it needs your approval. To accept it, run:

```
node profitdecoded.js editorial-exception channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude --finding retention:weak-opening --approver "<your name>" --reason "<why>"
```

Then commit the file through a PR. The 80 threshold is unchanged.

## 7. Production cost accounting

`node profitdecoded.js costs [--month YYYY-MM]` reads the ledger and reports by category: research, script, review, voiceover, visuals, render, storage. It separates **actualUsd** (settled usage) from **estimatedUsd** (open or uncertain reservations at their maximum). It also gives cost per attempt, per accepted script, per completed video and per published video.

| Category | How it is incurred today | Actual to date | Basis |
| --- | --- | --- | --- |
| Research | Manual primary sources and free tools; paid research is disabled (the filter requires a dossier) | $0 | no paid call |
| Script generation | Claude, under the ledger | $0 | ledger empty; no paid call made |
| Independent review | Gemini free tier | $0 | free tier; list-price equivalents are in each run's `usage.json` |
| Voiceover | Kokoro TTS, local on the Actions runner | $0 API | public repo: standard runner minutes are free |
| Visual assets | Documented sources (filings, regulators, own graphics) | $0 | no licensed stock |
| Rendering | GitHub Actions runner | $0 | public repo |
| Storage | Actions artifacts (14-day retention) and cache | $0 | the repo's cache is at 5.6 GB of its 10 GB limit (shared with other channels) |

Per attempt, accepted script, completed video and published video: **not yet measurable**. No paid run, completed video or published video exists. The ledger reports `null` rather than a number. No revenue projection is made.

Financial dashboard, designed but not built:
- **Sources:**
  - the ledger branch (`ledger.json`);
  - each run's `usage.json` artifact (free-provider tokens);
  - `inventory-readiness.json`;
  - later, YouTube Analytics *actuals* only.
- **Views:**
  1. Month to date vs limits, per pool, with estimated vs actual.
  2. Cost per script, attempts and outcome (with reasons for rejections).
  3. Cost per accepted script and per completed or published video, over time.
  4. Free-quota consumption per provider and day.
  5. After publishing: revenue per video from Analytics, next to its cost. Never projected.
- **Delivery:** the `costs` command output as a weekly Markdown or JSON artifact. Add a page only when there are enough data points to need one.

## 8. Tests

New `tests/js/profitdecoded-budget.test.js`, 18 tests:
- budget: exhaustion before the call, estimator bounds, monthly rollover and pools;
- concurrent reservations (CAS);
- GitHub ledger sha/409, unreachable and missing ledgers, fail closed;
- provider errors (release vs uncertain) and no SDK retries;
- interrupted runs and reconciliation, in-flight, duplicate and allowed repeats;
- cost report;
- paid story run with policy limits and cache reuse that pays nothing;
- independent reviewer required, reviewer quota pauses;
- one automatic rewrite, factual rejection, no paid regeneration on `MAX_TOKENS`;
- pre-generation filter, a deferred topic makes no paid call;
- source coverage;
- editorial exception validity, including script edits, finding changes, non-waivable findings and automated approvers;
- publish blocked, with the workflow's schedule gate and default $0.

Two existing assertions changed **intentionally**:
- server-side model fallbacks are now opt-in, not default-on;
- a story-test mock client now also implements the non-fallback stream.

No other assertion was changed or weakened.

Results:
- `npm run test:profitdecoded`: **177/177**.
- Full `npm test`: **494/494 JS** and **24/24 Python**.

## 9. API cost and quota risks

| Risk | Status and mitigation |
| --- | --- |
| Claude thinking tokens exceed the cap → `MAX_TOKENS` | The run stops (no paid retry). At most that call's reservation is spent. Tune caps from the first test's measured usage. |
| Price or model changes | The `PRICES` table is in code. An unknown model is priced as Opus. Review prices before enabling paid calls. |
| Lost stage cache (Actions cache eviction; repo at 5.6/10 GB) | A paid stage is refused as `DUPLICATE` instead of paying twice. A human decides whether to repeat it. |
| Gemini free tier | Daily request quotas are small. On 2026-10-09 `gemini-3.8-flash` hit its daily limit after a handful of requests, and an older fallback (`gemini-2.5-flash`) has been retired. Runs pause safely. Schedule paid tests when the Gemini quota is fresh. |
| Groq free tier | 200K tokens/day shared with the FR/IB production; 8K TPM. Groq is the fallback, not the writer. |
| Public repository | The ledger branch and policy are publicly readable: costs and topic ids, no secrets. |
| Application limits are not provider limits | Console workspace spend limit plus a dedicated key (§4). |

## 10. Production safeguards

| Safeguard | State |
| --- | --- |
| ProfitDecoded publishing | **Disabled**: `config.enabled=false`, `platforms.youtube.enabled=false`, dry-run default, no publish flags, human approval for the first 5, no upload code in `produce` |
| Schedules | Unchanged: cron `50 11 * * 1-5`, still gated by `vars.PD_AUTO_SCHEDULE` (unset) |
| Paid API | Disabled by policy; workflow default `max_usd=0`; ledger required; pre-generation filter; independent reviewer |
| Other channels | Untouched: every change is in ProfitDecoded paths and its own workflow |
| Workflow permissions | `profitdecoded-produce` now has `contents: write`, used only for the ledger branch through the Contents API. Documented in the workflow. |

## 11. Recommended configuration for the first controlled Claude API test

1. **Anthropic Console:** a dedicated workspace and key, a monthly spend limit of about $10, usage alerts.
2. **Repository secret** `ANTHROPIC_API_KEY`: the workspace key.
3. **One reviewed PR** setting `"paidEnabled": true` in `channels/profitdecoded/budget-policy.json`. Nothing else changes.
4. **Run it when the Gemini daily quota is fresh**, script only, experiment pool:
   ```
   gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f max_usd=2 -f budget_pool=experiment -f through=script
   ```
   - Expected: three Claude calls at most (plan, draft, at most one rewrite), with a worst-case reservation of $1.47.
   - Gemini critique and evaluation are free.
   - Nothing is narrated, rendered or published.
5. **Afterwards:**
   - `budget status` and `costs`, compared against the Console;
   - `story-review`;
   - a manual source check.
   - Then set `paidEnabled` back to `false` until the result is reviewed.

Gift cards is the right first topic: it is the only verified dossier and allows a direct comparison with the session-written script. Its production long-form stays deferred by the decision engine until demand evidence exists.
