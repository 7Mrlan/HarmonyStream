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
| NativeWind 类型链路 | 完成 | React / RN / NativeWind 类型环境已对齐，`className` 类型失败修复并通过 `typecheck` / UI lint。 |
| SDK 56 升级矩阵 | 完成 | Expo 56 / React 19.2.6 / RN 0.85.3 目标矩阵回填；Node 基线更新为 `>=22.13.0`，pnpm 为 `9.0.0`。 |
| SDK 56 清理 | 完成 | 删除 NativeWind 临时 shim、重复 tsconfig 类型入口、无人依赖 override 与过期版本注释；`typecheck` / `lint` / `expo config` 验证通过。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · Phase F（HARD-GATE 已通过，编码进行中）

### Spec 状态

- [x] 现状分析写入 `tasks/spec.md` §10.1
- [x] 用户确认现状分析
- [x] 写入功能点与文件级计划 §10.2
- [x] 写入风险与决策 §10.3
- [x] 用户确认 §10 完整 Spec（决策 1.A、决策 6.A）
- [x] HARD-GATE 通过，开始编码
- [x] §12 同步为 SDK 56 / `expo-audio` 当前真源

### 决策记录

- 锁屏方案：SDK 56 `expo-audio` 自带 `setActiveForLockScreen`，不引入 `react-native-track-player`
- 音频会话：`setAudioModeAsync` 全局只调用一次；锁屏模式使用 `interruptionMode='doNotMix'`
- APK 路径：`eas build --local`（SDK / JDK 后续我带用户安装）
- 执行顺序：F.A 音频会话 → F.B/F.E 运行时验收 → F.C 锁屏 metadata → F.D APK

### 编码任务（最小可验证 → 风险递增）

#### F.B WS 心跳 + 指数退避重连

- [x] `packages/api/src/client.ts`：`connectStream` 重写为带状态机；实现指数退避 0.5→30s + 抖动 ±20%；显式 `close()` 不再重连；新增 `reconnectNow()` API
- [x] `packages/api/src/client.ts`：客户端 25s 发 `{type:'ping'}`；心跳不进入 `StreamEvent`；60s 未收到消息主动 close 触发重连
- [x] `server/src/realtime/streamHub.ts`：处理 `ping` 立即回 `pong`；服务端 30s 主动 ping；连续 2 次未收到客户端任何消息则 close；最后一个客户端断开后清 interval
- [x] `apps/mobile/app/index.tsx`：`onClose` 切 `connecting` 表示重连中；新增 `AppState 'active'` 监听 → 调用 `subscription.reconnectNow()`

#### F.E 服务端 graceful shutdown

- [x] `server/src/index.ts`：注册 `SIGINT/SIGTERM`；先 `app.close()`、再清 streamHub interval、再清 audioStore/musicResolver；15s 强制退出
- [x] `server/src/tts/audioStore.ts`：暴露 `shutdownAudioStore()`
- [x] `server/src/music/musicResolver.ts`：暴露 `shutdownMusicResolver()` 清 resolve cache

#### F.A 音频会话 + 后台权限

- [x] `apps/mobile/app/_hooks/useAudioSession.ts`：新建 hook，`setAudioModeAsync` 一次性配置；锁屏要求 `interruptionMode='doNotMix'`
- [x] `apps/mobile/app/_layout.tsx`：根布局挂载 `useAudioSession()`
- [x] `apps/mobile/app.json`：`expo-audio` 显式开启 `enableBackgroundPlayback`、关闭 `recordAudioAndroid`；iOS `UIBackgroundModes=['audio']`

#### F.D APK 构建脚本

- [x] 仓库根新建 `eas.json`：profiles development/preview/production；preview = APK
- [x] `apps/mobile/package.json`：scripts 加 `build:apk` 与 `build:apk:cloud`
- [x] `apps/mobile/package.json`：显式加入 `eas-cli@19.0.8` devDependency，避免依赖全局 EAS
- [x] 仓库根 `.gitignore`：补 `apps/mobile/android` / `apps/mobile/ios` / `*.apk` / `*.aab`

