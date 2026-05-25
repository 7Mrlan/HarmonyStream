/*
 * LX request 兼容层
 * -----------------
 * LX Mobile 的用户源通过 globalThis.lx.request 发 HTTP 请求。
 * 服务端 Bridge 用 Node fetch 模拟这个行为，重点兼容常见 headers/body/form/binary/timeout。
 */

export interface LxRequestOptions {
  /* HTTP 方法，默认 get。 */
  method?: string;
  /* 请求头。 */
  headers?: Record<string, string>;
  /* 原始 body；对象在 JSON content-type 下会被 stringify。 */
  body?: unknown;
  /* x-www-form-urlencoded 表单。 */
  form?: Record<string, unknown>;
  /* multipart/form-data 表单。 */
  formData?: Record<string, unknown>;
  /* 是否按二进制读取响应。 */
  binary?: boolean;
  /* 请求超时。 */
  timeout?: number;
}

export interface LxRequestResponse {
  /* HTTP 状态码。 */
  statusCode: number;
  /* HTTP 状态文本。 */
  statusMessage: string;
  /* 响应头，统一小写 key。 */
  headers: Record<string, string>;
  /* 响应体；JSON 会自动 parse，binary 为 Buffer。 */
  body: unknown;
  /* 最终 URL。 */
  url: string;
  /* fetch ok 标记。 */
  ok: boolean;
}

interface NormalizedLxRequestOptions {
  /* fetch 可用方法。 */
  method: string;
  /* fetch 请求头。 */
  headers: Record<string, string>;
  /* fetch body。 */
  body?: LxFetchBody;
  /* 是否读取二进制。 */
  binary: boolean;
  /* 超时。 */
  timeout: number;
}

export type LxRequest = (url: string, options?: LxRequestOptions) => Promise<LxRequestResponse>;

type LxFetchBody = NonNullable<RequestInit['body']>;

const DEFAULT_TIMEOUT_MS = 13_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
  accept: 'application/json',
};

/* 创建 LX request 函数，便于 worker 注入到 globalThis.lx。 */
export function createLxRequest(fetcher: typeof fetch = fetch): LxRequest {
  return (url, options) => performLxRequest(url, options ?? {}, undefined, fetcher);
}

/*
 * 执行请求。
 * 外部 signal 主要给未来取消请求预留；G.1 先由本函数内部 timeout 控制。
 */
export async function performLxRequest(
  url: string,
  options: LxRequestOptions,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LxRequestResponse> {
  const normalized = normalizeLxRequestOptions(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalized.timeout);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort, { once: true });

  try {
    const response = await fetcher(url, {
      method: normalized.method,
      headers: normalized.headers,
      ...(normalized.body !== undefined ? { body: normalized.body } : {}),
      signal: controller.signal,
    });
    return await parseLxResponse(response, normalized.binary);
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeout);
  }
}

/*
 * 规范化请求参数。
 * 优先级保持和 LX Mobile 接近：body > form > formData；未显式 content-type 的 POST 默认 JSON。
 */
function normalizeLxRequestOptions(options: LxRequestOptions): NormalizedLxRequestOptions {
  const method = (options.method ?? 'get').toUpperCase();
  const headers = normalizeHeaders({ ...DEFAULT_HEADERS, ...(options.headers ?? {}) });
  const binary = options.binary === true;
  const timeout = clampTimeout(options.timeout);
  const body = buildRequestBody(method, headers, options);

  return {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
    binary,
    timeout,
  };
}

/*
 * 构造请求 body。
 * Node fetch 会自动处理 FormData boundary，因此 multipart 不手写 content-type。
 */
function buildRequestBody(
  method: string,
  headers: Record<string, string>,
  options: LxRequestOptions,
): LxFetchBody | undefined {
  if (method === 'GET' || method === 'HEAD') return undefined;

  if (options.body !== undefined) {
    if (!hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json';
    return serializeBodyByContentType(headers['content-type'] ?? '', options.body);
  }

  if (options.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) {
      params.set(key, value == null ? '' : String(value));
    }
    return params;
  }

  if (options.formData) {
    delete headers['content-type'];
    const form = new FormData();
    for (const [key, value] of Object.entries(options.formData)) {
      form.append(key, value == null ? '' : String(value));
    }
    return form;
  }

  return undefined;
}

/* 根据 content-type 序列化 body。 */
function serializeBodyByContentType(contentType: string, body: unknown): LxFetchBody {
  if (typeof body === 'string' || body instanceof URLSearchParams || body instanceof FormData) {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return body;
  }
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (contentType.toLowerCase().includes('application/json')) {
    return JSON.stringify(body);
  }
  return String(body);
}

/* 解析响应体，JSON 失败时保留文本，binary 时返回 Buffer。 */
async function parseLxResponse(response: Response, binary: boolean): Promise<LxRequestResponse> {
  const headers = Object.fromEntries(
    Array.from(response.headers.entries()).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const body = binary ? Buffer.from(await response.arrayBuffer()) : await parseTextBody(response);

  return {
    statusCode: response.status,
    statusMessage: response.statusText,
    headers,
    body,
    url: response.url,
    ok: response.ok,
  };
}

/* 尝试把文本响应解析为 JSON。 */
async function parseTextBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/* 统一 header key 为小写，减少大小写兼容差异。 */
function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/* 判断 header 是否已存在。 */
function hasHeader(headers: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(headers, key.toLowerCase());
}

/* 限制 timeout 范围，防止用户源把请求长期挂住。 */
function clampTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.round(value), MAX_TIMEOUT_MS);
}
