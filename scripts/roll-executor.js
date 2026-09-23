const MODULE_ID = "sheetshare-mobile";

/**
 * dnd5e's roll methods changed shape across versions: older versions
 * take (abilityKey, options), while dnd5e v4+ takes a config object
 * like ({ ability: key }, dialogConfig, messageConfig). Rather than
 * guess one shape, this tries several candidates in order (newest
 * first) and keeps the last real error if every attempt fails, so it
 * surfaces something actionable instead of a generic "not found".
 */
async function tryCallShapes(target, shapes) {
  let lastError = null;
  for (const shape of shapes) {
    if (typeof target?.[shape.method] !== "function") continue;
    try {
      const returnValue = await target[shape.method](...shape.args);
      return { method: shape.method, args: shape.args, returnValue };
    } catch (error) {
      lastError = error;
      console.warn(`${MODULE_ID} | Roll: ${shape.method}() failed with args`, shape.args, error);
    }
  }
  if (lastError) throw lastError;
  return null;
}

/**
 * Roll methods may return a single Roll, an array of Rolls, a chat
 * message, or nothing at all depending on dnd5e version and config.
 * This pulls out a usable total (and crit/fumble, when the dnd5e D20Roll
 * class exposes them) wherever it can.
 */
function extractRollInfo(returnValue) {
  if (!returnValue) return {};
  const rolls = (Array.isArray(returnValue) ? returnValue : [returnValue])
    .filter(entry => entry && typeof entry.total === "number");
  if (!rolls.length) return {};
  return {
    total: rolls.reduce((sum, roll) => sum + roll.total, 0),
    critical: rolls.some(roll => roll.isCritical === true),
    fumble: rolls.some(roll => roll.isFumble === true)
  };
}

/**
 * Dice So Nice normally animates rolls on its own by detecting newly
 * created chat messages - but that detection depends on internal
 * heuristics (message.isRoll, message.rolls containing real dice terms,
 * visibility settings, etc.) that dnd5e's config-object roll API
 * doesn't always satisfy the way DSN expects, and it silently just
 * doesn't animate when that happens. Rather than depend on that, this
 * explicitly calls DSN's own public showForRoll() API with the actual
 * Roll object(s) we already have, which sidesteps that detection
 * entirely. This is a no-op if Dice So Nice isn't installed/active.
 */
async function showDiceForRolls(returnValue) {
  console.log(`${MODULE_ID} | showDiceForRolls received:`, returnValue);
  if (!game.dice3d) {
    console.log(`${MODULE_ID} | game.dice3d is not present - Dice So Nice not active from this script's perspective.`);
    return;
  }
  const entries = Array.isArray(returnValue) ? returnValue : [returnValue];
  console.log(`${MODULE_ID} | Candidate entries:`, entries.map(entry => ({
    value: entry,
    isRollInstance: entry instanceof Roll,
    ctorName: entry?.constructor?.name,
    hasTotal: typeof entry?.total === "number",
    hasTerms: Array.isArray(entry?.terms)
  })));
  const rolls = entries.filter(entry => entry instanceof Roll);
  if (!rolls.length) {
    console.log(`${MODULE_ID} | No Roll instances found in returnValue - nothing to show via showForRoll.`);
    return;
  }
  for (const roll of rolls) {
    try {
      console.log(`${MODULE_ID} | Calling game.dice3d.showForRoll for`, roll);
      await game.dice3d.showForRoll(roll, game.user, true);
      console.log(`${MODULE_ID} | showForRoll resolved for`, roll);
    } catch (error) {
      console.warn(`${MODULE_ID} | Dice So Nice showForRoll failed`, error);
    }
  }
}

async function finalizeRollResult(method, returnValue) {
  await showDiceForRolls(returnValue);
  return { ok: true, method, ...extractRollInfo(returnValue) };
}

/**
 * Some roll methods (rollInitiative in particular) don't hand back a
 * plain Roll object - they return a Combat/Combatant document instead.
 * Rather than re-roll separately for the animation (which would risk
 * showing different dice than what actually got recorded), this watches
 * for the chat message the action creates internally and pulls the
 * exact Roll(s) already attached to it.
 */
async function runAndCaptureRolls(actor, action) {
  const existingIds = new Set(game.messages.contents.map(message => message.id));
  const returnValue = await action();
  const capturedRolls = game.messages.contents
    .filter(message => !existingIds.has(message.id))
    .filter(message => message.speaker?.actor === actor.id && Array.isArray(message.rolls) && message.rolls.length)
    .flatMap(message => message.rolls);
  return { returnValue, capturedRolls };
}

/**
 * @param {object} params
 * @param {"check"|"save"|"skill"|"attack"|"damage"} params.kind
 * @param {Actor} params.actor
 * @param {string} [params.key] - ability/skill key, for check/save/skill
 * @param {string} [params.itemId] - item id, for attack/damage
 * @returns {Promise<{ok:boolean, method?:string, error?:string, total?:number, critical?:boolean, fumble?:boolean}>}
 */
