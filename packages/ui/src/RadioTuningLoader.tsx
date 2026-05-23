/*
 * 组件：RadioTuningLoader
 * -----------------------
 * 作用：把网页原型里的 FM 调频等待态移植为移动端可复用组件。
 * 设计：
 *   - Native 端使用 Skia 绘制网格、刻度、频谱块和扫描针。
 *   - Web 端使用 Reanimated + View 降级，保持 Expo Web 预览不依赖 CanvasKit。
 *   - 动画只保留扫描针、频谱跳动、光标闪烁三类循环，避免等待态过度抢戏。
 */

import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface RadioTuningLoaderProps {
  /* 是否运行动画，等待 LLM 响应时保持 true。 */
  active?: boolean;
  /* 容器高度；未传时按网页原型 280×88 等比计算。 */
  height?: number;
  /* 容器宽度；未传时跟随父容器。 */
  width?: number;
  /* 未显式指定 width 时的最大宽度，避免桌面宽屏拉成长横幅。 */
  maxWidth?: number;
  /* 右下角状态文案。 */
  label?: string;
}

type SkiaModule = typeof import('@shopify/react-native-skia');

const DESIGN_WIDTH = 280;
const DESIGN_HEIGHT = 88;
const DEFAULT_WIDTH = DESIGN_WIDTH;
const DEFAULT_MAX_WIDTH = DESIGN_WIDTH;
const GRID_SIZE = 8;
const PANEL_BORDER = '#1f1f1f';
const PANEL_BG = '#000000';
const SIGNAL_GREEN = '#00ff88';
const SIGNAL_RED = '#ff3355';
const TEXT_COLOR = '#e8e8e8';
const BAR_COUNT = 5;

let cachedSkiaModule: SkiaModule | null | undefined;

/* 工具：Native 端按需加载 Skia，避免 Web 演示链路硬依赖 CanvasKit。 */
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

/*
 * Hook：管理调频等待态的三条动画时间线。
 * scan 控制红色指针；wave 控制频谱柱；cursor 控制右下角光标。
 */
function useRadioTuningAnimation(active: boolean) {
  const scan = useSharedValue(0);
  const wave = useSharedValue(0);
  const cursor = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(scan);
    cancelAnimation(wave);
    cancelAnimation(cursor);

    if (!active) {
      scan.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      wave.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      cursor.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    scan.value = 0;
    wave.value = 0;
    cursor.value = 0;
    scan.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false);
    wave.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.linear }), -1, false);
    cursor.value = withRepeat(withTiming(1, { duration: 520, easing: Easing.linear }), -1, true);

    return () => {
      cancelAnimation(scan);
      cancelAnimation(wave);
      cancelAnimation(cursor);
    };
  }, [active, cursor, scan, wave]);

  return { scan, wave, cursor };
}

/*
 * 子组件：Skia 频谱柱。
 * 高度由 Reanimated shared value 派生，绘制仍停留在 UI / Skia 侧。
 */
function NativeSignalBar({
  skia,
  index,
  scaleX,
  scaleY,
  wave,
}: {
  skia: SkiaModule;
  index: number;
  scaleX: number;
  scaleY: number;
  wave: SharedValue<number>;
}) {
  const { Rect: SkiaRect } = skia;
  const x = (40 + index * 8) * scaleX;
  const barWidth = 4 * scaleX;
  const barBottom = 70 * scaleY;
  const maxHeight = 22 * scaleY;

  const barHeight = useDerivedValue(() => {
    const phase = (wave.value + index * 0.19) * Math.PI * 2;
    const strength = 0.48 + Math.sin(phase) * 0.32 + (index % 2 === 0 ? 0.1 : 0);
    return Math.max(4 * scaleY, maxHeight * strength);
  });

  const barY = useDerivedValue(() => barBottom - barHeight.value);

  return <SkiaRect x={x} y={barY} width={barWidth} height={barHeight} color={SIGNAL_GREEN} />;
}

/*
 * 子组件：Native Skia 调频画布。
 * 静态图形走 Skia 矩形绘制，动态部分只绑定 Reanimated 派生值。
 */
