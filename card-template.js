// Builds the published card: index.html, assets/style.css, assets/card.js and contact.vcf.
// The same HTML is used for the live preview (with inline CSS and data-URL images).

const FONT_AWESOME = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";

const FONTS = ["Roboto", "Poppins", "Open Sans", "Lato", "Montserrat", "Nunito"];

const TEMPLATES = [
  { key: "classic", label: "Classic" },
  { key: "wave", label: "Wave" },
  { key: "floating", label: "Floating" },
  { key: "spotlight", label: "Spotlight" },
  { key: "cover", label: "Cover Photo" },
  { key: "modern", label: "Modern" },
];

const GRADIENTS = [
  { key: "right", css: (a, b) => `linear-gradient(90deg, ${a}, ${b})` },
  { key: "diagonal", css: (a, b) => `linear-gradient(135deg, ${a}, ${b})` },
  { key: "down", css: (a, b) => `linear-gradient(180deg, ${a}, ${b})` },
  { key: "radial", css: (a, b) => `radial-gradient(circle, ${a}, ${b})` },
  { key: "corner", css: (a, b) => `radial-gradient(circle at 0% 0%, ${a}, ${b})` },
];

const SOCIALS = [
  { key: "facebook", label: "Facebook", icon: "fa-brands fa-facebook-f" },
  { key: "messenger", label: "Messenger", icon: "fa-brands fa-facebook-messenger" },
  { key: "instagram", label: "Instagram", icon: "fa-brands fa-instagram" },
  { key: "x", label: "X (Twitter)", icon: "fa-brands fa-x-twitter" },
  { key: "youtube", label: "YouTube", icon: "fa-brands fa-youtube" },
  { key: "linkedin", label: "LinkedIn", icon: "fa-brands fa-linkedin-in" },
  { key: "pinterest", label: "Pinterest", icon: "fa-brands fa-pinterest-p" },
  { key: "wechat", label: "WeChat", icon: "fa-brands fa-weixin" },
  { key: "whatsapp", label: "WhatsApp", icon: "fa-brands fa-whatsapp" },
  { key: "line", label: "LINE", icon: "fa-brands fa-line" },
  { key: "tumblr", label: "Tumblr", icon: "fa-brands fa-tumblr" },
  { key: "snapchat", label: "Snapchat", icon: "fa-brands fa-snapchat" },
  { key: "telegram", label: "Telegram", icon: "fa-brands fa-telegram" },
  { key: "github", label: "GitHub", icon: "fa-brands fa-github" },
  { key: "tiktok", label: "TikTok", icon: "fa-brands fa-tiktok" },
];

const BASE_CSS = `* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font), system-ui, -apple-system, "Segoe UI", sans-serif; background: #e4e9f0; color: #1c2430; }
.card { max-width: 440px; min-height: 100vh; margin: 0 auto; background: #eef1f5; padding-bottom: 24px; overflow: hidden; }
h1 { margin: 0; font-size: 22px; font-weight: 700; }
.sub { margin: 4px 0 0; font-size: 13px; opacity: .92; }
.desc { margin: 0; font-size: 13px; line-height: 1.45; text-align: center; }
.avatar { width: var(--size); height: var(--size); border-radius: 50%; object-fit: cover; background: #b9c3e8; border: 5px solid #fff; display: inline-grid; place-items: end center; overflow: hidden; flex: none; }
.avatar i { color: #fff; font-size: calc(var(--size) * .8); margin-bottom: calc(var(--size) * -.09); }
.logo { display: block; margin: 10px auto 0; max-height: 44px; max-width: 150px; object-fit: contain; }
.btns { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); }
.btns a { text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; font-weight: 500; }
.btns i { font-size: 16px; }
.support { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; padding: 12px 16px 0; }
.support a { display: flex; align-items: center; gap: 10px; background: #fff; border: 1.5px solid var(--accent); border-radius: 8px; padding: 10px 12px; color: inherit; text-decoration: none; min-width: 0; }
.support i { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--btn); color: #fff; display: grid; place-items: center; font-size: 14px; }
.support b { display: block; font-size: 13px; font-weight: 600; color: var(--accent); }
.support small { display: block; font-size: 12px; color: #5b6676; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list { list-style: none; margin: 0; padding: 0; }
.list a { display: flex; gap: 16px; align-items: center; color: inherit; text-decoration: none; }
.list .ic { flex: none; width: 20px; text-align: center; color: var(--accent); font-size: 17px; }
.list small { display: block; color: #8a94a3; font-size: 12px; margin-bottom: 2px; }
.list span { font-size: 15px; word-break: break-word; }
.list.boxed { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
.list.boxed a { padding: 16px 18px; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(20,40,80,.06); }
.list.lined a { padding: 13px 18px; border-bottom: 1px solid #e1e6ed; }
.socials { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 16px 16px 4px; }
.socials a { width: 42px; height: 42px; border-radius: 50%; background: var(--btn); color: #fff; display: grid; place-items: center; font-size: 18px; text-decoration: none; }
.save { display: block; margin: 16px 16px 10px; text-align: center; background: var(--btn); color: #fff; text-decoration: none; font-weight: 600; padding: 14px; border-radius: 8px; }
.share { display: block; width: calc(100% - 32px); margin: 0 16px; font: inherit; font-weight: 600; padding: 12px; border-radius: 8px; border: 1px solid #d3dbe6; background: #fff; color: #1c2430; cursor: pointer; }
`;

