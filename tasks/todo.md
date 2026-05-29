# Claudio · 当前执行看板

> `tasks/spec.md` 是决策真源；`tasks/lessons.md` 是踩坑规则库；本文件只放当前任务、状态和必要验收提醒。

---

## 当前规则

- 中等及以上任务：先写 Spec；本轮用户已授权 Phase M / Phase Pet / Phase N 连续执行，不再逐段等待确认。
- 当前阶段若发现偏差：先更新 Spec，再改代码。
- 完成任务必须给验证证据：类型检查、请求结果、运行日志或可操作验收步骤。
- 阶段验收通过后必须归档完整 Spec 到 `tasks/spec/<phase>.md`，`spec.md` 只保留跨阶段决策、当前阶段和已完成摘要。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- Claudio 的核心是个人音乐记忆驱动的 AI 电台；视觉、宠物和律动都必须消费真实状态，不做无来源假高级。
- 默认音乐源使用已验证的 LX-compatible 链路；用户源导入必须继续走服务端 worker 沙箱。

---

## 当前主线

**AI 电台最小闭环**

- [x] Phase A-E：HTTP / WS、移动端 API、LLM 主播、真实音乐源、TTS talk-over 主链路
- [x] Phase G-J：LX Bridge、默认真实源、播放控制、队列和自动化测试入口
- [x] Phase F：后台播放、锁屏 metadata、APK 构建入口、WS 重连和 graceful shutdown
- [x] Phase L.0-L.5：个人音乐记忆、Resident DJ、多智能体、Life State、Personal Memory Loop、Presence Engine
- [x] Phase M：用户音源导入 UI
- [x] Phase Pet：Claudio 灵动系统伴侣 prototype
- [x] Phase N：真实音频律动
- [ ] Phase K：歌曲像素海报（本轮暂缓）

---

## 已完成摘要

| 阶段 | 状态 | 摘要 |
| --- | ---: | --- |
| Phase M | 完成 | App SOURCE 面板、用户源验证 / 启用 / 回滚、LX worker 验证和 provider cache reset 已落地；归档见 `tasks/spec/phase-m-user-music-source-import-ui.md`。 |
| Phase Pet | 完成 | `PetCompanion` prototype 已接入 Life / Presence，支持拖拽、收起、关闭和角色本体部件变化；归档见 `tasks/spec/phase-pet-companion-prototype.md`。 |
| Phase N | 完成 | Web Audio analyser 优先，Native / 能力不足时使用明确标记的 playback envelope fallback；归档见 `tasks/spec/phase-n-real-audio-breath.md`。 |
| DeepSeek 复核 | 完成 | 采纳 mood-rules 驱动和 chatTurnPlanner 编排测试；SVG Pet 与大文件拆分按风险分阶段处理。 |
| Foundation R1 | 完成 | `profileStore.ts` 收窄为 IO 入口，解析逻辑迁到 `profileParsers.ts` 并补纯 parser 测试。 |
| Foundation R2 | 完成 | Resident DJ 情绪和 Critic 边界拆出到 `djMood.ts` / `djCritic.ts`，主编排继续保持兼容导出。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · DeepSeek 审查复核

- [x] 核对 5 条问题是否真实存在。
- [x] 修复值得立即处理的问题：`mood-rules.md` 驱动 Resident DJ comfort / curve。
- [x] 补 `chatTurnPlanner` 编排测试，覆盖本地资料、Resident DJ 和 resolver 的集成路径。
- [x] 终端命令：运行 `pnpm test`。
- [x] 终端命令：运行 `pnpm test:full`。

### DeepSeek 审查复核 Review

- 采纳：硬编码情绪词表问题部分成立；已让命中的 `mood-rules.md` 可配置 `comfort / curve / constraints`，内置词表只作 fallback。
- 采纳：`chatTurnPlanner` 缺少编排级测试问题成立；已新增从资料文件到 resolver 的集成测试。
- 暂不采纳：`profileStore.ts`、`residentDj.ts` 文件偏大是真实结构债，但当前拆分收益低于回归风险。
- 暂不采纳：`PetCompanion` 使用 SVG 是事实，但当前状态频率和 prototype 目标可接受；迁移 Skia 应等更高频形变需求明确后再做。

---

## 当前任务 · Foundation R1 Profile Parser 边界

- [x] 新增 `profileParsers.ts`：承接 playlists / simple-playlists / jsonl / routines / mood-rules 解析逻辑。
- [x] 收窄 `profileStore.ts`：只保留文件 IO、append-only 事件写入和 profile 目录入口。
- [x] 保持现有资料格式、返回结构和测试行为不变。
- [x] 新增纯 parser 测试，避免解析层只靠 IO 测试间接保护。
- [x] 终端命令：运行 `pnpm test`。
- [x] 终端命令：涉及个人资料和 `/api/chat` 入口后运行 `pnpm test:full`。

### Foundation R1 Review

- 结果：`profileStore.ts` 从 765 行收窄到 162 行，只保留资料目录读取、append-only listening event 写入和入口编排。
- 结果：新增 `profileParsers.ts` 作为纯解析层，承接 playlists / simple-playlists / insights / events / routines / mood-rules。
- 验证：终端命令 `pnpm test` 通过；移动端 6 个测试文件 / 31 个测试，服务端 16 个测试文件 / 72 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。

## 当前任务 · Foundation R2 Resident DJ 边界拆分

- [x] 核对 `residentDj.ts` 过大问题：主文件仍同时承接 mood fallback、编排、策展和 Critic。
- [x] 新增 `djMood.ts`：承接 mood-rules 优先和内置情绪 fallback。
- [x] 新增 `djCritic.ts`：承接主播文案审查、结构化计划审查和安全降级文案。
- [x] 保持 `residentDj.ts` 对外导出兼容，避免改动 `chatTurnPlanner` 调用方。
- [x] 终端命令：运行 `pnpm --filter server test`。
- [x] 终端命令：运行 `pnpm test`。
- [x] 终端命令：涉及 `/api/chat` 编排路径，运行 `pnpm test:full`。

### Foundation R2 Review

- 结果：`residentDj.ts` 从 997 行收窄到 786 行，主文件继续保留编排、记忆证据和策展逻辑。
- 结果：情绪 fallback 中文词表已从主编排文件移到 `djMood.ts`，`mood-rules.md` 仍保持优先。
- 结果：Critic 逻辑已从主编排文件移到 `djCritic.ts`，不改变播放队列、不伪造播放结果。
- 验证：终端命令 `pnpm --filter server test` 通过；服务端 16 个测试文件 / 72 个测试通过。
- 验证：终端命令 `pnpm test` 通过；全仓 typecheck、移动端 6 个测试文件 / 31 个测试、服务端 16 个测试文件 / 72 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。
