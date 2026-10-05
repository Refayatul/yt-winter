# Growth Feedback Loop Health

Generated: 2026-10-05T01:59:49.055Z
Portfolio verdict: **CLOSED_LOOP_WORKING**

| Channel | Verdict | Mode | Samples | Performance rows | Diagnoses | Late checkpoints |
|---|---|---|---:|---:|---:|---:|
| failure-reconstructed | CLOSED_LOOP_WORKING | adaptive | 14 | 15 | 19 | 51 |
| impossible-brief | CLOSED_LOOP_WORKING | observing | 3 | 4 | 2 | 6 |
| critical-thread | CLOSED_LOOP_WORKING | observing | 3 | 4 | 2 | 6 |
| behind-the-ordinary | CLOSED_LOOP_WORKING | heuristics-only | 2 | 2 | 1 | 4 |

## Interpretation

- `CLOSED_LOOP_WORKING` means measurements are persisted, learning memory exists, and adopted memory is wired back into topic/hook/title selection.
- `heuristics-only` / `observing` is not a failure. It means the channel deliberately has too little evidence to rewrite strategy.
- Late historical checkpoints are not deleted. Performance math uses actual collection age when drift exceeds 2.5 hours, preventing false velocity/plateau conclusions.
- Studio-only metrics such as Viewed vs Swiped Away still require manual/Studio data; the public API cannot supply them.

