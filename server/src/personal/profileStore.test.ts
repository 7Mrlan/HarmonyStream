import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendListeningEvent, loadUserMusicProfile } from './profileStore.js';

let tempDirs: string[] = [];

async function createProfileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claudio-profile-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('loadUserMusicProfile', () => {
  it('缺少资料目录时返回 empty profile', async () => {
    const profile = await loadUserMusicProfile({
      profileDir: join(tmpdir(), 'missing-claudio-profile'),
    });

    expect(profile.source).toBe('empty');
    expect(profile.tracks).toEqual([]);
    expect(profile.librarySections).toEqual([]);
    expect(profile.libraryInsights).toEqual([]);
    expect(profile.listeningEvents).toEqual([]);
    expect(profile.djMemory).toEqual([]);
    expect(profile.loadedFiles).toEqual([]);
  });

  it('读取 playlists.json 并按 title + artist 去重', async () => {
    const dir = await createProfileDir();
    await writeFile(
      join(dir, 'playlists.json'),
      JSON.stringify([
        { title: '金风玉露', artist: '房东的猫', tags: ['开心', '清晨'], weight: 2 },
        { title: '金风玉露', artist: '房东的猫', tags: ['怀旧'], weight: 1 },
        { title: '', artist: '坏数据' },
      ]),
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(profile.source).toBe('user-data');
    expect(profile.tracks).toHaveLength(1);
    expect(profile.tracks[0]).toMatchObject({
      title: '金风玉露',
      artist: '房东的猫',
      weight: 2,
    });
    expect(profile.tracks[0]?.tags).toEqual(expect.arrayContaining(['开心', '清晨', '怀旧']));
  });

  it('读取 routines.md 和 mood-rules.md 的最小规则', async () => {
    const dir = await createProfileDir();
    await writeFile(
      join(dir, 'routines.md'),
      '- 深夜写代码 | 22-3 | tags=深夜,专注 | tts=低声一点\n',
    );
    await writeFile(
      join(dir, 'mood-rules.md'),
      '- 开心: keywords=开心,快乐 | tags=开心,明亮 | comfort=celebrate | curve=bright | constraints=别说教 | tts=带一点笑意\n',
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(profile.routines[0]).toMatchObject({
      label: '深夜写代码',
      startHour: 22,
      endHour: 3,
      preferredTags: ['深夜', '专注'],
    });
    expect(profile.moodRules[0]).toMatchObject({
      mood: '开心',
      keywords: ['开心', '快乐'],
      preferredTags: ['开心', '明亮'],
      comfortMode: 'celebrate',
      energyCurve: 'bright',
      constraints: ['别说教'],
    });
    expect(profile.moodRules[0]?.ttsStyle?.key).toBe('custom-带一点笑意');
  });

  it('读取 simple-playlists.json 分组歌单并推断轻量标签', async () => {
    const dir = await createProfileDir();
    await writeFile(
      join(dir, 'simple-playlists.json'),
      JSON.stringify({
        version: 1,
        sections: [
          {
            name: '上午轻音乐',
            description: '上午工作前后，轻一点，不抢注意力',
            tracks: [
              { name: 'Open Eye Signal', artist: 'Jon Hopkins' },
              { name: 'Thrown', artist: 'Kiasmos' },
            ],
          },
          {
            name: '会议间歌',
            tracks: [{ name: 'Ylang Ylang', artist: 'FKJ' }],
          },
        ],
      }),
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(profile.loadedFiles).toContain('simple-playlists.json');
    expect(profile.librarySections[0]).toMatchObject({
      name: '上午轻音乐',
      description: '上午工作前后，轻一点，不抢注意力',
      sourceFile: 'simple-playlists.json',
    });
    expect(profile.librarySections[0]?.inferredTags).toEqual(
      expect.arrayContaining(['清晨', '低刺激', '专注']),
    );
    expect(profile.librarySections[0]?.tracks[0]).toMatchObject({
      title: 'Open Eye Signal',
      artist: 'Jon Hopkins',
      sectionName: '上午轻音乐',
    });
    expect(profile.tracks.map((track) => track.title)).toEqual(
      expect.arrayContaining(['Open Eye Signal', 'Thrown', 'Ylang Ylang']),
    );
  });

  it('兼容 qq_songs.json 纯数组导入', async () => {
    const dir = await createProfileDir();
    await writeFile(
      join(dir, 'qq_songs.json'),
      JSON.stringify([
        { name: 'The Apl Song', artist: 'Black Eyed Peas' },
        { name: "You've Got a Friend", artist: 'Carole King' },
      ]),
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(profile.loadedFiles).toContain('qq_songs.json');
    expect(profile.librarySections).toHaveLength(1);
    expect(profile.librarySections[0]).toMatchObject({
      name: '导入歌单',
      sourceFile: 'qq_songs.json',
    });
    expect(profile.librarySections[0]?.tracks.map((track) => track.title)).toEqual([
      'The Apl Song',
      "You've Got a Friend",
    ]);
  });

  it('读取可回滚洞察、听歌事件和长期 DJ 记忆', async () => {
    const dir = await createProfileDir();
    await writeFile(
      join(dir, 'library-insights.json'),
      JSON.stringify({
        insights: [
          {
            id: 'insight-morning',
            summary: '上午偏轻音乐和低刺激',
            tags: ['清晨', '低刺激'],
            sourceEventIds: ['event-1'],
            confidence: 0.8,
          },
        ],
      }),
    );
    await writeFile(
      join(dir, 'dj-memory.json'),
      JSON.stringify({
        preferences: [
          {
            id: 'memory-night',
            summary: '深夜不喜欢太煽情',
            tags: ['深夜'],
            sourceEventIds: ['event-2'],
            confidence: 0.9,
          },
        ],
      }),
    );
    await writeFile(
      join(dir, 'listening-events.jsonl'),
      [
        JSON.stringify({ id: 'event-1', type: 'favorite', title: 'Ylang Ylang', artist: 'FKJ' }),
        JSON.stringify({ id: 'event-2', type: 'skip', title: '苦情歌', text: '别再推这种苦情歌' }),
      ].join('\n'),
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(profile.loadedFiles).toEqual(
      expect.arrayContaining(['library-insights.json', 'dj-memory.json', 'listening-events.jsonl']),
    );
    expect(profile.libraryInsights[0]).toMatchObject({
      id: 'insight-morning',
      summary: '上午偏轻音乐和低刺激',
      sourceEventIds: ['event-1'],
      confidence: 0.8,
    });
    expect(profile.djMemory[0]?.summary).toBe('深夜不喜欢太煽情');
    expect(profile.listeningEvents.map((event) => event.type)).toEqual(['favorite', 'skip']);
  });

  it('追加听歌事件后可被下一轮 profile 读取', async () => {
    const dir = await createProfileDir();

    const event = await appendListeningEvent(
      {
        type: 'favorite',
        title: 'Ylang Ylang',
        artist: 'FKJ',
      },
      {
        profileDir: dir,
        now: () => new Date('2026-05-29T10:00:00+08:00'),
        createId: () => 'event-favorite-1',
      },
    );

    const profile = await loadUserMusicProfile({ profileDir: dir });

    expect(event).toMatchObject({
      id: 'event-favorite-1',
      type: 'favorite',
      title: 'Ylang Ylang',
      artist: 'FKJ',
      at: '2026-05-29T02:00:00.000Z',
    });
    expect(profile.loadedFiles).toContain('listening-events.jsonl');
    expect(profile.listeningEvents[0]).toMatchObject({
      id: 'event-favorite-1',
      type: 'favorite',
      title: 'Ylang Ylang',
    });
  });

  it('拒绝没有文本的 feedback 和没有曲目的普通行为', async () => {
    const dir = await createProfileDir();

    await expect(
      appendListeningEvent({ type: 'feedback', text: '   ' }, { profileDir: dir }),
    ).rejects.toThrow('feedback listening event requires text');
    await expect(appendListeningEvent({ type: 'skip' }, { profileDir: dir })).rejects.toThrow(
      'track listening event requires title or text',
    );
  });
});
