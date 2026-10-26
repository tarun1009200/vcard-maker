const STORE_KEY = "vcard-maker.cards";
const SETTINGS_KEY = "vcard-maker.settings";
const FIELDS = ["name", "org", "website", "position", "mobile", "work", "phone", "fax", "email",
  "country", "state", "street", "city", "zip", "description", "color1", "color2", "font"];

// Shown in the previews until the user starts typing, like a sample card.
const PLACEHOLDER = {
  name: "Your Full Name", position: "Position", org: "Company Name", description: "Personal Description",
  mobile: "Mobile Phone", work: "Mobile Phone (Work)", phone: "Phone", email: "Email", website: "Website",
};

const $ = (id) => document.getElementById(id);
const form = $("form");

let current = blankCard();
let qrState = { ...QR_DEFAULTS };

function blankCard() {
  return {
    id: null, template: "wave", bgType: "solid", gradType: "diagonal", color1: "#4a87e0", color2: "#c03e4a",
    font: "Roboto", photo: "", logo: "", socials: {},
  };
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- storage (browser only) ----------
function loadCards() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
}
function storeCards(cards) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cards));
    return true;
  } catch (e) {
    alert("Browser storage full ho gaya. Kuch purane cards delete karo ya chhoti images use karo.");
    return false;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      user: $("ghUser").value, repo: $("ghRepo").value,
      mode: document.querySelector("input[name=mode]:checked").value,
      qr: qrState,
    }));
  } catch (e) {}
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!s) return;
    $("ghUser").value = s.user || "";
    $("ghRepo").value = s.repo || "";
    document.querySelector(`input[name=mode][value=${s.mode || "single"}]`).checked = true;
    qrState = { ...QR_DEFAULTS, ...(s.qr || {}) };
  } catch (e) {}
}

// ---------- form <-> card ----------
function readForm() {
  FIELDS.forEach((f) => (current[f] = form.elements[f].value.trim()));
  current.bgType = form.elements.bgType.value;
  delete current.location; // migrated into `street` by fillForm
  current.socials = {};
  $("socialInputs").querySelectorAll("input[data-social]").forEach((i) => (current.socials[i.dataset.social] = i.value.trim()));
}

function fillForm(c) {
  FIELDS.forEach((f) => (form.elements[f].value = c[f] || ""));
  form.elements.color1.value = form.elements.hex1.value = c.color1 || "#4a87e0";
  form.elements.color2.value = form.elements.hex2.value = c.color2 || "#c03e4a";
  form.elements.font.value = c.font || "Roboto";
  form.elements.bgType.value = c.bgType || "solid";
  // Older cards stored the whole address in `location`.
  if (c.location && !c.street) form.elements.street.value = c.location;
  setThumb($("photoThumb"), c.photo);
  setThumb($("logoThumb"), c.logo);
  renderSocialInputs();
}

function setThumb(img, src) {
  if (src) img.src = src; else img.removeAttribute("src");
}

