import type { ChatResponse, Track } from '@claudio/api';
import { describe, expect, it } from 'vitest';
import type { MusicLibrarySection, PersonalContext } from './profileTypes.js';
import {
  applyCriticReportToResponse,
  buildResidentDjPlan,
  reviewDjHostResponse,
} from './residentDj.js';

/* 构造测试曲目。 */
function track(title: string, artist?: string): Track {
  return {
    id: `${artist ?? 'artist'}-${title}`,
    url: `https://example.com/${encodeURIComponent(title)}.mp3`,
    title,
    ...(artist ? { artist } : {}),
  };
}

/* 构造简单歌单分组。 */
function section(
  name: string,
  inferredTags: string[],
  tracks: Array<{ name: string; artist?: string }>,
  description?: string,
): MusicLibrarySection {
  return {
    id: `section-${name}`,
    name,
    ...(description ? { description } : {}),
    sourceFile: 'simple-playlists.json',
    inferredTags,
    tracks: tracks.map((item) => ({
      title: item.name,
      ...(item.artist ? { artist: item.artist } : {}),
      sectionName: name,
      sourceFile: 'simple-playlists.json',
      inferredTags,
    })),
  };
}

/* 构造 PersonalContext，聚焦 Resident DJ 纯函数输入。 */
function context(
  sections: MusicLibrarySection[],
  now: Date,
  recentTracks: Track[] = [],
  listeningEvents: PersonalContext['listeningEvents'] = [],
): PersonalContext {
  return {
    profileSource: sections.length > 0 ? 'user-data' : 'empty',
    hasUserData: sections.length > 0,
    tasteSummary: '偏好低刺激、分时段和不抢注意力的音乐。',
    environment: {
      now,
      hour: now.getHours(),
      timeSlot: now.getHours() < 12 ? 'morning' : now.getHours() >= 22 ? 'late-night' : 'daytime',
    },
    candidates: [],
    librarySections: sections,
    libraryInsights: [],
    listeningEvents,
    djMemory: [],
    recentTracks,
    preferredTitles: [],
    promptLines: [],
    ttsStyle: {
      key: 'neutral-v1',
      emotion: '自然',
      styleInstruction: '语气自然',
    },
  };
}

