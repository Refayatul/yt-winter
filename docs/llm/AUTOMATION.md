# LLM routing, the Haiku Shorts pilot and ProfitDecoded scene specs

Status (2026-10-11): pilot, merged behind flags. **No paid call has been made.** All paid paths are disabled by
committed policy (`paidEnabled: false`, `paidApproval: null`) and every result below that mentions money is an
estimate computed from token counts and list prices, not a measurement.

## 1. Where the channels stand (audit, 2026-10-11)

| Channel | Pipeline | Shorts today | Long-form | Script source in production | LLM at production time |
| --- | --- | --- | --- | --- | --- |
| Failure Reconstructed (FR) | legacy: `shorts-sira.js` → `shorts-yap.js`, specs in `icerik/konular/` | automatic, daily (7 in the last 7 days) | none published | curated case files (377) with written scenes | none |
| ImpossibleBrief (IB) | isolated: `core/pipeline/impossible-brief.js` via `shorts-sira.js` | automatic, daily (7 in 7 days) | none published | curated narration on researched records (154 of 500 topics) | none |
| CriticalThread (CT) | isolated (same) | automatic, intermittent (3 in 7 days, last Oct 6) | none published | curated narration (162 of 522) | none |
| Behind the Ordinary (BTO) | isolated (same) | paused (`BTO_PUBLISH=0`; OAuth `INVALID_CLIENT`) | none published | curated narration (7 of 525) | none |
| ProfitDecoded (PD) | motion films (`scripts/profitdecoded/motion/`), auto path in shadow | n/a | V3 film ready, unpublished by design | human-reviewed story + handwritten `scenes.js` | Claude in authoring sessions only; production budget path disabled |

Common stack: Edge TTS (Shorts), licensed stills and ffmpeg, `quality-gate.js` + growth readiness, `youtube-yukle.js`,
scheduled by `portfolio-production.yml`. The long-form lane uses Groq (free tier). Current Shorts API spend is $0.

What the audit corrected: production Shorts do **not** use template text for researched topics. `Growth.planShort`
uses the curated `narration` of a researched record (`editorialClaims`) and falls back to `Script.buildShort`
templates only without it. The real constraint is the number of researched records (BTO has 7), and research is
not something a language model may certify on its own. So the pilot places Haiku where it can help without
becoming the fact source: writing Short narration, shot notes and metadata **from an existing research record**,
and writing PD scene specifications from an approved storyboard.

## 2. Routing (`config/llm-routing.json`, `core/llm/router.js`)

| Task | Default model | Max in / out tokens | Escalation (explicit only) |
| --- | --- | --- | --- |
| short-script, short-storyboard, short-metadata, topic-classify, topic-rank, visual-prompts | claude-haiku-5-5 | 3k–6k / 0.8k–3k | none |
| scene-spec | claude-haiku-5-5 (adaptive thinking) | 12k / 16k | claude-sonnet-5-5 |
| qa-review | claude-haiku-5-5 (adaptive thinking) | 8k / 2k | claude-sonnet-5-5 |
| longform-research-review, longform-script | claude-sonnet-5-5 | 30k / 8k–16k | claude-opus-5-5 |

* Overrides: `<PREFIX>_LLM_MODEL_<TASK>` (channel) > `LLM_MODEL_<TASK>` (global) > config. An override to a model
  without a price in the config is refused.
* No silent fallback: a stronger model is used only when the caller passes `escalate: true`; a response from a
  different model than requested is an error.
* Channel isolation: a channel's calls read only `<PREFIX>_ANTHROPIC_API_KEY` (`IB_`, `CT_`, `BTO_`, `FR_`; PD keeps
  `PD_ANTHROPIC_API_KEY`). The shared `ANTHROPIC_API_KEY` is never read by the router.

## 3. The guarded client (`core/llm/client.js`)

Dry-run is the default. A real request needs all of: `run: true` from the caller, the channel's `llm-budget.json`
with `paidEnabled: true` and a usable single-use `paidApproval`, and the channel's own key. Then:

1. The request is built: system block with `cache_control` (the channel rules are a stable cached prefix),
   `output_config.effort`, a JSON schema for structured output, thinking disabled for short structured tasks.
2. Input is capped by the routing table (estimated high from characters), output by `max_tokens`.
3. The worst-case cost (all input priced as a cache write, all of `max_tokens` as output) is reserved in the ledger
   (`core/profitdecoded/budget.js`, compare-and-swap) against the per-video, **per-day** (new, optional field) and
   per-month limits, before anything is sent.
