/*
 * 组件：NowPlayingBar
 * 作用：当前曲信息行 + 频谱条占位 + 像素飞船霓虹管道进度条
 * 设计：
 *   - 频谱（WaveformBars）保持原位置，由 showWaveform 控制是否显示
 *   - 进度条完整替换为用户提供的 retro cyberpunk pixel loader：
 *     霓虹光导管 + 电荷粒子 + 像素飞船 + 喷射火焰 + 平滑插值
 *   - 仍走外部受控的 position / duration / onSeek，不改播放功能来源
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';

/* react-native-svg 与 Animated 桥接：用于飞船平移、火焰呼吸、电荷流动、进度填充 */
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface NowPlayingBarProps {
  /* 曲名，例如 "If" */
  title: string;
  /* 艺术家，例如 "Bread" */
  artist?: string;
  /* 当前播放状态文字 */
  state?: string;
  /* 当前歌曲身份，用于切歌时重置进度条动画缓存 */
  trackKey?: string;
  /* 是否在播放，true 则进度条自增、波形跳动 */
  playing?: boolean;
  /*
   * 受控播放进度（秒）。提供时优先使用 — 由外部播放引擎驱动；
   * 不提供时回退为内部 setInterval 自增（demo / 离线占位用）。
   */
  position?: number;
  /* 起始进度（秒），仅在 position 未提供时生效 */
  startPosition?: number;
  /* 总时长（秒） */
  duration?: number;
  /* 是否显示左侧频谱条 */
  showWaveform?: boolean;
  /* 点击进度条时跳转到指定秒数；不传则进度条仅展示 */
  onSeek?: (seconds: number) => void;
}

/* 工具：把秒数格式化为 m:ss */
function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

/*
 * 子组件：用户原版频谱可视化
 * 结构逐项对应用户代码：visualizer-container / v-bar-wrapper / v-bar / v-cap。
 * 动画逐项对应用户代码：requestAnimationFrame、frequencies、capPositions、noise、wave、中心衰减、cap 重力下落。
 */
const VISUALIZER_BAR_COUNT = 48;
const VISUALIZER_WIDTH = 900;
const VISUALIZER_HEIGHT = 200;
const VISUALIZER_GAP = 6;
const VISUALIZER_CAP_HEIGHT = 4;
const VISUALIZER_CAP_OFFSET = 6;
const VISUALIZER_CAP_FALL_SPEED = 0.8;

