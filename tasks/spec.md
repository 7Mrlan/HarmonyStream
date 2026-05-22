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

### 4. 稳定性执行标准（已补充）

- 项目优先级：移动端是最终目标，浏览器只是当前演示环境。因此架构优先服务 Android / Expo Go / 后续 dev-client 的长期流畅；Web 端必须可演示，但不能反过来限制移动端的高性能路径。
- 稳定性定义：不承诺物理意义上的“永远 60fps”，因为设备发热、系统降频、后台任务和浏览器节流不可控；但代码必须做到没有会随运行时间累积恶化的结构性问题，包括未清理 RAF、每帧 React state、无界数组增长、每帧新建大量对象、每帧 seek、重复启动动画 loop。
- 热路径准入：所有 30fps/60fps 高频动画不得依赖 React state 驱动。允许的路径只有 Reanimated shared value / worklet、Skia Canvas draw loop、原生 Animated transform/opacity、或浏览器端 compositor/canvas。
- 拖动准入：手指移动到视觉响应之间不能依赖播放器 seek 完成。拖动视觉必须本地即时更新；播放器只接收最终位置或节流位置。拖动取消、拖动结束、切歌、暂停必须都有明确状态重置。
- 绘制准入：频谱、粒子、尾焰这类高频视觉不得用 40+ 个 React/SVG 节点逐帧更新。优先单 Canvas 绘制，状态保存在固定长度 typed array 或对象池中，避免每帧创建新数组。
- 生命周期准入：所有动画必须有 mount/unmount 清理；播放暂停、页面离开、切歌都要停止或冻结不必要的循环。
- 验证准入：完成后必须跑 TypeScript；必须通过代码搜索确认高频组件没有 `requestAnimationFrame + setState` 热路径；必须在浏览器演示环境运行观察拖动响应；移动端验证步骤单独列出，用户目标设备长测作为最终稳定性确认。
- fallback 准入：如果 Reanimated + Skia 接入后仍不能满足长期流畅，下一层方案是把主视觉整合为单一 Canvas 场景，并进一步减少 React Native 组件参与动画；不接受通过减少视觉复杂度或删除效果来假装优化。

### 5. 上下文交接锁定版（已确认执行）

- 用户已明确确认执行本次架构升级，但计划切换到新上下文继续；新上下文应按本 Spec 执行，不重新发散方案。
- 当前 Git 基线已由用户提交，提交为 `07fbdd7 第一版`；执行前先确认 `git status --short`，不要覆盖用户未提交改动。
- 执行主线：安装 Expo SDK 52 兼容版本 `react-native-reanimated` 与 `@shopify/react-native-skia`；配置 Babel；把进度条从 `NowPlayingBar` 中抽出，放到 `MusicSpectrum` 与 `PlayerControls` 之间；用 Reanimated + Gesture Handler 重写进度条拖动；用 Skia/Canvas 承接频谱、粒子、尾焰等高频绘制。
- 性能目标：移动端优先，浏览器当前用于演示；代码层消灭随时间恶化的热路径，包括每帧 React state、未清理 RAF、无界数组增长、每帧大量对象分配、每帧播放器 seek。
- 视觉目标：保留当前赛博像素电台风格，不通过减少频谱柱、删除粒子、降低动画复杂度来换性能。
- 验证目标：TypeScript 必须通过；代码搜索确认高频组件没有 `requestAnimationFrame + setState` 热路径；浏览器演示拖动进度条必须跟手；移动端验证步骤需明确标注执行载体。

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

---

## 2026-05-22 动画生命周期与按钮反馈优化 Spec

### 1. 现状分析（已确认）

- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：当前只向 UI 暴露 `playing`、`position`、`duration`、`buffering`，没有显式暴露 `ended`。但 `expo-audio` 的 `AudioStatus` 已提供 `didJustFinish`，可以作为歌曲播完后的权威结束信号。
- `apps/mobile/app/index.tsx` / `HomeScreen`：当前 `MusicSpectrum`、`PlaybackProgressBar`、`PlayerControls` 只消费 `radio.playing`。暂停和播完都会表现为非播放态，但 UI 无法区分“普通暂停”和“歌曲已经结束”，也无法统一进入刷新后的 idle 视觉态。
- `packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum`：Native 路径已使用 Skia，Web 路径已使用单 canvas；但暂停时仍会做一段低位收尾，结束态没有明确重置入场时间和频谱数组。用户希望暂停/播完时快速下落并停止，重新播放时像刷新后一样重新启动。
- `packages/ui/src/PlaybackProgressBar.tsx` / `PlaybackProgressBar`：拖动和视觉动画已使用 Reanimated，但 `flowClock` 和 `flamePulse` 在组件挂载期间持续循环，暂停后只是降低可见度，不是真正停止循环。
- `packages/ui/src/PlayerControls.tsx` / `GlassButton`：按钮反馈已迁移到 Reanimated，但涟漪在 `onPress` 才启动，按压反馈持续时间偏保守，导致用户感觉“点击手感不够迅速”。
- `packages/ui/src/MusicSpectrum.tsx` / `BAR_COUNT`：当前 48 根频谱柱在 Web 已是单 canvas 绘制，在 Native 已是 Skia 绘制。减少到 24 根会降低绘制量，但不是当前卡顿的第一根因；优先级低于动画生命周期停机。

### 2. 功能点与改造边界（已确认）

- `useRadioPlayer` 增加 `ended`：优先使用 `status.didJustFinish`，并用接近总时长且非播放的状态作为兜底，供 UI 进入结束态。
- 播放控制行为：如果已经 `ended`，用户点击播放应先 seek 到 0，再开始播放，避免停在末尾时播放按钮无反馈或状态异常。
- `HomeScreen` 增加统一 `animationActive = radio.playing && !radio.ended`，并传给 `MusicSpectrum`、`PlaybackProgressBar`、`PlayerControls`；进度仍然使用真实 `position / duration`，不伪造播放状态。
- `MusicSpectrum` 增加结束/暂停生命周期：active 变 false 时快速下落到 0 附近并停止；active 再变 true 时重置入场时间，让动画像刷新后第一次播放一样重新进入。
- `PlaybackProgressBar` 增加动画运行开关：播放或拖动时才启动粒子和尾焰循环；暂停/结束后快速淡出并 cancel `withRepeat`，避免 idle 期间空转。
- `PlayerControls` 优化触感：`onPressIn` 立即启动涟漪和快速缩放，缩短反馈动画时长；业务回调仍放在 `onPress`，避免误触发播放控制。
- 不减少 48 根频谱柱作为本轮默认改动；只有后续低端设备实测仍明显掉帧，才评估 `barCount` 响应式降级。
- 不改无关动画组件：`PixelClock`、`OnAirIndicator`、`ScanlineOverlay`、`PixelPetSwitcher`、`ChatInput` 不在本轮改造范围，避免把播放器生命周期优化扩散成全站动画重构。

