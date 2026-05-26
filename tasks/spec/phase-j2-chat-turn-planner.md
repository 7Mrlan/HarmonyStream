# Phase J.2：chatTurnPlanner 抽离

## 现状分析

- `server/src/state/radioState.ts` / `handleChatInternal` 混合两类职责：规划一轮聊天结果，以及提交状态、副作用和返回结果。
- 规划段包括输入解析、LLM 意图、音乐解析、DJ 文案生成、队列构造和 session intent 构造。
- 提交段包括 `cancelPendingPreloads`、写入 `radioState.currentTrack / playbackState / queue / currentIndex / activeIntent / messages`、`resetSessionMemory`、`schedulePreload`、`maybeRefillQueue`、`scheduleTts`。
- `buildMusicReason` 与 `buildLlmFirstMusicIntent` 属于 chat planning 辅助逻辑，不属于状态 facade。

## 功能点方案

- 新建 `server/src/radio/chatTurnPlanner.ts`，负责根据用户输入、当前模型、播放状态和当前曲目规划一轮聊天结果。
- `ChatTurnPlan` 使用判别联合类型：
  - `ok: true` 返回 `response`、`currentTrack`、`queue`、`activeIntent`、`shouldScheduleTts`。
  - `ok: false` 只返回 `response`，由 `radioState.ts` 清空状态。
- `ChatTurnPlanningContext` 只包含 `currentModel`、`playbackState`、`currentTrack`；`request.voice` 直接从 `ChatRequest` 读取。
- `cancelPendingPreloads`、`schedulePreload`、`maybeRefillQueue`、`scheduleTts` 保留在 `radioState.ts` 提交阶段。
- `radioState.ts` 继续保留 routes facade，对外 API 不变。

## 风险与决策

- 类型依赖方向保持单向：`chatTurnPlanner.ts -> radioSession.ts`，`radioSession.ts` 不反向 import planner，也不 import `radioState.ts`。
- messages 写入只留在 `radioState.ts`，成功和无曲目路径都在提交阶段统一追加 response 并裁剪到最近 20 条。
- 拆分完成后，`radioState.ts` 不再直接 import `llmAdapter`、`musicResolver`、`intentParser`、`djCopy`。
- 无曲目路径需要显式验证；真实音乐源可能对随机关键词返回相近结果，因此使用 `MUSIC_PROVIDER_CHAIN=fallback` 强制 no-result 分支做结构烟测。

## 验收

- `server/src/state/radioState.ts` 从 477 行降到 360 行。
- 新增 `server/src/radio/chatTurnPlanner.ts`，承担 chat planning 逻辑。
- 验证通过：
  - `pnpm typecheck:server`
  - `pnpm lint`
  - `pnpm --filter server build`
  - import 检查：`radioState.ts` 不再直接 import LLM adapter、music resolver、intentParser、djCopy。
  - HTTP structural smoke：每次 `/api/chat` 后 `/api/now` 状态与 `play` 分支一致。
  - 强制 no-result smoke：`MUSIC_PROVIDER_CHAIN=fallback` 时 `/api/chat` 返回 `play=[]`，`/api/now.track=null`，`state=idle`。
