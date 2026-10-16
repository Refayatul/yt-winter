# Premium Shorts engine v1: release notes and operating rules

**What this is:** an **offline, manually invoked** production path for evidence-backed premium Shorts.

**What it does not do:**
- it does **not** replace or change any channel's normal pipeline (`portfolio-production.yml`, `uretim.yml`);
- it changes no schedule, topic selection, channel config or voice approval;
- no workflow calls it, and a test enforces that.

**Development history:** the full record (Challenger and Apollo 13 pilot rounds, prototypes, QA reports, review packages) stays on the unmerged pilot PR eyazan/youtube-otomasyon#255. This release contains only:
- the reusable engine;
- its tests;
- the fixtures those tests read.

## 1. Released components (`scripts/fr-premium/`)

| Component | Files | Role |
|---|---|---|
| Renderer | `render-vertical.js`, `fr-lib.js`, `fr-forensic.js` | Deterministic 1080×1920 / 30 fps headless-Chromium renderer. Lossless fast capture, about 0.09 s per frame on an M1 (1,668 frames in 154 s). |
| Engine | `engine/planner.js`, `engine/fr-plan.js`, `engine/timeref.js`, `engine/camera-presets.js`, `engine/templates/*` | Shot planner, narration-anchored time references, camera presets, template registry |
| Evidence gate | `engine/validate.js`, `engine/schemas/*`, `engine/asset-matcher.js`, `engine/component-extract.js` | Verbatim claims, provenance, licences, on-screen numbers only from claims, approximation markers, test-imagery disclosure |
| Channel pack | `engine/channels/failure-reconstructed.json` | The **only** pack. Any other channel fails validation ("no channel pack"). |
| QA | `qa-vertical.js` (technical), `text-qa.js` (text gate), `creative_qa.py` (WARN-only creative measures) | Unchanged thresholds |
| Audio | `narrate-edge.js`, `narrate_kokoro.py`, `mix-audio.js` | Narration with measured word timings; mix and master to −14 LUFS |
| Contract | `engine/premium-contract.js`, `engine/channels/premium-policy.json` | One verdict per premium video (§3); never uploads or publishes |

## 2. Experimental components (not for normal production)

| Component | Status |
|---|---|
| `engine/experimental/creative-director.js` | Storyboard re-sequencing pass. Tested, but only used by hand; the planner never calls it. |
| `anchor_suggest.py`, `anchor_review.py` | Anchor **suggestions** only. Every suggestion stays SUGGESTED until a human verifies it; low-reliability methods are always NEEDS_HUMAN_REVIEW. |
| `component-section` measured mode | Needs human-verified drawing anchors; conceptual mode (disclosed) is the default. |
| `sound_design.py` | Challenger-specific; not general. |
| Challenger / Apollo 13 fixtures under `channels/failure-reconstructed/premium/` | Test fixtures, **not** production topics. Both are remakes of published Shorts and need owner approval per video. |

## 3. Standard premium quality contract

`premium-contract.js` maps 12 criteria to the gate that measures each one, or to a human:

1. hook strength
2. factual accuracy
3. evidence provenance
4. narrative clarity
5. visual variety
6. mobile readability
7. shot continuity
8. narration alignment
9. scene composition
10. creative quality
11. technical rendering quality
12. licensing compliance

It keeps **five separate results**:

| Pass | Source | Rule |
|---|---|---|
| Technical | `qa-vertical.js` hard checks + text gate | Any hard failure means **BLOCKED** |
| Evidence | `validate.js` + licence allowlist (public-domain, cc0, cc-by, cc-by-sa with attribution) | Any error means **BLOCKED** |
| Creative | `creative_qa.py` (WARN-only by gate policy) | Any warning needs a **human creative sign-off**; warnings stay reported, never auto-approved |
| Human | Approvals record: script, voice (for this video), creative, publish, plus remake when the topic was already published | Each approval needs `by` and `at` |
| Publishing eligibility | All of the above | **A technical or evidence pass never implies eligibility.** Eligibility only lets the video enter the normal pipeline's own gates. |

**Example:** the Apollo 13 evaluation pilot gets **NEEDS_HUMAN_REVIEW**:
- technical PASS, evidence PASS;
- creative needs sign-off (54 warnings);
- the creative, publish and remake approvals are missing.

## 4. Channel policy

| Channel | Premium mode | Production |
|---|---|---|
| Failure Reconstructed | `offline-review`: premium videos may be made offline; every one needs the contract's approvals; `autoPublish: false` | The daily Short continues on the existing pipeline (09:00 Istanbul) with its own quality gate. |
| ImpossibleBrief | `not-available`: no IB pack. FR engineering templates are not allowed (the validator rejects them). An IB cinematic what-if pack would be a separate, approved project. | The daily Short continues on the existing pipeline (09:30 Istanbul). |
| CriticalThread, The Hidden Logic of Things, ProfitDecoded | `not-available` | Unchanged |

## 5. How a premium FR video would enter production (manual, per video)

1. Evidence and assets: `evidence.json` (verbatim passages) and `assets.json` (licence, sha256).
2. Script with claims. Narration via the approved channel voice, giving measured word timings.
3. `planner.js`, then `validate.js`. Optionally `creative-director.js`.
4. `render-vertical.js`, then `mix-audio.js`.
5. `qa-vertical.js`, `text-qa.js` and `creative_qa.py`, then the **contract**.
6. If the contract says `PUBLISH_ELIGIBLE`, the owner hands the MP4 to the normal pipeline. Otherwise it stays held. There is no automatic path.

## 6. Backlog (not release blockers)

- An IB channel pack, as an approved project.
- General sound design.
- Optional wiring of the contract into the normal pipeline, behind an owner flag.
- A caption-sync check that pairs mid-phrase cues with the right onset.
- Automating evidence and asset research for new FR topics (today it is a manual research step).
