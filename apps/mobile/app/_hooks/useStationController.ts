/*
 * Hook：useStationController
 * -------------------------
 * Phase H 统一编排整站播放语义：主按钮控制整站，VOICE 只控制主播自动播报，
 * 上一首 / 下一首以服务端队列为权威，避免歌曲、主播、队列各自为政。
 */

import type { ClaudioApiClient, PlaybackCapabilities, Track } from '@claudio/api';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RadioPlayerActions, RadioPlayerState } from './useRadioPlayer';
import type { TtsPlayerActions, TtsPlayerState } from './useTtsPlayer';

type StationRadio = RadioPlayerState & RadioPlayerActions;
type StationVoice = TtsPlayerState & TtsPlayerActions;

export interface StationControllerInput {
  /* 访问服务端播放队列的 API client。 */
  apiClient: Pick<ClaudioApiClient, 'playNext' | 'playPrevious'>;
  /* 背景歌曲播放器。 */
  radio: StationRadio;
  /* 主播 TTS 播放器。 */
  voice: StationVoice;
  /* VOICE 徽章状态：只决定后续主播是否自动播报。 */
  voiceEnabled: boolean;
  /* 更新 VOICE 徽章状态。 */
  setVoiceEnabled: Dispatch<SetStateAction<boolean>>;
  /* 整站是否被用户暂停。 */
  stationPaused: boolean;
  /* 更新整站暂停状态。 */
  setStationPaused: Dispatch<SetStateAction<boolean>>;
  /* 用服务端返回的队列替换本地播放队列。 */
  applyApiTracks: (tracks: Array<Track | null | undefined>, allowEmpty?: boolean) => void;
  /* 同步服务端播放控制能力。 */
  setPlaybackCapabilities?: (playback: PlaybackCapabilities) => void;
}

export interface StationController {
  /* 主播放按钮展示状态：任意音频正在播放即为 true。 */
  stationPlaying: boolean;
  /* 是否处于整站暂停态。 */
  stationPaused: boolean;
  /* 是否正在主播 talk-over，用于音乐 ducking。 */
  musicDucked: boolean;
  /* 最近一次主播 TTS URL，供 UI 判断 replay 是否有内容。 */
  lastVoiceUrl: string | null;
  /* 主播放按钮：暂停 / 继续整站。 */
  toggleStation: () => void;
  /* 停止整站并回到歌曲起点。 */
  stopStation: () => void;
  /* 下一首：优先请求服务端队列。 */
  nextTrack: () => void;
  /* 上一首：优先请求服务端队列。 */
  previousTrack: () => void;
  /* 切换 VOICE 自动播报。 */
  toggleVoiceEnabled: () => void;
  /* 接收 tts-ready 后按 VOICE 和整站状态决定是否播放。 */
  playVoice: (url: string) => void;
  /* 用户显式重播最近一次主播语音。 */
  replayVoice: () => void;
}

/*
 * 建立整站播放控制器。
 * hook 内部用 ref 持有最新播放器对象，避免 WS 回调因为播放器状态变化而反复重建。
 */
