# CriticalThread research-only candidates

`channels/critical-thread/research-candidates/candidates.json` holds research seeds that the owner approved (batch 1, 2026-10-14, 11 candidates, 4 of them blackouts).

These seeds are not topic records:
- Every entry has `status: RESEARCH_ONLY` and a `CTC-` id, never a `CT-` id.
- Their titles and questions are unverified hypotheses.
- No production code reads the file. `tests/js/ct-research-candidates.test.js` enforces this: production selection reads only `topic-universe.json`.

## Check

```
node scripts/ct-candidates.js --check
```

The check:
- validates the file;
- reports possible duplicates in the CriticalThread, Failure Reconstructed and ImpossibleBrief topic universes and in their publication histories (`icerik/yayinlananlar.json`, `channels/*/state/published.json`).

Any hit needs an owner review. A **title** hit is a likely duplicate. A **text** hit is a mention inside another record's evidence, and can still be the same event: the Milwaukee 1993 seed matched CT-219 only in its text.

## Promotion (owner-approved, not automated)

A candidate reaches `topic-universe.json` only through these steps, each approved by the owner:

1. **Research dry run** (`write=false`) for the chosen candidates. This needs a separate PR that adds a candidate mode to `scripts/ct-research.js`; this file adds none. That mode evaluates the would-be record against an in-memory copy of the universe and writes nothing.
2. **Evidence**: the record must pass the unchanged verification. That means:
   - verbatim quotes and numbers checked against the live source;
   - at least 2 reachable primary references;
   - narration support;
   - the builder's lint, legacy audits and hooks.
3. **Qualification**: the record must also pass the unchanged production gate: bucket A, viral score ≥ 75, and readiness not BLOCK.
4. **Duplicates**: `--check` must be clean again right before promotion.
5. **Owner approval** of the specific candidate IDs, then one `write=true` run that appends only those verified and qualified records. The candidate entry is then marked `PROMOTED` with the new `CT-` id.

No step publishes or schedules anything. Production picks a promoted record only through its normal selection.
