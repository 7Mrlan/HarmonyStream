/*
 * 组件：MusicSpectrum
 * ------------------
 * 作用：
 *   - Native 端：使用 Skia 承接 48 根频谱柱与 LED cap 的高频绘制
 *   - Web 端：保留无 CanvasKit 依赖的 Animated + SVG 降级实现
 * 说明：
 *   - 两条路径保持同一套 48 柱 / noise / wave / 中心衰减 / cap 下落参数
 *   - Native 优先解决长期运行卡顿，Web 保持当前演示链路可用
 */

import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  Easing as ReanimatedEasing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface MusicSpectrumProps {
  /* 是否在播放：对应用户代码里的 isPlaying */
  active: boolean;
  /* 是否已经播放结束，用于让动画回到刷新后的 idle 状态 */
  ended?: boolean;
  /* 音频可视化容器高度 */
  height?: number;
  /* 容器宽度，未传时跟随父容器 */
  width?: number;
  /* 主色，默认沿用当前霓虹绿 */
  color?: string;
  /* 保留兼容旧 props */
  dimColor?: string;
  /* 保留兼容旧 props */
  gridColor?: string;
}

type SkiaModule = typeof import('@shopify/react-native-skia');

const BAR_COUNT = 48;
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 200;
const BAR_GAP = 6;
const CAP_HEIGHT = 4;
const CAP_TOP_OFFSET = 6;
const CAP_FALL_SPEED = 0.8;
const BAR_ATTACK_SPEED = 0.68;
const BAR_DECAY_SPEED = 0.15;
const BAR_IDLE_DECAY_SPEED = 0.45;
const BAR_MIN_RISE_IMPULSE = 4.5;
const NATIVE_CANVAS_IDLE_UNMOUNT_DELAY = 1200;

let cachedSkiaModule: SkiaModule | null | undefined;

/* 工具：Native 端按需加载 Skia，避免 Web 演示链路硬依赖 CanvasKit。 */
function getSkiaModule(): SkiaModule | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (cachedSkiaModule !== undefined) {
    return cachedSkiaModule;
  }
  cachedSkiaModule = require('@shopify/react-native-skia') as SkiaModule;
  return cachedSkiaModule;
}

/* 工具：worklet 内使用的 fract，供稳定噪声函数复用。 */
function fract(value: number): number {
  'worklet';
  return value - Math.floor(value);
}

/* 工具：稳定伪噪声，避免每帧走 JS 随机数。 */
function pseudoNoise(value: number): number {
  'worklet';
  return fract(Math.sin(value * 12.9898) * 43758.5453);
}

/* 工具：频谱柱上升要更果断，下降保留阻尼，避免变成生硬闪烁。 */
function resolveBarLevel(current: number, target: number, active: boolean): number {
  'worklet';
  const diff = target - current;

  if (diff <= 0) {
    return current + diff * (active ? BAR_DECAY_SPEED : BAR_IDLE_DECAY_SPEED);
  }

  const easedRise = diff * BAR_ATTACK_SPEED;
  const impulseRise = Math.min(diff, BAR_MIN_RISE_IMPULSE);
  return current + Math.max(easedRise, impulseRise);
}

