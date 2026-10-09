# ProfitDecoded Phase 3.5: Live free-model validation

Branch `feat/profitdecoded-free-model-validation`, based on Phase 3 (`feat/profitdecoded-storytelling-engine`). Date: 2026-10-09.

**Outcome:**
- The full multi-stage engine ran live on free providers only:
  - Groq `openai/gpt-oss-120b` planned, drafted and rewrote;
  - Gemini `gemini-3.8-flash` gave the independent critique and the final evaluation;
  - every stage was paced, cached and resumable.
- Actual paid charges were **$0**.
- **The final script did not pass validation.** The deterministic gates passed (0 blocking, retention 99, spoken naturalness 91, AI-pattern 7). The independent Gemini evaluation failed it: 2 high-severity factual problems and structure 3/10. The manual source check found further issues.
- The live attempts used essentially the whole Groq free daily token quota (199.5K of 200K). That quota is shared with FR/IB production, so I stopped as instructed ("stop safely and preserve intermediate results"). I did not lower any gate and did not fall back to a paid provider.
- Every stage is cached, so the next run resumes.

## 1. What was built

| Area | Change |
| --- | --- |
| Gemini provider | New `core/profitdecoded/auto/gemini.js`. Details below. |
| Provider per stage | `PD_STORY_PROVIDERS` (e.g. `plan=groq,draft=groq,rewrite=groq,critique=gemini`). `package` follows `draft` and `evaluate` follows `critique`. Anthropic stays the default and stays optional. |
| Paid guard | With `--max-usd 0`, any stage resolving to Anthropic throws `PAID_DISABLED` before a request is made. There is no paid fallback anywhere. |
| Groq rate limits | Rolling 60-second token pacer (prompt + `max_completion_tokens`). The TPM limit is read from the `x-ratelimit-*` headers. A request larger than the limit is refused up front. A run-wide token guard (`token_guard` / `PD_AUTO_MAX_TOKENS`) caps each run. |
| Small-context writing | For Groq: drafting section by section, with only that section's claims, plus one packaging call. A compact, fresh plan repair. Targeted per-section rewrites: deterministic and critic findings are routed to the section that holds the sentence. |
| Resumable stages | Disk stage cache, persisted across GitHub Actions runs with `actions/cache` (restored by key prefix, saved with `if: always()`). On RATE_LIMIT, QUOTA, BUDGET, NO_KEY, UNAVAILABLE or PAID_DISABLED a run returns `paused`, writes `latest.json` and resumes from the cache. |
| Final evaluation gate (added) | After the deterministic gates pass, Gemini scores the script (hook, structure, clarity, naturalness, pacing, accuracy) and lists factual overreach. High-severity items get one targeted fix and a re-check. Any high item still present blocks, and so does a `fail` verdict. |
| Fixes found live | Author hook tags were overwritten by the heuristic in `compete` (6 mechanisms counted as 3). The approved hook running on into the next sentence is split off. GPT-OSS writes narrow no-break spaces (U+202F) that broke sentence routing. Spoken findings, AI-pattern repetition and the weak opening are now routed per section with concrete instructions. An invalid hook override is ignored with a warning instead of failing the plan. |
| Workflow | `profitdecoded-produce.yml` gains the inputs `through=script` (skips TTS and render setup), `critic=gemini` and `token_guard`. The secret check prints only `present`/`missing`. The cron schedule and its gate are **unchanged**, and publishing is untouched. |
| Review tooling | `story-review` also reads a failed run's `latest.json`. That review is marked NOT APPROVED and writes no bundle. |

Gemini provider details:
- Calls REST `generateContent`. The key goes in the `x-goog-api-key` header, never in the URL or logs.
- Free-tier allowlist: any model not listed as "Free of charge" on Google's pricing page is refused before a request.
- Honours RetryInfo on 429. A daily-quota 429 becomes QUOTA, so the run pauses.
- On 503 it backs off, then tries free fallback models (`gemini-3.7-flash`, `gemini-2.5-flash`). If every one is overloaded it returns UNAVAILABLE, so the run pauses.
- Rejects truncated (MAX_TOKENS) and blocked output.

## 2. Secrets and provider status

- Workflow secret check (all runs): `GROQ_KEY: present`, `GEMINI_KEY: present`, `ANTHROPIC_KEY: missing`. Values are never printed.
- Every run log was searched for key prefixes (`gsk_`, `AIza`): 0 matches in all 8 runs.
- **Groq:** working.
  - Response headers show `x-ratelimit-limit-tokens: 8000` and `x-ratelimit-limit-requests: 1000`, which are the free-plan limits.
  - No 429 occurred: the pacer kept every request inside the per-minute window.
