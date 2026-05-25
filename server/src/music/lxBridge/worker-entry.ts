/*
 * LX Bridge worker 入口
 * --------------------
 * 这个文件运行在 child_process 子进程内；用户源脚本只在这里 evaluate。
 * 主进程通过 IPC 请求 load-source / resolve-music-url，并可在超时时杀掉整个进程。
 */

import { createCipheriv, createHash, publicEncrypt, randomBytes, constants } from 'node:crypto';
import * as vm from 'node:vm';
import { performLxRequest, type LxRequestOptions, type LxRequestResponse } from './lxRequest';
import type {
  LxMusicCandidate,
  LxResolveMusicUrlRequest,
  LxResolvedUrl,
  LxSourceCapability,
  LxSourceInitResult,
  LxSourceScript,
} from './types';
import type { LxLoadSourcePayload, LxWorkerMessage, LxWorkerResponseMessage } from './workerProtocol';

interface LxUserSourceRequest {
  /* LX source key。 */
  source: string;
  /* 请求动作。 */
  action: 'musicUrl';
  /* LX Mobile 传给用户源的 info。 */
  info: {
    type?: string;
    musicInfo: Record<string, unknown>;
  };
}

type LxRequestCallback = (
  error: Error | null,
  response: LxRequestResponse | null,
  body: unknown,
) => void;

type LxRequestHandler = (request: LxUserSourceRequest) => Promise<unknown> | unknown;

interface LxGlobalObject {
  /* LX 事件名。 */
  EVENT_NAMES: {
    request: 'request';
    inited: 'inited';
    updateAlert: 'updateAlert';
  };
  /* HTTP 请求兼容函数。 */
  request: (url: string, options?: LxRequestOptions, callback?: LxRequestCallback) => unknown;
  /* 向宿主发送事件。 */
  send: (eventName: string, data: unknown) => Promise<void>;
  /* 注册宿主请求处理器。 */
  on: (eventName: string, handler: LxRequestHandler) => Promise<void>;
  /* LX 常用工具。 */
  utils: ReturnType<typeof createLxUtils>;
  /* 当前脚本信息。 */
  currentScriptInfo: {
    name: string;
    description: string;
    version: string;
    author: string;
    homepage: string;
    rawScript: string;
  };
  /* LX 协议版本。 */
  version: string;
  /* 当前运行环境。 */
  env: string;
}

interface WorkerState {
  /* 当前脚本 hash。 */
  scriptHash: string | null;
  /* 初始化结果。 */
  initResult: LxSourceInitResult | null;
  /* 用户源注册的 request handler。 */
  requestHandler: LxRequestHandler | null;
  /* 暴露给脚本的 lx 对象。 */
  lx: LxGlobalObject | null;
  /* lx.request 默认超时。 */
  requestTimeoutMs: number;
}

const EVALUATE_TIMEOUT_MS = 3000;
const INIT_TIMEOUT_MS = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 13_000;
const state: WorkerState = {
  scriptHash: null,
  initResult: null,
  requestHandler: null,
  lx: null,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
};

process.on('message', (raw) => {
  void handleWorkerMessage(raw);
});

/*
 * 处理主进程 IPC 消息。
 * 任何异常都转成 { ok:false } 返回，避免子进程静默失败。
 */
async function handleWorkerMessage(raw: unknown): Promise<void> {
  if (!isWorkerMessage(raw)) return;

  try {
    if (raw.action === 'load-source') {
      const result = await handleLoadSource(raw.payload as LxLoadSourcePayload);
      sendResponse({ id: raw.id, ok: true, payload: result });
      return;
    }
    if (raw.action === 'resolve-music-url') {
      const result = await handleResolveMusicUrl(raw.payload as LxResolveMusicUrlRequest);
      sendResponse({ id: raw.id, ok: true, payload: result });
      return;
    }
    if (raw.action === 'destroy') {
      resetState();
      sendResponse({ id: raw.id, ok: true, payload: null });
      process.exit(0);
    }
  } catch (error) {
    sendResponse({
      id: raw.id,
      ok: false,
      error: error instanceof Error ? error.message : 'LX worker 未知错误',
    });
  }
}

/*
 * 加载用户源脚本。
 * 脚本必须调用 lx.send(lx.EVENT_NAMES.inited, { sources }) 完成初始化。
 */
