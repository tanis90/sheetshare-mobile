import { openMobileView, closeMobileView, isMobileViewOpen } from "./mobile-view.js";
import { registerForcedMobileViewSettings, initForcedMobileView } from "./forced-mobile-view.js";

const MODULE_ID = "sheetshare-mobile";
const AUTO_OPEN_SETTING = "autoOpenMobileView";

Hooks.once("init", () => {
  // "client" scope: stored in this specific browser, not synced across
  // devices or other players - exactly what a "remember this on my
  // phone" toggle needs. Turn it on once from that phone's browser and
  // every future visit goes straight to just the sheet.
  game.settings.register(MODULE_ID, AUTO_OPEN_SETTING, {
    name: "SSM.MobileView.autoOpenName",
    hint: "SSM.MobileView.autoOpenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  registerForcedMobileViewSettings();
  initForcedMobileView();
});

Hooks.once("ready", () => {
  injectFloatingButton();
  Hooks.on("controlToken", injectFloatingButton);

  if (game.settings.get(MODULE_ID, AUTO_OPEN_SETTING) && game.user.character) {
    openMobileView(game.user.character).catch(error => {
      console.error(`${MODULE_ID} | Failed to auto-open Mobile View`, error);
    });
  }
});

// A small always-available button, independent of any specific sheet
// being open, so a player on their phone can jump straight into their
// own character's Mobile View without first navigating Foundry's full
// (not exactly mobile-friendly) UI. Still useful even with auto-open on,
// as a way to get back in if they close it.
function injectFloatingButton() {
  if (document.getElementById("ssm-floating-button")) return;
  const character = game.user.character;
  if (!character) return;

  const button = document.createElement("button");
  button.id = "ssm-floating-button";
  button.type = "button";
  button.title = game.i18n.localize("SSM.MobileView.openButton");
  button.innerHTML = `<i class="fa-solid fa-mobile-screen-button"></i>`;
  button.addEventListener("click", () => {
    if (isMobileViewOpen()) {
      closeMobileView();
    } else {
      openMobileView(character).catch(error => {
        console.error(`${MODULE_ID} | Failed to open Mobile View`, error);
        ui.notifications.error(error?.message ?? String(error));
      });
    }
  });
  document.body.appendChild(button);
}

// Also available from any actor sheet's own header, for the GM looking
// at an NPC, or a player opening a sheet they don't have assigned as
// their primary character.
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const actor = app.document;
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") return;
  if (!actor.isOwner) return;

  controls.push({
    icon: "fa-solid fa-mobile-screen-button",
    label: game.i18n.localize("SSM.MobileView.openButton"),
    action: "ssmOpenMobileView",
    onClick: () => openMobileView(actor).catch(error => {
      console.error(`${MODULE_ID} | Failed to open Mobile View`, error);
      ui.notifications.error(error?.message ?? String(error));
    })
  });
});
