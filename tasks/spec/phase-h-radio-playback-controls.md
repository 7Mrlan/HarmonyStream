# Phase H：电台播放控制语义重整

> 归档时间：Phase H typecheck、lint 与 HTTP 烟测通过后归档。
> 当前仍有效的决策已提升回 `tasks/spec.md`。

## 1. 模型复核（已确认）

- 电台播放控制必须符合用户心智：大播放按钮不应在“控制歌曲”和“控制主播”之间隐式切换，否则用户无法预测点击结果。
- 最优模型是三层分离：电台总控、歌曲队列、主播语音。
- 大播放按钮的语义应稳定为“电台总暂停 / 继续”：当前有歌曲或主播在输出时，点击暂停整个电台；再次点击恢复该轮电台输出。
- 上一首 / 下一首只控制歌曲队列，不控制主播语音；切歌时旧主播语音必须停止或作废，避免继续讲上一首。
- VOICE ON/OFF 只表示是否启用主播播报；主播语音是 talk-over，播放期间音乐 ducking，不抢占歌曲队列语义。
- REPLAY 属于主播语音局部控制，只重播最近 DJ 解说；音乐按 talk-over 规则 ducking。

## 2. 现状分析

- `apps/mobile/app/index.tsx` / `handlePlayPause` 当前根据 `ttsEnabled && tts.ready` 在控制 TTS 和控制歌曲之间切换，同一个主按钮的目标对象不稳定。
- `apps/mobile/app/index.tsx` / `controlsPlaying` 当前根据 TTS 或歌曲状态决定主按钮图标，导致图标也会在两套状态之间切换，增加用户理解成本。
- `apps/mobile/app/index.tsx` / `controlsPlaying` 的具体隐式切换路径：`tts.ready` 在 TTS 播完后会因 `didJustFinish` 变为 false，主按钮会无提示地从主播状态切回歌曲状态。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer` 已有歌曲播放、暂停、停止、上一首、下一首、seek 和音量控制，但它只知道本地 `playlist`，不知道电台总控或主播语音状态。
- `apps/mobile/app/_hooks/useTtsPlayer.ts` / `useTtsPlayer` 已有独立 TTS 播放器和 `pause` / `resume` / `toggle`，但它没有被放进清晰的电台级编排层。
- `apps/mobile/app/index.tsx` / `handleStreamEvent` 收到 `tts-ready` 后会在 VOICE ON 时立即播放 TTS；关闭 VOICE 后会阻止迟到 TTS 自动播放，但没有和电台总暂停状态联动。
- `apps/mobile/app/index.tsx` / `refreshNowAndNext` 只在 `/api/chat` 后把 `/api/now` 和 `/api/next` 映射成前端 playlist；前端上一首 / 下一首只在本地 playlist 内移动。
- `server/src/state/radioState.ts` / `getNextTrack` 当前只返回 `radioState.queue[1]` 并触发预热，不会推进服务端当前曲。
- `server/src/state/radioState.ts` / `buildQueue` 当前只用本轮候选构建 `[currentTrack, ...tail]`，没有播放历史和 currentIndex。
- `server/src/routes/apiRoutes.ts` / `/api/chat` 会广播 `queue-update` 和 `now-playing`，但当前没有 `/api/playback/next` 或 `/api/playback/previous` 这类真正切歌 API。
- `packages/ui/src/PlayerControls.tsx` / `PlayerControls` 只接收一个 `playing` 状态，无法表达“歌曲播放、主播播放、电台暂停、TTS 可 replay”等组合状态。

## 3. 功能点与文件级计划

### 功能点 1：建立电台级编排层

- 目标：把“歌曲播放器”和“主播语音播放器”的组合语义集中到一个移动端 hook，页面不再手写 `radio + tts` 交叉判断。
- 新增文件：`apps/mobile/app/_hooks/useStationController.ts`。
- 输入：
  - `radio`: `useRadioPlayer()` 返回值。
  - `voice`: `useTtsPlayer()` 返回值。
  - `voiceEnabled`: 当前 VOICE ON/OFF。
  - `setVoiceEnabled`: 更新 VOICE ON/OFF。
- 输出状态：
  - `stationPlaying`: 电台总输出是否正在进行；歌曲或主播任一播放即为 true。
  - `stationPaused`: 用户是否主动暂停过电台；用于阻止迟到的 `tts-ready` 自动出声。
  - `voiceSpeaking`: 主播语音是否正在播放。
  - `voiceAvailable`: 是否有最近一次可重播 / 可继续的主播语音。
  - `musicDucked`: 是否应该把歌曲音量降到 `TTS_DUCKING_VOLUME`。
- 输出动作：
  - `toggleStation()`：大播放按钮唯一入口；播放中则同时暂停歌曲和主播，暂停后再点则恢复歌曲，并在可继续时恢复主播。
  - `stopStation()`：停止歌曲和主播，歌曲回到 0，主播回到 0。
  - `toggleVoiceEnabled()`：只改变后续是否播报主播；关闭时暂停主播并恢复音乐音量，开启时不自动抢播，除非用户点 REPLAY 或下一次收到 `tts-ready`。
  - `playVoice(url)`：接收 `tts-ready` 时使用；如果 VOICE OFF 或电台处于用户暂停态，则只缓存 URL，不自动播放。
  - `replayVoice()`：重播最近一次 DJ 解说，按 talk-over 规则 ducking。
  - `nextTrack()` / `prevTrack()`：只切歌曲；切歌前停止或作废当前主播语音。

### 功能点 2：主播放控制语义固定为电台总控

- 修改文件：`apps/mobile/app/index.tsx`。
- 计划：
  - 删除 `controlsPlaying = ttsEnabled && tts.ready ? tts.playing : animationActive` 这类二选一状态。
  - `PlayerControls.playing` 改用 `station.stationPlaying`。
  - `PlayerControls.onPlayPause` 改用 `station.toggleStation`。
  - `PlayerControls.onStop` 改用 `station.stopStation`。
  - `PlayerControls.onNext` / `onPrev` 改用 `station.nextTrack` / `station.prevTrack`。
- 结果：主按钮永远是“电台输出暂停 / 继续”，不会因 TTS 播完、TTS ready、VOICE 开关而隐式改变控制对象。

### 功能点 3：主播语音变成局部控制，不抢主按钮语义

- 修改文件：`apps/mobile/app/index.tsx`、`packages/ui/src/DJBubble.tsx`。
- 计划：
  - `DJBubble.onReplay` 接 `station.replayVoice`。
  - `DJBubble.voiceActive` 仍只表示 VOICE ON/OFF。
  - 第一版不新增复杂语音控制条；如需要可把 `REPLAY` 文案动态扩展为 `VOICE PAUSE` / `VOICE RESUME`，但该控件只控制主播，不控制歌曲。
  - `handleStreamEvent` 收到 `tts-ready` 后调用 `station.playVoice(fullUrl)`，不直接调用 `tts.play(fullUrl)`。
- 结果：主播语音的重播 / 继续语义都在 DJ 气泡附近，不和底部歌曲控制抢语义。

### 功能点 4：歌曲队列切换语义独立

- 修改文件：`apps/mobile/app/_hooks/useRadioPlayer.ts`、`apps/mobile/app/_hooks/useStationController.ts`。
- 计划：
  - `useRadioPlayer.next()` / `prev()` 继续只操作歌曲 playlist。
  - `station.nextTrack()` / `prevTrack()` 在调用 `radio.next()` / `radio.prev()` 前先 `voice.stop()`，避免继续讲上一首。
  - 切歌后是否自动播放遵循当前电台状态：电台正在播放则新歌继续播放；电台被用户暂停则只切歌不自动出声。
- 第一版边界：先不新增服务端 `POST /api/playback/next`，仍使用前端 playlist 切换；服务端权威切歌 API 放到功能点 6 评估。

### 功能点 5：TTS 到达、VOICE 开关、电台暂停三者联动

- 修改文件：`apps/mobile/app/_hooks/useStationController.ts`、`apps/mobile/app/index.tsx`。
- 规则：
  - VOICE OFF：收到 `tts-ready` 只缓存 `lastTtsUrl`，不播放。
  - VOICE ON + 电台未被用户暂停：收到 `tts-ready` 自动播放主播，歌曲 ducking。
  - VOICE ON + 电台已被用户暂停：收到 `tts-ready` 只缓存，不自动播放；用户点主播放后再恢复歌曲和可继续的主播。
  - 主播播完：只恢复歌曲音量，不改变主按钮控制对象。
  - 用户关闭 VOICE：暂停主播，恢复歌曲音量；不会停止歌曲。

### 功能点 6：服务端真实切歌 API 是否进入本阶段

- 候选方案 A：本阶段只做前端编排，服务端保持 `/api/next` 作为预览 / 预热。
  - 优点：风险小，能快速修复用户当前混乱体验。
  - 缺点：服务端 `/api/now` 不知道用户在前端点了下一首；刷新或重连后可能回到服务端当前曲。
- 候选方案 B：本阶段新增最小服务端切歌 API。
  - 新增契约：`POST /api/playback/next`、`POST /api/playback/previous`。
  - 修改 `server/src/state/radioState.ts`：新增当前 queue 内的 `currentIndex`，切歌时推进 `currentTrack` 并广播 `now-playing` / `queue-update`。
  - 修改 `packages/api/src/types.ts` / `client.ts`：新增 playback 方法。
  - 修改 `apps/mobile/app/_hooks/useStationController.ts`：`nextTrack()` / `prevTrack()` 优先请求服务端，失败再本地静默兜底。
  - 优点：状态权威统一，后续锁屏 / 真机 / 重连更科学。
  - 缺点：改动跨 API、服务端状态、前端编排，验证面更大。
- 推荐：采用方案 B。理由：Phase H 的目标是“控制语义重整”，上一首 / 下一首如果仍只在前端移动，会继续留下服务端状态与用户听到内容不一致的隐患，后续 Phase F 真机锁屏也会被这个状态差拖累。
- v1 边界：`previous` 只在当前服务端 queue 内后退，不跨 chat 轮次；`currentIndex = 0` 时返回 `{ ok: false, reason: 'queue start' }`，前端静默不切歌。
- v1 边界：`next` 耗尽当前 queue 时返回 `{ ok: false, reason: 'queue exhausted' }`，前端静默不切歌；本阶段不自动触发 `resolveTracksForChat` 或 LLM 补歌，用户下次发消息才刷新队列。

## 4. 风险与决策

- 决策：采用服务端真实切歌 API（方案 B），因为锁屏 metadata、重连后的 `/api/now` 和移动端当前曲必须保持一致。
- 决策：服务端 v1 只维护当前 queue 的 `currentIndex`，不引入跨 chat 播放历史栈；跨轮次历史属于后续“播放历史 / 最近听过”功能，不进入 Phase H。
- 决策：queue 耗尽时不自动补歌，不调用 LLM，不重新跑音乐解析；返回业务失败让前端静默处理，保持 Phase H 聚焦播放控制语义。
- 决策：`/api/next` 保留“预览 / 预热下一首”语义；真正切歌走 `POST /api/playback/next` 和 `POST /api/playback/previous`，避免 GET 产生状态副作用。
- 决策：切歌时旧 TTS 必须停止或作废；第一版不为切歌自动生成新的 DJ 过渡 TTS，避免引入额外 LLM / TTS 竞态。
- 决策：主播放按钮永远绑定 `station.toggleStation()`，不再根据 TTS ready / didJustFinish / VOICE 状态改变目标对象。
- 风险：新增切歌 API 会扩大验证面，必须同时验证 HTTP 响应、WS `now-playing` / `queue-update`、移动端当前曲、锁屏 metadata 输入源。
- 风险：`useStationController` 如果依赖整个 `radio` / `tts` 对象，可能复发 useEffect 重连或高频重渲染问题；实现时要拆稳定回调或使用 ref。
- 风险：TTS 到达时间可能晚于用户暂停 / 切歌 / 关闭 VOICE；必须用“电台暂停态 + voiceEnabledRef + 当前曲 token”防止过期 TTS 自动播放。

## 5. 执行步骤

1. 更新共享 API 契约。
   - 文件：`packages/api/src/types.ts`、`packages/api/src/client.ts`。
   - 新增 `PlaybackMoveResponse`，形态为 `{ ok: true; track: Track; queue: Track[] } | { ok: false; reason: string; track: Track | null; queue: Track[] }`。
   - 新增 client 方法：`playNext()`、`playPrevious()`。
   - 验证：终端命令 `pnpm typecheck:api`。
2. 更新服务端播放状态。
   - 文件：`server/src/state/radioState.ts`。
   - 给内存状态新增 `currentIndex`，`handleChatInternal()` 新队列提交时置为 0。
   - 新增导出：`playNextTrack()`、`playPreviousTrack()`。
   - `playNextTrack()`：`currentIndex + 1 < queue.length` 时推进；否则返回 `queue exhausted`。
   - `playPreviousTrack()`：`currentIndex > 0` 时后退；否则返回 `queue start`。
   - 验证：终端命令 `pnpm typecheck:server`。
3. 增加服务端路由与广播。
   - 文件：`server/src/routes/apiRoutes.ts`。
   - 新增 `POST /api/playback/next`、`POST /api/playback/previous`。
   - 成功切歌后广播 `now-playing` 和 `queue-update`；失败只返回业务失败，不广播切歌事件。
   - 验证：终端命令请求 `/api/chat` 后连续请求两个 playback API，确认成功 / queue exhausted / queue start 行为。
4. 建立移动端电台编排层。
   - 新增文件：`apps/mobile/app/_hooks/useStationController.ts`。
   - 封装 `toggleStation()`、`stopStation()`、`toggleVoiceEnabled()`、`playVoice()`、`replayVoice()`、`nextTrack()`、`prevTrack()`。
   - 内部用 ref 保存 voiceEnabled、stationPaused、lastVoiceUrl，避免迟到 TTS 或 stale closure。
   - 验证：终端命令 `pnpm typecheck:mobile`。
5. 接入页面。
   - 文件：`apps/mobile/app/index.tsx`。
   - 删除 `controlsPlaying`、`handlePlayPause`、`handleVoiceToggle` 中的交叉判断。
   - `PlayerControls` 接 `station.stationPlaying` 和 station 动作。
   - `DJBubble` 接 `station.toggleVoiceEnabled` 与 `station.replayVoice`。
   - `handleStreamEvent` 的 `tts-ready` 改为 `station.playVoice(fullUrl)`。
   - 验证：终端命令 `pnpm typecheck:mobile`。
6. 必要 UI 状态补充。
   - 文件：`packages/ui/src/PlayerControls.tsx`、`packages/ui/src/DJBubble.tsx`（仅在现有组件无法表达状态时修改）。
   - 原则：不新增复杂说明文案；只用稳定图标 / 按钮状态表达当前控制对象。
   - 验证：终端命令 `pnpm typecheck:ui`。
7. 全量验证。
   - 终端命令：`pnpm typecheck`
   - 终端命令：`pnpm lint`
   - 终端命令：`/api/chat` 后 `POST /api/playback/next` 成功推进 `/api/now.track`。
   - 终端命令：当前 queue 末尾继续 `POST /api/playback/next` 返回 `ok:false reason=queue exhausted`。
   - 终端命令：当前 queue 开头 `POST /api/playback/previous` 返回 `ok:false reason=queue start`。
   - 浏览器操作：VOICE OFF 时主按钮只控制歌曲暂停 / 继续。
   - 浏览器操作：VOICE ON 且主播讲话时，主按钮暂停歌曲和主播；再次点击二者继续，音乐保持 ducking。
   - 浏览器操作：主播播完后主按钮仍是电台总控，不因 `tts.ready` 变化出现无提示语义切换。
   - 浏览器操作：切下一首时旧主播语音停止，不再讲上一首。