### 3. 风险与决策（已确认）

- 决策 1：本轮优先“停掉不该运行的动画”，而不是“降低视觉复杂度”。这与新架构正向一致，因为新架构的目标是高频动画不占 JS 且 idle 不空转。
- 决策 2：保留 48 根频谱柱。当前瓶颈更可能来自生命周期和残留循环，贸然减到 24 根会改变视觉密度，但收益不一定明显。
- 决策 3：结束态由播放器状态驱动，不由 UI 组件自行猜测歌曲是否结束。组件只消费 `active` / `ended` 语义，业务状态来源仍集中在 `useRadioPlayer`。
- 决策 4：快速反馈只影响视觉，不提前触发业务回调。`onPressIn` 只做视觉反馈，`onPress` 才执行播放/暂停。
- 验收标准：TypeScript 通过；Web/Android export 通过；`PlaybackProgressBar` 不再在 idle 状态持续 `withRepeat`；Web 频谱 active=false 后会停止 RAF；按钮按下反馈在按下瞬间启动。
- HARD-GATE：用户已在 2026-05-22 明确确认“按你的方案优化”，允许开始编码。

---

## 2026-05-22 Trace 驱动的残留动画迁移 Spec

### 1. 现状分析（已确认）

- `apps/recrod/Trace-20260522T135839.json/Trace-20260522T135839.json`：Chrome Performance trace 录制约 68 秒。主线程 `>=50ms` 长任务只有 6 个，且集中在 DevTools profiling 自身，不像业务代码产生单个长阻塞。
- trace / `FunctionCall`：`react-native-web` 的 `TimingAnimation.onUpdate` 总耗时约 3802ms / 5250 次，`SpringAnimation.onUpdate` 总耗时约 313ms / 177 次，说明首屏仍存在旧 React Native `Animated` 每帧 JS 更新。
- trace / `MusicSpectrum.tsx` / `updateVisualizer`：总耗时约 102ms / 608 次，不是本轮主瓶颈，保留 48 根频谱柱。
- trace / `ChatInput.tsx` / `tick`：仍存在 `requestAnimationFrame` 驱动的输入框边框光效。
- `apps/mobile/app/index.tsx` / `HomeScreen`：全屏 `ScanlineOverlay` 仍在渲染；用户已确认此前就要求去掉，本轮从调用链和导出中移除。
- `packages/ui/src/PixelClock.tsx` / `useColonBreathe`：仍使用 React Native `Animated.loop`。
- `packages/ui/src/OnAirIndicator.tsx` / `useBreathe`、`usePulseRing`：仍使用 `setInterval` 和 React Native `Animated` 递归 loop。
- `packages/ui/src/PixelPetSwitcher.tsx`：宠物漂浮、旋转、点击动作、特效粒子、气泡显隐等仍使用 React Native `Animated`。
- `packages/ui/src/DJBubble.tsx` / `useLiveBlink`：LIVE 红点仍使用 `setInterval` 切 state。

### 2. 功能点与边界（已确认）

- 删除 `ScanlineOverlay`：从 `HomeScreen` 调用、`packages/ui/src/index.ts` 导出和 `packages/ui/src/ScanlineOverlay.tsx` 源码文件中移除，满足用户“从代码里面删掉”的要求。
- 迁移 `PixelClock`：冒号呼吸改为 Reanimated `withRepeat`，不再使用 React Native `Animated`。
- 迁移 `OnAirIndicator`：红点呼吸和扩散环改为 Reanimated，取消 `setInterval` 和递归 `Animated.timing`。
- 迁移 `ChatInput`：边框光点从 `requestAnimationFrame + setState` 改为 Reanimated shared value；未聚焦时停止循环。
- 迁移 `DJBubble`：LIVE 红点从 `setInterval` 切 state 改为 Reanimated opacity。
- 迁移 `PixelPetSwitcher`：将持续循环的漂浮/旋转和交互特效从 React Native `Animated` 迁到 Reanimated；保留必要的业务 `setTimeout` 和低频帧切换。
- 不改频谱柱数量、不重做播放器核心结构、不改视觉主题。

### 3. 风险与决策（已确认）

- 决策 1：本轮优先清理 trace 证明的旧 JS 动画，而不是继续优化频谱。
- 决策 2：移除扫描线是用户明确要求，且它是全屏常驻动画，删除属于正向性能优化。
- 决策 3：对复杂宠物组件采用“替换动画载体、保留 DOM/布局/行为”的迁移方式，避免重写宠物业务逻辑。
- 验收标准：TypeScript 通过；Web/Android export 通过；`rg` 复核首屏目标文件不再包含 React Native `Animated`、`requestAnimationFrame` 动画热路径；保留的 `setInterval` 只能是低频时间/文字/宠物帧业务，不是视觉动画 RAF/Animated 热路径。
- HARD-GATE：用户已在 2026-05-22 明确确认“全屏扫描线删掉，其余动画完成迁移”，允许开始编码。

---

## 2026-05-22 动画框架设计准入规范（已确认）

### 1. 当前结论

- 不是所有 UI 都必须同时使用 Reanimated + Skia；正确架构是按职责分层。
- Reanimated 是默认动画状态层：用于手势、按压反馈、transform、opacity、短促粒子、循环呼吸、拖动进度、动画生命周期开关。
- Skia 是默认高频绘制层：用于频谱、密集粒子、尾焰、大量重复图形、需要 30fps/60fps 连续重绘且节点数量较多的画面。
- React Native 组件仍负责普通布局、文本、按钮结构和可访问交互，不把所有 UI 塞进 Canvas。
- Web 端允许使用单 HTML canvas fallback；前提是不能退回 40+ React/SVG 节点逐帧更新，也不能使用 `requestAnimationFrame + setState` 热路径。
- 低频业务计时器允许保留，例如时钟文字每秒更新、日期每 30 秒更新、打字机文本、宠物 idle 帧切换；它们不属于高频视觉动画热路径。

### 2. 默认选型规则

- 交互动画默认 Reanimated：`withTiming`、`withSpring`、`withRepeat`、`useSharedValue`、`useAnimatedStyle`，启动前先 `cancelAnimation`，unmount 时必须 cleanup。
- 高频绘制默认 Skia：如果一个视觉效果包含大量相似元素、粒子、频谱柱或需要每帧绘制，优先使用 Skia Canvas；Native 端不再使用大量 SVG/React 子节点逐帧更新。
- Web fallback 默认单 canvas：如果 Skia Web 的 CanvasKit 增加开发或加载成本，Web 可以走平台 canvas，但必须具备启动前 cancel、inactive 后停止、数组复用和清空逻辑。
- React state 只能承载业务状态：播放状态、当前曲目、文本内容、低频帧状态可以进 React state；每帧变化的数值不能进 React state。
- 视觉复杂度不靠删除效果换性能：不能默认通过减少频谱柱、删粒子、降动画复杂度解决卡顿；先迁移动画载体和生命周期。

