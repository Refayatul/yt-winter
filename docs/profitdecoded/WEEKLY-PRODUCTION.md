# ProfitDecoded weekly production model (proposal, not scheduled)

The target is one 8–12 minute documentary a week. Quality comes first: a film that fails a gate or a human review slips a week rather than shipping. **No schedule is enabled.** `PD_AUTO_SCHEDULE` and `PD_PUBLISH` stay unset, `paidEnabled` stays false, and nothing here creates a cron job.

## The production path that made Gift Cards V3 (reuse it; do not build a second one)

| Step | Tool (already on `main`) | Runs | Gate |
| --- | --- | --- | --- |
| Topic shortlist | `profitdecoded.js rank --snapshot intel/snapshot-*.json`; `competitive.gapAnalysis` | automatic, free | none: the owner picks |
| Research dossier | primary filings via EDGAR (`PD_FETCH_CONTACT` user agent); the dossier JSON with verbatim passages | Claude Code session, free | `Research.gate` (long ≥ 8 supported claims, ≥ 2 primary sources); `eligibility.check` |
| Story plan and script | `channels/profitdecoded/films/<id>/story/` (`meta`, `plan`, `draft`, `latest`) | Claude Code session, free | `profitdecoded.js story-review` (plan checks, attribution, one home per figure, hooks, first 30 s, AI patterns); an independent critique (a separate reviewer) |
| Storyboard | `films/<id>/storyboard.json` → `visual-diversity.analyze` on estimated timings | session, free | diagnostics: dark runs, chart or layout runs, context gaps, low variety |
| Scenes | `films/<id>/scenes.js` on `brand-lib.js` (`PD.environment`, `evidenceCard`, `sourceCompact`) | session, free | `render-motion.js --analyze-only` (phone text, source lines, alignment) and `--stills` review |
| Narration | `produce-audio.js` with Cartesia, the approved "Carl" voice; every sentence cached | **paid, needs approval** | `PD_CARTESIA_MAX_CHARS` cap; pronunciation lexicon; a human listen |
| Render | `render-motion.js` (full); `revise-master.js` for targeted fixes | local or CI, free | `qa-media.js` (hard checks), `visual-metrics.js`, splice continuity |
| Package | title, description, chapters, tags, thumbnail, SRT, licences | session, free | the human approval checklist (first 5 videos) |
| Upload | **manual in YouTube Studio** | human | `youtube-auth-check.js` VERIFIED; the human approval is recorded |

The autonomous path (`auto-produce.js` → `render.js`, ImageMagick stills with push or pan motion) is **not** the documentary path. It now writes the same advisory visual diagnostics, but its visual system cannot reach V3 quality. Keep it for Shorts experiments.

## The week

| Day | Work | Automatic | Needs a human |
| --- | --- | --- | --- |
| 1 · Topic and research | Rank, check primary sources, build the dossier, research gate | rank, gate, eligibility | **Approve the topic** (the engine clears no long-form topic without observed demand) |
| 2 · Script | Plan, draft, `story-review`, independent critique, revise | gates, critique pass | **Approve the script** (read it aloud once) |
| 3 · Storyboard | Shot list → diagnostics; scenes.js; still frames at phone size | diagnostics, analyze-only, stills | Glance at the stills (5 min) |
| 4 · Narration and scenes | Cartesia narration (cached), music, mix; finish the scenes | mix and loudness checks | **Approve the paid narration** (credits) |
| 5 · Assembly and QA | Full render, `qa-media`, diagnostics with `--qa`, contact sheet, 720p preview | all hard checks | none (fix any failures) |
| 6 · Review and corrections | Watch and listen in full, on desktop and phone; targeted `revise-master` fixes | splice checks | **Full human watch and listen** |
| 7 · Publish | Package and checklist; manual Private upload, then public | auth check | **Explicit publish approval (1 of 5)** |

Each week therefore needs four short owner decisions: topic, script, narration credits, and final publication. Two of them, the topic and the script, can happen on the same day.

## Cost per film (from film 1 actuals)

- **Narration:** about 7,000–8,000 Cartesia credits, which is 1 credit per character sent. The Pro plan is $5 a month for 100K credits (docs.cartesia.ai, checked 2026-10-09). Four films a month use about 30K credits, inside the allowance. Re-mixes are free because every sentence is cached.
- **Everything else:** $0. That covers research, script, storyboard, render, QA and the SEC and YouTube read APIs. The Anthropic API is not used; scripts are written in a Claude Code session, as film 1's was.
