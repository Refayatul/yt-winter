# Two-channel 30-day simulation

Result: **PASS**

Window: 2026-10-01 for 30 days. Uploads and renders were simulated; no external publish occurred.

## Output

| Channel | Shorts | Long-form | Unique topics | Recovered failures |
|---|---:|---:|---:|---:|
| failure-reconstructed | 30 | 6 | 30 | 3 |
| impossible-brief | 30 | 5 | 30 | 4 |

## Injected failures

- Day 2, impossible-brief: **channel token expired** → refresh credential and retry same isolated task.
- Day 5, failure-reconstructed: **network failure** → bounded retry.
- Day 8, impossible-brief: **render failure** → release render lock and retry.
- Day 11, failure-reconstructed: **upload failure** → retain topic and retry without duplicate.
- Day 14, impossible-brief: **quality block** → block topic and choose next qualified topic.
- Day 17, failure-reconstructed: **state write conflict** → reload, compare-and-swap and retry.
- Day 20, impossible-brief: **API unavailable** → publish state unaffected; analytics checkpoint deferred.

## Isolation and safety checks

- PASS: failureReconstructedShorts
- PASS: impossibleBriefShorts
- PASS: noDuplicateUploads
- PASS: noTopicLoss
- PASS: noStateCollision
- PASS: channelFailureIsolation
- PASS: wrongChannelUploadBlocked
- PASS: renderConcurrencyRespected
- PASS: uploadConcurrencyRespected

The explicit wrong-channel attempt was blocked with `CHANNEL_ID_MISMATCH` before upload-session creation or state mutation.
