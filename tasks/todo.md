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

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · Phase H（电台播放控制语义重整）

- [x] 模型复核：确认三层模型更符合用户直觉：电台总控、歌曲队列、主播语音。
- [x] 现状分析：写入 `tasks/spec.md` §13.2，标注文件路径和函数名。
- [x] 补充现状：记录 `tts.ready` 在播完后变 false 导致主按钮静默切回歌曲状态。
- [x] 功能点方案：写入 `tasks/spec.md` §13.3，覆盖电台编排、主控、主播语音、队列切歌和服务端切歌 API 选型。
- [x] 边界补充：明确 v1 previous 只在当前 queue 内后退，next 耗尽返回 `queue exhausted`，不自动补歌。
- [x] 风险与执行步骤：写入 `tasks/spec.md` §13.4-13.5。
- [x] HARD-GATE：用户确认完整 Phase H Spec 后开始编码。
- [x] 共享契约：新增 `PlaybackMoveResponse` 与 `playNext` / `playPrevious` 客户端方法。
- [x] 服务端：新增 `currentIndex` 与 `/api/playback/next|previous`，失败响应保留当前 track。
- [x] 移动端：新增 `useStationController`，页面按钮统一接入电台总控。
- [x] 验证：`pnpm typecheck`、`pnpm lint`、HTTP 点歌与播放移动烟测通过。

### Review

- `pnpm typecheck` 通过；`pnpm lint` 通过。
- HTTP 烟测：空队列 `next/previous` 分别返回 `queue exhausted` / `queue start` 且 track 为 null。
- HTTP 烟测：点歌“我想听周杰伦的晴天”后 `/api/now.state=playing`，失败移动响应保留当前《晴天》track。