export async function executeRoll({ kind, actor, key, itemId }) {
  if (!actor) return { ok: false, error: "No actor to roll for." };

  const legacyOptions = { event: null, fastForward: true };
  const emptyConfig = {};

  try {
    if (kind === "initiative") {
      let used = null;
      let capturedRolls = [];
      for (const shape of [
        { method: "rollInitiativeDialog", args: [{}] },
        { method: "rollInitiative", args: [{ createCombatant: true }] },
        { method: "rollInitiative", args: [] }
      ]) {
        if (typeof actor?.[shape.method] !== "function") continue;
        try {
          const captured = await runAndCaptureRolls(actor, () => actor[shape.method](...shape.args));
          used = shape.method;
          capturedRolls = captured.capturedRolls;
          break;
        } catch (error) {
          console.warn(`${MODULE_ID} | Roll: ${shape.method}() failed`, error);
        }
      }
      if (!used) return { ok: false, error: "No initiative roll method found on this actor/system version." };
      await showDiceForRolls(capturedRolls);
      // rollInitiative() returns the Combat document, not a plain Roll,
      // so pull the actual recorded value back from the combatant -
      // this is also the authoritative number even when a captured Roll
      // was found, since dnd5e may apply further adjustments to it.
      const combatant = game.combat?.combatants?.find(c => c.actorId === actor.id);
      const total = typeof combatant?.initiative === "number" ? combatant.initiative : undefined;
      return { ok: true, method: used, ...(total !== undefined ? { total } : {}) };
    }
    if (kind === "check") {
      const used = await tryCallShapes(actor, [
        { method: "rollAbilityCheck", args: [{ ability: key }, emptyConfig, emptyConfig] },
        { method: "rollAbilityTest", args: [{ ability: key }, emptyConfig, emptyConfig] },
        { method: "rollAbilityTest", args: [key, legacyOptions] },
        { method: "rollAbilityCheck", args: [key, legacyOptions] }
      ]);
      return used ? await finalizeRollResult(used.method, used.returnValue) : { ok: false, error: "No ability check roll method found on this actor/system version." };
    }
    if (kind === "save") {
      const used = await tryCallShapes(actor, [
        { method: "rollSavingThrow", args: [{ ability: key }, emptyConfig, emptyConfig] },
        { method: "rollAbilitySave", args: [{ ability: key }, emptyConfig, emptyConfig] },
        { method: "rollSavingThrow", args: [key, legacyOptions] },
        { method: "rollAbilitySave", args: [key, legacyOptions] }
      ]);
      return used ? await finalizeRollResult(used.method, used.returnValue) : { ok: false, error: "No saving throw roll method found on this actor/system version." };
    }
    if (kind === "skill") {
      const used = await tryCallShapes(actor, [
        { method: "rollSkill", args: [{ skill: key }, emptyConfig, emptyConfig] },
        { method: "rollSkill", args: [key, legacyOptions] }
      ]);
      return used ? await finalizeRollResult(used.method, used.returnValue) : { ok: false, error: "No skill roll method found on this actor/system version." };
    }
    if (kind === "use") {
      const item = actor.items.get(itemId);
      if (!item) return { ok: false, error: `Item not found on actor: ${itemId}` };
      const used = await tryCallShapes(item, [
        { method: "use", args: [emptyConfig, emptyConfig, emptyConfig] },
        { method: "use", args: [{}, { event: null }] },
        { method: "roll", args: [legacyOptions] }
      ]);
      return used ? await finalizeRollResult(used.method, used.returnValue) : { ok: false, error: "No use/cast method found on this item/system version." };
    }
    if (kind === "attack" || kind === "damage") {
      const item = actor.items.get(itemId);
      if (!item) return { ok: false, error: `Item not found on actor: ${itemId}` };

      // dnd5e v4+ moved attack/damage rolls onto per-item "Activities"
      // rather than the item itself. If any exist, try those first.
      const activities = item.system?.activities ? Array.from(item.system.activities) : [];
      const activityMethod = kind === "attack" ? "rollAttack" : "rollDamage";
      const matchingActivity = activities.find(activity => typeof activity?.[activityMethod] === "function");

      const shapes = [];
      if (matchingActivity) {
        shapes.push({ method: activityMethod, args: [emptyConfig, emptyConfig, emptyConfig], target: matchingActivity });
      }
      shapes.push(
        { method: kind === "attack" ? "rollAttack" : "rollDamage", args: [emptyConfig, emptyConfig, emptyConfig], target: item },
        { method: kind === "attack" ? "rollAttack" : "rollDamage", args: [legacyOptions], target: item }
      );

      let used = null;
      let returnValue = null;
      let lastError = null;
      for (const shape of shapes) {
        if (typeof shape.target?.[shape.method] !== "function") continue;
        try {
          returnValue = await shape.target[shape.method](...shape.args);
          used = shape.method;
          break;
        } catch (error) {
          lastError = error;
          console.warn(`${MODULE_ID} | Roll: ${shape.method}() failed`, error);
        }
      }
      if (!used && typeof item.use === "function") {
        try {
          returnValue = await item.use(emptyConfig, emptyConfig, emptyConfig);
          used = "use";
        } catch (error) {
          lastError = error;
          console.warn(`${MODULE_ID} | Roll: item.use() failed`, error);
        }
      }
      if (used) return await finalizeRollResult(used, returnValue);
      if (lastError) throw lastError;
      return { ok: false, error: `No ${kind} roll method found on this item/system version.` };
    }
    return { ok: false, error: `Unknown roll kind: ${kind}` };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}
