/*
 * 播放队列纯函数
 * ----------------
 * 只处理队列构建、曲目匹配、队列快照和按钮能力计算，不读写 radioState。
 */

import type { PlaybackCapabilities, Track } from '@claudio/api';
import { cloneTrack } from '../music/fallbackCatalog.js';
import { isSameTitle } from '../music/titleMatch.js';

export interface PlaybackCapabilitiesInput {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  canAutoRefill: boolean;
}

/*
 * 取曲目去重 key，优先使用稳定 id，没有 id 时退回 URL。
 */
export function getTrackKey(track: Track | null | undefined): string {
  return track?.id || track?.url || '';
}

/*
 * 按 LLM play 字段从候选曲里选择当前曲。
 * 匹配不到时交回调用方使用预选曲，保证队列始终可播放。
 */
export function chooseTrackFromPlay(play: string[], candidateTracks: Track[]): Track | null {
  for (const title of play) {
    const matchedTrack = candidateTracks.find((track) => isSameTitle(track.title, title));
    if (matchedTrack) return cloneTrack(matchedTrack);
  }

  return null;
}

/*
 * 构建当前队列。
 * 选中的当前曲放在队首，剩余候选曲保持 provider 顺序。
 */
export function buildQueue(currentTrack: Track, candidateTracks: Track[]): Track[] {
  const currentKey = getTrackKey(currentTrack);
  const titles = [currentTrack.title];
  const tail: Track[] = [];

  for (const track of candidateTracks) {
    const key = getTrackKey(track);
    if (key && key === currentKey) continue;
    if (titles.some((title) => isSameTitle(title, track.title))) continue;
    titles.push(track.title);
    tail.push(cloneTrack(track));
  }

  return [cloneTrack(currentTrack), ...tail];
}

/*
 * 返回客户端可直接播放的队列快照。
 * currentIndex 之前的历史不推给客户端，上一首由服务端 API 负责，避免前后端索引分叉。
 */
export function getQueueFromIndex(queue: Track[], currentIndex: number): Track[] {
  const startIndex = Math.max(0, Math.min(currentIndex, queue.length));
  return queue.slice(startIndex).map(cloneTrack);
}

/*
 * 计算播放控制能力。
 * 队列模块只接收 canAutoRefill 布尔值，不依赖 session intent 类型，避免循环依赖。
 */
export function getPlaybackCapabilitiesForState(input: PlaybackCapabilitiesInput): PlaybackCapabilities {
  const hasTrack = Boolean(input.currentTrack);
  const queueSize = input.queue.length;
  const currentIndex = Math.max(0, Math.min(input.currentIndex, Math.max(queueSize - 1, 0)));

  return {
    canPrevious: hasTrack && currentIndex > 0,
    canNext: hasTrack && currentIndex + 1 < queueSize,
    queueSize,
    currentIndex,
    canAutoRefill: input.canAutoRefill,
  };
}
