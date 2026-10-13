# Shorts narration: fallback status and licensable alternatives (2026-10-13)

## Current safety state (enforced in code and tests)

- **All fallback voices are disabled for publishing.** `config.voice.fallback.approved` is `false` for FR (`am_michael`), IB (`am_fenrir`) and CT (`af_heart`). A publishing run never narrates with an unapproved voice (`lib/shorts-tts.js fallbackPolicy`).
- **The upload guard fails closed** (`uploadAllowed`, exit 14 in `youtube-yukle.js`). It refuses a package in any of these cases:
  - the package has no readable narration record;
  - the record names no provider;
  - the narration is a placeholder (`syntheticVoice: false`);
  - the narration uses a fallback voice that is not approved for that exact voice.
- **Placeholder tones never count as narration.** They exist only for offline previews (`PUBLISH` unset), so CI can render a structure without a voice. Publishing runs stop before rendering when there is no real voice.
- **Approving a voice is an owner action.** First listen to the `tts-fallback-check` artifacts, then set `approved: true` for that one voice in that one channel.

## Licensing of the current fallback (Kokoro via kokoro-onnx)

| Component | Licence | Note |
|---|---|---|
| Kokoro-82M weights and voices | Apache-2.0 | Commercial use permitted |
| kokoro-onnx | MIT | |
| ONNX Runtime | MIT | |
| phonemizer (fork) | GPL-3.0 | Python package imported in-process |
| espeak-ng | GPL-3.0 | **Bundled as `libespeak-ng.so` in the `espeakng-loader` wheel and loaded in-process** (checked 2026-10-13, espeakng-loader 0.2.4). The 2026-10-12 incident doc calls it an "unmodified runtime tool"; it is in fact a shared library loaded into the narration process. |

GPL obligations mainly apply when software is distributed. Running it on our own CI runners to produce audio is generally not distribution. The rendered audio is output, not a derivative of the program. **This is not legal advice, and the owner has not approved it.** Until the owner decides, treat the Kokoro fallback as unapproved.

## Alternatives (none enabled; nothing here was called)

| Option | Cost | Licence and terms | Fit |
|---|---|---|---|
| **Azure AI Speech (official neural TTS)** | Free tier (F0) at the time of writing: 0.5 M neural characters a month; paid tier per character. Verify current pricing before use. | Licensed commercial API with published terms | **Recommended primary.** It offers the same Andrew, Brian and Ava multilingual neural voices the channels use today, through a supported, licensed endpoint instead of the unofficial Edge read-aloud socket. 3 Shorts a day at about 450 characters is about 40 k characters a month. It needs an Azure account and key, which is a new service and must be explicitly enabled. |
| Kokoro with `misaki` G2P instead of espeak-ng | Free | Apache-2.0 (Kokoro, misaki) | Removes the GPL component if misaki's espeak fallback for unknown words is disabled. This needs a code change and a listening test. Not verified here. |
| Piper TTS | Free | Engine: MIT for the original rhasspy/piper; the newer piper1-gpl is GPL-3.0. **Each voice has its own licence**, and its phonemizer also uses espeak-ng (GPL-3.0) | Same GPL question as Kokoro, and lower quality for documentary narration |
| Google Cloud TTS, Amazon Polly | Paid per character; both have free tiers | Licensed commercial APIs | Comparable to Azure. Our voices would change. |
| Cartesia (already used for ProfitDecoded) | Paid | Licensed | Too costly for 3 Shorts a day unless budgeted; it needs the budget and approval path |

## Recommendation

1. **Owner decision:** move Shorts narration to a licensed provider (Azure Speech is the closest match: same voices, free tier sized for current volume). Keep Kokoro only as an approved emergency fallback, or not at all.
2. Until then, a day with Edge refusing runners is a missed day, reported as **AWAITING_APPROVAL**. It is never published with an unreviewed voice.
