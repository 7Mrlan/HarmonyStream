import { describe, expect, it } from 'vitest';
import { createMusicCache } from './cache.js';

describe('createMusicCache', () => {
  it('命中未过期缓存并在过期后淘汰', () => {
    let now = 1_000;
    const evicted: string[] = [];
    const cache = createMusicCache<string>({
      maxEntries: 2,
      defaultTtlMs: 100,
      now: () => now,
      onEvict: (key) => evicted.push(key),
    });

    cache.set('a', 'A');
    expect(cache.get('a')).toBe('A');

    now = 1_101;
    expect(cache.get('a')).toBeUndefined();
    expect(evicted).toEqual(['a']);
  });

  it('超过容量时按 LRU 淘汰最久未使用项', () => {
    let now = 1_000;
    const evicted: string[] = [];
    const cache = createMusicCache<string>({
      maxEntries: 2,
      defaultTtlMs: 1_000,
      now: () => now,
      onEvict: (key) => evicted.push(key),
    });

    cache.set('a', 'A');
    cache.set('b', 'B');
    expect(cache.get('a')).toBe('A');
    now += 1;
    cache.set('c', 'C');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('C');
    expect(evicted).toEqual(['b']);
  });

  it('delete 和 clear 会触发 onEvict 并更新 size', () => {
    const evicted: string[] = [];
    const cache = createMusicCache<string>({
      maxEntries: 3,
      defaultTtlMs: 1_000,
      onEvict: (key) => evicted.push(key),
    });

    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.delete('a');
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(evicted).toEqual(['a', 'b']);
  });
});
