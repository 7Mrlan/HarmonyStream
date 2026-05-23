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
- [x] Phase D：音乐来源接入，优先服务端返回真实 `Track`
- [x] Phase D.5：音源与播放性能地基，流式传输 / 缓存 / 预加载
- [x] Phase E：TTS 入声与 `tts-ready` 推送
- [ ] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务

---

## 已完成摘要

| 阶段 | 状态 | 摘要 |
|---|---:|---|
| UI 动画架构 | 完成 | 高频动画准入规则已沉淀：Reanimated + Skia / Web canvas。 |
| Phase A | 完成 | 服务端 HTTP / WS 与内存电台状态打通。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS。 |
| Phase C | 完成 | DeepSeek LLM 主播接入；无 key fallback 和真实 LLM 均验证通过。 |
| Phase C+ | 完成 | DJ 等待态改为调频加载动画；移除本地假等待文案。 |
| Phase D | 完成 | 服务端音乐解析优先返回真实 `Track`，artwork 贯通到移动端，provider 失败稳定回退 SoundHelix。详细 Review 见 `tasks/spec.md` §6。 |
| Phase D.5 | 完成 | provider chain（local→external→ncm?→fallback）+ TTL/LRU cache + Range route + 客户端 60% 预热 + metrics 全过 typecheck/lint/curl；真实 provider 运行时验证留待用户配置后跑。详见 `tasks/spec.md` §6.2。 |
| Phase E | 完成 | `msedge-tts` 接入；`/api/chat` 立返 + WS 后推 `tts-ready` + `/media/tts/:id` 200；移动端独立 `useTtsPlayer` + 音乐 ducking 0.3 + DJBubble REPLAY；voice 徽章合并到 DJ 顶栏；HTTP/WS/移动端三链验证通过。详见 `tasks/spec.md` §6.3。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · Phase F（待启动）

- [ ] 写 Phase F 现状分析（后台播放、锁屏控制、APK release、长时运行）
- [ ] 等待用户确认现状分析
- [ ] 写功能点与文件级计划
- [ ] 写风险与决策
- [ ] HARD-GATE 后启动编码
