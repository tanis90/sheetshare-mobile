import { escapeHtml } from "./utils.js";

export function buildHtml(data, i18n) {
  const L = (key) => i18n[key] || key.replace("CN5E.Labels.", "").replace("CN5E.Sections.", "").replace("CN5E.Empty.", "");
  const E = (v) => escapeHtml(v);

  return `<!DOCTYPE html>
<html lang="${game.i18n.lang === "zh-cn" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${E(data.actorName)} - ${L("CN5E.Footer.Text")}</title>
<style>${buildCss()}</style>
</head>
<body>
<div class="sheet">
${buildHeader(data, L, E)}
${buildTabNav(L)}
${buildDetailsPanel(data, L, E)}
${buildSkillsPanel(data, L, E)}
${buildInventoryPanel(data, L, E)}
${buildFeaturesPanel(data, L, E)}
${buildSpellbookPanel(data, L, E)}
${buildEffectsPanel(data, L, E)}
${buildBiographyPanel(data, L, E)}
<footer class="footer">${E(L("CN5E.Footer.Text"))} &bull; ${E(data.exportedAt)}</footer>
</div>
<script>${buildJs()}<\/script>
</body>
</html>`;
}

function buildCss() {
  return `
:root {
  --bg: #0f1117;
  --panel: #141a25;
  --panel-2: #1b2332;
  --line: #36425d;
  --line-soft: rgba(122,143,187,0.18);
  --gold: #d9b36c;
  --gold-soft: rgba(217,179,108,0.14);
  --text: #edf2ff;
  --muted: #aab4c9;
  --radius: 14px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  color: var(--text);
  font-family: "Noto Sans SC","Microsoft YaHei","PingFang SC",Inter,system-ui,sans-serif;
  background: linear-gradient(180deg,#0e1016,#080a0f);
  -webkit-font-smoothing: antialiased;
}

/* Mobile-first: single column, compact */
.sheet { padding: 8px; max-width: 100%; }

/* Header */
.hero {
  background: linear-gradient(180deg,rgba(120,18,32,0.5),rgba(16,21,33,0.92));
  border-bottom: 1px solid var(--line);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 12px;
}
.hero-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.portrait-wrap {
  border: 1px solid rgba(217,179,108,0.28);
  border-radius: 12px;
  overflow: hidden;
  background: #121722;
  max-width: 120px;
  aspect-ratio: 0.78;
}
.portrait-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.identity { min-width: 0; }
.title-block h1 {
  font-family: Georgia,"Times New Roman",serif;
  font-size: 1.6rem;
  color: #fffaf0;
  line-height: 1.15;
}
.subtitle {
  margin-top: 4px;
  color: #f0d7a6;
  font-size: 0.85rem;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.meta-note { color: var(--muted); font-size: 0.78rem; margin-top: 4px; }

/* Stat cards - 2 columns on mobile */
.hero-stats { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; margin-top: 10px; }
.stat-card {
  background: linear-gradient(180deg,rgba(16,21,33,0.72),rgba(24,31,46,0.82));
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 56px;
}
.stat-card .label { color: var(--muted); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; }
.stat-card .value { color: #fff; font-size: 0.95rem; margin-top: 2px; word-break: break-word; }

/* Abilities - 3 columns on mobile */
.ability-bar { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 8px; }
.ability-chip {
  background: linear-gradient(180deg,rgba(15,20,31,0.92),rgba(30,37,52,0.9));
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 6px;
  text-align: center;
}
.ability-chip .abbr { color: var(--gold); font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; }
.ability-chip .score { font-size: 1.4rem; font-weight: 700; line-height: 1.1; margin-top: 2px; }
.ability-chip .mods { margin-top: 3px; font-size: 0.75rem; color: var(--muted); }

/* Tab nav - scrollable on mobile */
.tab-nav {
  display: flex;
  overflow-x: auto;
  gap: 4px;
  padding: 8px 8px 0;
  background: rgba(17,22,34,0.92);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tab-nav::-webkit-scrollbar { display: none; }
.tab-btn {
  appearance: none;
  cursor: pointer;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text);
  background: linear-gradient(180deg,rgba(42,52,74,0.9),rgba(22,28,41,0.95));
  padding: 6px 12px;
  font-size: 0.8rem;
  white-space: nowrap;
  transition: 120ms;
}
.tab-btn:hover { border-color: rgba(217,179,108,0.55); }
.tab-btn.active {
  background: linear-gradient(180deg,rgba(217,179,108,0.28),rgba(48,39,19,0.28));
  border-color: rgba(217,179,108,0.65);
  color: #fff5dd;
}

/* Panels */
.tab-panel { display: none; padding: 12px; }
.tab-panel.active { display: block; }
.section-title {
  font-family: Georgia,"Times New Roman",serif;
  font-size: 1.3rem;
  color: #fff7e8;
  margin-bottom: 10px;
}
.section-subtitle {
  font-size: 0.85rem;
  color: var(--gold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
  margin-top: 14px;
}
.section-block {
  background: linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
}

/* Detail grid */
.detail-grid { display: grid; gap: 8px; grid-template-columns: repeat(2,1fr); }
.detail-card {
  background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
}
.detail-card .label { color: var(--muted); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; }
.detail-card .value { color: #fff; font-size: 0.88rem; margin-top: 2px; word-break: break-word; }

/* Details layout - single column on mobile */
.details-layout { display: grid; gap: 10px; grid-template-columns: 1fr; }
.sidebar-stack { display: grid; gap: 8px; }
.hero-mini { display: grid; gap: 6px; grid-template-columns: repeat(2,1fr); }
.mini {
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.02);
}
.mini .k { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.mini .v { margin-top: 2px; color: #fff; font-size: 0.88rem; }

/* Skills */
.skill-grid { display: grid; gap: 6px; grid-template-columns: repeat(2,1fr); }
.skill-card {
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255,255,255,0.02);
}
.skill-head { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
.skill-name { font-weight: 700; color: #fff; font-size: 0.85rem; }
.skill-mod { color: var(--gold); font-weight: 700; font-size: 0.85rem; }
.skill-meta { margin-top: 3px; font-size: 0.72rem; color: var(--muted); display: flex; gap: 6px; flex-wrap: wrap; }

/* Item cards */
.list-grid { display: grid; gap: 8px; }
.item-card {
  background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px;
  display: grid;
  grid-template-columns: 44px minmax(0,1fr);
  gap: 10px;
  align-items: start;
}
.item-icon {
  width: 44px; height: 44px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.03);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.item-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.item-icon .fallback { color: var(--gold); font-size: 1rem; }
.card-title { color: #fffaf2; font-size: 0.92rem; font-weight: 600; }
.pill-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 0.7rem; color: #e7edf9;
  background: rgba(66,82,117,0.28);
  border: 1px solid rgba(122,143,187,0.2);
}
.description { color: #dfe7f7; line-height: 1.5; font-size: 0.82rem; margin-top: 4px; }

/* Compact cards (features, spells, effects) */
.compact-grid { display: grid; gap: 8px; grid-template-columns: repeat(2,1fr); }
.compact-card {
  background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px;
  text-align: center;
  transition: 120ms;
}
.compact-card:hover { border-color: rgba(217,179,108,0.5); }
.compact-card .icon-wrap {
  width: 52px; height: 52px;
  margin: 0 auto 6px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.03);
}
.compact-card .icon-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.compact-card .name { color: #fff; font-weight: 600; font-size: 0.82rem; line-height: 1.2; }
.compact-card .meta { margin-top: 4px; color: var(--muted); font-size: 0.72rem; }

/* Feature summary */
.feature-summary-grid { display: grid; gap: 8px; grid-template-columns: repeat(2,1fr); margin-top: 10px; }

/* Spell slots */
.slot-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.slot-chip {
  background: rgba(66,82,117,0.28);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  color: var(--text);
}

/* Tool cards */
.tool-grid { display: grid; gap: 8px; grid-template-columns: repeat(2,1fr); }
.tool-card {
  background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px;
  text-align: center;
}
.tool-card .icon-wrap {
  width: 44px; height: 44px;
  margin: 0 auto 6px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.03);
}
.tool-card .icon-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tool-card .name { color: #fff; font-weight: 600; font-size: 0.82rem; }
.tool-card .meta { margin-top: 4px; color: var(--muted); font-size: 0.72rem; }

/* Biography */
.bio-grid { display: grid; gap: 8px; grid-template-columns: repeat(2,1fr); }
.bio-card {
  background: linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px;
}
.bio-content { color: #dfe7f7; line-height: 1.5; font-size: 0.88rem; }

/* Empty states */
.empty-state {
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--muted);
  font-size: 0.85rem;
  background: rgba(255,255,255,0.015);
}

/* Group stack */
.group-stack { display: grid; gap: 12px; }

/* Tablet+ */
@media (min-width: 769px) {
  .sheet { padding: 16px; }
  .hero { padding: 18px; }
  .hero-grid { grid-template-columns: 180px minmax(0,1fr); }
  .portrait-wrap { max-width: 180px; }
  .title-block h1 { font-size: 2rem; }
  .hero-stats { grid-template-columns: repeat(3,1fr); }
  .ability-bar { grid-template-columns: repeat(3,1fr); }
  .detail-grid { grid-template-columns: repeat(3,1fr); }
  .details-layout { grid-template-columns: 1.25fr 0.95fr; }
  .skill-grid { grid-template-columns: repeat(3,1fr); }
  .compact-grid { grid-template-columns: repeat(3,1fr); }
  .feature-summary-grid { grid-template-columns: repeat(4,1fr); }
  .tool-grid { grid-template-columns: repeat(3,1fr); }
  .bio-grid { grid-template-columns: repeat(3,1fr); }
  .tab-panel { padding: 18px; }
}

/* Desktop */
@media (min-width: 1100px) {
  .sheet { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .hero { padding: 24px; }
  .portrait-wrap { max-width: 220px; }
  .title-block h1 { font-size: 2.6rem; }
  .hero-stats { grid-template-columns: repeat(6,1fr); }
  .ability-bar { grid-template-columns: repeat(7,1fr); }
  .detail-grid { grid-template-columns: repeat(3,1fr); }
  .skill-grid { grid-template-columns: repeat(4,1fr); }
  .compact-grid { grid-template-columns: repeat(4,1fr); }
  .tab-panel { padding: 24px; }
}

/* Print */
@page { size: A4; margin: 12mm; }
@media print {
  * { color: #000 !important; background: #fff !important; box-shadow: none !important; text-shadow: none !important; }
  body { padding: 0; }
  .sheet { max-width: none; border: none; border-radius: 0; }
  .hero { border-radius: 0; background: #fff !important; }
  .tab-nav { display: none !important; }
  .tab-panel { display: block !important; page-break-inside: avoid; }
  .stat-card, .ability-chip, .detail-card, .mini, .skill-card,
  .item-card, .compact-card, .tool-card, .bio-card, .section-block,
  .slot-chip { background: #fff !important; border-color: #bbb !important; }
  .portrait-wrap { border-color: #bbb !important; max-width: 60px !important; }
  .item-icon, .compact-card .icon-wrap, .tool-card .icon-wrap { border-color: #bbb !important; }
  img { filter: grayscale(80%); }
  .footer { background: #fff !important; border-top: 1px solid #bbb; }
  .pill { background: #eee !important; border-color: #bbb !important; }
  .stat-card .value, .detail-card .value, .mini .v, .skill-name,
  .compact-card .name, .tool-card .name, .card-title { color: #000 !important; }
  .description, .bio-content { color: #222 !important; }
  .stat-card .label, .detail-card .label, .mini .k, .skill-meta,
  .compact-card .meta, .tool-card .meta { color: #555 !important; }
}
`;
}

