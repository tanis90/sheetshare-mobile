import { openMobileView, closeMobileView, isMobileViewOpen } from "./mobile-view.js";

const MODULE_ID = "sheetshare-mobile";
const FORCED_USERS_SETTING = "forcedMobileUsers";

export function registerForcedMobileViewSettings() {
  // World-scoped: the GM's chosen list, visible/enforced for everyone.
  // config:false because the checkbox-per-user list is managed through
  // the menu below, not a plain settings row.
  game.settings.register(MODULE_ID, FORCED_USERS_SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // This is what actually makes it show up under Configure Settings ->
  // Module Settings, as a button, the same way the other settings do.
  // MobileViewManagerLauncher below is a minimal shim: Foundry expects
  // something it can `new` and call .render(true) on, but we don't want
  // an actual window - just our dialog - so render() is overridden to
  // open that directly instead of doing normal Application rendering.
  game.settings.registerMenu(MODULE_ID, "manageMobilePlayers", {
    name: "SSM.MobileView.managerButton",
    label: "SSM.MobileView.managerButton",
    hint: "SSM.MobileView.managerHint",
    icon: "fa-solid fa-mobile-screen-button",
    type: MobileViewManagerLauncher,
    restricted: true
  });
}

class MobileViewManagerLauncher extends FormApplication {
  render() {
    openManagerDialog();
    return this;
  }
}

export function initForcedMobileView() {
  // Apply on load, and live if the GM changes the list while you're
  // already connected - takes effect immediately, no reload needed.
  Hooks.once("ready", enforceForThisUser);
  Hooks.on("updateSetting", setting => {
    if (setting.key === `${MODULE_ID}.${FORCED_USERS_SETTING}`) enforceForThisUser();
  });
}

function isForced(userId = game.user.id) {
  const list = game.settings.get(MODULE_ID, FORCED_USERS_SETTING) ?? [];
  return list.includes(userId);
}

function enforceForThisUser() {
  try {
    if (isForced()) {
      hideFoundryChrome();
      if (game.user.character) {
        openMobileView(game.user.character).catch(error => {
          console.error(`${MODULE_ID} | Failed to open forced Mobile View`, error);
        });
      } else {
        ui.notifications.warn(game.i18n.localize("SSM.MobileView.forcedNoCharacter"));
      }
    } else {
      // GM removed you from the list (or you were never on it): make
      // sure everything is back to normal.
      if (isMobileViewOpen()) closeMobileView();
      showFoundryChrome();
    }
  } catch (error) {
    // Whatever happens here, never let it take down the rest of the
    // module - this runs on every settings change and on every login.
    console.error(`${MODULE_ID} | Forced Mobile View enforcement failed`, error);
  }
}

// Hides the game canvas and the rest of Foundry's UI chrome directly
// via CSS, rather than Foundry's own core.noCanvas setting (which
// requires a page reload to take effect and isn't guaranteed to persist
// reliably enough across that reload to be safe - getting that wrong
// risks an actual infinite reload loop, which is far worse than a
// slightly less thorough performance win). This takes effect instantly
// and can never loop, at the cost of the canvas's own render loop
// possibly still ticking in the background even though nothing paints.
function hideFoundryChrome() {
  const targets = [ui.sidebar, ui.hotbar, ui.players, ui.nav, ui.controls, ui.pause, ui.menu, ui.notifications];
  for (const app of targets) {
    try {
      const el = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
      if (el) el.style.display = "none";
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not hide a Foundry UI element`, error);
    }
  }
  document.getElementById("board")?.style.setProperty("display", "none");
}

function showFoundryChrome() {
  const targets = [ui.sidebar, ui.hotbar, ui.players, ui.nav, ui.controls, ui.pause, ui.menu, ui.notifications];
  for (const app of targets) {
    try {
      const el = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
      if (el) el.style.removeProperty("display");
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not restore a Foundry UI element`, error);
    }
  }
  document.getElementById("board")?.style.removeProperty("display");
}

async function openManagerDialog() {
  const players = game.users.contents.filter(user => !user.isGM);
  const forcedList = game.settings.get(MODULE_ID, FORCED_USERS_SETTING) ?? [];

  if (!players.length) {
    ui.notifications.info(game.i18n.localize("SSM.MobileView.managerNoPlayers"));
    return;
  }

  const rowsHtml = players.map(user => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0;">
      <input type="checkbox" name="user-${user.id}" ${forcedList.includes(user.id) ? "checked" : ""}>
      <span style="width:10px; height:10px; border-radius:50%; background:${user.color}; display:inline-block;"></span>
      ${escapeHtml(user.name)}
      ${user.character ? `<small style="opacity:0.7;">(${escapeHtml(user.character.name)})</small>` : `<small style="opacity:0.5;">${escapeHtml(game.i18n.localize("SSM.MobileView.managerNoCharacter"))}</small>`}
    </label>
  `).join("");

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SSM.MobileView.managerTitle") },
    content: `
      <p>${escapeHtml(game.i18n.localize("SSM.MobileView.managerHint"))}</p>
      <div>${rowsHtml}</div>
    `,
    buttons: [
      {
        action: "save",
        label: game.i18n.localize("SSM.MobileView.managerSave"),
        default: true,
        callback: (event, button) => {
          const selected = players
            .filter(user => button.form.elements[`user-${user.id}`]?.checked)
            .map(user => user.id);
          return game.settings.set(MODULE_ID, FORCED_USERS_SETTING, selected);
        }
      },
      { action: "cancel", label: game.i18n.localize("SSM.MobileView.managerCancel") }
    ]
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