4. `maxRetries: 0` in the SDK. The client retries at most `policy.maxRetries` times, only after 429/529 (unbilled,
   reservation released), and every retry counts against `maxCallsPerRun`. Any other failure is marked
   `uncertain` and stays charged until reconciled.
5. The reservation is settled with the reported usage (input, output, cache write, cache read). `refusal` and
   `max_tokens` stop reasons are errors. The usage log holds counts and dollars, never the key.

`batchRequest()` builds Message Batches entries (50% price) for non-urgent work such as nightly topic ranking or
writing a week of Shorts in one go; the client does not submit batches yet.

Per-channel limits (identical for IB, CT, BTO, FR): $0.02 per Short, $0.10 per day, $1.00 per month (script pool) +
$0.50 (experiment pool), one retry, six calls per run. The ledger branch `llm-budget-ledger` must be initialised
before the first paid run. The Anthropic workspace spend limit remains the backstop.

## 4. Haiku Shorts writer (`core/llm/shorts-writer.js`)

* Input: the topic's sourced facts numbered F1..Fn (curated narration and "editorial brief" items excluded, so the
  benchmark compares like with like), the question, mechanism and the channel's `prompts/system.md`. About 1.4k–2.7k
  input tokens.
* Output (JSON schema): beats `{text, role, layer, evidence[], visual}`, title, description, tags, thumbnail text.
* Accepted only if deterministic gates pass (section 6). `toScript()` produces the renderer's claim contract, so a
  later switch from shadow to production is a one-line change in `planShort`, behind a flag, after the benchmark.

## 5. Feature flags and shadow mode

| Flag | Default | Effect |
| --- | --- | --- |
| `LLM_SHORTS_SHADOW` | unset (off) | `1`: after a Short is packaged, a child process writes prompt, routed model, worst-case cost and the production baseline to `<package>/llm-shadow/`. `run`: also sends one request (still refused without approval). Failure or timeout (120 s) never affects render or upload. |
| `LLM_MODEL_<TASK>`, `<PREFIX>_LLM_MODEL_<TASK>` | unset | routing overrides |
| `LLM_BUDGET_STORE=file` | unset | local ledger file for local runs (refused in Actions) |

No workflow, schedule, publishing setting or credential was changed. `LLM_SHORTS_SHADOW` is not set anywhere.
Legacy FR has no production hook; it is covered by the benchmark only.

## 6. Gates: objective failures vs editorial judgement

| Stage | Objective gate (blocks) | Editorial judgement (review, never scored by code) |
| --- | --- | --- |
| Haiku Short | schema; channel roles and layers; first/last role; 5–10 beats; opening ≤ 10 words; production retention lint (`core/growth/script.js`: forbidden openings, unsupported numbers against the facts the model saw, sentence length, word budget, payoff); every verified-layer beat cites a fact; cited ids exist; each beat's numbers appear in its cited facts; title numbers in the facts; title/tags/description limits; no links | does each beat faithfully paraphrase its facts? hook, clarity, progression (blind A/B review) |
| Existing Shorts gates (unchanged) | growth readiness, visual pre-check, `quality-gate.js` / validations (audio, captions, licensed visuals) | channel editor |
| PD scene spec | known types and required fields; beat ids in the measured timeline; phrase cues spoken in that beat; text lengths that keep the mobile font floor; a source line on every figure; on-screen numbers in the dossier (when supplied); render refuses an invalid spec | is this the right picture? visual-diversity flags (advisory, `core/profitdecoded/visual-diversity.js`) |
| PD research and story (unchanged) | `Research.gate`, story-review critique | independent critique |

An LLM is never the only fact check: the facts come from the research record, and code checks traceability to
them. Faithfulness of paraphrase stays a human review item, recorded as `editorialReview: required`.

## 7. Benchmark (`scripts/llm/benchmark-shorts.js`)

Identical topics, one per distinct Shorts pipeline profile: IB `IB-SPA-001`, CT `CT-001`, BTO `BTO-016`, FR
`aberfan-1966`. Baseline: the production growth-plan script for the same topic, computed without writing state.

* Dry run (done, no API call): prompt sizes and costs below; baselines 67–77 words, 24–28 s.
* Paid run (pending approval): one Haiku request per topic, then the gates, measurements (`describe`: words,
  duration, longest sentence, numbers, repetition, generic phrasing), and `blind-review.md` with A/B shuffled and the
  key kept separately. Hook, clarity, accuracy, progression and visual potential are rated by a person; there is no
  invented score.

