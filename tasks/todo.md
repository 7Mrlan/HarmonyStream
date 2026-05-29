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
- [x] Phase Pet：Claudio 灵动系统伴侣 prototype（Skia 版）
- [x] Phase Pet Review：状态一眼可分、动态不是外层位移、不遮挡主流程、性能不拖累播放器
- [x] Phase Pet 验证：终端命令 `pnpm test`
- [x] Phase Pet Commit：`feat: add claudio companion prototype`
- [x] Phase N：真实音频律动
- [x] Phase N Review：真实 Web Audio 优先、fallback 明确标记、不新建第二播放器、不污染 UI 包业务边界
- [x] Phase N 验证：终端命令 `pnpm test`；终端命令 `pnpm test:full`
- [x] Phase N Commit：`feat: add real audio breath`
- [ ] Phase K：歌曲像素海报（本轮暂缓）
- [ ] Phase Pet Rive 迁移：用户完成 Rive 角色动画资产后重启（详见 `tasks/spec.md` §15）

### Phase M Review

- 结果：用户可在 App SOURCE 面板粘贴 LX-compatible 源脚本，服务端先验证再启用。
- 安全：脚本文本不进入公开状态响应；生产验证仍走 LX child_process worker，不在 Fastify 主进程执行用户脚本。
- 回滚：回滚默认源只禁用本地用户源，不删除脚本，默认双源池仍可用。
- 验证：终端命令 `pnpm test` 通过；终端命令 `pnpm test:full` 通过。

### Phase Pet Review

- 结果：Skia 分层角色 prototype 已接入主界面，来自 Life / Presence 状态驱动。
- 结果：状态一眼可分，支持拖拽、收起、关闭。
- 后续方向：用户确认迁移到 Rive 路线，当前 Skia prototype 作为过渡实现保留。用户自行在 Rive Editor 制作角色动画，完成后通知重启。
- 验证：终端命令 `pnpm test` 通过。

### Phase N Review

- 结果：Web 端优先复用已有 audio element 接 Web Audio analyser；Native 或能力不足时走播放进度 envelope fallback。
- 结果：`MusicSpectrum` 只消费 `intensity / intensitySource` primitive props，不理解移动端业务状态。
- 性能：Web Audio 强度约 12fps 发布，Web canvas effect 不因强度变化反复重建。
- 边界：fallback 来源明确为 `playback-envelope / idle / off`，不宣称真实 PCM / FFT。
- 审查：独立审查 AI 指出全 0 analyser 误标真实、多 audio 误采 TTS 等风险；已补静默降级、URL 匹配和 adapter 测试。
- 验证：终端命令 `pnpm test` 通过；移动端 6 个测试文件 / 31 个测试，服务端 14 个测试文件 / 68 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。
