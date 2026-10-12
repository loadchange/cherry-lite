# 2026-10-12 上游同步（选择性回移）

状态：本轮回移已完成自动化批次与手工批次，类型检查通过，验证结果见文末。剩余待续项按原因分类列在「未纳入」一节，供下一轮继续。

## 对比基准

- 上次同步基准：`67ca175cc`（2026-09-06，见 [UPSTREAM_SYNC_2026-09-06.md](UPSTREAM_SYNC_2026-09-06.md)）。
- 本轮上游 head：`99dea32b3e`（2026-10-12）。区间内上游共 594 个提交（v2.0.13 → v2.1.6，9 个版本）。
- 筛选口径：按 Lite 现存文件精确匹配 + 已移除模块排除，得到 259 个候选提交；其中 206 个进入回移队列。
- 分支：`sync/upstream-2026-10-12`（本地）。`upstream` remote 指向本地 cherry-studio checkout，可改为 `https://github.com/CherryHQ/cherry-studio.git`。

## 回移方式

- 完全命中 Lite 保留文件的上游提交：`git cherry-pick -x`，提交信息保留来源 SHA。
- 与已删除模块混在一起的提交：按保留路径裁剪补丁后 `git apply -3`，提交信息记录来源 SHA。
- 冲突自动解析规则：i18n locale JSON 做键级合并（只增改、不删 Lite 自有键）；Lite 已删除的文件维持删除；测试、lockfile、文档冲突保留 Lite 版本；pnpm 变更除补丁哈希外不引入。
- 手工移植：文件偏离度小但 git 无法合并的提交，按上游 diff 在 Lite 代码上重新实现（保留来源 SHA）。
- 依赖边界：保持 Lite 现有依赖集合，未跟随上游的 Electron / Vite / SDK 等整链升级。

## 本轮已回移（69 个上游提交）

### 翻译（1）

