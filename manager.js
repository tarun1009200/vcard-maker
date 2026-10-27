// Step 3 (GitHub connection + Generate Card) and Step 4 (published cards dashboard).
// Uses the GitHub client in publisher.js; the form state lives in generator.js.

const TOKEN_KEY = "vcard-maker.token";
// Publishing server (vcard-publisher/ on Vercel). It keeps the GitHub token; this page only gets an encrypted session.
const PUBLISH_API = "https://vcard-publisher.vercel.app";

let repo = null; // GitHubRepo, via the publishing server or a token, once connected
let published = []; // registry entries from cards.json
let signedInAs = "";

// Draft → Publishing → Published (only once the public URL serves this version) or Failed.
function setPublishState(state, label) {
  const el = $("publishState");
  el.dataset.state = state;
  el.textContent = label || { draft: "Draft", publishing: "Publishing…", published: "Published", failed: "Failed" }[state];
}

// ---------- sign in with GitHub (publishing server) ----------
function signIn() {
  const popup = window.open(`${PUBLISH_API}/api/login`, "vcard-signin", "width=520,height=700");
  if (!popup) return setStatus("connStatus", "The popup was blocked. Allow popups for this site in your browser and click again.", "error");
  setStatus("connStatus", "Sign in to GitHub in the popup window…");
}

window.addEventListener("message", async (e) => {
  if (!PUBLISH_API || e.origin !== new URL(PUBLISH_API).origin || !e.data || e.data.type !== "vcard-session") return;
  if (e.data.error) return setStatus("connStatus", esc(e.data.error), "error");
  // The session lives only in this variable: closing or reloading the page signs out.
  const r = new GitHubRepo($("ghUser").value.trim(), $("ghRepo").value.trim(), "", {
    apiBase: `${PUBLISH_API}/api/gh`, authorization: `Session ${e.data.session}`,
  });
  try {
    await r.info();
    repo = r;
    signedInAs = e.data.login;
    setStatus("connStatus", `<i class="fa-solid fa-circle-check"></i> Signed in as <b>${esc(e.data.login)}</b> → ${esc(r.owner)}/${esc(r.repo)}`, "ok");
    $("signInGh").hidden = true;
    $("signOutGh").hidden = false;
    await renderSetup();
    refreshPublished();
  } catch (err) {
    setStatus("connStatus", esc(err.message), "error");
  }
});

function signOut() {
  repo = null;
  signedInAs = "";
  $("signInGh").hidden = false;
  $("signOutGh").hidden = true;
  $("setupBox").hidden = true;
  setStatus("connStatus", "Signed out.");
  renderPublished();
}

// A 401 from the publishing server means the session expired.
function handleAuthError(e) {
  if (e && e.status === 401 && signedInAs) {
    signOut();
    setStatus("connStatus", "Your sign-in has expired. Click <b>Sign in with GitHub</b> again.", "error");
  }
}

function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}

function storeToken(token, remember) {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch (e) {}
}

function setStatus(id, html, kind = "") {
  const el = $(id);
  el.className = "status " + kind;
  el.innerHTML = html;
}

// A token-less client is enough to read the public registry.
function readRepo() {
  return repo || new GitHubRepo($("ghUser").value.trim(), $("ghRepo").value.trim(), "");
}

function settingsUrl(page) {
  return `https://github.com/${$("ghUser").value.trim()}/${$("ghRepo").value.trim()}/${page}`;
}

// ---------- connection + setup ----------
async function connect() {
  const token = $("ghToken").value.trim();
  if (!token) return setStatus("connStatus", "Paste your token first.", "error");
  setStatus("connStatus", "Connecting…");
  try {
    const r = new GitHubRepo($("ghUser").value.trim(), $("ghRepo").value.trim(), token);
    await r.info();
    const user = await r.user();
    repo = r;
    storeToken(token, $("rememberToken").checked);
    setStatus("connStatus", `<i class="fa-solid fa-circle-check"></i> Connected as <b>${esc(user.login)}</b> → ${esc(r.owner)}/${esc(r.repo)}`, "ok");
    await renderSetup();
    refreshPublished();
  } catch (e) {
    repo = null;
    setStatus("connStatus", esc(e.message), "error");
  }
}

function forgetToken() {
  storeToken("", false);
  $("ghToken").value = "";
  repo = null;
  $("setupBox").hidden = true;
  setStatus("connStatus", "The token was removed from this browser.");
  renderPublished();
}

