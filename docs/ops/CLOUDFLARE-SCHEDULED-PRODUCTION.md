# Cloudflare-scheduled production (runbook)

GitHub starts scheduled workflows late or not at all. Measured delays here were 6–13 hours. The
existing Cloudflare Worker, `youtube-production-watchdog`, already starts the 16:35 UTC SLA
watchdog on time. This milestone lets the same Worker also start production and the publication
check. There is no new account, no new scheduler and no new secret.

Everything new is **off by default**. Merging this change does not alter production. Deploying the
Worker only sends dispatches. Those dispatches are verified and then ignored until the owner sets
the repository variables below.

## Schedule (UTC, one Worker, four Cron Triggers)

| Cron (UTC) | Istanbul | Event | Slot | Receiver |
|---|---|---|---|---|
| `5 7 * * *` | 10:05 | `shorts-production` | `production-1` | `portfolio-production.yml` |
| `5 13 * * *` | 16:05 | `shorts-production` | `production-2` (same-day retry) | `portfolio-production.yml` |
| `35 16 * * *` | 19:35 | `production-sla-watchdog` | `sla-watchdog` | `production-watchdog.yml` (unchanged) |
| `5 19 * * *` | 22:05 | `publication-check` | `publication-check` | `yayin-kontrol.yml` |

- The public release stays **21:00 Europe/Istanbul (18:00 UTC)**. It is set in each channel's
  config, never in the Worker.
- 07:05 UTC is after every channel's production time: FR 09:00, IB 09:30 and CT 10:00 Istanbul.
- 19:05 UTC is 65 minutes after release, just past the 60-minute confirmation grace.
- The GitHub crons stay as the **backup**. Every run takes the `portfolio-production`
  concurrency group, so runs never overlap. The calendar makes repeats idempotent: once a day's
  Short exists, later runs of either clock report `NOT_DUE`.

## Dispatch authentication

- `repository_dispatch` already requires a GitHub token with write access. On top of that, every
  Worker dispatch carries the following fields:
  - `correlation_id`, in the form `<slot>-YYYYMMDDTHHMMSSZ-<8 hex>`;
  - `slot`;
  - `fired_at`;
  - `signature_version: "v1"`;
  - an HMAC-SHA256 `signature` over
    `youtube-otomasyon.dispatch.v1 \n event \n correlation_id \n fired_at \n slot`.
- The key is the **existing** `WATCHDOG_GITHUB_TOKEN`. It is already a Worker secret and a
  repository secret, so nothing new has to be created.
- `scripts/verify-dispatch.js` runs in a small `gate` job and rejects the dispatch when any of
  these hold:
  - the event type is wrong;
  - the source is not `cloudflare-cron`;
  - the dispatch is unsigned;
  - the signature is wrong, using a constant-time comparison;
  - the timestamp is more than 2 minutes in the future;
  - the dispatch is older than 6 hours, which limits replay;
  - the correlation ID or slot is malformed.
- It never prints the key or the signature.
- The correlation ID is shown in the run log. It is also saved in the run's stage record as
  `trigger.correlationId`, next to `targetDay`.
- The watchdog receiver is unchanged. Its payload keeps every field it read before and gains the
  signature fields, which it ignores.

## Feature flags and safe defaults

| Setting | Where | Default | Effect when set |
|---|---|---|---|
| `CF_PRODUCTION_DISPATCH` | repository variable | unset | `1`: a verified `shorts-production` dispatch runs the portfolio production, which publishes like a schedule run |
| `CF_PUBLICATION_DISPATCH` | repository variable | unset | `1`: a verified `publication-check` dispatch runs the read-only publication check |
| `publishingCadence.shorts.leadDays` | channel config | `0` | `1`: produce the next day's Short once today's slot is filled or closed |
| `publishingCadence.shorts.retryBudget` | channel config | `{topics: 5, render: 3, upload: 2}` | Overrides the per-target-day limits |

Manual (`workflow_dispatch`) runs keep their per-channel `*_PUBLISH` variables. The Hidden Logic
of Things (BTO) stays opt-in through `BTO_PUBLISH`. ProfitDecoded is not touched.

## Retry budgets and duplicate prevention

- **Per channel, per target publication day**, stored in `<channel state>/ops/attempts.json`
  (`lib/attempt-budget.js`). The limits count three things:
  - topics that passed the pre-render gate (5);
  - renders started (3);
  - upload attempts (2).
- A spent budget ends the run as `PRODUCTION_FAILED: RETRY_BUDGET_EXHAUSTED` and raises an alert.
  The topic is kept. Other channels and other days are unaffected.
- An infrastructure outage before rendering or uploading gives back that topic's topic and render
  attempts. This covers a refused narration provider and an unreachable asset source. A morning
  outage therefore cannot spend the day's budget and block a recovered provider later the same
  day. Upload attempts are never given back.
