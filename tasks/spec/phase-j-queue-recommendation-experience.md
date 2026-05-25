# Phase J：队列与推荐体验收口

### 16.1 现状分析

#### 16.1.1 服务端队列只覆盖“本轮 chat 候选”，没有电台会话续推

- 代码出处：`server/src/state/radioState.ts` / `RadioState` 当前只保存 `currentTrack`、`queue`、`currentIndex`、`messages`、`currentModel`、`playbackState`。
- 代码出处：`server/src/state/radioState.ts` / `handleChatInternal` 每次 chat 都重新解析输入并用 `buildQueue(currentTrack, candidateTracks)` 覆盖 `radioState.queue`。
- 代码出处：`server/src/state/radioState.ts` / `buildQueue` 只把当前选中曲放到队首，其余候选曲作为队尾；没有保存“本次用户意图 activeIntent”、当前 session 已出现曲目集合、后台续推状态。
- 结论：当前系统是“每轮 chat 的短队列”，不是“围绕一次用户意图持续播放的电台 session”。这会让情绪 / 范围请求在队列耗尽后无法自然续播。

#### 16.1.2 情绪 / 类型推荐现在只取 1 首，和电台直觉冲突

- 代码出处：`server/src/state/radioState.ts` / `handleChatInternal` 调用 `resolveTracksForChat({ ..., limit: explicitRequest || genreRequest ? 1 : 3 })`。
- 代码出处：`server/src/radio/intentParser.ts` / `parseGenreRecommendationRequest` 会把“开心 / 伤心 / 难过”等范围性输入识别为 `genreRequest`。
- 结论：用户表达范围或心情时，当前也只解析 1 首，导致上一首 / 下一首基本无意义；这不符合“让主播推荐几首同氛围歌曲”的电台心智。

#### 16.1.3 下一首 / 上一首只移动已有队列，队列空时不补歌

- 代码出处：`server/src/state/radioState.ts` / `playNextTrack` 在 `nextIndex >= radioState.queue.length` 时返回 `buildPlaybackMoveFailure('queue exhausted')`。
- 代码出处：`server/src/state/radioState.ts` / `playPreviousTrack` 在 `previousIndex < 0` 时返回 `buildPlaybackMoveFailure('queue start')`。
- 代码出处：`server/src/routes/apiRoutes.ts` / `broadcastPlaybackMove` 只在 `result.ok` 时广播 `now-playing` 和 `queue-update`；失败不广播。
- 结论：当前切歌是稳定的服务端权威移动，但没有“队列快耗尽时后台续推”的能力，也没有把失败原因变成前端按钮禁用状态。

#### 16.1.4 当前 TTS 过期保护只按 chatId，不按曲目

- 代码出处：`server/src/tts/scheduler.ts` / `nextChatId` 与 `scheduleTts(text, chatId)` 只维护 `currentChatId`。
- 代码出处：`server/src/tts/scheduler.ts` / `runSynthesis` 在合成完成后只检查 `chatId !== currentChatId`，通过后直接广播 `{ type: 'tts-ready', url }`。
- 代码出处：`apps/mobile/app/index.tsx` / `handleStreamEvent` 收到 `tts-ready` 后直接交给 `playVoice(fullUrl)`；客户端不知道这段 TTS 属于哪首歌。
- 结论：Phase E/H 的 chatId 能防止“旧 chat 的主播语音覆盖新 chat”，但不能防止“用户已经切到下一首后，上一首歌曲介绍迟到播放”。Phase J 新歌播报需要独立的 trackToken / trackId 级 stale check。

#### 16.1.5 现在没有切歌文案缓存，来回切歌无法区分新播报与重播

- 代码出处：`server/src/state/radioState.ts` / `RadioState` 没有 `Map<trackId, commentary>` 或类似结构。
- 代码出处：`server/src/routes/apiRoutes.ts` / `playback/next|previous` 只返回 `PlaybackMoveResponse`，不返回 DJ 文案或播报状态。
- 代码出处：`apps/mobile/app/_hooks/useStationController.ts` / `moveTrack` 成功后只 `voice.stop()`、`applyApiTracks(result.queue, true)`，不处理新曲 DJ 文案。
- 结论：如果 Phase J 给切歌增加主播播报，必须明确文案缓存 key 和生命周期，否则上一首 / 下一首来回切会重复生成、重复 TTS，既慢也烦。

