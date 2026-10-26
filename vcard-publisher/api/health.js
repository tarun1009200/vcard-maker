import { loadConfig, json } from "../lib/config.js";

// Reports whether setup is complete, without revealing any secret.
export function GET() {
  const cfg = loadConfig(process.env);
  return json(200, { ok: true, configured: cfg.ready, repo: `${cfg.owner}/${cfg.repo}`, origin: cfg.allowedOrigin }, {
    "Access-Control-Allow-Origin": cfg.allowedOrigin,
  });
}
