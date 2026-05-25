# Claudio - 教训沉淀

> 用户每次纠正或踩坑后，将“模式 + 规则”沉淀到此文件，避免同类错误重现。
> 每次会话开始时先 review 与当前任务相关的条目。

---

## 模板

```md
## YYYY-MM-DD - <一句话标题>

**触发**：什么场景下踩了坑？

**根因**：真实原因，不止表面现象

**规则**：下次怎么做才能避免？

**关联文件**：相关文件路径，便于回查
```

---

## 2026-05-21 - 不要把 VSCode 命令面板动作写成终端命令

**触发**：用户按提示在 PowerShell 中输入 `TypeScript: Restart TS Server`，直接报 `CommandNotFoundException`。

**根因**：回答时没有先区分“终端命令”和“IDE 命令面板动作”，把编辑器内命令误写成了 shell 可执行命令。

**规则**：1. 任何“运行 / 重启 / 打开 / 点击”类步骤，先标明执行载体：终端、VSCode 命令面板、编辑器界面或浏览器。2. 不能在 shell 直接执行的 IDE 动作，必须明确写成“按 `Ctrl + Shift + P` 后执行”，并显式提醒“不要在终端输入”。3. 给用户复制命令前，先确认该命令在当前 shell 中真实可运行；如果只是菜单路径、快捷键或 UI 操作，必须改成步骤描述。

---

## 2026-05-23 - env schema 不要把 HTTP 超时上限套用到所有正整数

**触发**：Phase D.5 把 `MUSIC_CACHE_DEFAULT_TTL_MS` 默认 300000 通过 `positiveIntegerWithDefault` 注入，启动时 zod 抛 `Number must be less than or equal to 30000`。

**根因**：`positiveIntegerWithDefault` 当初是为 LLM / provider HTTP 超时写的，硬编码 `max(30000)` 防止请求挂死；缓存 TTL、LRU 上限不属于 HTTP 超时类，复用同一个工厂会被强制限到 30 秒。

**规则**：1. env helper 的语义边界写在函数名里：HTTP 类用 `positiveIntegerWithDefault`（默认上限 30s），其它正整数用 `positiveIntegerWithMax(default, max)` 显式传入合理上限。2. 引入新配置项前，先想清楚它的物理量纲（毫秒超时 / 毫秒 TTL / 计数 / 字节数），别套用现成 helper 后再撞上 zod 校验。3. 启动失败的 zod 报错要立刻读字段名而不是改 schema 的 max；改 schema 时同步在 `.env.example` 注释写出量纲与上限。

