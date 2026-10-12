# CriticalThread: A-bucket viral minimum 70 and inventory replenishment (prepared, NOT active)

## Problem (observed in production logs)

Every CriticalThread run since 2026-10-07 ended with `NO_QUALIFIED_TOPIC: 0 A/B`. The last Short was published on 2026-10-06.

The portfolio overlay `config/viral-quality-v2.json` (2026-10-07) allows only bucket A (exploit and explore) **and** a viral score of at least 75:
- all 7 unused A topics score 68–73;
- the only 2 topics at 75 or above are bucket B, which is not selectable.

## Root cause of the skipped days (traced 2026-10-12)

**Selection path:** `core/pipeline/impossible-brief.js` `chooseTopic` → `Growth.selectShortTopic` → `Context.rank`. The selector applies two gates:
1. the topic is in a selectable bucket — **A only**: the portfolio overlay `config/viral-quality-v2.json` replaces the channel's own `selection`;
2. `ViralPotentialScore` ≥ **75**.

**On 2026-10-12, no CriticalThread record passes both gates:**
- **The 7 unused A topics** score viral 68–73.
- **The 2 topics at 75+ are B:**
  - CT-437 has video potential 79 (A starts at 80);
  - CT-265 has hook 77 (A needs 78).

The selector returned exactly this reason. Recording it was broken in two places.

**Defects fixed (no threshold changed):**
1. **The daily decision log recorded `reason: null` when nothing was selected.** The reason existed, but only in the return value. It is now written to `state/growth/decisions.json`.
2. **CT and IB `growth-engine.json` claimed `exploreBuckets: ["A","B"]`.** The overlay silently replaces that with A only. The dead settings are removed, and a test fails if one reappears.
3. **The footage component of the viral score never saw a record's licensed pictures.** For IB, CT and BTO, `archival` was hard-coded `false`. The footage risk was therefore a guess from the number of `visualScenes` (about 33 points for every CT record), labelled "no archival footage confirmed".
   - A record now counts as having archival stills when its `curatedVisuals` hold **3 or more** licensed Wikimedia Commons files, under the renderer's own validity rule. FR has always been scored this way, from its Wikimedia sources.

**Effect today:** none. No unused record lists curated pictures, so no selection changes.

**Measured effect of confirmed stills** (in memory, nothing written):

| Topic | Bucket | Viral now | Viral with ≥3 confirmed licensed pictures |
|---|---|---|---|
| CT-160 | A | 73 | 77 |
| CT-219 | A | 73 | 77 |
| CT-234 | A | 72 | 76 |
| CT-397 | A | 72 | 76 |
| CT-166 | A | 71 | 75 |
| CT-437 | B | 76 | 80 |
| CT-265 | B | 75 | 79 |

**The lasting route at 75** is to curate at least 3 licensed, event-specific pictures per topic, as done for CT-201. This is reviewed content work, and it also fixes CT's visual weakness. The 70 exception stays disabled.

## Change (reviewable, default off)

`channels/critical-thread/growth-engine.json` → `viralMinimumException`: `minimumToProduce` 70, `buckets` `["A"]`, `enabled: false`, `approvedBy: null`.

`core/growth/config.js` (`applyViralMinimumException`) applies it only when:
- it is `enabled` **and** has `approvedBy`;
- the value is at least 65;
- every selectable bucket is listed, so it can never open B or C.

Research verification, source quality, hooks, pre-render and final readiness gates are unchanged.

`GROWTH_VIRAL_EXCEPTION_PREVIEW=critical-thread` previews it for a local simulation and is refused inside GitHub Actions.

## Which score the threshold gates

`minimumToProduce` gates **`ViralPotentialScore`**, the topic-level prediction computed when topics are ranked (`core/growth/context.js` → `topic-scoring.js`). It is checked in three places:
- selection: `selectShortTopic`, `core/growth/index.js`;
- the legacy queue: `orderedQueue`;
- the readiness hard fail "viral potential X < minimum": `core/growth/readiness.js`.