async function renderSetup() {
  const box = $("setupBox");
  box.hidden = false;
  box.innerHTML = "Checking the repository…";
  try {
    const s = await checkSetup(repo);
    const line = (ok, text) => `<li class="${ok ? "ok" : "bad"}"><i class="fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${text}</li>`;
    const pagesText = {
      workflow: "GitHub Pages source: <b>GitHub Actions</b>",
      legacy: `GitHub Pages is set to "Deploy from a branch". In <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a>, change the Source to <b>GitHub Actions</b>.`,
      disabled: `GitHub Pages is turned off. In <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a>, set the Source to <b>GitHub Actions</b>.`,
      unknown: `Couldn't read the Pages setting (the token doesn't have Pages: Read-only). Check in <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a> that the Source is <b>GitHub Actions</b>.`,
    }[s.pages];
    box.innerHTML = `<ul class="checklist">
      ${line(s.workflow, "Deploy workflow and card checker (<code>.github/workflows/deploy-cards.yml</code>)")}
      ${line(s.registry, "Card registry (<code>cards.json</code>)")}
      ${line(s.pages === "workflow", pagesText)}
    </ul>
    ${!s.workflow || !s.registry ? `<button type="button" class="btn primary" id="setupRepo"><i class="fa-solid fa-screwdriver-wrench"></i> Set up repository</button>` : ""}`;
    const btn = $("setupRepo");
    if (btn) btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Setting up…";
      try {
        await setupRepo(repo);
        await renderSetup();
      } catch (e) {
        box.insertAdjacentHTML("beforeend", `<p class="status error">${esc(e.message)}</p>`);
        btn.disabled = false;
      }
    });
  } catch (e) {
    box.innerHTML = `<p class="status error">${esc(e.message)}</p>`;
  }
}

// ---------- Generate Card ----------
let lastResult = null;

async function generateCard() {
  readForm();
  showAllErrors = true;
  const errors = showValidation();
  if (Object.keys(errors).length) {
    setStatus("publishStatus", "The form has errors. Fix the items listed above.", "error");
    $("formErrors").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!repo) return setStatus("publishStatus", PUBLISH_API ? "Click <b>Sign in with GitHub</b> first (in the box above)." : "Connect to GitHub first (in the box above).", "error");
  if (!$("publicOk").checked) return setStatus("publishStatus", "Tick the checkbox about public visibility before publishing.", "error");

  const btn = $("generateCard");
  if (btn.disabled) return; // a double click must not publish twice
  btn.disabled = true;
  setPublishState("publishing");
  setStatus("publishStatus", `<i class="fa-solid fa-spinner fa-spin"></i> Committing to GitHub…`);
  try {
    const res = await publishCard(repo, current, current.publishedId);
    current.publishedId = res.id;
    lastResult = res;
    showResult(res.id);
    updateUrls();
    refreshPublished();
    await waitUntilLive(res);
  } catch (e) {
    handleAuthError(e);
    setPublishState("failed");
    setStatus("publishStatus", esc(e.message), "error");
  } finally {
    btn.disabled = false;
  }
}

function showResult(id) {
  const url = publishedUrl(id);
  $("publishResult").hidden = false;
  $("resultUrl").href = url;
  $("resultUrl").textContent = url;
  $("resultUrl").dataset.id = id;
}

// card.json carries the publish time, so its live copy tells us when this exact version is deployed.
async function waitUntilLive({ id, updated }) {
  const url = publishedUrl(id);
  const actions = settingsUrl("actions");
  setStatus("publishStatus", `<i class="fa-solid fa-spinner fa-spin"></i> Committed. Deploying to GitHub Pages (1–3 minutes)… <a href="${actions}" target="_blank" rel="noopener">View Actions</a>`);
  const started = Date.now();
  while (Date.now() - started < 6 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 10000));
    if (!lastResult || lastResult.id !== id || lastResult.updated !== updated) return; // a newer publish took over
    try {
      const res = await fetch(`${url}card.json?v=${Date.now()}`, { cache: "no-store" });
      if (res.ok && (await res.json()).updated === updated) {
        // card.json is deployed together with the page, but confirm the page itself is reachable too.
        const page = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
        if (page.ok) {
          setPublishState("published");
          setStatus("publishStatus", `<i class="fa-solid fa-circle-check"></i> Your card is live: <a href="${url}" target="_blank" rel="noopener">${url}</a>`, "ok");
          return;
        }
      }
    } catch (e) {}
  }
  setPublishState("failed");
  setStatus("publishStatus", `The card was committed, but it didn't go live within 6 minutes. Check the deploy status in <a href="${actions}" target="_blank" rel="noopener">Actions</a> and the Source in Settings → Pages.`, "error");
}

// ---------- downloads ----------
async function downloadQrFor(id) {
  // Company logo / photo come from the form, so they only apply to the card that is open in it.
  const logo = qrState.logo === "custom" ? qrState.customLogo : current.publishedId === id ? qrLogoSrc() : "";
  const svg = await buildQrSvg(publishedUrl(id), qrState, logo);
  downloadBlob(await rasterize(svg, "image/png"), `qr-${id}.png`);
}

async function downloadVcfFor(id) {
  const b64 = await readRepo().readFile(`cards/${id}/contact.vcf`);
  if (!b64) return alert("This card's contact file was not found (the card may be deactivated).");
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: "text/vcard" }), `${id}.vcf`);
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (e) {
    prompt("Copy the link:", url);
    return false;
  }
}

// ---------- published cards dashboard ----------
async function refreshPublished() {
  const list = $("publishedList");
  list.innerHTML = `<li class="empty">Loading…</li>`;
  try {
    published = (await readRegistry(readRepo())).cards;
    renderPublished();
  } catch (e) {
    list.innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  }
}

