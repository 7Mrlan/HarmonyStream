/*
 * 组件：MusicSpectrum
 * ------------------
 * 作用：
 *   - Native 端：使用 Skia 承接 48 根频谱柱与 LED cap 的高频绘制。
 *   - Web 端：使用单 HTML canvas fallback，避免 48 组 React / SVG 节点逐帧更新。
 * 说明：
 *   - 两条路径保持同一套 48 柱 / noise / wave / 中心衰减 / cap 下落参数。
 *   - explame.html 只作为视觉参数来源；当前实现按项目平台框架映射，不照搬 DOM 结构。
 */

import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
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
  /* 展示强度模式；只描述频谱视觉能量，不理解业务 life state。 */
  mode?: MusicSpectrumMode;
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
  /* 频谱柱数量；未传时按容器宽度自适应，移动端会自动减密度。 */
  barCount?: number;
}

type SkiaModule = typeof import('@shopify/react-native-skia');
export type MusicSpectrumMode = 'off' | 'asleep' | 'idle' | 'low' | 'medium' | 'high';

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
const BAR_BOTTOM_COLOR = '#001a0f';
const BAR_MID_COLOR = '#006644';
const BAR_SHADOW_COLOR = 'rgba(0, 255, 157, 0.2)';
const BAR_SHADOW_BLUR = 15;
const CAP_COLOR = '#ffffff';
const CAP_WHITE_SHADOW_BLUR = 12;
const CAP_GREEN_SHADOW_BLUR = 20;
const MODE_LEVELS: Record<MusicSpectrumMode, number> = {
  off: 0,
  asleep: 0.06,
  idle: 0.14,
  low: 0.3,
  medium: 0.62,
  high: 1,
};

let cachedSkiaModule: SkiaModule | null | undefined;

/* 工具：Native 端按需加载 Skia；Web 端保持轻量 canvas fallback，不加载 CanvasKit。 */
function getSkiaModule(): SkiaModule | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (cachedSkiaModule !== undefined) {
    return cachedSkiaModule;
  }
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
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

/* 工具：按实际容器宽度决定频谱柱数量，避免手机端 48 根 Skia 节点过密导致掉帧。 */
function resolveBarCount(containerWidth: number, explicitCount?: number): number {
  if (explicitCount && explicitCount > 0) {
    return Math.max(12, Math.min(48, Math.round(explicitCount)));
  }
  if (containerWidth < 360) return 24;
  if (containerWidth < 520) return 32;
  if (containerWidth < 760) return 40;
  return 48;
}

/*
 * 工具：把外部展示模式压成 0-1 能量值。
 * 未传 mode 时完全沿用旧 active 行为，保证旧调用不受影响。
 */
function resolveSpectrumLevel(active: boolean, mode?: MusicSpectrumMode): number {
  if (mode) return MODE_LEVELS[mode];
  return active ? MODE_LEVELS.high : MODE_LEVELS.off;
}

/* 工具：按 explame.html 的 `.v-bar` 三段线性渐变创建 Web 频谱柱填充。 */
function createWebBarGradient(
  context: CanvasRenderingContext2D,
  height: number,
  color: string,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, BAR_BOTTOM_COLOR);
  gradient.addColorStop(0.4, BAR_MID_COLOR);
  gradient.addColorStop(1, color);
  return gradient;
}

/* 工具：Web 频谱柱只绘制一次，阴影参数直接对应 `.v-bar` 的 box-shadow。 */
function drawWebBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  barHeight: number,
  height: number,
  color: string,
): void {
  context.save();
  context.shadowColor = BAR_SHADOW_COLOR;
  context.shadowBlur = BAR_SHADOW_BLUR;
  context.fillStyle = createWebBarGradient(context, height, color);
  context.fillRect(x, y, width, barHeight);
  context.restore();
}

/* 工具：Web cap 用两次阴影绘制对应 `.v-cap` 的白光与绿光双重 box-shadow。 */
function drawWebCap(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
  opacity: number,
): void {
  context.save();
  context.globalAlpha = opacity;
  context.shadowColor = CAP_COLOR;
  context.shadowBlur = CAP_WHITE_SHADOW_BLUR;
  context.fillStyle = CAP_COLOR;
  context.fillRect(x, y, width, CAP_HEIGHT);
  context.shadowColor = color;
  context.shadowBlur = CAP_GREEN_SHADOW_BLUR;
  context.fillRect(x, y, width, CAP_HEIGHT);
  context.restore();
}

