/*
 * 组件：OnAirIndicator
 * 作用：电台直播状态指示，呼吸圆点 + 扩散环 + ON AIR 文字
 * 实现：圆点 setInterval 1Hz 呼吸；扩散环用 Animated.timing 缩放 + 淡出
 *      软动效全部 ease-out / 1s 周期，避免抢戏
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text } from 'react-native';

export interface OnAirIndicatorProps {
  /* 是否在线，false 时圆点变 muted、不再呼吸 */
  online?: boolean;
  /* 自定义文字，默认 "ON AIR" */
  label?: string;
}

/* Hook：每 500ms 翻转一次 visible，形成 1s 周期呼吸 */
function useBreathe(online: boolean) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!online) {
      setVisible(false);
      return;
    }
    const id = setInterval(() => setVisible((v) => !v), 500);
    return () => clearInterval(id);
  }, [online]);
  return visible;
}

/*
 * Hook：扩散环动画
 *   每 1.5s 触发一次：scale 0.6 → 2.4，opacity 0.6 → 0
 */
function usePulseRing(active: boolean) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(0.6);
      opacity.setValue(0);
      return;
    }
    /* 循环动画：每次都先重置，再扩散，再重置 */
    const loop = () => {
      scale.setValue(0.6);
      opacity.setValue(0.6);
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.4,
          duration: 1500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) loop();
      });
    };
    loop();
    return () => {
      scale.stopAnimation();
      opacity.stopAnimation();
    };
  }, [active, scale, opacity]);

  return { scale, opacity };
}

export function OnAirIndicator({ online = true, label = 'ON AIR' }: OnAirIndicatorProps) {
  const visible = useBreathe(online);
  const { scale, opacity } = usePulseRing(online);

  return (
    <View className="flex-row items-center">
      {/* 容器固定大小，内部 absolute 叠放呼吸点 + 扩散环 */}
      <View
        style={{ width: 16, height: 16, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* 扩散环：1px 边框、空心方块向外扩 */}
        {online ? (
          <Animated.View
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              borderWidth: 1,
              borderColor: '#00ff88',
              transform: [{ scale }],
              opacity,
            }}
          />
        ) : null}
        {/* 呼吸圆点（实心） */}
        <View
          style={{
            width: 8,
            height: 8,
            backgroundColor: online ? '#00ff88' : '#6b7280',
            opacity: visible ? 1 : 0.3,
          }}
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