function buildJs() {
  return `
const buttons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');
buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    buttons.forEach(b => b.classList.toggle('active', b === btn));
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  });
});
`;
}

function buildHeader(data, L, E) {
  const portrait = data.portrait
    ? `<img src="${data.portrait}" alt="">`
    : `<div class="empty-state" style="margin:8px;font-size:0.75rem">${E(L("CN5E.Empty.NoImage"))}</div>`;

  return `<header class="hero">
<div class="hero-grid">
  <div class="portrait-wrap">${portrait}</div>
  <div class="identity">
    <div class="title-block">
      <h1>${E(data.actorName)}</h1>
      <div class="subtitle">
        <span>${E(data.header.classes)}</span>
        <span>&bull;</span>
        <span>${E(data.header.race)}</span>
        <span>&bull;</span>
        <span>${E(data.header.alignment)}</span>
      </div>
      <div class="meta-note">${E(L("CN5E.Meta.Note").replace("{time}", data.exportedAt))}</div>
    </div>
    <div class="hero-stats">
      ${statCard(L("CN5E.Labels.Level"), data.header.level)}
      ${statCard(L("CN5E.Labels.AC"), data.header.ac)}
      ${statCard(L("CN5E.Labels.HP"), data.header.hp)}
      ${statCard(L("CN5E.Labels.Speed"), data.header.speed)}
      ${statCard(L("CN5E.Labels.ProfBonus"), data.header.prof)}
      ${statCard(L("CN5E.Labels.PassivePerception"), data.header.passivePerception)}
    </div>
    <div class="ability-bar">
      ${data.details.abilities.map(a => `
      <div class="ability-chip">
        <div class="abbr">${E(a.key)}</div>
        <div class="score">${E(a.value)}</div>
        <div class="mods">${E(a.mod)}</div>
      </div>`).join("")}
    </div>
  </div>
</div>
</header>`;
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value ?? "—"))}</div></div>`;
}

function buildTabNav(L) {
  const tabs = [
    ["details", L("CN5E.Sections.Details")],
    ["skills", L("CN5E.Sections.Skills")],
    ["inventory", L("CN5E.Sections.Inventory")],
    ["features", L("CN5E.Sections.Features")],
    ["spellbook", L("CN5E.Sections.Spellbook")],
    ["effects", L("CN5E.Sections.Effects")],
    ["biography", L("CN5E.Sections.Biography")],
  ];
  return `<nav class="tab-nav">${tabs.map(([id, label], i) =>
    `<button class="tab-btn${i === 0 ? " active" : ""}" data-tab="${id}">${escapeHtml(label)}</button>`
  ).join("")}</nav>`;
}

function buildDetailsPanel(data, L, E) {
  const grid = [
    [L("CN5E.Labels.Species"), data.header.race],
    [L("CN5E.Labels.Classes"), data.header.classes],
    [L("CN5E.Labels.Level"), data.header.level],
    [L("CN5E.Labels.Background"), data.header.background],
    [L("CN5E.Labels.Alignment"), data.header.alignment],
    [L("CN5E.Labels.XP"), data.header.xp],
    [L("CN5E.Labels.Spellcasting"), data.header.spellcasting],
    [L("CN5E.Labels.Initiative"), data.header.initiative],
    [L("CN5E.Labels.Inspiration"), data.details.inspiration],
    [L("CN5E.Labels.Languages"), data.details.languages],
    [L("CN5E.Labels.Senses"), data.details.senses],
    [L("CN5E.Labels.Currency"), data.details.currency],
    [L("CN5E.Labels.Resources"), data.details.resources],
    [L("CN5E.Labels.Resistances"), data.details.resistances],
    [L("CN5E.Labels.Immunities"), data.details.immunities],
    [L("CN5E.Labels.Vulnerabilities"), data.details.vulnerabilities],
    [L("CN5E.Labels.ConditionImmunities"), data.details.conditionImmunities],
  ];

  return `<section class="tab-panel active" data-panel="details">
