// Server configuration from Vercel environment variables. Secrets never leave the server.
export function loadConfig(env) {
  const cfg = {
    clientId: env.GITHUB_CLIENT_ID || "",
    clientSecret: env.GITHUB_CLIENT_SECRET || "",
    sessionSecret: env.SESSION_SECRET || "",
    owner: (env.CARD_OWNER || "tarun1009200").toLowerCase(),
    repo: (env.CARD_REPO || "my-vcard").toLowerCase(),
    allowedUsers: (env.ALLOWED_USERS || env.CARD_OWNER || "tarun1009200").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    allowedOrigin: env.ALLOWED_ORIGIN || "https://tarun1009200.github.io",
  };
  cfg.ready = !!(cfg.clientId && cfg.clientSecret && cfg.sessionSecret.length >= 32);
  return cfg;
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
