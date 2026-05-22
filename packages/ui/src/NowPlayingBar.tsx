/*
 * 组件：NowPlayingBar
 * ------------------
 * 作用：只负责展示当前歌曲标题、艺人和状态文字。
 * 说明：
 *   - 进度条已按 2026-05-22 动画架构升级 Spec 抽离到独立 PlaybackProgressBar
 *   - 这里保留信息区，避免标题下方再被旧进度条结构撑出大面积空白
 */

import { Text, View } from 'react-native';

export interface NowPlayingBarProps {
  /* 曲名，例如 "Late Night Drive" */
  title: string;
  /* 艺术家名称 */
  artist?: string;
  /* 外部显式状态文字 */
  state?: string;
  /* 当前是否播放，用于未传 state 时推导默认文案 */
  playing?: boolean;
}

export function NowPlayingBar({
  title,
  artist,
  state,
  playing = true,
}: NowPlayingBarProps) {
  /* 状态文案优先使用外部传入，否则根据播放态生成。 */
  const stateText = state ?? (playing ? 'PLAYING' : 'PAUSED');

  return (
    <View className="px-4 pt-3 pb-2 border-y border-line">
      <View className="items-center">
        <Text
          className="font-pixel tracking-pixel"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: '#00ff9d',
            fontSize: 28,
            marginBottom: 10,
            letterSpacing: 2,
            textShadowColor: 'rgba(0,255,157,0.6)',
            textShadowRadius: 20,
          }}
        >
          {title}
        </Text>
        {artist ? (
          <Text
            className="font-pixel text-xs tracking-pixel"
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
        <Text className="font-pixel text-muted text-xs tracking-pixel mt-1">{stateText}</Text>
      </View>
    </View>
  );
}
