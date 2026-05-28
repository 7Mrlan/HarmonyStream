/*
 * TTS 调度器
 * ----------
 * radioState.handleChat 调用的 fire-and-forget 入口。
 *   - chatId 单调递增；新任务进来时旧任务结果会被 stale check 丢弃
 *   - 并发=1 由 ttsService 的内部串行 await 自然保证（chain 顺序合成）
 *   - 合成成功后通过 broadcastStreamEvent 推 'tts-ready'；失败完全静默
 * 与 music/preload 同模式但完全解耦，两类资源不互相取消。
 */

import { env } from '../env.js';
import { broadcastStreamEvent } from '../realtime/streamHub.js';
import { synthesizeForChat } from './ttsService.js';
import type { TtsStyle } from './types.js';

let currentChatId = 0;

export interface TtsScheduleOptions {
  /* 音色，可选。 */
  voice?: string;
  /* 动态语气，可选。 */
  style?: TtsStyle;
}

/* 推进 chatId；handleChat 入口调用，确保旧任务的广播会被 stale check 丢弃。 */
export function nextChatId(): number {
  currentChatId += 1;
  return currentChatId;
}

/*
 * 调度一次 TTS 合成。
 * 不返回 Promise，调用方应 `void scheduleTts(...)`。
 * baseUrl 用于把 audioId 拼成可访问 URL；缺省时使用相对路径。
 */
export function scheduleTts(text: string, chatId: number, options: TtsScheduleOptions = {}): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  void runSynthesis(trimmed, chatId, options);
}

/*
 * 调度一次绑定曲目的 TTS 合成。
 * 切歌短播报不能复用 chatId；调用方提供 stale checker，合成完成前后都校验当前曲是否仍匹配。
 */
export function scheduleTrackTts(
  text: string,
  trackId: string,
  isStillCurrent: () => boolean,
  options: TtsScheduleOptions = {},
): void {
  const trimmed = text.trim();
  if (!trimmed || !trackId) return;

  void runTrackSynthesis(trimmed, trackId, isStillCurrent, options);
}

/*
 * 真正的合成 + 广播。
 * 任意失败 / chatId 过期都会静默吞掉，不影响主链路。
 * 失败原因仅打到 console，便于排障；不发任何错误事件。
 */
async function runSynthesis(
  text: string,
  chatId: number,
  options: TtsScheduleOptions,
): Promise<void> {
  try {
    const result = await synthesizeForChat({ text, ...options });
    if (!result) {
      console.warn('[tts] synthesizeForChat returned null (all providers failed)');
      return;
    }
    if (chatId !== currentChatId) return;

    const url = buildTtsUrl(result.id);
    broadcastStreamEvent({ type: 'tts-ready', url });
  } catch (error) {
    console.warn('[tts] runSynthesis error:', error instanceof Error ? error.message : error);
  }
}

/*
 * 绑定曲目的合成 + 广播。
 * 任何过期、失败或 provider 异常都静默吞掉，避免切歌播报影响播放主链路。
 */
async function runTrackSynthesis(
  text: string,
  trackId: string,
  isStillCurrent: () => boolean,
  options: TtsScheduleOptions,
): Promise<void> {
  try {
    if (!isStillCurrent()) return;
    const result = await synthesizeForChat({ text, ...options });
    if (!result) {
      console.warn('[tts] synthesizeForChat returned null for track commentary');
      return;
    }
    if (!isStillCurrent()) return;

    const url = buildTtsUrl(result.id);
    broadcastStreamEvent({ type: 'tts-ready', url, trackId });
  } catch (error) {
    console.warn('[tts] runTrackSynthesis error:', error instanceof Error ? error.message : error);
  }
}

/*
 * 拼接 /media/tts/:id 的对外 URL。
 * 优先使用 MEDIA_BASE_URL 与 /media/local/:id 一致；未配置时退回相对路径。
 */
function buildTtsUrl(id: string): string {
  const base = (env.MEDIA_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/media/tts/${id}` : `/media/tts/${id}`;
}