#### 16.1.6 前端按钮没有禁用语义

- 代码出处：`packages/ui/src/PlayerControls.tsx` / `PlayerControlsProps` 只有 `onPrev`、`onNext` 等回调，没有 `prevDisabled` / `nextDisabled`。
- 代码出处：`packages/ui/src/PlayerControls.tsx` / `GlassButton` 只通过 `onPress ? 1 : 0.45` 改透明度，但页面始终传入 `station.previousTrack` 与 `station.nextTrack`。
- 代码出处：`apps/mobile/app/index.tsx` / `PlayerControls` 渲染处一直传 `onPrev={station.previousTrack}`、`onNext={station.nextTrack}`。
- 结论：服务端已经知道队列边界，但前端不能提前表达“单曲没有上一首 / 下一首”。Phase J 需要把服务端队列能力同步到 UI 禁用态。

### 16.2 已确认的 Phase J 设计约束

- 后台续推不调用 LLM：只复用用户发消息时已生成的 activeIntent，调用 `resolveTracksForChat` 继续解析音乐；只有新 chat 才走完整 LLM 意图链路。
- 新歌异步播报必须有 trackToken：TTS 生成和广播前要校验当前曲仍是目标 track；它独立于 chatId，防止旧歌介绍迟到。
- 去重范围限定当前 session：维护进程内 `seenTrackKeys`，记录已经进入当前 session 队列或被用户离开的 `track.id || track.url`，不跨进程持久化，重启清空。
- 文案缓存限定当前 session：按 `track.id || track.url` 缓存 `{ say, segue }`，避免来回上一首 / 下一首重复生成；不写入磁盘。
- 用户首轮请求可以让主播多聊一点，更有声情和趣味；用户主动切歌的新歌播报应该更短，但仍要有电台风格和趣味，不是固定模板短句。

### 16.3 功能点与文件级方案

#### 功能点 1：定义电台会话 activeIntent

- 目标：用户发新消息后，服务端保存一份可复用的电台会话意图，用于后续后台续推；下一首按钮不重新调用 LLM 做意图识别。
- 范围：
  - 明确点歌：队列目标数量为 1，不启动后台续推。
  - 情绪 / 范围请求：队列目标数量为 3，启动后台续推。
  - 明确多首请求（例如“几首 / 歌单 / 多推荐几首”）：队列目标数量为 5，启动后台续推。
  - 后台续推每批补 2-3 首，最多把当前内存队列维持到目标数量附近，不做无限并发。
- 文件计划：
  - `server/src/state/radioState.ts`：扩展 `RadioState`，新增 `activeIntent`、`seenTrackKeys`、`commentaryCache`、`refillInFlight`。
  - `server/src/radio/intentParser.ts`：新增纯函数识别“多首 / 歌单 / 几首”等数量意图，保留明确点歌与情绪推荐的分离。
  - `server/src/state/radioState.ts`：新增内部类型 `RadioSessionIntent`，保存 `userText`、`searchText`、`preferredTitles`、`requestKind`、`targetQueueSize`、`voiceEnabledAtChat`。

#### 功能点 2：后台续推只解析音乐，不调 LLM

- 目标：队列不足时，使用 `activeIntent` 调用 `resolveTracksForChat` 补歌；不走 `generateMusicIntent`，不生成长 DJ 文案，不阻塞当前播放。
- 触发口径：
  - `/api/chat` 成功后，如果 activeIntent 支持续推，后台尝试补到目标数量。
  - `playNextTrack` 成功切歌后，如果剩余队列低于 2 首，后台续推。
  - `/api/next` 预热时可以顺手触发续推，但仍不改变当前播放。
- 去重规则：
  - 使用 `track.id || track.url` 作为 key。
  - 当前 session 内已经进入过队列、被用户离开过、当前队列已有的曲目都不能重复加入。
  - 不跨进程持久化，重启清空。
- 文件计划：
  - `server/src/state/radioState.ts`：新增 `maybeRefillQueue(reason)`、`appendResolvedTracksToQueue(tracks)`、`getTrackKey(track)` 等内部函数。
  - `server/src/music/musicResolver.ts`：优先不改公开函数；如需排除已知 track，在 `radioState.ts` 续推后过滤，避免把 resolver 变复杂。
  - `server/src/routes/apiRoutes.ts`：保持 HTTP 立即返回；续推通过 WS `queue-update` 异步通知客户端。

