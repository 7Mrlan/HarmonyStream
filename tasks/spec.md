# Claudio · 项目决策真源（Spec）

> 本文件只保留当前仍会影响实现的决策真源。
> 历史踩坑和纠正规则放在 `tasks/lessons.md`；当前执行进度放在 `tasks/todo.md`。
> 任何代码与本文件冲突，错的是代码；发现偏差先更新 Spec，再改代码。

---

## 当前活跃索引

- 当前主线：AI 电台最小闭环。
- 已完成：Phase A 后端 API 骨架；Phase B 移动端接入；Phase C LLM 主播；Phase C+ 等待体验；Phase D 音乐来源；Phase D.5 性能地基；Phase E TTS 入声；Phase F.0 SDK 56 依赖升级；Phase F.A 音频会话/后台权限；Phase F.B WS 心跳/重连；Phase F.C 锁屏 metadata 代码接线；Phase F.D APK 构建入口；Phase F.E 服务端 graceful shutdown。
- 当前阶段：Phase G Spec（LX-compatible 音乐源 Bridge 设计）。
- 当前 HARD-GATE：§9 为当前 Phase F 真源；旧的 SDK55 / `react-native-track-player` 方案已经废弃。
- 当前边界：Android 真机锁屏 / APK 验收暂缓；先设计真实音乐源入口；BYO-LLM 用户自配 key/baseUrl/model 单独作为 Phase F.5，不混入 Phase G。

---

## 0. 产品一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂用户输入，用 DJ 口吻推荐音乐，并把可播放曲目推给移动端播放器。

- 产品入口是电台评论区 / 对话输入，不新增独立音乐搜索框；用户点歌、描述心情、要求换风格都从同一个电台语义入口进入。
- LLM 主播负责意图理解、选曲策划、短 DJ 文案、歌曲背景 / 趣闻过渡；不负责直接抓取音频 URL、执行第三方源脚本或保存密钥。
- 音乐解析仍由 provider chain 负责：LLM 输出候选曲名或偏好，服务端 resolver / LX Bridge 再把候选解析为可播放 `Track`。
- 背景 / 趣闻必须短且可信；不确定时用氛围化描述或明确弱化，不编造具体年份、奖项、制作人等硬事实。

---

## 1. 平台与工程约束

- 语言：全栈 TypeScript。
- 仓库：pnpm workspace monorepo。
- 移动端：Expo + React Native + NativeWind，Android 优先，Web 用于调试。
- 服务端：Node.js + Fastify + zod + `@fastify/websocket`。
- 包边界：`apps/mobile` 依赖 `packages/api` 与 `packages/ui`；`packages/core/api` 不依赖 UI。
- 代码风格：函数和关键逻辑必须有中文多行注释 `/* */`。
- 文件影响：不改无关逻辑、结构、文件。
- 文档规则：默认不创建新说明文档；只有用户明确要求时才创建或重写文档。

---

## 2. UI 与动画真源

- 视觉关键词：赛博暗夜电台、像素终端、黑底、高反差、一抹荧光绿。
- 主色：`bg #000000`、`panel #0a0a0a`、`line #1f1f1f`、`text #e8e8e8`、`muted #6b7280`、`accent #00ff88`、`live #ff3355`。
- 字体：英文/数字偏像素；中文使用 Cubic 11。
- 圆角：绝大多数为 `0`，按钮/徽标可小圆角。
- 高频动画规则：交互、transform、opacity 用 Reanimated；频谱、粒子、重复图形用 Skia；Web fallback 用单 canvas，不用大量 SVG/React 节点逐帧更新。
- React state 只承载业务状态和低频变化，不承载每帧动画值。
- 参考 HTML/CSS 时，先做关键视觉参数映射，再迁移到当前框架；不能主观加层或压缩比例。

---

## 3. API 契约真源

