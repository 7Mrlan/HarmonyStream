/*
 * 组件：ChatInput
 * 作用：底部"对 DJ 说话"输入区，左 TextInput + 右麦克风 / 发送按钮
 * 设计：硬边框 1px，无圆角；占位文字 muted 灰；按钮文字 PixelOperator
 *      未输入时占位前缀显示 ">" 终端光标，1Hz 闪烁
 *      聚焦时显示绿色光点沿输入框边缘顺时针轮转，后方带像素拖尾
 *      非聚焦时只保留普通暗色边框，避免常态过度发光
 */

import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const TEXT_INPUT_BASE_STYLE: TextStyle = { padding: 0 };
/*
 * Web 端需要去掉浏览器默认 outline；RN TextStyle 类型不包含 none，
 * 但 react-native-web 运行时支持该值，因此只在 web 分支做局部类型桥接。
 */
const TEXT_INPUT_WEB_RESET_STYLE =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : undefined;

export interface ChatInputProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  onMicPress?: () => void;
  value?: string;
  onChangeText?: (text: string) => void;
}

/* Hook：终端式光标 1Hz 闪烁 */
function useCursor(active: boolean) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);

    if (!active) {
      pulse.value = 0;
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

  /* 光标只改 opacity，避免用 React state 做 1Hz 视觉闪烁。 */
  return useAnimatedStyle(() => ({
    opacity: active && pulse.value < 0.5 ? 1 : 0,
  }));
}

/*
 * Hook：active 输入框像素光边
 *   - 使用 Reanimated 驱动，保证 Web / 移动端尽量 60fps 丝滑
 *   - phase 范围 0-1，表示光块在边框周长上的位置
 */
function useBorderOrbit(active: boolean) {
  const phase = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(phase);

    if (!active) {
      phase.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, {
        duration: 3200,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(phase);
    };
  }, [active, phase]);

  return phase;
}

/* 工具：把 0-1 的相位映射到输入框边框上的坐标。 */
function positionAtBorder(phase: number, width: number, height: number) {
  'worklet';
  const normalized = ((phase % 1) + 1) % 1;

  if (normalized < 0.36) {
    const local = normalized / 0.36;
    return { x: local * width, y: -2 };
  }
  if (normalized < 0.5) {
    const local = (normalized - 0.36) / 0.14;
    return { x: width + 2, y: local * height };
  }
  if (normalized < 0.86) {
    const local = (normalized - 0.5) / 0.36;
    return { x: width - local * width, y: height + 2 };
  }

  const local = (normalized - 0.86) / 0.14;
  return { x: -2, y: height - local * height };
}

function OrbitParticle({
  index,
  phase,
  boxWidth,
  boxHeight,
  halo,
}: {
  index: number;
  phase: SharedValue<number>;
  boxWidth: SharedValue<number>;
  boxHeight: SharedValue<number>;
  halo?: boolean;
}) {
  const isHead = index === 0;
  const size = halo
    ? isHead ? 12 : Math.max(6, 10 - index * 0.26)
    : isHead ? 5 : Math.max(2, 4.4 - index * 0.18);
  const color = halo ? '#00ff88' : isHead ? '#c8ffde' : index < 5 ? '#64eaa7' : index < 11 ? '#1ecf82' : '#00a864';

  const animatedStyle = useAnimatedStyle(() => {
    const trailGap = 0.009;
    const point = positionAtBorder(phase.value - index * trailGap, boxWidth.value, boxHeight.value);
    const opacity = halo
      ? isHead ? 0.1 : Math.max(0, 0.07 * Math.exp(-index * 0.24))
      : isHead ? 0.72 : Math.max(0.04, 0.46 * Math.exp(-index * 0.2));

    return {
      opacity,
      transform: [{ translateX: point.x - size / 2 }, { translateY: point.y - size / 2 }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          backgroundColor: color,
          shadowColor: '#00ff88',
          shadowOpacity: halo ? 0.32 : isHead ? 0.42 : 0.18,
          shadowRadius: halo ? isHead ? 10 : 6 : isHead ? 8 : 4,
        },
        animatedStyle,
      ]}
    />
  );
}

/*
 * 子组件：绿色光点沿边框轮转
 * 说明：
 *   - 边框本体始终是暗色，不再整圈变绿
 *   - 光点沿矩形周长连续移动，不做 12 段跳变
 *   - 后方跟随 10 个拖尾粒子，尺寸和透明度逐步衰减，形成梦幻绿光
 */
