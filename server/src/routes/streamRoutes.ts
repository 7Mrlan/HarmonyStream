/*
 * Stream 路由
 * -----------
 * 提供 `/stream` WebSocket 通道，Phase A 用于广播 now-playing、chat-token、
 * queue-update 等服务端事件。
 */

import type { FastifyInstance } from 'fastify';
import { getNowPlaying, getQueueSnapshot } from '../state/radioState.js';
import { registerStreamClient, sendStreamEvent } from '../realtime/streamHub.js';

/*
 * 注册 WebSocket stream 路由。
 * 连接建立后先推送当前队列；如果已有当前曲目，再补一条 now-playing 快照。
 */
export function registerStreamRoutes(app: FastifyInstance): void {
  app.get('/stream', { websocket: true }, (socket) => {
    registerStreamClient(socket);

    const queue = getQueueSnapshot();
    sendStreamEvent(socket, { type: 'queue-update', queue });

    const now = getNowPlaying();
    if (now.track) {
      sendStreamEvent(socket, {
        type: 'now-playing',
        track: now.track,
        position: now.position,
      });
    }
  });
}
