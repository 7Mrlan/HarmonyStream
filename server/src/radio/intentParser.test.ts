import { describe, expect, it } from 'vitest';
import {
  parseExplicitSongRequest,
  parseGenericRecommendationRequest,
  parseGenreRecommendationRequest,
} from './intentParser.js';

describe('intentParser', () => {
  it('解析带歌手的明确点歌', () => {
    expect(parseExplicitSongRequest('我想听周杰伦的晴天')).toEqual({
      title: '晴天',
      artist: '周杰伦',
      searchQuery: '晴天 周杰伦',
    });
  });

  it('解析裸 Artist 的 Title 格式', () => {
    expect(parseExplicitSongRequest('周杰伦的晴天')).toEqual({
      title: '晴天',
      artist: '周杰伦',
      searchQuery: '晴天 周杰伦',
    });
  });

  it('情绪推荐不被当成明确歌名', () => {
    expect(parseExplicitSongRequest('想听伤感的歌曲')).toBeNull();
    expect(parseGenreRecommendationRequest('想听伤感的歌曲')?.mood).toBe('伤感');
    expect(parseExplicitSongRequest('想听开心的歌')).toBeNull();
    expect(parseExplicitSongRequest('深夜想听点不吵的歌')).toBeNull();
    expect(parseExplicitSongRequest('来点怀旧的')).toBeNull();
  });

  it('常见 X 的 Y 歌名不被裸 artist/title 规则误拆', () => {
    expect(parseExplicitSongRequest('夜空中最亮的星')).toBeNull();
    expect(parseExplicitSongRequest('后来的我们')).toBeNull();
  });

  it('泛推荐只验证 parser 返回默认推荐锚点，不验证运行时 LLM fallback', () => {
    const request = parseGenericRecommendationRequest('给我推荐歌曲');

    expect(request).not.toBeNull();
    expect(request?.preferredTitles).toContain('晴天');
  });
});