- **Gemini:** working with `gemini-3.8-flash`.
  - One run (37915380644) got persistent HTTP 503 "high demand". That led to the 503 back-off and free-fallback chain and the pausable UNAVAILABLE status.
  - No fallback model was needed after that.
  - Free status depends on the Google Cloud project having no billing. An API response cannot show that, so AI Studio's billing page is the source of truth.

## 3. Live runs (workflow `profitdecoded-produce.yml`, dispatched on this branch, `max_usd=0`, `through=script`, `critic=gemini`)

| Run | Result | What it showed / what was fixed next |
| --- | --- | --- |
| [37915032067](https://github.com/eyazan/youtube-otomasyon/actions/runs/37915032067) | provider-error at plan | The plan repair continued the conversation and needed ~9.4K tokens, more than the 8K per-minute limit, so it was refused up front. Fix: compact, fresh repair. |
| [37915235458](https://github.com/eyazan/youtube-otomasyon/actions/runs/37915235458) | plan-failed | The editor's hook override scored more than 10 below the best hook. Fix: the override is ignored with a warning, and the best factual hook opens. |
| [37915380644](https://github.com/eyazan/youtube-otomasyon/actions/runs/37915380644) | provider-error at critique | Groq drafted 9 sections plus packaging. Gemini returned 503 on every retry. Fix: back-off, free fallbacks, pausable UNAVAILABLE, final evaluation gate. |
| [37916803793](https://github.com/eyazan/youtube-otomasyon/actions/runs/37916803793) | script-failed | The Gemini critique worked. 2 rewrite rounds still left 4 blocking issues. Diagnosed: hook-tag bug, U+202F routing bug. |
| [37918528525](https://github.com/eyazan/youtube-otomasyon/actions/runs/37918528525) | script-failed | Spoken naturalness rose from 29 to 78. AI-pattern repetition was never routed. The opening was weak. |
| [37919455632](https://github.com/eyazan/youtube-otomasyon/actions/runs/37919455632) | paused at evaluate (token guard) | **All deterministic gates passed** (0 blocking, retention 99, spoken 91). The run paused safely at the 45K guard. |
| [37920375941](https://github.com/eyazan/youtube-otomasyon/actions/runs/37920375941) | paused at evaluate (token guard) | Gemini evaluation 1: verdict fail, 7 high-severity factual overreaches. Groq fact-fixed 6 sections. Paused before the re-check. |
| [37921341822](https://github.com/eyazan/youtube-otomasyon/actions/runs/37921341822) | **script-failed (final)** | Gemini evaluation 2: verdict fail, 2 high remain. Scores: hook 5, structure 3, clarity 6, naturalness 5, pacing 3, accuracy 4. |

Execution order in the final run, as required: research verification (gate 94, pass) → story plan (Groq, then compact repair) → hook competition (6 candidates, 6 mechanisms) → draft (9 sections plus packaging) → independent Gemini critique (10 problems, "revise") → Groq targeted rewrites (2 rounds) → final assessment (deterministic gates plus Gemini evaluation → one fact-fix round → re-evaluation → **fail**).

## 4. Deliverables

All under `channels/profitdecoded/story-tests/hbm-073-gift-cards-long-free-models/`:

| Deliverable | File |
| --- | --- |
| Final English script (candidate, **not approved**): 1,143 words, ~8.8 min at 130 wpm | `script.md` (beats: `latest.json`) |
| Five alternative hooks, plus the selected opening | `hooks.md` |
| Independent editorial critique (Gemini, fresh context) | `critique.json` |
| Final independent evaluations (Gemini) | `evaluation-1.json` (before the fact-fix), `evaluation-2.json` (final) |
| Source verification report | `source-verification.md` |
| Quality assessment | `review.md` (deterministic gates, retention critic, spoken naturalness, hook engineering) plus the Gemini scores above |
| Provider usage report | `usage.json` (final run, per stage), `usage-all-runs.json` (all 8 runs) |
| Story plan and draft | `plan.json`, `draft.json`, `meta.json` (status, reasons, stage log) |

## 5. Quality of the final script

| Reading | Draft | Final |
| --- | --- | --- |
| Words | 1,429 | 1,143 |
| Deterministic blocking issues | 8 | **0** |
| Retention reading (heuristic) | 79 | 99 |
| Spoken naturalness | 29 | 91 |
| AI-pattern score (lower is better) | 26 | 7 |
| Gemini verdict / accuracy / structure | – | **fail** / 4 / 3 |
| Manual source check (33 statements) | – | 19 OK, 9 overstated, 4 wrong, 2 production defects |

Verdict: **not publishable.** The deterministic numbers look excellent, but they measure the form of the text, not its truth or its storytelling.
- The independent evaluation and the manual check agree: the script restates the same figures up to four times, attributes our own sum ($222.4M) to Starbucks, and invents a few details ("updated each quarter", analysts, causes of estimate misses).
- It also contains two defects that no automated gate catches: a claim id spoken aloud ("as shown in i3"), and a Darden section that never names Darden.

## 6. Actual token consumption and charges

| Provider / model | Calls | Input tokens | Output tokens | of which reasoning | Paid list-price equivalent | **Actual charge** |
| --- | --- | --- | --- | --- | --- | --- |
| Groq `openai/gpt-oss-120b` | 43 | 120,585 | 78,939 | 54,847 | $0.077 | **$0.00** (free plan) |
| Gemini `gemini-3.8-flash` | 3 | 24,095 | 3,246 | 786 (thinking, separate) | $0.033 | **$0.00** (free tier) |
| Anthropic | 0 | 0 | 0 | 0 | – | **$0.00** (never called) |

Groq total: 199,524 tokens, essentially the full free daily quota of 200K tokens. A large share went to failed attempts that exposed the bugs listed above. Rerunning the same topic now replays from the cache: the final run made only one Gemini call.

## 7. Remaining issues (ranked)

1. **The plan can promise an answer the evidence cannot give.** The plan's `payoff` ("retailers capture most… only a small slice stays with the consumer") and `originalAngle` ("the exact split") are not supported by the dossier, and no gate checks them. Proposed: the payoff and angle must cite claim ids, and the Gemini critic reviews the plan before any drafting. This is the root cause of the weak payoff and the recycled numbers.
2. **Section-by-section drafting repeats figures.** Sections share claims, and each is drafted without seeing the others. Proposed: give each number one "home" section in the plan, and have later sections refer back rather than restate.
3. **The deterministic factual gate checks numbers only.** It passes attribution and scope errors: "Starbucks recorded $222.4M" (our sum), "households" vs adults, and hook candidates 1–4 in `hooks.md`. Proposed: an inference-attribution check, so that an `i*` claim must be voiced as "our calculation".
4. **Script hygiene gates are missing.** No check rejects claim ids in the narration (`i3`) or a section whose company is never named.
5. **The Groq free-plan budget is tight.** One full long-form generation needs roughly 60–90K tokens on the 8K TPM / 200K TPD plan, so at most about two attempts a day, shared with FR/IB production. The `token_guard` input caps each run. Production was not running today, so it was not starved, but this needs watching if both run on the same day.
6. **The Gemini free tier can return 503 under load.** It is now handled with back-off, free fallbacks and a pause, but this can delay a run.
7. **The working title in `meta.json` is the topic-universe title** ("How Gift Cards Make Money for Retailers"), not the Phase 3 packaging title "Billions Sit on Unused Gift Cards. Who Keeps the Money?". This affects the title-validation reading only.

## 8. Tests

- `npm run test:profitdecoded`: 146/146 pass. That includes 14 free-model tests, all with mocked Groq and Gemini and no network:
  - allowlist, key in header, RetryInfo/QUOTA/MAX_TOKENS/SAFETY;
  - pacing;
  - full free pipeline at $0;
  - pause and resume;
  - paid guard;
  - routing, including U+202F, AI-pattern repetition and weak opening;
  - workflow invariants;
  - compact repair;
  - final evaluation gate, including the `fail` verdict;
  - opening split;
  - Gemini overload fallback.
- Full regression `npm test`: 463/463 JS tests and 24/24 Python tests pass.
- Other channels: no file outside `core/profitdecoded`, `scripts/profitdecoded`, `profitdecoded.js`, `channels/profitdecoded`, `docs/profitdecoded`, the ProfitDecoded workflow and ProfitDecoded tests was changed.

## 9. Not done, by instruction

- No merge.
- No publishing or upload.
- No production schedule change (the produce cron and its gate are unchanged).
- No narration or render.
- No paid provider.
- No later phase.
