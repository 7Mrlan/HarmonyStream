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

import { useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

/* 曲目元信息（v1 mock，v3 起接入电台 / 推荐 API） */
export interface RadioTrack {
  /* 远程或本地音频地址 */
  url: string;
  /* 显示用曲名 */
  title: string;
  /* 显示用艺术家 */
  artist?: string;
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
  /* 切换到下一首（v1 仅 mock：在 DEFAULT_PLAYLIST 中循环） */
  next: () => void;
  /* 切换到上一首 */
  prev: () => void;
}

/*
 * 默认电台播放列表（v1 mock，使用 SoundHelix 的开放测试音频）
 * SoundHelix 是程序生成音乐的开放试听站，允许免费用于演示与测试。
 */
const DEFAULT_PLAYLIST: RadioTrack[] = [
  {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'Late Night Drive',
    artist: 'SoundHelix',
    durationFallback: 372,
  },
  {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'Synthwave Pulse',
    artist: 'SoundHelix',
    durationFallback: 425,
  },
  {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    title: 'Pixel Reverie',
    artist: 'SoundHelix',
    durationFallback: 288,
  },
];

/*
 * expo-audio v0.3 的 Web fallback 实际返回毫秒，原生类型声明为秒。
 * UI 层统一使用秒，seek 时再转换成播放器当前平台需要的单位。
 */
const AUDIO_TIME_SCALE = Platform.OS === 'web' ? 1000 : 1;

/* 把播放器状态时间统一转换成 UI 使用的秒。 */
function fromPlayerTime(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return value / AUDIO_TIME_SCALE;
}

/* 把 UI 传入的秒转换成播放器 seekTo 需要的单位。 */
function toPlayerTime(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds * AUDIO_TIME_SCALE;
}

/*
 * Hook：useRadioPlayer
 * @param playlist  自定义播放列表，默认使用 DEFAULT_PLAYLIST
 * @returns 播放状态 + 控制动作
 */
export function useRadioPlayer(
  playlist: RadioTrack[] = DEFAULT_PLAYLIST,
): RadioPlayerState & RadioPlayerActions {
  /* 当前播放索引 */
  const [trackIndex, setTrackIndex] = useState(0);
  /*
   * 切歌后是否自动播放：
   *   - 用户在播放中点上一首 / 下一首：新曲继续播放
   *   - 用户在暂停状态点上一首 / 下一首：只换曲，不擅自播放
   */
  const shouldAutoPlayRef = useRef(false);

  /* 当前曲目（兜底：playlist 为空时给一个占位 url） */
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
    if (!shouldAutoPlayRef.current) return;
    shouldAutoPlayRef.current = false;
    player.play();
  }, [player, track.url]);

  const restartAndPlay = useCallback(() => {
    /* 播完后再次播放要先回到 0 秒，否则部分平台会停在末尾不触发可见反馈。 */
    void player.seekTo(0).then(() => {
      player.play();
    });
  }, [player]);

  const toggle = useCallback(() => {
    if (ended) {
      restartAndPlay();
      return;
    }
    if (status.playing) player.pause();
    else player.play();
  }, [ended, player, restartAndPlay, status.playing]);

  const play = useCallback(() => {
    if (ended) {
      restartAndPlay();
      return;
    }
    player.play();
  }, [ended, player, restartAndPlay]);
  const pause = useCallback(() => player.pause(), [player]);

  const stop = useCallback(() => {
    player.pause();
    void player.seekTo(0);
  }, [player]);

  const seek = useCallback(
    (seconds: number) => {
      /* expo-audio v0.3 的 seekTo 是异步的，调用后立刻触发 status 更新 */
      void player.seekTo(toPlayerTime(seconds));
    },
    [player],
  );

  const next = useCallback(() => {
    shouldAutoPlayRef.current = status.playing;
    setTrackIndex((i) => (i + 1) % playlist.length);
  }, [playlist.length, status.playing]);

  const prev = useCallback(() => {
    shouldAutoPlayRef.current = status.playing;
    setTrackIndex((i) => (i - 1 + playlist.length) % playlist.length);
  }, [playlist.length, status.playing]);

  return {
    track,
    playing: status.playing,
    ended,
    position: positionSeconds,
    duration: durationSeconds,
    buffering: !status.isLoaded,
    toggle,
    play,
    pause,
    stop,
    seek,
    next,
    prev,
  };
}
