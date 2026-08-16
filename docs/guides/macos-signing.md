# macOS 云构建签名

云构建打出来的 `.dmg` 要用你的 **Developer ID Application** 证书签名，并提交 Apple 公证。签过并公证的包，用户下载后可以直接打开，不用再执行 `xattr -cr`。

本地 `pnpm build:mac` 如果没有这些环境变量，仍会打未签名包，方便本机调试。

## 你需要准备什么

1. 已付费的 [Apple Developer](https://developer.apple.com/account) 账号
2. 钥匙串里的 **Developer ID Application** 证书（不是 Mac App Store 的 Apple Distribution）
3. 仓库 Settings → Secrets and variables → Actions 里配置下面这些密钥

云构建复用 [CCBuddy](https://github.com/ccbud/CCBuddy) 同一套材料：Developer ID 的 `.p12` 签名，App Store Connect API Key（`.p8`）公证。**不需要**应用专用密码。

| Secret | 内容 |
| --- | --- |
| `CSC_LINK` | Developer ID Application 的 `.p12`，整文件 base64（已从 `~/clawdy-signing/clawdy.p12` 写入） |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时的密码（已写入） |
| `APPLE_TEAM_ID` | `2CGR266XD2`（已写入） |
| `APPLE_API_KEY_P8` | `AuthKey.p8` 整文件 base64（与 CCBuddy 的 `APPLE_API_KEY_P8` 同类） |
| `APPLE_API_KEY_ID` | App Store Connect 密钥的 10 位 Key ID |
| `APPLE_API_ISSUER` | App Store Connect 密钥页上的 Issuer UUID |

Bundle ID 是 `com.loadchange.CherryStudioLite`，与 `electron-builder.yml` 的 `appId` 一致。Developer ID 分发一般不用先在开发者后台注册这个 ID。

## 还缺的两个公开 ID

打开 [App Store Connect → 用户和访问 → 密钥](https://appstoreconnect.apple.com/access/integrations/api)：

- **Issuer ID**：页面顶部的 UUID
- **Key ID**：对应那把密钥的 10 位 ID（下载 `.p8` 时文件名一般是 `AuthKey_XXXXXXXXXX.p8`）

这两个不是密码，可以发在对话里。GitHub 无法从 CCBuddy 仓库把 Secret **读出来**再拷过来，所以只能从 App Store Connect 再看一眼。

## 配好之后

1. 再跑一次 **Build macOS**（push 到 `main`，或 Actions 里手动 `workflow_dispatch`）
2. 打包步骤会签名、公证、stapler 钉票
3. 随后的校验步骤会跑 `codesign --verify` 和 `stapler validate`
4. Release 里的 dmg 应显示为已识别的开发者

下载后如果仍被拦截，先确认证书类型是 Developer ID Application，再看该次构建日志里的 `Notarized and stapled app`。
