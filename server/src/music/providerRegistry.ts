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
import { createLxBridgeProvider } from './providers/lxBridgeProvider';
import { createNcmProvider } from './providers/ncmProvider';
import { createLxCandidateSearcher } from './lxBridge/candidateSearch';
import { createLxSourceRuntime } from './lxBridge/sourceRuntime';
import type { MusicProvider } from './types';

/* 受支持的 chain 关键字。 */
const SUPPORTED_KEYS = new Set(['local', 'external', 'lx', 'ncm', 'fallback']);
/* 系统默认 LX 源：使用已完成真实闭环验证的 huibq 源在线导入链接。 */
const DEFAULT_LX_SOURCE_SCRIPT_URL =
  'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js';
const DEFAULT_LX_QUALITY_PREFERENCE = ['320k', '128k'];

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

/*
 * 启动后预热 provider。
 * 只调用 provider 的显式 warmup，不做搜索、不解析音频 URL，避免启动时触碰用户点歌语义。
 */
export function warmupProviderChain(): void {
  for (const provider of getProviderChain()) {
    if (!provider.warmup) continue;
    void provider.warmup().catch((error) => {
      const message = error instanceof Error ? error.message : '未知错误';
      console.warn(`[music] provider warmup failed: ${provider.manifest.id}: ${message}`);
    });
  }
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
  map.set('lx', createConfiguredLxProvider());
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
  const chain: string[] = ['local', 'external', 'lx'];
  if (env.MUSIC_PROVIDER === 'ncm') chain.push('ncm');
  chain.push('fallback');
  return chain;
}

/*
 * 创建 LX Bridge provider。
 * 默认使用已验证的 huibq 源 + Kuwo 候选搜索；用户显式配置 URL / 文件 / resolver 时覆盖默认值。
 */
function createConfiguredLxProvider(): MusicProvider {
  const scriptUrl =
    env.LX_SOURCE_SCRIPT_URL ??
    (env.LX_SOURCE_SCRIPT_FILE ? undefined : DEFAULT_LX_SOURCE_SCRIPT_URL);
  const scriptFile = env.LX_SOURCE_SCRIPT_FILE;
  const hasScript = Boolean(scriptUrl || scriptFile);
  const hasCandidateSource = Boolean(
    env.LX_METADATA_RESOLVER_URL ||
      env.LX_METADATA_FIXTURE_FILE ||
      env.LX_ENABLE_KUWO_SEARCH,
  );

  return createLxBridgeProvider({
    runtime: createLxSourceRuntime({
      scriptUrl,
      scriptFile,
      sourceId: env.LX_SOURCE_ID,
      sourceName: env.LX_SOURCE_NAME,
      timeoutMs: env.LX_BRIDGE_TIMEOUT_MS,
      requestTimeoutMs: env.LX_BRIDGE_REQUEST_TIMEOUT_MS,
    }),
    candidateSearcher: createLxCandidateSearcher({
      resolverUrl: env.LX_METADATA_RESOLVER_URL,
      fixtureFile: env.LX_METADATA_FIXTURE_FILE,
      enableKuwoSearch: env.LX_ENABLE_KUWO_SEARCH,
      timeoutMs: env.LX_BRIDGE_TIMEOUT_MS,
    }),
    isEnabled: () => hasScript && hasCandidateSource,
    qualityPreference: parseQualityPreference(env.LX_QUALITY_PREFERENCE),
    urlTtlMs: 90 * 1000,
  });
}

/* 解析 LX 音质优先级，去重并兜底到当前默认源可用的高音质顺序。 */
function parseQualityPreference(value: string | undefined): string[] {
  const parsed = (value ?? '')
    .split(',')
    .map((quality) => quality.trim())
    .filter((quality) => quality.length > 0);

  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : DEFAULT_LX_QUALITY_PREFERENCE;
}
