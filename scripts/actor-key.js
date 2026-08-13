const MODULE_ID = "sheetshare-mobile";
const PUBLISH_FLAG = "publish";

export const MAX_ACTOR_KEY_LENGTH = 128;
export const DEFAULT_ACTOR_ID_SUFFIX_LENGTH = 8;
export const GENERATED_ACTOR_KEY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,127}$/u;

/** Keep a key readable while limiting it to the portal's safe Unicode alphabet. */
export function normalizeActorKeyPart(value, fallback = "value") {
  return normalizePart(value) || normalizePart(fallback) || "value";
}

export function buildActorKeyBase(worldId, actorName) {
  return truncateKey(
    `${normalizeActorKeyPart(worldId, "world")}-${normalizeActorKeyPart(actorName, "character")}`,
    MAX_ACTOR_KEY_LENGTH
  );
}

/** Preserve the pre-0.2 ASCII alias so existing Latin-name links keep resolving. */
export function legacyActorKeyAlias(value) {
  return String(value || "character")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "character";
}

/**
 * Resolve a stable public key without mutating the actor.
 *
 * Existing non-generic keys are immutable. The legacy ASCII fallback
 * `character`, which older releases assigned to pure-Chinese names, is
 * migrated on the next publish/refresh. If another actor has already claimed
 * the readable world/name key, a short stable actor-id suffix is appended.
 */
export function resolveActorKey(actor, { worldId, actors } = {}) {
  const existing = getStoredActorKey(actor);
  if (existing && !isLegacyChineseFallbackKey(existing, actor?.name)) return existing;

  const resolvedWorldId = worldId ?? globalThis.game?.world?.id;
  const base = buildActorKeyBase(resolvedWorldId, actor?.name);
  const occupiedKeys = new Set(
    actorList(actors ?? globalThis.game?.actors?.contents ?? globalThis.game?.actors)
      .filter(candidate => !sameActor(candidate, actor))
      .map(getStoredActorKey)
      .filter(Boolean)
      .map(canonicalKey)
  );

  if (!occupiedKeys.has(canonicalKey(base))) return base;

  const actorId = normalizedActorId(actor);
  if (!actorId) {
    throw new Error(`Cannot resolve a collision-safe SheetShare key for ${actor?.name || "an actor"} without an actor id.`);
  }

  const actorIdCharacters = Array.from(actorId);
  const firstLength = Math.min(DEFAULT_ACTOR_ID_SUFFIX_LENGTH, actorIdCharacters.length);
  for (let length = firstLength; length <= actorIdCharacters.length; length += 1) {
    const candidate = appendSuffix(base, actorIdCharacters.slice(0, length).join(""));
    if (!occupiedKeys.has(canonicalKey(candidate))) return candidate;
  }

  // Foundry actor ids are unique. This only handles manually assigned keys
  // that already occupy every literal actor-id candidate.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const discriminator = stableHash(`${rawActorId(actor)}:${attempt}`);
    const candidate = appendSuffix(base, `${actorId}-${discriminator}`);
    if (!occupiedKeys.has(canonicalKey(candidate))) return candidate;
  }

  throw new Error(`Unable to allocate a unique SheetShare key for ${actor?.name || "actor"}.`);
}

export function getStoredActorKey(actor) {
  const fromMethod = actor?.getFlag?.(MODULE_ID, PUBLISH_FLAG);
  const publish = fromMethod ?? actor?.flags?.[MODULE_ID]?.[PUBLISH_FLAG];
  const key = publish?.key;
  return typeof key === "string" && key.trim() ? key : "";
}

export function isLegacyChineseFallbackKey(key, actorName) {
  if (String(key).trim().toLowerCase() !== "character") return false;
  const significantName = String(actorName ?? "").normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
  return Boolean(significantName) && /^\p{Script=Han}+$/u.test(significantName);
}

function normalizePart(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function actorList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.contents)) return value.contents;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return [];
}

function sameActor(left, right) {
  if (left === right) return true;
  const leftId = rawActorId(left);
  const rightId = rawActorId(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

function rawActorId(actor) {
  return String(actor?.id ?? actor?._id ?? "").trim();
}

function normalizedActorId(actor) {
  return rawActorId(actor)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function canonicalKey(value) {
  return String(value ?? "").normalize("NFC").trim().toLowerCase().normalize("NFC");
}

function appendSuffix(base, suffix) {
  const suffixLength = Array.from(suffix).length;
  const availableBaseLength = Math.max(1, MAX_ACTOR_KEY_LENGTH - suffixLength - 1);
  return `${truncateKey(base, availableBaseLength)}-${suffix}`;
}

function truncateKey(value, maximumLength) {
  const truncated = Array.from(String(value))
    .slice(0, maximumLength)
    .join("")
    .replace(/[-_]+$/g, "");
  return truncated || "value";
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
