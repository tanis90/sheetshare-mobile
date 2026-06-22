import {
  copyActorLink,
  exportActorSnapshot,
  getActorShareUrl,
  isPublishedCharacterActor,
  openSheetShareDoctor,
  openPublishedSheetsManager,
  registerSnapshotHooks,
  registerSnapshotSettings,
  runStorageSelfTest,
  setActorPublished
} from "./snapshot-exporter.js";

const MODULE_ID = "sheetshare-mobile";
const PUBLISH_ACTION = `${MODULE_ID}-publish`;
const REFRESH_ACTION = `${MODULE_ID}-refresh`;
const COPY_ACTION = `${MODULE_ID}-copy`;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
  registerSnapshotSettings();
  registerSnapshotHooks();
});

Hooks.once("ready", () => {
  registerSnapshotSettings();
  registerSnapshotHooks();
  game.modules.get(MODULE_ID).api = {
    copyActorLink,
    exportActorSnapshot,
    getActorShareUrl,
    openSheetShareDoctor,
    openPublishedSheetsManager,
    runStorageSelfTest,
    setActorPublished
  };
});

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  tryAddSheetShareControls(app, controls);
});

function tryAddSheetShareControls(app, controls) {
  const actor = app?.actor ?? app?.document;
  if (!actor) return;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2)) return;
  if (actor.type !== "character") return;
  if (!game.user?.isGM) return;

  const published = isPublishedCharacterActor(actor);

  if (published && !controls.some(c => c.action === COPY_ACTION)) {
    controls.unshift({
      action: COPY_ACTION,
      label: game.i18n.localize("SSM.ButtonCopyLink"),
      icon: "fa-solid fa-link",
      visible: true,
      onClick: () => copyActorLink(actor)
    });
  }

  controls.unshift({
    action: published ? REFRESH_ACTION : PUBLISH_ACTION,
    label: game.i18n.localize(published ? "SSM.ButtonRefresh" : "SSM.ButtonPublish"),
    icon: published ? "fa-solid fa-rotate" : "fa-solid fa-mobile-screen-button",
    visible: true,
    onClick: async () => {
      try {
        if (!isPublishedCharacterActor(actor)) await setActorPublished(actor, true);
        await exportActorSnapshot(actor, { reason: "manual" });
      } catch (error) {
        console.error(`${MODULE_ID} | Publish failed`, error);
        notifyError(error);
      }
    }
  });
}

function notifyError(error) {
  const message = error?.message ?? String(error);
  ui.notifications?.error?.(game.i18n.format("SSM.Notifications.Error", { error: message }));
}