#### 功能点 3：上一首 / 下一首能力下发与 UI 禁用

- 目标：单曲队列时禁用上一首 / 下一首；队首禁用上一首；队尾且不可续推时禁用下一首。
- 契约方案：
  - 新增共享类型 `PlaybackCapabilities`：`canPrevious`、`canNext`、`queueSize`、`currentIndex`、`canAutoRefill`。
  - `NowResponse` 增加 `playback` 字段，作为首屏和刷新时的权威能力。
  - `PlaybackMoveResponse` 增加 `playback` 字段，切歌后立即更新 UI 禁用态。
  - `queue-update` 事件增加可选 `playback` 字段；客户端兼容缺字段。
- 文件计划：
  - `packages/api/src/types.ts`：新增 `PlaybackCapabilities`，扩展 `NowResponse`、`PlaybackMoveResponse`、`StreamEvent.queue-update`。
  - `packages/api/src/client.ts`：更新 `isStreamEvent` 运行时校验，仍只做最小 shape 校验。
  - `server/src/state/radioState.ts`：新增 `getPlaybackCapabilities()` 并在 `getNowPlaying`、`moveToQueueIndex`、失败响应中返回。
  - `server/src/routes/apiRoutes.ts` / `server/src/routes/streamRoutes.ts`：广播 `queue-update` 时附带 playback。
  - `apps/mobile/app/index.tsx`：维护服务端 playback capability state，并传给控件。
  - `packages/ui/src/PlayerControls.tsx`：新增 `prevDisabled`、`nextDisabled`，`GlassButton` 支持 disabled，禁用时不触发反馈动画和 `onPress`。

#### 功能点 4：VOICE ON 下的新歌短播报

- 目标：用户首轮请求保留较丰富 DJ 文案；用户主动切歌时，如果 VOICE ON，为新歌生成短而有趣的电台播报，异步 TTS + ducking，不阻塞切歌。
- 语义：
  - 切歌先播放新曲，主播文案和 TTS 后到。
  - 切歌播报长度为 1-2 句，围绕原 activeIntent、当前 track、跳过行为做轻量过渡。
  - 用户快速连续切歌时，旧 track 的播报和 TTS 过期丢弃。
  - 切回已有播报缓存的歌曲，不重新生成；UI 可显示缓存文案，是否播放由 REPLAY 或 VOICE 自动播报策略决定。
- 文件计划：
  - `server/src/state/radioState.ts`：切歌成功后调度 `scheduleTrackCommentary(track, cause)`，使用 `trackToken` 防过期。
  - `server/src/radio/djCopy.ts`：新增短播报模板函数，例如 `buildTrackSwitchChatResponse(...)`，作为 LLM 不可用或不走 LLM 时的稳定 fallback。
  - `server/src/llm/llmAdapter.ts`：如要生成更有趣短播报，新增轻量接口 `generateTrackCommentary`；该接口只用于切歌文案，不参与续推选曲。
  - `server/src/tts/scheduler.ts`：新增按 track token 调度的 TTS 入口，或让调用方传入 stale checker；不得复用 chatId 当作唯一过期条件。
  - `packages/api/src/types.ts`：新增 WS 事件 `track-commentary`，包含 `trackId`、`say`、`segue?`、`reason?`；`tts-ready` 可选携带 `trackId`，客户端据此二次校验。
  - `apps/mobile/app/index.tsx`：收到 `track-commentary` 时更新 DJBubble；收到带 `trackId` 的 `tts-ready` 时确认仍是当前 track 后再 `playVoice`。

#### 功能点 5：请求数量与主播文案层级

- 目标：让“点一首”和“推荐一个氛围”在产品上明显不同。
- 规则：
  - 明确单曲：`targetQueueSize = 1`，首轮主播可以围绕这首歌多聊一点。
  - 情绪 / 范围：`targetQueueSize = 3`，首轮主播说明这个小段落的氛围，不需要一次讲完 3 首。
  - 明确歌单 / 几首：`targetQueueSize = 5`，首轮主播说明这是一组推荐，播放从第一首开始。
  - 切歌播报只讲当前切到的歌，不复述整个歌单。
- 文件计划：
  - `server/src/radio/intentParser.ts`：新增请求 kind / 数量判断纯函数。
  - `server/src/state/radioState.ts`：按 request kind 决定 `resolveTracksForChat.limit` 和 `activeIntent.targetQueueSize`。
  - `server/src/radio/djCopy.ts`：首轮长文案和切歌短文案分开模板，避免两种场景互相污染。