/* 子组件：单根 Skia 频谱柱，内部自持高度与 cap 状态，避免 React 重渲染。 */
function NativeSpectrumBar({
  skia,
  index,
  barWidth,
  height,
  color,
  clock,
  activeLevel,
}: {
  skia: SkiaModule;
  index: number;
  barWidth: number;
  height: number;
  color: string;
  clock: SharedValue<number>;
  activeLevel: SharedValue<number>;
}) {
  const { LinearGradient: SkiaLinearGradient, RoundedRect: SkiaRoundedRect, vec } = skia;
  const entrance = useSharedValue(0);
  const barLevel = useSharedValue(0);
  const capLevel = useSharedValue(0);
  const lastFrame = useSharedValue(0);

  /* 入场节奏仍按原方案 stagger，避免生硬闪现。 */
  useEffect(() => {
    entrance.value = withDelay(
      index * 20,
      withTiming(1, {
        duration: 1000,
        easing: ReanimatedEasing.out(ReanimatedEasing.quad),
      }),
    );
  }, [entrance, index]);

  const barHeight = useDerivedValue(() => {
    const now = clock.value;
    const delta = lastFrame.value === 0 ? 16 : Math.max(16, Math.min(64, now - lastFrame.value));
    lastFrame.value = now;

    const wave = Math.sin(now * 0.005 + index * 0.2) * 20;
    const noise = pseudoNoise(now * 0.002 + index * 3.17);
    const centerDistance = Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 2);
    const activeTarget = 20 + noise * 70 + wave;
    const idleTarget = 5;

    let target = idleTarget + (activeTarget - idleTarget) * activeLevel.value;
    target *= 1 - centerDistance * 0.6;

    barLevel.value = resolveBarLevel(barLevel.value, target, activeLevel.value > 0.05);

    if (barLevel.value > capLevel.value) {
      capLevel.value = barLevel.value;
    } else {
      capLevel.value = Math.max(0, capLevel.value - CAP_FALL_SPEED * (delta / 16));
    }

    return Math.max(0, (barLevel.value / 100) * height * entrance.value);
  });

  const capHeightPx = useDerivedValue(() => Math.max(0, (capLevel.value / 100) * height * entrance.value));
  const barY = useDerivedValue(() => height - barHeight.value);
  const capY = useDerivedValue(() => height - capHeightPx.value - CAP_HEIGHT - CAP_TOP_OFFSET);
  const capOpacity = useDerivedValue(() => (0.3 + activeLevel.value * 0.7) * entrance.value);
  const x = index * (barWidth + BAR_GAP);

  return (
    <>
      <SkiaRoundedRect x={x} y={barY} width={barWidth} height={barHeight} r={2}>
        <SkiaLinearGradient
          start={vec(x, height)}
          end={vec(x, 0)}
          colors={['#001a0f', '#006644', color]}
        />
      </SkiaRoundedRect>
      <SkiaRoundedRect
        x={x}
        y={capY}
        width={barWidth}
        height={CAP_HEIGHT}
        r={1}
        color="#ffffff"
        opacity={capOpacity}
      />
    </>
  );
}

/* 子组件：Native 端真正挂载 Skia Canvas，父组件 idle 后会卸载它来停止时钟。 */
function NativeSpectrumCanvas({
  skia,
  containerWidth,
  height,
  color,
  activeLevel,
}: {
  skia: SkiaModule;
  containerWidth: number;
  height: number;
  color: string;
  activeLevel: SharedValue<number>;
}) {
  const { Canvas, useClock } = skia;
  const clock = useClock();
  const barWidth = Math.max(1, (containerWidth - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT);

  return (
    <Canvas style={{ width: '100%', height }}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <NativeSpectrumBar
          key={`native-spectrum-bar-${index}`}
          skia={skia}
          index={index}
          barWidth={barWidth}
          height={height}
          color={color}
          clock={clock}
          activeLevel={activeLevel}
        />
      ))}
    </Canvas>
  );
}

function NativeMusicSpectrum({
  active,
  height = DEFAULT_HEIGHT,
  width,
  color = '#00ff9d',
}: MusicSpectrumProps) {
  const skia = getSkiaModule();
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  const [renderCanvas, setRenderCanvas] = useState(active);
  const activeLevel = useSharedValue(active ? 1 : 0);

  /* 播放 / 暂停切换只改 activeLevel，Skia 节点在 UI 线程继续插值。 */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      setRenderCanvas(true);
      activeLevel.value = withTiming(1, {
        duration: 120,
        easing: ReanimatedEasing.out(ReanimatedEasing.quad),
      });
      return undefined;
    }

    activeLevel.value = withTiming(0, {
      duration: 140,
      easing: ReanimatedEasing.out(ReanimatedEasing.quad),
    });
    /*
     * 暂停后视觉先快速落下，但不要立刻卸载 Skia Canvas。
     * 这样可以吸收用户快速暂停/播放的连续点击，避免反复重建 48 根 Skia 节点造成卡顿。
     */
    timer = setTimeout(() => setRenderCanvas(false), NATIVE_CANVAS_IDLE_UNMOUNT_DELAY);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active, activeLevel]);

  if (!skia) {
    return null;
  }

  return (
    <View
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (!width && measuredWidth && Math.abs(measuredWidth - containerWidth) > 0.5) {
          setContainerWidth(measuredWidth);
        }
      }}
      style={{
        width: width ?? '100%',
        height,
      }}
    >
      {renderCanvas ? (
        <NativeSpectrumCanvas
          skia={skia}
          containerWidth={containerWidth}
          height={height}
          color={color}
          activeLevel={activeLevel}
        />
      ) : null}
    </View>
  );
}

