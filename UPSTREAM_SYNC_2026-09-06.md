# 2026-09-06 上游选择性回移

状态：选择性回移已完成验证，结果见文末。本次是保留模块的修复回移，不表示 Lite 已整体升级到上游最新版本。

## 对比基准

- Lite 原始提交：`09e7899ae`（2026-08-17）。
- 与上游共同祖先：`91bb33920bfa3315f832918366789cf8397b3fe7`（2026-08-06）。
- 核对并 fetch 的上游：`CherryHQ/cherry-studio main`，`67ca175cc833ba6a286464343f64ec1e426d443a`（2026-09-06）。
- 上游共同祖先之后共 830 个提交；本次提取其中 56 个提交涉及的兼容修复，部分按 Lite 结构适配。
- 方式：按原始 patch 回移并解决精简版差异，保留来源 SHA；没有把整个上游分支登记为已合并，下次仍可继续筛选未回移的提交。
- 本地已添加官方 `upstream` remote，保留 `upstream/main` 供后续比较；没有推送或触发发布。

## 保留边界

按 README 保留聊天、翻译、自备模型、可选 MCP/网页搜索/文件处理/OCR/划词与快捷助手、本地备份、窗口基础能力。本次没有恢复 Agent、Claude Code、Skills、知识库、笔记、绘图、MiniApp、云备份、导出、遥测和额外界面语言。

保留 Lite 产品名、更新地址、签名与 macOS 构建流程，以及现有依赖版本。Open MinerU multipart 修复只调整实现，不为移除一项间接仍使用的依赖重写整个锁文件。

## 纳入的上游提交

### 划词与翻译

