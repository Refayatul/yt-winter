# Sustainable YouTube OAuth for three channels

The runtime design is long-lived refresh token → automatically refreshed short-lived access token → YouTube API call. An expiring access token is normal and never requires manual replacement. A refresh token should require human action only after revocation, client/OAuth configuration changes, six months of non-use, account/security policy enforcement, or another documented Google invalidation condition.

## Credential map

Values belong only in local `.env` (gitignored) and GitHub Secrets/Variables. This table contains names, never credentials.

| Channel | Google project | Client ID secret | Client secret | Refresh token secret | Channel ID variable | Current status |
|---|---|---|---|---|---|---|
| Failure Reconstructed | Existing FR project; confirm name in Cloud Console | `FR_YT_CLIENT_ID` | `FR_YT_CLIENT_SECRET` | `FR_YT_REFRESH_TOKEN` | `FR_YT_CHANNEL_ID` | Active through legacy `YT_*` fallback; migrate to preferred FR names |
| ImpossibleBrief | ImpossibleBrief owner project | `IB_CLIENT_ID` | `IB_CLIENT_SECRET` | `IB_YT_REFRESH_TOKEN` | `IB_YT_CHANNEL_ID` | Client pair present; refresh token and channel ID missing; publish disabled |
| CriticalThread | `criticalthread` | `CT_CLIENT_ID` | `CT_CLIENT_SECRET` | `CT_YT_REFRESH_TOKEN` | `CT_YT_CHANNEL_ID` | Client pair present; refresh token and channel ID missing; publish disabled |

`IB_YT_CLIENT_ID`/`IB_YT_CLIENT_SECRET` and `CT_YT_CLIENT_ID`/`CT_YT_CLIENT_SECRET` remain accepted aliases for migration, but Actions uses the names in the table. ImpossibleBrief and CriticalThread never fall back to FR or unscoped `YT_*` credentials.

## Current Google behavior that matters

- `External` is correct when the channel account is not restricted to one Google Workspace organization. `Internal` is available only to eligible Workspace organizations and users inside that organization.
- For an External app in `Testing`, authorization is limited to test users and refresh tokens generally expire after seven days for these YouTube scopes. Testing is not an unattended production configuration.
- Move the Audience publishing status to `In production`. Complete Google's verification flow if the console requires it for the requested sensitive scopes. Publishing status and verification are one-time administration, not a daily API step.
- `youtube.force-ssl` is used for uploads and channel writes. `yt-analytics.readonly` is used for analytics. Do not add broader scopes without a concrete feature.
- Google can still invalidate a production refresh token when the owner revokes access, the token is unused for six months, the OAuth client changes/deletes, account/security or Workspace session policy intervenes, or refresh-token limits are exceeded. Those are exceptional alerts, not routine maintenance.
- YouTube/YouTube Analytics does not support service-account substitution for a normal channel owner. User consent cannot be bypassed safely or legally.
- Separate OAuth clients/projects per channel are preferred here: they reduce blast radius, make audit ownership explicit and prevent one client rotation from stopping all channels.

Official references:

- <https://developers.google.com/identity/protocols/oauth2>
- <https://developers.google.com/identity/protocols/oauth2/resources/best-practices>
- <https://developers.google.com/identity/protocols/oauth2/policies>
- <https://developers.google.com/youtube/documentation/authentication>
- <https://developers.google.com/youtube/analytics/reference>
- <https://developers.google.com/youtube/reporting/guides/authorization>
- <https://support.google.com/cloud/answer/15549945>
- <https://support.google.com/cloud/answer/13464323>

## One-time Google administration

For each Google project:

1. Enable YouTube Data API v3 and YouTube Analytics API.
2. Configure Branding and a controlled support/developer contact.
3. Configure an External Audience unless all users truly belong to one eligible Workspace organization.
4. Add only the two required scopes above.
5. Move Audience from Testing to In production. Follow Google's verification instructions when required; code cannot bypass them.
6. Use a Desktop OAuth client because authorization returns to `http://localhost:53682`.
7. In the browser consent screen, deliberately select the Google/Brand account owning the named YouTube channel.

## Create the two missing refresh tokens