const TEMPLATE_CSS = {
  classic: `.hero { background: var(--hero); color: #fff; text-align: center; padding: 22px 16px 0; }
.avatar { --size: 78px; border-width: 3px; }
h1 { margin-top: 10px; }
.hero .sub { margin-bottom: 16px; }
.btns { margin: 0 -16px; border-top: 1px solid rgba(255,255,255,.35); }
.btns a { color: #fff; padding: 9px 4px; border-left: 1px solid rgba(255,255,255,.35); }
.btns a:first-child { border-left: 0; }
.desc { background: #e3e8ee; padding: 10px 16px; color: #3d4756; }
.list.lined a { background: #fff; }
.list .ic { color: #2b2f36; }
`,
  wave: `.hero { background: var(--hero); color: #fff; text-align: center; padding: 28px 20px 110px; clip-path: ellipse(150% 100% at 0% 0%); }
.top { text-align: center; padding: 0 20px; margin-top: -100px; position: relative; }
.avatar { --size: 160px; border-width: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.15); }
.desc { margin-top: 12px; color: #3d4756; }
.btns { gap: 10px; padding: 16px 16px 0; }
.btns a { flex-direction: column; background: var(--btn); color: #fff; border-radius: 6px; padding: 12px 4px 10px; }
`,
  floating: `.panel { margin: 72px 14px 0; background: var(--hero); border-radius: 10px; color: #fff; text-align: center; padding: 64px 14px 14px; position: relative; }
.avatar { --size: 112px; border-width: 4px; position: absolute; left: 50%; top: -56px; transform: translateX(-50%); }
.desc { margin: 10px 0 12px; }
.btns { background: #fff; border-radius: 6px; }
.btns a { color: var(--accent); padding: 9px 4px; border-left: 1px solid #e3e7ee; }
.btns a:first-child { border-left: 0; }
.list { padding: 8px 0; }
.list .ic { width: 38px; height: 38px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 15px; box-shadow: 0 1px 4px rgba(20,40,80,.1); }
`,
  spotlight: `.hero { background: var(--hero); color: #fff; text-align: center; padding: 22px 16px 18px; margin: 0 12px; border-radius: 0 0 8px 8px; }
.avatar { --size: 200px; border-width: 4px; }
h1 { margin-top: 14px; }
.desc { margin: 10px 0 14px; }
.btns { gap: 10px; }
.btns a { flex-direction: column; background: #fff; color: var(--accent); border-radius: 5px; padding: 10px 4px 8px; }
.list.boxed { padding: 14px 24px; }
`,
  cover: `.cover { position: relative; height: 330px; background: #c9d1dc; display: grid; place-items: end center; overflow: hidden; }
.cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover > i { font-size: 230px; color: #fff; margin-bottom: -20px; }
.cover::after { content: ""; position: absolute; left: -15%; right: -15%; bottom: -46px; height: 90px; background: #eef1f5; border-top: 5px solid var(--accent); border-radius: 50%; }
.body { text-align: center; padding: 6px 20px 0; position: relative; }
.sub { color: #5b6676; opacity: 1; }
.desc { margin: 12px 0 14px; color: #3d4756; }
.btns { grid-template-columns: 1fr; gap: 8px; }
.btns a { background: var(--btn); color: #fff; border-radius: 20px; padding: 9px; }
.list { padding: 10px 0; }
`,
  modern: `.card { background: #fff; }
.top { position: relative; }
.cover { height: 320px; background: var(--hero); display: grid; place-items: end center; overflow: hidden; }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.cover > i { font-size: 220px; color: rgba(255,255,255,.85); margin-bottom: -22px; }
.curve { position: absolute; left: 0; bottom: -1px; width: 100%; height: 96px; }
.curve .fill { fill: #fff; }
.curve .line { fill: none; stroke: var(--accent); stroke-width: 6; stroke-linecap: round; vector-effect: non-scaling-stroke; }
/* Sits on the rising end of the curve, half over the photo. */
.org-badge { position: absolute; right: 16px; bottom: 34px; width: 76px; height: 76px; border-radius: 50%; background: #fff; border: 3px solid #fff; box-shadow: 0 4px 14px rgba(0,0,0,.22); display: grid; place-items: center; overflow: hidden; font-size: 34px; font-weight: 700; color: var(--accent); }
.org-badge img { width: 80%; height: 80%; object-fit: contain; }
.body { padding: 0 24px 0; }
h1 { font-size: 25px; line-height: 1.2; }
.sub { color: #5b6676; opacity: 1; font-size: 15px; margin-top: 6px; }
.sub + .sub { color: #1c2430; font-weight: 600; margin-top: 2px; }
.desc { text-align: left; color: #3d4756; font-size: 14px; border-top: 1px solid #e1e6ed; margin-top: 16px; padding-top: 16px; }
.btns { gap: 8px; margin-top: 16px; }
.btns a { background: var(--btn); color: #fff; border-radius: 8px; padding: 10px 4px; }
.list { padding: 8px 8px; }
.list.lined a { padding: 12px 16px; border-bottom: 0; }
.list .ic { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; background: color-mix(in srgb, var(--accent) 14%, #fff); }
.save { border-radius: 10px; }
`,
};

