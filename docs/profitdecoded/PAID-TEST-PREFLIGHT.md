# ProfitDecoded: preflight for the first paid Claude API test

Date: 2026-10-09.
Scope: PR #210 (`feat/profitdecoded-production-readiness`, head c8567bc) on `main` 8b45cea.

Nothing was spent:
- no paid API call;
- no Groq call;
- no Gemini generation request;
- `paidEnabled` was not changed;
- nothing was merged.

## Decision

**Technical preflight: GO. Execution today: NO-GO**, pending four user approvals (end of this document).

The code, workflow and ledger are ready, and a dry preflight in GitHub Actions passed. The paid run cannot start, by design, until:
- PR #210 is merged;
- an Anthropic key exists;
- `paidEnabled` is set by a reviewed PR.

## 1. PR #210 review: findings and fixes made in this audit

| Area | Finding | Action |
| --- | --- | --- |
| Budget policy | `paidEnabled: false`; $2 per script; $8 script / $2 experiment per month; one automatic rewrite; independent reviewer required; output caps 12K / 32K / 24K | Correct. Unchanged. |
| Ledger write permission | The job needs `contents: write`, used only for the ledger branch. But `actions/checkout` persisted that token in `.git/config`, so every later step, including `npm install` lifecycle scripts, could have pushed. | **Fixed:** `persist-credentials: false`. The token is passed explicitly only to the preflight, production and ledger-status steps (tested). |
| Workflow triggers | `workflow_dispatch` and the gated schedule only, no `pull_request`, so forks cannot run it with secrets | Correct. |
| GitHub re-runs | A re-run keeps `run_id`, and cache keys are write-once, so the re-run's stage cache was silently not saved. The ledger would then refuse already-paid stages as duplicates rather than charge twice, but the run would stall. | **Fixed:** cache keys include `run_attempt` (tested). |
| Ledger write fails after a successful paid call | The paid output was discarded | **Fixed:** the result is cached, the reservation stays charged at its maximum, and the run pauses. A resume makes no new paid call (tested). |
| Review artifact for failed runs | `review.md` (the source validation) was written only for accepted scripts | **Fixed:** it is also written for failed and paused scripts, and never changes the status. |
| Reviewer availability | Nothing checked Gemini before paid writing | **Added:** a preflight step gates every Anthropic run. It checks the policy, the ledger and remaining pool, Gemini model availability (metadata) **plus one minimal probe request**, the Anthropic key and model (Models API, not billed), eligibility and the publish block. Failure stops the job before production. |
| Structured-output schemas | Claude stage schemas (plan, script, rewrite): every object has `additionalProperties: false`, with no unsupported numeric or string constraints | OK. The evaluation schema has `minimum`/`maximum`. It is sent only to Gemini (as text); a paid run refuses Claude as reviewer. Follow-up only. |
| Request shape vs Opus 5.5 | Adaptive thinking (Opus 5.5 rejects only `disabled` and `enabled` with a budget); `output_config.effort` and `format`; top-level `cache_control`; plan repair appends plain text (no edited thinking blocks) | Valid per the current API reference. |
| Publishing | `publishGuard` BLOCKED (5 conditions); no publish variables; no upload code | Unchanged. |

Tests:
- `npm run test:profitdecoded` 180/180;
- full `npm test` 497/497 JS and 24/24 Python;
- 3 new tests (crash safety, workflow invariants, preflight NO-GO).

One existing assertion was widened narrowly: the cache save must still be `always()`, and it may also skip the check-only preflight.

## 2. Reservations under concurrency, crashes, retries and re-runs

