import { extractCharacterSnapshot } from "./snapshot-extractor.js";
import { executeRoll } from "./roll-executor.js";

const MODULE_ID = "sheetshare-mobile";
const OVERLAY_ID = "ssm-mobile-view";
const OVERLAY_Z_INDEX_NORMAL = "100000";
const OVERLAY_Z_INDEX_LOWERED = "5";

let currentActor = null;
let updateHookId = null;
let rollToastTimer = null;

// Foundry's dialogs (like the advantage/disadvantage/normal roll
// prompt) use a dynamic z-index that sits below our full-screen
// overlay, so they'd otherwise render hidden underneath it.
//
// Trying to identify and raise the *one* correct dialog above our
// overlay turned out to be the wrong approach - there's no reliable way
// to tell "the roll prompt" apart from every other Application Foundry
// might render (it ended up catching things like the Camera Dock too,
// moving them around unpredictably). Instead, this temporarily lowers
// OUR OWN overlay's z-index whenever any dialog is open, and restores
// it once none are - this never touches any other Foundry element, so
// there's nothing else it can break. A counter (not a boolean) handles
// more than one dialog being open at a time correctly.
let openDialogCount = 0;

function setOverlayLowered(lowered) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.zIndex = lowered ? OVERLAY_Z_INDEX_LOWERED : OVERLAY_Z_INDEX_NORMAL;
}

function onDialogOpened() {
  if (!isMobileViewOpen()) return;
  openDialogCount += 1;
  setOverlayLowered(true);
}

function onDialogClosed() {
  if (!isMobileViewOpen()) return;
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) setOverlayLowered(false);
}

for (const hookName of ["renderApplicationV2", "renderApplication", "renderDialog", "renderDialogV2"]) {
  Hooks.on(hookName, onDialogOpened);
}
for (const hookName of ["closeApplicationV2", "closeApplication", "closeDialog", "closeDialogV2"]) {
  Hooks.on(hookName, onDialogClosed);
}

export function isMobileViewOpen() {
  return Boolean(document.getElementById(OVERLAY_ID));
}

export async function openMobileView(actor) {
  if (!actor) return;
  closeMobileView();
  currentActor = actor;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);

  await renderMobileView(actor);

  updateHookId = Hooks.on("updateActor", (updatedActor) => {
    if (updatedActor.id !== currentActor?.id) return;
    renderMobileView(currentActor).catch(error => {
      console.error(`${MODULE_ID} | Mobile View re-render failed`, error);
    });
  });
}

export function closeMobileView() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
  document.getElementById("ssm-mv-roll-toast")?.remove();
  document.getElementById("ssm-mv-hp-modal")?.remove();
  if (updateHookId !== null) {
    Hooks.off("updateActor", updateHookId);
    updateHookId = null;
  }
  currentActor = null;
  openDialogCount = 0;
}

