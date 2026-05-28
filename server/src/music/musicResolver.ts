/*
 * 音乐解析入口
 * ------------
 * Phase D.5：把单 provider 调用改为 provider chain。
 *   - 命中优先 provider 立刻返回；失败则继续下一个 provider，最终 fallback
 *   - 解析结果按 (provider id + 关键词 + limit) 缓存到内存，避免 /api/chat 反复打外部源
 *   - chain 内部错误不会抛出，只在内部 reason 中保留排障信息
 */

import type { Track } from '@claudio/api';
import { env } from '../env.js';
import { createMusicCache, type MusicCache } from './cache.js';
import { cloneTrack, FALLBACK_TRACKS } from './fallbackCatalog.js';
import { measureProviderCall, recordCacheHit, recordFallback } from './metrics.js';
import { getProviderChain } from './providerRegistry.js';
import { isSameTitle } from './titleMatch.js';
import type { MusicProvider, MusicSearchSeed, ResolvedMusicPlan } from './types.js';

export interface ResolveTracksForChatInput {
  /* 用户原始输入。 */
  userText: string;
  /* LLM 推荐曲名，推荐后重排时使用。 */
  preferredTitles?: string[];
  /* 个人资料候选；内部用 artist 构造更准的搜索词，不改变 provider contract。 */
  preferredSeeds?: MusicSearchSeed[];
  /* 最大队列长度。 */
  limit?: number;
  /* 是否允许把静态 fallback 曲目作为播放结果。用户点歌默认不允许。 */
  allowFallback?: boolean;
}

/* provider 解析结果共享缓存。所有 chain 命中都走它。 */
const resolveCache: MusicCache<Track[]> = createMusicCache<Track[]>({
  maxEntries: env.MUSIC_CACHE_MAX_ENTRIES,
  defaultTtlMs: env.MUSIC_CACHE_DEFAULT_TTL_MS,
});

/*
 * Phase F：graceful shutdown 时清空 resolve cache。
 * 进程退出后内存自然释放；显式 clear 是为了在多进程或热重载场景下不留尾。
 */
export function shutdownMusicResolver(): void {
  resolveCache.clear();
}

/*
 * 为聊天请求解析候选曲目。
 * provider chain 任意环节成功即返回；全部失败时使用 fallback provider 兜底。
 */
