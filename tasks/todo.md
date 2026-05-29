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

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · L.5 后续主线收束

- [x] Phase M：用户音源导入 UI
- [x] Phase M Review：安全、回滚、失败不影响播放、默认双源仍可用
- [x] Phase M 验证：终端命令 `pnpm test`；终端命令 `pnpm test:full`
- [x] Phase M Commit：`feat: add music source import ui`
- [x] Phase Pet：Claudio 灵动系统伴侣 prototype
- [x] Phase Pet Review：状态一眼可分、动态不是外层位移、不遮挡主流程、性能不拖累播放器
- [x] Phase Pet 验证：终端命令 `pnpm test`
- [x] Phase Pet Commit：`feat: add claudio companion prototype`
- [x] Phase N：真实音频律动
- [x] Phase N Review：真实 Web Audio 优先、fallback 明确标记、不新建第二播放器、不污染 UI 包业务边界
- [x] Phase N 验证：终端命令 `pnpm test`；终端命令 `pnpm test:full`
- [x] Phase N Commit：`feat: add real audio breath`
- [x] 最终推送：终端命令 `git push origin lwx`

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

### Phase M Review

- 结果：用户可在 App SOURCE 面板粘贴 LX-compatible 源脚本，服务端先验证再启用。
- 安全：脚本文本不进入公开状态响应；生产验证仍走 LX child_process worker，不在 Fastify 主进程执行用户脚本。
- 回滚：回滚默认源只禁用本地用户源，不删除脚本，默认双源池仍可用。
- 验证：终端命令 `pnpm test` 通过；终端命令 `pnpm test:full` 通过。

### Phase Pet Review

- 结果：Claudio Signal Keeper 已作为系统伴侣 prototype 接入主界面。
- 结果：宠物状态来自 L.5 Life / Presence，不另造无来源假状态。
- 边界：角色本体部件会变化；当前 `listen` 不宣称真实 FFT。
- 验证：终端命令 `pnpm test` 通过。

### Phase N Review

- 结果：Web 端优先复用已有 audio element 接 Web Audio analyser；Native 或能力不足时走播放进度 envelope fallback。
- 结果：`MusicSpectrum` 只消费 `intensity / intensitySource` primitive props，不理解移动端业务状态。
- 性能：Web Audio 强度约 12fps 发布，Web canvas effect 不因强度变化反复重建。
- 边界：fallback 来源明确为 `playback-envelope / idle / off`，不宣称真实 PCM / FFT。
- 审查：独立审查 AI 指出全 0 analyser 误标真实、多 audio 误采 TTS 等风险；已补静默降级、URL 匹配和 adapter 测试。
- 验证：终端命令 `pnpm test` 通过；移动端 6 个测试文件 / 31 个测试，服务端 14 个测试文件 / 68 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。
