# ProfitDecoded: runbook for the first controlled Claude API experiment

One script: "Billions Sit on Unused Gift Cards. Who Keeps the Money?" (`hbm-073`, long form).
- Writer: Claude Opus 5.5.
- Independent reviewer: Gemini (free tier).
- Research: the existing verified dossier.
- Stops after the script: **no narration, no rendering, no upload**. Publishing stays disabled.

## What limits the spend

| Layer | Limit |
| --- | --- |
| Anthropic Console (provider side, the real backstop) | A dedicated workspace with a monthly spend limit; its key exists only in that workspace |
| Single-use approval (budget policy plus ledger) | Covers one script (`hbm-073-…:long:v1`) in one pool (`experiment`), until `expiresAt`. Closed in the ledger as soon as the paid production step ends (success, failure, pause, cancellation or timeout). Resumes, re-runs and second dispatches are then refused. |
| Application ledger (`profitdecoded-budget-ledger` branch) | Each call is reserved at its maximum cost **before** sending. Limits: per script $2; experiment pool $2 per month; the run's `max_usd=2` |
| Request configuration | Output caps of 12K, 32K and 24K tokens; no automatic paid retries (SDK `maxRetries: 0`, no paid regeneration on truncation); at most one automatic rewrite |
| Worst case by the ledger's own reservations | $1.47, or $1.75 if the plan needs one repair. The real cost is lower and is recorded. |

## Why scheduled production cannot spend

1. The weekday schedule runs only when the variable `PD_AUTO_SCHEDULE` is `true`. It is not set; recent scheduled runs show "skipped".
2. Even if it ran, a scheduled run has no inputs, so its provider is `groq` and `max_usd` is `0`. It creates no budget ledger, and any Anthropic call without a ledger is refused (tested).
3. The approval covers only `hbm-073…:long:v1` in the `experiment` pool. Scheduled runs are Shorts in the `script` pool.
4. The key is the ProfitDecoded-only secret `PD_ANTHROPIC_API_KEY`. **Do not create `ANTHROPIC_API_KEY`**: `portfolio-production.yml` (FR, IB, CT and BTO long-form lane, hourly) and `bto-research.yml` (daily) read that name. Today they are pinned to `LONGFORM_LLM_PROVIDER=groq`, but their provider code selects Anthropic when that variable is empty and the key exists, and they have no ProfitDecoded budget ledger.

## Step 0: merge the guard PR

The PR adds the single-use approval, the ProfitDecoded-only secret name and the close step. Merge it with a merge commit after green CI. Until it is merged, nothing below works: the workflow on `main` still expects the old secret name and has no approval check.

## Step 1: Anthropic Console (provider-side safeguards)

The Console's labels may differ slightly.
1. Sign in at console.anthropic.com with a billing-capable account. Confirm billing or credits.
2. **Workspaces → Create workspace**: `profitdecoded-experiment`.
3. In that workspace, open **Limits** and set a **monthly spend limit** of $5, or the lowest value allowed above $2.
4. In **Settings → Limits / Billing**, check the organisation-wide limit and turn on usage or billing email notifications.
5. **API Keys → Create Key** with workspace `profitdecoded-experiment` and name `profitdecoded-github-experiment`. Copy it once.

## Step 2: the GitHub secret

Paste the key when prompted, so it is not stored in shell history:

```
gh secret set PD_ANTHROPIC_API_KEY -R eyazan/youtube-otomasyon
```

## Step 3: the approval PR

This is the only file to change: `channels/profitdecoded/budget-policy.json`.
- Set `"paidEnabled": true`.
- Replace `"paidApproval": null` with the block below. Set `expiresAt` to about 48 hours after you merge, so the Gemini quota reset fits inside the window.

```json
"paidApproval": {
 "id": "exp-2026-10-gift-cards-1",
 "scriptId": "hbm-073-how-gift-cards-make-money-for-retailers:long:v1",
 "pool": "experiment",
 "expiresAt": "2026-10-12T18:00:00Z",
 "approvedBy": "<your name>"
}
```

Merge it after green CI. From this moment until the run closes it or it expires, exactly this one script may spend from the experiment pool.

## Step 4: dry preflight (no paid call, no Gemini generation)

