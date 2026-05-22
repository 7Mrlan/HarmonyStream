/*
 * 根布局 _layout.tsx
 * ------------------
 * 1. 加载像素字体（PixelOperator / VT323 / Cubic 11）
 * 2. 字体未就绪时阻塞 SplashScreen，避免 FOUT 闪烁
 * 3. 注入 SafeAreaProvider + GestureHandlerRootView
 * 4. 设置全局深色 StatusBar
 * 5. 引入 NativeWind 全局样式
 */

import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';

/* 字体加载完毕前阻塞启动屏，避免无字体闪现 */
SplashScreen.preventAutoHideAsync().catch(() => {
  /* preventAutoHideAsync 可能因平台不支持而 reject，安全忽略 */
});

export default function RootLayout() {
  /*
   * 字体说明：
   *   - PixelOperator.ttf  时钟与英文标题
   *   - VT323-Regular.ttf  英文正文/对话
   *   - Cubic_11.ttf       中文全场景
   * 字体文件需要手动放入 assets/fonts/，详见 tasks/spec.md §3.2。
   * 缺失时 useFonts 会抛错，保证开发期能立即发现资源问题。
   */
  const [fontsLoaded, fontsError] = useFonts({
    PixelOperator: require('../assets/fonts/PixelOperator.ttf'),
    VT323: require('../assets/fonts/VT323-Regular.ttf'),
    Cubic11: require('../assets/fonts/Cubic_11.ttf'),
  });

  /* 字体就绪或加载失败都需要隐藏启动屏，否则用户卡死在白屏 */
  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontsError]);

  /* 字体尚未就绪时返回纯黑占位，防止字体回退导致的视觉跳变 */
  if (!fontsLoaded && !fontsError) {
    return <View className="flex-1 bg-bg" />;
  }

  return (
    <GestureHandlerRootView className="flex-1 bg-bg">
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#000000" translucent />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#000000' },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
