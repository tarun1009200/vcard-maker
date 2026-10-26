// "Sign in with GitHub" for the GitHub App. Runs in a popup on this server's own domain,
// then hands an encrypted session to the generator page with postMessage.
import { loadConfig, json } from "./config.js";
import { sealSession } from "./session.js";

const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

function cookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : "";
}

export async function handleLogin(request, env) {
  const cfg = loadConfig(env);
  if (!cfg.ready) return json(503, { message: "Publisher is not configured yet." });
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", new URL("/api/callback", request.url).href);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.href,
      "Set-Cookie": `vc_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}

// The page only ever posts to the configured generator origin.
function popupPage(cfg, message) {
  const payload = JSON.stringify({ type: "vcard-session", ...message }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(cfg.allowedOrigin);
  const text = message.error ? `Sign-in failed: ${message.error}` : "Signed in. You can close this window.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>vCard publisher</title>
<p style="font-family:system-ui,sans-serif;padding:24px">${text.replace(/[<>&]/g, "")}</p>
<script>if (window.opener) { window.opener.postMessage(${payload}, ${origin}); window.close(); }</script>`,
    {
      status: message.error ? 400 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
        "Set-Cookie": "vc_state=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0",
      },
    }
  );
}

export async function handleCallback(request, env, fetchImpl = fetch) {
  const cfg = loadConfig(env);
  if (!cfg.ready) return popupPage(cfg, { error: "Publisher is not configured yet." });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== cookie(request, "vc_state")) return popupPage(cfg, { error: "Sign-in expired. Please try again." });

  const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: new URL("/api/callback", request.url).href }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenData.access_token) return popupPage(cfg, { error: tokenData.error_description || "GitHub did not return a token." });

  const userRes = await fetchImpl("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "vcard-publisher" },
  });
  const user = await userRes.json().catch(() => ({}));
  const login = String(user.login || "").toLowerCase();
  if (!login) return popupPage(cfg, { error: "Could not read your GitHub account." });
  if (!cfg.allowedUsers.includes(login)) return popupPage(cfg, { error: `GitHub user ${login} is not allowed to publish cards.` });

  const lifetime = tokenData.expires_in ? Math.min(tokenData.expires_in * 1000, MAX_SESSION_MS) : MAX_SESSION_MS;
  const exp = Date.now() + lifetime - 60 * 1000;
  const session = await sealSession({ token: tokenData.access_token, login, exp }, cfg.sessionSecret);
  return popupPage(cfg, { session, login, exp });
}
