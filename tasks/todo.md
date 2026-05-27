# Claudio · 当前执行看板

> `tasks/spec.md` 是决策真源；`tasks/lessons.md` 是踩坑规则库；本文件只放当前任务、状态和必要验收提醒。

---

## 当前规则

- 中等及以上任务：先写分段 Spec，用户确认后再编码。
- 当前阶段若发现偏差：先更新 Spec，再改代码。
- 完成任务必须给验证证据：类型检查、请求结果、运行日志或可操作验收步骤。
- 阶段验收通过后必须归档完整 Spec 到 `tasks/spec/<phase>.md`，`spec.md` 只保留跨阶段决策、当前阶段和已完成摘要。
- `spec.md` 超过 250 行时检查是否有已完成阶段未归档；`todo.md` 超过 120 行时先压缩已完成任务。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- 所有“运行 / 重启 / 打开 / 点击”步骤必须标明执行载体。
- Claudio 永远是音乐电台：评论区 / 对话输入是点歌和推荐入口，不新增独立搜索框；LLM 主播负责理解意图、策划选曲、讲短背景和过渡。
- 默认音乐源使用已验证的 LX-compatible 链路：huibq 源 raw URL + Kuwo 候选搜索；用户仍可通过 env 配置覆盖源脚本或候选 resolver。

---

## 当前主线

**AI 电台最小闭环**

- [x] Phase A：后端 API 骨架与内存电台状态
- [x] Phase B：移动端接入服务端 API
- [x] Phase C：LLM 主播最小接入
- [x] Phase C+：主播等待体验与电台调频加载动画
- [x] Phase D：音乐来源接入，优先服务端返回真实 `Track`
- [x] Phase D.5：音源与播放性能地基，流式传输 / 缓存 / 预加载
- [x] Phase E：TTS 入声与 `tts-ready` 推送
- [x] Phase G.1：LX-compatible 服务端 Bridge
- [x] Phase G.2-pre：评论区驱动真实音乐闭环
- [x] Phase G.2-default：默认真实音乐源
- [x] Phase H：电台播放控制语义重整
- [x] Phase I：默认 LX 双源池 + FLAC 优先
- [x] Phase J：队列与推荐体验收口
- [ ] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务

---

## 已完成摘要

| 阶段 | 状态 | 摘要 |
|---|---:|---|
| UI 动画架构 | 完成 | 高频动画准入规则已沉淀：Reanimated + Skia / Web canvas。 |
| Phase A-E | 完成 | HTTP / WS、移动端 API、LLM 主播、真实音乐源、TTS talk-over 主链路已打通；详细决策见 `tasks/spec.md` §6。 |
| NativeWind / SDK 56 | 完成 | React / RN / Expo / NativeWind 类型链路和 SDK 56 矩阵已清理并验证通过。 |
| Phase G.1 | 完成 | 服务端 LX-compatible Bridge 接入 provider chain，用户源脚本在 child_process worker 内隔离执行；详见 `tasks/spec.md` §11。 |
| Phase G.2-pre/default | 完成 | `/api/chat` 以评论区为唯一入口，LLM 意图 + Kuwo 候选搜索 + LX Bridge 组成默认真实音乐链路。 |
| 情绪类点歌误判 | 完成 | “想听伤感的歌曲”不再被当成《伤感》精确搜歌，改为情绪 / 类型推荐路径。 |
| explame AI 审查复核 | 完成 | 采纳预加载中断、服务端并发、标题匹配、ducking 高频调用、TTS cache 淘汰等真实问题；忽略不符合个人开源目标的鉴权/CORS建议。 |
| radioState God Object 拆分 | 完成 | 新增 `server/src/radio/intentParser.ts`、`server/src/radio/djCopy.ts`，`radioState.ts` 保留状态与编排，对外 API 不变。 |
| 播放控制回归修复 | 完成 | 恢复播放按钮可用、TTS 暂停/续播和 VOICE OFF 过期 TTS 防护；后续 Phase H 重新梳理完整控制语义。 |
| Phase H | 完成 | 主播放按钮统一为电台总控，VOICE 只管主播自动播报，上一首 / 下一首走服务端 queue currentIndex。 |
| Phase I | 完成 | 默认真实源已改为 `server/assets/lx-sources` 内置双源池，`server/data/lx-sources` 只作本机私有覆盖，FLAC 优先链路已验证。 |
| Phase J | 完成 | 单曲 / 情绪 / 多首请求队列语义、按钮禁用、后台续推、切歌短播报与 track-aware TTS 保护已通过验收。 |
| Phase J.1 | 完成 | `radioState.ts` 第一轮拆分完成，模型、队列、session 续推、切歌播报已拆到独立模块；详见 `tasks/spec/phase-j1-radio-state-orchestration-split.md`。 |
| Phase J.2 | 完成 | `chatTurnPlanner.ts` 抽离完成，`radioState.ts` 只保留状态提交和播放副作用；详见 `tasks/spec/phase-j2-chat-turn-planner.md`。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · Phase J.2（chatTurnPlanner 抽离）

