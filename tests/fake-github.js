// In-memory fake of the GitHub REST endpoints the publisher uses (Git Data API, contents, pages, user).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function fakeGitHub(files = {}, { owner = "o", repo = "r", login = "tester", token = null, failFirstRefUpdate = false } = {}) {
  let n = 0;
  const sha = () => crypto.createHash("sha1").update(String(++n)).digest("hex");
  const blobs = new Map(), trees = new Map(), commits = new Map();
  const t0 = sha();
  trees.set(t0, new Map(Object.entries(files).map(([p, text]) => [p, Buffer.from(text).toString("base64")])));
  const c0 = sha();
  commits.set(c0, { tree: t0 });
  let head = c0, refFailures = failFirstRefUpdate ? 1 : 0;
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, statusText: "", json: async () => body });
  const repoPrefix = new RegExp(`^/repos/${owner}/${repo}(.*)$`);

  async function fetch(url, opts = {}) {
    const method = opts.method || "GET";
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    const auth = opts.headers && opts.headers.Authorization;
    calls.push({ method, path: u.pathname, auth, body });
    if (token && auth !== `Bearer ${token}`) return res(401, { message: "Bad credentials" });
    if (u.pathname === "/user") return res(200, { login });
    const m = u.pathname.match(repoPrefix);
    if (!m) return res(404, { message: "Not Found" });
    const rest = m[1];
    let x;
    if (rest === "") return res(200, { default_branch: "main" });
    if (rest === "/pages") return res(200, { build_type: "workflow" });
    if (rest === "/git/ref/heads/main") return res(200, { object: { sha: head } });
    if ((x = rest.match(/^\/git\/commits\/(\w+)$/))) return res(200, { tree: { sha: commits.get(x[1]).tree } });
    if ((x = rest.match(/^\/git\/trees\/(\w+)$/))) return res(200, { tree: [...trees.get(x[1]).keys()].map((p) => ({ path: p, type: "blob" })) });
    if (rest === "/git/blobs" && method === "POST") { const s = sha(); blobs.set(s, body.content); return res(201, { sha: s }); }
    if (rest === "/git/trees" && method === "POST") {
      const t = new Map(trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!t.has(e.path)) return res(422, { message: `cannot delete missing ${e.path}` });
          t.delete(e.path);
        } else t.set(e.path, blobs.get(e.sha));
      }
      const s = sha();
      trees.set(s, t);
      return res(201, { sha: s });
    }
    if (rest === "/git/commits" && method === "POST") { const s = sha(); commits.set(s, { tree: body.tree, parent: body.parents[0], message: body.message }); return res(201, { sha: s }); }
    if (rest === "/git/refs/heads/main" && method === "PATCH") {
      if (refFailures-- > 0) return res(422, { message: "Update is not a fast forward" });
      if (commits.get(body.sha).parent !== head) return res(422, { message: "Update is not a fast forward" });
      head = body.sha;
      return res(200, {});
    }
    if ((x = rest.match(/^\/contents\/(.+)$/))) {
      const t = trees.get(commits.get(u.searchParams.get("ref") || head).tree);
      const p = decodeURIComponent(x[1]);
      return t.has(p) ? res(200, { content: t.get(p) }) : res(404, { message: "Not Found" });
    }
    return res(404, { message: `unhandled ${method} ${rest}` });
  }

  const tree = () => trees.get(commits.get(head).tree);
  return {
    fetch, calls,
    has: (p) => tree().has(p),
    text: (p) => Buffer.from(tree().get(p), "base64").toString("utf8"),
    paths: () => [...tree().keys()].sort(),
    lastMessage: () => commits.get(head).message,
    writeTo(dir) {
      for (const [p, b64] of tree()) {
        fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
        fs.writeFileSync(path.join(dir, p), Buffer.from(b64, "base64"));
      }
    },
  };
}

// Loads the browser scripts (card builder, publish kit, publisher) into one sandbox.
function loadClient(vm, root) {
  const ctx = vm.createContext({ btoa, atob, URL, console, setTimeout, fetch: null });
  const source = ["card-template.js", "publish-kit.js", "publisher.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
  vm.runInContext(source + `
;this.T = { buildCardHtml, buildVcf, validateCard, cardSlug, uniqueSlug, publishCard, loadPublishedCard,
  deactivateCard, activateCard, deleteCard, setupRepo, checkSetup, readRegistry, GitHubRepo, KIT_FILES };`, ctx);
  return ctx;
}

module.exports = { fakeGitHub, loadClient };
