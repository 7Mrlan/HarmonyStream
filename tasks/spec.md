# Claudio · 项目决策真源（Spec）

> 本文件只保留当前仍会影响实现的决策真源。
> 历史踩坑和纠正规则放在 `tasks/lessons.md`；当前执行进度放在 `tasks/todo.md`。
> 任何代码与本文件冲突，错的是代码；发现偏差先更新 Spec，再改代码。

---

## 当前活跃索引

- 当前主线：AI 电台已完成 Phase N 真实音频律动；本轮 Phase M / Phase Pet / Phase N 均已落地，Phase K 歌曲像素海报暂缓。
- 已完成：Phase A 后端 API 骨架；Phase B 移动端接入；Phase C LLM 主播；Phase C+ 等待体验；Phase D 音乐来源；Phase D.5 性能地基；Phase E TTS 入声；Phase F.0 SDK 56 依赖升级；Phase F.A 音频会话/后台权限；Phase F.B WS 心跳/重连；Phase F.C 锁屏 metadata 代码接线；Phase F.D APK 构建入口；Phase F.E 服务端 graceful shutdown；Phase J 队列与推荐体验收口；Phase J.1 radioState 编排拆分；Phase J.2 chatTurnPlanner 抽离；Phase J.3 自动化测试入口；Phase L.0 个人音乐记忆与 Context Engine。
- 当前阶段：本轮路线已收束；下一阶段若进入 Phase K、Native PCM / FFT、公开 API 扩展或长期自动记忆汇总，仍需重新写当前现状与文件级计划。
- 当前 HARD-GATE：任何“看起来有生命但没有真实状态来源”的功能不得进入主线；模拟 / fallback 必须在内部来源上明确标记。
- 当前边界：BYO-LLM 用户自配 key/baseUrl/model 单独作为 Phase F.5，不混入 Phase F 锁屏 / APK 验收。

## 0. 产品一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂用户输入，用 DJ 口吻推荐音乐，并把可播放曲目推给移动端播放器。

- 产品入口是电台评论区 / 对话输入，不新增独立音乐搜索框；用户点歌、描述心情、要求换风格都从同一个电台语义入口进入。
- Claudio 的核心差异不是“能播歌”或“回复很短”，而是能基于用户长期歌单、人生阶段、场景、心情、时间与播放历史做私人 DJ 决策。
- LLM 主播负责意图理解、选曲策划、DJ 文案、歌曲背景 / 趣闻过渡；不负责直接抓取音频 URL、执行第三方源脚本或保存密钥。
- 音乐解析仍由 provider chain 负责：LLM 输出候选曲名或偏好，服务端 resolver / LX Bridge 再把候选解析为可播放 `Track`。
- DJ 内容长度不以“短 / 长”本身为目标：缺少个人上下文时禁止用空泛长文硬撑；有真实用户资料、歌曲事实和场景依据时，可以输出更完整的电台式过渡。
- 背景 / 趣闻必须可信；不确定时用氛围化描述或明确弱化，不编造具体年份、奖项、制作人或用户回忆等硬事实。

### 0.1 产品路线纠偏：个人音乐记忆优先

- 2026-05-27 复盘结论：当前实现已具备真实音源、播放队列、TTS talk-over、后台播放等基础设施，但缺少施工图第一层 `taste.md / routines.md / playlists.json / mood-rules.md` 和第三层 Context Window，导致 LLM 主播像通用音乐推荐器。
- LX-compatible 音源是必要地基，不是产品灵魂；下一步不能继续把精力放在视觉、海报、宠物、短 prompt 或播放器表层，而要先建立用户音乐资料层。
- “开心 / 深夜 / 学习 / 怀旧”等输入不应直接映射公共硬编码歌单；必须先检索用户个人歌库、长期偏好、最近播放和当前场景，再决定候选歌曲。
- 主播文案质量的根因不是 prompt 文风，而是上下文供给。Prompt 只能表达规则，不能替代用户音乐数据、环境注入和状态记忆。
- Phase L.0 完成前，不再把“更短回复”“更文艺文案”“单次情绪歌单”作为主线优化目标。

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

### 2.1 角色 / 宠物动画准入规则

