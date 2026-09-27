# Independent production watchdog

This Cloudflare Worker is the independent daily clock. At 16:35 UTC it sends
`repository_dispatch: production-sla-watchdog` to GitHub. The receiving workflow
runs `production-sla-check.js` and starts production automatically when the
day's scheduled video is missing. GitHub's own 17:07 UTC watchdog cron remains a
secondary fallback, but it is not counted as independent.

Deployment requires a free Cloudflare Workers account and three repository
secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` scoped to edit Workers
- `WATCHDOG_GITHUB_TOKEN`, a fine-grained GitHub token scoped only to this
  repository with Contents: read/write (needed for `repository_dispatch`)

Run the `Deploy independent production watchdog` workflow once. It deploys the
Worker, stores `WATCHDOG_GITHUB_TOKEN` as an encrypted Worker secret, and applies
the Cron Trigger. Neither token is printed. Change the deadline by editing the
cron in `wrangler.toml` and the `PRODUCTION_DEADLINE_UTC` repository variable
together.
