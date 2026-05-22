# Claudio · 项目决策真源（Spec）

> 本文件是项目的唯一真源（Single Source of Truth）。
> 任何代码与本文件冲突，错的是代码。
> 任何方向调整，先改本文件，再改代码（Reverse Sync 原则）。

---

## 0. 一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂你的听歌习惯，规划声音，像 DJ 那样播报。
Android 优先，iOS / mac 桌面后续复用。

---

## 1. 风格关键词

> 赛博暗夜电台 · 像素终端 · 单色高反差 · 一抹荧光绿

---

## 2. 平台路线（段一锁定）

| 维度 | 决策 |
|---|---|
| 跨端框架 | Expo + React Native + TypeScript |
| 样式方案 | NativeWind（Tailwind for RN）|
| MVP 平台 | **Android only** |
| 后续平台 | iOS（同源复用）→ mac 桌面（react-native-macos 或 Tauri 壳）|
| 包管理 | pnpm workspaces |
| 状态管理 | zustand |
| 仓库形态 | Monorepo（前后端同仓）|
| 调试方式 | 三档并用：Expo Web（UI）/ Expo Go 扫码 / Android Emulator（后台播放验证） |

---

## 3. UI 设计 Token（段二锁定）

### 3.1 颜色（仅 7 个，强约束）

| Token | 值 | 用途 | 同屏频次上限 |
|---|---|---|---|
| `bg` | `#000000` | 主背景 | 全屏底 |
| `panel` | `#0a0a0a` | 卡片/面板 | ≤ 5 处 |
| `line` | `#1f1f1f` | 边框/分隔 | 不限 |
| `text` | `#e8e8e8` | 主文字（米白）| 不限 |
| `muted` | `#6b7280` | 次文字 | 不限 |
| `accent` | `#00ff88` | 唯一点睛色 | **≤ 3 处** |
| `live` | `#ff3355` | 错误 / LIVE 红 | ≤ 1 处 |

### 3.2 字体（必须本地打包）

| 角色 | 字体 | 文件 | 许可 |
|---|---|---|---|
| 时钟 / 数字 / 英文标题 | PixelOperator | PixelOperator.ttf | CC0 |
| 英文正文 / 对话 | VT323 | VT323-Regular.ttf | OFL |
| **中文全场景** | **Cubic 11** | Cubic_11.ttf | OFL |

### 3.3 字号阶梯（仅 4 档）
`12 / 16 / 24 / 72`

### 3.4 间距（4 的倍数）
`4 / 8 / 12 / 16 / 24 / 32`

### 3.5 圆角
`0`（绝大多数）/ `6px`（按钮、徽标）。禁用 `rounded-full` 大块面。

### 3.6 动效
- 状态切换 ≤ 200ms，统一 `ease-out`
- 唯一软动效：ON AIR 圆点呼吸（1s 循环 opacity 0.4↔1）
- 像素风跳变：进度条按字符宽度跳进
- 全屏扫描线 opacity 0.04 极淡叠加

### 3.7 亮色模式
**v1 不做**，v2 评估"报纸风"亮色再说。

---

## 4. 组件清单（段二锁定，v1 共 12 个）

| # | 组件 | 用途 |
|---|---|---|
| 1 | `<PixelClock>` | 大号像素时钟 |
| 2 | `<OnAirIndicator>` | 呼吸圆点 + ON AIR |
| 3 | `<DateLine>` | 周/日期行 |
| 4 | `<DotMatrixBackground>` | 点阵网格背景 |
| 5 | `<ScanlineOverlay>` | 全屏扫描线叠加 |
| 6 | `<NowPlayingBar>` | 当前曲信息 + 进度条 |
| 7 | `<PlayerControls>` | 播放控件（8 按钮） |
| 8 | `<DJBubble>` | DJ 长文对话气泡 |
| 9 | `<UserBubble>` | 用户短回复气泡 |
| 10 | `<ChatInput>` | 输入框 + 麦克风 + 发送 |
| 11 | `<TopBar>` | 头像 + Logo + Login + 主题切换 |
| 12 | `<PixelPetSwitcher>` | 像素宠物（模型切换器） |