const CARD_JS = `// Share button: uses the phone's native share sheet, falls back to copying the link.
document.getElementById("shareBtn").addEventListener("click", async () => {
  const data = { title: document.title, url: location.href };
  if (navigator.share) {
    try { await navigator.share(data); } catch (e) {}
  } else {
    await navigator.clipboard.writeText(location.href);
    alert("Link copied!");
  }
});
`;

function cardCss(template) {
  return BASE_CSS + (TEMPLATE_CSS[template] || TEMPLATE_CSS.wave);
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function telHref(n) { return "tel:" + String(n).replace(/[^\d+]/g, ""); }

function webHref(u) { return /^https?:\/\//i.test(u) ? u : "https://" + u; }

function socialHref(key, value) {
  // A plain phone number for WhatsApp becomes a wa.me chat link.
  if (key === "whatsapp" && /^[+\d\s()-]+$/.test(value)) return "https://wa.me/" + value.replace(/\D/g, "");
  return webHref(value);
}

// Cards saved before the address was split into parts only have `location`.
function addressText(c) {
  return [c.street, c.city, c.state, c.zip, c.country].filter(Boolean).join(", ") || c.location || "";
}

function heroBackground(c) {
  if (c.bgType !== "gradient") return c.color1;
  const g = GRADIENTS.find((x) => x.key === c.gradType) || GRADIENTS[1];
  return g.css(c.color1, c.color2);
}

// Cards without their own button color use the background, as before.
function buttonBackground(c) {
  const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || "");
  if (!isHex(c.btnColor)) return heroBackground(c);
  if (c.btnType !== "gradient" || !isHex(c.btnColor2)) return c.btnColor;
  const g = GRADIENTS.find((x) => x.key === c.btnGradType) || GRADIENTS[1];
  return g.css(c.btnColor, c.btnColor2);
}

function fontLink(font) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;700&display=swap`;
}

// The small HTML pieces every template arranges differently.
function cardParts(c, preview) {
  const photoSrc = c.photo ? (preview ? c.photo : "assets/photo.jpg") : "";
  const logoSrc = c.logo ? (preview ? c.logo : "assets/logo.png") : "";
  const address = addressText(c);

  const row = (href, icon, label, value) =>
    `<li><a href="${href}"><i class="ic fa-solid ${icon}"></i><div><small>${label}</small><span>${esc(value)}</span></div></a></li>`;

  return {
    photoSrc,
    photoAlt: c.name || "",
    avatar: photoSrc ? `<img class="avatar" src="${photoSrc}" alt="${esc(c.name)}">` : `<div class="avatar"><i class="fa-solid fa-user"></i></div>`,
    logo: logoSrc ? `<img class="logo" src="${logoSrc}" alt="${esc(c.org)} logo">` : "",
    // Round badge on the Modern cover: the company logo, or the company's first letter.
    orgBadge: logoSrc ? `<div class="org-badge"><img src="${logoSrc}" alt="${esc(c.org)} logo"></div>`
      : (c.org || "").trim() ? `<div class="org-badge">${esc(c.org.trim()[0].toUpperCase())}</div>` : "",
    name: `<h1>${esc(c.name || "Your Full Name")}</h1>`,
    subLine: c.position || c.org ? `<p class="sub">${esc([c.position, c.org].filter(Boolean).join(" - "))}</p>` : "",
    subLines: (c.position ? `<p class="sub">${esc(c.position)}</p>` : "") + (c.org ? `<p class="sub">${esc(c.org)}</p>` : ""),
    desc: c.description ? `<p class="desc">${esc(c.description)}</p>` : "",
    buttons: `<nav class="btns">${[
      (c.mobile || c.phone) && `<a href="${telHref(c.mobile || c.phone)}"><i class="fa-solid fa-phone"></i>Phone</a>`,
      c.email && `<a href="mailto:${esc(c.email)}"><i class="fa-solid fa-envelope"></i>Email</a>`,
      c.website && `<a href="${esc(webHref(c.website))}" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i>Website</a>`,
    ].filter(Boolean).join("")}</nav>`,
    // Only numbers that were filled in get a button.
    support: c.support || c.sales ? `<nav class="support">${[
      c.support && `<a href="${telHref(c.support)}"><i class="fa-solid fa-phone-volume"></i><div><b>Customer Support</b><small>${esc(c.support)}</small></div></a>`,
      c.sales && `<a href="${telHref(c.sales)}"><i class="fa-solid fa-phone"></i><div><b>Sales Support</b><small>${esc(c.sales)}</small></div></a>`,
    ].filter(Boolean).join("")}</nav>` : "",
    rows: [
      // `phone` only exists on older cards that were not edited since it was removed.
      (c.mobile || c.phone) && row(telHref(c.mobile || c.phone), "fa-phone", "Mobile Number", c.mobile || c.phone),
      c.email && row("mailto:" + esc(c.email), "fa-envelope", "Email", c.email),
      c.website && row(esc(webHref(c.website)), "fa-globe", "Website", c.website),
      address && row("https://maps.google.com/?q=" + encodeURIComponent(address), "fa-location-dot", "Address", address),
    ].filter(Boolean).join("\n      "),
    socials: SOCIALS.filter((s) => c.socials && c.socials[s.key])
      .map((s) => `<a href="${esc(socialHref(s.key, c.socials[s.key]))}" target="_blank" rel="noopener" aria-label="${s.label}"><i class="${s.icon}"></i></a>`)
      .join(""),
  };
}

function templateBody(t, p) {
  switch (t) {
    case "classic":
      return `<header class="hero">${p.avatar}${p.name}${p.subLine}${p.logo}${p.buttons}</header>
    ${p.desc}
    ${p.support}
    <ul class="list lined">${p.rows}</ul>`;
    case "floating":
      return `<section class="panel">${p.avatar}${p.name}${p.subLine}${p.logo}${p.desc || "<div style='height:12px'></div>"}${p.buttons}</section>
    ${p.support}
    <ul class="list lined">${p.rows}</ul>`;
    case "spotlight":
      return `<header class="hero">${p.avatar}${p.name}${p.subLine}${p.logo}${p.desc || "<div style='height:14px'></div>"}${p.buttons}</header>
    ${p.support}
    <ul class="list boxed">${p.rows}</ul>`;
    case "cover":
      return `<div class="cover">${p.photoSrc ? `<img src="${p.photoSrc}" alt="">` : `<i class="fa-solid fa-user"></i>`}</div>
    <div class="body">${p.name}${p.subLine}${p.logo}${p.desc || "<div style='height:14px'></div>"}${p.buttons}</div>
    ${p.support}
    <ul class="list lined">${p.rows}</ul>`;
    case "modern":
      return `<div class="top">
      <div class="cover">${p.photoSrc ? `<img src="${p.photoSrc}" alt="${esc(p.photoAlt)}">` : `<i class="fa-solid fa-user"></i>`}</div>
      <svg class="curve" viewBox="0 0 400 96" preserveAspectRatio="none" aria-hidden="true">
        <path class="fill" d="M0 80 C 150 92, 290 70, 400 14 L 400 96 L 0 96 Z"/>
        <path class="line" d="M0 80 C 150 92, 290 70, 400 14"/>
      </svg>
      ${p.orgBadge}
    </div>
    <div class="body">${p.name}${p.subLines}${p.desc}${p.buttons}</div>
    ${p.support}
    <ul class="list lined">${p.rows}</ul>`;
    default: // wave
      return `<header class="hero">${p.name}${p.subLines}</header>
    <div class="top">${p.avatar}${p.logo}${p.desc}</div>
    ${p.buttons}
    ${p.support}
    <ul class="list boxed">${p.rows}</ul>`;
  }
}

// mode "preview": CSS and images inline. mode "export": relative links to assets/ and contact.vcf.
function buildCardHtml(c, mode) {
  const preview = mode === "preview";
  const font = FONTS.includes(c.font) ? c.font : "Roboto";
  const template = TEMPLATE_CSS[c.template] ? c.template : "wave";
  const p = cardParts(c, preview);
  const hero = heroBackground(c);
  const btn = buttonBackground(c);

  const styleTag = preview ? `<style>${cardCss(template)}</style>` : `<link rel="stylesheet" href="assets/style.css">`;
  const scriptTag = preview ? "" : `<script src="assets/card.js"></script>`;
  const title = [c.name || "My Card", c.position].filter(Boolean).join(" – ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(c.description)}">
  <link rel="stylesheet" href="${fontLink(font)}">
  <link rel="stylesheet" href="${FONT_AWESOME}">
  ${styleTag}
  <style>:root { --hero: ${hero}; --btn: ${btn}; --accent: ${c.color1}; --font: "${font}"; }</style>
</head>
<body>
  <main class="card t-${template}">
    ${templateBody(template, p)}
    ${p.socials ? `<nav class="socials">${p.socials}</nav>` : ""}
    <a class="save" href="${preview ? "#" : "contact.vcf"}" download="${esc(slugify(c.name || "contact"))}.vcf">Save Contact</a>
    <button class="share" id="shareBtn" type="button">Share Card</button>
  </main>
  ${scriptTag}
</body>
</html>
`;
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-") || "card";
}

