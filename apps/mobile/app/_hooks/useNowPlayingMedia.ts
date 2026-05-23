/*
 * Hook：useNowPlayingMedia
 * ------------------------
 * 把当前电台曲目绑定到 expo-audio 的锁屏 / 系统媒体会话。
 * 页面层只传入最小 player 边界与曲目信息，具体锁屏副作用集中在这里维护。
 */

import { useEffect, useMemo } from 'react';
import type { AudioLockScreenOptions, AudioMetadata } from 'expo-audio';
import type { RadioLockScreenPlayer, RadioTrack } from './useRadioPlayer';

interface NowPlayingMediaInput {
  /* useRadioPlayer 暴露的最小锁屏播放器边界 */
  player: RadioLockScreenPlayer;
  /* 当前播放曲目，用于锁屏 metadata */
  track: RadioTrack;
  /* 是否启用系统媒体会话；无可播放曲目时传 false */
  active: boolean;
}

/* 锁屏展示的默认专辑名，帮助系统媒体中心保持品牌归属。 */
const LOCK_SCREEN_ALBUM_TITLE = 'Claudio Radio';

/*
 * 锁屏控制策略。
 * expo-audio 当前暴露的是 play / pause / seek 控制，不提供真正的下一曲回调；
 * 因此这里隐藏 seek forward/back，避免把 10s 快进误表现成下一首。
 */
const LOCK_SCREEN_OPTIONS: AudioLockScreenOptions = {
  showSeekForward: false,
  showSeekBackward: false,
  isLiveStream: false,
};

/*
 * 清洗展示文本。
 * 锁屏 metadata 不应该出现空字符串；服务端字段缺失时使用稳定兜底。
 */
function normalizeText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/*
 * 生成 expo-audio 锁屏 metadata。
 * 只传入系统支持的字段，避免把 UI 专用字段泄露到媒体会话层。
 */
function buildMetadata(track: RadioTrack): AudioMetadata {
  const metadata: AudioMetadata = {
    title: normalizeText(track.title, LOCK_SCREEN_ALBUM_TITLE),
    artist: normalizeText(track.artist, 'Claudio'),
    albumTitle: LOCK_SCREEN_ALBUM_TITLE,
  };

  const artworkUrl = track.artwork?.trim();
  if (artworkUrl) {
    metadata.artworkUrl = artworkUrl;
  }

  return metadata;
}

/*
 * 执行锁屏副作用并保护主播放链路。
 * 锁屏控制失败不应该中断音乐播放；错误保留在开发日志里便于真机排查。
 */
function runLockScreenOperation(action: string, operation: () => void): void {
  try {
    operation();
  } catch (error) {
    console.warn(`[audio] ${action} failed`, error);
  }
}

/*
 * Hook 主体：激活 player，并在曲目信息变化时更新 metadata。
 * 清理函数会释放系统媒体会话，避免旧 player 在切歌或卸载后继续占用锁屏。
 */
export function useNowPlayingMedia({ player, track, active }: NowPlayingMediaInput): void {
  const metadata = useMemo(
    () => buildMetadata(track),
    [track.artist, track.artwork, track.title],
  );

  useEffect(() => {
    if (!active || !track.url) {
      runLockScreenOperation('clearLockScreenControls', () => {
        player.clearLockScreenControls();
      });
      return undefined;
    }

    runLockScreenOperation('setActiveForLockScreen', () => {
      player.setActiveForLockScreen(true, undefined, LOCK_SCREEN_OPTIONS);
    });

    return () => {
      runLockScreenOperation('clearLockScreenControls', () => {
        player.clearLockScreenControls();
      });
    };
  }, [active, player, track.url]);

  useEffect(() => {
    if (!active || !track.url) return;

    runLockScreenOperation('updateLockScreenMetadata', () => {
      player.updateLockScreenMetadata(metadata);
    });
  }, [active, metadata, player, track.url]);
}
