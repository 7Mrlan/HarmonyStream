/*
 * 电台推荐 session
 * ----------------
 * 管理本轮推荐意图、短期去重记忆和后台续推；不直接读写 radioState。
 */

import type { Track } from '@claudio/api';
import { resolveTracksForChat } from '../music/musicResolver.js';
import { isSameTitle } from '../music/titleMatch.js';
import type { MusicRequestKind } from './intentParser.js';
import { getTrackKey } from './playbackQueue.js';

export interface RadioSessionIntent {
  userText: string;
  searchText: string;
  preferredTitles: string[];
  requestKind: MusicRequestKind;
  targetQueueSize: number;
  voiceEnabledAtChat: boolean;
}

export interface RadioSessionMemory {
  seenTrackKeys: Set<string>;
  refillInFlight: Promise<void> | null;
}

export interface MaybeRefillQueueInput {
  intent: RadioSessionIntent | null;
  memory: RadioSessionMemory;
  reason: string;
  getQueue: () => Track[];
  getRemainingQueueCount: () => number;
  isIntentCurrent: (intent: RadioSessionIntent) => boolean;
  appendTracks: (tracks: Track[]) => Track[];
  broadcastQueueUpdate: () => void;
}

/*
 * 创建推荐 session 的短期记忆容器。
 */
export function createSessionMemory(): RadioSessionMemory {
  return {
    seenTrackKeys: new Set<string>(),
    refillInFlight: null,
  };
}

/*
 * 创建本轮电台 session 意图。
 * 后台续推只读取这里保存的检索线索，不重新调用 LLM 做意图判断。
 */
export function buildSessionIntent(intent: RadioSessionIntent): RadioSessionIntent {
  return {
    ...intent,
    preferredTitles: [...intent.preferredTitles],
  };
}

/*
 * 按请求类型决定当前 session 的目标队列长度。
 * 单曲保持精准，范围推荐给 3 首，明确歌单给 5 首，控制外部音源压力。
 */
export function getTargetQueueSize(kind: MusicRequestKind): number {
  if (kind === 'explicit') return 1;
  if (kind === 'multi') return 5;
  return 3;
}

/*
 * 新 chat 开始后重置本轮 session 的短期记忆。
 * 初始队列立即写入 seen，避免后台续推把同一批候选重复补回来。
 */
export function resetSessionMemory(memory: RadioSessionMemory, queue: Track[]): void {
  memory.seenTrackKeys.clear();
  memory.refillInFlight = null;
  for (const track of queue) {
    markTrackSeen(memory, track);
  }
}

/* 将曲目标记为当前 session 已见过。 */
export function markTrackSeen(memory: RadioSessionMemory, track: Track | null | undefined): void {
  const key = getTrackKey(track);
  if (key) memory.seenTrackKeys.add(key);
}

/*
 * 后台补队列。
 * 同一时间只允许一个续推任务；失败只写日志，不影响当前播放和切歌返回。
 */
export function maybeRefillQueue(input: MaybeRefillQueueInput): void {
  const { intent, memory } = input;
  if (!intent || intent.requestKind === 'explicit') return;
  if (input.getRemainingQueueCount() >= intent.targetQueueSize) return;
  if (memory.refillInFlight) return;

  const refillTask = runQueueRefill(input, intent).finally(() => {
    if (memory.refillInFlight === refillTask) {
      memory.refillInFlight = null;
    }
  });
  memory.refillInFlight = refillTask;
}

/*
 * 执行真实续推。
 * 这里只做音乐解析和去重，不生成新意图，不等待主播文案。
 */
async function runQueueRefill(input: MaybeRefillQueueInput, intent: RadioSessionIntent): Promise<void> {
  try {
    const missing = Math.max(0, intent.targetQueueSize - input.getRemainingQueueCount());
    if (missing <= 0) return;

    const plan = await resolveTracksForChat({
      userText: intent.searchText || intent.userText,
      preferredTitles: intent.preferredTitles,
      limit: Math.max(missing + input.memory.seenTrackKeys.size, intent.targetQueueSize),
    });
    if (!input.isIntentCurrent(intent)) return;

    const tracksToAppend = selectAppendableTracks({
      memory: input.memory,
      queue: input.getQueue(),
      tracks: plan.tracks,
      targetSize: intent.targetQueueSize,
      remainingQueueCount: input.getRemainingQueueCount(),
    });
    const appended = input.appendTracks(tracksToAppend);
    if (appended.length === 0) return;
    for (const track of appended) {
      markTrackSeen(input.memory, track);
    }

    console.info(`[radio] queue refilled by ${input.reason}: +${appended.length}`);
    input.broadcastQueueUpdate();
  } catch (error) {
    console.warn('[radio] queue refill failed:', error instanceof Error ? error.message : error);
  }
}

export interface SelectAppendableTracksInput {
  memory: RadioSessionMemory;
  queue: Track[];
  tracks: Track[];
  targetSize: number;
  remainingQueueCount: number;
}

/*
 * 从续推结果里筛出可以追加的新曲。
 * 这里只返回结果，不修改播放队列；实际 push 由 radioState facade 完成。
 */
export function selectAppendableTracks(input: SelectAppendableTracksInput): Track[] {
  const existing = new Set(input.queue.map(getTrackKey).filter(Boolean));
  const existingTitles = input.queue.map((track) => track.title);
  const selected: Track[] = [];
  let remainingQueueCount = input.remainingQueueCount;

  for (const track of input.tracks) {
    if (remainingQueueCount >= input.targetSize) break;
    const key = getTrackKey(track);
    if (!key || existing.has(key) || input.memory.seenTrackKeys.has(key)) continue;
    if (existingTitles.some((title) => isSameTitle(title, track.title))) continue;

    selected.push(track);
    existing.add(key);
    existingTitles.push(track.title);
    remainingQueueCount += 1;
  }

  return selected;
}
