---
name: expo-tailwind-setup
description: 配置或使用 NativeWind（Tailwind for RN）时触发。约束 className 用法和主题。
---

# NativeWind 配置与用法（Claudio 项目）

## 安装一次性命令
```
npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context
```

## 关键配置文件

### `tailwind.config.js`
```js
/* Claudio 设计 token 集中定义在这里，组件全部复用 */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/ui/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg:     '#000000',     /* 主背景：纯黑 */
        panel:  '#0a0a0a',     /* 面板：近黑 */
        line:   '#1f1f1f',     /* 分割线 */
        text:   '#e8e8e8',     /* 主文字：米白，不用纯白 */
        muted:  '#6b7280',     /* 次文字 */
        accent: '#00ff88',     /* 主色：荧光绿（ON AIR、播放进度）*/
        live:   '#ff3355',     /* LIVE 红 */
      },
      fontFamily: {
        pixel: ['PixelOperator', 'Cubic11', 'monospace'],  /* 标题/数字，中文回退 Cubic11 */
        mono:  ['VT323', 'Cubic11', 'monospace'],          /* 正文等宽，中文回退 Cubic11 */
        cn:    ['Cubic11', 'monospace'],                   /* 纯中文场景直接指定 */
      },
      letterSpacing: {
        pixel: '0.08em',  /* 像素字必加字距，否则糊成一团 */
      },
    },
  },
  plugins: [],
};
```

### `babel.config.js`
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
```

### `metro.config.js`
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
```

### `global.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### `nativewind-env.d.ts`
```ts
/// <reference types="nativewind/types" />
```

## className 使用规范
```tsx
/* 推荐：原子类组合 */
<View className="bg-bg px-4 py-3 border-b border-line">
  <Text className="font-pixel text-text text-2xl tracking-pixel">
    21:11
  </Text>
</View>
```

## 设计 token 调用约束
- **颜色**：永远用 token（`bg-bg`/`text-accent`），禁止裸十六进制
- **字体**：标题与时间数字必须 `font-pixel`，正文必须 `font-mono`
- **字距**：像素字体必带 `tracking-pixel`

## 暗黑/明亮主题切换
```tsx
/* 使用 nativewind 的 colorScheme 钩子，跟随系统或手动切换 */
import { useColorScheme } from 'nativewind';
const { colorScheme, setColorScheme } = useColorScheme();
```
夜间为主，明亮模式只调降亮度而不改色相，保留像素风的赛博质感。

## 禁止事项
- 禁止内联 `style` prop 写颜色/间距
- 禁止在 className 字符串里拼接表达式（例外：`clsx`/`twMerge`）
- 禁止跳过 token 直接用 `text-[#00ff88]`，新增颜色必须先加 token
