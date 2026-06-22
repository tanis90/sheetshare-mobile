import { extractCharacterSnapshot } from "./snapshot-extractor.js";

export const MODULE_ID = "sheetshare-mobile";
export const STORAGE_ROOT_NAME = "sheetshare-mobile";

const AUTO_EXPORT_SETTING = "autoExportOnActorUpdate";
const HTTP_WARNING_SETTING = "showHttpWarning";
const VIEWER_LANGUAGE_SETTING = "viewerLanguage";
const SESSION_PASSWORD_KEY = "__sheetshareMobilePassword";
const PUBLISH_FLAG = "publish";
const VIEWER_LANGUAGE_AUTO = "auto";
const VIEWER_LANGUAGE_FOUNDRY = "foundry";
const pendingExports = new Map();
const lastHashes = new Map();
let settingsRegistered = false;
let hooksRegistered = false;

export function registerSnapshotSettings() {
  if (settingsRegistered) return;
  settingsRegistered = true;

  game.settings.register(MODULE_ID, AUTO_EXPORT_SETTING, {
    name: "SSM.Settings.AutoExportName",
    hint: "SSM.Settings.AutoExportHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, HTTP_WARNING_SETTING, {
    name: "SSM.Settings.HttpWarningName",
    hint: "SSM.Settings.HttpWarningHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, VIEWER_LANGUAGE_SETTING, {
    name: "SSM.Settings.ViewerLanguageName",
    hint: "SSM.Settings.ViewerLanguageHint",
    scope: "world",
    config: true,
    type: String,
    default: VIEWER_LANGUAGE_AUTO,
    choices: {
      [VIEWER_LANGUAGE_AUTO]: "SSM.Settings.ViewerLanguageAuto",
      [VIEWER_LANGUAGE_FOUNDRY]: "SSM.Settings.ViewerLanguageFoundry",
      en: "SSM.Settings.ViewerLanguageEnglish",
      "zh-CN": "SSM.Settings.ViewerLanguageChinese"
    }
  });

  game.settings.registerMenu(MODULE_ID, "publishedSheets", {
    name: "SSM.ButtonManage",
    label: "SSM.ButtonManage",
    hint: "SheetShare Mobile published character sheet status.",
    icon: "fas fa-mobile-screen-button",
    type: PublishedSheetsApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "doctor", {
    name: "SSM.ButtonDoctor",
    label: "SSM.ButtonDoctor",
    hint: "Check SheetShare Mobile storage, viewer, and sharing readiness.",
    icon: "fas fa-stethoscope",
    type: SheetShareDoctorApp,
    restricted: true
  });
}

export function registerSnapshotHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("renderSettingsConfig", (app, html) => {
    installSettingsButtons(app, html);
  });

  Hooks.on("updateActor", (actor) => {
    if (!shouldExportFromThisClient()) return;
    if (!game.settings.get(MODULE_ID, AUTO_EXPORT_SETTING)) return;
    if (!isPublishedCharacterActor(actor)) return;
    scheduleActorExport(actor);
  });
}

export async function setActorPublished(actor, enabled) {
  assertCharacter(actor);
  if (!game.user?.isGM) throw new Error("Only a GM can publish mobile sheets.");

  const current = getPublishData(actor);
  const next = {
    ...current,
    enabled: Boolean(enabled),
    slug: current.slug || generateSlug(),
    lastExportStatus: enabled ? (current.lastExportStatus || "pending") : "disabled",
    lastExportError: enabled ? (current.lastExportError || "") : ""
  };

  await actor.setFlag(MODULE_ID, PUBLISH_FLAG, next);
  return next;
}

export function isPublishedCharacterActor(actor) {
  return actor?.type === "character" && Boolean(getPublishData(actor).enabled && getPublishData(actor).slug);
}

