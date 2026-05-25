/*
 * Claudio HTTP API 路由
 * ---------------------
 * Phase A 只做最小服务端闭环：真实 HTTP 路由 + 内存状态 + 可验证 mock 响应。
 * LLM、音乐服务、TTS 和持久化都不在本文件提前接入。
 */

import type {
  ChatRequest,
  ChatResponse,
  ModelsResponse,
  NextResponse,
  NowResponse,
  PlaybackMoveResponse,
  SwitchModelResponse,
  Track,
} from '@claudio/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getModels,
  getNextTrack,
  getNowPlaying,
  handleChat,
  playNextTrack,
  playPreviousTrack,
  switchModel,
} from '../state/radioState';
import { broadcastStreamEvent } from '../realtime/streamHub';

const ChatRequestSchema = z.object({
  text: z.string().trim().min(1, 'text 不能为空'),
  voice: z.boolean().optional(),
});

const SwitchModelRequestSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
});

/*
 * 注册 Phase A 的 HTTP API。
 * 每个路由都显式返回共享契约类型，防止 mock 路由偏离前后端合同。
 */
export function registerApiRoutes(app: FastifyInstance): void {
  app.get('/api/now', async (): Promise<NowResponse> => {
    return getNowPlaying();
  });

  app.get('/api/next', async (): Promise<NextResponse> => {
    return getNextTrack();
  });

  app.post('/api/playback/next', async (): Promise<PlaybackMoveResponse> => {
    const result = playNextTrack();
    broadcastPlaybackMove(result);
    return result;
  });

  app.post('/api/playback/previous', async (): Promise<PlaybackMoveResponse> => {
    const result = playPreviousTrack();
    broadcastPlaybackMove(result);
    return result;
  });

  app.get('/api/models', async (): Promise<ModelsResponse> => {
    return getModels();
  });

  app.post('/api/models/switch', async (request, reply): Promise<SwitchModelResponse> => {
    const parsed = SwitchModelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        ok: false,
        current: getModels().current,
      };
    }

    const result = switchModel(parsed.data.id);
    if (!result.ok) {
      reply.status(404);
    }

    return result;
  });

  app.post('/api/chat', async (request, reply): Promise<ChatResponse> => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        say: 'Claudio 没有收到有效输入。请发送一段文字，我再接入电台信号。',
        play: [],
        reason: '请求体校验失败。',
      };
    }

    const chatRequest: ChatRequest = parsed.data;
    const result = await handleChat(chatRequest);

    broadcastStreamEvent({
      type: 'chat-token',
      text: result.response.say,
      final: true,
    });
    broadcastStreamEvent({
      type: 'queue-update',
      queue: result.queue,
    });
    if (result.currentTrack) {
      broadcastNowPlaying(result.currentTrack);
    }

    return result.response;
  });
}

/*
 * 广播服务端真实切歌结果。
 * 失败分支不广播，避免前端把“未移动”误解为新的播放事件。
 */
function broadcastPlaybackMove(result: PlaybackMoveResponse): void {
  if (!result.ok) return;

  broadcastNowPlaying(result.track);
  broadcastStreamEvent({
    type: 'queue-update',
    queue: result.queue,
  });
}

/*
 * 广播当前播放曲目。
 * position 仍由 Phase A 内存状态固定为 0，后续真机播放进度再接入真实上报。
 */
function broadcastNowPlaying(track: Track): void {
  broadcastStreamEvent({
    type: 'now-playing',
    track,
    position: 0,
  });
}
