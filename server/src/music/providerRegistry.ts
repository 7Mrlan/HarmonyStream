/*
 * 音乐 provider 注册表
 * --------------------
 * 按 MUSIC_PROVIDER_CHAIN 配置组装 provider chain；未配置时按可用条件推导默认链。
 *   - chain 顺序决定搜索优先级
 *   - fallback 永远位于链尾，保证 musicResolver 任何情况都能拿到可播放结果
 *   - registry 不感知 LLM、状态机、路由层；只输出有序、可调用的 provider 列表
 */

import { env } from '../env';
import { createFallbackProvider } from './fallbackCatalog';
import { createExternalResolverProvider } from './providers/externalResolverProvider';
import { createLocalProvider } from './providers/localProvider';
import { createNcmProvider } from './providers/ncmProvider';
import type { MusicProvider } from './types';

/* 受支持的 chain 关键字。 */
const SUPPORTED_KEYS = new Set(['local', 'external', 'ncm', 'fallback']);

let cachedChain: MusicProvider[] | null = null;

/*
 * 获取 provider chain。
 * 缓存到进程内存：env 在启动后不再变化，重复构造没有意义。
 */
export function getProviderChain(): MusicProvider[] {
  if (cachedChain) return cachedChain;
  cachedChain = buildProviderChain();
  return cachedChain;
}

/* 按 manifest.id 查找 provider，路由层 / 缓存层会用到。 */
export function findProviderById(id: string): MusicProvider | null {
  return getProviderChain().find((provider) => provider.manifest.id === id) ?? null;
}

/* 测试与热重载场景使用，业务路径不会调用。 */
export function resetProviderChainCacheForTests(): void {
  cachedChain = null;
}

/*
 * 组装 chain。
 * 用户配置 MUSIC_PROVIDER_CHAIN 时严格按其顺序并去重；
 * 未配置时按 “local → external → ncm → fallback” 推导，但只挂启用的 provider。
 */
function buildProviderChain(): MusicProvider[] {
  const candidates = createCandidates();
  const desiredOrder = parseChainConfig(env.MUSIC_PROVIDER_CHAIN) ?? defaultChain();

  const seen = new Set<string>();
  const ordered: MusicProvider[] = [];

  for (const key of desiredOrder) {
    if (seen.has(key)) continue;
    const provider = candidates.get(key);
    if (!provider) continue;
    if (provider.isEnabled && !provider.isEnabled()) continue;
    seen.add(key);
    ordered.push(provider);
  }

  /* fallback 强制兜底，无论用户配置如何都不能丢。 */
  if (!seen.has('fallback')) {
    const fallback = candidates.get('fallback');
    if (fallback) ordered.push(fallback);
  }

  return ordered;
}

/* 创建所有可能的 provider 实例，未启用的不会被挂入 chain。 */
function createCandidates(): Map<string, MusicProvider> {
  const map = new Map<string, MusicProvider>();
  map.set('local', createLocalProvider(env.MUSIC_LIBRARY_DIR ?? '', env.MEDIA_BASE_URL ?? ''));
  map.set('external', createExternalResolverProvider(env.EXTERNAL_MUSIC_RESOLVER_URL ?? ''));
  map.set('ncm', createNcmProvider(env.MUSIC_API_BASE_URL ?? ''));
  map.set('fallback', createFallbackProvider());
  return map;
}

/* 解析 MUSIC_PROVIDER_CHAIN，过滤未识别的 key。 */
function parseChainConfig(value: string | undefined): string[] | null {
  if (!value) return null;
  const tokens = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => SUPPORTED_KEYS.has(token));
  return tokens.length > 0 ? tokens : null;
}

/*
 * 推导默认 chain。
 * 兼容 Phase D：MUSIC_PROVIDER=ncm 时把 ncm 放到 external 之后；
 * 否则按 owned → external → fallback 的稳定顺序。
 */
function defaultChain(): string[] {
  const chain: string[] = ['local', 'external'];
  if (env.MUSIC_PROVIDER === 'ncm') chain.push('ncm');
  chain.push('fallback');
  return chain;
}