- `packages/api/src/types.ts` / `Track` 是服务端和移动端共享曲目契约：`id`、`url`、`title`、`artist?`、`artwork?`、`duration?`、`source?`、`expiresAt?`。
- `Track.url` 是播放器最小可播放契约；只有元数据没有 URL 的结果不能进入 `currentTrack` 或 `queue`。
- `Track.source` 只描述 provider 能力和来源类型，不暴露敏感凭据。
- `packages/api/src/types.ts` / `ChatResponse.play` 是 LLM 推荐曲名数组，曲名由服务端解析为可播放 `Track`。
- `/api/chat` 返回 `ChatResponse`，并通过 WS 广播 `chat-token`、`queue-update`、`now-playing`。
- `/api/now` 返回当前 `Track | null`、position、state。
- `/api/next` 返回下一首 `Track | null` 和 reason；当前也作为轻量预热触发点。
- `/stream` 是增强链路；HTTP API 必须单独可用。
- Phase F 不扩公开契约：锁屏 metadata 从现有 `Track.title / artist / artwork` 拼装。

---

## 4. LLM 与 BYO-LLM 真源

- LLM 走 OpenAI-compatible chat completions；当前 DeepSeek / Qwen / GLM 已有服务端配置入口。
- 当前配置来源是服务端环境变量：`server/src/env.ts` 解析 `DEEPSEEK_*`、`DASHSCOPE_*`、`ZHIPU_*`；`server/src/llm/llmAdapter.ts` 按 `modelId` 选择 provider。
- 当前产品面只支持 `/api/models` 与 `/api/models/switch` 的模型切换；还没有“用户在 App 内自填 API key / baseUrl / model”的配置页或持久化。
- Phase F.5 预留为 BYO-LLM：用户自配 API key、baseUrl、model、provider 参数。该阶段必须单独立 Spec，重点处理密钥存储、日志脱敏、运行时校验和 fallback；不得把用户 key 写入仓库、WS 事件、日志或公开响应。
- LLM 输出必须经过运行时 JSON 解析和字段归一化，不信任模型裸输出。
- LLM 的产品职责是“电台主播 + 选曲策划”，不是通用问答助手或搜索 UI 替代品：它应把用户评论转成播放意图，并给出自然过渡。
- 没有 key、超时、HTTP 错误或解析失败时，服务端必须走 fallback，不让移动端断链。
- DJ 等待态使用 `packages/ui/src/RadioTuningLoader.tsx`，基于 `explame/explame.html` 主调频模块 `280×88` 等比缩放。
- 等待期间不显示本地假主播台词，不显示 `thinking`，只显示电台语义的调频加载。

---

## 5. 音乐与 Provider 真源

