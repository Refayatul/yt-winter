# Multi-channel architecture

## Invariants

1. `config/channels.json` is the only channel registry. Unknown slugs fail closed.
2. `core/channel-context.js` resolves every stateful path and credential namespace before workflow modules load.
3. ImpossibleBrief and CriticalThread never fall back to unscoped `YT_*` credentials. Failure Reconstructed alone may read them during migration.
4. A YouTube write cannot begin until `channels?mine=true` returns the configured expected channel ID. Missing configuration and mismatch both block before duplicate lookup, upload-session creation, playlist writes, or local published-state mutation.
5. Published records carry a `channel` field, and `lib/kutuphane.js` rejects a record for another channel.
6. Retention rules, experiments, analytics checkpoints, topic usage, upload state, scheduler state, notifications, and platform state are stored per channel.
7. Shared resources are serialized: the registry sets one render and one upload at a time. A channel failure is caught at its own workflow step.

## Layout

```text
config/channels.json
channels/
  failure-reconstructed/
    config.json  brand.json  prompts/  analytics/  state/  memory/  reports/
  impossible-brief/
    config.json  brand.json  prompts/  topics/  analytics/  state/  memory/  reports/
  critical-thread/
    config.json  brand.json  prompts/  topics/  analytics/  state/  memory/  reports/
core/
  discovery/ research/ scripting/ visuals/ rendering/ publishing/
  analytics/ retention/ experimentation/ quality/ scheduling/
```

Failure Reconstructed uses `pathMode: legacy-adapter`: its exclusive state continues in the existing `icerik/`, `analytics/`, `analysis/`, `uretim/`, and `channel/` paths, so current scripts and production history are preserved. ImpossibleBrief and CriticalThread use `pathMode: isolated`; all stateful paths resolve below their own channel directories. A future migration can move Failure Reconstructed physically without changing call sites.

## CLI selection

Both forms work:

```bash
node shorts-sira.js --channel impossible-brief
node shorts-sira.js --channel critical-thread
node post-publish-analyzer.js --channel=impossible-brief --due
```

If omitted, the registry default is Failure Reconstructed. Child processes also inherit `YOUTUBE_CHANNEL_SLUG`, while upload commands pass the slug explicitly.

Channel-aware entry points include `shorts-sira.js`, `youtube-yukle.js`, `youtube-yetki.js`, `quality-gate.js`, `yayin-plani.js`, `saglik.js`, `bildirim.js`, `post-publish-analyzer.js`, `dashboard-veri.js`, `channel-plan.js`, and `library-health.js`.

## Authentication and upload sequence

```text
select channel
  → read only the selected channel's configured client/secret/refresh names
  → exchange refresh token
  → channels?part=id,snippet&mine=true
  → compare actual ID with <PREFIX>_YT_CHANNEL_ID
      mismatch/missing → BLOCK, write channel-scoped error, no mutation
      match            → duplicate guard → resumable upload → channel state
```

Prefixes are `FR`, `IB` and `CT`. The live IB/CT client-pair names are `IB_CLIENT_ID`/`IB_CLIENT_SECRET` and `CT_CLIENT_ID`/`CT_CLIENT_SECRET`; refresh secrets remain `IB_YT_REFRESH_TOKEN` and `CT_YT_REFRESH_TOKEN`. Token files are not shared. `secrets/<slug>/` is reserved and gitignored through the repository-wide secret rules; production uses environment/GitHub secrets.

## Scheduling and failure isolation

`portfolio-scheduler.js` reads all three channel cadences and emits an ordered queue. The priority includes FR/IB/CT Shorts and each channel's long-form due item. Only due work appears. `--enqueue` atomically updates each channel's own scheduler file.

`.github/workflows/portfolio-production.yml` runs channel steps sequentially in one job. This physically enforces one render/upload at a time. ImpossibleBrief remains disabled until `IB_PUBLISH=1`; CriticalThread remains disabled until `CT_PUBLISH=1`. This prevents a channel without a verified OAuth identity from consuming its queue. Failure Reconstructed also has a primary daily schedule in `uretim.yml`.

At the configured 16:30 UTC deadline, `production-sla-check.js` verifies repository state, the real YouTube video ID, `publishAt`, final quality gate and notification state. A deployed Cloudflare Worker cron independently sends `repository_dispatch: production-sla-watchdog` at 16:35 UTC. The receiving workflow starts channel-scoped production only after YouTube positively confirms absence, then verifies the SLA again. A human issue is created only if recovery fails. GitHub's own 17:07 watchdog cron is a secondary fallback, not an independent scheduler. Deployment and dispatch self-tests are green; evidence and rotation procedures are in [SCHEDULER-RECOVERY.md](SCHEDULER-RECOVERY.md).

## Analytics, retention, and portfolio reporting

Analytics paths are resolved by channel. `core/retention` filters samples by the selected slug before learning hook, duration, second-beat, visual frequency, question, category, and CTA rules. No cross-channel training sample is accepted.

`portfolio-dashboard.js` shows subscribers, views, watch hours, Shorts feed, CTR, average viewed percentage, subscribers per 1,000 views, publishing success, inventory, best topic/category, cost, and health. Missing API data remains `null`/unavailable rather than being invented.

## Cross-platform preparation

Every channel owns `state/platform-state.json`. Instagram stays disabled. Failure Reconstructed TikTok delivery uses `SEND_TO_USER_INBOX` only: first the exact MP4 from the successful daily YouTube production result, then at most one oldest historical backlog MP4. `icerik/tiktok.json` is checked before every init request and stores the `publishId` immediately, preventing duplicate sends after interrupted polling.