export async function handleLoadSource(payload: LxLoadSourcePayload): Promise<LxSourceInitResult> {
  const script = payload.script;
  resetState();
  state.requestTimeoutMs = payload.requestTimeoutMs;
  const sandbox = createSandbox();
  const lx = installLxGlobal(sandbox, script);
  const context = vm.createContext(sandbox, {
    name: `lx-source-${script.id}`,
    codeGeneration: { strings: false, wasm: false },
  });

  const compiled = new vm.Script(script.code, {
    filename: script.origin,
  });
  compiled.runInContext(context, { timeout: EVALUATE_TIMEOUT_MS });

  state.scriptHash = script.hash;
  state.lx = lx;

  const initResult = await waitForInit(script.hash);
  state.initResult = initResult;
  return initResult;
}

/*
 * 请求用户源解析 musicUrl。
 * G.1 只消费 musicUrl；歌词、封面等动作后续单独扩展。
 */
export async function handleResolveMusicUrl(
  request: LxResolveMusicUrlRequest,
): Promise<LxResolvedUrl | null> {
  if (!state.initResult || !state.requestHandler || !state.lx) {
    throw new Error('LX 用户源尚未初始化');
  }

  const quality = request.quality ?? request.candidate.quality;
  ensureSourceSupportsMusicUrl(request.candidate, quality, state.initResult);

  const response = await state.requestHandler.call(state.lx, {
    source: request.candidate.source,
    action: 'musicUrl',
    info: {
      ...(quality ? { type: quality } : {}),
      musicInfo: request.candidate.musicInfo,
    },
  });
  return normalizeMusicUrlResponse(response, quality);
}

/*
 * 安装 globalThis.lx。
 * 这里只实现 G.1 必需面：inited、request handler、lx.request、常用 utils。
 */
export function installLxGlobal(
  sandbox: Record<string, unknown>,
  script: LxSourceScript,
): LxGlobalObject {
  const eventNames = {
    request: 'request',
    inited: 'inited',
    updateAlert: 'updateAlert',
  } as const;
  const lx: LxGlobalObject = {
    EVENT_NAMES: eventNames,
    request: (url, options, callback) => runLxRequest(url, options, callback),
    send: async (eventName, data) => {
      if (eventName !== eventNames.inited) return;
      state.initResult = normalizeInitData(data, script.hash);
    },
    on: async (eventName, handler) => {
      if (eventName !== eventNames.request) {
        throw new Error(`LX 事件不支持：${eventName}`);
      }
      if (typeof handler !== 'function') {
        throw new Error('LX request handler 必须是函数');
      }
      state.requestHandler = handler;
    },
    utils: createLxUtils(),
    currentScriptInfo: {
      name: script.name,
      description: '',
      version: '',
      author: '',
      homepage: '',
      rawScript: script.code,
    },
    version: '2.0.0',
    env: 'node',
  };

  sandbox.lx = lx;
  Object.freeze(lx.EVENT_NAMES);
  Object.freeze(lx.currentScriptInfo);
  Object.freeze(lx);
  return lx;
}

/* 创建脚本运行上下文。 */
function createSandbox(): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Buffer,
    Uint8Array,
    ArrayBuffer,
    Promise,
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

/*
 * 运行 lx.request。
 * 兼容 LX callback 风格；无 callback 时返回 Promise，方便部分用户源封装。
 */
function runLxRequest(
  url: string,
  options: LxRequestOptions | undefined,
  callback: LxRequestCallback | undefined,
): unknown {
  const controller = new AbortController();
  const request = performLxRequest(
    url,
    { ...(options ?? {}), timeout: options?.timeout ?? state.requestTimeoutMs },
    controller.signal,
  );

  if (typeof callback !== 'function') return request;

  void request
    .then((response) => {
      callback(null, response, response.body);
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error('lx.request failed'), null, null);
    });

  return () => {
    controller.abort();
  };
}

/* 等待用户源初始化。 */
function waitForInit(scriptHash: string): Promise<LxSourceInitResult> {
  if (state.initResult) return Promise.resolve(state.initResult);

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (state.initResult) {
        clearInterval(timer);
        resolvePromise(state.initResult);
        return;
      }
      if (Date.now() - startedAt > INIT_TIMEOUT_MS) {
        clearInterval(timer);
        rejectPromise(new Error(`LX 用户源初始化超时：${scriptHash}`));
      }
    }, 25);
  });
}

/*
 * 归一化初始化数据。
 * 只保留 type=music 且包含 musicUrl action 的 source。
 */
