import { describe, expect, it } from 'vitest';
import { createUserMusicProfile } from '../test/factories.js';
import { searchPersonalProfile } from './profileSearch.js';
import type { UserMusicProfile } from './profileTypes.js';

function profile(): UserMusicProfile {
  return createUserMusicProfile({
    tasteSummary: '喜欢清爽、个人化、有一点记忆点的华语流行。',
    tracks: [
      {
        title: '金风玉露',
        artist: '房东的猫',
        tags: ['开心', '明亮', '清晨'],
        note: '以前收藏在周末歌单里',
        weight: 2,
      },
      {
        title: '漠河舞厅',
        artist: '柳爽',
        tags: ['怀旧', '老歌', '夜晚'],
        weight: 1.5,
      },
      {
        title: 'A Walk',
        artist: 'Tycho',
        tags: ['深夜', '专注', '写代码'],
        weight: 1,
      },
    ],
    moodRules: [
      {
        mood: '开心',
        keywords: ['开心', '快乐'],
        preferredTags: ['开心', '明亮'],
        ttsStyle: {
          key: 'bright-v1',
          emotion: '明亮',
          styleInstruction: '语气更明亮一点',
        },
      },
      {
        mood: '怀旧',
        keywords: ['怀旧', '老歌'],
        preferredTags: ['怀旧', '老歌'],
        ttsStyle: {
          key: 'nostalgic-v1',
          emotion: '怀旧',
          styleInstruction: '温暖但不要煽情',
        },
      },
    ],
    routines: [
      {
        id: 'late-code',
        label: '深夜写代码',
        startHour: 22,
        endHour: 3,
        preferredTags: ['深夜', '写代码', '专注'],
        ttsStyle: {
          key: 'late-night-v1',
          emotion: '低声',
          styleInstruction: '低声、克制、慢一点',
          speed: 0.92,
        },
      },
    ],
  });
}

describe('searchPersonalProfile', () => {
  it('开心请求优先命中个人歌单，而不是公共硬编码歌单', () => {
    const result = searchPersonalProfile({
      userText: '想听开心的歌',
      profile: profile(),
      now: new Date('2026-05-28T09:00:00+08:00'),
    });

    expect(result.candidates[0]?.track.title).toBe('金风玉露');
    expect(result.candidates[0]?.reasons.join(' ')).toContain('开心');
    expect(result.ttsStyle.key).toBe('bright-v1');
  });

  it('深夜请求能通过 routine 和时段命中个人候选', () => {
    const result = searchPersonalProfile({
      userText: '深夜想听点不吵的歌',
      profile: profile(),
      now: new Date('2026-05-28T23:30:00+08:00'),
    });

    expect(result.environment.routine?.label).toBe('深夜写代码');
    expect(result.candidates[0]?.track.title).toBe('A Walk');
    expect(result.ttsStyle.key).toBe('late-night-v1');
  });

  it('怀旧请求命中个人资料里的怀旧候选', () => {
    const result = searchPersonalProfile({
      userText: '来点怀旧的',
      profile: profile(),
      now: new Date('2026-05-28T20:00:00+08:00'),
    });

    expect(result.candidates[0]?.track.title).toBe('漠河舞厅');
    expect(result.ttsStyle.key).toBe('nostalgic-v1');
  });

  it('空资料不伪造个人候选', () => {
    const result = searchPersonalProfile({
      userText: '想听开心的歌',
      profile: {
        ...createUserMusicProfile({ source: 'empty', loadedFiles: [] }),
        tasteSummary: '',
        tracks: [],
        moodRules: [],
        routines: [],
      },
      now: new Date('2026-05-28T09:00:00+08:00'),
    });

    expect(result.candidates).toEqual([]);
    expect(result.ttsStyle.key).toBe('neutral-v1');
  });
});
