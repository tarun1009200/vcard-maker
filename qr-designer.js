// QR code designer: pattern, eyes, logo, colors, frames and presets on top of qr-code-styling.
// The final image is an SVG (QR embedded inside the frame), rasterised for PNG/JPEG downloads.

const QR_PATTERNS = ["square", "dots", "rounded", "extra-rounded", "classy", "classy-rounded"];
const QR_EYE_FRAMES = ["square", "extra-rounded", "dot"];
const QR_EYE_BALLS = ["square", "dot"];
const QR_FRAMES = ["none", "bar-bottom", "bar-top", "bubble", "circle", "border"];
const QR_FRAME_FONTS = ["Arial", "Verdana", "Georgia", "Trebuchet MS", "Courier New", "Impact"];

const QR_DEFAULTS = {
  pattern: "square", eyeFrame: "square", eyeBall: "square",
  logo: "none", customLogo: "", logoSize: 0.35, clearBehindLogo: true,
  dotsGradient: false, dot1: "#000000", dot2: "#1557b0", eyeColor: "#000000", bg: "#ffffff",
  frame: "none", frameColor: "#000000", frameText: "SCAN ME", frameFont: "Arial",
};

const QR_PRESETS = [
  { label: "Classic", opts: { pattern: "square", eyeFrame: "square", eyeBall: "square", dotsGradient: false, dot1: "#000000", eyeColor: "#000000", frame: "none" } },
  { label: "Blue Rounded", opts: { pattern: "rounded", eyeFrame: "extra-rounded", eyeBall: "dot", dotsGradient: false, dot1: "#1557b0", eyeColor: "#0d3f86", frame: "none" } },
  { label: "Purple Dots", opts: { pattern: "dots", eyeFrame: "dot", eyeBall: "dot", dotsGradient: true, dot1: "#7b2ff7", dot2: "#f107a3", eyeColor: "#7b2ff7", frame: "none" } },
  { label: "Scan Me", opts: { pattern: "square", eyeFrame: "square", eyeBall: "square", dotsGradient: false, dot1: "#000000", eyeColor: "#000000", frame: "bar-bottom", frameColor: "#000000" } },
  { label: "Green Bubble", opts: { pattern: "classy-rounded", eyeFrame: "extra-rounded", eyeBall: "dot", dotsGradient: false, dot1: "#0b8a4a", eyeColor: "#0b8a4a", frame: "bubble", frameColor: "#0b8a4a" } },
  { label: "Navy Circle", opts: { pattern: "dots", eyeFrame: "dot", eyeBall: "dot", dotsGradient: false, dot1: "#054080", eyeColor: "#054080", frame: "circle", frameColor: "#054080" } },
];

function toDataUri(svgText) {
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgText)));
}

// Renders just the QR (no frame) as an SVG data URI.
async function renderQrSvg(data, s, logoSrc) {
  const qr = new QRCodeStyling({
    type: "svg", width: 300, height: 300, margin: 8, data: data || " ",
    qrOptions: { errorCorrectionLevel: logoSrc ? "H" : "M" },
    image: logoSrc || undefined,
    imageOptions: { imageSize: s.logoSize, margin: 4, hideBackgroundDots: s.clearBehindLogo },
    dotsOptions: s.dotsGradient
      ? { type: s.pattern, gradient: { type: "linear", rotation: Math.PI / 4, colorStops: [{ offset: 0, color: s.dot1 }, { offset: 1, color: s.dot2 }] } }
      : { type: s.pattern, color: s.dot1 },
    cornersSquareOptions: { type: s.eyeFrame, color: s.eyeColor },
    cornersDotOptions: { type: s.eyeBall, color: s.eyeColor },
    backgroundOptions: { color: s.bg },
  });
  const blob = await qr.getRawData("svg");
  return toDataUri(await blob.text());
}

// Wraps the QR image in the chosen frame and returns the full SVG text.
function frameSvg(qrUri, s) {
  const c = s.frameColor;
  const text = esc((s.frameText || "").slice(0, 15));
  const font = esc(s.frameFont);
  const label = (x, y, fill, size = 30) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="700" fill="${fill}">${text}</text>`;
  const img = (x, y, size) => `<image href="${qrUri}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
  const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

  switch (s.frame) {
    case "bar-bottom":
      return svg(340, 410, `<rect width="340" height="410" rx="20" fill="${c}"/><rect x="14" y="14" width="312" height="312" rx="10" fill="${s.bg}"/>${img(20, 20, 300)}${label(170, 381, "#fff")}`);
    case "bar-top":
      return svg(340, 410, `<rect width="340" height="410" rx="20" fill="${c}"/>${label(170, 56, "#fff")}<rect x="14" y="84" width="312" height="312" rx="10" fill="${s.bg}"/>${img(20, 90, 300)}`);
    case "bubble":
      return svg(340, 440, `<rect x="4" y="4" width="332" height="332" rx="18" fill="${s.bg}" stroke="${c}" stroke-width="8"/>${img(20, 20, 300)}<path d="M156 350 L170 336 L184 350 Z" fill="${c}"/><rect x="20" y="350" width="300" height="80" rx="16" fill="${c}"/>${label(170, 401, "#fff")}`);
    case "circle":
      return svg(440, 440, `<circle cx="220" cy="220" r="218" fill="${c}"/><rect x="85" y="62" width="270" height="270" rx="14" fill="${s.bg}"/>${img(95, 72, 250)}${label(220, 385, "#fff", 28)}`);
    case "border":
      return svg(340, 410, `<rect x="4" y="4" width="332" height="402" rx="22" fill="${s.bg}" stroke="${c}" stroke-width="8"/>${img(20, 20, 300)}${label(170, 372, c)}`);
    default:
      return svg(300, 300, img(0, 0, 300));
  }
}

async function buildQrSvg(data, s, logoSrc) {
  return frameSvg(await renderQrSvg(data, s, logoSrc), s);
}

// Draws the SVG onto a canvas (3x for a crisp print-ready image) and returns a Blob.
function rasterize(svgText, type) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, type, 0.95);
    };
    img.onerror = reject;
    img.src = toDataUri(svgText);
  });
}