function NativeTuningCanvas({
  skia,
  width,
  height,
  scan,
  wave,
}: {
  skia: SkiaModule;
  width: number;
  height: number;
  scan: SharedValue<number>;
  wave: SharedValue<number>;
}) {
  const { Canvas, Rect: SkiaRect } = skia;
  const scaleX = width / DESIGN_WIDTH;
  const scaleY = height / DESIGN_HEIGHT;
  const gridSize = GRID_SIZE * scaleX;
  const gridColumns = Math.ceil(width / gridSize);
  const gridRows = Math.ceil(height / (GRID_SIZE * scaleY));
  const tickXs = [20, 80, 140, 200, 260].map((value) => value * scaleX);
  const needleHeadX = useDerivedValue(() => (18 + scan.value * 240) * scaleX);
  const needleLineX = useDerivedValue(() => (20 + scan.value * 240) * scaleX);

  return (
    <Canvas style={{ width: '100%', height }}>
      <SkiaRect x={0} y={0} width={width} height={height} color={PANEL_BG} />
      <SkiaRect x={0} y={0} width={width} height={2 * scaleY} color={PANEL_BORDER} />
      <SkiaRect x={0} y={height - 2 * scaleY} width={width} height={2 * scaleY} color={PANEL_BORDER} />
      <SkiaRect x={0} y={0} width={2 * scaleX} height={height} color={PANEL_BORDER} />
      <SkiaRect x={width - 2 * scaleX} y={0} width={2 * scaleX} height={height} color={PANEL_BORDER} />

      {Array.from({ length: gridColumns + 1 }, (_, index) => (
        <SkiaRect
          key={`tuning-grid-col-${index}`}
          x={index * gridSize}
          y={2 * scaleY}
          width={Math.max(1, scaleX)}
          height={height - 4 * scaleY}
          color={PANEL_BORDER}
          opacity={0.28}
        />
      ))}
      {Array.from({ length: gridRows + 1 }, (_, index) => (
        <SkiaRect
          key={`tuning-grid-row-${index}`}
          x={2 * scaleX}
          y={index * GRID_SIZE * scaleY}
          width={width - 4 * scaleX}
          height={Math.max(1, scaleY)}
          color={PANEL_BORDER}
          opacity={0.28}
        />
      ))}

      <SkiaRect x={20 * scaleX} y={20 * scaleY} width={240 * scaleX} height={2 * scaleY} color={PANEL_BORDER} />
      {tickXs.map((tickX, index) => (
        <SkiaRect
          key={`tuning-tick-${index}`}
          x={tickX}
          y={20 * scaleY}
          width={2 * scaleX}
          height={(index % 2 === 0 ? 10 : 6) * scaleY}
          color={PANEL_BORDER}
        />
      ))}

      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <NativeSignalBar
          key={`native-tuning-bar-${index}`}
          skia={skia}
          index={index}
          scaleX={scaleX}
          scaleY={scaleY}
          wave={wave}
        />
      ))}
      <SkiaRect x={20 * scaleX} y={70 * scaleY} width={240 * scaleX} height={Math.max(1, scaleY)} color={PANEL_BORDER} />

      <SkiaRect x={needleHeadX} y={12 * scaleY} width={6 * scaleX} height={6 * scaleY} color={SIGNAL_RED} />
      <SkiaRect x={needleLineX} y={15 * scaleY} width={2 * scaleX} height={16 * scaleY} color={SIGNAL_RED} />

      <SkiaRect x={180 * scaleX} y={42 * scaleY} width={8 * scaleX} height={4 * scaleY} color={SIGNAL_GREEN} />
      <SkiaRect x={192 * scaleX} y={42 * scaleY} width={8 * scaleX} height={4 * scaleY} color={SIGNAL_GREEN} />
      <SkiaRect x={180 * scaleX} y={54 * scaleY} width={8 * scaleX} height={4 * scaleY} color={SIGNAL_GREEN} />
      <SkiaRect x={192 * scaleX} y={54 * scaleY} width={8 * scaleX} height={4 * scaleY} color={SIGNAL_GREEN} />
      <SkiaRect x={188 * scaleX} y={48 * scaleY} width={4 * scaleX} height={4 * scaleY} color={SIGNAL_RED} />
    </Canvas>
  );
}

