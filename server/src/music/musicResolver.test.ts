import { describe, expect, it } from 'vitest';
import { createTestTrack } from '../test/factories.js';
import { mapWithLimitedConcurrency, selectUniqueSeedBatchTracks } from './musicResolver.js';

describe('musicResolver parallel seed helpers', () => {
  it('有限并发映射保持结果顺序，并限制同时运行数量', async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithLimitedConcurrency([1, 2, 3, 4], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      active -= 1;
      return item * 10;
    });

    expect(result).toEqual([10, 20, 30, 40]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('多 seed 结果按 id 或标题去重后提交队列', () => {
    const firstSunny = createTestTrack({ title: '晴天', id: 'same-id' });
    const duplicateById = createTestTrack({ title: '晴天 Live', id: 'same-id' });
    const duplicateByTitle = createTestTrack({ title: '晴天', id: 'other-id' });
    const rice = createTestTrack({ title: '稻香', id: 'rice' });

    const tracks = selectUniqueSeedBatchTracks(
      [
        {
          searchText: '晴天 周杰伦',
          plan: {
            tracks: [firstSunny, duplicateById],
            usedFallback: false,
            providerId: 'test',
            reason: 'first seed',
          },
        },
        {
          searchText: '稻香 周杰伦',
          plan: {
            tracks: [duplicateByTitle, rice],
            usedFallback: false,
            providerId: 'test',
            reason: 'second seed',
          },
        },
      ],
      3,
    );

    expect(tracks.map((track) => track.title)).toEqual(['晴天', '稻香']);
  });
});
