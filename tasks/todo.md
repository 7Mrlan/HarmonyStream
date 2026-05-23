# Claudio · 当前执行看板

> `tasks/spec.md` 是决策真源；`tasks/lessons.md` 是踩坑规则库；本文件只放当前任务、状态和必要验收提醒。

---

## 当前规则

- 中等及以上任务：先写分段 Spec，用户确认后再编码。
- 当前阶段若发现偏差：先更新 Spec，再改代码。
- 完成任务必须给验证证据：类型检查、请求结果、运行日志或可操作验收步骤。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- 所有“运行 / 重启 / 打开 / 点击”步骤必须标明执行载体。

---

## 当前主线

**AI 电台最小闭环**

- [x] Phase A：后端 API 骨架与内存电台状态
- [x] Phase B：移动端接入服务端 API
- [x] Phase C：LLM 主播最小接入
- [x] Phase C+：主播等待体验与电台调频加载动画
- [ ] Phase D：音乐来源接入，优先服务端返回真实 `Track`
- [ ] Phase E：TTS 入声与 `tts-ready` 推送
- [ ] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务

---

## Phase D · 音乐来源接入

### Spec 状态

- [x] Phase D 现状分析写入 `tasks/spec.md`
- [x] 确认 Phase D 现状分析
- [x] 写入 Phase D 功能点与文件级计划
- [ ] 确认 Phase D 功能点与文件级计划
- [ ] 写入 Phase D 风险与决策
- [ ] 确认 Phase D 风险与决策
- [ ] HARD-GATE：用户确认完整 Phase D Spec 后开始编码

### 执行任务

- [ ] 新增服务端音乐解析层，输入用户文本 / LLM 曲名，输出可播放 `Track[]`
- [ ] 将 `radioState.ts` 主路径从 SoundHelix mock 切到真实音乐解析优先
- [ ] 保留 SoundHelix 作为 provider 失败 fallback
- [ ] 保持 `/api/chat`、`/api/now`、`/api/next`、`/stream` 契约不破坏移动端
- [ ] 执行服务端、API、移动端和全仓验证

### 明确边界

- 不接 TTS、数据库、长期记忆、后台播放或 APK release。
- 不把音乐 provider key 放到前端或 `EXPO_PUBLIC_*`。
- 不先改播放器架构；只有真实音源暴露跨域、鉴权、重定向或过期 URL 问题时再调整。

---

## 已完成摘要

| 阶段 | 状态 | 摘要 |
|---|---:|---|
| UI 动画架构 | 完成 | 高频动画准入规则已沉淀：Reanimated + Skia / Web canvas。 |
| Phase A | 完成 | 服务端 HTTP / WS 与内存电台状态打通。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS。 |
| Phase C | 完成 | DeepSeek LLM 主播接入；无 key fallback 和真实 LLM 均验证通过。 |
| Phase C+ | 完成 | DJ 等待态改为调频加载动画；移除本地假等待文案。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 下一步

等待确认 `tasks/spec.md` 中 Phase D 的“功能点与文件级计划”。确认后继续写“风险与决策”，再进入最终 HARD-GATE。