<h2 class="section-title">${E(L("CN5E.Sections.Details"))}</h2>
<div class="details-layout">
  <div class="detail-grid">${grid.map(([label, value]) =>
    `<div class="detail-card"><div class="label">${E(label)}</div><div class="value">${E(String(value ?? "—"))}</div></div>`
  ).join("")}</div>
  <aside class="sidebar-stack">
    <div class="section-block">
      <h3 class="section-subtitle">${E(L("CN5E.Sections.SavingThrows"))}</h3>
      <div class="hero-mini">${data.details.abilities.map(a =>
        `<div class="mini"><div class="k">${E(a.key)}</div><div class="v">${E(a.save)}</div></div>`
      ).join("")}</div>
    </div>
    <div class="section-block">
      <h3 class="section-subtitle">${E(L("CN5E.Sections.Summary"))}</h3>
      <div class="hero-mini">
        <div class="mini"><div class="k">${E(L("CN5E.Labels.XP"))}</div><div class="v">${E(data.header.xp)}</div></div>
        <div class="mini"><div class="k">${E(L("CN5E.Labels.Spellcasting"))}</div><div class="v">${E(data.header.spellcasting)}</div></div>
        <div class="mini"><div class="k">${E(L("CN5E.Labels.Initiative"))}</div><div class="v">${E(data.header.initiative)}</div></div>
        <div class="mini"><div class="k">${E(L("CN5E.Labels.Inspiration"))}</div><div class="v">${E(data.details.inspiration)}</div></div>
      </div>
    </div>
  </aside>
