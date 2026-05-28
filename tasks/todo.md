# Claudio · 当前执行看板

> `tasks/spec.md` 是决策真源；`tasks/lessons.md` 是踩坑规则库；本文件只放当前任务、状态和必要验收提醒。

---

## 当前规则

- 中等及以上任务：先写分段 Spec，默认用户确认后再编码；2026-05-28 用户已授权 Phase L.0 连续执行，不再等待逐段确认。
- 当前阶段若发现偏差：先更新 Spec，再改代码。
- 完成任务必须给验证证据：类型检查、请求结果、运行日志或可操作验收步骤。
- 阶段验收通过后必须归档完整 Spec 到 `tasks/spec/<phase>.md`，`spec.md` 只保留跨阶段决策、当前阶段和已完成摘要。
- `spec.md` 超过 250 行时检查是否有已完成阶段未归档；`todo.md` 超过 120 行时先压缩已完成任务。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- 所有“运行 / 重启 / 打开 / 点击”步骤必须标明执行载体。
- Claudio 永远是音乐电台：评论区 / 对话输入是点歌和推荐入口，不新增独立搜索框；LLM 主播负责理解意图、策划选曲、讲短背景和过渡。
- Claudio 的核心不是通用点歌和短文案，而是个人音乐记忆驱动的 AI 电台；Phase L.3 Life State Bus 已完成。
- GitHub 侧 Phase Pet 当前是设计草案和注释占位，`PetCompanion` 组件尚未实际存在；不能当作已完成 prototype。
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
- [x] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务
- [x] Phase L.0：个人音乐记忆与 Context Engine
- [x] Phase L.1：Resident DJ Agent 服务端闭环
- [x] Phase L.2：测试整理 + Resident DJ 并行多智能体升级
- [x] Phase L.3：Claudio Life State Bus
- [ ] Phase M：用户音源导入 UI
- [ ] Phase Pet：Claudio 灵动系统伴侣 prototype（GitHub 侧已合入设计草案，代码未实装）
- [ ] Phase K：歌曲像素海报
- [ ] Phase N：真实音频律动

---

## 已完成摘要

| 阶段                       | 状态 | 摘要                                                                                                                                              |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI 动画架构                | 完成 | 高频动画准入规则已沉淀：Reanimated + Skia / Web canvas。                                                                                          |
| Phase A-E                  | 完成 | HTTP / WS、移动端 API、LLM 主播、真实音乐源、TTS talk-over 主链路已打通；详细决策见 `tasks/spec.md` §6。                                          |
| NativeWind / SDK 56        | 完成 | React / RN / Expo / NativeWind 类型链路和 SDK 56 矩阵已清理并验证通过。                                                                           |
| Phase G.1                  | 完成 | 服务端 LX-compatible Bridge 接入 provider chain，用户源脚本在 child_process worker 内隔离执行；详见 `tasks/spec.md` §10。                         |
| Phase G.2-pre/default      | 完成 | `/api/chat` 以评论区为唯一入口，LLM 意图 + Kuwo 候选搜索 + LX Bridge 组成默认真实音乐链路。                                                       |
| 情绪类点歌误判             | 完成 | “想听伤感的歌曲”不再被当成《伤感》精确搜歌，改为情绪 / 类型推荐路径。                                                                             |
| explame AI 审查复核        | 完成 | 采纳预加载中断、服务端并发、标题匹配、ducking 高频调用、TTS cache 淘汰等真实问题；忽略不符合个人开源目标的鉴权/CORS建议。                         |
| radioState God Object 拆分 | 完成 | 新增 `server/src/radio/intentParser.ts`、`server/src/radio/djCopy.ts`，`radioState.ts` 保留状态与编排，对外 API 不变。                            |
| 播放控制回归修复           | 完成 | 恢复播放按钮可用、TTS 暂停/续播和 VOICE OFF 过期 TTS 防护；后续 Phase H 重新梳理完整控制语义。                                                    |
| Phase H                    | 完成 | 主播放按钮统一为电台总控，VOICE 只管主播自动播报，上一首 / 下一首走服务端 queue currentIndex。                                                    |
| Phase I                    | 完成 | 默认真实源已改为 `server/assets/lx-sources` 内置双源池，`server/data/lx-sources` 只作本机私有覆盖，FLAC 优先链路已验证。                          |
| Phase J                    | 完成 | 单曲 / 情绪 / 多首请求队列语义、按钮禁用、后台续推、切歌短播报与 track-aware TTS 保护已通过验收。                                                 |
| Phase J.1                  | 完成 | `radioState.ts` 第一轮拆分完成，模型、队列、session 续推、切歌播报已拆到独立模块；详见 `tasks/spec/phase-j1-radio-state-orchestration-split.md`。 |
| Phase J.2                  | 完成 | `chatTurnPlanner.ts` 抽离完成，`radioState.ts` 只保留状态提交和播放副作用；详见 `tasks/spec/phase-j2-chat-turn-planner.md`。                      |
| Phase J.3                  | 完成 | 根 `pnpm test` / `pnpm test:full` 两层自动化测试入口已建立；详见 `tasks/spec/phase-j3-automated-test-entry.md`。                                  |
| Phase F                    | 完成 | 后台播放、锁屏 metadata、APK 构建入口、WS 重连和 graceful shutdown 已完成；详见 `tasks/spec/phase-f-productization.md`。                          |
| 小米 TTS 默认              | 完成 | 删除 Edge TTS，默认 MiMo；修复 `requestKind` 接线和 TTS cache 维度，`pnpm test:full` 通过。                                                       |
| 旧宠物体系移除             | 完成 | 删除右下角宠物浮层、API `petSprite` 字段和 UI 导出；新增角色 / 宠物准入规则，避免贴图漂浮再次伪装成产品能力。                                     |
| Phase L.0                  | 完成 | 服务端个人资料层、个人候选检索、Context Assembler、DJ prompt 上下文、MiMo 动态 style TTS 已落地。                                                  |
| Phase Pet 设计草案         | 已合入 | GitHub 侧合入宠物方案 Spec 与移动端注释占位；`PetCompanion` 组件和 `packages/ui/src/pet/*` 尚未实际存在。                                           |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## GitHub 合入记录 · 宠物阶段调研与方案审查

