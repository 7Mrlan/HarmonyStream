import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestTrack } from '../test/factories.js';
import { assemblePersonalContext } from './contextAssembler.js';

let tempDirs: string[] = [];

async function createProfileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claudio-context-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('assemblePersonalContext', () => {
  it('组装个人候选、时段、最近播放和 promptLines', async () => {
    const dir = await createProfileDir();
    await writeFile(join(dir, 'taste.md'), '喜欢清爽、明亮、不端着的华语流行。');
    await writeFile(
      join(dir, 'playlists.json'),
      JSON.stringify([{ title: '金风玉露', artist: '房东的猫', tags: ['开心', '明亮'] }]),
    );
    await writeFile(
      join(dir, 'simple-playlists.json'),
      JSON.stringify({
        sections: [
          {
            name: '上午轻音乐',
            description: '上午工作前后，轻一点',
            tracks: [{ name: 'Open Eye Signal', artist: 'Jon Hopkins' }],
          },
        ],
      }),
    );
    await writeFile(
      join(dir, 'mood-rules.md'),
      '- 开心: keywords=开心 | tags=开心,明亮 | tts=带一点笑意\n',
    );

    const context = await assemblePersonalContext({
      userText: '想听开心的歌',
      currentTrack: createTestTrack('上一首'),
      recentTracks: [createTestTrack('刚听过')],
      now: new Date('2026-05-28T09:00:00+08:00'),
      profileDir: dir,
    });

    expect(context.hasUserData).toBe(true);
    expect(context.preferredTitles).toEqual(expect.arrayContaining(['金风玉露']));
    expect(context.librarySections[0]?.name).toBe('上午轻音乐');
    expect(context.promptLines.join('\n')).toContain('个人候选');
    expect(context.promptLines.join('\n')).toContain('简单歌单分组');
    expect(context.promptLines.join('\n')).toContain('Open Eye Signal');
    expect(context.promptLines.join('\n')).toContain('最近播放');
    expect(context.ttsStyle.key).toBe('custom-带一点笑意');
  });

  it('无资料时明确禁止假装了解用户', async () => {
    const context = await assemblePersonalContext({
      userText: '想听开心的歌',
      currentTrack: null,
      recentTracks: [],
      now: new Date('2026-05-28T09:00:00+08:00'),
      profileDir: join(tmpdir(), 'missing-claudio-context'),
    });

    expect(context.hasUserData).toBe(false);
    expect(context.preferredTitles).toEqual([]);
    expect(context.promptLines.join('\n')).toContain('暂无本机用户音乐资料');
    expect(context.promptLines.join('\n')).toContain('禁止假装了解用户资料');
  });
});
