function required(key: string): string {
  const v = process.env[key];
  if (!v)
    throw createError({ statusCode: 500, message: `Missing env var: ${key}` });
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function getConfig() {
  const sessionSecret = required("STATS_SESSION_SECRET");
  if (sessionSecret.length < 32) {
    throw createError({
      statusCode: 500,
      message: "STATS_SESSION_SECRET must be at least 32 chars",
    });
  }
  return {
    gitlabBaseUrl: required("STATS_GITLAB_BASE_URL").replace(/\/$/, ""),
    gitlabToken: required("STATS_GITLAB_TOKEN"),
    cacheTtlMs: Number(optional("STATS_CACHE_TTL_MS", "900000")),
    since: optional("STATS_SINCE", "2025-01-01T00:00:00Z"),
    oauth: {
      clientId: required("STATS_OAUTH_CLIENT_ID"),
      clientSecret: required("STATS_OAUTH_CLIENT_SECRET"),
      redirectUrl: required("STATS_OAUTH_REDIRECT_URL"),
    },
    sessionSecret,
  };
}
