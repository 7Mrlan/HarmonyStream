/*
 * TTS 调度器
 * ----------
 * radioState.handleChat 调用的 fire-and-forget 入口。
 *   - chatId 单调递增；新任务进来时旧任务结果会被 stale check 丢弃
 *   - 并发=1 由 ttsService 的内部串行 await 自然保证（chain 顺序合成）
 *   - 合成成功后通过 broadcastStreamEvent 推 'tts-ready'；失败完全静默
 * 与 music/preload 同模式但完全解耦，两类资源不互相取消。
 */

import { env } from '../env';
import { broadcastStreamEvent } from '../realtime/streamHub';
import { synthesizeForChat } from './ttsService';

let currentChatId = 0;

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
export function scheduleTts(text: string, chatId: number, voice?: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  void runSynthesis(trimmed, chatId, voice);
}

/*
 * 真正的合成 + 广播。
 * 任意失败 / chatId 过期都会静默吞掉，不影响主链路。
 * 失败原因仅打到 console，便于排障；不发任何错误事件。
 */
async function runSynthesis(text: string, chatId: number, voice?: string): Promise<void> {
  try {
    const result = await synthesizeForChat({ text, voice });
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
 * 拼接 /media/tts/:id 的对外 URL。
 * 优先使用 MEDIA_BASE_URL 与 /media/local/:id 一致；未配置时退回相对路径。
 */
function buildTtsUrl(id: string): string {
  const base = (env.MEDIA_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/media/tts/${id}` : `/media/tts/${id}`;
}
