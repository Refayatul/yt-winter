# Behind the Ordinary: OAuth repair (owner procedure)

No secret value was read or displayed to write this. The evidence is secret **update times** (`gh secret list`), workflow results and the committed `channels/behind-the-ordinary/state/auth-state.json`.

## What is wrong

| Evidence | Value |
|---|---|
| `BTO_YT_CLIENT_ID` last set | 2026-10-03 18:35:30Z (same minute as the original authorization) |
| `BTO_YT_CLIENT_SECRET` last set | 2026-10-08 20:05:40Z |
| `BTO_YT_REFRESH_TOKEN` last set | 2026-10-08 20:06:07Z |
| *YouTube OAuth health*, BTO job | success through 2026-10-08 12:11Z; **failure on every run since 2026-10-08 22:20Z** |
| Google's answer to the token refresh | `invalid_client` (HTTP 401) → code `INVALID_CLIENT` in `lib/yt.js` |
| OAuth app mode recorded on 2026-10-03 | **testing**, re-auth deadline 2026-10-10 |

**Diagnosis 1 (certain):** Google rejects the client authentication. `invalid_client` means the client ID and secret sent together do not form a valid pair. This is not an expired token, which would be `invalid_grant`.

**Diagnosis 2 (inferred from the timing):** on 2026-10-08 the secret and the refresh token were replaced **without** the client ID. `youtube-yetki.js --github` always writes all three together, so this was a manual or partial update. The ID from 2026-10-03 and the secret from 2026-10-08 most likely belong to different OAuth clients, or the old client's secret was reset.

**Second problem, waiting behind the first:** the OAuth app was authorized in **testing** mode. Google expires testing-mode refresh tokens after 7 days, so even a matching pair would stop working a week after each re-authorization.

## Repair (about 10 minutes; nothing here publishes)

Use only Behind the Ordinary's own Google account and its own Google Cloud project. Never reuse another channel's client, project or token.

1. **Pick one OAuth client.** In Google Cloud Console, open the project created for Behind the Ordinary, then *APIs & Services → Credentials*.
   - Choose the single OAuth 2.0 client of type *Desktop app* that BTO will use.
   - If you are unsure which client is current, create a new Desktop client in that project. The old ones can be deleted later.
2. **Put that pair in the local `.env` only**, never in chat or in a commit: `BTO_YT_CLIENT_ID=…` and `BTO_YT_CLIENT_SECRET=…`, both from the client chosen in step 1.
3. **Make the app production-ready.** In *Google Auth Platform → Audience*, set the publishing status to **In production**, so refresh tokens stop expiring every 7 days. Confirm the scopes include `youtube.force-ssl` and `yt-analytics.readonly`.
4. **Mint a matched token and store all three secrets together:**
   `node youtube-yetki.js --channel behind-the-ordinary --github --oauth-mode=production`
   - In the browser, sign in and choose the Behind the Ordinary channel. The tool expects `UCBkloTDoYhsNbswwPkvqLIg` and refuses any channel that belongs to another configured channel.
   - The tool writes `BTO_YT_CLIENT_ID`, `BTO_YT_CLIENT_SECRET` and `BTO_YT_REFRESH_TOKEN` as one set without printing them, and records the OAuth mode in `auth-state.json`.
5. **Verify, read-only:** run `node oauth-health.js --channel behind-the-ordinary` locally, or dispatch *YouTube OAuth health* in GitHub Actions. Expect a successful refresh and a channel match.
6. **Leave publishing paused.** Do **not** set `BTO_PUBLISH`. With working auth, the growth feedback loop and analytics sync recover on their own. The competitor-intelligence workflow (PR #225) can then run for BTO. Resuming publishing is a separate decision.

## If step 5 still fails
- **`INVALID_CLIENT` again:** the pair in `.env` is not from one client. Re-copy both values from the same client page.
- **`INVALID_GRANT`:** the token was minted with a different client, or was revoked. Repeat step 4.
- **`CHANNEL_MISMATCH`:** the wrong channel was chosen on the consent screen. Repeat step 4 and pick Behind the Ordinary.