- 音乐 provider 必须可插拔，不允许把业务主路径写死到某个不稳定服务。
- Provider chain 装配规则：`MUSIC_PROVIDER_CHAIN` 决定优先级，`fallback` 永远兜底；`local → external → ncm? → fallback` 是默认链；fallback provider 不写入 resolveCache。
- NCM 属于 experimental provider：必须用户显式配置，不能成为隐式默认；外部源默认短 TTL，不做音频持久缓存。
- 自有源 Range route：`/media/local/:id` 必须做路径逃逸校验（`path.relative` + `isAbsolute`），不允许 `indexOf` 判断。
- 客户端预热触发口径：进度 ≥60% 或剩余 ≤45s；用 `useRef` 防止同首歌重复触发；失败静默。
- env helper 量纲分离：HTTP 超时类用 `positiveIntegerWithDefault`；缓存 TTL / 计数类用 `positiveIntegerWithMax(default, max)`。
- 真实音乐源失败不能影响 LLM 主播和播放闭环：搜索、取 URL、超时、非 2xx 时统一回退 SoundHelix fallback。
- 默认音乐源策略：系统默认启用已验证的 LX-compatible 真实音乐链路（huibq 源 raw URL + Kuwo 候选搜索），失败时仍回退 SoundHelix；用户可通过 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_ENABLE_KUWO_SEARCH` 覆盖或关闭默认行为。
- Phase G 音乐源入口参考 LX Mobile 的用户源协议，但不直接把移动端 QuickJS 原生模块搬进 Expo；Claudio 采用服务端 LX-compatible Bridge，把用户源脚本转换为现有 provider chain 中的可播放 `Track`。

---

## 6. TTS 真源

- TTS 永远 fire-and-forget：HTTP 立返、WS 后推 `tts-ready`；任何同步等待 TTS 都违反主链路非阻塞约束。
- TTS 与音乐播放器物理隔离：`useTtsPlayer` 独立 expo-audio 实例，不复用 `useRadioPlayer`。
- TTS 期间走 `radio.setVolume(0.24)` ducking，结束后恢复 `1`；不暂停主音乐，不改变音乐音调。
- 失败完全静默：TTS 链路失败不发错误事件、不显示 UI 错误，DJ 文案仍可见；服务端打 `[tts]` 日志即可。
- 公开契约不再扩展：`ChatRequest.voice?` 与 `StreamEvent 'tts-ready'` 已足够；后续接新 provider 不新增字段。
- React Hooks 死循环防御：跨渲染状态变化的对象禁止直接进 `useEffect/useCallback` 依赖；用 `useRef` 锁住。

---

## 7. 工作流硬约束

- 中等及以上任务必须先写分段 Spec：现状分析 → 功能点与文件级计划 → 风险与决策。
- 每段都要等待用户确认；完整 Spec 确认后才进入编码 HARD-GATE。
- 现状分析必须有代码出处：文件路径 + 函数名 / 模块名。
- 验证未完成，不得标记完成。
- 用户指出错误后，必要时写入 `tasks/lessons.md`，避免同类问题复发。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- `tasks/spec.md` 软上限 400 行；阶段完成后压缩历史，只保留仍约束未来代码的决策。
- `tasks/todo.md` 软上限 120 行；阶段 Review 完成并进入下一阶段时压缩历史摘要。

---

## 8. 历史阶段摘要

| 阶段 | 状态 | 当前仍有效的结论 |
|---|---:|---|
| Iter 0 | 完成 | monorepo、共享 tsconfig、UI/core/api/server/mobile 骨架已建立。 |
| UI 动画架构 | 完成 | 高频视觉走 Reanimated + Skia / Web canvas；避免 JS RAF + React state 热路径。 |
| Phase A | 完成 | 服务端 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/stream` 已打通内存闭环。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS；服务端 playlist 可覆盖本地默认播放列表。 |
| Phase C | 完成 | 服务端 LLM adapter 已接入；DeepSeek 真实路径与无 key fallback 均验证通过。 |
| Phase C+ | 完成 | DJ 气泡等待态已切到调频动画；不再使用本地假等待文案。 |
| Phase D | 完成 | 服务端 `musicResolver` + fallback catalog + 可选 `ncm` provider；移动端 artwork 链路打通。 |
| Phase D.5 | 完成 | provider chain、TTL/LRU cache、Range route、客户端 60% 预热、metrics 已落地。 |
| Phase E | 完成 | `msedge-tts` 接入；`tts-ready`、`/media/tts/:id`、独立 `useTtsPlayer`、DJBubble REPLAY 已落地。 |
| Phase F.0 | 完成 | Expo SDK 56 / React 19.2.6 / RN 0.85.3 / TypeScript 6.0.3 升级完成；NativeWind 类型 shim 和临时 override 已清理。 |
| Phase F.5 | 待启动 | BYO-LLM：用户自配 API key / baseUrl / model / provider 参数；必须单独立 Spec，不并入 Phase F.D。 |

---

## 9. Phase F 当前真源：SDK 56 后台播放 / 锁屏 / APK

### 9.1 当前决策

- 当前基线：Expo SDK 56，`expo-audio@56.0.9` 已在本地源码确认支持 `setAudioModeAsync`、`AudioPlayer.setActiveForLockScreen`、`updateLockScreenMetadata`、`clearLockScreenControls`。
- 锁屏方案：优先走 `expo-audio` 自带锁屏能力，不安装 `react-native-track-player`，避免双播放器宿主复杂度。
- 音频会话：全局只配置一次 `setAudioModeAsync`；`playsInSilentMode=true`、`shouldPlayInBackground=true`、`interruptionMode='doNotMix'`、`shouldRouteThroughEarpiece=false`、`allowsRecording=false`。
- 后台权限：`expo-audio` config plugin 显式启用 `enableBackgroundPlayback`，并关闭未使用的 `recordAudioAndroid`，避免申请无实际用途的录音权限。
- 锁屏 metadata：`useRadioPlayer` 只暴露最小 `lockScreenPlayer` 边界；`useNowPlayingMedia` 负责 `setActiveForLockScreen`、metadata 更新与清理。
- Expo Audio 56 没有真正的 next-track JS 回调；锁屏验收只承诺 PLAY/PAUSE 与 metadata，不把 seek forward 伪装成 NEXT。
- TTS ducking：仍由应用内 `radio.setVolume(tts.playing ? 0.3 : 1)` 完成；系统级 `doNotMix` 是为了锁屏控件归属和长后台播放稳定性。
- APK：走 EAS local preview APK；原生工程产物不得提交。

