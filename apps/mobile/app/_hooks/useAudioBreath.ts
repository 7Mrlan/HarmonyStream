/*
 * Hook：useAudioBreath
 * --------------------
 * Phase N 的音频律动适配层：Web 端优先复用现有 audio element 接 Web Audio analyser；
 * 其他平台或能力不可用时，退回播放进度 envelope，并明确标记为 fallback。
 */

import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  derivePlaybackEnvelope,
  withAudioBreathReason,
  type AudioBreathState,
  type PlaybackEnvelopeInput,
} from '../_utils/audioBreath';
import {
  WEB_AUDIO_PUBLISH_INTERVAL_MS,
  WEB_AUDIO_SILENCE_GRACE_FRAMES,
  getBrowserAudioGlobal,
  isMeaningfulAnalyserIntensity,
  isObjectLike,
  normalizeAnalyserData,
  pickExistingAudioElement,
  type AudioElementLike,
  type BrowserAudioGlobal,
  type WebAudioAnalyserLike,
  type WebAudioContextLike,
  type WebAudioSourceLike,
} from '../_utils/webAudioBreath';

interface WebAudioBinding {
  context: WebAudioContextLike;
  source: WebAudioSourceLike;
  analyser: WebAudioAnalyserLike;
  data: Uint8Array;
}

const webAudioBindings = new WeakMap<object, WebAudioBinding>();
let sharedAudioContext: WebAudioContextLike | null = null;

/* 工具：复用或创建单个 AudioContext，避免每次切歌都新建系统音频上下文。 */
function getOrCreateAudioContext(browser: BrowserAudioGlobal): WebAudioContextLike | null {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') return sharedAudioContext;

  const ContextConstructor = browser.AudioContext ?? browser.webkitAudioContext;
  if (!ContextConstructor) return null;

  try {
    sharedAudioContext = new ContextConstructor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/* 工具：为现有 audio element 建立 analyser；失败时返回原因，不中断播放链路。 */
function getOrCreateAnalyserBinding(
  browser: BrowserAudioGlobal,
  element: AudioElementLike,
): { binding: WebAudioBinding | null; failureReason: string | null } {
  if (isObjectLike(element)) {
    const existing = webAudioBindings.get(element);
    if (existing) return { binding: existing, failureReason: null };
  }

  const context = getOrCreateAudioContext(browser);
  if (!context) return { binding: null, failureReason: 'web-audio-unavailable:no-audio-context' };

  try {
    const source = context.createMediaElementSource(element);
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(context.destination);

    /*
     * source 随 binding 存在于 WeakMap value 中，生命周期跟 audio element 绑定。
     * effect cleanup 只停 RAF，不断开 graph，避免暂停 / 继续后复用的 analyser 被切断。
     */
    const binding = {
      context,
      source,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
    };
    if (isObjectLike(element)) webAudioBindings.set(element, binding);
    return { binding, failureReason: null };
  } catch {
    return { binding: null, failureReason: 'web-audio-unavailable:create-media-source-failed' };
  }
}

/*
 * Hook：输出当前频谱应使用的音频呼吸状态。
 * React state 只以约 12fps 发布真实 analyser 强度，避免把整屏变成 60fps React 热路径。
 */
export function useAudioBreath(input: PlaybackEnvelopeInput): AudioBreathState {
  const envelope = useMemo(
    () => derivePlaybackEnvelope(input),
    [
      input.duration,
      input.lifeState,
      input.playing,
      input.position,
      input.presenceTone,
      input.trackUrl,
    ],
  );
  const [webAudioState, setWebAudioState] = useState<AudioBreathState | null>(null);
  const [webAudioFailureReason, setWebAudioFailureReason] = useState<string | null>(null);

  useEffect(() => {
    setWebAudioState(null);
    setWebAudioFailureReason(null);

    if (Platform.OS !== 'web' || !input.playing || !input.trackUrl || input.lifeState === 'offline') {
      return undefined;
    }

    const browser = getBrowserAudioGlobal();
    const requestFrame = browser.requestAnimationFrame;
    const cancelFrame = browser.cancelAnimationFrame;
    if (!requestFrame || !cancelFrame) {
      setWebAudioFailureReason('web-audio-unavailable:no-animation-frame');
      return undefined;
    }

    const audioElement = pickExistingAudioElement(browser, input.trackUrl);
    if (!audioElement) {
      setWebAudioFailureReason('web-audio-unavailable:no-existing-audio-element');
      return undefined;
    }

    const { binding, failureReason } = getOrCreateAnalyserBinding(browser, audioElement);
    if (!binding) {
      setWebAudioFailureReason(failureReason);
      return undefined;
    }

    let disposed = false;
    let frameId: number | null = null;
    let lastPublishAt = 0;
    let lastIntensity = -1;
    let silentFrames = 0;
    let silentFallbackReported = false;

    void binding.context.resume?.().catch(() => undefined);

    const publish = (time: number) => {
      if (disposed) return;

      binding.analyser.getByteFrequencyData(binding.data);
      const intensity = normalizeAnalyserData(binding.data);
      if (!isMeaningfulAnalyserIntensity(intensity)) {
        silentFrames += 1;
        if (!silentFallbackReported && silentFrames >= WEB_AUDIO_SILENCE_GRACE_FRAMES) {
          silentFallbackReported = true;
          setWebAudioState(null);
          setWebAudioFailureReason('web-audio-unavailable:silent-analyser');
        }
        frameId = requestFrame(publish);
        return;
      }

      silentFrames = 0;
      silentFallbackReported = false;
      const shouldPublish =
        time - lastPublishAt >= WEB_AUDIO_PUBLISH_INTERVAL_MS &&
        Math.abs(intensity - lastIntensity) >= 0.015;

      if (shouldPublish) {
        lastPublishAt = time;
        lastIntensity = intensity;
        setWebAudioState({
          intensity,
          source: 'web-audio',
          realAudio: true,
          reason: 'web-audio-analyser',
        });
        setWebAudioFailureReason(null);
      }

      frameId = requestFrame(publish);
    };

    frameId = requestFrame(publish);

    return () => {
      disposed = true;
      if (frameId !== null) cancelFrame(frameId);
    };
  }, [input.lifeState, input.playing, input.trackUrl]);

  return webAudioState ?? withAudioBreathReason(envelope, webAudioFailureReason);
}
