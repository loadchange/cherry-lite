# Cherry Lite 朗读功能：实现记录与使用说明

状态：首版已实现（2026-09-06）。划词助手、翻译浮窗和普通聊天已接入同一个朗读服务；免费 Microsoft Edge 合成已通过真实中英文及代理验证。本文记录当前实现和原方案落地情况。

## 如何使用

打开「设置 → 朗读」，默认服务商是 Microsoft Edge 在线朗读，无需 API key。声音留空时按语言自动选择；可直接点击「试听」，也可先点击「刷新声音列表」搜索并选择声音。刷新和试听会先保存当前设置。支持单独指定中文、英文声音，语速为 0.5–2 倍，音量为 0–100%。

| 使用位置 | 操作 |
| --- | --- |
| 划词助手一级工具栏 | 选中文字后点击固定的「朗读」按钮，直接朗读选区，不经过大模型。按钮独立于自定义操作，不占最多 8 项的名额，设置页预览同步显示 |
| 翻译结果浮窗 | 译文完成且非空后点击「朗读译文」，使用译文和实际目标语言 |
| 普通聊天 | 用户消息、已完成的助手回答操作栏中点击朗读；只读正文，不读思考、工具调用、附件等消息部分 |

开始后可在原入口或独立播放控制条暂停、继续、停止；准备阶段也能取消。失败时可从原入口重试。首版不自动朗读新回复。

划词工具栏隐藏后仍可继续播放。关闭独立播放控制条的 X 会立即停止并销毁播放器；正常播放完毕或停止后，空闲宿主在 10 秒后释放，错误状态保留 60 秒后释放。播放宿主由 WindowManager 按需创建，不是常驻播放器。

## 已支持的服务商

| 服务商 | 配置与实现 | 验证范围 |
| --- | --- | --- |
| Microsoft Edge 在线朗读 | 免费在线方案，不需要 Azure key；默认中文 `zh-CN-XiaoxiaoNeural`、英文 `en-US-JennyNeural`，支持声音目录和语速 | 真实中英文 MP3、声音目录、HTTP CONNECT、SOCKS5、hostname bypass 和取消成功 |
| OpenAI / OpenAI 兼容 | API 地址默认 `https://api.openai.com/v1`，调用 `/audio/speech`；填写 key、模型和声音，默认模型 `gpt-4o-mini-tts`、声音 `alloy`，可输入兼容服务自己的模型/声音 ID | 请求格式、鉴权、取消、错误和音频响应通过 mock 测试；没有付费凭证，未调用真实付费 API |
| Azure Speech | 填写 Speech 资源 key 和区域（如 `eastus`），也可设置资源 endpoint；使用原生 SSML、声音目录和 MP3 输出 | SSML、区域 URL、鉴权、声音列表和错误处理通过 mock 测试；没有 Azure key，未做真实服务验证 |

OpenAI 没有统一的声音列表 API，因此该模式显示内置声音候选，不会把任意兼容服务视为支持 OpenAI 的全部声音。Azure 与 Edge 使用各自的微软协议，并非套用 OpenAI 格式。

当前设置保存一份“活动服务商配置”。切换服务商会清空页面上的 endpoint、声音覆盖等专属项，不是完整的多配置 profile 管理器；回切时应核对并保存所需配置。API key 按服务商、endpoint 和区域隔离保存，切换到新地址不会自动把旧 key 发过去。

免费微软方案是 Edge Read Aloud 在线服务，不等于 Azure 官方免费 API。Edge 协议、版本校验和限流可能变化；出现服务不可用时可以重试或切换服务商。Azure 的收费、免费层和区域可用性取决于所用账户与 Speech 资源。

## 播放与会话行为

全应用最多一个活动朗读会话。开始另一段会取消旧合成并停止旧音频；暂停不会重新调用合成接口。关闭或复用翻译浮窗、重新翻译，以及聊天正文变化或来源卸载时，停止对应来源的会话；非当前来源不能停止其他窗口的朗读。

来源 ID 包含独立实例标识与内容版本，避免固定翻译 messageId 或窗口池复用导致串音。每次合成、音频投递和播放事件都携带新的 sessionId；过期结果与事件被丢弃。播放宿主就绪后才投递首段，并校验宿主事件的发送窗口。

