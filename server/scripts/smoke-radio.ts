/*
 * 电台后端结构烟测。
 * 先构建 server，再用临时端口启动 dist/index.js，验证 /api/chat 与 /api/now 的状态提交一致性。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { NowResponse } from '@claudio/api';

interface ChatResponseBody {
  say: string;
  play: string[];
  reason?: string;
  segue?: string;
}

interface NowResponseBody {
  track: { title: string } | null;
  state: NowResponse['state'];
}

interface SmokeResult {
  name: string;
  text: string;
  playCount: number;
  nowTitle: string | null;
  state: NowResponseBody['state'];
}

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const STRUCTURAL_CASES = [
  { name: 'single-explicit', text: '我想听周杰伦的晴天' },
  { name: 'mood-range', text: '想听开心的歌' },
  { name: 'multi-recommendation', text: '给我推荐几首伤心的歌' },
  { name: 'odd-keyword', text: 'zzzzzzzzzzzzzzzzzz-not-a-song-claudio' },
] as const;

/*
 * 主入口。
 * 单独使用 async main 便于 finally 中稳定清理临时服务端进程。
 */
async function main(): Promise<void> {
  const structuralPort = await findFreePort();
  const structuralServer = startServer(structuralPort, {});

  try {
    await waitForHealth(structuralPort);
    const structuralResults = await runStructuralCases(structuralPort);
    printSection('structural', structuralResults);
  } finally {
    await stopServer(structuralServer);
  }

  const noResultPort = await findFreePort();
  const noResultServer = startServer(noResultPort, {
    MUSIC_PROVIDER_CHAIN: 'fallback',
  });

  try {
    await waitForHealth(noResultPort);
    const noResult = await runForcedNoResultCase(noResultPort);
    printSection('forced-no-result', [noResult]);
  } finally {
    await stopServer(noResultServer);
  }
}

/*
 * 启动临时服务端。
 * Windows 上不要 Start-Process pnpm；这里直接启动 node dist/index.js，避免 pnpm.cmd / 子进程清理问题。
 */
function startServer(port: number, extraEnv: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      ...extraEnv,
      PORT: String(port),
      LOG_LEVEL: 'fatal',
    },
    stdio: 'pipe',
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[server:${port}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[server:${port}] ${chunk}`);
  });

  return child;
}

/*
 * 停止临时服务端。
 * SIGTERM 不退出时再 kill，保证本脚本不会留下测试端口。
 */
async function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill('SIGTERM');
  const exited = await waitForExit(child, 3_000);
  if (!exited) child.kill('SIGKILL');
}

/* 等待子进程退出。 */
function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/*
 * 等待 /health 可用。
 * 启动失败时抛出明确错误，而不是继续跑出一串连接失败。
 */
async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetchJson<{ ok: boolean }>(port, '/health', { method: 'GET' });
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(`server did not become ready on port ${port}`);
}

/*
 * 跑真实环境结构用例。
 * 真实音源可能搜不到具体歌，也可能对随机词返回相近曲；这里验证的是 chat 分支与 now 状态一致。
 */
async function runStructuralCases(port: number): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  for (const item of STRUCTURAL_CASES) {
    const chat = await sendChat(port, item.text);
    const now = await fetchJson<NowResponseBody>(port, '/api/now', { method: 'GET' });
    assertChatNowConsistency(item.name, chat, now);
    results.push({
      name: item.name,
      text: item.text,
      playCount: chat.play.length,
      nowTitle: now.track?.title ?? null,
      state: now.state,
    });
  }
  return results;
}

/*
 * 强制无曲目分支。
 * /api/chat 默认禁止 fallback provider；当 chain 只有 fallback 时，应该稳定返回空 play 和 idle。
 */
async function runForcedNoResultCase(port: number): Promise<SmokeResult> {
  const text = '我想听周杰伦的晴天';
  const chat = await sendChat(port, text);
  const now = await fetchJson<NowResponseBody>(port, '/api/now', { method: 'GET' });
  if (chat.play.length !== 0 || now.track !== null || now.state !== 'idle') {
    throw new Error('forced no-result branch failed');
  }
  return {
    name: 'forced-no-result',
    text,
    playCount: chat.play.length,
    nowTitle: null,
    state: now.state,
  };
}

/* 发送聊天请求。 */
async function sendChat(port: number, text: string): Promise<ChatResponseBody> {
  return fetchJson<ChatResponseBody>(port, '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: false }),
  });
}

/*
 * 校验 chat 响应与 now 状态是否一致。
 * 有 play 时应处于 playing 且有 track；无 play 时应处于 idle 且没有 track。
 */
function assertChatNowConsistency(name: string, chat: ChatResponseBody, now: NowResponseBody): void {
  const hasPlay = chat.play.length > 0;
  const consistent = hasPlay
    ? now.track !== null && now.state === 'playing'
    : now.track === null && now.state === 'idle';
  if (!consistent) {
    throw new Error(`${name} inconsistent: play=${chat.play.length}, state=${now.state}, track=${now.track?.title ?? 'null'}`);
  }
}

/* 带超时的 JSON fetch。 */
async function fetchJson<T>(port: number, path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`http://${HOST}:${port}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* 找一个可用端口。 */
async function findFreePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate port')));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

/* 输出测试结果。 */
function printSection(name: string, results: SmokeResult[]): void {
  console.info(`[smoke-radio] ${name}`);
  for (const result of results) {
    console.info(JSON.stringify(result));
  }
}

/* 简单等待。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error('[smoke-radio] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