/*
 * 子组件：Web 端单根频谱柱。
 * 每根柱子内部持有自己的 animated style，避免在循环里直接调用 Hook。
 */
function WebSignalBar({
  index,
  scaleX,
  scaleY,
  wave,
}: {
  index: number;
  scaleX: number;
  scaleY: number;
  wave: SharedValue<number>;
}) {
  const barStyle = useAnimatedStyle(() => {
    const phase = (wave.value + index * 0.19) * Math.PI * 2;
    const strength = 0.48 + Math.sin(phase) * 0.32 + (index % 2 === 0 ? 0.1 : 0);
    return { height: Math.max(4 * scaleY, 22 * scaleY * strength) };
  });

  return <Animated.View style={[{ width: 4 * scaleX, backgroundColor: SIGNAL_GREEN }, barStyle]} />;
}

/*
 * 子组件：Web 降级调频模块。
 * 用 View 还原结构，用 Reanimated 驱动同样三类动画，方便浏览器预览。
 */
function WebTuningModule({
  active,
  width,
  height,
  scan,
  wave,
}: {
  active: boolean;
  width: number;
  height: number;
  scan: SharedValue<number>;
  wave: SharedValue<number>;
}) {
  const scaleX = width / DESIGN_WIDTH;
  const scaleY = height / DESIGN_HEIGHT;
  const gridSizeX = GRID_SIZE * scaleX;
  const gridSizeY = GRID_SIZE * scaleY;
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scan.value, [0, 1], [20 * scaleX, 260 * scaleX]) }],
    opacity: active ? 1 : 0.45,
  }));

  return (
    <>
      {Array.from({ length: Math.ceil(width / gridSizeX) + 1 }, (_, index) => (
        <View
          key={`web-tuning-grid-x-${index}`}
          style={{
            position: 'absolute',
            left: index * gridSizeX,
            top: 2 * scaleY,
            bottom: 2 * scaleY,
            width: Math.max(1, scaleX),
            backgroundColor: PANEL_BORDER,
            opacity: 0.28,
          }}
        />
      ))}
      {Array.from({ length: Math.ceil(height / gridSizeY) }, (_, index) => (
        <View
          key={`web-tuning-grid-y-${index}`}
          style={{
            position: 'absolute',
            left: 2 * scaleX,
            right: 2 * scaleX,
            top: index * gridSizeY,
            height: Math.max(1, scaleY),
            backgroundColor: PANEL_BORDER,
            opacity: 0.28,
          }}
        />
      ))}

      <View style={{ position: 'absolute', left: 20 * scaleX, right: 20 * scaleX, top: 20 * scaleY, height: 2 * scaleY, backgroundColor: PANEL_BORDER }} />
      {[20, 80, 140, 200, 260].map((tickX, index) => (
        <View
          key={`web-tuning-tick-${index}`}
          style={{
            position: 'absolute',
            left: tickX * scaleX,
            top: 20 * scaleY,
            width: 2 * scaleX,
            height: (index % 2 === 0 ? 10 : 6) * scaleY,
            backgroundColor: PANEL_BORDER,
          }}
        />
      ))}

      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 8 * scaleX, height: 31 * scaleY }, needleStyle]}>
        <View style={{ position: 'absolute', top: 12 * scaleY, left: -2 * scaleX, width: 6 * scaleX, height: 6 * scaleY, backgroundColor: SIGNAL_RED }} />
        <View style={{ position: 'absolute', top: 15 * scaleY, left: 0, width: 2 * scaleX, height: 16 * scaleY, backgroundColor: SIGNAL_RED }} />
      </Animated.View>

      <View style={{ position: 'absolute', left: 40 * scaleX, top: 48 * scaleY, height: 22 * scaleY, width: 42 * scaleX, flexDirection: 'row', alignItems: 'flex-end', gap: 4 * scaleX }}>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <WebSignalBar
            key={`web-tuning-bar-${index}`}
            index={index}
            scaleX={scaleX}
            scaleY={scaleY}
            wave={wave}
          />
        ))}
      </View>
      <View style={{ position: 'absolute', left: 20 * scaleX, right: 20 * scaleX, top: 70 * scaleY, height: Math.max(1, scaleY), backgroundColor: PANEL_BORDER }} />

      <View style={{ position: 'absolute', left: 180 * scaleX, top: 42 * scaleY, width: 22 * scaleX, height: 16 * scaleY }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: 8 * scaleX, height: 4 * scaleY, backgroundColor: SIGNAL_GREEN }} />
        <View style={{ position: 'absolute', left: 12 * scaleX, top: 0, width: 8 * scaleX, height: 4 * scaleY, backgroundColor: SIGNAL_GREEN }} />
        <View style={{ position: 'absolute', left: 0, top: 12 * scaleY, width: 8 * scaleX, height: 4 * scaleY, backgroundColor: SIGNAL_GREEN }} />
        <View style={{ position: 'absolute', left: 12 * scaleX, top: 12 * scaleY, width: 8 * scaleX, height: 4 * scaleY, backgroundColor: SIGNAL_GREEN }} />
        <View style={{ position: 'absolute', left: 8 * scaleX, top: 6 * scaleY, width: 4 * scaleX, height: 4 * scaleY, backgroundColor: SIGNAL_RED }} />
      </View>
    </>
  );
}

