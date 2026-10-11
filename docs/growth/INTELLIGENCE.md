# Competitor intelligence, research queue and first-party checkpoints

Status 2026-10-11. Everything here is read-only against YouTube and makes no paid API call.

## What runs, and what it stores

| Piece | Command | Output | Data source |
| --- | --- | --- | --- |
| Competitor outliers | `node scripts/intel/collect-competitors.js --channel <slug> --auth oauth` (or the manual workflow *Competitor intelligence (read-only)*) | `channels/<slug>/intel/reference-snapshot-<date>.json`, `competitor-insights.{json,md}` | public counts via the channel's **own** credentials |
| Insights from an existing snapshot | `... --from-snapshot <file>` | `competitor-insights.{json,md}` | no API |
| Research queue | `node scripts/intel/research-queue.js --channel <slug>` | `channels/<slug>/intel/research-queue.{json,md}` | topic records + competitor insights |
| ProfitDecoded channel activity | `node scripts/profitdecoded/channel-activity.js --write` | `channels/profitdecoded/state/{channel-activity,manual-uploads}.json`, `state/growth/checkpoints.json` | PD's own OAuth, GET reads only |

## Outlier rules (core/intel/competitor-insights.js)

- Baselines are per channel and per format. A Short is never compared with long-form.
- A video is classified only when it is at least 7 days old and its channel has at least 5 prior videos of the same format.
- Two ratios must agree: views vs the channel median, and views/day vs the median views/day. A breakout needs ≥5× and ≥2×; an outperformer needs ≥2.5× and ≥1.25×. So a video that was simply online longer is not a breakout.
- Each record keeps separate fields:
  - `observed`: public counts, with time and source;
  - `computed`: ratios;
  - `inferred`: title structure, duration vs the channel, recurring subjects, always labelled as hypotheses;
  - `humanReview`: hook, structure, visuals, voice, editing, evidence and thumbnail. These require watching the video and are never inferred.
- Competitor CTR, impressions and retention are private and are never estimated.

## Competitor sets (each channel its own; handles verified 2026-10-11)

| Channel | Direct competitors | Benchmarks |
| --- | --- | --- |
| ProfitDecoded | Micro, Neu, Established Context, Brimm., Tony Talks Business, hidden.eco.nomics (watch), Mr. Finance (format watch) | Company Man, Modern MBA, Wendover Productions, The Fat Files, Logically Answered |
| Failure Reconstructed | Plainly Difficult, Fascinating Horror, Brick Immortar | Practical Engineering, Mentour Pilot (aviation) |
| ImpossibleBrief | What If (Underknown), xkcd's What If? | minutephysics |
| CriticalThread | Asianometry, Practical Engineering | Real Engineering |
| Behind the Ordinary | Technology Connections, Half as Interesting, History of Simple Things | — |

- **ProfitDecoded:** data was collected on 2026-10-11 (12 channels, 285 videos, 37 quota units, 0 refused requests). It found 25 outliers. Among long-form outliers, "why" titles show 1.8× lift, which is anecdotal at n = 9.
- **Shorts channels:** NOT COLLECTED yet. Collection needs each channel's own credentials, through the manual workflow. Behind the Ordinary also needs its OAuth repaired first.

## Research queue

- The queue ranks unresearched topics on: growth video potential (60%), competitor demand on the same subject (25%), and source targets on the record (15%). Crowded subjects (3+ similar competitor videos) lose up to 18 points and are flagged *angle needed*.
- A topic without any source target is not queued.
- The queue decides what to research. The existing verified pipelines do the research and may still reject the topic.

## First-party checkpoints (ProfitDecoded)

- Documentary #1 (`yENBwtfuPyU`, uploaded by hand on 2026-10-10 19:16 UTC) is registered in `manual-uploads.json`, which `analytics-sync.js` now reads. The publishing ledger `published.json` is unchanged.
- At the 6h checkpoint: 1 view, 0 likes, 0 comments, analytics not yet available, diagnosis `INSUFFICIENT_DATA` (no intervention).
- Impressions and CTR are not exposed by the YouTube Analytics API and are recorded as unavailable, never as zero.