export function useStationController(input: StationControllerInput): StationController {
  const {
    apiClient,
    applyApiTracks,
    radio,
    setStationPaused,
    setVoiceEnabled,
    setPlaybackCapabilities,
    stationPaused,
    voice,
    voiceEnabled,
  } = input;
  const radioRef = useRef(input.radio);
  const voiceRef = useRef(input.voice);
  const voiceEnabledRef = useRef(input.voiceEnabled);
  const stationPausedRef = useRef(input.stationPaused);
  const lastVoiceUrlRef = useRef<string | null>(null);
  const [lastVoiceUrl, setLastVoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    radioRef.current = radio;
  }, [radio]);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    stationPausedRef.current = stationPaused;
  }, [stationPaused]);

  /*
   * 暂停新曲自动播放的兜底。
   * React state 生效和播放器换源不是同一个时钟，这里延迟一次 pause，防止暂停态切歌后短暂出声。
   */
  const pauseAfterQueueSwap = useCallback(() => {
    setTimeout(() => {
      if (stationPausedRef.current) radioRef.current.pause();
    }, 0);
  }, []);

  /*
   * 主按钮：整站暂停 / 继续。
   * 暂停时歌曲和主播一起停；继续时歌曲继续，主播若还在可续播位置则续播。
   */
  const toggleStation = useCallback(() => {
    const radio = radioRef.current;
    const voice = voiceRef.current;
    const shouldPause = radio.playing || voice.playing || (radio.buffering && !stationPausedRef.current);

    if (shouldPause) {
      setStationPaused(true);
      stationPausedRef.current = true;
      radio.pause();
      voice.pause();
      return;
    }

    setStationPaused(false);
    stationPausedRef.current = false;
    radio.play();
    if (voiceEnabledRef.current && voice.ready) voice.resume();
  }, [setStationPaused]);

  /*
   * 停止整站。
   * stop 比 pause 更强：歌曲回到 0 秒，主播也回到开头但不自动播。
   */
  const stopStation = useCallback(() => {
    setStationPaused(true);
    stationPausedRef.current = true;
    radioRef.current.stop();
    voiceRef.current.stop();
  }, [setStationPaused]);

  /*
   * 切换 VOICE 自动播报。
   * OFF 会暂停正在说话的主播；ON 不抢播历史语音，下一次 tts-ready 或 REPLAY 再播放。
   */
  const toggleVoiceEnabled = useCallback(() => {
    setVoiceEnabled((value) => {
      const nextValue = !value;
      voiceEnabledRef.current = nextValue;
      if (!nextValue) voiceRef.current.pause();
      return nextValue;
    });
  }, [setVoiceEnabled]);

  /*
   * 接收新的 TTS URL。
   * VOICE OFF 或整站暂停时只记录，不自动播放；用户点 REPLAY 才显式播放。
   */
  const playVoice = useCallback((url: string) => {
    if (!url) return;
    lastVoiceUrlRef.current = url;
    setLastVoiceUrl(url);
    if (!voiceEnabledRef.current) return;
    if (stationPausedRef.current) return;
    radioRef.current.play();
    voiceRef.current.play(url);
  }, []);

  /*
   * 重播最近一次主播语音。
   * 这是用户显式动作，因此不受 VOICE 自动播报开关限制。
   */
  const replayVoice = useCallback(() => {
    const url = lastVoiceUrlRef.current;
    if (!url) return;
    setStationPaused(false);
    stationPausedRef.current = false;
    radioRef.current.play();
    voiceRef.current.play(url);
  }, [setStationPaused]);

  /*
   * 服务端切歌的公共流程。
   * 成功时用服务端返回的“当前曲开始”的队列覆盖本地队列；失败时本地静默兜底。
   */
  const moveTrack = useCallback(
    async (direction: 'next' | 'previous') => {
      const radio = radioRef.current;
      const voice = voiceRef.current;
      const wasActive = radio.playing || voice.playing || (radio.buffering && !stationPausedRef.current);
      const shouldStayPaused = stationPausedRef.current || !wasActive;

      setStationPaused(shouldStayPaused);
      stationPausedRef.current = shouldStayPaused;

      try {
        const result =
          direction === 'next' ? await apiClient.playNext() : await apiClient.playPrevious();

        if (result.ok) {
          voice.stop();
          applyApiTracks(result.queue, true);
          if (result.playback) setPlaybackCapabilities?.(result.playback);
          if (shouldStayPaused) pauseAfterQueueSwap();
        }
        return;
      } catch {
        /* 服务端切歌失败时走本地兜底，保持按钮可用但不改变服务端权威状态。 */
      }

      voice.stop();
      if (direction === 'next') radio.next();
      else radio.prev();
      if (shouldStayPaused) pauseAfterQueueSwap();
    },
    [apiClient, applyApiTracks, pauseAfterQueueSwap, setPlaybackCapabilities, setStationPaused],
  );

  const nextTrack = useCallback(() => {
    void moveTrack('next');
  }, [moveTrack]);

  const previousTrack = useCallback(() => {
    void moveTrack('previous');
  }, [moveTrack]);

  return {
    stationPlaying: radio.playing || voice.playing || (radio.buffering && !stationPaused),
    stationPaused,
    musicDucked: voice.playing,
    lastVoiceUrl,
    toggleStation,
    stopStation,
    nextTrack,
    previousTrack,
    toggleVoiceEnabled,
    playVoice,
    replayVoice,
  };
}
