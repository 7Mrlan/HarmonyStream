/*
 * 组件：VoiceToggle
 * 作用：TTS voice 状态徽章，替换 DJBubble 顶栏旧状态标签。
 * 动画：关闭态保留红色方块闪烁；开启态切换为参考信号柱跳动。
 */

import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface VoiceToggleProps {
  /* 当前 voice 是否启用；true 时显示 VOICE ON 并播放绿色信号动画。 */
  active: boolean;
  /* 点击切换 voice 状态。 */
  onPress?: () => void;
  /* 可选固定宽度；默认固定，避免 VOICE ON / OFF 切换时推动 DJ 顶栏布局。 */
  width?: number;
  /* 禁用状态，仅透传给 Pressable 与无障碍状态。 */
  disabled?: boolean;
}

const PANEL_BG = '#000000';
const SIGNAL_GREEN = '#00ff88';
const SIGNAL_RED = '#ff3355';
const BADGE_WIDTH = 112;
const BADGE_HEIGHT = 24;
const SIGNAL_SLOT_WIDTH = 28;
const LABEL_WIDTH = 64;
const OFF_DOT_SIZE = 6;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const BAR_BASE_HEIGHTS = [10, 16, 8];

/*
 * Hook：关闭态红色方块闪烁。
 * 这部分继承原红色徽章的视觉节奏，文案显示 VOICE OFF。
 */
function useOffBlink(active: boolean) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);

    if (!active) {
      pulse.value = 1;
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

  return useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 0.5, 1], [1, 0.28, 1]) : 1,
  }));
}

/*
 * Hook：启用态信号柱循环。
 * 只在 VOICE ON 时启动，关闭态由红色方块自己的节奏接管。
 */
function useVoiceWave(active: boolean) {
  const wave = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(wave);

    if (!active) {
      wave.value = 0;
      return undefined;
    }

    wave.value = 0;
    wave.value = withRepeat(
      withTiming(1, {
        duration: 640,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(wave);
    };
  }, [active, wave]);

  return wave;
}

/*
 * 子组件：VOICE ON 单根信号柱。
 * 每根柱子只消费 shared value，不通过 React state 做逐帧高度更新。
 */
function VoiceSignalBar({
  index,
  wave,
}: {
  index: number;
  wave: SharedValue<number>;
}) {
  const baseHeight = BAR_BASE_HEIGHTS[index] ?? 10;
  const maxHeight = index === 1 ? 18 : 14;

  const barStyle = useAnimatedStyle(() => {
    const shifted = (wave.value + index * 0.18) % 1;
    return {
      height: interpolate(shifted, [0, 0.5, 1], [baseHeight * 0.45, maxHeight, baseHeight * 0.45]),
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          backgroundColor: SIGNAL_GREEN,
        },
        barStyle,
      ]}
    />
  );
}

/*
 * 子组件：VOICE ON 左侧信号样式。
 * 结构保留参考组件的短像素块 + 三根跳动柱，但尺寸收敛到 DJ 顶栏徽章内。
 */
function VoiceOnSignal({ wave }: { wave: SharedValue<number> }) {
  return (
    <View
      style={{
        width: SIGNAL_SLOT_WIDTH,
        height: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: BAR_GAP,
      }}
    >
      <View style={{ width: 4, height: 3, backgroundColor: SIGNAL_GREEN, marginRight: 1 }} />
      {BAR_BASE_HEIGHTS.map((_, index) => (
        <VoiceSignalBar key={`voice-badge-bar-${index}`} index={index} wave={wave} />
      ))}
    </View>
  );
}

export function VoiceToggle({ active, onPress, width = BADGE_WIDTH, disabled = false }: VoiceToggleProps) {
  const wave = useVoiceWave(active && !disabled);
  const offDotStyle = useOffBlink(!active && !disabled);
  const accentColor = active ? SIGNAL_GREEN : SIGNAL_RED;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={active ? 'VOICE ON' : 'VOICE OFF'}
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width,
        height: BADGE_HEIGHT,
        backgroundColor: PANEL_BG,
        borderWidth: 1,
        borderColor: accentColor,
        opacity: disabled ? 0.45 : 1,
        paddingHorizontal: 6,
        paddingVertical: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {active ? (
        <VoiceOnSignal wave={wave} />
      ) : (
        <View style={{ width: SIGNAL_SLOT_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[{ width: OFF_DOT_SIZE, height: OFF_DOT_SIZE, backgroundColor: SIGNAL_RED }, offDotStyle]}
          />
        </View>
      )}

      <Text
        className="font-pixel text-xs tracking-pixel"
        style={{
          width: LABEL_WIDTH,
          color: accentColor,
          lineHeight: 14,
          flexShrink: 0,
        }}
      >
        {active ? 'VOICE ON' : 'VOICE OFF'}
      </Text>
    </Pressable>
  );
}
