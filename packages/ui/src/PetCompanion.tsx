/*
 * 组件：PetCompanion
 * ------------------
 * Claudio 的可删除系统伴侣 prototype。
 * 它通过角色本体部件变化表达状态，不使用贴图漂浮伪装生命感。
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { derivePetCompanionState } from './pet/petBrain';
import type {
  PetCompanionLifeState,
  PetCompanionPresenceTone,
  PetCompanionState,
} from './pet/petTypes';

export interface PetCompanionProps {
  /* Claudio 生命状态。 */
  lifeState: PetCompanionLifeState;
  /* L.5 presence 派生出的视觉语气。 */
  presenceTone: PetCompanionPresenceTone;
  /* 是否正在听歌。 */
  listening: boolean;
  /* 是否正在说话。 */
  speaking: boolean;
  /* 是否正在调频。 */
  thinking: boolean;
  /* 顶部安全区。 */
  topInset?: number;
  /* 距离底部输入区的避让距离。 */
  bottomOffset?: number;
}

const PET_WIDTH = 118;
const PET_HEIGHT = 142;
const EDGE_PADDING = 16;

/*
 * Claudio 伴侣主体。
 * 高频拖拽和呼吸走 shared value；React state 只记录拖拽 / 收起 / 关闭等低频状态。
 */
