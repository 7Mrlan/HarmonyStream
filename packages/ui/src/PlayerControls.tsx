/*
 * 组件：PlayerControls
 * 作用：8 个霓虹玻璃控件按钮（上一曲 / 暂停 / 下一曲 / 停止 / 喜欢 / 隐藏 / 收藏 / 音量）
 * 设计：前三个核心播放按钮采用用户提供 SVG；尺寸按当前系统控制栏重新评估。
 *      玻璃面板、弥散阴影、按压缩放、点击涟漪和主播放按钮呼吸来自用户提供的动画方向。
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type PlayerControlAction = 'prev' | 'playPause' | 'next' | 'stop' | 'like' | 'hide' | 'fav' | 'volume';

export interface PlayerControlsProps {
  /* 是否在播放，影响 PLAY/PAUSE 切换 */
  playing?: boolean;
  /* 当前曲目是否已经结束，保留给控制区做 idle 态扩展 */
  ended?: boolean;
  /* 是否已收藏（FAV） */
  faved?: boolean;
  /* 各按钮回调，外部按需注入 */
  onPrev?: () => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  onStop?: () => void;
  onLike?: () => void;
  onHide?: () => void;
  onFav?: () => void;
  onVolume?: () => void;
  onActionFeedback?: (action: PlayerControlAction) => void;
}

interface GlassButtonProps {
  /* 文本按钮标签，非核心播放按钮使用 */
  label?: string;
  /* 用户提供的核心播放 SVG 类型 */
  icon?: 'prev' | 'play' | 'pause' | 'next';
  onPress?: () => void;
  onFeedback?: () => void;
  /* 用于主播放按钮与收藏按钮的激活态 */
  active?: boolean;
  /* 主播放按钮更大但按系统控制栏收敛尺寸 */
  primary?: boolean;
}

/* 子组件：按用户提供 path 绘制上一首 / 播放 / 暂停 / 下一首 SVG */
function ControlIcon({ icon, primary }: { icon: NonNullable<GlassButtonProps['icon']>; primary?: boolean }) {
  if (icon === 'prev') {
    return (
      <Svg width={32} height={32} viewBox="0 0 40 40">
        <Path d="M28 10 L28 30 L16 20 Z" fill="white" />
        <Path d="M16 10 L16 30 L4 20 Z" fill="white" />
        <Rect x={32} y={10} width={3} height={20} fill="white" opacity={0.5} />
      </Svg>
    );
  }

  if (icon === 'next') {
    return (
      <Svg width={32} height={32} viewBox="0 0 40 40">
        <Path d="M12 10 L12 30 L24 20 Z" fill="white" />
        <Path d="M24 10 L24 30 L36 20 Z" fill="white" />
        <Rect x={5} y={10} width={3} height={20} fill="white" opacity={0.5} />
      </Svg>
    );
  }

  return (
    <Svg width={primary ? 56 : 44} height={primary ? 56 : 44} viewBox="0 0 80 80">
      <Circle cx={40} cy={40} r={38} fill="none" stroke="white" strokeWidth={1} opacity={0.3} />
      {icon === 'pause' ? (
        <>
          <Rect x={30} y={25} width={6} height={30} fill="white" />
          <Rect x={44} y={25} width={6} height={30} fill="white" />
        </>
      ) : (
        <Path d="M33 25 L55 40 L33 55 Z" fill="white" />
      )}
    </Svg>
  );
}