The 85–89 figures in the simulation below are a different field, **`ProductionReadinessScore`**. That is the pre-render readiness composite: a weighted average of topic potential, hook, title, script, first 3 s, factual, visual relevance and quality, audio and captions. PUBLISH is 85 or more, REVIEW 70 or more.

| Field | What it is | CT-234 | Gate |
|---|---|---|---|
| `ViralPotentialScore` | topic-level viral prediction | 72 | `minimumToProduce`: 75 portfolio, 70 with the exception |
| `VideoPotentialScore` | topic quality; sets the A/B/C bucket together with hook ≥ 78, sources ≥ 70, boilerplate ≤ 0.22 | 82 | bucket A from 80 |
| `ProductionReadinessScore` | full-package readiness | 89 | PUBLISH ≥ 85, REVIEW ≥ 70 |

So "68–73" (viral) and "85–89" (readiness) describe the same topics on two different scales, and they do not conflict. The simulator prints both: `[A v72] readiness PUBLISH 89`.

**Invariant (tested in `tests/js/ops-reliability.test.js`):** turning the exception on changes only `viralScoring.minimumToProduce`, and records the portfolio value and the exception. Every other setting is byte-identical: topic buckets and A requirements, minimum sources, duplicate detection, hooks, factual and readiness thresholds. No other channel gets an exception.

## Simulation (2026-10-11, read-only, `scripts/growth/simulate-selection.js`)

Current rules: every day is a SKIP (best unused A score 73 < 75).

With the exception, day by day (selection, then the pre-render readiness gate with duplicate detection):

| Date | Mode | Topic | Bucket / viral | Pre-render readiness | Title |
|---|---|---|---|---|---|
| 2026-10-12 | exploit | CT-234 lead service lines | A / 72 | PUBLISH 89 | The Pipes Behind the Flint Water Crisis |
| 2026-10-13 | exploit | CT-160 dangerous-goods manifests | A / 73 | PUBLISH 87 | The 2,750 Tonnes Stored Beside a City |
| 2026-10-14 | exploit | CT-219 rapid sand filter | A / 73 | REVIEW 85 | The Outbreak That Sickened 403,000 People |
| 2026-10-15 | explore | CT-397 Suez Canal traffic system | A / 72 | PUBLISH 87 | The 193-Kilometre Shortcut Europe and Asia Can't Replace |
| 2026-10-16 | exploit | CT-166 port channel dredging | A / 71 | PUBLISH 87 | The Bridge Collapse That Closed a Port for 11 Weeks |
| from 2026-10-17 | — | SKIP | 2 A topics left at 68 | — | — |

- **No repeats.** None of the five shares a subject with the 9 CriticalThread topics already used or published (water pump, Alpine tunnel fire, UPS, Three Mile Island, grid control room, subsea cable, wire bonding, BGP, rail interlocking).
- **REVIEW.** CT-219 is REVIEW: production renders it but does not upload unless the final readiness reaches PUBLISH.
- **Cluster watch.** Two of the five are water-system topics (CT-234, CT-219), and a water-pump Short ran on 2026-09-30.

## Conclusion

The exception restores about **five Shorts**, then CriticalThread stalls again. The lasting fix is more A-grade records; see the replenishment section below.

**Activation:** set `"enabled": true, "approvedBy": "<owner>", "approvedOn": "<date>"` in a reviewed commit.

## Inventory replenishment (prepared, OFF)

### Why the 75 minimum cannot be met by research

Across all 515 CriticalThread records:
- the highest `ViralPotentialScore` is **76**, and only four records reach 75;
- every record carries `weak_footage_risk −33` and `archival_footage_potential 35`, because infrastructure systems have little archival footage.

Research adds evidence. That moves the bucket (hook, sources, specificity) but barely moves the viral score.

Measured on 2026-10-11 with an offline experiment (`writeQualified` on the real inventory, then restored): a verified upgrade of CT-230 went from B (hook 77 < 78) to **A** (potential 82), but its viral score stayed 72. At 75 it is correctly rejected and restored; at 70 it would be kept.

