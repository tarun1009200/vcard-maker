// Runs the card builder and publisher against an in-memory fake of the GitHub Git Data API.
// Usage: node tests/run-tests.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ctx = vm.createContext({ btoa, atob, URL, console, setTimeout, fetch: null });
const source = ["card-template.js", "publish-kit.js", "publisher.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
vm.runInContext(source + `
;this.T = { buildCardHtml, buildVcf, validateCard, cardSlug, uniqueSlug, publishCard, loadPublishedCard,
  deactivateCard, activateCard, deleteCard, setupRepo, checkSetup, readRegistry, GitHubRepo, KIT_FILES };`, ctx);
const T = ctx.T;

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

// ---------- fake GitHub ----------
function fakeGitHub(files = {}, { failFirstRefUpdate = false } = {}) {
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const blobs = new Map(), trees = new Map(), commits = new Map();
  const t0 = id("t");
  trees.set(t0, new Map(Object.entries(files).map(([p, text]) => [p, Buffer.from(text).toString("base64")])));
  const c0 = id("c");
  commits.set(c0, { tree: t0 });
  let head = c0, refFailures = failFirstRefUpdate ? 1 : 0;
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, statusText: "", json: async () => body });

  async function fetch(url, opts = {}) {
    const method = opts.method || "GET";
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path: u.pathname, auth: opts.headers && opts.headers.Authorization });
    if (u.pathname === "/user") return res(200, { login: "tester" });
    const m = u.pathname.match(/^\/repos\/o\/r(.*)$/);
    if (!m) return res(404, { message: "Not Found" });
    const rest = m[1];
    let x;
    if (rest === "") return res(200, { default_branch: "main" });
    if (rest === "/pages") return res(200, { build_type: "workflow" });
    if (rest === "/git/ref/heads/main") return res(200, { object: { sha: head } });
    if ((x = rest.match(/^\/git\/commits\/(\w+)$/))) return res(200, { tree: { sha: commits.get(x[1]).tree } });
    if ((x = rest.match(/^\/git\/trees\/(\w+)$/))) return res(200, { tree: [...trees.get(x[1]).keys()].map((p) => ({ path: p, type: "blob" })) });
    if (rest === "/git/blobs" && method === "POST") { const s = id("b"); blobs.set(s, body.content); return res(201, { sha: s }); }
    if (rest === "/git/trees" && method === "POST") {
      const t = new Map(trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!t.has(e.path)) return res(422, { message: `cannot delete missing ${e.path}` });
          t.delete(e.path);
        } else t.set(e.path, blobs.get(e.sha));
      }
      const s = id("t");
      trees.set(s, t);
      return res(201, { sha: s });
    }
    if (rest === "/git/commits" && method === "POST") { const s = id("c"); commits.set(s, { tree: body.tree, parent: body.parents[0], message: body.message }); return res(201, { sha: s }); }
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
    commitCount: () => [...commits.values()].length,
    lastMessage: () => commits.get(head).message,
    writeTo(dir) {
      for (const [p, b64] of tree()) {
        fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
        fs.writeFileSync(path.join(dir, p), Buffer.from(b64, "base64"));
      }
    },
  };
}

function connect(gh) {
  ctx.fetch = gh.fetch;
  return new T.GitHubRepo("o", "r", "test-token-123");
}

const PHOTO = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes").toString("base64");
const card = (over = {}) => ({
  template: "wave", bgType: "solid", color1: "#4a87e0", color2: "#c03e4a", font: "Roboto",
  name: "Rahul Sharma", position: "Sales Head", org: "Propium.ai", mobile: "+91 98765 43210", email: "rahul@propium.ai",
  website: "www.propium.ai", support: "+91 1800 123 456", sales: "+91 22 5550 1990", description: "Hello",
  socials: { linkedin: "linkedin.com/in/rahul" }, photo: PHOTO, logo: "", ...over,
});
const EXISTING = { "README.md": "# my-vcard\n", "index.html": "<!doctype html><p>root card</p>" };

// ---------- validation ----------
test("valid card has no errors", () => eq(Object.keys(T.validateCard(card())), []));
test("name is required", () => assert(T.validateCard(card({ name: " " })).name));
test("invalid email is rejected", () => assert(T.validateCard(card({ email: "tarun@10099920002" })).email));
test("valid email passes", () => assert(!T.validateCard(card({ email: "tarun10092002@gmail.com" })).email));
test("letters in a phone number are rejected", () => assert(T.validateCard(card({ mobile: "98765abc" })).mobile));
test("too many digits are rejected", () => assert(T.validateCard(card({ support: "1234567890123456" })).support));
test("bad website is rejected", () => assert(T.validateCard(card({ website: "not a site" })).website));
test("bad social link is rejected", () => assert(T.validateCard(card({ socials: { linkedin: "no link" } }))["social:linkedin"]));
test("WhatsApp number is accepted", () => assert(!T.validateCard(card({ socials: { whatsapp: "+91 98765 43210" } }))["social:whatsapp"]));
test("at least one contact is required", () =>
  assert(T.validateCard(card({ mobile: "", email: "", website: "", support: "", sales: "" })).contact));

