<h1 align="center">
  <img src="./build/icon.png" width="120" height="120" alt="Cherry Lite" /><br>
  Cherry Lite
</h1>

<p align="center">
  轻量桌面 AI 助手：对话 + 翻译。<br>
  <a href="./docs/guides/development.md">开发</a>
  ·
  <a href="./docs/README.md">文档</a>
  ·
  <a href="./CONTRIBUTING.md">贡献</a>
  ·
  <a href="https://github.com/loadchange/cherry-studio-lite/issues">反馈</a>
  ·
  <a href="https://github.com/loadchange/cherry-studio-lite/releases">下载</a>
</p>

<p align="center">
  <a href="https://github.com/loadchange/cherry-studio-lite/releases"><img src="https://img.shields.io/github/v/release/loadchange/cherry-studio-lite?logo=github" alt="Release" /></a>
  <a href="https://github.com/loadchange/cherry-studio-lite/actions/workflows/mac-build.yml"><img src="https://img.shields.io/github/actions/workflow/status/loadchange/cherry-studio-lite/mac-build.yml?label=macOS%20build&logo=github" alt="macOS build" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-important.svg?logo=gnu" alt="License" /></a>
</p>

Cherry Lite 从 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 裁剪而来，只保留助手对话和翻译。除了你自己配置的模型服务（以及你主动打开的可选能力），应用不会向其它云端发业务请求。

## 功能

- **对话**：多模型、多话题、Markdown、代码高亮、附件
- **翻译**：独立翻译页，历史记录留在本地
- **自备模型**：自行绑定 OpenAI、Anthropic、Gemini、兼容接口、Ollama 等，不预置账号
- **可选能力**：MCP、网页搜索、文档转 Markdown、OCR、划词助手、快捷助手
- **数据**：本地备份 / 恢复 / 导入；可改数据目录
- **界面**：浅色 / 深色；语言为简体中文、English

当前仓库的发布流水线只打 **macOS**（Apple Silicon 与 Intel）`.dmg`，并发布到 [GitHub Releases](https://github.com/loadchange/cherry-studio-lite/releases)。Windows / Linux 的打包脚本还在，但没有对应的云构建。

## 和完整版的差别

本仓库不是 Cherry Studio 官方产品，也不是功能超集。下面这些上游能力已经拿掉：

| 已移除 | 说明 |
| --- | --- |
| 知识库、笔记、绘图、MiniApp | 产品面不再提供 |
| Agent 会话 / 通道 / Skills、Claude Code、本地模型网关 | 运行时已裁掉 |
| WebDAV / S3 / 坚果云 | 只留本地备份 |
| 会话导出（Notion、语雀、Joplin 等） | 已删除 |
| 内置分析、匿名崩溃上报、测试通道 | 已删除 |
| 多语言界面 | 只保留 `zh-CN`、`en-US` |

## 开发

需要 Node.js（见 `.node-version`）和 pnpm（见 `package.json` 的 `packageManager`）。

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

常用命令：

```bash
pnpm test          # 单元测试
pnpm test:e2e      # Electron e2e（需先构建）
pnpm typecheck
pnpm lint
pnpm build:mac     # 本地打 macOS 包
```

更完整的环境说明见 [开发指南](./docs/guides/development.md)，架构见 [文档索引](./docs/README.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [开发指南](./docs/guides/development.md) | 环境、启动、构建 |
| [文档索引](./docs/README.md) | 架构与子系统入口 |
| [贡献指南](./CONTRIBUTING.md) | 分支、提交、PR |
| [隐私协议](./PRIVACY.md) | 数据放哪、何时联网 |
| [安全政策](./SECURITY.md) | 漏洞报告 |

## 贡献

欢迎针对本仓库提 Issue 和 PR。请从 `main` 开分支，提交前跑通 `pnpm lint`、`pnpm test`、`pnpm format`，并用 `git commit -S --signoff`（至少 `--signoff`）做 DCO 签署。细节见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 上游与许可

本项目基于 [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)，沿用 [GNU AGPL v3.0](./LICENSE)。

- 完整版官网、企业版、打赏和社区渠道属于上游，不适用于本仓库
- 商业咨询请走上游渠道，不要发到本仓库
