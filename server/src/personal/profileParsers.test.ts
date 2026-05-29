import { describe, expect, it } from 'vitest';
import { buildUserMusicProfileFromFiles } from './profileParsers.js';

/* 测试工具：构造完整文件文本输入，单个用例只覆盖关心字段。 */
function files(overrides: Partial<Parameters<typeof buildUserMusicProfileFromFiles>[0]> = {}) {
  return {
    taste: null,
    routines: null,
    playlists: null,
    simplePlaylists: null,
    qqSongs: null,
    libraryInsights: null,
    listeningEvents: null,
    djMemory: null,
    moodRules: null,
    ...overrides,
  };
}

describe('profileParsers', () => {
  it('把资料文本解析成完整 profile，不依赖文件 IO', () => {
    const profile = buildUserMusicProfileFromFiles(
      files({
        taste: '喜欢低刺激、夜间收尾的音乐。',
        simplePlaylists: JSON.stringify({
          sections: [
            {
              name: '夜尾',
              description: '深夜低一点',
              tracks: [{ name: 'Riverside', artist: 'Agnes Obel' }],
            },
          ],
        }),
        moodRules:
          '- 沮丧陪伴: keywords=沮丧 | tags=低刺激 | comfort=sit-with-you | curve=rise-gently | constraints=别催我振作\n',
      }),
    );

    expect(profile.source).toBe('user-data');
    expect(profile.loadedFiles).toEqual([
      'taste.md',
      'simple-playlists.json',
      'mood-rules.md',
    ]);
    expect(profile.librarySections[0]).toMatchObject({
      name: '夜尾',
      tracks: [{ title: 'Riverside', artist: 'Agnes Obel' }],
    });
    expect(profile.moodRules[0]).toMatchObject({
      mood: '沮丧陪伴',
      comfortMode: 'sit-with-you',
      energyCurve: 'rise-gently',
      constraints: ['别催我振作'],
    });
  });

  it('损坏 JSON 会被收敛为空资料分支，不拖垮聊天链路', () => {
    const profile = buildUserMusicProfileFromFiles(
      files({
        playlists: '{bad-json',
        simplePlaylists: '{bad-json',
        libraryInsights: '{bad-json',
        djMemory: '{bad-json',
      }),
    );

    expect(profile.source).toBe('user-data');
    expect(profile.tracks).toEqual([]);
    expect(profile.librarySections).toEqual([]);
    expect(profile.libraryInsights).toEqual([]);
    expect(profile.djMemory).toEqual([]);
  });
});