export function getPublishedActors() {
  return game.actors.contents
    .filter(actor => actor.type === "character" && getPublishData(actor).enabled)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

export async function exportActorSnapshot(actor, { reason = "manual", password = null } = {}) {
  assertCharacter(actor);
  if (!isPublishedCharacterActor(actor)) throw new Error(game.i18n.localize("SSM.Notifications.NotPublished"));

  const publish = getPublishData(actor);
  if (password) window[SESSION_PASSWORD_KEY] = password;
  const promptIfMissing = reason === "manual";
  const sharePassword = password || await getSessionPassword({ promptIfMissing });
  if (!sharePassword) {
    if (promptIfMissing) throw new Error(game.i18n.localize("SSM.Notifications.PasswordRequired"));
    return null;
  }

  await ensureExportDirectories();

  const snapshot = await extractCharacterSnapshot(actor);
  const lastHash = lastHashes.get(actor.id);
  if (lastHash === snapshot.contentHash && reason !== "manual") return snapshot;

  const encrypted = await encryptSnapshot(snapshot, sharePassword, publish.slug);
  await uploadJson(storageRoot(), `${publish.slug}.json`, encrypted);
  lastHashes.set(actor.id, snapshot.contentHash);

  await actor.setFlag(MODULE_ID, PUBLISH_FLAG, {
    ...publish,
    enabled: true,
    slug: publish.slug,
    lastExportedAt: encrypted.updatedAt,
    lastExportStatus: "ok",
    lastExportError: "",
    contentHash: snapshot.contentHash
  });

  return snapshot;
}

export function scheduleActorExport(actor, delay = 1000) {
  const actorId = actor.id;
  window.clearTimeout(pendingExports.get(actorId));
  pendingExports.set(actorId, window.setTimeout(() => {
    pendingExports.delete(actorId);
    exportActorSnapshot(actor, { reason: "updateActor" }).catch(async error => {
      console.error(`${MODULE_ID} | Scheduled export failed for ${actor.name}`, error);
      await recordActorError(actor, error);
      notifyError(error);
    });
  }, delay));
}

export function getActorShareUrl(actor) {
  const publish = getPublishData(actor);
  if (!publish.enabled || !publish.slug) return "";
  const url = new URL(route(`modules/${MODULE_ID}/viewer/index.html`), window.location.origin);
  url.searchParams.set("world", game.world.id);
  url.searchParams.set("s", publish.slug);
  const lang = shareUrlLanguage();
  if (lang) url.searchParams.set("lang", lang);
  return url.href;
}

export async function copyActorLink(actor) {
  const url = getActorShareUrl(actor);
  if (!url) throw new Error(game.i18n.localize("SSM.Notifications.NotPublished"));

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt(game.i18n.localize("SSM.Notifications.NoClipboard"), url);
  }
  return url;
}

export async function runStorageSelfTest() {
  const root = storageRoot();
  const filename = "_self-test.json";
  const payload = {
    ok: true,
    module: MODULE_ID,
    world: game.world.id,
    testedAt: new Date().toISOString()
  };

  await ensureExportDirectories();
  await uploadJson(root, filename, payload);

  const response = await fetch(`${route(`${root}/${filename}`)}?ts=${Date.now()}`, {
    cache: "no-store",
    credentials: "include"
  });
  if (!response.ok) throw new Error(`Storage self-test fetch failed: HTTP ${response.status}`);

  const json = await response.json();
  if (!json?.ok || json.module !== MODULE_ID) throw new Error("Storage self-test returned unexpected content.");

  return {
    ok: true,
    url: route(`${root}/${filename}`),
    https: window.location.protocol === "https:",
    warning: window.location.protocol !== "https:" && game.settings.get(MODULE_ID, HTTP_WARNING_SETTING)
      ? game.i18n.localize("SSM.Doctor.HttpWarning")
      : ""
  };
}

export function openPublishedSheetsManager() {
  new PublishedSheetsApp().render(true);
}

export function openSheetShareDoctor() {
  new SheetShareDoctorApp().render(true);
}

function shouldExportFromThisClient() {
  return Boolean(game.user?.isGM);
}

async function recordActorError(actor, error) {
  try {
    const publish = getPublishData(actor);
    await actor.setFlag(MODULE_ID, PUBLISH_FLAG, {
      ...publish,
      lastExportStatus: "error",
      lastExportError: error?.message ?? String(error)
    });
  } catch (flagError) {
    console.warn(`${MODULE_ID} | Failed to record actor export error`, flagError);
  }
}

function getPublishData(actor) {
  return foundry.utils.deepClone(actor?.getFlag?.(MODULE_ID, PUBLISH_FLAG) ?? {});
}

function assertCharacter(actor) {
  if (!actor || actor.type !== "character") throw new Error("Only character actors can be published.");
}

async function getSessionPassword({ promptIfMissing = false } = {}) {
  const existing = window[SESSION_PASSWORD_KEY];
  if (existing) return existing;
  if (!promptIfMissing) return "";

  const password = window.prompt(game.i18n.localize("SSM.PasswordPrompt"));
  if (!password) return "";
  window[SESSION_PASSWORD_KEY] = password;
  return password;
}

async function ensureExportDirectories() {
  await ensureDirectory("assets");
  await ensureDirectory(`assets/${STORAGE_ROOT_NAME}`);
  await ensureDirectory(storageRoot());
}

