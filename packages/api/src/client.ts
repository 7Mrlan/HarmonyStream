/*
 * @claudio/api · 轻量客户端
 * -------------------------
 * Phase B 用于前端集中访问服务端 API，避免 App 页面里散写 fetch URL。
 * 这里只封装传输层，不接入真实 LLM、网易云、TTS 或持久化逻辑。
 */

import type {
  ChatRequest,
  ChatResponse,
  ModelsResponse,
  NextResponse,
  NowResponse,
  StreamEvent,
  SwitchModelResponse,
} from './types';

export interface ApiClientOptions {
  /* HTTP API 根地址，例如 http://127.0.0.1:8080 */
  baseUrl?: string;
  /* 测试或特殊运行时可注入 fetch；默认使用 globalThis.fetch */
  fetchImpl?: typeof fetch;
  /* 测试或特殊运行时可注入 WebSocket；默认使用 globalThis.WebSocket */
  WebSocketCtor?: typeof WebSocket;
}

export interface StreamHandlers {
  /* WS 连接成功 */
  onOpen?: () => void;
  /* WS 连接关闭 */
  onClose?: () => void;
  /* WS 连接或事件解析失败 */
  onError?: (error: unknown) => void;
  /* 收到服务端 StreamEvent */
  onEvent?: (event: StreamEvent) => void;
}

export interface StreamSubscription {
  /* 原始 socket；当前环境没有 WebSocket 时为 null */
  socket: WebSocket | null;
  /* 关闭连接（显式关闭后不会再自动重连） */
  close: () => void;
  /* 立即触发一次重连（重置退避计时；显式 close 之后调用无效） */
  reconnectNow: () => void;
}

export interface ClaudioApiClient {
  /* 获取当前播放 */
  getNow: () => Promise<NowResponse>;
  /* 获取下一首 */
  getNext: () => Promise<NextResponse>;
  /* 发送聊天 */
  sendChat: (request: ChatRequest) => Promise<ChatResponse>;
  /* 获取模型列表 */
  getModels: () => Promise<ModelsResponse>;
  /* 切换模型 */
  switchModel: (id: string) => Promise<SwitchModelResponse>;
  /* 连接服务端事件流 */
  connectStream: (handlers?: StreamHandlers) => StreamSubscription;
}

export class ApiClientError extends Error {
  status: number;
  payload: unknown;

  /*
   * HTTP 错误封装。
   * 保留 status 和 payload，方便 App 层决定显示 offline 还是业务错误。
   */
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8080';

/*
 * 解析 HTTP API 根地址。
 * 输入为空时使用本地开发默认值；末尾斜杠统一移除，避免拼接出双斜杠。
 */
export function resolveApiBaseUrl(baseUrl?: string): string {
  const raw = baseUrl?.trim() || DEFAULT_API_BASE_URL;
  return raw.replace(/\/+$/, '');
}

/*
 * 从 HTTP 根地址推导 WS stream 地址。
 * http -> ws，https -> wss；其它协议按原字符串兜底替换路径。
 */
export function resolveStreamUrl(baseUrl?: string): string {
  const url = resolveApiBaseUrl(baseUrl);
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}/stream`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}/stream`;
  return `${url}/stream`;
}

/*
 * 创建 Claudio API client。
 * 所有 HTTP 方法都走同一 base URL 和 requestJson，便于后续加鉴权或超时。
 */
