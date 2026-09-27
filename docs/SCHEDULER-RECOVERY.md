# Scheduler and recovery

## Current paths

1. `portfolio-production.yml` and `uretim.yml` are GitHub cron producers.
2. `yayin-kontrol.yml` is an additional GitHub-native producer/checker.
3. `production-watchdog.yml` checks the 16:30 UTC production SLA, starts idempotent recovery, verifies YouTube through the API, and alerts only after recovery failure.
4. `ops/production-watchdog-worker` is the independent Cloudflare Cron trigger. It sends `repository_dispatch: production-sla-watchdog` at 16:35 UTC.

Multiple GitHub workflows are useful retries but remain one failure domain. The Cloudflare trigger is the only independent path in this design.

## SLA invariant

By the deadline, each enabled channel must have a final `PUBLISH` decision, a valid YouTube video ID, and a same-date `publishAt`; otherwise automatic recovery starts. `production-sla-check.js` emits machine-readable lifecycle fields and exits `2` for an unhealthy SLA. Human notification happens only after the recovery job fails its follow-up verification.

## One-time Cloudflare deployment

Create a Cloudflare API token limited to Workers Scripts edit for the chosen account. Create a fine-grained GitHub token limited to this repository with Actions read/write (enough to create `repository_dispatch`; do not grant organization/admin access). Add these Actions secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
WATCHDOG_GITHUB_TOKEN
```

Then run Actions → `Deploy independent production watchdog` once. The workflow stores the GitHub token as a Worker secret and deploys the cron; neither token is placed in code or Wrangler config.

Validate with:

```bash
node production-sla-check.js --channel failure-reconstructed
```

and Actions → `Production SLA watchdog and automatic recovery` → `simulate_missing=true`. The simulation must show a missing SLA followed by a successful no-upload recovery job.

## Idempotency

- Shared production workflows use `concurrency: portfolio-production`, `cancel-in-progress: false`.
- The publication calendar rejects an already-filled day.
- YouTube checks the authenticated destination, registry, and matching channel title before creating an upload session.
- TikTok persists `publishId` before status polling; any existing ID blocks another init request.
- Today's TikTok send consumes the successful YouTube production result and verifies the artifact SHA-256.

## Rotation

Rotate the Worker GitHub token by updating the Actions secret and rerunning the deployment workflow. Rotate the Cloudflare deployment token independently. The Worker response never includes token values.

## Current limitation

Cloudflare is repository-ready but not deployed because the three deployment secrets are absent. ImpossibleBrief SLA publishing remains intentionally inactive until `IB_PUBLISH=1` and its isolated OAuth identity are configured.
