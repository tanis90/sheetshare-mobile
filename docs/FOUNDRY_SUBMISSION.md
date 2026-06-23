# Foundry Package Submission Notes

## Official Links

- Package directory: https://foundryvtt.com/packages/
- Module development guide: https://foundryvtt.com/article/module-development/

## Package Fields

- Package type: Add-on Module
- Package name: SheetShare Mobile
- Package id: `sheetshare-mobile`
- Author: `tanis90`
- Repository URL: https://github.com/tanis90/sheetshare-mobile
- Manifest URL: https://github.com/tanis90/sheetshare-mobile/releases/latest/download/module.json
- Download URL: https://github.com/tanis90/sheetshare-mobile/releases/download/v0.1.0/sheetshare-mobile.zip
- Latest release: https://github.com/tanis90/sheetshare-mobile/releases/tag/v0.1.0
- Minimum Foundry version: 13
- Verified Foundry version: 13
- Required system: D&D 5e
- Minimum D&D 5e system version: 5.3
- Verified D&D 5e system version: 5.3.5

## Short Description

Mobile-first, password-protected character sheet sharing for Foundry VTT.

## Longer Description

SheetShare Mobile lets a GM publish clean mobile character sheets from Foundry actors. Players open a shared link, enter the table password, and read the sheet on a phone without logging in to Foundry. Published sheets are encrypted static snapshots served by Foundry's existing web server. The viewer supports English and Simplified Chinese, remembers unlocked sheets on the player's own device, and provides manager and Doctor panels for GM setup.

## Suggested Categories

- Actor and Item Sheets
- Tools and Controls

## Review Notes

- The module does not publish any actors by default.
- Only GMs can publish, refresh, or unpublish character sheets.
- There is no public character index.
- The shared JSON snapshot is encrypted; directly opening it does not expose character sheet content.
- The share password is not placed in the URL and is not sent to the server by the viewer.
- Public sharing should be served over HTTPS.