### 3. 新动画准入清单

- 新增 30fps/60fps 动画时，必须说明它属于 Reanimated、Skia、Web canvas fallback 中的哪一类。
- 不允许新增 React Native `Animated.Value` 长循环。
- 不允许新增 `requestAnimationFrame + setState` 动画热路径。
- 不允许在拖动过程中每个 move 都调用播放器 `seek`；拖动视觉先本地响应，业务提交放到结束或节流点。
- 不允许 idle 状态空转动画；暂停、结束、切歌、页面离开都必须有停止或快速收尾策略。
- 验证必须包含 `rg` 热点扫描、TypeScript、Expo export；涉及 `packages/*` 源码后，验收时提醒清 Metro 和浏览器缓存。

### 4. 当前项目状态

- `MusicSpectrum`：Native 使用 Skia + Reanimated shared value；Web 使用单 canvas fallback。
- `PlaybackProgressBar`、`PlayerControls`、`PixelClock`、`OnAirIndicator`、`ChatInput`、`DJBubble`、`PixelPetSwitcher`：视觉动画已迁移到 Reanimated。
- `ScanlineOverlay`：已从调用、导出和源码中删除。
- 当前保留的 `setInterval` / `setTimeout` 只允许是低频业务状态或短生命周期收尾，不作为高频视觉动画方案。

---

## 2026-05-22 后续优化路线 Spec（规划中）

### 1. 当前基线

- `packages/ui/src/MusicSpectrum.tsx` / `MusicSpectrum`：Native 路径使用 Skia + Reanimated shared value，Web 路径使用单 canvas fallback；频谱现在是伪音频律动，不读取真实音乐能量。
- `packages/ui/src/PlaybackProgressBar.tsx` / `PlaybackProgressBar`：拖动、粒子、尾焰、飞船反馈已迁移到 Reanimated；视觉宽度已跟上方频谱和下方控制条对齐。
- `packages/ui/src/PlayerControls.tsx` / `GlassButton`：按钮按压、涟漪、呼吸反馈已迁移到 Reanimated，仍需要真机 release 包验证触感。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：真实播放、暂停、seek、ended 状态已接入 UI；下一阶段需要验证 APK release 下后台、锁屏、切歌和异常网络场景。
- `rg` 当前结果：目标 UI 动画组件不再包含旧 RN `Animated.Value` 长循环；`MusicSpectrum` Web fallback 保留单 canvas `requestAnimationFrame`，这是当前唯一高频 RAF，但不走 React state。

### 2. 路线分阶段

#### Phase 1：真机 release 验收闭环

- 目标：确认浏览器里的丝滑效果在 APK release 包里是否成立。
- 范围：不新增功能，专注性能验证、卡顿复现、缓存与构建链路确认。
- 验收动作：播放 10-15 分钟；连续暂停/播放 20 次；拖动进度条 10 次；切歌 10 次；切后台再回来；观察频谱、按钮、进度条是否迟钝或重复开 loop。
- 产出：记录机型、构建类型、是否发热、是否省电模式、是否 release 包；如果掉帧，再用 trace 或 profiler 定位，不凭体感猜。

#### Phase 2：视觉手感细调

- 目标：把“看起来快”和“摸起来快”调到稳定风格。
- 范围：`MusicSpectrum` 的 attack/decay 参数、`PlaybackProgressBar` 高度/飞船比例、`PlayerControls` 按压时长与涟漪强度。
- 原则：只改参数和局部样式，不改架构，不减少 48 根频谱柱，不删除粒子效果。
- 验收：浏览器和 APK 同一套体验词汇，例如“弹起果断、落下干净、按钮即按即响、拖动不回弹”。

#### Phase 3：真实音频驱动频谱调研与方案选择

- 目标：让频谱从“伪音乐律动”升级到“跟真实音乐能量变化律动”。
- 选项 A：运行时音频分析。优点是最真实；风险是 Expo/Native 音频数据访问、性能、Android 兼容性需要调研。
- 选项 B：预分析 waveform/beat JSON。优点是 APK 运行时成本低、跨平台稳定；风险是需要建立歌曲分析与缓存流程。
- 选项 C：继续伪律动但接入歌曲元数据节奏预设。优点是快；缺点是不是真正跟音乐。
- 推荐：先调研 A 是否可行；如果 Android/Expo 成本高，优先选 B，避免把已稳定的动画架构拖回高风险状态。

#### Phase 4：低端机与长时运行保护

- 目标：让低端 Android 和发热降频场景仍可用。
- 范围：动画预算、可选降级、页面离开停机、后台恢复重置。
- 策略：默认不降视觉；只有真机 release 证明确实掉帧时，才考虑响应式降级，例如降低粒子数量、降低 canvas DPR、减少非核心装饰动画，而不是先砍频谱柱。
- 验收：低端机连续 20 分钟播放不出现交互明显迟钝；暂停/播放不出现越来越卡。

#### Phase 5：自动化质量门禁

- 目标：避免后续新代码把旧动画坑带回来。
- 范围：脚本或检查项，不一定立即写 CI。
- 规则：新增动画前必须说明 Reanimated / Skia / Web canvas fallback 分类；提交前跑 TypeScript、Expo export、热点 `rg`；禁止新增 `Animated.Value` 长循环和 `requestAnimationFrame + setState`。
- 验收：每个动画 PR 或任务都有“技术路径、生命周期 cleanup、验证证据”。

#### Phase 6：播放器产品化能力

- 目标：在动画稳定后，继续推进真正播放器体验。
- 范围：真实歌单、错误恢复、网络状态、后台播放、锁屏控制、APK 发布流程。
- 原则：产品能力不要和动画性能重构混在一个任务里；每次只处理一个意图。

### 3. 下一步建议

- 最高优先级：Phase 1 真机 release 验收。原因是浏览器已经很顺，下一瓶颈不该继续凭感觉调，而是确认 APK 的真实表现。
- 第二优先级：Phase 2 视觉手感细调。原因是它成本低、收益直接，但应建立在 release 表现没有结构性问题的前提上。
- 第三优先级：Phase 3 真实音频驱动。原因是它会改变数据源和音频架构，复杂度明显高于单纯调动画参数，需要单独 Spec 和 HARD-GATE。

---

## 2026-05-22 主线复位 Spec：AI 电台最小闭环（已确认）

> 本节覆盖上一节“后续优化路线”的优先级判断。上一节是 UI / 动画分支路线，不再作为当前主进程。当前主进程回到最初施工图：让 Claudio 先具备 AI 主播、真实音乐来源、服务端 API 和移动端调用闭环。

### 1. 现状分析

