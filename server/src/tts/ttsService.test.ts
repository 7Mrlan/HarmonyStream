import { describe, expect, it } from 'vitest';
import { buildCacheKey } from './ttsService.js';

describe('ttsService cache key', () => {
  it('区分 provider，避免 fallback 音色污染小米缓存', () => {
    const mimoKey = buildCacheKey('mimo', '今晚听这首', '白桦', 1);
    const doubaoKey = buildCacheKey('doubao', '今晚听这首', '白桦', 1);

    expect(mimoKey).not.toBe(doubaoKey);
  });

  it('区分实际 voice 和 speed', () => {
    const normalKey = buildCacheKey('mimo', '今晚听这首', '白桦', 1);
    const otherVoiceKey = buildCacheKey('mimo', '今晚听这首', '茉莉', 1);
    const slowKey = buildCacheKey('mimo', '今晚听这首', '白桦', 0.9);

    expect(normalKey).not.toBe(otherVoiceKey);
    expect(normalKey).not.toBe(slowKey);
  });

  it('允许 provider canonical voice 和请求 voice 使用不同 key', () => {
    const requestKey = buildCacheKey('mimo', '今晚听这首', '白桦', 1);
    const actualVoiceKey = buildCacheKey('mimo', '今晚听这首', 'data:audio/wav;base64,abc', 1);

    expect(requestKey).not.toBe(actualVoiceKey);
  });

  it('区分动态 TTS style，避免不同情绪复用同一音频', () => {
    const brightKey = buildCacheKey('mimo', '今晚听这首', '白桦', 1, 'bright-v1');
    const lateNightKey = buildCacheKey('mimo', '今晚听这首', '白桦', 1, 'late-night-v1');

    expect(brightKey).not.toBe(lateNightKey);
  });

  it('区分 provider 静态 cache scope，避免模型或全局 style 变更后命中旧音频', () => {
    const oldScopeKey = buildCacheKey(
      'mimo',
      '今晚听这首',
      '白桦',
      1,
      'neutral-v1',
      'mimo-v2.5-tts:old',
    );
    const newScopeKey = buildCacheKey(
      'mimo',
      '今晚听这首',
      '白桦',
      1,
      'neutral-v1',
      'mimo-v2.5-tts:new',
    );

    expect(oldScopeKey).not.toBe(newScopeKey);
  });
});
