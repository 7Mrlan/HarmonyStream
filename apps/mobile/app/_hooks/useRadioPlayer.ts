/*
 * Hook：useRadioPlayer
 * --------------------
 * 基于 expo-audio 封装的电台播放引擎，统一暴露给 UI 组件消费。
 * 暴露字段刻意贴近 react-native-track-player 的语义，未来若叠加原生
 * 锁屏播控，UI 层无需改动 — 只需在此 Hook 内桥接两套 API。
 *
 * 设计：
 *   - 受控播放：playing / position / duration 全部由 Hook 维护
 *   - load(track) 支持运行时换源（当前曲目对象包含 url / title / artist）
 *   - position 通过 useAudioPlayerStatus 订阅，约 100ms 刷新一次
 *   - seek(seconds) 走 player.seekTo，进度条手动拖动时使用
 *   - Web 端：expo-audio 内部 fallback 到 HTMLAudioElement，兼容浏览器调试
 */

import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioSource } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* 曲目元信息（v1 mock，v3 起接入电台 / 推荐 API） */
export interface RadioTrack {
  /* 服务端 Track.id，用于锁屏 / TTS / 队列事件和当前曲做稳定匹配。 */
  id?: string;
  /* 远程或本地音频地址 */
  url: string;
  /* 显示用曲名 */
  title: string;
  /* 显示用艺术家 */
  artist?: string;
  /* 显示用封面图，仅作为 UI 层视觉信息 */
  artwork?: string;
  /* 总时长（秒）— 用于无元数据时的占位显示，加载完成后会被真实 duration 覆盖 */
  durationFallback?: number;
}

export interface RadioPlayerState {
  /* 当前曲目 */
  track: RadioTrack;
  /* 是否正在播放 */
  playing: boolean;
  /* 当前曲目是否已经播放到结尾 */
  ended: boolean;
  /* 当前进度（秒） */
  position: number;
  /* 总时长（秒），加载中可能为 0 */
  duration: number;
  /* 是否处于缓冲态 */
  buffering: boolean;
  /* 播放器底层错误；为空表示没有可见错误 */
  error: string | null;
}

export interface RadioPlayerActions {
  /* 播放 / 暂停切换 */
  toggle: () => void;
  /* 强制播放 */
  play: () => void;
  /* 强制暂停 */
  pause: () => void;
  /* 停止并回到 0 秒 */
  stop: () => void;
  /* 跳到指定秒数 */
  seek: (seconds: number) => void;
  /* 切换到下一首。 */
  next: () => void;
  /* 切换到上一首 */
  prev: () => void;
  /* 设置播放音量；范围 0-1。Phase E 用于 TTS 期间的 ducking。 */
  setVolume: (volume: number) => void;
}

export type RadioLockScreenPlayer = Pick<
  AudioPlayer,
  'setActiveForLockScreen' | 'updateLockScreenMetadata' | 'clearLockScreenControls'
>;

export interface RadioPlayerLockScreenBridge {
  /* 仅暴露锁屏副作用需要的播放器方法，避免页面层拿到完整 player。 */
  lockScreenPlayer: RadioLockScreenPlayer;
}

/* 把播放器状态时间统一转换成 UI 使用的秒。 */
export interface RadioPlayerOptions {
  /* 切换音源时是否自动播放；整站暂停时由上层关闭，避免换歌后偷偷出声。 */
  autoPlayOnTrackChange?: boolean;
}