| Topic | Input tokens (est.) | Reserved max | Expected | Expected (batch) |
| --- | --- | --- | --- | --- |
| IB-SPA-001 | 1,627 | $0.00170 | $0.00056 | $0.00028 |
| CT-001 | 1,954 | $0.00174 | $0.00059 | $0.00029 |
| BTO-016 | 2,722 | $0.00184 | $0.00064 | $0.00032 |
| aberfan-1966 | 1,422 | $0.00168 | $0.00055 | $0.00028 |

Expected assumes 4 characters per token and 900 output tokens; the paid run replaces both with settled usage.

## 8. ProfitDecoded: scene specification and the V3 gap

`profitdecoded.scene-spec.v1` (`core/profitdecoded/scene-spec.js`) is a declarative shot list with 11 scene types:
environment (+ props + evidence overlay), evidence-card, counter, money-flow, comparison (physical stacks),
timeline, filing-quote, statement, rule-card, sum, map (schematic routes). `render-motion.js` renders a film's
`scene-spec.json` through `spec-scenes.js` when the film has no handwritten `scenes.js` (V1–V3 are untouched).
`outputSchema()` is the structured-output schema for the `scene-spec` task.

**Visual comparison (done, stills only).** A hand-written 13-scene sample for documentary #2
(`tests/fixtures/profitdecoded/scene-spec-hbm-034-sample.json`, timings ESTIMATED from word counts, silent audio)
was rendered and compared with the V3 film's frames:

| Measure | V3 (46 shots, measured) | Spec sample (13 scenes) |
| --- | --- | --- |
| Smallest essential text on a 640 px preview | 10 px (9 shots < 11 px) | 12.3 px |
| Source line on every figure | yes | yes (gate-enforced) |
| Context (everyday environment) share | 44% | 54% |
| Longest abstract run | 41 s | 24 s |
| Category switches per minute | 3.9 | 2.9 |

Defects found and fixed during the comparison: an evidence card that stayed blank until its cue; a count-up that a
still caught at "$9.1B" (a plausible wrong figure; intermediate values now only while the 0.9 s count visibly runs,
otherwise the sourced value appears directly); a caption colliding with labels; map arcs looping above the origin;
label sizes under 11 px; free-floating figures over busy environments (now on a dark panel).

**What it does not reach (honest gap):** V3's craft comes from bespoke choreography that the generic types do not
express. It has a recurring physical motif (the gift card that splits, glows and returns in callbacks),
multi-phase transformations inside one shot with camera keyframes, and props drawn for the story. The spec render
is clean, sourced and legible, but flatter. **It is not V3-equivalent.** A full-length render with measured
narration and a side-by-side human review is still required before it replaces handwritten scenes for a film.
Next steps that close the gap without bespoke code: a `motif` element reused across scenes, two-phase scenes
(`then:`), and camera keyframes in the spec.

## 9. Cost

| Item | Estimate | Basis |
| --- | --- | --- |
| One Short (Haiku script + shot notes + metadata, one call) | ~$0.0006 (≤ $0.002 reserved) | section 7 |
| Shorts, 4 channels × 30 per month | ~$0.07 / month (≤ $0.25 reserved) | 120 × above |
| PD long-form, Claude part (Sonnet research review + script, Haiku scene spec + QA) | ~$0.25–0.45 per film (≤ $0.40 reserved for the two Sonnet calls + $0.01 Haiku) | routing caps; one rewrite at most |
| PD narration | within the existing Cartesia plan | no marginal API dollars computed |
| PD, 4 films per month | ~$1–1.8 / month | |
| **All channels** | **~$1.1–1.9 / month expected** | policy ceilings: $6/month Shorts (4 × $1.50), PD $10 |

## 10. Enabling the first paid test (requires approval)

1. Create the repository secret `IB_ANTHROPIC_API_KEY` (a separate Anthropic workspace key with a low spend limit).
2. Initialise the ledger branch `llm-budget-ledger` (one JSON file per channel, `{"version":1,"entries":[]}`).
3. In `channels/impossible-brief/llm-budget.json`, set `paidEnabled: true` and a `paidApproval`
   (`{"id": "...", "pool": "experiment", "model": "claude-haiku-5-5", "maxUsd": 0.05, "expiresAt": "...", "approvedBy": "..."}`).
   This is a reviewed commit.
4. Run `node scripts/llm/benchmark-shorts.js --out <dir> --run --topics impossible-brief:IB-SPA-001` locally or in a
   one-off workflow. Nothing is rendered or published.
5. Review `blind-review.md`, then decide on the other channels and on enabling `LLM_SHORTS_SHADOW=1` in
   production.
