# Production readiness: how Gift Cards V3 was made, and what automatic production does

Checked on `main` at the merge of #222 (2026-10-10).

## The two paths

| Stage | Gift Cards V3 (hand-directed) | Automatic (`auto-produce.js`) | Reusable for #2? |
| --- | --- | --- | --- |
| 1. Research and source validation | The dossier was written in a Claude Code session from primary filings; `Research.gate` | `research-agent.js` (web search plus page verification; Groq, Gemini or Anthropic) → the same gate | **Yes**: the gate, the eligibility check and the EDGAR helper |
| 2. Topic selection | Owner choice, informed by `rank` | `Produce.selectTopic` → the decision engine | **Yes**. The engine still clears no long-form topic without observed demand. |
| 3. Script generation | Written in a Claude Code session (`story-tests/…-claude`), no API cost | `script-agent.js` (staged story engine; a paid model needs `paidEnabled` and an approval) | **Yes**: the session-written path, which costs nothing |
| 4. Independent critique | Gemini (free) blind judgment planned; deterministic `det-eval` | the critic stage | **Yes**: a separate reviewer pass (done for #2) |
| 5. Visual storyboard | `scenes.js` written by hand | `plan-visuals.js` (graphic type per beat) | **Partly**. Diagnostics on an estimated-timing storyboard are new for #2. |
| 6. Scene generation | `scenes.js` on `brand-lib.js`: SVG motion, environments, evidence cards | `render.js`: ImageMagick stills with push or pan | **Yes**: the components. Each film's `scenes.js` is still hand-authored. |
| 7. Narration | Cartesia "Carl", one pass, every sentence cached (7,203 credits) | Kokoro (free, not reviewed) unless Cartesia is configured | **Yes**, with paid approval. Kokoro is not an approved substitute. |
| 8. Audio mixing | `produce-audio.js`: owned procedural score, −14 LUFS, true peak ≤ −1 dBTP | the same | **Yes** |
| 9. Rendering | `render-motion.js`; `revise-master.js` for V2/V3 | `render.js` | **Yes** |
| 10. Visual-diversity diagnostics | `render-motion.js` (before capture) plus `--qa` | `render.js` after every render (PR #221) | **Yes**, now in both paths |
| 11. Mobile readability | browser text bounds at 640 px; source-line size | ImageMagick font size at 640/360 px | **Yes** |
| 12. Technical QA | `qa-media.js`, `visual-metrics.js`, splice continuity | `render.js` probe and decode; dry-run assessment | **Yes** |
| 13. Publishing package | written by hand (title, description, chapters, tags, SRT, licences, checklist) | the dry-run review report | **Partly**. The checklist is reusable; the text is per film. |

## Differences that remain (do not assume automatic quality)

1. **Visuals.** The automatic renderer makes static brand cards with zoom. It cannot produce the environments, evidence cards, camera moves or beat-timed reveals that V3 needed. A documentary still needs a hand-authored `scenes.js`. That takes about a day of authoring, and the reusable components shorten it.
2. **Script quality.** The benchmark (`docs/profitdecoded/MODEL-BENCHMARK.md`) supports, with moderate confidence, that Claude writes better scripts than the free models. Its recommendation is Claude writing, with Gemini (free) as an independent reviewer. The paid writer is disabled. The documentary path uses session-written scripts.
3. **Narration.** Only Cartesia "Carl" is approved. Its use needs a credit approval for each film.
4. **Long-form clearance.** The decision engine blocks long-form until there is observed demand evidence. Every documentary is an owner decision.
5. **The V3 lesson.** V1 needed two revisions because diagnostics ran only after rendering. For #2 they ran on the storyboard, before any frame exists (`storyboard-visual-diversity.md`).
