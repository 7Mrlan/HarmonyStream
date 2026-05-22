/*
 * 组件：MusicSpectrum
 * 作用：主屏实际显示的频谱条，完整替换为用户提供的 visualizer-container / v-bar / v-cap 实现。
 * 说明：按钮与播放功能不在这里改；active 只接入用户代码中的 isPlaying 判断位置。
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export interface MusicSpectrumProps {
  /* 是否在播放：对应用户代码里的 isPlaying */
  active: boolean;
  /* 音频可视化容器高度，默认完全使用用户代码 200px */
  height?: number;
  /* 容器宽度，未传时跟随父容器；用户代码原始宽度为 900px */
  width?: number;
  /* 主色，默认使用用户代码 var(--neon-green) 对应值 */
  color?: string;
  /* 暗色，保留兼容旧 props，实际渐变按用户代码固定 */
  dimColor?: string;
  /* 网格颜色，保留兼容旧 props，用户频谱不再绘制旧网格 */
  gridColor?: string;
}

const BAR_COUNT = 48;
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 200;
const BAR_GAP = 6;
const CAP_HEIGHT = 4;
const CAP_TOP_OFFSET = 6;
const CAP_FALL_SPEED = 0.8;

export function MusicSpectrum({
  active,
  height = DEFAULT_HEIGHT,
  width,
  color = '#00ff9d',
}: MusicSpectrumProps) {
  /* 容器实际宽度：默认跟随当前系统父容器，但内部结构保持用户 visualizer-container */
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  /* 用户代码中的 frequencies 数组，用 ref 保持 RAF 内可变状态 */
  const frequenciesRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  /* 用户代码中的 capPositions 数组，用 ref 保持 RAF 内可变状态 */
  const capPositionsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  /* requestAnimationFrame id，卸载时取消循环 */
  const rafRef = useRef<number | null>(null);
  /* 每根柱子的高度和 cap 位置用 Animated.Value 更新，避免每帧 React 重渲染。 */
  const barHeightsRef = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0)));
  const capBottomsRef = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0)));
  /* 入场动画：对应用户代码 gsap.from(".v-bar-wrapper", { scaleY: 0, opacity: 0, stagger: 0.02 }) */
  const entranceAnimationsRef = useRef(
    Array.from({ length: BAR_COUNT }, () => ({
      scaleY: new Animated.Value(0),
      opacity: new Animated.Value(0),
    })),
  );
  /* React Native 渲染帧：由 frequencies / capPositions 映射而来 */
  useEffect(() => {
    const animations = entranceAnimationsRef.current.map((item, i) => {
      item.scaleY.setValue(0);
      item.opacity.setValue(0);
      return Animated.parallel([
        Animated.timing(item.scaleY, {
          toValue: 1,
          duration: 1000,
          delay: i * 20,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(item.opacity, {
          toValue: 1,
          duration: 1000,
          delay: i * 20,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    });
    Animated.parallel(animations).start();
  }, []);

  useEffect(() => {
    function updateVisualizer() {
      const frequencies = frequenciesRef.current;
      const capPositions = capPositionsRef.current;

      frequencies.forEach((frequency, i) => {
        let target: number;

        if (active) {
          const noise = Math.random();
          const wave = Math.sin(Date.now() * 0.005 + i * 0.2) * 20;
          target = 20 + noise * 70 + wave;
          const distFromCenter = Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
          target *= 1 - distFromCenter * 0.6;
        } else {
          target = 5;
        }

        const diff = target - frequency;
        if (diff > 0) {
          frequencies[i] = frequency + diff * 0.3;
        } else {
          frequencies[i] = frequency + diff * 0.15;
        }

        const nextFrequency = frequencies[i] ?? 0;
        if (nextFrequency > (capPositions[i] ?? 0)) {
          capPositions[i] = nextFrequency;
        } else {
          capPositions[i] = (capPositions[i] ?? 0) - CAP_FALL_SPEED;
        }
        if ((capPositions[i] ?? 0) < 0) capPositions[i] = 0;

        barHeightsRef.current[i]?.setValue(Math.max(0, (nextFrequency / 100) * height));
        capBottomsRef.current[i]?.setValue(Math.max(0, ((capPositions[i] ?? 0) / 100) * height));
      });

      rafRef.current = requestAnimationFrame(updateVisualizer);
    }

    rafRef.current = requestAnimationFrame(updateVisualizer);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, height]);

  const barWidth = Math.max(1, (containerWidth - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT);

  return (
    <View
      onLayout={(e) => {
        const measuredWidth = e.nativeEvent.layout.width;
        if (!width && measuredWidth && Math.abs(measuredWidth - containerWidth) > 0.5) {
          setContainerWidth(measuredWidth);
        }
      }}
      style={{
        width: width ?? '100%',
        height,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: BAR_GAP,
        zIndex: 5,
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const barHeight = barHeightsRef.current[i] ?? 0;
        const capBottom = capBottomsRef.current[i] ?? 0;
        const gradientId = `music-spectrum-v-bar-${i}`;
        const entrance = entranceAnimationsRef.current[i];

        return (
          <Animated.View
            key={i}
            style={{
              width: barWidth,
              height: '100%',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              position: 'relative',
              opacity: entrance?.opacity ?? 1,
              transform: [{ scaleY: entrance?.scaleY ?? 1 }],
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                bottom: capBottom,
                left: 0,
                width: '100%',
                height: CAP_HEIGHT,
                backgroundColor: '#ffffff',
                borderRadius: 1,
                opacity: active ? 1 : 0.3,
                zIndex: 6,
                shadowColor: '#ffffff',
                shadowOpacity: active ? 1 : 0.4,
                shadowRadius: active ? 12 : 4,
                transform: [{ translateY: -CAP_TOP_OFFSET }],
              }}
            />
            <Animated.View
              style={{
                width: barWidth,
                height: barHeight,
                overflow: 'hidden',
                shadowColor: color,
                shadowOpacity: 0.2,
                shadowRadius: 15,
              }}
            >
              <Svg
                width={barWidth}
                height="100%"
                viewBox={`0 0 ${barWidth} ${height}`}
                preserveAspectRatio="none"
              >
                <Defs>
                  <LinearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                    <Stop offset="0" stopColor="#001a0f" />
                    <Stop offset="0.4" stopColor="#006644" />
                    <Stop offset="1" stopColor={color} />
                  </LinearGradient>
                </Defs>
                <Rect width={barWidth} height={height} rx={2} fill={`url(#${gradientId})`} />
              </Svg>
            </Animated.View>
          </Animated.View>
        );
      })}
    </View>
  );
}
