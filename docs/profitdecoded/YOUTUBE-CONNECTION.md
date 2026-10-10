# Connecting the ProfitDecoded YouTube channel (read-only first)

Connecting the channel does not enable publishing. Uploads stay blocked until all of these hold:
- the channel config has `enabled: true` and `platforms.youtube.enabled: true`;
- `PD_PUBLISH=1` is set;
- an assessment says PUBLISH;
- the first five videos each have recorded human approval.

ProfitDecoded has no upload path in the codebase today.

## Credential isolation

ProfitDecoded reads only these four names (`credentialsPrefix: "PD"`, `allowLegacyYouTubeEnv: false`):

| Name | Kind | Status (2026-10-10) |
| --- | --- | --- |
| `PD_YT_CLIENT_ID` | repository secret | present |
| `PD_YT_CLIENT_SECRET` | repository secret | **missing** |
| `PD_YT_REFRESH_TOKEN` | repository secret | **missing** |
| `PD_YT_CHANNEL_ID` | repository variable | **missing** (`youtubeChannelId` in config is also empty) |

How the isolation is enforced:
- `core/channel-context.js` never falls back to `YT_*`, `FR_*`, `IB_*`, `CT_*` or `BTO_*` values for ProfitDecoded. `tests/js/profitdecoded-channel.test.js` and `tests/js/profitdecoded-youtube-auth-check.test.js` enforce this.
- No other channel's workflow receives `PD_*` secrets. No ProfitDecoded workflow receives another channel's YouTube credentials; the produce workflow shares only the research-service keys (Groq, Gemini, Exa, Serper, Tavily).
- `youtube-yetki.js` refuses to save a token when the authenticated channel differs from `PD_YT_CHANNEL_ID`, or belongs to another configured channel.

## One-time setup (owner, manual)

1. **Channel ID.** In YouTube Studio, signed in to the ProfitDecoded brand account, open Settings → Channel → Advanced settings and copy the channel ID (`UC…`). Then run:
   ```
   gh variable set PD_YT_CHANNEL_ID --body UCxxxxxxxxxxxxxxxxxxxxxx
   ```
   Set this first, so step 3 refuses a token from any other channel.
2. **OAuth client.**
   - In Google Cloud, use the OAuth client whose ID is already stored as `PD_YT_CLIENT_ID`, or create a new *Desktop app* client for ProfitDecoded. Do not reuse another channel's client.
   - Enable the YouTube Data API v3 and the YouTube Analytics API.
   - On the consent screen, add the scopes `youtube.force-ssl` and `yt-analytics.readonly`. Set Audience to **In production**: in Testing mode the refresh token expires after 7 days.
   - Put the pair in the local `.env` (git-ignored), never in a commit:
     ```
     PD_YT_CLIENT_ID=…
     PD_YT_CLIENT_SECRET=…
     ```
3. **Refresh token.** Run the following and approve in the browser as the **ProfitDecoded** brand account:
   ```
   node youtube-yetki.js --channel profitdecoded --github --oauth-mode=production
   ```
   - The tool checks the authenticated channel, then saves `PD_YT_CLIENT_ID`, `PD_YT_CLIENT_SECRET` and `PD_YT_REFRESH_TOKEN` as secrets. It never prints the token.
   - It does not change `PD_YT_CHANNEL_ID` once set.
4. **Read-only test.** Run `node scripts/profitdecoded/youtube-auth-check.js` locally, or dispatch the *ProfitDecoded YouTube auth check (read-only)* workflow. It must report `VERIFIED` with `channelMatch: true`.

## What the read-only test does

`scripts/profitdecoded/youtube-auth-check.js` reuses the shared OAuth health check (`oauth-health.js`) behind a request allowlist:
- `POST oauth2.googleapis.com/token` (refresh);
- `POST oauth2.googleapis.com/tokeninfo` (only if the refresh response omits scopes);
- `GET /youtube/v3/channels?part=id,snippet&mine=true`.

Any other request is refused before it is sent. The JSON result lists:
- every request (method, host and path, without the query);
- the expected and authenticated channel IDs;
- `videosUploaded: 0`, `videosModified: 0` and `youtubeWriteRequests: 0`;
- the publishing state (`PD_PUBLISH`, config flags, publish guard).

It never prints tokens or secrets. Exit codes: 0 verified, 3 not configured (setup steps listed), 4 failed or mismatched. It costs 1 YouTube API quota unit and does not write the quota ledger.

The scheduled multi-channel *YouTube OAuth health* workflow does not include ProfitDecoded. Add it only after the channel is connected and approved for production.
