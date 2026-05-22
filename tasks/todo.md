# Claudio · 迭代待办清单

> 任何变更先改 `tasks/spec.md`，再来勾选这里。
> 完成一项立刻打勾，不要批量勾选。

---

## Iter 0 · 骨架

### 0.1 工作区
- [x] 根 `package.json`（含 pnpm 工作区脚本：`dev` / `build` / `lint` / `typecheck`）
- [x] `pnpm-workspace.yaml`（声明 `apps/*` + `packages/*` + `server`）
- [x] `.gitignore` / `.editorconfig` / `.prettierrc` / `.eslintrc.json`
- [x] 根 `tsconfig.json`（project references）

### 0.2 共享配置包
- [x] `packages/tsconfig/base.json`（`strict`、`noUncheckedIndexedAccess`）
- [x] `packages/tsconfig/react-native.json`
- [x] `packages/tsconfig/node.json`
- [x] `packages/tsconfig/package.json`

### 0.3 UI 包（含 token 真源）
- [x] `packages/ui/package.json`
- [x] `packages/ui/tailwind-tokens.js`（颜色 / 字体 / 字号 / 间距 / 圆角）
- [x] `packages/ui/src/index.ts`（命名导出占位）
- [x] `packages/ui/src/PixelClock.tsx`（首个组件）
- [x] `packages/ui/tsconfig.json`

### 0.4 业务核心包
- [x] `packages/core/package.json`
- [x] `packages/core/src/index.ts`（占位）
- [x] `packages/core/tsconfig.json`

### 0.5 API 包
- [x] `packages/api/package.json`
- [x] `packages/api/src/types.ts`（HTTP 契约 TypeScript 类型）
- [x] `packages/api/src/index.ts`
- [x] `packages/api/tsconfig.json`

### 0.6 移动端 App
- [x] `apps/mobile/package.json`
- [x] `apps/mobile/app.json`（含 Android 包名 / 权限 / `userInterfaceStyle: dark`）
- [x] `apps/mobile/babel.config.js`（NativeWind preset）
- [x] `apps/mobile/metro.config.js`（NativeWind + monorepo `watchFolders`）
- [x] `apps/mobile/tailwind.config.js`（`require` 共享 token）
- [x] `apps/mobile/global.css`
- [x] `apps/mobile/nativewind-env.d.ts`
- [x] `apps/mobile/tsconfig.json`
- [x] `apps/mobile/assets/fonts/PixelOperator.ttf`
- [x] `apps/mobile/assets/fonts/VT323-Regular.ttf`
- [x] `apps/mobile/assets/fonts/Cubic_11.ttf`
- [x] `apps/mobile/app/_layout.tsx`（字体加载 + `StatusBar` + `SafeAreaProvider`）
- [x] `apps/mobile/app/index.tsx`（仅渲染 `<PixelClock>` 验证骨架）

### 0.7 后端
- [x] `server/package.json`
- [x] `server/tsconfig.json`
- [x] `server/src/index.ts`（Fastify 起服 + `/health`）
- [x] `server/.env.example`

### 0.8 验证
- [x] `pnpm install` 全绿（81 包，54.9s）
- [x] `pnpm typecheck` 全绿（包全过）
- [x] `pnpm lint` 全绿（包全过）
- [ ] 浏览器 `pnpm dev:mobile` → `w` 键启动 web，看到 `PixelClock` 渲染当前时间
- [ ] 颜色、字体、字距对照 spec 检查
- [ ] 后端 `pnpm dev:server`，访问 `http://localhost:8080/health` 返回 ok
- [ ] **HARD-GATE：截图给用户 review 后才进 Iter 1**

---

## 三档手机 / 浏览器验证指北

### 档位一 · Web 浏览器（最快，零准备）
**适用**：UI 调试、字体效果、布局验证，0% 准备工作

```powershell
# 在仓库根目录
pnpm dev:mobile
# 终端出 QR 码后，按 w 键启动 web 模式
# 浏览器自动打开 http://localhost:8081，看到时钟
```

**预期**：纯黑背景中央显示 `HH:MM` 像素时钟，冒号每秒闪烁。

---

### 档位二 · Expo Go App（真机，5 分钟准备）
**适用**：手势、性能、字体在真实手机上的渲染效果

1. 手机应用商店搜索 **Expo Go** 并安装
2. 手机和电脑连接同一 WiFi
3. 在仓库根目录运行 `pnpm dev:mobile`
4. 用 Expo Go 扫终端 QR 码，几秒后真机看到时钟

