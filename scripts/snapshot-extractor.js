import {
  cleanHtml, escapeHtml, stripHtml, signed,
  localizeAbility, localizeSkill, localizeSpellSchool,
  localizeActivationType, localizeTargetType,
  formatTraitList, formatPrice, formatUses,
  formatRange, formatDuration, sortDocuments
} from "./utils.js";

const MODULE_ID = "sheetshare-mobile";
const SNAPSHOT_SCHEMA = "sheetshare-mobile.snapshot.v1";
const CN_TRANSLATION_MODULE_ID = "zzzz_arcane_dnd5e_cn";
const CN_TRANSLATION_PACKS = [
  "dnd5e.spells",
  "dnd5e.classfeatures",
  "dnd5e.items",
  "dnd5e.classes",
  "dnd5e.races",
  "dnd5e.subclasses",
  "dnd5e.backgrounds"
];
const UUID_LINK_PATTERN = /@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g;
let cnTranslationsPromise = null;

export async function extractCharacterSnapshot(actor) {
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const attributes = system.attributes ?? {};
  const abilities = system.abilities ?? {};
  const traits = system.traits ?? {};
  const items = getActorItems(actor);
  const translations = await loadCnTranslations();
  const builtTraits = buildTraits(traits);
  const references = createReferenceCollector(translations);

  const snapshot = {
    schema: SNAPSHOT_SCHEMA,
    exportedAt: new Date().toISOString(),
    contentHash: "",
    world: {
      id: game.world.id,
      title: game.world.title,
      systemId: game.system.id,
      systemVersion: game.system.version,
      foundryVersion: game.version
    },
    actor: {
      name: actor.name,
      type: actor.type,
      img: normalizeAssetPath(actor.img)
    },
    access: {
      enabled: true,
      publicId: getPublicId(actor),
      visibility: "password-protected-link"
    },
    summary: {
      name: actor.name,
      portrait: normalizeAssetPath(actor.img),
      species: resolveSpecies(details, items, translations),
      classes: summarizeClasses(actor, translations),
      alignment: details.alignment || "",
      level: summarizeLevel(actor),
      xp: details.xp?.value ?? "",
      proficiencyBonus: signed(attributes.prof ?? 0),
      ac: attributes.ac?.value ?? attributes.ac?.flat ?? "",
      initiative: resolveInitiative(attributes.init, abilities),
      speed: formatSummarySpeed(attributes.movement),
      attackBonus: resolvePrimaryAttackBonus(items, attributes, abilities),
      spellAttackBonus: resolveSpellAttackBonus(attributes),
      spellSaveDc: attributes.spell?.dc ?? "",
      resistances: summarizeTraitItems(builtTraits.damageResistances),
      passivePerception: resolvePassivePerception(system.skills, abilities),
      spellcastingAbility: localizeAbility(attributes.spellcasting)
    },
    resources: {
      hp: buildHp(attributes.hp),
      deathSaves: {
        successes: attributes.death?.success ?? 0,
        failures: attributes.death?.failure ?? 0
      },
      spellSlots: buildSpellSlots(system.spells),
      resources: buildLimitedResources(system.resources),
      special: buildSpecialResources(system.resources, items, translations),
      currency: buildCurrency(system.currency)
    },
    details: {
      abilities: buildAbilities(abilities, attributes.prof),
      saves: buildSaves(abilities, attributes.prof),
      skills: buildSkills(system.skills, abilities),
      traits: builtTraits,
      proficiencies: buildProficiencies(traits)
    },
    sections: {
      actions: await buildActions(items, attributes, abilities, translations, references),
      inventory: await buildInventory(items, translations, references),
      features: await buildFeatures(items, translations, references),
      spells: await buildSpells(items, attributes, translations, references),
      effects: await buildEffects(actor, references)
    },
    references: references.toSnapshot()
  };

  snapshot.contentHash = await hashSnapshot(snapshot);
  return snapshot;
}

export function buildIndexEntry(snapshot) {
  return {
    publicId: snapshot.access.publicId,
    enabled: snapshot.access.enabled,
    name: snapshot.summary.name,
    img: snapshot.summary.portrait,
    classes: snapshot.summary.classes,
    species: snapshot.summary.species,
    level: snapshot.summary.level,
    snapshotPath: `actors/${snapshot.access.publicId}.json`,
    updatedAt: snapshot.exportedAt,
    contentHash: snapshot.contentHash
  };
}

export function buildIndexDocument(entries) {
  return {
    schema: "arcane.character-sheet.index.v1",
    world: {
      id: game.world.id,
      title: game.world.title,
      systemId: game.system.id,
      systemVersion: game.system.version,
      foundryVersion: game.version
    },
    updatedAt: new Date().toISOString(),
    actors: [...entries].sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
  };
}

export function getPublicId(actor) {
  const publish = actor.getFlag?.(MODULE_ID, "publish");
  if (publish?.slug) return publish.slug;
  const name = String(actor.name || "character").trim();
  return slugify(name);
}