- `server/src/index.ts` / `app.get('/health')`：服务端当前只实现 `GET /health` 健康检查；`start` 只负责启动 Fastify 服务。`/api/chat`、`/api/now`、`/api/next`、`/api/taste`、`/api/plan/today`、`/api/models`、`/stream` 都没有真实路由实现。
- `packages/api/src/types.ts` / `ChatRequest`、`ChatResponse`、`NowResponse`、`NextResponse`、`StreamEvent`：共享契约类型已经存在，但只是类型定义；`packages/api/src/index.ts` / top-level export 当前只导出类型，没有 HTTP client 或 WebSocket client。
- `packages/core/src/index.ts` / `CORE_VERSION`：业务核心层仍是占位导出，没有 router、context、LLM adapter、music queue、state store 或 scheduler 逻辑。
- `apps/mobile/app/index.tsx` / `HomeScreen`：主屏已经完成 UI 组装和播放控件接线，但 `DJBubble` 使用本地常量 `DJ_SCRIPT`；`ChatInput` 的 `onSend` 和 `onMicPress` 都是空函数；`ConnectionStatus` 固定显示 connected，没有真实后端连接状态。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：播放器 Hook 能播放音频、暂停、seek、切换曲目，但 `DEFAULT_PLAYLIST` 是 SoundHelix 测试 mp3；注释也标明这是 `v1 mock`，不是网易云、服务端推荐或 AI 选曲结果。
- `server/data/.gitkeep` / data placeholder：服务端数据目录只有占位文件，没有 `taste.md`、`routines.md`、`playlists.json`、`mood-rules.md`、SQLite 状态库或 TTS cache。

### 2. 主线目标

- 第一目标不是继续 UI 微调，而是完成“用户输入 -> 后端理解 -> AI 主播回复 -> 推荐/解析音乐 -> App 播放 -> UI 显示 now-playing”的最小闭环。
- 当前阶段不追求完整电台自动化，也不先做 APK release、锁屏控制、后台播放、真实音频频谱分析；这些都排到 AI 电台闭环之后。
- MVP 必须至少有一条真实 API 调用链，不再允许只靠 mock 文案和测试 mp3 证明进度。

### 3. 分阶段路线

#### Phase A：后端 API 骨架与内存电台状态

- 新增服务端路由模块，先落地 `POST /api/chat`、`GET /api/now`、`GET /api/next`、`GET /api/models`、`POST /api/models/switch` 和 `WS /stream` 的最小实现。
- 先用内存状态保存 current track、queue、messages、current model，避免一上来引入 SQLite / Drizzle 让主线变重。
- `/api/chat` 初期可以先返回可控 mock，但必须走真实 HTTP 路由和共享契约，给移动端接入提供稳定接口。

#### Phase B：移动端接入服务端 API

- `packages/api` 增加轻量 HTTP client，移动端不直接散写 fetch URL。
- `HomeScreen` 的 `ChatInput.onSend` 调用 `/api/chat`；`DJBubble` 显示服务端返回的 `say`；`NowPlayingBar` 和播放器队列消费 `/api/now` / `/api/next`。
- `ConnectionStatus` 改为真实反映 API / WS 连接状态，而不是固定 connected。

#### Phase C：LLM 主播最小接入

- 服务端增加 OpenAI-compatible LLM adapter，优先接 DeepSeek；环境变量缺失时保留 mock fallback，保证开发态可运行。
- LLM 输出先严格限制为 `ChatResponse` 对应结构：`say`、`play`、`reason`、`segue`，避免自由文本污染业务流程。
- prompt 组装先做最小版本：系统人设 + 当前用户输入 + 当前播放状态；`taste.md`、`routines.md` 等长期上下文随后补。

#### Phase D：音乐来源接入

- 服务端增加音乐搜索与解析层，先接网易云搜索 / 直链方案；如果真实直链失败，才回退 SoundHelix 测试曲目。
- 播放器不再内置固定 `DEFAULT_PLAYLIST` 作为主数据源，而是消费服务端返回的 `Track`。
- 频谱仍可保持伪律动；真实音频能量分析不是本阶段目标。

#### Phase E：TTS 入声

- AI 文案链路稳定后再接 TTS，优先 Edge TTS 或项目后续确认的 Fish TTS。
- TTS 结果走 `tts-ready` stream 事件和服务端 cache，不阻塞 `/api/chat` 的文本响应。

#### Phase F：产品化与发布

- AI 主播和真实音乐闭环跑通后，再回头做后台播放、锁屏控制、APK release、长时运行、低端机降级、真实频谱等产品化任务。

### 4. 决策与边界

- 决策 1：当前主进程改为“AI 电台后端闭环”，UI / 动画 release 验收暂时降级为支线。
- 决策 2：先做内存状态，不先做数据库。这样可以最快打通施工图的第二层本地大脑和第四层交互层。
- 决策 3：`/api/chat` 可以从 mock 起步，但必须是服务端真实路由，移动端必须真实调用，不能继续在 `HomeScreen` 写本地常量冒充主播。
- 决策 4：LLM、音乐、TTS 分三步接，不混在同一个大改里。先文本闭环，再音乐闭环，再声音闭环。
- 决策 5：每一步都必须有验证证据：服务端路由请求结果、移动端调用结果、TypeScript 结果；涉及 `packages/*` 源码后提醒清 Metro / 浏览器缓存。

### 5. 下一步

- 先更新 `tasks/todo.md`，把当前下一任务设为“Phase A：后端 API 骨架与内存电台状态”。
- Phase A 属于中等复杂度任务；编码前需要单独列出文件级计划并等待 HARD-GATE。

---

## 2026-05-22 Phase A：后端 API 骨架与内存电台状态 Spec（已确认并执行）

### 1. 现状分析（已确认）

- `server/src/index.ts` / `app.get('/health')`：当前 Fastify 实例直接在入口文件里创建，只注册了健康检查路由；还没有 `routes` 目录、插件注册函数或按模块拆分的路由结构。
- `server/src/index.ts` / `start`：启动逻辑已经统一监听 `0.0.0.0:${env.PORT}`，Phase A 可以保留这个入口，只在 `start` 前增加路由 / websocket 注册，不需要改动启动载体。
- `server/src/env.ts` / `EnvSchema`：当前已支持 `PORT`、`NODE_ENV`、`LOG_LEVEL`、`SHARED_TOKEN`；Phase A 若只做 mock API 和内存状态，暂时不需要新增 LLM / 音乐服务环境变量。
- `server/package.json` / `dependencies`：已有 `fastify`、`@fastify/websocket`、`zod`、`@claudio/api`；Phase A 可以直接使用现有依赖实现 HTTP 路由、WS 路由和基础请求校验，不需要先安装数据库、LLM 或音乐相关依赖。
- `packages/api/src/types.ts` / `ChatRequest`、`ChatResponse`、`NowResponse`、`NextResponse`、`ModelsResponse`、`SwitchModelResponse`、`StreamEvent`：Phase A 所需的主要响应类型已经存在；但 `ChatResponse.play` 当前是 `string[]`，只能表达“推荐歌名”，不能直接承载可播放 `Track` 队列。
- `packages/api/src/types.ts` / `Track`：`Track` 已有 `id`、`url`、`title`、`artist`、`artwork`、`duration` 字段，足够承载内存电台队列的 mock track 和未来真实音乐 track。
- `packages/api/src/index.ts` / top-level export：当前只导出契约类型；Phase A 可以先只实现服务端路由，不强制新增 client，避免把 Phase A 和移动端接入 Phase B 混在一起。
- `packages/core/src/index.ts` / `CORE_VERSION`：core 层仍是占位。Phase A 为了最快打通服务端 API 骨架，内存状态可以先放在 `server/src` 内部；等状态逻辑稳定后再下沉到 `packages/core`。