状态为 `idle → preparing → playing ⇄ paused`；完成或停止回到 idle，失败进入 error。网络、超时、鉴权、限流、配置、响应和播放器错误使用固定错误码与界面提示，不把服务端原始响应显示给用户。

## 实际架构与文件

```text
划词 / 译文 / 聊天 ReadAloudButton + useTts
                  ↓ typed IPC
TtsService + TtsSessionManager
       ├─ 文本清理、按语言选择声音、分段、全局会话与取消
       ├─ Edge / OpenAI-compatible / Azure 适配器
       ├─ 32 MiB、最多 64 项的内存 LRU 缓存
       └─ WindowManager AudioHost：队列、暂停/继续、播放回报
```

| 职责 | 实现文件 |
| --- | --- |
| 主进程服务、会话、缓存 | `src/main/services/tts/TtsService.ts`、`TtsSessionManager.ts` |
| 文本与 provider | `src/main/services/tts/text.ts`、`providers/{edge,openai,azure,common,registry,types}.ts` |
| OS 加密凭证 | `src/main/services/tts/TtsCredentialStore.ts` |
| 共享类型与 IPC 校验 | `src/shared/tts.ts`、`src/shared/ipc/schemas/tts.ts`、`src/main/ipc/handlers/tts.ts` |
| 统一按钮与订阅 | `src/renderer/hooks/useTts.ts`、`src/renderer/components/tts/ReadAloudButton.tsx`、`MessageReadAloudButton.tsx` |
| 播放窗口 | `src/renderer/windows/audioHost/AudioHostApp.tsx`、`AudioPlayback.ts`、`entryPoint.tsx`、`index.html` |
| 设置页 | `src/renderer/pages/settings/TtsSettings/TtsSettingsPage.tsx` |
| 划词入口 | `src/renderer/windows/selection/toolbar/SelectionToolbar.tsx`、`src/renderer/components/selection/SelectionToolbarView.tsx` |
| 翻译入口 | `src/renderer/windows/selection/action/components/ActionTranslate.tsx` |
| 聊天入口 | `src/renderer/components/chat/messages/frame/messageMenuBarActions.tsx`、`messageMenuBarConfig.ts` |

沿用通用 preload IPC 桥与现有服务生命周期。Provider 暴露 `capabilities`、`listVoices(config, signal)`、`synthesize(request, config, signal)`，返回统一的 `{ audio: Uint8Array, mimeType }`。当前请求支持 text、voice、locale、rate、model；没有把尚未实现的 pitch、流式音频或词级时间戳包装成可用功能。

## 文本、资源与隐私

聊天从 message parts 提取正文；清理 Markdown 时保留标题、列表和链接标签，跳过围栏/行内代码、常见公式、思考标签、图片与引用编号。使用本地脚本判断作为声音语言的回退，不额外调用大模型；翻译入口优先传实际目标语言。

按句子、词与 Unicode 字素边界分段，以转义后的 SSML UTF-8 字节数计限。会话当前每段最多 1800 字节，且不超过 provider 上限（当前为 3000 字节），不拆开 emoji 字素或 XML 转义。首段完成即播放，只提前合成后续 1 段。适配器总请求超时为 45 秒，单次音频响应上限为 8 MiB；停止会取消网络与清理播放队列。

缓存仅存内存，限制为 32 MiB、64 项；缓存键包含合成配置、声音、语言、文本等的散列，改变声音、语速、模型、endpoint 或 key 不复用旧音频。音量在播放端处理，不重复合成。没有新增磁盘音频缓存，也不把音频存进聊天数据库。

打开设置页只读本地配置，不请求服务商。只有主动朗读、试听或刷新声音时联网；设置页与朗读入口说明所读文本会发送给选定服务商。

key 由主进程读取，使用 Electron `safeStorage` 与系统钥匙串加密，独立存放在用户数据目录的 `tts-credentials.json`；preferences 只保存非敏感朗读配置。key 不出现在设置返回 DTO、状态广播或日志里。系统安全存储不可用时不会退回明文保存。当前没有实现引用现有模型 ProviderService 的 key，不应按原方案的这一设想使用。

