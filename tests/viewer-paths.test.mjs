import assert from "node:assert/strict";
import test from "node:test";

await import("../viewer/assets/path-utils.js");

const { assetUrl, routePrefix } = globalThis.SheetShareViewerPaths;

test("adds the campaign prefix when the viewer is reverse-proxied", () => {
  const pathname = "/quest/cos/modules/sheetshare-mobile/viewer/index.html";
  assert.equal(routePrefix(pathname), "/quest/cos");
  assert.equal(
    assetUrl("assets/sheetshare-mobile/COS/media/" + "a".repeat(64) + ".webp", pathname),
    "/quest/cos/assets/sheetshare-mobile/COS/media/" + "a".repeat(64) + ".webp"
  );
  assert.equal(assetUrl("systems/dnd5e/icons/sword.webp", pathname), "/quest/cos/systems/dnd5e/icons/sword.webp");
});

test("keeps direct Foundry paths rooted at the Foundry origin", () => {
  const pathname = "/modules/sheetshare-mobile/viewer/index.html";
  assert.equal(routePrefix(pathname), "");
  assert.equal(assetUrl("assets/sheetshare-mobile/COS/media/a.png", pathname), "/assets/sheetshare-mobile/COS/media/a.png");
});

test("does not double-prefix already routed or absolute web assets", () => {
  const pathname = "/quest/cos/modules/sheetshare-mobile/viewer/index.html";
  assert.equal(assetUrl("/quest/cos/assets/a.png", pathname), "/quest/cos/assets/a.png");
  assert.equal(assetUrl("https://cdn.example/avatar.png", pathname), "https://cdn.example/avatar.png");
});
