# ProfitDecoded — the business behind everyday life

ProfitDecoded is the fifth channel. It is built as a **premium, AI-operated business media brand**, not a content mill:
quality gates decide whether a video exists at all, and **a missed upload is always preferred to a mediocre one**.

**Status: SHADOW.** Registered in `config/channels.json` with `enabled: false`. It never enters the live portfolio queue, cannot upload, and every gate below runs in dry-run only. Nothing here has been published.

## Isolation

| Concern | Where it lives |
|---|---|
| Config, brand, prompts | `channels/profitdecoded/{config,brand}.json`, `prompts/` |
| Credentials | `PD_YT_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN / _CHANNEL_ID` only (no legacy `YT_*` fallback) |
| Topic inventory | `channels/profitdecoded/topics/topic-universe.json` |
| Research dossiers | `channels/profitdecoded/research/` |
| Learning memory | `channels/profitdecoded/memory/learning.json` (writes outside the channel folder throw) |
| State / upload registry / analytics | `channels/profitdecoded/{state,analytics}/` via the shared `Channel` context |
| Code | `core/profitdecoded/` — no existing channel imports it (tested) |

Shared-code change (backward compatible): `Channel.activeSlugs()` + portfolio loops (`growth.js`, `oauth-health.js`, simulations, reports) now iterate **enabled** channels only. The four live channels are all enabled, so their behaviour is unchanged (baseline 293 JS tests still pass).

## Pipeline (research before script)

```
topic → decision engine → research dossier → source gate → thesis → hook competition
      → title (20+) & thumbnail (3+) candidates → script → AI-pattern check → narration
      → visual plan (intent per beat) → visual/script QA → similarity → quality + humanness
      → hard gates → PUBLISH / REVIEW / REJECT + human review report
```

* `core/profitdecoded/topic-scoring.js` — 18-dimension scoring, geometric "familiar × surprising × money × curious" core.
* `competitive.js` — outlier score (views/subs, vs median, vs mean, velocity, engagement, topic recurrence, small-channel bonus), breakout feed over 7/30/90/365 days, saturation (EARLY/GROWING/HOT/SATURATED/DECLINING), gap analysis, optional live fetch (`PD_YT_API_KEY`).
* `revenue.js` — Revenue Opportunity (relative VERY LOW…VERY HIGH, always ESTIMATED), Value-per-view, Expected Business Value = floored weighted geometric mean (formula in the file header; weights in `channels/profitdecoded/decision-weights.json`).
* `decision.js` — final engine; winner = highest **expected business value** among topics that clear evidence gates.
* `portfolio.js` — REACH/REVENUE/EVERGREEN/AUTHORITY/TREND/EXPERIMENT allocation (30/25/20/10/10/5) and topic clusters.
* `research.js` — dossier gate: source tiers (primary/authoritative > credible secondary > weak; Wikipedia never a backbone), central claims need primary support, contradictions logged, our own arithmetic must be declared as an *inference* resting on supported claims, any script number absent from the dossier is rejected.
* `hooks.js`, `titles.js`, `thumbnails.js` — hook competition (≥5 candidates, ≥4 distinct mechanisms), first-30-second score, title truthfulness against the research, thumbnail concept scoring.
* `ai-patterns.js` — deterministic AI-writing detector (stock phrases, rhythm uniformity, rhetorical-question rate, tricolons, em dashes, repeated openers, conclusion-repeats-intro).
* `narration.js`, `wav.js` — speech normalisation (money, %, years, decimals, acronyms, brand lexicon `channels/profitdecoded/pronunciation.json`), text QA before rendering, cadence/pause naturalness, clipping/loudness measured from the real take (dependency-free BS.1770 meter; ffmpeg optional).
* `visuals.js` — visual intent per beat, density-driven shot planning (no fixed interval), QA: relevance per beat, generic-stock cap and sequence ban, licence status per asset, repeated B-roll, AI-share cap, legibility, dead stretches.
* `similarity.js` — script/hook/structure/music/thumbnail/title-pattern similarity against recent episodes and (when supplied) competitor transcripts.
* `quality.js` — weighted quality score (spec weights, 100 total), 20+ hard gates with exact reasons, Humanness score (target ≥ 90, hard reject < 85 on measured components), Premium Media Test.
* `learning.js` — Short classification (strong topic / strong hook / weak hook / weak payoff / weak topic / insufficient evidence), velocity profile, shrinkage + winsorising rolling aggregates, 75/25 explore/exploit, Short→long boosts with cooldown and saturation guards, retention-drop cause classifier, revenue only when observed.
* `schedule.js` — shadow schedule (US-Eastern windows, DST-correct, production at :50 UTC away from existing cron minutes) and `publishGuard()`.