本次没有新增依赖，没有恢复 Lite 已删除的模块或依赖。Edge 适配器用现有 `ws` 独立实现必要协议，没有引入 Python、mpv 或第三方 TTS SDK。

## 网络与真实验证记录

HTTP 请求复用 `src/main/ai/utils/customFetch.ts`，走 Electron 网络与应用代理策略。Edge WebSocket 在连接时使用现有 NodeProxyController 的 Node 网络代理配置；以下通过真实 Microsoft 服务与本地测试代理验证，发送内容仅为公开测试短句。

| 检查 | 2026-09-06 结果 |
| --- | --- |
| 中文合成：“你好，这是朗读功能测试。” | 17,712 bytes MP3，2.848 秒，有有效 MPEG 帧头 |
| 英文合成：“Hello. This is a speech synthesis test.” | 26,064 bytes MP3，2.498 秒，有有效 MPEG 帧头 |
| Edge 声音目录 | HTTP 200，322 个声音，包含默认中英文声音 |
| 应用 HTTP CONNECT 代理 | 14,256 bytes MP3；测试代理确认 1 条隧道 |
| 从 HTTP 切换到 SOCKS5 代理 | 14,256 bytes MP3；测试代理确认 1 条隧道 |
| `speech.platform.bing.com` hostname bypass | 合成成功，测试代理确认 0 条隧道 |
| 合成连接开始后 100 ms 取消 | 返回 AbortError；未交付迟到音频 |
| 真实 Electron 播放宿主 | 隔离配置运行，通过 `preparing → playing → paused → playing → idle`；验证非宿主不能回报播放事件、无关来源不能误停、X 按钮停止 |

普通 hostname bypass 已实测。复杂 CIDR、`<local>`、按 scheme 的绕过规则及 PAC 未做完整覆盖；尤其 ws 的 options-only 调用不会经过 NodeProxyController 自有的 URL bypass matcher，不应据此宣称与 Chromium/PAC 完全等价。没有修改全局代理实现。

Edge 的一次 403 时钟校正重试、帧解析、空音频、超时与取消均有本地测试；OpenAI/Azure 的请求、SSML、鉴权、声音目录、限流、错误脱敏、流式响应大小上限与伪装音频也有测试。文本测试覆盖中英混合、Unicode/SSML 长度、Markdown、未闭合片段和长链接回溯保护。

最终全量验证：1,260 个测试文件通过，15,012 项测试通过、65 项跳过；`pnpm build`（含主进程、前端、aiCore 类型检查与 Electron 构建）、`pnpm test:lint`、`pnpm i18n:check` 和变更文件格式检查通过。ESLint 保留 16 条未修改文件中的既有警告，新增代码无错误。另有真实 Electron / Edge 端到端测试通过。

已在当前 macOS 的 Electron 构建中验证真实播放状态并检查控制条截图。当前未把自动化测试等同于完成所有发布验证：Apple Silicon/Intel 分发包、物理扬声器输出、系统划词权限、全屏窗口焦点，以及付费服务的真实账户调用，尚未全部验证。

可重复的真实服务测试（使用独立临时 profile，只发送代码内的公开测试短句）：

```sh
pnpm build
pnpm rebuild:electron
TTS_E2E_REAL_NETWORK=1 pnpm exec playwright test tests/e2e/specs/tts-smoke.spec.ts --reporter=list
# 后续运行 Node 主进程单元测试前恢复原生模块 ABI
pnpm rebuild:node
```

默认 E2E 运行不会访问微软，必须显式设置 `TTS_E2E_REAL_NETWORK=1`；测试截图与 profile 保留在系统临时目录，便于排查，不进入仓库或聊天备份。

## 原方案中未纳入本次实现的部分

ElevenLabs、Gemini、火山豆包、阿里百炼的原生适配器，引用现有模型 provider 凭证，多服务商配置档案，自动朗读、边生成边读、音高调整、词级高亮与磁盘缓存均未实现。它们不会影响已落地的三个入口、Edge 免费朗读及 OpenAI/Azure 接口接入。

协议参考：[edge-tts](https://github.com/rany2/edge-tts)、[Azure Speech REST](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech)。