async function ensureDirectory(path) {
  try {
    await FilePicker.createDirectory("data", path, { notify: false });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/exist|EEXIST|already/i.test(message)) throw error;
  }
}

async function uploadJson(path, filename, value) {
  const json = JSON.stringify(value, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const file = new File([blob], filename, { type: blob.type });
  return FilePicker.upload("data", path, file, { overwrite: true }, { notify: false });
}

async function encryptSnapshot(snapshot, password, slug) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    schema: "sheetshare-mobile.encrypted-snapshot.v1",
    moduleVersion: game.modules.get(MODULE_ID)?.version || "0.1.0",
    worldId: game.world.id,
    slug,
    updatedAt: new Date().toISOString(),
    language: {
      mode: viewerLanguageMode(),
      foundry: normalizeViewerLanguage(game.i18n?.lang),
      url: shareUrlLanguage()
    },
    crypto: {
      kdf: "PBKDF2",
      hash: "SHA-256",
      iterations: 250000,
      salt: bytesToBase64(salt),
      algorithm: "AES-GCM",
      iv: bytesToBase64(iv)
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function storageRoot() {
  return `assets/${STORAGE_ROOT_NAME}/${game.world.id}`;
}

function route(path) {
  const cleaned = String(path).replace(/^\/+/, "");
  if (foundry.utils.getRoute) return foundry.utils.getRoute(cleaned);
  return `${window.location.origin}/${cleaned}`;
}

function viewerLanguageMode() {
  try {
    return game.settings.get(MODULE_ID, VIEWER_LANGUAGE_SETTING) || VIEWER_LANGUAGE_AUTO;
  } catch {
    return VIEWER_LANGUAGE_AUTO;
  }
}

function shareUrlLanguage() {
  const mode = viewerLanguageMode();
  if (mode === VIEWER_LANGUAGE_AUTO) return "";
  if (mode === VIEWER_LANGUAGE_FOUNDRY) return normalizeViewerLanguage(game.i18n?.lang);
  return normalizeViewerLanguage(mode);
}

function normalizeViewerLanguage(value) {
  const text = String(value || "").toLowerCase();
  if (text.startsWith("zh") || text.startsWith("cn")) return "zh-CN";
  return "en";
}

function generateSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function notifyError(error) {
  const message = error?.message ?? String(error);
  ui.notifications?.error?.(game.i18n.format("SSM.Notifications.Error", { error: message }));
}

function installSettingsButtons(app, html) {
  const root = resolveHtmlElement(html) || resolveHtmlElement(app?.element);
  if (!root || root.dataset.sheetshareMobileObserver === "true") {
    injectSettingsButtons(root);
    return;
  }

  root.dataset.sheetshareMobileObserver = "true";
  injectSettingsButtons(root);
  const observer = new MutationObserver(() => injectSettingsButtons(root));
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("click", () => window.setTimeout(() => injectSettingsButtons(root), 0));
}

function injectSettingsButtons(root) {
  if (!root) return;

  const existing = root.querySelector(".sheetshare-mobile-settings-actions");
  const pane = findSheetShareSettingsPane(root);
  if (!pane) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const anchor = findSettingsAnchor(pane);
  if (!anchor) return;

  const actions = document.createElement("div");
  actions.className = "sheetshare-mobile-settings-actions";
  actions.innerHTML = `
    <button type="button" data-sheetshare-action="manager">
      <i class="fa-solid fa-mobile-screen-button"></i>
      <span>${escapeHtml(game.i18n.localize("SSM.ButtonManage"))}</span>
    </button>
    <button type="button" data-sheetshare-action="doctor">
      <i class="fa-solid fa-stethoscope"></i>
      <span>${escapeHtml(game.i18n.localize("SSM.ButtonDoctor"))}</span>
    </button>
  `;
  actions.querySelector('[data-sheetshare-action="manager"]').addEventListener("click", () => openPublishedSheetsManager());
  actions.querySelector('[data-sheetshare-action="doctor"]').addEventListener("click", () => openSheetShareDoctor());

  anchor.before(actions);
}

function findSheetShareSettingsPane(root) {
  const activeCategory = Array.from(root.querySelectorAll("button.active, [aria-selected='true']"))
    .find(element => (element.textContent || "").includes("SheetShare Mobile"));
  if (!activeCategory) return null;

  const pane = root.querySelector(".tab.scrollable.active") || root;
  const text = pane.textContent || "";
  const hasSheetShareSettings = text.includes("Auto-refresh on actor updates")
    || text.includes("Actor 更新时自动刷新")
    || text.includes("Warn when sharing over HTTP")
    || text.includes("HTTP 分享警告")
    || text.includes("Viewer language")
    || text.includes("分享页语言");
  return hasSheetShareSettings ? pane : null;
}

function findSettingsAnchor(root) {
  const labels = Array.from(root.querySelectorAll("label, h2, h3, h4, p, div"));
  const marker = labels.find(element => {
    const text = element.textContent || "";
    return text.includes("Auto-refresh on actor updates")
      || text.includes("Actor 更新时自动刷新")
      || text.includes("Warn when sharing over HTTP")
      || text.includes("HTTP 分享警告");
  });
  return marker?.closest(".form-group") || marker;
}

function resolveHtmlElement(value) {
  if (!value) return null;
  if (value instanceof HTMLElement) return value;
  if (value[0] instanceof HTMLElement) return value[0];
  if (value.element instanceof HTMLElement) return value.element;
  if (value.element?.[0] instanceof HTMLElement) return value.element[0];
  return null;
}

class PublishedSheetsApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sheetshare-mobile-manager",
      title: game.i18n.localize("SSM.ManagerTitle"),
      width: 720,
      height: "auto",
      resizable: true
    });
  }

  async _renderInner(data) {
    const actors = game.actors.contents
      .filter(actor => actor.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const rows = actors.map(actor => {
      const publish = getPublishData(actor);
      const url = getActorShareUrl(actor);
      return `
        <tr data-actor-id="${actor.id}">
          <td><strong>${escapeHtml(actor.name)}</strong></td>
          <td>${escapeHtml(game.i18n.localize(publish.enabled ? "SSM.Manager.Published" : "SSM.Manager.Private"))}</td>
          <td>${escapeHtml(publish.lastExportStatus || "-")}</td>
          <td>${escapeHtml(formatDate(publish.lastExportedAt))}</td>
          <td class="sheetshare-mobile-actions">
            <button type="button" data-action="publish">${escapeHtml(game.i18n.localize(publish.enabled ? "SSM.Manager.Refresh" : "SSM.Manager.Publish"))}</button>
            ${publish.enabled ? `<button type="button" data-action="copy">${escapeHtml(game.i18n.localize("SSM.Manager.CopyLink"))}</button>` : ""}
            ${publish.enabled ? `<button type="button" data-action="unpublish">${escapeHtml(game.i18n.localize("SSM.Manager.Unpublish"))}</button>` : ""}
          </td>
        </tr>
        ${publish.lastExportError ? `<tr><td colspan="5" class="sheetshare-mobile-error">${escapeHtml(publish.lastExportError)}</td></tr>` : ""}
      `;
    }).join("");

    const content = `
      <section class="sheetshare-mobile-manager">
        <p>${escapeHtml(game.i18n.localize("SSM.Manager.Intro"))}</p>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(game.i18n.localize("SSM.Manager.Character"))}</th>
              <th>${escapeHtml(game.i18n.localize("SSM.Manager.Visibility"))}</th>
              <th>${escapeHtml(game.i18n.localize("SSM.Manager.Status"))}</th>
              <th>${escapeHtml(game.i18n.localize("SSM.Manager.LastExport"))}</th>
              <th>${escapeHtml(game.i18n.localize("SSM.Manager.Actions"))}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5">${escapeHtml(game.i18n.localize("SSM.Manager.NoCharacters"))}</td></tr>`}</tbody>
        </table>
      </section>
    `;
    return $(content);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action]").on("click", async event => {
      const button = event.currentTarget;
      const action = button.dataset.action;
      const row = button.closest("[data-actor-id]");
      const actor = row ? game.actors.get(row.dataset.actorId) : null;
      try {
        if (!actor) return;
        if (action === "publish") {
          if (!isPublishedCharacterActor(actor)) await setActorPublished(actor, true);
          await exportActorSnapshot(actor, { reason: "manual" });
          this.render(false);
        } else if (action === "copy") {
          await copyActorLink(actor);
        } else if (action === "unpublish") {
          await setActorPublished(actor, false);
          this.render(false);
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Manager action failed`, error);
        notifyError(error);
      }
    });
  }
}

class SheetShareDoctorApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sheetshare-mobile-doctor",
      title: game.i18n.localize("SSM.Doctor.Title"),
      width: 680,
      height: "auto",
      resizable: true
    });
  }

  async _renderInner(data) {
    const content = `
      <section class="sheetshare-mobile-doctor">
        <p>${escapeHtml(game.i18n.localize("SSM.Doctor.Intro"))}</p>
        <div class="sheetshare-mobile-toolbar">
          <button type="button" data-action="run-doctor">${escapeHtml(game.i18n.localize("SSM.Doctor.Run"))}</button>
          <span class="sheetshare-mobile-test-result"></span>
        </div>
        <div class="sheetshare-mobile-doctor-results">
          ${doctorRowsHtml(buildStaticDoctorRows())}
        </div>
      </section>
    `;
    return $(content);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="run-doctor"]').on("click", async () => {
      const status = html.find(".sheetshare-mobile-test-result");
      const results = html.find(".sheetshare-mobile-doctor-results");
      try {
        status.text(game.i18n.localize("SSM.Doctor.Running"));
        const rows = await runDoctorChecks();
        results.html(doctorRowsHtml(rows));
        status.text(game.i18n.localize("SSM.Doctor.Done"));
      } catch (error) {
        console.error(`${MODULE_ID} | Doctor failed`, error);
        status.text(error?.message ?? String(error));
        notifyError(error);
      }
    });
  }
}

