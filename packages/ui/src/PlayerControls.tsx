/*
 * 组件：PlayerControls
 * 作用：8 个霓虹玻璃控件按钮（上一曲 / 暂停 / 下一曲 / 停止 / 喜欢 / 隐藏 / 收藏 / 音量）
 * 设计：前三个核心播放按钮采用用户提供 SVG；尺寸按当前系统控制栏重新评估。
 *      玻璃面板、弥散阴影、按压缩放、点击涟漪和主播放按钮呼吸来自用户提供的动画方向。
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type PlayerControlAction = 'prev' | 'playPause' | 'next' | 'stop' | 'like' | 'hide' | 'fav' | 'volume';

export interface PlayerControlsProps {
  /* 是否在播放，影响 PLAY/PAUSE 切换 */
  playing?: boolean;
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
  const ripple = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!primary || !active) {
      breathe.stopAnimation();
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, breathe, primary]);

  function handlePress() {
    if (!onPress) return;
    ripple.setValue(0);
    Animated.timing(ripple, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    onFeedback?.();
    onPress();
  }

  const buttonSize = primary ? 64 : icon ? 44 : 42;
  const rippleScale = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1.5],
  });
  const rippleOpacity = ripple.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.9, 0],
  });
  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });
  const breatheOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  return (
    <View style={{ width: buttonSize, height: buttonSize, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: '#00ff88',
          opacity: active || hovered ? breatheOpacity : 0,
          shadowColor: '#00ff88',
          shadowOpacity: active || hovered ? 0.5 : 0,
          shadowRadius: primary ? 24 : 16,
          transform: [{ scale: breatheScale }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          borderWidth: 2,
          borderColor: '#00ff88',
          opacity: rippleOpacity,
          transform: [{ scale: rippleScale }],
        }}
      />
      <Pressable
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => ({
          width: buttonSize,
          height: buttonSize,
          borderRadius: primary ? buttonSize / 2 : 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? 'rgba(0,255,136,0.12)' : pressed ? 'rgba(0,255,136,0.08)' : 'transparent',
          opacity: onPress ? 1 : 0.45,
          shadowColor: '#00ff88',
          shadowOpacity: active || hovered ? 0.34 : 0.08,
          shadowRadius: active || hovered ? 18 : 4,
          transform: [{ scale: pressed ? 0.92 : primary ? 1.08 : 1 }],
        })}
      >
        {({ pressed }) =>
          icon ? (
            <View style={{ opacity: pressed ? 0.85 : 1 }}>
              <ControlIcon icon={icon} primary={primary} />
            </View>
          ) : (
            <Text
              className="font-pixel tracking-pixel"
              style={{
                fontSize: 10,
                color: active ? '#d7ffe8' : hovered ? '#e8e8e8' : '#7b827e',
                textShadowColor: active || hovered ? '#00ff88' : 'transparent',
                textShadowRadius: active || hovered ? 8 : 0,
                transform: [{ translateY: pressed ? 1 : 0 }],
              }}
            >
              {label}
            </Text>
          )
        }
      </Pressable>
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