### 16.4 风险与决策

#### 16.4.1 后台续推并发风险

- 风险：`/api/chat`、`playNextTrack`、`/api/next` 都可能触发 `maybeRefillQueue`，如果没有并发保护，会重复打外部音源，甚至把重复曲目追加进队列。
- 决策：`radioState.refillInFlight` 使用 `Promise<void> | null`。续推进行中时，新的续推触发直接复用或静默跳过；Promise 落定后在 `finally` 清空。
- 决策：该模式与 `chatQueue` 的串行思路一致，但不阻塞主 chat / 切歌返回；续推失败只写日志并保持当前队列。

#### 16.4.2 队列续推不能重新调用 LLM 意图

- 风险：如果每次续推都重新调用 `generateMusicIntent`，性能风险会接近“每次下一首都等 LLM”，并且用户会感觉推荐方向漂移。
- 决策：后台续推只使用 `activeIntent.searchText`、`activeIntent.preferredTitles` 和 request kind 调用 `resolveTracksForChat`。
- 决策：只有用户发送新 chat 时才允许走完整 LLM 意图链路，形成新的 activeIntent。

#### 16.4.3 兼容旧 queue-update 事件

- 风险：`queue-update` 增加可选 `playback` 后，新客户端可能收到没有 `playback` 的旧事件；如果把缺字段当成“全禁用”，按钮会意外全灰。
- 决策：客户端收到没有 `playback` 的 `queue-update` 时，保持上一份已知 `PlaybackCapabilities`，只更新队列。
- 决策：首屏 `/api/now` 如果也没有 `playback`，客户端使用保守本地推断：队列长度大于 1 时允许 next，previous 默认 false；该 fallback 只为兼容旧服务端。

#### 16.4.4 兼容旧 tts-ready 事件

- 风险：`tts-ready` 增加可选 `trackId` 后，客户端需要同时处理 chat TTS 和 track TTS；漏掉无 `trackId` 分支会导致首轮主播不播报。
- 决策：客户端收到带 `trackId` 的 `tts-ready` 时，只有当前曲 key 匹配才 `playVoice`；不匹配直接丢弃。
- 决策：客户端收到不带 `trackId` 的 `tts-ready` 时，按旧逻辑直接交给 `playVoice`，保持首轮 chat TTS 兼容。

#### 16.4.5 切歌短播报不能阻塞播放

- 风险：切歌后生成文案 / TTS 如果同步等待，会让下一首按钮变慢，违背播放器直觉。
- 决策：`playNextTrack` / `playPreviousTrack` 成功后立即返回并广播新曲；切歌短播报 fire-and-forget。
- 决策：短播报生成失败、TTS 失败或过期都静默，不影响当前歌曲播放。

#### 16.4.6 LLM 切歌文案 fallback

- 风险：`generateTrackCommentary` 是可选 LLM 调用；无 key、超时、HTTP 错误或解析失败都可能发生。
- 决策：LLM 不可用时 fallback 到 `djCopy.ts` 的短模板；模板文案质量允许低于 LLM，但必须保持电台风格，不能是空字符串，也不能只有“下一首是 xxx”这类无意义短句。
- 决策：短模板必须包含当前歌曲名，并尽量结合 activeIntent 的心情 / 风格，让 VOICE ON 的用户感觉仍在同一个电台频道里。

#### 16.4.7 当前 session 边界

- 风险：若去重和文案缓存持久化，后续会牵涉用户偏好、隐私、存储迁移和导入歌单语义，超出 Phase J。
- 决策：Phase J 不区分“听完”和“跳过”，统一使用 `seenTrackKeys` 防止重复推荐；服务端当前没有自然播完信号，强行保留 `playedTrackKeys` 会变成空集合或伪状态。
- 决策：`seenTrackKeys`、`commentaryCache` 只保存在内存 radioState，进程重启清空。
- 决策：跨 session 偏好留给 Phase L 用户歌单 JSON 偏好，不在 Phase J 混入。

### 16.5 执行步骤

1. 共享契约更新。
   - 修改 `packages/api/src/types.ts`：新增 `PlaybackCapabilities`。
   - 扩展 `NowResponse.playback`、`PlaybackMoveResponse.playback`。
   - 扩展 `StreamEvent`：`queue-update` 增加可选 `playback`；`tts-ready` 增加可选 `trackId`；新增 `track-commentary`。
   - 修改 `packages/api/src/client.ts` 的 `isStreamEvent`，允许新增事件类型；运行时校验保持最小 shape。

