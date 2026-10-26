// Sessions are AES-GCM encrypted with SESSION_SECRET, so the browser holds an opaque value
// and never sees the GitHub token inside it.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(secret) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealSession(data, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(JSON.stringify(data)));
  return Buffer.from(iv).toString("base64url") + "." + Buffer.from(ct).toString("base64url");
}

// Returns the session, or null when it is malformed, tampered with or expired.
export async function openSession(value, secret) {
  try {
    const [iv, ct] = String(value).split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64url") }, await key(secret), Buffer.from(ct, "base64url"));
    const s = JSON.parse(dec.decode(pt));
    return s && s.token && s.login && s.exp > Date.now() ? s : null;
  } catch (e) {
    return null;
  }
}
