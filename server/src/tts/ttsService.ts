/*
 * TTS 服务入口
 * ------------
 * 把 LLM 输出的 say 文本合成为可播放音频。
 *   - cache key = sha1(provider + '|' + text + '|' + voice + '|' + speed).slice(0, 16)
 *   - 命中：直接返回缓存的 audioId
 *   - miss：依次尝试 chain，第一个成功就 putAudio + 写 cache
 *   - 全部失败：返回 null，由调用方决定是否广播 tts-ready
 * 失败完全静默，仅在 metrics 累加。
 */

import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { createMusicCache, type MusicCache } from '../music/cache.js';
import { recordCacheHit, recordFallback } from '../music/metrics.js';
import { deleteAudio, getAudio, putAudio } from './audioStore.js';
import { getTtsProviderChain } from './providerRegistry.js';

export interface TtsRequest {
  /* 待合成文本。 */
  text: string;
  /* 音色，可选；缺省走默认。 */
  voice?: string;
  /* 语速，可选。 */
  speed?: number;
}

export interface TtsResolveResult {
  /* audioStore 内部 id。 */
  id: string;
  /* MIME 类型，例如 audio/mpeg。 */
  mime: string;
  /* 实际命中或合成时使用的 provider。 */
  providerId: string;
}

interface TtsCacheEntry {
  id: string;
  mime: string;
  providerId: string;
}

/* 工具：MusicCache 的 onEvict 使用 unknown，这里只释放本服务写入的音频条目。 */
function isTtsCacheEntry(value: unknown): value is TtsCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TtsCacheEntry>;
  return typeof entry.id === 'string';
}

/*
 * cache key → 音频元信息映射。
 * audioStore 自身有 LRU 淘汰；这里也走 LRU，并在 evict 时删除 audioStore 对应条目，
 * 避免 cache 表里已经被淘汰的 id 再次返回成"幻觉命中"。
 */
const idCache: MusicCache<TtsCacheEntry> = createMusicCache<TtsCacheEntry>({
  maxEntries: env.TTS_CACHE_MAX_ENTRIES,
  defaultTtlMs: env.TTS_CACHE_TTL_MS,
  onEvict: (_key, entry) => {
    if (isTtsCacheEntry(entry)) deleteAudio(entry.id);
  },
});

/*
 * 主入口：按 chain 合成；命中 cache 时直接返回旧 id。
 * 任何 provider 失败都会记 metrics，最后失败返回 null。
 */
export async function synthesizeForChat(req: TtsRequest): Promise<TtsResolveResult | null> {
  const text = req.text.trim();
  if (!text) return null;

  const requestedVoice = req.voice?.trim();
  const speed = typeof req.speed === 'number' ? req.speed : 1;

  const chain = getTtsProviderChain();
  for (const provider of chain) {
    const voice = requestedVoice || provider.manifest.defaultVoice;
    const provisionalCacheKey = buildCacheKey(provider.manifest.id, text, voice, speed);
    const cachedEntry = idCache.get(provisionalCacheKey);
    if (cachedEntry) {
      const cached = getAudio(cachedEntry.id);
      if (cached) {
        recordCacheHit('tts');
        return {
          id: cachedEntry.id,
          mime: cached.mime,
          providerId: `cache:${cachedEntry.providerId}`,
        };
      }
    }

    try {
      const result = await provider.synthesize({ text, voice, speed });
      const cacheKey = buildCacheKey(provider.manifest.id, text, result.voice, speed);
      const id = putAudio(result.audio, result.mime, env.TTS_CACHE_TTL_MS);
      const cacheEntry = { id, mime: result.mime, providerId: provider.manifest.id };
      writeIdCache(cacheKey, cacheEntry);
      if (cacheKey !== provisionalCacheKey) writeIdCache(provisionalCacheKey, cacheEntry);
      return { id, mime: result.mime, providerId: provider.manifest.id };
    } catch (error) {
      console.warn(
        `[tts] provider=${provider.manifest.id} failed:`,
        error instanceof Error ? error.message : error,
      );
      recordFallback(`tts:${provider.manifest.id}`);
      continue;
    }
  }

  return null;
}

/* 暴露 cache key 构建函数，便于后续单元测试。 */
export function buildCacheKey(providerId: string, text: string, voice: string, speed: number): string {
  return createHash('sha1')
    .update(`${providerId}|${text}|${voice}|${speed}`)
    .digest('hex')
    .slice(0, 16);
}

/* 内部：写入 id cache；旧 id 的清理由 cache onEvict 统一处理。 */
function writeIdCache(key: string, entry: TtsCacheEntry): void {
  idCache.set(key, entry);
}
