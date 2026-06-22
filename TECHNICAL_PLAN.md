# SheetShare Mobile 技术方案

## 目标定位

SheetShare Mobile 是一个手机优先的 Foundry VTT 角色卡分享模块。GM 在 Foundry 内选择要发布的角色，模块导出适合手机阅读的角色卡页面；玩家通过分享链接和密码查看，无需登录 Foundry。

对普通用户的产品表达：

- Mobile-first character sheets
- Password-protected sharing
- No Foundry login required for players
- GM-controlled publishing

技术实现可以使用静态加密快照，但不在主文案里要求用户理解加密细节。

## 非目标

- 不替代 Foundry 权限系统。
- 不启动独立 HTTP 服务或打开新端口。
- 不做复杂账号系统、玩家 ACL 或 OAuth。
- 不做版权内容裁剪；默认导出玩家角色卡体验需要的完整内容。
- 第一版不保证所有 Item/ActiveEffect 变化自动触发，先把 `updateActor` 作为 P0，其他 hook 进入 P1 实测矩阵。

## 运行架构

```text
GM Browser with Foundry world open
  -> SheetShare Mobile module hook
  -> extract dnd5e actor snapshot
  -> encrypt snapshot with table password
  -> FilePicker.upload("data", ...)
  -> Data/assets/sheetshare-mobile/<world-id>/<slug>.json

Player Browser
  -> GET /modules/sheetshare-mobile/viewer/index.html?s=<slug>
  -> Foundry built-in HTTP server returns viewer files
  -> viewer fetches encrypted JSON from /assets/sheetshare-mobile/<world-id>/<slug>.json
  -> player enters password
  -> WebCrypto decrypts locally
  -> mobile sheet renders in browser
```

Foundry 自带 HTTP server 负责服务 module 文件和 Data/assets 文件。Caddy、nginx 或 Cloudflare 只作为可选反向代理存在。模块本身不启动服务器。

## 安全模型

### 已定

- 默认不发布任何角色。
- 只有 GM 可以发布或取消发布角色。
- 每个发布角色生成不可猜的 slug。
- 全桌一个分享密码。
- 不公开角色列表。
- 静态 JSON 文件是密文；直接 GET JSON 不能看到角色卡内容。
- 密码不上传服务器、不写 URL、不写 localStorage，只在浏览器内存中用于本地解密。

### 加密快照格式

```json
{
  "schema": "sheetshare-mobile.encrypted-snapshot.v1",
  "moduleVersion": "0.1.0",
  "worldId": "COS",
  "slug": "random-slug",
  "actorName": "Alverin Silvershade",
  "updatedAt": "2026-06-22T12:00:00.000Z",
  "crypto": {
    "kdf": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 250000,
    "salt": "base64",
    "algorithm": "AES-GCM",
    "iv": "base64"
  },
  "ciphertext": "base64"
}
```

密码校验方式：viewer 用输入密码派生 AES-GCM key，尝试解密。解密成功即密码正确，失败显示密码错误。

## 存储模型

第一版只实现 Foundry Data storage adapter。

默认路径：

```text
Data/assets/sheetshare-mobile/<world-id>/<slug>.json
```

公开 URL：

```text
/assets/sheetshare-mobile/<world-id>/<slug>.json
```

viewer URL：

```text
/modules/sheetshare-mobile/viewer/index.html?s=<slug>
```

模块不要承诺“支持 Docker”或“支持裸机”。对外口径是：支持能通过 storage self-test 的 Foundry 部署。

storage self-test 需要检查：

- 能创建目标目录。
- 能写入测试 JSON。
- 浏览器能 fetch 测试 JSON。
- viewer 文件能被 Foundry HTTP 服务访问。
- 当前页面是否为 HTTPS；HTTP 可用但显示安全提示。

## 权限与设置

### World settings

- `sharePasswordHashHint`：可选，用于提示是否已设置密码，不存明文密码。
- `defaultStorageRoot`：默认 `assets/sheetshare-mobile`。
- `autoExportOnActorUpdate`：默认 `true`。
- `showHttpWarning`：默认 `true`。
- `viewerLanguage`：默认 `auto`。可选 `auto`、`foundry`、`en`、`zh-CN`。

分享密码不持久保存明文。GM 发布或重新导出时输入密码，模块可以在当前浏览器 session 内短暂缓存，刷新后需要重新输入。后续如要优化体验，可以使用 Foundry world setting 保存加密后的密钥材料，但第一版避免增加秘密管理复杂度。

## 语言策略

