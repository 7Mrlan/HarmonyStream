/*
 * NCM 兼容 provider
 * -----------------
 * 通过用户自建的 NeteaseCloudMusicApi 兼容 HTTP 服务搜索并解析可播放曲目。
 * Phase D.5 起 NCM 被显式标记为 experimental tier：
 *   - 仅在用户显式配置 MUSIC_API_BASE_URL 时启用
 *   - 不允许持久缓存音频，URL TTL 短
 *   - 允许 metadata / artwork 短缓存，但不参与音频预热
 */

import type { Track } from '@claudio/api';
import { env } from '../../env.js';
import type { MusicProvider, MusicProviderManifest, MusicSearchInput } from '../types.js';
import { MUSIC_PROVIDER_API_VERSION } from '../types.js';

interface NcmSearchSong {
  id?: number | string;
  name?: string;
  duration?: number;
  dt?: number;
  artists?: Array<{ name?: string; img1v1Url?: string }>;
  ar?: Array<{ name?: string; img1v1Url?: string }>;
  album?: { picUrl?: string };
  al?: { picUrl?: string };
}

interface NcmSearchResponse {
  result?: {
    songs?: NcmSearchSong[];
  };
}

interface NcmSongUrlItem {
  id?: number | string;
  url?: string;
}

interface NcmSongUrlResponse {
  data?: NcmSongUrlItem[];
}

/* NCM provider manifest：experimental tier，URL TTL 90s，禁用音频缓存。 */
const NCM_MANIFEST: MusicProviderManifest = {
  id: 'ncm',
  name: 'NCM Compatible Resolver',
  version: '1.0.0',
  type: 'http',
  description: '用户自建的 NeteaseCloudMusicApi 兼容服务，作为 experimental 来源。',
  pluginApiVersion: MUSIC_PROVIDER_API_VERSION,
  capabilities: ['metadata', 'audio-source'],
  tier: 'experimental',
  defaultCachePolicy: 'no-cache',
  artworkCacheAllowed: true,
  audioPreloadAllowed: false,
  audioCacheAllowed: false,
  urlTtlMs: 90 * 1000,
};

/*
 * 创建 NCM provider。
 * baseUrl 来自服务端私有环境变量，避免移动端接触音乐服务地址和凭据。
 */
export function createNcmProvider(baseUrl: string): MusicProvider {
  return {
    manifest: NCM_MANIFEST,
    isEnabled: () => Boolean(baseUrl?.trim()),
    searchPlayableTracks: (input) => searchPlayableTracks(baseUrl, input),
  };
}

/*
 * 搜索并解析可播放曲目。
 * 分两步走：先 search 拿候选元数据，再 song/url 拿真实播放 URL。
 */
async function searchPlayableTracks(baseUrl: string, input: MusicSearchInput): Promise<Track[]> {
  const keywords = buildSearchKeywords(input);
  const searchUrl = buildUrl(baseUrl, '/search', {
    keywords,
    limit: `${Math.max(input.limit * 2, input.limit)}`,
    type: '1',
  });
  const searchPayload = await requestJson<NcmSearchResponse>(searchUrl);
  const songs = (searchPayload.result?.songs ?? []).filter((song) => song.id !== undefined);
  const ids = songs
    .map((song) => `${song.id}`)
    .filter(Boolean)
    .slice(0, Math.max(input.limit * 2, input.limit));

  if (ids.length === 0) return [];

  const urlPayload = await requestJson<NcmSongUrlResponse>(
    buildUrl(baseUrl, '/song/url', { id: ids.join(',') }),
  );
  const urlById = new Map(
    (urlPayload.data ?? [])
      .filter((item) => item.id !== undefined && typeof item.url === 'string' && item.url.trim())
      .map((item) => [`${item.id}`, item.url?.trim() ?? '']),
  );

  return songs
    .map((song) => normalizeNcmTrack(song, urlById.get(`${song.id}`)))
    .filter((track): track is Track => Boolean(track))
    .slice(0, input.limit);
}

/*
 * 构造搜索关键词。
 * LLM 推荐曲名优先；没有推荐时退回用户原始输入。
 */
function buildSearchKeywords(input: MusicSearchInput): string {
  const preferred = input.preferredTitles?.find((title) => title.trim());
  return (preferred ?? input.userText ?? 'late night drive').trim();
}

/*
 * 规范化 NCM 曲目为共享 Track。
 * 无 url 的条目在这里直接丢弃，避免污染播放器队列。
 * Track.source 标记 provider/tier/cachePolicy，让上层缓存与预加载策略可读。
 */
function normalizeNcmTrack(song: NcmSearchSong, url: string | undefined): Track | null {
  if (!url) return null;

  const title = typeof song.name === 'string' && song.name.trim() ? song.name.trim() : undefined;
  if (!title) return null;

  const artists = song.ar ?? song.artists ?? [];
  const artist = artists
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(' / ');
  const artwork = normalizeArtworkUrl(
    song.al?.picUrl ?? song.album?.picUrl ?? artists.find((item) => item.img1v1Url)?.img1v1Url,
  );
  const durationMs = song.dt ?? song.duration;
  const expiresAt = NCM_MANIFEST.urlTtlMs
    ? new Date(Date.now() + NCM_MANIFEST.urlTtlMs).toISOString()
    : undefined;

  return {
    id: `ncm-${song.id}`,
    url,
    title,
    ...(artist ? { artist } : {}),
    ...(artwork ? { artwork } : {}),
    ...(typeof durationMs === 'number' && durationMs > 0
      ? { duration: Math.round(durationMs / 1000) }
      : {}),
    source: {
      provider: NCM_MANIFEST.id,
      tier: NCM_MANIFEST.tier,
      cachePolicy: NCM_MANIFEST.defaultCachePolicy,
    },
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/*
 * 尝试请求小尺寸封面。
 * NCM 常见图片服务支持 param 参数；不支持时也会忽略该参数并返回原图。
 */
function normalizeArtworkUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const joiner = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${joiner}param=280y280`;
}

/*
 * 构造 provider URL。
 * URLSearchParams 负责编码中文关键词，避免手写字符串拼接。
 */
function buildUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${baseUrl.replace(/\/+$/, '')}${path}?${search.toString()}`;
}

/*
 * 带短超时的 JSON 请求。
 * 音乐 provider 是增强链路，超时后上层会快速回退 fallback。
 */
async function requestJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.MUSIC_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`NCM HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
