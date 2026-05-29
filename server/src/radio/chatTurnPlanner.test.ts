import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelInfo, Track } from '@claudio/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planChatTurn } from './chatTurnPlanner.js';

type ResolverCall = { preferredSeeds?: Array<{ title: string; artist?: string }> };

const resolverCalls = vi.hoisted<ResolverCall[]>(() => []);

vi.mock('../music/musicResolver.js', () => ({
  resolveTracksForChat: vi.fn(async (input: ResolverCall) => {
    resolverCalls.push(input);
    const seed = input.preferredSeeds?.[0] ?? { title: 'Riverside', artist: 'Agnes Obel' };
    const track: Track = {
      id: `mock-${seed.title}`,
      url: `https://example.test/${encodeURIComponent(seed.title)}.mp3`,
      title: seed.title,
      ...(seed.artist ? { artist: seed.artist } : {}),
    };
    return {
      tracks: [track],
      reason: 'mock resolver',
    };
  }),
}));

vi.mock('../llm/llmAdapter.js', () => ({
  generateDjResponse: vi.fn(async ({ selectedTrack }: { selectedTrack: Track }) => ({
    ok: true,
    response: {
      say: `先放 ${selectedTrack.title}，慢一点陪你。`,
      play: [selectedTrack.title],
      reason: 'mock dj response',
    },
  })),
  generateMusicIntent: vi.fn(async () => ({
    ok: false,
    reason: 'mock llm disabled',
  })),
}));

const TEST_MODEL: ModelInfo = {
  id: 'test-model',
  displayName: 'Test Model',
};

let tempDirs: string[] = [];

/* 测试工具：创建本轮专用用户资料目录，避免污染 ignored 真实资料。 */
async function createProfileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claudio-chat-plan-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resolverCalls.length = 0;
});

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('planChatTurn integration', () => {
  it('穿过 mood-rules.md、Resident DJ 和 resolver，生成可提交队列', async () => {
    const profileDir = await createProfileDir();
    await writeFile(
      join(profileDir, 'mood-rules.md'),
      [
        '- 沮丧陪伴: keywords=沮丧 | tags=低刺激 | comfort=sit-with-you',
        'curve=rise-gently | constraints=别催我振作\n',
      ].join(' | '),
    );
    await writeFile(
      join(profileDir, 'simple-playlists.json'),
      JSON.stringify({
        version: 1,
        sections: [
          {
            name: '夜尾',
            description: '深夜低一点，别太煽情',
            tracks: [
              { name: 'Riverside', artist: 'Agnes Obel' },
              { name: 'Should Have Known Better', artist: 'Sufjan Stevens' },
            ],
          },
        ],
      }),
    );

    const result = await planChatTurn(
      { text: '我今天有点沮丧，来点歌' },
      {
        currentModel: TEST_MODEL,
        playbackState: 'idle',
        currentTrack: null,
        recentTracks: [],
        now: new Date('2026-05-28T23:00:00+08:00'),
        profileDir,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.currentTrack.title).toBe('Riverside');
    expect(result.queue).toHaveLength(1);
    expect(result.personalContext.promptLines.join('\n')).toContain(
      'mood-rules.md 命中：沮丧陪伴',
    );
    expect(result.presence.arc).toBe('soft-hold');
    expect(resolverCalls[0]?.preferredSeeds?.[0]).toMatchObject({
      title: 'Riverside',
      artist: 'Agnes Obel',
    });
  });
});
