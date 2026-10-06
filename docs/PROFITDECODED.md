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

## Voice, render and live data (added in the follow-up)

* **Voice providers** (`core/profitdecoded/tts-provider.js`): `edge-tts` (fallback, never certified; it uses an unofficial Microsoft endpoint, so check its terms before relying on it for a monetized channel), `kokoro` (free, open-source Apache-2.0, CPU; runs in GitHub Actions with a cached model, needs `PD_KOKORO_MODEL`/`PD_KOKORO_VOICES`; never auto-certified, a human listen is required), `google` (Cloud Text-to-Speech, `GOOGLE_TTS_API_KEY`, Chirp 3 HD), `openai` (`OPENAI_API_KEY`, gpt-4o-mini-tts) and `elevenlabs` (`ELEVENLABS_API_KEY` + `PD_ELEVENLABS_VOICE_ID`). Select with `PD_TTS_PROVIDER`. A missing key falls back to edge-tts and says so. Premium providers lift the voice cap, but a human listen is still the last word. Pick by ear with `node scripts/profitdecoded/voice-audition.js [--provider openai]` (samples in `channels/profitdecoded/reports/voice-audition/`).
* **Renderer** (`scripts/profitdecoded/render.js`): brand-system frames (ImageMagick) + zoom/pan/fade per shot (ffmpeg) + the mixed audio -> `out/video.mp4`, then real render QA (probe, decode errors, black frames, duration vs audio) written to `bundle.render`. Every frame carries its source citation. Needs a working ffmpeg: the `profitdecoded-render` workflow builds and uploads the Short on a GitHub runner (artifact `profitdecoded-short-render`).
* **Live competitor data** (`scripts/profitdecoded/collect-competitors.js`, `core/profitdecoded/yt-collector.js`): `PD_YT_API_KEY=... node scripts/profitdecoded/collect-competitors.js` (use `--dry` to see the quota plan). Resolves handles in `channels/profitdecoded/intel/reference-channels.json` (unresolved ones are reported, never guessed), runs keyword discovery per window (finds small-channel outliers), keeps a quota reserve, and writes `snapshot-*.json`, `breakout-feed-*.json`, `collection-report-*.json`. A full run is about 5,700 of the 10,000 free daily units: run weekly.

## Autonomous production (research -> script -> video, dry run)

`node scripts/profitdecoded/auto-produce.js [--topic <id>] [--format short|long] [--through script|audio|render|assess] [--max-usd 3]` (`--dry` prints the plan without a key). Workflow: `profitdecoded-produce.yml` (manual dispatch, needs the `ANTHROPIC_API_KEY` secret, uploads an artifact, never uploads to YouTube).

1. **Pick** the topic with the decision engine (researched dossiers feed it; topics whose research failed are skipped for 7 days).
2. **Research** (`core/profitdecoded/auto/research-agent.js`): Claude (`claude-opus-5-5`, adaptive thinking) searches and reads the web with `web_search` / `web_fetch` (citations on) under `prompts/research.md`, then a second call structures the memo into a dossier. **Code verifies it against what the tools really returned**: a source that was never opened is dropped, a claim whose figures are not in the text of its cited sources is dropped, an inference whose basis was dropped is dropped, and the normal research gate decides. Nothing is "fixed" by weakening a gate: an unverifiable topic is reported `research-failed`.
3. **Script** (`script-agent.js`): hooks (>=6 mechanisms), beats, graphics per beat, 22 titles, 3 thumbnail concepts from the verified claims only, under `prompts/script.md`. Local checks (AI-pattern score, numbers absent from the dossier, hook competition, length, graphics coverage, titles) feed up to 2 targeted rewrite rounds; after that the run fails.
4. Narration, render and the normal assessment run on the bundle (`out/review-report.md`). The result is PUBLISH / REVIEW / REJECT for a human; the publish guard still blocks upload.

**Providers:** `PD_AUTO_PROVIDER=groq|anthropic` (unset: Anthropic if its key exists, else Groq). On **Groq** (free tier, `GROQ_API_KEY`, `openai/gpt-oss-120b`) the model searches with `browser_search` and must write `FACT | URL | QUOTE` lines; the code downloads every cited page itself and keeps a quote only if it appears in the downloaded text, so evidence never rests on the model's word (Groq Compound was retired on 2026-09-21 and `browser_search` returns no page text). Free-tier rate limits (429) are retried with `retry-after`, then reported; a token guard (`PD_AUTO_MAX_TOKENS`, default 400000) stops runaway runs. **Free-tier budget:** Groq limits are per organization and per model (gpt-oss-120b: 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD). Browsing uses the smaller `GROQ_BROWSE_MODEL` (own quota); writing uses `GROQ_MODEL`. A second key in the same organization does not add quota. **Search without browsing tokens:** Groq's `browser_search` loads whole pages into the model's context (about 130,000 tokens per call, so the free 200,000/day allows one run a day). With a search API key (`SERPER_API_KEY`: 2,500 free Google queries, no card; `EXA_API_KEY`: free credits every month, no card; or `TAVILY_API_KEY`) discovery uses the search API instead: Groq only plans 4 queries and writes; the first search is restricted to sec.gov, results are ranked primary > journalism > other, junk hosts are dropped, and every page is downloaded and quote-verified by our code. A run then costs a few tens of thousands of tokens. **Primary sources:** the registrant's latest 10-K is found through the SEC's official JSON APIs and read by us; sec.gov requires a contact e-mail in the User-Agent: set `PD_FETCH_CONTACT` (GitHub variable) to an e-mail address, otherwise SEC pages are refused and the run says so. The writing quality of an open model is lower than Claude's, so the same gates apply and more runs will fail them.

Spend (Anthropic): usage is accumulated per run and estimated from list prices (web search is billed separately); `PD_AUTO_MAX_USD` (default 3) stops the run before the next call. Server-side refusal fallbacks are on by default. The first live run has not happened yet: the code is tested against a mock client only.

## Channel art and setup

`node scripts/profitdecoded/make-channel-art.js` writes the profile picture, banner (with safe-area and circle previews) to `channels/profitdecoded/brand-assets/`. The description text and the YouTube setup checklist (handle candidates, keywords, upload defaults) are in `brand-assets/description.txt` and `brand-assets/channel-setup.md`.

## Known gaps (deliberately not hidden)

* The inventory is 594 **curated hypotheses**, none researched. Ratings are hand-rated 1-5 attributes with documented priors; demand, outlier, saturation, competition and freshness are UNKNOWN until real YouTube data is fed in.
* No YouTube API key was available while building, so the collector and the Competitive Intelligence Engine are verified on labelled mock/synthetic data only; no real competitor data has been collected yet.
* The renderer produces clean typographic/data graphics with simple motion; it is a solid base, not yet the full motion-graphics look (animated charts, real footage). Local render requires a repaired ffmpeg (`sudo xcodebuild -license accept && brew reinstall ffmpeg`) or the CI workflow.
* Voice defaults to edge-tts (fallback) until a premium key is configured. Measured cadence/loudness are real; "sounds human" needs a person's ear.
* Competitor-transcript similarity needs transcripts; until supplied it is flagged unverified.