function normalizeInitData(data: unknown, scriptHash: string): LxSourceInitResult {
  if (!isRecord(data) || !isRecord(data.sources)) {
    throw new Error('LX 用户源初始化数据缺少 sources');
  }

  const sources: Record<string, LxSourceCapability> = {};
  for (const [source, value] of Object.entries(data.sources)) {
    if (!isRecord(value)) continue;
    if (value.type !== 'music') continue;
    const actions = readStringArray(value.actions);
    if (!actions.includes('musicUrl')) continue;
    sources[source] = {
      type: 'music',
      actions,
      qualitys: readStringArray(value.qualitys),
    };
  }

  if (Object.keys(sources).length === 0) {
    throw new Error('LX 用户源没有声明 musicUrl 能力');
  }

  return { scriptHash, sources };
}

/* 校验当前候选 source 是否支持 musicUrl 与指定音质。 */
function ensureSourceSupportsMusicUrl(
  candidate: LxMusicCandidate,
  quality: string | undefined,
  initResult: LxSourceInitResult,
): void {
  const source = initResult.sources[candidate.source];
  if (!source || !source.actions.includes('musicUrl')) {
    throw new Error(`LX 用户源不支持 ${candidate.source}.musicUrl`);
  }
  if (quality && source.qualitys.length > 0 && !source.qualitys.includes(quality)) {
    throw new Error(`LX 用户源不支持 ${candidate.source}.${quality}`);
  }
}

/* 归一化用户源 musicUrl 返回值。 */
function normalizeMusicUrlResponse(response: unknown, quality: string | undefined): LxResolvedUrl | null {
  const url = typeof response === 'string'
    ? response
    : isRecord(response) && typeof response.url === 'string'
      ? response.url
      : null;

  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('LX 用户源返回了非 HTTP 播放 URL');
  }

  return {
    url,
    ...(quality ? { quality } : {}),
  };
}

/* 创建 LX 常用工具。 */
function createLxUtils() {
  return {
    crypto: {
      md5: (value: string) => createHash('md5').update(encodeURIComponent(value)).digest('hex'),
      randomBytes: (size: number) => new Uint8Array(randomBytes(size)),
      aesEncrypt: (buffer: unknown, mode: string, key: unknown, iv?: unknown) =>
        aesEncrypt(buffer, mode, key, iv),
      rsaEncrypt: (buffer: unknown, key: string) => rsaEncrypt(buffer, key),
    },
    buffer: {
      from: (input: unknown, encoding?: BufferEncoding) => new Uint8Array(toBuffer(input, encoding)),
      bufToString: (input: unknown, encoding?: BufferEncoding | 'binary') => {
        if (encoding === 'binary') return new Uint8Array(toBuffer(input));
        return toBuffer(input).toString(encoding ?? 'utf8');
      },
    },
  };
}

/* AES 加密工具，兼容常见 LX 源调用。 */
function aesEncrypt(buffer: unknown, mode: string, key: unknown, iv: unknown): Uint8Array {
  const algorithm = mode === 'aes-128-ecb' ? 'aes-128-ecb' : 'aes-128-cbc';
  const cipher = createCipheriv(
    algorithm,
    toBuffer(key).subarray(0, 16),
    algorithm === 'aes-128-ecb' ? null : toBuffer(iv).subarray(0, 16),
  );
  return new Uint8Array(Buffer.concat([cipher.update(toBuffer(buffer)), cipher.final()]));
}

/* RSA 加密工具，兼容 PEM 或裸 public key。 */
function rsaEncrypt(buffer: unknown, key: string): Uint8Array {
  const pem = key.includes('BEGIN PUBLIC KEY')
    ? key
    : `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
  return new Uint8Array(publicEncrypt({ key: pem, padding: constants.RSA_NO_PADDING }, toBuffer(buffer)));
}

/* 把脚本工具输入统一转成 Buffer。 */
function toBuffer(input: unknown, encoding?: BufferEncoding): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return Buffer.from(input, encoding);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (Array.isArray(input)) return Buffer.from(input);
  if (input == null) return Buffer.alloc(0);
  return Buffer.from(String(input), encoding);
}

/* 重置 worker 内状态。 */
function resetState(): void {
  state.scriptHash = null;
  state.initResult = null;
  state.requestHandler = null;
  state.lx = null;
  state.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
}

/* 发送 IPC 响应。 */
function sendResponse(response: LxWorkerResponseMessage): void {
  process.send?.(response);
}

/* 判断 IPC 消息结构。 */
function isWorkerMessage(value: unknown): value is LxWorkerMessage {
  return isRecord(value) && typeof value.id === 'string' && typeof value.action === 'string';
}

/* 判断 record。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/* 读取字符串数组。 */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