export async function resolveTracksForChat({
  userText,
  preferredTitles,
  preferredSeeds,
  limit = 3,
  allowFallback = false,
}: ResolveTracksForChatInput): Promise<ResolvedMusicPlan> {
  const seeds = normalizePreferredSeeds(preferredSeeds, preferredTitles);
  if (seeds.length > 1 && limit > 1) {
    return resolvePreferredSeedBatch({ userText, preferredSeeds: seeds, limit, allowFallback });
  }

  const chain = getProviderChain();
  const reasons: string[] = [];

  for (const provider of chain) {
    if (provider.manifest.tier === 'fallback' && !allowFallback) {
      reasons.push('fallback 已禁用，避免把测试曲当作真实点歌结果');
      continue;
    }

    try {
      const cached = readCache(provider, userText, preferredTitles, limit);
      if (cached) {
        recordCacheHit(provider.manifest.id);
        return buildPlan(provider, cached, false, `${provider.manifest.id} cache hit`);
      }

      const tracks = await measureProviderCall(provider.manifest.id, () =>
        provider.searchPlayableTracks({
          userText,
          preferredTitles: preferredTitles ?? seeds.map((seed) => seed.title),
          limit,
        }),
      );
      const normalized = dedupePlayableTracks(tracks).slice(0, limit);

      if (normalized.length === 0) {
        recordFallback(provider.manifest.id);
        reasons.push(`${provider.manifest.id} 无可播放结果`);
        continue;
      }

      const ordered = orderTracksByPreferredTitles(
        normalized,
        preferredTitles ?? seeds.map((seed) => seed.title),
      );
      writeCache(provider, userText, preferredTitles, limit, ordered);
      return buildPlan(
        provider,
        ordered,
        provider.manifest.tier === 'fallback',
        reasons.length === 0
          ? `${provider.manifest.id} 返回 ${ordered.length} 首可播放曲目`
          : `${provider.manifest.id} 返回 ${ordered.length} 首；前序回退：${reasons.join('；')}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      recordFallback(provider.manifest.id);
      reasons.push(`${provider.manifest.id} 失败：${message}`);
      continue;
    }
  }

  if (!allowFallback) {
    return {
      tracks: [],
      usedFallback: true,
      providerId: 'none',
      reason: reasons.length > 0 ? reasons.join('；') : 'provider chain 没有返回真实可播放结果',
    };
  }

  /* 仅在调用方显式允许时，才使用静态 demo 曲兜底。 */
  const safe = FALLBACK_TRACKS.slice(0, Math.max(1, limit)).map(cloneTrack);
  return {
    tracks: safe,
    usedFallback: true,
    providerId: 'fallback',
    reason: reasons.length > 0 ? reasons.join('；') : 'provider chain 为空，使用静态 fallback',
  };
}

/*
 * 多首推荐时逐个 preferred seed 解析。
 * 这样能避免音乐源围绕单个关键词返回多个版本，保证情绪 / 歌单请求更像真实队列。
 */
async function resolvePreferredSeedBatch({
  userText,
  preferredSeeds,
  limit,
  allowFallback,
}: Required<Pick<ResolveTracksForChatInput, 'userText' | 'limit' | 'allowFallback'>> & {
  preferredSeeds: MusicSearchSeed[];
}): Promise<ResolvedMusicPlan> {
  const collected: Track[] = [];
  const reasons: string[] = [];

  for (const seed of preferredSeeds) {
    if (collected.length >= limit) break;
    const searchText = [seed.title, seed.artist].filter(Boolean).join(' ');
    const plan = await resolveTracksForChat({
      userText: searchText || seed.title,
      preferredTitles: [seed.title],
      limit: 1,
      allowFallback,
    });
    reasons.push(`${searchText || seed.title}: ${plan.reason}`);

    for (const track of plan.tracks) {
      if (collected.length >= limit) break;
      if (
        collected.some(
          (item) =>
            getTrackKey(item) === getTrackKey(track) || isSameTitle(item.title, track.title),
        )
      ) {
        continue;
      }
      collected.push(cloneTrack(track));
    }
  }

  if (collected.length > 0) {
    return {
      tracks: collected,
      usedFallback: false,
      providerId: collected[0]?.source?.provider ?? 'mixed',
      reason: `preferred title batch 返回 ${collected.length} 首；${reasons.join('；')}`,
    };
  }

  return resolveTracksForChat({
    userText,
    preferredSeeds: preferredSeeds.slice(0, 1),
    preferredTitles: preferredSeeds.slice(0, 1).map((seed) => seed.title),
    limit,
    allowFallback,
  });
}

/* 把 preferredTitles / preferredSeeds 合并为带 artist 的内部搜索种子。 */
function normalizePreferredSeeds(
  preferredSeeds: MusicSearchSeed[] | undefined,
  preferredTitles: string[] | undefined,
): MusicSearchSeed[] {
  const seeds = [...(preferredSeeds ?? [])];
  for (const title of preferredTitles ?? []) {
    if (!seeds.some((seed) => isSameTitle(seed.title, title))) {
      seeds.push({ title });
    }
  }

  return seeds
    .map((seed) => ({
      title: seed.title.trim(),
      ...(seed.artist?.trim() ? { artist: seed.artist.trim() } : {}),
    }))
    .filter((seed) => seed.title.length > 0);
}

/* 缓存读取。 */
function readCache(
  provider: MusicProvider,
  userText: string,
  preferredTitles: string[] | undefined,
  limit: number,
): Track[] | undefined {
  const value = resolveCache.get(buildCacheKey(provider, userText, preferredTitles, limit));
  if (!value) return undefined;
  return value.map(cloneTrack);
}

/* 缓存写入。manifest 上的 urlTtlMs 优先；不存在时使用全局默认 TTL。 */
function writeCache(
  provider: MusicProvider,
  userText: string,
  preferredTitles: string[] | undefined,
  limit: number,
  tracks: Track[],
): void {
  if (provider.manifest.tier === 'fallback') return;
  const ttl = provider.manifest.urlTtlMs ?? env.MUSIC_CACHE_DEFAULT_TTL_MS;
  resolveCache.set(
    buildCacheKey(provider, userText, preferredTitles, limit),
    tracks.map(cloneTrack),
    ttl,
  );
}

/* 组合缓存 key：provider id + 版本 + 归一化关键词 + limit。 */
function buildCacheKey(
  provider: MusicProvider,
  userText: string,
  preferredTitles: string[] | undefined,
  limit: number,
): string {
  const normalizedTitles = (preferredTitles ?? [])
    .map((title) => title.trim().toLowerCase())
    .filter((title) => title.length > 0)
    .sort()
    .join('|');
  const normalizedText = userText.trim().toLowerCase();
  return `${provider.manifest.id}@${provider.manifest.version}::${limit}::${normalizedText}::${normalizedTitles}`;
}

/* 构造 ResolvedMusicPlan。 */
function buildPlan(
  provider: MusicProvider,
  tracks: Track[],
  usedFallback: boolean,
  reason: string,
): ResolvedMusicPlan {
  return {
    tracks: tracks.map(cloneTrack),
    usedFallback,
    providerId: provider.manifest.id,
    reason,
  };
}

/*
 * 去重并确保所有条目都有可播放 URL。
 * 服务端只向播放器队列提交可播放 Track。
 */
function dedupePlayableTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];

  for (const track of tracks) {
    if (!track.url) continue;
    const key = track.id || track.url;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneTrack(track));
  }

  return result;
}

/* provider 结果去重 key，优先 id，缺失时用 URL。 */
function getTrackKey(track: Track): string {
  return track.id || track.url;
}

/*
 * LLM 给出 play 后，优先把同名曲目排到队首。
 * 匹配失败时保持 provider 原顺序，避免丢失可播放结果。
 */
function orderTracksByPreferredTitles(
  tracks: Track[],
  preferredTitles: string[] | undefined,
): Track[] {
  if (!preferredTitles || preferredTitles.length === 0) return tracks.map(cloneTrack);

  const ordered: Track[] = [];
  const remaining = tracks.map(cloneTrack);

  for (const title of preferredTitles) {
    const index = remaining.findIndex((track) => isSameTitle(track.title, title));
    if (index === -1) continue;
    const [matched] = remaining.splice(index, 1);
    if (matched) ordered.push(matched);
  }

  return [...ordered, ...remaining];
}

export { FALLBACK_TRACKS };