async function runDoctorChecks() {
  const rows = buildStaticDoctorRows();

  try {
    const storage = await runStorageSelfTest();
    rows.push({
      name: game.i18n.localize("SSM.Doctor.StorageReadWrite"),
      status: "ok",
      detail: storage.warning || game.i18n.format("SSM.Doctor.Readable", { url: storage.url })
    });
  } catch (error) {
    rows.push({
      name: game.i18n.localize("SSM.Doctor.StorageReadWrite"),
      status: "error",
      detail: error?.message ?? String(error)
    });
  }

  try {
    const viewerUrl = route(`modules/${MODULE_ID}/viewer/index.html`);
    const response = await fetch(`${viewerUrl}?doctor=${Date.now()}`, {
      cache: "no-store",
      credentials: "include"
    });
    rows.push({
      name: game.i18n.localize("SSM.Doctor.ViewerAssets"),
      status: response.ok ? "ok" : "error",
      detail: response.ok
        ? game.i18n.format("SSM.Doctor.Readable", { url: viewerUrl })
        : game.i18n.format("SSM.Doctor.HttpStatus", { status: response.status, url: viewerUrl })
    });
  } catch (error) {
    rows.push({
      name: game.i18n.localize("SSM.Doctor.ViewerAssets"),
      status: "error",
      detail: error?.message ?? String(error)
    });
  }

  return rows;
}

function buildStaticDoctorRows() {
  const oldModuleActive = Boolean(game.modules.get("cn5e-sheet-export")?.active);
  const publishedActors = getPublishedActors();
  return [
    {
      name: game.i18n.localize("SSM.Doctor.ModuleActive"),
      status: game.modules.get(MODULE_ID)?.active ? "ok" : "error",
      detail: `${MODULE_ID} ${game.modules.get(MODULE_ID)?.version || ""}`.trim()
    },
    {
      name: game.i18n.localize("SSM.Doctor.FoundrySystem"),
      status: "info",
      detail: `Foundry ${game.version}, ${game.system.id} ${game.system.version}`
    },
    {
      name: game.i18n.localize("SSM.Doctor.Protocol"),
      status: window.location.protocol === "https:" ? "ok" : "warn",
      detail: window.location.protocol === "https:"
        ? game.i18n.localize("SSM.Doctor.Https")
        : game.i18n.localize("SSM.Doctor.HttpWarning")
    },
    {
      name: game.i18n.localize("SSM.Doctor.PublishedActors"),
      status: publishedActors.length ? "ok" : "warn",
      detail: game.i18n.format("SSM.Doctor.PublishedCount", { count: publishedActors.length })
    },
    {
      name: game.i18n.localize("SSM.Doctor.LegacyModule"),
      status: oldModuleActive ? "warn" : "ok",
      detail: game.i18n.localize(oldModuleActive ? "SSM.Doctor.LegacyActive" : "SSM.Doctor.LegacyInactive")
    }
  ];
}

function doctorRowsHtml(rows) {
  return `
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(game.i18n.localize("SSM.Doctor.Check"))}</th>
          <th>${escapeHtml(game.i18n.localize("SSM.Doctor.Status"))}</th>
          <th>${escapeHtml(game.i18n.localize("SSM.Doctor.Detail"))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="sheetshare-mobile-doctor-${escapeHtml(row.status)}">
            <td><strong>${escapeHtml(row.name)}</strong></td>
            <td>${escapeHtml(row.status.toUpperCase())}</td>
            <td>${escapeHtml(row.detail)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}
