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
- `tasks/spec.md` 以阶段完成为归档触发器；阶段验收通过后，将完整阶段 Spec 存入 `tasks/spec/<phase-name>.md`。
- `tasks/spec.md` 只保留跨阶段有效决策、当前阶段完整内容、已完成阶段 3-5 行摘要；超过 250 行时只检查是否有已完成阶段未归档。
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

- 完整历史设计已拆到 `tasks/spec/phase-g-lx-bridge.md`。
- 仍活跃决策：默认真实音乐源链路为 huibq 源 raw URL + Kuwo 候选搜索 + LX Bridge；用户可通过 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_ENABLE_KUWO_SEARCH` 覆盖或关闭。
- 仍活跃决策：LX 用户源脚本必须在服务端隔离 worker 中执行，禁止在 Fastify 主进程直接 evaluate。
- 仍活跃决策：用户源主要负责 `musicUrl` 解析；候选搜索层独立，第一版不复制 LX Mobile `musicSdk`。
- 仍活跃决策：音乐源 UI 入口属于后续设置页“音乐源”，播放器主界面不展示 provider 诊断条。

---

## 12. radioState God Object 拆分

### 12.1 现状分析（已确认）

- `server/src/state/radioState.ts` 当前同时承担内存状态、API facade、聊天编排、点歌 / 类型意图解析、DJ fallback 文案、队列构建、预热和 TTS 调度触发。
- `handleChat()` / `handleChatInternal()` 是当前复杂度集中点；路由层只依赖 `radioState.ts` 的公开导出，适合保持 facade 不变、内部拆纯函数。
- 新增情绪推荐逻辑后，`radioState.ts` 继续膨胀，说明该问题会随功能增长加重，越早拆分越便宜。

### 12.2 功能点与文件计划（已确认）

- 新增 `server/src/radio/intentParser.ts`，只负责“用户输入 → 音乐意图”的纯逻辑。
  - 导出：
    ```ts
    export interface ExplicitSongRequest { ... }
    export interface GenreRecommendationRequest { ... }
    export function parseExplicitSongRequest(text: string): ExplicitSongRequest | null;
    export function parseGenreRecommendationRequest(text: string): GenreRecommendationRequest | null;
    export function buildExplicitMusicIntent(request: ExplicitSongRequest): GenerateMusicIntentResult;
    export function buildGenreMusicIntent(request: GenreRecommendationRequest): GenerateMusicIntentResult;
    ```
  - 内部函数 / 常量：`GENRE_RECOMMENDATIONS`、`isRecommendationPhrase()`、`trimSongPhrase()`。
- 新增 `server/src/radio/djCopy.ts`，只负责 DJ fallback / 快速文案模板。
  - 导出：
    ```ts
    export function buildQuickSongChatResponse(text: string, track: Track, musicReason: string): ChatResponse;
    export function buildFallbackChatResponse(
      text: string,
      track: Track,
      modelDisplayName: string,
      llmFallbackReason?: string,
      musicFallbackReason?: string,
    ): ChatResponse;
    export function buildNoTrackChatResponse(text: string, musicFallbackReason: string): ChatResponse;
    ```
  - 内部函数：`buildSongIntro()`、`buildSongSegue()`、`pickStableTemplate()`、`buildMockDjScript()`。
  - `buildMockDjScript()` 必须从直接读取 `radioState.currentModel` 改为接收 `modelDisplayName: string` 参数；调用方用 `handleChatInternal()` 已有的 `currentModel.displayName` 传入。
- `server/src/state/radioState.ts` 保留内存状态、公开 API facade 和主流程编排。
  - 对外导出签名保持不变：`getModels()`、`switchModel()`、`getNowPlaying()`、`getNextTrack()`、`handleChat()`、`getQueueSnapshot()`。
  - 不改 `server/src/routes/apiRoutes.ts`、`server/src/routes/streamRoutes.ts`、`packages/api` 契约和移动端调用。

### 12.3 风险与决策

- 决策：本次只做纯函数迁移和参数化，不改产品语义、不改 HTTP API、不改 LLM / 音乐 provider 行为。
- 决策：不引入 class、DI 容器或持久化状态；`radioState.ts` 仍是路由层唯一入口。
- 决策：`buildQueue()`、`chooseTrackFromPlay()` 暂留 `radioState.ts`，因为它们直接服务于状态提交；后续如要补单元测试，再考虑抽成 `queuePlan.ts`。
- 风险：搬移函数时容易漏 export 或 import；用 `pnpm typecheck:server` 作为第一道验证。
- 风险：`buildFallbackChatResponse()` 参数顺序变更可能造成文案 fallback reason 丢失；执行时只在 `handleChatInternal()` 一处改调用，并保留原 reason 组合。
- 风险：文件移动后 tsx watch 会热重载后端；若正在使用前端联调，浏览器可能需要硬刷新或重发请求，但不涉及 Metro 缓存陷阱，因为本次只改服务端。

### 12.4 执行步骤（HARD-GATE 后）

1. 新建 `server/src/radio/intentParser.ts`，从 `radioState.ts` 迁移意图解析相关类型、常量和函数。
   - 验证：终端命令 `pnpm typecheck:server`。
2. 新建 `server/src/radio/djCopy.ts`，迁移 DJ 文案相关函数，并把 `buildMockDjScript()` 参数化为 `modelDisplayName`。
   - 验证：终端命令 `pnpm typecheck:server`。
3. 更新 `server/src/state/radioState.ts` imports 和调用点，删除已迁移的本地函数。
   - 验证：终端命令 `pnpm typecheck:server`。
4. 全量静态验证。
   - 终端命令：`pnpm typecheck`
   - 终端命令：`pnpm lint`
5. 主链路烟测。
   - 终端命令：`/health` 验证服务端仍运行。
   - 终端命令：请求 `/api/chat`，确认返回有效 `ChatResponse`：`say` 非空、`play` 为数组。
   - 终端命令：请求 `/api/now`，确认 `track` 非 null 且 `state` 为 `playing`。
   - 终端命令：请求 `/api/chat` 输入“我想听周杰伦的晴天”，确认明确点歌快路径仍返回 `play[0] = 晴天`。