| Scenario | Behaviour |
| --- | --- |
| Two runs at once (any topics) | Compare-and-swap on the ledger blob sha: the loser re-reads and re-checks, so both cannot pass the limit (tested). Same topic and format: the workflow `concurrency` group queues the second run. |
| Crash or cancel mid-call | The reservation stays `reserved` and counts fully. After 120 minutes it becomes `uncertain` at its maximum until a human reconciles it (`budget reconcile`). |
| Retry inside a run | SDK `maxRetries: 0`; no paid regeneration on `MAX_TOKENS`. Every attempt is a separate reservation. |
| Identical request again | `IN_FLIGHT` while reserved; `DUPLICATE` once paid or uncertain. Paying again needs `PD_BUDGET_ALLOW_REPEAT=<id>`. |
| Resume after a pause | Completed stages replay from the stage cache, with no new reservation (tested). |
| GitHub "Re-run jobs" | New cache key per attempt; earlier attempts' caches restored by prefix. Paid stages are not repeated. |
| Ledger unreachable or contended | No paid call (fail closed); the run pauses. |

## 3. Worst-case cost: gift-card script

Pricing per the current Claude API reference: Opus 5.5 (`claude-opus-5-5`) is $4 input / $20 output per million tokens, cache reads $0.20, 5-minute cache writes 1.25× input, 128K max output. `llm.js` uses the same figures.

Reservations computed by the real code with the real prompts (local ledger, mock provider, no network):

| Call | Max output | Maximum reserved |
| --- | --- | --- |
| Plan | 12,000 | $0.2653 |
| Plan repair (only if the plan fails its checks) | 12,000 | $0.2760 |
| Draft (single call, with packaging) | 32,000 | $0.6787 |
| The one automatic rewrite | 24,000 | $0.5277 |
| **Worst case without repair** | | **$1.47** |
| **Worst case with repair** | | **$1.75** |

- Output (adaptive thinking included) is about 92% of the worst case. Input is priced as a cache write throughout.
- Gemini critique and evaluation cost $0 (free tier).
- A likely real cost is below these maxima, because actual output rarely fills `max_tokens`. That is an expectation, not a measurement. The ledger records the real figure.

## 4. The $2 limit

**Application-level enforcement.**
- The run's limit is min(`max_usd`=2, policy $2 per script).
- The experiment pool also has $2 a month in total.
- Every call is reserved at its maximum before sending, so the committed total (settled, plus open, plus uncertain at its maximum) can never pass $2.
- Output is hard-capped by the provider at `max_tokens`. Input is overestimated (2.8 characters per token, priced as a cache write).
- The experiment cannot draw on the $8 script pool: the gift-card topic is DEFERRED there by the decision engine.

**Limitations.** The ledger cannot see or stop:
- the same key used outside this workflow (a local run with a file ledger would not see the GitHub ledger, so never put the key on a laptop);
- a price change not yet reflected in `PRICES`;
- tokenizer counts far above the estimate (input is a small share);
- a provider-side billing difference.

**Provider-side safeguards** (§9): a dedicated Console workspace with its own monthly spend limit and a key that exists only in that workspace. The Console limit is the real backstop; this ledger is not.

## 5. Gemini reviewer availability

A dry preflight ran in GitHub Actions (run 37950423940). Production was skipped, no LLM call was made, and the log has 0 key-like strings.

| Check | Result |
| --- | --- |
| Budget policy | PASS (paid disabled) |
| Ledger | PASS: readable with the workflow token; 2026-10 experiment $0 of $2 |
| Gemini models | PASS: `gemini-3.8-flash`, `3.7-flash`, `3.6-flash` available. Metadata only; **no generation quota used**. |
| Anthropic key | Missing (expected) |
| Eligibility | PASS: ELIGIBLE (experiment; demand not verified) |
| Publishing | PASS: blocked |

The daily generation quota cannot be read without a request. The paid run therefore spends **one** minimal probe request before any paid writing, and stops if the quota is exhausted. The run then needs 2 more Gemini requests: critique and final evaluation.

## 6. Can caches, research or earlier outputs reduce the cost?

| Item | Effect |
| --- | --- |
| Verified research | Reused. Research cost is $0 (the dossier passes every gate; paid research is disabled anyway). |
| Existing stage caches (8, from the Groq runs) | No effect. Cache keys include the provider, so no Groq or Gemini stage is replayed into the Claude stages. |
| Prompt caching | The system plus dossier prefix is cached across plan, draft and rewrite within 5 minutes. That saves part of an input cost that is already about 8% of the worst case. |
| Earlier outputs (the session-written script) | Not reused. The experiment exists to measure the API pipeline's own output and cost. |
| After the first run | Its stage cache makes any resume or re-run free of repeat paid calls. |

