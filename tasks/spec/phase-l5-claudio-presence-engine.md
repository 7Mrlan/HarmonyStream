# Phase L.5 Claudio Presence Engine

## 现状分析

- `server/src/state/radioState.ts` / `handleChatInternal()` 是 `/api/chat` 状态提交点，当前只保存 `activeIntent`、`sessionMemory` 和 `trackCommentaryMemory`，没有跨轮“此刻 Claudio 正在什么氛围里”的会话状态。
- `server/src/radio/chatTurnPlanner.ts` / `planChatTurn()` 会调用 `buildResidentDjPlanAsync()` 产出 `DjTurnPlan` 和候选歌曲，但每轮只基于本轮输入、个人资料和当前播放状态，没有把上一轮的陪伴曲线带入下一轮。
- `server/src/personal/residentDj.ts` / `buildTurnPlan()` 已能按本轮情绪决定 `comfortMode`、`energyCurve` 和约束，但缺少 session-level continuity，容易从“刚刚在陪你难过”下一轮突然跳成默认状态。
- `apps/mobile/app/_utils/claudioLifeState.ts` / `deriveClaudioLifeState()` 已有本地 Life State Bus，`apps/mobile/app/index.tsx` / `getClaudioLifeVisualState()` 已能把状态映射到 `MusicSpectrum.mode`，但仍是瞬时业务状态，不包含“这段电台正在陪伴、专注、庆祝还是收尾”的连续视觉语气。

## 功能点与文件级计划

- 新增服务端纯函数 `server/src/radio/presenceEngine.ts`，定义 `DjSessionPresence`，状态包括 `arc`、`energyBias`、`talkativeness` 和 `recentSignals`；它只描述会话氛围，不写入长期用户资料。
- `radioState.ts` 保存一份内存态 `presence`，`handleChatInternal()` 把当前 presence 传入 `planChatTurn()`，计划成功后用本轮 `DjTurnPlan` 推导下一轮 presence；服务端上一首 / 下一首成功移动时也用轻量规则更新 presence。
- `chatTurnPlanner.ts` 只负责编排：把 presence 传给 Resident DJ，并把更新后的 presence 随内部 plan 返回；不修改公开 `ChatResponse`、WS 事件或 `/api/chat` 契约。
- `residentDj.ts` 把 presence 当作 evidence，而不是最终决策：它可以影响 `energyCurve`、`constraints` 和 `comfortMode` 的连续性，但不能覆盖明确点歌，也不能把 “presence” 说成长期了解用户。
- 移动端新增纯函数 `apps/mobile/app/_utils/presenceVisualTone.ts`，基于 `ClaudioLifeState`、最近用户输入和暂停 / 播放状态派生展示语气；`packages/ui` 仍只接收 `MusicSpectrum.mode` 等展示参数。
- 本阶段不实现真实 FFT、不做宠物、不新增公开 API 字段、不做新的大 UI 面板。

## 风险与决策

- 风险：Presence 如果过强，会重新变成“固定映射”。决策：presence 只做轻微 bias，明确用户输入、个人歌单证据和可播放解析结果优先。
- 风险：移动端本地 tone 和服务端 presence 不完全一致。决策：Phase L.5 不扩公开 API，移动端只负责即时视觉语气；服务端负责真实推荐连续性。
- 风险：把用户情绪持久化为隐私档案。决策：Presence 只存在进程内存，不写 `dj-memory.json` 或 `listening-events.jsonl`。
- 风险：为了“高级”引入复杂线程。决策：L.5 用纯函数和现有异步编排；真实音频分析或 CPU 密集任务留给 Phase N 单独评估。

## 验证计划

- 终端命令：`pnpm test`，覆盖 presence 纯函数、Resident DJ 连续性、移动端视觉语气纯函数。
- 终端命令：`pnpm test:full`，因为本阶段触及 `/api/chat`、队列移动和服务端状态编排。
- 自审重点：是否过度影响明确点歌、是否假装懂用户、是否泄露隐私、是否把不可播放候选说成已播放。

## Review

- 结果：服务端新增进程内 `DjSessionPresence`，`radioState -> chatTurnPlanner -> Resident DJ` 已形成连续状态链路。
- 结果：presence 只影响中性输入的曲线、约束和说话尺度；明确开心、伤心、专注输入优先，避免上一轮状态压过本轮用户意图。
- 结果：移动端新增本地 `presenceVisualTone`，只映射 OnAir / NowPlaying / MusicSpectrum 展示参数，不扩公开 API。
- 自审修复：发现并修掉 presence 可能让 soft-hold 永久粘住、压暗明确开心输入、fresh 状态切歌反馈未被消费、明确输入仍携带旧 presence prompt 的问题。
- 验证：终端命令 `pnpm test` 通过；移动端 3 个测试文件 / 16 个测试，服务端 13 个测试文件 / 62 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。
