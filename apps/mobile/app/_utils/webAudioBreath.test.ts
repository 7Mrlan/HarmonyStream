import { describe, expect, it } from 'vitest';
import {
  isMeaningfulAnalyserIntensity,
  normalizeAnalyserData,
  pickExistingAudioElement,
  type BrowserAudioGlobal,
} from './webAudioBreath';

/* 测试工具：构造最小 document-like 对象，避免引入真实 DOM 环境。 */
function browserWithAudioElements(elements: Array<{ currentSrc?: string; src?: string }>): BrowserAudioGlobal {
  return {
    document: {
      querySelectorAll: () => ({
        length: elements.length,
        item: (index: number) => elements[index],
      }),
    },
  };
}

describe('webAudioBreath adapter', () => {
  it('多个 audio 时优先选择当前曲 URL 对应的 element', () => {
    const browser = browserWithAudioElements([
      { currentSrc: 'https://example.test/tts.mp3' },
      { currentSrc: 'https://cdn.example.test/music/song.mp3' },
    ]);

    expect(pickExistingAudioElement(browser, 'music/song.mp3')?.currentSrc).toContain('song.mp3');
  });

  it('多个 audio 且 URL 无法匹配时不兜底到 TTS 或第一个 audio', () => {
    const browser = browserWithAudioElements([
      { currentSrc: 'https://example.test/tts.mp3' },
      { currentSrc: 'blob:https://example.test/runtime-audio' },
    ]);

    expect(pickExistingAudioElement(browser, 'https://cdn.example.test/music/song.mp3')).toBeNull();
  });

  it('只有一个 audio 时允许保守兜底', () => {
    const browser = browserWithAudioElements([{ currentSrc: 'blob:https://example.test/runtime-audio' }]);

    expect(pickExistingAudioElement(browser, 'https://cdn.example.test/music/song.mp3')).not.toBeNull();
  });

  it('全 0 analyser 数据不能标记成真实音频', () => {
    const silent = normalizeAnalyserData(new Uint8Array(32).fill(0));
    const active = normalizeAnalyserData(new Uint8Array(32).fill(96));

    expect(isMeaningfulAnalyserIntensity(silent)).toBe(false);
    expect(isMeaningfulAnalyserIntensity(active)).toBe(true);
  });
});
