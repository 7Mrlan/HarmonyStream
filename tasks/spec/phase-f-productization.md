# Phase F：后台播放 / 锁屏 / APK 产品化

> 本文归档 Phase F 已完成的后台播放、锁屏 metadata、APK 构建入口与真实闭环验收前置修复。当前活跃阶段以后以 `tasks/spec.md` 的“当前活跃索引”和“产品迭代路线图”为准。

---

## 1. SDK 56 后台播放 / 锁屏 / APK

### 1.1 决策

- 当前基线：Expo SDK 56，`expo-audio@56.0.9` 已在本地源码确认支持 `setAudioModeAsync`、`AudioPlayer.setActiveForLockScreen`、`updateLockScreenMetadata`、`clearLockScreenControls`。
- 锁屏方案：优先走 `expo-audio` 自带锁屏能力，不安装 `react-native-track-player`，避免双播放器宿主复杂度。
- 音频会话：全局只配置一次 `setAudioModeAsync`；`playsInSilentMode=true`、`shouldPlayInBackground=true`、`interruptionMode='doNotMix'`、`shouldRouteThroughEarpiece=false`、`allowsRecording=false`。
- 后台权限：`expo-audio` config plugin 显式启用 `enableBackgroundPlayback`，并关闭未使用的 `recordAudioAndroid`，避免申请无实际用途的录音权限。
- 锁屏 metadata：`useRadioPlayer` 只暴露最小 `lockScreenPlayer` 边界；`useNowPlayingMedia` 负责 `setActiveForLockScreen`、metadata 更新与清理。
- Expo Audio 56 没有真正的 next-track JS 回调；锁屏验收只承诺 PLAY/PAUSE 与 metadata，不把 seek forward 伪装成 NEXT。
- TTS ducking：仍由应用内 `radio.setVolume(tts.playing ? 0.3 : 1)` 完成；系统级 `doNotMix` 是为了锁屏控件归属和长后台播放稳定性。
- APK：走 EAS local preview APK；原生工程产物不得提交。

### 1.2 执行顺序

1. F.A：挂载 `useAudioSession()`，配置 `expo-audio` 后台播放 plugin，验证 Expo config。（已完成）
2. F.B / F.E：WS 重连与 server graceful shutdown 运行时验收。（已完成）
3. F.C：在 `useRadioPlayer` 边界上接 `setActiveForLockScreen` 和 metadata 更新。（代码已完成）
4. F.D：补 `eas.json`、APK scripts、ignore 规则，并跑 APK 构建前检查。（已完成）
5. Android 真机：安装 APK / dev build 后验证锁屏 metadata、PLAY/PAUSE、后台连续播放。（作为后续真机回归项，不再作为活跃开发阶段）

### 1.3 验证口径

- 终端命令：`pnpm typecheck`
- 终端命令：`pnpm lint`
- 终端命令：`pnpm --filter @claudio/mobile exec expo config --type public`
- 终端命令：启动服务端后 `Ctrl+C`，5s 内看到 shutdown ok。
- Android 真机操作：发消息、播放、TTS ducking、后台 / 锁屏连续播放。
- APK 验收：`eas build --local` 产物可 sideload 安装并启动。

---

## 2. 真实闭环验收前置修复

> 本阶段经历一次纠偏：诊断 UI / 状态 API 不等于产品入口；当前仅保留用户输入显示修复，真实 LLM / 音源配置入口重新设计。

### 2.1 代码现状

