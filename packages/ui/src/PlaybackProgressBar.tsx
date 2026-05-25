/*
 * 组件：PlaybackProgressBar
 * ------------------------
 * 作用：
 *   - 提供可复用的像素飞船播放进度条
 *   - 拖动完全走 Reanimated + Gesture Handler，避免 move 事件里走 React state
 *   - 电荷粒子、尾焰和拖动火花全部走 UI 线程动画，不再用 RAF + setState
 */

import { useEffect, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';

export interface PlaybackProgressBarProps {
  /* 当前播放位置（秒） */
  position: number;
  /* 当前曲总时长（秒） */
  duration: number;
  /* 当前是否处于播放态 */
  playing: boolean;
  /* 当前曲目是否已经播放结束，用于关闭 idle 动画 */
  ended?: boolean;
  /* 曲目身份，用于切歌时重置本地动画缓存 */
  trackKey?: string;
  /* 外部 seek 回调；不传时退化为纯展示 */
  onSeek?: (seconds: number) => void;
}

interface ChargeSeed {
  /* 粒子初始相位，保证整条管道不是齐刷刷一起走 */
  offset: number;
  /* 粒子纵向车道 */
  lane: number;
  /* 粒子移动速度倍率 */
  speed: number;
  /* 粒子最大透明度 */
  opacity: number;
}

interface SparkSeed {
  /* 火花横向滞后距离 */
  distance: number;
  /* 火花上下摆动幅度 */
  amplitude: number;
  /* 火花相位偏移 */
  offset: number;
  /* 火花基准车道 */
  lane: number;
  /* 火花方块尺寸 */
  size: number;
  /* 火花颜色 */
  color: string;
  /* 火花最大透明度 */
  opacity: number;
}

const TRACK_HEIGHT = 14;
const TRACK_TOP = 2;
const TRACK_PADDING = 2;
const OUTER_HEIGHT = 22;
const SHIP_WIDTH = 28;
const SHIP_HEIGHT = 14;
const FLAME_CENTER_Y = SHIP_HEIGHT / 2 - 2;
const CHARGE_COUNT = 40;
const SPARK_COUNT = 8;

/* 工具：把数值钳制到区间内，手势与进度同步都会复用。 */
function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/* 工具：把秒数格式化为 m:ss，供时间标签复用。 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainSeconds < 10 ? `0${remainSeconds}` : remainSeconds}`;
}

/* 工具：生成稳定伪随机序列，避免粒子因为重渲染闪烁换位。 */
function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

/* 工具：按固定种子生成电荷粒子配置，保证视觉稳定。 */
function createChargeSeeds(count: number): ChargeSeed[] {
  let seed = 17;
  const items: ChargeSeed[] = [];

  for (let index = 0; index < count; index += 1) {
    seed = nextSeed(seed);
    const offset = (seed % 1000) / 1000;
    seed = nextSeed(seed);
    const lane = 3 + ((seed % 60) / 10);
    seed = nextSeed(seed);
    const speed = 0.7 + ((seed % 120) / 100);
    seed = nextSeed(seed);
    const opacity = 0.28 + ((seed % 50) / 100);
    items.push({ offset, lane, speed, opacity });
  }

  return items;
}

/* 工具：按固定种子生成拖动火花配置，拖动时仍保留赛博像素碎屑感。 */
function createSparkSeeds(count: number): SparkSeed[] {
  let seed = 29;
  const palette = ['#A020F0', '#00FFFF', '#ffffff'];
  const items: SparkSeed[] = [];

  for (let index = 0; index < count; index += 1) {
    seed = nextSeed(seed);
    const distance = 10 + (seed % 50);
    seed = nextSeed(seed);
    const amplitude = 1 + (seed % 2);
    seed = nextSeed(seed);
    const offset = (seed % 1000) / 1000;
    seed = nextSeed(seed);
    const lane = -2 + (seed % 4);
    seed = nextSeed(seed);
    const size = 2;
    seed = nextSeed(seed);
    const color = palette[seed % palette.length] ?? '#00FFFF';
    seed = nextSeed(seed);
    const opacity = 0.25 + ((seed % 55) / 100);
    items.push({ distance, amplitude, offset, lane, size, color, opacity });
  }

  return items;
}

const CHARGE_SEEDS = createChargeSeeds(CHARGE_COUNT);
const SPARK_SEEDS = createSparkSeeds(SPARK_COUNT);

/* 工具：把手指在本地坐标里的横向位置换算成进度比例。 */
function ratioFromLocalX(localX: number, containerWidth: number): number {
  'worklet';
  if (!Number.isFinite(localX) || containerWidth <= TRACK_PADDING * 2) {
    return 0;
  }
  const innerWidth = containerWidth - TRACK_PADDING * 2;
  const clampedX = clamp(localX - TRACK_PADDING, 0, innerWidth);
  return clamp(clampedX / innerWidth, 0, 1);
}

/* 子组件：固定像素飞船图标，外层位移与倾斜由 Animated 容器负责。 */
function PixelShipIcon() {
  return (
    <Svg width={SHIP_WIDTH} height={SHIP_HEIGHT} viewBox="0 0 60 34">
      <G>
        <Rect x={0} y={11.3} width={12} height={11.3} fill="#00FFFF" />
        <Rect x={12} y={5.6} width={36} height={22.6} fill="#ffffff" />
        <Rect x={48} y={11.3} width={12} height={11.3} fill="#00FFFF" />
        <Rect x={18} y={11.3} width={6} height={5.6} fill="#000000" />
      </G>
    </Svg>
  );
}

/* 子组件：管道内持续左移的青色电荷粒子。 */
function ChargeParticle({
  seed,
  containerWidth,
  flowClock,
  activeLevel,
}: {
  seed: ChargeSeed;
  containerWidth: SharedValue<number>;
  flowClock: SharedValue<number>;
  activeLevel: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const travelWidth = Math.max(containerWidth.value - TRACK_PADDING * 2 - 4, 0);
    const phase = (flowClock.value * seed.speed + seed.offset) % 1;
    const x = TRACK_PADDING + (1 - phase) * travelWidth;
    return {
      opacity: seed.opacity * (0.18 + activeLevel.value * 0.82),
      transform: [{ translateX: x }, { translateY: seed.lane }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 2,
          height: 2,
          borderRadius: 1,
          backgroundColor: '#00FFFF',
          shadowColor: '#00FFFF',
          shadowOpacity: 0.85,
          shadowRadius: 5,
        },
        animatedStyle,
      ]}
    />
  );
}