### 9.2 当前执行顺序

1. F.A：挂载 `useAudioSession()`，配置 `expo-audio` 后台播放 plugin，验证 Expo config。（已完成）
2. F.B / F.E：WS 重连与 server graceful shutdown 运行时验收。（已完成）
3. F.C：在 `useRadioPlayer` 边界上接 `setActiveForLockScreen` 和 metadata 更新。（代码已完成，真机待验收）
4. F.D：补 `eas.json`、APK scripts、ignore 规则，并跑 APK 构建前检查。（当前阶段）
5. Android 真机：安装 APK / dev build 后验证锁屏 metadata、PLAY/PAUSE、后台 ≥60s 持续播放。（待验收）

### 9.3 验证口径

- 终端命令：`pnpm typecheck`
- 终端命令：`pnpm lint`
- 终端命令：`pnpm --filter @claudio/mobile exec expo config --type public`
- 终端命令：启动服务端后 `Ctrl+C`，5s 内看到 shutdown ok。
- Android 真机操作：发消息、播放、TTS ducking、后台 / 锁屏连续播放。
- APK 验收：`eas build --local` 产物可 sideload 安装并启动。

---

## 10. Phase F.pre：真实闭环验收前置修复

> 本阶段经历一次纠偏：诊断 UI / 状态 API 不等于产品入口；当前仅保留用户输入显示修复，真实 LLM / 音源配置入口重新设计。

### 10.1 代码现状

- 用户输入提交链路已经存在：`apps/mobile/app/index.tsx` / `handleSend` 会调用 `apiClient.sendChat({ text, voice: ttsEnabled })`，成功后更新 DJ 文案、连接状态，并调用 `refreshNowAndNext()` 拉取当前曲与下一曲。
- 用户气泡显示仍是静态占位：`apps/mobile/app/index.tsx` / `HomeScreen` 固定渲染 `<UserBubble text="好听" name="MMGUO" time="21:09" />`，没有保存最近一次用户输入，也没有把 `handleSend(text)` 的文本回填到 UI。
- 服务端聊天主链路已经能按输入更新内存电台状态：`server/src/state/radioState.ts` / `handleChat` 会读取 `request.text`，调用 `resolveTracksForChat()` 得到候选曲，再写入 `radioState.currentTrack` 与 `radioState.queue`。
- 当前真实 LLM 未启用时会稳定回退：`server/src/llm/llmAdapter.ts` / `generateDjResponse` 在当前模型 provider 没有 API key 时返回 `ok:false`，调用方会使用 mock fallback 文案。
- 音乐 provider 机制只在服务端环境变量层启用：`server/src/music/providerRegistry.ts` / `buildProviderChain` 根据 `MUSIC_PROVIDER_CHAIN` 或默认链组装 `local → external → ncm? → fallback`；`local` 依赖 `MUSIC_LIBRARY_DIR + MEDIA_BASE_URL`，`external` 依赖 `EXTERNAL_MUSIC_RESOLVER_URL`，`ncm` 依赖 `MUSIC_API_BASE_URL`。
- 外部音乐插件当前是进程外 HTTP resolver：`server/src/music/providers/externalResolverProvider.ts` / `searchPlayableTracks` 约定 `POST {base}/search` 返回含可播放 `url` 的 tracks；移动端没有“添加音乐插件 / 配置 resolver”的产品入口。
- TTS 链路只负责 DJ 文案转语音：`server/src/state/radioState.ts` / `handleChat` 在 `request.voice` 为 true 时调用 `scheduleTts(response.say, chatId)`；TTS 不参与音乐搜索，也不会把 fallback 曲自动变成真实音乐。

### 10.2 当前结论

- 现在进入 Android 真机完整验收不明智：只能验证 `expo-audio` 锁屏 / 后台播放能力，不能验证真实 AI 电台闭环。
- 真机验收前至少要完成两个前置点：用户发送内容必须在 UI 上真实显示；音乐源状态必须可见，避免用户误以为“插件已启用但没有生效”。
- 若要验证真实音乐，必须先启用一个真实 provider：本地合法音源目录、外部 HTTP resolver 或显式 NCM 兼容服务；否则系统会按设计回退到 SoundHelix fallback。