// Color picker and hex text box mirror each other.
function syncColor(target) {
  const pairs = { color1: "hex1", color2: "hex2", hex1: "color1", hex2: "color2" };
  const other = pairs[target.name];
  if (!other) return;
  if (target.type === "color") form.elements[other].value = target.value;
  else if (/^#[0-9a-f]{6}$/i.test(target.value)) form.elements[other].value = target.value.toLowerCase();
}

function previewCard() {
  const c = { ...current };
  if (!c.name && !c.mobile && !c.email) Object.assign(c, PLACEHOLDER);
  return c;
}

function render() {
  readForm();
  document.querySelector(".bg-box").classList.toggle("gradient", current.bgType === "gradient");
  renderGradTypes();
  $("preview").srcdoc = buildCardHtml(previewCard(), "preview");
  renderTemplateThumbs();
  updateUrls();
  renderQr();
}

// ---------- STEP 1: templates ----------
function buildTemplatePicker() {
  $("templates").innerHTML = TEMPLATES.map((t) => `
    <button type="button" class="tpl" data-template="${t.key}">
      <div class="thumb"><iframe tabindex="-1" title="${t.label}"></iframe></div>
      <div class="dot"></div>
      <span>${t.label}</span>
    </button>`).join("");
  $("templates").addEventListener("click", (e) => {
    const tile = e.target.closest(".tpl");
    if (!tile) return;
    current.template = tile.dataset.template;
    render();
  });
}

const renderTemplateThumbs = debounce(() => {
  const base = previewCard();
  document.querySelectorAll(".tpl").forEach((tile) => {
    tile.classList.toggle("on", tile.dataset.template === current.template);
    tile.querySelector("iframe").srcdoc = buildCardHtml({ ...base, template: tile.dataset.template }, "preview");
  });
}, 300);

// ---------- STEP 2: background, images, socials ----------
function renderGradTypes() {
  $("gradTypes").innerHTML = GRADIENTS.map((g) =>
    `<button type="button" data-grad="${g.key}" class="${g.key === current.gradType ? "on" : ""}" style="background:${g.css("#111", "#eee")}" title="${g.key}"></button>`).join("");
}

$("gradTypes").addEventListener("click", (e) => {
  if (!e.target.dataset.grad) return;
  current.gradType = e.target.dataset.grad;
  render();
});

$("swapColors").addEventListener("click", () => {
  const a = form.elements.color1.value;
  form.elements.color1.value = form.elements.hex1.value = form.elements.color2.value;
  form.elements.color2.value = form.elements.hex2.value = a;
  render();
});

// Photo: square-cropped 400px JPEG. Logo: fit within 300px, PNG (keeps transparency).
function loadImage(file, isLogo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (isLogo) {
          const scale = Math.min(1, 300 / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } else {
          const side = Math.min(img.width, img.height);
          canvas.width = canvas.height = Math.min(400, side);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function bindImage(inputId, removeId, thumbId, key, isLogo) {
  $(inputId).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    current[key] = await loadImage(file, isLogo);
    setThumb($(thumbId), current[key]);
    e.target.value = "";
    render();
  });
  $(removeId).addEventListener("click", () => {
    current[key] = "";
    setThumb($(thumbId), "");
    render();
  });
}

function renderSocialPicker() {
  $("socialPicker").innerHTML = SOCIALS.map((s) =>
    `<button type="button" title="${s.label}" data-key="${s.key}" class="${s.key in (current.socials || {}) ? "on" : ""}"><i class="${s.icon}"></i></button>`).join("");
}

function renderSocialInputs() {
  const socials = current.socials || {};
  $("socialInputs").innerHTML = SOCIALS.filter((s) => s.key in socials).map((s) => `
    <div class="s-row">
      <i class="${s.icon}"></i>
      <input data-social="${s.key}" value="${esc(socials[s.key])}" placeholder="${s.label} ${s.key === "whatsapp" ? "number or link" : "profile link"}">
      <button type="button" data-remove="${s.key}" title="Remove">&times;</button>
    </div>`).join("");
  renderSocialPicker();
}

$("socialPicker").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  readForm();
  if (!(btn.dataset.key in current.socials)) current.socials[btn.dataset.key] = "";
  renderSocialInputs();
  $("socialInputs").querySelector(`[data-social="${btn.dataset.key}"]`).focus();
});

$("socialInputs").addEventListener("click", (e) => {
  const key = e.target.dataset.remove;
  if (!key) return;
  readForm();
  delete current.socials[key];
  renderSocialInputs();
  render();
});

document.querySelectorAll(".arrow").forEach((b) =>
  b.addEventListener("click", () => $("socialPicker").scrollBy({ left: b.dataset.scroll * 200, behavior: "smooth" })));