/* 子组件：拖动期间跟在飞船后面的像素火花，保留原来的速度感。 */
function DragSpark({
  seed,
  containerWidth,
  flowClock,
  progressRatio,
  dragVelocity,
  dragLevel,
}: {
  seed: SparkSeed;
  containerWidth: SharedValue<number>;
  flowClock: SharedValue<number>;
  progressRatio: SharedValue<number>;
  dragVelocity: SharedValue<number>;
  dragLevel: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const innerWidth = Math.max(containerWidth.value - TRACK_PADDING * 2, 0);
    const anchorX = TRACK_PADDING + progressRatio.value * innerWidth;
    const speedFactor = clamp(dragVelocity.value / 1800, 0, 1);
    const sway = Math.sin((flowClock.value + seed.offset) * Math.PI * 2) * seed.amplitude;

    return {
      width: seed.size,
      height: seed.size,
      opacity: seed.opacity * speedFactor * dragLevel.value,
      transform: [
        { translateX: anchorX - seed.distance * (0.65 + speedFactor) },
        { translateY: TRACK_HEIGHT / 2 + seed.lane + sway },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          borderRadius: 1,
          backgroundColor: seed.color,
          shadowColor: seed.color,
          shadowOpacity: 0.7,
          shadowRadius: 5,
        },
        animatedStyle,
      ]}
    />
  );
}

