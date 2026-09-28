> **⚠️ This repository has moved.** SheetShare Mobile is now developed and released inside the
> [arcanedesk-fvtt-mods monorepo](https://github.com/tanis90/arcanedesk-fvtt-mods/tree/main/modules/sheetshare-mobile).
> This standalone repository is frozen and will be archived. To install the current version, use the
> monorepo manifest: `https://raw.githubusercontent.com/tanis90/arcanedesk-fvtt-mods/main/modules/sheetshare-mobile/module.json`
> (or grab it from the [arcanedesk-fvtt-mods releases](https://github.com/tanis90/arcanedesk-fvtt-mods/releases)).
> Existing installs tracking this repo's manifest will not receive updates automatically — reinstall from the new manifest.

# SheetShare Mobile

[中文说明](README-zh.md)

Mobile-first character sheet sharing for Foundry VTT. The default mode uses password-protected encrypted snapshots; trusted portal deployments can opt into External Auth.

SheetShare Mobile lets a GM publish a clean mobile character sheet from a Foundry actor. Players open a shared link, enter the table password, and read the sheet on a phone without logging in to Foundry.

![Wizard mobile overview](docs/screenshots/viewer-wizard-overview.png)

## Features

- Mobile-first D&D 5e character sheet viewer
- GM-controlled publishing per character
- Password-protected encrypted static snapshots by default
- Optional External Auth mode for reverse-proxy or portal-protected deployments
- No public character index
- Device-local password memory for opened sheets
- Auto-refresh after published actors, items, or active effects change
- English and Simplified Chinese UI
- Manager and Doctor panels in Foundry settings

Character names, item names, spell names, and descriptions come from your Foundry world data. If your world uses a translation module, the published content follows that setup.

## Requirements

- Foundry VTT v13
- D&D 5e system 5.3+
- A modern browser with WebCrypto support (required for password mode; External Auth mode also works over plain HTTP)
- HTTPS for public sharing

Local HTTP works for testing, but public links should be served over HTTPS.

## Installation

### From a release zip

1. Download the latest `sheetshare-mobile.zip`.
2. Extract it to your Foundry data folder:

   ```text
   Data/modules/sheetshare-mobile
   ```

3. Restart Foundry or reload the setup page.
4. Enable **SheetShare Mobile** in your world.

### From source

Clone this repository into your Foundry modules directory:

```powershell
cd D:\FVTT_DATA\Data\modules
git clone https://github.com/tanis90/sheetshare-mobile.git sheetshare-mobile
```

Then enable **SheetShare Mobile** in the world module list.

## Usage

1. Log in as GM.
2. Open a character actor sheet.
3. Click **Publish to Mobile** in the sheet header.
4. Enter the table share password.
5. Click **Copy Mobile Link** and send the link plus password to the player.

Published sheets can be refreshed from the actor sheet header or from the manager panel.

The first publication assigns a stable, human-readable key in the form `<world>-<character-name>`. Unicode names remain readable (for example, `dragonlance-黎安娜-晨盾`), explicit keys are not rewritten, and a short actor-id is appended only when that readable key is already in use. Pure-Chinese actors carrying the legacy `character` fallback migrate automatically on their next refresh.

After a successful unlock, the player viewer remembers that sheet on the same browser. Refreshing or reopening the link unlocks automatically until the GM republishes with a different password. Use **Lock** on shared devices to clear the saved password.

![DM publishing Wizard to mobile](docs/screenshots/dm-publish-flow.png)

Players open the link on a phone, unlock it with the table password, and get a mobile-first read-only sheet.

If your site already protects the viewer and snapshot assets behind a portal or reverse proxy, switch **Access mode** to **External Auth / trusted portal**. In that mode the GM publishes trusted snapshots and players do not enter a SheetShare password.

External Auth worlds automatically refresh published sheets when the primary GM reaches `ready`. Publication identity checks, clone/import behavior, and world-scoped portrait mirroring are documented in [Publishing lifecycle and portal media](docs/PUBLISHING-LIFECYCLE.md).

## Player Sheet Preview

The shared sheet is the main experience: players get a touch-friendly read-only character sheet with quick access to stats, spell slots, resources, spells, actions, and feature references.

| Stats and skills | Spells |
| --- | --- |
| ![Wizard stats and skills](docs/screenshots/viewer-wizard-overview-stats.png) | ![Wizard spells](docs/screenshots/viewer-wizard-spells.png) |

| Actions | Features |
| --- | --- |
| ![Wizard actions](docs/screenshots/viewer-wizard-actions.png) | ![Wizard features](docs/screenshots/viewer-wizard-features.png) |

## Settings

Open **Game Settings > Configure Settings > SheetShare Mobile**.

Available settings:

- **Auto-refresh published sheets**: refreshes published sheets after actor, item, or active effect changes while a GM browser has the share password in memory.
- **Warn when sharing over HTTP**: shows a Doctor warning when the current Foundry page is not using HTTPS.
- **Viewer language**: choose browser auto-detection, the Foundry world language, English, or Simplified Chinese.
- **Access mode**: use password-protected encrypted snapshots, or External Auth for deployments where `/modules/sheetshare-mobile/viewer` and `/assets/sheetshare-mobile` are already protected by your portal or reverse proxy.

The settings page also exposes:

- **Published Sheets**: manage published characters, copy links, refresh, or unpublish.
- **Doctor**: check storage, viewer assets, protocol, and common setup problems.

## Security

### Access modes and exposure surface

The two access modes protect different things, and neither makes the published files secret on its own:

| | Password mode (default) | External Auth mode |
| --- | --- | --- |
| Snapshot on disk | AES-GCM encrypted (PBKDF2 + WebCrypto) | Plaintext trusted snapshot |
| What enforces access | The share password, entered in the viewer | **Your deployment** — a reverse proxy or portal in front of Foundry |
| Requires secure context (HTTPS/localhost) | Yes, on both GM and player side | No — publishing itself works over plain HTTP |

Things every GM should know before sharing links:

1. **`_latest.json` is a public index.** Anyone who can reach your world URL can request `assets/sheetshare-mobile/<world>/_latest.json` and read every published character's `name` and `slug`. The random slug is a stable identifier, **not** access control: with the slug anyone can assemble the viewer link. The module's own viewer does not use this index (share links point directly at `<slug>.json`); it exists for external tooling, so treat it as published data.
2. **External Auth snapshots are plaintext.** Without an outer auth layer, `_latest.json` plus direct snapshot URLs means "anyone who knows the server address can enumerate and read every published sheet." Only use this mode behind a reverse proxy or portal.
3. **Unpublishing revokes links.** Since v0.5.0, unpublishing replaces the snapshot file with a revoked marker document, so existing direct links immediately stop serving the character (the viewer shows an "unpublished" notice). Portrait files under `media/` are content-addressed and remain on disk; Foundry 13 has no client API for deleting data files, so clean them up manually if needed (see below).
4. **Deleting a published actor does not revoke its link.** Deleting the actor removes its flags but leaves the snapshot file served. Unpublish first, then delete the actor.
5. **Password mode needs WebCrypto**, which browsers only expose in secure contexts. Over plain HTTP on a LAN IP, publishing in password mode fails with a clear "HTTPS or localhost required" message. External Auth mode keeps working: its hashing (change detection, portrait naming) automatically falls back to a non-cryptographic digest that is never used for encryption.

### Minimal reverse-proxy example

For External Auth mode, protect the viewer and the snapshot assets together. Anything outside these prefixes (the Foundry app itself) can use your normal authentication:

```nginx
# requires auth for the mobile viewer and its snapshot assets
location ~ ^/(modules/sheetshare-mobile/(viewer/)?|assets/sheetshare-mobile/) {
    auth_basic "SheetShare Mobile";
    auth_basic_user_file /etc/nginx/foundry_sheetshare.htpasswd;
    proxy_pass http://127.0.0.1:30000;
    proxy_set_header Host $host;
}
```

Players then authenticate with the portal user/password before the viewer loads.

### Cleaning up portrait media

Portrait files live at `Data/assets/sheetshare-mobile/<world>/media/<digest>.<ext>`. To find files no longer referenced by any published character, compare the directory listing against the `portrait` values in `assets/sheetshare-mobile/<world>/_latest.json` and delete the leftovers while Foundry is stopped. Do not delete files that are still listed — they are the current portraits of published sheets.

### How to read the Doctor checks

- **Protocol / HTTP warning**: the Foundry page is served over plain HTTP. Fine for local testing; public sharing should be HTTPS (and password mode requires it — see above).
- **Access mode / External Auth warning**: a reminder that trusted snapshots are unprotected unless `/modules/sheetshare-mobile/viewer` and `/assets/sheetshare-mobile` sit behind your own authentication. The warning appearing does not mean the protection exists — verify it yourself, for example by opening a share link in a private browser window without portal credentials.

### Password handling details

Each published character sheet is stored as an encrypted static snapshot. The password is not placed in the URL and is not sent to the server by the viewer. Directly opening the JSON snapshot does not reveal the character sheet.

For convenience, the viewer can remember the password locally on the player's device after a successful unlock. This local password is cleared by **Lock**, and it stops working if the GM republishes with a different password.

Use HTTPS for public sharing so the link and password entry page are protected in transit.

External Auth mode writes trusted readable snapshots. Only enable it when an outer authentication layer protects both the viewer and `Data/assets/sheetshare-mobile`; otherwise anyone who can fetch the JSON can read the published sheet.

## Language

SheetShare Mobile has English and Simplified Chinese UI for both the Foundry module and the mobile viewer.

The viewer language is selected in this order:

1. `lang` in the share URL
2. the GM's viewer language setting
3. the player's browser language

The actor content language is controlled by the GM's Foundry world data and installed translation modules.

## Troubleshooting

- Run **Doctor** from the module settings page first.
- If storage fails, make sure Foundry can write and serve files under `Data/assets/sheetshare-mobile`.
- If public sharing shows an HTTP warning, put Foundry behind an HTTPS reverse proxy.
- If links still show an old UI after updating the module, reload the browser and restart Foundry.
- If you previously used `cn5e-sheet-export`, disable it to avoid duplicate sheet controls.

## Maintainers

Release instructions are in [docs/RELEASE.md](docs/RELEASE.md).

## Current Scope

The first public target focuses on the common single-GM workflow. Published character sheets auto-refresh after actor, item, and active effect changes while a GM browser is online.

## License

This project is licensed under the [MIT License](LICENSE). The bundled `viewer/assets/alpine.min.js` is [Alpine.js](https://alpinejs.dev/), licensed under the MIT License.
