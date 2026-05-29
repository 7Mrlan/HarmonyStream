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

## 15. Phase Pet：Claudio 灵动系统伴侣

> 目标不是 1:1 复刻 QQ 宠物；QQ 宠物只作为“角色生命感、情境动作和可玩性”的参考。Claudio 的宠物必须是属于电台产品自己的灵动系统伴侣。

### 15.1 插队原因与目标

- 插队原因：用户明确要求先删除旧宠物方向后，重新评估能否做出有生命感、可互动、不会沦为贴图摆动的灵动系统伴侣。
- 产品目标：宠物不是 DeepSeek / 模型标识，不是右下角贴图，也不是容器漂浮动画；它必须是一个有性格、有情境反应、能与电台状态互动的 Claudio 角色。
- 技术目标：先证明动作资产、状态机、渲染性能、拖拽交互、遮挡避让和失败退出都可控，再决定是否进入 prototype。

### 15.2 参考实现事实

- 本地 clone 状态：`git clone --depth 1 git@github.com:xuemian168/qqpet_automation.git .cache/reference/qqpet_automation` 失败，原因是 `Permission denied (publickey)`；HTTPS clone 也因无法连接 `github.com:443` 失败。当前参考证据来自 GitHub 源码页面，而不是本地工作区文件。
- 参考仓库：`https://github.com/xuemian168/qqpet_automation`。仓库 README 将其描述为 QQ 宠物现代桌面移植，技术栈是 Electron + Ruffle + Flash/WASM，能力重点是桌面宠物显示、拖拽、右键菜单、托盘和离线本地运行。
- 参考代码：`qq-pet-macos/main.js` 属于 Electron 主进程入口，职责是桌面窗口 / 托盘 / IPC 这类宿主能力；`qq-pet-macos/src/windows/app.html` 与 `qq-pet-macos/src/windows/main/index.js` 属于渲染窗口入口，围绕 Ruffle / Flash 资产运行原宠物表现。
- 结论：该仓库证明这类宠物的高级感主要来自“动作资产 / 部件动画 + 状态/事件驱动 + 宿主交互”，不是来自普通 React 组件动画。它不能直接移植成 Expo React Native 宠物组件，但可以作为动作密度、状态反馈和拖拽反馈的参考；Claudio 不需要复制它的桌面宿主形态。

### 15.3 当前 Claudio 代码现状

- 旧宠物代码已不存在：全仓搜索 `PixelPetSwitcher|petSprite|DEFAULT_PETS|onActionFeedback` 只命中 Spec / todo / 归档历史，`packages/ui/src/index.ts` 当前没有导出宠物组件。
- 主界面当前只有电台核心 UI：`apps/mobile/app/index.tsx` / `HomeScreen` 在 `TopBar` 之后渲染时钟、On Air、日期、DJ 气泡、频谱和播放区；`TopBar` 位于 `apps/mobile/app/index.tsx:473`，`MusicSpectrum` 位于 `apps/mobile/app/index.tsx:509`。
- 当前可用动画地基：`packages/ui/src/MusicSpectrum.tsx` / `getSkiaModule`、`NativeMusicSpectrum`、`WebMusicSpectrum` 已形成 Native 用 Skia、Web 用 canvas fallback 的模式；`packages/ui/src/RadioTuningLoader.tsx` / `getSkiaModule` 也使用同类模式。
- 当前可用交互地基：`apps/mobile/app/_layout.tsx` / `RootLayout` 已用 `GestureHandlerRootView` 包住全局；`packages/ui/src/PlaybackProgressBar.tsx` / `PlaybackProgressBar` 已用 `Gesture.Pan` 与 `GestureDetector` 做拖拽交互。
- 当前依赖能力：`apps/mobile/package.json` 与 `packages/ui/package.json` 已包含 `@shopify/react-native-skia`、`react-native-reanimated`、`react-native-gesture-handler`；没有现成 Rive / Lottie / Spine runtime 依赖。

### 15.4 方案自审结论

- 致命问题：如果只做“SVG 或图片 + 外层 translate / rotate / scale”，会再次变成旧废案，直接违反 §2.1 角色 / 宠物动画准入规则。
- 严重问题：没有动作资产生产线时，不应承诺 QQ 宠物级表现。工程可以完成状态机和渲染，但角色生命感依赖可复用动作资产：帧图、分层部件、骨骼动画或等价动画数据。
- 严重问题：直接把 `qqpet_automation` 的 Electron / Ruffle / Flash 路线搬进 Expo React Native 不合理；桌面透明窗口、托盘、Flash 运行时和许可边界都与当前 App 主线冲突。
- 一般问题：本地 clone 尚未成功，后续如果必须做更深层代码对照，需要先解决 SSH key 或网络访问；在此之前不能把“已经加入工作区”写成完成事实。
- 建议方向：下一段功能点必须先比较 Skia sprite atlas、分层骨骼/部件动画、Rive/Lottie/Spine runtime、WebView/Ruffle 四类路线，并以“能否产生角色本体动作”和“能否低风险接入 Expo”为首要标准。

