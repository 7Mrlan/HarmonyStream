---
name: react-native-best-practices
description: 写 React Native 组件、页面、Hook 时触发。约束 TS 类型、性能、可复用结构。
---

# React Native 最佳实践（Claudio 项目）

## 触发场景
- 新建/修改 `apps/mobile` 下的 RN 组件、页面、Hook
- 新建 `packages/ui` 下的可复用组件
- 处理列表性能、动画、原生模块封装

## 项目硬约束
1. **TypeScript only**：禁用 `any`，公共 props 必须导出 interface/type
2. **多行中文注释**：所有函数和关键逻辑用 `/* */` 注释
3. **组件式开发**：写页面前先看 `packages/ui` 是否已有可复用组件，没有再封新的
4. **不改无关逻辑**：每次只动当前任务范围内的文件

## 组件骨架（标准模板）
```tsx
/*
 * 组件：<名字>
 * 作用：<一句话职责>
 */
import { View, Text } from 'react-native';

/* Props 类型，必须导出供外部复用 */
export interface XxxProps {
  title: string;
  onPress?: () => void;
}

/* 函数式组件 + 命名导出，禁用 default export 以利重构 */
export function Xxx({ title, onPress }: XxxProps) {
  return (
    <View className="px-4 py-2">
      <Text className="text-base">{title}</Text>
    </View>
  );
}
```

## 性能红线
- **列表渲染**：超过 20 项必须用 `FlashList`（推荐）或 `FlatList`，禁用 `ScrollView` + `map`
- **图片加载**：用 `expo-image`，自动处理缓存与降级；禁用裸 `<Image>`
- **动画**：用 `react-native-reanimated` v3 worklet，禁用 `Animated` API
- **重渲染**：列表项必须 `React.memo`，回调必须 `useCallback`

## Hook 规范
- 业务逻辑 Hook 放 `packages/core/hooks/`，命名 `useXxx`
- 副作用必须有清理函数（取消订阅、abort、clearTimeout）
- 禁用 `useEffect` 内 async 直接函数；用内部 IIFE 包

## 平台分叉
- 平台差异大于 3 行时拆 `Xxx.android.tsx` / `Xxx.ios.tsx` / `Xxx.web.tsx`
- 小差异用 `Platform.select`：
```tsx
const padding = Platform.select({ ios: 12, android: 8, default: 10 });
```

## 安全区与状态栏
- 屏幕容器统一用 `SafeAreaView`（来自 `react-native-safe-area-context`）
- 状态栏样式由顶层 `<StatusBar style="light" />` 统一控制，组件内不再单独设

## 禁止事项
- 禁止内联样式对象（`style={{ ... }}`）— Claudio 全栈 NativeWind，统一 className
- 禁止直接拼接字符串路径，改用 `expo-router` 的类型化路径
- 禁止在组件内直接 `fetch`，所有网络走 `packages/api` 的 client
