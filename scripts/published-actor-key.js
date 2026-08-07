const SNAPSHOT_SLUG_PATTERN = /^[a-f0-9]{24}$/;

export function slugifyPublishedActor(value) {
  return String(value || "character")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "character";
}

export function resolvePublishedActorKey({ slug = "" } = {}) {
  const stableSlug = String(slug || "").trim().toLowerCase();
  if (!SNAPSHOT_SLUG_PATTERN.test(stableSlug)) {
    throw new Error("Published Actor key requires a valid snapshot slug.");
  }
  return `actor-${stableSlug}`;
}
