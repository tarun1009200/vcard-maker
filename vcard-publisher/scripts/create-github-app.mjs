// One-time setup: creates the "vCard Publisher" GitHub App with GitHub's manifest flow and stores its
// credentials straight into the Vercel project's encrypted environment variables. Nothing secret is printed or saved.
// Usage (inside vcard-publisher/, after `vercel login` and a first deploy):
//   node scripts/create-github-app.mjs https://<project>.vercel.app
import http from "http";
import crypto from "crypto";
import { spawnSync } from "child_process";

const server = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/.test(server)) {
  console.error("Usage: node scripts/create-github-app.mjs https://<project>.vercel.app");
  process.exit(1);
}
const OWNER = "tarun1009200";
const PORT = 3999;
const VERCEL = ["--yes", "vercel@65.3.1"];
const state = crypto.randomBytes(16).toString("hex");

const manifest = {
  name: `vcard-publisher-${OWNER}`,
  url: `https://${OWNER}.github.io/vcard-maker/`,
  description: "Publishes digital visiting cards to the my-vcard repository.",
  hook_attributes: { url: `${server}/api/health`, active: false },
  redirect_url: `http://127.0.0.1:${PORT}/done`,
  callback_urls: [`${server}/api/callback`],
  public: false,
  request_oauth_on_install: false,
  default_permissions: { contents: "write", pages: "read" },
  default_events: [],
};

function setEnv(name, value) {
  spawnSync("npx", [...VERCEL, "env", "rm", name, "production", "--yes"], { stdio: "ignore", shell: true });
  const r = spawnSync("npx", [...VERCEL, "env", "add", name, "production"], { input: value, stdio: ["pipe", "ignore", "pipe"], shell: true });
  if (r.status !== 0) throw new Error(`Could not set ${name}: ${String(r.stderr).trim().split("\n").pop()}`);
  console.log(`set ${name}`);
}

const page = (body) => `<!doctype html><meta charset="utf-8"><title>vCard Publisher setup</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">${body}</body>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page(`<h2>Create the vCard Publisher GitHub App</h2>
<p>GitHub par <b>Create GitHub App</b> dabao. App sirf card files likh sakti hai (Contents: write, Pages: read).</p>
<form id="f" method="post" action="https://github.com/settings/apps/new?state=${state}">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
<button>Continue to GitHub</button></form><script>document.getElementById("f").submit()</script>`));
    return;
  }
  if (url.pathname !== "/done") { res.writeHead(404); res.end(); return; }
  if (url.searchParams.get("state") !== state || !url.searchParams.get("code")) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(page("<p>Setup link expired. Run the script again.</p>"));
    return;
  }
  try {
    const conv = await fetch(`https://api.github.com/app-manifests/${url.searchParams.get("code")}/conversions`, {
      method: "POST", headers: { Accept: "application/vnd.github+json", "User-Agent": "vcard-publisher-setup" },
    });
    const app = await conv.json();
    if (!conv.ok) throw new Error(app.message || `GitHub returned ${conv.status}`);
    // Only the OAuth credentials are needed; the app's private key and webhook secret are discarded.
    setEnv("GITHUB_CLIENT_ID", app.client_id);
    setEnv("GITHUB_CLIENT_SECRET", app.client_secret);
    setEnv("SESSION_SECRET", crypto.randomBytes(48).toString("base64url"));
    setEnv("CARD_OWNER", OWNER);
    setEnv("CARD_REPO", "my-vcard");
    setEnv("ALLOWED_USERS", OWNER);
    setEnv("ALLOWED_ORIGIN", `https://${OWNER}.github.io`);
    const install = `${app.html_url}/installations/new`;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page(`<h2>App ban gayi: ${app.slug}</h2><p>Ab ise sirf <b>my-vcard</b> par install karo:</p><p><a href="${install}">${install}</a></p>`));
    console.log(`APP_SLUG=${app.slug}`);
    console.log(`INSTALL_URL=${install}`);
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(page(`<p>Setup failed: ${String(e.message).replace(/[<>&]/g, "")}</p>`));
    console.error("Setup failed:", e.message);
    setTimeout(() => process.exit(1), 500);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`OPEN http://127.0.0.1:${PORT}/`));
