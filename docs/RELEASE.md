# Release Workflow

SheetShare Mobile releases are tag based. Pushes to `main` do not create public
releases by themselves.

## One-time setup

Create this GitHub Actions secret in `tanis90/sheetshare-mobile`:

- `FOUNDRY_PACKAGE_TOKEN`: the Package Release Token from the Foundry package edit page.

The token is package scoped. Keep it private; anyone with the token can publish
package release metadata for SheetShare Mobile.

## Release a new version

1. Update `version` in `module.json`.
2. Commit and push the change to `main`.
3. Create and push a matching tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

The GitHub Action will:

1. Check that the tag matches `module.json`.
2. Build `sheetshare-mobile.zip`.
3. Upload `module.json` and the zip to a GitHub Release.
4. Notify the Foundry package registry through the Package Release API.

## Dry run

Use the manual `Release` workflow in GitHub Actions with:

- `tag`: the release tag, such as `v0.1.1`
- `dry_run_foundry`: enabled

This validates the Foundry API request without saving a new Foundry package release.
