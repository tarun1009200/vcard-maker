// Publishes cards to the card repository through the GitHub REST API.
// The token is typed in by the user at runtime and only kept in their browser; nothing secret is committed.
// Each publish is one commit: cards/<id>/ (page, vCard, assets, card.json) plus the cards.json registry.

const GITHUB_API = "https://api.github.com";
const REGISTRY_PATH = "cards.json";

class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function explainGitHubError(status, message) {
  if (status === 401) return `Sign-in expire ho gaya ya token galat hai (${message}).`;
  if (status === 429) return "Bahut saari requests ho gayi. Ek minute ruk kar dobara try karo.";
  if (status === 403) return `Token ke paas is kaam ki permission nahi hai (${message}).`;
  if (status === 404) return "Repository ya file nahi mili, ya token ko is repository ka access nahi hai.";
  if (status === 409) return "Repository khaali hai. Pehle GitHub par ek README commit karo.";
  return `GitHub error ${status}: ${message}`;
}

function toBase64Text(s) { return btoa(unescape(encodeURIComponent(s))); }
function fromBase64Text(b) { return decodeURIComponent(escape(atob(b))); }
function encodePath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

class GitHubRepo {
  // Talks to api.github.com with a token, or to the publishing server with `apiBase` + a session `authorization`.
  constructor(owner, repo, token, { apiBase = GITHUB_API, authorization = "" } = {}) {
    this.owner = owner;
    this.repo = repo;
    this.token = token || "";
    this.apiBase = apiBase;
    this.authorization = authorization || (this.token ? `Bearer ${this.token}` : "");
    this.branch = "main";
  }

