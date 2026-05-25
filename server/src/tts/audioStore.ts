/*
 * TTS 音频内存仓库
 * ----------------
 * 接收合成后的音频 buffer，按 id 暂存到内存；TTL/LRU 由 music/cache 工厂复用。
 *   - put：随机 12 位 id；返回 id 让 ttsService 拼 /media/tts/:id
 *   - get：仅在未过期且未被 LRU 淘汰时返回 { buffer; mime }
 *   - 大小上限受 TTS_CACHE_MAX_ENTRIES / TTS_CACHE_TTL_MS 控制
 */

import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { createMusicCache, type MusicCache } from '../music/cache.js';

interface AudioEntry {
  buffer: Buffer;
  mime: string;
}

const store: MusicCache<AudioEntry> = createMusicCache<AudioEntry>({
  maxEntries: env.TTS_CACHE_MAX_ENTRIES,
  defaultTtlMs: env.TTS_CACHE_TTL_MS,
});

/*
 * 写入新音频，返回随机 id。
 * id 取 12 字节随机 hex，碰撞概率可忽略；TTL 缺省时使用 env 配置。
 */
export function putAudio(buffer: Buffer, mime: string, ttlMs?: number): string {
  const id = randomBytes(12).toString('hex');
  store.set(id, { buffer, mime }, ttlMs);
  return id;
}

/*
 * 读取音频；命中且未过期返回 entry，否则 null。
 * mediaRoutes 会用此函数响应 /media/tts/:id。
 */
export function getAudio(id: string): AudioEntry | null {
  const entry = store.get(id);
  return entry ?? null;
}

/*
 * 删除指定 id；ttsService 在 cache key 表清理时调用。
 */
export function deleteAudio(id: string): void {
  store.delete(id);
}

/* 清空（仅测试用）。 */
export function clearAudioStoreForTests(): void {
  store.clear();
}

/*
 * Phase F：进程退出时清理音频缓存。
 * 与 clearAudioStoreForTests 行为相同；分函数命名是为了语义清晰，
 * 避免 graceful shutdown 路径误用 "ForTests" 字样。
 */
export function shutdownAudioStore(): void {
  store.clear();
}

/* 当前条目数，便于排障。 */
export function audioStoreSize(): number {
  return store.size();
}
