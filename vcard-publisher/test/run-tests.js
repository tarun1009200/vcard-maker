// Tests the publishing server: sessions, sign-in, the proxy's allowlist, and a full publish
// from the real browser publisher code through the proxy into a fake GitHub.
// Usage: node vcard-publisher/test/run-tests.js
import { createRequire } from "module";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { sealSession, openSession } from "../lib/session.js";
import { handleLogin, handleCallback } from "../lib/auth.js";
import { handleProxy, isAllowedPath } from "../lib/proxy.js";

const require = createRequire(import.meta.url);
const { fakeGitHub, loadClient } = require("../../tests/fake-github.js");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ENV = {
  GITHUB_CLIENT_ID: "Iv1.test",
  GITHUB_CLIENT_SECRET: "client-secret-value",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef-test",
  CARD_OWNER: "tarun1009200",
  CARD_REPO: "my-vcard",
  ALLOWED_USERS: "tarun1009200",
  ALLOWED_ORIGIN: "https://tarun1009200.github.io",
};
const ORIGIN = ENV.ALLOWED_ORIGIN;
const SERVER = "https://vcard-publisher.example";
const GH_TOKEN = "ghu_user_token_never_shown";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

async function session(over = {}) {
  return sealSession({ token: GH_TOKEN, login: "tarun1009200", exp: Date.now() + 3600_000, ...over }, ENV.SESSION_SECRET);
}

