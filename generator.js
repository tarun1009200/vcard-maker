const STORE_KEY = "vcard-maker.cards";
const FIELDS = ["name", "org", "website", "position", "mobile", "support", "sales", "email",
  "country", "state", "street", "city", "zip", "color1", "color2", "font"];

// Shown in the previews until the user starts typing, like a sample card.
const PLACEHOLDER = {
  name: "Your Full Name", position: "Position", org: "Company Name",
  mobile: "Mobile Number", email: "Email", website: "Website",
};

const $ = (id) => document.getElementById(id);
const form = $("form");

let current = blankCard();

function blankCard() {
  return {
    id: null, template: "wave", bgType: "solid", gradType: "diagonal", color1: "#4a87e0", color2: "#c03e4a",
    font: "Roboto", btnColor: "", btnType: "solid", btnColor2: "", btnGradType: "diagonal", photo: "", logo: "", socials: {},
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
    alert("Browser storage is full. Delete some old cards or use smaller images.");
    return false;
  }
}

// ---------- form <-> card ----------
function readForm() {
  FIELDS.forEach((f) => (current[f] = form.elements[f].value.trim()));
  current.bgType = form.elements.bgType.value;
  // Empty means the buttons follow the background.
  current.btnColor = form.elements.btnSame.checked ? "" : form.elements.btnColor.value;
  current.btnType = form.elements.btnType.value;
  current.btnColor2 = form.elements.btnColor2.value;
  delete current.location; // migrated into `street` by fillForm
  delete current.fax; // no longer collected; dropped from older cards when they are edited
  delete current.work;
  delete current.description;
  delete current.phone; // migrated into `mobile` by fillForm
  current.socials = {};
}

function fillForm(c) {
  FIELDS.forEach((f) => (form.elements[f].value = c[f] || ""));
  form.elements.color1.value = form.elements.hex1.value = c.color1 || "#4a87e0";
  form.elements.color2.value = form.elements.hex2.value = c.color2 || "#c03e4a";
  form.elements.font.value = c.font || "Roboto";
  form.elements.bgType.value = c.bgType || "solid";
  form.elements.btnSame.checked = !c.btnColor;
  form.elements.btnColor.value = form.elements.hexBtn.value = c.btnColor || c.color1 || "#4a87e0";
  form.elements.btnColor2.value = form.elements.hexBtn2.value = c.btnColor2 || c.color2 || "#c03e4a";
  form.elements.btnType.value = c.btnType || "solid";
  // Older cards stored the whole address in `location`.
  if (c.location && !c.street) form.elements.street.value = c.location;
  // Older cards also had a separate `phone`; it fills in for a missing mobile number.
  if (c.phone && !c.mobile) form.elements.mobile.value = c.phone;
  setThumb($("photoThumb"), c.photo);
  setThumb($("logoThumb"), c.logo);
}

function setThumb(img, src) {
  if (src) img.src = src; else img.removeAttribute("src");
}

// Color picker and hex text box mirror each other.
function syncColor(target) {
  const pairs = {
    color1: "hex1", color2: "hex2", btnColor: "hexBtn", btnColor2: "hexBtn2",
    hex1: "color1", hex2: "color2", hexBtn: "btnColor", hexBtn2: "btnColor2",
  };
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

// Fields with an invalid value (e.g. letters in a phone number) get a red border while typing.
function showValidation() {
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  for (const f of Object.keys(validateCard(current))) {
    const el = f !== "name" && form.elements[f]; // an empty name is not an error while filling in
    if (el) el.classList.add("invalid");
  }
}

function render() {
  readForm();
  showValidation();
  document.querySelector(".bg-box").classList.toggle("gradient", current.bgType === "gradient");
  // While "Same as background" is on, the button controls track the background so unticking starts from it.
  const same = form.elements.btnSame.checked;
  if (same) {
    form.elements.btnType.value = current.bgType;
    form.elements.btnColor.value = form.elements.hexBtn.value = current.color1;
    form.elements.btnColor2.value = form.elements.hexBtn2.value = current.color2;
    current.btnGradType = current.gradType;
  }
  const btnBox = document.querySelector(".btn-box");
  btnBox.classList.toggle("same", same);
  btnBox.classList.toggle("gradient", form.elements.btnType.value === "gradient");
  renderGradTypes();
  $("preview").srcdoc = buildCardHtml(previewCard(), "preview");
  renderTemplateThumbs();
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

// ---------- STEP 2: background, images ----------
// The same gradient controls drive the background and the buttons.
const GRAD_PICKERS = [
  { list: "gradTypes", key: "gradType", swap: "swapColors", a: ["color1", "hex1"], b: ["color2", "hex2"] },
  { list: "btnGradTypes", key: "btnGradType", swap: "swapBtnColors", a: ["btnColor", "hexBtn"], b: ["btnColor2", "hexBtn2"] },
];

function renderGradTypes() {
  for (const p of GRAD_PICKERS) {
    $(p.list).innerHTML = GRADIENTS.map((g) =>
      `<button type="button" data-grad="${g.key}" class="${g.key === current[p.key] ? "on" : ""}" style="background:${g.css("#111", "#eee")}" title="${g.key}"></button>`).join("");
  }
}

for (const p of GRAD_PICKERS) {
  $(p.list).addEventListener("click", (e) => {
    if (!e.target.dataset.grad) return;
    current[p.key] = e.target.dataset.grad;
    render();
  });

  $(p.swap).addEventListener("click", () => {
    const [a, hexA] = p.a.map((n) => form.elements[n]);
    const [b, hexB] = p.b.map((n) => form.elements[n]);
    const first = a.value;
    a.value = hexA.value = b.value;
    b.value = hexB.value = first;
    render();
  });
}

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

// ---------- drafts ----------
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
    $("saveMsg").textContent = `Draft saved as "${current.id}" (in this browser). It opens again the next time you visit.`;
  }
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
});
buildTemplatePicker();
// Reopen the most recently saved draft, if there is one.
const lastDraft = loadCards().sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
if (lastDraft) {
  current = { ...blankCard(), ...lastDraft };
  $("saveMsg").textContent = `Editing "${current.id}".`;
}
fillForm(current);
render();