### 10.3 功能点与文件级计划

#### 功能点 1：用户输入真实显示

- 目标：发送任意文本后，右侧用户气泡立即显示该文本和当前时间，不再固定为“好听 / 21:09”。
- 范围：只做最近一次用户消息显示；完整多轮聊天记录、持久化历史和滚动定位不进入本阶段。
- 文件计划：
  - `apps/mobile/app/index.tsx` / `HomeScreen`：新增最近用户消息 state，例如 `{ text, time } | null`；`handleSend(text)` 进入请求前先写入该 state，实现乐观显示。
  - `apps/mobile/app/index.tsx` / `HomeScreen`：把固定 `<UserBubble text="好听" name="MMGUO" time="21:09" />` 改为按最近用户消息条件渲染。
  - `packages/ui/src/UserBubble.tsx`：暂不改组件 API；现有 `text/name/time/avatarColor` 已满足本阶段。

#### 功能点 2：真实闭环烟测路径

- 目标：编码完成后先通过 Web / HTTP 证明“输入 → DJ 文案 → 当前曲 source → TTS 文案音频”链路更新，再恢复 Android 真机验收。
- 验证计划：
  - 终端命令：`pnpm typecheck`
  - 终端命令：`pnpm lint`
  - 终端命令：发送两次不同 `/api/chat` 文本，确认 `say` 与 `/api/now.track.title` 随请求变化。
  - 浏览器操作：在 Expo Web 输入不同文本，确认右侧用户气泡更新为真实输入。

### 10.4 风险与决策

- 决策：本阶段不再新增诊断 UI 或诊断 API；只修复确定的用户输入显示 bug。
- 决策：成熟“音乐插件入口 / 音源管理”和 BYO-LLM 后续必须单独立 Spec，先定义用户动作、配置安全边界和交互形态。
- 风险：没有真实 LLM key 和真实 provider 时仍只能走 mock 文案与 SoundHelix fallback；真机验收前必须先完成真实配置入口或明确使用环境变量配置进行烟测。

---

## 11. Phase G：LX-compatible 音乐源 Bridge

### 11.1 代码现状

- Claudio 当前音乐权威链路在服务端：`server/src/state/radioState.ts` / `handleChat` 调用 `resolveTracksForChat()`，成功后写入 `currentTrack`、`queue` 并广播 `now-playing` / `queue-update`。
- Provider chain 已经存在：`server/src/music/providerRegistry.ts` / `buildProviderChain` 按 `local → external → ncm? → fallback` 装配，`fallback` 永远兜底。
- 性能地基已存在：`server/src/music/musicResolver.ts` 用 provider id + 关键词 + limit 做 resolveCache；`server/src/music/cache.ts` 是 TTL + LRU；`server/src/music/preload.ts` 做串行轻量预热。
- 当前 `externalResolverProvider` 只消费进程外 HTTP resolver；还没有 App 内“添加音乐源 / 选择音乐源 / 查看源状态”的产品入口。
- LX Mobile 1.8.4 的用户源入口在设置页：`src/screens/Home/Views/Setting/settings/Basic/Source.tsx` 渲染源列表与用户源弹窗；`ScriptImportOnline.tsx` 支持从 URL 下载脚本。
- LX Mobile 的用户源不是普通 React 组件内执行：`src/utils/nativeModules/userApi.ts` 把脚本交给 `UserApiModule.loadScript()`；Android 侧 `QuickJS.java` 创建 QuickJS context，加载 `user-api-preload.js` 后再 evaluate 用户脚本。
- LX 用户源协议的关键面是 `globalThis.lx`：`EVENT_NAMES`、`request`、`send`、`on`、`utils`、`currentScriptInfo`、`version`、`env`；源脚本通过 `send(inited, { sources })` 声明支持能力，通过 `on(request)` 响应 `musicUrl / lyric / pic`。
- LX Mobile 的搜索与用户源解析是分层的：`src/utils/musicSdk/index.js` 负责 `searchMusic/findMusic`；用户源主要把候选 `musicInfo + quality` 解析成 `musicUrl`。不能把用户源误判成完整文本搜索引擎。

### 11.2 当前结论

