import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_PORTRAIT_BYTES,
  assertPortraitSize,
  assertUniquePublishedIdentities,
  buildPortraitPublicPath,
  detectSafeImageType
} from "../scripts/publish-safety.js";

test("accepts unique published identities", () => {
  const entries = [
    { actorId: "A", name: "Alverin", key: "cos-alverin", slug: "aa11" },
    { actorId: "B", name: "Grace", key: "cos-grace", slug: "bb22" }
  ];
  assert.equal(assertUniquePublishedIdentities(entries), entries);
});

test("fails safe on duplicate keys or slugs before an index can be built", () => {
  assert.throws(() => assertUniquePublishedIdentities([
    { actorId: "A", name: "真角色", key: "COS-Grace", slug: "aa11" },
    { actorId: "B", name: "QA clone", key: "cos-grace", slug: "bb22" }
  ]), /duplicate key.*真角色.*QA clone/i);

  assert.throws(() => assertUniquePublishedIdentities([
    { actorId: "A", name: "真角色", key: "cos-grace", slug: "ABCDEF" },
    { actorId: "B", name: "QA clone", key: "cos-qa", slug: "abcdef" }
  ]), /duplicate slug/i);
});

test("builds the exact world-scoped portrait schema", () => {
  const digest = "a".repeat(64);
  assert.equal(
    buildPortraitPublicPath("COS 世界", digest, "png"),
    `assets/sheetshare-mobile/COS%20%E4%B8%96%E7%95%8C/media/${digest}.png`
  );
  assert.throws(() => buildPortraitPublicPath("COS", digest, "svg"), /unsupported/i);
  assert.throws(() => buildPortraitPublicPath("COS", "abc", "png"), /SHA-256/i);
});

test("allows only signature-verified raster portrait formats", () => {
  assert.equal(detectSafeImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).extension, "png");
  assert.equal(detectSafeImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])).extension, "jpg");
  assert.equal(detectSafeImageType(new TextEncoder().encode("GIF89a")).extension, "gif");
  assert.equal(detectSafeImageType(new TextEncoder().encode("RIFF1234WEBP")).extension, "webp");
  assert.equal(detectSafeImageType(new TextEncoder().encode("<svg></svg>")), null);
});

test("enforces the portrait byte limit", () => {
  assert.equal(assertPortraitSize(MAX_PORTRAIT_BYTES), MAX_PORTRAIT_BYTES);
  assert.throws(() => assertPortraitSize(MAX_PORTRAIT_BYTES + 1), /safety limit/i);
});

test("runtime wires clone cleanup, ready refresh, and mirrored portrait fields", async () => {
  const [moduleSource, exporterSource, extractorSource] = await Promise.all([
    readFile(new URL("../scripts/module.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/snapshot-exporter.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/snapshot-extractor.js", import.meta.url), "utf8")
  ]);
  assert.match(exporterSource, /Hooks\.on\("createActor"/);
  assert.match(exporterSource, /actor\.unsetFlag\(MODULE_ID, PUBLISH_FLAG\)/);
  assert.match(moduleSource, /refreshPublishedSnapshotsOnReady\(\)\.catch/);
  assert.match(exporterSource, /assertUniquePublishedActorIdentities\(\);[\s\S]*mirrorActorPortrait\(actor\)/);
  assert.match(exporterSource, /legacyActorKeyAlias\(actor\.name\)/);
  assert.doesNotMatch(exporterSource, /\bslugify\(actor\.name\)/);
  assert.match(exporterSource, /portrait: publish\.portrait \|\| ""/);
  assert.match(extractorSource, /extractCharacterSnapshot\(actor, \{ portrait = "" \}/);
});
