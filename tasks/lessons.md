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

**关联文件**：`AGENTS.md`、`tasks/lessons.md`

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