function OrbitBorder({
  active,
  phase,
  boxWidth,
  boxHeight,
}: {
  active: boolean;
  phase: SharedValue<number>;
  boxWidth: SharedValue<number>;
  boxHeight: SharedValue<number>;
}) {
  if (!active) return null;

  const particles = Array.from({ length: 17 }, (_, i) => i);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {particles.map((i) => (
        <OrbitParticle key={`halo-${i}`} index={i} phase={phase} boxWidth={boxWidth} boxHeight={boxHeight} halo />
      ))}
      {particles.map((i) => (
        <OrbitParticle key={`dot-${i}`} index={i} phase={phase} boxWidth={boxWidth} boxHeight={boxHeight} />
      ))}
    </View>
  );
}

export function ChatInput({
  placeholder = 'Say something to the DJ',
  onSend,
  onMicPress,
  value,
  onChangeText,
}: ChatInputProps) {
  /* 内部维护一份 state，便于在受控/非受控两种模式下都工作 */
  const [internal, setInternal] = useState('');
  const text = value !== undefined ? value : internal;
  const [focused, setFocused] = useState(false);
  const inputBoxWidth = useSharedValue(0);
  const inputBoxHeight = useSharedValue(0);

  /* 文本变更同时触发外部回调与内部状态 */
  function handleChange(t: string) {
    setInternal(t);
    onChangeText?.(t);
  }

  /* 发送时校验空字符串，发送后清空输入 */
  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setInternal('');
    onChangeText?.('');
  }

  /* 终端光标：聚焦或有内容时不显示（让真实光标接管） */
  const showIdleCursor = !focused && !text;
  const cursorStyle = useCursor(showIdleCursor);
  /* 聚焦时才启用绿色像素光边 */
  const borderPhase = useBorderOrbit(focused);

  /* 布局尺寸只写入 shared value，避免边框光效逐帧触发 React state。 */
  function handleInputBoxLayout(event: LayoutChangeEvent) {
    inputBoxWidth.value = event.nativeEvent.layout.width;
    inputBoxHeight.value = event.nativeEvent.layout.height;
  }

  return (
    <View className="flex-row items-center px-4 py-2 border-t border-line" style={{ gap: 8 }}>
      {/* 输入框：非聚焦普通暗边；聚焦时只有绿色光点和拖尾沿边框移动 */}
      <View
        className="flex-1 border border-line bg-panel px-3 py-2 flex-row items-center"
        onLayout={handleInputBoxLayout}
        style={{ position: 'relative', overflow: 'visible' }}
      >
        <OrbitBorder active={focused} phase={borderPhase} boxWidth={inputBoxWidth} boxHeight={inputBoxHeight} />
        {/* 左侧 ">" 提示符，与终端光标呼应 */}
        <Text className={`font-pixel text-base tracking-pixel mr-2 ${focused ? 'text-accent' : 'text-muted'}`}>{'>'}</Text>
        <TextInput
          value={text}
          onChangeText={handleChange}
          onSubmitEditing={handleSend}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          className="font-mono text-text text-base flex-1"
          style={[TEXT_INPUT_BASE_STYLE, TEXT_INPUT_WEB_RESET_STYLE]}
          selectionColor="#00ff88"
          returnKeyType="send"
        />
        {/* 闪烁光标条，仅未聚焦无内容时显示 */}
        {showIdleCursor ? (
          <Animated.View
            style={[
              { width: 8, height: 16, backgroundColor: '#6b7280', marginLeft: 4 },
              cursorStyle,
            ]}
          />
        ) : null}
      </View>

      {/* 麦克风按钮 */}
      <Pressable
        onPress={onMicPress}
        className="border border-line bg-panel px-3 py-2 active:bg-line"
      >
        <Text className="font-pixel text-muted text-xs tracking-pixel">MIC</Text>
      </Pressable>

      {/* 发送按钮：有内容时点亮 */}
      <Pressable
        onPress={handleSend}
        disabled={!text.trim()}
        className={`border px-3 py-2 active:bg-line ${text.trim() ? 'border-text bg-text' : 'border-line bg-panel'}`}
      >
        <Text
          className={`font-pixel text-xs tracking-pixel ${text.trim() ? 'text-bg' : 'text-muted'}`}
        >
          SEND
        </Text>
      </Pressable>
    </View>
  );
}