function renderPublished() {
  const list = $("publishedList");
  if (!published.length) {
    list.innerHTML = `<li class="empty">No cards published yet.</li>`;
    return;
  }
  const locked = repo ? "" : "disabled title='Sign in with GitHub first'";
  list.innerHTML = published.map((c) => `
    <li class="${c.id === current.publishedId ? "active" : ""}">
      <div class="meta">
        <b>${esc(c.name || c.id)} <span class="pill ${c.active === false ? "off" : "on"}">${c.active === false ? "Inactive" : "Published"}</span></b>
        <small>${esc([c.position, c.org].filter(Boolean).join(" · "))}</small>
        <a class="url" href="${publishedUrl(c.id)}" target="_blank" rel="noopener">${publishedUrl(c.id)}</a>
      </div>
      <div class="row-actions">
        <button class="btn ghost small" data-act="copy" data-id="${c.id}"><i class="fa-regular fa-copy"></i> Copy link</button>
        <button class="btn ghost small" data-act="qr" data-id="${c.id}"><i class="fa-solid fa-qrcode"></i> QR</button>
        <button class="btn ghost small" data-act="vcf" data-id="${c.id}" ${c.active === false ? "disabled" : ""}><i class="fa-regular fa-address-card"></i> .vcf</button>
        <button class="btn ghost small" data-act="edit" data-id="${c.id}" ${locked}><i class="fa-regular fa-pen-to-square"></i> Edit</button>
        <button class="btn ghost small" data-act="${c.active === false ? "activate" : "deactivate"}" data-id="${c.id}" ${locked}>${c.active === false ? "Activate" : "Deactivate"}</button>
        <button class="btn ghost small danger" data-act="delete" data-id="${c.id}" ${locked}><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </li>`).join("");
}

$("publishedList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  const original = btn.innerHTML;
  btn.disabled = true;
  try {
    if (act === "copy") {
      if (await copyLink(publishedUrl(id))) btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied`;
      setTimeout(() => (btn.innerHTML = original), 1500);
    } else if (act === "qr") await downloadQrFor(id);
    else if (act === "vcf") await downloadVcfFor(id);
    else if (act === "edit") {
      const card = await loadPublishedCard(repo, id);
      current = { ...blankCard(), ...card, id: null, publishedId: id };
      fillForm(current);
      $("saveMsg").textContent = `Editing published card "${id}". Click Generate Card to update it at the same link.`;
      render();
      showResult(id);
      renderPublished();
      $("form").scrollIntoView({ behavior: "smooth" });
    } else if (act === "deactivate") {
      if (!confirm(`Deactivate "${id}"? The link will show "This card is no longer active" and the contact file will be removed.`)) return;
      await deactivateCard(repo, id);
      await refreshPublished();
    } else if (act === "activate") {
      const res = await activateCard(repo, id);
      lastResult = res;
      await refreshPublished();
    } else if (act === "delete") {
      if (!confirm(`Delete "${id}"? The card's files will be removed from the repository and the link will stop working. (The data will remain in the old git history.)`)) return;
      await deleteCard(repo, id);
      if (current.publishedId === id) current.publishedId = null;
      await refreshPublished();
    }
  } catch (err) {
    handleAuthError(err);
    alert(err.message);
  } finally {
    btn.disabled = false;
    if (act !== "copy") btn.innerHTML = original;
  }
});

// ---------- wire up ----------
$("connectGh").addEventListener("click", connect);
$("forgetToken").addEventListener("click", forgetToken);
$("generateCard").addEventListener("click", generateCard);
$("refreshPublished").addEventListener("click", refreshPublished);
$("copyResult").addEventListener("click", () => copyLink($("resultUrl").href));
$("resultQr").addEventListener("click", () => downloadQrFor($("resultUrl").dataset.id));
$("resultVcf").addEventListener("click", () => downloadVcfFor($("resultUrl").dataset.id));
$("newCard").addEventListener("click", () => {
  $("publishResult").hidden = true;
  setStatus("publishStatus", "");
  setPublishState("draft");
  showAllErrors = false;
  showValidation();
  renderPublished();
});
// Edits after publishing are a draft until Generate Card is pressed again.
form.addEventListener("input", () => {
  if ($("publishState").dataset.state !== "publishing") setPublishState("draft", current.publishedId ? "Draft (unpublished changes)" : "Draft");
});
$("signInGh").addEventListener("click", signIn);
$("signOutGh").addEventListener("click", signOut);

(function init() {
  if (PUBLISH_API) {
    $("signInBox").hidden = false;
    // Session from the server only; the token option stays available under "Advanced".
    refreshPublished();
    return;
  }
  const token = readToken();
  if (token) {
    $("ghToken").value = token;
    try { $("rememberToken").checked = !!localStorage.getItem(TOKEN_KEY); } catch (e) {}
    connect();
  } else {
    refreshPublished();
  }
})();
