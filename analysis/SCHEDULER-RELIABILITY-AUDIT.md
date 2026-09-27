# Scheduler reliability audit — 2026-09-27

PR #26 merged at **12:38:20 UTC** (`c607473`). A fresh GitHub Actions REST API
query at **16:17:14 UTC** returned zero runs with `event == "schedule"` after
that merge.

| Expected slot | Workflow | Actual schedule run |
|---|---|---|
| 14:29 UTC | `yayin-kontrol.yml` | **MISSING** |
| 14:53 UTC | `uretim.yml` | **MISSING** |

Therefore the previous two-workflow cron arrangement was not reliable. Both
workflows depended on the same GitHub scheduler and neither post-merge slot
triggered. The replacement architecture is described in
`docs/PRODUCTION-RELIABILITY.md`: primary GitHub production, an external
Cloudflare Cron dispatch, automatic recovery production, post-recovery SLA
verification and human notification only after recovery failure.
