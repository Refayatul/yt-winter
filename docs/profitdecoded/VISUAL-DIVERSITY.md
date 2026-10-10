# ProfitDecoded visual-diversity pass

ProfitDecoded motion scenes carry an authored `category`, `background`, `layout`, `textWeight`, and `motion` in their shot metadata, plus optional `sourceQualified` and `semanticAnchor`. The renderer exports `out/visual-diversity.json` and `.md` before capturing frames, including with `--analyze-only` and `--stills`. Older storyboards without these fields are classified heuristically and the report counts those inferences.

These findings are review prompts for an editor. They are not audience-retention measurements, predictions, or fixed quotas. A long chart can be the right choice when its internal build tracks the narration. Nothing here uploads, approves, or publishes media.

## Where it runs

| Production path | When | Output |
| --- | --- | --- |
| Automated pipeline: `auto-produce.js` → `render.js` → `profitdecoded.js dry-run` | After every render | `out/visual-diversity.{json,md}`; summary in `bundle.render.visualDiversity`; an "advisory" section appended to `out/review-report.md` |
| Hand-authored motion films: `motion/render-motion.js` | Before frame capture, including `--analyze-only` and `--stills` | `out/visual-diversity.{json,md}`, `out/visual-frame-samples.json` |
| CI (`profitdecoded-render.yml`) | Both jobs | The report is kept with the review artifacts |

In both paths the findings are advisory. They never change a render result, the assessment decision, or a QA pass. If the diagnostics themselves fail, the automated renderer logs the failure and keeps the video.

In the automated renderer, each plan `type` maps to an editorial category (`fromPlanShot`). Text sizes are read from the ImageMagick frame arguments, not measured in a browser.

## Inputs

| Input | Where it comes from |
| --- | --- |
| Shot list with timings and authored roles | `PD.init` in `brand-lib.js`, from the film's `scenes.js` |
| Narration sentences with measured times | `out/timeline.json` |
| Rendered-frame observations | `render-motion.js` evaluates the composed SVG once per shot, at 82% of its duration, and measures text bounds at a 640 px playback width (the 1920 px canvas scaled by one third) |
| Near-static intervals (optional) | `--qa qa.json`, the `freezes` array written by `qa-media.js` on a rendered master |

Mark purely decorative text (paper texture, SEC boilerplate on a typeset cover) with `data-role="decorative"`, and source lines with `data-role="source"`. `PD.source`, `PD.sourceCompact`, `PD.filingQuote` citations, and `PD.docCover` boilerplate already do this.

## Checks

Every finding has a timestamp range, the shot ids involved, a severity, a plain-language reason, a suggested action, and a `diagnostic` object with the measured values. Run-based findings escalate one severity level once the run reaches twice its threshold.

| Kind | What it measures | Threshold | Severity |
| --- | --- | --- | --- |
| repeated background | Consecutive shots on a dark stage | ≥3 shots and ≥25 s | medium |
| chart-heavy run | Adjacent chart layouts | ≥2 shots and ≥20 s | medium |
| repeated layout | Adjacent shots sharing a non-generic layout (chart, document, evidence card, environment…) | ≥3 shots and ≥22 s | medium |
| text-heavy run | Adjacent text-led shots (title cards, typeset definitions) | ≥2 shots and ≥16 s | medium |
| context opportunity | Time since the last everyday-setting shot (illustrated place, or `background: context/mixed`) | ≥70 s | medium |
| low variety | Rolling 90 s windows (15 s step) in which one visual category fills at least 85% of the time; overlapping windows merge into one finding | 85% share | medium |
| repeated motion | Adjacent shots with the same authored motion pattern (generic `animated` is ignored) | ≥3 shots and ≥25 s | low |
| long shot for review | A single shot's duration; review its internal reveals against the spoken beats | ≥22 s | low |
| narration alignment | A non-title shot with no measured narration overlapping it | >8 s of silence | high |
| semantic alignment | A shot's `semanticAnchor` terms (comma-separated) do not occur in the narration that overlaps it | any | medium |
| mobile text | Smallest essential (non-source, non-decorative) text height at 640 px width | <10 px | medium |
| source qualification | A sourced claim shot (`sourceQualified`, or a claim id such as `c3`/`i2` in `asset`) whose sampled frame has no source line, clips it at the frame edge, or sets it below 8 px at 640 px | any | high |
| static visual | A measured near-static interval in the rendered video (ffmpeg `freezedetect`, noise 0.001) | ≥2.5 s | medium |

The report also carries a `summary` with measured values that are useful for before/after comparisons: category switches per minute, share of time in an everyday setting, share on a dark stage, longest dark and longest abstract runs, lowest category count in any window, and finding counts by severity.

## Using it on a new film

1. Give every `shot(...)` an honest `category`. Use `financial evidence` only for sourced figures or filing wording, and `real-world illustration` only for an everyday place or object. Mark sourced figures with `sourceQualified: true`, and put the spoken number or term in `semanticAnchor` so a misplaced visual is caught.
2. Run `render-motion.js <film> --analyze-only` and read `out/visual-diversity.md` before any frame capture.
3. After rendering, run `qa-media.js` and re-run the analysis with `--qa` to add measured holds.

The checks are topic-neutral. Airline, supermarket, subscription, or banking films use the same categories and the same environment, evidence-card, and citation components.

## Reusable visual components

- `PD.environment(kind, t)`: original, unbranded desk, café, checkout, and restaurant settings. They are editorial illustrations. A shot list must never call them documentary footage or a named company's premises.
- `PD.evidenceCard({...})`: one sourced figure, its label, and its meaning on one large card. Type stays above 10 px at 640 px width.
- `PD.sourceCompact(text)`: a short, accurate on-screen citation for phone viewing. Keep the full reference in the dossier, the description, and the end card. It does not remove qualifiers such as "our arithmetic" or "survey estimate".

## Targeted revisions of an existing master

`revise-master.js` renders only the named shots plus an 18-frame handle around each end, keeps the original picture between them, and copies the original AAC audio stream into the new file without any speech synthesis. It refuses to write over its source. With `--resume`, a completed segment is reused only when the source, scenes, renderer, and library hashes still match and the segment's hash and frame count verify. The manifest lists source and output hashes and the exact frame ranges.

```sh
node scripts/profitdecoded/motion/render-motion.js channels/profitdecoded/films/hbm-073-gift-cards --analyze-only
node scripts/profitdecoded/motion/revise-master.js channels/profitdecoded/films/hbm-073-gift-cards \
  --source /path/to/v2.mp4 --out /path/to/v3.mp4 --work-name revision-v3 --resume --ids sbux-200,darden-pool
node scripts/profitdecoded/motion/qa-media.js /path/to/v3.mp4 --srt captions.srt --out v3-qa.json --min 537 --max 539
node scripts/profitdecoded/motion/render-motion.js channels/profitdecoded/films/hbm-073-gift-cards --analyze-only --qa v3-qa.json
node scripts/profitdecoded/motion/visual-metrics.js /path/to/v3.mp4
```

Watch and listen to the whole new film before any approval.
