import {
  MAX_PORTRAIT_BYTES,
  assertPortraitSize,
  buildPortraitPublicPath,
  detectSafeImageType
} from "./publish-safety.js";

const MODULE_ID = "sheetshare-mobile";
const STORAGE_ROOT_NAME = "sheetshare-mobile";

/**
 * Copy actor.img into the world's SheetShare media directory using the source
 * bytes' SHA-256 digest as its filename. Unsupported or unavailable images are
 * deliberately represented as an empty portrait so the viewer uses initials.
 */
export async function mirrorActorPortrait(actor) {
  const source = String(actor?.img ?? "").trim();
  if (!source) return "";

  try {
    const response = await fetch(assetRequestUrl(source), {
      cache: "no-store",
      credentials: "include"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const advertisedLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength >= 0) assertPortraitSize(advertisedLength);

    const bytes = await readResponseBytes(response);
    const imageType = detectSafeImageType(bytes);
    if (!imageType) throw new Error("unsupported image format (only PNG, JPEG, WEBP, and GIF are allowed)");

    const digest = await sha256Hex(bytes);
    const filename = `${digest}.${imageType.extension}`;
    await ensureDirectory(mediaStorageRoot());
    const file = new File([bytes], filename, { type: imageType.mimeType });
    await FilePicker.upload("data", mediaStorageRoot(), file, { overwrite: true }, { notify: false });
    return buildPortraitPublicPath(game.world.id, digest, imageType.extension);
  } catch (error) {
    console.warn(`${MODULE_ID} | Portrait mirror skipped for ${actor?.name || "actor"}: ${error?.message ?? error}`);
    return "";
  }
}

export async function readResponseBytes(response, maximum = MAX_PORTRAIT_BYTES) {
  if (!response?.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertPortraitSize(bytes.byteLength, maximum);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      assertPortraitSize(total, maximum);
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock?.();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function assetRequestUrl(source) {
  if (/^data:/i.test(source)) return source;
  if (/^https?:/i.test(source)) return source;
  if (/^(?:blob|javascript):/i.test(source)) throw new Error("unsupported portrait URL scheme");
  const cleaned = source.replace(/^\/+/, "");
  if (foundry.utils.getRoute) return foundry.utils.getRoute(cleaned);
  return `${window.location.origin}/${cleaned}`;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function mediaStorageRoot() {
  return `assets/${STORAGE_ROOT_NAME}/${game.world.id}/media`;
}

async function ensureDirectory(path) {
  try {
    await FilePicker.createDirectory("data", path, { notify: false });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/exist|EEXIST|already/i.test(message)) throw error;
  }
}