Run from a trusted local checkout after this branch is merged. `gh auth status` must show access to `eyazan/youtube-otomasyon`. The helper never prints a refresh token; `--github` writes it through stdin to GitHub Secrets and records the authenticated channel ID as a repository variable.

ImpossibleBrief:

```bash
read -r -p "IB client ID: " IB_CLIENT_ID
read -r -s -p "IB client secret: " IB_CLIENT_SECRET; printf '\n'
export IB_CLIENT_ID IB_CLIENT_SECRET
node youtube-yetki.js --channel impossible-brief --github --repo=eyazan/youtube-otomasyon
unset IB_CLIENT_ID IB_CLIENT_SECRET
```

CriticalThread:

```bash
read -r -p "CT client ID: " CT_CLIENT_ID
read -r -s -p "CT client secret: " CT_CLIENT_SECRET; printf '\n'
export CT_CLIENT_ID CT_CLIENT_SECRET
node youtube-yetki.js --channel critical-thread --github --repo=eyazan/youtube-otomasyon
unset CT_CLIENT_ID CT_CLIENT_SECRET
```

The local `.env` is created/updated with mode `0600` and remains gitignored. Do not paste refresh tokens into chat, issues, screenshots, workflow inputs or command-line arguments.

## Prove readiness before enabling publication

Local checks use the matching local `.env`:

```bash
node oauth-health.js --channel failure-reconstructed
node oauth-health.js --channel impossible-brief
node oauth-health.js --channel critical-thread
```

Then validate the real GitHub secret context:

```bash
gh workflow run youtube-oauth-health.yml -R eyazan/youtube-otomasyon -f channel=all
gh run list -R eyazan/youtube-otomasyon --workflow youtube-oauth-health.yml --limit 1
gh run watch RUN_ID -R eyazan/youtube-otomasyon --exit-status
```

Every report must show `credentialsPresent`, `refreshTokenPresent`, `accessTokenRefresh`, `youtubeDataApi`, `youtubeAnalyticsApi`, `channelMatch` and `healthy` as `true`. The output contains IDs and secret names but no secret values.

Only then enable one channel at a time:

```bash
gh variable set IB_PUBLISH -R eyazan/youtube-otomasyon --body 1
gh variable set CT_PUBLISH -R eyazan/youtube-otomasyon --body 1
```

Keep either variable absent/`0` if its health job is not green.

## Automated runtime after setup

Every YouTube operation:

1. reads only the selected channel's secret namespace;
2. exchanges the refresh token for an access token, retrying transient failures;
3. calls `channels?mine=true`;
4. compares the actual ID with the selected channel's expected ID;
5. blocks on mismatch/missing ID;
6. checks remote/local duplicate state;
7. performs the write and updates only that channel's state.

The daily health workflow checks FR and checks IB/CT automatically only when their publish variables are enabled. A failure is isolated to its job/channel; the other channels continue.

## Smallest owner checklist

Failure Reconstructed:

- [ ] Confirm its OAuth Audience is In production and both APIs are enabled.
- [ ] Copy legacy `YT_*` values to `FR_YT_*`, run the health workflow, then schedule removal of the fallback.

ImpossibleBrief:

- [ ] Confirm Branding/Audience/scopes and move the External app to In production.
- [ ] Run the one local consent command above while signed into the correct channel owner.
- [ ] Require a green GitHub OAuth health artifact, then set `IB_PUBLISH=1`.

CriticalThread:

- [ ] In project `criticalthread`, enable both APIs, confirm Branding/Audience/scopes and move the External app to In production.
- [ ] Run the one local consent command above while signed into the correct channel owner.
- [ ] Require a green GitHub OAuth health artifact, then set `CT_PUBLISH=1`.

Shared:

- [ ] Keep each channel's client/token separate and never rotate all three for one-channel failure.
- [ ] Treat `INVALID_GRANT`, `TOKEN_REVOKED`, `CLIENT_MISMATCH` or `CHANNEL_MISMATCH` as an incident; leave that channel's publish variable off until repaired.

After those one-time steps, the owner does not periodically replace access tokens or refresh tokens. Access-token renewal is automatic.

