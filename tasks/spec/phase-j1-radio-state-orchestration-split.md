# Phase J.1：radioState 编排拆分

### 16.1 现状分析

#### 16.1.1 文件规模已经重新膨胀，超过“状态单例”合理范围

- 代码出处：`server/src/state/radioState.ts` 当前 762 行。
- 代码出处：`server/src/state/radioState.ts` / `RadioState` 同时保存播放状态、队列、消息、模型选择、session intent、seen 集合、commentary cache、refill promise、commentary token。
- 代码出处：`server/src/state/radioState.ts` / 顶部 import 同时依赖 LLM adapter、music resolver、preload、titleMatch、streamHub、djCopy、intentParser、TTS scheduler。
- 结论：它已经不是单纯的“内存状态”，而是把模型管理、聊天编排、音乐解析、队列状态机、实时广播和 TTS 调度都放在一个文件里。继续在这里加 Phase K 像素海报、Phase L 偏好歌单或 Phase M 音源 UI，会让功能边界更难维护。

#### 16.1.2 对外 API 面很小，适合内部拆分但保持路由零改动

- 代码出处：`server/src/routes/apiRoutes.ts` 只从 `radioState.ts` 导入 `getModels`、`switchModel`、`getNowPlaying`、`getNextTrack`、`handleChat`、`playNextTrack`、`playPreviousTrack`。
- 代码出处：`server/src/routes/streamRoutes.ts` 只从 `radioState.ts` 导入 `getNowPlaying`、`getPlaybackCapabilities`、`getQueueSnapshot`。
- 结论：外部路由依赖的是少数稳定函数。Phase J.1 可以把 `server/src/state/radioState.ts` 保留为 facade，对外导出签名不变，内部把职责移到 `server/src/radio/*` 或 `server/src/state/*` 子模块，降低风险。

#### 16.1.3 聊天主链路是最大耦合点，不能一次硬拆完

- 代码出处：`server/src/state/radioState.ts` / `handleChat` 负责 chatQueue 串行锁、调用 `runChatWithTimeout`、释放锁。
- 代码出处：`server/src/state/radioState.ts` / `runChatWithTimeout` 给整条聊天链路加 10s 超时，并在超时时调用 `buildTimedOutChatResult`。
- 代码出处：`server/src/state/radioState.ts` / `handleChatInternal` 同时执行：解析显式点歌 / 情绪推荐 / LLM 意图、调用 `resolveTracksForChat`、生成 DJ 文案、选择当前曲、构建队列、写入 `radioState`、触发 preload、触发续推、触发 TTS。
- 结论：`handleChatInternal` 是行为最敏感区域。它应该最终变成 orchestrator，但第一轮拆分不宜把所有状态写入都挪走；更安全的做法是先抽纯函数和子服务，再保持提交状态的顺序不变。

#### 16.1.4 队列状态机已经有独立边界

- 代码出处：`server/src/state/radioState.ts` / `playNextTrack`、`playPreviousTrack` 只围绕 `currentIndex`、`queue`、`currentTrack`、`PlaybackMoveResponse` 移动队列。
- 代码出处：`server/src/state/radioState.ts` / `moveToQueueIndex` 负责移动当前曲、预热下一首、触发续推、调度切歌播报，并返回 `playback`。
- 代码出处：`server/src/state/radioState.ts` / `getPlaybackCapabilities`、`getQueueFromCurrentIndex`、`buildPlaybackMoveFailure` 是队列能力和响应封装。
- 结论：队列状态机可以独立成 `playbackQueue` / `queueController` 一类模块，但要注意它现在会调用 `maybeRefillQueue` 和 `scheduleTrackCommentary`。拆分时需要用回调或上层 orchestration 消除反向依赖。

#### 16.1.5 后台续推是独立 session 逻辑

- 代码出处：`server/src/state/radioState.ts` / `buildSessionIntent`、`getTargetQueueSize`、`resetSessionMemory`、`markTrackSeen`、`getTrackKey` 管理当前 session 的意图和短期记忆。
- 代码出处：`server/src/state/radioState.ts` / `maybeRefillQueue` 使用 `activeIntent`、`refillInFlight` 和 `getRemainingQueueCount` 防止重复补队列。
- 代码出处：`server/src/state/radioState.ts` / `runQueueRefill` 调用 `resolveTracksForChat`，并在 `activeIntent` 未变化时追加结果和广播 `queue-update`。
- 代码出处：`server/src/state/radioState.ts` / `appendResolvedTracksToQueue` 负责过滤 seen key、队列已有 key、同名歌曲。
- 结论：续推逻辑已经是一个“基于 session intent 的后台补队列服务”。它适合从主状态文件中移走，但必须保留 `refillInFlight` 防并发、activeIntent stale check 和广播时机。