> v2 增强：`<EmptyState>` / `<ErrorState>` / `<WaveformBars>` / `<ConnectionStatus>`。

---

## 5. 项目骨架（段三锁定）

```
cloudeMplatform/
├── .trae/
│   ├── skills/                  ✅ 9 个项目 skill 已建
│   └── rules/
├── apps/
│   ├── mobile/                  Expo App
│   └── desktop/                 v2 占位
├── packages/
│   ├── ui/                      跨端 UI 组件（含 token 真源）
│   ├── core/                    业务逻辑（无 UI 依赖）
│   ├── api/                     后端通信层（前后端共享类型）
│   └── tsconfig/                共享 TS 配置
├── server/                      Fastify 后端
├── tasks/
│   ├── spec.md                  ✅ 本文件
│   ├── todo.md                  迭代清单
│   └── lessons.md               教训沉淀
├── pnpm-workspace.yaml
├── package.json
└── Agents.md
```

### 5.1 包命名空间
`@claudio/ui` / `@claudio/core` / `@claudio/api` / `@claudio/tsconfig`

### 5.2 依赖关系（强约束）
```
apps/mobile  →  ui / core / api
ui           →  core（仅类型）
core         →  api
api          →  无（最底层）
```
ESLint `no-restricted-imports` 强制约束反向依赖。

### 5.3 Token 真源
`packages/ui/tailwind-tokens.js` 是颜色/字体/间距的唯一定义点，所有 app 引用同一份。

---

## 6. 后端服务（段四锁定）

### 6.1 技术栈

| 维度 | 选型 |
|---|---|
| 语言 | TypeScript + Node.js 20 LTS |
| HTTP 框架 | Fastify |
| ORM | Drizzle + better-sqlite3 |
| 进程管理 | tsx watch（dev）/ pm2（prod）|
| 任务调度 | node-cron |
| WebSocket | @fastify/websocket |
| HTTP 客户端 | undici |

### 6.2 LLM 多模型适配（v1 三家）

| Provider | 计费 | 宠物 | 状态 |
|---|---|---|---|
| **DeepSeek** | ~¥1/1M tokens | 🐋 深海蓝鲸 | ✅ v1 主力 |
| **通义千问** | 100 万免费 / ¥1.6/1M | 🐼 橙白熊猫 | ✅ v1 |
| **智谱 GLM-4-Flash** | 完全免费 | 🦊 紫色狐狸 | ✅ v1 |
| Kimi | 免费额度 + ¥12/1M | 🌙 月兔 | 🟡 v2 备选 |

所有 Provider 走 OpenAI 兼容协议，统一适配器接口 `LLMProvider`。

### 6.3 TTS 方案（v1 单家 + 自动降级备选）

- **v1 主力**：Edge TTS（完全免费、零配置、走 npm `msedge-tts`）
- **降级备选**：豆包（火山引擎 TTS，需 appid+token，按 ¥0.7/万字）
- 缓存策略：`sha256(text + voice + provider)` 落 `data/cache/tts/<hash>.mp3`

### 6.4 网易云音乐
- `NeteaseCloudMusicApi` 作为 git submodule 接入 `server/ncm/`
- 独立进程跑（端口 3000）
- 主服务（端口 8080）通过 HTTP 调用

### 6.5 鉴权
- v1：静态 token（`.env` 配置 `SHARED_TOKEN`，请求头 `Authorization: Bearer <token>`）
- v2：JWT + 账号密码（看 LOGIN 按钮启用时机）

### 6.6 HTTP 契约（前后端共享类型）

| 路径 | 方法 | 用途 |
|---|---|---|
| `/api/chat` | POST | 用户对话 |
| `/api/now` | GET | 当前曲 |
| `/api/next` | GET | 下一曲（Claude 提前规划）|
| `/api/taste` | GET | 品味画像 |
| `/api/plan/today` | GET | 节律安排 |
| `/api/models` | GET | 可用模型列表 |
| `/api/models/switch` | POST | 切换当前模型 |
| `/stream` | WS | 服务端推（now-playing / chat-token / tts-ready / queue-update） |