- 用户输入提交链路已经存在：`apps/mobile/app/index.tsx` / `handleSend` 会调用 `apiClient.sendChat({ text, voice: ttsEnabled })`，成功后更新 DJ 文案、连接状态，并调用 `refreshNowAndNext()` 拉取当前曲与下一曲。
- 用户气泡显示仍是静态占位：`apps/mobile/app/index.tsx` / `HomeScreen` 固定渲染 `<UserBubble text="好听" name="MMGUO" time="21:09" />`，没有保存最近一次用户输入，也没有把 `handleSend(text)` 的文本回填到 UI。
- 服务端聊天主链路已经能按输入更新内存电台状态：`server/src/state/radioState.ts` / `handleChat` 会读取 `request.text`，调用 `resolveTracksForChat()` 得到候选曲，再写入 `radioState.currentTrack` 与 `radioState.queue`。
- 当前真实 LLM 未启用时会稳定回退：`server/src/llm/llmAdapter.ts` / `generateDjResponse` 在当前模型 provider 没有 API key 时返回 `ok:false`，调用方会使用 mock fallback 文案。
- 音乐 provider 机制只在服务端环境变量层启用：`server/src/music/providerRegistry.ts` / `buildProviderChain` 根据 `MUSIC_PROVIDER_CHAIN` 或默认链组装 `local -> external -> ncm? -> fallback`；`local` 依赖 `MUSIC_LIBRARY_DIR + MEDIA_BASE_URL`，`external` 依赖 `EXTERNAL_MUSIC_RESOLVER_URL`，`ncm` 依赖 `MUSIC_API_BASE_URL`。
- 外部音乐插件当前是进程外 HTTP resolver：`server/src/music/providers/externalResolverProvider.ts` / `searchPlayableTracks` 约定 `POST {base}/search` 返回含可播放 `url` 的 tracks；移动端没有“添加音乐插件 / 配置 resolver”的产品入口。
- TTS 链路只负责 DJ 文案转语音：`server/src/state/radioState.ts` / `handleChat` 在 `request.voice` 为 true 时调用 `scheduleTts(response.say, chatId)`；TTS 不参与音乐搜索，也不会把 fallback 曲自动变成真实音乐。

### 2.2 结论

- Android 真机完整验收必须建立在真实 AI 电台闭环之上；否则只能验证 `expo-audio` 锁屏 / 后台播放能力。
- 真机验收前至少要完成两个前置点：用户发送内容必须在 UI 上真实显示；音乐源状态必须可理解，避免用户误以为“插件已启用但没有生效”。
- 若要验证真实音乐，必须先启用一个真实 provider：本地合法音源目录、外部 HTTP resolver 或显式 NCM 兼容服务；否则系统会按设计回退到 SoundHelix fallback。

### 2.3 功能点与文件级计划

#### 功能点 1：用户输入真实显示

- 目标：发送任意文本后，右侧用户气泡立即显示该文本和当前时间，不再固定为“好听 / 21:09”。
- 范围：只做最近一次用户消息显示；完整多轮聊天记录、持久化历史和滚动定位不进入本阶段。
- 文件计划：
  - `apps/mobile/app/index.tsx` / `HomeScreen`：新增最近用户消息 state，例如 `{ text, time } | null`；`handleSend(text)` 进入请求前先写入该 state，实现乐观显示。
  - `apps/mobile/app/index.tsx` / `HomeScreen`：把固定 `<UserBubble text="好听" name="MMGUO" time="21:09" />` 改为按最近用户消息条件渲染。
  - `packages/ui/src/UserBubble.tsx`：暂不改组件 API；现有 `text/name/time/avatarColor` 已满足本阶段。

#### 功能点 2：真实闭环烟测路径

- 目标：编码完成后先通过 Web / HTTP 证明“输入 -> DJ 文案 -> 当前曲 source -> TTS 文案音频”链路更新，再恢复 Android 真机验收。
- 验证计划：
  - 终端命令：`pnpm typecheck`
  - 终端命令：`pnpm lint`
  - 终端命令：发送两次不同 `/api/chat` 文本，确认 `say` 与 `/api/now.track.title` 随请求变化。
  - 浏览器操作：在 Expo Web 输入不同文本，确认右侧用户气泡更新为真实输入。

### 2.4 风险与决策

- 决策：本阶段不再新增诊断 UI 或诊断 API；只修复确定的用户输入显示 bug。
- 决策：成熟“音乐插件入口 / 音源管理”和 BYO-LLM 后续必须单独立 Spec，先定义用户动作、配置安全边界和交互形态。
- 风险：没有真实 LLM key 和真实 provider 时仍只能走 mock 文案与 SoundHelix fallback；真机验收前必须先完成真实配置入口或明确使用环境变量配置进行烟测。