### 2. 已确认方向

- Phase A 只做服务端，不改移动端 UI；移动端真实调用 API 放到 Phase B。
- Phase A 只做 mock 主播和 mock 曲目，但必须通过真实 HTTP / WS 路由返回。
- Phase A 暂不接 LLM、网易云、TTS、SQLite；这些分别留给 Phase C、D、E 和后续持久化任务。
- 用户已确认 Phase A 风险与决策，并明确允许开始编码。

### 3. 功能点与文件级计划（已确认）

#### 3.1 方案选型

- Phase A 使用现有 `fastify` 模块化注册函数，不引入额外框架、不引入 `fastify-plugin`、不引入数据库、不引入 LLM SDK、不引入音乐服务 SDK。
- 数据状态先放在服务端内存里，核心路径是常量时间读写：current track、queue、messages、current model、connected stream clients。
- 校验使用现有 `zod`，只校验请求体和模型切换参数，不做过度 schema 工程。
- WebSocket 只做广播管道，不做复杂事件总线；Phase A 没有后台任务、没有定时器、没有持久化写入。
- 所有 mock 都要集中在服务端状态层，不散落在路由里，方便 Phase C/D 替换为 LLM 和真实音乐。

#### 3.2 必做功能

- `GET /api/now`：返回当前内存 track、position 和 state；Phase A 的 position 暂时为 0，state 默认为 `idle` 或由 `/api/chat` 更新。
- `GET /api/next`：返回队列中的下一首 mock track 和 reason；没有队列时返回内置 fallback track。
- `POST /api/chat`：接收 `ChatRequest.text`，返回 mock DJ 文案 `ChatResponse`，并把一首 mock track 推入 queue / current track，广播 `chat-token`、`queue-update`、`now-playing`。
- `GET /api/models`：返回 DeepSeek / Qwen / GLM 三个模型占位信息和当前模型。
- `POST /api/models/switch`：切换内存 current model，只接受已有模型 id。
- `WS /stream`：客户端连接后保存到内存 Set；路由事件触发时广播 JSON 字符串形式的 `StreamEvent`。

#### 3.3 明确不做

- 不改 `apps/mobile`，不接移动端真实请求；这是 Phase B。
- 不改 `packages/ui`，不做任何 UI 视觉调整。
- 不接 DeepSeek / Qwen / GLM 真实 API；这是 Phase C。
- 不接网易云搜索、直链解析或真实歌单；这是 Phase D。
- 不接 TTS，也不生成 mp3 cache；这是 Phase E。
- 不上 SQLite / Drizzle / cron / scheduler；等 API 闭环稳定后再评估。

#### 3.4 文件级计划

- `server/src/index.ts`：保留 Fastify 创建和 `/health`，新增 `app.register(websocket)`、`registerApiRoutes(app)`、`registerStreamRoutes(app)`；不改变 `start` 的执行载体和监听地址。
- `server/src/state/radioState.ts`：新增内存电台状态模块，导出模型列表、mock 曲目、获取当前状态、处理 chat、切换模型、获取下一首等纯函数；所有函数写中文多行注释。
- `server/src/realtime/streamHub.ts`：新增轻量 WS client 集合和 `broadcastStreamEvent` 函数；负责连接、断开和 JSON 广播，避免路由直接管理 Set。
- `server/src/routes/apiRoutes.ts`：新增 `registerApiRoutes(app)`，实现 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/api/models/switch`；请求体用 zod 校验，响应类型从 `@claudio/api` 引入。
- `server/src/routes/streamRoutes.ts`：新增 `registerStreamRoutes(app)`，实现 `/stream` websocket 路由，并在连接成功后推送一次当前 now-playing 快照。
- `packages/api/src/types.ts`：Phase A 尽量不改契约；如果实现时发现 `queue-update` 需要允许空队列或 `now-playing` 需要 `track: null`，先回到 Spec 做 Reverse Sync，不直接编码硬改。

#### 3.5 验收计划

- 终端命令：`pnpm.cmd exec tsc --noEmit -p server/tsconfig.json` 必须通过。
- 终端命令：`pnpm.cmd typecheck` 必须通过，确认共享类型没有破坏其它包。
- 终端命令：用 PowerShell `Invoke-RestMethod` 验证 `GET /health`、`GET /api/models`、`POST /api/chat`、`GET /api/now`、`GET /api/next`。
- 终端命令：用 `rg` 验证新增路由存在，且 Phase A 没有引入 `drizzle`、`sqlite`、`cron`、真实 LLM SDK 或 TTS SDK。

### 4. 风险与决策（已确认）

#### 4.1 框架决策

- 继续使用 Fastify。理由是当前仓库已经使用 Fastify，且 Claudio Phase A 的核心需求是低开销 HTTP / WS API、TypeScript、路由模块化、请求校验和后续插件扩展；Fastify 正好覆盖这些核心路径。
- 不能把“Fastify 是当前最适合 Claudio”说成“Fastify 在所有场景绝对性能第一”。官方 benchmark 也明确说明 hello-world benchmark 只评估框架 overhead，真实性能取决于应用代码，性能重要时必须自己 benchmark。
- 不切 NestJS。NestJS 的模块化和 DI 更完整，但 Phase A 只需要 5 个 HTTP 路由、1 个 WS 路由和内存状态；引入 Nest 会增加装饰器、生命周期、DI 容器和测试复杂度，不符合敏捷最小闭环。
- 不切 Express。Express 生态大，但当前阶段没有明显收益；Fastify 已有更好的低开销、schema / serialization 路线和插件封装能力。
- 不切 Hono / H3 / Bun / Elysia。它们有各自优势，但会带来生态、运行时或迁移成本；当前没有证据显示这些成本能换来 Claudio Phase A 的实际收益。

参考依据：
- Fastify 官方首页说明其目标是低开销、高开发体验和插件架构，并强调高性能与 TypeScript ready：`https://fastify.dev/`
- Fastify 官方 benchmark（2026-01-01 更新）显示 Fastify 在 Node 框架 overhead 测试中处于高位，同时提醒真实 overhead 取决于应用代码：`https://fastify.dev/benchmarks/`
- Fastify 官方文档说明 `register` 可以用于插件化扩展 route / decorator 等能力，适合当前模块化拆分：`https://fastify.dev/docs/latest/Reference/Server/`
- Fastify validation 文档提醒不要在初始校验里做 async 数据库访问，应在 validation 后的 hook / handler 处理；这支持 Phase A 只做同步 zod 边界校验、不把数据库或远程调用塞进校验层：`https://fastify.dev/docs/v5.6.x/Reference/Validation-and-Serialization/`

