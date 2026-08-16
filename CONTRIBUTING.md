# Cherry Lite 贡献指南

欢迎给本仓库提改动。这里是从 Cherry Studio 裁出来的轻量分叉，只维护对话和翻译相关能力。

请先读 [行为准则](CODE_OF_CONDUCT.md) 和 [LICENSE](LICENSE)。

## 怎么参与

1. **改代码**：新功能或优化。代码要符合仓库约定，并带测试。
2. **修缺陷**：先复现，再提交修复和回归测试。
3. **整理 Issue**：帮忙分类、复现、补信息。
4. **写文档**：用户说明、架构文档、开发指南。

不要往本仓库回填完整版已经删掉的能力（知识库、笔记、绘图、云备份、会话导出、Agent 通道等），除非 Issue 里明确要做。

## 开发环境

见 [开发指南](docs/guides/development.md)。架构、分层和命令总览见 [`AGENTS.md`](AGENTS.md)。

## 分支

本仓库的产品线只有 **`main`**。

- 功能、重构、优化、缺陷修复都针对 `main`
- 从最新 `main` 拉分支：`feat/...`、`fix/...`、`docs/...`
- PR 也打到 `main`
- 没有上游那套 `v1` 维护线，也没有 Test Plan / `testplan` 分支
- 推到 `main` 会跑 [Build macOS](.github/workflows/mac-build.yml)

更细的命名见 [分支策略](docs/guides/branching-strategy.md)。

## 提交

使用 [Conventional Commits](https://www.conventionalcommits.org/)，scope 用具体模块的 kebab-case（例如 `backup`、`i18n`、`ci`），不要写泛称 `main`。

每个提交需要 DCO 签署：

```bash
git commit -S --signoff -m "fix(updater): ignore leftover test-plan channels"
```

本机没有 GPG 时至少加上 `--signoff`。提交说明里应出现：

```
Signed-off-by: Your Name <your.email@example.com>
```

共享分支保持线性历史：用 `git pull --rebase`，不要用会生成 merge commit 的 `git pull`。

## 测试与检查

没有测试的功能视为不存在。改完在本地跑：

```bash
pnpm lint
pnpm test
pnpm format
```

提交前建议再跑 `pnpm build:check`。i18n 缺 key 时先 `pnpm i18n:sync`。

本仓库没有上游的 `/ok-to-test` 门禁。推到 `main` 的构建流水线会跑 typecheck、单测、e2e 和 macOS 打包。

草稿 PR 适合还没写完、只想先讨论的改动。

## 文档

用户可见文案走 i18next，不要硬编码。新增或修改文档用中文、Markdown。改完跑 `pnpm docs:check-links`，避免留下失效链接。

## 联系

- [GitHub Issues](https://github.com/loadchange/cherry-studio-lite/issues)
- 安全问题见 [SECURITY.md](SECURITY.md)