**注意**
- Expo Go 不支持 `react-native-track-player`，要到 Iter 2 才切换 dev-client，现在用 Expo Go 就够
- 改代码会自动热更新

---

### 档位三 · Android Emulator（最完整，20 分钟准备，Iter 2 起必需）
**适用**：后台播放、锁屏控件、媒体通知（Iter 2+ 项目）

1. 安装 Android Studio：`https://developer.android.com/studio`
2. 打开 SDK Manager 安装以下依赖
   - Android 14（API 34）SDK Platform
   - Intel x86 Emulator Accelerator（HAXM）
3. 在 AVD Manager 创建 Pixel 7（API 34）虚拟设备
4. 启动模拟器
5. 在仓库根目录运行 `pnpm --filter @claudio/mobile run android` 自动安装到模拟器

**注意**
- 第一次 `expo run:android` 会下载 gradle / sdk 依赖，可能需要 10 分钟
- 必须先在 `apps/mobile` 下手动执行 `npx expo prebuild --platform android` 生成原生工程

---

## Iter 0 验证步骤（推荐执行顺序）

```powershell
# 1. 启动后端（新终端）
pnpm dev:server
# 浏览器访问 http://localhost:8080/health
# 应返回 { ok: true, ... }

# 2. 启动移动端 web 模式（新终端）
pnpm dev:mobile
# 出 QR 码后按 w 键，浏览器自动打开
# 看到大号像素时钟跳动 = 通过

# 3. （可选）真机验证
# 手机安装 Expo Go，扫描终端 QR 码
```

---

## Iter 1 · 静态主屏（待 Iter 0 验证通过后展开）

暂留：完成 Iter 0 后展开详细清单。

---

## Iter 2-8

暂留：按 `spec.md` 第 8 节顺序展开。

---

## Review 区

### Iter 0 Review
- [ ] 完成日期：
- [ ] 验证截图：
- [ ] 风险记录：
- [x] 经验沉淀至 `tasks/lessons.md`（已记录 4 条：GitHub 不通 / pnpm 启用 / 镜像加速 / 字体目录陷阱）

## 2026-05-21 IDE 报错清理
- [x] 排查 `apps/mobile/tsconfig.json` schema 报错与 `react-native` 类型提示的根因
- [x] 统一 VSCode 使用的 TypeScript SDK 与 tsconfig schema 源
- [x] 验证 `packages/ui` 与 `apps/mobile` 的 TypeScript 无报错

### 2026-05-21 IDE 报错清理 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：`tsc --noEmit -p packages/ui/tsconfig.json`、`tsc --noEmit -p apps/mobile/tsconfig.json` 均通过
- [x] 残余风险：VSCode 若仍显示旧缓存，执行 “TypeScript: Restart TS Server” 或重载窗口

## 2026-05-21 根 tsconfig 空 files 报错
- [x] 排查根目录 `tsconfig.json` 的 `files` 为空报错根因
- [x] 修正根目录 `tsconfig.json` 为工作区入口配置
- [x] 验证根目录 `tsconfig.json` 不再触发空 `files` 报错

### 2026-05-21 根 tsconfig Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：`tsc --noEmit -p tsconfig.json`、`tsc --noEmit -p apps/mobile/tsconfig.json`、`tsc --noEmit -p packages/ui/tsconfig.json` 均通过
- [x] 残余风险：VSCode 若仍显示旧诊断，执行 “TypeScript: Restart TS Server” 或重载窗口

## 2026-05-21 AGENTS 运行指令约束补充
- [x] 补充 `AGENTS.md` 中关于终端命令与 IDE 命令的区分规则
- [x] 记录本次“把 VSCode 动作误写成终端命令”的教训到 `tasks/lessons.md`
- [x] 复核新增规则表述，确保后续可直接执行

### 2026-05-21 AGENTS Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：`AGENTS.md` 已新增运行指令执行载体、IDE 动作不得伪装成终端命令、终端 / IDE 做法必须显式区分等规则；`tasks/lessons.md` 已记录本次教训
- [x] 残余风险：该规则只能约束后续 AI 行为，不能自动修复历史对话中的错误指令

## 2026-05-21 tasks/todo.md 乱码修复
- [x] 排查 `tasks/todo.md` 是否为单文件乱码
- [x] 重写 `tasks/todo.md` 为干净 UTF-8 内容并保留原有待办状态
- [x] 复核 `tasks/todo.md` 的标题、清单、Review 区均可正常阅读

### 2026-05-21 todo 乱码修复 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：`tasks/spec.md`、`tasks/lessons.md`、`AGENTS.md` 均正常，`tasks/todo.md` 已重写为可读中文内容
- [x] 残余风险：若编辑器仍显示旧乱码缓存，关闭再重新打开 `tasks/todo.md`

