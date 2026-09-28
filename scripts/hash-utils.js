const FNV_OFFSET_1 = 0x811c9dc5;
const FNV_PRIME_1 = 0x01000193;
const FNV_OFFSET_2 = 0x9dc5811c;
const FNV_PRIME_2 = 0x9e3779b1;

/**
 * crypto.subtle only exists in secure contexts (HTTPS, localhost, file://).
 * Foundry worlds served as plain HTTP over a LAN IP therefore have no
 * SHA-256, which used to break publishing even in External Auth mode, where
 * hashing only serves change detection and file naming.
 */
export function hasWebCrypto() {
  return typeof crypto !== "undefined" && typeof crypto?.subtle?.digest === "function";
}

/**
 * SHA-256 hex digest when WebCrypto is available, otherwise a dual-lane
 * FNV-1a fallback (16 hex characters). The fallback is not cryptographic and
 * must never be used for encryption or key derivation.
 */
export async function digestHex(bytes) {
  if (hasWebCrypto()) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  return fnv1aHex(bytes);
}

export async function digestTextHex(text) {
  return digestHex(new TextEncoder().encode(String(text ?? "")));
}

export function digestAlgorithm() {
  return hasWebCrypto() ? "sha256" : "fnv1a64";
}

function fnv1aHex(bytes) {
  let lane1 = FNV_OFFSET_1;
  let lane2 = FNV_OFFSET_2;
  for (const byte of bytes) {
    lane1 = Math.imul(lane1 ^ byte, FNV_PRIME_1);
    lane2 = Math.imul(lane2 ^ byte, FNV_PRIME_2);
  }
  return toHex32(lane1) + toHex32(lane2);
}

function toHex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}