#### 4.2 性能风险

- 风险：WS client Set 如果不在 close 时清理，会造成连接泄漏。决策：`streamHub` 必须在 socket close/error 时删除 client。
- 风险：广播时单个坏连接抛错可能影响其它客户端。决策：广播函数必须逐个 try/catch，坏连接只移除自己。
- 风险：mock chat 如果未来直接替换为 LLM 调用，可能阻塞 HTTP 响应。决策：Phase A 的 `handleChat` 保持同步内存逻辑；Phase C 接 LLM 时再单独设计超时、fallback 和异步流式策略。
- 风险：内存状态在进程重启后丢失。决策：Phase A 接受这个限制，因为目标是 API 骨架和调用闭环；持久化不进入本阶段。
- 风险：`ChatResponse.play` 当前是 `string[]`，与可播放 queue 的 `Track[]` 表达能力不同。决策：Phase A 不改契约，路由内部维护 queue，并通过 `queue-update` stream 推送 `Track[]`；若 Phase B 发现 HTTP 响应必须直接返回 track，再做 Reverse Sync。

#### 4.3 功能边界风险

- 风险：为了“看起来完整”提前接 LLM、网易云、TTS，会再次拖偏主线。决策：Phase A 的验收只看服务端 API 是否真实可请求、状态是否可变、WS 是否可广播。
- 风险：为了未来扩展提前做数据库 schema、repository、scheduler，会制造偶然复杂度。决策：本阶段只做内存状态和纯函数，等 Phase B/C/D 产生真实数据流后再抽象。
- 风险：把移动端接入混进 Phase A，会扩大验证面并引入缓存陷阱。决策：Phase A 不改 `apps/mobile` 和 `packages/ui`。

#### 4.4 验收决策

- Phase A 完成后，必须展示终端命令输出证据：server typecheck、workspace typecheck、HTTP 请求返回体、`rg` 反查路由与未引入重依赖。
- 如果实现中发现需要改 `packages/api/src/types.ts` 契约，必须先暂停并更新本 Spec，再继续编码。
- HARD-GATE：用户已确认本节“风险与决策”，允许开始 Phase A 编码。

---

## 2026-05-22 Phase B：移动端接入服务端 API Spec（已确认并执行完成）

### 1. 现状分析（已确认）

- `packages/api/src/index.ts` / top-level export：当前仍只导出 `types.ts` 契约类型，没有 `createApiClient`、HTTP 请求封装、API base URL 解析或 WebSocket URL 解析；移动端如果现在接 API，只能在页面里散写 `fetch`，这会破坏“接口层集中”的边界。
- `packages/api/src/types.ts` / `Track`、`ChatRequest`、`ChatResponse`、`NowResponse`、`NextResponse`、`ModelsResponse`、`SwitchModelResponse`、`StreamEvent`：Phase B 需要的共享类型已经覆盖当前服务端 Phase A 路由；但 `ChatResponse.play` 仍只是歌名数组，移动端播放器要拿真实可播放曲目应通过 `/api/now`、`/api/next` 或 `/stream` 的 `Track`。
- `apps/mobile/app/index.tsx` / `HomeScreen`：主屏仍使用本地 `DJ_SCRIPT` 常量渲染 `DJBubble`；`ChatInput` 的 `onSend` 和 `onMicPress` 仍是空函数；`ConnectionStatus` 固定传入 `connected`，没有反映真实 API / WS 连接状态。
- `apps/mobile/app/index.tsx` / `HomeScreen`：当前 `TopBar` 的 `modelName` 来自 `DEFAULT_PETS.find((p) => p.id === petId)`；宠物切换只改本地 `petId`，没有调用 `/api/models` 或 `/api/models/switch`，因此模型徽章仍是本地 UI 状态。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：Hook 支持传入自定义 `playlist` 参数，但 `HomeScreen` 当前没有传入服务端队列；默认仍使用 `DEFAULT_PLAYLIST` 的 SoundHelix mock。Phase B 可以利用这个参数消费服务端 `Track[]`，不用重写播放器控制器。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `RadioTrack`：本地曲目类型字段是 `url`、`title`、`artist`、`durationFallback`；服务端 `Track.duration` 需要映射为 `durationFallback`，否则未加载元数据时进度条没有兜底时长。
- `packages/ui/src/ChatInput.tsx` / `handleSend`：组件发送后会立刻清空输入，并调用 `onSend(trimmed)`；Phase B 若请求失败，输入已经清空，因此需要在主屏显示错误/离线状态或 DJ 文案反馈，不能靠输入框保留文本提示失败。
- `packages/ui/src/DJBubble.tsx` / `DJBubble`：组件支持 `text`、`typing`、`live` 和 `onReplay`；Phase B 可以直接把服务端 `ChatResponse.say` 接入，不需要改 UI 组件。
- `packages/ui/src/ConnectionStatus.tsx` / `ConnectionStatus`：组件已支持 `connected`、`connecting`、`offline` 三态；Phase B 只需要传入真实状态，不需要改 UI 组件。
- `apps/mobile/app.json` / `android.permissions`：Android 已声明 `INTERNET`，移动端访问本机 / 局域网服务端具备权限；但真机访问 `127.0.0.1:8080` 会指向手机自身，因此 Phase B 必须设计可配置 API base URL。
- `apps/mobile/package.json` / dependencies：已有 `@claudio/api` 和 `expo-constants`，但 Phase B 不需要新增依赖；可优先用 `process.env.EXPO_PUBLIC_API_BASE_URL` 或 Web 默认 `http://127.0.0.1:8080`。

### 2. 已确认方向

- Phase B 的核心体验目标：在 App 输入框发送文本后，真实调用服务端 `/api/chat`，DJ 气泡显示服务端返回的 `say`，当前曲信息切到服务端返回的 mock 曲目，连接状态能反映请求成功/失败。
- Phase B 不接真实 LLM、网易云或 TTS；仍消费 Phase A 的 mock 服务端，但必须是移动端真实 HTTP/WS 调用。
- Phase B 优先 HTTP 闭环，WS 作为连接状态和事件同步通道；如果 WS 在 Web / 真机环境遇到网络差异，不能阻塞 `/api/chat` 的基本体验。
- Phase B 必须给用户 App 侧验收步骤：终端启动服务端和移动端、浏览器操作发送消息、预期看到 DJ 文案和当前曲变化。
- 用户已确认 Phase B 现状分析。下一段写“功能点与文件级计划”，然后写“风险与决策”，最后 HARD-GATE 后才能编码。

