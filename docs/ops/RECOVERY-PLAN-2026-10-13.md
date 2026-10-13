# Shorts production recovery plan (2026-10-13)

The audit used read-only evidence from `main` at `7168d6e`: registries, quota ledgers, failure lists, decision logs, Actions runs and job logs, and issues. It also used offline dry runs in an isolated worktree. Nothing was uploaded, published, dispatched or paid for.

## Production health by channel (as of 2026-10-13 03:00 UTC)

| | FR | IB | CT |
|---|---|---|---|
| Last scheduled Short (registry) | 2026-10-11 18:00 UTC `tSanOctggR4` | 2026-10-11 18:00 UTC `9oMvT2-bE9E` | 2026-10-06 18:00 UTC `24eJvZ2cswc` |
| `videos.insert` on 2026-10-12 (quota ledger) | 0 | 0 | 0 |
| 2026-10-12 outcome | Narration refused (Edge 403) for 28 topics, each written to `icerik/basarisiz.json`. 8 more were BLOCKed by the pre-gate (retention < 75, legitimate) | Tone placeholder rendered, then refused by the publish gate (topic not spent). 3 topics BLOCKed by the visual pre-check (legitimate) | `NO_QUALIFIED_TOPIC` (pool of 2, both bucket B) |
| Public status | Not verifiable from this environment (youtube.com is blocked). Registry entries are private with `publishAt`; YouTube makes them public at that time | same | same |

## Root causes

1. **Edge TTS refuses GitHub runners** (403 on synthesis since about 14:55 UTC on 2026-10-12). The diagnosis is in #251. Main has no fallback and no preflight. FR marked every refused topic as permanently failed.
2. **The CriticalThread pool is exhausted under the v2 policy.** `config/viral-quality-v2.json` (2026-10-04) requires bucket A and viral ≥ 75. The pool fell from 50 to 5 (2026-10-06) to 2 (2026-10-08 onward), and both remaining topics are B (CT-437 VP 79, CT-265 hook 77). The decision log stored `reason: null` on every skipped day. The threshold is correct and must stay.
3. **Late GitHub cron.** The portfolio crons start at 06:00 UTC, but the first runs came at 13:15, 12:31 and 15:03 UTC on 10-10, 10-11 and 10-12. Every day's production therefore happens close to the 16:30 UTC deadline.
4. **Watchdog false alarm (fixed here).** The 17:07 UTC watchdog cron ran at 23:35 UTC, after midnight Istanbul. It treated 2026-10-13 as missed 17 h before that day's deadline and opened issues #256, #257 and #258. It also wrote `sla-failure:2026-10-13` into every channel's notification state, which **suppresses the real alert if 2026-10-13 fails**.

## Duplicate-upload review

- Two slugs have two video IDs (IB `what-if-the-dinosaur-killing-asteroid-hit-today`, CT `what-quietly-depends-on-uninterruptible-power-supply`). Both are deliberate 2026-10-04 replacements (`replacementForVideoId`), made by the replacement workflow that is now manual-only. The owner should confirm the replaced originals are private or deleted.
- Production and the watchdog share the `portfolio-production` concurrency group. Recovery runs only after the YouTube API confirms the day is empty. Registry, title and idempotency guards are in place. No new duplicate risk was found.

## PR dependency and merge order

The three PRs touch mostly separate files. Overlaps:

- #251 and #235: `core/rendering/index.js` and `quality-preview.yml`.
- #234 and #235: `core/growth/index.js`, `scripts/ct-research.js` and `tests/js/ct-research.test.js`.

Merged together on current `main`, the only textual conflict is two tests appended at the same place in `tests/js/ct-research.test.js` (keep both). The combined tree passes 639/639 JS and 24 Python tests, including this fix.

Recommended order:

1. **This PR** (watchdog guard): independent and smallest.
2. **#251** (TTS): stops topic loss and restores 28 FR topics. It is still blocked for publishing until a fallback voice is approved, or until Edge works from runners again.
3. **#234** (CT selection): CT-219 becomes eligible at A/77 with the threshold unchanged.
4. **#235** (creative): merge last and resolve the test-file conflict. Its spoken-opening change is always on for IB/CT.

## Review findings on the open PRs (not changed here)

- **#251, fail-open upload guard.** `uploadAllowed()` returns ok when no `Videos/denetim.json` or `render.json` audio record exists, so a package without a narration record passes the fallback-voice check. Recommendation: refuse when the record is missing.
- **#251, Kokoro cache.** A corrupt or partial model download fails `sha256sum`. The step is `continue-on-error`, though, and `actions/cache` will still save the bad files. Later runs skip the download (`[ -s file ]`) and fail the checksum forever. Recommendation: delete the files on checksum failure.
- **#251, red runs every day.** The verdict step fails every scheduled portfolio run while CT is `NO_TOPIC` (up to 14 red runs a day) until #234 lands and CT has curated topics.
- **#251, other outages still spend FR topics.** Asset-source outages (Wikimedia, Pexels) still mark FR topics as failed. Only narration outages are treated as infrastructure failures.
- **#234 and #235:** no threshold was lowered. Curated CC BY-SA pictures go through the existing attribution path (`visual-attribution.json`).

## Offline dry run (isolated worktree; combined tree; Edge off; Kokoro preview voices; `PUBLISH` unset)

