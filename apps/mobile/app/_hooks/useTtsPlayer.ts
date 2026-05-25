/*
 * Hook：useTtsPlayer
 * ------------------
 * Phase E：与 useRadioPlayer 完全隔离的独立 expo-audio 实例，专用于播放 TTS 音频。
 *   - play(url)：换源并立即播放；同一 url 重播会自动 seekTo(0)
 *   - stop()：暂停并回到 0 秒
 *   - playing：是否正在播放
 *   - 音乐 ducking 由 index.tsx 在 playing 切换时通过 radio.setVolume 控制
 *   - 不复用 useRadioPlayer 的实例，避免 DJ 一开口就打断当前歌曲
 */

import { useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface TtsPlayerState {
  /* 是否正在播放 TTS。 */
  playing: boolean;
  /* 是否已经加载过可继续播放的 TTS。 */
  ready: boolean;
  /* 当前已加载的 url；未播放过时为 null。 */
  currentUrl: string | null;
}

export interface TtsPlayerActions {
  /* 播放指定 url；若已是同一 url 则从头重播。 */
  play: (url: string) => void;
  /* 从当前位置继续播放。 */
  resume: () => void;
  /* 暂停但保留当前位置。 */
  pause: () => void;
  /* 播放 / 暂停切换，暂停后再次点击会从当前位置继续。 */
  toggle: () => void;
  /* 停止并回到 0 秒。 */
  stop: () => void;
}

/* 占位 url，避免 expo-audio 在没有源时反复抛错。 */
const PLACEHOLDER_SOURCE: AudioSource = { uri: '' };

/*
 * 创建一个独立的 TTS 播放器。
 * url 通过 useState 驱动 useMemo 重建 source；同一 url 通过 seekTo(0) 重播。
 */
export function useTtsPlayer(): TtsPlayerState & TtsPlayerActions {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  /* 重播计数：在外部要求重播同一 url 时递增，配合 useEffect 中的 url+nonce 触发重新 play。 */
  const [replayNonce, setReplayNonce] = useState(0);

  const source = useMemo<AudioSource>(
    () => (currentUrl ? { uri: currentUrl } : PLACEHOLDER_SOURCE),
    [currentUrl],
  );
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const ready = Boolean(currentUrl) && status.isLoaded && !status.didJustFinish;

  /*
   * url 或 replayNonce 变化时，从头开始播。
   * 重置 seek 之后再 play 可避免上次留下的进度残留导致直接进入 ended。
   */
  useEffect(() => {
    if (!currentUrl) return;
    void player.seekTo(0).then(() => {
      player.play();
    });
  }, [currentUrl, player, replayNonce]);

  const play = useCallback((url: string) => {
    if (!url) return;
    setCurrentUrl((prev) => {
      if (prev === url) {
        /* 同一 url 通过 nonce 触发重播。 */
        setReplayNonce((value) => value + 1);
        return prev;
      }
      return url;
    });
  }, []);

  const resume = useCallback(() => {
    if (!currentUrl || status.didJustFinish) return;
    player.play();
  }, [currentUrl, player, status.didJustFinish]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const toggle = useCallback(() => {
    if (!currentUrl || status.didJustFinish) return;
    if (status.playing) {
      player.pause();
      return;
    }
    player.play();
  }, [currentUrl, player, status.didJustFinish, status.playing]);

  const stop = useCallback(() => {
    player.pause();
    void player.seekTo(0);
  }, [player]);

  return {
    playing: status.playing && !status.didJustFinish,
    ready,
    currentUrl,
    play,
    resume,
    pause,
    toggle,
    stop,
  };
}
