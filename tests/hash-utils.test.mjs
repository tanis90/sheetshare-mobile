import assert from "node:assert/strict";
import test from "node:test";

import { digestAlgorithm, digestHex, digestTextHex, hasWebCrypto } from "../scripts/hash-utils.js";

test("uses SHA-256 vectors when WebCrypto is available", async () => {
  assert.equal(hasWebCrypto(), true);
  assert.equal(digestAlgorithm(), "sha256");
  assert.equal(await digestTextHex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(await digestHex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("falls back to dual-lane FNV-1a when WebCrypto is missing", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  assert.ok(original, "Node exposes a global crypto property");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    assert.equal(hasWebCrypto(), false);
    assert.equal(digestAlgorithm(), "fnv1a64");
    assert.match(await digestTextHex("abc"), /^[a-f0-9]{16}$/);
    assert.match(await digestHex(new Uint8Array([1, 2, 3])), /^[a-f0-9]{16}$/);
    assert.notEqual(await digestTextHex("abc"), await digestTextHex("abd"));
    assert.notEqual(await digestTextHex(""), await digestTextHex("a"));
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});

test("FNV fallback digests are stable across calls and encodings", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    assert.equal(await digestTextHex("foundry"), await digestTextHex("foundry"));
    assert.equal(await digestTextHex(null), await digestTextHex(""));
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
