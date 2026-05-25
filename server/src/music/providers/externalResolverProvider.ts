/*
 * 外部 HTTP resolver provider
 * ---------------------------
 * 通过用户自建的 HTTP 服务做曲目搜索 / 解析。约定端点：
 *   POST {base}/search   { userText, preferredTitles, limit } -> { tracks }
 *   POST {base}/resolve  { id }                               -> { url, expiresAt? }
 *   GET  {base}/manifest                                      -> manifest
 * 服务端只在进程边界做 zod 校验，不执行外部脚本，避免插件崩溃拖垮主服务。
 */

import type { Track } from '@claudio/api';
import { z } from 'zod';
import { env } from '../../env.js';
import type {
  MusicProvider,
  MusicProviderManifest,
  MusicSearchInput,
} from '../types.js';
import { MUSIC_PROVIDER_API_VERSION } from '../types.js';

/* 默认 manifest，外部 resolver 可通过 GET /manifest 覆盖部分字段。 */
const DEFAULT_MANIFEST: MusicProviderManifest = {
  id: 'external',
  name: 'External Music Resolver',
  version: '1.0.0',
  type: 'http',
  description: '用户自建的 HTTP resolver，由 Claudio 在进程边界消费。',
  pluginApiVersion: MUSIC_PROVIDER_API_VERSION,
  capabilities: ['metadata', 'audio-source'],
  tier: 'external',
  defaultCachePolicy: 'metadata-only',
  artworkCacheAllowed: true,
  audioPreloadAllowed: false,
  audioCacheAllowed: false,
  urlTtlMs: 5 * 60 * 1000,
};

/* zod schema：track 必须包含可播放 url 才算可信。 */
const TrackSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  artist: z.string().optional(),
  artwork: z.string().url().optional(),
  duration: z.number().positive().optional(),
  expiresAt: z.string().optional(),
});

const SearchResponseSchema = z.object({
  tracks: z.array(TrackSchema).default([]),
});

/*
 * 创建外部 resolver provider。
 * baseUrl 缺失或非法时直接禁用，registry 不会把它选入 chain。
 */
export function createExternalResolverProvider(baseUrl: string): MusicProvider {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');

  return {
    manifest: DEFAULT_MANIFEST,
    isEnabled: () => Boolean(normalizedBase),
    searchPlayableTracks: async (input) => searchPlayableTracks(normalizedBase, input),
  };
}

/*
 * 调用外部 resolver 搜索可播放曲目。
 * 失败、超时或 schema 校验失败统一抛错，由 musicResolver 决定是否回退。
 */
async function searchPlayableTracks(
  baseUrl: string,
  input: MusicSearchInput,
): Promise<Track[]> {
  if (!baseUrl) return [];

  const payload = await postJson(baseUrl, '/search', {
    userText: input.userText,
    preferredTitles: input.preferredTitles ?? [],
    limit: input.limit,
  });
  const parsed = SearchResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('external resolver 响应不符合 schema');
  }

  return parsed.data.tracks
    .map((track) => normalizeTrack(track))
    .filter((track): track is Track => Boolean(track))
    .slice(0, Math.max(1, input.limit));
}

/*
 * 规范化外部 track 为共享 Track。
 * 缺 url 的条目直接丢弃；source 字段由 Claudio 注入，不信任 resolver 自报。
 */
function normalizeTrack(track: z.infer<typeof TrackSchema>): Track | null {
  if (!track.url) return null;

  return {
    id: `external-${track.id}`,
    url: track.url,
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.artwork ? { artwork: track.artwork } : {}),
    ...(track.duration ? { duration: Math.round(track.duration) } : {}),
    source: {
      provider: DEFAULT_MANIFEST.id,
      tier: DEFAULT_MANIFEST.tier,
      cachePolicy: DEFAULT_MANIFEST.defaultCachePolicy,
    },
    ...(track.expiresAt ? { expiresAt: track.expiresAt } : {}),
  };
}

/*
 * POST JSON。
 * 使用短超时控制，避免外部 resolver 抖动阻塞 /api/chat 主链路。
 */
async function postJson(baseUrl: string, path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_MUSIC_RESOLVER_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`external resolver HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