export function RadioTuningLoader({
  active = true,
  height,
  width,
  maxWidth = DEFAULT_MAX_WIDTH,
  label = '正在调频',
}: RadioTuningLoaderProps) {
  const skia = getSkiaModule();
  const [containerWidth, setContainerWidth] = useState(width ?? DEFAULT_WIDTH);
  const resolvedHeight = height ?? (containerWidth / DESIGN_WIDTH) * DESIGN_HEIGHT;
  const designScale = containerWidth / DESIGN_WIDTH;
  const { scan, wave, cursor } = useRadioTuningAnimation(active);
  const cursorStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(cursor.value, [0, 0.5, 1], [1, 0, 1]) : 0.35,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (!width && measuredWidth && Math.abs(measuredWidth - containerWidth) > 0.5) {
          setContainerWidth(measuredWidth);
        }
      }}
      style={{
        width: width ?? '100%',
        maxWidth: width ? undefined : maxWidth,
        height: resolvedHeight,
        overflow: 'hidden',
        backgroundColor: PANEL_BG,
        borderWidth: 2,
        borderColor: PANEL_BORDER,
      }}
    >
      {skia ? (
        <NativeTuningCanvas
          skia={skia}
          width={containerWidth}
          height={resolvedHeight}
          scan={scan}
          wave={wave}
        />
      ) : (
        <WebTuningModule
          active={active}
          width={containerWidth}
          height={resolvedHeight}
          scan={scan}
          wave={wave}
        />
      )}

      <Text
        className="font-mono tracking-pixel"
        style={{
          position: 'absolute',
          left: 20 * designScale,
          top: 8 * designScale,
          color: SIGNAL_GREEN,
          fontSize: Math.max(7, 8 * designScale),
          fontWeight: '700',
        }}
      >
        FM 99.7 AI_SIGNAL
      </Text>

      <View
        style={{
          position: 'absolute',
          right: 10 * designScale,
          bottom: 6 * designScale,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4 * designScale,
        }}
      >
        <Text
          className="font-mono tracking-pixel"
          style={{ color: TEXT_COLOR, fontSize: Math.max(8, 10 * designScale) }}
        >
          {label}
        </Text>
        <Animated.View
          style={[
            { width: 6 * designScale, height: 10 * designScale, backgroundColor: SIGNAL_GREEN },
            cursorStyle,
          ]}
        />
      </View>
    </View>
  );
}
