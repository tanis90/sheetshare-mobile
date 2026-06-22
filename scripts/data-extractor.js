import {
  getEmbeddedImage, cleanHtml, stripHtml, signed,
  localizeAbility, localizeSkill, localizeConfig,
  formatHp, formatMovement, formatCurrency, formatResources,
  formatTraitList, formatPrice, formatUses, normalizeAttunement,
  formatRange, formatDuration, formatComponents, formatSkillProficiency,
  formatInitiative, groupBy, sortDocuments
} from "./utils.js";

export async function extractActorData(actor, labels) {
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const attributes = system.attributes ?? {};
  const abilities = system.abilities ?? {};
  const traits = system.traits ?? {};
  const currency = system.currency ?? {};
  const resources = system.resources ?? {};
  const skills = system.skills ?? {};
  const items = getActorItems(actor);
  const actorEffects = getActorEffects(actor);

  const portrait = await getEmbeddedImage(actor.img);

  const inventory = await Promise.all(
    items.filter(i => ["weapon", "equipment", "consumable", "loot", "container", "backpack"].includes(i.type))
      .sort(sortDocuments)
      .map(async item => ({
        name: item.name,
        img: await getEmbeddedImage(item.img),
        type: item.type,
        quantity: item.system?.quantity ?? 1,
        equipped: Boolean(item.system?.equipped),
        attunement: normalizeAttunement(item.system?.attunement, labels),
        rarity: item.system?.rarity || "—",
        weight: item.system?.weight ?? "—",
        price: formatPrice(item.system?.price),
        activation: item.system?.activation?.type || "",
        uses: formatUses(item.system?.uses),
        description: cleanHtml(item.system?.description?.value || item.system?.description || "")
      }))
  );

  const featureItems = await Promise.all(
    items.filter(i => i.type === "feat")
      .sort(sortDocuments)
      .map(async item => ({
        name: item.name,
        img: await getEmbeddedImage(item.img),
        type: item.type,
        source: item.system?.source?.label || "",
        uses: formatUses(item.system?.uses),
        activation: item.system?.activation?.type || "",
        description: cleanHtml(item.system?.description?.value || item.system?.description || "")
      }))
  );

  const spells = await Promise.all(
    items.filter(i => i.type === "spell")
      .sort((a, b) => {
        const levelDiff = (a.system?.level ?? 0) - (b.system?.level ?? 0);
        if (levelDiff !== 0) return levelDiff;
        return a.name.localeCompare(b.name, game.i18n.lang);
      })
      .map(async item => ({
        name: item.name,
        img: await getEmbeddedImage(item.img),
        level: item.system?.level ?? 0,
        school: localizeConfig(item.system?.school, CONFIG.DND5E?.spellSchools),
        preparation: item.system?.preparation?.mode || "",
        prepared: Boolean(item.system?.preparation?.prepared),
        ritual: Boolean(item.system?.properties?.ritual),
        concentration: Boolean(item.system?.properties?.concentration),
        activation: item.system?.activation?.type || "",
        range: formatRange(item.system?.range),
        target: formatTarget(item.system?.target),
        duration: formatDuration(item.system?.duration),
        components: formatComponents(item.system?.properties, item.system?.materials),
        description: cleanHtml(item.system?.description?.value || item.system?.description || "")
      }))
  );

  const toolItems = await Promise.all(
    items.filter(i => i.type === "tool")
      .sort(sortDocuments)
      .map(async item => ({
        name: item.name,
        img: await getEmbeddedImage(item.img),
        ability: localizeAbility(item.system?.ability),
        proficient: item.system?.proficient ?? item.system?.proficiency ?? 0,
        bonus: item.system?.bonus ?? item.system?.mod ?? "",
        description: cleanHtml(item.system?.description?.value || item.system?.description || "")
      }))
  );

  const skillEntries = Object.entries(skills)
    .map(([key, value]) => ({
      key,
      label: localizeSkill(key),
      ability: localizeAbility(value?.ability),
      mod: signed(resolveSkillMod(value, abilities)),
      passive: resolvePassiveSkill(key, value, abilities),
      proficiency: formatSkillProficiency(value?.value, labels)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

  const passiveEffects = await extractPassiveEffects(actor, items);

  const featureGroups = groupBy(featureItems, item => {
    const map = { feat: labels?.Features || "Features" };
    return map[item.type] ?? capitalize(item.type);
  });
  const spellGroups = groupBy(spells, spell =>
    spell.level === 0
      ? (labels?.Cantrips || "Cantrips")
      : (labels?.SpellLevel?.replace("{level}", spell.level) || `Level ${spell.level}`)
  );

  const classes = items.filter(i => i.type === "class").sort(sortDocuments);
  const subclasses = items.filter(i => i.type === "subclass").sort(sortDocuments);
  const speciesItem = items.filter(i => i.type === "race" || i.type === "ancestry").sort(sortDocuments)[0] ?? null;
  const backgroundItem = items.filter(i => i.type === "background").sort(sortDocuments)[0] ?? null;

  const featureSummary = {
    species: await buildSummaryCard(speciesItem, details.race || details.species || details.origin?.species || "—"),
    background: await buildSummaryCard(backgroundItem, details.background || details.origin?.background || "—"),
    class: await buildSummaryCollectionCard(classes, summarizeClasses(actor)),
    subclass: await buildSummaryCollectionCard(subclasses, subclasses.map(s => s.name).join(" / ") || "—")
  };

  const biography = buildBiographyData(system);

  const spellSlots = [];
  for (let level = 1; level <= 9; level++) {
    const slot = system.spells?.[`spell${level}`];
    if (slot && (slot.max > 0 || slot.value > 0)) {
      spellSlots.push({ level, max: slot.max ?? 0, used: slot.value ?? 0 });
    }
  }

  return {
    exportedAt: new Date().toLocaleString(),
    portrait,
    actorName: actor.name,
    header: {
      race: details.race || details.species || details.origin?.species || "—",
      classes: summarizeClasses(actor),
      background: details.background || details.origin?.background || "—",
      alignment: details.alignment || "—",
      level: summarizeLevel(actor),
      xp: details.xp?.value ?? "—",
      prof: signed(attributes.prof ?? 0),
      ac: attributes.ac?.value ?? attributes.ac ?? "—",
      hp: formatHp(attributes.hp),
      speed: formatMovement(attributes.movement, labels),
      initiative: formatInitiative(attributes.init),
      spellcasting: localizeAbility(attributes.spellcasting),
      passivePerception: resolvePassivePerception(skills, abilities)
    },
    details: {
      inspiration: attributes.inspiration ? (labels?.Yes || "Yes") : (labels?.No || "No"),
      exhaustion: attributes.exhaustion ?? 0,
      senses: flattenObjectValues(traits.senses),
      languages: formatTraitList(traits.languages, CONFIG.DND5E?.languages),
      resistances: formatTraitList(traits.dr, CONFIG.DND5E?.damageTypes),
      immunities: formatTraitList(traits.di, CONFIG.DND5E?.damageTypes),
      vulnerabilities: formatTraitList(traits.dv, CONFIG.DND5E?.damageTypes),
      conditionImmunities: formatTraitList(traits.ci, CONFIG.DND5E?.conditionTypes),
      currency: formatCurrency(currency),
      resources: formatResources(resources, labels),
      deathSaves: {
        successes: attributes.death?.success ?? 0,
        failures: attributes.death?.failure ?? 0
      },
      abilities: Object.entries(abilities).map(([key, value]) => ({
        key: key.toUpperCase(),
        label: localizeAbility(key),
        value: value?.value ?? "—",
        mod: signed(value?.mod ?? 0),
        save: signed(resolveAbilitySave(value, attributes.prof))
      }))
    },
    skills: skillEntries,
    tools: toolItems,
    inventory,
    featureGroups,
    featureSummary,
    spellGroups,
    spellSlots,
    spellStats: {
      attack: signed(attributes.spell?.attack ?? 0),
      dc: attributes.spell?.dc ?? "—",
      ability: localizeAbility(attributes.spellcasting)
    },
    effects: passiveEffects.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)),
    biography
  };
}

function getActorItems(actor) {
  if (!actor?.items) return [];
  if (Array.isArray(actor.items)) return actor.items;
  if (Array.isArray(actor.items.contents)) return actor.items.contents;
  return Array.from(actor.items);
}

function getActorEffects(actor) {
  if (!actor?.effects) return [];
  if (Array.isArray(actor.effects)) return actor.effects;
  if (Array.isArray(actor.effects.contents)) return actor.effects.contents;
  return Array.from(actor.effects);
}

function resolveSkillMod(skill, abilities) {
  const value = Number(skill?.total ?? skill?.mod ?? skill?.passiveBonus);
  if (Number.isFinite(value)) return value;
  const abil = abilities?.[skill?.ability ?? ""];
  return Number(abil?.mod ?? 0);
}

function resolvePassiveSkill(key, skill, abilities) {
  const passive = Number(skill?.passive);
  if (Number.isFinite(passive) && passive > 0) return passive;
  return 10 + Number(resolveSkillMod(skill, abilities) || 0);
}

function resolvePassivePerception(skills, abilities) {
  return resolvePassiveSkill("prc", skills?.prc, abilities);
}

function resolveAbilitySave(ability, profValue = 0) {
  const save = Number(ability?.save);
  if (Number.isFinite(save)) return save;
  const proficient = Number(ability?.proficient ?? ability?.saveProf ?? 0);
  const mod = Number(ability?.mod ?? 0);
  const prof = Number(profValue ?? 0);
  if (Number.isFinite(mod)) return mod + (proficient ? prof : 0);
  return 0;
}

function summarizeClasses(actor) {
  const classes = getActorItems(actor).filter(i => i.type === "class");
  if (!classes.length) return actor.system?.details?.class || "—";
  return classes.map(c => `${c.name} ${c.system?.levels ?? ""}`.trim()).join(" / ");
}

function summarizeLevel(actor) {
  const classes = getActorItems(actor).filter(i => i.type === "class");
  if (!classes.length) return actor.system?.details?.level ?? "—";
  return classes.reduce((sum, c) => sum + Number(c.system?.levels ?? 0), 0) || actor.system?.details?.level || "—";
}

function flattenObjectValues(obj) {
  if (!obj || typeof obj !== "object") return obj || "—";
  return Object.entries(obj)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([key, value]) => `${capitalize(key)} ${value}`)
    .join(", ") || "—";
}