</div>
</section>`;
}

function buildSkillsPanel(data, L, E) {
  return `<section class="tab-panel" data-panel="skills">
<h2 class="section-title">${E(L("CN5E.Sections.Skills"))}</h2>
<div class="skill-grid">
  ${data.skills.length ? data.skills.map(s => `
  <div class="skill-card">
    <div class="skill-head">
      <div class="skill-name">${E(s.label)}</div>
      <div class="skill-mod">${E(s.mod)}</div>
    </div>
    <div class="skill-meta">
      <span>${E(s.ability)}</span>
      <span>${E(L("CN5E.Labels.Passive"))} ${E(s.passive)}</span>
      <span>${E(s.proficiency)}</span>
    </div>
  </div>`).join("") : `<div class="empty-state">${E(L("CN5E.Empty.Skills"))}</div>`}
</div>
${data.tools.length ? `
<h3 class="section-subtitle">${E(L("CN5E.Sections.Tools"))}</h3>
<div class="tool-grid">${data.tools.map(t => {
  const icon = t.img ? `<img src="${t.img}" alt="">` : `<div class="fallback">&#10022;</div>`;
  return `<div class="tool-card">
    <div class="icon-wrap">${icon}</div>
    <div class="name">${E(t.name)}</div>
    <div class="meta">${E(t.ability)} &bull; ${E(t.proficient ? L("CN5E.Labels.Proficient") : L("CN5E.Labels.NoProficiency"))}</div>
  </div>`;
}).join("")}</div>` : ""}
</section>`;
}

