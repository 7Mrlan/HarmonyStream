---
name: pixel-art-ui-patterns
description: 实现像素风组件、像素动画、点阵图标时触发。
keywords: [pixel-art, retro, 8-bit, dot-matrix, scanline, crt]
---

# 像素风 UI 实现模式（Claudio 项目）

## 像素风的"高级感"从哪来
反例：堆 emoji + 鲜艳色 + 圆角 = 像幼儿园
正解：**单色基底 + 一个点睛色 + 像素字体 + 硬边 + 微妙的扫描线**

## 字体（必须本地打包）
| 字体 | 用途 | 文件 | 许可 |
|---|---|---|---|
| **PixelOperator** | 时钟、英文标题 | PixelOperator.ttf | CC0 |
| **VT323** | 英文正文、聊天 | VT323-Regular.ttf | OFL |
| **Cubic 11** | **中文全场景**（标题/正文/按钮） | Cubic_11.ttf | OFL，开源 |
| **Press Start 2P**（备用） | 装饰性大字 | PressStart2P.ttf | OFL |

> Cubic 11 来源：https://github.com/ACh-K/Cubic-11 ，11×11 像素中文字体，覆盖 GB2312。
> 字体包总大小约 1.2MB，本地打包不联网下载。

字体放 `apps/mobile/assets/fonts/`，统一在根 `_layout.tsx` 用 `expo-font` 预加载。

## 组件模式

### 像素时钟（核心视觉）
```tsx
/*
 * 像素时钟：72px PixelOperator，字距 0.08em
 * 冒号用单独 Text 包裹做呼吸闪烁
 */
<View className="flex-row items-baseline">
  <Text className="font-pixel text-7xl text-text tracking-pixel">21</Text>
  <Text className="font-pixel text-7xl text-text tracking-pixel animate-pulse">:</Text>
  <Text className="font-pixel text-7xl text-text tracking-pixel">11</Text>
</View>
```

### ON AIR 指示器（点睛色登场）
```tsx
<View className="flex-row items-center gap-2">
  {/* 呼吸圆点：reanimated 做 1s opacity 循环 */}
  <Animated.View
    style={[{ width: 8, height: 8, backgroundColor: '#00ff88' }, breathingStyle]}
  />
  <Text className="font-pixel text-xs text-accent tracking-pixel">ON AIR</Text>
</View>
```

### 点阵网格背景（提升质感的关键）
```tsx
/* 用 SVG pattern 或 react-native-svg 画 1px 点阵，间距 8px */
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';
<Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
  <Defs>
    <Pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
      <Circle cx="1" cy="1" r="0.5" fill="#1f1f1f" />
    </Pattern>
  </Defs>
  <Rect width="100%" height="100%" fill="url(#dots)" />
</Svg>
```

### 扫描线效果（CRT 老电视质感，谨慎使用）
```tsx
/* 横向 1px 暗线每 3px 一道，用 opacity 0.04 极淡 */
<LinearGradient
  colors={['rgba(255,255,255,0.04)', 'transparent', 'rgba(255,255,255,0.04)']}
  locations={[0, 0.5, 1]}
  style={[StyleSheet.absoluteFill, { mixBlendMode: 'overlay' }]}
/>
```

### 进度条（硬边块状）
```tsx
/* 像素风进度条：方块填充而非平滑渐变 */
<View className="h-1 bg-panel border border-line">
  <View
    className="h-full bg-accent"
    style={{ width: `${(progress / duration) * 100}%` }}
  />
</View>
```

### 按钮（无圆角硬边）
```tsx
<Pressable
  onPress={handlePress}
  className="border border-line bg-panel px-4 py-2 active:bg-line"
>
  <Text className="font-pixel text-text tracking-pixel">PLAY</Text>
</Pressable>
```

## 像素图标
- 用 `react-native-svg` 绘制，路径格点对齐 1px
- 禁止用 emoji 代替图标
- 大小固定 16px / 24px，避免缩放糊

## 像素动画
- 帧动画用 reanimated 的 `withSequence` + 离散值跳变
- 不要平滑插值，要"跳"才有像素感
- 例：呼吸圆点 opacity `[1, 0.4, 1]` 用 `withTiming` 每段 500ms

## 反模式
- ❌ Material 风波纹涟漪
- ❌ iOS 风毛玻璃大圆角
- ❌ 渐变色按钮
- ❌ emoji 装饰
- ❌ Gif 动画（用 Lottie 或 reanimated 逐帧）