function capitalize(value) {
  if (!value && value !== 0) return "—";
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function extractPassiveEffects(actor, items) {
  const effects = [];
  const actorEffects = getActorEffects(actor);

  for (const effect of actorEffects.filter(isPassiveEffect)) {
    effects.push({
      name: effect.name,
      img: await getEmbeddedImage(effect.img || effect.icon),
      source: effect.parent?.name || actor.name,
      description: cleanHtml(effect.description || effect.changes?.map(c => `${c.key}: ${c.value}`).join(" / ") || "")
    });
  }

  const passiveSourceTypes = new Set(["feat", "class", "subclass", "background", "race", "ancestry", "equipment", "weapon"]);
  for (const item of items.filter(i => passiveSourceTypes.has(i.type))) {
    const itemEffects = item.effects ? (Array.isArray(item.effects) ? item.effects : Array.from(item.effects)) : [];
    for (const effect of itemEffects.filter(isPassiveEffect)) {
      effects.push({
        name: effect.name || item.name,
        img: await getEmbeddedImage(effect.img || effect.icon || item.img),
        source: item.name,
        description: cleanHtml(effect.description || effect.changes?.map(c => `${c.key}: ${c.value}`).join(" / ") || item.system?.description?.value || "")
      });
    }
  }

  return [...new Map(effects.map(e => [`${e.name}::${e.source}`, e])).values()];
}

function isPassiveEffect(effect) {
  if (!effect || effect.disabled) return false;
  const statuses = effect.statuses;
  const statusCount = statuses instanceof Set ? statuses.size : Array.isArray(statuses) ? statuses.length : 0;
  if (statusCount > 0) return false;
  const keyText = (effect.changes ?? []).map(c => `${c.key ?? ""} ${c.value ?? ""}`.toLowerCase()).join(" ");
  if (["statuses", "condition", "specialStatus", "death", "concentration", "exhaustion"].some(h => keyText.includes(h.toLowerCase()))) return false;
  const parentType = effect.parent?.type;
  if (parentType && ["spell", "consumable", "loot", "tool", "backpack", "container"].includes(parentType)) return false;
  return true;
}

async function buildSummaryCard(item, fallbackName) {
  return {
    name: fallbackName || item?.name || "—",
    img: item ? await getEmbeddedImage(item.img) : "",
    description: cleanHtml(item?.system?.description?.value || "")
  };
}

async function buildSummaryCollectionCard(items, fallbackName) {
  const docs = Array.isArray(items) ? items : [];
  const name = docs.length ? docs.map(i => i.name).join(" / ") : (fallbackName || "—");
  const description = docs.map(i => cleanHtml(i.system?.description?.value || "")).filter(Boolean).join("\n\n");
  return {
    name,
    img: docs.length ? await getEmbeddedImage(docs[0]?.img) : "",
    description
  };
}

function buildBiographyData(system) {
  const details = system.details ?? {};
  const physicalPairs = [
    ["CN5E.Labels.Age", details.age],
    ["CN5E.Labels.Height", details.height],
    ["CN5E.Labels.Weight", details.weight],
    ["CN5E.Labels.Eyes", details.eyes],
    ["CN5E.Labels.Skin", details.skin],
    ["CN5E.Labels.Hair", details.hair],
    ["CN5E.Labels.Gender", details.gender],
    ["CN5E.Labels.Faith", details.faith],
    ["CN5E.Labels.Appearance", cleanHtml(details.appearance)]
  ].filter(([, value]) => hasContent(value));

  const personalityPairs = [
    ["CN5E.Labels.PersonalityTraits", details.trait],
    ["CN5E.Labels.Ideals", details.ideal],
    ["CN5E.Labels.Bonds", details.bond],
    ["CN5E.Labels.Flaws", details.flaw]
  ].filter(([, value]) => hasContent(value));

  const backstory = cleanHtml(
    details.biography?.value || details.biography || system.biography?.value || system.biography || ""
  );

  return {
    summaryFields: physicalPairs.map(([label, value]) => [label, String(value)]),
    personalityFields: personalityPairs.map(([label, value]) => [label, String(value)]),
    backstory
  };
}

function hasContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatTarget(target) {
  if (!target) return "";
  const count = target.value ?? target.count ?? "";
  const type = target.type ?? "";
  const units = target.units ?? "";
  return [count, units, type].filter(Boolean).join(" ");
}
