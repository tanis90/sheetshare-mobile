export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;

const SAFE_IMAGE_TYPES = Object.freeze({
  gif: { extension: "gif", mimeType: "image/gif" },
  jpg: { extension: "jpg", mimeType: "image/jpeg" },
  png: { extension: "png", mimeType: "image/png" },
  webp: { extension: "webp", mimeType: "image/webp" }
});

/**
 * Reject an index before it is written when two actors claim the same public
 * key or snapshot slug. Comparisons are case-insensitive and NFC-normalized so
 * routes cannot become ambiguous on a proxy or a case-insensitive filesystem.
 */
export function assertUniquePublishedIdentities(entries) {
  const keys = new Map();
  const slugs = new Map();

  for (const entry of entries) {
    const label = actorLabel(entry);
    assertPresent(entry?.key, "key", label);
    assertPresent(entry?.slug, "slug", label);
    claimIdentity(keys, canonicalIdentity(entry.key), "key", label);
    claimIdentity(slugs, canonicalIdentity(entry.slug), "slug", label);
  }

  return entries;
}

export function buildPortraitPublicPath(worldId, digestHex, extension) {
  const world = String(worldId ?? "").trim();
  const digest = String(digestHex ?? "").trim().toLowerCase();
  const normalizedExtension = String(extension ?? "").trim().toLowerCase();
  if (!world) throw new Error("Cannot build a SheetShare portrait path without a world id.");
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("SheetShare portrait digest must be a 64-character SHA-256 hex value.");
  if (!Object.hasOwn(SAFE_IMAGE_TYPES, normalizedExtension)) {
    throw new Error(`Unsupported SheetShare portrait extension: ${normalizedExtension || "(empty)"}.`);
  }
  return `assets/sheetshare-mobile/${encodeURIComponent(world)}/media/${digest}.${normalizedExtension}`;
}

/** Detect safe raster formats by signature. SVG and other active formats are intentionally rejected. */
export function detectSafeImageType(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (startsWith(value, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return SAFE_IMAGE_TYPES.png;
  if (startsWith(value, [0xff, 0xd8, 0xff])) return SAFE_IMAGE_TYPES.jpg;
  if (ascii(value, 0, 6) === "GIF87a" || ascii(value, 0, 6) === "GIF89a") return SAFE_IMAGE_TYPES.gif;
  if (ascii(value, 0, 4) === "RIFF" && ascii(value, 8, 4) === "WEBP") return SAFE_IMAGE_TYPES.webp;
  return null;
}

export function assertPortraitSize(byteLength, maximum = MAX_PORTRAIT_BYTES) {
  const size = Number(byteLength);
  if (!Number.isFinite(size) || size < 0) throw new Error("SheetShare portrait size is invalid.");
  if (size > maximum) {
    throw new Error(`SheetShare portrait exceeds the ${Math.floor(maximum / (1024 * 1024))} MiB safety limit.`);
  }
  return size;
}

function claimIdentity(claims, canonical, field, label) {
  const existing = claims.get(canonical);
  if (existing) {
    throw new Error(`SheetShare refused to write _latest.json: duplicate ${field} is claimed by ${existing} and ${label}.`);
  }
  claims.set(canonical, label);
}

function assertPresent(value, field, label) {
  if (!String(value ?? "").trim()) {
    throw new Error(`SheetShare refused to write _latest.json: ${label} has no ${field}.`);
  }
}

function canonicalIdentity(value) {
  return String(value).normalize("NFC").trim().toLowerCase().normalize("NFC");
}

function actorLabel(entry) {
  const name = String(entry?.name ?? "").trim() || "Unnamed actor";
  const id = String(entry?.actorId ?? entry?.id ?? "").trim();
  return id ? `${name} (${id})` : name;
}

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes, offset, length) {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