### 6.7 部署形态
- **开发期**：本机起 server 8080 + ncm 3000，手机连局域网 IP
- **MVP 期**：单台 1 核 1G 云主机，docker compose + Caddy HTTPS

---

## 7. 像素宠物切换器（段四特色）

| 模型 | 宠物 | 性格 |
|---|---|---|
| DeepSeek | 🐋 深海蓝鲸 | 冷静、博学、善长文 |
| 千问 | 🐼 橙白熊猫 | 接地气、爱用网络梗 |
| 智谱 | 🦊 紫色狐狸 | 灵巧、好奇 |
| Kimi（v2）| 🌙 月兔 | 温柔、长记性 |

- 主屏右下角 32×32 像素宠物，**点击切换模型**
- 切换时 4 帧像素变身动画
- 顶部 DJ 气泡前缀变化："Claudio 🐋 (DeepSeek)"
- 长按宠物 → 弹出"宠物档案"面板
- **资源方案**：代码生成 SVG 帧动画（不依赖外部美术资源）

---

## 8. 迭代地图（段五锁定）

| Iter | 名称 | Done 标志 |
|---|---|---|
| 0 | 骨架 | 浏览器看到 PixelClock 渲染 21:11 |
| 1 | 静态主屏 | 12 个组件齐全，对照效果图 < 10% 差异 |
| 2 | 播放打通 | 锁屏能控制音乐 |
| 3 | 大脑接入 | DJ 真实回复（DeepSeek） |
| 4 | 宠物切换 | 三只宠物切换 + 风格差异 |
| 5 | TTS 入声 | DJ 开口说话 |
| 6 | 真实音乐 | 网易云直链落地 |
| 7 | 节律调度 | 早间自动开播 |
| 8 | 打磨发版 | APK v0.1.0 |

---

## 9. 项目硬约束（来自 Agents.md）

- 全栈 TypeScript，禁用 `any`
- 所有函数和关键逻辑必须中文多行注释 `/* */`
- 组件式开发，复用优先
- 不改无关逻辑、结构、文件
- 默认不创建说明文档（README/设计文档），除非显式要求

---

## 10. 2026-05-21 播放器霓虹控制台迁移（现状分析）

### 10.1 当前代码现状

- `packages/ui/src/NowPlayingBar.tsx` / `WaveformBars`：已有 32 根频谱条，使用 `setInterval` 和高度数组模拟波动，但缺少用户提供版本里的 48 根高对比渐变柱、LED cap 下落、中心衰减和爆发式上升 / 阻尼下落算法。
- `packages/ui/src/NowPlayingBar.tsx` / `NowPlayingBar`：已有曲名、艺人、状态、进度条和 seek 功能，功能可保留；视觉目前是横向信息行 + 进度条，不是用户提供的居中标题、玻璃控制面板、霓虹状态条布局。
- `packages/ui/src/NowPlayingBar.tsx` / `OrbitCoreHead`：已有拖动头呼吸与旋转动效，只服务于进度条拖动，不等同于用户提供的播放按钮呼吸、SVG 切换和点击涟漪。
- `packages/ui/src/PlayerControls.tsx` / `PixelButton`：当前按钮使用文本符号 `≪ / ▶ / ≫`，未使用用户提供的 SVG path；已有按压反馈但不是玻璃按钮、弥散阴影、涟漪和主按钮图标切换动效。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：播放、暂停、上一首、下一首、停止、seek 等真实功能已由现有 Hook 提供；本次迁移只替换 UI 和动效，不改播放功能来源。

### 10.2 待确认方向

- 以用户提供 HTML 的按钮 SVG、霓虹绿、玻璃面板、按钮呼吸、点击涟漪、频谱柱和 LED cap 动画为准。
- 继续使用 React Native `Animated` / `Pressable` / `View` 实现，不引入 GSAP 或 Web DOM 依赖，避免破坏 Expo / Android 兼容。
- 功能仍走项目现有 props 与 `useRadioPlayer`，不把 HTML demo 里的假曲库状态迁入业务层。
- 用户已确认：按钮大小按当前系统布局重新评估，不照搬 HTML 尺寸；频谱条位置保持 `NowPlayingBar` 当前左侧位置；在频谱条上方加入用户示例中的 LED 灯条 / cap 效果。
- 中等及以上复杂度任务必须先写 Spec，HARD-GATE 后再编码
- 任务未经验证不得标记完成

