/*
 * Claudio HTTP API 路由
 * ---------------------
 * Phase A 只做最小服务端闭环：真实 HTTP 路由 + 内存状态 + 可验证 mock 响应。
 * LLM、音乐服务、TTS 和持久化都不在本文件提前接入。
 */

import type {
  ChatRequest,
  ChatResponse,
  ListeningEventRequest,
  ListeningEventResponse,
  ModelsResponse,
  NextResponse,
  NowResponse,
  PlaybackMoveResponse,
  SwitchModelResponse,
  Track,
} from '@claudio/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import {
  getModels,
  getNextTrack,
  getNowPlaying,
  getPlaybackCapabilities,
  handleChat,
  playNextTrack,
  playPreviousTrack,
  switchModel,
} from '../state/radioState.js';
import { broadcastStreamEvent } from '../realtime/streamHub.js';
import { appendListeningEvent } from '../personal/profileStore.js';

const ChatRequestSchema = z.object({
  text: z.string().trim().min(1, 'text 不能为空'),
  voice: z.boolean().optional(),
});

const SwitchModelRequestSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
});

const ListeningEventRequestSchema = z
  .object({
    type: z.enum(['play', 'skip', 'previous', 'favorite', 'repeat', 'feedback']),
    title: z.string().trim().min(1, 'title 不能为空').max(160, 'title 过长').optional(),
    artist: z.string().trim().min(1, 'artist 不能为空').max(160, 'artist 过长').optional(),
    text: z.string().trim().min(1, 'text 不能为空').max(500, 'text 过长').optional(),
    at: z.string().trim().min(1, 'at 不能为空').max(80, 'at 过长').optional(),
    sourceEventIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'feedback' && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'feedback 事件必须包含 text',
      });
    }
    if (value.type !== 'feedback' && !value.title && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: '听歌行为事件必须包含 title 或 text',
      });
    }
  });
const CLAUDIO_CLIENT_HEADER = 'claudio-app';

export interface RegisterApiRoutesOptions {
  /* 测试或特殊运行时可指定用户资料目录；生产默认使用 server/data/user-profile。 */
  profileDir?: string;
  /* 测试可覆盖共享写入 token；undefined 使用 env.SHARED_TOKEN，null 表示显式关闭 token 校验。 */
  memoryWriteToken?: string | null;
}

/*
 * 注册 Phase A 的 HTTP API。
 * 每个路由都显式返回共享契约类型，防止 mock 路由偏离前后端合同。
 */
export function registerApiRoutes(app: FastifyInstance, options: RegisterApiRoutesOptions = {}): void {
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

  app.post('/api/listening-events', async (request, reply): Promise<ListeningEventResponse> => {
    const memoryWriteToken =
      options.memoryWriteToken === undefined ? env.SHARED_TOKEN : options.memoryWriteToken;
    if (!isListeningEventWriteAllowed(request.headers, memoryWriteToken)) {
      reply.status(403);
      return {
        ok: false,
        reason: '听歌事件写入来源未通过校验。',
      };
    }

    const parsed = ListeningEventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        ok: false,
        reason: '听歌事件请求体校验失败。',
      };
    }

    try {
      const eventRequest: ListeningEventRequest = parsed.data;
      const appendOptions = options.profileDir ? { profileDir: options.profileDir } : {};
      const event = await appendListeningEvent(eventRequest, appendOptions);
      return {
        ok: true,
        id: event.id,
      };
    } catch (error) {
      request.log.warn({ err: error }, '[memory] failed to append listening event');
      reply.status(500);
      return {
        ok: false,
        reason: '听歌事件写入失败。',
      };
    }
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
      playback: getPlaybackCapabilities(),
    });
    if (result.currentTrack) {
      broadcastNowPlaying(result.currentTrack);
    }

    return result.response;
  });
}

/*
 * 校验本地记忆写入来源。
 * 配置 SHARED_TOKEN 时必须带 Bearer token；未配置时至少要求 Claudio client 标记，并拒绝明显的外站浏览器 Origin。
 */
function isListeningEventWriteAllowed(
  headers: Record<string, string | string[] | undefined>,
  memoryWriteToken: string | null | undefined,
): boolean {
  const authorization = getHeaderValue(headers.authorization);
  if (memoryWriteToken) {
    return authorization === `Bearer ${memoryWriteToken}`;
  }

  const client = getHeaderValue(headers['x-claudio-client']);
  if (client !== CLAUDIO_CLIENT_HEADER) return false;

  const origin = getHeaderValue(headers.origin);
  if (!origin) return true;
  return isAllowedDevelopmentOrigin(origin);
}

/* 读取单值 header。 */
function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/* 允许 Expo / 本机调试来源，拒绝明显的公网外站网页写入本地记忆。 */
function isAllowedDevelopmentOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/^10\./u.test(hostname)) return true;
    if (/^192\.168\./u.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./u.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
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
    playback: result.playback,
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
