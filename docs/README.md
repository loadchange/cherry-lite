# Cherry Lite 文档

本目录是 Lite 的开发与架构文档。产品定位见仓库根目录 [README](../README.md)：只保留对话和翻译，其余完整版能力已裁掉。

写文档用中文、Markdown。改完跑 `pnpm docs:check-links`。

## 指南

| 文档 | 说明 |
| --- | --- |
| [开发环境](./guides/development.md) | 安装、启动、构建 |
| [贡献](./guides/contributing.md) | 如何给本仓库提改动 |
| [分支策略](./guides/branching-strategy.md) | `main` 与分支命名 |
| [i18n](./guides/i18n.md) | 文案约定与脚本（仅 `zh-CN` / `en-US`） |
| [日志](./guides/logging.md) | loggerService |
| [诊断](./guides/diagnostics.md) | `CS_DIAGNOSTICS` 性能探针 |
| [中间件](./guides/middleware.md) | AI Provider 中间件 |

## 参考

### 架构

| 文档 | 说明 |
| --- | --- |
| [架构总览](./references/architecture-overview.md) | 进程模型、数据流 |

### AI

| 文档 | 说明 |
| --- | --- |
| [AI 入口](./references/ai/README.md) | 主进程 AI 流水线 |
| [核心架构](./references/ai/core-architecture.md) | 从输入到模型响应 |
| [Stream Manager](./references/ai/stream-manager.md) | 活动流、重连、持久化 |
| [Adapter Family](./references/ai/adapter-family.md) | endpoint → `@ai-sdk/*` |

### 数据

| 文档 | 说明 |
| --- | --- |
| [数据系统总览](./references/data/README.md) | 选型与边界 |
| [Boot Config](./references/data/boot-config-overview.md) | 启动前配置 |
| [Boot Config Schema](./references/data/boot-config-schema-guide.md) | 新增 boot config key |
| [Cache 总览](./references/data/cache-overview.md) | 三层缓存 |
| [Cache 用法](./references/data/cache-usage.md) | useCache 与订阅 |
| [Cache Schema](./references/data/cache-schema-guide.md) | 新增 cache key |
| [Preference 总览](./references/data/preference-overview.md) | 用户设置 |
| [Preference 用法](./references/data/preference-usage.md) | usePreference |
| [Preference Schema](./references/data/preference-schema-guide.md) | 新增 preference key |
| [DataApi 总览](./references/data/data-api-overview.md) | 业务数据 API |
| [DataApi（渲染进程）](./references/data/data-api-in-renderer.md) | useQuery / useMutation |
| [DataApi（主进程）](./references/data/data-api-in-main.md) | Handler / Service / Repository |
| [API 设计](./references/data/api-design-guidelines.md) | 设计规则 |
| [API 类型](./references/data/api-types.md) | schema 与错误 |
| [数据库模式](./references/data/database-patterns.md) | 命名与 schema |
| [分层预设](./references/data/best-practice-layered-preset-pattern.md) | 预设与用户覆盖 |
| [V2 迁移](./references/data/v2-migration-guide.md) | 迁移系统 |

### 生命周期

| 文档 | 说明 |
| --- | --- |
| [生命周期总览](./references/lifecycle/README.md) | 架构与决策 |
| [Application](./references/lifecycle/application-overview.md) | 启动与关闭 |
| [生命周期内部](./references/lifecycle/lifecycle-overview.md) | 阶段、钩子、状态 |
| [生命周期用法](./references/lifecycle/lifecycle-usage.md) | 示例 |
| [决策指南](./references/lifecycle/lifecycle-decision-guide.md) | 生命周期 vs 单例 |
| [迁移指南](./references/lifecycle/lifecycle-migration-guide.md) | 旧服务迁移 |

### 消息与会话

| 文档 | 说明 |
| --- | --- |
| [消息系统](./references/messaging/message-system.md) | 消息生命周期 |
| [Composer 剪贴板](./references/messaging/composer-rich-clipboard.md) | 私有 token 剪贴板 |
| [消息树](./references/chat/message-tree.md) | 邻接表与分支 |
| [Chat UI 约定](./references/chat/conventions.md) | 展示 / 视图状态 / 编排 |
| [Chat Adapters](./references/chat/adapters.md) | 稳定 UI 形状 |

### 组件

| 文档 | 说明 |
| --- | --- |
| [CodeBlockView](./references/components/code-block-view.md) | 代码块 |
| [图片预览](./references/components/image-preview.md) | 图片预览 |
| [代码执行](./references/components/code-execution.md) | Pyodide |
| [UI 语义约定](./references/ui-semantic-contract.md) | `data-ui` 选择器 |

### 其它

| 文档 | 说明 |
| --- | --- |
| [前端测试](./references/testing/frontend-testing.md) | 前端测试设计 |
| [应用更新](./references/app-upgrade.md) | GitHub Releases 更新 |
| [飞书通知](./references/feishu-notify.md) | 飞书通知集成 |
| [模糊搜索](./references/fuzzy-search.md) | 模糊搜索 |
| [局域网传输](./references/lan-transfer-protocol.md) | 局域网传文件 |
| [远程拉取安全](./references/security/remote-fetch.md) | 主进程 URL 拉取的 SSRF 约束 |
