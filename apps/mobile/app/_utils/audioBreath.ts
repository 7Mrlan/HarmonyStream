/*
 * Claudio 音频呼吸状态
 * --------------------
 * 这里只做可测试的强度推导：真实 Web Audio analyser 由 hook 注入；
 * Native 或 analyser 不可用时，使用播放进度 envelope，并明确标记不是 FFT。
 */

import type { ClaudioLifeState } from './claudioLifeState';
import type { PresenceVisualTone } from './presenceVisualTone';

export type AudioBreathSource = 'web-audio' | 'playback-envelope' | 'idle' | 'off';

export interface AudioBreathState {
  /* 频谱视觉强度，范围固定为 0-1。 */
  intensity: number;
  /* 强度来源；playback-envelope 是真实播放状态 fallback，不是 PCM / FFT。 */
  source: AudioBreathSource;
  /* 是否来自真实音频 analyser。 */
  realAudio: boolean;
  /* 内部诊断原因，只用于调试和测试，不直接展示给用户。 */
  reason: string;
}

export interface PlaybackEnvelopeInput {
  /* 当前可播放曲目的 URL；为空时不生成播放呼吸。 */
  trackUrl?: string | null;
  /* 音乐是否正在播放且未结束。 */
  playing: boolean;
  /* 当前播放进度，单位秒。 */
  position: number;
  /* 当前曲总时长，单位秒；未知时可以为 0。 */
  duration: number;
  /* HomeScreen 聚合出的生命状态。 */
  lifeState: ClaudioLifeState;
  /* L.5 Presence 语气，只给 envelope 做轻量能量偏置。 */
  presenceTone: PresenceVisualTone;
}

const IDLE_LEVELS: Record<ClaudioLifeState, number> = {
  offline: 0,
  connecting: 0.1,
  tuning: 0.16,
  speaking: 0.14,
  listening: 0.18,
  sleeping: 0.05,
  breathing: 0.12,
};

const PRESENCE_BIAS: Record<PresenceVisualTone, number> = {
  offline: -0.16,
  tuning: 0.02,
  'soft-hold': -0.08,
  'focus-flow': -0.02,
  celebration: 0.14,
  'wind-down': -0.12,
  listening: 0.04,
  breathing: 0,
};

/* 工具：把任意数值收束到 0-1，避免异常状态把 UI 动画顶爆。 */
export function clampAudioBreath(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/* 工具：读取安全的非负秒数，屏蔽播放器加载初期的 undefined / NaN。 */
function safeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/* 工具：播放进度占比未知时返回 0，已知时固定收束到 0-1。 */
function resolveProgressRatio(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clampAudioBreath(position / duration);
}

/*
 * 根据真实播放状态生成 fallback 呼吸 envelope。
 * 它只说明“现在有音乐在播、进度在动、语气偏亮/偏暗”，不宣称读取了 PCM / FFT。
 */
export function derivePlaybackEnvelope(input: PlaybackEnvelopeInput): AudioBreathState {
  const hasTrack = Boolean(input.trackUrl?.trim());
  if (!hasTrack || input.lifeState === 'offline') {
    return {
      intensity: 0,
      source: 'off',
      realAudio: false,
      reason: hasTrack ? 'life-state-offline' : 'missing-track-url',
    };
  }

  if (!input.playing) {
    return {
      intensity: clampAudioBreath(IDLE_LEVELS[input.lifeState] + PRESENCE_BIAS[input.presenceTone] * 0.25),
      source: 'idle',
      realAudio: false,
      reason: 'playback-idle',
    };
  }

  const position = safeSeconds(input.position);
  const duration = safeSeconds(input.duration);
  const ratio = resolveProgressRatio(position, duration);
  const beat = (Math.sin(position * 2.35) + 1) / 2;
  const slowWave = (Math.sin(position * 0.42 + ratio * Math.PI) + 1) / 2;
  const introRamp = duration > 0 ? Math.max(0.58, Math.min(1, ratio * 10)) : 0.82;
  const tailRamp = duration > 0 && ratio > 0.92 ? Math.max(0.45, (1 - ratio) / 0.08) : 1;
  const toneBias = PRESENCE_BIAS[input.presenceTone];
  const lifeBias = input.lifeState === 'listening' ? 0.04 : input.lifeState === 'speaking' ? -0.04 : 0;
  const envelope = (0.26 + beat * 0.34 + slowWave * 0.18 + toneBias + lifeBias) * introRamp * tailRamp;

  return {
    intensity: clampAudioBreath(envelope),
    source: 'playback-envelope',
    realAudio: false,
    reason: 'playback-envelope-fallback',
  };
}

/*
 * 合并 fallback reason。
 * hook 在 Web Audio 不可用时会把失败原因附加到 envelope 上，便于调试但不影响体验。
 */
export function withAudioBreathReason(state: AudioBreathState, reason: string | null): AudioBreathState {
  if (!reason) return state;
  return {
    ...state,
    reason: `${state.reason}; ${reason}`,
  };
}