function WaveformBars({ active }: { active: boolean }) {
  /* 逐项对应用户代码里的 frequencies 数组 */
  const frequenciesRef = useRef<number[]>(
    new Array(VISUALIZER_BAR_COUNT).fill(0),
  );
  /* 逐项对应用户代码里的 capPositions 数组 */
  const capPositionsRef = useRef<number[]>(
    new Array(VISUALIZER_BAR_COUNT).fill(0),
  );
  /* RAF id：对应 updateVisualizer 循环，卸载时取消 */
  const rafRef = useRef<number | null>(null);
  /* 触发 React Native 重绘的帧数据，逻辑值仍由 ref 数组保存 */
  const [visualizerFrame, setVisualizerFrame] = useState(() =>
    Array.from({ length: VISUALIZER_BAR_COUNT }, () => ({ frequency: 0, cap: 0 })),
  );

  useEffect(() => {
    function updateVisualizer() {
      const frequencies = frequenciesRef.current;
      const capPositions = capPositionsRef.current;

      const nextFrame = frequencies.map((frequency, i) => {
        let target: number;

        if (active) {
          const noise = Math.random();
          const wave = Math.sin(Date.now() * 0.005 + i * 0.2) * 20;
          target = 20 + noise * 70 + wave;
          const distFromCenter = Math.abs(i - VISUALIZER_BAR_COUNT / 2) / (VISUALIZER_BAR_COUNT / 2);
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
          capPositions[i] = (capPositions[i] ?? 0) - VISUALIZER_CAP_FALL_SPEED;
        }
        if ((capPositions[i] ?? 0) < 0) capPositions[i] = 0;

        return {
          frequency: nextFrequency,
          cap: capPositions[i] ?? 0,
        };
      });

      setVisualizerFrame(nextFrame);
      rafRef.current = requestAnimationFrame(updateVisualizer);
    }

    rafRef.current = requestAnimationFrame(updateVisualizer);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  return (
    <View
      style={{
        width: VISUALIZER_WIDTH,
        height: VISUALIZER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: VISUALIZER_GAP,
        zIndex: 5,
      }}
    >
      {visualizerFrame.map(({ frequency, cap }, i) => {
        const barHeight = (frequency / 100) * VISUALIZER_HEIGHT;
        const capBottom = (cap / 100) * VISUALIZER_HEIGHT;
        const gradientId = `now-playing-v-bar-${i}`;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: '100%',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              position: 'relative',
            }}
          >
            <View
              style={{
                position: 'absolute',
                bottom: capBottom,
                left: 0,
                width: '100%',
                height: VISUALIZER_CAP_HEIGHT,
                backgroundColor: '#ffffff',
                borderRadius: 1,
                opacity: active ? 1 : 0.3,
                zIndex: 6,
                shadowColor: '#00ff88',
                shadowOpacity: active ? 1 : 0.35,
                shadowRadius: active ? 20 : 8,
                transform: [{ translateY: -VISUALIZER_CAP_OFFSET }],
              }}
            />
            <Svg
              width="100%"
              height={barHeight}
              style={{
                shadowColor: '#00ff88',
                shadowOpacity: 0.2,
                shadowRadius: 15,
              }}
            >
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                  <Stop offset="0" stopColor="#001a0f" />
                  <Stop offset="0.4" stopColor="#006644" />
                  <Stop offset="1" stopColor="#00ff9d" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" rx={2} fill={`url(#${gradientId})`} />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

/*
 * 像素飞船霓虹管道进度条
 * ---------------------------------------------
 * 完整对应用户提供的 retro cyberpunk pixel loader：
 *   - SVG viewBox 1000 x 60
 *   - 管道内边距 5px，rx 2
 *   - 渐变 #001a1a → #004d4d → #001a1a
 *   - 边框 rgba(0,255,255,0.2) stroke 2，rgba(255,255,255,0.05) fill
 *   - 40 颗 4x4 青色电荷粒子向左流动
 *   - 进度填充 cyan opacity 0.3
 *   - 像素飞船 60x34（viewBox 40x24 等比放大）
 *   - 喷射火焰 0.1s 周期 width 10↔25 / opacity 1↔0.5
 *   - 平滑插值：progress += (target - progress) * 0.15
 */
const TUBE_VIEWBOX_W = 800;
const TUBE_VIEWBOX_H = 260;
const TUBE_GROUP_X = 0;
const TUBE_GROUP_Y = 100;
const TUBE_TRACK_W = 800;
const TUBE_TRACK_H = 60;
const TUBE_PADDING = 5;
const TUBE_INNER_W = TUBE_TRACK_W - TUBE_PADDING * 2;
const TUBE_INNER_H = TUBE_TRACK_H - TUBE_PADDING * 2;
const TUBE_DISPLAY_HEIGHT = 150;
const CHARGE_COUNT = 40;
const DUST_LIMIT = 18;
const SHIP_TRAVEL_RANGE = TUBE_INNER_W;

interface ChargeParticle {
  x: number;
  y: number;
  speed: number;
  opacity: number;
}

/* 子组件：电荷粒子流，模拟用户代码的 createCharges + resetCharge */
/* 复用粒子对象的生成逻辑，避免动画循环里散落重复随机参数。 */
function createChargeParticle(x = Math.random() * TUBE_INNER_W): ChargeParticle {
  return {
    x,
    y: 10 + Math.random() * 40,
    speed: 0.8 + Math.random() * 1.8,
    opacity: Math.random() * 0.8,
  };
}

function ChargeParticles({ active, trackKey }: { active: boolean; trackKey?: string }) {
  const particlesRef = useRef<ChargeParticle[]>(
    Array.from({ length: CHARGE_COUNT }, () => createChargeParticle()),
  );
  const [particles, setParticles] = useState(() => particlesRef.current.map((p) => ({ ...p })));

  useEffect(() => {
    particlesRef.current = Array.from({ length: CHARGE_COUNT }, () => createChargeParticle());
    setParticles(particlesRef.current.map((p) => ({ ...p })));
  }, [trackKey]);

  useEffect(() => {
    if (!active) return;
    let id: number | null = null;
    function tick() {
      particlesRef.current.forEach((p) => {
        p.x -= p.speed;
        if (p.x < -4) {
          const next = createChargeParticle(TUBE_INNER_W);
          p.x = next.x;
          p.y = next.y;
          p.speed = next.speed;
          p.opacity = next.opacity;
        }
      });
      setParticles(particlesRef.current.map((p) => ({ ...p })));
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => {
      if (id != null) cancelAnimationFrame(id);
    };
  }, [active]);

  return (
    <>
      {particles.map((p, i) => (
        <Rect
          key={i}
          x={p.x}
          y={p.y}
          width={4}
          height={4}
          fill="#00FFFF"
          opacity={p.opacity}
        />
      ))}
    </>
  );
}

interface PixelShipProgressBarProps {
  position: number;
  duration: number;
  playing: boolean;
  trackKey?: string;
  onSeek?: (seconds: number) => void;
}

interface DustParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  opacity: number;
}

/* 子组件：像素飞船霓虹管道进度条主体 */
function PixelShipProgressBar({
  position,
  duration,
  playing,
  trackKey,
  onSeek,
}: PixelShipProgressBarProps) {
  /* 真实进度（来自 props，[0,1]） */
  const realPercent = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  /* 容器宽度，用于把手势 localX 折算成 [0,1] 进度比例 */
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [renderFrame, setRenderFrame] = useState({
    shipX: TUBE_GROUP_X + TUBE_PADDING + realPercent * SHIP_TRAVEL_RANGE,
    fillWidth: realPercent * SHIP_TRAVEL_RANGE,
    velocity: 0,
    scaleX: 1,
    skewY: 0,
  });
  const [dust, setDust] = useState<DustParticle[]>([]);
  const dustRef = useRef<DustParticle[]>([]);
  /* Web 拖动兜底：当 locationX 不可用时，靠 pageX 偏移推算 */
  const dragOriginRef = useRef<{ pageX: number; localX: number } | null>(null);
  const lastMoveRef = useRef({ x: realPercent * SHIP_TRAVEL_RANGE, time: Date.now() });
  const velocityRef = useRef(0);
  const dustIdRef = useRef(0);

  /* 用户拖动期间使用的"目标"进度，松手后回归真实进度 */
  const targetRef = useRef(realPercent);
  /* 平滑插值后的当前进度，对应用户代码 progress 变量 */
  const currentRef = useRef(realPercent);

  /* 驱动 SVG 的 Animated.Value：火焰宽度、火焰透明度 */
  const thrusterWidthAnim = useRef(new Animated.Value(15)).current;
  const thrusterOpacityAnim = useRef(new Animated.Value(1)).current;

  /* 切歌时清理上一首残留的插值、速度和拖动粒子。 */
  useEffect(() => {
    targetRef.current = realPercent;
    currentRef.current = realPercent;
    velocityRef.current = 0;
    lastMoveRef.current = {
      x: realPercent * SHIP_TRAVEL_RANGE,
      time: Date.now(),
    };
    dustRef.current = [];
    setDust([]);
    setRenderFrame({
      shipX: TUBE_GROUP_X + TUBE_PADDING + realPercent * SHIP_TRAVEL_RANGE,
      fillWidth: realPercent * SHIP_TRAVEL_RANGE,
      velocity: 0,
      scaleX: 1,
      skewY: 0,
    });
  }, [trackKey]);

  /* 真实进度变化：未拖动时同步进 target；拖动期间不打断用户操作 */
  useEffect(() => {
    if (!isDragging) {
      targetRef.current = realPercent;
    }
  }, [realPercent, isDragging]);

  /* 主循环：平滑插值 + 写入 Animated.Value，对应用户代码的 update() */
  useEffect(() => {
    let id: number | null = null;
    function tick() {
      currentRef.current += (targetRef.current - currentRef.current) * 0.15;
      const x = currentRef.current * SHIP_TRAVEL_RANGE;
      const v = velocityRef.current;
      if (
        playing ||
        isDragging ||
        Math.abs(targetRef.current - currentRef.current) > 0.0005 ||
        v > 0.1
      ) {
        setRenderFrame({
            shipX: TUBE_GROUP_X + TUBE_PADDING + x,
          fillWidth: x,
          velocity: v,
          scaleX: 1 + v / 5000,
          skewY: (targetRef.current - currentRef.current) * 50,
        });
      }
      if (!isDragging) {
        velocityRef.current *= 0.95;
        if (velocityRef.current < 0.1) velocityRef.current = 0;
      }
      if (dustRef.current.length > 0) {
        const nextDust = dustRef.current
          .map((item) => ({
            ...item,
            x: item.x + item.vx,
            y: item.y + item.vy,
            opacity: item.opacity - 0.035,
          }))
          .filter((item) => item.opacity > 0);
        dustRef.current = nextDust;
        setDust(nextDust);
      }
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => {
      if (id != null) cancelAnimationFrame(id);
    };
  }, [isDragging, playing]);

  /* 喷射火焰呼吸：对应用户代码 animate width 10↔25 / opacity 1↔0.5，0.1s 周期 */
  useEffect(() => {
    if (!playing && !isDragging) {
      thrusterWidthAnim.setValue(10);
      thrusterOpacityAnim.setValue(0.45);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(thrusterWidthAnim, {
            toValue: 25,
            duration: 100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(thrusterOpacityAnim, {
            toValue: 0.5,
            duration: 100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(thrusterWidthAnim, {
            toValue: 10,
            duration: 100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(thrusterOpacityAnim, {
            toValue: 1,
            duration: 100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isDragging, playing, thrusterOpacityAnim, thrusterWidthAnim]);

  /* 把容器内的 localX 折算到 [0,1]，再写回 target + 上报 onSeek */
  function seekByLocalX(localX: number) {
    if (!onSeek) return;
    if (!Number.isFinite(localX) || containerWidth <= 0 || duration <= 0) return;
    const localSvgX = (localX / containerWidth) * TUBE_VIEWBOX_W;
    const ratio = Math.max(0, Math.min(1, (localSvgX - TUBE_GROUP_X) / TUBE_TRACK_W));
    const localTrackX = ratio * SHIP_TRAVEL_RANGE;
    const now = Date.now();
    const dt = (now - lastMoveRef.current.time) / 1000;
    if (dt > 0) {
      velocityRef.current = Math.abs(localTrackX - lastMoveRef.current.x) / dt;
      lastMoveRef.current = { x: localTrackX, time: now };
    }
    if (velocityRef.current > 100) {
      const nextDust: DustParticle = {
        id: dustIdRef.current,
        x: TUBE_GROUP_X + TUBE_PADDING + localTrackX,
        y: TUBE_GROUP_Y + 20 + Math.random() * 20,
        size: 4 + Math.random() * 6,
        color: Math.random() > 0.5 ? '#A020F0' : '#00FFFF',
        vx: -3 - Math.random() * 4,
        vy: Math.random() * 2 - 1,
        opacity: 0.8,
      };
      dustIdRef.current += 1;
      const nextDustItems = [...dustRef.current.slice(-DUST_LIMIT), nextDust];
      dustRef.current = nextDustItems;
      setDust(nextDustItems);
    }
    targetRef.current = ratio;
    onSeek(ratio * duration);
  }

  function handleTouch(e: GestureResponderEvent) {
    const { locationX, pageX } = e.nativeEvent;
    if (Number.isFinite(locationX)) {
      seekByLocalX(locationX);
      return;
    }
    const origin = dragOriginRef.current;
    if (!origin || !Number.isFinite(pageX)) return;
    seekByLocalX(origin.localX + (pageX - origin.pageX));
  }

  function handleStart(e: GestureResponderEvent) {
    const { locationX, pageX } = e.nativeEvent;
    setIsDragging(true);
    if (Number.isFinite(locationX) && Number.isFinite(pageX)) {
      dragOriginRef.current = { pageX, localX: locationX };
    }
    handleTouch(e);
  }

  /*
   * 飞船像素图：viewBox 0 0 40 24，渲染尺寸 60x34（scale 1.5x / 1.4167x）
   * 直接计算放大后坐标，避免嵌套 Svg
   */
  const shipScaleX = 1.5;
  const shipScaleY = 34 / 24;
  const shipOriginX = -10;
  const shipOriginY = 13;
  const percentLabel = `${(currentRef.current * 100).toFixed(2)}%`;
  const timeLabel = `${formatTime(position)} / ${formatTime(duration)}`;

  return (
    <View>
      <View
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !!onSeek}
        onMoveShouldSetResponder={() => !!onSeek}
        onResponderGrant={handleStart}
        onResponderMove={handleTouch}
        onResponderRelease={(e) => {
          handleTouch(e);
          dragOriginRef.current = null;
          setIsDragging(false);
        }}
          style={{ width: '100%', height: TUBE_DISPLAY_HEIGHT }}
      >
        <Svg
          width="100%"
          height={TUBE_DISPLAY_HEIGHT}
          viewBox={`0 0 ${TUBE_VIEWBOX_W} ${TUBE_VIEWBOX_H}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible' }}
        >
          <Defs>
            <LinearGradient id="tubeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0" stopColor="#001a1a" />
              <Stop offset="0.5" stopColor="#004d4d" />
              <Stop offset="1" stopColor="#001a1a" />
            </LinearGradient>
          </Defs>

          <G x={TUBE_GROUP_X} y={TUBE_GROUP_Y}>
            {/* 导管背景：rgba(255,255,255,0.05) + cyan 边框 */}
            <Rect
              x={0}
              y={0}
              width={TUBE_TRACK_W}
              height={TUBE_TRACK_H}
              rx={4}
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(0,255,255,0.2)"
              strokeWidth={2}
            />

            {/* 霓虹光导管：tubeGradient 填充 */}
            <Rect
              x={TUBE_PADDING}
              y={TUBE_PADDING}
              width={TUBE_INNER_W}
              height={TUBE_INNER_H}
              rx={2}
              fill="url(#tubeGradient)"
            />

            {/* 电荷粒子流 */}
            <ChargeParticles active={playing || isDragging} trackKey={trackKey} />

            {/* 进度填充层：cyan / opacity 0.3 */}
            <Rect
              x={TUBE_PADDING}
              y={TUBE_PADDING}
              width={renderFrame.fillWidth}
              height={TUBE_INNER_H}
              rx={2}
              fill="#00FFFF"
              opacity={playing || isDragging ? 0.32 : 0.22}
            />
          </G>

          {dust.map((item) => (
            <Rect
              key={item.id}
              x={item.x}
              y={item.y}
              width={item.size}
              height={item.size}
              fill={item.color}
              opacity={item.opacity}
            />
          ))}

          {/* 进度头：像素飞船 + 喷射火焰 */}
          <G
            transform={`translate(${renderFrame.shipX} ${TUBE_GROUP_Y}) scale(${renderFrame.scaleX} 1) skewY(${renderFrame.skewY})`}
          >
            {/* 喷射火焰：紫色（呼吸 width / opacity） */}
            <AnimatedRect
              x={-20}
              y={20}
              width={thrusterWidthAnim}
              height={10}
              fill="#A020F0"
              opacity={thrusterOpacityAnim}
            />
            {/* 喷射火焰：白色内焰 */}
            <Rect x={-15} y={22} width={10} height={6} fill="#ffffff" />

            {/* 飞船主体：从 viewBox 40x24 等比放大到 60x34 */}
            <G x={shipOriginX} y={shipOriginY}>
              <Rect
                x={0 * shipScaleX}
                y={8 * shipScaleY}
                width={8 * shipScaleX}
                height={8 * shipScaleY}
                fill="#00FFFF"
              />
              <Rect
                x={8 * shipScaleX}
                y={4 * shipScaleY}
                width={24 * shipScaleX}
                height={16 * shipScaleY}
                fill="#ffffff"
              />
              <Rect
                x={32 * shipScaleX}
                y={8 * shipScaleY}
                width={8 * shipScaleX}
                height={8 * shipScaleY}
                fill="#00FFFF"
              />
              <Rect
                x={12 * shipScaleX}
                y={8 * shipScaleY}
                width={4 * shipScaleX}
                height={4 * shipScaleY}
                fill="#000000"
              />
            </G>
          </G>
        </Svg>
      </View>

      <View style={{ marginTop: -26, paddingLeft: 0 }}>
        <View className="flex-row items-center">
          <Text className="font-pixel text-xs tracking-pixel" style={{ color: '#00FFFF' }}>
            COORDINATES:
          </Text>
          <Text className="font-pixel text-xs tracking-pixel ml-6" style={{ color: '#ffffff' }}>
            X: {percentLabel}
          </Text>
        </View>
        <View className="flex-row items-center mt-2">
          <Text className="font-pixel text-xs tracking-pixel" style={{ color: '#00FFFF' }}>
            TIME:
          </Text>
          <Text className="font-pixel text-xs tracking-pixel ml-9" style={{ color: '#ffffff' }}>
            {timeLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function NowPlayingBar({
  title,
  artist,
  state,
  trackKey,
  playing = true,
  position: controlledPosition,
  startPosition = 0,
  duration = 0,
  showWaveform = true,
  onSeek,
}: NowPlayingBarProps) {
  /* 内部 position：仅在没传 controlledPosition 时使用 */
  const [internalPosition, setInternalPosition] = useState(startPosition);

  /* startPosition 变化时同步内部 position（外部切歌的兜底场景） */
  useEffect(() => {
    if (controlledPosition === undefined) {
      setInternalPosition(startPosition);
    }
  }, [startPosition, controlledPosition]);

  /* 仅在非受控且 playing 时启动 1Hz 计时器；受控模式下完全交给外部驱动 */
  useEffect(() => {
    if (controlledPosition !== undefined) return;
    if (!playing) return;
    const id = setInterval(() => {
      setInternalPosition((p) => {
        if (duration > 0 && p >= duration) return p;
        return p + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, duration, controlledPosition]);

  /* 实际渲染用的 position：受控优先，否则用内部计时 */
  const position = controlledPosition ?? internalPosition;
  const stateText = state ?? (playing ? 'PLAYING' : 'PAUSED');
  const progressTrackKey = trackKey ?? `${title}:${artist ?? ''}`;

  return (
    <View className="px-4 py-3 border-y border-line">
      {/* 第一行：频谱条 + 曲名艺人 + 状态 */}
      <View className="flex-row items-center" style={{ gap: 12 }}>
        {showWaveform ? <WaveformBars active={playing} /> : null}
        <View
          className="flex-1"
          style={{
            alignItems: 'center',
            marginBottom: 80,
            zIndex: 10,
          }}
        >
          <Text
            className="font-pixel tracking-pixel"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: '#00ff9d',
              fontSize: 28,
              marginBottom: 15,
              letterSpacing: 2,
              textShadowColor: 'rgba(0,255,157,0.6)',
              textShadowRadius: 20,
            }}
          >
            {title}
          </Text>
          {artist ? (
            <Text
              className="font-pixel text-muted text-xs tracking-pixel"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                letterSpacing: 6,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {artist}
            </Text>
          ) : null}
          <Text className="font-pixel text-muted text-xs tracking-pixel">{stateText}</Text>
        </View>
      </View>

      {/* 第二行：像素飞船霓虹管道进度条 + 时间 */}
      <View className="mt-3">
        <PixelShipProgressBar
          position={position}
          duration={duration}
          playing={playing}
          trackKey={progressTrackKey}
          onSeek={onSeek}
        />
      </View>
    </View>
  );
}
