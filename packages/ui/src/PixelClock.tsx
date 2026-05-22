/*
 * 组件：PixelClock
 * 作用：大号像素时钟，对应效果图顶部的 21:11
 * 特征：PixelOperator 字体 / 72px / 字距 0.08em / 冒号轻微呼吸
 * 动效：冒号用两个像素点绘制，避免字体缺字或对齐异常
 *      避免硬翻转造成的"卡顿感"，比直接 setInterval 更高级
 */

import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export interface PixelClockProps {
  /* 是否显示秒级精度（默认 false，仅显示 HH:MM） */
  showSeconds?: boolean;
  /* 外层附加 className，用于布局调整 */
  className?: string;
}

/* 工具：补两位 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/* Hook：每秒更新时间字符串 */
function useNow(showSeconds: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return {
    hh: pad2(now.getHours()),
    mm: pad2(now.getMinutes()),
    ss: pad2(now.getSeconds()),
    showSeconds,
  };
}

/*
 * Hook：冒号呼吸 opacity（1.0 ↔ 0.78）
 *   每 1s 一个完整周期，使用 sine 缓动让起伏更自然
 */
function useColonBreathe() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(opacity);
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.78, {
          duration: 500,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(1, {
          duration: 500,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  /* 冒号呼吸只改透明度，避免旧 Animated 在 Web 上每帧占用 JS。 */
  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}

export function PixelClock({ showSeconds = false, className }: PixelClockProps) {
  const { hh, mm, ss, showSeconds: withSeconds } = useNow(showSeconds);
  const colonAnimatedStyle = useColonBreathe();

  return (
    <View className={`flex-row items-center justify-center ${className ?? ''}`}>
      <Text className="font-pixel text-text text-7xl tracking-pixel">{hh}</Text>

      <Animated.View
        style={[
          {
            width: 26,
            height: 84,
            marginHorizontal: 6,
            alignItems: 'center',
            justifyContent: 'center',
          },
          colonAnimatedStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            top: 26,
            width: 8,
            height: 8,
            backgroundColor: '#e8e8e8',
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 26,
            width: 8,
            height: 8,
            backgroundColor: '#e8e8e8',
          }}
        />
      </Animated.View>

      <Text className="font-pixel text-text text-7xl tracking-pixel">{mm}</Text>

      {withSeconds ? (
        <Text className="font-pixel text-muted text-2xl tracking-pixel ml-2">{ss}</Text>
      ) : null}
    </View>
  );
}