// ---------- slugs ----------
test("slug from name", () => eq(T.cardSlug("Rahul Sharma"), "rahul-sharma"));
test("slug collapses separators", () => eq(T.cardSlug("  Ravi -- Kumar_  "), "ravi-kumar"));
test("slug for non-latin name falls back", () => eq(T.cardSlug("राहुल"), "card"));
test("slug is URL safe", () => assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(T.cardSlug("Dr. José O'Neil & Co."))));
test("taken slugs get a number", () => eq(T.uniqueSlug("Rahul Sharma", new Set(["rahul-sharma", "rahul-sharma-2"])), "rahul-sharma-3"));

// ---------- card page ----------
test("empty fields hide their buttons", () => {
  const html = T.buildCardHtml(card({ website: "", support: "", sales: "", socials: {} }), "export");
  assert(!html.includes("fa-globe"), "website button shown");
  assert(!html.includes('class="support"'), "support block shown");
  assert(!html.includes('class="socials"'), "socials shown");
  assert(!html.includes('href="tel:"'), "empty tel link");
});
test("user input is escaped", () => assert(!T.buildCardHtml(card({ name: "<script>x</script>" }), "export").includes("<script>x")));

// ---------- publishing ----------
test("publish creates the card folder and registry entry", async () => {
  const gh = fakeGitHub(EXISTING);
  const res = await T.publishCard(connect(gh), card());
  eq(res.id, "rahul-sharma");
  for (const f of ["index.html", "contact.vcf", "card.json", "assets/style.css", "assets/card.js", "assets/photo.jpg"]) {
    assert(gh.has(`cards/rahul-sharma/${f}`), `missing ${f}`);
  }
  assert(!gh.has("cards/rahul-sharma/assets/logo.png"), "logo written without a logo");
  const reg = JSON.parse(gh.text("cards.json"));
  eq(reg.cards.map((c) => [c.id, c.active]), [["rahul-sharma", true]]);
  assert(gh.text("cards/rahul-sharma/index.html").includes('href="tel:+911800123456"'), "support tel link");
  assert(gh.text("cards/rahul-sharma/contact.vcf").includes("item1.X-ABLabel:Customer Support"), "vcf support label");
  eq(gh.text("README.md"), EXISTING["README.md"], "README changed");
  eq(gh.text("index.html"), EXISTING["index.html"], "root page changed");
});

test("token is sent as a header and never written to the repo", async () => {
  const gh = fakeGitHub(EXISTING);
  await T.publishCard(connect(gh), card());
  assert(gh.calls.every((c) => c.auth === "Bearer test-token-123"), "missing auth header");
  for (const p of gh.paths()) assert(!gh.text(p).includes("test-token-123"), `token leaked into ${p}`);
});

test("duplicate names get unique ids", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  const a = await T.publishCard(repo, card());
  const b = await T.publishCard(repo, card());
  eq([a.id, b.id], ["rahul-sharma", "rahul-sharma-2"]);
  eq(JSON.parse(gh.text("cards.json")).cards.length, 2);
});

test("a leftover folder is not reused for a new card", async () => {
  const gh = fakeGitHub({ ...EXISTING, "cards/rahul-sharma/index.html": "old" });
  eq((await T.publishCard(connect(gh), card())).id, "rahul-sharma-2");
});

test("editing keeps the id and removes files that are no longer used", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  const res = await T.publishCard(repo, card({ name: "Rahul S. Sharma", photo: "" }), "rahul-sharma");
  eq(res.id, "rahul-sharma");
  assert(!gh.has("cards/rahul-sharma/assets/photo.jpg"), "stale photo kept");
  assert(gh.text("cards/rahul-sharma/index.html").includes("Rahul S. Sharma"), "page not updated");
  eq(JSON.parse(gh.text("cards.json")).cards.length, 1);
  eq(gh.lastMessage(), "Update card rahul-sharma");
});

