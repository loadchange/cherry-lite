# Cherry Lite 朗读功能规划

状态：待实现。2026-09-06 根据当前 Lite 代码核对；本次上游回移不包含 TTS 实现。

## 产品范围

首版让划词、翻译结果和普通对话都能主动朗读，共用配置和播放器。默认不自动读回复。

| 入口 | 首版行为 | 现有接入位置 |
| --- | --- | --- |
| 划词助手一级工具栏 | 固定「朗读」按钮，直接读选中文本；不经过大模型提示词 | `src/renderer/windows/selection/toolbar/SelectionToolbar.tsx`、`src/renderer/components/selection/SelectionToolbarView.tsx` |
| 翻译结果浮窗 | 完成且译文非空时显示可用的「朗读译文」，使用实际目标语言 | `src/renderer/windows/selection/action/components/ActionTranslate.tsx`、`WindowFooter.tsx` |
| 普通聊天 | 用户消息和助手回答的操作栏增加朗读；首版仅支持已完成的正文 | `src/renderer/components/chat/messages/frame/messageMenuBarActions.tsx`、`messageMenuBarConfig.ts` |

划词朗读按钮独立于自定义操作，不占现有最多 8 项的名额；设置页的工具栏预览同步显示。开始后提供暂停、继续、停止；加载中能取消，有错误时能重试。快捷助手与独立翻译页可复用相同组件作为后续入口。

## 播放规则

全应用最多一个活动朗读会话。开始另一段时立即取消旧合成和播放；只切换页面或产生新选区不自动打断。工具栏隐藏后继续朗读，并提供独立、可关闭的轻量播放控制条。关闭控制条即停止；它不抢键盘焦点。

翻译浮窗关闭、重新翻译、回收或换成另一条 action 时，停止该浮窗所属的会话。聊天消息编辑、删除或所属话题关闭时停止对应朗读。窗口不能因为不是当前播放来源而停止其他窗口的会话。

`ActionWindow.tsx` 的窗口会池化复用，不能只依赖组件卸载来清理。`ActionTranslate.tsx` 的 `selection-translation-result` 是固定 messageId，不可直接作为全局来源 ID：使用 `windowId + actionSessionId + contentVersion`；聊天使用 `topicId + messageId + contentVersion`。

状态机：`idle → preparing → playing ⇄ paused`；完成/停止回到 `idle`，失败进入 `error`。所有合成、播放及事件携带不可复用的 sessionId，旧会话迟到的结果必须丢弃。播放宿主 ready 后才能投递首段，并校验事件来自该宿主。

## 架构

```text
划词 / 翻译 / 聊天的 ReadAloudButton 与 useTts
                  ↓ typed IPC
TtsService：文本整理、分段、声音选择、请求取消、全局会话
       ├─ Provider 适配器与主进程凭证解析
       ├─ 有上限的内存缓存
       └─ 按需创建的 AudioHost：音频队列、暂停/继续、播放回报
```

建议新增文件：

- `src/main/services/tts/TtsService.ts`、`providers/`：合成与会话管理。
- `src/shared/ipc/schemas/tts.ts`、`src/main/ipc/handlers/tts.ts`：有输入校验的请求和状态事件。
- `src/renderer/hooks/useTts.ts`、`src/renderer/components/tts/ReadAloudButton.tsx`：统一 UI 行为。
- `src/renderer/windows/audioHost/`：由 WindowManager 管理的轻量播放宿主；播放控制条可用同一窗口呈现。
- `src/renderer/pages/settings/TtsSettings/`：服务商、声音、语言偏好、语速和连接测试。

沿用通用 preload IPC 桥，不继续堆叠专用 `window.api` 方法。服务纳入 `serviceRegistry.ts` 生命周期，宿主空闲时释放。优先按需加载，避免让朗读增加常驻播放器和大体积 SDK。

Provider 接口建议提供 `capabilities`、`listVoices(config, signal)`、`synthesize(request, signal)`。请求包含 text、voice、locale、model、rate、pitch、format；配置通过服务商 ID 引用。capabilities 明确是否支持声音列表、语速/音高、SSML、流式、时间标记和输入长度限制；不支持的设置不显示。

各适配器返回统一音频段（MIME、字节、可选时长），不能假定主流厂商全部兼容 OpenAI 请求格式。合成和播放解耦，暂停不会再次调用云接口；停止则 abort 网络、清队列、释放 Blob URL。

## 服务商顺序

