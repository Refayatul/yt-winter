# CriticalThread: A-bucket viral minimum 70 (proposed, NOT active)

## Problem (observed in production logs)

Every CriticalThread run since 2026-10-07 ended with `NO_QUALIFIED_TOPIC: 0 A/B`. The last Short was published on 2026-10-06.

The portfolio overlay `config/viral-quality-v2.json` (2026-10-07) allows only bucket A (exploit and explore) **and** a viral score of at least 75:
- all 7 unused A topics score 68–73;
- the only 2 topics at 75 or above are bucket B, which is not selectable.

## Change (reviewable, default off)

`channels/critical-thread/growth-engine.json` → `viralMinimumException`: `minimumToProduce` 70, `buckets` `["A"]`, `enabled: false`, `approvedBy: null`.

`core/growth/config.js` (`applyViralMinimumException`) applies it only when:
- it is `enabled` **and** has `approvedBy`;
- the value is at least 65;
- every selectable bucket is listed, so it can never open B or C.

Research verification, source quality, hooks, pre-render and final readiness gates are unchanged.

`GROWTH_VIRAL_EXCEPTION_PREVIEW=critical-thread` previews it for a local simulation and is refused inside GitHub Actions.

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

The exception restores about **five Shorts**, then CriticalThread stalls again. The lasting fix is research: more A-quality researched records. `node scripts/intel/research-queue.js --channel critical-thread` (PR #225) ranks the next topics to research.

**Activation:** set `"enabled": true, "approvedBy": "<owner>", "approvedOn": "<date>"` in a reviewed commit.
