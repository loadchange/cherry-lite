# 上游同步：2026-11-09

## 基准与边界

- 项目关系：Cherry Studio 是功能完整版上游；Cherry Lite 是保留对话、翻译及其可选工具的裁剪版。此次按 Lite 架构迁移行为，不直接合并上游主分支。
- 上次同步基准：Cherry Studio `99dea32b3e`（2026-10-12，v2.1.6）。
- 本次审阅上限：Cherry Studio `8b3b0f4dacc2771c9509c09b7c15fb525bc8629c`（2026-11-09，v2.1.10）。
- Lite 起点：`682ad53f7`；工作分支：`sync/upstream-2026-11-09`。
- 审阅区间共 830 个提交（812 个非合并提交）。这不是全量合并：落实两批修复与下列非语音新功能，保留 Lite 的数据层、IPC、界面和隐私边界。

## 第一批：安全、数据与基础兼容

| 修复 | 上游出处 |
| --- | --- |
| Data API 调试日志递归脱敏凭据；循环引用与共享引用安全 | `e1a7bc9cb2` |
| ChatGPT 导入检测父节点循环，避免无限遍历 | `5c98a299f6` |
| 先解析再创建助手；写入失败仅回滚本次创建的话题与助手，保留原始错误 | `b88a1d2025` |
| 外部文件/目录明确删除时，回收站不可用则退回永久删除 | `26b29cd521` |
| MCP 请求头和环境变量保留字面量 `#`，不破坏 dotenv 引号及转义 | `2aaa869f0a` |
| 划词翻译初始化等待已保存的目标语言/备用语言 | `67552a0649` |
| 划词工具栏使用自身 webContents 缩放计算窗口尺寸 | `c7e088f8c7` |
| 代理绕过规则支持 `192.168.*` 等短通配 IP | `15aa79e27c` |
| 正确解析带引号及转义的下载文件名 | `f653bba3fc` |
| Searxng 保留正文抓取失败的搜索命中 | `5a4b54ee5e` |
| 派发模型前解码校验本地图片，过滤损坏字节，不主动下载远程图片 | `68fb97a89f` |

## 第二批：模型调用、重放与运行时

| 修复 | 上游出处 |
| --- | --- |
| 工具 schema 显式关闭未指定的 strict，并补全无参数对象的 properties | `e6bb4e951c` |
| Anthropic 缓存断点数量、实际序列化断点统计及 TTL 顺序 | `90d504fa70`、`40580b993e` |
| 提前执行的清理函数从生命周期跟踪中移除 | `370f3a99e0` |
| DashScope Qwen 最终 temperature 达到 2 时收敛到 1.9，包括请求覆盖 | `fe0edfd5a9` |
| Gemini 分页 token 与 AiHubMix 定价接受 null | `1d1ffe2a28`、`d01b83d2cc` |
| 序列化不把共享但非循环的对象当作循环 | `5bf9d04836` |
| 文件编辑只去除一次 UTF-8 BOM，不吞掉后续内容 | `c6a21d28d7` |
| 流式 Markdown 完成的淡入动画释放填充状态 | `0fdd1d6acc` |
| 重新生成优先使用当前输入框选择的模型 | `426daeb339` |
| 非流式调用使用解析完成后的模型上下文 | `354ca0cb88` |
| 历史重放去除非对象工具输入、同 ID 的重复本地工具片段、空的签名 thinking | `a7a3592e21`、`9316baea54`、`b0ae443f95` |
| 恢复历史工具结果时按调用 ID 修复工具名 | `efa760045a` |

另外同步自动备份在对话仍写入时延后 30 秒、且不消耗失败重试预算；补充右侧栏提示位置、窄消息列锚点、拖拽柄颜色、元数据加载竞态、HTML 标题换行、快捷面板过滤和引用分隔符等适用于 Lite 的修复。

## 非语音新功能

