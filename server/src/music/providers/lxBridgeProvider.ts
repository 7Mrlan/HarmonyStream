/*
 * LX-compatible Bridge provider
 * -----------------------------
 * 把外部候选 resolver 产出的 LX musicInfo 交给用户源脚本解析 musicUrl，
 * 再归一化为 Claudio 标准 Track，接入现有 provider chain / cache / fallback。
 */

import type { Track } from '@claudio/api';
import type {
  LxBridgeProviderOptions,
  LxMusicCandidate,
  LxResolvedUrl,
  LxSourceInitResult,
} from '../lxBridge/types.js';
import type { MusicProvider, MusicProviderManifest, MusicSearchInput } from '../types.js';
import { MUSIC_PROVIDER_API_VERSION } from '../types.js';

const LX_MANIFEST: MusicProviderManifest = {
  id: 'lx',
  name: 'LX-compatible Music Source',
  version: '1.1.0',
  type: 'bridge',
  description: '用户自配 LX-compatible 源脚本；候选搜索与 URL 解析分层执行。',
  pluginApiVersion: MUSIC_PROVIDER_API_VERSION,
  capabilities: ['metadata', 'audio-source'],
  tier: 'experimental',
  defaultCachePolicy: 'no-cache',
  artworkCacheAllowed: true,
  audioPreloadAllowed: false,
  audioCacheAllowed: false,
  urlTtlMs: 90 * 1000,
};

type LxManifestOverride = Pick<MusicProviderManifest, 'id' | 'name'> &
  Partial<Pick<MusicProviderManifest, 'description'>>;

interface ResolvedLxBridgeProviderOptions extends LxBridgeProviderOptions {
  manifest: MusicProviderManifest;
}

/* 创建 LX Bridge provider。 */
export function createLxBridgeProvider(options: LxBridgeProviderOptions): MusicProvider {
  const manifest = buildManifest(options);
  return {
    manifest,
    isEnabled: options.isEnabled,
    warmup: () => options.runtime.loadActiveSource().then(() => undefined),
    searchPlayableTracks: (input) => searchPlayableTracks({ ...options, manifest }, input),
  };
}

/* 构造 LX provider manifest，允许多源池暴露不同 provider id 便于排查。 */
function buildManifest(options: LxBridgeProviderOptions): MusicProviderManifest {
  const override = options.manifest as LxManifestOverride | undefined;
  return {
    ...LX_MANIFEST,
    ...(override ?? {}),
    urlTtlMs: options.urlTtlMs,
  };
}

/*
 * 搜索可播放曲目。
 * 任一步失败都抛错给 musicResolver，由上层统一记录 reason 并继续 fallback。
 */
async function searchPlayableTracks(
  options: ResolvedLxBridgeProviderOptions,
  input: MusicSearchInput,
): Promise<Track[]> {
  const initResult = await options.runtime.loadActiveSource();

  const candidates = await options.candidateSearcher.searchCandidates(input);
  const tracks: Track[] = [];
  const maxTracks = Math.max(1, input.limit);

  for (const candidate of candidates) {
    if (tracks.length >= maxTracks) break;
    const track = await resolveCandidateTrack(options, initResult, candidate);
    if (track) tracks.push(track);
  }

  return tracks;
}

/*
 * 按音质优先级解析播放 URL。
 * 默认源 huibq 只声明 320k/128k；换成支持 flac/hires 的源后，只要配置优先级即可自动先试无损。
 */
async function resolveCandidateTrack(
  options: ResolvedLxBridgeProviderOptions,
  initResult: LxSourceInitResult,
  candidate: LxMusicCandidate,
): Promise<Track | null> {
  const qualities = buildQualityAttempts(options.qualityPreference, candidate, initResult);

  for (const quality of qualities) {
    try {
      const resolved = await options.runtime.resolveMusicUrl(candidate, quality);
      const track = resolved ? candidateToTrack(options.manifest, candidate, resolved) : null;
      if (track) return track;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      console.warn(`[music/lx] resolve failed: ${candidate.title} ${quality ?? 'default'}: ${message}`);
      /* 单个音质失败时尝试下一级音质；候选整体失败再交给下一候选。 */
    }
  }

  return null;
}

/* 构造单曲音质尝试顺序，并按用户源声明能力过滤。 */
function buildQualityAttempts(
  qualityPreference: string[],
  candidate: LxMusicCandidate,
  initResult: LxSourceInitResult,
): Array<string | undefined> {
  const supported = initResult.sources[candidate.source]?.qualitys ?? [];
  const supportedSet = new Set(supported);
  const requested = [...qualityPreference, candidate.quality]
    .filter((quality): quality is string => Boolean(quality?.trim()))
    .map((quality) => quality.trim());
  const unique = [...new Set(requested)];
  const filtered = supported.length > 0
    ? unique.filter((quality) => supportedSet.has(quality))
    : unique;

  if (filtered.length > 0) return filtered;
  return candidate.quality ? [candidate.quality] : [undefined];
}

/*
 * 把 LX 解析结果映射成 Claudio Track。
 * URL 已由 worker 校验为 http(s)，这里负责元数据和缓存策略。
 */
function candidateToTrack(
  manifest: MusicProviderManifest,
  candidate: LxMusicCandidate,
  resolved: LxResolvedUrl,
): Track | null {
  if (!resolved.url) return null;

  return {
    id: `lx-${candidate.source}-${candidate.id}`,
    url: resolved.url,
    title: candidate.title,
    ...(candidate.artist ? { artist: candidate.artist } : {}),
    ...(candidate.artwork ? { artwork: candidate.artwork } : {}),
    ...(candidate.durationMs ? { duration: Math.round(candidate.durationMs / 1000) } : {}),
    ...(resolved.quality ? { quality: resolved.quality } : {}),
    source: {
      provider: manifest.id,
      tier: manifest.tier,
      cachePolicy: manifest.defaultCachePolicy,
    },
    ...(resolved.expiresAt ? { expiresAt: resolved.expiresAt } : {}),
  };
}