The real lever for cost is output length (thinking). Tune the caps and effort from this run's measured usage, not before it.

## 7. Gift-card hook

`story-review` still reports `retention: weak-opening: first-30-seconds reading 79` as BLOCKING for the session-written script, and `editorial-exceptions.json` holds 0 entries. No exception was created. This affects only that script: the paid experiment writes a new script, judged on its own.

## 8. Publishing and scheduling

- **Publishing:** `publishGuard` is BLOCKED by:
  - the dry-run default;
  - `enabled=false`;
  - `youtube.enabled=false`;
  - `PD_PUBLISH` not set;
  - no channel credentials;
  - plus human approval for the first 5.
- **Schedule:** cron `50 11 * * 1-5` is gated by `PD_AUTO_SCHEDULE`, which is not set. The last scheduled runs were skipped.
- **Variables and secrets:** no `PD_PUBLISH`, `PD_LONGFORM_PUBLISH`, `PD_AUTO_SCHEDULE` or `ANTHROPIC_API_KEY` exists.

## 9. Setup, merge procedure and the one-time command

**Anthropic Console.** The Console's labels may differ slightly from these.
1. Sign in at console.anthropic.com with an account that can manage billing.
2. **Workspaces → Create workspace** named `profitdecoded-experiment`.
3. In that workspace's **Limits**, set a **monthly spend limit** of $5, or the lowest value the Console allows above $2.
4. In **Settings → Limits / Billing**, confirm the organisation's spend limit and turn on usage or billing email alerts.
5. **API Keys → Create Key**, inside the `profitdecoded-experiment` workspace, named `profitdecoded-github-experiment`. Copy it once. Do not store it anywhere else.

**GitHub secret:** run this and paste the key at the prompt, so it stays out of shell history.

```
gh secret set ANTHROPIC_API_KEY -R eyazan/youtube-otomasyon
```

**Merge procedure.**
1. Wait for PR #210's CI to finish green on its latest commit. Review it, then merge it **with a merge commit**.
2. Open a **separate one-line PR** changing `"paidEnabled": false` to `true` in `channels/profitdecoded/budget-policy.json`, with nothing else. Wait for green CI and merge it.
3. **Dry preflight from `main`**, with no paid call (it checks the new key through the unbilled Models API):
   ```
   gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f max_usd=2 -f budget_pool=experiment -f through=preflight
   ```
4. **The one-time experiment.** Run it after the Gemini daily quota resets, at midnight Pacific time:
   ```
   gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f max_usd=2 -f budget_pool=experiment -f through=script
   ```
5. **Afterwards**, open a one-line PR setting `paidEnabled` back to `false`. Compare `budget status` and `costs` in the run log with the Console usage page.

## 10. What the test produces

`through=script` stops after the script: no narration, no render, no upload (those steps are skipped). The artifact `profitdecoded-auto-production` contains `channels/profitdecoded/auto/hbm-073-…-long/story/`:

| File | Content |
| --- | --- |
| `plan.json` | The plan |
| `draft.json` | The draft |
| `critique.json` | Gemini critique |
| `evaluation.json` | Gemini final evaluation |
| `final.json` or `latest.json` | The script |
| `meta.json` | Status, reasons, stage log |
| `usage.json` | Per-stage tokens and charges |
| `review.md` | **The source-validation report**: claim-by-claim sources, numbers outside the dossier, attribution and every gate finding |

The run log prints the ledger status and the cost report.

## Remaining approvals required from you

1. **Merge PR #210** once its CI is green.
2. **Create the Anthropic Console workspace, its spend limit and key**, and set the `ANTHROPIC_API_KEY` secret.
3. **Approve and merge the one-line `paidEnabled: true` PR.**
4. **Authorise the single experiment run**: up to $2 of real spend, with a worst case of $1.75 by the ledger's own reservations.

Separately, and optional: whether to accept the session-written script's hook (79 against 80) through an editorial exception. It does not affect this experiment.