export function PetCompanion({
  lifeState,
  presenceTone,
  listening,
  speaking,
  thinking,
  topInset = 0,
  bottomOffset = 104,
}: PetCompanionProps) {
  const { width, height } = useWindowDimensions();
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const breath = useSharedValue(0);

  const petState = derivePetCompanionState({
    lifeState,
    presenceTone,
    listening,
    speaking,
    thinking,
    dragging,
  });
  const bounds = useMemo(
    () => ({
      minX: -Math.max(0, width - PET_WIDTH - EDGE_PADDING * 2),
      maxX: 0,
      minY: -Math.max(0, height - PET_HEIGHT - bottomOffset - topInset - EDGE_PADDING),
      maxY: 0,
    }),
    [bottomOffset, height, topInset, width],
  );

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: petState === 'sleep' ? 2400 : 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [breath, petState]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: collapsed ? 0.74 : 1 },
    ],
    opacity: hidden ? 0 : 1,
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 + breath.value * 4 }],
  }));

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setDragging)(true);
    })
    .onUpdate((event) => {
      translateX.value = clamp(event.translationX, bounds.minX, bounds.maxX);
      translateY.value = clamp(event.translationY, bounds.minY, bounds.maxY);
    })
    .onEnd(() => {
      const snapX = translateX.value < bounds.minX / 2 ? bounds.minX : bounds.maxX;
      translateX.value = withTiming(snapX, { duration: 220, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(clamp(translateY.value, bounds.minY, bounds.maxY), {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
      runOnJS(setDragging)(false);
    });

  if (hidden) return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            right: EDGE_PADDING,
            bottom: bottomOffset,
            width: PET_WIDTH,
            height: PET_HEIGHT,
            zIndex: 20,
          },
          containerStyle,
        ]}
      >
        <View style={{ alignItems: 'flex-end' }}>
          <View className="flex-row border border-line bg-bg mb-1">
            <Pressable onPress={() => setCollapsed((value) => !value)} className="px-2 py-1">
              <Text className="font-pixel text-muted" style={{ fontSize: 10 }}>
                {collapsed ? 'OPEN' : 'HIDE'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setHidden(true)} className="px-2 py-1 border-l border-line">
              <Text className="font-pixel text-muted" style={{ fontSize: 10 }}>
                X
              </Text>
            </Pressable>
          </View>
        </View>

        {collapsed ? (
          <View className="border border-line bg-panel px-2 py-2">
            <Text className="font-pixel text-text tracking-pixel" style={{ fontSize: 10 }}>
              SIGNAL KEEPER
            </Text>
          </View>
        ) : (
          <Animated.View style={bodyStyle}>
            <SignalKeeperRig state={petState} tone={presenceTone} />
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

interface SignalKeeperRigProps {
  state: PetCompanionState;
  tone: PetCompanionPresenceTone;
}

/*
 * 分层角色 rig。
 * 每个状态至少改变眼睛、嘴、天线、身体重心或信号灯之一，保证不是外层容器晃动。
 */
const SignalKeeperRig = memo(function SignalKeeperRig({ state, tone }: SignalKeeperRigProps) {
  const palette = resolvePetPalette(tone);
  const pose = resolvePetPose(state);

  return (
    <View className="border border-line bg-panel" style={{ width: PET_WIDTH, height: PET_HEIGHT }}>
      <Svg width={PET_WIDTH} height={PET_HEIGHT} viewBox="0 0 118 142">
        <Line
          x1="59"
          y1={18 + pose.antennaDrop}
          x2="59"
          y2="4"
          stroke={palette.accent}
          strokeWidth="3"
        />
        <Circle cx="59" cy="4" r={state === 'listen' ? 4 : 3} fill={palette.live} />
        <Path
          d={`M30 ${42 + pose.headY} Q59 ${24 + pose.headY} 88 ${42 + pose.headY} L84 ${78 + pose.bodyY} Q59 ${92 + pose.bodyY} 34 ${78 + pose.bodyY} Z`}
          fill={palette.body}
          stroke={palette.accent}
          strokeWidth="2"
        />
        <Rect x="25" y={54 + pose.bodyY} width="10" height="30" fill={palette.muted} />
        <Rect x="83" y={54 + pose.bodyY} width="10" height="30" fill={palette.muted} />
        <Circle cx="38" cy={52 + pose.headY} r="11" fill="#050505" stroke={palette.line} strokeWidth="2" />
        <Circle cx="80" cy={52 + pose.headY} r="11" fill="#050505" stroke={palette.line} strokeWidth="2" />
        {renderEyes(state, pose, palette)}
        {renderMouth(state, pose, palette)}
        <Rect
          x="43"
          y={86 + pose.bodyY}
          width="32"
          height="22"
          fill="#050505"
          stroke={palette.line}
          strokeWidth="2"
        />
        {renderSignalBars(state, palette)}
        <Path
          d={`M36 ${104 + pose.bodyY} Q26 ${116 + pose.armLift} 20 ${103 + pose.armLift}`}
          stroke={palette.accent}
          strokeWidth="4"
          fill="none"
          strokeLinecap="square"
        />
        <Path
          d={`M82 ${104 + pose.bodyY} Q92 ${116 + pose.armLift} 98 ${103 + pose.armLift}`}
          stroke={palette.accent}
          strokeWidth="4"
          fill="none"
          strokeLinecap="square"
        />
        <Rect x="35" y="120" width="18" height="5" fill={palette.muted} />
        <Rect x="65" y="120" width="18" height="5" fill={palette.muted} />
      </Svg>
    </View>
  );
});

/* 绘制状态化眼睛。 */
function renderEyes(
  state: PetCompanionState,
  pose: ReturnType<typeof resolvePetPose>,
  palette: ReturnType<typeof resolvePetPalette>,
) {
  if (state === 'sleep') {
    return (
      <>
        <Line x1="34" y1={54 + pose.headY} x2="44" y2={54 + pose.headY} stroke={palette.accent} strokeWidth="3" />
        <Line x1="74" y1={54 + pose.headY} x2="84" y2={54 + pose.headY} stroke={palette.accent} strokeWidth="3" />
      </>
    );
  }
  const eyeHeight = state === 'look' ? 8 : state === 'speak' ? 13 : 11;
  const eyeWidth = state === 'look' || state === 'drag' ? 9 : 7;
  return (
    <>
      <Rect x={35 + pose.eyeShift} y={49 + pose.headY} width={eyeWidth} height={eyeHeight} fill={palette.accent} />
      <Rect x={76 + pose.eyeShift} y={49 + pose.headY} width={eyeWidth} height={eyeHeight} fill={palette.accent} />
    </>
  );
}

/* 绘制状态化嘴型。 */
function renderMouth(
  state: PetCompanionState,
  pose: ReturnType<typeof resolvePetPose>,
  palette: ReturnType<typeof resolvePetPalette>,
) {
  if (state === 'speak') {
    return <Rect x="53" y={66 + pose.headY} width="12" height="10" fill={palette.live} />;
  }
  if (state === 'sleep') {
    return <Line x1="52" y1={68 + pose.headY} x2="66" y2={68 + pose.headY} stroke={palette.muted} strokeWidth="2" />;
  }
  return <Path d={`M51 ${67 + pose.headY} Q59 ${72 + pose.headY} 67 ${67 + pose.headY}`} stroke={palette.live} strokeWidth="2" fill="none" />;
}

/* 绘制胸口信号柱。 */
function renderSignalBars(state: PetCompanionState, palette: ReturnType<typeof resolvePetPalette>) {
  const heights = state === 'listen' ? [8, 16, 11] : state === 'speak' ? [14, 9, 16] : [6, 10, 7];
  return heights.map((height, index) => (
    <Rect
      key={`pet-signal-${index}`}
      x={48 + index * 9}
      y={103 - height}
      width="5"
      height={height}
      fill={index === 1 ? palette.live : palette.accent}
    />
  ));
}

/* 状态到角色姿态。 */
function resolvePetPose(state: PetCompanionState) {
  if (state === 'drag') return { headY: -6, bodyY: -2, antennaDrop: -3, armLift: -10, eyeShift: -2 };
  if (state === 'listen') return { headY: 2, bodyY: 1, antennaDrop: 1, armLift: -4, eyeShift: 0 };
  if (state === 'speak') return { headY: -1, bodyY: 0, antennaDrop: 0, armLift: -6, eyeShift: 1 };
  if (state === 'sleep') return { headY: 7, bodyY: 5, antennaDrop: 5, armLift: 4, eyeShift: 0 };
  if (state === 'look') return { headY: -3, bodyY: 0, antennaDrop: -1, armLift: -3, eyeShift: -1 };
  return { headY: 0, bodyY: 0, antennaDrop: 0, armLift: 0, eyeShift: 0 };
}

/* presence 语气到角色配色。 */
function resolvePetPalette(tone: PetCompanionPresenceTone) {
  if (tone === 'celebration') {
    return { body: '#10251b', accent: '#00ff88', live: '#ff3355', line: '#2cff9a', muted: '#1f2f29' };
  }
  if (tone === 'soft-hold' || tone === 'wind-down') {
    return { body: '#101816', accent: '#8fd9bf', live: '#c36b87', line: '#2a3a35', muted: '#141d1a' };
  }
  if (tone === 'focus-flow') {
    return { body: '#07130f', accent: '#00d18a', live: '#66ffd0', line: '#18352b', muted: '#0c1c17' };
  }
  return { body: '#0a0a0a', accent: '#00ff88', live: '#ff3355', line: '#1f1f1f', muted: '#151515' };
}

/* 数值夹取。 */
function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}
