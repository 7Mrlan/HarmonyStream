/*
 * fallback 曲库
 * -------------
 * 真实音乐 provider 不可用时，使用 SoundHelix 开放测试音频保持播放闭环不断。
 * Phase D.5 起把 fallback 也包装成 MusicProvider，统一进入 registry，
 * 这样 musicResolver 的链式回退逻辑可以对所有来源走同一套接口。
 */

import type { Track } from '@claudio/api';
import type { MusicProvider, MusicProviderManifest, MusicSearchInput } from './types.js';
import { MUSIC_PROVIDER_API_VERSION } from './types.js';

export const FALLBACK_TRACKS: Track[] = [
  {
    id: 'soundhelix-1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'Late Night Drive',
    artist: 'SoundHelix',
    duration: 372,
    source: { provider: 'fallback', tier: 'fallback', cachePolicy: 'metadata-only' },
  },
  {
    id: 'soundhelix-2',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'Synthwave Pulse',
    artist: 'SoundHelix',
    duration: 425,
    source: { provider: 'fallback', tier: 'fallback', cachePolicy: 'metadata-only' },
  },
  {
    id: 'soundhelix-8',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    title: 'Pixel Reverie',
    artist: 'SoundHelix',
    duration: 288,
    source: { provider: 'fallback', tier: 'fallback', cachePolicy: 'metadata-only' },
  },
];

/* fallback provider manifest，标明能力为完整可播放但 tier 是 fallback。 */
const FALLBACK_MANIFEST: MusicProviderManifest = {
  id: 'fallback',
  name: 'SoundHelix Fallback',
  version: '1.0.0',
  type: 'fallback',
  description: 'SoundHelix 开放测试音频，仅用于无真实 provider 时的稳定闭环。',
  pluginApiVersion: MUSIC_PROVIDER_API_VERSION,
  capabilities: ['metadata', 'audio-source'],
  tier: 'fallback',
  defaultCachePolicy: 'metadata-only',
  artworkCacheAllowed: false,
  audioPreloadAllowed: false,
  audioCacheAllowed: false,
};

/*
 * 克隆曲目对象。
 * Track 目前是扁平结构，浅拷贝足够隔离内存状态和调用方变更。
 */
export function cloneTrack(track: Track | undefined): Track {
  return {
    ...(track ?? {
      id: 'fallback',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      title: 'Fallback Signal',
      artist: 'Claudio',
      duration: 372,
    }),
  };
}

/*
 * 按输入稳定选择 fallback 曲。
 * 保持 Phase A/C 的可重复特性，便于无 provider 时做回归验证。
 */
export function selectFallbackTrackForText(text: string): Track {
  if (!text) return cloneTrack(FALLBACK_TRACKS[0]);

  const codePointSum = Array.from(text).reduce((total, char) => total + char.charCodeAt(0), 0);
  const index = codePointSum % FALLBACK_TRACKS.length;

  return cloneTrack(FALLBACK_TRACKS[index] ?? FALLBACK_TRACKS[0]);
}

/*
 * 构建 fallback 播放队列。
 * 选中的当前曲放在队首，剩余曲目保持固定顺序。
 */
export function buildFallbackQueue(currentTrack: Track): Track[] {
  const tail = FALLBACK_TRACKS.filter((track) => track.id !== currentTrack.id).map(cloneTrack);
  return [cloneTrack(currentTrack), ...tail];
}

/*
 * 创建 fallback provider。
 * fallback 永远启用，registry 会把它放在 chain 末端。
 */
export function createFallbackProvider(): MusicProvider {
  return {
    manifest: FALLBACK_MANIFEST,
    isEnabled: () => true,
    searchPlayableTracks: async (input: MusicSearchInput) => {
      const head = selectFallbackTrackForText(input.userText);
      const queue = buildFallbackQueue(head);
      return queue.slice(0, Math.max(1, input.limit));
    },
  };
}

export { FALLBACK_MANIFEST };

