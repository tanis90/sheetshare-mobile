export async function getEmbeddedImage(imgPath) {
  if (!imgPath) return "";
  try {
    const absolutePath = /^(https?:|data:)/i.test(imgPath)
      ? imgPath
      : `${window.location.origin}/${imgPath.replace(/^\/+/, "")}`;
    const response = await fetch(absolutePath, { credentials: "include" });
    if (!response.ok) return absolutePath;
    const blob = await response.blob();
    return await blobToDataURL(blob);
  } catch {
    return imgPath;
  }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function cleanHtml(value) {
  if (!value) return "";
  return String(value).trim();
}

export function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function signed(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num >= 0 ? "+" : ""}${num}`;
}

export function capitalize(value) {
  if (!value && value !== 0) return "—";
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function localizeConfig(key, dictionary) {
  if (!key) return "";
  const entry = dictionary?.[key];
  if (typeof entry === "string") return localizeFoundryString(entry);
  if (entry?.label) return localizeFoundryString(entry.label);
  if (entry?.name) return localizeFoundryString(entry.name);
  return capitalize(key);
}

function localizeFoundryString(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return globalThis.game?.i18n?.localize?.(text) || text;
}

export function localizeAbility(key) {
  if (isChineseFoundryLanguage() && CHINESE_ABILITY_LABELS[key]) return CHINESE_ABILITY_LABELS[key];
  const map = CONFIG.DND5E?.abilities ?? {};
  return localizeConfig(key, map) || (key ? key.toUpperCase() : "—");
}

export function localizeSkill(key) {
  if (isChineseFoundryLanguage() && CHINESE_SKILL_LABELS[key]) return CHINESE_SKILL_LABELS[key];
  const map = CONFIG.DND5E?.skills ?? {};
  return localizeConfig(key, map) || capitalize(key);
}

export function localizeSpellSchool(key) {
  if (isChineseFoundryLanguage() && CHINESE_SPELL_SCHOOL_LABELS[key]) return CHINESE_SPELL_SCHOOL_LABELS[key];
  return localizeConfig(key, CONFIG.DND5E?.spellSchools);
}

export function formatHp(hp) {
  if (!hp) return "—";
  const value = hp.value ?? hp.current ?? "—";
  const max = hp.max ?? "—";
  const temp = hp.temp ? ` + ${hp.temp}` : "";
  return `${value} / ${max}${temp}`;
}

export function formatMovement(movement, labels) {
  if (!movement) return "—";
  const units = movement.units || "ft";
  const modeLabels = {
    walk: labels?.Walk || "Walk",
    burrow: labels?.Burrow || "Burrow",
    climb: labels?.Climb || "Climb",
    fly: labels?.Fly || "Fly",
    swim: labels?.Swim || "Swim"
  };
  const parts = [];
  for (const [key, label] of Object.entries(modeLabels)) {
    const raw = movement[key];
    let value = raw;
    if (raw && typeof raw === "object") value = raw.value ?? raw.base ?? raw.total ?? "";
    if (value === null || value === undefined || value === "" || value === 0) continue;
    parts.push(`${label} ${value}${units}`);
  }
  if (movement.special?.trim()) parts.push(movement.special.trim());
  return parts.join(" / ") || "—";
}

export function formatCurrency(currency) {
  const order = ["pp", "gp", "ep", "sp", "cp"];
  return order
    .filter(key => currency[key] !== undefined)
    .map(key => `${key.toUpperCase()}: ${currency[key]}`)
    .join(" / ") || "—";
}

export function formatResources(resources, labels) {
  const labelMap = {
    primary: labels?.Primary || "Primary",
    secondary: labels?.Secondary || "Secondary",
    tertiary: labels?.Tertiary || "Tertiary",
    legact: labels?.LegendaryActions || "Legendary Actions",
    legres: labels?.LegendaryResistances || "Legendary Resistances"
  };
  return Object.entries(resources ?? {})
    .filter(([, value]) => value && typeof value === "object" && (value.max !== undefined || value.value !== undefined))
    .map(([key, value]) => `${labelMap[key] ?? capitalize(key)} ${Number(value.value ?? 0)}/${Number(value.max ?? 0)}`)
    .filter(entry => entry && !entry.includes("0/0"))
    .join(" / ") || "—";
}

export function formatTraitList(trait, dictionary = null) {
  if (!trait) return "—";
  if (typeof trait === "string") {
    const cleaned = trait.trim();
    if (!cleaned || /^select /i.test(cleaned)) return "—";
    return cleaned;
  }

  const values = [];
  const pushValue = (entry) => {
    if (entry === null || entry === undefined || entry === "") return;
    let text = entry;
    if (dictionary && typeof entry === "string") {
      text = localizeConfig(entry, dictionary);
    }
    text = String(text).trim();
    if (!text || /^select /i.test(text)) return;
    values.push(text);
  };

  const value = trait.value;
  if (Array.isArray(value)) value.forEach(pushValue);
  else if (value instanceof Set) Array.from(value).forEach(pushValue);
  else if (value && typeof value === "object") {
    for (const [key, active] of Object.entries(value)) {
      if (active) pushValue(key);
    }
  } else if (value) pushValue(value);

  if (Array.isArray(trait.custom)) trait.custom.forEach(pushValue);
  else if (typeof trait.custom === "string") {
    trait.custom.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(pushValue);
  }

  return [...new Set(values)].sort((a, b) => a.localeCompare(b, game.i18n.lang)).join(", ") || "—";
}

export function formatPrice(price) {
  if (!price) return "—";
  if (typeof price === "string") return price;
  if (typeof price === "number") return `${price} gp`;
  const value = price.value ?? "—";
  const denom = price.denomination ?? price.currency ?? "gp";
  return `${value} ${denom}`;
}

export function formatUses(uses) {
  if (!uses) return "";
  const spent = Number(uses.spent ?? 0);
  const max = uses.max ?? "";
  if (max === "" && !spent) return "";
  const current = max !== "" ? Math.max(Number(max) - spent, 0) : 0;
  const recovery = localizeRecoveryPeriod(uses.recovery?.[0]?.period || "");
  return `${current}/${max}${recovery ? ` (${recovery})` : ""}`;
}

export function normalizeAttunement(attunement, labels) {
  const map = { 0: labels?.AttunementNo || "No", 1: labels?.AttunementRequired || "Required", 2: labels?.Attuned || "Attuned" };
  return map[attunement] ?? "—";
}

export function formatRange(range) {
  if (!range) return "";
  if (typeof range === "string") return range;
  const value = range.value ?? "";
  const units = localizeRangeUnit(range.units ?? "");
  const long = range.long ? ` / ${range.long}` : "";
  return `${value}${value && units ? " " : ""}${units}${long}`.trim();
}

export function formatDuration(duration) {
  if (!duration) return "";
  if (typeof duration === "string") return duration;
  return [duration.value, localizeDurationUnit(duration.units), duration.special].filter(Boolean).join(" ");
}

export function formatComponents(properties, materials) {
  if (!properties && !materials) return "";
  const bits = [];
  if (properties) {
    bits.push(...Object.entries(properties)
      .filter(([, active]) => Boolean(active))
      .map(([key]) => key.toUpperCase()));
  }
  if (materials?.value) bits.push(`M: ${stripHtml(materials.value)}`);
  return bits.join(" / ");
}

export function formatSkillProficiency(value, labels) {
  const map = {
    0: labels?.NoProficiency || "No Proficiency",
    0.5: labels?.HalfProficient || "Half Proficient",
    1: labels?.Proficient || "Proficient",
    2: labels?.Expertise || "Expertise"
  };
  return map[value] ?? (value ? `x${value}` : map[0]);
}

export function formatInitiative(init) {
  if (init === null || init === undefined) return "—";
  if (typeof init === "number") return signed(init);
  const value = Number(init.value ?? init.bonus ?? init.mod);
  return Number.isFinite(value) ? signed(value) : "—";
}

export function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

export function sortDocuments(a, b) {
  const aSort = Number(a.sort ?? 0);
  const bSort = Number(b.sort ?? 0);
  if (aSort !== bSort) return aSort - bSort;
  return a.name.localeCompare(b.name, game.i18n.lang);
}

export function localizeActivationType(type) {
  if (!type) return "";
  return isChineseFoundryLanguage() ? (CHINESE_ACTIVATION_LABELS[type] || type) : type;
}

export function localizeTargetType(type) {
  if (!type) return "";
  return isChineseFoundryLanguage() ? (CHINESE_TARGET_LABELS[type] || type) : type;
}

function localizeRangeUnit(unit) {
  if (!unit) return "";
  return isChineseFoundryLanguage() ? (CHINESE_RANGE_UNIT_LABELS[unit] || unit) : unit;
}

function localizeDurationUnit(unit) {
  if (!unit) return "";
  return isChineseFoundryLanguage() ? (CHINESE_DURATION_UNIT_LABELS[unit] || unit) : unit;
}

function localizeRecoveryPeriod(period) {
  if (!period) return "";
  return isChineseFoundryLanguage() ? (CHINESE_RECOVERY_LABELS[period] || period) : period;
}

function isChineseFoundryLanguage() {
  const lang = String(game?.i18n?.lang || "").toLowerCase();
  return lang.startsWith("zh") || lang.startsWith("cn");
}

const CHINESE_ABILITY_LABELS = {
  str: "力量",
  dex: "敏捷",
  con: "体质",
  int: "智力",
  wis: "感知",
  cha: "魅力"
};

const CHINESE_SKILL_LABELS = {
  acr: "特技",
  ani: "驯兽",
  arc: "奥秘",
  ath: "运动",
  dec: "欺瞒",
  his: "历史",
  ins: "洞悉",
  itm: "威吓",
  inv: "调查",
  med: "医疗",
  nat: "自然",
  prc: "察觉",
  prf: "表演",
  per: "游说",
  rel: "宗教",
  slt: "巧手",
  ste: "隐匿",
  sur: "求生"
};

const CHINESE_SPELL_SCHOOL_LABELS = {
  abj: "防护系",
  con: "咒法系",
  div: "预言系",
  enc: "附魔系",
  evo: "塑能系",
  ill: "幻术系",
  nec: "死灵系",
  trs: "变化系"
};

const CHINESE_ACTIVATION_LABELS = {
  action: "动作",
  bonus: "附赠动作",
  reaction: "反应",
  minute: "分钟",
  hour: "小时",
  day: "天",
  special: "特殊",
  legendary: "传奇动作",
  lair: "巢穴动作",
  none: "无"
};

const CHINESE_RANGE_UNIT_LABELS = {
  self: "自身",
  touch: "触及",
  ft: "尺",
  feet: "尺",
  mi: "里",
  mile: "里",
  miles: "里",
  spec: "特殊",
  any: "任意"
};

const CHINESE_DURATION_UNIT_LABELS = {
  inst: "立即",
  instantaneous: "立即",
  turn: "回合",
  turns: "回合",
  round: "轮",
  rounds: "轮",
  minute: "分钟",
  minutes: "分钟",
  hour: "小时",
  hours: "小时",
  day: "天",
  days: "天",
  month: "月",
  months: "月",
  year: "年",
  years: "年",
  perm: "永久",
  disp: "直至解除",
  special: "特殊"
};

const CHINESE_RECOVERY_LABELS = {
  sr: "短休",
  lr: "长休",
  day: "日",
  dawn: "黎明",
  dusk: "黄昏"
};

const CHINESE_TARGET_LABELS = {
  self: "自身",
  creature: "生物",
  ally: "盟友",
  enemy: "敌人",
  object: "物件",
  space: "空间",
  point: "一点",
  sphere: "球形",
  cone: "锥形",
  line: "线形",
  cube: "立方",
  cylinder: "柱状",
  square: "方形",
  wall: "墙"
};
