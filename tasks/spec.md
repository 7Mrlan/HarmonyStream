# Claudio · 项目决策真源（Spec）

> 本文件只保留当前仍会影响实现的决策真源。
> 历史踩坑和纠正规则放在 `tasks/lessons.md`；当前执行进度放在 `tasks/todo.md`。
> 任何代码与本文件冲突，错的是代码；发现偏差先更新 Spec，再改代码。

---

## 当前活跃索引

- 当前主线：AI 电台已完成“推荐队列体验清晰”、`radioState.ts` 编排拆分、自动化测试入口与 Phase F 产品化任务；下一轮默认进入 Phase K（歌曲像素海报），除非明确插队 Phase L / M / N。
- 已完成：Phase A 后端 API 骨架；Phase B 移动端接入；Phase C LLM 主播；Phase C+ 等待体验；Phase D 音乐来源；Phase D.5 性能地基；Phase E TTS 入声；Phase F.0 SDK 56 依赖升级；Phase F.A 音频会话/后台权限；Phase F.B WS 心跳/重连；Phase F.C 锁屏 metadata 代码接线；Phase F.D APK 构建入口；Phase F.E 服务端 graceful shutdown；Phase J 队列与推荐体验收口；Phase J.1 radioState 编排拆分；Phase J.2 chatTurnPlanner 抽离；Phase J.3 自动化测试入口。
- 当前阶段：暂无活跃阶段，等待下一轮功能点确认。
- 当前 HARD-GATE：下一轮中等及以上阶段必须重新分段 Spec（现状分析 → 功能点 → 风险与决策）并等待用户确认。
- 当前边界：BYO-LLM 用户自配 key/baseUrl/model 单独作为 Phase F.5，不混入 Phase F 锁屏 / APK 验收。

---

## 0. 产品一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂用户输入，用 DJ 口吻推荐音乐，并把可播放曲目推给移动端播放器。

- 产品入口是电台评论区 / 对话输入，不新增独立音乐搜索框；用户点歌、描述心情、要求换风格都从同一个电台语义入口进入。
- LLM 主播负责意图理解、选曲策划、短 DJ 文案、歌曲背景 / 趣闻过渡；不负责直接抓取音频 URL、执行第三方源脚本或保存密钥。
- 音乐解析仍由 provider chain 负责：LLM 输出候选曲名或偏好，服务端 resolver / LX Bridge 再把候选解析为可播放 `Track`。
- 背景 / 趣闻必须短且可信；不确定时用氛围化描述或明确弱化，不编造具体年份、奖项、制作人等硬事实。

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
- 新宠物方案必须先通过 `spec-review` 审查，再进入实现 HARD-GATE；审查重点是角色生命感、动作资产、状态机、性能、遮挡与验收标准。

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
- 每段都要等待用户确认；完整 Spec 确认后才进入编码 HARD-GATE。
- 现状分析必须有代码出处：文件路径 + 函数名 / 模块名。
- 验证未完成，不得标记完成。
- 用户指出错误后，必要时写入 `tasks/lessons.md`，避免同类问题复发。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- `tasks/spec.md` 以阶段完成为归档触发器；阶段验收通过后，将完整阶段 Spec 存入 `tasks/spec/<phase-name>.md`。
- `tasks/spec.md` 只保留跨阶段有效决策、当前阶段完整内容、已完成阶段 3-5 行摘要；超过 250 行时只检查是否有已完成阶段未归档。
- `tasks/todo.md` 软上限 120 行；阶段 Review 完成并进入下一阶段时压缩历史摘要。

---

## 8. 历史阶段摘要

