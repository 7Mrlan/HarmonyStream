import { describe, expect, it } from 'vitest';
import {
  clampAudioBreath,
  derivePlaybackEnvelope,
  type PlaybackEnvelopeInput,
} from './audioBreath';

const BASE_INPUT: PlaybackEnvelopeInput = {
  trackUrl: 'https://example.test/song.mp3',
  playing: true,
  position: 24,
  duration: 180,
  lifeState: 'listening',
  presenceTone: 'listening',
};

/* 测试工具：只覆盖本用例关心字段，避免每个用例重复完整播放器状态。 */
function envelope(overrides: Partial<PlaybackEnvelopeInput>) {
  return derivePlaybackEnvelope({ ...BASE_INPUT, ...overrides });
}

describe('derivePlaybackEnvelope', () => {
  it('没有曲目或离线时关闭律动', () => {
    expect(envelope({ trackUrl: '' })).toMatchObject({
      intensity: 0,
      source: 'off',
      realAudio: false,
    });
    expect(envelope({ lifeState: 'offline' })).toMatchObject({
      intensity: 0,
      source: 'off',
      realAudio: false,
    });
  });

  it('暂停时进入 idle fallback，不伪装成真实 analyser', () => {
    const state = envelope({ playing: false, lifeState: 'breathing' });

    expect(state.source).toBe('idle');
    expect(state.realAudio).toBe(false);
    expect(state.intensity).toBeGreaterThan(0);
    expect(state.intensity).toBeLessThan(0.3);
  });

  it('播放时使用播放进度 envelope，位置变化会改变强度', () => {
    const first = envelope({ position: 8 }).intensity;
    const second = envelope({ position: 9.3 }).intensity;

    expect(envelope({ position: 8 }).source).toBe('playback-envelope');
    expect(first).not.toBe(second);
  });

  it('开心语气比收尾语气更亮', () => {
    const celebration = envelope({ presenceTone: 'celebration', position: 18 }).intensity;
    const windDown = envelope({ presenceTone: 'wind-down', position: 18 }).intensity;
    const focus = envelope({ presenceTone: 'focus-flow', position: 18 }).intensity;

    expect(celebration).toBeGreaterThan(focus);
    expect(focus).toBeGreaterThan(windDown);
  });

  it('所有强度都被限制在 0-1', () => {
    expect(clampAudioBreath(Number.NaN)).toBe(0);
    expect(clampAudioBreath(-10)).toBe(0);
    expect(clampAudioBreath(10)).toBe(1);
    const loudState = envelope({ position: 999, duration: 1000, presenceTone: 'celebration' });

    expect(loudState.intensity).toBeLessThanOrEqual(1);
  });
});
