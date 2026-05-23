/*
 * TTS provider 注册表
 * --------------------
 * 按 TTS_PROVIDER_CHAIN 配置组装 chain；未配置时使用默认链 'edge'。
 *   - chain 顺序决定 fallback 优先级
 *   - 与 server/src/music/providerRegistry.ts 同结构
 */

import { env } from '../env';
import { createDoubaoTtsProvider } from './providers/doubaoProvider';
import { createEdgeTtsProvider } from './providers/edgeProvider';
import type { TtsProvider } from './types';

/* 受支持的 chain 关键字。 */
const SUPPORTED_KEYS = new Set(['edge', 'doubao']);

let cachedChain: TtsProvider[] | null = null;

/*
 * 获取 TTS provider chain。
 * 进程内缓存：env 启动后不再变化，重复构造没有意义。
 */
export function getTtsProviderChain(): TtsProvider[] {
  if (cachedChain) return cachedChain;
  cachedChain = buildChain();
  return cachedChain;
}

/* 测试与热重载场景使用，业务路径不会调用。 */
export function resetTtsProviderChainCacheForTests(): void {
  cachedChain = null;
}

function buildChain(): TtsProvider[] {
  const candidates = createCandidates();
  const desiredOrder = parseChainConfig(env.TTS_PROVIDER_CHAIN) ?? ['edge'];

  const seen = new Set<string>();
  const ordered: TtsProvider[] = [];

  for (const key of desiredOrder) {
    if (seen.has(key)) continue;
    const provider = candidates.get(key);
    if (!provider) continue;
    if (provider.isEnabled && !provider.isEnabled()) continue;
    seen.add(key);
    ordered.push(provider);
  }

  return ordered;
}

/* 创建所有可能的 provider 实例，未启用的不会被挂入 chain。 */
function createCandidates(): Map<string, TtsProvider> {
  const map = new Map<string, TtsProvider>();
  map.set(
    'edge',
    createEdgeTtsProvider(env.TTS_DEFAULT_VOICE, env.TTS_TIMEOUT_MS),
  );
  map.set(
    'doubao',
    createDoubaoTtsProvider(
      env.DOUBAO_APP_ID ?? '',
      env.DOUBAO_ACCESS_TOKEN ?? '',
      env.DOUBAO_VOICE ?? env.TTS_DEFAULT_VOICE,
      env.TTS_TIMEOUT_MS,
    ),
  );
  return map;
}

/* 解析 TTS_PROVIDER_CHAIN，过滤未识别的 key。 */
function parseChainConfig(value: string | undefined): string[] | null {
  if (!value) return null;
  const tokens = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => SUPPORTED_KEYS.has(token));
  return tokens.length > 0 ? tokens : null;
}