#### 16.1.6 切歌短播报是独立附加体验

- 代码出处：`server/src/state/radioState.ts` / `scheduleTrackCommentary` 读取 `activeIntent`、`commentaryCache`、`commentaryToken`，命中缓存时广播并按 `voiceEnabledAtChat` 调度 track TTS。
- 代码出处：`server/src/state/radioState.ts` / `runTrackCommentary` 调用 `generateTrackCommentary`，失败时回退 `buildTrackSwitchChatResponse`，并在 token 和当前曲仍匹配后广播 `track-commentary`、调度 `scheduleTrackTts`。
- 代码出处：`server/src/state/radioState.ts` / `broadcastTrackCommentary` 是 WS 事件封装。
- 结论：切歌播报已经独立于首轮 chat 文案，适合抽成 `trackCommentaryService`。它需要的输入是当前曲、cause、activeIntent、当前模型和当前曲 key checker，不应该继续直接散读 `radioState`。

#### 16.1.7 模型管理可以最先拆，风险最低

- 代码出处：`server/src/state/radioState.ts` / `MODELS`、`getModels`、`switchModel`、`getCurrentModel` 只读写 `currentModel` 和静态 `MODELS`。
- 结论：模型管理与播放队列、音乐解析、TTS 无强耦合，是第一批可拆模块。拆成 `modelState.ts` 后，`radioState.ts` 只保留调用关系即可。

#### 16.1.8 已有 `intentParser.ts` 和 `djCopy.ts` 证明“纯函数拆分”路线有效

- 代码出处：`server/src/radio/intentParser.ts` 文件头声明“不读写 radioState”，当前已经承载点歌 / 推荐意图解析纯函数。
- 代码出处：`server/src/radio/djCopy.ts` 文件头声明“不读写 radioState”，当前已经承载 fallback / 快速主播文案纯函数。
- 结论：上一轮 God Object 拆分方向是正确的，但 Phase J 又把 session、队列、续推、commentary 加回 `radioState.ts`。Phase J.1 应延续“纯函数 / 子服务先拆，facade 保持稳定”的策略，而不是直接引入复杂 class 层级。

### 16.2 功能点与文件级方案

- 保留 `radioState.ts` 作为对外 facade，路由层调用签名完全不变。
- 抽出 `server/src/state/modelState.ts`：模型列表、当前模型选择、`getCurrentModel`。
- 抽出 `server/src/radio/playbackQueue.ts`：`getTrackKey`、`buildQueue`、`chooseTrackFromPlay`、`getQueueFromIndex`、`getPlaybackCapabilitiesForState`。
- 抽出 `server/src/radio/radioSession.ts`：`RadioSessionIntent`、target queue、session memory、seen、`refillInFlight`、后台续推。
- 抽出 `server/src/radio/trackCommentaryService.ts`：切歌短播报 cache、token、LLM fallback、track-aware TTS。
- 暂不强行抽 `playbackController.ts`；拆完后 `playNextTrack` / `moveToQueueIndex` 已足够薄，继续抽会增加一层没有必要的间接。

### 16.3 风险与决策

- 循环依赖：采用方案 A，`getPlaybackCapabilitiesForState` 只接收 `canAutoRefill: boolean`，不接收完整 `activeIntent`；`playbackQueue.ts` 不 import `radioSession.ts`。
- 反向依赖：队列模块不 import 续推、预热、播报或 WS 广播；副作用由 `radioState.ts` 作为 facade 显式触发。
- 行为回归：本阶段只移动代码和依赖方向，不改变推荐算法、prompt、TTS 行为、音源 provider chain。
- 状态分散：播放主状态仍由 `radioState.ts` 持有；子模块只持有天然属于自己的 memory。
- 公开契约：不改 `packages/api/src/types.ts`，不改路由 import。
- 追加队列：采用方式 A，`radioSession.ts` 只返回可追加 tracks，实际 `queue.push` 由 `radioState.ts` 完成。

### 16.4 验证结果

- `server/src/state/radioState.ts` 从 762 行降到 534 行。
- 路由层仍从 `../state/radioState.js` 导入，import 路径未改。
- 新模块无反向 import `radioState`。
- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm --filter server build` 通过。
- HTTP smoke 通过：单曲点歌 `queueSize=1/canNext=false`，范围推荐 `queueSize=3/canNext=true`，多首推荐 `queueSize=5/canNext=true`，`POST /api/playback/next` 后 `currentIndex=1/canPrevious=true`。