describe('Resident DJ plan', () => {
  it('上午随便听点时优先参考上午轻音乐分组', () => {
    const plan = buildResidentDjPlan({
      userText: '随便来点',
      requestKind: 'range',
      personalContext: context(
        [
          section('夜尾', ['深夜', '低刺激'], [
            { name: 'Riverside', artist: 'Agnes Obel' },
          ]),
          section(
            '上午轻音乐',
            ['清晨', '低刺激', '专注'],
            [
              { name: 'Open Eye Signal', artist: 'Jon Hopkins' },
              { name: 'Thrown', artist: 'Kiasmos' },
            ],
            '上午工作前后，轻一点，不抢注意力',
          ),
        ],
        new Date('2026-05-28T09:00:00+08:00'),
      ),
    });

    expect(plan.evidence[0]).toMatchObject({ type: 'section', label: '上午轻音乐' });
    expect(plan.curatedCandidates.map((candidate) => candidate.reason).join('\n')).toContain(
      '上午轻音乐',
    );
    expect(plan.curatedCandidates[0]?.source).toBe('from-user-library');
  });

  it('会议后疲惫时命中会议间歌分组语义', () => {
    const plan = buildResidentDjPlan({
      userText: '刚开完会，有点累',
      requestKind: 'range',
      personalContext: context(
        [
          section('上午轻音乐', ['清晨', '低刺激'], [
            { name: 'Open Eye Signal', artist: 'Jon Hopkins' },
          ]),
          section('会议间歌', ['会议间', '低刺激'], [
            { name: 'Ylang Ylang', artist: 'FKJ' },
            { name: 'Harvest Moon', artist: 'Poolside' },
          ]),
        ],
        new Date('2026-05-28T15:00:00+08:00'),
      ),
    });

    expect(plan.turnPlan.comfortMode).toBe('focus-with-you');
    expect(plan.evidence[0]?.label).toBe('会议间歌');
    expect(plan.curatedCandidates[0]?.reason).toContain('会议间歌');
  });

  it('难过时边聊边播，且不同资料不会固定到同一首伤感歌', () => {
    const morningPlan = buildResidentDjPlan({
      userText: '我有点难过',
      requestKind: 'range',
      personalContext: context(
        [
          section('上午轻音乐', ['清晨', '低刺激'], [
            { name: 'Open Eye Signal', artist: 'Jon Hopkins' },
            { name: 'Raven', artist: 'GoGo Penguin' },
          ]),
        ],
        new Date('2026-05-28T09:00:00+08:00'),
      ),
    });
    const nightPlan = buildResidentDjPlan({
      userText: '我有点难过',
      requestKind: 'range',
      personalContext: context(
        [
          section('夜尾', ['深夜', '低刺激'], [
            { name: 'Riverside', artist: 'Agnes Obel' },
            { name: 'Should Have Known Better', artist: 'Sufjan Stevens' },
          ]),
        ],
        new Date('2026-05-28T23:00:00+08:00'),
      ),
    });

    expect(morningPlan.turnPlan.intent).toBe('chat-and-play');
    expect(morningPlan.turnPlan.comfortMode).toBe('sit-with-you');
    expect(morningPlan.curatedCandidates.length).toBeGreaterThan(0);
    expect(morningPlan.curatedCandidates.map((candidate) => candidate.title)).not.toEqual(
      nightPlan.curatedCandidates.map((candidate) => candidate.title),
    );
    expect(morningPlan.curatedCandidates.map((candidate) => candidate.title)).not.toContain(
      '突然好想你',
    );
  });

  it('高兴请求使用 celebrate 或 bright 曲线一起共振', () => {
    const plan = buildResidentDjPlan({
      userText: '今天好爽，想听点开心的',
      requestKind: 'range',
      personalContext: context(
        [
          section('运动 · 心率', ['运动', '开心'], [
            { name: 'A Moment Apart', artist: 'ODESZA' },
            { name: 'You & Me', artist: 'Disclosure' },
          ]),
        ],
        new Date('2026-05-28T18:00:00+08:00'),
      ),
    });

    expect(plan.turnPlan.comfortMode).toBe('celebrate');
    expect(plan.turnPlan.energyCurve).toBe('bright');
    expect(plan.turnPlan.constraints.join('\n')).toContain('可以一起开心');
  });

  it('跳过事件会降低同名歌曲信任分，避免继续硬推', () => {
    const plan = buildResidentDjPlan({
      userText: '上午随便来点',
      requestKind: 'range',
      personalContext: context(
        [
          section(
            '上午轻音乐',
            ['清晨', '低刺激'],
            [
              { name: 'Open Eye Signal', artist: 'Jon Hopkins' },
              { name: 'Thrown', artist: 'Kiasmos' },
            ],
          ),
        ],
        new Date('2026-05-28T09:00:00+08:00'),
        [],
        [
          {
            id: 'event-skip-open-eye',
            type: 'skip',
            title: 'Open Eye Signal',
            artist: 'Jon Hopkins',
            sourceEventIds: [],
          },
        ],
      ),
    });

    expect(plan.curatedCandidates[0]?.title).toBe('Thrown');
    expect(plan.evidence.some((item) => item.type === 'event')).toBe(true);
  });

  it('Critic 会拦截假装懂用户和治疗承诺，并降级主播文案', () => {
    const response: ChatResponse = {
      say: '我懂你所有故事，这首一定治愈你。',
      play: ['Riverside'],
    };
    const report = reviewDjHostResponse({
      response,
      selectedTrack: track('Riverside', 'Agnes Obel'),
      hasUserData: false,
    });
    const reviewed = applyCriticReportToResponse(response, report, track('Riverside', 'Agnes Obel'));

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining(['假装完全理解用户经历', '承诺治疗或确定性疗效']),
    );
    expect(reviewed.say).not.toContain('一定治愈');
    expect(reviewed.play).toEqual(['Riverside']);
  });
});
