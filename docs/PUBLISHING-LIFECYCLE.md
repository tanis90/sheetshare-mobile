# Publishing lifecycle and portal media

## External Auth startup

When a world uses **External Auth**, the first active GM (ordered by user id) refreshes published character actors sequentially when Foundry reaches `ready`. A uniqueness preflight runs before any snapshot or `_latest.json` write. If two published actors claim the same case-insensitive, NFC-normalized `key` or `slug`, the refresh fails closed and leaves the existing index untouched.

Creating, cloning, or importing an Actor never carries publication authority forward. The primary GM clears `flags.sheetshare-mobile.publish` from every newly created Actor. The new Actor must be published explicitly.

## Portraits

During export, `actor.img` is fetched and verified by file signature. PNG, JPEG, WEBP, and GIF files up to 5 MiB are copied to a content-addressed world directory:

```text
assets/sheetshare-mobile/<encoded-world-id>/media/<64-character-sha256>.<ext>
```

That relative, world-scoped path is written to `snapshot.actor.img`, `snapshot.summary.portrait`, and `_latest.json` as `actors[].portrait`. SVG, AVIF, oversized, unreadable, and unrecognized files are not copied; the exported portrait is empty and the viewer falls back to initials.

The viewer prefixes relative media paths with the route before `/modules/`. Thus the same snapshot resolves under direct Foundry (`/assets/...`) and a campaign portal (`/quest/cos/assets/...`) without exposing arbitrary cross-world paths.

## 修复与安全规则

External Auth 世界在 Foundry `ready` 后，由排序第一的在线 GM 顺序刷新所有已发布角色。任何重复 `key` 或 `slug` 都会在写快照和 `_latest.json` 之前中止，旧索引不会被新的污染数据覆盖。

新建、克隆或导入 Actor 时会清除继承的 `flags.sheetshare-mobile.publish`；新角色必须由 GM 明确发布。头像仅镜像 5 MiB 以内、文件签名可验证的 PNG、JPEG、WEBP 和 GIF，并按内容 SHA-256 存入当前世界的 `media` 目录。不支持的图片会安全回退为姓名首字母。
