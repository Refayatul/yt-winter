# Growth Feedback Loop Health

Generated: 2026-10-06T00:48:40.816Z
Portfolio verdict: **CLOSED_LOOP_WORKING**

| Channel | Verdict | Mode | Samples | Performance rows | Diagnoses | Late checkpoints |
|---|---|---|---:|---:|---:|---:|
| failure-reconstructed | CLOSED_LOOP_WORKING | adaptive | 15 | 16 | 21 | 53 |
| impossible-brief | CLOSED_LOOP_WORKING | observing | 4 | 5 | 3 | 8 |
| critical-thread | CLOSED_LOOP_WORKING | observing | 4 | 5 | 3 | 8 |
| behind-the-ordinary | CLOSED_LOOP_WORKING | heuristics-only | 2 | 2 | 2 | 6 |

## Interpretation

- `CLOSED_LOOP_WORKING` means measurements are persisted, learning memory exists, and adopted memory is wired back into topic/hook/title selection.
- `heuristics-only` / `observing` is not a failure. It means the channel deliberately has too little evidence to rewrite strategy.
- Late historical checkpoints are not deleted. Performance math uses actual collection age when drift exceeds 2.5 hours, preventing false velocity/plateau conclusions.
- Studio-only metrics such as Viewed vs Swiped Away still require manual/Studio data; the public API cannot supply them.

