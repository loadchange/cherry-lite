# 分支策略

Cherry Studio Lite 只维护一条产品线。

> **`main` 是唯一的开发与发布分支。** 功能、重构、优化、缺陷修复都从这里拉分支，PR 也打回这里。推到 `main` 会触发 macOS 云构建。本仓库没有上游的 `v1` 维护线，也没有 Test Plan / `testplan` 分支。

## 长期分支

- `main`
  - 当前产品代码
  - 不要直接往远程 `main` 堆未审的大改，走 PR
  - 云构建会在每次 push 后跑 typecheck、单测、e2e，并发布 macOS 安装包

## 工作分支

从最新 `main` 拉出，完成后 PR 回 `main`：

| 类型 | 命名 | 用途 |
| --- | --- | --- |
| 功能 | `feat/简要说明` 或 `feat/issue号-简要说明` | 新能力 |
| 修复 | `fix/简要说明` | 缺陷 |
| 文档 | `docs/简要说明` | 只改文档 |
| 发布 | `release/版本号` | 可选的发版准备，只收修复和文档 |

## Pull Request

- 目标分支是 `main`
- 提交前与最新 `main` 对齐（`git fetch` 后 rebase，不要用会生成 merge commit 的 `git pull`）
- 描述里写清动机和验证
- 改 UI 时附前后对比
- 本地检查：`pnpm lint`、`pnpm test`、`pnpm format`

## 版本

云构建用 `2.0.${GITHUB_RUN_NUMBER}` 打 GitHub Release。本地开发版本见根目录 `package.json`。