export function PlaybackProgressBar({
  position,
  duration,
  playing,
  trackKey,
  onSeek,
}: PlaybackProgressBarProps) {
  const containerWidth = useSharedValue(0);
  const displayProgress = useSharedValue(duration > 0 ? clamp(position / duration, 0, 1) : 0);
  const pendingProgress = useSharedValue(displayProgress.value);
  const durationSeconds = useSharedValue(duration);
  const playingLevel = useSharedValue(playing ? 1 : 0);
  const dragLevel = useSharedValue(0);
  const dragVelocity = useSharedValue(0);
  const flowClock = useSharedValue(0);
  const flamePulse = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const suppressExternalSyncUntilRef = useRef(0);
  const animationRunning = playing || dragging;

  /* 只在播放或拖动时启动循环动画，暂停/结束后取消 idle 空转。 */
  useEffect(() => {
    cancelAnimation(flowClock);
    cancelAnimation(flamePulse);

    if (!animationRunning) {
      flowClock.value = withTiming(0, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
      flamePulse.value = withTiming(0, {
        duration: 100,
        easing: Easing.out(Easing.quad),
      });
      return undefined;
    }

    flowClock.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    flamePulse.value = withRepeat(
      withTiming(1, {
        duration: 100,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(flowClock);
      cancelAnimation(flamePulse);
    };
  }, [animationRunning, flamePulse, flowClock]);

  /* 播放态只改 shared value；真实视觉插值仍留在 UI 线程。 */
  useEffect(() => {
    playingLevel.value = withTiming(playing ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.quad),
    });
  }, [playing, playingLevel]);

  /* 切歌时重置本地进度、拖动速度和拖动残留。 */
  useEffect(() => {
    const nextRatio = duration > 0 ? clamp(position / duration, 0, 1) : 0;
    durationSeconds.value = duration;
    cancelAnimation(displayProgress);
    cancelAnimation(dragVelocity);
    cancelAnimation(dragLevel);
    displayProgress.value = nextRatio;
    pendingProgress.value = nextRatio;
    dragVelocity.value = 0;
    dragLevel.value = 0;
    setDragging(false);
  }, [trackKey]);

  /* 总时长会在音频元数据加载后变化，单独同步给 UI 线程即可。 */
  useEffect(() => {
    durationSeconds.value = duration;
  }, [duration, durationSeconds]);

  /*
   * 非拖动期间，根据外部真实 position / duration 同步进度。
   * 播放中用剩余时长让 UI 线程连续推进，避免真机 position 回调间隔抖动造成“走一下停一下”。
   */
  useEffect(() => {
    const nextRatio = duration > 0 ? clamp(position / duration, 0, 1) : 0;

    if (dragging || Date.now() < suppressExternalSyncUntilRef.current) {
      return;
    }

    pendingProgress.value = nextRatio;
    if (playing && duration > 0) {
      const remainingMs = Math.max(0, (duration - position) * 1000);
      displayProgress.value = nextRatio;
      if (remainingMs > 0) {
        displayProgress.value = withTiming(1, {
          duration: remainingMs,
          easing: Easing.linear,
        });
      }
      return;
    }

    displayProgress.value = withTiming(nextRatio, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [displayProgress, dragging, duration, pendingProgress, playing, position]);

  /* 工具：统一从 JS 侧调用外部 seek，手势结束与点击都走这里。 */
  function commitSeek(seconds: number) {
    suppressExternalSyncUntilRef.current = Date.now() + 800;
    onSeek?.(seconds);
  }

  /* 工具：手势开始只更新一次 React state，避免外部 position 覆盖拖动。 */
  function beginDragOnJS() {
    setDragging(true);
  }

  /* 工具：手势结束后给播放器 seek 一点回写时间，再恢复外部同步。 */
  function endDragOnJS() {
    suppressExternalSyncUntilRef.current = Date.now() + 800;
    setDragging(false);
  }

  /* 工具：布局测量只更新 shared value，不会进入高频热路径。 */
  function handleLayout(event: LayoutChangeEvent) {
    containerWidth.value = event.nativeEvent.layout.width;
  }

  /* 工具：把当前拖动点写入 shared value，视觉立刻跟手。 */
  const updateInteractiveProgress = (localX: number, velocityX: number) => {
    'worklet';
    const ratio = ratioFromLocalX(localX, containerWidth.value);
    pendingProgress.value = ratio;
    displayProgress.value = ratio;
    dragLevel.value = 1;
    dragVelocity.value = clamp(Math.abs(velocityX), 0, 2400);
  };

  const panGesture = Gesture.Pan()
    .enabled(Boolean(onSeek) && duration > 0)
    .minDistance(1)
    .onBegin((event) => {
      runOnJS(beginDragOnJS)();
      updateInteractiveProgress(event.x, event.velocityX);
    })
    .onUpdate((event) => {
      updateInteractiveProgress(event.x, event.velocityX);
    })
    .onFinalize(() => {
      const seekSeconds = pendingProgress.value * durationSeconds.value;
      dragLevel.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
      dragVelocity.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
      runOnJS(commitSeek)(seekSeconds);
      runOnJS(endDragOnJS)();
    });

  const tapGesture = Gesture.Tap()
    .enabled(Boolean(onSeek) && duration > 0)
    .onEnd((event, success) => {
      if (!success) {
        return;
      }
      const ratio = ratioFromLocalX(event.x, containerWidth.value);
      pendingProgress.value = ratio;
      displayProgress.value = withTiming(ratio, {
        duration: 110,
        easing: Easing.out(Easing.cubic),
      });
      runOnJS(commitSeek)(ratio * durationSeconds.value);
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const fillStyle = useAnimatedStyle(() => {
    const innerWidth = Math.max(containerWidth.value - TRACK_PADDING * 2, 0);
    return {
      width: innerWidth * displayProgress.value,
      opacity: 0.22 + Math.max(playingLevel.value, dragLevel.value) * 0.1,
    };
  });

  const shipStyle = useAnimatedStyle(() => {
    const innerWidth = Math.max(containerWidth.value - TRACK_PADDING * 2, 0);
    const shipX = TRACK_PADDING + displayProgress.value * innerWidth - SHIP_WIDTH / 2;
    const tilt = clamp((pendingProgress.value - displayProgress.value) * 18, -10, 10);
    const stretch = 1 + clamp(dragVelocity.value / 5000, 0, 0.14);
    return {
      transform: [
        { translateX: shipX },
        { scaleX: stretch },
        { skewY: `${tilt}deg` },
      ],
    };
  });

  const flameOuterStyle = useAnimatedStyle(() => {
    const activeLevel = Math.max(playingLevel.value, dragLevel.value);
    const width = 5 + flamePulse.value * 6;
    return {
      width,
      opacity: activeLevel * (1 - flamePulse.value * 0.5),
      transform: [{ translateX: -width + 2 }],
    };
  });

  const actualRatio = duration > 0 ? clamp(position / duration, 0, 1) : 0;

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View onLayout={handleLayout} style={{ width: '100%', height: OUTER_HEIGHT }}>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: TRACK_TOP,
              left: 0,
              right: 0,
              height: TRACK_HEIGHT,
              borderRadius: 3,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(0,255,255,0.2)',
              backgroundColor: 'rgba(255,255,255,0.05)',
            }}
          >
            <Svg width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute' }}>
              <Defs>
                <LinearGradient id="claudio-progress-tube" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0" stopColor="#001a1a" />
                  <Stop offset="50%" stopColor="#004d4d" />
                  <Stop offset="100%" stopColor="#001a1a" />
                </LinearGradient>
              </Defs>
              <Rect
                x={TRACK_PADDING}
                y={TRACK_PADDING}
                width="98.75%"
                height={TRACK_HEIGHT - TRACK_PADDING * 2}
                rx={2}
                fill="url(#claudio-progress-tube)"
              />
            </Svg>

            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: TRACK_PADDING,
                  top: TRACK_PADDING,
                  bottom: TRACK_PADDING,
                  borderRadius: 2,
                  backgroundColor: '#00FFFF',
                },
                fillStyle,
              ]}
            />

            {CHARGE_SEEDS.map((seed, index) => (
              <ChargeParticle
                key={`charge-${index}`}
                seed={seed}
                containerWidth={containerWidth}
                flowClock={flowClock}
                activeLevel={playingLevel}
              />
            ))}

            {SPARK_SEEDS.map((seed, index) => (
              <DragSpark
                key={`spark-${index}`}
                seed={seed}
                containerWidth={containerWidth}
                flowClock={flowClock}
                progressRatio={displayProgress}
                dragVelocity={dragVelocity}
                dragLevel={dragLevel}
              />
            ))}
          </View>

          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: TRACK_TOP + (TRACK_HEIGHT - SHIP_HEIGHT) / 2 - 1,
                left: 0,
                width: SHIP_WIDTH,
                height: SHIP_HEIGHT,
                justifyContent: 'center',
              },
              shipStyle,
            ]}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: FLAME_CENTER_Y - 2,
                  height: 4,
                  borderRadius: 1,
                  backgroundColor: '#A020F0',
                  shadowColor: '#A020F0',
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                },
                flameOuterStyle,
              ]}
            />
            <View
              style={{
                position: 'absolute',
                  left: -7,
                  top: FLAME_CENTER_Y - 1,
                  width: 5,
                  height: 3,
                backgroundColor: '#ffffff',
                borderRadius: 1,
              }}
            />
            <PixelShipIcon />
          </Animated.View>
        </View>
      </GestureDetector>

      <View className="flex-row items-center justify-between mt-1">
        <View className="flex-row items-center">
          <Text className="font-pixel text-xs tracking-pixel" style={{ color: '#00FFFF' }}>
            TIME:
          </Text>
          <Text className="font-pixel text-xs tracking-pixel ml-7" style={{ color: '#ffffff' }}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="font-pixel text-xs tracking-pixel" style={{ color: '#00FFFF' }}>
            SYNC:
          </Text>
          <Text className="font-pixel text-xs tracking-pixel ml-4" style={{ color: '#ffffff' }}>
            {(actualRatio * 100).toFixed(1)}%
          </Text>
        </View>
      </View>
    </View>
  );
}