## 2026-05-21 播放器霓虹控制台 UI 迁移
- [x] 梳理 `NowPlayingBar`、`PlayerControls`、`useRadioPlayer` 的现状和功能边界
- [x] 在 `tasks/spec.md` 记录现状分析和迁移方向
- [x] HARD-GATE：用户确认按钮大小按系统评估、频谱位置保持当前、频谱加灯条
- [x] 按确认后的 Spec 改造按钮 SVG、玻璃面板、频谱条、LED cap、涟漪和播放状态动效
- [x] 保留现有播放 / 暂停 / 上一首 / 下一首 / seek 功能，并完成 TypeScript 验证

### 2026-05-21 播放器霓虹控制台 UI 迁移 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：VSCode 诊断 `NowPlayingBar.tsx`、`PlayerControls.tsx` 均无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过
- [x] 残余风险：`pnpm --filter @claudio/ui typecheck` 因包内 `node_modules/typescript/bin/tsc` 缺失失败，改用根目录 TypeScript 入口验证已通过

## 2026-05-21 频谱条完全替换修正
- [x] 仅修改 `NowPlayingBar.tsx` 频谱条，不触碰按钮组件
- [x] 将频谱条样式替换为用户 HTML 中的 `v-bar` 线性渐变和 `v-cap` 白色过载块风格
- [x] 保留用户 HTML 中的随机 noise、正弦 wave、中心衰减、上升 0.3 / 下落 0.15、cap 重力下落 0.8 逻辑
- [x] 验证 `NowPlayingBar.tsx` 诊断无报错，`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过
- [x] 将“完全替换不能做近似迁移”的教训写入 `tasks/lessons.md`

### 2026-05-21 频谱条完全替换修正 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：VSCode 诊断 `NowPlayingBar.tsx` 无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过
- [x] 残余风险：React Native 无 CSS `linear-gradient`，已用 `react-native-svg` 的 `LinearGradient` 等价复刻视觉，不改变按钮组件

## 2026-05-21 频谱条按用户源码重写
- [x] 删除旧 `WaveformBars` 实现，只保留 `NowPlayingBar` 中原位置调用点
- [x] 按用户源码结构重建 `visualizer-container`、`v-bar-wrapper`、`v-bar`、`v-cap`
- [x] 按用户源码逻辑重建 `frequencies`、`capPositions`、`updateVisualizer`、`requestAnimationFrame`
- [x] 将当前系统 `playing` 状态接入用户源码里的 `isPlaying` 判断位置
- [x] 验证 `NowPlayingBar.tsx` 诊断无报错，`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过

### 2026-05-21 频谱条按用户源码重写 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：VSCode 诊断 `NowPlayingBar.tsx` 无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过
- [x] 残余风险：React Native 没有 DOM 与 CSS 类名，已用 `View` / `Svg` 对应实现，但保留用户源码的结构、数值、动画公式和播放状态联动

## 2026-05-21 实际显示频谱组件修正
- [x] 定位截图里的频谱来自 `apps/mobile/app/index.tsx` 渲染的 `MusicSpectrum`，而不是 `NowPlayingBar` 内部频谱
- [x] 保持按钮组件不动，只重写 `packages/ui/src/MusicSpectrum.tsx`
- [x] 删除旧 `MusicSpectrum` 的音游网格、64 根节拍算法和旧样式
- [x] 将 `MusicSpectrum` 改为用户源码的 48 根 `visualizer-container` / `v-bar-wrapper` / `v-bar` / `v-cap` 结构和 RAF 动画
- [x] 将主屏 `MusicSpectrum` 高度从 96 调整为用户源码的 200
- [x] 验证 `MusicSpectrum.tsx`、`apps/mobile/app/index.tsx` 诊断无报错；`packages/ui` 和 `apps/mobile` TypeScript 均通过

### 2026-05-21 实际显示频谱组件修正 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：VSCode 诊断 `MusicSpectrum.tsx`、`index.tsx` 无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json`、`pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` 均通过
- [x] 残余风险：此前改了 `NowPlayingBar` 内部隐藏频谱，后续若不需要可再清理；当前截图对应位置已改为真实渲染的 `MusicSpectrum`

