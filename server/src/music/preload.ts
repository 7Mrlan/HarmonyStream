/*
 * 预解析调度器
 * ------------
 * Phase D.5 第二批：在主播放流程旁路给“下一首 Track”做轻量预热。
 *   - 并发上限固定为 1，避免外部 provider 被高频请求限流
 *   - 同一 key 的重复任务直接合并，不会重复触发
 *   - 播放队列翻篇时可取消尚未开始的旧任务
 *   - 第一版只做 metadata 级预热：HEAD/GET artwork、本地文件存在性检查
 *   - 不下载音频内容，4G 下也安全；audio 持久缓存属于后续 Phase
 */

import { stat } from 'node:fs/promises';
import type { Track, TrackSourceTier } from '@claudio/api';
import { env } from '../env';
import { findProviderById } from './providerRegistry';
import { findLocalEntryById } from './providers/localProvider';

interface PreloadTask {
  /* 去重 key。 */
  key: string;
  /* 任务执行函数。 */
  run: () => Promise<void>;
  /* 是否已取消。 */
  cancelled: boolean;
}

let queue: PreloadTask[] = [];
let active: PreloadTask | null = null;
let processing = false;

/*
 * 调度一次 Track 预热。
 * tier=fallback 直接忽略；其它 tier 按 manifest 能力决定预热范围。
 */
export function schedulePreload(track: Track | null | undefined): void {
  if (!env.MUSIC_PRELOAD_ENABLED) return;
  if (!track) return;
  if (!track.url) return;

  const key = buildKey(track);
  if (active?.key === key) return;
  if (queue.some((task) => task.key === key)) return;

  const task: PreloadTask = {
    key,
    cancelled: false,
    run: () => warmTrack(track),
  };

  queue.push(task);
  void runQueue();
}

/*
 * 取消队列中尚未执行的预热任务。
 * 当播放队列翻篇时调用，避免后台还在为已经过期的曲目工作。
 */
export function cancelPendingPreloads(): void {
  for (const task of queue) task.cancelled = true;
  queue = [];
}

/*
 * 顺序执行队列。
 * 串行处理，并发=1；每次只取一个任务，完成后再启动下一个。
 */
async function runQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next || next.cancelled) continue;
      active = next;
      try {
        await next.run();
      } catch {
        /* 预热失败不能影响主播放流程，吞掉异常即可。 */
      } finally {
        active = null;
      }
    }
  } finally {
    processing = false;
  }
}

/*
 * 真正的预热动作。
 * 按 tier 与 manifest 能力分级：
 *   - owned：检查本地文件存在性，避免删档后 /media/local/:id 才返回 404
 *   - external / experimental：HEAD artwork URL 让 CDN 提前热身
 */
async function warmTrack(track: Track): Promise<void> {
  const tier = track.source?.tier ?? 'external';
  if (tier === 'fallback') return;

  if (tier === 'owned') {
    await warmOwnedTrack(track);
    return;
  }

  await warmRemoteArtwork(track);
}

/* 本地源：解析 id -> 文件路径 -> stat。 */
async function warmOwnedTrack(track: Track): Promise<void> {
  const libraryDir = env.MUSIC_LIBRARY_DIR;
  if (!libraryDir) return;
  if (!track.id.startsWith('local-')) return;

  const entryId = track.id.slice('local-'.length);
  const entry = await findLocalEntryById(libraryDir, entryId);
  if (!entry) return;

  try {
    await stat(entry.absolutePath);
  } catch {
    /* 不存在就跳过，调用方在真正播放时会拿到 404；预热阶段不需要抛错。 */
  }
}

/* 远程源：HEAD artwork URL，让浏览器/客户端 CDN 缓存提前生效。 */
async function warmRemoteArtwork(track: Track): Promise<void> {
  if (!track.artwork) return;

  const provider = track.source?.provider ? findProviderById(track.source.provider) : null;
  if (provider && provider.manifest.artworkCacheAllowed === false) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.MUSIC_TIMEOUT_MS);

  try {
    await fetch(track.artwork, { method: 'HEAD', signal: controller.signal });
  } catch {
    /* artwork 预热失败属于增强体验，静默处理。 */
  } finally {
    clearTimeout(timeout);
  }
}

/* 用 Track id + url + tier 作为 key。 */
function buildKey(track: Track): string {
  const tier: TrackSourceTier = track.source?.tier ?? 'external';
  return `${tier}::${track.id}::${track.url}`;
}