| 上游提交 | 原始改动 |
| --- | --- |
| [`cc8b81e77`](https://github.com/CherryHQ/cherry-studio/commit/cc8b81e77) | fix(selection-assistant): start a fresh chat session per selection (#18200) |
| [`719e76137`](https://github.com/CherryHQ/cherry-studio/commit/719e76137) | fix(selection-assistant): keep custom action footer visible (#19373) |
| [`d4bfe5b92`](https://github.com/CherryHQ/cherry-studio/commit/d4bfe5b92) | fix(translate): disable reasoning for language detection (#18574) |
| [`0cc59c9c3`](https://github.com/CherryHQ/cherry-studio/commit/0cc59c9c3) | fix(translate-history): revalidate in place when membership changes (closes #19687) (#19713) |
| [`2693d4646`](https://github.com/CherryHQ/cherry-studio/commit/2693d4646) | fix(prompt-interpolation): preserve literal replacement text (#17574) |

### 聊天交互与错误展示

| 上游提交 | 原始改动 |
| --- | --- |
| [`61884482d`](https://github.com/CherryHQ/cherry-studio/commit/61884482d) | fix: keep multi-model selection during streaming (#20051) |
| [`35c3db176`](https://github.com/CherryHQ/cherry-studio/commit/35c3db176) | fix(chat): keep thinking elapsed stable across tab switches (#19764) |
| [`7bb65e75d`](https://github.com/CherryHQ/cherry-studio/commit/7bb65e75d) | fix(assistant-editor): recover from legacy save failures (#18257) |
| [`4249aeb66`](https://github.com/CherryHQ/cherry-studio/commit/4249aeb66) | fix(assistant-editor): clamp unsafe max token values (#20038) |
| [`8e0ab3471`](https://github.com/CherryHQ/cherry-studio/commit/8e0ab3471) | fix(markdown): render scrollbars on nested content scrollers (#20058) |
| [`9f9da22ab`](https://github.com/CherryHQ/cherry-studio/commit/9f9da22ab) | fix(renderer): make code block horizontal scrollbar thumb visible (fixes #19798) (#19807) |
| [`034b94245`](https://github.com/CherryHQ/cherry-studio/commit/034b94245) | fix(error-display): surface the provider's real error instead of status text (#18431) |
| [`55b06bd0e`](https://github.com/CherryHQ/cherry-studio/commit/55b06bd0e) | fix(provider-error): extract nested detail.error.message and wrap long tokens (#18833) |
| [`920a887f2`](https://github.com/CherryHQ/cherry-studio/commit/920a887f2) | fix(error-classifier): narrow bare proxy keyword (#18922) |
| [`f5c777597`](https://github.com/CherryHQ/cherry-studio/commit/f5c777597) | fix(chat-errors): recover from wrapped authentication errors (#20046) |
| [`0adb9342b`](https://github.com/CherryHQ/cherry-studio/commit/0adb9342b) | fix(chat-errors): classify client certificate failures (#20052) |
| [`2cfd92fe8`](https://github.com/CherryHQ/cherry-studio/commit/2cfd92fe8) | fix(quote): route message quotes to the originating window (#19060) |

### 聊天协议与数据

| 上游提交 | 原始改动 |
| --- | --- |
| [`1b2c83a4d`](https://github.com/CherryHQ/cherry-studio/commit/1b2c83a4d) | fix(ai-runtime): strip JSON Schema keywords providers reject in tool schemas (#18041) |
| [`0119f3c26`](https://github.com/CherryHQ/cherry-studio/commit/0119f3c26) | fix(ai-messages): normalize legacy v1 MCP tool names before model replay (#18224) |
| [`890d00a12`](https://github.com/CherryHQ/cherry-studio/commit/890d00a12) | fix(ai-messages): drop unanswered approvals from replayed history (#18066) |
| [`931a7c856`](https://github.com/CherryHQ/cherry-studio/commit/931a7c856) | fix(ai-params): map the system prompt onto the Responses instructions field (#16056) |
| [`e7875bf16`](https://github.com/CherryHQ/cherry-studio/commit/e7875bf16) | fix(message-service): delete conversations past SQLite's cascade depth limit (#18479) |
| [`9640ca189`](https://github.com/CherryHQ/cherry-studio/commit/9640ca189) | fix(message-service): preserve turnOptions on parts-only data patches (#18876) |

### 本地备份

| 上游提交 | 原始改动 |
| --- | --- |
| [`848993332`](https://github.com/CherryHQ/cherry-studio/commit/848993332) | fix(backup): skip EBUSY locked files (LevelDB LOCK) during automatic backup (#18117) |
| [`691970aba`](https://github.com/CherryHQ/cherry-studio/commit/691970aba) | fix(backup): skip LevelDB locks in streamed backups (#18173) |
| [`6f9ab1bef`](https://github.com/CherryHQ/cherry-studio/commit/6f9ab1bef) | fix(backup): preserve auto-backup intervals across restarts (#18226) |
| [`1b615468d`](https://github.com/CherryHQ/cherry-studio/commit/1b615468d) | fix(backup): defer automatic backups after startup (#18724) |
| [`70166a345`](https://github.com/CherryHQ/cherry-studio/commit/70166a345) | fix(backup): report disk-full failures (#19815) |
| [`67e5d42c7`](https://github.com/CherryHQ/cherry-studio/commit/67e5d42c7) | fix(backup): explain newer-version backup as downgrade instead of file_format (#19767) |

### MCP、搜索、文件与窗口

| 上游提交 | 原始改动 |
| --- | --- |
| [`6cb1543be`](https://github.com/CherryHQ/cherry-studio/commit/6cb1543be) | fix(mcp): close stale clients so ping failures stop orphaning child processes (#18146) |
| [`191c372de`](https://github.com/CherryHQ/cherry-studio/commit/191c372de) | fix(mcp-runtime): propagate stream abort signal into in-flight MCP tool calls (#18294) |
| [`174398b43`](https://github.com/CherryHQ/cherry-studio/commit/174398b43) | fix(filesystem-mcp): parse ripgrep JSON output (#17598) |
| [`d82cbfbf2`](https://github.com/CherryHQ/cherry-studio/commit/d82cbfbf2) | fix(filesystem-mcp): defer regex validation to fallback (#19960) |
| [`b1d400d0d`](https://github.com/CherryHQ/cherry-studio/commit/b1d400d0d) | fix(web-search): accept SearXNG engines tagged general only (#19497) |
| [`a8f4020d9`](https://github.com/CherryHQ/cherry-studio/commit/a8f4020d9) | fix(web-search): tolerate partial Querit results (#19936) |
| [`776c55c1e`](https://github.com/CherryHQ/cherry-studio/commit/776c55c1e) | fix(web-search): pass Exa API key to Exa MCP search (#18017) |
| [`99dcfd1f0`](https://github.com/CherryHQ/cherry-studio/commit/99dcfd1f0) | fix(web-search): read the Zhipu search key from its model provider (#18480) |
| [`ad3e70771`](https://github.com/CherryHQ/cherry-studio/commit/ad3e70771) | fix(web-search): use current Zhipu provider key (#18822) |
| [`8232f1a18`](https://github.com/CherryHQ/cherry-studio/commit/8232f1a18) | fix(open-mineru): send standards-compliant multipart uploads (#18021) |
| [`7ee54e57f`](https://github.com/CherryHQ/cherry-studio/commit/7ee54e57f) | fix(file): compare inodes as bigint in isSameFile (#19961) |
| [`56cf04c3c`](https://github.com/CherryHQ/cherry-studio/commit/56cf04c3c) | fix(window-manager): block content-initiated subframe navigation (#19723) |
| [`667523623`](https://github.com/CherryHQ/cherry-studio/commit/667523623) | fix(main-window-navigation): allow /app routes and query strings in route allowlist (#18266) |

### 模型目录与 SDK

| 上游提交 | 原始改动 |
| --- | --- |
| [`fcd264fc5`](https://github.com/CherryHQ/cherry-studio/commit/fcd264fc5) | fix(provider-registry): resolve same-family model sizes via size-preserving key (#18391) |
| [`feec32429`](https://github.com/CherryHQ/cherry-studio/commit/feec32429) | fix(provider-registry): resolve prefixed size-colliding model ids to their own override (#18487) |
| [`33213cbdd`](https://github.com/CherryHQ/cherry-studio/commit/33213cbdd) | fix(provider-registry): prevent cross-size model matches (#18513) |
| [`c85902092`](https://github.com/CherryHQ/cherry-studio/commit/c85902092) | fix(provider-registry): map deepseek auto thinking to enabled (#18274) |
| [`9b5eb0e26`](https://github.com/CherryHQ/cherry-studio/commit/9b5eb0e26) | feat(provider-registry): serve DeepSeek V4 Pro over the Responses API (#18462) |
| [`697351019`](https://github.com/CherryHQ/cherry-studio/commit/697351019) | feat(provider-registry): add DeepSeek V4 Flash Vision Exp with image input (#19236) |
| [`530b7d514`](https://github.com/CherryHQ/cherry-studio/commit/530b7d514) | fix(provider-registry): correct DeepSeek V4 metadata (#19296) |
| [`491a9fb1e`](https://github.com/CherryHQ/cherry-studio/commit/491a9fb1e) | fix(moonshot): omit fixed top_p for Kimi models (#19431) |
| [`1082f52ce`](https://github.com/CherryHQ/cherry-studio/commit/1082f52ce) | fix(moonshot): omit fixed temperature and top_p for all Kimi models (#19563) |
| [`2efbc5cde`](https://github.com/CherryHQ/cherry-studio/commit/2efbc5cde) | fix(provider-registry): prevent unsupported Kimi K3 reasoning effort (#20036) |
| [`3de6b6d7f`](https://github.com/CherryHQ/cherry-studio/commit/3de6b6d7f) | fix(provider-registry): support GLM-5.3-Flash reasoning (#19554) |
| [`a71cd89d3`](https://github.com/CherryHQ/cherry-studio/commit/a71cd89d3) | fix(provider-registry): preserve curated reasoning vocabularies (#19298) |
| [`a2c9f85f0`](https://github.com/CherryHQ/cherry-studio/commit/a2c9f85f0) | fix(provider-registry): restore OpenRouter reasoning Off control (#19730) |
| [`0dc91d6e7`](https://github.com/CherryHQ/cherry-studio/commit/0dc91d6e7) | fix(api-gateway): convert max_tokens to max_completion_tokens for OpenAI reasoning models (#18768) |

## Lite 适配说明

- 本地自动备份持久化仅保存 `local` 时间戳；不引入 webdav/s3/nutstore 配置。高版本备份、磁盘满、并发备份的提示仅更新中英两种语言。
- 翻译历史复用当前数据订阅，原地刷新；不引入 PDF 翻译服务和迁移。
- 助手编辑保留现有 `EditableNumber` 和精简后的表单；连接错误保留当前检查抽屉及 `/settings/system` 路径。
- MCP 取消只回移普通聊天链路，跳过已删除的 Claude Code 适配器；topicId 作为取消范围，避免不同话题相同 toolCallId 相互影响。
- Responses instructions 在有效 system（包括 generateText 的请求级覆盖及空字符串）确定后生成；独立复查发现并修复上游补丁在 Lite 调用链中的覆盖顺序问题。
- 模型目录通过定向生成更新相关模型和现有 OpenRouter reasoning 合约，保留其余快照、价格和服务端模型 ID，避免重新拉目录时引入无关新模型。生成入口见 [provider-registry README](packages/provider-registry/README.md)。
- 旧 Gemini 专用工具 schema 实现及测试被通用 schema 兼容实现替代；变更可通过 Git 历史恢复，不涉及用户数据库。

## 本次未纳入的更新

以下列的是需要单独适配的代表性更新；其余上游提交也不能视为已同步。

| 范围 | 示例 | 未纳入原因 |
| --- | --- | --- |
| 已删除的产品模块 | Agent、Claude Code、Skills、知识库、绘图、笔记、MiniApp、云服务/诊断上传 | 不属于 Lite 保留范围 |
| 新增 PDF 翻译 | `3ff5753e4`、`f23413bcd` | 新增 BabelDOC/二进制安装及文件历史链路，需要单独决定体积和产品范围 |
| 翻译参数与交互扩展 | `74e48e341`、`8915ee08f` | 涉及偏好 schema、设置和翻译请求结构联动；本次未做功能升级 |
| 模型端点与状态重构 | `46dab906c` | 177 文件的跨模块重构，混合已移除的运行时与新数据所有权逻辑，不能直接整体拿入 |
| 新 SDK 版本与补丁链 | `18c287b02` 等 | 需要连同依赖、锁文件和补丁版本整体升级；本次保留现有 SDK 版本 |
| 新截图、设置搜索与聊天分支导出 | `30430e9c0`、`3652bac03`、`51408a156` | 属于较大功能扩展，部分牵涉已删除模块/导出，本次未恢复 |
| 发布和本地化体系变更 | 全球/中国双版本、Turkish、locale flattening、上游 CI | 保留 Lite 发布方式和两语言结构 |

后续同步应仍从上述共同祖先/上次记录核对，排除本文件已回移项；不要把上游 head 写成 Lite 的完全同步基准。

## TTS

本轮仅规划，未实现朗读功能。三个入口、免费微软与其他 API、播放器和验收清单见 [TTS_PLAN.md](TTS_PLAN.md)。

## 验证

环境：Node.js 24.11.1、pnpm 11.8.0；测试前已为 Node 重建 better-sqlite3。

| 检查 | 最终结果 |
| --- | --- |
| 全量 Vitest（`pnpm exec vitest run --silent --maxWorkers=4 --reporter=dot`） | 1,248 个测试文件全部通过；14,847 项通过，65 项跳过 |
| `pnpm build` | 通过，包含 main/web/aiCore 类型检查及 Electron main/preload/renderer 构建 |
| `pnpm test:lint` | 通过；Oxlint 零警告/错误，ESLint 零错误、16 条未改动文件的既有警告 |
| `pnpm i18n:check` | 通过 |
| 修改文件的 Biome format / lint | 通过；lint 按仓库现有覆盖范围检查 |
| `git diff --check` | 通过 |
| 裁剪边界 | 未恢复任何原先删除的文件；根依赖、锁文件、发布配置未改变 |

已按当前项目结构调整回归 fixture，并修复了 Responses 提示词覆盖顺序问题。未执行签名 DMG 打包或交互式实机回归；TTS 尚未实现，也未调用真实语音 API。