- 最适合 Claudio 的方案是服务端 LX-compatible Bridge，而不是直接移植 LX Mobile 原生 QuickJS 模块。
- 原因：Claudio 当前是 Expo Web + Node 服务端，暂无原生 `android/ios` 工程；直接搬原生模块会破坏 Web 调试和当前工程边界。
- Bridge 必须接入现有 provider chain、cache、timeout、fallback，不另起播放器或状态链路。
- 第一版必须承认 LX 用户源主要解决 URL 解析；搜索元数据来源要单独定义，不能假设任意用户源都能直接从自然语言返回歌曲。
- 搜索层决策：Phase G.1 不移植 LX Mobile `musicSdk` 搜索模块，不在本项目内直接维护各平台搜索 API；`lx` provider 只消费一个显式的候选搜索输入，再把候选交给 LX 用户源解析播放 URL。
- 候选搜索输入第一版走 `LX_METADATA_RESOLVER_URL` 或本地 smoke fixture，两者都必须返回 Claudio 定义的 `LxMusicCandidate[]`。没有候选输入时 `lx` provider 判定为未启用，provider chain 继续走后续 provider / fallback。
- 设置页范围决策：Phase G.1 只做服务端 Bridge 与 HTTP smoke，不做 App 内导入 UI；Phase G.2 再单独实现设置页“音乐源”入口。这样避免把未闭环的源状态暴露在播放器主界面，也避免在 Bridge 未验证前先做交互外壳。

### 11.3 功能点与文件级计划

#### 功能点 1：搜索候选层

- 目标：把“自然语言 / LLM 推荐曲名”先转成可交给 LX 用户源的候选 `musicInfo`，再进入 URL 解析。
- 决策：第一版只接受外部候选 resolver 或测试 fixture，不复制 LX Mobile `musicSdk`。原因是 `musicSdk` 是独立平台搜索层，直接搬入会引入大量平台请求维护和合规风险，不适合作为 Bridge 第一版地基。
- 文件计划：
  - `server/src/music/lxBridge/types.ts`：定义候选、解析结果、运行时接口。
  - `server/src/music/lxBridge/candidateSearch.ts`：封装外部候选 resolver 与 fixture 搜索。
- 函数签名计划：
  ```ts
  export interface LxMusicCandidate {
    id: string;
    source: string;
    title: string;
    artist?: string;
    album?: string;
    artwork?: string;
    durationMs?: number;
    quality?: string;
    musicInfo: Record<string, unknown>;
  }

  export interface LxCandidateSearcher {
    searchCandidates(input: MusicSearchInput): Promise<LxMusicCandidate[]>;
  }

  export function createLxCandidateSearcher(config: LxCandidateSearchConfig): LxCandidateSearcher;
  async function searchCandidatesViaHttp(baseUrl: string, input: MusicSearchInput): Promise<LxMusicCandidate[]>;
  async function searchCandidatesFromFixture(filePath: string, input: MusicSearchInput): Promise<LxMusicCandidate[]>;
  ```

#### 功能点 2：服务端 LX Bridge 核心