/* 子组件：Web 端降级频谱，沿用现有 Animated + SVG 路径，避免 CanvasKit 依赖。 */
function WebMusicSpectrum({
  active,
  height = DEFAULT_HEIGHT,
  width,
  color = '#00ff9d',
}: MusicSpectrumProps) {
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  const frequenciesRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const capPositionsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entranceStartRef = useRef<number | null>(null);

  /* Web 降级使用单 canvas 绘制，避免 48 个 Animated/SVG 节点长期占用 JS。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    const maybeContext = canvas?.getContext('2d');
    if (!canvas || !maybeContext || containerWidth <= 0 || height <= 0) {
      return undefined;
    }

    const context = maybeContext;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(containerWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (active) {
      frequenciesRef.current.fill(0);
      capPositionsRef.current.fill(0);
      entranceStartRef.current = null;
    }

    function updateVisualizer() {
      const frequencies = frequenciesRef.current;
      const capPositions = capPositionsRef.current;
      const now = Date.now();
      const start = entranceStartRef.current ?? now;
      entranceStartRef.current = start;
      const barWidth = Math.max(1, (containerWidth - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT);
      let maxMovingValue = 0;

      context.clearRect(0, 0, containerWidth, height);

      frequencies.forEach((frequency, index) => {
        let target: number;

        if (active) {
          const noise = Math.random();
          const wave = Math.sin(now * 0.005 + index * 0.2) * 20;
          target = 20 + noise * 70 + wave;
          const centerDistance = Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 2);
          target *= 1 - centerDistance * 0.6;
        } else {
          target = 0;
        }

        frequencies[index] = resolveBarLevel(frequency, target, active);

        const nextFrequency = frequencies[index] ?? 0;
        if (nextFrequency > (capPositions[index] ?? 0)) {
          capPositions[index] = nextFrequency;
        } else {
          capPositions[index] = (capPositions[index] ?? 0) - CAP_FALL_SPEED * (active ? 1 : 4);
        }
        if ((capPositions[index] ?? 0) < 0) {
          capPositions[index] = 0;
        }

        const entranceProgress = Math.max(0, Math.min(1, (now - start - index * 20) / 1000));
        const easedEntrance = 1 - Math.pow(1 - entranceProgress, 2);
        const barHeight = Math.max(0, (nextFrequency / 100) * height * easedEntrance);
        const capBottom = Math.max(0, ((capPositions[index] ?? 0) / 100) * height * easedEntrance);
        const x = index * (barWidth + BAR_GAP);
        const y = height - barHeight;

        const gradient = context.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#001a0f');
        gradient.addColorStop(0.4, '#006644');
        gradient.addColorStop(1, color);
        context.fillStyle = gradient;
        context.fillRect(x, y, barWidth, barHeight);

        context.globalAlpha = active ? 1 : 0.3;
        context.fillStyle = '#ffffff';
        context.fillRect(x, height - capBottom - CAP_HEIGHT - CAP_TOP_OFFSET, barWidth, CAP_HEIGHT);
        context.globalAlpha = 1;

        maxMovingValue = Math.max(maxMovingValue, nextFrequency, capPositions[index] ?? 0);
      });

      if (active || maxMovingValue > 1) {
        rafRef.current = requestAnimationFrame(updateVisualizer);
      } else {
        context.clearRect(0, 0, containerWidth, height);
        frequenciesRef.current.fill(0);
        capPositionsRef.current.fill(0);
        entranceStartRef.current = null;
        rafRef.current = null;
      }
    }

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(updateVisualizer);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, color, containerWidth, height]);

  return (
    <View
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (!width && measuredWidth && Math.abs(measuredWidth - containerWidth) > 0.5) {
          setContainerWidth(measuredWidth);
        }
      }}
      style={{
        width: width ?? '100%',
        height,
        gap: BAR_GAP,
        zIndex: 5,
      }}
    >
      {createElement('canvas', {
        ref: canvasRef,
        style: {
          display: 'block',
          width: '100%',
          height,
        },
      })}
    </View>
  );
}

export function MusicSpectrum(props: MusicSpectrumProps) {
  if (Platform.OS === 'web') {
    return <WebMusicSpectrum {...props} />;
  }

  return <NativeMusicSpectrum {...props} />;
}