/* 子组件：单根 Skia 频谱柱，内部自持高度与 cap 状态，避免 React 重渲染。 */
function NativeSpectrumBar({
  skia,
  index,
  barWidth,
  barCount,
  height,
  color,
  clock,
  activeLevel,
}: {
  skia: SkiaModule;
  index: number;
  barWidth: number;
  barCount: number;
  height: number;
  color: string;
  clock: SharedValue<number>;
  activeLevel: SharedValue<number>;
}) {
  const { LinearGradient: SkiaLinearGradient, RoundedRect: SkiaRoundedRect, Shadow: SkiaShadow, vec } = skia;
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
    const centerDistance = Math.abs(index - barCount / 2) / (barCount / 2);
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
        <SkiaShadow dx={0} dy={0} blur={BAR_SHADOW_BLUR} color={BAR_SHADOW_COLOR} />
        <SkiaLinearGradient
          start={vec(x, height)}
          end={vec(x, 0)}
          colors={[BAR_BOTTOM_COLOR, BAR_MID_COLOR, color]}
          positions={[0, 0.4, 1]}
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
      >
        <SkiaShadow dx={0} dy={0} blur={CAP_WHITE_SHADOW_BLUR} color={CAP_COLOR} />
        <SkiaShadow dx={0} dy={0} blur={CAP_GREEN_SHADOW_BLUR} color={color} />
      </SkiaRoundedRect>
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
  explicitBarCount,
}: {
  skia: SkiaModule;
  containerWidth: number;
  height: number;
  color: string;
  activeLevel: SharedValue<number>;
  explicitBarCount?: number;
}) {
  const { Canvas, useClock } = skia;
  const clock = useClock();
  const barCount = resolveBarCount(containerWidth, explicitBarCount);
  const barWidth = Math.max(1, (containerWidth - (barCount - 1) * BAR_GAP) / barCount);

  return (
    <Canvas style={{ width: '100%', height }}>
      {Array.from({ length: barCount }, (_, index) => (
        <NativeSpectrumBar
          key={`native-spectrum-bar-${index}`}
          skia={skia}
          index={index}
          barWidth={barWidth}
          barCount={barCount}
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
  mode,
  height = DEFAULT_HEIGHT,
  width,
  color = '#00ff9d',
  barCount,
}: MusicSpectrumProps) {
  const skia = getSkiaModule();
  const visualLevel = resolveSpectrumLevel(active, mode);
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  const [renderCanvas, setRenderCanvas] = useState(visualLevel > 0);
  const activeLevel = useSharedValue(visualLevel);

  /* 播放 / 生命模式切换只改 activeLevel，Skia 节点在 UI 线程继续插值。 */
  useEffect(() => {
    if (visualLevel > 0) {
      setRenderCanvas(true);
      activeLevel.value = withTiming(visualLevel, {
        duration: 180,
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
    const timer = setTimeout(() => setRenderCanvas(false), NATIVE_CANVAS_IDLE_UNMOUNT_DELAY);

    return () => {
      clearTimeout(timer);
    };
  }, [activeLevel, visualLevel]);

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
          explicitBarCount={barCount}
        />
      ) : null}
    </View>
  );
}

const MemoNativeMusicSpectrum = memo(NativeMusicSpectrum);

/* 子组件：Web 端使用单 canvas 绘制，避免 CanvasKit 加载成本和大量 SVG 节点。 */
function WebMusicSpectrum({
  active,
  mode,
  height = DEFAULT_HEIGHT,
  width,
  color = '#00ff9d',
  barCount: explicitBarCount,
}: MusicSpectrumProps) {
  const visualLevel = resolveSpectrumLevel(active, mode);
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  const barCount = useMemo(
    () => resolveBarCount(containerWidth, explicitBarCount),
    [containerWidth, explicitBarCount],
  );
  const frequenciesRef = useRef<number[]>([]);
  const capPositionsRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entranceStartRef = useRef<number | null>(null);

  /* Web 降级使用单 canvas 绘制，避免 48 个 React / SVG 节点长期占用 JS。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    const maybeContext = canvas?.getContext('2d');
    if (!canvas || !maybeContext || containerWidth <= 0 || height <= 0) {
      return undefined;
    }

    const context = maybeContext;
    if (frequenciesRef.current.length !== barCount) {
      frequenciesRef.current = new Array(barCount).fill(0);
      capPositionsRef.current = new Array(barCount).fill(0);
    }
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(containerWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (visualLevel > 0) {
      frequenciesRef.current.fill(0);
      capPositionsRef.current.fill(0);
      entranceStartRef.current = null;
    }

    /* Web 单帧更新：计算目标高度、cap 下落和入场缓动，并在静止后停止 RAF。 */
    function updateVisualizer() {
      const frequencies = frequenciesRef.current;
      const capPositions = capPositionsRef.current;
      const now = Date.now();
      const start = entranceStartRef.current ?? now;
      entranceStartRef.current = start;
      const barWidth = Math.max(1, (containerWidth - (barCount - 1) * BAR_GAP) / barCount);
      let maxMovingValue = 0;

      context.clearRect(0, 0, containerWidth, height);

      frequencies.forEach((frequency, index) => {
        let target: number;

        if (visualLevel > 0) {
          const noise = Math.random();
          const wave = Math.sin(now * 0.005 + index * 0.2) * 20;
          target = 5 + visualLevel * (15 + noise * 70 + wave);
          const centerDistance = Math.abs(index - barCount / 2) / (barCount / 2);
          target *= 1 - centerDistance * 0.6;
        } else {
          target = 0;
        }

        frequencies[index] = resolveBarLevel(frequency, target, visualLevel > 0.05);

        const nextFrequency = frequencies[index] ?? 0;
        if (nextFrequency > (capPositions[index] ?? 0)) {
          capPositions[index] = nextFrequency;
        } else {
          capPositions[index] =
            (capPositions[index] ?? 0) - CAP_FALL_SPEED * (visualLevel > 0.05 ? 1 : 4);
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
        const capY = height - capBottom - CAP_HEIGHT - CAP_TOP_OFFSET;

        drawWebBar(context, x, y, barWidth, barHeight, height, color);
        drawWebCap(context, x, capY, barWidth, color, Math.max(0.25, visualLevel));

        maxMovingValue = Math.max(maxMovingValue, nextFrequency, capPositions[index] ?? 0);
      });

      if (visualLevel > 0 || maxMovingValue > 1) {
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
  }, [barCount, color, containerWidth, height, visualLevel]);

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

/* 导出组件：按平台分流到 Native Skia 或 Web canvas 实现。 */
export function MusicSpectrum(props: MusicSpectrumProps) {
  if (Platform.OS === 'web') {
    return <WebMusicSpectrum {...props} />;
  }

  return <MemoNativeMusicSpectrum {...props} />;
}
