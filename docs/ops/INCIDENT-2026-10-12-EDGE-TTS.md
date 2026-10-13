# Incident 2026-10-12: no Shorts published (Edge TTS refused GitHub runners)

## What happened

No video was uploaded for FR, IB or CT on 2026-10-12. The production runs (15:03, 15:49, 16:27, 16:49 and 16:53 UTC) all ended green.

| Channel | Failing stage | Evidence |
|---|---|---|
| Failure Reconstructed | NARRATION, then RESEARCH | 15:03 run: the queue tried 28 qualified topics in turn. Every one failed with `Seslendirme 4 denemede basarisiz: Edge TTS ... 403`, and every one was written to `icerik/basarisiz.json` as permanently failed. From 16:27 the queue had no qualified topic left (`NO_QUALIFIED_TOPIC`, best viral score 74). |
| ImpossibleBrief | NARRATION | Each run rendered a Short with a tone placeholder, then refused to publish it: `Publishing blocked: a real synthetic narration render is required`. The topic was not spent. |
| CriticalThread | RESEARCH | `NO_QUALIFIED_TOPIC` (the separate threshold issue, PR #234). |

Upload history confirms that nothing was uploaded, scheduled or published:
- each channel's `quota-ledger.json` shows 0 `videos.insert` for 2026-10-12;
- the public channel feeds' latest videos are FR 2026-10-11, IB 2026-10-11 and CT 2026-10-06.

GitHub also started the scheduled runs late: the first one came at 15:03 UTC instead of 06:00.

## Root cause: Edge refuses the synthesis WebSocket from GitHub-hosted runners

Evidence from three runners (`scripts/tts-diagnostics.js`, workflow "TTS availability and fallback check", regions westus2, centralus and westus):

| Check | Result on runners |
|---|---|
| Synthesis WebSocket handshake (production client, msedge-tts 2.0.9) | **403 on 18 of 18** |
| Same handshake from the reference client (Python edge-tts 7.2.8: newest token version, `muid` cookie, clock-skew retry) | **403 on 18 of 18** |
| Voices list (same `Sec-MS-GEC` token, plain HTTPS) | 200 on 18 of 18 |
| Clock offset against the service's `Date` header | ≤ 2 s |

Conclusions:
- The token is accepted (the voices list returns 200), the clock is right, and the newest independent client is refused the same way. So the cause is not client version, clock skew or token generation.
- The refusal targets the synthesis endpoint from datacenter addresses.
- **Onset: between 14:52 and 14:59 UTC on 2026-10-12.** Earlier runner jobs (2026-10-02 to 2026-10-11, all regions) logged no 403.
- From a residential connection the same client was also refused intermittently on the same day: 9 of 16 handshakes failed. Changing request headers made no reliable difference (7/10, 5/10 and 4/10 succeeded across the variants). The provider is throttling or blocking broadly, and most strictly for datacenter IP ranges.

The Edge read-aloud endpoint is not a published API. It has no SLA or terms for automated use, and the repository already labels it "not licensed for monetised use" (`profitdecoded-voice-audition.yml`). Nothing here tries to get around the refusal: no proxies, no IP rotation, no header spoofing beyond what the client already sends.

## Damage repaired in this PR

- **28 FR topics** failed only because Edge refused narration; every one was verified against the run log. They are removed from `icerik/basarisiz.json` (`halifax-explosion`, an older genuine failure, stays). With them restored, FR has 28 qualified topics again.

## Fixes in this PR

| Fix | Where |
|---|---|
| A narration outage no longer spends topics. `shorts-yap.js` exits 75 (NARRATION_UNAVAILABLE) and the FR queue stops without marking the topic failed. IB/CT stop before rendering when publishing. | `shorts-sira.js`, `shorts-yap.js`, `core/rendering/index.js`, `core/pipeline/impossible-brief.js` |
| Every narration must pass a speech check before rendering continues. Silence, a tone, a truncated read or clipping is refused. | `lib/speech-check.js` |
| Offline fallback voice, **off until the owner approves it per channel**: Kokoro-82M via kokoro-onnx on CPU. Each channel has its own voice (FR `am_michael`, IB `am_fenrir`, CT `af_heart`), so voices stay distinct. A Short is never narrated by two voices. | `lib/shorts-tts.js`, `scripts/kokoro_lines.py`, `config.voice.fallback` |
| An unapproved fallback narration can never be uploaded, however the package was produced (exit 14). | `youtube-yukle.js` |
| Bounded retries: Edge keeps its existing limits (FR 4 attempts; IB/CT 3 per line). After the first refused line, IB/CT stop asking Edge for the rest of that Short. `SHORTS_EDGE_TTS=off` skips Edge entirely during an outage. | `core/rendering/index.js`, `shorts-yap.js` |
| Health pre-flight now checks four more things: a qualified topic exists (the old check counted "327 days" while 0 topics qualified), the voice works (Edge, or an approved fallback), the renderer tools are present, and there is enough disk. A narration, tools or disk failure blocks the slot and alerts the owner through the existing health issue. | `saglik.js` |
| Each run records every production stage per channel (RESEARCH … PUBLISH) and an outcome. The run summary shows the table, and **the scheduled run fails when an active channel was due and nothing was uploaded.** | `lib/run-stages.js`, `scripts/production-outcome.js`, `portfolio-production.yml` |

## Kokoro on the real GitHub runner (measured 2026-10-12)

| Measure | Result |
|---|---|
| Implementation | kokoro-onnx 0.6.1 (ONNX Runtime 1.31, CPU). `kokoro-mlx` is Apple-only and is not used. |
| Runner | ubuntu-24.04, 4 vCPU AMD EPYC 9V74, 16 GB RAM |
| `pip install` (cold) | 6.2 s |
| Model download (354 MB, cold; cached in production) | 1.2 s |
| Model load | 0.8 s |
| Synthesis speed | 0.50–0.54 × real time (a 29 s narration in about 15 s) |
| Peak memory | 590 MB |
| Failure rate | 0 of 81 narrations (6 voices plus 5 repeat runs of 3 channels); every one passed the speech check |
| Licences | Kokoro-82M model and voices: Apache-2.0. kokoro-onnx: MIT. ONNX Runtime: MIT. Its phonemizer uses espeak-ng (GPL-3.0) as an unmodified runtime tool on the runner, not distributed. The owner should confirm this is acceptable. |

On macOS, the kokoro-onnx wheel's espeak-ng loader fails with a hard-coded build path, on both Python 3.12 and 3.14. Local Mac listening samples therefore come from the runner artifacts.

## What remains the owner's decision

1. Listen to the samples, then approve or reject each channel's fallback voice by setting `config.voice.fallback.approved` to true.
2. Merge this PR.
3. Decide whether to keep Edge as the primary voice at all. Its availability from GitHub runners is outside our control.

## Recovery on 2026-10-13 (not a permanent fix)

- **13:58 UTC, run 38409326669:** all three channels got Edge 403 three times. They were correctly reported as `AWAITING_APPROVAL` and nothing was rendered or uploaded.
- **14:26 UTC, run 38413360708:** Edge worked for FR, IB and CT. Three Shorts were uploaded private for 2026-10-13 21:00 Istanbul, and each was read back from YouTube.
- **Most likely cause of the recovery:** `msedge-tts` 2.1.0 was published to npm at **14:14:59 UTC**, between the two runs.
  - 2.1.0 moves to a new endpoint (`wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1`) and a new query parameter. It also adds server clock-offset correction.
  - `package.json` allowed `^2.0.7` and there is no lockfile, so the 14:26 run installed 2.1.0 automatically, and the 13:58 run had 2.0.9.
  - Both runs used the same runner region and image.
  - The logs did not print the installed version, so this is a strong inference, not proof.
- **Changes made afterwards:**
  - `msedge-tts` is pinned to exactly `2.1.0`.
  - Every narration health line now names the installed client version (`msedge-tts X.Y.Z`).
  - Regression tests: `tests/js/ops-nonfatal-fixes.test.js`.
- **Still a risk:** this is an unofficial endpoint kept working by a third-party library. Microsoft can change it again at any time, and a pinned version will not follow such a change by itself. A licensed provider (Azure AI Speech) and an approved emergency fallback are still owner decisions, kept separate in `TTS-FALLBACK-OPTIONS.md`.
