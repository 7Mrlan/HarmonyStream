---
name: expo-native-ui
description: 使用 Expo SDK 原生 UI 模块（StatusBar、SafeArea、Image、Haptics、Blur）时触发。
---

# Expo 原生 UI 速查（Claudio 项目）

## 必装核心包（apps/mobile）
```
expo-status-bar           // 状态栏样式
expo-image                // 取代 RN Image，带缓存
expo-blur                 // 高斯模糊层（电台 LIVE 区背景用）
expo-haptics              // 触觉反馈（按键反馈）
expo-linear-gradient      // 渐变（像素风扫描线效果）
react-native-safe-area-context  // 安全区
```

## StatusBar
```tsx
import { StatusBar } from 'expo-status-bar';
/* 顶层 _layout.tsx 设置一次，全局生效 */
<StatusBar style="light" backgroundColor="#000" translucent />
```

## SafeArea（推荐用 hook 而非组件，避免布局闪烁）
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const insets = useSafeAreaInsets();
<View style={{ paddingTop: insets.top }}>
```

## expo-image（统一图片方案）
```tsx
import { Image } from 'expo-image';
<Image
  source={cover}
  contentFit="cover"
  transition={200}        /* 淡入过渡 200ms */
  cachePolicy="memory-disk"
  placeholder={blurhash}  /* 用 blurhash 占位，避免白闪 */
/>
```

## 触觉反馈（电台核心交互必加）
```tsx
import * as Haptics from 'expo-haptics';
/* 主要按钮（播放/暂停）：Light */
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
/* 重要切换（喜欢/取消）：Medium */
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
/* 错误反馈：Notification.Error */
await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
```

## BlurView（用于"LIVE"指示区背景）
```tsx
import { BlurView } from 'expo-blur';
<BlurView intensity={40} tint="dark" className="px-3 py-1 rounded-md" />
```

## LinearGradient（像素风扫描线、暗色衬底）
```tsx
import { LinearGradient } from 'expo-linear-gradient';
<LinearGradient
  colors={['#000000', '#0a0a0a', '#000000']}
  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
  style={StyleSheet.absoluteFill}
/>
```

## 字体加载（像素字体核心）
```tsx
/* apps/mobile/app/_layout.tsx */
import { useFonts } from 'expo-font';
const [loaded] = useFonts({
  'PixelOperator': require('../assets/fonts/PixelOperator.ttf'),
  'VT323':        require('../assets/fonts/VT323-Regular.ttf'),
});
if (!loaded) return null;  /* 字体加载完成前空白，避免 FOUT */
```

## 禁止事项
- 禁止用 RN 原生 `<Image>`，统一 `expo-image`
- 禁止在组件内 `useFonts`，必须在根 layout 加载
- 禁止 `Alert.alert`（破坏暗色风格），用项目自带的 `<Toast />` 组件