| 阶段 | 服务商 | 接入方式与边界 |
| --- | --- | --- |
| 技术验证 + 首版 | Microsoft Edge 在线朗读 | 无需 Azure key 的在线服务；选维护中的 Node/TypeScript 实现，不给 Lite 增加 Python/mpv 依赖 |
| 首次扩展 | OpenAI / OpenAI 兼容 | `/audio/speech`，可配 base URL、API key、model、voice；不假定存在通用 voices API |
| 首次扩展 | Azure Speech | 官方接口，独立配置资源 endpoint/region、key；声音目录、SSML、格式等由适配器处理 |
| 后续按需 | ElevenLabs、Gemini、火山豆包、阿里百炼 | 各自实现原生鉴权、请求、声音和响应格式；先通过实际服务验证再列为已支持 |

免费微软方案指 Edge Read Aloud 在线服务，不等于 Azure 官方免费 API。Edge 协议、版本校验和限流可能变化，没有可承诺的免费额度或 SLA；将其隔离为适配器，并提供明确错误与服务商切换。Azure 需要账户和 Speech 资源，免费套餐以账户、区域当时配额为准。

已核对资料：

- [edge-tts README](https://github.com/rany2/edge-tts)：在线服务、音色、语速/音高以及受限 SSML。
- [Microsoft Azure Speech REST](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech)：官方鉴权、区域、音色与音频输出。

上述为文档核对，尚未实测合成；首个实现任务先验证 Edge 当时的可用性、所选实现许可证与维护状态。

## 文本、网络和配置

从 message parts 提取正文，共用 Markdown 转朗读文本逻辑：保留自然段、标题和列表，链接只读标签，默认跳过代码、公式、思考过程、工具调用、附件及引用编号。避免把 Markdown 标记逐字念出来。

翻译直接使用 `actualTargetLanguage`；划词/聊天优先用本地语言判断与用户按语言指定的声音，不为朗读额外发一次大模型请求。混合语言可选多语言音色。

按句子/段落切分，再按 provider 限额截断；保护 Unicode 字符、转义后的 SSML 长度。首段完成立即播放，只预取后续 1–2 段。首版每段使用完整音频即可，后续再实现更低延迟的流式播放。

首版用内存 LRU，限制条目和总字节数；缓存键包含 provider/config 版本、模型、声音、语言、语速/音高、格式、文本。声音目录可缓存并手动刷新。后续若增加磁盘音频缓存，需有上限和清除入口，且不进入聊天数据库/备份。

HTTP 复用 `src/main/ai/utils/customFetch.ts` 的应用代理链；Edge WebSocket 需单独验证 ProxyService/NodeProxyController 对 HTTP、SOCKS 及代理切换的支持，不能假定 HTTP 代理配置自动覆盖 WebSocket。

「设置 → 朗读」包括：服务商、API 地址/模型、声音搜索与试听、按语言默认声音、语速、音量、测试连接。只有主动朗读、试听、测试或请求声音目录时联网。首次启用说明所读文本会发送给选定服务商。

API key 只在主进程解析，可引用已配置的模型 provider 并通过 `ProviderService.resolveApiKey()` 使用。现有服务在 DTO 中隐藏 key，但不是统一加密凭证库；TTS 独立 key 应另建小型 `safeStorage` 存储，preferences 只留 credential reference。不要把 key、朗读全文或音频写入日志和广播状态。

## 实施与验收

1. Edge 技术验证：中英文声音、长文本、取消、代理和打包后的音频播放；确定 JS 实现。
2. 首版闭环：共享服务/播放器、三个入口、设置、Edge、分段/互斥/缓存；两种 UI 语言。
3. 扩展验证：接 OpenAI 兼容与 Azure，用真实服务验证 provider 抽象，记录账号与地域限制。
4. 可选增强：其他厂商、自动朗读、边生成边读、词级高亮；单独排期。

核心测试：三个入口读对文本；译文完成前不可读；空文本不发请求；中英文和混合文本分段；Markdown 清理；跨窗口互斥；工具栏隐藏后继续；浮窗池化复用停止旧内容；停止后迟到数据不能再播放；网络错误/401/429/代理失败可恢复；切声音缓存隔离；退出释放网络、音频和窗口。

发布前在 macOS Apple Silicon 与 Intel 包验证划词权限、浮窗焦点、系统音频输出和应用代理；本地自动化通过不等于已验证真实微软或付费服务。