- 当前旧宠物体系已废弃：`PixelPetSwitcher` 代表的“右下角贴图按钮 + 容器漂浮摆动”不是合格宠物方案，后续不得复用该方向。
- 宠物若重新进入产品，必须是“有角色生命感的系统伴侣”，不是模型切换图标、装饰贴图或浮动徽章。
- 禁止把外层容器 `translateY`、`rotate`、`scale` 单独称为宠物动画；这些只能算运动包装，不能替代角色本体动画。
- 每个宠物动作必须有角色本体变化：眼睛、嘴、头、身体、手脚、姿态、帧图或分层部件至少一项发生可观察变化。
- 第一版 prototype 也不能使用简陋无人格角色；角色必须有明确人格、轮廓、表情语言和与 Claudio 电台气质一致的视觉方向。
- 最低状态集：`idle`、`look`、`listen`、`speak`、`sleep`、`drag`。六类状态必须肉眼一眼可区分，不能只靠位置偏移区分。
- 行为必须有情境：播放音乐时听歌 / 点头，TTS 主播说话时张嘴或表情变化，用户长时间不操作时睡觉，被拖拽时有被拎起或挣扎反馈。
- 宠物默认不得遮挡正文、输入框、播放控制或封面主视觉；必须具备贴边、半隐藏、避让输入区、收起或关闭策略。
- 新宠物正式集成前必须先做可删除 prototype；prototype 不达标就删除，不进入主界面，不以“先占位后打磨”为理由合并。
- 新宠物方案必须先通过方案审查再进入实现 HARD-GATE；若本地存在 `spec-review` skill 则使用该 skill，否则使用本节与 Phase Pet 自审清单等价审查。审查重点是角色生命感、动作资产、状态机、性能、遮挡与验收标准。

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
- 主推荐 prompt 必须吃到检索后的个人上下文：用户资料、相关歌单候选、场景规则、最近播放历史和必要环境信息；没有这些上下文时，不能假装已经了解用户。
- 主推荐和切歌播报必须隔离上下文：普通推荐默认只围绕本轮用户输入和本轮预选曲目；只有用户明确说“接着上一首 / 类似这首 / 换个同风格”时，主推荐才允许引用当前曲目。
- 切歌短播报才允许讨论“从上一首到下一首”的关系；它必须短、异步、可过期丢弃，不能污染下一次普通推荐。
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
- 服务端是歌曲队列权威：真实切歌走 `POST /api/playback/next` / `POST /api/playback/previous`，`/api/next` 只保留预览 / 预热语义。
- 当前播放队列 v1 只维护本轮 chat queue 的 `currentIndex`；`previous` 不跨 chat 轮次，`next` 耗尽不自动补歌、不触发 LLM。
- 播放移动失败响应必须保留未改变的 `currentTrack`；只有本身无当前曲时才返回 `track: null`，避免客户端丢失曲目信息。
- env helper 量纲分离：HTTP 超时类用 `positiveIntegerWithDefault`；缓存 TTL / 计数类用 `positiveIntegerWithMax(default, max)`。
- 真实音乐源失败不能影响 LLM 主播和播放闭环：搜索、取 URL、超时、非 2xx 时统一回退 SoundHelix fallback。
- 默认音乐源策略：系统默认启用已验证的 LX-compatible 真实音乐链路（huibq 源 raw URL + Kuwo 候选搜索），失败时仍回退 SoundHelix；用户可通过 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_ENABLE_KUWO_SEARCH` 覆盖或关闭默认行为。
- Phase G 音乐源入口参考 LX Mobile 的用户源协议，但不直接把移动端 QuickJS 原生模块搬进 Expo；Claudio 采用服务端 LX-compatible Bridge，把用户源脚本转换为现有 provider chain 中的可播放 `Track`。

---

## 6. TTS 真源

- TTS 永远 fire-and-forget：HTTP 立返、WS 后推 `tts-ready`；任何同步等待 TTS 都违反主链路非阻塞约束。
- TTS 与音乐播放器物理隔离：`useTtsPlayer` 独立 expo-audio 实例，不复用 `useRadioPlayer`。
- TTS 期间走 `radio.setVolume(0.24)` ducking，结束后恢复 `1`；不暂停主音乐，不改变音乐音调。
- 主播放按钮永远是电台总控：暂停 / 继续歌曲和主播，不因 `tts.ready`、`didJustFinish` 或 VOICE 状态隐式改变控制对象。
- VOICE ON/OFF 只决定后续主播是否自动播报；VOICE OFF 不停止歌曲，迟到 `tts-ready` 只缓存不自动播放。
- 失败完全静默：TTS 链路失败不发错误事件、不显示 UI 错误，DJ 文案仍可见；服务端打 `[tts]` 日志即可。
- 公开契约不再扩展：`ChatRequest.voice?` 与 `StreamEvent 'tts-ready'` 已足够；后续接新 provider 不新增字段。
- React Hooks 死循环防御：跨渲染状态变化的对象禁止直接进 `useEffect/useCallback` 依赖；用 `useRef` 锁住。

---

## 7. 工作流硬约束

- 中等及以上任务必须先写分段 Spec：现状分析 → 功能点与文件级计划 → 风险与决策。
- 默认每段都要等待用户确认；但 2026-05-28 用户已对 Phase L.0 授权连续执行，本阶段不再阻塞等待确认。
- 现状分析必须有代码出处：文件路径 + 函数名 / 模块名。
- 验证未完成，不得标记完成。
- 用户指出错误后，必要时写入 `tasks/lessons.md`，避免同类问题复发。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- `tasks/spec.md` 以阶段完成为归档触发器；阶段验收通过后，将完整阶段 Spec 存入 `tasks/spec/<phase-name>.md`。
- `tasks/spec.md` 只保留跨阶段有效决策、当前阶段完整内容、已完成阶段 3-5 行摘要；超过 250 行时只检查是否有已完成阶段未归档。
- `tasks/todo.md` 软上限 120 行；阶段 Review 完成并进入下一阶段时压缩历史摘要。

---

## 8. 历史阶段摘要

| 阶段        | 状态 | 当前仍有效的结论                                                                                                                                               |
| ----------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iter 0      | 完成 | monorepo、共享 tsconfig、UI/core/api/server/mobile 骨架已建立。                                                                                                |
| UI 动画架构 | 完成 | 高频视觉走 Reanimated + Skia / Web canvas；避免 JS RAF + React state 热路径。                                                                                  |
| Phase A     | 完成 | 服务端 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/stream` 已打通内存闭环。                                                                         |
| Phase B     | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS；服务端 playlist 可覆盖本地默认播放列表。                                                                       |
| Phase C     | 完成 | 服务端 LLM adapter 已接入；DeepSeek 真实路径与无 key fallback 均验证通过。                                                                                     |
| Phase C+    | 完成 | DJ 气泡等待态已切到调频动画；不再使用本地假等待文案。                                                                                                          |
| Phase D     | 完成 | 服务端 `musicResolver` + fallback catalog + 可选 `ncm` provider；移动端 artwork 链路打通。                                                                     |
| Phase D.5   | 完成 | provider chain、TTL/LRU cache、Range route、客户端 60% 预热、metrics 已落地。                                                                                  |
| Phase E     | 完成 | `msedge-tts` 接入；`tts-ready`、`/media/tts/:id`、独立 `useTtsPlayer`、DJBubble REPLAY 已落地。                                                                |
| Phase H     | 完成 | 电台总控 / 歌曲队列 / 主播语音三层语义落地；完整历史见 `tasks/spec/phase-h-radio-playback-controls.md`。                                                       |
| Phase J     | 完成 | 队列数量、上一首 / 下一首禁用、后台续推、切歌短播报与 track-aware TTS 过期保护已落地；完整历史见 `tasks/spec/phase-j-queue-recommendation-experience.md`。     |
| Phase J.1   | 完成 | `radioState.ts` 保留 facade，模型、队列纯函数、session 续推、切歌播报拆入独立模块；完整历史见 `tasks/spec/phase-j1-radio-state-orchestration-split.md`。       |
| Phase J.2   | 完成 | chat planning 抽入 `chatTurnPlanner.ts`，`radioState.ts` 只保留状态提交与副作用；完整历史见 `tasks/spec/phase-j2-chat-turn-planner.md`。                       |
| Phase J.3   | 完成 | 新增 Vitest 单元测试与根 `test/test:full` 两层入口，修复明确点歌解析顺序 bug；完整历史见 `tasks/spec/phase-j3-automated-test-entry.md`。                       |
| Phase F     | 完成 | SDK 56 后台播放、锁屏 metadata、APK 构建入口、WS 重连与 graceful shutdown 已落地；完整历史见 `tasks/spec/phase-f-productization.md`。                          |
| Phase F.0   | 完成 | Expo SDK 56 / React 19.2.6 / RN 0.85.3 / TypeScript 6.0.3 升级完成；NativeWind 类型 shim 和临时 override 已清理。                                              |
| Phase L.0   | 完成 | 服务端个人资料层、个人候选检索、Context Assembler、DJ prompt 上下文、MiMo 动态 style TTS 已落地；完整历史见 `tasks/spec/phase-l0-personal-context-engine.md`。 |
| Phase L.1   | 完成 | Resident DJ 服务端闭环已落地：简单歌单、隐式学习文件读取、curated candidates、深聊边播和 Critic；完整历史见 `tasks/spec/phase-l1-resident-dj-agent.md`。       |
| Phase L.2   | 完成 | L.1 测试夹具已整理，Resident DJ 异步 orchestrator 与多 seed 有限并发解析已落地；完整历史见 `tasks/spec/phase-l2-resident-dj-parallel-agents.md`。              |
| Phase L.3   | 完成 | 移动端本地 Life State Bus、频谱 mode、OnAir/NowPlaying/DJBubble 映射和移动端 Vitest 已落地；完整历史见 `tasks/spec/phase-l3-claudio-life-state-bus.md`。        |
| Phase L.4   | 完成 | 本地个人记忆写入闭环已落地：listening event API、移动端收藏/切歌/反馈上报、来源防护和保守 feedback 识别；完整历史见 `tasks/spec/phase-l4-personal-memory-loop.md`。 |
| Phase L.5   | 完成 | 会话 Presence Engine 已落地：服务端连续状态、Resident DJ 轻量曲线偏置、切歌反馈和移动端 visual tone；完整历史见 `tasks/spec/phase-l5-claudio-presence-engine.md`。 |
| Phase M     | 完成 | 用户音源导入 UI 已落地：App SOURCE 面板、服务端验证 / 启用 / 回滚 API、LX worker 验证和 provider cache reset；完整历史见 `tasks/spec/phase-m-user-music-source-import-ui.md`。 |
| Phase Pet   | 完成 | 灵动系统伴侣 prototype 已落地：Life / Presence 状态机、可拖拽 / 收起 / 关闭、角色本体部件变化；完整历史见 `tasks/spec/phase-pet-companion-prototype.md`。 |
| Phase N     | 完成 | 真实音频律动已落地：Web Audio analyser 优先，Native / 能力不足时使用明确标记的 playback envelope fallback；完整历史见 `tasks/spec/phase-n-real-audio-breath.md`。 |

