/*
 * 组件：TrackArtworkPanel
 * ----------------------
 * 作用：展示当前歌曲封面，并用轻量叠层营造像素电台质感。
 * 设计原则：
 *   - 不在客户端做真实图片像素化处理，避免 4G 网络与低端设备上的 CPU / 内存压力。
 *   - 封面加载失败时返回 null，由页面保留原时钟占位作为稳定回退。
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';

export interface TrackArtworkPanelProps {
  /* 封面图片地址，来自服务端 Track.artwork */
  artwork?: string;
  /* 当前歌曲名，用于无障碍描述与底部标签 */
  title: string;
  /* 当前艺人名 */
  artist?: string;
  /* 是否正在播放，用于左上角信号灯状态 */
  playing?: boolean;
  /* 图片加载失败回调，页面可据此切回时钟占位 */
  onArtworkError?: () => void;
  /* 面板尺寸，移动端建议 220，宽屏建议 260 */
  size?: number;
}

const DEFAULT_SIZE = 220;
const MIN_SIZE = 160;
const MAX_SIZE = 280;
const GRID_LINE_COUNT = 7;

/*
 * 限制封面尺寸，避免调用方传入异常尺寸导致首屏布局被撑破。
 */
function clampPanelSize(size: number | undefined): number {
  if (!Number.isFinite(size)) return DEFAULT_SIZE;
  return Math.min(Math.max(size ?? DEFAULT_SIZE, MIN_SIZE), MAX_SIZE);
}

/*
 * 生成固定网格线索引。
 * 网格只用于视觉叠层，不参与交互，也不会跟随音频状态高频重绘。
 */
function createGridLineIndexes(): number[] {
  return Array.from({ length: GRID_LINE_COUNT }, (_, index) => index + 1);
}

export function TrackArtworkPanel({
  artwork,
  title,
  artist,
  playing = false,
  onArtworkError,
  size = DEFAULT_SIZE,
}: TrackArtworkPanelProps) {
  /* 记录当前失败 URL，防止 404 图片在同一首歌内反复请求。 */
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const panelSize = clampPanelSize(size);
  const gridLineIndexes = useMemo(createGridLineIndexes, []);
  const activeArtwork = artwork && failedArtworkUrl !== artwork ? artwork : null;
  const webPixelatedStyle =
    Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as ImageStyle) : undefined;

  useEffect(() => {
    setFailedArtworkUrl(null);
  }, [artwork]);

  if (!activeArtwork) return null;

  /*
   * 图片错误只影响封面显示，不影响播放与其它 UI。
   */
  function handleArtworkError() {
    setFailedArtworkUrl(activeArtwork);
    onArtworkError?.();
  }

  return (
    <View
      accessibilityLabel={`${title}${artist ? `, ${artist}` : ''}`}
      accessibilityRole="image"
      style={{
        width: panelSize,
        height: panelSize,
        borderWidth: 1,
        borderColor: 'rgba(0,255,157,0.36)',
        backgroundColor: '#050707',
        overflow: 'hidden',
      }}
    >
      <Image
        source={{ uri: activeArtwork }}
        onError={handleArtworkError}
        resizeMode="cover"
        style={[
          {
            width: '100%',
            height: '100%',
          },
          webPixelatedStyle,
        ]}
      />

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 255, 157, 0.08)',
        }}
      />

      {gridLineIndexes.map((line) => {
        const offset = `${(line / (GRID_LINE_COUNT + 1)) * 100}%` as ViewStyle['left'];
        const verticalStyle: ViewStyle = {
          position: 'absolute',
          left: offset,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: 'rgba(0,255,157,0.08)',
        };
        const horizontalStyle: ViewStyle = {
          position: 'absolute',
          left: 0,
          right: 0,
          top: offset,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.06)',
        };

        return (
          <View key={`grid-${line}`} pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
            <View style={verticalStyle} />
            <View style={horizontalStyle} />
          </View>
        );
      })}

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 7,
            height: 7,
            marginRight: 6,
            backgroundColor: playing ? '#00ff9d' : 'rgba(255,255,255,0.35)',
          }}
        />
        <Text
          className="font-pixel"
          style={{
            color: '#00ff9d',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          COVER_LOCK
        </Text>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 10,
          paddingVertical: 9,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0,255,157,0.26)',
          backgroundColor: 'rgba(0,0,0,0.66)',
        }}
      >
        <Text
          className="font-pixel"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: '#f5f7f7',
            fontSize: 13,
            letterSpacing: 1,
          }}
        >
          {title}
        </Text>
        {artist ? (
          <Text
            className="font-pixel"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              marginTop: 5,
              color: 'rgba(255,255,255,0.55)',
              fontSize: 9,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            {artist}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
