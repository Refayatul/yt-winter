# CriticalThread Evidence-First V1 — experimental Stage B

This draft PR depends on Stage A PR #285. It is stacked on the Stage A branch and must not be merged before Stage A review/merge and a fresh retarget/CI check. Neither PR touches production selection, ct-research.yml, CT_RESEARCH_AUTO, YouTube, voices, scheduling or Cloudflare.

## Execution contract

scripts/ct-evidence-story.js exports runOfflineExperiment (and generateStory for replay from a sealed evidence package). There is intentionally no automatic CLI, no default network/API adapter and no workflow dispatch. Callers inject generate and verifyPrimary. No live research occurs in this PR. The existing long-form provider token budget/TPM logic is retained by passing the shared per-topic budget into requests; this experimental adapter additionally guards the 45k run budget.

Stage A evidence (16 distinct accepted claims, direct quote matches on 2 independently fetched original documents, semantic review required) is the only input to Stage B. Stage B receives approved claims and quotes only; rejected facts and source excerpts are excluded. Its structured result carries fact_ids for narration, fields, opening candidates, titles and visual concepts.

## Conservative semantic and hook policy

Text is marked SUPPORTED only if it is an exact contiguous string inside a cited fact claim or quotation. This is a *syntactic* guarantee, not an attestation that the claim is semantically true. Untraced numbers and unsupported negation are UNSUPPORTED; paraphrases, causal leaps, wrong-subject possibilities and invented entities not reliably distinguishable are NEEDS_REVIEW or UNSUPPORTED. All output still requires human semantic review.

The existing hook engine is called without changes. Its full candidate list, order and score remain intact. A top candidate must be directly supported by approved facts, and its selection must remain stable after openingLine/narration[0] are synchronized. A supported runner-up may NEVER silently replace an unsupported winner: fail closed. 20 candidates and score ≥76 are unchanged; V1 additionally insists on 20 exact-source-supported candidates before proposing a hook as usable. This conservative condition may reject all realistic topics until validated; never relax it silently.

The existing builder runs offline:true, write:false, producing only diagnostics (quote/source verification against live originals is not performed offline). A clean offline report is NOT a production permission. Even an entirely clean result returns HUMAN_SEMANTIC_REVIEW_REQUIRED.

## Known limitations

- Exact-substring matching creates false negatives for legitimate paraphrase and cannot prove cause-and-effect semantics.
- A flawed source quote can still produce a misleading fact. Independent factual/editorial review is mandatory.
- Primary-source retrieval uses an injected adapter, not provided by PRs #285/#286; the adapter must enforce redirect safety and document identity.
- Stage B currently performs only one draft generation, with no automatic retries of the story; a caller may replay Stage B from sealed Stage A evidence after owner review.
- Offline fixture success establishes wiring and fail-closed behavior, not whether Groq can write a passing story or hook.

## Live dry-run

No live command is authorized yet. After both PRs are reviewed and merged and an explicit read-only CLI/provider adapter is approved, add a manually invoked, opt-in command, first with one topic and write=false. Do not configure a new cron or automatic promotion.