async function hashSnapshot(snapshot) {
  const clone = foundry.utils.deepClone(snapshot);
  delete clone.exportedAt;
  delete clone.contentHash;
  const json = stableStringify(clone);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function getActorItems(actor) {
  if (!actor?.items) return [];
  if (Array.isArray(actor.items)) return actor.items;
  if (Array.isArray(actor.items.contents)) return actor.items.contents;
  return Array.from(actor.items);
}

async function loadCnTranslations() {
  if (!isChineseFoundryLanguage()) return { bySource: new Map() };
  if (!cnTranslationsPromise) cnTranslationsPromise = loadCnTranslationsNow();
  return cnTranslationsPromise;
}

async function loadCnTranslationsNow() {
  const bySource = new Map();
  await Promise.all(CN_TRANSLATION_PACKS.map(async packId => {
    try {
      const response = await fetch(route(`modules/${CN_TRANSLATION_MODULE_ID}/compendium/${packId}.json`), {
        cache: "force-cache",
        credentials: "include"
      });
      if (!response.ok) return;
      const data = await response.json();
      for (const [entryId, entry] of Object.entries(data.entries ?? {})) {
        const normalized = normalizeTranslationEntry(entry);
        bySource.set(`${packId}.${entryId}`, normalized);
        bySource.set(`Compendium.${packId}.Item.${entryId}`, normalized);
      }
    } catch (error) {
      console.warn(`${CN_TRANSLATION_MODULE_ID} | Failed to load ${packId} translations`, error);
    }
  }));
  return { bySource };
}

function normalizeTranslationEntry(entry) {
  if (typeof entry === "string") return { name: entry, description: "" };
  return {
    name: entry?.name || "",
    description: entry?.description || ""
  };
}

function buildHp(hp = {}) {
  const value = numberOrZero(hp.value ?? hp.current);
  const max = numberOrZero(hp.max ?? hp.effectiveMax);
  const temp = numberOrZero(hp.temp);
  const tempmax = numberOrZero(hp.tempmax);
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  const tempPct = temp > 0 ? Math.max(8, Math.min(100, Math.round((temp / Math.max(max, temp)) * 100))) : 0;
  return {
    value,
    max,
    temp,
    tempmax,
    tempPct,
    formula: hp.formula || "",
    pct,
    state: value <= 0 ? "down" : pct < 35 ? "critical" : pct < 75 ? "wounded" : "healthy"
  };
}

function buildSpellSlots(spells = {}) {
  const slots = [];
  for (let level = 1; level <= 9; level++) {
    const slot = spells[`spell${level}`];
    const max = numberOrZero(slot?.max);
    const value = numberOrZero(slot?.value);
    if (!max && !value) continue;
    slots.push({
      level,
      label: spellLevelLabel(level),
      value,
      max,
      spent: Math.max(max - value, 0),
      available: value
    });
  }
  return slots;
}

function buildLimitedResources(resources = {}) {
  const labels = shortLabels();
  const labelMap = {
    primary: labels.Primary,
    secondary: labels.Secondary,
    tertiary: labels.Tertiary,
    legact: labels.LegendaryActions,
    legres: labels.LegendaryResistances
  };
  return Object.entries(resources)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({
      key,
      label: value.label || labelMap[key] || capitalize(key),
      value: numberOrZero(value.value),
      max: numberOrZero(value.max),
      sr: value.sr || undefined,
      lr: value.lr || undefined
    }))
    .filter(resource => resource.value || resource.max);
}

function buildSpecialResources(resources = {}, items = [], translations = null) {
  const fromActorResources = buildLimitedResources(resources).map(resource => ({
    id: `resource:${resource.key}`,
    name: resource.label,
    value: resource.value,
    max: resource.max,
    spent: Math.max(resource.max - resource.value, 0),
    recovery: resource.sr ? moduleLabel("ShortRest", "Short Rest") : resource.lr ? moduleLabel("LongRest", "Long Rest") : "",
    activation: "",
    img: "",
    source: "actor-resource"
  }));

  const fromFeatures = items
    .filter(item => item.type === "feat")
    .map(item => buildFeatureResource(item, translations))
    .filter(Boolean);

  return dedupeSpecialResources([...fromActorResources, ...fromFeatures]);
}

function buildFeatureResource(item, translations = null) {
  const name = translateItemName(item, translations);
  const uses = parseUses(item.system?.uses);
  const known = knownSpecialResource(name);
  if (!uses && !known) return null;

  const max = uses?.max || known?.max || 0;
  if (max <= 0) return null;

  const spent = Math.max(uses?.spent ?? 0, 0);
  const value = Math.max(max - spent, 0);
  return {
    id: `feature:${item.id}`,
    name,
    value,
    max,
    spent,
    recovery: uses?.recovery || known?.recovery || "",
    activation: formatActivityActivation(item) || formatActivation(item.system?.activation),
    img: normalizeAssetPath(item.img),
    source: resolveSource(item)
  };
}

function parseUses(uses) {
  if (!uses) return null;
  const max = numberOrZero(uses.max);
  const spent = numberOrZero(uses.spent);
  if (max <= 0 && spent <= 0) return null;
  return {
    max,
    spent,
    recovery: localizeResourceRecovery(uses.recovery?.[0]?.period || uses.recovery?.period || uses.per || "")
  };
}

function knownSpecialResource(name) {
  const text = String(name || "");
  if (!text) return null;

  const isChannelDivinity = /(^|\s)(引导神力|Channel Divinity)(\s|$)/i.test(text)
    && !/引导神力[:：]|Channel Divinity:/i.test(text);
  if (isChannelDivinity) return { max: 1, recovery: moduleLabel("ShortRest", "Short Rest") };

  return null;
}