---

## 10. 变更记录

| 日期 | 变更 | 触发 |
|---|---|---|
| 2026-05-21 | 初版建立（段一-五全部锁定） | 用户启动项目 |
---

## 2026-05-22 动画架构升级与 Git 管理 Spec

### 1. 现状分析（待确认）

- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：进度条拖动目前走 React Native responder 事件、`seekByLocalX`、`targetRef`、RAF 插值和 `setRenderFrame`，拖动过程仍会穿过 JS 线程与 React state。用户感受到的“拖动有延迟”主要来自 `onResponderMove` 高频事件、`setState` 更新 SVG、以及拖动过程中同步触发 `onSeek` 的播放器调用。
- `packages/ui/src/NowPlayingBar.tsx` / `ChargeParticles`：粒子仍使用 RAF + `setParticles`，虽然已按播放状态启停，但仍属于 JS 线程驱动，长时间运行或拖动时会与进度条抢 JS 预算。
- `packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum`：上一轮已把主频谱从每帧 `setVisualizerFrame` 改为 `Animated.Value` 更新，但仍运行在 JS 侧 RAF。它比原来轻，但还不是 UI 线程或 Skia 绘制管线。
- `apps/mobile/package.json` / dependencies：当前没有 `react-native-reanimated` 与 `@shopify/react-native-skia`；已有 `react-native-worklets`，但 `apps/mobile/babel.config.js` / `plugins` 仍为空。
- `apps/mobile/babel.config.js` / Babel 配置：文件注释提到 Reanimated 3.16+ 与 `react-native-worklets/plugin`，但当前没有真正启用插件。若接入 Reanimated，需要按 SDK 52 兼容方式验证 Babel 配置。
- `D:/code/cloudeMplatform` / Git：执行终端命令 `git init` 后已生成 `.git`，当前所有项目文件处于未跟踪状态。`.gitignore` 已排除 `node_modules/`、`.expo/`、`android/`、`ios/`、构建产物和日志，适合作为首个版本管理基线。
- 官方兼容信息：Expo SDK 52 的 Reanimated 文档列出 bundled version `~3.16.1`，Skia 文档列出 bundled version `1.5.0`；因此安装应优先通过 Expo 兼容安装命令，而不是手写 latest 版本。

参考出处：`https://docs.expo.dev/versions/v52.0.0/sdk/reanimated/`、`https://docs.expo.dev/versions/v52.0.0/sdk/skia/`

### 2. 功能点与改造边界（待确认）

- 布局调整：`apps/mobile/app/index.tsx` / `HomeScreen` 中，当前 `NowPlayingBar` 内的进度条造成标题下方大面积空白。改造后 `NowPlayingBar` 只负责歌曲标题、艺人和状态；进度条抽成独立可复用组件，放到 `MusicSpectrum` 和 `PlayerControls` 之间。这样截图红框空白区域收掉，进度条跟随频谱下方成为“播放控制区”的一部分。
- 进度条拖动手感：新进度条使用 Reanimated + Gesture Handler 的拖动路径。拖动中只更新 UI thread shared value，飞船、填充、尾焰、粒子立即响应手指；播放器 `seek` 不在每一个 move 事件里调用，改为拖动结束提交，或以低频节流提交，避免音频 seek 阻塞拖动视觉。
- 进度条播放联动：未拖动时，进度条根据 `position / duration / playing / trackKey` 同步。播放时持续前进，暂停时冻结，切歌时立即重置本地动画缓存。真实播放位置仍以 `useRadioPlayer` 为权威来源。
- 主频谱长期流畅：`MusicSpectrum` 保留当前 48 根柱、LED cap、noise、wave、中间衰减、上升 0.3 / 下降 0.15 / cap 下落 0.8 的视觉参数；迁移到 Skia Canvas 绘制，避免 48 个 React/SVG 子树长期参与动画帧。
- 粒子与尾焰长期流畅：进度条内的电荷粒子、拖动 dust、尾焰闪烁优先进入 Skia 绘制或 Reanimated shared value，保留视觉复杂度，但避免每帧 React `setState` 和数组重建。
- 依赖引入原则：引入 `react-native-reanimated` 是必要项，因为拖动手感需要 UI thread gesture + shared value；引入 `@shopify/react-native-skia` 是必要项，因为频谱/粒子是高频绘制型动画。两者必须使用 Expo SDK 52 兼容版本，不使用 latest。
- 版本管理：保留已初始化的 Git 仓库。编码前先建立一个“当前项目基线”提交；动画升级完成并验证后建立第二个提交，方便比较和回滚。
- 不做的范围：不改播放器业务逻辑、不改歌曲列表、不改按钮组件视觉、不牺牲现有动画效果、不把动画简单降帧或减少元素数量来换性能。