#### F.C 锁屏控制（expo-audio）

- [x] `apps/mobile/app/_hooks/useRadioPlayer.ts`：只暴露 `lockScreenPlayer` 最小边界，支持锁屏 metadata 绑定
- [x] `apps/mobile/app/_hooks/useNowPlayingMedia.ts`：独立副作用 hook，调用 `setActiveForLockScreen` / `updateLockScreenMetadata` / `clearLockScreenControls`
- [x] `apps/mobile/app/index.tsx`：调用 `useNowPlayingMedia({ player, track, active })`，同步 title / artist / artwork
- [ ] Android 真机：锁屏控件显示当前曲 metadata；PLAY/PAUSE 可控；后台 ≥ 60s 持续播放

### 验证

- [x] 终端命令：`pnpm typecheck` 全仓过
- [x] 终端命令：`pnpm lint` 全仓过
- [x] 终端命令：`pnpm --filter @claudio/mobile exec expo config --type public` 输出后台播放权限，且没有多余 `RECORD_AUDIO`
- [x] WS：模拟服务端断开并重启 → 自动重连 connected
- [x] 服务端：`SIGINT` handler 5s 内干净退出
- [ ] Android 真机：锁屏 ≥ 60s 音乐持续；锁屏 PLAY/PAUSE 远程键回调正确
- [ ] APK：`eas build --local` 产物可 sideload 安装并启动
- [ ] APK 前置环境：EAS 已登录，JDK 与 Android SDK / adb 已配置

### Review

- 结果：F.A 已完成。音频会话在根布局全局挂载一次，`expo-audio` 使用 `doNotMix` 满足锁屏控制前置条件；配置插件开启后台播放并关闭未使用的录音权限。
- 证据：终端命令 `pnpm typecheck`、`pnpm lint`、`pnpm --filter @claudio/mobile exec expo config --type public` 均通过；Expo config 输出 `enableBackgroundPlayback: true`、`recordAudioAndroid: false`、`FOREGROUND_SERVICE_MEDIA_PLAYBACK`，未出现 `RECORD_AUDIO`。
- 结果：F.B/F.E 运行时验收完成；修复了 Node 22 WebSocket 失败连接只触发 `error` 时不会继续重连、以及 `close()` re-entrant error 噪音过多的问题。
- 证据：临时端口验收脚本输出 `openCount=2`、`queueEventCount=2`、`errorCount=1`；服务端 `SIGINT` handler 验收 `exitCode=0`、`elapsedMs=2966`；全仓 `pnpm typecheck` 与 `pnpm lint` 通过。
- 结果：F.C 代码接线完成。锁屏逻辑被隔离到 `useNowPlayingMedia`，`useRadioPlayer` 只暴露最小 `lockScreenPlayer` 边界；未把下一曲伪装成 seek forward。
- 证据：终端命令 `pnpm typecheck`、`pnpm lint`、`pnpm --filter @claudio/mobile exec expo config --type public`、`git diff --check` 均通过；Android 真机锁屏验收仍待执行。
- 结果：F.D 构建入口完成。`eas.json` 的 preview profile 解析为 `distribution=internal` + `buildType=apk`；mobile build 脚本使用本地依赖的 `eas-cli@19.0.8`。
- 证据：终端命令 `pnpm --filter @claudio/mobile exec eas --version` 输出 `eas-cli/19.0.8`；`@expo/eas-json` 本地解析 preview profile 为 APK；`pnpm typecheck`、`pnpm lint`、`expo config`、`git diff --check` 均通过。`eas build:inspect` 因未登录 EAS 停在账号提示，未进入构建阶段。
- 环境探测：当前终端 `java` 不存在，`ANDROID_HOME / ANDROID_SDK_ROOT` 为空，`adb` 不在 PATH，`eas whoami` 显示未登录；因此 APK 真实构建与 Android 真机验收保持未完成。
