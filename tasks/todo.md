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

## 当前任务 · Phase I（默认 LX 双源池 + FLAC 优先）

- [x] 本地基准：对比 `primary/primary.js` 与 `secondary/secondary.js` 的 worker 初始化、FLAC URL 解析、降级行为。
- [x] 现状分析：写入 `tasks/spec.md` §14.1，明确当前单 LX provider / 单 runtime 边界。
- [x] 功能点方案：设计默认双源池、源优先级、FLAC 优先级、失败降级与 env 覆盖策略。
- [x] 风险与执行步骤：明确不提交 `server/data` 音源文件、沙箱隔离不降级、验证命令与 HTTP 烟测。
- [x] HARD-GATE：用户确认完整 Phase I Spec 后开始编码。
- [x] 服务端实现：接入两个本地 LX 源为默认源池，并保留用户 env 覆盖能力。
- [x] 验证：`pnpm --filter server typecheck`、`pnpm lint`、HTTP 点歌返回 FLAC 来源 track。

### Review

- `pnpm --filter server typecheck` 通过；`pnpm --filter server build` 通过；`pnpm lint` 通过。
- 生产入口烟测：`node dist/index.js` 可启动并响应 `/health`，ESM 相对 import 扩展问题已修复。
- HTTP 烟测：默认点歌“我想听许嵩的乌鸦”命中 `lx-primary`，`quality=flac`，`state=playing`。
- HTTP 烟测：临时禁用 `primary.js` 后同一首歌命中 `lx-secondary`，测试结束已恢复文件。
- HTTP 烟测：临时配置 `LX_SOURCE_SCRIPT_FILE` 后命中兼容 provider `lx`，用户自定义单源覆盖未被破坏。
- 追加修正：默认真实源改为提交到 `server/assets/lx-sources`，`server/data/lx-sources` 作为本机私有覆盖层保留。
- 追加验证：临时隐藏 `server/data/lx-sources/primary|secondary` 后仍命中 assets 内置 `lx-primary`，证明开源拉取代码可开箱使用默认源。
- 追加验证：`server/data/lx-sources` 恢复后仍命中 `lx-primary`；临时 `LX_SOURCE_SCRIPT_FILE` 仍命中兼容 provider `lx`。
