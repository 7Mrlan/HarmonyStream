# Claudio · 项目决策真源（Spec）

> 本文件只保留当前仍会影响实现的决策真源。
> 历史踩坑和纠正规则放在 `tasks/lessons.md`；当前执行进度放在 `tasks/todo.md`。
> 任何代码与本文件冲突，错的是代码；发现偏差先更新 Spec，再改代码。

---

## 当前活跃索引

- 当前主线：AI 电台最小闭环。
- 已完成：Phase A 后端 API 骨架；Phase B 移动端接入；Phase C LLM 主播；Phase C+ 等待体验。
- 当前阶段：Phase D 音乐来源接入。
- 当前确认点：Phase D 功能点与文件级计划待确认。
- 当前 HARD-GATE：确认完整 Phase D Spec 前，不写 Phase D 代码。
- 当前边界：Phase D 只做服务端音乐解析与真实 `Track` 返回；不接 TTS、数据库、长期记忆、后台播放、APK release。

---

## 0. 产品一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂用户输入，用 DJ 口吻推荐音乐，并把可播放曲目推给移动端播放器。

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

- `packages/api/src/types.ts` / `Track` 是服务端和移动端共享曲目契约：`id`、`url`、`title`、`artist?`、`artwork?`、`duration?`。
- `packages/api/src/types.ts` / `ChatResponse.play` 是 LLM 推荐曲名数组，曲名由服务端解析为可播放 `Track`。
- `/api/chat` 返回 `ChatResponse`，并通过 WS 广播 `chat-token`、`queue-update`、`now-playing`。
- `/api/now` 返回当前 `Track | null`、position、state。
- `/api/next` 返回下一首 `Track | null` 和 reason。
- `/stream` 是增强链路；HTTP API 必须单独可用。
- Phase D 默认不改公开契约，优先让现有契约返回真实可播放曲目。

---

## 4. LLM 与等待体验真源

- LLM 走 OpenAI-compatible chat completions；当前 DeepSeek 已接通。
- `DEEPSEEK_MODEL=deepseek-v4-flash`，`DEEPSEEK_THINKING_TYPE=disabled`，优先低延迟响应。
- LLM 输出必须经过运行时 JSON 解析和字段归一化，不信任模型裸输出。
- 没有 key、超时、HTTP 错误或解析失败时，服务端必须走 fallback，不让移动端断链。
- DJ 等待态使用 `packages/ui/src/RadioTuningLoader.tsx`，基于 `explame/explame.html` 主调频模块 `280×88` 等比缩放。
- 等待期间不显示本地假主播台词，不显示 `thinking`，只显示电台语义的调频加载。

---

## 5. 工作流硬约束

- 中等及以上任务必须先写分段 Spec：现状分析 → 功能点与文件级计划 → 风险与决策。
- 每段都要等待用户确认；完整 Spec 确认后才进入编码 HARD-GATE。
- 现状分析必须有代码出处：文件路径 + 函数名 / 模块名。
- 验证未完成，不得标记完成。
- 用户指出错误后，必要时写入 `tasks/lessons.md`，避免同类问题复发。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。

---

## 6. 历史阶段摘要