```
gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f max_usd=2 -f budget_pool=experiment -f through=preflight
```

The log must show `PREFLIGHT: GO`, with every line passing:

| Check | Expected |
| --- | --- |
| budget-policy | Loads |
| paid-enabled | true |
| budget-ledger | Readable, experiment pool $0 of $2 |
| budget-headroom | Headroom available |
| paid-approval | Usable until `expiresAt` |
| gemini-models | Models available (metadata only) |
| anthropic-key | Key valid, `claude-opus-5-5` available (Models API, not billed) |
| eligibility | ELIGIBLE |
| publishing-blocked | Blocked |

Any FAIL: stop and fix it. The approval stays unused.

## Step 5: the experiment (once)

Run it after the Gemini daily quota resets, at midnight Pacific time.

```
gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f max_usd=2 -f budget_pool=experiment -f through=script
```

What happens, in order:
1. The preflight again, plus **one** minimal Gemini probe request. A NO-GO stops the job before any paid call, and the approval stays unused.
2. Restore the stage cache.
3. Production:
   - Claude plan → Claude draft → Gemini critique → at most one Claude rewrite → Gemini final evaluation;
   - every Claude call is reserved, then settled;
   - **no narration, render or upload steps run** (`through=script`).
4. **The approval is closed** (`always()`), whatever happened in step 3.
5. Save the stage cache, print the ledger status and the cost report, and upload the artifact.

To follow it, find the run id and watch it:

```
gh run list -R eyazan/youtube-otomasyon -w profitdecoded-produce.yml -L 1
```

```
gh run watch <run-id> -R eyazan/youtube-otomasyon
```

## Step 6: what to inspect

Download the artifact:

```
gh run download <run-id> -R eyazan/youtube-otomasyon -n profitdecoded-auto-production -D pd-experiment-1
```

In `pd-experiment-1/channels/profitdecoded/auto/hbm-073-how-gift-cards-make-money-for-retailers-long/story/`:

| File | What to check |
| --- | --- |
| `review.md` | **Source-validation report**: claim-by-claim sources, numbers outside the dossier (must be "none"), attribution, coverage, every gate finding, hook evaluation |
| `final.json` or `latest.json` | The script (`final.json` only if every gate passed) |
| `plan.json` | Thesis and payoff with cited claim ids |
| `critique.json`, `evaluation.json` | Gemini's independent critique and final verdict and scores |
| `meta.json` | Status (`ok` / `script-failed` / `paused` / `deferred`), reasons, stage log |
| `usage.json` | Tokens per stage and provider, and the Anthropic charge at list price |

In the run log, check:
- the preflight lines;
- `paid budget: pool experiment …`;
- the per-stage `cost` lines;
- `paid approval exp-2026-10-gift-cards-1 closed at …`;
- the `budget status` and `costs` output.

The ledger itself:

```
gh api "repos/eyazan/youtube-otomasyon/contents/ledger.json?ref=profitdecoded-budget-ledger" -q .content
```

That prints base64. Pipe it through `base64 --decode` to read the JSON.

Compare the ledger's settled total with the workspace's usage page in the Console. If an entry shows `uncertain`, reconcile it against the Console:

```
node profitdecoded.js budget reconcile <entry-id> --actual <usd> --by "<your name>" --reason "<console figure>"
```

## Step 7: switch paid off in the policy (housekeeping)

The ledger already blocks further paid calls once the approval is closed. Still, open a one-line PR setting `"paidEnabled": false` and `"paidApproval": null`, so the policy file says the same thing. Revoke the key in the Console if no further runs are planned.

## If something goes wrong

| Situation | Result |
| --- | --- |
| Preflight NO-GO | No paid call. The approval stays usable until `expiresAt`. |
| Gemini quota runs out during review | The run **pauses**: no approval of the script, and the approval is closed. Finishing it needs a new approval id: a new PR (same scriptId; completed Claude stages come from the cache, so they are not paid again). |
| Runner dies before the close step | `expiresAt` ends the approval. Any reservation left open is charged at its maximum until reconciled. |
| Second dispatch while the first runs | Queued by the concurrency group. When it starts, the approval is closed and it is refused. |