- `300fbeccc4` fix(translate): preserve keyboard activation of history stars (#20148)

### 划词与快捷助手（2）

- `bb0b4f2fc9` fix(selection): inherit quickAssistant MCP for built-in quick actions (#19765)
- `dbe5eaa090` fix(quick-assistant): preserve dark surface on Windows (#20319)

### 输入框（composer）（2）

- `4e3aed720c` fix(composer): hide focus shortcut hint from layout when editor is focused (#20276)
- `5d03c08016` fix(composer): attach every pathless clipboard image in one paste (#20691)

### 聊天、消息与流式（18）

- `4a189deade` fix(mistral-ocr): inline separated tables into converted markdown (#20137)
- `885ff64589` fix(chat): show multi-model scrollbar on hover (#20247)
- `2c8c204293` fix(right-pane): drop the close tooltip when the panel closes (#20110)
- `1fe4dbe51f` fix(markdown): preserve table cell word boundaries (#20502)
- `63f2871b20` fix(provider): normalize reasoning_effort for GitHub Copilot (rebases #18368, closes #11140) (#19720)
- `a5a08f99c9` fix(markdown): preserve single-tilde text (#19783)
- `8b4016a8aa` fix(code-block): keep toolbar visible on scroll (#19008)
- `525af04721` fix(smooth-stream): flush buffered text on completion (#20132)
- `8d4ca68e8f` fix(home-page): clear last-used topic id on NOT_FOUND recovery (#21112)
- `801dc23a00` fix(markdown-table): prevent file paths from collapsing columns (#21246)
- `d8ac9372e9` fix(error-classifier): classify Chromium net::ERR_* transport failures (#20595)
- `e0b2aa2000` fix(chat-errors): recover from generic API 400 responses (#20087)
- `bf54308ca2` fix(chat): preserve sidebar state when switching tabs (#20341)
- `2f177aa1fa` fix(conversation-list): expand all group items on show more (#20697)
- `33a4a2feda` fix(chat): render remote video results (#19404)
- `31ebde444e` fix(html-to-markdown): convert a fetched table into a table (#20644)
- `19396de8cc` fix(reasoning-extraction): keep literal think tags in the answer (#21023)
- `c67b420e89` fix(chat-shell): prevent hidden layout scrolling (#20585)

### 模型目录与提供方（6）

- `1c136fd018` fix(azure-openai): preserve custom gateway URL semantics (#20157)
- `97174b0fd5` fix(aihubmix): add newer model families to web-tool prefix lists (#20567)
- `6a319bfb76` fix(copilot): route GPT-6 Astra through Responses API (#20632)
- `70ff39f78f` fix(provider): keep list order on enable and insert new providers first (#19488)
- `b06215b365` fix(copilot): route GPT-6 family through Responses API (#21138)
- `7bedde3fce` fix(model-list): keep numeric group names in model order (#21130)

### MCP（6）

- `2529fb887d` fix(mcp-catalog): keep the failure backoff when a tools refresh fails (#20507)
- `e72ed337cf` fix(migration): keep a malformed MCP server record from aborting the v2 migration (#20372)
- `b832bb8ca4` fix(filesystem): write replace_all replacements literally (#21127)
- `325c3accd4` fix(filesystem): report why ls cannot list a path instead of calling it empty (#21189)
- `0cd237652c` fix(mcp): reject DXT/MCPB archives whose entries fold to one path (#21186)
- `b73bad4927` fix(filesystem-mcp): reject dangling symlinks that escape the workspace root (#20505)

### 网页搜索（1）

- `f2e2c29e19` fix(websearch): rotate API keys over distinct entries (#21039)

### 文件、OCR 与预览（11）

- `ed5b2d2b98` fix(file): silence EPERM/EACCES dir-fsync errors on Windows (#20705)
- `f6a1533843` fix(file-icon): resolve the icon from the base name of Windows paths too (#21109)
- `180fcc13b8` fix(file-preview): derive the code language from the file name only (#21038)
- `815057d64a` fix(dangling-cache): discard stale presence probes (#21510)
- `0649df2ce2` fix(file): recover directory trees after watcher errors (#20950)
- `360848d035` fix(directory-tree): clean up failed initialization (#21504)
- `a1ffe0bac0` fix(directory-tree): discard stale pending additions (#21508)
- `4470cefb62` chore(system-ocr): bump native OCR packages to 1.2.0 (#20985)
- `e22f236908` fix(file-import): derive URL extension from pathname (#21500)
- `9a45ae823c` fix(files): report real existence for the requested name in fileNameGuard (#21522)
- `018e13a2d8` fix(orphan-sweep): preserve retained blobs with tmp-shaped extensions (#21499)

### 窗口、托盘与通知（6）

- `f0f48f9f52` fix(shortcuts): report conflicts between main and renderer keybindings (#20339)
- `b5270f22b2` fix: restore window focus on Windows after hiding main window (#16277)
- `7bd23b0426` fix(main-window): don't reload a destroyed webContents on render-process-gone (#20894)
- `94be5fe756` fix(main-window): restore macOS window on first Dock click (#19642)
- `24e68b754c` fix(window-manager): never hide a fullscreen window on close (#21072)
- `b4a9c86b01` fix(sub-window): apply persisted zoom factor to detached tab windows (#20696)

### 数据与迁移（5）

- `c8676c90b7` fix(region-service): do not treat detection failures as China (#20117)
- `ea2f6bc3be` fix(region-service): scope in-flight lookup to proxy (#20150)
- `216be106c3` fix(v2-migration): surface the driver reason behind a failed schema migration (#20399)
- `93a0dcf923` fix(seeding): lint-ban overwriting upserts in seeders (#20729)
- `35b6294d1e` feat(data-migration): record v1 migration origin (#20171)

### 基础设施与其它（11）

- `ff16406d30` fix(trace): stop truncating long turn outputs and freezing on large trace payloads (#20199)
- `765785b360` fix(image-preview): flip images along screen axes after rotation (#20188)
- `3c828dc39b` fix(preference-hooks): stabilize multi-key subscriptions (#18624)
- `ce3835c66c` fix(binary-manager): refresh dependency state after update checks (#20464)
- `7913233d67` fix(user-popup): allow spaces inside the user name (#20716)
- `0587b73570` refactor: remove maps that are filled but never read (#21363)
- `bb7493e698` fix(search): anchor heading strip regex to line starts (#21472)
- `c712a22e99` fix(renderer-utils): remove exponential backtracking from README and image regexes (#21330)
- `94d673daf6` fix(global-search): debounce queries and skip IME composition intermediates (#19253)
- `ec821245aa` fix(ui): make tooltip content inert to pointer events to break hover reopen loop (#21214)
- `b1411af1ac` fix(shared): trim trailing whitespace/dots after 255-char truncation (#21501)
## 本轮手工移植（git 无法自动合并的部分）

以下提交的文件偏离度小，但 Lite 与上游的中间重构差异导致 git 无法合并，按上游 diff 在 Lite 代码上重新实现，并保留来源 SHA：

| 上游提交 | 内容 | Lite 适配 |
| --- | --- | --- |
| `b1411af1ac` | 文件名截断后再清理尾部空格/点 | 直接移植（含回归用例） |
| `33a4a2feda` | 聊天渲染远程视频 + 三个窗口的 CSP `media-src` 放开 http/https | 直接移植（含 CSP 守卫用例） |
| `31ebde444e` | fetch MCP 的 HTML→Markdown 输出表格 | 新增 `src/main/utils/htmlToMarkdown.ts` 并接入 fetch |
| `0cd237652c` | 拒绝折叠后同路径的 DXT/MCPB 压缩包 | 新增 `src/main/utils/zipSafety.ts`，`McpPackageService` 改为引用并保留原有导出 |
| `7bedde3fce` | 模型列表数字分组名保持模型顺序 | 改写 `groupModelEntries`（Map 保序）+ 调用方 |
| `19396de8cc` | 只把回复开头的 ` thinking` 块当作推理 | 新增 `reasoningExtractionMiddleware.ts`，替换 AI SDK 的 extractReasoningMiddleware |
| `c67b420e89` | 聊天外壳高度改由 flex 父级决定，避免隐藏布局滚动 | 直接移植（Lite 的导航栏宽度变量保留） |
| `1b62ad420f` | 划词动作窗滚动后仍可拖拽 | 直接移植（去掉内层 no-drag） |
| `018e13a2d8` | 孤儿清理保留扩展名像 tmp 残留的正式文件 | 适配 Lite 的清理实现（无 intake 保护层，改用 `findById` + `resolvePhysicalPath`） |
| `b73bad4927` | filesystem MCP 拒绝指向工作区外的悬空符号链接 | 新增 `canonicalizePathForContainment`，接入 `validatePath`（含 4 条回归用例） |

其余落地方式：与已删模块混在一起的提交按保留路径裁剪补丁（`git apply -3`），i18n 按键级合并，测试/lockfile 冲突保留 Lite 版本。

## 本轮同步辅助提交

| 提交 | 说明 |
| --- | --- |
| `bae90ac07` | 回退 `4470cefb62`（system-ocr 1.2.0 升级）：自动回移只改了 package.json 与补丁文件，lock/workspace 仍指向 1.1.0，保持 Lite 依赖集合并归入依赖批次 |
| `871d2d8d8` | 删除 `9f912976e` 留下的未引用 motion-dom 补丁文件 |
| `55402930f` | 修复落地提交引入的类型错误（electron `net` 导入、`isDestroyed` mock、user-event 导入、三条孤儿测试）并更新 copilot 补丁哈希 |
| `24728a473`、`1671f0a64`、后续两条 | 适配 SubWindowService / GlobalSearch（新的 IME 防抖）/ MainWindowService / ProviderService.reorder / keybindings 测试，并收紧 base64 图片正则 |
| `ba3e09aec` | 对回移文件跑 biome format |

## 验证

环境：Node.js 24.11.1、pnpm 11.8.0。

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck`（node/web/aiCore） | 通过 |
| 全量 Vitest（`--maxWorkers=4`） | 1272 个文件全部通过；15,261 项通过、65 项跳过 |
| 定向回归 | htmlToMarkdown、filename 截断、McpPackageService、chat-window-csp、MessageVideo、orphanSweep、filesystem MCP（含悬空符号链接 4 例）、GlobalSearch（27 例）均通过 |
| `oxlint --deny-warnings` | 1 条既有告警（`scripts/verify-mac-update.js`，来自 Lite 自己的 updater 提交，与本次同步无关） |
| `biome format` | 回移文件已格式化；仅 `biome.jsonc` 为既有未格式化文件 |
| 未执行 | `pnpm build`（Electron 打包）、eslint 全量、i18n:check、交互式实机回归 |

## 后续建议

1. 下一轮继续处理「A. 需要手工移植」清单（136 项），建议按区域分批：翻译 → 划词/快捷助手 → 文件与预览 → MCP → 聊天与输入框 → 模型与设置。
2. 依赖/工具链（Electron 44、Vite 8、MCP SDK 1.32、pnpm 12、TS/Oxlint 新链）单独一批，连同锁文件整体迁移。
3. 模型目录按 `packages/provider-registry/README.md` 的定向生成流程补齐本轮新模型与新 provider。
4. 合并前建议在 main 上跑一次 `pnpm test:lint` 与 `pnpm build`，并按 Lite 发布流程出一次 macOS 包做冒烟验证。

## 未纳入本轮同步

### A. 需要手工移植（Lite 结构与上游差异较大，共 136 项）

这些提交触及的 Lite 文件已落后于上游的中间重构（例如 MessageService、composer 运行时、ProviderSettings、AiStreamManager 等），需要逐个按上游 diff 在 Lite 代码上重写；多数是保留范围内的修复与少量功能，建议下一轮按区域分批处理。

**翻译（4）**

- `b0504ced17` feat(translate): render streamed output with shared StreamingMarkdown (#17627)
- `3ce2735982` fix(translate): cancel the in-flight stream before replacing output (#20152)
- `8d8649f348` fix(translate): explain automatic bidirectional translation (#20638)
- `04c0705d3f` fix(translate): preserve and render Mermaid markdown (#21139)

**划词与快捷助手（4）**

- `34ff80735f` feat(history): add select-all shortcuts and shift range selection (#20278)
- `61af56598c` fix(selection-action): wrap long result code blocks inside the panel (#19503)
- `79381a8ff9` fix(selection-assistant): preserve fullscreen popup coverage on macOS (#21309)
- `1b62ad420f` fix(selection-assistant): preserve window dragging after scrolling (#21467)

**输入框（composer）（17）**

- `421918ae9f` feat(composer): add focus shortcut hint (#20079)
- `baf9b28d1e` feat(composer): highlight MCP toolbar when tools are active (#20766)
- `cdffae2fb5` feat(composer): search nested resources from slash panel (#21007)
- `4a64afb10e` fix(chat): use composer model override on regenerate (#21100)
- `5546a776cd` fix(chat-composer): keep tool-split assistant replies editable (#19971)
- `8d35232690` fix(composer): automatically follow prompt text direction (#21463)
- `1f6bebade6` fix(composer): clarify workspace resource search results (#21516)
- `faa1b74834` fix(composer): fall back to clipboard image when pasting from Flatpak apps (#21503)
- `d382f4d514` fix(composer): keep unsubmitted AskUserQuestion answers across remounts (#20785)
- `2183c75bb6` fix(composer): let AskUserQuestion custom answers wrap and grow (#20786)
- `2c839855a0` fix(composer): persist atomic chat draft snapshots (#19901)
- `09d4ea5e2f` fix(composer): prefer text for rich Excel clipboard pastes (#21031)
- `4828b1c7c0` fix(composer): preserve input focus when sending messages (#20590)
- `c90ff3dbdf` fix(composer): reclaim input width from corner padding (#20672)
- `61cac30ece` fix(composer): stop pasted-text data loss on copy and over-limit insert (#18855)
- `c41914e5c1` fix(composer): stop rewriting the input with a stale snapshot after a long-text paste (#20508)
- `6388238e33` fix(composer): toast when pasted file lookup returns null (#20704)

**聊天、消息与流式（51）**

- `2bab17eb11` feat(chat): add context menu actions for conversation links (#20646)
- `5b0fe61103` feat(global-search): show conversation owner and workspace context (#20352)
- `7c55f629e7` feat(markdown): link bare file paths in assistant output (#19534)
- `a3cd46c94c` feat(markdown): preview LaTeX code blocks and preserve display math (#20577)
- `7f1f9b926f` feat(messages): add select-all to multi-select (#20257)
- `0ff55e7e0e` fix(ai-core): scope internal resolver plugins to the request (#20921)
- `6ff7dd15ff` fix(ai-errors): preserve messages from structured provider failures (#20525)
- `1ec611a1df` fix(ai-sdk): expand type arrays into anyOf branches for Gemini (#21396)
- `8d671515b1` fix(ai-sdk): retype non-string tool enums for Gemini function calling (#20802)
- `7fc9b062d7` fix(ai-sdk): stop replaying function_call item ids to the Responses API (#20130)
- `eda8726027` fix(ai-sdk): strip propertyNames and additionalProperties for Gemini tools (#20955)
- `988ce67582` fix(chat): ignore orphaned attachments in text-only requests (#20210)
- `abf873d579` fix(chat): improve thinking panel layout and readability (#20924)
- `71bfd235ba` fix(chat): keep multi-model group replies on their own model when retrying (#21145)
- `0be8abbb77` fix(chat): preserve bottom following across native scroll gestures (#20914)
- `2e100bddd5` fix(chat): preserve grouped replies when deleting context response (#20233)
- `71bd508edb` fix(chat): resolve migrated managed image paths at render time (#20803)
- `d16aa676ce` fix(chat): restore bottom-follow after sending (#20491)
- `bc76f7f7b4` fix(chat-actions): keep controls accessible without hover (#20983)
- `36dd9771b7` fix(chat-compaction): show progress inside assistant messages (#21441)
- `0ace3d05bb` fix(chat-errors): show safe provider retry details (#20085)
- `4fd31aef1c` fix(chat-layout): isolate detached pane state (#20828)
- `de2bc0aed0` fix(chat-layout): use narrower default artifact pane width (#18981)
- `c97c23c0a9` fix(chat-scroll): forward horizontal multi-model boundary wheels (#20755)
- `bea7b78f42` fix(chat-scroll): prevent multi-model scroll rebound (#20289)
- `69461d74fa` fix(chat-ui): adjust clear dialog focus and model group tooltip (#20629)
- `8b3d229e0a` fix(code-block): save edits to the block that was edited (#20680)
- `b6112983a5` fix(history): keep history open after deleting conversations (#20288)
- `17faa3cdcf` fix(markdown): prevent raw message flashes during lazy loading (#20671)
- `a803724eb1` fix(markdown): remeasure the chat SVG renderer per source (#21107)
- `6ae3b04f7a` fix(markdown): render KaTeX glyph SVGs outside the context menu wrapper (#20708)
- `5b996eba95` fix(markdown): stabilize plugin identities to avoid per-tick full re-parse (#20750)
- `cb05268339` fix(mcp): forward tool-result media to modality-capable models (#21308)
- `0e15ac96b0` fix(message-parent): reject self and cross-topic parents (#21466)
- `c459f47008` fix(message-reply-group): invalidate descendant context on deletion (#21492)
- `1ae44f89d2` fix(message-service): keep surviving replies on the branch after deleting the active node (#20254)
- `b3a9321874` fix(message-tokens): distinguish unavailable usage (#20011)
- `c8596f8679` fix(model-list): enable web search for tool-capable LMStudio/Ollama models (#20664)
- `66aa49cd7f` fix(notifications): show conversation title and final sentence (#21424)
- `386fd4d284` fix(resource-list): animate rows moving after removal (#21517)
- `2b27126ced` fix(right-pane): drop tooltips anchored in panels hidden by panel switching (#20879)
- `027f6cece6` fix(sidebar): remove app-specific shortcut restrictions (#20722)
- `ae62b5a7cd` fix(stream-manager): preserve streamed content on mid-response failures (#21338)
- `ae9035b1b7` fix(stream-manager): wait for terminal dispatch before admitting a follow-up stream (#20393)
- `71172b6035` fix(tool-approval): attribute a user's tool denial reason to the user (#21252)
- `00b9802a3c` fix(tool-disclosure): match the thinking panel height and scroll containment (#21160)
- `d68cea2317` fix(tool-repair): preserve canonical argument shape (#20043)
- `43d4c2bbd9` fix(topic-list): keep pinned indicator visible without hover (#20441)
- `71127dee7f` fix(topic-purge): chunk permanent deletion in one transaction (#21494)
- `2f7f5d7386` perf(message-renderer): isolate content from topic status updates (#20185)
- `506b00c813` refactor(message-list): isolate per-message stream activity subscriptions (#19875)

**模型目录与提供方（16）**

- `a745232f4f` feat(provider-settings): clarify Doubao Volcengine Ark setup (#21116)
- `cfc08a1dd7` feat(web-search): add Serply search provider (#20370)
- `d06547fedb` fix(deepseek): refresh model discovery and bundled catalog (#20869)
- `ee0578a595` fix(model-discovery): make registry supplementation opt-in (#20876)
- `ae4d9bc634` fix(model-list): keep valid models after malformed entries (#20450)
- `6470a65ee6` fix(model-list): list LM Studio models from /api/v0/models (#20346)
- `b7f7eeed82` fix(model-retry): fail over API keys on auth and rate limits (#19978)
- `cd73fbd28d` fix(model-selector): improve tag filter chips spacing and overflow behavior (closes #18411) (#19710)
- `e4dd708f2f` fix(model-selector): merge and prioritize CherryAI models (#20270)
- `9319924595` fix(provider): list models over the Chromium network stack (#20906)
- `13f6d8745a` fix(provider): omit app attribution for custom providers (#19531)
- `16cf870ebc` fix(provider-registry): require explicit model resolution context (#20583)
- `a5aac1c369` fix(provider-registry): resolve CherryIN Qwen 3.5 9B metadata (#20495)
- `4c54f98a17` fix(provider-service): show all providers for v1 upgrades (#20172)
- `b5b7fcc36c` fix(provider-settings): bound the model list so virtualization works (#20133)
- `f361d827b5` fix(provider-settings): restore unified model list scrolling (#21011)

**MCP（3）**

- `f4bafa8d16` feat(mcp): keep mcp-auto-install writes inside the Cherry tree (#20847)
- `c8d2626ce2` fix(mcp-oauth): start OAuth callback before connecting (#20703)
- `50d69b6856` fix(mcp-settings): enable imported servers instead of probing them disabled (#21323)

**网页搜索（1）**

- `dd0767e1e7` feat(web-search): add self-hosted Crawl4AI URL fetching (#21334)

**文件、OCR 与预览（9）**

- `dab09e3912` feat(file-processing): support MinerU 4 self-hosted API (#21004)
- `38b7efdc45` fix(data): backfill legacy file cleanup policy (#19287)
- `9d0693dea7` fix(dev-profile): isolate preboot paths under one root (#20135)
- `db09dcc7bd` fix(directory-tree): release trees via WindowManager.onWindowDestroyed (#20566)
- `bf8009ebac` fix(directory-tree): retain watcher fallback after missed rename (#21505)
- `9ba2c97987` fix(file): guard default-open against paths the OS cannot chdir into (#21248)
- `113ef7eaf1` fix(file-preview): serve pdf.js CMaps over IPC so non-embedded CID CJK text renders (#21067)
- `6ea272aabe` fix(logger): strip unbounded error fields before writing file logs (#20437)
- `8f070a98ef` fix(pdf-preview): normalize page input after submission (#20141)

**备份（3）**

- `d6cf4b78cd` fix(backup): explain background task timeout failures (#20628)
- `a37684b8c0` fix(backup): support Windows drive root destinations (#21398)
- `cbc037f29a` fix(backup-restore): isolate sessions and clean failed restores (#21385)

**窗口、托盘与通知（10）**

- `fb1895c7b7` feat(shortcuts): close the active tab with Command+W (#20690)
- `824c92cd6c` fix(app-shell): close the window when the tab-close shortcut fires on the last tab (#21144)
- `b718f3a568` fix(global-search): distinguish recent settings destinations (#20639)
- `a3bd348b50` fix(macos): warn when Intel builds run on Apple Silicon (#20812)
- `b19ec7b667` fix(migration-v2-window): preserve portable relaunch path (#20468)
- `1cceda9711` fix(notification): clear macOS Dock badge when all notification prefs are off (#20754)
- `febb301b27` fix(power): tolerate blocked Windows shutdown addon (#20923)
- `9279b4a545` fix(settings): open settings and authorization links externally (#20845)
- `65efb53f73` fix(shortcut): label the Enter key as Return on macOS (#20279)
- `b4f0a83104` fix(windows): use a stable identity for tray icons (#21294)

**数据与迁移（6）**

- `ebeb21154e` fix(database-seeding): avoid startup readiness re-entry (#20275)
- `af8b4eafc0` fix(migration-v2): defer direct migration ceiling to v3.0.0 (#20698)
- `985b8142f6` fix(proxy): bypass IPv4 and IPv6 loopback for local services (#21003)
- `1cbbe14dfe` fix(proxy): bypass localhost for Node requests (#20969)
- `ab2f25cc3c` fix(proxy): match unbracketed IPv6 bypass rules as addresses (#21005)
- `a57d800a1d` fix(v2-migration): retry startup storage failures (#20454)

**基础设施与其它（12）**

- `64da47fa6a` feat(cherryin): use HTTP loopback for OAuth sign-in (#20280)
- `f5002e610c` feat(launchpad): add theme-aware card surfaces to built-in app tiles (#17157)
- `a0184cb9e0` fix(ai-transport): drain cancelled execution snapshot readers
- `64a09ddb23` fix(assistant-relations): deduplicate linked IDs (#21470)
- `0b51b59f8f` fix(binary-manager): surface managed Python execution failures (#21300)
- `3aedb25087` fix(error-detail): render error cause as text instead of HTML (#20883)
- `e18c057479` fix(html-preview): reserve stable scrollbar gutter to stop text jump (#19491)
- `aac4b35070` fix(prompt-polish): add timeout and cancellation (#20170)
- `6534fc9ece` fix(toast): align action content (#20634)
- `322e794a99` fix(ui): make tooltip close deterministic and sweep closed remnants (#20100)
- `9664fdd157` perf(html-artifacts): skip full-element height sweeps for scrollable previews (#18927)
- `e746639ae6` refactor(router): read page search from the route instead of a cast (#20108)

### B. 需要单独决策或整链升级

- 工具链整批升级：Electron 41.8→44.4、Vite(rolldown 7.3)→8.2、vitest 3→5、pnpm 11.8→12.6、TypeScript 5.8→5.9 + Oxfmt/oxlint 1.76、Node engine 24.12+、bun 1.4.2 等（上游 `87ec058c55`、`fcd7bdfe5c`、`24a373f781`、`c408f51c71`、`eb5abde447`、`19b03f1842`）。需要连同锁文件整体迁移。
- MCP SDK 1.27.1→1.32 与交互请求链路：`98863dd545`（feat(mcp-runtime): support MCP SDK v2 and interactive requests）。
- 新功能：file-preview 便携预览与 npm 发布（`95584001a3`、`555f219cea`）；更新器差量下载（`95f2a0b1ec`）；日志保留清理（`496c70b400`）；provider 费率/账单（`59e7814354`、`f016654e9b`）；provider-registry 独立 npm 包（`19309e5bef`）；utilityProcess V1 与本地 embedding/OCR 迁移（`d7cb134d7b`、`af516f34df`）。
- 大型重构（不建议整体拿，可按需择机）：AI 请求管线按模态拆分（`8500078942`）、运行时状态集中（`142e395019`）、异步调度原语（`725ab340a2`）、preload dataApi 类型化（`2811aebc8e`）。
- 划词 → office 文件预览的生产者链路（`0a03de7990`、`771f9b7e68`）：捆绑了已移除的 office-transform skill，只能取 FilePreview/selection 部分。
- Windows/Linux 专属（Lite 仅发 macOS 时可跳过）：WCO 标题栏（`6cabc21ed2`）、原生 Windows 标题栏（`936b4a019f`）、Wayland 窗口（`e2f53146eb`）、AppImage（`737e09dc6a`）、Windows 签名过滤（`fd6532dcbe`）、Linux selection-hook prebuild（`8277e5778f`）。
- 模型目录定向生成（provider-registry）：DeepSeek V4.1 Flash GA/Expires-On、GPT-6 Sol/Luna、GPT-6.1 Sol、Grok 4.7、MiMo V2.6、MiniMax M3.1、Claude 5.5 系列、muse-spark 1.3，以及 Kimi/GLM/MiMo 采样与输出上限修正、Moonshot 全球端点、oMLX、LiteLLM、tokendance 等新 provider。按 Lite 的定向生成流程处理（见 packages/provider-registry/README.md）。

### C. 不适用或不处理

- 已移除模块（Agent/会话、浏览器与 WebMCP、Skills、Claude Code/Pi/DSH、知识库、笔记、绘图/ComfyUI、MiniApp、云备份、导出、遥测/诊断、渠道、远程访问、回收站/归档/定时任务、截图 OCR、设置搜索、多语言、上游 CI/发布体系）— 共约 380 个提交。
- `e2cde8ff22`（macOS 签名 keychain 修复）Lite 已在 `6c269c81d` 回移。
- `4470cefb62`（system-ocr 1.2.0 升级）本轮尝试后已回退（见 `bae90ac07`），归入依赖批次。
- `1b6fb825d7`（Perplexity 归属标识）等纯文案/品牌调整未纳入。
- 目录树 `fix(directory-tree)` 系列（`db09dcc7bd` 等）：Lite 的文件树实现缺少上游的 builder 模块，本轮只落地了源码可对齐的部分。
- SVG 渲染测量修复 `a803724eb1`：Lite 的 markdown 管线已不再产生 `data-needs-measurement`，不适用。
