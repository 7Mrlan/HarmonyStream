/*
 * LX Bridge 子进程客户端
 * ---------------------
 * Fastify 主进程只负责启动、发消息和超时 kill，不直接执行用户源脚本。
 */

import { fork, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  LxResolvedUrl,
  LxSourceInitResult,
  LxWorkerClient,
  LxWorkerProcessOptions,
} from './types';
import type { LxWorkerMessage, LxWorkerResponseMessage } from './workerProtocol';

/* 创建隔离 worker 客户端。 */
export function createLxWorkerProcess(options: LxWorkerProcessOptions): LxWorkerClient {
  let child: ChildProcess | null = null;

  return {
    loadSource: async (script) => {
      child = restartWorker(child);
      return requestWorker<LxSourceInitResult>(
        child,
        {
          id: createRequestId(),
          action: 'load-source',
          payload: { script, requestTimeoutMs: options.requestTimeoutMs },
        },
        options.timeoutMs,
      );
    },
    resolveMusicUrl: async (request) => {
      if (!child) throw new Error('LX worker 尚未加载源脚本');
      return requestWorker<LxResolvedUrl | null>(
        child,
        { id: createRequestId(), action: 'resolve-music-url', payload: request },
        options.timeoutMs,
      );
    },
    destroy: async () => {
      if (!child) return;
      const target = child;
      child = null;
      try {
        await requestWorker<null>(
          target,
          { id: createRequestId(), action: 'destroy', payload: null },
          Math.min(options.timeoutMs, 1000),
        );
      } catch {
        /* destroy 失败时继续 kill，避免子进程残留。 */
      } finally {
        killWorker(target, 'destroy');
      }
    },
  };
}

/*
 * 向 worker 发送一次 IPC 请求。
 * 超时后 kill 子进程，防止用户源长时间阻塞。
 */
export function requestWorker<TResponse>(
  child: ChildProcess,
  message: LxWorkerMessage,
  timeoutMs: number,
): Promise<TResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      cleanup();
      killWorker(child, `request timeout: ${message.action}`);
      rejectPromise(new Error(`LX worker ${message.action} 超时`));
    }, timeoutMs);

    const onMessage = (raw: unknown) => {
      const response = raw as LxWorkerResponseMessage<TResponse>;
      if (!response || response.id !== message.id) return;
      cleanup();
      if (response.ok) {
        resolvePromise(response.payload);
      } else {
        rejectPromise(new Error(response.error));
      }
    };

    const onExit = () => {
      cleanup();
      rejectPromise(new Error(`LX worker 已退出：${message.action}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onExit);
    };

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onExit);

    const sent = child.send(message);
    if (!sent) {
      cleanup();
      rejectPromise(new Error(`LX worker 消息发送失败：${message.action}`));
    }
  });
}

/* kill worker，并兼容已经退出的场景。 */
export function killWorker(child: ChildProcess, _reason: string): void {
  if (child.killed) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL');
  }, 500).unref?.();
}

/* 重启 worker，确保每次 loadSource 都得到干净 context。 */
function restartWorker(current: ChildProcess | null): ChildProcess {
  if (current) killWorker(current, 'reload');
  return fork(resolveWorkerEntry(), [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    execArgv: process.execArgv,
    env: {
      ...process.env,
    },
  });
}

/*
 * 解析 worker 入口。
 * dev 下是 src/ts，通过 tsx 的 execArgv 加载；build 后是 dist/js。
 */
function resolveWorkerEntry(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, 'worker-entry.js');
}

/* 生成 IPC 请求 id。 */
function createRequestId(): string {
  return `lx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