- **One deterministic slot per target day.** `youtube-yukle.js` receives `SHORTS_TARGET_DAY` and
  asks `Calendar.publishSlot(..., { targetDay })` for exactly that day's 21:00 slot.
  - A taken slot is refused (`PUBLISH_SLOT_TAKEN`), and so is a missed one (`PUBLISH_SLOT_MISSED`).
    Either way the uploader exits 16 and the outcome is `PRODUCTION_FAILED`.
  - A failed or late day is **never moved** to another day.
- **Uploaded but not recorded.** The uploader's idempotency journal is checked first, then
  YouTube's uploads playlist. A retry for the same target day asks for the same publishAt, and
  `matchRemote` finds the earlier video by title or by that exact slot. The uploader then
  re-records that video instead of uploading a second copy.
  - If YouTube cannot be read, the uploader fails closed (`RECONCILE_UNAVAILABLE`, exit 9).
- **Read-back after upload.** `Safety.verifyScheduled` reads `videos.list` and requires
  `privacyStatus: private` and the exact `publishAt`.
  - On success it records `publish.scheduled_verified`.
  - YouTube can lag a few seconds after an upload. A video not yet returned, or an unreadable API,
    is read again: 3 reads, 10 seconds apart. A privacy or publishAt mismatch is final at once.
  - A mismatch or a still-unreadable API exits 15. The topic is marked as spent, so the same
    story is never produced a second time. The outcome becomes `PUBLISH_VERIFICATION_FAILED`,
    an alert is raised, and **nothing is re-uploaded**.
- **Scheduled is not published.** `PUBLICATION_CONFIRMED` requires YouTube to report the video
  public (the `publish.public` event). The 19:05 UTC check writes a 3-day evidence table to the
  run summary. The states are `SCHEDULED`, `PUBLICATION_PENDING_CHECK`, `PUBLICATION_CONFIRMED`
  and `PUBLICATION_NOT_CONFIRMED`.

Voice approval, licensing, the upload narration guard (exit 14) and every quality gate are
unchanged. A dispatch-triggered run passes through exactly the same checks as a schedule run.

## Cloudflare plan assumptions

- Workers **Free** allows **5 Cron Triggers per account**; Workers Paid allows 250. This Worker
  uses 4.
- **Not verified:** the live Cloudflare configuration could not be inspected from this session.
  There are no Cloudflare credentials here, and the documentation domain is blocked. Before
  deploying, the owner should confirm two things:
  1. the plan (Free or Paid);
  2. that no other Worker on the account uses more than 1 Cron Trigger.

  If the account is at its limit, the deploy fails at the Cron Trigger step and the previous
  Worker version stays live.
- `deploy-watchdog.yml` refuses to deploy unless `DISPATCH_CRONS` equals the `wrangler.toml`
  crons, includes the watchdog cron and has at most 5 entries. After deploying it checks that
  Cloudflare reports every cron and that `/health` lists the same schedule with
  `signatureVersion: "v1"`.
- The free plan's CPU limit is not a concern: each invocation is one HMAC and one HTTPS request.

## Required existing secrets and permissions (none are new; none were modified)

| Secret | Used by | Permission |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `deploy-watchdog.yml` | — |
| `CLOUDFLARE_API_TOKEN` | `deploy-watchdog.yml` | Workers Scripts: Edit (Cron Triggers are part of the script) |
| `WATCHDOG_GITHUB_TOKEN` | Worker secret (dispatch and signing) and repository secret (`verify-dispatch.js`) | Fine-grained, this repository only, **Contents: Read and write** |

The YouTube OAuth secrets are unchanged. The production workflows already read them.

## Partial deployment