- 目标：新增服务端 `lx` provider，把候选 `musicInfo` 交给 LX 用户源脚本解析 URL，再转成 Claudio `Track`。
- 文件计划：
  - `server/src/music/providers/lxBridgeProvider.ts`：实现 `MusicProvider`，串联候选搜索、Bridge runtime、Track 归一化。
  - `server/src/music/providerRegistry.ts`：把 `lx` 加入支持 key；默认不启用，用户配置后才进入 chain。
  - `server/src/env.ts`：新增最小环境配置，例如 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_METADATA_FIXTURE_FILE` / `LX_BRIDGE_TIMEOUT_MS`。
- 函数签名计划：
  ```ts
  export interface LxBridgeProviderOptions {
    runtime: LxBridgeRuntime;
    candidateSearcher: LxCandidateSearcher;
    timeoutMs: number;
  }

  export function createLxBridgeProvider(options: LxBridgeProviderOptions): MusicProvider;
  async function searchPlayableTracks(runtime: LxBridgeRuntime, searcher: LxCandidateSearcher, input: MusicSearchInput): Promise<Track[]>;
  function candidateToTrack(candidate: LxMusicCandidate, resolved: LxResolvedUrl): Track | null;
  ```

#### 功能点 3：源脚本生命周期

- 目标：避免每次搜索重新 evaluate，同时允许切换源。
- 决策：运行时只常驻“当前启用源”的 context；源不变时复用同一个 context；用户切换源或脚本 hash 变化时执行 destroy → loadScript。
- 说明：这是 Claudio 的性能设计，不等同于“所有源长驻”。LX Mobile 也是切换源时 `destroy()` 再 `loadScript()`。
- 文件计划：
  - `server/src/music/lxBridge/sourceRuntime.ts`：维护 active source、script hash、初始化状态、destroy/load/reload。
  - `server/src/music/lxBridge/sourceStore.ts`：第一版可先用环境变量 / 本地配置描述启用源；App 内持久化入口后续再扩。
- 函数签名计划：
  ```ts
  export interface LxBridgeRuntime {
    loadActiveSource(): Promise<LxSourceInitResult>;
    resolveMusicUrl(candidate: LxMusicCandidate, quality?: string): Promise<LxResolvedUrl | null>;
    destroy(): Promise<void>;
  }

  export function createLxSourceRuntime(config: LxSourceRuntimeConfig): LxBridgeRuntime;
  async function ensureWorkerForSource(config: LxSourceRuntimeConfig): Promise<LxWorkerClient>;
  async function reloadSourceIfChanged(client: LxWorkerClient, script: LxSourceScript): Promise<LxSourceInitResult>;
  ```

#### 功能点 4：隔离执行选型

- 目标：第三方源脚本不能跑在 Fastify 主进程。
- 候选方案：
  - `worker_threads`：集成轻，通信快；但同进程内存共享风险更高，恶意脚本 CPU 卡死时仍影响进程资源。
  - `child_process` 独立进程：隔离更清晰，可超时 kill，适合第一版；通信成本对音乐搜索可接受。
  - `quickjs-emscripten` / 服务端 QuickJS：更接近 LX Mobile，但引入新运行时和包体，兼容 Node ESM / pnpm / 构建需要额外验证。
- 决策：第一版优先选 `child_process` 独立 Bridge worker；只有在兼容性验证需要时再评估 QuickJS。禁止直接在 Fastify 主进程 `vm.runInContext` 执行用户源。
- 文件计划：
  - `server/src/music/lxBridge/workerProcess.ts`：主进程启动、请求、超时、重启、kill。
  - `server/src/music/lxBridge/worker-entry.ts`：子进程内模拟 `globalThis.lx` 并执行用户脚本。
- 函数签名计划：
  ```ts
  export interface LxWorkerClient {
    loadSource(script: LxSourceScript): Promise<LxSourceInitResult>;
    resolveMusicUrl(request: LxResolveMusicUrlRequest): Promise<LxResolvedUrl | null>;
    destroy(): Promise<void>;
  }

  export function createLxWorkerProcess(options: LxWorkerProcessOptions): LxWorkerClient;
  async function requestWorker<TResponse>(process: ChildProcess, message: LxWorkerMessage, timeoutMs: number): Promise<TResponse>;
  function killWorker(process: ChildProcess, reason: string): void;
  async function handleLoadSource(message: LxLoadSourceMessage): Promise<LxSourceInitResult>;
  async function handleResolveMusicUrl(message: LxResolveMusicUrlMessage): Promise<LxResolvedUrl | null>;
  function installLxGlobal(host: LxScriptHost): void;
  ```

#### 功能点 5：`globalThis.lx.request` 兼容层

- 目标：用 Node fetch 模拟 LX Mobile 的原生请求行为，尽量兼容已有源。
- 必须兼容：
  - `method / headers / body / form / formData / binary / timeout`
  - 默认 `User-Agent`
  - 返回 `{ statusCode, statusMessage, headers, body }`
  - JSON 自动 parse，失败保留文本 body
  - Abort / cancel 行为
- 已知风险：已有 LX 源可能依赖移动端 fetch 的 cookie、header 合并、二进制 buffer、formData 编码、大小写 header 或特定 UA。Bridge 第一版必须把这些差异作为兼容风险记录，并给失败原因可观测日志。
- 文件计划：
  - `server/src/music/lxBridge/lxRequest.ts`：实现 request 兼容层。
  - `server/src/music/lxBridge/lxTypes.ts`：定义 request/response/action 数据结构与 zod 校验。
- 函数签名计划：
  ```ts
  export type LxRequest = (url: string, options?: LxRequestOptions) => Promise<LxRequestResponse>;

  export function createLxRequest(fetcher?: typeof fetch): LxRequest;
  export async function performLxRequest(url: string, options: LxRequestOptions, signal?: AbortSignal): Promise<LxRequestResponse>;
  function normalizeLxRequestOptions(options: LxRequestOptions): NormalizedLxRequestOptions;
  function parseLxResponse(response: Response, binary?: boolean): Promise<LxRequestResponse>;
  ```

#### 功能点 6：设置页入口边界

- 目标：明确本阶段不把开发诊断 UI 放回播放器主界面。
- Phase G.1 编码范围：不新增移动端设置页，不新增用户导入脚本 UI；只通过环境变量 / 本地 fixture 启用服务端 Bridge 并完成 smoke。
- Phase G.2 后续范围：新增设置页“音乐源”入口，包含源列表、当前启用源、导入 URL、启用 / 停用、失败原因；该阶段需要单独 Spec，因为它涉及持久化、安全提示和用户操作闭环。
- 预留文件计划：
  - `apps/mobile/app/settings/music-sources.tsx`：Phase G.2 设置页路由或 sheet，不属于 G.1 编码。
  - `packages/api/src/types.ts` / `client.ts`：Phase G.2 再增加音乐源管理公开 API 类型，不属于 G.1 编码。

### 11.4 验证计划

- 静态验证：
  - 终端命令：`pnpm typecheck`
  - 终端命令：`pnpm lint`
  - 终端命令：`pnpm --filter @claudio/server build`
- Bridge worker smoke：
  - 终端命令：用可读测试源脚本启动 worker，确认 `loadActiveSource()` 返回 source 列表与脚本 hash。
  - 终端命令：用 `LX_METADATA_FIXTURE_FILE` 提供固定候选，确认 `resolveMusicUrl()` 返回非 fallback URL，且同一脚本第二次请求不重新 evaluate。
  - 终端命令：用会抛错的测试源脚本验证 worker 被隔离处理，Fastify 主进程不崩溃，provider chain 继续 fallback。
- `lx.request` 兼容 smoke：
  - 终端命令：用本地 HTTP 测试 endpoint 覆盖 JSON、文本、binary、form、timeout 五类请求。
  - 终端命令：记录失败时的 provider reason，不能吞掉用户源异常。
- HTTP 链路 smoke：
  - 终端命令：以 `MUSIC_PROVIDER_CHAIN=lx,fallback`、`LX_SOURCE_SCRIPT_FILE=...`、`LX_METADATA_FIXTURE_FILE=...` 启动服务端。
  - 终端命令：`curl -X POST http://127.0.0.1:8080/api/chat ...` 后请求 `/api/now`，确认 `track.source.provider` 为 `lx`，`track.url` 来自源脚本解析。
  - 终端命令：移除候选 resolver 或让源脚本失败，再次请求 `/api/chat`，确认 `/api/now.track.source.provider` 回到 `fallback`。
