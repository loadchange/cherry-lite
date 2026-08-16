# macOS 云构建签名

云构建打出来的 `.dmg` 要用你的 **Developer ID Application** 证书签名，并提交 Apple 公证。签过并公证的包，用户下载后可以直接打开，不用再执行 `xattr -cr`。

本地 `pnpm build:mac` 如果没有这些环境变量，仍会打未签名包，方便本机调试。

## 你需要准备什么

1. 已付费的 [Apple Developer](https://developer.apple.com/account) 账号
2. 钥匙串里的 **Developer ID Application** 证书（不是 Mac App Store 的 Apple Distribution）
3. 仓库 Settings → Secrets and variables → Actions 里配置下面这些密钥

| Secret | 内容 |
| --- | --- |
| `CSC_LINK` | Developer ID Application 的 `.p12`，**整文件**做 base64 |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时设的密码 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) 生成的应用专用密码 |
| `APPLE_TEAM_ID` | 开发者账号 10 位 Team ID（Membership 页面） |

Bundle ID 是 `com.loadchange.CherryStudioLite`，与 `electron-builder.yml` 的 `appId` 一致。Developer ID 分发一般不用先在开发者后台注册这个 ID。

## 导出证书并写成 CSC_LINK

在本机钥匙串里选中 **Developer ID Application: 你的名字 (TEAMID)**，导出为 `.p12`，设一个密码。然后：

```bash
base64 -i ~/Desktop/developer-id.p12 | pbcopy
```

把剪贴板内容贴进 GitHub Secret `CSC_LINK`。`CSC_KEY_PASSWORD` 填导出时的密码。

没有 Developer ID 证书时，到 [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list) 新建 **Developer ID Application**，用钥匙串的证书助理生成 CSR。

## 应用专用密码

1. 打开 [appleid.apple.com](https://appleid.apple.com) → 登录与安全 → 应用专用密码
2. 生成一个，标注 `cherry-lite-notarize`
3. 填进 `APPLE_APP_SPECIFIC_PASSWORD`（不是账号登录密码）

## 配好之后

1. 再跑一次 **Build macOS**（push 到 `main`，或 Actions 里手动 `workflow_dispatch`）
2. 打包步骤会签名、公证、stapler 钉票
3. 随后的校验步骤会跑 `codesign --verify` 和 `stapler validate`
4. Release 里的 dmg 应显示为已识别的开发者

下载后如果仍被拦截，先确认证书类型是 Developer ID Application，再看该次构建日志里的 `Notarized and stapled app`。
