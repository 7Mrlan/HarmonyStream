/*
 * WebSocket 广播中心
 * ------------------
 * Phase A 只需要一个轻量连接集合和广播函数，不引入事件总线或消息队列。
 * Phase F：增加心跳与无响应剔除：
 *   - 进程内单例 setInterval 每 30s 给所有 OPEN socket 发 {type:'ping'}
 *   - 每个 socket 标记 alive；收到任何消息即标记 true
 *   - 连续 2 个心跳周期未收到任何消息则 close（≈90s 上限）
 *   - 客户端 ping 立即回 pong；服务端心跳 timer 在最后一个客户端断开后停止
 */

import type { StreamEvent } from '@claudio/api';

const OPEN_SOCKET_STATE = 1;
/* 心跳周期：每 30s 发一次 ping */
const HEARTBEAT_INTERVAL_MS = 30_000;
/* 连续 N 个周期未收到任何消息则视为掉线 */
const HEARTBEAT_MISS_LIMIT = 2;

interface StreamSocket {
  readyState: number;
  send(data: string, callback: (error?: Error) => void): void;
  once(event: 'close' | 'error', listener: () => void): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  close(): void;
}

interface ClientMeta {
  /* 是否在最近一次心跳周期内收到过任何消息 */
  alive: boolean;
  /* 连续未应答的心跳周期数 */
  missed: number;
}

const clients = new Map<StreamSocket, ClientMeta>();

/* 心跳全局 timer；最后一个客户端断开后清空，避免空进程留尾。 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/*
 * 启动心跳调度。
 * 每 30s 检查所有客户端：alive 重置为 false 并发 ping；
 * 若 missed 超限则主动 close，连接清理交给 socket.once('close') 回调。
 */
function ensureHeartbeatTimer(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const [socket, meta] of clients) {
      if (socket.readyState !== OPEN_SOCKET_STATE) {
        clients.delete(socket);
        continue;
      }
      if (!meta.alive) {
        meta.missed += 1;
        if (meta.missed >= HEARTBEAT_MISS_LIMIT) {
          try {
            socket.close();
          } catch {
            /* 静默 */
          }
          continue;
        }
      } else {
        meta.missed = 0;
      }
      meta.alive = false;
      try {
        socket.send(JSON.stringify({ type: 'ping' }), (error?: Error) => {
          if (error) {
            try {
              socket.close();
            } catch {
              /* 静默 */
            }
          }
        });
      } catch {
        /* 静默 */
      }
    }
    if (clients.size === 0) {
      stopHeartbeatTimer();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/*
 * 停止心跳调度。
 * 进程退出 / 最后一个客户端断开时调用，确保 setInterval 不悬挂。
 */
function stopHeartbeatTimer(): void {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/*
 * 注册一个新的 stream 客户端。
 * 必须在 close / error 时清理，避免长时间开发调试造成连接泄漏。
 * 同时挂上 message 监听处理客户端 ping 与统一 alive 标记。
 */
export function registerStreamClient(socket: StreamSocket): void {
  const meta: ClientMeta = { alive: true, missed: 0 };
  clients.set(socket, meta);

  const cleanup = () => {
    clients.delete(socket);
    if (clients.size === 0) {
      stopHeartbeatTimer();
    }
  };

  socket.once('close', cleanup);
  socket.once('error', cleanup);

  socket.on('message', (raw: unknown) => {
    /* 任何消息都视为对端存活 */
    meta.alive = true;
    meta.missed = 0;

    const text = decodeMessage(raw);
    if (!text) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!isRecord(parsed)) return;
    if (parsed.type === 'ping') {
      /* 客户端 ping 立即回 pong */
      try {
        socket.send(JSON.stringify({ type: 'pong' }), () => undefined);
      } catch {
        /* 静默 */
      }
    }
    /* pong 或其它消息无需进一步处理：alive 已被刷新；业务事件由 server 主动广播 */
  });

  ensureHeartbeatTimer();
}

/*
 * 把 ws message 原始数据解码为字符串。
 * @fastify/websocket 通常透传 Buffer | string；这里统一转字符串便于 JSON.parse。
 */
function decodeMessage(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(raw);
    } catch {
      return null;
    }
  }
  if (raw && typeof (raw as { toString?: unknown }).toString === 'function') {
    try {
      return String(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/*
 * unknown 是否为普通对象记录，供心跳解析复用。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/*
 * 向单个客户端发送事件。
 * 如果连接不可用或发送失败，只移除这个客户端，不影响其它连接。
 */
export function sendStreamEvent(socket: StreamSocket, event: StreamEvent): void {
  if (socket.readyState !== OPEN_SOCKET_STATE) {
    clients.delete(socket);
    if (clients.size === 0) stopHeartbeatTimer();
    return;
  }

  socket.send(JSON.stringify(event), (error: Error | undefined) => {
    if (error) {
      clients.delete(socket);
      if (clients.size === 0) stopHeartbeatTimer();
    }
  });
}

/*
 * 广播 stream 事件。
 * 每个客户端独立 try/catch，防止单个坏连接拖垮整次广播。
 */
export function broadcastStreamEvent(event: StreamEvent): void {
  for (const socket of clients.keys()) {
    try {
      sendStreamEvent(socket, event);
    } catch {
      clients.delete(socket);
    }
  }
  if (clients.size === 0) stopHeartbeatTimer();
}

/*
 * 暴露当前连接数，方便后续健康检查或测试观察。
 * Phase A 暂不新增 HTTP debug 接口，只保留函数能力。
 */
export function getStreamClientCount(): number {
  return clients.size;
}

/*
 * Phase F：进程退出时清理所有客户端与心跳 timer。
 * graceful shutdown 路径调用，避免悬挂 socket / interval 阻塞进程退出。
 */
export function shutdownStreamHub(): void {
  for (const socket of clients.keys()) {
    try {
      socket.close();
    } catch {
      /* 静默 */
    }
  }
  clients.clear();
  stopHeartbeatTimer();
}
