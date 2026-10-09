# ProfitDecoded: first full documentary ("Billions Sit on Unused Gift Cards. Who Keeps the Money?")

Status on 2026-10-09: stopped at two approvals (Haiku spend, narrator). Nothing is published; no YouTube upload; no merge.

## 1. Production readiness

| Item | State |
| --- | --- |
| PR #212 (strategy) | Open, CI green, mergeable. Not touched. |
| PR #213 (prototype, renderer, fonts, QA) | Open, CI green (9/9), mergeable. This branch is stacked on it. |
| PR #211 (single-use paid approval, `PD_ANTHROPIC_API_KEY`) | Open, CI green, **not merged**. On `main` the produce workflow still reads the old secret name and has no approval check, so a paid Anthropic run is only possible after #211 is merged. |
| Budget ledger | Branch `profitdecoded-budget-ledger`, `ledger.json`: no entries (nothing paid so far). |
| Budget policy on every branch | `paidEnabled: false`, `paidApproval: null`. |
| Secrets | `PD_ANTHROPIC_API_KEY`, `PD_CARTESIA_API_KEY` present (names checked, values never read). |
| Research | `channels/profitdecoded/research/hbm-073-how-gift-cards-make-money-for-retailers.json` (verified dossier). |
| Opus reference | `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-claude/` (written in a Claude Code session; no API cost). |
| Renderer | PR #213 motion renderer (Playwright 1.56.1 headless shell, OFL fonts, ffmpeg master, QA), proven on a clean runner. |
| Publishing | No upload step exists in the produce or render workflows used here. |

Smallest changes made for the film:
- **PR #211** (guard): the approval can name one model and its own cap; `model` and `script_version` workflow inputs; stage cache keyed by model.
- **This PR:** the Cartesia adapter and the audition job.

## 2. Script: Haiku 5.5 experiment (waiting for approval)

Model id `claude-haiku-5-5`, from Anthropic's model documentation. List price: $0.10 per million input tokens and $0.50 per million output tokens (up to a 100K-token prompt). The real run's preflight confirms the id on Anthropic's Models API (not billed) before any paid call.

The independent writing check:
- Haiku receives only the dossier and the channel prompts.
- The prompts contain no Opus script text. The only gift-card mention is a generic one-line thesis example in `prompts/story.md`.
- The stage cache key includes the model, so Haiku cannot reuse cached stages from another model.

What the owner applies (one file, `channels/profitdecoded/budget-policy.json`, after #211 is merged):

```json
"paidEnabled": true,
"paidApproval": {
 "id": "exp-2026-10-haiku55-gift-cards-1",
 "scriptId": "hbm-073-how-gift-cards-make-money-for-retailers:long:haiku55-v1",
 "pool": "experiment",
 "model": "claude-haiku-5-5",
 "maxUsd": 0.5,
 "expiresAt": "2026-10-12T18:00:00Z",
 "approvedBy": "<name>"
}
```

The run, once, after the Gemini daily reset (critic = Gemini, free):

```
gh workflow run profitdecoded-produce.yml -R eyazan/youtube-otomasyon --ref main -f topic=hbm-073-how-gift-cards-make-money-for-retailers -f format=long -f provider=anthropic -f critic=gemini -f model=claude-haiku-5-5 -f script_version=haiku55-v1 -f max_usd=0.5 -f budget_pool=experiment -f through=script
```

Worst case by the ledger's own reservations is far below $0.50 at Haiku prices. The run has no automatic retries and no fallback to another Claude model, and the approval closes when the step ends.

## 3. Opening: the PR #213 draft, evaluated on the whole Opus script

The check is deterministic (no API); the tool is `det-eval`, the same one used for the benchmark.

| | Opus as written | Opus + draft opening |
| --- | --- | --- |
| Words | 1,098 | 1,072 |
| Plan issues / factual findings / numbers outside the dossier | 0 / 0 / 0 | 0 / 0 / 0 |
| Spoken naturalness / AI-pattern score | 97 / 0 | 97 / 0 |
| Retention heuristic | 90 | 100 |
| First 30 s (gate 80) | **79, blocked** | **85** |
| Blocking findings | weak-opening | **none** |

Applying the draft also needs one plan change.
- **The rule:** the first beat must be the plan's selected hook, word for word.
- **The change:** the draft line is added as a hook candidate and selected.
- **Why it passes:** it is the heuristic winner on its own merits: 82, factual, against 78 for the current hook. No gate is overridden or relaxed.
- **Status:** not yet applied to the repository copy, because the script choice waits for Haiku.

Length risk: at about 150 words a minute the narration is about 7.2 minutes before pauses. The rendered length has to be measured with the chosen voice. If it falls short of 8 minutes, the fix is an editorial pass on the thin sections, not padding.

## 4. Narration: Cartesia Sonic

Verified on docs.cartesia.ai and cartesia.ai on 2026-10-09:
- **Endpoint:** `POST https://api.cartesia.ai/tts/bytes`.
- **API version:** `Cartesia-Version: 2026-08-14`, the only allowed value.
- **Model:** `sonic-3.6` is the recommended alias. We pin the stable snapshot `sonic-3.6-2026-08-27`, so a re-render sounds the same.
- **Plan:** Pro is $5 a month and includes 100K credits and a "Commercial use license". 1 credit = 1 character.
- **Terms §5.3:** Cartesia claims no ownership of outputs. Commercial use is allowed where the subscription tier permits it.
- **Terms §4.2:** using another person's voice is prohibited without their permission. Library voices are Cartesia's own, so this does not apply.

The adapter (`core/profitdecoded/tts-provider.js`):
- **Format:** raw 16-bit PCM at 24 kHz, straight into the existing mixer.
- **Speed:** follows the channel rate.
- **Credits:** each request is counted before sending and refused past `PD_CARTESIA_MAX_CHARS`. No retries.
- **Without the key:** it falls back to Kokoro, never to another paid provider.
- **Scope:** ProfitDecoded only. No other channel's narration code changed.

Auditions (run 37982635291, artifact `profitdecoded-cartesia-audition`):
- **Text:** the same 118-word excerpt for every voice, the one Kokoro used.
- **Requests:** three, one per voice.
- **Credits:** 2,082.
- **Audio:** 124.1 s in total.

| Voice | Cartesia description | Seconds | Words/min |
| --- | --- | --- | --- |
| Carl, Steady Storyteller | "calm depth and measured pacing, perfect for narrations and documentaries" | 42.1 | 168 |
| Theo, Modern Narrator | "steady, enunciating, confident young male for narrations" | 38.2 | 185 |
| Marian, Poised Narrator | "calm authority and smooth pacing, perfect for narrations and storytelling" | 43.8 | 162 |

No voice has been selected. Measurements cannot judge naturalness, and nobody has listened to these yet.

Estimated full-film narration: about 7,000 credits, inside the Pro allowance.

## 5. Next, after both approvals

1. **Script:** Haiku vs Opus+draft, on deterministic gates plus one blind Gemini judgement. Opus+draft unless Haiku is better.
2. **Storyboard:** for all 51 beats, reusing the PR #213 components.
3. **Narration:** a single Cartesia pass, cached.
4. **Render:** one full render, then QA across the whole film, three thumbnails and the delivery.