| 阶段 | 状态 | 当前仍有效的结论 |
|---|---:|---|
| Iter 0 | 完成 | monorepo、共享 tsconfig、UI/core/api/server/mobile 骨架已建立。 |
| UI 动画架构 | 完成 | 高频视觉走 Reanimated + Skia / Web canvas；避免 JS RAF + React state 热路径。 |
| Phase A | 完成 | 服务端 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/stream` 已打通内存闭环。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS；服务端 playlist 可覆盖本地默认播放列表。 |
| Phase C | 完成 | 服务端 LLM adapter 已接入；DeepSeek 真实路径与无 key fallback 均验证通过。 |
| Phase C+ | 完成 | DJ 气泡等待态已切到调频动画；不再使用本地假等待文案。 |

---

## 7. Phase D：音乐来源接入 Spec

### 7.1 现状分析（已确认）

- `packages/api/src/types.ts` / `Track`：前后端共享曲目契约已经具备播放器需要的字段。移动端只要求有可播放 `url`，因此 Phase D 优先不改公开契约。
- `packages/api/src/types.ts` / `ChatResponse.play`：LLM 输出的是曲名数组，注释写明“歌名由后端解析为直链”。Phase D 的核心应放在服务端解析层，而不是让前端理解 LLM 输出。
- `server/src/state/radioState.ts` / `MOCK_TRACKS`：当前 3 首 SoundHelix 同时承担候选曲、当前曲、队列和 fallback。Phase D 应把它从主路径剥离，只保留为 provider 失败兜底。
- `server/src/state/radioState.ts` / `selectTrackForText`：当前按用户输入字符码取模选 mock 曲，完全不理解歌曲、歌手、语义或 LLM 的 `play` 结果。
- `server/src/state/radioState.ts` / `handleChat`：当前先预选 mock，再让 LLM 围绕 mock 写文案，最后提交的仍是 mock。Phase D 需要让真实候选曲参与 LLM 选择和最终播放状态提交。
- `server/src/routes/apiRoutes.ts` / `/api/chat`：路由已经广播 `chat-token`、`queue-update`、`now-playing`，前端不需要新接口就能收到真实队列和当前曲。
- `apps/mobile/app/_utils/trackMapping.ts` / `mapApiTrackToRadioTrack`：移动端会过滤无 `url` 的 `Track`。服务端不能把只有元数据、没有音频直链的搜索结果下发为当前曲。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：播放器已支持服务端 playlist 覆盖本地默认列表，且通过 URL 播放；Phase D 不先改播放器架构。
- `server/src/env.ts` / `EnvSchema`：当前只有 LLM provider 环境变量，没有音乐 provider 配置。音乐 provider key 必须只放服务端私有环境变量。
- `server/package.json` / `dependencies`：服务端没有音乐 SDK、缓存、数据库或调度依赖。Phase D 第一版优先原生 `fetch` + 小 adapter，不提前堆重依赖。

### 7.2 功能点与文件级计划（待确认）

- `server/src/music/types.ts`：新增服务端内部音乐解析类型，包括 `MusicProvider`、`MusicSearchInput`、`MusicSearchResult`、`ResolvedMusicPlan`。这些类型不进入 `packages/api`，避免过早扩大公开契约。
- `server/src/music/fallbackCatalog.ts`：把当前 `MOCK_TRACKS` 从 `radioState.ts` 移出，命名为 fallback catalog。它只用于 provider 失败、无结果、无可播放 URL 时兜底。
- `server/src/music/providers/providerTypes.ts`：定义 provider 接口，最小能力为 `searchPlayableTracks(input): Promise<Track[]>`。provider 必须只返回有 `url` 的曲目。
- `server/src/music/providers/ncmProvider.ts`：如果选择网易云兼容服务，则实现 HTTP adapter，通过服务端私有 `MUSIC_API_BASE_URL` 调用搜索和取 URL。该实现必须可关闭，不能成为本地开发硬依赖。
- `server/src/music/musicResolver.ts`：新增统一解析入口 `resolveTracksForChat(input)`。输入用户文本、LLM 推荐曲名、数量上限；输出可播放 `Track[]`、fallback 标记和 reason。
- `server/src/state/radioState.ts` / `handleChat`：重排主流程为“先解析候选真实曲目 → 调 LLM 生成主播文案 → 按 LLM 的 `play` 在候选里匹配最终播放队列 → 失败回退 fallback catalog”。状态提交仍保持一次性原子更新。
- `server/src/llm/prompt.ts` / `buildDjPrompt`：候选曲目应来自音乐解析层，而不是 SoundHelix 固定 mock。`play` 继续只允许输出候选 title。
- `server/src/llm/llmAdapter.ts` / `normalizePlayList`：继续把模型返回的 `title / artist / duration` 归一为纯 title，并优先匹配候选真实曲目。
- `server/src/env.ts` 与 `server/.env.example`：新增音乐 provider 相关可选配置，例如 `MUSIC_PROVIDER`、`MUSIC_API_BASE_URL`、`MUSIC_TIMEOUT_MS`。缺失时服务端仍启动，并回退 fallback catalog。
- `server/src/routes/apiRoutes.ts`：保持 `/api/chat`、`/api/now`、`/api/next` 返回结构和 WS 广播类型不变；只消费 `handleChat` 的真实曲目结果。
- `packages/api/src/types.ts`：默认不改契约；最多修正文档注释，不新增字段。
- `apps/mobile/app/_utils/trackMapping.ts` 与 `apps/mobile/app/_hooks/useRadioPlayer.ts`：默认不改；只有真实音源出现跨域、重定向、过期 URL 或 duration 异常时再单独修。

### 7.3 验证计划（待确认）

- 终端命令：`pnpm.cmd typecheck:server`
- 终端命令：`pnpm.cmd typecheck:api`
- 终端命令：`pnpm.cmd typecheck:mobile`
- 终端命令：`pnpm.cmd typecheck`
- HTTP 验证：`POST /api/chat` 在 provider 成功时返回真实曲目相关文案，`GET /api/now` 返回有 `url` 的当前曲，`GET /api/next` 返回有 `url` 的下一曲。
- fallback 验证：不配置音乐 provider 或 provider 返回空时，`/api/chat` 仍返回 SoundHelix fallback，移动端不断链。
- WS 验证：`/stream` 在 chat 后仍广播 `queue-update` 和 `now-playing`。

### 7.4 风险与决策（待写）

- Provider 选择仍需确认。原 Spec 曾提 `NeteaseCloudMusicApi`，但该 GitHub 仓库已在 2024-04-16 归档且只读，README 写明“保护版权，此仓库不再维护”：https://github.com/Binaryify/NeteaseCloudMusicApi
- 下一段需要确认：是否仍走用户本地自建网易云兼容服务、是否选择其他合法音乐源、是否允许只返回 preview/试听源、失败时如何提示用户。
- HARD-GATE：本节功能点与文件级计划确认后，还必须写并确认风险与决策；完整 Phase D Spec 确认前不编码。
