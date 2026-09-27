const DEFAULT_REPOSITORY = "eyazan/youtube-otomasyon";

export async function dispatchWatchdog(env, fetchImpl = fetch) {
  if (!env.WATCHDOG_GITHUB_TOKEN) throw new Error("WATCHDOG_GITHUB_TOKEN is not configured");
  const repository = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.WATCHDOG_GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "youtube-otomasyon-production-watchdog",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "production-sla-watchdog",
      client_payload: { source: "cloudflare-cron", fired_at: new Date().toISOString() },
    }),
  });
  if (response.status !== 204) throw new Error(`GitHub repository_dispatch failed: HTTP ${response.status}`);
  return { ok: true, repository, status: response.status };
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchWatchdog(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health") return new Response("Not found", { status: 404 });
    return Response.json({
      ok: true,
      scheduler: "cloudflare-cron",
      repository: env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
      eventType: "production-sla-watchdog",
      tokenConfigured: !!env.WATCHDOG_GITHUB_TOKEN,
    });
  },
};