`wrangler deploy` uploads the script first and updates the Cron Triggers second. If the
trigger update fails (for example, the account's cron limit is reached), the new script is live
with the old `35 16 * * *` trigger. The new script maps that cron to the same watchdog event, so
the watchdog keeps working. A regression test covers this. The deploy workflow then turns red at
its schedule check.

## Deployment (owner)

Deploy only through **Deploy independent production watchdog** (`deploy-watchdog.yml`), run from
`main`. Its `mode` input defaults to `preflight`, which is read-only.

1. **Preflight.** Run the workflow with `mode: preflight`. It changes nothing in Cloudflare. It:
   - refuses (exit 7) when `CF_PRODUCTION_DISPATCH` or `CF_PUBLICATION_DISPATCH` is `1`;
   - lists every Worker on the account and counts their Cron Triggers;
   - refuses (exit 9) when the Cron Triggers on other Workers plus this Worker's 4 exceed the limit
     (5, the Free limit, unless the repository variable `CF_WORKERS_PLAN=paid`);
   - refuses (exit 8) when the token cannot list Workers or read their schedules;
   - writes the currently deployed version, commit and triggers to the run summary, and saves the
     `deployments-before.json` and `health-before.json` evidence.
2. **Go/no-go.** Continue only if the preflight is green, the summary shows ≤ 1 Cron Trigger on
   other Workers (on Free), and the current watchdog reports `tokenConfigured: true`.
3. **Deploy.** Run the workflow again with `mode: deploy` and `confirm_flags_enabled` left off.
   The preflight runs again, then the workflow:
   1. stores the token;
   2. deploys the Worker with the four crons;
   3. verifies the deployment list, the four schedules and `/health` (`signatureVersion: v1`,
      same commit).
4. Run **Watchdog repository_dispatch self-test** to confirm the token still works.
5. **Watch one day with the flags unset.**
   - At 07:05, 13:05 and 19:05 UTC, gate-only runs of *Multi-channel portfolio production* and
     *Gunluk kontrol* should log `Dispatch verified … correlation …` and then the "nothing is
     produced" / "nothing runs" notice. The production or check job should be skipped.
   - At 16:35 UTC the watchdog should run exactly as before.
   - A `Dispatch rejected` error means signing is misconfigured. Fix it before enabling anything.
6. Set `CF_PUBLICATION_DISPATCH=1` (read-only towards YouTube). After a clean day, consider
   `CF_PRODUCTION_DISPATCH=1`. That second flag needs a separate owner decision and a working
   narration provider.

## Rollback

| Goal | Action |
|---|---|
| Stop dispatch-driven production immediately | Unset `CF_PRODUCTION_DISPATCH` and/or `CF_PUBLICATION_DISPATCH`. Runs end at the gate. GitHub crons and the watchdog continue. |
| Return to the single watchdog cron (code **and** crons) | Create a branch at the last pre-#263 commit, for example `git push origin 55db5a51:refs/heads/watchdog-rollback`. Then run *Deploy independent production watchdog* with **Use workflow from: `watchdog-rollback`**. That version's `wrangler.toml` has only `35 16 * * *`, and `wrangler deploy` replaces the Worker code and all its Cron Triggers in one run. Its verify step checks the single cron and `/health`. Delete the branch afterwards. |
| **Do not** use the Cloudflare dashboard's version rollback | Cron Triggers are not part of a Worker version. A rolled-back old script would keep all four crons, and the old script sends the watchdog event for *every* cron. That means four watchdog runs a day: 07:05 and 13:05 are harmless because they come before the deadline, but at 19:05 an empty day would be "recovered" after the 21:00 release. Always roll back by redeploying from the repository. |
| Stop ahead-of-time production | Set `leadDays` back to `0`. Short already scheduled for future days stay scheduled. Delete them in YouTube Studio only if needed. |

## Activating `leadDays: 1` (not enabled; owner decision)

1. First run with `CF_PRODUCTION_DISPATCH=1` for at least a week with no
   `PUBLISH_VERIFICATION_FAILED` and no `RETRY_BUDGET_EXHAUSTED`.
2. Set `"leadDays": 1` in **one** channel's `publishingCadence.shorts` (FR first) in a PR.
3. Expected behaviour:
   - The 07:05 run still produces **today** when today is empty.
   - Once today is filled (or its window has closed), the next run produces tomorrow's Short as a
     private upload with publishAt tomorrow 21:00 Istanbul, after full quality approval.
   - From then on, each day's 07:05 run produces the following day.
4. Verify the private upload in YouTube Studio and the `publish.scheduled_verified` event with
   `targetDay` set to tomorrow.
5. After a stable week, repeat for IB and then CT. CT stays at bucket A with viral score ≥ 75.

## Remaining risks and owner approvals

- **Live Cloudflare state is unverified** (plan, cron slots in use, current deployed version).
  Owner approval is needed to deploy.
- **The signing key is the dispatch token.** Rotating `WATCHDOG_GITHUB_TOKEN` requires updating
  the Worker secret (rerun the deploy) and the repository secret together. Otherwise every
  dispatch is rejected until both match. This fails safe: the GitHub crons remain.
- **Remote slot matching is coarse.** Any video on the channel within 60 seconds of the target
  slot is treated as the day's Short and recorded under the current slug. This behaviour predates
  this change. A manually scheduled video at 21:00 would block that day's automatic Short.
- **A rejected read-back leaves a private video.** It stays scheduled; nothing is deleted
  automatically. The owner checks it in YouTube Studio.
- **The publication check uses the YouTube Data API quota.** It is a small read, already used by
  the existing crons.
- **One shared concurrency group.** Seven workflows use `portfolio-production`. GitHub keeps one
  running and one pending run per group, and a newer pending run cancels the older one. A
  pending `shorts-production` dispatch can therefore be replaced by, say, a `yayin-kontrol` cron
  while a long run is in progress. The 13:05 retry dispatch and the GitHub crons cover this, but
  it is not exactly-once.
- **The signature is not a defence against a leaked token.** It proves a dispatch came from a
  holder of `WATCHDOG_GITHUB_TOKEN`. Anyone with that token could sign, and could also write to
  the repository. Its value is rejecting dispatches sent with any *other* credential, and
  rejecting replays older than 6 hours. A replay inside 6 hours is harmless, because production is
  idempotent per target day.
- **The token is visible to two more jobs.** The two gate jobs read `WATCHDOG_GITHUB_TOKEN` (as
  the HMAC key) on `repository_dispatch` only. They run code from the default branch.
- **Owner approvals still pending** (unchanged by this PR):
  - Kokoro and other fallback voices;
  - any paid TTS (Azure);
  - Shorts craft v2;
  - enabling the two flags and `leadDays`.