**Replenishment therefore needs the 70 exception.** With the exception, 53 unused B records already score viral ≥ 70, so research only has to close their A gap.

### Runway: `scripts/growth/topic-inventory.js` (read-only)

`node scripts/growth/topic-inventory.js --channel critical-thread [--target-days 14] [--json]`

It counts unused topics that pass production's own rules, unchanged:
- a selectable bucket;
- viral ≥ the effective minimum;
- a pre-render readiness gate (duplicate detection on) that does not BLOCK.

That count, times the cadence (one Short a day), is the runway. The tool reports the deficit against the target and a research queue of unused records ordered by closeness to qualifying:
1. viral already at the minimum;
2. then over the A line;
3. then priority clusters;
4. then potential.

Duplicates and hard rejects that research cannot fix never enter the queue. A record attempted in the last 60 days waits. It does no scoring of its own; it filters `Context.rank`, the same ranking production uses. PR #225's `research-queue.js` ranks *unresearched* topics by competitor insight, and the two can be combined after #225 merges.

| 2026-10-11 | Qualified | Runway | Deficit |
|---|---|---|---|
| Current rules (75) | 0 | 0 days | 14 |
| With the exception (70) | 5 | 5 days | 9 |

### Research: `scripts/ct-research.js`

`node scripts/ct-research.js [--limit 3] [--target-days 14] [--write]`

It runs only while the runway is below target, and works at most the deficit (default 3 a run). It upgrades **existing** records in place (same id and slug, so used-topic and duplicate tracking hold) and never invents topics. For each record:
1. Wikipedia articles about the record's subject, plus the articles' own cited links on CriticalThread's primary hosts, checked reachable. This reuses BTO research's reference probing, excerpting and narration-support checks.
2. A draft from those excerpts only, by the **free** provider. **Groq is required; a paid primary or a paid fallback is refused.** Every fact must carry a verbatim quote, and every narration line must cite facts. The provider may answer "not answerable".
3. `scripts/ib-ct-library/build.js`, the same verifier as hand research, with nothing relaxed:
   - numbers traced to the source text;
   - narration limits;
   - primary, reachable sources;
   - legacy research and quality audits;
   - 20 or more hook candidates, and the spoken opening is the strongest hook.

   One gate is **stricter** than for hand research: automated records must have verbatim quotes, verified on the page (as for The Hidden Logic of Things). One repair round names the failing checks.
4. `--write` keeps an upgrade only if the record is now **production-qualified**: selectable bucket, viral ≥ minimum and readiness not BLOCK, with duplicate detection on. Otherwise the original record is restored byte for byte. Kept records are also saved as `research-seeds/auto-<date>.json`; attempts go to `state/research-attempts.json`.

The replacement can overwrite a hand-researched record that was not qualifying; the previous version stays in git history and in its `research-seeds/batch-*.json`.

### Workflow: `.github/workflows/ct-research.yml`

The job:
- runs the runway report, then research, then commits through `scripts/ops/push-state.sh`;
- pins `LONGFORM_LLM_PROVIDER=groq` with no fallback, and has no paid key in the job;
- dry-runs on a manual dispatch unless `write=true`.

The daily schedule does nothing until the repository variable `CT_RESEARCH_AUTO` is `true`. It is not set.

### Activation (owner)

1. Approve and enable the 70 exception. Without it no upgrade can qualify.
2. Dispatch *CriticalThread research replenishment* once with `write=false`, then review the log: verified, not answerable, failed checks.
3. Dispatch once with `write=true`, `limit=3`. Review the kept records in the commit (facts, quotes, narration).
4. Set `CT_RESEARCH_AUTO=true` for the daily run.

Cost: Groq free tier only (rate-limited, about 75 s between records), no spend. Not tested against the live provider yet: unit tests use fakes, and the builder ran offline on a fixture.