模块内部 UI、管理面板、Doctor 面板使用 Foundry i18n，至少提供英文和简体中文。

手机分享页有独立的前端 i18n 字典，语言选择顺序：

1. 分享 URL 中的 `lang`。
2. 加密信封公开元数据里的 DM 语言提示。
3. 玩家浏览器语言。

如果 `viewerLanguage=auto`，分享链接不带 `lang`，玩家浏览器语言决定分享页 UI。如果 `viewerLanguage=foundry` 或固定语言，分享链接会带 `lang`，这样密码页在解密前也能显示正确语言。

角色名、物品名、法术名、描述等内容不按玩家浏览器语言翻译，保持 DM 的 Foundry 世界数据。中文世界可以使用 `zzzz_arcane_dnd5e_cn` 作为内容增强；英文世界不加载这组中文翻译。

### Actor flags

```js
actor.flags["sheetshare-mobile"] = {
  publish: {
    enabled: true,
    slug: "random-slug",
    lastExportedAt: "2026-06-22T12:00:00.000Z",
    lastExportStatus: "ok",
    lastExportError: ""
  }
}
```

使用 Actor UUID/ID 作为内部身份，不使用角色名字做发布判断。角色名字只用于显示。

## UI 设计

### Actor sheet header

GM 打开 character sheet 时显示：

- Publish to Mobile
- Copy Mobile Link
- Refresh Mobile Sheet

如果角色未发布，只显示 Publish。成功操作静默；失败弹红色 toast。

### Published Sheets 面板

入口：Module Settings 中的按钮，后续可加 GM-only actor header 入口。

面板内容：

- 发布角色列表。
- 每个角色的状态、最后导出时间、复制链接、刷新、取消发布。
- Storage self-test 状态。
- HTTPS 状态提示。
- 手动导出全部已发布角色。

## 自动刷新

P0：

- `Hooks.on("updateActor")`
- 手动 Refresh
- ready 时不强制刷所有角色，避免 GM 进世界时无密码导致导出失败；可以只发布 viewer/self-test 状态。

P1 TODO：

- `createItem`
- `updateItem`
- `deleteItem`
- `createActiveEffect`
- `updateActiveEffect`
- `deleteActiveEffect`

P1 前必须在 Foundry v13 + dnd5e 5.3.x 实测 hook 矩阵：

- HP
- spell slots
- currency
- 装备穿脱
- 新增/删除物品
- 准备/取消准备法术
- 新增/删除 Active Effect
- DDB/Tidy 批量更新

如果 Item/ActiveEffect 变化不触发 `updateActor`，就补专用 hooks。

## 错误反馈

Linux 哲学：没有消息就是好消息。

- 成功导出：无 toast。
- 成功复制链接：可以使用系统剪贴板反馈或极短 info，但默认尽量少。
- 失败：红色 toast。
- 详细错误：Published Sheets 面板。

错误类型至少区分：

- 未设置分享密码。
- 角色未发布。
- storage 写入失败。
- storage 读取失败。
- viewer 文件不可访问。
- 加密失败。
- 快照提取失败。

## 兼容范围

第一版：

- Foundry VTT v13
- dnd5e 5.3+
- 现代 Chrome、Safari、Firefox
- 手机优先布局
- HTTPS strongly recommended

## 实施顺序

1. 从现有 `cn5e-sheet-export` 完整安装版迁移 extraction 和 viewer 基础能力。
2. 新建 `sheetshare-mobile` module，更新 module id、i18n、manifest。
3. 改发布机制：名字白名单 -> Actor flag + GM controls。
4. 加 WebCrypto 加密导出和 viewer 解密。
5. 收敛存储路径到 `assets/sheetshare-mobile/<world-id>`.
6. 不再生成公开 index。
7. 加 `updateActor` 自动导出和手动刷新。
8. 加 Published Sheets 管理面板和 storage self-test。
9. 安装到本地 COS world。
10. 用 Chrome/浏览器自动化验证：
    - 模块加载。
    - GM 能发布角色。
    - JSON 直链可 GET 但没有明文角色内容。
    - viewer 需要密码。
    - 正确密码能渲染角色卡。
    - 错误密码报错。
    - HP 更新后触发导出。

## 发布前 P0 检查

- repo 是唯一 source of truth，不再依赖线上热补丁。
- module.json 的 id/title/description 都是 SheetShare Mobile。
- 没有硬编码 COS、角色名或生产域名。
- 成功路径不刷 toast。
- 直链 JSON 只包含密文。
- storage self-test 能解释裸机、Docker、托管环境的失败原因。
