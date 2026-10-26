// Forwards the generator's GitHub API calls with the signed-in user's token, but only the calls
// publishing needs, only for the card repository, and only writes to card files.
import { loadConfig, json } from "./config.js";
import { openSession } from "./session.js";

const SHA = /^[0-9a-f]{40}$/;
const CARD_ID = "[a-z0-9]+(?:-[a-z0-9]+)*";
const CARD_FILE = new RegExp(`^cards/${CARD_ID}/(?:index\\.html|contact\\.vcf|card\\.json|assets/(?:style\\.css|card\\.js|photo\\.jpg|logo\\.png))$`);
const MAX_BLOB_BASE64 = 4 * 1024 * 1024;
const MAX_TREE_ENTRIES = 50;

export function isAllowedPath(p) {
  return p === "cards.json" || CARD_FILE.test(p);
}

// Best-effort per-instance limit; GitHub's own rate limits still apply on top.
const usage = new Map();
function rateLimited(login, isWrite) {
  const now = Date.now();
  const u = usage.get(login) || { start: now, all: 0, writes: 0 };
  if (now - u.start > 60_000) Object.assign(u, { start: now, all: 0, writes: 0 });
  u.all++;
  if (isWrite) u.writes++;
  usage.set(login, u);
  return u.all > 300 || u.writes > 60;
}

function corsHeaders(cfg) {
  return {
    "Access-Control-Allow-Origin": cfg.allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-GitHub-Api-Version",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

// Returns { upstreamPath, body } for an allowed request, or { error } with a reason.
function route(cfg, method, path, params, body) {
  if (method === "GET" && path === "/user") return { upstreamPath: "/user" };
  const prefix = `/repos/${cfg.owner}/${cfg.repo}`;
  if (path.toLowerCase().slice(0, prefix.length) !== prefix) return { error: "Only the card repository can be used." };
  const rest = path.slice(prefix.length);
  const base = `/repos/${cfg.owner}/${cfg.repo}`;

  if (method === "GET") {
    if (rest === "" || rest === "/pages" || rest === "/git/ref/heads/main") return { upstreamPath: base + rest };
    let m;
    if ((m = rest.match(/^\/git\/commits\/([0-9a-f]{40})$/))) return { upstreamPath: `${base}/git/commits/${m[1]}` };
    if ((m = rest.match(/^\/git\/trees\/([0-9a-f]{40})$/))) return { upstreamPath: `${base}/git/trees/${m[1]}${params.get("recursive") === "1" ? "?recursive=1" : ""}` };
    if ((m = rest.match(/^\/contents\/(.+)$/))) {
      const segments = m[1].split("/").map((s) => decodeURIComponent(s));
      if (segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s === "." || s === "..")) return { error: "Invalid file path." };
      const ref = params.get("ref");
      if (ref && !SHA.test(ref)) return { error: "Invalid ref." };
      return { upstreamPath: `${base}/contents/${segments.join("/")}${ref ? `?ref=${ref}` : ""}` };
    }
    return { error: "This request is not allowed." };
  }

  if (!body || typeof body !== "object") return { error: "Missing request body." };

  if (method === "POST" && rest === "/git/blobs") {
    if (body.encoding !== "base64" || typeof body.content !== "string" || !/^[A-Za-z0-9+/=]*$/.test(body.content)) return { error: "Invalid file content." };
    if (body.content.length > MAX_BLOB_BASE64) return { error: "File is too large." };
    return { upstreamPath: `${base}/git/blobs`, body: { content: body.content, encoding: "base64" } };
  }

  if (method === "POST" && rest === "/git/trees") {
    if (!SHA.test(body.base_tree || "") || !Array.isArray(body.tree) || !body.tree.length || body.tree.length > MAX_TREE_ENTRIES) return { error: "Invalid tree." };
    const tree = [];
    for (const e of body.tree) {
      if (!e || !isAllowedPath(e.path)) return { error: `Writing "${e && e.path}" is not allowed.` };
      if (e.mode !== "100644" || e.type !== "blob" || !(e.sha === null || SHA.test(e.sha || ""))) return { error: "Invalid tree entry." };
      tree.push({ path: e.path, mode: "100644", type: "blob", sha: e.sha });
    }
    return { upstreamPath: `${base}/git/trees`, body: { base_tree: body.base_tree, tree } };
  }

  if (method === "POST" && rest === "/git/commits") {
    const parents = body.parents;
    if (typeof body.message !== "string" || body.message.length > 200 || !SHA.test(body.tree || "") || !Array.isArray(parents) || parents.length !== 1 || !SHA.test(parents[0] || "")) {
      return { error: "Invalid commit." };
    }
    return { upstreamPath: `${base}/git/commits`, body: { message: body.message, tree: body.tree, parents } };
  }

  if (method === "PATCH" && rest === "/git/refs/heads/main") {
    if (!SHA.test(body.sha || "")) return { error: "Invalid commit." };
    return { upstreamPath: `${base}/git/refs/heads/main`, body: { sha: body.sha, force: false } };
  }

  return { error: "This request is not allowed." };
}

export async function handleProxy(request, env, fetchImpl = fetch) {
  const cfg = loadConfig(env);
  const origin = request.headers.get("origin");
  if (origin && origin !== cfg.allowedOrigin) return json(403, { message: "Origin not allowed." });
  const cors = corsHeaders(cfg);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!cfg.ready) return json(503, { message: "Publisher is not configured yet." }, cors);

  const auth = request.headers.get("authorization") || "";
  const session = auth.startsWith("Session ") ? await openSession(auth.slice(8), cfg.sessionSecret) : null;
  if (!session) return json(401, { message: "Please sign in with GitHub again." }, cors);
  if (!cfg.allowedUsers.includes(session.login)) return json(403, { message: "This GitHub user may not publish cards." }, cors);

  const isWrite = request.method !== "GET";
  if (rateLimited(session.login, isWrite)) return json(429, { message: "Too many requests. Wait a minute and try again." }, { ...cors, "Retry-After": "60" });

  const url = new URL(request.url);
  // Behind the vercel.json rewrite the GitHub path arrives as ?__path=; locally it is part of the URL.
  const path = url.searchParams.get("__path") || url.pathname.replace(/^\/api\/gh/, "") || "/";
  url.searchParams.delete("__path");
  let body = null;
  if (isWrite) {
    const text = await request.text();
    if (text.length > MAX_BLOB_BASE64 + 4096) return json(413, { message: "Request is too large." }, cors);
    try { body = JSON.parse(text); } catch (e) { return json(400, { message: "Invalid JSON." }, cors); }
  }

  let r;
  try {
    r = route(cfg, request.method, path, url.searchParams, body);
  } catch (e) {
    r = { error: "Invalid request." }; // e.g. malformed %-encoding in a path
  }
  if (r.error) return json(403, { message: r.error }, cors);

  const upstream = await fetchImpl("https://api.github.com" + r.upstreamPath, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vcard-publisher",
      ...(r.body ? { "Content-Type": "application/json" } : {}),
    },
    body: r.body ? JSON.stringify(r.body) : undefined,
  });
  const data = upstream.status === 204 ? null : await upstream.json().catch(() => ({ message: upstream.statusText }));
  return upstream.status === 204 ? new Response(null, { status: 204, headers: cors }) : json(upstream.status, data, cors);
}