## Provenance rule

Every decision signal is `OBSERVED` (real analytics), `ESTIMATED` (documented heuristic), `INFERRED` (derived) or `UNKNOWN`. UNKNOWN scores pessimistically, lowers confidence and **blocks PUBLISH** — it is never turned into a favourable number. Revenue categories are relative and never contain invented CPM/RPM.

## Commands

```bash
node profitdecoded.js inventory                  # inventory stats
node profitdecoded.js rank --top 20 --write      # decision engine over the inventory (+ researched dossiers)
node profitdecoded.js breakout --snapshot s.json # outlier/breakout feed from a channel snapshot
node profitdecoded.js plan                       # shadow schedule
node profitdecoded.js clusters                   # topic clusters
node profitdecoded.js publish-check              # lists every reason publishing is blocked
node scripts/profitdecoded/produce-audio.js <bundle.json>   # voice + original music bed + loudness
node profitdecoded.js dry-run <bundle.json>      # full assessment + review report (never uploads)
node scripts/profitdecoded/storyboard.js <bundle.json>      # review storyboard + thumbnail concept boards
npm run test:profitdecoded
```

## Human review artifacts

`channels/profitdecoded/dryruns/short-costco-membership/` and `…/long-planet-fitness-capacity/`:
`bundle.json` (inputs), `out/review-report.md` (read this first), `out/assessment.json`, `out/narration-mix.m4a` (listen!), `out/storyboard.png`, `out/thumb-*.png` (concept boards, not final art).
Research dossiers: `channels/profitdecoded/research/`. Ranking: `channels/profitdecoded/reports/topic-ranking.txt`, top-5 notes: `reports/top5-manual-review.md`.

## Enabling real publishing (all steps are human)

1. Create the ProfitDecoded YouTube channel; run the OAuth flow (`node youtube-yetki.js --channel profitdecoded`); store `PD_YT_*` as repo secrets; set `youtubeChannelId` in `config.json`.
2. Decide the narration voice. `edge-tts` is only a fallback and is capped at REVIEW. Either approve a human listen (`narration.humanListenApproved`) or wire a premium provider.
3. Build/verify the real renderer (see Known gaps) and let render QA inspect an actual mp4.
4. Provide `PD_YT_API_KEY`, snapshot competitor channels, run `breakout`, record gap analyses. Long-form stays blocked until demand evidence is OBSERVED or a Short wins.
5. Review the first dry-runs; record approvals (first 5 videos need human approval).
6. Only then flip `enabled`, `platforms.youtube.enabled`, set `PD_PUBLISH=1` (Shorts) / `PD_LONGFORM_PUBLISH=1`, and add the channel to `portfolio-production.yml`. Keep `maxConcurrentRenders: 1`.

## Known gaps (deliberately not hidden)

* The inventory is 594 **curated hypotheses**, none researched. Ratings are hand-rated 1-5 attributes with documented priors; demand, outlier, saturation, competition and freshness are UNKNOWN until real YouTube data is fed in.
* No YouTube/competitor API data was available, so the Competitive Intelligence Engine is verified on labelled synthetic fixtures only.
* The mp4 renderer for ProfitDecoded's motion-graphics look is **not built**; the local ffmpeg on the authoring machine was also broken (`libx265.199`). The dry-runs therefore contain audio + storyboard + thumbnail concept boards, and render QA is UNKNOWN (which keeps both at REVIEW).
* Voice is edge-tts (fallback). Measured cadence/loudness are real; "sounds human" needs a person's ear.
* Competitor-transcript similarity needs transcripts; until supplied it is flagged unverified.
