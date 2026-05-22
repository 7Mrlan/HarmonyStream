/*
 * 组件：ChatInput
 * 作用：底部"对 DJ 说话"输入区，左 TextInput + 右麦克风 / 发送按钮
 * 设计：硬边框 1px，无圆角；占位文字 muted 灰；按钮文字 PixelOperator
 *      未输入时占位前缀显示 ">" 终端光标，1Hz 闪烁
 *      聚焦时显示绿色光点沿输入框边缘顺时针轮转，后方带像素拖尾
 *      非聚焦时只保留普通暗色边框，避免常态过度发光
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';

export interface ChatInputProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  onMicPress?: () => void;
  value?: string;
  onChangeText?: (text: string) => void;
}

/* Hook：终端式光标 1Hz 闪烁 */
function useCursor(active: boolean) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const id = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(id);
  }, [active]);
  return on;
}

/*
 * Hook：active 输入框像素光边
 *   - 使用 requestAnimationFrame 驱动，保证 Web / 移动端尽量 60fps 丝滑
 *   - phase 范围 0-1，表示光块在边框周长上的位置
 */
function useBorderOrbit(active: boolean) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }

    let raf: number | null = null;
    let start = 0;
    const duration = 3200;

    const tick = (now: number) => {
      if (!start) start = now;
      const next = ((now - start) % duration) / duration;
      setPhase(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [active]);

  return phase;
}

/*
 * 子组件：绿色光点沿边框轮转
 * 说明：
 *   - 边框本体始终是暗色，不再整圈变绿
 *   - 光点沿矩形周长连续移动，不做 12 段跳变
 *   - 后方跟随 10 个拖尾粒子，尺寸和透明度逐步衰减，形成梦幻绿光
 */
function OrbitBorder({ active, phase }: { active: boolean; phase: number }) {
  if (!active) return null;

  const particles = Array.from({ length: 17 }, (_, i) => i);

  function positionAt(p: number) {
    const normalized = ((p % 1) + 1) % 1;

    if (normalized < 0.36) {
      const local = normalized / 0.36;
      return { left: `${local * 100}%` as const, top: -2 };
    }
    if (normalized < 0.5) {
      const local = (normalized - 0.36) / 0.14;
      return { right: -2, top: `${local * 100}%` as const };
    }
    if (normalized < 0.86) {
      const local = (normalized - 0.5) / 0.36;
      return { right: `${local * 100}%` as const, bottom: -2 };
    }

    const local = (normalized - 0.86) / 0.14;
    return { left: -2, bottom: `${local * 100}%` as const };
  }

  function particleStyle(i: number): ViewStyle {
    const trailGap = 0.009;
    const p = phase - i * trailGap;
    const pos = positionAt(p);
    const isHead = i === 0;
    const size = isHead ? 5 : Math.max(2, 4.4 - i * 0.18);
    const opacity = isHead ? 0.72 : Math.max(0.04, 0.46 * Math.exp(-i * 0.2));
    const color = isHead ? '#c8ffde' : i < 5 ? '#64eaa7' : i < 11 ? '#1ecf82' : '#00a864';

    return {
      ...pos,
      position: 'absolute' as const,
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      backgroundColor: color,
      opacity,
      shadowColor: '#00ff88',
      shadowOpacity: isHead ? 0.42 : 0.18,
      shadowRadius: isHead ? 8 : 4,
    };
  }

  function haloStyle(i: number): ViewStyle {
    const trailGap = 0.009;
    const p = phase - i * trailGap;
    const pos = positionAt(p);
    const isHead = i === 0;
    const size = isHead ? 12 : Math.max(6, 10 - i * 0.26);
    const opacity = isHead ? 0.1 : Math.max(0, 0.07 * Math.exp(-i * 0.24));

    return {
      ...pos,
      position: 'absolute' as const,
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      backgroundColor: '#00ff88',
      opacity,
      shadowColor: '#00ff88',
      shadowOpacity: 0.32,
      shadowRadius: isHead ? 10 : 6,
    };
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {particles.map((i) => (
        <View key={`halo-${i}`} style={haloStyle(i)} />
      ))}
      {particles.map((i) => (
        <View key={`dot-${i}`} style={particleStyle(i)} />
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
  const cursorOn = useCursor(!focused && !text);
  /* 聚焦时才启用绿色像素光边 */
  const borderPhase = useBorderOrbit(focused);

  return (
    <View className="flex-row items-center px-4 py-2 border-t border-line" style={{ gap: 8 }}>
      {/* 输入框：非聚焦普通暗边；聚焦时只有绿色光点和拖尾沿边框移动 */}
      <View
        className="flex-1 border border-line bg-panel px-3 py-2 flex-row items-center"
        style={{ position: 'relative', overflow: 'visible' }}
      >
        <OrbitBorder active={focused} phase={borderPhase} />
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
          style={{ padding: 0, outlineStyle: 'none' } as TextStyle}
          selectionColor="#00ff88"
          returnKeyType="send"
        />
        {/* 闪烁光标条，仅未聚焦无内容时显示 */}
        {cursorOn ? (
          <View
            style={{ width: 8, height: 16, backgroundColor: '#6b7280', marginLeft: 4 }}
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
