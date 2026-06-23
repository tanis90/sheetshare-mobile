# 发布流程

SheetShare Mobile 使用 tag 发版。推送到 `main` 不会自动创建公开 release。

## 一次性配置

在 `tanis90/sheetshare-mobile` 里创建这个 GitHub Actions secret：

- `FOUNDRY_PACKAGE_TOKEN`：Foundry package 编辑页里的 Package Release Token。

这个 token 只作用于 SheetShare Mobile 这个 package。它可以发布该 package 的版本元数据，
不要公开，也不要放进仓库。

## 发布新版本

1. 修改 `module.json` 里的 `version`。
2. 提交并推送到 `main`。
3. 创建并推送匹配的 tag：

```bash
git tag v0.1.1
git push origin v0.1.1
```

GitHub Action 会自动：

1. 校验 tag 和 `module.json` 版本一致。
2. 构建 `sheetshare-mobile.zip`。
3. 上传 `module.json` 和 zip 到 GitHub Release。
4. 调用 Foundry Package Release API，通知 Foundry 官方包索引新版本。

## Dry run

可以在 GitHub Actions 手动运行 `Release` workflow：

- `tag`：要验证的版本 tag，比如 `v0.1.1`
- `dry_run_foundry`：打开

这会验证 Foundry API 请求，但不会真正写入新的 Foundry package release。