function fromPlayerTime(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/* 把 UI 传入的秒转换成播放器 seekTo 需要的单位。 */
function toPlayerTime(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds;
}

/*
 * Hook：useRadioPlayer
 * @param playlist  服务端下发的真实播放列表；为空时只展示占位，不播放 demo 曲。
 * @returns 播放状态 + 控制动作
 */
export function useRadioPlayer(
  playlist: RadioTrack[] = [],
  options: RadioPlayerOptions = {},
): RadioPlayerState & RadioPlayerActions & RadioPlayerLockScreenBridge {
  /* 上层编排后的自动播放意图，默认保持旧行为：新曲到达后自动播放。 */
  const autoPlayOnTrackChange = options.autoPlayOnTrackChange ?? true;
  /* 当前播放索引 */
  const [trackIndex, setTrackIndex] = useState(0);
  /*
   * 切歌后是否自动播放：
   *   - 用户在播放中点上一首 / 下一首：新曲继续播放
   *   - 用户在暂停状态点上一首 / 下一首：只换曲，不擅自播放
   */
  const shouldAutoPlayRef = useRef(false);
  /* 最近一次自动播放过的 URL，避免重渲染重复触发 play。 */
  const lastAutoPlayedUrlRef = useRef<string | null>(null);
  /*
   * 用户或新曲到达后的目标播放状态。
   * expo-audio 在 Web/Native 上都可能先进入 loading，再异步变成可播；这个 ref 让加载完成后能补一次 play。
   */
  const wantsToPlayRef = useRef(false);

  /* 当前曲目（playlist 为空时只给占位信息，不指向任何音频 URL）。 */
  const track = useMemo<RadioTrack>(
    () => playlist[trackIndex] ?? playlist[0] ?? { url: '', title: '—' },
    [playlist, trackIndex],
  );

  /* expo-audio：根据当前 url 实例化播放器，url 变化时自动 dispose 旧实例 */
  const source: AudioSource = useMemo(() => ({ uri: track.url }), [track.url]);
  const player = useAudioPlayer(source);
  /* 100ms 一次的状态订阅，用于驱动 UI */
  const status = useAudioPlayerStatus(player);
  /* UI 层统一消费秒，避免 Web/Native 单位差异污染动画组件。 */
  const positionSeconds = fromPlayerTime(status.currentTime);
  const durationSeconds = status.duration > 0 ? fromPlayerTime(status.duration) : (track.durationFallback ?? 0);
  /*
   * 结束态优先信任 expo-audio 的 didJustFinish。
   * 兜底判断用于 Web/轮询边界：停在总时长附近且未播放时，也视为结束态。
   */
  const ended =
    status.didJustFinish ||
    (!status.playing && durationSeconds > 0 && positionSeconds >= Math.max(durationSeconds - 0.25, 0));

  useEffect(() => {
    setTrackIndex(0);
  }, [playlist]);

  const requestPlay = useCallback(() => {
    if (!track.url) return;
    wantsToPlayRef.current = true;
    try {
      player.play();
    } catch {
      /* 播放失败时保留 wantsToPlay；加载完成或用户再次点击时会重试。 */
    }
  }, [player, track.url]);

  useEffect(() => {
    if (!track.url) {
      wantsToPlayRef.current = false;
      lastAutoPlayedUrlRef.current = null;
      return;
    }
    if (!autoPlayOnTrackChange) {
      wantsToPlayRef.current = false;
      lastAutoPlayedUrlRef.current = track.url;
      return;
    }
    if (lastAutoPlayedUrlRef.current === track.url) return;
    lastAutoPlayedUrlRef.current = track.url;
    requestPlay();
  }, [autoPlayOnTrackChange, requestPlay, track.url]);

  useEffect(() => {
    if (!shouldAutoPlayRef.current) return;
    shouldAutoPlayRef.current = false;
    requestPlay();
  }, [requestPlay, track.url]);

  useEffect(() => {
    if (!track.url) return;
    if (!wantsToPlayRef.current) return;
    if (status.playing) return;
    if (!status.isLoaded || status.error) return;

    try {
      player.play();
    } catch {
      /* 个别平台仍可能要求用户手势；下一次点击播放会再次调用 requestPlay。 */
    }
  }, [player, status.error, status.isLoaded, status.playing, track.url]);

  const restartAndPlay = useCallback(() => {
    if (!track.url) return;
    wantsToPlayRef.current = true;
    /* 播完后再次播放要先回到 0 秒，否则部分平台会停在末尾不触发可见反馈。 */
    void player
      .seekTo(0)
      .catch(() => undefined)
      .finally(() => {
        requestPlay();
      });
  }, [player, requestPlay, track.url]);

  const toggle = useCallback(() => {
    if (ended) {
      restartAndPlay();
      return;
    }
    if (status.playing) {
      wantsToPlayRef.current = false;
      player.pause();
      return;
    }
    requestPlay();
  }, [ended, player, requestPlay, restartAndPlay, status.playing]);

  const play = useCallback(() => {
    if (ended) {
      restartAndPlay();
      return;
    }
    requestPlay();
  }, [ended, requestPlay, restartAndPlay]);
  const pause = useCallback(() => {
    wantsToPlayRef.current = false;
    player.pause();
  }, [player]);

  const stop = useCallback(() => {
    wantsToPlayRef.current = false;
    player.pause();
    void player.seekTo(0);
  }, [player]);

  const seek = useCallback(
    (seconds: number) => {
      /* seekTo 是异步的，调用后会触发播放器状态更新。 */
      void player.seekTo(toPlayerTime(seconds));
    },
    [player],
  );

  const next = useCallback(() => {
    if (playlist.length === 0) return;
    shouldAutoPlayRef.current = status.playing || wantsToPlayRef.current;
    wantsToPlayRef.current = shouldAutoPlayRef.current;
    setTrackIndex((i) => (i + 1) % playlist.length);
  }, [playlist.length, status.playing]);

  const prev = useCallback(() => {
    if (playlist.length === 0) return;
    shouldAutoPlayRef.current = status.playing || wantsToPlayRef.current;
    wantsToPlayRef.current = shouldAutoPlayRef.current;
    setTrackIndex((i) => (i - 1 + playlist.length) % playlist.length);
  }, [playlist.length, status.playing]);

  /*
   * 设置播放音量。
   * TTS talk-over 期间由页面层把音乐 ducking 到较低音量，结束后恢复 1.0；
   * expo-audio 的 player.volume 在 web/native 都生效。
   */
  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      try {
        (player as unknown as { volume: number }).volume = clamped;
      } catch {
        /* 个别平台未实现 volume setter 时静默忽略，TTS 仍能播放，只是没 ducking。 */
      }
    },
    [player],
  );

  return {
    track,
    playing: status.playing,
    ended,
    position: positionSeconds,
    duration: durationSeconds,
    buffering: Boolean(track.url) && !status.isLoaded && !status.error,
    error: status.error,
    toggle,
    play,
    pause,
    stop,
    seek,
    next,
    prev,
    setVolume,
    lockScreenPlayer: player,
  };
}