function buildInventoryPanel(data, L, E) {
  const pills = (item) => [
    item.type ? `${L("CN5E.Labels.Type")}: ${item.type}` : "",
    `${L("CN5E.Labels.Quantity")}: ${item.quantity}`,
    `${L("CN5E.Labels.Equipped")}: ${item.equipped ? L("CN5E.Labels.Yes") : L("CN5E.Labels.No")}`,
    `${L("CN5E.Labels.Attunement")}: ${item.attunement}`,
    `${L("CN5E.Labels.Rarity")}: ${item.rarity}`,
    `${L("CN5E.Labels.Weight")}: ${item.weight}`,
    `${L("CN5E.Labels.Price")}: ${item.price}`,
    item.uses ? `${L("CN5E.Labels.Uses")}: ${item.uses}` : "",
  ].filter(Boolean);

  return `<section class="tab-panel" data-panel="inventory">
<h2 class="section-title">${E(L("CN5E.Sections.Inventory"))}</h2>
<div class="list-grid">
  ${data.inventory.length ? data.inventory.map(item => {
    const icon = item.img ? `<img src="${item.img}" alt="">` : `<div class="fallback">&#10022;</div>`;
    return `<div class="item-card">
      <div class="item-icon">${icon}</div>
      <div>
        <div class="card-title">${E(item.name)}</div>
        <div class="pill-row">${pills(item).map(p => `<span class="pill">${E(p)}</span>`).join("")}</div>
        ${item.description ? `<div class="description">${item.description}</div>` : ""}
      </div>
    </div>`;
  }).join("") : `<div class="empty-state">${E(L("CN5E.Empty.Inventory"))}</div>`}
</div>
</section>`;
}

function buildFeaturesPanel(data, L, E) {
  return `<section class="tab-panel" data-panel="features">
<h2 class="section-title">${E(L("CN5E.Sections.Features"))}</h2>
<div class="group-stack">
  ${Object.keys(data.featureGroups).length ? Object.entries(data.featureGroups).map(([group, entries]) => `
  <div class="section-block">
    <h3 class="section-subtitle">${E(group)}</h3>
    <div class="compact-grid">${entries.map(item => compactCard(item, E)).join("")}</div>
  </div>`).join("") : `<div class="empty-state">${E(L("CN5E.Empty.Features"))}</div>`}
  <div class="section-block">
    <h3 class="section-subtitle">${E(L("CN5E.Sections.CharacterSummary"))}</h3>
    <div class="feature-summary-grid">
      ${summaryCard(data.featureSummary.species, L("CN5E.Labels.Species"), E)}
      ${summaryCard(data.featureSummary.background, L("CN5E.Labels.Background"), E)}
      ${summaryCard(data.featureSummary.class, L("CN5E.Labels.Classes"), E)}
      ${summaryCard(data.featureSummary.subclass, L("CN5E.Labels.Subclass"), E)}
    </div>
  </div>
