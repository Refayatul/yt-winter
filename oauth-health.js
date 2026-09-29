#!/usr/bin/env node
"use strict";

const Channel = require("./core/channel-context");
const YouTube = require("./lib/yt");

function scopePresent(scopeText, wanted) {
  const scopes = new Set(String(scopeText || "").split(/\s+/).filter(Boolean));
  return scopes.has(wanted);
}

function safeError(error) {
  const code = error && error.code || (/CHANNEL_ID_UNAVAILABLE/.test(String(error && error.message)) ? "API_DISABLED" : "UNKNOWN_AUTH_ERROR");
  return {
    code,
    retryable: !!(error && error.retryable),
    status: error && error.status || null,
    errorSubtype: error && error.errorSubtype || null,
  };
}

async function check(channel = Channel.getChannel(), options = {}) {
  const credentials = channel.credentials();
  const result = {
    channel: channel.slug,
    credentialNames: {
      clientId: channel.credentialNames.clientId[0],
      clientSecret: channel.credentialNames.clientSecret[0],
      refreshToken: channel.credentialNames.refreshToken[0],
      channelId: channel.credentialNames.channelId[0],
    },
    credentialsPresent: !!(credentials.clientId && credentials.clientSecret),
    refreshTokenPresent: !!credentials.refreshToken,
    accessTokenRefresh: false,
    authenticatedChannelId: null,
    expectedChannelId: channel.expectedChannelId() || null,
    channelMatch: false,
    youtubeDataApi: false,
    youtubeAnalyticsApi: false,
    requiredScopes: {
      youtubeForceSsl: false,
      youtubeAnalyticsReadonly: false,
    },
    error: null,
    healthy: false,
  };

  try {
    const tok = await YouTube.token(options.request || YouTube.istek, channel, options);
    result.accessTokenRefresh = true;
    result.requiredScopes.youtubeForceSsl = scopePresent(tok.kapsam, YouTube.REQUIRED_SCOPES[0]);
    result.requiredScopes.youtubeAnalyticsReadonly = scopePresent(tok.kapsam, YouTube.REQUIRED_SCOPES[1]);
    const api = YouTube.istemci(tok, options.request || YouTube.istek);
    const identity = await YouTube.authenticatedChannel(api);
    result.youtubeDataApi = true;
    result.authenticatedChannelId = identity.id;
    result.channelMatch = !!result.expectedChannelId && identity.id === result.expectedChannelId;
    if (!result.expectedChannelId) result.error = { code: "CHANNEL_ID_MISSING", retryable: false, status: null, errorSubtype: null };
    else if (!result.channelMatch) result.error = { code: "CHANNEL_MISMATCH", retryable: false, status: null, errorSubtype: null };

    if (result.requiredScopes.youtubeAnalyticsReadonly) {
      const today = new Date();
      const end = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
      const start = new Date(today.getTime() - 8 * 86400000).toISOString().slice(0, 10);
      const analytics = await api.analytics({ startDate: start, endDate: end, metrics: "views", maxResults: "1" });
      result.youtubeAnalyticsApi = !!analytics.ok;
      if (!analytics.ok && !result.error) result.error = { code: analytics.kod || YouTube.classifyApiFailure(analytics), retryable: false, status: analytics.durum || null, errorSubtype: null };
    } else if (!result.error) {
      result.error = { code: "INSUFFICIENT_SCOPE", retryable: false, status: null, errorSubtype: null };
    }
  } catch (error) {
    result.error = safeError(error);
  }

  result.healthy = result.credentialsPresent && result.refreshTokenPresent && result.accessTokenRefresh &&
    result.youtubeDataApi && result.youtubeAnalyticsApi && result.channelMatch &&
    result.requiredScopes.youtubeForceSsl && result.requiredScopes.youtubeAnalyticsReadonly;
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const selected = Channel.selectFromArgv(argv);
  const result = await check(selected.channel);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.healthy) process.exitCode = 4;
  return result;
}

if (require.main === module) main().catch((error) => {
  process.stdout.write(JSON.stringify({ healthy: false, error: safeError(error) }, null, 2) + "\n");
  process.exitCode = 4;
});

module.exports = { scopePresent, safeError, check, main };
