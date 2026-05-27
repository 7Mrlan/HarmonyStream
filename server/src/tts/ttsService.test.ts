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
});