// vCard 3.0 with lines folded at 75 chars, photo embedded so it shows in the phone's contacts.
function buildVcf(c) {
  const v = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const parts = (c.name || "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : "";
  const hasAddress = c.street || c.city || c.state || c.zip || c.country || c.location;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${v(last)};${v(parts.join(" "))};;;`,
    `FN:${v(c.name)}`,
    c.org && `ORG:${v(c.org)}`,
    c.position && `TITLE:${v(c.position)}`,
    c.mobile && `TEL;TYPE=CELL:${c.mobile}`,
    c.phone && `TEL;TYPE=VOICE:${c.phone}`,
    // itemN.X-ABLabel gives the number a custom label in phone contacts.
    c.support && `item1.TEL;TYPE=WORK,VOICE:${c.support}`,
    c.support && "item1.X-ABLabel:Customer Support",
    c.sales && `item2.TEL;TYPE=WORK,VOICE:${c.sales}`,
    c.sales && "item2.X-ABLabel:Sales Support",
    c.email && `EMAIL;TYPE=INTERNET:${c.email}`,
    c.website && `URL:${webHref(c.website)}`,
    hasAddress && `ADR;TYPE=WORK:;;${v(c.street || c.location)};${v(c.city)};${v(c.state)};${v(c.zip)};${v(c.country)}`,
    ...SOCIALS.filter((s) => c.socials && c.socials[s.key]).map((s) => `X-SOCIALPROFILE;TYPE=${s.key}:${socialHref(s.key, c.socials[s.key])}`),
    c.description && `NOTE:${v(c.description)}`,
    c.photo && `PHOTO;ENCODING=b;TYPE=JPEG:${c.photo.split(",")[1]}`,
    "END:VCARD",
  ].filter(Boolean);
  const fold = (line) => {
    const out = [];
    for (let i = 0; i < line.length; i += i === 0 ? 75 : 74) out.push((i ? " " : "") + line.slice(i, i === 0 ? 75 : i + 74));
    return out.join("\r\n");
  };
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Every file of one published card, relative to its folder. Used by the ZIP export and by the publisher.
function cardFiles(c) {
  const files = [
    { path: "index.html", text: buildCardHtml(c, "export") },
    { path: "contact.vcf", text: buildVcf(c) },
    { path: "assets/style.css", text: cardCss(c.template) },
    { path: "assets/card.js", text: CARD_JS },
  ];
  if (c.photo) files.push({ path: "assets/photo.jpg", base64: c.photo.split(",")[1] });
  if (c.logo) files.push({ path: "assets/logo.png", base64: c.logo.split(",")[1] });
  return files;
}

// Adds one card's files into a JSZip folder (zip root for single mode, cards/<id>/ for multi mode).
function addCardToZip(folder, c) {
  cardFiles(c).forEach((f) => (f.base64 ? folder.file(f.path, f.base64, { base64: true }) : folder.file(f.path, f.text)));
}

const PHONE_FIELDS = {
  mobile: "Mobile Number",
  support: "Customer Support", sales: "Sales Support",
};

function isWebUrl(u) {
  try {
    const x = new URL(u);
    return (x.protocol === "https:" || x.protocol === "http:") && x.hostname.includes(".");
  } catch (e) {
    return false;
  }
}

// Returns { field: message } for every problem; an empty object means the card can be published.
function validateCard(c) {
  const errors = {};
  const name = (c.name || "").trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 80) errors.name = "Name must be 80 characters or fewer.";

  for (const [f, label] of Object.entries(PHONE_FIELDS)) {
    const v = (c[f] || "").trim();
    if (!v) continue;
    const digits = v.replace(/\D/g, "").length;
    if (!/^\+?[\d\s().-]+$/.test(v) || digits < 6 || digits > 15) errors[f] = `${label}: enter a valid phone number (6–15 digits).`;
  }
  if (c.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c.email.trim())) errors.email = "Enter a valid email address, e.g. name@gmail.com.";
  if (c.website && !isWebUrl(webHref(c.website.trim()))) errors.website = "Enter a valid website link, e.g. www.propium.ai.";
  for (const s of SOCIALS) {
    const v = c.socials && c.socials[s.key] && c.socials[s.key].trim();
    if (v && !isWebUrl(socialHref(s.key, v))) errors["social:" + s.key] = `${s.label}: enter a valid link.`;
  }
  if (!["mobile", "phone", "support", "sales", "email", "website"].some((f) => (c[f] || "").trim())) {
    errors.contact = "Add at least one phone number, email or website.";
  }
  return errors;
}

// Root page for multi mode: links to every card.
function buildDirectoryHtml(cards) {
  const items = cards.map((c) => `<li><a href="cards/${c.id}/">${esc(c.name || c.id)}</a> <small>${esc([c.position, c.org].filter(Boolean).join(", "))}</small></li>`).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Digital Cards</title>
  <style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}li{margin:10px 0}small{color:#666}</style>
</head>
<body>
  <h1>Digital Cards</h1>
  <ul>
    ${items}
  </ul>
</body>
</html>
`;
}
