import assert from "node:assert/strict";
import {
  resolvePublishedActorKey,
  slugifyPublishedActor,
} from "./published-actor-key.js";

const slug = "0123456789abcdef01234567";

assert.equal(slugifyPublishedActor("Darcy Stone"), "darcy-stone");
assert.equal(slugifyPublishedActor("达西"), "character");
assert.equal(resolvePublishedActorKey({ slug }), `actor-${slug}`);
assert.equal(resolvePublishedActorKey({ slug: slug.toUpperCase() }), `actor-${slug}`);
assert.throws(
  () => resolvePublishedActorKey({ slug: "invalid" }),
  /valid snapshot slug/,
);

console.log("published Actor keys: ok");