**关联文件**：[server/src/env.ts](file:///d:/code/cloudeMplatform/server/src/env.ts)、[server/.env.example](file:///d:/code/cloudeMplatform/server/.env.example)

---

## 2026-05-23 - nvm-windows 切版本必须真接管 `C:\Program Files\nodejs`

**触发**：Phase E 装 `msedge-tts` 后服务端报 `crypto is not defined`，原因是 Node 18 没有全局 webcrypto。`nvm install 22.12.0 && nvm use 22.12.0` 显示 "Now using v22.12.0" 但 `node -v` 仍输出 `v18.20.5`，反复多次无效。

**根因**：电脑上有一份 Node.js MSI 安装器装的独立 Node 18，路径 `C:\Program Files\nodejs` 是**真实文件夹**（`(Get-Item).LinkType` 为空），物理占据了 nvm-windows 必须接管的 symlink 位置。`nvm use` 在普通 PowerShell 创建 symlink 失败时只静默返回，但表面输出"成功"，导致用户看不到真实错误。

**规则**：1. 任何"切版本不生效"先看 `(Get-Item 'C:\Program Files\nodejs').LinkType`：为空 → MSI 装的真实文件夹，不是 nvm symlink，必须先卸载。2. nvm-windows 的 `nvm use` 必须**管理员 PowerShell**才能成功创建 symlink；普通终端会静默失败。3. Windows 开发环境常见两套 Node 并存：MSI 一套 + nvm 一套。修复路径：开始菜单"添加或删除程序"卸载独立 Node → 检查 `C:\Program Files\nodejs` 残留并手动删除 → 管理员 PowerShell `nvm install 18.20.5 && nvm use 22.12.0` → 验证 `node -v`。4. Node 18 与 19 之间的 webcrypto 边界：用 `import { webcrypto } from 'node:crypto'` + `globalThis.crypto = webcrypto` 兼容层是合法做法，不是补丁；Node 19+ 自带，注入前要做 `if (!target.crypto)` 守护避免覆盖。

**关联文件**：[server/src/tts/providers/edgeProvider.ts](file:///d:/code/cloudeMplatform/server/src/tts/providers/edgeProvider.ts)

---

## 2026-05-23 - 临时调试文件必须在排障结束当下立刻清理

**触发**：Phase E 排查 TTS 失败时新建了 `server/scripts/debug-ws.ts` 用于订阅 WS 抓 `tts-ready` 广播。问题定位修复后转入下一段编码，忘记删除该文件，由用户提醒才清理。

**根因**：上下文切换时只关注"主线下一步做什么"，没有把"清理本次为排障引入的临时资产"作为收尾步骤；用户之前因为 cancel 删除拒绝过我自动删，但那次是验证还在进行中——我没有重新评估"现在是否到了能删的节点"。

**规则**：1. 每次为排障 / 临时验证新增的脚本、临时 .env 行、`console.log` 临时埋点，**在该次排障的根因被锁死并修复完毕的同一个 turn 内**主动清理或主动询问。2. 临时资产必须在文件首行注释明确写"临时 / 完成 X 后删除"；命名加 `debug-` / `temp-` 前缀。3. 用户拒绝删除一次不等于永远拒绝，每次进度推进都要重新评估清理时机；不能默认"既然之前用户保留了我就一直保留"。4. 进入新阶段（如 Phase E → Phase F）前，把所有临时文件作为收尾清单的固定一项。

**关联文件**：曾存在于 `server/scripts/debug-ws.ts`（已删除）

---

## 2026-05-21 - 内网无法直连 GitHub，skill 不能用 `npx skills add` 全局安装

**触发**：尝试 `npx skills add anthropics/skills@frontend-design -g -y` 全部超时失败，错误为 `Failed to connect to github.com port 443`。

**根因**：当前开发环境是公司内网，出口被代理拦截，无法直连 `github.com`；同时全局 skill 面向的是 Claude Code/Cursor，不等于 Trae 的 Project Skills。

**规则**：1. Trae 项目级 skill 直接写到 `.trae/skills/`，不依赖外网。2. 凡是 npm/git 拉远端的命令，先做一次 `ping` 或 `curl` 探测；连不通就直接改走本地文件路线。3. 后续装依赖如 `pnpm install`，先小规模试；遇到网络错误及时提示用户切代理或镜像。

**关联文件**：`.trae/skills/`、`tasks/spec.md`

---

## 2026-05-21 - Windows 默认没有 pnpm，需要先启用 corepack

**触发**：`pnpm : 无法将 "pnpm" 项识别为 cmdlet`，导致整套脚本无法运行。

**根因**：Node 18 自带 corepack，但默认没有启用 `pnpm` shim。

**规则**：1. 项目首次拉下后，先提示 `corepack enable pnpm` 或 `corepack prepare pnpm@9.15.0 --activate`。2. 后续所有 install 文档默认假设 pnpm 已可用。3. 如果用户 Node < 18，提示升级 Node 或单独 `npm i -g pnpm`。

**关联文件**：`tasks/spec.md`、根 `package.json` engines

---

## 2026-05-21 - pnpm 在国内默认 registry 太慢

**触发**：首次 `pnpm install` 很慢。

**根因**：默认 npm registry 在国内访问较慢。

**规则**：1. 项目根目录直接执行 `pnpm config set registry https://registry.npmmirror.com`。2. 不把 registry 写进 `.npmrc` 提交，因为不同环境偏好不同。3. 首次安装失败优先怀疑网络，而不是 lockfile。

**关联文件**：`tasks/spec.md`

---

## 2026-05-21 - 字体压缩包内层目录容易误判

**触发**：用户下载 Cubic 11 字体包后，字体不在 `assets/fonts/` 根目录，而在 `Cubic-11-1.451/fonts/ttf/Cubic_11.ttf`。

**根因**：上游字体仓库的 release zip 自带版本号子目录。

**规则**：1. 字体说明文档明确要求最终字体必须落在 `assets/fonts` 根目录，并附最终目录截图。2. CI 增加字体存在性校验脚本，`expo-font` 加载前先检查文件存在。3. 类似第三方资源都要核对最终路径，不能假设解压即可用。

**关联文件**：`apps/mobile/assets/fonts/README.md`

---

## 2026-05-21 - Expo 生态包必须用 `expo install` 而不是 `pnpm add`

**触发**：`pnpm add @expo/metro-runtime` 装到了最新版本，但 Expo SDK 52 需要兼容版本，进而触发 `Unable to resolve @expo/log-box`。

**根因**：`pnpm add` 默认拉 `latest` 标签；`expo install` 会根据项目 SDK 版本挑兼容版本。

**规则**：1. 给 `apps/mobile` 安装 Expo 官方或推荐生态包时，必须用 `pnpm --filter @claudio/mobile exec expo install <package>`。2. 写文档告诉用户安装命令时，永远优先写 `expo install`，不要写 `pnpm add` / `npm i`。3. 升级 SDK 时跑 `expo install --check` 自动校准版本。

**关联文件**：`apps/mobile/package.json`

---

## 2026-05-23 - 查依赖文档前必须先核对本地实际安装版本

**触发**：Phase F 评估锁屏方案时，我用 `WebFetch` 抓 `docs.expo.dev/versions/v52.0.0/sdk/audio/`（链接显式带 v52），返回页面里写的是 SDK 55 内容（页面有 `Bundled version: ~56.0.9` / `~55.0.14` 字样）。我据此说 expo-audio "已经自带 setActiveForLockScreen + enableBackgroundPlayback config plugin"，并向用户复议把决策从 1.A `react-native-track-player` 改成 1.C "用 expo-audio 自带"。实际项目装的是 `expo-audio@0.3.5`（SDK 52，Nov 2024），grep `node_modules/expo-audio/src/Audio.types.ts` 里**没有** `setActiveForLockScreen`，`plugin/src/withAudio.ts` 里**没有** `enableBackgroundPlayback`，方案根本跑不起来。我还顺手给 `useAudioSession.ts` 写了 0.3.5 不存在的 `interruptionModeAndroid` 字段。

**根因**：1. `docs.expo.dev/versions/v52.0.0/...` 这种带版本号路径在 Expo 官网会 302 到当前 latest，并不真返回 v52 内容；不能信 URL 自带的 v52 字样。2. 我直接把 docs 当真源用了，没有先打开 `node_modules/expo-audio/package.json` 确认 0.3.5，也没看 `Audio.types.ts` 是否真有那个 API。3. SDK 52 ↔ SDK 55 中间至少 PR #40124（2025-10-01 合入）这种新增 API 不向下兼容；技术决策必须基于实际安装版本，不能基于 latest 文档。

**规则**：1. 任何"X 库支持 Y 功能"结论，先做三步本地核对：`Get-Content node_modules/<pkg>/package.json | Select-String version` 拿真版本 → grep 该包源码（`Audio.types.ts` / `index.ts` / config plugin）确认 API 真存在 → 再决策。**网文档只能作为印证，不能作为唯一依据**。2. 用 `WebFetch` / `WebSearch` 时强制带版本号（"expo-audio 0.3.5 setAudioModeAsync"），避免被 latest docs 误导；返回内容里出现别的 bundled version（`~55.0.14`）时立即警觉，停下来核对。3. `expo install` 装包后，写代码前先开 `node_modules/<pkg>/build/index.d.ts` 或 `src/*.types.ts` 看类型，类型里没有的字段不要写——TypeScript 在 strict 关闭场景未必能拦下。4. 每次提议"换技术方案"必须先核对原方案有没有真实代码在仓库里，避免空操作；本次 `react-native-track-player` 全仓 grep 没装，所以"删冗余"实际只是改 spec 文字，没有代码要回滚。

**关联文件**：[apps/mobile/app/_hooks/useAudioSession.ts](file:///d:/code/cloudeMplatform/apps/mobile/app/_hooks/useAudioSession.ts)、[apps/mobile/package.json](file:///d:/code/cloudeMplatform/apps/mobile/package.json)、`tasks/spec.md` §10.3 决策 1

---

## 2026-05-21 - pnpm + React Native/Expo 必须 hoisted 模式

**触发**：连续出现 `react-native-worklets/plugin`、`@expo/metro-runtime`、`react-native-css-interop/jsx-runtime` 等模块找不到。

**根因**：pnpm 默认 isolated linker 严格隔离传递依赖，但 RN/Expo 生态大量包默认依赖 npm/yarn 的 hoisting 行为，会持续触发“修一个又冒一个”。

**规则**：1. 项目根 `.npmrc` 必须配 `node-linker=hoisted`。2. 同时开启 `auto-install-peers=true` 和 `strict-peer-dependencies=false` 降低 peer 噪音。3. 用 `public-hoist-pattern` 显式提升 react-native / expo / nativewind / css-interop 等模式。4. 一旦遇到第二次 `Unable to resolve` 类报错，优先检查 hoisted，不要继续逐个装包。5. 在 onboarding 中直接说明：这是 RN/Expo 生态常态，pnpm hoisted 是必须项。

**关联文件**：`.npmrc`

---

## 2026-05-21 - 用户要求完全替换时不能做近似迁移

**触发**：用户明确要求频谱条样式和动画“完全替换”为提供代码中的实现，但前两次实现只迁移了算法和部分灯条效果，未完全按 `visualizer-container`、`v-bar-wrapper`、`v-bar`、`v-cap`、`requestAnimationFrame(updateVisualizer)` 的结构重写。

**根因**：把“按当前系统适配”和“完整替换视觉实现”混在一起，优先做了兼容性近似，而没有逐项对照用户给的源代码样式。

**规则**：1. 用户说“完全替换 / 一定用我给的代码”时，先删除旧组件实现，再按源代码结构和变量名逐项重建。2. 除用户明确允许调整的尺寸 / 位置外，不擅自弱化样式。3. 如需跨平台改写，只改变技术载体，不改变视觉参数、动画公式和状态逻辑。4. 验收时必须对照用户代码列出已覆盖的 HTML/CSS/JS 对应点。

**关联文件**：`packages/ui/src/NowPlayingBar.tsx`

---

## 2026-05-21 - 修改前必须确认截图对应的实际渲染组件

**触发**：用户截图里的频谱条来自主屏 `MusicSpectrum`，但前几次只修改了 `NowPlayingBar` 内部的 `WaveformBars`；主屏传了 `showWaveform={false}`，导致改动根本不会显示。

**根因**：只根据打开文件和组件名判断修改位置，没有追踪页面真实渲染链路和 props，忽略了实际显示组件。

**规则**：1. 用户基于截图反馈 UI 没变时，必须先搜索页面实际渲染组件和 props。2. 若目标组件被 `showX={false}` 禁用，必须改实际显示组件或调用点。3. 汇报时说明“为什么之前没变”和“现在改的是哪个实际渲染组件”。

**关联文件**：`apps/mobile/app/index.tsx`、`packages/ui/src/MusicSpectrum.tsx`、`packages/ui/src/NowPlayingBar.tsx`

---

## 2026-05-22 - packages/ui 组件改了不生效 = Metro 缓存陈旧（高频）

**触发**：`NowPlayingBar` 进度条已替换为像素飞船管道版，但用户截图仍是旧版细线钻石滑块；前一天替换音频条时也出现完全相同的“代码已改、运行中是旧版”的现象。

**根因**：monorepo 下 `packages/ui` 的源码改动后，Metro 命中 transformer cache 时不会重新打包；浏览器对 `index.bundle` 的 disk cache 也会复用旧产物。两层缓存叠加，导致 `apps/mobile` 跑出来的还是上一次构建结果，跟代码无关。

**规则**：
1. 用户报“代码改了但页面没变”时，第一反应不是改代码，而是核对：源码链路是否正确（搜 `import` + `package.json main`）→ 若链路 OK，立刻判定为缓存问题，不要再改代码。
2. 修复流程固定三步，分别标注执行载体：
   - 终端命令（先停掉 Expo）：在跑 `expo start` 的终端窗口按 `Ctrl + C`
   - 终端命令（带 clear 重启）：`pnpm dev -- --clear`（透传给 Expo CLI 清 transformer cache）
   - 浏览器操作：`Ctrl + Shift + R` 硬刷新（普通 F5 会复用 disk cache 里的旧 bundle）
3. 凡涉及 `packages/*` 子包源码改动后的验收，默认提示用户走一次上述三步，避免误判为代码问题反复改动。
4. 若三步后仍未生效，再排查 metro `watchFolders`、`pnpm` hoist、组件实际渲染链路。

**关联文件**：`apps/mobile/metro.config.js`、`packages/ui/package.json`、`AGENTS.md`
---

## 2026-05-22 - UI 截图验收必须反查具体渲染文本和样式

**触发**：用户指出截图中的底部紫色细线仍然存在，`VELOCITY` 也没有替换成歌曲时间。

**根因**：只做了方案说明，没有在完成前用代码搜索核对截图中可见的关键文本、颜色和结构是否已经从实际渲染路径移除或替换。

**规则**：凡是用户基于截图指出具体 UI 元素要删除或替换，完成前必须用 `rg` 反查可见文本、颜色值、组件调用和实际渲染路径；如果目标是 `packages/*` 组件，还要提醒 Metro / 浏览器缓存可能导致旧版仍显示。

**关联文件**：`packages/ui/src/NowPlayingBar.tsx`、`packages/ui/src/MusicSpectrum.tsx`、`apps/mobile/app/index.tsx`

---

## 2026-05-22 - Reanimated 运行时报错不能只看 TypeScript / export

**触发**：引入 Reanimated 后，终端 `tsc` 和 `expo export` 通过，但浏览器红屏报 `_reanimatedLoggerConfig is not defined`。

**根因**：Reanimated 3 的 worklet/logger 需要 `react-native-reanimated/plugin` 做 Babel 转换；`nativewind/babel` 间接需要的 `react-native-worklets/plugin` 只解决 NativeWind/CSS interop 的插件解析问题，不能替代 Reanimated 3 自身的 Babel plugin。

**规则**：1. 接入 `react-native-reanimated@3.x` 后，`apps/mobile/babel.config.js` 必须显式配置 `plugins: ['react-native-reanimated/plugin']`，并保持它在插件列表最后。2. 若 `nativewind/babel` 报找不到 `react-native-worklets/plugin`，同时保留 `react-native-worklets` 作为构建依赖，但不要误以为它替代了 Reanimated plugin。3. 这类运行时初始化问题必须让用户清 Metro 和浏览器缓存后再验收。

**关联文件**：`apps/mobile/babel.config.js`、`apps/mobile/package.json`

---

## 2026-05-25 - WebSocket 事件回调不能依赖高频播放状态

**触发**：Phase J 为 `tts-ready.trackId` 做当前曲校验时，把 `currentTrackKey` 放进 `handleStreamEvent` 的 `useCallback` 依赖；而 bootstrap stream 的 `useEffect` 又依赖 `handleStreamEvent`，导致每次切歌都会关闭并重建 WebSocket。

**根因**：WS 事件处理函数需要读最新播放状态，但播放状态属于高频/业务变化状态；直接进 callback 依赖会让订阅生命周期跟着业务状态重建，复发了之前 tts 对象引用导致 WS 循环重连的同类问题。

**规则**：1. WebSocket / AppState / 长生命周期订阅回调需要读当前播放状态、VOICE 状态、TTS 状态时，优先用 `useRef` 保存最新值。2. 订阅 effect 的依赖只放稳定对象和真正决定连接生命周期的值，例如 api client、固定处理器引用；不要放当前曲、播放进度、buffering、tts ready 等业务状态。3. 新增事件 stale check 时，先问“这个状态变化是否应该重建连接”，答案是否定时必须走 ref。

**关联文件**：`apps/mobile/app/index.tsx`

---

## 2026-05-22 - 拖动型进度条不能让外部播放进度覆盖手势态

**触发**：用户拖动播放进度条时，滑块会持续回到拖动开始前的播放位置，例如当前 1 分钟时拖动过程一直被拉回 1 分钟。
**根因**：进度条是受控组件，外部播放器 `position` 会高频更新；如果同步 effect 在拖动期间继续把 `position` 写回本地动画值，就会和手势输入抢控制权。
**规则**：1. 拖动开始后必须进入本地交互态，暂停外部 `position` 同步。2. 只在切歌/资源变化时重置进度，不要把 `position` 放进“切歌重置” effect 依赖。3. seek 提交后保留一个短暂 suppress 窗口，等待播放器状态追上新位置，避免提交后的第一帧又被旧 `position` 拉回。
**关联文件**：`packages/ui/src/PlaybackProgressBar.tsx`

---

## 2026-05-22 - 长时间播放动画优先清理 JS 侧循环，而不是只看单帧是否流畅

**触发**：动画刚启动很流畅，但运行几分钟后暂停按钮反馈变迟钝、整体 UI 变卡。
**根因**：单帧看似只是在改 transform/opacity，但如果长期用 JS `requestAnimationFrame`、`Animated.Value`、大量 SVG/组件节点逐帧更新，JS 队列会积累压力；按钮点击、状态切换和手势事件也会被同一个 JS 线程拖慢。
**规则**：1. 高频视觉效果优先使用 Reanimated/Skia/Canvas，把逐帧变化留在 UI/绘图层。2. Web fallback 不要用几十个 React/SVG 节点逐帧更新，能用单 canvas 就用单 canvas。3. 按钮呼吸、涟漪、按压缩放这类纯视觉动画不要用 React Native `Animated.Value` 的长循环，优先迁到 Reanimated。
**关联文件**：`packages/ui/src/MusicSpectrum.tsx`、`packages/ui/src/PlayerControls.tsx`

---

## 2026-05-22 - 快速暂停/播放要防止重复 loop，也要防止昂贵重建

**触发**：用户反馈连续点暂停、再开始、再切换时会超级卡，怀疑类似“定时器没关又开下一个”。
**根因**：动画卡顿不只来自重复定时器。Reanimated/RAF 需要显式先 cancel 再启动；Skia/Canvas 这类重绘层即使没有重复 loop，如果暂停后立刻卸载、再播放时频繁重建 40+ 动画节点，也会造成明显点击卡顿。
**规则**：1. 所有 `withRepeat`、`requestAnimationFrame`、`setTimeout` 都要在启动前或 cleanup 中有对应 cancel/clear。2. 快速切换播放状态时，不要立刻销毁昂贵绘制树，先视觉收尾，再给 800-1500ms idle 缓冲吸收连续点击。3. 排查“越点越卡”时同时检查重复 loop 和昂贵 mount/unmount 抖动。
**关联文件**：`packages/ui/src/MusicSpectrum.tsx`、`packages/ui/src/PlayerControls.tsx`、`packages/ui/src/PlaybackProgressBar.tsx`

---

## 2026-05-22 - 用户明确说删除时不能只隐藏或断开调用
**触发**：用户确认动画迁移时再次强调“全屏扫描线之前就说了要去掉，从代码里面删掉”，而此前方案只写了移除调用和导出、组件文件可以保留。
**根因**：把“降低删除风险”和“满足明确删除意图”混在了一起；当用户要求的是移除某个 UI 元素本身时，保留源码文件会让后续误接回来的概率变高，也会让用户感觉需求没有被真正执行。
**规则**：1. 用户明确说“删掉 / 从代码里面删掉 / 不要保留”时，必须同时处理渲染调用、公共导出和源文件本体。2. 如果 Spec 里原本写了“可保留文件”，需要先 Reverse Sync 修正 Spec/Todo，再改代码。3. 删除后必须用 `rg` 反查实际运行代码路径，确认没有残留组件引用。
**关联文件**：`apps/mobile/app/index.tsx`、`packages/ui/src/index.ts`、`packages/ui/src/ScanlineOverlay.tsx`

---

## 2026-05-22 - Reanimated + Skia 是分层架构，不是所有 UI 强行同构
**触发**：用户询问“现在项目所有的都是用 Reanimated + Skia 组合吗”，并要求把这个框架结构固化到后续框架设计。
**根因**：动画优化容易被误解成“所有组件都必须同时使用两个库”。实际更稳的架构是职责分层：Reanimated 管交互和数值动画，Skia 管高密度绘制，普通 React Native 组件继续管布局和文本，Web 可以用单 canvas fallback。
**规则**：1. 新增高频动画前先分类：交互/transform/opacity 用 Reanimated；频谱/粒子/尾焰/大量重复图形用 Skia；Web 若不用 Skia，必须用单 canvas fallback。2. React state 只承载业务状态和低频变化，不承载每帧动画值。3. 禁止新增 React Native `Animated.Value` 长循环和 `requestAnimationFrame + setState` 热路径。4. 低频业务计时器可以保留，但必须说明它不是高频视觉动画。
**关联文件**：`tasks/spec.md`、`packages/ui/src/MusicSpectrum.tsx`、`packages/ui/src/PlaybackProgressBar.tsx`、`packages/ui/src/PlayerControls.tsx`

---

## 2026-05-22 - 主线开发先选对核心架构，不为未来功能提前堆依赖
**触发**：用户确认 UI 优化差不多后，强调后续搭建尤其框架类方案必须选好；此前没有及时使用 Reanimated + Skia 导致动画效果差、反复优化很久。
**根因**：如果早期为了“快”选择了不适合高频场景的基础方案，后面会用大量补丁偿还架构债；反过来，如果为了未来想象一次性接入数据库、LLM、音乐、TTS、调度等全套能力，也会拖慢敏捷主线。
**规则**：1. 每个新阶段先判断“性能最关键的核心路径”并选对承载层，再写业务代码。2. 只做当前闭环必需的功能，不为未来阶段提前引入重依赖。3. Phase A 这类服务端骨架优先使用现有 Fastify / zod / websocket / 内存状态，暂不接数据库、LLM、音乐服务、TTS。4. 每个方案必须明确“不做什么”，防止主线再次被支线功能拖偏。
**关联文件**：`tasks/spec.md`、`tasks/todo.md`、`server/src/index.ts`

---

## 2026-05-22 - @fastify/websocket 必须先注册插件再挂载 WS 路由
**触发**：Phase A 验证 `/stream` 时 WebSocket 客户端返回 `Unexpected server response: 500`，普通 HTTP 请求 `/stream` 显示 `socket.once is not a function`。
**根因**：websocket route 在插件真正进入注册上下文前挂载，handler 被当成普通 HTTP handler 执行，第一个参数变成 Fastify request 而不是 WebSocket socket。
**规则**：1. `@fastify/websocket` 必须先 `app.register(websocket)`。2. WebSocket route 应放到后续 `app.register(async (routesApp) => { ... })` 的上下文里挂载，保证插件先于路由生效。3. 验证 WS 不能只看 TypeScript，必须用真实 WebSocket 客户端连接并检查首包事件。
**关联文件**：`server/src/index.ts`、`server/src/routes/streamRoutes.ts`、`server/src/realtime/streamHub.ts`

---

## 2026-05-22 - 每次完成后必须给用户可实际体验的验收步骤
**触发**：用户指出此前 UI 验收基本靠自己发现问题，要求每次完成后如果有可体验内容，必须给出明确验收步骤，避免一直下一步导致后续不知道哪里出问题。
**根因**：只展示开发者侧验证证据（typecheck、export、rg）不足以形成产品反馈闭环；用户需要知道“我现在能怎么体验、预期看到什么、哪里不对要反馈”。
**规则**：1. 每个完成项如果有可运行 / 可点击 / 可请求 / 可观察结果，最终回复和 `tasks/todo.md` Review 必须包含“用户验收步骤”。2. 验收步骤必须标明执行载体：`终端命令`、`浏览器操作`、`VSCode 命令面板`、`编辑器界面操作`之一。3. 终端命令必须是真实可运行命令，不能把菜单路径或快捷键写成命令。4. 验收步骤要写预期结果和异常反馈点，让用户能给出真实体验反馈。
**关联文件**：`tasks/todo.md`、`AGENTS.md`

---

## 2026-05-22 - 上下文窗口切换前必须写清当前断点
**触发**：用户提醒当前对话窗口快满，需要换窗口或清理，并要求项目进度不能出现断点。
**根因**：如果只依赖当前对话上下文，换窗口后容易丢失 HARD-GATE 状态、下一步任务和“不准编码”的阶段边界。
**规则**：1. 换窗口前必须把当前阶段、已确认项、下一步唯一动作写入 `tasks/todo.md`。2. 如果 Spec 分段已确认，要同步把 `tasks/spec.md` 的标题和小节状态从“待确认”改为“已确认”。3. 最终回复必须给出下个窗口可直接粘贴的接续提示，明确先读哪些文件、下一步做什么、哪些事情暂时不能做。
**关联文件**：`tasks/spec.md`、`tasks/todo.md`

---

## 2026-05-22 - 终端 API 可通不代表 Expo Web 可跨端口调用
**触发**：用户在 `http://localhost:8082` 前端发送消息后显示“服务端暂时没有回应”，但 PowerShell 直接请求 `http://127.0.0.1:8080/api/models` 正常返回。
**根因**：浏览器从 `8082` 请求 `8080` 是跨源请求，`POST /api/chat` 会先发 OPTIONS 预检；服务端没有 CORS / OPTIONS 支持时，终端请求能通，浏览器请求仍会被拦截。
**规则**：1. Web 端接 API 后必须用带 `Origin` 的 OPTIONS 请求验证 CORS，不只用 `Invoke-RestMethod` 验证 GET/POST。2. 开发期服务端至少返回 `Access-Control-Allow-Origin`、`Access-Control-Allow-Methods`、`Access-Control-Allow-Headers` 并处理 OPTIONS。3. 用户截图里出现 offline 时，先区分“后端没启动”“CORS 预检失败”“前端 base URL 错误”三类，不要只看终端 API 是否可通。
**关联文件**：`server/src/index.ts`、`apps/mobile/app/_config/api.ts`、`packages/api/src/client.ts`

---

## 2026-05-22 - Windows + pnpm hoisted 下子包 dev 脚本不要依赖子包 node_modules 链接
**触发**：重启服务端时 `pnpm dev:server` 报 `Cannot find module 'D:\code\cloudeMplatform\server\node_modules\tsx\dist\cli.mjs'`。
**根因**：当前 pnpm hoisted 模式下根目录 `node_modules/tsx` 可用，但 server 子包内的 `node_modules/tsx` 链接在运行时不可用；子包脚本直接执行 `tsx` 会解析到坏链接。
**规则**：1. 根脚本优先从仓库根执行工具，例如 `pnpm exec tsx watch server/src/index.ts`。2. 子包脚本如必须运行 CLI，可显式指向根 `../node_modules/<tool>/...`，避免依赖子包坏链接。3. 修复启动脚本后必须重新验证实际端口监听和 `/health`，不能只看进程 PID。
**关联文件**：`package.json`、`server/package.json`

---

## 2026-05-23 - 参考 HTML/CSS 的视觉参数必须先做精确映射

**触发**：用户提供 `explame/explame.html` 作为音频条原始参考，但上一轮调整没有严格按 `.v-bar` / `.v-cap` 的渐变和光影参数映射，而是额外叠加了顶部近白高光和更宽 glow 层。

**根因**：把“增强光感”理解成主观加层，而不是先从参考文件提取参数并在当前 Canvas / Skia 框架中做等价实现。

**规则**：有参考 HTML/CSS 时，先列出关键视觉参数（颜色 stop、透明度、shadow blur、cap 尺寸、动画公式），再做框架映射；除非用户明确要求强化，否则不要新增参考里没有的额外视觉层。实现要用必要 helper 封装映射，避免堆叠冗余绘制代码。

**关联文件**：`explame/explame.html`、`packages/ui/src/MusicSpectrum.tsx`

---

## 2026-05-23 - 性能实现说明不能沿用旧架构措辞

**触发**：用户追问频谱是否用了 Reanimated + Skia，以及“今天最开始改动前没有用 canvas 时怎么实现”，暴露 `MusicSpectrum` 文件里还残留 Animated / SVG 旧实现描述，容易误导对当前性能路径的判断。

**根因**：代码已从旧 Animated / SVG 热路径迁到 Native Skia + Web 单 canvas fallback，但注释没有随实现一起更新；旧架构词汇留在高频动画组件里，会让后续排查性能时方向跑偏。

**规则**：性能敏感组件改架构后，必须同步更新文件头、fallback 注释和关键 helper 注释；描述当前实现时只写真实运行路径，不用“历史上曾经怎么做”的词。若需要保留历史信息，只能放在任务记录或 lessons 中。

**关联文件**：`packages/ui/src/MusicSpectrum.tsx`

---

## 2026-05-23 - 排障兜底必须在根因修复后反向删除

**触发**：NativeWind / React 19 类型问题排查时临时加过 `declare module 'react'`、重复 tsconfig `types` 和 `expo-image` override；用户提醒项目不要有冗余包和垃圾代码。

**根因**：排障过程中容易把“试过的兜底”留在仓库里，即使真正根因已经变成依赖矩阵不一致。残留 shim 会让后续维护者误判当前系统还依赖这些补丁。

**规则**：1. 修复依赖矩阵后必须做一次反向验证：删掉 shim / override / 重复配置后跑 typecheck。2. 只有删掉会复现问题的兜底才能保留，并且必须写明本地验证证据。3. 根 `package.json` 的 pnpm overrides 必须能被 `pnpm why` 或明确 issue 链路证明，否则视为临时垃圾优先删除。

**关联文件**：`apps/mobile/nativewind-env.d.ts`、`packages/ui/nativewind-env.d.ts`、`apps/mobile/tsconfig.json`、`packages/ui/tsconfig.json`、`package.json`

---

## 2026-05-23 - 诊断信息不能伪装成产品入口

**触发**：为解释当前音乐 provider 状态，我把 `SOURCE / FALLBACK` 诊断条直接放进主播放界面。用户指出它看起来 low，且不清楚这个功能是干什么的。

**根因**：把开发者排障信息当成用户功能交付，缺少产品语义和成熟交互设计；诊断条既不是“音乐插件入口”，也不能解决真实 LLM / 真实音源未配置的问题。

**规则**：1. 诊断接口可以保留在服务端或开发工具里，但不要直接出现在主产品界面。2. 面向用户的“插件 / 音源管理”必须先定义目标用户动作、状态文案和入口位置，再设计交互；不能用 provider id / missing env 这种开发语言当产品文案。3. 若需要复杂展开面板，优先使用成熟抽屉 / sheet 形态或项目已有 Reanimated 交互模式，避免临时堆一个静态卡片。

**关联文件**：`apps/mobile/app/index.tsx`、`server/src/routes/apiRoutes.ts`、`tasks/spec.md`

---

## 2026-05-24 - 参考成熟项目时必须区分“上游事实”和“本项目设计目标”

**触发**：评估 LX Mobile 用户源方案时，我把“源脚本长驻加载”说成参考方向，但 LX Mobile 的事实是切换源时 `destroy()` 后再 `loadScript()`；用户指出该表述会影响 Spec 生命周期设计。

**根因**：把性能优化目标和上游实际实现混在一起，没有明确说明“这是 Claudio 的设计选择，不是 LX 原样行为”。

**规则**：1. 引用外部项目时先写事实：文件路径、函数、真实生命周期。2. 再写本项目决策：哪些照搬、哪些只参考、哪些因架构不同而改写。3. 性能类词汇如“常驻 / 热切换 / 缓存 / worker”必须定义范围和失效条件，不能笼统描述。4. 如果方案涉及不可信代码执行，必须同时写清隔离模型和替换层兼容风险。

**关联文件**：`tasks/spec.md` §11、`lx-music-mobile-1.8.4/src/core/userApi.ts`、`lx-music-mobile-1.8.4/src/utils/nativeModules/userApi.ts`

---

## 2026-05-25 - 阶段完成后必须归档 Spec，行数只做巡检

**触发**：用户指出“行数不是好的触发器”：完整活跃阶段 Spec 本身可能很长，按 400 行硬压缩会丢失有效决策；更合理的触发点是阶段验收通过。

**根因**：把文档体积控制理解成行数阈值，而不是阶段生命周期管理；行数只能提示“可能有已完成阶段未归档”，不能决定当前活跃 Spec 是否该压缩。

**规则**：1. 阶段验收通过后（typecheck + 烟测全绿），立刻把完整阶段 Spec 归档到 `tasks/spec/<phase-name>.md`。2. `tasks/spec.md` 只保留跨阶段有效决策、当前活跃阶段完整内容、已完成阶段 3-5 行摘要。3. `spec.md` 超过 250 行时，只检查是否有已完成阶段未归档，不强制压缩当前阶段。4. `todo.md` 超过 120 行时，先压缩已完成任务，再追加 Review 或下一阶段任务。

**关联文件**：`AGENTS.md`、`tasks/spec.md`、`tasks/todo.md`

---

## 2026-05-25 - 主推荐与切歌播报必须隔离上下文

**触发**：普通推荐时主播文案出现“从上一首切到这一首”的串台表达，用户指出每次推荐应该围绕本轮请求，而不是默认承接上一首歌。

**根因**：主推荐 prompt 把 `currentTrack` 和本轮候选一起喂给模型，模型会自作聪明地把普通推荐写成切歌过渡；同时歌曲背景护栏过紧，会让主播只剩空泛听感，缺少真实电台的趣味。

**规则**：1. 普通推荐默认只围绕本轮用户输入和本轮候选曲，不能提上一首、切到、换到、承接。2. 只有用户明确说“接着上一首 / 类似这首 / 换个同风格”等指代当前播放时，主推荐才可引用当前曲。3. 切歌短播报才允许使用上一首上下文，并且必须与普通推荐使用独立 prompt。4. 可以讲高置信公开歌曲背景、创作趣事或歌手信息，但拿不准时只讲听感，不能编造硬事实或用“据说 / 好像”包装猜测。

**关联文件**：`server/src/llm/prompt.ts`、`server/src/state/radioState.ts`、`server/src/radio/djCopy.ts`