</div>
</section>`;
}

function buildSpellbookPanel(data, L, E) {
  return `<section class="tab-panel" data-panel="spellbook">
<h2 class="section-title">${E(L("CN5E.Sections.Spellbook"))}</h2>
<div class="detail-grid" style="margin-bottom:10px">
  ${statCard(L("CN5E.Labels.SpellAttack"), data.spellStats.attack)}
  ${statCard(L("CN5E.Labels.SpellSaveDC"), data.spellStats.dc)}
  ${statCard(L("CN5E.Labels.Spellcasting"), data.spellStats.ability)}
</div>
${data.spellSlots.length ? `
<h3 class="section-subtitle">${E(L("CN5E.Sections.SpellSlots"))}</h3>
<div class="slot-bar">${data.spellSlots.map(s =>
  `<span class="slot-chip">${E(L("CN5E.Labels.SpellLevel").replace("{level}", s.level))}: ${s.max - s.used}/${s.max}</span>`
).join("")}</div>` : ""}
<div class="group-stack">
  ${Object.keys(data.spellGroups).length ? Object.entries(data.spellGroups).map(([group, entries]) => `
  <div class="section-block">
    <h3 class="section-subtitle">${E(group)}</h3>
    <div class="compact-grid">${entries.map(spell => {
      const meta = [
        spell.prepared ? L("CN5E.Labels.Prepared") : "",
        spell.ritual ? L("CN5E.Labels.Ritual") : "",
        spell.concentration ? L("CN5E.Labels.Concentration") : "",
      ].filter(Boolean).join(" / ");
      return compactCard(spell, E, meta);
    }).join("")}</div>
  </div>`).join("") : `<div class="empty-state">${E(L("CN5E.Empty.Spells"))}</div>`}
</div>
</section>`;
}

function buildEffectsPanel(data, L, E) {
  return `<section class="tab-panel" data-panel="effects">
<h2 class="section-title">${E(L("CN5E.Sections.Effects"))}</h2>
<div class="compact-grid">
  ${data.effects.length ? data.effects.map(eff =>
    compactCard(eff, E, eff.source)
  ).join("") : `<div class="empty-state">${E(L("CN5E.Empty.Effects"))}</div>`}
</div>
</section>`;
}

function buildBiographyPanel(data, L, E) {
  return `<section class="tab-panel" data-panel="biography">
<h2 class="section-title">${E(L("CN5E.Sections.Biography"))}</h2>
<div class="group-stack">
  ${data.biography.summaryFields.length ? `
  <div class="section-block">
    <h3 class="section-subtitle">${E(L("CN5E.Sections.CharacterDetails"))}</h3>
    <div class="bio-grid">${data.biography.summaryFields.map(([label, value]) =>
      `<div class="detail-card"><div class="label">${E(L(label))}</div><div class="value">${E(String(value))}</div></div>`
    ).join("")}</div>
  </div>` : ""}
  ${data.biography.personalityFields.length ? `
  <div class="section-block">
    <h3 class="section-subtitle">${E(L("CN5E.Sections.Personality"))}</h3>
    <div class="bio-grid">${data.biography.personalityFields.map(([label, value]) =>
      `<div class="detail-card"><div class="label">${E(L(label))}</div><div class="value">${E(String(value))}</div></div>`
    ).join("")}</div>
  </div>` : ""}
  <div class="section-block">
    <h3 class="section-subtitle">${E(L("CN5E.Sections.Backstory"))}</h3>
    <div class="bio-content">${data.biography.backstory || `<div class="empty-state">${E(L("CN5E.Empty.Biography"))}</div>`}</div>
  </div>
</div>
</section>`;
}

function compactCard(item, E, meta = "") {
  const icon = item.img ? `<img src="${item.img}" alt="">` : `<div class="fallback">&#10022;</div>`;
  return `<div class="compact-card">
  <div class="icon-wrap">${icon}</div>
  <div class="name">${E(item.name)}</div>
  ${meta ? `<div class="meta">${E(meta)}</div>` : ""}
</div>`;
}

function summaryCard(data, label, E) {
  return compactCard({ name: data.name, img: data.img }, E, label);
}