- [x] 尝试克隆并阅读 `xuemian168/qqpet_automation`；本地 SSH / HTTPS clone 失败，已改用 GitHub 源码页面提取参考事实。
- [x] 核查当前 Claudio UI / 动画能力边界，标注代码出处。
- [x] 写 Phase Pet 现状分析 Spec：只给证据和问题，不写实现代码。
- [x] 用项目内审查规则自审方案：角色生命感、动作资产、状态机、性能、遮挡和失败退出。
- [x] 使用 `vercel-react-best-practices` 与 `frontend-design` 审查现状分析，通过后继续写功能点与方案比较。
- [x] 写 Phase Pet 功能点与方案比较：技术路线、推荐 prototype、文件级计划草案。
- [x] 复核“是否真能达到灵动宠物生命感”，明确能做边界与不能靠代码硬凑的部分。
- [x] 写 Phase Pet 风险与决策：最终技术路线、动作资产验收、性能验收、回滚条件。
- [x] 自问是否需要用户素材 / 其他动画流 / 新技术配合；结论是第一轮不需要，改为 Skia 分层角色 rig 后开始编码。
- [ ] 实现 `PetCompanion` prototype：当前代码只保留注释占位，未创建可运行组件。
- [ ] 运行宠物实现专项验收：当前没有宠物实现代码，无法做截图或交互验收。

### Phase Pet Review

- 合并复核：当前 `apps/mobile/app/index.tsx` 里 `PetCompanion` import / render 被注释，`packages/ui/src/PetCompanion.tsx` 和 `packages/ui/src/pet/*` 不存在。
- 结论：GitHub 侧实际合入的是 Phase Pet 方案草案、移动端注释占位和打包配置，不是可运行宠物 prototype。
- 后续如果要做宠物实现，必须重新 HARD-GATE：先补当前代码现状和文件级计划，再实现。

## 已完成任务 · Phase L.0 个人音乐记忆与 Context Engine

- [x] 将 2026-05-27 路线纠偏写入 `tasks/spec.md`：真实音源 / TTS / 队列是地基，个人音乐资料和上下文组装才是 Claudio 的核心。
- [x] 补 Phase L.0 分段 Spec：现状分析、文件级函数计划、搜索层决策、风险与验证计划。
- [x] 建立用户资料目录和最小 schema：`taste.md`、`routines.md`、`playlists.json`、`mood-rules.md` 或等价结构。
- [x] 实现个人歌单导入 / 校验 / 去重 / 检索，优先支持简单 `{ title, artist }[]`。
- [x] 在 `/api/chat` 调用 LLM 前组装个人上下文：用户输入、相关个人候选曲、播放历史、时间场景和音源状态。
- [x] 改造 DJ prompt：禁止空泛短文案冒充懂用户；有真实资料时允许更完整的电台式过渡。
- [x] 改造 MiMo TTS 内部 style / emotion 链路，让主播语音跟随 DJ 决策。
- [x] 添加覆盖“开心 / 深夜 / 怀旧 / 明确点歌”的稳定测试，再进入真机验收。

## 今晚智能体编排 · lwx 分支