- 翻译结果可复制为图片：截取完整内容，防重复点击，在内容变化或卸载后丢弃过期截图，失败时反馈。
- 模型、助手、会话选择器、资源列表与助手历史支持中文全拼和首字母检索。
- 新增私有工作区包 `@cherrystudio/web-search`，协议层与 Electron 网络传输、偏好配置分离。
- 新增 DuckDuckGo、Parallel、Serply、元宝、DeepSeek、Desearch、SearchApi 搜索以及 Crawl4AI 抓取；保留原有搜索提供方。
- 搜索/抓取按能力检查配置，失败时降级到可用提供方，向窗口发送类型化事件并展示提示。
- Jina 默认使用国际站，不恢复地理位置探测；用户显式配置镜像及内置站点失败切换仍受支持。
- 网页抓取继续使用 Lite 的私网/DNS 安全限制，不引入允许私网抓取的设置或遥测装饰器。
- 更新提供方及模型目录、推理档位/协议和原生网页工具端点约束；接通 QwenCloud 与 Moonshot Global 所需的搜索投递路径。
- 保留 Lite 的 GitHub Models 提供方、免费定价和精确 wire ID，以及已有的 API 能力兼容字段。
- 更新 AI SDK、相应提供方 SDK/补丁、Electron 45.2.2 与 better-sqlite3 13.0.3。统一 AI SDK/Zod 4/SDK provider 基础版本，保留依赖 Zod 3 的第三方工具链。

## 继续排除

- 不同步新增语音、语音输入、实时音视频或 TTS 功能；Lite 现有朗读行为不变。
- 不恢复 Agent、Skills、Computer Use、知识库、绘画工作台/ComfyUI、上游云账户/托管云模型服务、远程控制等已裁剪产品模块。QwenCloud 仅作为用户自配密钥的普通第三方提供方。
- 不恢复 RegionService、云端地理探测或上游遥测。
- 目录可以包含模型的多模态能力元数据；这不意味着引入对应的语音或绘画运行时。
- 不进行上游整套界面重构、发布系统或公共 npm 包发布链路迁移，也不把区间内全部 830 个提交标记为已同步。

## 目录生成方式

遵守 provider-registry 的生成约束：只修改 `src/` 和 `scripts/`，通过生成器产出 `data/*.json` 与模式表，不手工编辑生成 JSON。

本次目录以本次审阅上限提交的 `models.json` / `provider-models.json` 为稳定输入，避免执行时 models.dev / OpenRouter 的实时上下架和价格漂移。连接配置来自本仓库源代码；GitHub Models 的 served rows 单独重新生成。

```sh
snapshot_dir="$(mktemp -d)"
for name in models.json providers.json provider-models.json; do
  git -C ../cherry-studio show \
    "8b3b0f4dacc2771c9509c09b7c15fb525bc8629c:packages/provider-registry/data/$name" \
    > "$snapshot_dir/$name"
done
CATALOG_BASE_DIR="$snapshot_dir" CATALOG_PROVIDER_IDS=github \
  pnpm --filter @cherrystudio/provider-registry generate
pnpm gen:system-provider-ids
```

`CATALOG_PROVIDER_IDS` 是本次新增的整提供方选择开关；原有按模型、按提供方/模型及按推理提供方刷新方式保持可用。

## 验证

使用 Node 24.14.0、pnpm 11.8.0；遵守仓库 Node 引擎约束。

- `pnpm typecheck`：通过（Main / Renderer / aiCore）。
- `pnpm --filter @cherrystudio/web-search typecheck` / `build`：通过。
- `pnpm exec vitest run --maxWorkers=6 --silent=true`：最终全量复验 1301 个测试文件全部通过，16006 项通过、65 项跳过，包含新增的 4 项重新生成模型优先级测试。
- `pnpm exec electron-vite build`：Main / Preload / Renderer 生产构建通过。
- `pnpm i18n:check`：通过。
- 变更文件 Biome 格式、ESLint 与 Oxlint 检查通过（Oxlint 零警告、零错误）；提交钩子通过。
- `pnpm exec electron-rebuild --force --only better-sqlite3`：Electron 45 原生依赖重建通过，随后恢复 Node 测试 ABI。
- 本机 `electron --version` 启动探针被系统以 SIGKILL 终止；`codesign --verify --deep --strict` 显示本地 Electron.app 资源签名校验失败。未绕过系统安全校验，未将它计作桌面启动验证；正式签名、公证和应用交互需由 macOS 构建/人工验收确认。

测试覆盖日志脱敏、导入循环及回滚、工具重放与 schema、图片字节校验、翻译截图的成功/失败/过期/卸载路径、拼音、备份延后、搜索协议及降级、模型目录与投递矩阵。没有使用真实收费模型或搜索 API 进行在线调用，也未执行正式签名、公证和发布。
