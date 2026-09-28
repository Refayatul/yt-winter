# Operations runbook

## Daily source of truth

Run `node daily-operations-report.js`. It writes:

- `reports/daily-operations.json` for machines;
- `reports/daily-operations.md` for the owner.

For each channel it shows today's topic, Short/long status, quality, YouTube schedule/video ID, analytics availability, scheduler health, ready backlog, and errors. Failure Reconstructed also shows TikTok today/backlog status. Missing analytics remain `unavailable`/`null`.

## Normal unattended day

Failure Reconstructed requires no manual GitHub trigger. A GitHub schedule produces a Short; the video is uploaded private with `publishAt`; the exact successful MP4 goes to TikTok inbox; one oldest TikTok backlog item follows while backlog exists; analytics/checkpoints and state are committed. The SLA watchdog retries production if needed. TikTok still requires opening the authorized account's inbox item and manually posting it.

ImpossibleBrief follows the same scheduled Short path only after `IB_PUBLISH=1` and its isolated OAuth values are configured. Until then, workflow steps remain skipped by design.

## Triage order

1. Read `reports/daily-operations.md`.
2. If YouTube is missing after 16:30 UTC, inspect the watchdog recovery run, not every cron run.
3. Run `node production-sla-check.js --channel <slug> --verify-youtube` with authorized credentials.
4. For TikTok, dispatch `Failure Reconstructed production` with operation `tiktok-diagnose`. Do not resend a slug with a durable `publishId`.
5. For OAuth `invalid_grant`, disable only the affected channel publish variable, re-authorize that channel, replace its prefixed secret, health-check, then re-enable.
6. For `CHANNEL_ID_MISMATCH` or `TT_ACCOUNT_MISMATCH`, stop. Correct the expected ID/token; never override the guard.

## Quality outcomes

- `PUBLISH`: eligible for upload and schedule.
- `REVIEW`: never uploaded; stored by spec hash in `review.json`/`inceleme.json`; the queue tries another topic. Edit the spec to make it eligible for a new evaluation.
- `BLOCK`: never uploaded; stored by spec hash in `blocked.json`/`engellenen.json`.

## Current manual duties

- Deploy the independent Cloudflare watchdog once.
- Complete ImpossibleBrief Google OAuth once.
- Review/post TikTok inbox drafts.
- Expand source-checked inventories; current targets are not met.
- Long-form remains a separate product gap and is not silently marked complete.