参考出处：
- React Native 官方性能文档强调 JS 线程被阻塞会导致 JS 驱动动画掉帧，并建议使用原生驱动动画：`https://reactnative.dev/docs/performance`
- Reanimated 官方文档说明 worklets 可以在 UI thread 运行，用于响应手势和更新 animated styles：`https://docs.swmansion.com/react-native-reanimated/`
- Gesture Handler 官方 Pan 手势文档用于连续拖动输入：`https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/`
- React Native Skia 官方 Canvas 文档说明 Skia 提供独立渲染 Canvas：`https://shopify.github.io/react-native-skia/docs/canvas/overview`

### 3. 风险与决策（待确认）

- 决策 1：先建 Git 基线，再做依赖与动画重构。当前 `git init` 已完成，但所有文件仍未跟踪。编码前执行一次 `git add` + `git commit` 建立“动画升级前基线”，重构完成后再提交“动画架构升级”。这样如果 Skia/Reanimated 接入不符合预期，可以用 Git 比较和回退，不靠手工猜。
- 决策 2：Reanimated 是进度条拖动的主方案，不是可选装饰。`packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar` 里当前拖动延迟来自 JS responder + React state + 高频 `seek`。新方案用 `GestureDetector` / `Pan` + Reanimated shared value，让拖动视觉在 UI thread 即时响应；只在拖动结束或低频节流时调用 `onSeek`。
- 决策 3：Skia 用在“高频绘制层”，不是替换普通 UI。`packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum`、进度条电荷粒子、拖动 dust 适合 Skia Canvas；标题、按钮、输入框等普通交互 UI 继续用 React Native 组件，避免把所有东西塞进 Canvas 导致维护困难。
- 决策 4：Web 端要有降级路径。Expo SDK 52 Skia 文档明确 Web 需要额外 CanvasKit 加载；如果 CanvasKit 配置或加载成本影响开发体验，Web 端先使用平台专属 Canvas 实现，Native 端使用 Skia，实现同一视觉算法但不同渲染载体。目标是解决当前截图环境的长期卡顿，而不是执着单一技术。
- 决策 5：清理所有高频 JS 动画热点，而不只改一个组件。当前 `rg` 显示高频来源包括 `MusicSpectrum`、`NowPlayingBar`、`ChatInput` 的 RAF，以及若干低频 `setInterval`。本轮优先处理持续高频且画面占比最大的频谱、进度条和粒子；如果验证仍有长期卡顿，再把 `ChatInput` 的 RAF 光效改为 Reanimated 或 CSS/Web 动画。
- 决策 6：验收口径必须包含“长时间运行”。基础验证是 TypeScript、移动端启动、Web 可渲染；性能验收至少包括运行 10-15 分钟无明显掉帧、拖动进度条跟手、播放/暂停/切歌无残留。真正“几个小时”需要用户在目标设备上长测，我会保证代码层没有无界数组增长、未清理 RAF、每帧 React state、每帧 seek 这类会随时间累积的结构性问题。
- 风险 1：依赖安装需要网络。应使用终端命令 `pnpm --filter @claudio/mobile exec expo install react-native-reanimated @shopify/react-native-skia` 或等价命令；如果网络失败，不能手写 latest 版本硬塞。
- 风险 2：Babel 插件可能影响启动。`apps/mobile/babel.config.js` 当前 `plugins: []`，Reanimated/Worklets 插件需要按版本要求放到最后；改完必须清 Metro cache。
- 风险 3：Skia Web 的 CanvasKit 会增加首次加载成本。要避免把首屏卡顿从运行时转移到加载期，因此 Web 端需要延迟加载或 fallback。
- 风险 4：Expo Go 与原生依赖兼容需实测。Expo SDK 52 文档标注 Skia included in Expo Go，但重构后仍必须分别跑 Web 和移动端 TypeScript/启动验证。