---

## 9. Phase F：后台播放 / 锁屏 / APK（已归档）

- Phase F 已完成，完整历史设计归档到 `tasks/spec/phase-f-productization.md`。
- 仍活跃决策：锁屏 metadata 不扩公开契约，只从现有 `Track.title / artist / artwork` 拼装。
- 仍活跃决策：移动端音乐播放器与 TTS 播放器保持物理隔离；TTS 只通过音量 ducking 影响主音乐。
- 仍活跃决策：BYO-LLM 用户自配 key/baseUrl/model 是独立未来阶段 Phase F.5，不并入已完成的后台播放 / APK 产品化任务。

---

## 10. Phase G：LX-compatible 音乐源 Bridge

- 完整历史设计已拆到 `tasks/spec/phase-g-lx-bridge.md`。
- 仍活跃决策：默认真实音乐源链路为 huibq 源 raw URL + Kuwo 候选搜索 + LX Bridge；用户可通过 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_ENABLE_KUWO_SEARCH` 覆盖或关闭。
- 仍活跃决策：LX 用户源脚本必须在服务端隔离 worker 中执行，禁止在 Fastify 主进程直接 evaluate。
- 仍活跃决策：用户源主要负责 `musicUrl` 解析；候选搜索层独立，第一版不复制 LX Mobile `musicSdk`。
- 仍活跃决策：音乐源 UI 入口属于后续设置页“音乐源”，播放器主界面不展示 provider 诊断条。

---

## 11. radioState God Object 拆分

- 完整历史设计已拆到 `tasks/spec/phase-radio-state-split.md`。
- 仍活跃决策：`server/src/radio/intentParser.ts` 负责输入意图解析纯逻辑。
- 仍活跃决策：`server/src/radio/djCopy.ts` 负责 DJ fallback / 快速文案模板。
- 仍活跃决策：`server/src/state/radioState.ts` 继续作为路由层 facade，保留状态与编排，对外 API 不变。

---

## 12. Phase H：电台播放控制语义重整

- 完整历史设计已拆到 `tasks/spec/phase-h-radio-playback-controls.md`。
- 仍活跃决策：主播放按钮永远是电台总控；歌曲和主播一起暂停 / 继续，不再根据 TTS ready 或 VOICE 状态切换控制对象。
- 仍活跃决策：VOICE 只控制主播自动播报；REPLAY 是 DJ 气泡附近的局部语音控制，歌曲按 talk-over ducking。
- 仍活跃决策：真实切歌走 `POST /api/playback/next|previous`，服务端 currentIndex 是当前 queue 权威；失败响应保留当前 track。

---

## 13. Phase I：默认 LX 双源池 + FLAC 优先

- 完整历史设计已拆到 `tasks/spec/phase-i-lx-dual-source-pool.md`。
- 仍活跃决策：默认真实音乐链路为 `lx-primary -> lx-secondary -> fallback`，默认音质顺序为 `flac,320k,128k`。
- 仍活跃决策：默认真实源文件随仓库提交，位置为 `server/assets/lx-sources/primary.js` 与 `server/assets/lx-sources/secondary.js`，保证开源用户拉取代码后只配置 LLM/TTS key 即可闭环测试。
- 仍活跃决策：`server/data/lx-sources/*` 作为本机私有覆盖层保留，不提交 GitHub；存在私有覆盖文件时优先于 `server/assets` 内置默认源。
- 仍活跃决策：`LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` 显式配置时视为用户单源覆盖，provider id 保持 `lx`。
- 仍活跃决策：`MUSIC_PROVIDER_CHAIN=lx` 的兼容展开只允许在 `server/src/music/providerRegistry.ts` / `parseChainConfig` 内完成，避免散落逻辑。
- 仍活跃决策：服务端 ESM 代码的相对 import 必须带 `.js` 扩展，保证 `node dist/index.js` 可直接运行。

---

## 14. 产品迭代路线图

> 本章节只保存跨阶段主线，避免长周期目标被单次性能优化或 bugfix 打散。
> 当前阶段完整 Spec 仍写在本文件的当前阶段区；完成后归档到 `tasks/spec/<phase>.md`。

### 14.1 主线顺序

1. Phase L.0：个人音乐记忆与 Context Engine。
   - 建立 `taste.md / routines.md / playlists.json / mood-rules.md` 或等价资料层；支持导入结构化歌单 JSON，检索个人候选曲，组装用户输入、时间、播放历史、场景和候选歌曲后再调用 LLM。
   - 导入歌单只作为口味种子和个人记忆来源，提取偏好并推荐相似但不固定的歌曲；不能把导入歌单变成固定播放列表。
   - 完成条件：`/api/chat` 的推荐先经过个人资料检索；DJ 文案能引用真实资料或明确只讲听感；测试覆盖“开心 / 深夜 / 怀旧 / 明确点歌”四类路径。
2. Phase M：用户音源导入 UI。
   - 已完成：App SOURCE 面板可导入、验证、启用和回滚 LX-compatible 用户源；服务端复用 LX child_process worker，状态文件写入 ignored 的 `server/data/lx-sources/user`。
3. Phase Pet：Claudio 灵动系统伴侣 prototype。
   - 已完成：宠物消费 Life / Presence 状态，支持拖拽、收起和关闭，角色眼睛 / 嘴 / 天线 / 手臂 / 信号柱按状态变化。
4. Phase N：真实音频律动。
   - 已完成：Web 端优先复用现有 audio element 接 Web Audio analyser；Native / Web 能力不足时使用明确标记的 playback envelope fallback，不宣称真实 PCM / FFT。
5. Phase K：歌曲像素海报。
   - 暂时移出本轮执行；当前已有 `Track.artwork -> TrackArtworkPanel -> PixelClock fallback` 链路，后续再补真正轻量像素海报生成 / 缓存策略。

### 14.2 插队规则

- P0 bug、安全问题、真机播放稳定性、明显性能回归可以插入为当前 Phase 的子阶段，例如 `Phase J.1`。
- 插队阶段必须写清楚“插队原因、完成条件、回到哪条主线”，完成后回到本路线图的下一项。
- 视觉增强不得抢在个人音乐记忆之前；音源 UI 不得绕过 LX worker 沙箱；prompt 文风调整不得替代 Context Engine。

---

## 15. Phase Pet：Claudio 灵动系统伴侣（⏸ 暂停 · 无限期待重启）

> **当前状态：用户设计角色资产中，编码未启动。重启条件：用户完成 Rive 角色动画资产（.riv 文件），通知恢复本 Phase。**

### 15.1 最终技术决策

经过多轮评估与讨论（Skia 程序化 vs Rive 状态机），最终选定 **Rive 路线**：

- **D1（主路线）**：Rive state machine runtime。角色动画在 Rive Editor 中制作（骨骼绑定 + 关键帧 + 状态机），导出 `.riv` 文件，React Native 侧通过 `@rive-app/react-native`（v2 / Nitro）或 `rive-react-native`（v1）加载并控制。
- **D2（为什么不选 Skia 程序化）**：纯代码驱动的部件运动（sin 波浮动、缩放、旋转）只能产生「微动」，无法做出真正的角色动作（转身、弯腰、跳跃、被拖拽时的自然重心变化）。QQ 宠物级的生命感来自动画师调的关键帧，不是数学公式。
- **D3（状态机分离）**：`petBrain.ts` 处理业务事件→目标状态（idle/listen/speak/sleep/drag）；Rive state machine 负责状态→动画表现。两层状态机通过 Rive inputs 通信。
- **D4（角色不做硬性规定）**：角色设计由用户自行决定，在 Rive Editor 中完成。Spec 不限制角色形象、风格、色板或部件数量。
- **D5（运行时依赖）**：`@rive-app/react-native`（v2）需 `react-native-nitro-modules >= 0.35.0`，支持 RN 0.78+ / Expo SDK 53+。本项目已满足版本要求。**不支持 Expo Go**，必须使用 dev build（项目已在使用）。

### 15.2 资产工作流（用户侧）

1. 在 Rive Editor（editor.rive.app 或桌面客户端）中绘制角色分层部件
2. 绑定骨骼，制作关键帧动画（每个状态至少一个动画）
3. 在 Rive 中配置 StateMachine，连线状态转换
4. 导出 `.riv` 文件，放入 `apps/mobile/assets/rive/`
5. 通知恢复 Phase Pet

### 15.3 重启后的文件级计划

- `packages/ui/src/pet/petTypes.ts`：`PetState`、`PetEvent` 纯类型定义
- `packages/ui/src/pet/petBrain.ts`：纯状态机，电台事件→目标状态，不碰 UI
- `packages/ui/src/PetCompanion.tsx`：Rive 组件加载 + 手势（拖拽）+ 避让 + 收起
- `packages/ui/src/index.ts`：达到准入标准后导出 `PetCompanion`
- `apps/mobile/app/index.tsx`：可关闭 / 可回滚的 prototype 开关挂载

### 15.4 最低状态集

`idle` | `look` | `listen` | `speak` | `sleep` | `drag`。六状态必须肉眼一眼可区分。

- 情境映射：音乐播放→`listen`；TTS 播报→`speak`；用户交互→`look`；空闲超时→`sleep`；拖拽中→`drag`
- 遮挡策略：默认贴边，避让输入框/播放控制/封面；拖拽释放吸附安全边；有收起入口

### 15.5 回滚条件

六状态不可分、拖拽生硬、遮挡核心控件、性能影响主流程，任一命中即删除 prototype。

### 15.6 历史摘要

- 评估了 Skia sprite atlas / 分层部件 rig / Rive / Lottie / WebView(Ruffle) 五类路线
- Skia 程序化 prototype 已实现并验证 typecheck/lint/test 可通过，但因「只有微动没有真动作」被判定为废案，代码已删除
- 用户确认走 Rive 路线，自行在 Rive Editor 中制作角色动画
- 参考：`qqpet_automation`（Electron + Flash/WASM）——仅作生命感参考，不移植

### 15.7 当前实现状态

- Phase Pet Skia prototype 代码已存在于 `packages/ui/src/PetCompanion.tsx` 与 `packages/ui/src/pet/*`，`apps/mobile/app/index.tsx` 已接入主界面（来自 lwx 分支）。
- 当前宠物状态来自 Life / Presence / 播放 / 语音 / 调频状态，支持拖拽、收起和关闭。
- 后续迁移到 Rive 时，需替换 `PetCompanion.tsx` 的渲染层为 Rive 组件，保留 `petBrain.ts` 状态机逻辑和避让/手势交互。
- Phase N 已补真实 Web Audio analyser 和明确 playback envelope fallback；后续不得把 Native fallback 描述为真实 PCM / FFT。

---

## 16. Phase L.0：个人音乐记忆与 Context Engine（已归档）

- 已完成：服务端个人资料读取、个人候选检索、Context Assembler、个人候选 resolver seeds、DJ prompt 上下文和 MiMo 动态 style TTS。
- 关键决策仍有效：个人资料放 ignored 的 `server/data/user-profile`；个人歌单只作候选证据，不绕过 provider chain；MiMo 情绪不扩公开 API。
- 验收证据：`pnpm test:full` 通过；结构烟测显示 `想听开心的歌 -> 稻香`、`给我推荐几首伤心的歌 -> 突然好想你`。
- 完整归档：`tasks/spec/phase-l0-personal-context-engine.md`。

---

## 17. Phase L.1：Resident DJ Agent（已归档）

- 已完成：简单歌单导入、`qq_songs.json` 纯数组导入、隐式学习文件读取、Resident DJ 内部智能体纯函数、curated candidates resolver 主路径、深聊边播 prompt、Critic 文案审查。
- 关键决策仍有效：`PersonalContext.preferredTitles` 只作兼容 evidence；非明确点歌主路径必须先产出 `DjTurnPlan` 和 `CuratedCandidate[]`，再交给 provider chain 解析。
- 验收证据：`pnpm test` 通过；`pnpm test:full` 通过；server 10 个测试文件 / 40 个测试通过，结构烟测和强制无曲目分支通过。
- 完整归档：`tasks/spec/phase-l1-resident-dj-agent.md`。

---

## 18. Phase L.2：测试整理 + Resident DJ 并行多智能体升级（已归档）

- 已完成：L.1 保护性测试保留，重复测试夹具收敛到 `server/src/test/factories.ts`。
- 已完成：Resident DJ 新增异步 orchestrator，辅助 agent 并行运行，失败时记录内部 diagnostics 并降级。
- 已完成：多 seed 音乐解析默认并发 2，单 seed 内 provider chain 顺序不变，并增加去重提交纯函数。
- 验收证据：`pnpm test` 通过；`pnpm test:full` 通过；server 11 个测试文件 / 43 个测试通过。
- 完整归档：`tasks/spec/phase-l2-resident-dj-parallel-agents.md`。

---

## 19. Phase L.3：Claudio Life State Bus（已归档）

- 已完成：移动端本地 `deriveClaudioLifeState()`，统一 `offline / connecting / tuning / speaking / listening / sleeping / breathing` 展示态。
- 已完成：`HomeScreen` 作为唯一聚合点，把生命状态映射成 OnAir、NowPlaying、DJBubble、MusicSpectrum 的 primitive props。
- 已完成：`MusicSpectrum` 新增展示强度 `mode`，Native Skia 与 Web canvas 共用同一套 mode 强度语义，并保留 `active` 兼容旧调用。
- 验收证据：`pnpm test` 通过；全仓 typecheck、移动端 1 个测试文件 / 7 个测试、server 11 个测试文件 / 43 个测试通过。
- 完整归档：`tasks/spec/phase-l3-claudio-life-state-bus.md`。