## 2026-05-21 频谱入场动画与歌曲名样式
- [x] 查看 `MusicSpectrum` 和 `NowPlayingBar` 当前实现，确认已有类与实际样式位置
- [x] 在 `MusicSpectrum` 中用 React Native `Animated` 复刻 `gsap.from(".v-bar-wrapper")` 的 scaleY / opacity / stagger 入场动画
- [x] 将 `NowPlayingBar` 歌曲信息区域改为 info-panel 居中、`marginBottom: 80`、`zIndex: 10`
- [x] 将歌曲名改为 song-title 样式：`#00ff9d`、28px、2px 字距、底部 15px、霓虹文字阴影
- [x] 保留当前播放状态、进度条、seek 和真实播放状态联动
- [x] 验证 `MusicSpectrum.tsx`、`NowPlayingBar.tsx` 诊断无报错；`packages/ui` TypeScript 通过

### 2026-05-21 频谱入场动画与歌曲名样式 Review
- [x] 完成日期：2026-05-21
- [x] 验证证据：VSCode 诊断 `MusicSpectrum.tsx`、`NowPlayingBar.tsx` 无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过
- [x] 残余风险：React Native 不直接使用 GSAP，已用 `Animated` 等价复刻 GSAP 入场参数；字体沿用项目现有 `font-pixel`，未引入外部 Google Font

## 2026-05-22 PixelClock 冒号居中修正
- [x] 排查 `PixelClock` 冒号偏下的原因：外层使用 `items-baseline`，冒号容器按文本基线对齐而不是数字视觉中心对齐
- [x] 将时钟行改为 `items-center`，并用固定高度冒号容器 + 上下绝对定位像素点保证冒号在数字中线附近
- [x] 验证 `PixelClock.tsx` 诊断无报错，`packages/ui` TypeScript 通过
- [x] 复核当前前后端仍在运行，准备继续进入大进程下一步

### 2026-05-22 PixelClock 冒号居中修正 Review
- [x] 完成日期：2026-05-22
- [x] 验证证据：VSCode 诊断 `PixelClock.tsx` 无报错；`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 通过；前端 `http://localhost:8081` 与后端 `http://localhost:8080` 均仍在运行
- [x] 下一步：UI 微调基本完成后，按 `tasks/spec.md` 迭代地图继续进入 Iter 2“播放打通”
## 2026-05-22 动画架构升级与 Git 管理
- [x] 初始化 Git 仓库骨架
- [x] 调研当前动画瓶颈、依赖状态与 Expo SDK 52 官方兼容版本
- [x] 确认现状分析
- [x] 确认功能点与改造边界
- [ ] 确认风险与决策
- [ ] HARD-GATE：用户确认完整 Spec 后开始编码
- [ ] 安装 SDK 52 兼容的 `react-native-reanimated` 与 `@shopify/react-native-skia`
- [ ] 将进度条拖动改为 Reanimated/UI 线程驱动，降低拖动延迟
- [ ] 将频谱或粒子绘制迁移到 Skia，保留视觉效果并降低 React 重渲染
- [ ] 补齐 Web/Expo 兼容入口或降级路径
- [ ] 执行 TypeScript 与移动端验证
- [ ] 建立首个 Git 提交或至少完成可审查的 Git 状态

### 2026-05-22 动画架构升级与 Git 管理 Review
- [ ] 完成日期：
- [ ] 验证证据：
- [ ] 残余风险：

## 2026-05-22 NowPlayingBar 进度条功能修正
- [x] 确认现状分析：定位红色区域、时间显示、进度条动画与真实播放状态的当前关系
- [x] 确认功能点与改造边界
- [x] 确认风险与决策
- [x] HARD-GATE：用户确认完整 Spec 后开始编码
- [x] 修改 `packages/ui/src/NowPlayingBar.tsx`，去掉红色区域并接入真实歌曲时间
- [x] 修改进度条动画，让播放 / 暂停 / 上一首 / 下一首与视觉状态联动
- [x] 对齐进度条和主音频频谱条的视觉长度
- [x] 优化主频谱动画，保持视觉效果但减少每帧 React 重渲染
- [x] 修正 `expo-audio` Web 端时间单位，保证分钟:秒显示正确
- [x] 执行 TypeScript 验证并记录结果

### 2026-05-22 NowPlayingBar 进度条功能修正 Review
- [x] 完成日期：2026-05-22
- [x] 验证证据：终端命令 `pnpm.cmd exec tsc --noEmit -p packages/ui/tsconfig.json` 通过；终端命令 `pnpm.cmd exec tsc --noEmit -p apps/mobile/tsconfig.json` 通过；`rg` 复核目标渲染区域无 `VELOCITY:` 与紫色底部细线。
- [x] 残余风险：当前未新增 Skia/Reanimated 原生依赖，本轮是现有 `react-native-svg` + `Animated` 下的低风险优化；如果长时间真机仍卡，再单独评估 Skia/Reanimated。
