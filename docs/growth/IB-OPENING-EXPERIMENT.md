# ImpossibleBrief opening experiment (prepared; NOT active)

## Question

Does the craft v2 opening keep more viewers past the first seconds than the current opening? The craft v2 opening is:
- a subject photograph or illustration, chosen for subject match and legibility;
- a large boxed hook.

Only the opening changes. These stay as they are:
- the facts, script, title and voice;
- the sources and licensing;
- every gate.

## Design

| | |
|---|---|
| Framework | `core/growth/experiments.js`: one variable, assignment before production, no second upload of any video |
| Variable | `opening_visual` |
| A (control) | `current`: today's opening |
| B (variant) | `craft-v2-opening`. `Craft.features` turns on the opening alone; the repeat, pacing and caption changes stay off. |
| Size | 10 Shorts, 5 per arm |
| Assignment | **Matched pairs, planned in advance** (`planned` in the experiment record). See below. |
| Who is in it | Only the 10 planned topics. Every other Short is produced exactly as today. |
| Schedule | Unchanged. The planned topics are the selector's own next picks, so they arrive in the normal publishing order. |

How the pairs are built:
1. Take the next 10 topics that IB's production selector would choose.
2. Pair them by category, then by selection score.
3. A deterministic coin decides which topic in each pair gets B.

Hash-random assignment could give 7/3 at this size. Matched pairs keep the arms at 5/5 and balanced.

### Plan computed on 2026-10-12 (actual `main`; it is recomputed at activation)

Before planning, the CLI applies two checks:
- **Production's pre-render gate** (`chooseTopic` → `planShort`), so a topic production would block never holds a slot.
- **The arm check:**
  - control: `{opening:false, repeats:false, pacing:false, captions:false}`;
  - variant: `{opening:true, repeats:false, pacing:false, captions:false}`;
  - result: **only the opening differs**.

| Pair | A: current opening | B: craft v2 opening | Category | Selection score | Viral potential | Bucket |
|---|---|---|---|---|---|---|
| 1 | what-if-water-refused-to-freeze | what-if-you-could-touch-earths-core | PHYSICS | 78 / 80 | 76 / 79 | A |
| 2 | what-if-ocean-plankton-disappeared | what-if-synthetic-fertilizer-disappeared | OTHER | 79 / 80 | 78 / 79 | A |
| 3 | what-if-a-whale-fed-the-deep-sea-for-decades | what-if-mosquitoes-went-extinct | OTHER | 78 / 79 | 77 / 78 | A |
| 4 | what-if-we-gave-mars-a-thicker-atmosphere | what-if-we-built-a-star-on-earth | FUTURE TECHNOLOGY | 78 / 79 | 77 | A |
| 5 | what-if-earth-spun-like-the-fastest-pulsar | what-if-we-beamed-solar-power-from-space | EXTREME SCIENCE / FUTURE TECHNOLOGY | 79 / 78 | 78 / 77 | A |

Arm means:
- selection score: 78.4 (A) vs 79.2 (B);
- viral potential: 77.2 (A) vs 78.0 (B).

**Fixed before activation.** For a hook containing a number, both arms used to open on the figure card, because the existing "numeric hook opens on its card" rule ran before the craft opening. Under the craft opening, the first frame is now the chosen subject picture (`tests/js/shorts-craft.test.js`).

## Metrics

The growth feedback loop already collects the 72-hour (`3d.json`) and 7-day (`7d.json`) checkpoints.

| Role | Metric | Source |
|---|---|---|
| **Primary** | Average percentage viewed at 72 h | YouTube Analytics API (`averageViewPercentage`) |
| Secondary | The same at 7 days; views; 30-second retention (`first30sRetention`) | Analytics API |
| Secondary, when imported | **Stayed to watch** ("Viewed vs swiped away") | YouTube Studio only. Export it and import with `scripts/studio-import.js`. |
| Proxy only | engagedViews ÷ views | Reported, labelled as a proxy. **Not** YouTube's stayed-to-watch, and never used for the decision. |

`node scripts/growth/opening-experiment.js report` prints both checkpoints per arm.

## Decision rule

- **When a call can be made:** only when both arms have 5 videos with the 72-hour checkpoint.
- **What counts as a win:** B wins only if its mean is higher by more than the spread within the arms. The framework's `evaluate` reports |z| ≥ 2 as "consistent with hypothesis".
- **Otherwise:**
  - the result is "inconclusive", and nothing is concluded;
  - with n = 5 per arm, only a large effect can show.
- A win would be confirmed on the next 10 Shorts before the opening becomes the default.

## Activation (owner approval required; none done)

1. Merge #229. The arm needs the craft code, and `planned` assignment is in #229.
2. Recompute and review the plan: `node scripts/growth/opening-experiment.js plan`.
3. Create the experiment with `node scripts/growth/opening-experiment.js plan --write`. This writes `channels/impossible-brief/memory/growth-experiments.json` and must be committed.
   - Production then assigns arms when it plans each listed topic.
   - Do **not** set `SHORTS_CRAFT_V2` for IB during the experiment: it would put the craft opening in the control arm too.
4. After 72 hours and after 7 days: `node scripts/growth/opening-experiment.js report`.
5. When the run ends: set the experiment's status to `COMPLETE` in the same file.