function proxyRequest(method, ghPath, { sess, body, origin = ORIGIN } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  if (sess) headers.authorization = `Session ${sess}`;
  return new Request(`${SERVER}/api/gh${ghPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const SHA = "a".repeat(40);
const repoPath = "/repos/tarun1009200/my-vcard";

// ---------- sessions ----------
test("session round-trips and hides the token", async () => {
  const s = await session();
  assert(!s.includes(GH_TOKEN) && !Buffer.from(s.split(".")[1], "base64url").toString().includes(GH_TOKEN), "token visible in session");
  assert((await openSession(s, ENV.SESSION_SECRET)).token === GH_TOKEN, "round trip");
});
test("tampered session is rejected", async () => {
  const s = await session();
  const bad = s.slice(0, -2) + (s.endsWith("A") ? "B" : "A") + s.slice(-1);
  assert((await openSession(bad, ENV.SESSION_SECRET)) === null);
});
test("session from another secret is rejected", async () => {
  assert((await openSession(await session(), "another-secret-another-secret-123")) === null);
});
test("expired session is rejected", async () => {
  assert((await openSession(await session({ exp: Date.now() - 1 }), ENV.SESSION_SECRET)) === null);
});

// ---------- sign-in ----------
test("login redirects to GitHub with a state cookie", async () => {
  const r = await handleLogin(new Request(`${SERVER}/api/login`), ENV);
  const loc = new URL(r.headers.get("location"));
  assert(r.status === 302 && loc.host === "github.com" && loc.searchParams.get("client_id") === "Iv1.test");
  assert(loc.searchParams.get("redirect_uri") === `${SERVER}/api/callback`);
  const state = loc.searchParams.get("state");
  assert(state && r.headers.get("set-cookie").includes(`vc_state=${state}`) && /HttpOnly/.test(r.headers.get("set-cookie")));
  assert(!r.headers.get("location").includes("client-secret-value"), "client secret leaked");
});

function githubOAuth(login) {
  return async (url, opts) => {
    if (url === "https://github.com/login/oauth/access_token") {
      const b = JSON.parse(opts.body);
      assert(b.client_secret === "client-secret-value" && b.code === "the-code");
      return new Response(JSON.stringify({ access_token: GH_TOKEN, expires_in: 28800 }));
    }
    if (url === "https://api.github.com/user") return new Response(JSON.stringify({ login }));
    throw new Error("unexpected " + url);
  };
}
const callback = (state, cookieState, login = "tarun1009200") =>
  handleCallback(new Request(`${SERVER}/api/callback?code=the-code&state=${state}`, { headers: { cookie: `vc_state=${cookieState}` } }), ENV, githubOAuth(login));

test("callback returns an encrypted session to the generator origin only", async () => {
  const r = await callback("s1", "s1");
  const html = await r.text();
  assert(r.status === 200, html);
  assert(html.includes(`"https://tarun1009200.github.io"`), "target origin");
  assert(!html.includes(GH_TOKEN), "GitHub token leaked into the page");
  const s = JSON.parse(html.match(/postMessage\((\{.*?\}), "/)[1]).session;
  assert((await openSession(s, ENV.SESSION_SECRET)).login === "tarun1009200");
});
test("callback rejects a wrong state", async () => {
  const r = await callback("s1", "other");
  assert(r.status === 400 && (await r.text()).includes("expired"));
});
test("callback rejects users who are not allowed", async () => {
  const r = await callback("s1", "s1", "someone-else");
  const html = await r.text();
  assert(r.status === 400 && html.includes("not allowed") && !html.includes('"session"'));
});

// ---------- proxy access control ----------
const deny = async (req, status, label) => {
  const gh = fakeGitHub({}, { owner: "tarun1009200", repo: "my-vcard" });
  const r = await handleProxy(req, ENV, gh.fetch);
  assert(r.status === status, `${label}: expected ${status}, got ${r.status} ${await r.text()}`);
  assert(gh.calls.length === 0, `${label}: request reached GitHub`);
};

test("no session → 401", async () => deny(proxyRequest("GET", repoPath), 401, "anon"));
test("forged session → 401", async () => deny(proxyRequest("GET", repoPath, { sess: "abc.def" }), 401, "forged"));
test("other user's session → 403", async () => deny(proxyRequest("GET", repoPath, { sess: await session({ login: "mallory" }) }), 403, "user"));
test("other origin → 403", async () => deny(proxyRequest("GET", repoPath, { sess: await session(), origin: "https://evil.example" }), 403, "origin"));
test("other repository → 403", async () => deny(proxyRequest("GET", "/repos/tarun1009200/vcard-maker", { sess: await session() }), 403, "repo"));
test("repository settings / delete endpoints → 403", async () => {
  await deny(proxyRequest("PATCH", repoPath, { sess: await session(), body: { private: true } }), 403, "patch repo");
  await deny(proxyRequest("POST", `${repoPath}/pages`, { sess: await session(), body: {} }), 403, "pages");
});
test("path traversal in contents → 403", async () =>
  deny(proxyRequest("GET", `${repoPath}/contents/cards/..%2F..%2Fsecrets`, { sess: await session() }), 403, "traversal"));
test("writing outside card folders → 403", async () => {
  for (const p of ["index.html", "cards/../index.html", "cards/x/evil.js", ".github/workflows/deploy-cards.yml", "cards/UPPER/index.html", "cards/a/assets/../../x"]) {
    await deny(proxyRequest("POST", `${repoPath}/git/trees`, { sess: await session(), body: { base_tree: SHA, tree: [{ path: p, mode: "100644", type: "blob", sha: SHA }] } }), 403, p);
  }
});
test("executable or symlink tree entries → 403", async () =>
  deny(proxyRequest("POST", `${repoPath}/git/trees`, { sess: await session(), body: { base_tree: SHA, tree: [{ path: "cards/a/index.html", mode: "120000", type: "blob", sha: SHA }] } }), 403, "mode"));
test("force push and other branches → 403", async () => {
  await deny(proxyRequest("PATCH", `${repoPath}/git/refs/heads/gh-pages`, { sess: await session(), body: { sha: SHA } }), 403, "branch");
  await deny(proxyRequest("PATCH", `${repoPath}/git/refs/heads/main`, { sess: await session(), body: { sha: "nope" } }), 403, "bad sha");
});
test("allowed card paths", () => {
  for (const p of ["cards.json", "cards/rahul-sharma/index.html", "cards/rahul-sharma-2/assets/photo.jpg", "cards/a/card.json"]) assert(isAllowedPath(p), p);
});
test("preflight answers with CORS for the generator", async () => {
  const r = await handleProxy(proxyRequest("OPTIONS", repoPath), ENV, () => { throw new Error("no upstream"); });
  assert(r.status === 204 && r.headers.get("access-control-allow-origin") === ORIGIN);
});
test("proxy forces non-force ref updates and strips extra fields", async () => {
  const gh = fakeGitHub({}, { owner: "tarun1009200", repo: "my-vcard", token: GH_TOKEN });
  const sess = await session();
  await handleProxy(proxyRequest("POST", `${repoPath}/git/commits`, { sess, body: { message: "m", tree: SHA, parents: [SHA], author: { name: "x" } } }), ENV, gh.fetch);
  const sent = gh.calls.at(-1);
  assert(!("author" in sent.body), "author forwarded");
});

// ---------- end to end ----------
test("browser publisher publishes, edits and deletes through the proxy", async () => {
  const gh = fakeGitHub({ "README.md": "# my-vcard\n", "index.html": "root" }, { owner: "tarun1009200", repo: "my-vcard", login: "tarun1009200", token: GH_TOKEN });
  const ctx = loadClient(vm, ROOT);
  const sess = await session();
  const browserCalls = [];
  // The browser only talks to the server; the server talks to GitHub.
  ctx.fetch = async (url, opts) => {
    browserCalls.push({ url, opts });
    assert(url.startsWith(`${SERVER}/api/gh/`), "browser called GitHub directly: " + url);
    const res = await handleProxy(new Request(url, { ...opts, headers: { ...opts.headers, origin: ORIGIN } }), ENV, gh.fetch);
    return { ok: res.ok, status: res.status, statusText: "", json: () => res.json() };
  };
  const repo = new ctx.T.GitHubRepo("tarun1009200", "my-vcard", "", { apiBase: `${SERVER}/api/gh`, authorization: `Session ${sess}` });
  await repo.info();
  const card = { template: "wave", bgType: "solid", color1: "#4a87e0", font: "Roboto", name: "Rahul Sharma", mobile: "+91 98765 43210", email: "rahul@propium.ai", socials: {}, photo: "", logo: "" };
  const a = await ctx.T.publishCard(repo, card);
  const b = await ctx.T.publishCard(repo, card);
  assert(a.id === "rahul-sharma" && b.id === "rahul-sharma-2", `${a.id} ${b.id}`);
  const edited = await ctx.T.publishCard(repo, { ...card, position: "Sales Head" }, "rahul-sharma");
  assert(edited.id === "rahul-sharma" && gh.text("cards/rahul-sharma/index.html").includes("Sales Head"));
  await ctx.T.deactivateCard(repo, "rahul-sharma-2");
  await ctx.T.deleteCard(repo, "rahul-sharma-2");
  assert(!gh.paths().some((p) => p.startsWith("cards/rahul-sharma-2/")), "delete");
  assert(gh.text("index.html") === "root" && gh.text("README.md") === "# my-vcard\n", "root files changed");
  for (const c of browserCalls) assert(!JSON.stringify(c).includes(GH_TOKEN), "GitHub token reached the browser side");
  assert(gh.calls.every((c) => c.auth === `Bearer ${GH_TOKEN}`), "server did not use the user token");
});

let passed = 0, failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log("PASS", t.name);
  } catch (e) {
    failed++;
    console.log("FAIL", t.name, "\n     ", e.message);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
