/*
 * 音乐 provider 类型出口
 * ----------------------
 * 单独保留这个文件，便于后续增加 Spotify、Apple Music、本地源或 Spotube Bridge adapter。
 */

export type {
  MusicProvider,
  MusicProviderCapability,
  MusicProviderManifest,
  MusicProviderTier,
  MusicProviderType,
  MusicSearchInput,
  ResolvedMusicPlan,
  TrackCachePolicy,
} from '../types';
export { MUSIC_PROVIDER_API_VERSION } from '../types';