### 15.5 当前准入判断

- 可以继续评估：当前项目已有 Skia、Reanimated、Gesture Handler，足够支撑高质量 in-app 宠物 prototype 的工程层。
- 不能直接编码：还没有确认动作资产路线、角色设计方向、状态机范围和验收截图标准；提前写代码会高概率变成又一个贴图动画。
- 下一段交付物：功能点与方案比较，包括推荐路线、弃用路线、文件级计划、动作资产格式、状态机事件表、遮挡避让规则和 prototype 删除条件。

---

### 15.6 Skill 审查结果

- `vercel-react-best-practices` 审查结论：有条件通过。后续实现必须避免用 React state 承载逐帧动画；动画帧、拖拽坐标、眼神跟随、播放律动等高频值必须走 Skia / Reanimated shared value / worklet。新运行时依赖必须按需、可分析、可回退，不能为了宠物无条件扩大 Metro / Web bundle。
- `frontend-design` 审查结论：有条件通过。角色必须有明确概念与视觉记忆点，不能沿用通用可爱贴图、模型 logo、漂浮徽章或 AI 生成感模板。第一版也必须有角色轮廓、表情语言、动作节奏和 Claudio 电台气质。
- 本轮未使用 `web-design-guidelines`：它面向 Web UI / 可访问性审查；当前阶段是 React Native 宠物方案 Spec，不是已实现 Web 页面审查。
- 审查准入：现状分析通过，可以继续进入“功能点与方案比较”；但编码 HARD-GATE 仍未解除。

### 15.7 技术路线比较

| 路线 | 生命感潜力 | 接入风险 | 审查结论 |
| --- | --- | --- | --- |
| Skia sprite atlas + manifest | 高。预制帧图能直接做身体、眼睛、嘴、姿态变化，最接近 QQ 宠物的帧动画本质。 | 低。项目已有 Skia / Reanimated / Gesture Handler，能沿用 `MusicSpectrum` 的 Native Skia + Web fallback 模式。 | 推荐作为 prototype 主路线。 |
| Skia 分层部件 rig | 高。头、眼、嘴、手脚可按状态独立插值，适合做眼神、张嘴、拖拽挣扎等微反应。 | 中。需要设计锚点、层级和部件拆分，调参成本高。 | 推荐作为 sprite atlas 的增强层，不作为第一步唯一方案。 |
| Rive state machine runtime | 很高。Rive 原生支持 artboard、state machine、data binding，适合复杂角色。 | 中高。官方 React Native runtime 需要 RN 0.78+、Expo SDK 53+、Nitro Modules；本项目版本满足大方向，但会新增 native runtime 与构建风险。 | 作为 P1 候选；只有当我们能产出 `.riv` 资产且接受 native 依赖时再引入。 |
| Lottie / Skottie clips | 中。适合播放预制片段，但交互状态、拖拽反馈和局部表情控制不如 Rive / 自研 rig。 | 中。Lottie 是独立 runtime；Skottie 可借 Skia 但仍依赖高质量 AE/Lottie 资产。 | 可作为一次性过场或表情片段，不作为宠物主架构。 |
| RN `<Image>` / `expo-image` 快速换帧 | 低到中。能做帧图，但高频换帧容易回到 React 渲染热路径，也难做部件交互。 | 中。实现简单但质量天花板低。 | 不作为主路线；静态 artwork 继续保持现状，不迁移宠物动画到普通 Image。 |
| WebView / Ruffle / Flash | 理论上能复刻原味 QQ 宠物。 | 高。与 Expo RN、移动端交互、许可、体积和桌面宿主边界冲突。 | 拒绝作为本项目路线，只作参考研究。 |

外部参考：
- React Native Skia Atlas：`https://shopify.github.io/react-native-skia/docs/shapes/atlas/`
- React Native Skia Images：`https://shopify.github.io/react-native-skia/docs/images/`
- Rive React Native runtime：`https://rive.app/docs/runtimes/react-native/react-native`
- Expo Lottie 文档：`https://docs.expo.dev/versions/v53.0.0/sdk/lottie/`
- Expo New Architecture：`https://docs.expo.dev/guides/new-architecture/`

### 15.8 推荐 prototype 功能点

