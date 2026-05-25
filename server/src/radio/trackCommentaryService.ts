/*
 * 切歌短播报服务
 * ----------------
 * 管理切歌播报缓存、过期 token、LLM fallback 和 track-aware TTS。
 */

import type { ChatResponse, ModelInfo, Track } from '@claudio/api';
import { generateTrackCommentary } from '../llm/llmAdapter.js';
import { scheduleTrackTts } from '../tts/scheduler.js';
import { buildTrackSwitchChatResponse } from './djCopy.js';
import { getTrackKey } from './playbackQueue.js';
import type { RadioSessionIntent } from './radioSession.js';

export interface TrackCommentaryMemory {
  cache: Map<string, ChatResponse>;
  token: string | null;
}

export interface ScheduleTrackCommentaryInput {
  memory: TrackCommentaryMemory;
  track: Track;
  cause: 'next' | 'previous';
  intent: RadioSessionIntent | null;
  currentModel: ModelInfo;
  isCurrentTrackKey: (trackKey: string) => boolean;
  broadcast: (trackId: string, response: ChatResponse) => void;
  pushMessage: (response: ChatResponse) => void;
}

/*
 * 创建切歌播报的内存容器。
 */
export function createTrackCommentaryMemory(): TrackCommentaryMemory {
  return {
    cache: new Map<string, ChatResponse>(),
    token: null,
  };
}

/*
 * 清空切歌播报缓存和过期 token。
 * 新 chat 或无曲目状态会重置播报上下文，避免旧歌文案串台。
 */
export function resetTrackCommentaryMemory(memory: TrackCommentaryMemory): void {
  memory.cache.clear();
  memory.token = null;
}

/*
 * 调度切歌短播报。
 * 播报是附加体验：不阻塞切歌，不阻塞队列续推，任何失败都静默回退或丢弃。
 */
export function scheduleTrackCommentary(input: ScheduleTrackCommentaryInput): void {
  const { intent, memory, track } = input;
  if (!intent) return;

  const trackKey = getTrackKey(track);
  if (!trackKey) return;

  const cached = memory.cache.get(trackKey);
  if (cached) {
    setTimeout(() => {
      if (!input.isCurrentTrackKey(trackKey)) return;
      input.broadcast(trackKey, cached);
      if (intent.voiceEnabledAtChat) {
        scheduleTrackTts(cached.say, trackKey, () => input.isCurrentTrackKey(trackKey));
      }
    }, 0);
    return;
  }

  memory.token = `${trackKey}:${Date.now()}`;
  const token = memory.token;
  void runTrackCommentary(input, trackKey, token);
}

/*
 * 生成并广播切歌短播报。
 * 先尝试 LLM，失败时使用 djCopy 模板；广播前后都检查 token，避免旧歌播报迟到。
 */
async function runTrackCommentary(
  input: ScheduleTrackCommentaryInput,
  trackKey: string,
  token: string,
): Promise<void> {
  const { intent, memory, track, currentModel, cause } = input;
  if (!intent) return;

  try {
    const generated = await generateTrackCommentary({
      userText: intent.userText,
      modelId: currentModel.id,
      modelDisplayName: currentModel.displayName,
      currentTrack: null,
      selectedTrack: track,
      cause,
    });
    const response = generated.ok
      ? generated.response
      : buildTrackSwitchChatResponse(track, intent.userText, cause);

    if (memory.token !== token || !input.isCurrentTrackKey(trackKey)) return;

    memory.cache.set(trackKey, response);
    input.pushMessage(response);
    input.broadcast(trackKey, response);

    if (intent.voiceEnabledAtChat) {
      scheduleTrackTts(response.say, trackKey, () => input.isCurrentTrackKey(trackKey));
    }
  } catch (error) {
    console.warn('[radio] track commentary failed:', error instanceof Error ? error.message : error);
  }
}
