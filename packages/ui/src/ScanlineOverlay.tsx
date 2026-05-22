/*
 * 组件：ScanlineOverlay
 * 作用：全屏极淡的 CRT 扫描线叠加层
 * pointerEvents='none' 不阻挡下层交互
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect, Line } from 'react-native-svg';

export interface ScanlineOverlayProps {
  color?: string;
  step?: number;
  opacity?: number;
  /* 是否显示下移高光带，默认 false */
  showSweep?: boolean;
  /* 高光带下落周期（毫秒），默认 5000 */
  sweepDurationMs?: number;
}

/* Hook：高光带从顶部下落到底部，循环往复 */
function useSweep(active: boolean, durationMs: number) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false /* height 百分比无法 native driver */,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, durationMs, progress]);
  return progress;
}

export function ScanlineOverlay({
  color = '#ffffff',
  step = 3,
  opacity = 0.04,
  showSweep = false,
  sweepDurationMs = 5000,
}: ScanlineOverlayProps) {
  const progress = useSweep(showSweep, sweepDurationMs);

  /* 高光带 top: progress * '100%'，用 interpolate 拼出 */
  const sweepTop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10%', '110%'],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 静态扫描线 */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} opacity={opacity}>
        <Defs>
          <Pattern id="scan" width="100%" height={step} patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="100%" y2="0" stroke={color} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#scan)" />
      </Svg>

      {/* 下移高光带：80px 渐变方块，opacity 极淡 */}
      {showSweep ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: sweepTop,
            height: 80,
            backgroundColor: color,
            opacity: 0.05,
          }}
        />
      ) : null}
    </View>
  );
}
