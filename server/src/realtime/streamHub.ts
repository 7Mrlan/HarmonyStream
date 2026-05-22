/*
 * WebSocket 广播中心
 * ------------------
 * Phase A 只需要一个轻量连接集合和广播函数，不引入事件总线或消息队列。
 * 后续如果要做更复杂的 stream-token / TTS 事件，再在这里扩展。
 */

import type { StreamEvent } from '@claudio/api';

const OPEN_SOCKET_STATE = 1;

interface StreamSocket {
  readyState: number;
  send(data: string, callback: (error?: Error) => void): void;
  once(event: 'close' | 'error', listener: () => void): void;
}

const clients = new Set<StreamSocket>();

/*
 * 注册一个新的 stream 客户端。
 * 必须在 close / error 时清理，避免长时间开发调试造成连接泄漏。
 */
export function registerStreamClient(socket: StreamSocket): void {
  clients.add(socket);

  const cleanup = () => {
    clients.delete(socket);
  };

  socket.once('close', cleanup);
  socket.once('error', cleanup);
}

/*
 * 向单个客户端发送事件。
 * 如果连接不可用或发送失败，只移除这个客户端，不影响其它连接。
 */
export function sendStreamEvent(socket: StreamSocket, event: StreamEvent): void {
  if (socket.readyState !== OPEN_SOCKET_STATE) {
    clients.delete(socket);
    return;
  }

  socket.send(JSON.stringify(event), (error: Error | undefined) => {
    if (error) {
      clients.delete(socket);
    }
  });
}

/*
 * 广播 stream 事件。
 * 每个客户端独立 try/catch，防止单个坏连接拖垮整次广播。
 */
export function broadcastStreamEvent(event: StreamEvent): void {
  for (const client of clients) {
    try {
      sendStreamEvent(client, event);
    } catch {
      clients.delete(client);
    }
  }
}

/*
 * 暴露当前连接数，方便后续健康检查或测试观察。
 * Phase A 暂不新增 HTTP debug 接口，只保留函数能力。
 */
export function getStreamClientCount(): number {
  return clients.size;
}
