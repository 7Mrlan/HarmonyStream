/*
 * 组件：OnAirIndicator
 * 作用：电台直播状态指示，显示呼吸圆点、扩散环和 ON AIR 文本。
 * 动画：使用 Reanimated 统一驱动红点和扩散环，避免 Web 端旧 Animated / setInterval 占用 JS。
 */

import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface OnAirIndicatorProps {
  /* 是否在线，false 时圆点变 muted 且停止动画 */
  online?: boolean;
  /* 自定义文案，默认 ON AIR */
  label?: string;
}

/*
 * Hook：直播指示动画。
 * 一个 shared value 同时驱动红点呼吸和外圈扩散，避免多个 JS 计时器。
 */
function useOnAirPulse(active: boolean) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);

    if (!active) {
      pulse.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(pulse);
    };
  }, [active, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 1], [0.6, 0]) : 0,
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.6, 2.4]) }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 0.5, 1], [1, 0.3, 1]) : 0.3,
  }));

  return { ringStyle, dotStyle };
}

export function OnAirIndicator({ online = true, label = 'ON AIR' }: OnAirIndicatorProps) {
  const { ringStyle, dotStyle } = useOnAirPulse(online);

  return (
    <View className="flex-row items-center">
      <View
        style={{ width: 16, height: 16, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}
      >
        {online ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 8,
                height: 8,
                borderWidth: 1,
                borderColor: '#00ff88',
              },
              ringStyle,
            ]}
          />
        ) : null}

        <Animated.View
          style={[
            {
              width: 8,
              height: 8,
              backgroundColor: online ? '#00ff88' : '#6b7280',
            },
            dotStyle,
          ]}
        />
      </View>
      <Text
        className="font-pixel text-xs tracking-pixel"
        style={{ color: online ? '#00ff88' : '#6b7280' }}
      >
        {label}
      </Text>
    </View>
  );
}
