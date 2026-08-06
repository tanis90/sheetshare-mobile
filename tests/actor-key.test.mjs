import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERATED_ACTOR_KEY_PATTERN,
  MAX_ACTOR_KEY_LENGTH,
  buildActorKeyBase,
  isLegacyChineseFallbackKey,
  normalizeActorKeyPart,
  resolveActorKey
} from "../scripts/actor-key.js";

function makeActor(id, name, key) {
  const publish = key === undefined ? {} : { key };
  return {
    id,
    name,
    type: "character",
    flags: { "sheetshare-mobile": { publish } },
    getFlag(moduleId, flag) {
      return this.flags[moduleId]?.[flag];
    }
  };
}

function storeKey(actor, key) {
  actor.flags["sheetshare-mobile"].publish.key = key;
}

test("keeps Chinese names readable in a world-prefixed key", () => {
  assert.equal(normalizeActorKeyPart(" DragonLance "), "dragonlance");
  assert.equal(buildActorKeyBase("DragonLance", "黎安娜·晨盾"), "dragonlance-黎安娜-晨盾");
});

test("uses NFC and limits output to the safe Unicode alphabet", () => {
  assert.equal(normalizeActorKeyPart("E\u0301owyn / 盾卫✨"), "éowyn-盾卫");
  assert.equal(normalizeActorKeyPart("moon_knight"), "moon_knight");
  assert.match(buildActorKeyBase("龙枪", "Éowyn_盾卫"), GENERATED_ACTOR_KEY_PATTERN);
});

test("preserves an existing explicit key exactly", () => {
  const actor = makeActor("Actor00000000001", "旧名字", "COS-Wizard_Custom");
  assert.equal(resolveActorKey(actor, { worldId: "dragonlance", actors: [actor] }), "COS-Wizard_Custom");
});

test("migrates only the legacy character fallback assigned to pure-Chinese names", () => {
  const chineseActor = makeActor("Actor00000000002", "黎安娜·晨盾", "character");
  const latinActor = makeActor("Actor00000000003", "Wizard", "character");

  assert.equal(isLegacyChineseFallbackKey("character", chineseActor.name), true);
  assert.equal(resolveActorKey(chineseActor, { worldId: "dragonlance", actors: [chineseActor] }), "dragonlance-黎安娜-晨盾");
  assert.equal(resolveActorKey(latinActor, { worldId: "dragonlance", actors: [latinActor] }), "character");
});

test("remains stable after migration is persisted, even after rename or world changes", () => {
  const actor = makeActor("Actor00000000004", "黎安娜·晨盾", "character");
  const key = resolveActorKey(actor, { worldId: "dragonlance", actors: [actor] });
  storeKey(actor, key);
  actor.name = "黎安娜·银盾";

  assert.equal(resolveActorKey(actor, { worldId: "cos", actors: [actor] }), key);
});

test("adds a short actor-id only after another actor claims the readable key", () => {
  const first = makeActor("FirstActor000001", "黎安娜·晨盾");
  const second = makeActor("SecondActor00002", "黎安娜·晨盾");
  const firstKey = resolveActorKey(first, { worldId: "dragonlance", actors: [first, second] });
  storeKey(first, firstKey);
  const secondKey = resolveActorKey(second, { worldId: "dragonlance", actors: [first, second] });

  assert.equal(firstKey, "dragonlance-黎安娜-晨盾");
  assert.equal(secondKey, "dragonlance-黎安娜-晨盾-secondac");
});

test("extends the actor-id suffix when its short form is occupied", () => {
  const baseOwner = makeActor("BaseOwner0000001", "同名角色", "dragonlance-同名角色");
  const shortIdOwner = makeActor("OtherActor000001", "其他角色", "dragonlance-同名角色-abcdefgh");
  const actor = makeActor("abcdefghZ1234567", "同名角色");

  assert.equal(
    resolveActorKey(actor, { worldId: "dragonlance", actors: [baseOwner, shortIdOwner, actor] }),
    "dragonlance-同名角色-abcdefghz"
  );
});

test("generated base and collision keys stay within 128 Unicode characters", () => {
  const actor = makeActor("LongActor0000001", "龙".repeat(180));
  const base = resolveActorKey(actor, { worldId: "dragonlance", actors: [actor] });
  const owner = makeActor("OwnerActor000001", "owner", base);
  const collision = resolveActorKey(actor, { worldId: "dragonlance", actors: [owner, actor] });

  assert.ok(Array.from(base).length <= MAX_ACTOR_KEY_LENGTH);
  assert.ok(Array.from(collision).length <= MAX_ACTOR_KEY_LENGTH);
  assert.match(base, GENERATED_ACTOR_KEY_PATTERN);
  assert.match(collision, GENERATED_ACTOR_KEY_PATTERN);
});

test("reports a collision clearly when the actor has no stable id", () => {
  const owner = makeActor("OwnerActor000002", "无编号角色", "dragonlance-无编号角色");
  const actor = makeActor("", "无编号角色");
  assert.throws(
    () => resolveActorKey(actor, { worldId: "dragonlance", actors: [owner, actor] }),
    /without an actor id/
  );
});

test("does not expose snapshot freshness in the player viewer", async () => {
  const [viewerHtml, viewerApp] = await Promise.all([
    readFile(new URL("../viewer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../viewer/assets/app.js", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(viewerHtml, /formatUpdated|selected\?\.exportedAt/);
  assert.doesNotMatch(viewerApp, /formatUpdated\s*\(|minutesAgo|hoursAgo|justNow|notUpdated/);
});