test("a published card loads back for editing", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  const original = card();
  await T.publishCard(repo, original);
  const loaded = await T.loadPublishedCard(repo, "rahul-sharma");
  for (const k of ["name", "position", "org", "mobile", "email", "website", "support", "sales", "template", "color1"]) eq(loaded[k], original[k], k);
  eq(loaded.socials, original.socials, "socials");
  eq(loaded.photo, PHOTO, "photo");
  eq(loaded.logo, "", "logo");
});

test("deactivate takes the card offline and activate restores it", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  await T.deactivateCard(repo, "rahul-sharma");
  assert(gh.text("cards/rahul-sharma/index.html").includes("no longer active"), "inactive page");
  assert(!gh.has("cards/rahul-sharma/contact.vcf"), "vcf still public");
  eq(JSON.parse(gh.text("cards.json")).cards[0].active, false);
  await T.activateCard(repo, "rahul-sharma");
  assert(gh.text("cards/rahul-sharma/index.html").includes("Rahul Sharma"), "page restored");
  assert(gh.has("cards/rahul-sharma/contact.vcf"), "vcf restored");
  assert(gh.has("cards/rahul-sharma/assets/photo.jpg"), "photo restored");
  eq(JSON.parse(gh.text("cards.json")).cards[0].active, true);
});

test("delete removes the folder and registry entry only", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  await T.publishCard(repo, card({ name: "Priya Verma" }));
  await T.deleteCard(repo, "rahul-sharma");
  assert(!gh.paths().some((p) => p.startsWith("cards/rahul-sharma/")), "files left");
  eq(JSON.parse(gh.text("cards.json")).cards.map((c) => c.id), ["priya-verma"]);
  assert(gh.has("cards/priya-verma/index.html") && gh.has("README.md"), "other files removed");
});

test("a concurrent push is retried instead of overwritten", async () => {
  const gh = fakeGitHub(EXISTING, { failFirstRefUpdate: true });
  const res = await T.publishCard(connect(gh), card());
  eq(res.id, "rahul-sharma");
  assert(gh.has("cards/rahul-sharma/index.html"), "not published after retry");
});

test("setup adds workflow, checker and registry once", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  assert(await T.setupRepo(repo), "first setup made no commit");
  for (const p of [".github/workflows/deploy-cards.yml", "scripts/check-cards.js", ".nojekyll", "cards.json"]) assert(gh.has(p), `missing ${p}`);
  eq(await T.setupRepo(repo), null, "second setup should change nothing");
  eq(await T.checkSetup(repo), { workflow: true, registry: true, pages: "workflow" });
  const yml = gh.text(".github/workflows/deploy-cards.yml");
  assert(yml.includes("${{ steps.deployment.outputs.page_url }}") && yml.includes("actions/deploy-pages@v4"), "workflow content");
});

test("GitHub errors are explained", async () => {
  ctx.fetch = async () => ({ ok: false, status: 401, statusText: "", json: async () => ({ message: "Bad credentials" }) });
  try {
    await new T.GitHubRepo("o", "r", "x").info();
    throw new Error("no error thrown");
  } catch (e) {
    eq(e.status, 401);
    assert(/Token/.test(e.message), e.message);
  }
});

// ---------- the Actions checker ----------
function runChecker(gh) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
  gh.writeTo(dir);
  fs.writeFileSync(path.join(dir, "check.js"), T.KIT_FILES[1].text);
  try {
    return { ok: true, out: execFileSync(process.execPath, [path.join(dir, "check.js"), dir], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    return { ok: false, out: String(e.stderr) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("checker passes on published cards", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  await T.publishCard(repo, card({ name: "Priya Verma", logo: PHOTO.replace("jpeg", "png") }));
  await T.deactivateCard(repo, "priya-verma");
  const r = runChecker(gh);
  assert(r.ok, r.out);
  assert(r.out.includes("Checked 2 card(s): OK"), r.out);
});

test("checker fails on a missing image", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  await repo.commit(await repo.head(), "break", [{ path: "cards/rahul-sharma/assets/photo.jpg", delete: true }]);
  const r = runChecker(gh);
  assert(!r.ok && r.out.includes("broken link assets/photo.jpg"), r.out);
});

test("checker fails on duplicate ids", async () => {
  const gh = fakeGitHub(EXISTING);
  const repo = connect(gh);
  await T.publishCard(repo, card());
  const reg = JSON.parse(gh.text("cards.json"));
  reg.cards.push(reg.cards[0]);
  await repo.commit(await repo.head(), "dup", [{ path: "cards.json", base64: Buffer.from(JSON.stringify(reg)).toString("base64") }]);
  const r = runChecker(gh);
  assert(!r.ok && r.out.includes("Duplicate card id: rahul-sharma"), r.out);
});

(async () => {
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
})();