- 角色方向：Claudio 的“电台守夜员”系统伴侣。它不是动物贴纸，也不是模型品牌图标；核心记忆点是小型电台人格、耳机 / 天线 / 信号眼、黑底霓虹边缘、轻微刺绣或高密度手绘质感。
- 资产标准：第一版使用高密度 raster sprite atlas，源尺寸按 2x / 3x 绘制，运行时显示约 `96dp - 128dp`；禁止低分辨率像素块直接放大。每个动作 clip 至少 8 帧，关键状态不少于 6 个 clip。
- 最低状态：`idle`、`look`、`listen`、`speak`、`sleep`、`drag`。每个状态必须出现角色本体变化，且截图静态也能看出差异。
- 情境映射：TTS 播报时进入 `speak`；音乐播放且非 TTS 时进入 `listen`；输入聚焦或用户靠近时进入 `look`；长时间无操作进入 `sleep`；拖拽时进入 `drag`；切歌成功可短暂进入 `react`。
- 遮挡策略：默认贴边停靠，保留输入框、播放控制、封面 / 海报主视觉安全区；拖到危险区域时吸附到最近安全边；需要提供关闭或收起入口。
- 性能策略：React state 只保存低频业务状态；帧索引、拖拽位置、眨眼节奏、身体摆动走 shared value / worklet；Skia Native 渲染，Web 使用单 canvas 或低频 fallback。
- 失败退出：prototype 若达不到“六状态一眼可分辨、无明显遮挡、拖拽自然、稳定 30fps+、不引入不可控依赖”，必须删除，不进入主界面。

### 15.9 文件级计划草案

- `packages/ui/src/pet/petTypes.ts`：定义 `PetState`、`PetClip`、`PetFrame`、`PetEvent`、`PetSafeArea` 等纯类型。
- `packages/ui/src/pet/petBrain.ts`：纯状态机，只根据电台 / TTS / 输入 / 拖拽 / 空闲事件输出目标状态，不碰 UI。
- `packages/ui/src/pet/petManifest.ts`：描述 atlas、clip、frame rect、anchor、hitbox、fps、loop 策略。
- `packages/ui/src/pet/PetSpriteCanvas.tsx`：Skia 渲染层，按 manifest 绘制当前帧；Web fallback 只保留 prototype 可验收能力。
- `packages/ui/src/PetCompanion.tsx`：对外组件，负责状态机、手势、避让、收起和渲染组合。
- `packages/ui/src/index.ts`：仅在 prototype 达到准入标准后导出 `PetCompanion`。
- `apps/mobile/app/index.tsx`：仅在用户确认后接入主界面，并且先用可关闭 / 可回滚的 prototype 开关挂载。

### 15.10 下一段待确认

- 本段是“功能点与方案比较”。用户确认后，下一段补“风险与决策”：资产生成方式、是否引入 Rive、clone 失败处理、验收截图标准、测试命令和回滚条件。

---

### 15.11 能力复核：能否做到灵动宠物生动感

- 结论：可以继续，但目标必须定义为“Claudio in-app 系统伴侣拥有自己的生命感”，不是 1:1 复刻桌面透明窗口、托盘、Flash 运行时和原版权资产。
- 能做到的部分：角色本体动作、状态切换、拖拽反应、闲置反应、听歌 / 说话 / 睡觉情境、局部表情变化、贴边避让和可关闭入口。
- 不能靠代码硬凑的部分：没有高质量动作资产时，任何渲染技术都会退化成贴图晃动；因此动作资产验收必须放在实现验收之前。
- 技术判断：2026 年的高性能技术不是越多越好，而是选能稳定产出和验证的路线。当前最优路线是 Skia 分层角色 rig + manifest + worklet 状态驱动；Rive 作为后续增强候选，不作为第一版硬依赖。

### 15.12 最终技术决策

- D1：第一版采用“Skia 分层角色 rig + manifest + worklet 状态驱动”的主路线，不等待用户提供素材。原因是灵动宠物的生动感本质依赖角色本体部件变化；Skia 分层绘制能模拟 Flash 式矢量角色动画，避免 React 逐帧渲染热路径，并且项目已具备 Skia / Reanimated / Gesture Handler 依赖。
- D2：状态机与渲染分离。`petBrain.ts` 只处理业务事件到目标状态的转换，`PetCompanion.tsx` 内的绘制层只处理当前状态 / shared value / Skia 部件绘制，避免把业务规则和绘制参数揉成不可维护逻辑。
- D3：角色动画采用“分层部件 + 局部微反应”混合。身体、头、耳机、天线、眼睛、嘴、信号灯、电台波形分层绘制；不同状态改变部件锚点、表情、嘴型、重心和节奏，保证角色本体在动。
- D4：不在第一版引入 Rive。Rive 的 React Native runtime 很适合 state machine 角色动画，但需要 `.riv` 资产生产线与 native runtime 接入；在没有可靠 `.riv` 资产前引入会增加构建风险，并不自动提升角色表现。
- D5：不使用 RN `<Image>` / `expo-image` 承载宠物动画。普通 Image 适合静态封面或低频图片展示，不适合宠物帧索引、拖拽、高频表情和局部反应。
- D6：不使用 WebView / Ruffle / Flash。该路线更接近原 QQ 宠物宿主，但与 Expo 移动端、体积、交互和许可边界冲突。
- D7：`@shopify/react-native-skia` 已存在于 `apps/mobile/package.json` 与 `packages/ui/package.json`，宠物第一版不新增绘图 runtime。
- D8：第一版 `listen` / `speak` 使用程序化节奏模拟音乐律动和嘴型，不假装是真实 FFT / TTS 包络。真实音频频谱与 TTS 音量包络留到 Phase N 或后续 audio envelope 子阶段，接入前不把当前模拟效果描述为音频同步。

