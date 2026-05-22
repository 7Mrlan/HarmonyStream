---
name: ui-polish
description: UI 走查、微交互打磨、"看着可用但不够精致"时触发。
keywords: [polish, micro-interaction, refinement, detail, finishing]
---

# UI 打磨清单（Claudio 项目）

## 何时使用
功能跑通后，进入"看起来还行但不够精致"阶段。逐项过这份 checklist。

## 加载态
- [ ] 列表/数据未到位时显示**骨架屏**而非 spinner
- [ ] 骨架屏配色用 `bg-panel`，不用浅灰（保暗黑风格）
- [ ] 骨架屏微微脉动（opacity 0.5 ↔ 0.8）

## 空状态
- [ ] 永远不留白屏，给一句"还没歌单，去搜索一首试试 →"
- [ ] 空状态必须有可点击 CTA，不是死页

## 错误态
- [ ] 网络错误 → 显示像素风的"OFFLINE"图标 + 重试按钮
- [ ] 不要用红色背景大块，只用 `text-live` 一行小字

## 反馈
- [ ] 所有按钮按下必有 `Haptics.impactAsync(Light)`
- [ ] Pressable 必须有 `active:` 视觉反馈（如 `active:bg-line`）
- [ ] 长按操作必须 200ms 后 `Haptics.Medium` 提示已触发

## 过渡
- [ ] 页面切换用 expo-router 的 stack animation：`slide_from_right` 或 `fade`
- [ ] 内容首次出现用 200ms `fade-in`，禁止瞬间出现
- [ ] 列表项进入用 stagger 50ms 错开，不超过前 5 项做动画

## 文案
- [ ] 所有按钮文案大写：`PLAY` / `LOGIN` / `FAV`
- [ ] 时间格式统一：`HH:MM`，秒数不显示
- [ ] 数字不补 0 的留空格对齐：`9 :05` 而非 `09:05`（但时钟主屏要补 0）
- [ ] 错误文案口吻冷静克制：`无法连接到 Claudio`，不写 `哎呀出错啦~`

## 边界保护
- [ ] 长歌名 / 长艺人名必须 `numberOfLines={1}` + `ellipsizeMode="tail"`
- [ ] 横屏布局至少不崩（即使不优化，也别遮挡核心控件）
- [ ] 输入框 keyboard 弹出后内容不被挡住（`KeyboardAvoidingView`）
- [ ] 极小屏（< 360 宽）字号自动降一档

## 性能
- [ ] 列表 60fps（用 React DevTools Profiler 验）
- [ ] 图片用 blurhash 占位，避免白闪
- [ ] 路由切换 < 300ms

## 一致性
- [ ] 同类按钮在不同页面尺寸/颜色一致
- [ ] icon 大小同屏不混用（要么全 16，要么全 24）
- [ ] 圆角同屏不混用（像素风优先 0 / 6）

## 收尾自检
- [ ] 关掉网络试一遍
- [ ] 切到亮色模式看一遍（暂未做就接受 fallback 即可）
- [ ] 让一个不熟悉项目的人盲打开 5 秒，问"这是干嘛的"
- [ ] 截屏放进设计稿同屏对比，差距 < 10%
