# Growth Feedback Loop Health

Generated: 2026-10-11T01:52:16.513Z
Portfolio verdict: **CLOSED_LOOP_WORKING**

| Channel | Verdict | Mode | Samples | Performance rows | Diagnoses | Late checkpoints |
|---|---|---|---:|---:|---:|---:|
| failure-reconstructed | CLOSED_LOOP_WORKING | adaptive | 20 | 21 | 57 | 67 |
| impossible-brief | CLOSED_LOOP_WORKING | adaptive | 9 | 10 | 31 | 21 |
| critical-thread | CLOSED_LOOP_WORKING | observing | 5 | 6 | 15 | 18 |
| behind-the-ordinary | CLOSED_LOOP_WORKING | observing | 2 | 2 | 3 | 6 |

## Interpretation

- `CLOSED_LOOP_WORKING` means measurements are persisted, learning memory exists, and adopted memory is wired back into topic/hook/title selection.
- `heuristics-only` / `observing` is not a failure. It means the channel deliberately has too little evidence to rewrite strategy.
- Late historical checkpoints are not deleted. Performance math uses actual collection age when drift exceeds 2.5 hours, preventing false velocity/plateau conclusions.
- Studio-only metrics such as Viewed vs Swiped Away still require manual/Studio data; the public API cannot supply them.