- [x] 现状分析：确认 `handleChatInternal` 中规划段和提交段的清晰边界。
- [x] 功能点方案：新增 `chatTurnPlanner.ts`，使用判别联合 `ChatTurnPlan`，副作用保留在 `radioState.ts` 提交阶段。
- [x] 风险与执行步骤：明确 context 字段、类型依赖、迁移顺序和验证命令。
- [x] HARD-GATE：用户确认完整 Spec 后开始编码。
- [x] 实现：抽出 `server/src/radio/chatTurnPlanner.ts`。
- [x] 实现：瘦身 `server/src/state/radioState.ts` 的 chat planning 逻辑并保持 facade API 不变。
- [x] 验证：typecheck / lint / server build / HTTP smoke。

### Review

- `server/src/state/radioState.ts` 从 477 行降到 360 行，保留状态 facade、chat 串行、超时、提交和播放副作用。
- 新增 `server/src/radio/chatTurnPlanner.ts`，集中处理输入解析、LLM 意图、音乐解析、DJ 文案、队列构造和 `RadioSessionIntent`。
- `radioState.ts` 已不再直接 import `llmAdapter`、`musicResolver`、`intentParser`、`djCopy`。
- 验证通过：`pnpm typecheck:server`、`pnpm lint`、`pnpm --filter server build`。
- HTTP structural smoke 通过：每次 `/api/chat` 后 `/api/now` 状态与 `play` 分支一致；强制 `MUSIC_PROVIDER_CHAIN=fallback` 时无曲目分支返回 `play=[]`、`track=null`、`state=idle`。

---

## 当前任务 · Phase J.3（自动化测试入口）

- [x] 现状分析：确认当前只有 typecheck/lint/smoke，没有统一 test/test:full。
- [x] 功能点方案：两层命令，server 使用 Vitest，首批覆盖 playbackQueue、intentParser、cache、titleMatch。
- [x] 风险与执行步骤：明确不强行 export 内部函数、安装 Vitest 会改 lockfile、验证命令。
- [x] HARD-GATE：用户确认完整 Spec 后开始编码。
- [x] 实现：安装 Vitest 并新增 `server/vitest.config.ts`。
- [x] 实现：新增根 `test/test:full` 与 server `test` 脚本。
- [x] 实现：新增首批四个单元测试文件。
- [x] 更新：同步 `tasks/testing.md` 测试分层说明。
- [x] 验证：`pnpm test` / `pnpm test:full` / `pnpm lint`。

### Review

- 新增 Vitest 测试入口：根 `pnpm test` 跑 typecheck + server 单元测试，根 `pnpm test:full` 追加 `smoke:radio`。
- 新增 `server/vitest.config.ts` 和 4 个测试文件，共 15 个单元测试。
- 测试覆盖 `playbackQueue`、`intentParser`、`cache`、`titleMatch` 的关键纯函数和回归点。
- 单元测试发现并修复真实 bug：`我想听周杰伦的晴天` 曾被裸 `X的Y` 规则误解析成 artist=`我想听周杰伦`；现在先匹配带前缀点歌，再匹配裸 `周杰伦的晴天`。
- 验证通过：`pnpm test`、`pnpm test:full`、`pnpm lint`。

---

## 当前任务 · 小米 TTS 默认与审查修复

- [x] 定位 Edge TTS 残留、`requestKind` 接线和 TTS cache 维度问题。
- [x] 删除 Edge TTS provider 与依赖，默认只启用小米 MiMo。
- [x] 修复 `requestKind` 未传入 `generateDjResponse`。
- [x] 修复 TTS cache 未区分实际 provider / voice。
- [x] 跑 `pnpm test:full` 并再次用 `code-review` skill 审查。

### Review

- 当前 Edge 残留：`server/src/tts/providerRegistry.ts` 默认链包含 `edge`，`server/package.json` 依赖 `msedge-tts`，`server/src/tts/providers/edgeProvider.ts` 仍在仓库内。
- 修复：`providerRegistry` 默认链改为 `['mimo']`，支持 key 只保留 `mimo/doubao`；删除 `edgeProvider.ts` 与 `msedge-tts` 依赖，lockfile 同步移除相关包。
- 修复：`chatTurnPlanner` 将 `requestKind` 传入 `generateDjResponse`，`llmAdapter/prompt` 类型改用现有 `MusicRequestKind`。
- 修复：TTS cache key 增加 `providerId` 与实际 `result.voice` 维度，并新增 `server/src/tts/ttsService.test.ts` 覆盖 provider/voice/speed 区分。
- 验证通过：`pnpm test:full`，5 个 server 测试文件 / 17 个测试通过，radio smoke 通过。