- [x] 切换到 `lwx` 分支，保留当前工作区现场，不回滚已有改动。
- [x] 管理智能体：维护 Spec / todo / 验证 gate，发现偏离 Phase L.0 立即暂停编码链路。
- [x] 计划智能体：先产出 Phase L.0 分段 Spec，现状分析必须标注文件路径 + 函数名。
- [x] 资料层编码智能体：负责用户音乐资料 schema、读取、校验、去重和最小样例。
- [x] 检索编码智能体：负责个人歌单候选检索、情绪 / 场景匹配、与 provider resolver 的边界。
- [x] DJ 链路编码智能体：负责 Context Assembler、DJ 决策输入、prompt 改造和 fallback 文案。
- [x] TTS 编码智能体：负责 MiMo 动态 style / emotion 入参、缓存 key 和 voice contract。
- [ ] Mobile 编码智能体：只在 P0 服务端闭环稳定后接资料状态、导入入口和语音状态展示。
- [x] 审核智能体：逐轮 code review，重点查空泛 prompt、个人资料泄漏、无证据决策和测试缺口。
- [x] 验证智能体：先跑 `pnpm test`，影响 `/api/chat` / 音乐解析 / 队列时跑 `pnpm test:full`。
- [ ] 暂停任务：Phase K 海报、Phase N 律动、纯视觉增强、纯 prompt 文风微调、BYO-LLM UI。

### Phase L.0 Review

- 结果：服务端已建立个人资料读取、个人候选检索、Context Assembler、DJ prompt 上下文、个人候选 resolver seeds、MiMo 动态 style TTS。
- 本机资料：已在 ignored 的 `server/data/user-profile` 创建最小种子；不会进入 Git。
- 验证：终端命令 `pnpm test:full` 通过；结构烟测显示 `想听开心的歌 -> 稻香`，`给我推荐几首伤心的歌 -> 突然好想你`，强制无曲目分支仍 idle。
- 暂缓：Mobile 资料导入 / 状态展示放到 P1；Phase K / N / 宠物继续暂停。

## 当前任务 · GitHub 同步与冲突处理

- [x] 终端命令：`git fetch origin --prune` 拉取远端引用。
- [x] 终端命令：用 stash 保护本地未提交改动，再将 `lwx` 快进到 `origin/develop`。
- [x] 终端命令：重新套回本地改动，确认冲突只在 `tasks/spec.md` 与 `tasks/todo.md`。
- [x] 编辑器界面操作：合并任务文档冲突，保留 GitHub Phase Pet 和本地 Phase L.0 记录。
- [x] 终端命令：运行固定测试入口验证合并结果。

### GitHub 同步 Review

- 结果：`lwx` 已快进到 `origin/develop` 的 `194460c`，本地 Phase L.0 改动已重新套回；包版本文件无本地 diff，保持 GitHub 侧版本。
- 冲突：只发生在 `tasks/spec.md` 与 `tasks/todo.md`，已保留 GitHub Phase Pet 记录和本地 Phase L.0 归档记录。
- 验证：终端命令 `pnpm test:full` 通过；typecheck 全部通过，server 9 个测试文件 / 31 个测试通过，`smoke:radio` 结构烟测通过。
- 备注：真实 LX 源在烟测中出现 `fetch failed`，服务端按预期进入无曲目 / idle 分支，没有破坏结构闭环。

## 当前任务 · Phase L.1 Resident DJ Agent 方案设计

- [x] 纠偏当前 Phase L.0 边界：它只是个人候选 seed + Context Window，不是完整“懂用户”的高级智能体。
- [x] 设计 Resident DJ Agent 总体方案：理解用户、情绪陪伴、私人歌单策划、音乐记忆、长期偏好更新。
- [x] 设计歌单 / 音乐记忆导入模板，供后续用户导入真实资料。
- [x] 设计多智能体协作：先由设计智能体制定 plan / 方案，再由资料、情绪、策展、验证智能体分工。
- [x] 自动审查方案：检查是否仍在硬编码歌单、是否过度承诺情绪陪伴、是否保护隐私、是否可验证。
- [x] 用户已确认方案并要求实现，进入 Phase L.1 分段 Spec 与实现。

### Phase L.1 Design Review

- 用户已明确要求 `PLEASE IMPLEMENT THIS PLAN`，进入实现。

## 当前任务 · Phase L.1 Resident DJ Agent 实现