### 3. 功能点与文件级计划（已确认）

#### 3.1 方案选型

- Phase B 使用 `packages/api` 作为唯一前端通信入口。移动端页面不直接散写 `fetch('http://...')`，而是通过 `createApiClient` 调用 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/api/models/switch` 和 `/stream`。
- Phase B 不新增依赖。`apps/mobile/package.json` 已有 `@claudio/api` 和 `expo-constants`；API 地址优先读取 `process.env.EXPO_PUBLIC_API_BASE_URL`，Web 默认回退到 `http://127.0.0.1:8080`，真机由用户显式传入局域网地址。
- Phase B 以 HTTP 闭环为主：`ChatInput.onSend` 先调用 `/api/chat`，成功后再拉取 `/api/now` / `/api/next` 更新播放器队列。WebSocket 只负责连接状态和服务端事件同步，不作为首要成功路径。
- Phase B 继续消费 Phase A mock 服务端，不接真实 LLM、网易云或 TTS；`ChatResponse.play` 仍只展示推荐歌名，真正可播放曲目从 `NowResponse.track`、`NextResponse.track` 或 `queue-update` 事件里的 `Track[]` 获取。
- Phase B 不改现有 UI 视觉组件。`DJBubble`、`ConnectionStatus`、`NowPlayingBar`、`PlaybackProgressBar`、`PlayerControls`、`PixelPetSwitcher` 只换入真实数据和回调，不做样式调整。

#### 3.2 必做功能

- API client：新增 `createApiClient`，封装 `getNow`、`getNext`、`sendChat`、`getModels`、`switchModel` 和 `connectStream`；所有响应使用 `@claudio/api` 现有契约类型。
- API URL 解析：新增 HTTP base URL 和 WS URL 解析能力。`http://127.0.0.1:8080` 自动映射为 `ws://127.0.0.1:8080/stream`；`https://` 后续可映射为 `wss://`。
- 曲目映射：新增服务端 `Track` 到移动端 `RadioTrack` 的映射，字段规则为 `url -> url`、`title -> title`、`artist -> artist`、`duration -> durationFallback`。
- 主屏初始化：`HomeScreen` 首次加载时调用 `/api/models` 和 `/api/now`。如果服务端已有当前曲，移动端队列立即切到服务端曲目；如果没有当前曲，保留本地播放兜底，不阻塞 UI。
- 发送消息：`ChatInput.onSend` 调用 `/api/chat`，发送中让 `DJBubble` 进入 `typing` 或“信号接入中”状态；成功后用 `ChatResponse.say` 替换本地 `DJ_SCRIPT`，并通过 `/api/now` / `/api/next` 更新当前曲和队列。
- 播放器接入：`HomeScreen` 将服务端曲目数组传给 `useRadioPlayer(playlist)`，继续复用现有 `toggle`、`seek`、`next`、`prev`、`stop`，不重写播放控制器。
- 连接状态：`ConnectionStatus` 改为真实状态。初始化和请求中显示 `connecting`，HTTP 成功或 WS open 后显示 `connected`，请求失败且 WS 不可用时显示 `offline`。
- WS 同步：`connectStream` 收到 `now-playing` 时更新当前服务端曲目；收到 `queue-update` 时更新队列；收到 `chat-token` 且 `final: true` 时更新 DJ 文案。WS 失败只降级连接状态，不阻塞 HTTP 发送。
- 模型同步：主屏读取 `/api/models` 的 `current` 和 `available`。`PixelPetSwitcher.onSwitch` 调用 `/api/models/switch`，成功后更新本地 `petId` 和 `TopBar.modelName`；失败时保留原模型并给 DJ 文案或连接状态反馈。
- 错误反馈：`/api/chat` 失败时，因为 `ChatInput` 已经清空输入，主屏需要把 DJ 文案改为离线/失败提示，并把 `ConnectionStatus` 置为 `offline`，避免用户以为消息已被 Claudio 接收。

#### 3.3 明确不做

- 不改 `packages/ui` 的视觉样式、布局结构、颜色、动画或组件 API，除非实现中发现现有 props 无法承载真实状态并先做 Reverse Sync。
- 不接 DeepSeek / Qwen / GLM 真实 API；Phase B 只调用 Phase A mock 服务端。
- 不接网易云搜索、直链解析、真实歌单或真实音频频谱；Phase B 只消费服务端当前返回的 SoundHelix mock `Track`。
- 不接 TTS、不请求 `voice: true`、不处理 `tts-ready` 播放；这留到 Phase E。
- 不新增 SQLite、Drizzle、cron、scheduler 或移动端状态库；主屏局部 state 足够完成本阶段闭环。
- 不做登录鉴权 UI，也不新增真实账号逻辑；`SHARED_TOKEN` 若后续启用，再单独设计移动端配置入口。

#### 3.4 文件级计划

- `packages/api/src/client.ts`：新增轻量 API client。导出 `createApiClient(options)`、`resolveApiBaseUrl`、`resolveStreamUrl`；client 方法包括 `getNow`、`getNext`、`sendChat`、`getModels`、`switchModel`、`connectStream`。所有函数必须写中文多行注释。
- `packages/api/src/index.ts`：继续导出 `types.ts`，并新增导出 `createApiClient` 与相关 client 类型；不改变现有契约类型名称。
- `packages/api/src/types.ts`：Phase B 默认不改。若实现时发现 `StreamEvent` 的 `now-playing` 需要允许 `track: null` 或 HTTP 响应需要直接返回 `Track[]`，必须暂停并先更新 Spec。
- `apps/mobile/app/_config/api.ts`：新增 App 侧 API 配置入口，集中读取 `process.env.EXPO_PUBLIC_API_BASE_URL`，并为 Web 默认提供 `http://127.0.0.1:8080`。真机局域网地址只通过环境变量注入，不硬编码开发机 IP。
- `apps/mobile/app/_utils/trackMapping.ts`：新增 `mapApiTrackToRadioTrack(track)` 和 `mapApiTracksToRadioTracks(tracks)`，把 `Track.duration` 映射为 `RadioTrack.durationFallback`，过滤 `null` 和缺少 `url` 的曲目。
- `apps/mobile/app/index.tsx` / `HomeScreen`：移除对本地 `DJ_SCRIPT` 的业务依赖，新增 `djText`、`connectionState`、`serverPlaylist`、`apiClient`、`models` 等局部状态；把 `ChatInput.onSend`、`DJBubble.text`、`ConnectionStatus.state`、`TopBar.modelName`、`PixelPetSwitcher.onSwitch` 接到真实 API 数据。
- `apps/mobile/app/index.tsx` / `HomeScreen`：继续调用 `useRadioPlayer(serverPlaylist.length > 0 ? serverPlaylist : undefined)`，保留现有播放控件行为；只让曲目来源变成服务端优先、本地兜底。
- `apps/mobile/app/_hooks/useRadioPlayer.ts`：原则上不改播放控制逻辑。若 `playlist` 从空变非空时出现 `trackIndex` 越界或切歌不同步，再在本文件做最小修正，并先把偏差同步回 Spec。
- `apps/mobile/app.json`：原则上不改。当前 Android 已有 `INTERNET` 权限，Phase B 不需要新增权限或插件。

