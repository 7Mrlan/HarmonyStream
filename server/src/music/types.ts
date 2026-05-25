/*
 * 音乐解析内部类型
 * ----------------
 * Phase D.5 把 provider contract 强化为 manifest + capability + tier，
 * 以便后续接入本地源、外部 resolver、Spotube Bridge 时保持稳定边界。
 * 这些类型仍然只在服务端内部使用，不暴露给 packages/api 公开契约。
 */

import type { Track, TrackCachePolicy, TrackSourceTier } from '@claudio/api';

/*
 * provider 能力维度。
 * 参考 Spotube 插件，但收敛为 Claudio 当前真正消费的能力集合。
 */
export type MusicProviderCapability = 'metadata' | 'audio-source' | 'playlist' | 'scrobbling';

/*
 * provider 类型，用于排障和缓存策略选择。
 * local 本地音源、http 外部 HTTP resolver、bridge Spotube 桥接、fallback 兜底。
 */
export type MusicProviderType = 'local' | 'http' | 'bridge' | 'fallback';

/*
 * provider tier 与 packages/api 共享。
 * owned 自有源、external 第三方稳定源、experimental 显式启用、fallback 保底。
 */
export type MusicProviderTier = TrackSourceTier;

/*
 * provider manifest。
 * 第一版字段集合保持最小：能跑、能排障、能驱动缓存策略。
 */
export interface MusicProviderManifest {
  /* provider 唯一 id，用于日志、reason 和缓存 key。 */
  id: string;
  /* 展示名。 */
  name: string;
  /* provider 自身版本，外部 resolver 升级时方便追踪。 */
  version: string;
  /* provider 类型，用于注册策略和缓存策略。 */
  type: MusicProviderType;
  /* 作者标识，可选。 */
  author?: string;
  /* 简介，可选。 */
  description?: string;
  /* 仓库地址，外部 provider 排障时使用。 */
  repository?: string;
  /* Claudio provider 协议版本号，用于未来兼容性判断。 */
  pluginApiVersion: string;
  /* provider 暴露的能力集合。 */
  capabilities: MusicProviderCapability[];
  /* provider 能力层级，决定缓存与预加载策略。 */
  tier: MusicProviderTier;
  /* 默认 Track 缓存策略，可被单条 Track 覆盖。 */
  defaultCachePolicy: TrackCachePolicy;
  /* 是否允许缓存 artwork 缩略图。 */
  artworkCacheAllowed?: boolean;
  /* 是否允许预加载音频内容。 */
  audioPreloadAllowed?: boolean;
  /* 是否允许持久缓存音频内容（仅自有源应为 true）。 */
  audioCacheAllowed?: boolean;
  /* provider 返回的播放 URL 默认 TTL（毫秒），用于缓存过期判断。 */
  urlTtlMs?: number;
}

export interface MusicSearchInput {
  /* 用户原始输入，用于 provider 搜索或 fallback 选曲。 */
  userText: string;
  /* LLM 推荐的曲名，优先用于精确匹配候选曲。 */
  preferredTitles?: string[];
  /* 最大返回曲目数量。 */
  limit: number;
}

export interface MusicProvider {
  /* provider 自描述。 */
  manifest: MusicProviderManifest;
  /* 可选启动预热：加载脚本、初始化连接等，不应做真实搜索或下载音频。 */
  warmup?: () => Promise<void>;
  /* 搜索并返回可播放曲目；返回值必须已经过滤无 url 结果。 */
  searchPlayableTracks: (input: MusicSearchInput) => Promise<Track[]>;
  /* 运行时是否启用，registry 用它过滤未配置的 provider。 */
  isEnabled?: () => boolean;
}

export interface ResolvedMusicPlan {
  /* 最终可播放队列；用户点歌禁用 fallback 时可能为空。 */
  tracks: Track[];
  /* 是否使用了 fallback catalog。 */
  usedFallback: boolean;
  /* 命中或最终回退的 provider id，用于排障。 */
  providerId: string;
  /* 内部原因说明，用于 fallback reason 和验证，不新增公开协议字段。 */
  reason: string;
}

/* Claudio music provider 协议版本号。 */
export const MUSIC_PROVIDER_API_VERSION = 'claudio-music-1';

export type { TrackCachePolicy };