2. 服务端状态模型更新。
   - 修改 `server/src/state/radioState.ts`：扩展 `RadioState`，加入 `activeIntent`、`seenTrackKeys`、`commentaryCache`、`refillInFlight`。
   - 新增 `getTrackKey(track)`、`getPlaybackCapabilities()`、`buildSessionIntent(...)`。
   - `getNowPlaying()` 返回 `playback`。

3. 请求 kind 与队列数量。
   - 修改 `server/src/radio/intentParser.ts`：新增识别“多首 / 几首 / 歌单”的纯函数。
   - 修改 `server/src/state/radioState.ts` / `handleChatInternal`：明确单曲 `limit=1`，情绪范围 `limit=3`，明确多首 `limit=5`。
   - 新 chat 成功后重置当前 session 的去重集合和文案缓存，并写入新的 activeIntent。
   - 新 chat 生成队列后，把初始队列中每首歌的 key 写入 `seenTrackKeys`，防止后台续推把同一批结果再补回来。

4. 后台续推。
   - 在 `server/src/state/radioState.ts` 新增 `maybeRefillQueue(reason)`。
   - 使用 `refillInFlight: Promise<void> | null` 防重复续推；`finally` 清空。
   - 续推调用 `resolveTracksForChat`，不调用 `generateMusicIntent`。
   - 续推结果过滤当前 session 已出现、当前队列已有 track，再 append。
   - append 后通过 `broadcastStreamEvent({ type: 'queue-update', queue, playback })` 推给客户端。
   - `/api/next` 预热路径也可调用 `maybeRefillQueue('api-next')`；该调用只补队列和广播，不改变当前曲。

5. 切歌能力与按钮禁用。
   - 修改 `playNextTrack` / `playPreviousTrack` / `buildPlaybackMoveFailure` / `moveToQueueIndex`：返回 `playback`。
   - `playNextTrack` 成功移动前，把当前 `queue[currentIndex]` 的 key 写入 `seenTrackKeys`；`playPreviousTrack` 不把当前曲标记为负反馈，只依赖初始队列 / 续推 append 时的 seen 记录去重。
   - 修改 `server/src/routes/apiRoutes.ts` / `streamRoutes.ts`：广播 `queue-update` 时带 `playback`。
   - 修改 `apps/mobile/app/index.tsx`：维护 `playbackCapabilities` state；收到缺 `playback` 的旧事件时保持上次状态。
   - 修改 `packages/ui/src/PlayerControls.tsx`：新增 `prevDisabled`、`nextDisabled`；disabled 不触发 `onActionFeedback`、不触发 `onPress`。

6. 切歌短播报。
   - 修改 `server/src/radio/djCopy.ts`：新增切歌短文案 fallback 模板。
   - 如实现 LLM 短文案，修改 `server/src/llm/llmAdapter.ts`：新增 `generateTrackCommentary`，失败返回 `ok:false`。
   - 修改 `server/src/state/radioState.ts`：切歌成功后 fire-and-forget 调度短播报；缓存按 `track.id || track.url`。
   - 修改 `server/src/tts/scheduler.ts`：新增 track-aware TTS 调度，支持 `trackId` 和 stale checker。
   - 修改 `apps/mobile/app/index.tsx`：收到 `track-commentary` 更新 DJBubble；收到带 `trackId` 的 `tts-ready` 时做当前曲校验，无 `trackId` 时走旧逻辑。

7. 验证。
   - 终端命令：`pnpm typecheck`
   - 终端命令：`pnpm lint`
   - 终端命令：HTTP 点歌“我想听许嵩的乌鸦”，确认 `playback.canNext=false`，前端下一首禁用。
   - 终端命令：HTTP 输入“想听开心的歌”，确认队列目标为 3，`playback.canNext=true`。
   - 终端命令：HTTP 输入“给我推荐几首伤心的歌”，确认队列目标为 5。
   - 浏览器操作或真机操作：VOICE ON 后切下一首，确认歌曲先切，主播短播报后到，旧歌迟到 TTS 不播放。
   - 浏览器操作或真机操作：连续下一首触发续推，确认按钮不长时间卡死，队列通过 WS 追加。