### 15.13 动作资产生产与验收

- 第一版角色名暂定为 Claudio Signal Keeper。视觉关键词：黑底电台、耳机、天线、信号眼、霓虹边缘、高密度手绘 / 刺绣质感；不能像通用动物贴纸。
- 资产生产方式：第一版不依赖外部用户素材，先用 Skia 代码绘制同一角色的分层部件；后续如需要商业级美术，再把同一 manifest 替换为 raster atlas 或 Rive 资产。
- 第一版最小状态：`idle`、`look`、`listen`、`speak`、`sleep`、`drag`。`speak` 至少包含嘴型变化；`drag` 至少包含身体被拉起或重心变化；`sleep` 至少包含眼睛 / 姿态变化；`listen` 至少包含听歌点头或信号律动。
- 质量门槛：静态截图里六个状态必须一眼可分；连续播放时角色本体必须在动；只有位置漂移、缩放、旋转、阴影变化不算通过。
- 资产失败处理：若 Skia 角色显得简陋、表情不可读或过度像图标，先迭代角色绘制，不继续扩展主界面功能。
- 分层拆解：头、身体、耳机、天线、眼睛、嘴、胸口信号柱、手臂、脚座必须作为不同部件处理；拖拽至少影响头部偏移、身体重心和手臂长度，避免只有整图移动。

### 15.14 性能与交互验收

- 渲染热路径：帧索引、眨眼、拖拽坐标、局部 overlay 参数必须在 shared value / worklet / Skia 层处理；React state 只记录低频业务状态和开关。
- 交互验收：拖拽必须跟手，释放后吸附安全边；输入框、播放控制、封面 / 海报主视觉是硬安全区，不允许默认遮挡。
- 行为验收：音乐播放时进入 `listen`；TTS 播报时进入 `speak`；用户输入聚焦或最近交互进入 `look`；空闲超时进入 `sleep`；拖拽中进入 `drag`。
- 数据源验收：当前版本的胸口律动和嘴型是程序模拟；必须在 UI 或文案中避免暗示“真实音频驱动”。后续真实同步需要先打通音频分析或 TTS 包络数据源。
- 性能验收：Web prototype 需要肉眼稳定，Native 目标稳定 30fps+；任何因宠物导致输入卡顿、频谱掉帧或播放器控制延迟的实现都必须回滚。
- 测试验收：至少新增 `petBrain` 纯函数单元测试、manifest 校验测试、`pnpm typecheck`；接入主界面后补 `pnpm lint` 与 Expo Web 截图验收。

### 15.15 风险与回滚

- R1：最大风险是角色资产质量，不是动画代码。缓解：先验收 reference 和 atlas，再接入主界面。
- R2：本地 clone `qqpet_automation` 失败导致参考深度受限。缓解：继续使用 GitHub 页面作为参考；如后续必须深挖代码，再单独修 SSH / 网络。
- R3：宠物遮挡电台主流程。缓解：默认贴边、可收起、可关闭，且安全区规则写入组件。
- R4：依赖膨胀。缓解：第一版不新增 native runtime；只使用现有 Skia / Reanimated / Gesture Handler。
- 回滚条件：六状态不可分、资产像贴图、拖拽生硬、遮挡核心控件、性能影响主流程、需要大规模引入不可控依赖，任一命中即删除 prototype，不进入主界面。

### 15.16 当前实现状态与后续 HARD-GATE

- Phase Pet prototype 已完成并归档：`packages/ui/src/PetCompanion.tsx` 与 `packages/ui/src/pet/*` 已存在，`apps/mobile/app/index.tsx` 已接入主界面。
- 当前宠物状态来自 Life / Presence / 播放 / 语音 / 调频状态，支持拖拽、收起和关闭；它不是贴图漂浮，也不是模型徽章。
- 后续若继续扩展宠物，仍必须重新走中等及以上任务 HARD-GATE，先补当前代码现状、功能点、风险决策与验收标准。
- Phase N 已补真实 Web Audio analyser 和明确 playback envelope fallback；后续不得把 Native fallback 描述为真实 PCM / FFT，除非新阶段 Spec 明确论证并验证。

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
