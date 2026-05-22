/*
 * 组件：DJBubble
 * 作用：DJ "Claudio" 的对话气泡，长文本主体，左侧头像 + 顶部时间 + LIVE 标签
 * 设计：硬边框 1px，无圆角胶囊；正文用 VT323 / Cubic11 等宽
 *      LIVE 标签前加 1Hz 闪烁红点，呼应"广播中"语义
 *      可选打字机效果（typing 模式按字符显示，模拟流式输出）
 */

import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface DJBubbleProps {
  /* 主体文本，可多段落 */
  text: string;
  /* DJ 名称，默认 CLAUDIO */
  name?: string;
  /* 时间戳，例如 "21:02" */
  time?: string;
  /* 是否处于"流式播放中"，true 时右上角显示 LIVE 红点 */
  live?: boolean;
  /* 打字机效果：true 时按字符逐个出现，速度由 typingSpeedMs 控制 */
  typing?: boolean;
  /* 每个字符的间隔毫秒 */
  typingSpeedMs?: number;
  /* 头像方块的颜色，默认 panel */
  avatarColor?: string;
  /* REPLAY 按钮回调 */
  onReplay?: () => void;
}

/* Hook：打字机效果，按字符逐个返回 */
function useTypewriter(text: string, typing: boolean, speedMs: number) {
  const [out, setOut] = useState(typing ? '' : text);
  useEffect(() => {
    if (!typing) {
      setOut(text);
      return;
    }
    setOut('');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text, typing, speedMs]);
  return out;
}

/* Hook：LIVE 红点 1Hz 闪烁 */
function useLiveBlink(active: boolean) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);

    if (!active) {
      pulse.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(pulse);
    };
  }, [active, pulse]);

  /* LIVE 红点只是视觉闪烁，交给 Reanimated，避免 setInterval 触发 React state。 */
  return useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 0.5, 1], [1, 0.3, 1]) : 0.3,
  }));
}

export function DJBubble({
  text,
  name = 'CLAUDIO',
  time,
  live = false,
  typing = false,
  typingSpeedMs = 20,
  avatarColor = '#0a0a0a',
  onReplay,
}: DJBubbleProps) {
  const display = useTypewriter(text, typing, typingSpeedMs);
  const liveDotStyle = useLiveBlink(live);

  return (
    <View className="flex-row px-4 py-3" style={{ gap: 12 }}>
      {/* 左侧 32x32 方块头像 */}
      <View
        className="border border-line"
        style={{ width: 32, height: 32, backgroundColor: avatarColor }}
      />

      {/* 右侧主体 */}
      <View className="flex-1">
        {/* 顶部一行：DJ 名 + LIVE 标签 */}
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="font-pixel text-text text-base tracking-pixel">{name}</Text>
          {live ? (
            <View
              className="px-1.5 py-0.5 border flex-row items-center"
              style={{ borderColor: '#ff3355', gap: 4 }}
            >
              {/* 闪烁红点：广播中视觉信号 */}
              <Animated.View
                style={[
                  {
                    width: 6,
                    height: 6,
                    backgroundColor: '#ff3355',
                  },
                  liveDotStyle,
                ]}
              />
              <Text className="font-pixel text-xs tracking-pixel" style={{ color: '#ff3355' }}>
                LIVE
              </Text>
            </View>
          ) : null}
        </View>

        {/* 主文本 */}
        <View className="mt-2 border border-line bg-panel px-3 py-2">
          <Text className="font-mono text-text text-base" style={{ lineHeight: 22 }}>
            {display}
          </Text>
        </View>

        {/* 底部一行：时间 + REPLAY 按钮 */}
        <View className="flex-row items-center mt-1" style={{ gap: 8 }}>
          {time ? (
            <Text className="font-mono text-muted text-xs tracking-pixel">{time}</Text>
          ) : null}
          {onReplay ? (
            <Pressable onPress={onReplay} className="px-2 py-0.5 border border-line active:bg-line">
              <Text className="font-pixel text-muted text-xs tracking-pixel">{'> REPLAY'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
