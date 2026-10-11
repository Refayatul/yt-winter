# Haiku creative experiments (prepared; no paid call made)

## Question

Does a Haiku-written script, opening hook or scene plan read better than production's on the same verified research? Neither a newer model nor a more expensive one is assumed to be better. The comparison is blind, and the facts are fixed.

## Arms (one paid request per topic covers all five)

| Arm | What is compared | Where it comes from |
|---|---|---|
| 1. Existing script | the production growth-plan script for the topic | `baseline.json` (computed, not paid) |
| 2. Haiku script | narration beats written only from the numbered facts (F1…Fn) | `candidate.json` → `beats[].text` |
| 3. Haiku alternative openings | three other first lines, one per style: `question`, `surprising-fact`, `visual-statement` | `candidate.json` → `openingAlternatives` |
| 4. Haiku scene plan | one concrete shot note per beat | `candidate.json` → `beats[].visual` |
| 5. Haiku natural titles | the Haiku title plus 3 alternatives, compared blind with the production title | `candidate.json` → `title`, `titleAlternatives` |

## Identical inputs and the same gates

- Every arm sees the same research record: the topic's sourced facts, numbered. The curated narration is never shown to the model.
- **Script** (`core/llm/shorts-writer.js` `validate`):
  - the production retention lint;
  - every number traced to the facts its beat cites;
  - roles, layers and beat count;
  - metadata limits.

  A script that fails is reported; it is never used.
- **Alternative openings**, each checked on its own:
  - at most 10 words;
  - numbers only from its cited facts;
  - the production lint run with the alternative as the first line, which catches forbidden openings and unsupported numbers.

  An alternative that fails is dropped from the review sheet. Alternatives never block the script.
- Whether a paraphrase is faithful to its fact is not decidable by code. A person checks it in the blind review.

## Blind review (`blind-review.md`, key in `blind-key.json`)

1. **Scripts A/B:** the order is shuffled per topic. Rate hook, factual accuracy, narrative flow, visual compatibility, audience accessibility and production readiness.
2. **Openings:** the production first line, the Haiku first line and the gated alternatives, shuffled as O1…On. Rate stop-scroll strength (1–5) and accuracy (Y/N).
3. **Titles:** the production title, the Haiku title and its alternatives, shuffled as T1…Tn. Rate natural American English (Y/N), accuracy (Y/N) and tap appeal (1–5). The title grammar gate from PR #229 applies before any title is used.
4. **Scene plan:** shot notes per beat. Rate visual compatibility. This part is not blind, because production has no written scene plan to compare against.

## Cost and approval

- **Five ImpossibleBrief topics** (IB-EAR-001, -004, -006, -007, -009):
  - reserved worst case: $0.0087;
  - expected: about $0.003 (dry run, 2026-10-11).
- **Run it** with the steps in `AUTOMATION.md` §10:
  1. a separate workspace key;
  2. the ledger;
  3. a single-use approval;
  4. `--max-usd 0.05`.

  Then:
  ```bash
  node scripts/llm/benchmark-shorts.js --out bench-ib --channel impossible-brief --count 5 --run --max-usd 0.05
  ```
- **What happens after the review:**
  - An alternative opening that wins the blind review may be tested on YouTube. Use the next-10-videos plan (`docs/growth/SHORTS-CREATIVE-AUDIT.md`, experiment E2), one variable at a time.
  - A Haiku script is not used in production until it passes the gates and wins the blind review on most topics.
