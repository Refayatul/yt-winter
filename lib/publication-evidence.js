// PUBLICATION EVIDENCE: a scheduled upload is not a published video.
//
// An upload that returned a videoId and was given publishAt is only SCHEDULED: YouTube still has
// to make it public at publishAt, and that can fail or be late. A video is PUBLICATION_CONFIRMED
// only when the authenticated YouTube API has reported privacyStatus "public" for that exact
// videoId, which bildirim.js --yayin-kontrol records as a "publish.public" ops event
// (lib/ops-log.js). After publishAt + CONFIRM_GRACE_MINUTES without that event the state is
// PUBLICATION_NOT_CONFIRMED (bildirim.js opens an issue at the same threshold).
//
//   SCHEDULED                  videoId + publishAt, publishAt still ahead
//   PUBLICATION_PENDING_CHECK  publishAt passed, inside the grace window, no confirmation yet
//   PUBLICATION_CONFIRMED      YouTube API reported the video public ("publish.public")
//   PUBLICATION_NOT_CONFIRMED  grace window passed and no confirmation
//   NOT_SCHEDULED              no valid videoId or publishAt
"use strict";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CONFIRM_GRACE_MINUTES = 60;

function status({ videoId, publishAt } = {}, events = [], now = Date.now()) {
  const due = Date.parse(publishAt || "");
  if (!VIDEO_ID.test(videoId || "") || Number.isNaN(due)) return { state: "NOT_SCHEDULED", videoId: videoId || null, publishAt: publishAt || null };
  const confirmation = events.find((event) => event && event.type === "publish.public" && event.videoId === videoId);
  if (confirmation) return { state: "PUBLICATION_CONFIRMED", videoId, publishAt, confirmedAt: confirmation.at || null, delayMinutes: confirmation.delayMinutes ?? null };
  const current = typeof now === "number" ? now : Date.parse(now);
  if (current < due) return { state: "SCHEDULED", videoId, publishAt };
  if (current - due <= CONFIRM_GRACE_MINUTES * 60000) return { state: "PUBLICATION_PENDING_CHECK", videoId, publishAt };
  return { state: "PUBLICATION_NOT_CONFIRMED", videoId, publishAt, overdueMinutes: Math.round((current - due) / 60000) };
}

// Evidence for one channel's video, read from that channel's own ops log (channel isolation).
function forChannel(channel, video, now = Date.now()) {
  return status(video, require("./ops-log").read(channel), now);
}

module.exports = { status, forChannel, CONFIRM_GRACE_MINUTES };