// ---------- My Cards ----------
function uniqueId(name, cards) {
  const base = slugify(name || "card");
  let id = base, n = 2;
  while (cards.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}

function saveCurrent() {
  readForm();
  const cards = loadCards();
  // The id is fixed on first save so the card's URL never changes on later edits.
  if (!current.id) current.id = uniqueId(current.name, cards);
  current.updated = Date.now();
  const i = cards.findIndex((c) => c.id === current.id);
  if (i >= 0) cards[i] = { ...current }; else cards.push({ ...current });
  if (storeCards(cards)) {
    $("saveMsg").textContent = `Saved as "${current.id}".`;
    renderList();
    updateUrls();
  }
}

function renderList() {
  const cards = loadCards();
  const list = $("cardList");
  if (!cards.length) {
    list.innerHTML = `<li class="empty">Abhi koi card save nahi hai.</li>`;
    return;
  }
  list.innerHTML = cards.map((c) => `
    <li class="${c.id === current.id ? "active" : ""}">
      ${c.photo ? `<img src="${c.photo}" alt="">` : `<img alt="">`}
      <div class="meta"><b>${esc(c.name || "Untitled")}</b><small>${esc(c.id)} · ${esc(c.position || "")}</small></div>
      <button class="btn ghost" data-open="${c.id}">Edit</button>
      <button class="btn ghost" data-del="${c.id}">Delete</button>
    </li>`).join("");
}

$("cardList").addEventListener("click", (e) => {
  const openId = e.target.dataset.open;
  const delId = e.target.dataset.del;
  if (openId) {
    current = { ...blankCard(), ...loadCards().find((c) => c.id === openId) };
    fillForm(current);
    $("saveMsg").textContent = `Editing "${current.id}".`;
    render();
    renderList();
    $("form").scrollIntoView({ behavior: "smooth" });
  } else if (delId && confirm(`Delete card "${delId}"?`)) {
    storeCards(loadCards().filter((c) => c.id !== delId));
    if (current.id === delId) current.id = null;
    renderList();
    updateUrls();
  }
});

// ---------- STEP 3: publish ----------
function siteUrl() {
  const user = $("ghUser").value.trim() || "username";
  const repo = $("ghRepo").value.trim() || "repository";
  return `https://${user.toLowerCase()}.github.io/${repo}/`;
}

function updateUrls() {
  const base = siteUrl();
  const cardUrl = `${base}cards/${current.id || "CARD-ID"}/`;
  $("urlSingle").textContent = base;
  $("urlMulti").textContent = cardUrl;
  const mode = document.querySelector("input[name=mode]:checked").value;
  if ($("ghUser").value.trim() && $("ghRepo").value.trim()) $("qrLink").value = mode === "single" ? base : cardUrl;
}

async function downloadZip() {
  readForm();
  const mode = document.querySelector("input[name=mode]:checked").value;
  // Files sit at the zip root so they can be uploaded to the repo as-is.
  const root = new JSZip();

  if (mode === "single") {
    if (!current.name) return alert("Pehle apna naam bharo.");
    addCardToZip(root, current);
  } else {
    const cards = loadCards();
    if (!cards.length) return alert("Multiple mode ke liye pehle cards 'Save to My Cards' karo.");
    cards.forEach((c) => addCardToZip(root.folder(`cards/${c.id}`), c));
    root.file("index.html", buildDirectoryHtml(cards));
  }
  root.file(".nojekyll", "");

  const blob = await root.generateAsync({ type: "blob" });
  downloadBlob(blob, `${$("ghRepo").value.trim() || "my-vcard"}.zip`);
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- STEP 4: QR ----------
const SAMPLE_LINK = "https://example.github.io/my-vcard/";
let lastQrSvg = "";

function qrLogoSrc() {
  return { company: current.logo, photo: current.photo, custom: qrState.customLogo }[qrState.logo] || "";
}

const renderQr = debounce(async () => {
  const link = $("qrLink").value.trim() || SAMPLE_LINK;
  try {
    lastQrSvg = await buildQrSvg(link, qrState, qrLogoSrc());
    $("qrPreview").src = toDataUri(lastQrSvg);
  } catch (e) {
    console.error(e);
  }
}, 150);

function qrChanged() {
  syncQrControls();
  saveSettings();
  renderQr();
}

async function buildQrTiles() {
  const tile = (attr, value, label) => `<button type="button" class="tile" ${attr}="${value}" title="${label}"><img alt=""></button>`;
  $("patternTiles").innerHTML = QR_PATTERNS.map((p) => tile("data-pattern", p, p)).join("");
  $("eyeFrameTiles").innerHTML = QR_EYE_FRAMES.map((p) => tile("data-eye-frame", p, p)).join("");
  $("eyeBallTiles").innerHTML = QR_EYE_BALLS.map((p) => tile("data-eye-ball", p, p)).join("");
  $("frameTiles").innerHTML = QR_FRAMES.map((f) => f === "none"
    ? `<button type="button" class="tile" data-frame="none"><i class="fa-solid fa-xmark"></i></button>`
    : tile("data-frame", f, f)).join("");
  $("presetTiles").innerHTML = QR_PRESETS.map((p, i) => `<button type="button" class="tile" data-preset="${i}"><img alt=""><span>${p.label}</span></button>`).join("");
  $("frameFont").innerHTML = QR_FRAME_FONTS.map((f) => `<option>${f}</option>`).join("");

  const sample = (s) => renderQrSvg(SAMPLE_LINK, { ...QR_DEFAULTS, ...s }, "");
  const set = (sel, uri) => (document.querySelector(sel + " img").src = uri);
  for (const p of QR_PATTERNS) set(`[data-pattern="${p}"]`, await sample({ pattern: p }));
  for (const p of QR_EYE_FRAMES) set(`[data-eye-frame="${p}"]`, await sample({ eyeFrame: p, eyeColor: "#1557b0" }));
  for (const p of QR_EYE_BALLS) set(`[data-eye-ball="${p}"]`, await sample({ eyeBall: p, eyeColor: "#1557b0" }));
  const plain = await sample({});
  for (const f of QR_FRAMES.slice(1)) set(`[data-frame="${f}"]`, toDataUri(frameSvg(plain, { ...QR_DEFAULTS, frame: f })));
  for (const [i, p] of QR_PRESETS.entries()) set(`[data-preset="${i}"]`, toDataUri(await buildQrSvg(SAMPLE_LINK, { ...QR_DEFAULTS, ...p.opts }, "")));
}

function syncQrControls() {
  const mark = (sel, attr, value) => document.querySelectorAll(sel).forEach((t) => t.classList.toggle("on", t.getAttribute(attr) === value));
  mark("[data-pattern]", "data-pattern", qrState.pattern);
  mark("[data-eye-frame]", "data-eye-frame", qrState.eyeFrame);
  mark("[data-eye-ball]", "data-eye-ball", qrState.eyeBall);
  mark("[data-frame]", "data-frame", qrState.frame);
  mark("[data-logo]", "data-logo", qrState.logo);
  document.querySelectorAll("[data-qr]").forEach((i) => (i.value = qrState[i.dataset.qr]));
  document.querySelectorAll("[data-qr-hex]").forEach((i) => { if (document.activeElement !== i) i.value = qrState[i.dataset.qrHex]; });
  document.querySelector(`input[name=dotsFill][value=${qrState.dotsGradient ? "gradient" : "solid"}]`).checked = true;
  $("dot2Wrap").style.display = qrState.dotsGradient ? "" : "none";
  $("logoSize").value = qrState.logoSize;
  $("clearBehind").checked = qrState.clearBehindLogo;
  if (document.activeElement !== $("frameText")) $("frameText").value = qrState.frameText;
  $("frameFont").value = qrState.frameFont;
}

function bindQrControls() {
  $("qrTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#qrTabs button").forEach((b) => b.classList.toggle("on", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== btn.dataset.tab));
  });

  document.querySelector(".qr-left").addEventListener("click", (e) => {
    const t = e.target.closest(".tile");
    if (!t || t.dataset.logo === "custom") return;
    if (t.dataset.pattern) qrState.pattern = t.dataset.pattern;
    else if (t.dataset.eyeFrame) qrState.eyeFrame = t.dataset.eyeFrame;
    else if (t.dataset.eyeBall) qrState.eyeBall = t.dataset.eyeBall;
    else if (t.dataset.frame) qrState.frame = t.dataset.frame;
    else if (t.dataset.preset) Object.assign(qrState, QR_PRESETS[t.dataset.preset].opts);
    else if (t.dataset.logo) {
      if (t.dataset.logo === "company" && !current.logo) return alert("Pehle Step 2 mein Company Logo upload karo.");
      if (t.dataset.logo === "photo" && !current.photo) return alert("Pehle Step 2 mein Primary Photo upload karo.");
      qrState.logo = t.dataset.logo;
    }
    qrChanged();
  });

  $("qrLogoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    qrState.customLogo = await loadImage(file, true);
    qrState.logo = "custom";
    e.target.value = "";
    qrChanged();
  });

  document.querySelectorAll("[data-qr]").forEach((i) => i.addEventListener("input", () => { qrState[i.dataset.qr] = i.value; qrChanged(); }));
  document.querySelectorAll("[data-qr-hex]").forEach((i) => i.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(i.value)) { qrState[i.dataset.qrHex] = i.value.toLowerCase(); qrChanged(); }
  }));
  document.querySelectorAll("input[name=dotsFill]").forEach((r) => r.addEventListener("change", () => { qrState.dotsGradient = r.value === "gradient"; qrChanged(); }));
  $("logoSize").addEventListener("input", (e) => { qrState.logoSize = +e.target.value; qrChanged(); });
  $("clearBehind").addEventListener("change", (e) => { qrState.clearBehindLogo = e.target.checked; qrChanged(); });
  $("frameText").addEventListener("input", (e) => { qrState.frameText = e.target.value; qrChanged(); });
  $("frameFont").addEventListener("change", (e) => { qrState.frameFont = e.target.value; qrChanged(); });
  $("qrLink").addEventListener("input", renderQr);

  $("downloadQr").addEventListener("click", async () => {
    if (!$("qrLink").value.trim()) return alert("Pehle apna card link daalo (Step 3 mein username aur repo bharo).");
    // Rebuild instead of using the debounced preview so the file matches the latest settings.
    const svg = await buildQrSvg($("qrLink").value.trim(), qrState, qrLogoSrc());
    const format = document.querySelector("input[name=qrFormat]:checked").value;
    const name = slugify($("qrName").value || `qr-${current.id || "card"}`);
    if (format === "svg") downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
    else downloadBlob(await rasterize(svg, `image/${format}`), `${name}.${format === "jpeg" ? "jpg" : "png"}`);
  });
}

// ---------- wire up ----------
$("fontSelect").innerHTML = FONTS.map((f) => `<option>${f}</option>`).join("");
form.addEventListener("input", (e) => { syncColor(e.target); render(); });
form.addEventListener("submit", (e) => e.preventDefault());
bindImage("photoInput", "photoRemove", "photoThumb", "photo", false);
bindImage("logoInput", "logoRemove", "logoThumb", "logo", true);
$("saveCard").addEventListener("click", saveCurrent);
$("newCard").addEventListener("click", () => {
  current = blankCard();
  fillForm(current);
  $("saveMsg").textContent = "";
  render();
  renderList();
});
["ghUser", "ghRepo"].forEach((id) => $(id).addEventListener("input", () => { saveSettings(); updateUrls(); renderQr(); }));
document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", () => { saveSettings(); updateUrls(); renderQr(); }));
$("downloadZip").addEventListener("click", downloadZip);

loadSettings();
buildTemplatePicker();
bindQrControls();
fillForm(current);
syncQrControls();
render();
renderList();
buildQrTiles().then(syncQrControls);