  async request(path, { method = "GET", body, allow404 = false } = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (this.authorization) headers.Authorization = this.authorization;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(this.apiBase + path, { method, headers, body: body && JSON.stringify(body), cache: "no-store" });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      let message = res.statusText;
      try { message = (await res.json()).message || message; } catch (e) {}
      throw new GitHubError(res.status, explainGitHubError(res.status, message));
    }
    return res.status === 204 ? null : res.json();
  }

  path(p = "") { return `/repos/${this.owner}/${this.repo}${p}`; }

  async info() {
    const r = await this.request(this.path());
    this.branch = r.default_branch;
    return r;
  }

  user() { return this.request("/user"); }

  pages() { return this.request(this.path("/pages"), { allow404: true }); }

  // Latest commit on the branch plus every file path in it.
  async head() {
    const ref = await this.request(this.path(`/git/ref/heads/${this.branch}`));
    const commit = await this.request(this.path(`/git/commits/${ref.object.sha}`));
    const tree = await this.request(this.path(`/git/trees/${commit.tree.sha}?recursive=1`));
    const paths = new Set(tree.tree.filter((e) => e.type === "blob").map((e) => e.path));
    return { sha: ref.object.sha, treeSha: commit.tree.sha, paths };
  }

  // Returns the file's content as base64, or null when it does not exist.
  async readFile(path, ref) {
    const r = await this.request(this.path(`/contents/${encodePath(path)}${ref ? `?ref=${ref}` : ""}`), { allow404: true });
    return r && typeof r.content === "string" ? r.content.replace(/\s/g, "") : null;
  }

  async readJson(path, ref) {
    const b = await this.readFile(path, ref);
    return b === null ? null : JSON.parse(fromBase64Text(b));
  }

  // changes: [{ path, base64 }] to write, [{ path, delete: true }] to remove.
  async commit(head, message, changes) {
    const tree = [];
    for (const ch of changes) {
      if (ch.delete) {
        tree.push({ path: ch.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await this.request(this.path("/git/blobs"), { method: "POST", body: { content: ch.base64, encoding: "base64" } });
      tree.push({ path: ch.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await this.request(this.path("/git/trees"), { method: "POST", body: { base_tree: head.treeSha, tree } });
    const commit = await this.request(this.path("/git/commits"), { method: "POST", body: { message, tree: newTree.sha, parents: [head.sha] } });
    await this.request(this.path(`/git/refs/heads/${this.branch}`), { method: "PATCH", body: { sha: commit.sha } });
    return commit.sha;
  }
}

// Builds the changes from the latest commit and retries once if someone else pushed in between
// (GitHub rejects a non-fast-forward ref update with 422).
async function commitChanges(repo, make) {
  for (let attempt = 0; ; attempt++) {
    const head = await repo.head();
    const plan = await make(head);
    if (!plan || !plan.changes.length) return null;
    try {
      return await repo.commit(head, plan.message, plan.changes);
    } catch (e) {
      if (e.status !== 422 || attempt > 0) throw e;
    }
  }
}

async function readRegistry(repo, ref) {
  const r = await repo.readJson(REGISTRY_PATH, ref);
  return r && Array.isArray(r.cards) ? r : { cards: [] };
}

function registryChange(registry) {
  registry.cards.sort((a, b) => a.id.localeCompare(b.id));
  return { path: REGISTRY_PATH, base64: toBase64Text(JSON.stringify(registry, null, 2) + "\n") };
}

function cardSlug(name) {
  return slugify(name).replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "card";
}

function uniqueSlug(name, taken) {
  const base = cardSlug(name);
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

function folderIds(paths) {
  const ids = new Set();
  for (const p of paths) {
    const parts = p.split("/");
    if (parts[0] === "cards" && parts.length > 2) ids.add(parts[1]);
  }
  return ids;
}

// card.json keeps everything needed to edit the card later; images live next to it as files.
function cardRecord(card, id, updated) {
  const { photo, logo, id: draftId, publishedId, location, ...data } = card;
  return { ...data, id, hasPhoto: !!photo, hasLogo: !!logo, updated };
}

// Writes every file under cards/<id>/ and removes files from an older version that are no longer used.
function folderChanges(prefix, files, existingPaths) {
  const changes = files.map((f) => ({ path: prefix + f.path, base64: f.base64 || toBase64Text(f.text) }));
  const keep = new Set(changes.map((c) => c.path));
  for (const p of existingPaths) if (p.startsWith(prefix) && !keep.has(p)) changes.push({ path: p, delete: true });
  return changes;
}

async function publishCard(repo, card, editId) {
  let id, updated;
  const sha = await commitChanges(repo, async (head) => {
    const registry = await readRegistry(repo, head.sha);
    if (editId && /^[a-z0-9-]+$/.test(editId)) {
      id = editId; // editing keeps the same URL
    } else {
      id = uniqueSlug(card.name, new Set([...registry.cards.map((c) => c.id), ...folderIds(head.paths)]));
    }
    updated = new Date().toISOString();
    const files = [...cardFiles(card), { path: "card.json", text: JSON.stringify(cardRecord(card, id, updated), null, 2) + "\n" }];
    const changes = folderChanges(`cards/${id}/`, files, head.paths);
    const entry = { id, name: card.name, position: card.position || "", org: card.org || "", active: true, updated };
    registry.cards = registry.cards.filter((c) => c.id !== id).concat(entry);
    changes.push(registryChange(registry));
    return { message: `${editId ? "Update" : "Publish"} card ${id}`, changes };
  });
  return { id, sha, updated };
}

async function loadPublishedCard(repo, id) {
  const rec = await repo.readJson(`cards/${id}/card.json`);
  if (!rec) throw new Error(`Card "${id}" ka data (card.json) nahi mila.`);
  const { hasPhoto, hasLogo, updated, ...card } = rec;
  card.photo = hasPhoto ? "data:image/jpeg;base64," + ((await repo.readFile(`cards/${id}/assets/photo.jpg`)) || "") : "";
  card.logo = hasLogo ? "data:image/png;base64," + ((await repo.readFile(`cards/${id}/assets/logo.png`)) || "") : "";
  if (card.photo === "data:image/jpeg;base64,") card.photo = "";
  if (card.logo === "data:image/png;base64,") card.logo = "";
  return card;
}

function inactivePageHtml(name) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Card not active</title>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#eef1f5;color:#3d4756;text-align:center;padding:16px}h1{font-size:20px;color:#1c2430}</style>
</head>
<body>
  <main>
    <h1>This card is no longer active</h1>
    <p>${esc(name || "This visiting card")} is not available right now.</p>
  </main>
</body>
</html>
`;
}

// Keeps card.json and images so the card can be activated again, but takes the page and vCard offline.
async function deactivateCard(repo, id) {
  return commitChanges(repo, async (head) => {
    const registry = await readRegistry(repo, head.sha);
    const entry = registry.cards.find((c) => c.id === id);
    if (!entry) throw new Error(`Card "${id}" registry mein nahi hai.`);
    entry.active = false;
    entry.updated = new Date().toISOString();
    const changes = [{ path: `cards/${id}/index.html`, base64: toBase64Text(inactivePageHtml(entry.name)) }];
    if (head.paths.has(`cards/${id}/contact.vcf`)) changes.push({ path: `cards/${id}/contact.vcf`, delete: true });
    changes.push(registryChange(registry));
    return { message: `Deactivate card ${id}`, changes };
  });
}

async function activateCard(repo, id) {
  return publishCard(repo, await loadPublishedCard(repo, id), id);
}

async function deleteCard(repo, id) {
  return commitChanges(repo, async (head) => {
    const registry = await readRegistry(repo, head.sha);
    registry.cards = registry.cards.filter((c) => c.id !== id);
    const changes = [...head.paths].filter((p) => p.startsWith(`cards/${id}/`)).map((path) => ({ path, delete: true }));
    changes.push(registryChange(registry));
    return { message: `Delete card ${id}`, changes };
  });
}

// What the repository still needs before one-click publishing works.
async function checkSetup(repo) {
  const head = await repo.head();
  let pages = "unknown";
  try {
    const p = await repo.pages();
    pages = p ? p.build_type || "legacy" : "disabled";
  } catch (e) {
    if (e.status !== 403) throw e;
  }
  return {
    workflow: head.paths.has(KIT_FILES[0].path) && head.paths.has(KIT_FILES[1].path),
    registry: head.paths.has(REGISTRY_PATH),
    pages,
  };
}

// Adds the deploy workflow, the card checker and an empty registry. Files that are already current are left alone.
async function setupRepo(repo) {
  return commitChanges(repo, async (head) => {
    const changes = [];
    for (const f of KIT_FILES) {
      const want = toBase64Text(f.text);
      const have = head.paths.has(f.path) ? await repo.readFile(f.path, head.sha) : null;
      if (have !== want) changes.push({ path: f.path, base64: want });
    }
    if (!head.paths.has(REGISTRY_PATH)) changes.push(registryChange({ cards: [] }));
    return { message: "Set up automatic card publishing", changes };
  });
}
