import type { Track } from '@claudio/api';
import { describe, expect, it } from 'vitest';
import {
  buildQueue,
  chooseTrackFromPlay,
  getPlaybackCapabilitiesForState,
} from './playbackQueue.js';

function track(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? `id-${overrides.title ?? 'song'}`,
    url: overrides.url ?? `https://example.com/${overrides.title ?? 'song'}.mp3`,
    title: overrides.title ?? 'Song',
    artist: overrides.artist ?? 'Artist',
    ...overrides,
  };
}

describe('playbackQueue', () => {
  it('buildQueue 将当前曲放在队首并按 id / title 去重', () => {
    const current = track({ id: 'a', title: '晴天' });
    const duplicateById = track({ id: 'a', title: '晴天 Live' });
    const duplicateByTitle = track({ id: 'b', title: '晴天' });
    const next = track({ id: 'c', title: '稻香' });

    const queue = buildQueue(current, [duplicateById, duplicateByTitle, next]);

    expect(queue.map((item) => item.title)).toEqual(['晴天', '稻香']);
    expect(queue[0]).not.toBe(current);
    expect(queue[1]).not.toBe(next);
  });

  it('chooseTrackFromPlay 按 play 曲名从候选里选择并返回拷贝', () => {
    const candidate = track({ id: 'sunny', title: '晴天-周杰伦：你的爱情观是什么样的' });
    const selected = chooseTrackFromPlay(['晴天'], [candidate]);

    expect(selected?.id).toBe('sunny');
    expect(selected).not.toBe(candidate);
  });

  it('chooseTrackFromPlay 匹配不到时返回 null', () => {
    expect(chooseTrackFromPlay(['夜曲'], [track({ title: '晴天' })])).toBeNull();
  });

  it('getPlaybackCapabilitiesForState 计算队首、队中和空队列能力', () => {
    const queue = [track({ id: 'a', title: 'A' }), track({ id: 'b', title: 'B' })];

    expect(getPlaybackCapabilitiesForState({
      currentTrack: queue[0] ?? null,
      queue,
      currentIndex: 0,
      canAutoRefill: true,
    })).toEqual({
      canPrevious: false,
      canNext: true,
      queueSize: 2,
      currentIndex: 0,
      canAutoRefill: true,
    });

    expect(getPlaybackCapabilitiesForState({
      currentTrack: queue[1] ?? null,
      queue,
      currentIndex: 1,
      canAutoRefill: false,
    })).toMatchObject({
      canPrevious: true,
      canNext: false,
      currentIndex: 1,
    });

    expect(getPlaybackCapabilitiesForState({
      currentTrack: null,
      queue: [],
      currentIndex: 99,
      canAutoRefill: true,
    })).toEqual({
      canPrevious: false,
      canNext: false,
      queueSize: 0,
      currentIndex: 0,
      canAutoRefill: true,
    });
  });
});