async function renderMobileView(actor) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  let snapshot;
  try {
    snapshot = await extractCharacterSnapshot(actor, { portrait: actor.img });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to read actor for Mobile View`, error);
    overlay.innerHTML = `<div class="ssm-mv-error">${escapeHtml(error?.message ?? String(error))}</div>`;
    return;
  }

  // Preserve which tab was active across live re-renders.
  const activeTab = overlay.querySelector(".ssm-mv-tab.active")?.dataset.tab || "overview";

  overlay.innerHTML = `
    <div class="ssm-mv-pinned">
      <div class="ssm-mv-topbar">
        <button type="button" class="ssm-mv-close" aria-label="Close">&times;</button>
        <div class="ssm-mv-title">${escapeHtml(snapshot.summary.name)}</div>
      </div>
      <div class="ssm-mv-header">
        ${snapshot.summary.portrait ? `<img class="ssm-mv-portrait" src="${escapeAttr(snapshot.summary.portrait)}" alt="">` : ""}
        <div class="ssm-mv-headline">
          <div class="ssm-mv-classline">${escapeHtml(snapshot.summary.classList || snapshot.summary.classes || "")}</div>
          ${hpBarHtml(snapshot.resources.hp)}
          <div class="ssm-mv-stat-row">
            <span>AC ${escapeHtml(String(snapshot.summary.ac ?? "-"))}</span>
            <span class="rollable" data-roll-kind="initiative" data-roll-label="${escapeAttr(t("initiative"))}" role="button" tabindex="0">
              ${escapeHtml(t("initiative"))} ${escapeHtml(String(snapshot.summary.initiative ?? "-"))}
            </span>
            <span>${escapeHtml(t("speed"))} ${escapeHtml(String(snapshot.summary.speed ?? "-"))}</span>
          </div>
        </div>
      </div>
      <div class="ssm-mv-tabs">
        ${["overview", "actions", "spells", "inventory", "features"].map(tabId => `
          <button type="button" class="ssm-mv-tab${tabId === activeTab ? " active" : ""}" data-tab="${tabId}">
            ${escapeHtml(t(tabId))}
          </button>
        `).join("")}
      </div>
    </div>
    <div class="ssm-mv-body">
      <section class="ssm-mv-panel" data-panel="overview" ${activeTab === "overview" ? "" : "hidden"}>
        ${abilitiesGridHtml(snapshot.details.abilities)}
        ${listPanelHtml(t("saves"), snapshot.details.saves, "value", "save")}
        ${skillsPanelHtml(snapshot.details.skills)}
      </section>
      <section class="ssm-mv-panel" data-panel="actions" ${activeTab === "actions" ? "" : "hidden"}>
        ${actionsListHtml(snapshot.sections.actions)}
      </section>
      <section class="ssm-mv-panel" data-panel="spells" ${activeTab === "spells" ? "" : "hidden"}>
        ${spellSlotsHtml(snapshot.resources.spellSlots)}
        ${spellsListHtml(snapshot.sections.spells)}
      </section>
      <section class="ssm-mv-panel" data-panel="inventory" ${activeTab === "inventory" ? "" : "hidden"}>
        ${inventoryListHtml(snapshot.sections.inventory)}
      </section>
      <section class="ssm-mv-panel" data-panel="features" ${activeTab === "features" ? "" : "hidden"}>
        ${featuresListHtml(snapshot.sections.features)}
      </section>
    </div>
  `;

  overlay.querySelector(".ssm-mv-close").addEventListener("click", closeMobileView);
  const tabOrder = ["overview", "actions", "spells", "inventory", "features"];
  overlay.querySelectorAll(".ssm-mv-tab").forEach(tabButton => {
    tabButton.addEventListener("click", () => switchToTab(overlay, tabButton.dataset.tab));
  });
  wireSwipeNavigation(overlay, tabOrder);

  wireRollHandlers(overlay);
}

function switchToTab(overlay, tabId) {
  overlay.querySelectorAll(".ssm-mv-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  overlay.querySelectorAll(".ssm-mv-panel").forEach(panel => {
    panel.hidden = panel.dataset.panel !== tabId;
  });
}

// Horizontal swipe on the sheet body moves between tabs, the same way
// a native mobile app would - fitting, given what this technique is
// modeled after. Only responds to clearly-horizontal drags so normal
// vertical scrolling of the sheet content is never intercepted.
function wireSwipeNavigation(overlay, tabOrder) {
  const body = overlay.querySelector(".ssm-mv-body");
  if (!body) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;

  body.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  body.addEventListener("touchend", event => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const SWIPE_THRESHOLD = 60;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    const current = overlay.querySelector(".ssm-mv-tab.active")?.dataset.tab || tabOrder[0];
    const index = tabOrder.indexOf(current);
    if (index === -1) return;
    const nextIndex = deltaX < 0
      ? Math.min(index + 1, tabOrder.length - 1)
      : Math.max(index - 1, 0);
    if (nextIndex === index) return;
    switchToTab(overlay, tabOrder[nextIndex]);
    hapticTick();
  }, { passive: true });
}

// A very short vibration for tactile confirmation on phones that
// support it (most Android browsers; iOS Safari does not expose this
// API at all, so it's a silent no-op there).
function hapticTick(pattern = 10) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore - haptics are a nicety, never worth erroring over.
  }
}

function hpBarHtml(hp) {
  return `
    <div class="ssm-mv-hp-row" data-hp-adjust role="button" tabindex="0">
      <div class="ssm-mv-hp-bar">
        <div class="ssm-mv-hp-fill ssm-mv-hp-fill--${hp.state}" style="width:${hp.pct}%"></div>
      </div>
      <div class="ssm-mv-hp-text">${escapeHtml(String(hp.value))} / ${escapeHtml(String(hp.max))}${hp.temp ? ` (+${escapeHtml(String(hp.temp))})` : ""}</div>
    </div>
  `;
}

function abilitiesGridHtml(abilities) {
  return `
    <div class="ssm-mv-panel-head">${escapeHtml(t("abilities"))}</div>
    <div class="ssm-mv-ability-grid">
      ${(abilities ?? []).map(ability => `
        <div class="ssm-mv-ability" data-roll-kind="check" data-roll-key="${escapeAttr(ability.key)}"
          data-roll-label="${escapeAttr(`${ability.label} ${t("check")}`)}" role="button" tabindex="0">
          <span>${escapeHtml(ability.abbr)}</span>
          <strong>${escapeHtml(String(ability.score))}</strong>
          <small>${escapeHtml(ability.mod)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function listPanelHtml(title, rows, valueKey, kind) {
  const safeRows = rows ?? [];
  if (!safeRows.length) return "";
  return `
    <div class="ssm-mv-panel-head">${escapeHtml(title)}</div>
    <div class="ssm-mv-list">
      ${safeRows.map(row => `
        <div class="ssm-mv-list-row" data-roll-kind="${kind}" data-roll-key="${escapeAttr(row.key)}"
          data-roll-label="${escapeAttr(row.label)}" role="button" tabindex="0">
          <span>${escapeHtml(row.label)}</span>
          <span>${escapeHtml(row[valueKey] ?? "")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function skillsPanelHtml(skills) {
  const safeSkills = [...(skills ?? [])].sort((a, b) => a.label.localeCompare(b.label));
  if (!safeSkills.length) return "";
  return `
    <div class="ssm-mv-panel-head">${escapeHtml(t("skills"))}</div>
    <div class="ssm-mv-list">
      ${safeSkills.map(skill => `
        <div class="ssm-mv-list-row" data-roll-kind="skill" data-roll-key="${escapeAttr(skill.key)}"
          data-roll-label="${escapeAttr(skill.label)}" role="button" tabindex="0">
          <span>${escapeHtml(skill.label)}</span>
          <span>${escapeHtml(skill.mod ?? "")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function actionsListHtml(actions) {
  const safeActions = actions ?? [];
  if (!safeActions.length) return `<div class="ssm-mv-empty">${escapeHtml(t("noActions"))}</div>`;
  return safeActions.map(item => `
    <div class="ssm-mv-action">
      <div class="ssm-mv-action-name">${escapeHtml(item.name)}</div>
      <div class="ssm-mv-action-buttons">
        ${item.attackBonus ? `
          <button type="button" class="ssm-mv-roll-btn" data-roll-kind="attack" data-roll-item="${escapeAttr(item.id)}"
            data-roll-label="${escapeAttr(item.name)}">${escapeHtml(t("rollToHit"))} (${escapeHtml(item.attackBonus)})</button>
        ` : ""}
        ${item.damage ? `
          <button type="button" class="ssm-mv-roll-btn" data-roll-kind="damage" data-roll-item="${escapeAttr(item.id)}"
            data-roll-label="${escapeAttr(item.name)}">${escapeHtml(t("rollDamage"))}</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

function spellSlotsHtml(slots) {
  const safeSlots = slots ?? [];
  if (!safeSlots.length) return "";
  return `
    <div class="ssm-mv-panel-head">${escapeHtml(t("spellSlots"))}</div>
    <div class="ssm-mv-slot-row">
      ${safeSlots.map(slot => `
        <div class="ssm-mv-slot">
          <span>${escapeHtml(slot.label)}</span>
          <strong>${escapeHtml(String(slot.value))}/${escapeHtml(String(slot.max))}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function spellsListHtml(spells) {
  const safeSpells = spells ?? [];
  if (!safeSpells.length) return `<div class="ssm-mv-empty">${escapeHtml(t("noSpells"))}</div>`;

  let lastLevel = null;
  return safeSpells.map(spell => {
    const levelHeader = spell.level !== lastLevel
      ? `<div class="ssm-mv-panel-head">${escapeHtml(spell.levelLabel)}</div>`
      : "";
    lastLevel = spell.level;
    return `
      ${levelHeader}
      <details class="ssm-mv-expandable">
        <summary>
          <span>${escapeHtml(spell.name)}${spell.prepared ? "" : ` <em>(${escapeHtml(t("notPrepared"))})</em>`}</span>
          <span class="ssm-mv-expandable-meta">${escapeHtml(spell.school || "")}</span>
        </summary>
        <div class="ssm-mv-expandable-body">
          ${spell.descriptionHtml || ""}
          <div class="ssm-mv-action-buttons">
            ${spell.attackBonus ? `
              <button type="button" class="ssm-mv-roll-btn" data-roll-kind="attack" data-roll-item="${escapeAttr(spell.id)}"
                data-roll-label="${escapeAttr(spell.name)}">${escapeHtml(t("rollToHit"))} (${escapeHtml(spell.attackBonus)})</button>
            ` : ""}
            <button type="button" class="ssm-mv-roll-btn" data-roll-kind="use" data-roll-item="${escapeAttr(spell.id)}"
              data-roll-label="${escapeAttr(spell.name)}">${escapeHtml(t("cast"))}</button>
          </div>
        </div>
      </details>
    `;
  }).join("");
}

function inventoryListHtml(items) {
  const safeItems = items ?? [];
  if (!safeItems.length) return `<div class="ssm-mv-empty">${escapeHtml(t("noItems"))}</div>`;
  return safeItems.map(item => `
    <details class="ssm-mv-expandable">
      <summary>
        <span>${escapeHtml(item.name)}${item.quantity > 1 ? ` &times;${escapeHtml(String(item.quantity))}` : ""}</span>
        <span class="ssm-mv-expandable-meta">${item.equipped ? escapeHtml(t("equipped")) : ""}</span>
      </summary>
      <div class="ssm-mv-expandable-body">
        ${item.descriptionHtml || ""}
        <div class="ssm-mv-action-buttons">
          <button type="button" class="ssm-mv-roll-btn" data-roll-kind="use" data-roll-item="${escapeAttr(item.id)}"
            data-roll-label="${escapeAttr(item.name)}">${escapeHtml(t("use"))}</button>
        </div>
      </div>
    </details>
  `).join("");
}

function featuresListHtml(features) {
  const safeFeatures = features ?? [];
  if (!safeFeatures.length) return `<div class="ssm-mv-empty">${escapeHtml(t("noFeatures"))}</div>`;
  return safeFeatures.map(feature => `
    <details class="ssm-mv-expandable">
      <summary>
        <span>${escapeHtml(feature.name)}</span>
        <span class="ssm-mv-expandable-meta">${escapeHtml(feature.source || "")}</span>
      </summary>
      <div class="ssm-mv-expandable-body">
        ${feature.descriptionHtml || ""}
      </div>
    </details>
  `).join("");
}

function wireRollHandlers(overlay) {
  overlay.querySelectorAll("[data-roll-kind]").forEach(el => {
    el.addEventListener("click", () => {
      const kind = el.dataset.rollKind;
      const key = el.dataset.rollKey || null;
      const itemId = el.dataset.rollItem || null;
      const label = el.dataset.rollLabel || "";
      performAndShowRoll({ kind, key, itemId, label });
    });
  });

  overlay.querySelector("[data-hp-adjust]")?.addEventListener("click", openHpAdjustModal);
}

// A quick touch-friendly damage/heal stepper - tap the HP bar instead
// of opening Foundry's full sheet just to dock a few points of damage.
// Lives outside the overlay's own managed markup (appended to
// document.body) so it survives the overlay's innerHTML re-render if
// HP changes again (from a real hit, say) while this is still open.
function openHpAdjustModal() {
  const actor = currentActor;
  const hp = actor?.system?.attributes?.hp;
  if (!actor || !hp) return;

  document.getElementById("ssm-mv-hp-modal")?.remove();

  const modal = document.createElement("div");
  modal.id = "ssm-mv-hp-modal";
  modal.innerHTML = `
    <div class="ssm-mv-hp-modal-card">
      <div class="ssm-mv-hp-modal-title">${escapeHtml(t("adjustHp"))}</div>
      <div class="ssm-mv-hp-modal-current" data-current>${escapeHtml(String(hp.value))} / ${escapeHtml(String(hp.max))}</div>
      <div class="ssm-mv-hp-modal-grid">
        ${[-10, -5, -1, 1, 5, 10].map(delta => `
          <button type="button" class="ssm-mv-hp-modal-btn${delta < 0 ? " dmg" : " heal"}" data-hp-delta="${delta}">
            ${delta > 0 ? "+" : ""}${delta}
          </button>
        `).join("")}
      </div>
      <button type="button" class="ssm-mv-hp-modal-close">${escapeHtml(t("close"))}</button>
    </div>
  `;
  document.body.appendChild(modal);

  const currentEl = modal.querySelector("[data-current]");
  modal.querySelectorAll("[data-hp-delta]").forEach(button => {
    button.addEventListener("click", async () => {
      const delta = parseInt(button.dataset.hpDelta, 10);
      const liveHp = actor.system?.attributes?.hp;
      if (!liveHp) return;
      const next = Math.max(0, Math.min(liveHp.max, liveHp.value + delta));
      hapticTick(8);
      await actor.update({ "system.attributes.hp.value": next });
      currentEl.textContent = `${next} / ${liveHp.max}`;
    });
  });

  const close = () => modal.remove();
  modal.querySelector(".ssm-mv-hp-modal-close").addEventListener("click", close);
  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });
}

// Dice So Nice already triggers itself automatically - it hooks chat
// message creation broadly, and the roll methods we call go through
// Foundry's normal chat pipeline like any other roll. All that's
// needed here is to hold the reveal until its animation finishes,
// rather than showing the result toast while dice are still visibly
// tumbling underneath it.
async function performAndShowRoll({ kind, key, itemId, label }) {
  showRollToast({ pending: true, title: label });
  const result = await executeRoll({ kind, actor: currentActor, key, itemId });
  if (result.ok) {
    showRollToast({
      title: label,
      big: typeof result.total === "number" ? String(result.total) : t("rolled"),
      detail: typeof result.total === "number" ? t("rolledInChat") : (result.method || ""),
      flavor: result.critical ? "critical" : result.fumble ? "fumble" : ""
    });
    hapticTick(result.critical ? [15, 40, 15] : result.fumble ? 30 : 12);
  } else {
    showRollToast({ title: label, big: t("rollFailed"), detail: result.error || "", flavor: "fumble" });
    hapticTick([15, 30, 15]);
  }
}

function showRollToast({ pending, title, big, detail, flavor }) {
  let el = document.getElementById("ssm-mv-roll-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "ssm-mv-roll-toast";
    el.addEventListener("click", () => el.classList.remove("visible"));
    document.body.appendChild(el);
  }
  window.clearTimeout(rollToastTimer);
  if (pending) {
    el.className = "ssm-mv-roll-toast pending visible";
    el.innerHTML = `
      <div class="ssm-mv-roll-toast-title">${escapeHtml(title || "")}</div>
      <div class="ssm-mv-roll-toast-detail">${escapeHtml(t("rolling"))}</div>
    `;
    return;
  }
  el.className = `ssm-mv-roll-toast visible${flavor ? ` ${flavor}` : ""}`;
  el.innerHTML = `
    <div class="ssm-mv-roll-toast-title">${escapeHtml(title || "")}</div>
    <div class="ssm-mv-roll-toast-total">${escapeHtml(big)}</div>
    <div class="ssm-mv-roll-toast-detail">${escapeHtml(detail || "")}</div>
  `;
  rollToastTimer = window.setTimeout(() => el.classList.remove("visible"), 5000);
}

function t(key) {
  return game.i18n.localize(`SSM.MobileView.${key}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