| Stage | FR (`titanic-1912`) | IB (`IB-EXT-050`) | CT (`CT-219`) |
|---|---|---|---|
| Topic selection | A / 79 | A / 81 | A / 77 (with #234; none on `main`) |
| Script plan | 8 lines | 8 lines; script, science, sources and hook validations pass | 8 lines |
| Assets | **Not run**: Wikimedia unreachable from this container | Licensed images unreachable | Licensed images unreachable |
| TTS (Kokoro preview) | `am_michael`, 28.7 s, speech check OK | `am_fenrir`, 25.4 s, speech check OK, −16.0 LUFS | `af_heart`, 27.8 s, speech check OK, −15.1 LUFS |
| Render | Not reached | 1080×1920, 25.5 s, audio present | 1080×1920, 27.8 s, audio present |
| Technical / creative QA | n/a | **BLOCK**: visuals (0 licensed images) | **BLOCK**: visuals (0 licensed images) |
| Publish readiness | Not ready | Not ready (correctly fail-closed) | Not ready (correctly fail-closed) |

The unapproved voices were refused for publishing (`allowed: false`) and without an explicit preview request. Neither a real upload path nor the asset stage could be verified from this environment.

## Owner decisions

1. **Today (2026-10-13), before 16:30 UTC.**
   - Close #256, #257 and #258 as false alarms.
   - Remove `sla-failure:2026-10-13` from `icerik/bildirim-durum.json`, `channels/impossible-brief/state/notification-state.json` and `channels/critical-thread/state/notification-state.json`, or accept that a real failure today will not open an issue.
2. Listen to the #251 samples and approve or reject a fallback voice per channel. Until then, Shorts cannot publish while Edge refuses runners.
3. Accept or reject espeak-ng (GPL-3.0) as an unmodified runtime tool.
4. Decide whether Edge stays the primary voice.
5. Curate licensed pictures for more CT topics. This is the route to a steady CT supply at the unchanged threshold.
6. Consider moving the portfolio crons off :00 and :30. This is a schedule change, so it was not made here.

## Readiness

**Not ready for unattended daily operation.**

- Narration has no approved working provider on runners.
- CT has at most one eligible topic.
- GitHub cron starts production 6–9 h late.

After this PR, #251 with an approved voice, #234, and one green scheduled day verified through the YouTube API, the FR and IB lanes can be reassessed.

## Update: 2026-10-13, about 04:30 UTC

- **False alarms.** #256, #257 and #258 are closed as not planned, each with an explanation. The premature `sla-failure:2026-10-13` keys cannot be pushed to `main` from an agent session. Their removal is **#260**: a 3-line state-only diff that must be merged before 16:30 UTC today. The same pattern had already pre-written keys for 10-02, 10-03 and 10-07 through 10-10. It is the evening-before signature of this bug, and #259 prevents it.
- **#251 hardening** is draft **#261**, stacked on `fix/tts-fallback-health`. It adds:
  - a fail-closed upload guard;
  - a verified Kokoro cache;
  - outcome categories (`SCHEDULED`, `CONTENT_BLOCKED`, `QUALITY_REJECTED`, `AWAITING_APPROVAL`, `UPLOAD_FAILED`, `PUBLISH_VERIFICATION_FAILED`, `PRODUCTION_FAILED`);
  - asset outages that no longer spend FR topics (exit 76);
  - an FR outcome table in `uretim-is.yml`;
  - `docs/ops/TTS-FALLBACK-OPTIONS.md`.
- **Merge order, validated on current `main`:** #260 (time-sensitive), then #259, then #251 together with #261, then #234, then #235.
  - Tests after each step: 620, 634, 639, 644 JS passing, plus the Python tests.
  - The only conflict is in #235: two tests appended at the same spot in `tests/js/ct-research.test.js`. Keep both.
  - No cron line changes, and the CT threshold is unchanged at bucket A, viral ≥ 75.
- **Offline dry run on the full combined tree.** Network policy blocks Wikimedia, Pexels and Edge from this environment.
  - FR queue mode stopped on the first topic with `ASSET_SOURCE_UNAVAILABLE` (exit 76). `basarisiz.json` and `engellenen.json` were unchanged.
  - CT-219 rendered with the preview voice (speech check OK), then was blocked by the quality gate (no licensed images reachable) and refused by the upload guard (voice not approved).

## Update: 2026-10-13, about 04:40 UTC

- **#260 is not merged yet.** `main` (`869d249a`) still holds `sla-failure:2026-10-13` in all three notification-state files. #260 still applies cleanly, and its deadline is 16:30 UTC today.
- **Scheduled is not published.** #261 now separates the production result `SCHEDULED` (a videoId plus `publishAt` from the upload) from publication evidence (`lib/publication-evidence.js`). `PUBLICATION_CONFIRMED` is reached only through the YouTube API's `privacyStatus: "public"` observation (the `publish.public` event from `bildirim.js --yayin-kontrol`).
- **Evidence on current data:** every FR/IB/CT Short scheduled from 10-05 to 10-11 (16 videos) is `PUBLICATION_CONFIRMED`. The confirmations were observed 9–170 minutes after `publishAt`, and 1,610 minutes for CT on 10-06. That is the delay of the check run, not necessarily of publication.
- **Order revalidated on `869d249a`:** #260 (617), #259 (620), #251 with #261 (635), #234 (640), #235 (645 after keeping both conflicting tests).