- UI 验证：
  - 浏览器操作：播放器主界面不出现 `SOURCE / FALLBACK` 这类诊断条。
  - Phase G.1 不验收设置页导入，因为该 UI 不在本阶段编码范围。

### 11.5 风险与决策

- 决策：第一版只做搜索候选 + `musicUrl` 播放 URL 解析；歌词、封面补全、歌单、评论、下载不进入第一版。
- 决策：UI 入口最终在设置页“音乐源”，但 Phase G.1 不做移动端 UI；Phase G.2 单独做设置页闭环。
- 决策：用户源脚本来自用户主动添加；Claudio 不内置、不默认启用任何第三方灰色源。
- 决策：搜索候选层第一版使用 `LX_METADATA_RESOLVER_URL` 或本地 fixture，不复制 LX Mobile `musicSdk`。
- 风险：LX Mobile 的内置 `musicSdk` 搜索模块有独立实现，直接复制会引入大量第三方平台请求和维护成本；后续若要移植，必须单独评估接口维护、合规边界和数据归一化成本。
- 风险：`lx.request` 兼容度决定可用性；需要用至少一个非混淆、可读的用户源脚本做 smoke test，再扩大到更多源。
- 风险：第三方脚本和数据来源可能涉及版权或服务条款限制；实现只提供用户自配框架，不帮助绕过付费、VIP 或授权控制。