- [x] 写入 `tasks/spec.md` 当前阶段真源：simple-playlists、Resident DJ 内部智能体、curated candidates、critic、验证边界。
- [x] 扩展个人资料类型和读取：支持 `simple-playlists.json`、`qq_songs.json`、洞察 / 事件 / 长期记忆本地文件。
- [x] 新增 Resident DJ 内部智能体模块：Design Director、Memory Librarian、Mood Companion、Playlist Curator、Music Scout、Critic。
- [x] 改造 `planChatTurn`：删除 personal seed-first 主路径，改用 turn plan + curated candidates 进入 resolver。
- [x] 改造 prompt / fallback DJ 文案：深聊边播、开心共振、禁止假装懂用户和治疗承诺。
- [x] 添加 L.1 测试：简单歌单导入、上午轻音乐、会议间歌、不固定映射、深聊边播、开心共振、critic。
- [x] 终端命令：运行 `pnpm test:full` 并修复失败。

### Phase L.1 Review

- 结果：服务端 Resident DJ 闭环已完成，非明确点歌主路径变为 `DjTurnPlan -> CuratedCandidate[] -> resolver -> DJ Host -> Critic`。
- 资料：支持 `simple-playlists.json` 分组歌单、`qq_songs.json` 纯数组、`library-insights.json`、`listening-events.jsonl`、`dj-memory.json`；这些仍在 ignored 的 `server/data/user-profile`。
- 验证：终端命令 `pnpm test` 通过；typecheck 全部通过，server 10 个测试文件 / 40 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和强制无曲目分支均通过。
- 遗留：移动端导入 UI 未做；自动把播放 / 跳过 / 收藏事件落盘可作为下一阶段子任务。

## 当前任务 · Phase L.2 测试整理 + Resident DJ 并行多智能体升级

- [x] 写入 `tasks/spec.md` 当前阶段真源：测试整合保留、异步 agent orchestrator、音乐有限并发、内部观测边界。
- [x] 新增共享测试工厂并替换重复 `track / section / context / profile` 构造。
- [x] 新增 Resident DJ 异步 orchestrator：Design Director 串行，Memory / Mood / Insight / Recent behavior 并行。
- [x] 将 `/api/chat` 非明确点歌路径接入异步 orchestrator，保留同步 `buildResidentDjPlan` 兼容测试入口。
- [x] 将多 seed 音乐解析改为默认并发 2，保持单 seed 内 provider chain 顺序兜底。
- [x] 添加并行失败降级、并发上限、去重提交测试。
- [x] 终端命令：运行 `pnpm test`。
- [x] 终端命令：运行 `pnpm test:full`。

### Phase L.2 Review

- 结果：测试文件全部保留，只抽共享工厂；Resident DJ 主链路改用异步 orchestrator，内部 diagnostics 记录 agent timing / fallback reason。
- 结果：多 seed 解析默认并发 2，单 seed provider chain 顺序不变，避免打爆 LX / Kuwo / 外部源。
- 验证：终端命令 `pnpm test` 通过；typecheck 全部通过，server 11 个测试文件 / 43 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和强制无曲目分支均通过。
- 遗留：自动学习事件落盘、移动端导入 UI、重 CPU 大歌库分析 worker 留到后续阶段。

## 当前任务 · Phase L.3 Claudio Life State Bus

- [x] 完成分段 Spec：现状分析、功能点与文件级计划、风险与决策。
- [x] 按用户要求使用审查 AI 复核 Phase L.3 方案，并采纳移动端本地 pure util、UI primitive props、移动端 Vitest 等修正。
- [x] 写入 `tasks/spec.md` 当前阶段真源：Life State 本地展示态、优先级、包边界、MusicSpectrum mode、验证边界。
- [x] 新增 `apps/mobile/app/_utils/claudioLifeState.ts` 和纯函数测试。
- [x] 新增移动端 Vitest 配置与测试脚本，并把根 `pnpm test` 纳入移动端纯函数测试。
- [x] 在 `HomeScreen` 聚合一次 `claudioLifeState`，并映射到 OnAir / NowPlaying / DJBubble / MusicSpectrum。
- [x] 给 `MusicSpectrum` 增加展示强度 `mode`，Native/Web 两端共享同一套强度映射，保留 `active` 兼容。
- [x] 终端命令：运行 `pnpm test` 并修复失败。
- [x] 阶段验收通过后归档 Phase L.3 Spec。

### Phase L.3 Review

- 结果：移动端新增本地 Life State Bus，Claudio 现在能统一呈现离线、连接、调频、说话、听歌、睡眠和待机呼吸状态。
- 结果：`MusicSpectrum` 新增展示强度 `mode`，Native/Web 均通过同一套模式强度表达生命状态，仍保留 `active` 兼容。
- 结果：根 `pnpm test` 已纳入移动端纯函数测试，不渲染 React Native 组件，避免 Expo/RN 测试噪音。
- 验证：终端命令 `pnpm test` 通过；全仓 typecheck、移动端 1 个测试文件 / 7 个测试、server 11 个测试文件 / 43 个测试通过。
- 遗留：真实 FFT / audio envelope、`PetCompanion`、服务端长期记忆接入均留到后续独立阶段。