参考出处：
- Expo SDK 52 Reanimated 文档：`https://docs.expo.dev/versions/v52.0.0/sdk/reanimated/`
- Expo SDK 52 Skia 文档：`https://docs.expo.dev/versions/v52.0.0/sdk/skia/`
- React Native Skia Web 支持说明：`https://shopify.github.io/react-native-skia/docs/getting-started/web`
- Reanimated worklets UI thread 说明：`https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/`
- Gesture Handler 与 Reanimated 集成说明：`https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/reanimated-interactions/`

---

## 2026-05-22 NowPlayingBar 进度条功能修正 Spec

### 1. 现状分析（已确认）

- `apps/mobile/app/index.tsx` / `HomeScreen`：主页面已经把 `radio.playing`、`radio.position`、`radio.duration`、`radio.seek` 传给 `NowPlayingBar`，并把 `radio.prev`、`radio.toggle`、`radio.next`、`radio.stop` 传给 `PlayerControls`。这说明当前任务不是纯样式替换，而是要让进度条视觉正确消费现有真实播放状态。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：播放、暂停、上一首、下一首、停止、seek 都由 `expo-audio` 播放器驱动；`position` 和 `duration` 也来自播放器状态。
- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：截图红色区域对应组件内额外渲染的 `COORDINATES`、`VELOCITY`、底部时间细线三行信息，其中 `VELOCITY` 是拖动速度调试信息，不应继续作为歌曲时间信息展示。
- `packages/ui/src/NowPlayingBar.tsx` / `ChargeParticles` 与 `PixelShipProgressBar`：粒子、尾焰和 RAF 动画仍在持续运行，视觉状态没有完整跟随 `playing`、切歌后的 `position` 重置和真实 `duration` 变化。
- `packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum` 与 `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：两者都跟随父容器宽度，但进度条内部还有固定 viewBox、附加信息区和负 margin，导致视觉长度没有和主音频频谱条保持一致。

### 2. 功能点与改造边界（已确认）

- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：删除红框中的底部独立时间细线行，只保留进度条本体和上方状态文字。
- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：把 `VELOCITY` 标签改成歌曲时间标签，值显示为 `当前位置 / 总时长`，格式固定为分钟和秒 `m:ss`。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：统一向 UI 暴露秒级 `position` / `duration`，避免 Web 端 `expo-audio` 返回毫秒时被 UI 当成秒。
- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：进度条继续受控于真实 `position / duration / playing / onSeek`，切歌时重置飞船插值、拖动速度和粒子残留。
- `packages/ui/src/NowPlayingBar.tsx` / `PixelShipProgressBar`：进度轨道视觉宽度与 `apps/mobile/app/index.tsx` / `MusicSpectrum` 的父容器宽度对齐。
- `packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum`：保留现有 48 根柱、LED cap、随机 noise、wave、中间衰减、上升 0.3 / 下降 0.15 / cap 下落 0.8 的视觉算法，只把每帧 React `setState` 改为 Animated 值更新，减少长时间运行后的卡顿。

### 3. 风险与决策（已确认）

- 当前项目没有 `react-native-reanimated` 或 `@shopify/react-native-skia`，本轮不新增原生依赖，先用现有 `react-native-svg` 与 React Native `Animated` 做低风险优化。
- 本轮优化不降低动画复杂度、不减少柱子数量、不移除粒子和尾焰；只减少每帧对象分配和 React 组件重渲染。
- 若后续仍需要更强性能，再单独评估引入 Skia 或 Reanimated，并配套 Expo/Android 原生验证。
