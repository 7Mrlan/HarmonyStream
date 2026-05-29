# Phase L.0：个人音乐记忆与 Context Engine

## 现状分析

- `/api/chat` 原本只是校验 `text/voice` 后调用 `handleChat`，再广播 DJ 文案、队列和当前曲；入口没有资料或环境上下文。出处：`server/src/routes/apiRoutes.ts` / `registerApiRoutes`。
- 状态层仍是进程内存电台状态，`handleChatInternal` 原本只把 `currentModel/playbackState/currentTrack` 传给规划器；没有长期音乐记忆。出处：`server/src/state/radioState.ts` / `handleChatInternal`。
- 聊天规划器原链路是本地/LLM 意图 → `resolveTracksForChat` → `generateDjResponse` → `buildQueue`；`ChatTurnPlanningContext` 没有用户资料、日程天气或个人候选曲。出处：`server/src/radio/chatTurnPlanner.ts` / `planChatTurn`。
- 情绪推荐优先命中公共硬编码锚点，注释也明确“这里不是歌单系统”；这正是“开心/怀旧”等输入不像个人电台的根因。出处：`server/src/radio/intentParser.ts` / `parseGenreRecommendationRequest`。
- Prompt 只接用户输入、播放状态、当前曲、预选曲和候选曲；没有 Context Window，也没有“有资料才引用”的运行时输入。出处：`server/src/llm/prompt.ts` / `buildDjPrompt`、`buildMusicIntentPrompt`。
- 音乐解析层可复用，`resolveTracksForChat` 已支持 `preferredTitles` 和 provider chain；Phase L.0 应在它之前提供个人候选，而不是重写音源层。出处：`server/src/music/musicResolver.ts` / `resolveTracksForChat`。
- TTS 内部只支持 `text/voice/speed`，MiMo 只吃固定 `MIMO_STYLE_INSTRUCTION`；没有根据 DJ 决策动态表达情绪。出处：`server/src/tts/ttsService.ts` / `synthesizeForChat`，`server/src/tts/providers/mimoProvider.ts` / `synthesize`。
- 移动端只发送 `text + voice`，消费 now/queue/tts-ready；P0 不应先扩 UI，而应让服务端默认资料层先闭环。出处：`apps/mobile/app/index.tsx` / `handleSend`、`handleStreamEvent`。

## 文件级计划

- 新增 `server/src/personal/profileTypes.ts`：定义 `UserMusicProfile`、`PersonalTrackSeed`、`MoodRule`、`RoutineRule`、`PersonalContext`、`TtsStyle` 等内部类型。
- 新增 `server/src/personal/profileStore.ts`：从 `server/data/user-profile` 读取 `taste.md`、`routines.md`、`playlists.json`、`mood-rules.md`；目录缺失时使用空资料分支，不把 ignored user data 提交到仓库。
- 新增 `server/src/personal/profileSearch.ts`：按用户输入、情绪词、时段、routine 和历史曲目检索个人候选；返回可解释的候选曲和命中证据。
- 新增 `server/src/personal/contextAssembler.ts`：组装 Context Window，包括用户输入、当前时段、个人摘要、相关候选、最近播放、当前曲、音源状态和 TTS 风格建议。
- 改造 `server/src/radio/chatTurnPlanner.ts`：在解析音乐前调用 Context Assembler；个人候选优先进入 `preferredTitles`，公共情绪锚点只做无资料或无命中兜底。
- 改造 `server/src/llm/prompt.ts` 与 `server/src/llm/llmAdapter.ts`：把个人上下文传给意图 prompt 和 DJ prompt；要求模型只能引用 context 中存在的用户资料。
- 改造 `server/src/radio/djCopy.ts`：fallback 文案接入个人候选理由，避免 LLM 不可用时又退回“模型收到”式空话。
- 改造 `server/src/tts/types.ts`、`ttsService.ts`、`scheduler.ts`、`mimoProvider.ts`：内部传递 `styleInstruction` / `emotion` / `speed`，MiMo 请求按 DJ 场景动态追加语气说明；cache key 必须区分动态 style。
- 新增或扩展测试：`profileStore.test.ts`、`profileSearch.test.ts`、`contextAssembler.test.ts`、`prompt.test.ts`、`ttsService.test.ts`，覆盖开心、深夜、怀旧、明确点歌和 MiMo style cache。

## 决策与风险

- 决策 1：个人资料先放服务端本机 `server/data/user-profile`，该目录被 `.gitignore` 忽略；仓库只提交解析器、默认空资料分支和测试 fixture。
- 决策 2：个人歌单不是固定播放列表；它只给候选和偏好证据，最终仍由 provider chain 解析为可播放 `Track`。
- 决策 3：没有个人资料或候选命中时可以退回现有通用链路，但 DJ 必须明确只讲听感，不假装认识用户。
- 决策 4：天气/日程第一版做本地上下文插槽：时段和 routines 已落地；真实外部天气/日历 adapter 放 P1，避免主线被外部网络拖住。
- 决策 5：MiMo 情绪 TTS 走内部参数，不扩公开 `ChatRequest`；移动端仍只控制 VOICE ON/OFF。
- 风险：LLM 仍可能空泛输出；运行时通过 prompt 约束、fallback 文案和测试 fixture 验证“资料证据进入上下文”来控制。
- 风险：个人资料是隐私数据；日志和公开响应不得输出完整资料正文，只允许输出短 reason 和候选曲名。

## 验收结果

- 终端命令：`pnpm test:full` 通过。
- 单元测试：9 个 test files、31 个 tests 通过。
- 结构烟测：`想听开心的歌 -> 稻香`、`给我推荐几首伤心的歌 -> 突然好想你`、强制无曲目分支仍返回空 play + idle。
- 本机资料种子：已创建 ignored 的 `server/data/user-profile`，不会进入 Git。
