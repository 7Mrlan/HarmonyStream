# Phase radioState God Object 拆分归档

> 本阶段已完成并通过验证；当前仍有效结论已压缩回 `tasks/spec.md`。

## 现状分析

- `server/src/state/radioState.ts` 同时承担内存状态、API facade、聊天编排、点歌 / 类型意图解析、DJ fallback 文案、队列构建、预热和 TTS 调度触发。
- `handleChat()` / `handleChatInternal()` 是复杂度集中点；路由层只依赖 `radioState.ts` 的公开导出，适合保持 facade 不变、内部拆纯函数。
- 新增情绪推荐逻辑后，`radioState.ts` 继续膨胀，说明该问题会随功能增长加重，越早拆分越便宜。

## 功能点与文件计划

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

## 风险与决策

- 决策：本次只做纯函数迁移和参数化，不改产品语义、不改 HTTP API、不改 LLM / 音乐 provider 行为。
- 决策：不引入 class、DI 容器或持久化状态；`radioState.ts` 仍是路由层唯一入口。
- 决策：`buildQueue()`、`chooseTrackFromPlay()` 暂留 `radioState.ts`，因为它们直接服务于状态提交；后续如要补单元测试，再考虑抽成 `queuePlan.ts`。
- 风险：搬移函数时容易漏 export 或 import；用 `pnpm typecheck:server` 作为第一道验证。
- 风险：`buildFallbackChatResponse()` 参数顺序变更可能造成文案 fallback reason 丢失；执行时只在 `handleChatInternal()` 一处改调用，并保留原 reason 组合。
- 风险：文件移动后 tsx watch 会热重载后端；若正在使用前端联调，浏览器可能需要硬刷新或重发请求，但不涉及 Metro 缓存陷阱，因为本次只改服务端。

## 执行步骤

1. 新建 `server/src/radio/intentParser.ts`，从 `radioState.ts` 迁移意图解析相关类型、常量和函数。
2. 新建 `server/src/radio/djCopy.ts`，迁移 DJ 文案相关函数，并把 `buildMockDjScript()` 参数化为 `modelDisplayName`。
3. 更新 `server/src/state/radioState.ts` imports 和调用点，删除已迁移的本地函数。
4. 全量静态验证：`pnpm typecheck`、`pnpm lint`。
5. 主链路烟测：`/health`、`/api/chat`、`/api/now`、明确点歌“我想听周杰伦的晴天”。

## 结果摘要

- 新增 `server/src/radio/intentParser.ts` 与 `server/src/radio/djCopy.ts`。
- `server/src/state/radioState.ts` 保留状态与编排，对外 API 不变。
- 验证通过：`pnpm typecheck`、`pnpm lint`、`/api/chat` 与 `/api/now` 主链路烟测。