#### 3.5 验收计划

- 终端命令：`pnpm.cmd exec tsc --noEmit -p packages/api/tsconfig.json` 必须通过，确认 API client 类型正确。
- 终端命令：`pnpm.cmd exec tsc --noEmit -p apps/mobile/tsconfig.json` 必须通过，确认 App 接线类型正确。
- 终端命令：`pnpm.cmd typecheck` 必须通过，确认 monorepo 共享类型没有破坏其它包。
- 终端命令：`rg "fetch\\(" apps/mobile packages/api`，预期 `apps/mobile` 中不出现散写后端 URL 的直接 `fetch`，HTTP 调用集中在 `packages/api`。
- 终端命令：`rg "Netease|msedge|openai|anthropic|better-sqlite3|node-cron" apps/mobile packages/api`，预期 Phase B 不新增真实 LLM、网易云、TTS、数据库或调度依赖。
- App 侧验收步骤必须覆盖：
  - 终端命令：启动服务端，例如 `pnpm dev:server`，并确认 `http://127.0.0.1:8080/health` 可访问。
  - 终端命令：启动移动端 Web，例如 `pnpm dev:mobile`，终端出现 Expo 提示后按 `w` 进入 Web。
  - 浏览器操作：打开移动端页面，在输入框发送 `night drive`。
  - 预期：DJ 气泡不再显示本地固定 `DJ_SCRIPT`，而是显示服务端返回的“正在接管 Claudio 信号”类文案。
  - 预期：当前曲标题切换为服务端 mock 曲目之一，如 `Late Night Drive`、`Synthwave Pulse` 或 `Pixel Reverie`。
  - 预期：连接状态从 `connecting` 回到 `connected`；如果关闭服务端再发送消息，连接状态变为 `offline`，DJ 气泡出现失败提示。
  - 浏览器操作：涉及 `packages/*` 源码后，如页面仍是旧版，必须先 `Ctrl + Shift + R` 硬刷新；必要时按缓存陷阱三步清 Metro。

### 4. 风险与决策（已确认）

#### 4.1 架构决策

- 决策 1：第三节计划保留，并作为 Phase B 编码边界。它不是冗余文档，而是防止移动端直接散写 `fetch`、硬编码本机 IP、把 WS 当主链路、把 UI 微调混入 API 接入、或提前接真实 LLM / 网易云 / TTS。
- 决策 2：HTTP client 放在 `packages/api`，App 侧只消费 client。这样 Phase C/D/E 替换服务端实现时，移动端不需要追着多个页面改 URL、请求体和错误处理。
- 决策 3：App 侧新增 `_config/api.ts` 是必要的。真机不能访问开发机的 `127.0.0.1`，必须把 base URL 配置集中管理；但不把局域网 IP 写进代码，避免提交机器私有配置。
- 决策 4：先用 `HomeScreen` 局部 state 完成闭环，不引入 zustand 新 store。Phase B 的状态只服务当前主屏，等 Phase C/D 形成多页面或长期状态需求后再抽象。
- 决策 5：播放器仍以 `useRadioPlayer` 为唯一播放控制器。Phase B 只改变 playlist 来源，不改播放、暂停、seek、上一首、下一首的控制语义。
- 决策 6：WS 是增强链路，不是硬依赖。只要 `/api/chat`、`/api/now`、`/api/next` 能跑通，Phase B 就具备最小可用体验；WS 失败只能降级连接状态，不能让发送消息不可用。

#### 4.2 功能风险

- 风险：`ChatResponse.play` 只有 `string[]`，不能直接让播放器拿到 `url`。决策：Phase B 不改契约，发送消息成功后再读取 `/api/now` 和 `/api/next`，或消费 `queue-update` 里的 `Track[]`。
- 风险：服务端刚启动时 `/api/now` 可能返回 `track: null`。决策：移动端保留本地 playlist 兜底；只有拿到有效服务端 `Track.url` 后才切换到服务端队列。
- 风险：`useRadioPlayer(playlist)` 在 playlist 动态变化时可能保留旧 `trackIndex`。决策：优先不改 Hook；如果实测出现越界或切歌不同步，先 Reverse Sync，再做最小修正。
- 风险：模型切换既有本地宠物 UI，又有服务端 current model，可能短暂不一致。决策：以服务端 `/api/models` 和 `/api/models/switch` 为权威；切换失败时回滚本地 `petId`。
- 风险：`ChatInput` 发送后立即清空，失败时用户文本不可恢复。决策：本阶段不改输入框行为，在 DJ 气泡和连接状态里明确反馈失败；如需重试队列，后续单独设计。

#### 4.3 环境风险

- 风险：Web、模拟器、真机访问后端的地址不同。决策：Web 默认 `http://127.0.0.1:8080`；真机必须通过 `EXPO_PUBLIC_API_BASE_URL` 指向开发机局域网 IP；不在代码中猜测或自动扫描网络。
- 风险：Expo Web 常跑在 `8081` / `8082`，访问后端 `8080` 属于浏览器跨源请求，`POST /api/chat` 会触发 OPTIONS 预检。决策：服务端开发期必须返回最小 CORS 头并处理 OPTIONS，不能只用 PowerShell 请求结果判断前端可用。
- 风险：涉及 `packages/api` 后，Metro / 浏览器可能复用旧 bundle。决策：验收时默认提醒缓存三步，尤其是 `pnpm dev -- --clear` 和浏览器 `Ctrl + Shift + R`。
- 风险：WS 在浏览器、Expo Go 或公司网络环境下可能被代理或防火墙影响。决策：WS 只影响实时同步和连接状态，不影响 HTTP 主闭环。
- 风险：服务端未启动时 App 初始加载会失败。决策：App 显示 `offline`，DJ 气泡给出服务端未连接提示，不崩溃、不白屏。

#### 4.4 验收决策

- Phase B 完成后必须展示开发者侧证据：`packages/api` typecheck、`apps/mobile` typecheck、workspace typecheck、`rg` 验证 App 侧无散写后端 URL、`rg` 验证未引入 Phase C/D/E 依赖。
- Phase B 完成后必须给用户 App 侧验收步骤，并标明执行载体：终端命令启动服务端、终端命令启动移动端、浏览器操作发送消息、预期 DJ 文案和当前曲变化。
- 如果编码中发现必须修改 `packages/api/src/types.ts` 契约、`packages/ui` 组件 API 或 `useRadioPlayer` 播放语义，必须先暂停并更新本 Spec，再继续实现。
- HARD-GATE：用户已确认本节“风险与决策”，允许开始 Phase B 编码。
