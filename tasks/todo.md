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
- [x] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务
- [ ] Phase K：歌曲像素海报
- [ ] Phase L：用户歌单 JSON 偏好
- [ ] Phase M：用户音源导入 UI
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

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · 宠物阶段调研与方案审查

- [x] 尝试克隆并阅读 `xuemian168/qqpet_automation`；本地 SSH / HTTPS clone 失败，已改用 GitHub 源码页面提取参考事实。
- [x] 核查当前 Claudio UI / 动画能力边界，标注代码出处。
- [x] 写 Phase Pet 现状分析 Spec：只给证据和问题，不写实现代码。
- [x] 用项目内审查规则自审方案：角色生命感、动作资产、状态机、性能、遮挡和失败退出。
- [x] 使用 `vercel-react-best-practices` 与 `frontend-design` 审查现状分析，通过后继续写功能点与方案比较。
- [x] 写 Phase Pet 功能点与方案比较：技术路线、推荐 prototype、文件级计划草案。
- [x] 复核“是否真能达到灵动宠物生命感”，明确能做边界与不能靠代码硬凑的部分。
- [x] 写 Phase Pet 风险与决策：最终技术路线、动作资产验收、性能验收、回滚条件。
- [x] 自问是否需要用户素材 / 其他动画流 / 新技术配合；结论是第一轮不需要，改为 Skia 分层角色 rig 后开始编码。
- [x] 实现 `PetCompanion` prototype：状态机、Skia 分层角色、拖拽/避让与主界面接入。
- [x] 运行 typecheck / lint / test，并用 Expo Web bundle 验证可编译。
- [x] 采纳外部评估：明确当前律动 / 嘴型是程序模拟，真实 FFT / TTS 包络留到后续；增强拖拽时头部、身体、手臂的拉扯变形。

### Review

- 用户已授权由我自行判断是否继续；第一轮不需要外部素材或新 runtime，按 `tasks/spec.md` §15 的 Skia 分层角色 rig 路线实现。
- 新增 `packages/ui/src/PetCompanion.tsx`、`packages/ui/src/pet/petBrain.ts`、`packages/ui/src/pet/petTypes.ts`，并在 `apps/mobile/app/index.tsx` 接入贴边、可拖拽、可收起的宠物 prototype。
- 验证通过：`pnpm typecheck`、`pnpm lint`、`pnpm test`、Expo Web bundle `http://localhost:8087/apps/mobile/index.ts.bundle?...` 返回 200。
- 目标校正：QQ 宠物只作为生命感参考，当前目标是 Claudio 自己的灵动系统伴侣，不做 1:1 复刻。
- 外部评估采纳：Skia 依赖已存在；当前没有真实音频 / TTS 包络，所以第一版只做程序化节奏，并已把该限制写入 Spec。