export function createApiClient(options: ApiClientOptions = {}): ClaudioApiClient {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const fetcher = options.fetchImpl ?? globalThis.fetch;
  const WebSocketCtor = options.WebSocketCtor ?? globalThis.WebSocket;

  return {
    getNow: () => requestJson<NowResponse>(fetcher, baseUrl, '/api/now'),
    getNext: () => requestJson<NextResponse>(fetcher, baseUrl, '/api/next'),
    sendChat: (request) =>
      requestJson<ChatResponse>(fetcher, baseUrl, '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
    getModels: () => requestJson<ModelsResponse>(fetcher, baseUrl, '/api/models'),
    switchModel: (id) =>
      requestJson<SwitchModelResponse>(fetcher, baseUrl, '/api/models/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    connectStream: (handlers) => connectStream(WebSocketCtor, resolveStreamUrl(baseUrl), handlers),
  };
}

/*
 * 发起 JSON HTTP 请求。
 * 非 2xx 响应统一抛 ApiClientError；调用方不需要重复判断 response.ok。
 */
async function requestJson<TResponse>(
  fetcher: typeof fetch,
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetcher(`${baseUrl}${path}`, init);
  const payload = await readJsonPayload(response);

  if (!response.ok) {
    throw new ApiClientError(`Claudio API 请求失败：${response.status}`, response.status, payload);
  }

  return payload as TResponse;
}

/*
 * 读取 JSON 响应。
 * 服务端异常时可能不是 JSON；这里返回 null，避免解析失败掩盖原始 HTTP 状态。
 */
async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/*
 * 建立 WS 连接并解析 StreamEvent。
 * Phase F：自带状态机 + 心跳 + 指数退避重连。
 *   - 状态机：idle → connecting → open → reconnecting → closed
 *   - 心跳：每 25s 发 {type:'ping'}；60s 未收到 pong 主动 close 触发重连
 *   - 退避：0.5/1/2/4/8/16/30s + ±20% 抖动；reconnectNow 重置退避并立即连
 *   - close()：显式关闭后不再重连，标记 closed 终态
 */
function connectStream(
  WebSocketCtor: typeof WebSocket | undefined,
  streamUrl: string,
  handlers?: StreamHandlers,
): StreamSubscription {
  if (!WebSocketCtor) {
    handlers?.onError?.(new Error('当前环境不支持 WebSocket'));
    return {
      socket: null,
      close: () => undefined,
      reconnectNow: () => undefined,
    };
  }

  /*
   * 单个订阅生命周期内可能产生多个 socket 实例（每次重连换一个）。
   * 这里用闭包变量持有最新 socket，subscription.socket 通过 getter 暴露。
   */
  let currentSocket: WebSocket | null = null;
  /* 是否已被显式 close；为 true 后任何重连尝试都会被忽略 */
  let disposed = false;
  /* 重连尝试次数，用于查表得到下一次退避；连接成功后归零 */
  let attempt = 0;
  /* 待执行的重连 timer，allow 取消 */
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /* 客户端心跳 timer */
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  /* pong 等待超时 timer */
  let pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pongTimeoutTimer) {
      clearTimeout(pongTimeoutTimer);
      pongTimeoutTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    if (reconnectTimer) return;
    /* 指数退避表，封顶 30s；attempt 超过表长度后保持 30s */
    const backoffTable = [500, 1000, 2000, 4000, 8000, 16000, 30000];
    const base = backoffTable[Math.min(attempt, backoffTable.length - 1)] ?? 30000;
    /* ±20% 抖动，避免大量客户端集体重连 */
    const jitter = base * (0.8 + Math.random() * 0.4);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, jitter);
  };

  const armPongTimeout = () => {
    if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
    /* 60s 内任何消息（pong 或业务事件）都会重置；超时则主动 close */
    pongTimeoutTimer = setTimeout(() => {
      try {
        currentSocket?.close();
      } catch {
        /* 静默：close 失败由 onclose 兜底 */
      }
    }, 60_000);
  };

  const open = () => {
    if (disposed) return;
    clearTimers();

    const socket = new WebSocketCtor(streamUrl);
    currentSocket = socket;
    let socketFinalized = false;

    /*
     * 统一收口 socket 结束路径。
     * 部分运行时连接失败只触发 error，不保证继续触发 close；这里确保 error / close 都能进入同一条重连链路。
     */
    const finalizeSocket = () => {
      if (socketFinalized) return;
      socketFinalized = true;
      clearTimers();
      if (currentSocket === socket) {
        currentSocket = null;
      }
      handlers?.onClose?.();
      if (!disposed) scheduleReconnect();
    };

    socket.onopen = () => {
      attempt = 0;
      armPongTimeout();
      /* 25s 一次的客户端 ping，配合服务端 30s ping 互为兜底 */
      pingTimer = setInterval(() => {
        if (socket.readyState !== socket.OPEN) return;
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* 静默：send 失败由 onclose 兜底 */
        }
      }, 25_000);
      handlers?.onOpen?.();
    };

    socket.onclose = () => {
      finalizeSocket();
    };

    socket.onerror = (event) => {
      if (disposed || socketFinalized) return;
      handlers?.onError?.(event);
      finalizeSocket();
      try {
        socket.close();
      } catch {
        /* 静默 */
      }
    };

    socket.onmessage = (event) => {
      /* 任何消息（含心跳）都视为对端存活，重置 pong 超时 */
      armPongTimeout();

      if (isHeartbeatMessage(event.data)) {
        /* 心跳消息不进 StreamEvent 链路，避免污染业务事件 */
        return;
      }

      const parsed = parseStreamEvent(event.data);
      if (parsed) {
        handlers?.onEvent?.(parsed);
        return;
      }
      handlers?.onError?.(new Error('无法解析 Claudio stream 事件'));
    };
  };

  open();

  return {
    get socket() {
      return currentSocket;
    },
    close: () => {
      disposed = true;
      clearTimers();
      try {
        currentSocket?.close();
      } catch {
        /* 静默 */
      }
      currentSocket = null;
    },
    reconnectNow: () => {
      if (disposed) return;
      attempt = 0;
      try {
        currentSocket?.close();
      } catch {
        /* 静默：onclose 会触发 scheduleReconnect */
      }
      /* 若当前没有活动 socket（已是 reconnecting 状态），立即排程一次新连接 */
      if (!currentSocket) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        open();
      }
    },
  } satisfies StreamSubscription;
}

/*
 * 判断消息是否为心跳。
 * 仅识别 {type:'ping'} 与 {type:'pong'}；其它一律走 StreamEvent 解析。
 */
function isHeartbeatMessage(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) return false;
    return parsed.type === 'ping' || parsed.type === 'pong';
  } catch {
    return false;
  }
}

/*
 * 解析 WS 消息。
 * 服务端约定发送 JSON 字符串；这里做最小 shape 校验，避免把任意 JSON 当事件。
 */
function parseStreamEvent(data: unknown): StreamEvent | null {
  if (typeof data !== 'string') return null;

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isStreamEvent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/*
 * StreamEvent 最小运行时校验。
 * 完整契约仍以 TypeScript 类型为准；这里防止无 type 字段的数据进入 App 状态。
 */
function isStreamEvent(value: unknown): value is StreamEvent {
  if (!isRecord(value)) return false;
  const type = value.type;
  return (
    type === 'now-playing' ||
    type === 'chat-token' ||
    type === 'tts-ready' ||
    type === 'queue-update'
  );
}

/*
 * 判断 unknown 是否为普通对象记录。
 * 供 WS 事件校验复用，避免使用不安全类型。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
