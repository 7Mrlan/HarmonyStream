/*
 * TTS 服务入口
 * ------------
 * 把 LLM 输出的 say 文本合成为可播放音频。
 *   - cache key = sha1(text + '|' + voice + '|' + speed).slice(0, 16)
 *   - 命中：直接返回缓存的 audioId
 *   - miss：依次尝试 chain，第一个成功就 putAudio + 写 cache
 *   - 全部失败：返回 null，由调用方决定是否广播 tts-ready
 * 失败完全静默，仅在 metrics 累加。
 */

import { createHash } from 'node:crypto';
import { env } from '../env';
import { createMusicCache, type MusicCache } from '../music/cache';
import { recordCacheHit, recordFallback } from '../music/metrics';
import { deleteAudio, putAudio } from './audioStore';
import { getTtsProviderChain } from './providerRegistry';

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

/*
 * cache key → audioId 映射。
 * audioStore 自身有 LRU 淘汰；这里也走 LRU，并在 evict 时删除 audioStore 对应条目，
 * 避免 cache 表里已经被淘汰的 id 再次返回成"幻觉命中"。
 */
const idCache: MusicCache<string> = createMusicCache<string>({
  maxEntries: env.TTS_CACHE_MAX_ENTRIES,
  defaultTtlMs: env.TTS_CACHE_TTL_MS,
});

/*
 * 主入口：按 chain 合成；命中 cache 时直接返回旧 id。
 * 任何 provider 失败都会记 metrics，最后失败返回 null。
 */
export async function synthesizeForChat(req: TtsRequest): Promise<TtsResolveResult | null> {
  const text = req.text.trim();
  if (!text) return null;

  const voice = req.voice?.trim() || env.TTS_DEFAULT_VOICE;
  const speed = typeof req.speed === 'number' ? req.speed : 1;
  const cacheKey = buildCacheKey(text, voice, speed);

  const cachedId = idCache.get(cacheKey);
  if (cachedId) {
    recordCacheHit('tts');
    return { id: cachedId, mime: 'audio/mpeg', providerId: 'cache' };
  }

  const chain = getTtsProviderChain();
  for (const provider of chain) {
    try {
      const result = await provider.synthesize({ text, voice, speed });
      const id = putAudio(result.audio, result.mime, env.TTS_CACHE_TTL_MS);
      writeIdCache(cacheKey, id);
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
export function buildCacheKey(text: string, voice: string, speed: number): string {
  return createHash('sha1')
    .update(`${text}|${voice}|${speed}`)
    .digest('hex')
    .slice(0, 16);
}

/* 内部：写入 cache 并把上一次命中悬挂的 audioId 一并清理。 */
function writeIdCache(key: string, audioId: string): void {
  const previous = idCache.get(key);
  if (previous && previous !== audioId) {
    deleteAudio(previous);
  }
  idCache.set(key, audioId);
}
