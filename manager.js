// Step 3 (GitHub connection + Generate Card) and Step 5 (published cards dashboard).
// Uses the GitHub client in publisher.js; the form state lives in generator.js.

const TOKEN_KEY = "vcard-maker.token";

let repo = null; // GitHubRepo with a token once connected
let published = []; // registry entries from cards.json

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
  if (!token) return setStatus("connStatus", "Pehle token paste karo.", "error");
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
  setStatus("connStatus", "Token is browser se hata diya gaya.");
  renderPublished();
}

async function renderSetup() {
  const box = $("setupBox");
  box.hidden = false;
  box.innerHTML = "Repository check ho rahi hai…";
  try {
    const s = await checkSetup(repo);
    const line = (ok, text) => `<li class="${ok ? "ok" : "bad"}"><i class="fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${text}</li>`;
    const pagesText = {
      workflow: "GitHub Pages source: <b>GitHub Actions</b>",
      legacy: `GitHub Pages abhi "Deploy from a branch" par hai. <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a> mein Source ko <b>GitHub Actions</b> karo.`,
      disabled: `GitHub Pages band hai. <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a> mein Source: <b>GitHub Actions</b> chuno.`,
      unknown: `Pages setting padh nahi paaye (token mein Pages: Read-only nahi hai). <a href="${settingsUrl("settings/pages")}" target="_blank" rel="noopener">Settings → Pages</a> mein check karo ki Source <b>GitHub Actions</b> hai.`,
    }[s.pages];
    box.innerHTML = `<ul class="checklist">
      ${line(s.workflow, "Deploy workflow aur card checker (<code>.github/workflows/deploy-cards.yml</code>)")}
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
    setStatus("publishStatus", "Form mein galtiyaan hain. Upar ki list dekh kar theek karo.", "error");
    $("formErrors").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!repo) return setStatus("publishStatus", "Pehle GitHub se Connect karo (upar wala box).", "error");
  if (!$("publicOk").checked) return setStatus("publishStatus", "Publish karne se pehle public wala checkbox tick karo.", "error");

  const btn = $("generateCard");
  btn.disabled = true;
  setStatus("publishStatus", `<i class="fa-solid fa-spinner fa-spin"></i> GitHub par commit ho raha hai…`);
  try {
    const res = await publishCard(repo, current, current.publishedId);
    current.publishedId = res.id;
    lastResult = res;
    showResult(res.id);
    updateUrls();
    renderQr();
    refreshPublished();
    waitUntilLive(res);
  } catch (e) {
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
  setStatus("publishStatus", `<i class="fa-solid fa-spinner fa-spin"></i> Commit ho gaya. GitHub Pages deploy ho raha hai (1–3 minute)… <a href="${actions}" target="_blank" rel="noopener">Actions dekho</a>`);
  const started = Date.now();
  while (Date.now() - started < 6 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 10000));
    if (!lastResult || lastResult.id !== id || lastResult.updated !== updated) return; // a newer publish took over
    try {
      const res = await fetch(`${url}card.json?v=${Date.now()}`, { cache: "no-store" });
      if (res.ok && (await res.json()).updated === updated) {
        setStatus("publishStatus", `<i class="fa-solid fa-circle-check"></i> Card live hai: <a href="${url}" target="_blank" rel="noopener">${url}</a>`, "ok");
        return;
      }
    } catch (e) {}
  }
  setStatus("publishStatus", `Card commit ho gaya hai, lekin 6 minute mein live nahi dikha. <a href="${actions}" target="_blank" rel="noopener">Actions</a> mein deploy ka status dekho aur Settings → Pages ka Source check karo.`, "error");
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
  if (!b64) return alert("Is card ki contact file nahi mili (card deactivated ho sakta hai).");
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: "text/vcard" }), `${id}.vcf`);
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (e) {
    prompt("Link copy karo:", url);
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
    list.innerHTML = `<li class="empty">Abhi koi card publish nahi hua hai.</li>`;
    return;
  }
  const locked = repo ? "" : "disabled title='Pehle Connect karo'";
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
      $("saveMsg").textContent = `Published card "${id}" edit ho raha hai. Generate Card dabane par isi link par update hoga.`;
      render();
      showResult(id);
      renderPublished();
      $("form").scrollIntoView({ behavior: "smooth" });
    } else if (act === "deactivate") {
      if (!confirm(`"${id}" ko deactivate karein? Link par "card active nahi hai" dikhega aur contact file hata di jaayegi.`)) return;
      await deactivateCard(repo, id);
      await refreshPublished();
    } else if (act === "activate") {
      const res = await activateCard(repo, id);
      lastResult = res;
      await refreshPublished();
    } else if (act === "delete") {
      if (!confirm(`"${id}" ko delete karein? Card ki files repository se hat jaayengi aur link kaam karna band kar dega. (Purani git history mein data rahega.)`)) return;
      await deleteCard(repo, id);
      if (current.publishedId === id) current.publishedId = null;
      await refreshPublished();
    }
  } catch (err) {
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
  showAllErrors = false;
  showValidation();
  renderPublished();
});

(function init() {
  const token = readToken();
  if (token) {
    $("ghToken").value = token;
    try { $("rememberToken").checked = !!localStorage.getItem(TOKEN_KEY); } catch (e) {}
    connect();
  } else {
    refreshPublished();
  }
})();