function dedupeSpecialResources(resources) {
  const byKey = new Map();
  for (const resource of resources) {
    const key = normalizeSpecialResourceKey(resource.name);
    const current = byKey.get(key);
    if (!current || (resource.max > current.max) || (resource.value > current.value)) byKey.set(key, resource);
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function normalizeSpecialResourceKey(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function localizeResourceRecovery(period) {
  return {
    sr: moduleLabel("ShortRest", "Short Rest"),
    shortRest: moduleLabel("ShortRest", "Short Rest"),
    lr: moduleLabel("LongRest", "Long Rest"),
    longRest: moduleLabel("LongRest", "Long Rest"),
    day: moduleLabel("Day", "Day"),
    dawn: moduleLabel("Dawn", "Dawn"),
    dusk: moduleLabel("Dusk", "Dusk"),
    turnStart: moduleLabel("TurnStart", "Turn Start")
  }[period] || period || "";
}

function buildCurrency(currency = {}) {
  return {
    pp: numberOrZero(currency.pp),
    gp: numberOrZero(currency.gp),
    ep: numberOrZero(currency.ep),
    sp: numberOrZero(currency.sp),
    cp: numberOrZero(currency.cp)
  };
}

function buildAbilities(abilities = {}, prof = 0) {
  return Object.entries(abilities).map(([key, value]) => ({
    key,
    label: localizeAbility(key),
    abbr: key.toUpperCase(),
    score: value?.value ?? "",
    mod: signed(value?.mod ?? 0),
    save: signed(resolveAbilitySave(value, prof))
  }));
}

function buildSaves(abilities = {}, prof = 0) {
  return Object.entries(abilities).map(([key, value]) => ({
    key,
    label: localizeAbility(key),
    value: signed(resolveAbilitySave(value, prof)),
    proficient: Boolean(value?.proficient ?? value?.saveProf)
  }));
}

function buildSkills(skills = {}, abilities = {}) {
  return Object.entries(skills)
    .map(([key, value]) => ({
      key,
      label: localizeSkill(key),
      ability: localizeAbility(value?.ability),
      mod: signed(resolveSkillMod(value, abilities)),
      passive: resolvePassiveSkill(value, abilities),
      proficiency: normalizeSkillProficiency(value?.value),
      proficiencyLabel: formatSkillProficiency(value?.value)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function buildTraits(traits = {}) {
  return {
    languages: splitTraitList(formatTraitLabels(traits.languages, "languages", CONFIG.DND5E?.languages)),
    senses: splitTraitList(formatSenses(traits.senses)),
    damageResistances: splitTraitList(formatTraitList(traits.dr, CONFIG.DND5E?.damageTypes)),
    damageImmunities: splitTraitList(formatTraitList(traits.di, CONFIG.DND5E?.damageTypes)),
    damageVulnerabilities: splitTraitList(formatTraitList(traits.dv, CONFIG.DND5E?.damageTypes)),
    conditionImmunities: splitTraitList(formatTraitList(traits.ci, CONFIG.DND5E?.conditionTypes))
  };
}

function formatTraitLabels(trait, labelKey, dictionary = null) {
  const labels = trait?.labels?.[labelKey];
  if (Array.isArray(labels) && labels.length) {
    const values = [
      ...labels.map(label => String(label || "").trim()).filter(Boolean),
      ...customTraitLabels(trait)
    ];
    return [...new Set(values)].join(", ") || "—";
  }
  return formatTraitList(trait, dictionary);
}

function customTraitLabels(trait = {}) {
  if (Array.isArray(trait.custom)) return trait.custom.map(label => String(label || "").trim()).filter(Boolean);
  if (typeof trait.custom === "string") return trait.custom.split(/[;,]/).map(label => label.trim()).filter(Boolean);
  return [];
}

function summarizeTraitItems(items = []) {
  const values = items.map(item => String(item || "").trim()).filter(Boolean);
  if (!values.length) return "";
  if (values.length <= 2) return values.join(" / ");
  return `${values.slice(0, 2).join(" / ")} +${values.length - 2}`;
}

function buildProficiencies(traits = {}) {
  return {
    armor: splitTraitList(formatTraitList(traits.armorProf, CONFIG.DND5E?.armorProficiencies)),
    weapons: splitTraitList(formatTraitList(traits.weaponProf, CONFIG.DND5E?.weaponProficiencies)),
    tools: splitTraitList(formatTraitList(traits.toolProf, CONFIG.DND5E?.toolProficiencies))
  };
}

async function buildActions(items, attributes, abilities = {}, translations = null, references = null) {
  const weapons = await Promise.all(items
    .filter(item => item.type === "weapon")
    .sort(sortDocuments)
    .map(async item => ({
      id: item.id,
      name: translateItemName(item, translations),
      img: normalizeAssetPath(item.img),
      type: "weapon",
      activation: formatActivityActivation(item) || formatActivation(item.system?.activation),
      attackBonus: resolveAttackBonus(item, attributes, abilities),
      damage: resolveDamage(item, abilities),
      saveDc: "",
      saveAbility: "",
      range: formatRange(item.system?.range),
      uses: formatUses(item.system?.uses),
      descriptionHtml: await buildDescriptionHtml(translateItemDescription(item, translations), references)
    })));

  const features = await Promise.all(items
    .filter(item => item.type === "feat" && isActiveFeature(item))
    .sort(sortDocuments)
    .map(async item => ({
      id: item.id,
      name: translateItemName(item, translations),
      img: normalizeAssetPath(item.img),
      type: "feature",
      activation: formatActivityActivation(item) || formatActivation(item.system?.activation),
      attackBonus: "",
      damage: "",
      saveDc: resolveActivitySaveDc(item, attributes),
      saveAbility: resolveActivitySaveAbility(item),
      range: formatRange(item.system?.range),
      uses: formatUses(item.system?.uses),
      descriptionHtml: await buildDescriptionHtml(translateItemDescription(item, translations), references)
    })));

  return [...weapons, ...features];
}

async function buildInventory(items, translations = null, references = null) {
  const allowed = new Set(["weapon", "equipment", "consumable", "loot", "container", "backpack", "tool"]);
  return Promise.all(items
    .filter(item => allowed.has(item.type))
    .sort(sortDocuments)
    .map(async item => ({
      id: item.id,
      name: translateItemName(item, translations),
      img: normalizeAssetPath(item.img),
      type: item.type,
      quantity: item.system?.quantity ?? 1,
      equipped: Boolean(item.system?.equipped),
      attunement: normalizeAttunementState(item.system),
      attunementLabel: normalizeAttunementLabel(item.system),
      rarity: item.system?.rarity || "",
      weight: formatWeight(item.system?.weight),
      price: formatPrice(item.system?.price),
      uses: formatUses(item.system?.uses),
      descriptionHtml: await buildDescriptionHtml(translateItemDescription(item, translations), references)
    })));
}

async function buildFeatures(items, translations = null, references = null) {
  return Promise.all(items
    .filter(item => item.type === "feat")
    .sort(sortDocuments)
    .map(async item => ({
      id: item.id,
      name: translateItemName(item, translations),
      img: normalizeAssetPath(item.img),
      group: resolveFeatureGroup(item),
      source: resolveSource(item),
      activation: formatActivityActivation(item) || formatActivation(item.system?.activation),
      uses: formatUses(item.system?.uses),
      descriptionHtml: await buildDescriptionHtml(translateItemDescription(item, translations), references)
    })));
}

async function buildSpells(items, attributes, translations = null, references = null) {
  const spells = items
    .filter(item => item.type === "spell")
    .sort((a, b) => {
      const levelDiff = (a.system?.level ?? 0) - (b.system?.level ?? 0);
      if (levelDiff) return levelDiff;
      return translateItemName(a, translations).localeCompare(translateItemName(b, translations), game.i18n.lang);
    });
  return Promise.all(spells.map(async item => {
      const properties = getProperties(item);
      const level = numberOrZero(item.system?.level);
      return {
        id: item.id,
        name: translateItemName(item, translations),
        img: normalizeAssetPath(item.img),
        level,
        levelLabel: spellLevelLabel(level),
        school: localizeSpellSchool(item.system?.school),
        prepared: resolveSpellPrepared(item),
        ritual: properties.has("ritual"),
        concentration: properties.has("concentration"),
        activation: formatActivityActivation(item) || formatActivation(item.system?.activation),
        range: formatRange(item.system?.range),
        target: formatTarget(item.system?.target),
        duration: formatDuration(item.system?.duration),
        components: formatComponents(properties, item.system?.materials),
        attackBonus: signed(attributes.spell?.attack ?? 0),
        saveDc: attributes.spell?.dc ?? "",
        descriptionHtml: await buildDescriptionHtml(translateItemDescription(item, translations), references)
      };
    }));
}

async function buildEffects(actor, references = null) {
  const effects = actor.effects ? Array.from(actor.effects) : [];
  const visibleEffects = effects
    .filter(effect => !effect.disabled)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return Promise.all(visibleEffects.map(async effect => ({
      id: effect.id,
      name: effect.name,
      img: normalizeAssetPath(effect.img || effect.icon),
      source: effect.parent?.name || "",
      disabled: Boolean(effect.disabled),
      descriptionHtml: await buildDescriptionHtml(effect.description || "", references)
    })));
}

function resolveSpecies(details, items, translations = null) {
  const speciesItem = items.find(i => i.type === "race" || i.type === "ancestry");
  const translatedSpecies = getCnTranslation(speciesItem, translations)?.name || "";
  const rawSpecies = displayText(details.race || details.species || details.origin?.species || speciesItem?.name || "");
  return displayText(translatedSpecies || rawSpecies);
}

function summarizeClasses(actor, translations = null) {
  const classes = getActorItems(actor).filter(i => i.type === "class");
  if (!classes.length) return displayText(actor.system?.details?.class || "");
  return classes
    .sort(sortDocuments)
    .map(c => `${translateItemName(c, translations)} ${c.system?.levels ?? ""}`.trim())
    .join(" / ");
}

function summarizeLevel(actor) {
  const classes = getActorItems(actor).filter(i => i.type === "class");
  if (!classes.length) return actor.system?.details?.level ?? "";
  const level = classes.reduce((sum, c) => sum + Number(c.system?.levels ?? 0), 0);
  return level || actor.system?.details?.level || "";
}

function resolveInitiative(init, abilities = {}) {
  if (init === null || init === undefined) return "";
  if (typeof init === "number") return signed(init);
  const total = Number(init.total);
  if (Number.isFinite(total)) return signed(total);
  const abilityKey = init.ability || "dex";
  const abilityMod = Number(abilities?.[abilityKey]?.mod ?? 0);
  const bonus = Number(init.value ?? init.bonus ?? init.mod ?? 0);
  return signed(abilityMod + (Number.isFinite(bonus) ? bonus : 0));
}

function formatSummarySpeed(movement = {}) {
  if (!movement) return "";
  for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
    const value = resolveMovementNumber(movement[key]);
    if (value !== "") return String(value);
  }
  return "";
}

function resolveMovementNumber(raw) {
  if (raw === null || raw === undefined || raw === "" || raw === 0) return "";
  if (typeof raw === "object") {
    return resolveMovementNumber(raw.total ?? raw.value ?? raw.base);
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : "";
}

function resolveAbilitySave(ability, prof = 0) {
  const save = Number(ability?.save?.value ?? ability?.save);
  if (Number.isFinite(save)) return save;
  const mod = Number(ability?.mod ?? 0);
  const multiplier = Number(ability?.saveProf?.multiplier ?? ability?.proficient ?? ability?.saveProf ?? 0);
  return mod + (Number.isFinite(multiplier) ? multiplier : 0) * Number(prof ?? 0);
}

function resolveSkillMod(skill, abilities) {
  const value = Number(skill?.total ?? skill?.mod);
  if (Number.isFinite(value)) return value;
  const ability = abilities?.[skill?.ability ?? ""];
  return Number(ability?.mod ?? 0);
}

function resolvePassiveSkill(skill, abilities) {
  const passive = Number(skill?.passive);
  if (Number.isFinite(passive) && passive > 0) return passive;
  return 10 + Number(resolveSkillMod(skill, abilities) || 0);
}

function resolvePassivePerception(skills, abilities) {
  return resolvePassiveSkill(skills?.prc, abilities);
}

function normalizeSkillProficiency(value) {
  const numeric = Number(value ?? 0);
  if (numeric >= 2) return "expertise";
  if (numeric >= 1) return "proficient";
  if (numeric > 0) return "half";
  return "none";
}

function formatSkillProficiency(value) {
  const key = normalizeSkillProficiency(value);
  return {
    none: moduleLabel("NoProficiency", "No Proficiency"),
    half: moduleLabel("HalfProficient", "Half Proficient"),
    proficient: moduleLabel("Proficient", "Proficient"),
    expertise: moduleLabel("Expertise", "Expertise")
  }[key];
}

function formatSenses(senses) {
  if (!senses || typeof senses !== "object") return "";
  const labels = shortLabels();
  return Object.entries(senses)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${labels[key] || capitalize(key)} ${value}ft`)
    .join(", ");
}

function splitTraitList(value) {
  if (!value || value === "—") return [];
  return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

function translateItemName(item, translations) {
  return getCnTranslation(item, translations)?.name || item.name || "";
}

function translateItemDescription(item, translations) {
  return getCnTranslation(item, translations)?.description || getItemDescription(item);
}

function getItemDescription(item) {
  const description = item.system?.description;
  if (typeof description === "string") return description;
  return description?.value || description?.chat || "";
}

function getCnTranslation(item, translations) {
  if (!item || !translations?.bySource) return null;
  for (const key of getTranslationKeys(item)) {
    const entry = translations.bySource.get(key);
    if (entry?.name || entry?.description) return entry;
  }
  return null;
}

function getTranslationKeys(item) {
  const arcaneFlags = item.flags?.["arcane-dnd5e-2014-automation"] ?? {};
  const sourcePack = String(arcaneFlags.sourcePack || "").trim();
  const sourceValues = [];
  collectSourceValues(arcaneFlags.sourceUuid, sourceValues);
  collectSourceValues(arcaneFlags.sourceId, sourceValues);
  collectSourceValues(arcaneFlags.sourceItem, sourceValues);
  collectSourceValues(arcaneFlags.compendiumSource, sourceValues);
  collectSourceValues(item.flags?.dnd5e?.sourceId, sourceValues);
  collectSourceValues(item.flags?.core?.sourceId, sourceValues);
  collectSourceValues(item._stats?.compendiumSource, sourceValues);
  collectSourceValues(item.system?.sourceItem, sourceValues);
  collectSourceValues(item.system?.source?.uuid, sourceValues);

  const keys = [];
  for (const value of sourceValues) {
    const parsed = parseCompendiumSource(value);
    if (parsed) {
      keys.push(`${parsed.pack}.${parsed.id}`);
      keys.push(`Compendium.${parsed.pack}.Item.${parsed.id}`);
      if (sourcePack) keys.push(`${sourcePack}.${parsed.id}`);
      continue;
    }

    if (sourcePack && looksLikeDocumentId(value)) {
      keys.push(`${sourcePack}.${normalizeSourceId(value)}`);
    }
  }

  return [...new Set(keys)];
}

function collectSourceValues(value, out) {
  if (!value) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => collectSourceValues(entry, out));
    return;
  }
  if (typeof value === "object") {
    for (const key of ["uuid", "id", "sourceId", "sourceUuid", "compendiumSource"]) {
      collectSourceValues(value[key], out);
    }
  }
}

function parseCompendiumSource(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const uuid = text.match(/Compendium\.([^.\]\s]+(?:\.[^.\]\s]+)+)\.(?:Item|Actor)\.([^.\]\s}]+)/);
  if (uuid) return { pack: uuid[1], id: normalizeSourceId(uuid[2]) };

  const dotted = text.match(/^([^.\s]+(?:\.[^.\s]+)+)\.([^.\s]+)$/);
  if (dotted && CN_TRANSLATION_PACKS.includes(dotted[1])) {
    return { pack: dotted[1], id: normalizeSourceId(dotted[2]) };
  }

  return null;
}

function looksLikeDocumentId(value) {
  return /^[A-Za-z0-9_-]{8,}$/.test(String(value ?? "").trim());
}

function normalizeSourceId(value) {
  return String(value ?? "").trim().replace(/[\]}),;]+$/g, "");
}

function localizeDistanceUnit(unit) {
  if (!unit) return "";
  if (!isChineseFoundryLanguage()) return unit;
  return {
    self: "自身",
    touch: "触及",
    ft: "尺",
    feet: "尺",
    mi: "里",
    mile: "里",
    miles: "里",
    spec: "特殊",
    any: "任意"
  }[unit] || unit;
}

function normalizeAssetPath(value) {
  if (!value) return "";
  return String(value).replace(/^\/+/, "");
}

function normalizeAttunementState(system = {}) {
  if (system.attuned) return "attuned";
  const value = system.attunement;
  if (value === 2 || value === "attuned") return "attuned";
  if (value === 1 || value === "required") return "required";
  if (value === 0 || value === "" || value === "none" || value === null || value === undefined) return "none";
  return "unknown";
}

function normalizeAttunementLabel(system = {}) {
  return {
    none: moduleLabel("AttunementNo", "No"),
    required: moduleLabel("AttunementRequired", "Required"),
    attuned: moduleLabel("Attuned", "Attuned"),
    unknown: moduleLabel("AttunementUnknown", "Unknown")
  }[normalizeAttunementState(system)];
}

function formatWeight(weight) {
  if (weight === null || weight === undefined || weight === "") return "";
  if (typeof weight === "object") return [weight.value, weight.units].filter(Boolean).join(" ");
  return String(weight);
}

function resolveFeatureGroup(item) {
  const sourceItem = item.system?.sourceItem || item.flags?.dnd5e?.sourceId || "";
  if (String(sourceItem).includes("class")) return "class";
  if (String(sourceItem).includes("race")) return "race";
  if (String(sourceItem).includes("background")) return "background";
  return item.system?.type?.value || "feat";
}

function resolveSource(item) {
  const source = item.system?.source;
  if (typeof source === "string") return source;
  return source?.custom || source?.book || source?.label || "";
}

function getProperties(item) {
  const raw = item.system?.properties;
  if (raw instanceof Set) return raw;
  if (Array.isArray(raw)) return new Set(raw);
  if (raw && typeof raw === "object") {
    return new Set(Object.entries(raw).filter(([, active]) => Boolean(active)).map(([key]) => key));
  }
  return new Set();
}

function resolveSpellPrepared(item) {
  if (typeof item.system?.prepared === "boolean") return item.system.prepared;
  if (Number(item.system?.prepared) > 0) return true;
  if (typeof item.system?.preparation?.prepared === "boolean") return item.system.preparation.prepared;
  const method = item.system?.method || item.system?.preparation?.mode;
  return method && method !== "spell" ? true : false;
}

function formatComponents(properties, materials) {
  const labels = [];
  if (properties.has("vocal")) labels.push("V");
  if (properties.has("somatic")) labels.push("S");
  if (properties.has("material")) labels.push("M");
  if (materials?.value) labels.push(`M: ${stripHtml(materials.value)}`);
  return labels.join(", ");
}

function formatTarget(target) {
  if (!target) return "";
  const type = localizeTargetType(target.type);
  return [target.value ?? target.count, localizeDistanceUnit(target.units), type].filter(Boolean).join(" ");
}

function formatActivityActivation(item) {
  const values = getItemActivities(item);
  const activity = values[0];
  const activation = activity?.activation || activity?.system?.activation;
  return formatActivation(activation);
}

function formatActivation(activation) {
  return [activation?.value, localizeActivationType(activation?.type)].filter(Boolean).join(" ");
}

function resolveAttackBonus(item, attributes, abilities = {}) {
  const value = resolveWeaponAttackBonusValue(item, attributes, abilities);
  if (value !== null) return signed(value);
  return "";
}

function resolvePrimaryAttackBonus(items = [], attributes = {}, abilities = {}) {
  const weapons = items.filter(item => item.type === "weapon");
  const equipped = weapons.filter(item => item.system?.equipped);
  const source = equipped.length ? equipped : weapons;
  const weaponValues = source
    .map(item => ({
      item,
      ability: resolveWeaponAbility(item, abilities),
      value: resolveWeaponAttackBonusValue(item, attributes, abilities)
    }))
    .filter(candidate => Number.isFinite(candidate.value));

  if (weaponValues.length) {
    weaponValues.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      if (a.ability === "str" && b.ability !== "str") return -1;
      if (b.ability === "str" && a.ability !== "str") return 1;
      return 0;
    });
    return signed(weaponValues[0].value);
  }

  return signed(resolveBasePhysicalAttackBonus(attributes, abilities));
}

function resolveWeaponAttackBonusValue(item, attributes = {}, abilities = {}) {
  const values = getItemActivities(item);
  const attack = values.find(activity => activity?.attack || activity?.type === "attack");
  const abilityKey = resolveWeaponAbility(item, abilities, attack);
  const bonus = numericBonus(attack?.attack?.bonus ?? item.system?.attackBonus);
  if (!abilityKey) return bonus || null;
  const abilityMod = Number(abilities?.[abilityKey]?.mod ?? 0);
  const proficient = isWeaponProficient(item);
  return abilityMod + (proficient ? Number(attributes.prof ?? 0) : 0) + bonus;
}

function resolveBasePhysicalAttackBonus(attributes = {}, abilities = {}) {
  const prof = Number(attributes.prof ?? 0);
  const str = Number(abilities.str?.mod ?? 0);
  const dex = Number(abilities.dex?.mod ?? 0);
  return (dex > str ? dex : str) + prof;
}

function resolveSpellAttackBonus(attributes = {}) {
  const value = attributes.spell?.attack;
  if (value === null || value === undefined || value === "") return "";
  return signed(value);
}

function isWeaponProficient(item) {
  const value = item.system?.proficient ?? item.system?.proficiency;
  return !(value === false || value === 0 || value === "0");
}

function resolveDamage(item, abilities = {}) {
  const base = item.system?.damage?.base;
  if (base?.number && base?.denomination) {
    const abilityKey = resolveWeaponAbility(item, abilities);
    const mod = Number(abilities?.[abilityKey]?.mod ?? 0);
    const bonus = [base.bonus, mod ? signed(mod) : ""].filter(Boolean).join(" ");
    const types = Array.isArray(base.types) ? base.types.join(", ") : "";
    return [`${base.number}d${base.denomination}`, bonus, types].filter(Boolean).join(" ");
  }
  const parts = item.system?.damage?.parts;
  if (Array.isArray(parts) && parts.length) return parts.map(part => Array.isArray(part) ? part.join(" ") : String(part)).join(" / ");
  const values = getItemActivities(item);
  const damage = values.flatMap(activity => {
    const parts = activity?.damage?.parts;
    if (!parts) return [];
    if (parts instanceof Map) return Array.from(parts.values());
    return Array.isArray(parts) ? parts : Object.values(parts);
  });
  return damage.map(part => [part.formula, part.types?.join?.(", ") || part.type].filter(Boolean).join(" ")).filter(Boolean).join(" / ");
}

function resolveWeaponAbility(item, abilities = {}, activity = null) {
  const explicit = activity?.attack?.ability || item.system?.ability || item.system?.attack?.ability;
  if (explicit) return explicit;
  const properties = getProperties(item);
  const str = Number(abilities.str?.mod ?? 0);
  const dex = Number(abilities.dex?.mod ?? 0);
  if (properties.has("fin") || properties.has("finesse")) return dex > str ? "dex" : "str";
  const attackType = activity?.attack?.type?.value || item.system?.type?.value || "";
  if (String(attackType).toLowerCase().includes("ranged")) return "dex";
  const baseItem = String(item.system?.type?.baseItem || "").toLowerCase();
  if (["shortbow", "longbow", "lightcrossbow", "handcrossbow", "heavycrossbow", "sling", "dart"].includes(baseItem)) return "dex";
  return "str";
}

function isActiveFeature(item) {
  if (formatActivityActivation(item)) return true;
  if (hasMeaningfulUses(item.system?.uses)) return true;
  return getItemActivities(item).some(activity => {
    const activation = activity?.activation || activity?.system?.activation;
    const type = activation?.type || activity?.type;
    return type && type !== "none" && type !== "passive";
  });
}

function resolveActivitySaveDc(item, attributes = {}) {
  const activity = getItemActivities(item).find(value => value?.save || value?.system?.save);
  const save = activity?.save || activity?.system?.save;
  if (!save) return "";
  return save?.dc?.value ?? save?.dc ?? attributes.spell?.dc ?? "";
}

function resolveActivitySaveAbility(item) {
  const activity = getItemActivities(item).find(value => value?.save || value?.system?.save);
  const save = activity?.save || activity?.system?.save;
  const ability = save?.ability || save?.abilities?.[0] || save?.abilities?.first?.();
  return localizeAbility(ability) || "";
}

function getItemActivities(item) {
  const activities = item.system?.activities;
  if (!activities) return [];
  if (activities instanceof Map) return Array.from(activities.values());
  if (Array.isArray(activities)) return activities;
  if (Array.isArray(activities.contents)) return activities.contents;
  return Object.values(activities);
}

function hasMeaningfulUses(uses) {
  if (!uses) return false;
  const max = Number(uses.max ?? 0);
  const spent = Number(uses.spent ?? 0);
  return max > 0 || spent > 0;
}

async function buildDescriptionHtml(value, references = null) {
  const html = cleanHtml(value);
  if (!html) return "";
  const enriched = references ? await references.enrich(html) : plainTextUuidLinks(html);
  return sanitizeHtml(enriched);
}

function createReferenceCollector(translations = null) {
  const entriesByUuid = new Map();
  const pendingByUuid = new Map();

  return {
    async enrich(value) {
      const html = cleanHtml(value);
      if (!html) return "";
      let output = "";
      let lastIndex = 0;
      for (const match of html.matchAll(uuidLinkPattern())) {
        output += html.slice(lastIndex, match.index);
        const uuid = String(match[1] || "").trim();
        const inlineLabel = cleanReferenceLabel(match[2]);
        const entry = await ensureEntry(uuid, inlineLabel);
        output += entry
          ? referenceButtonHtml(entry.id, inlineLabel || entry.name)
          : escapeHtml(inlineLabel || fallbackUuidLabel(uuid));
        lastIndex = match.index + match[0].length;
      }
      output += html.slice(lastIndex);
      return output;
    },

    toSnapshot() {
      return Object.fromEntries(
        Array.from(entriesByUuid.values())
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(entry => [entry.id, entry])
      );
    }
  };

  async function ensureEntry(uuid, label) {
    if (!uuid) return null;
    if (entriesByUuid.has(uuid)) return entriesByUuid.get(uuid);
    if (pendingByUuid.has(uuid)) return pendingByUuid.get(uuid);

    const pending = buildReferenceEntry(uuid, label)
      .then(entry => {
        if (entry) entriesByUuid.set(uuid, entry);
        return entry;
      })
      .catch(error => {
        console.warn(`${MODULE_ID} | Failed to resolve content reference`, uuid, error);
        return null;
      })
      .finally(() => pendingByUuid.delete(uuid));

    pendingByUuid.set(uuid, pending);
    return pending;
  }

  async function buildReferenceEntry(uuid, label) {
    const document = await resolveUuidDocument(uuid);
    if (!document) return null;
    const id = referenceIdForUuid(uuid);
    const description = referenceDescription(document, translations);
    return {
      id,
      uuid,
      name: referenceName(document, label, translations),
      type: referenceKind(document),
      typeLabel: referenceTypeLabel(document),
      img: normalizeAssetPath(document.img || document.icon),
      source: referenceSource(document),
      facts: referenceFacts(document),
      descriptionHtml: sanitizeHtml(plainTextUuidLinks(description))
    };
  }
}

async function resolveUuidDocument(uuid) {
  const resolver = globalThis.fromUuid || globalThis.foundry?.utils?.fromUuid;
  if (typeof resolver !== "function") return null;
  return resolver(uuid);
}

function referenceButtonHtml(id, label) {
  return `<button class="inline-ref" type="button" data-sheetshare-ref="${escapeHtml(id)}">${escapeHtml(label || "Reference")}</button>`;
}

function plainTextUuidLinks(value) {
  return cleanHtml(value).replace(uuidLinkPattern(), (_match, uuid, label) => escapeHtml(cleanReferenceLabel(label) || fallbackUuidLabel(uuid)));
}

function uuidLinkPattern() {
  return new RegExp(UUID_LINK_PATTERN.source, "g");
}

function cleanReferenceLabel(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function fallbackUuidLabel(uuid) {
  const tail = String(uuid || "").split(".").pop() || "";
  return tail ? tail.replace(/[-_]+/g, " ") : referenceUiLabel("Reference", "引用");
}

function referenceIdForUuid(uuid) {
  let hash = 2166136261;
  for (const char of String(uuid)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `ref-${(hash >>> 0).toString(16)}`;
}

function referenceName(document, label, translations = null) {
  if (document?.documentName === "Item" || document?.system) return translateItemName(document, translations) || label || document.name || "";
  return label || document?.name || fallbackUuidLabel(document?.uuid);
}

function referenceKind(document) {
  if (document?.documentName === "Item" || document?.system) {
    if (document.type === "spell") return "spell";
    if (document.type === "feat") return "feature";
    return "item";
  }
  return String(document?.documentName || "reference").toLowerCase();
}

function referenceTypeLabel(document) {
  const kind = referenceKind(document);
  if (kind === "spell") return referenceUiLabel("Spell", "法术");
  if (kind === "feature") return referenceUiLabel("Feature", "特性");
  if (kind === "item") return referenceUiLabel("Item", "物品");
  return document?.documentName || referenceUiLabel("Reference", "引用");
}

function referenceSource(document) {
  if (document?.system) return resolveSource(document);
  return document?.pack || "";
}

function referenceDescription(document, translations = null) {
  if (document?.system) return translateItemDescription(document, translations);
  return document?.text?.content || document?.content || document?.description || "";
}

function referenceFacts(document) {
  if (!document?.system) return compactFacts([[referenceUiLabel("Source", "来源"), referenceSource(document)]]);
  if (document.type === "spell") {
    const properties = getProperties(document);
    const level = numberOrZero(document.system?.level);
    return compactFacts([
      [referenceUiLabel("Level", "环阶"), spellLevelLabel(level)],
      [referenceUiLabel("School", "学派"), localizeSpellSchool(document.system?.school)],
      [referenceUiLabel("Casting", "施法"), formatActivityActivation(document) || formatActivation(document.system?.activation)],
      [referenceUiLabel("Range", "范围"), formatRange(document.system?.range)],
      [referenceUiLabel("Target", "目标"), formatTarget(document.system?.target)],
      [referenceUiLabel("Duration", "持续"), formatDuration(document.system?.duration)],
      [referenceUiLabel("Components", "成分"), formatComponents(properties, document.system?.materials)],
      [referenceUiLabel("Source", "来源"), referenceSource(document)]
    ]);
  }
  return compactFacts([
    [referenceUiLabel("Activation", "激活"), formatActivityActivation(document) || formatActivation(document.system?.activation)],
    [referenceUiLabel("Range", "范围"), formatRange(document.system?.range)],
    [referenceUiLabel("Uses", "使用"), formatUses(document.system?.uses)],
    [referenceUiLabel("Source", "来源"), referenceSource(document)]
  ]);
}

function compactFacts(entries) {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "—")
    .map(([label, value]) => ({ label, value: String(value) }));
}

function referenceUiLabel(en, zh) {
  return isChineseFoundryLanguage() ? zh : en;
}

function sanitizeHtml(value) {
  const html = cleanHtml(value);
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (blocked.has(element.tagName)) {
      element.remove();
      continue;
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.toLowerCase();
      if (name.startsWith("on") || val.includes("javascript:")) element.removeAttribute(attr.name);
    }
  }
  return doc.body.firstElementChild?.innerHTML || "";
}

function shortLabels() {
  const labels = {
    Walk: moduleLabel("Walk", "Walk"),
    Burrow: moduleLabel("Burrow", "Burrow"),
    Climb: moduleLabel("Climb", "Climb"),
    Fly: moduleLabel("Fly", "Fly"),
    Swim: moduleLabel("Swim", "Swim"),
    Primary: moduleLabel("Primary", "Primary"),
    Secondary: moduleLabel("Secondary", "Secondary"),
    Tertiary: moduleLabel("Tertiary", "Tertiary"),
    LegendaryActions: moduleLabel("LegendaryActions", "Legendary Actions"),
    LegendaryResistances: moduleLabel("LegendaryResistances", "Legendary Resistances")
  };
  return {
    ...labels,
    walk: labels.Walk,
    burrow: labels.Burrow,
    climb: labels.Climb,
    fly: labels.Fly,
    swim: labels.Swim
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numericBonus(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  const text = String(value).trim();
  return /^[+-]?\d+$/.test(text) ? Number(text) : 0;
}

function spellLevelLabel(level) {
  if (level === 0) return moduleLabel("Cantrips", "Cantrips");
  const formatted = game.i18n.format("CN5E.Labels.SpellLevel", { level });
  return formatted === "CN5E.Labels.SpellLevel" ? `Level ${level}` : formatted;
}

function capitalize(value) {
  if (!value && value !== 0) return "";
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function displayText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    return value.name || value.label || value.value || value.identifier || value.id || "";
  }
  return String(value);
}

function moduleLabel(key, fallback) {
  const localized = game.i18n.localize(`CN5E.Labels.${key}`);
  return localized === `CN5E.Labels.${key}` ? fallback : localized;
}

function isChineseFoundryLanguage() {
  const lang = String(game?.i18n?.lang || "").toLowerCase();
  return lang.startsWith("zh") || lang.startsWith("cn");
}

function route(path) {
  const cleaned = String(path).replace(/^\/+/, "");
  if (foundry.utils.getRoute) return foundry.utils.getRoute(cleaned);
  return `${window.location.origin}/${cleaned}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "character";
}
