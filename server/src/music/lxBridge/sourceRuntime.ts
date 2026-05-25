/*
 * LX 源脚本运行时
 * ----------------
 * 主进程侧维护“当前启用源”的生命周期。
 * 进程内活跃源常驻复用，配置变化通过重启服务生效；worker 失败后会清空 active，下一次请求重新加载。
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  LxBridgeRuntime,
  LxMusicCandidate,
  LxResolvedUrl,
  LxSourceInitResult,
  LxSourceRuntimeConfig,
  LxSourceScript,
  LxWorkerClient,
} from './types.js';
import { createLxWorkerProcess } from './workerProcess.js';

interface ActiveSourceState {
  /* 当前 worker。 */
  client: LxWorkerClient;
  /* 当前脚本 hash。 */
  scriptHash: string;
  /* 初始化结果。 */
  initResult: LxSourceInitResult;
}

/* 创建 LX 源运行时。 */
export function createLxSourceRuntime(config: LxSourceRuntimeConfig): LxBridgeRuntime {
  let active: ActiveSourceState | null = null;
  let loading: Promise<LxSourceInitResult> | null = null;

  return {
    loadActiveSource: async () => {
      return ensureActiveSource();
    },
    resolveMusicUrl: async (candidate, quality) => {
      const initResult = await ensureActiveSource();
      if (!initResult.sources[candidate.source]) return null;
      if (!active) throw new Error('LX runtime active 状态丢失');
      try {
        return await active.client.resolveMusicUrl({ candidate, quality });
      } catch (error) {
        if (shouldResetActiveSource(error)) {
          const failedActive = active;
          active = null;
          await failedActive.client.destroy().catch(() => {
            /* worker 已被超时逻辑 kill 时，destroy 失败可以忽略；下一次请求会重新加载源。 */
          });
        }
        throw error;
      }
    },
    destroy: async () => {
      if (!active) return;
      await active.client.destroy();
      active = null;
      loading = null;
    },
  };

  /* 确保 worker 已加载源脚本。 */
  async function ensureActiveSource(): Promise<LxSourceInitResult> {
    if (active) return active.initResult;
    if (loading) return loading;

    loading = createAndLoadActiveSource().finally(() => {
      loading = null;
    });
    return loading;
  }

  /* 加载源脚本并刷新 active 状态。 */
  async function createAndLoadActiveSource(): Promise<LxSourceInitResult> {
    const initResult = await (async () => {
      const script = await loadSourceScript(config);
      const client = await ensureWorkerForSource(config);
      const result = await reloadSourceIfChanged(client, script);
      active = { client, scriptHash: script.hash, initResult: result };
      return result;
    })();
    return initResult;
  }
}

/* 只有 worker 生命周期异常才重置；用户源拒绝某个音质时保留上下文，便于快速降级。 */
function shouldResetActiveSource(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('LX worker') || message.includes('消息发送失败') || message.includes('已退出');
}

/* 创建 worker 客户端。 */
export async function ensureWorkerForSource(config: LxSourceRuntimeConfig): Promise<LxWorkerClient> {
  return createLxWorkerProcess({
    timeoutMs: config.timeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });
}

/* 让 worker 加载脚本。 */
export async function reloadSourceIfChanged(
  client: LxWorkerClient,
  script: LxSourceScript,
): Promise<LxSourceInitResult> {
  return client.loadSource(script);
}

/* 读取源脚本。URL 优先于本地文件，二者都缺失时禁用。 */
async function loadSourceScript(config: LxSourceRuntimeConfig): Promise<LxSourceScript> {
  const raw = config.scriptUrl
    ? await fetchScriptFromUrl(config.scriptUrl, config.timeoutMs)
    : config.scriptFile
      ? await readFile(config.scriptFile, 'utf8')
      : null;

  if (!raw) {
    throw new Error('LX 用户源脚本未配置');
  }

  return {
    id: config.sourceId,
    name: config.sourceName,
    code: raw,
    hash: createHash('sha256').update(raw).digest('hex'),
    origin: config.scriptUrl ?? config.scriptFile ?? 'lx-source',
  };
}

/* 从 URL 下载源脚本。 */
async function fetchScriptFromUrl(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`LX source HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export type { LxMusicCandidate, LxResolvedUrl };