| 阶段        | 状态 | 当前仍有效的结论                                                                                                                                           |
| ----------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iter 0      | 完成 | monorepo、共享 tsconfig、UI/core/api/server/mobile 骨架已建立。                                                                                            |
| UI 动画架构 | 完成 | 高频视觉走 Reanimated + Skia / Web canvas；避免 JS RAF + React state 热路径。                                                                              |
| Phase A     | 完成 | 服务端 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/stream` 已打通内存闭环。                                                                     |
| Phase B     | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS；服务端 playlist 可覆盖本地默认播放列表。                                                                   |
| Phase C     | 完成 | 服务端 LLM adapter 已接入；DeepSeek 真实路径与无 key fallback 均验证通过。                                                                                 |
| Phase C+    | 完成 | DJ 气泡等待态已切到调频动画；不再使用本地假等待文案。                                                                                                      |
| Phase D     | 完成 | 服务端 `musicResolver` + fallback catalog + 可选 `ncm` provider；移动端 artwork 链路打通。                                                                 |
| Phase D.5   | 完成 | provider chain、TTL/LRU cache、Range route、客户端 60% 预热、metrics 已落地。                                                                              |
| Phase E     | 完成 | `msedge-tts` 接入；`tts-ready`、`/media/tts/:id`、独立 `useTtsPlayer`、DJBubble REPLAY 已落地。                                                            |
| Phase H     | 完成 | 电台总控 / 歌曲队列 / 主播语音三层语义落地；完整历史见 `tasks/spec/phase-h-radio-playback-controls.md`。                                                   |
| Phase J     | 完成 | 队列数量、上一首 / 下一首禁用、后台续推、切歌短播报与 track-aware TTS 过期保护已落地；完整历史见 `tasks/spec/phase-j-queue-recommendation-experience.md`。 |
| Phase J.1   | 完成 | `radioState.ts` 保留 facade，模型、队列纯函数、session 续推、切歌播报拆入独立模块；完整历史见 `tasks/spec/phase-j1-radio-state-orchestration-split.md`。   |
| Phase J.2   | 完成 | chat planning 抽入 `chatTurnPlanner.ts`，`radioState.ts` 只保留状态提交与副作用；完整历史见 `tasks/spec/phase-j2-chat-turn-planner.md`。                   |
| Phase J.3   | 完成 | 新增 Vitest 单元测试与根 `test/test:full` 两层入口，修复明确点歌解析顺序 bug；完整历史见 `tasks/spec/phase-j3-automated-test-entry.md`。                   |
| Phase F     | 完成 | SDK 56 后台播放、锁屏 metadata、APK 构建入口、WS 重连与 graceful shutdown 已落地；完整历史见 `tasks/spec/phase-f-productization.md`。                      |
| Phase F.0   | 完成 | Expo SDK 56 / React 19.2.6 / RN 0.85.3 / TypeScript 6.0.3 升级完成；NativeWind 类型 shim 和临时 override 已清理。                                          |

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

1. Phase K：歌曲像素海报。
   - 当前已有 `Track.artwork -> TrackArtworkPanel -> PixelClock fallback` 链路；后续补真正轻量像素海报生成 / 缓存策略。
2. Phase L：用户歌单 JSON 偏好。
   - 导入歌单只作为口味种子，提取偏好并推荐相似但不固定的歌曲；不能把导入歌单变成固定播放列表。
3. Phase M：用户音源导入 UI。
   - 默认双源池已可开箱即用；后续设置页提供用户源导入、验证、回滚和沙箱状态展示。
4. Phase N：真实音频律动。
   - 当前频谱是视觉模拟；真实 FFT / PCM 律动需要单独评估 Web 与 Native 能力，不混入队列体验阶段。

### 14.2 插队规则

- P0 bug、安全问题、真机播放稳定性、明显性能回归可以插入为当前 Phase 的子阶段，例如 `Phase J.1`。
- 插队阶段必须写清楚“插队原因、完成条件、回到哪条主线”，完成后回到本路线图的下一项。
- 视觉增强不得抢在播放语义之前；偏好系统不得抢在队列语义之前；音源 UI 不得绕过 LX worker 沙箱。

---
