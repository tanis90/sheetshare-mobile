# Changelog

## Unreleased

## 0.5.0 - 2026-09-28

### Fixes

- Publish successfully in External Auth mode on plain HTTP deployments: change detection and portrait naming fall back to a non-cryptographic dual-lane FNV-1a digest when WebCrypto is unavailable, and the `contentHash` prefix records which algorithm produced it (`sha256:` or `fnv1a64:`). The fallback is never used for encryption or key derivation (#2).
- Fail with a clear "HTTPS or localhost required" message when password mode is attempted without WebCrypto, instead of crashing with `Cannot read properties of undefined (reading 'digest')` (#2).
- Replace `window.prompt` with Foundry `DialogV2` windows for the share password prompt and the copy-link fallback, so publishing in password mode and copying links work in Electron hosts (including the official Foundry desktop client) and on plain HTTP pages (#3).
- Make unpublishing revoke access: the snapshot file is overwritten with a revoked marker document, existing direct links stop working immediately (the viewer shows an "unpublished" notice, including on already-open tabs), and the manager asks for confirmation first (#4).

### Documentation

- Add an "Access modes and exposure surface" section to both READMEs covering what each mode protects, the public `_latest.json` index (random slugs are not access control), the revocation semantics of unpublish, a minimal nginx reverse-proxy example, portrait media cleanup, and how to read the Doctor warnings (#5).

## 0.4.1 - 2026-09-15

### Documentation

- Add the MIT `LICENSE` file, declare `license` in the module manifest, and add license sections to the READMEs.
- Ship the `LICENSE` file inside the release zip and remove the deprecated `cn` language code, keeping `zh-cn` for Simplified Chinese.

## 0.4.0 - 2026-08-17

### Features

- Export the Actor's inspiration state and show a glowing Heroic Inspiration chip on the shared character sheet when it is active.

### Fixes

- Keep the inspiration indicator to a single chip beneath the character name and hide it completely when inspiration is inactive.

## 0.3.0 - 2026-08-14

### Features

- Render Foundry inline dice formulas as static display chips in snapshot descriptions and route inline embeds through the existing reference preview flow.

### Fixes

- Style static detail facts and dice formulas as square gold chips, keeping round red pills exclusively for clickable references.

## 0.2.0 - 2026-08-13

### Features

- Redesign the mobile viewer with a clearer identity card, denser combat summary, grouped traits, polished loading and unlock states, and responsive reference panels.
- Group skills by governing ability, keep zero-modifier rows visible, distinguish proficiency from expertise, and render small groups as compact full-width strips.
- Publish sheets with readable world-scoped Actor keys, stable aliases, collision checks, primary-GM ready refreshes, and content-addressed portrait mirrors.

### Fixes

- Improve viewer typography, contrast, accessibility, HP and spell-slot states, stat-grid consistency, and skill-card alignment across desktop and mobile layouts.
- Keep export and update timestamps as internal snapshot metadata instead of displaying freshness to players.
- Preserve previously published Actor keys as aliases while migrating to the safer world-scoped key format.

## 0.1.2 - 2026-07-03

### Features

- Write a `_latest.json` index for published sheets so external portals can resolve stable character keys to the latest exported snapshot.
- Refresh published sheets after item and active effect changes, not only actor updates.

### Fixes

- Use prepared D&D 5e weapon activity attack bonuses for mobile sheet attack summaries, so effects such as Archery and magic weapons are included.

## 0.1.1 - 2026-07-01

### Features

- Add external-auth share mode for portal or reverse-proxy protected deployments.
- Add inline `@UUID[...]` reference previews with a desktop side panel and mobile bottom sheet.
- Add combat summary stats, resistance summary, passive perception, temporary hit points, and clearer resource counts to the mobile sheet.

### Fixes

- Localize Foundry trait labels such as languages, damage traits, and condition immunities in exported snapshots.
- Avoid the unlock screen flashing while a remembered sheet is loading.
- Improve compact mobile layout for speed, resistance, and resource displays.

## 0.1.0 - 2026-06-23

### Features

- Initial public release of SheetShare Mobile.
- Publish mobile-first D&D 5e character sheets from Foundry actors.
- Share encrypted, password-protected static snapshots without requiring player Foundry login.
- Support English and Simplified Chinese module and viewer UI.
- Remember unlocked sheets on the player's device until the GM changes the share password or the player clicks Lock.
- Provide manager and Doctor panels in Foundry settings.