/* 子组件：霓虹玻璃按钮，统一处理 hover、press、涟漪和主按钮呼吸 */
function GlassButton({ label, icon, onPress, onFeedback, active, primary }: GlassButtonProps) {
  const [hovered, setHovered] = useState(false);
  const ripple = useSharedValue(0);
  const breathe = useSharedValue(0);
  const hoverProgress = useSharedValue(0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    if (!primary || !active) {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
      return;
    }

    cancelAnimation(breathe);
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 800,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: 800,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(breathe);
    };
  }, [active, breathe, primary]);

  function handlePress() {
    if (!onPress) return;
    onFeedback?.();
    onPress();
  }

  function handlePressIn() {
    cancelAnimation(ripple);
    cancelAnimation(pressProgress);
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    pressProgress.value = withTiming(1, { duration: 45, easing: Easing.out(Easing.quad) });
  }

  function handlePressOut() {
    cancelAnimation(pressProgress);
    pressProgress.value = withTiming(0, { duration: 80, easing: Easing.out(Easing.quad) });
  }

  function handleHoverIn() {
    setHovered(true);
    hoverProgress.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) });
  }

  function handleHoverOut() {
    setHovered(false);
    hoverProgress.value = withTiming(0, { duration: 130, easing: Easing.out(Easing.quad) });
  }

  const buttonSize = primary ? 64 : icon ? 44 : 42;

  /* 用 Reanimated 承接长时间循环动画，避免播放几分钟后 JS 动画队列挤压按钮反馈。 */
  const auraAnimatedStyle = useAnimatedStyle(() => {
    const auraOpacity = active ? 0.18 + breathe.value * 0.24 : hoverProgress.value * 0.22;
    const auraScale = 1 + (active ? breathe.value * 0.05 : hoverProgress.value * 0.03);

    return {
      opacity: auraOpacity,
      shadowOpacity: active || hoverProgress.value > 0 ? 0.5 : 0.08,
      transform: [{ scale: auraScale }],
    };
  });

  /* 点击涟漪只改变透明度和 transform，不触发布局重排。 */
  const rippleAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(ripple.value, [0, 0.12, 1], [0, 0.9, 0]),
      transform: [{ scale: interpolate(ripple.value, [0, 1], [0, 1.5]) }],
    };
  });

  /* 按压缩放同样交给 UI 线程，降低暂停/播放切换时的触感延迟。 */
  const buttonPressAnimatedStyle = useAnimatedStyle(() => {
    const baseScale = primary ? 1.08 : 1;
    const pressedScaleOffset = primary ? 0.16 : 0.08;

    return {
      transform: [{ scale: baseScale - pressProgress.value * pressedScaleOffset }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - pressProgress.value * 0.15,
      transform: [{ translateY: pressProgress.value }],
    };
  });

  return (
    <View style={{ width: buttonSize, height: buttonSize, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            backgroundColor: '#00ff88',
            shadowColor: '#00ff88',
            shadowRadius: primary ? 24 : 16,
          },
          auraAnimatedStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            borderWidth: 2,
            borderColor: '#00ff88',
          },
          rippleAnimatedStyle,
        ]}
      />
      <Animated.View style={buttonPressAnimatedStyle}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onHoverIn={handleHoverIn}
          onHoverOut={handleHoverOut}
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: primary ? buttonSize / 2 : 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? 'rgba(0,255,136,0.12)' : 'transparent',
            opacity: onPress ? 1 : 0.45,
            shadowColor: '#00ff88',
            shadowOpacity: active || hovered ? 0.34 : 0.08,
            shadowRadius: active || hovered ? 18 : 4,
          }}
        >
          <Animated.View style={contentAnimatedStyle}>
            {icon ? (
              <ControlIcon icon={icon} primary={primary} />
            ) : (
              <Text
                className="font-pixel tracking-pixel"
                style={{
                  fontSize: 10,
                  color: active ? '#d7ffe8' : hovered ? '#e8e8e8' : '#7b827e',
                  textShadowColor: active || hovered ? '#00ff88' : 'transparent',
                  textShadowRadius: active || hovered ? 8 : 0,
                }}
              >
                {label}
              </Text>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function PlayerControls({
  playing = false,
  faved = false,
  onPrev,
  onPlayPause,
  onNext,
  onStop,
  onLike,
  onHide,
  onFav,
  onVolume,
  onActionFeedback,
}: PlayerControlsProps) {
  return (
    <View
      className="flex-row items-center mx-4 my-3"
      style={{
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        shadowRadius: 24,
      }}
    >
      <GlassButton icon="prev" onPress={onPrev} onFeedback={() => onActionFeedback?.('prev')} />
      <GlassButton
        icon={playing ? 'pause' : 'play'}
        onPress={onPlayPause}
        onFeedback={() => onActionFeedback?.('playPause')}
        active={playing}
        primary
      />
      <GlassButton icon="next" onPress={onNext} onFeedback={() => onActionFeedback?.('next')} />
      <GlassButton label="□" onPress={onStop} onFeedback={() => onActionFeedback?.('stop')} />
      <GlassButton label="LIKE" onPress={onLike} onFeedback={() => onActionFeedback?.('like')} />
      <GlassButton label="HIDE" onPress={onHide} onFeedback={() => onActionFeedback?.('hide')} />
      <GlassButton label="FAV" onPress={onFav} onFeedback={() => onActionFeedback?.('fav')} active={faved} />
      <GlassButton label="VOL" onPress={onVolume} onFeedback={() => onActionFeedback?.('volume')} />
    </View>
  );
}
