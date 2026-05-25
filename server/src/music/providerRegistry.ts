/*
 * 音乐 provider 注册表
 * --------------------
 * 按 MUSIC_PROVIDER_CHAIN 配置组装 provider chain；未配置时按可用条件推导默认链。
 *   - chain 顺序决定搜索优先级
 *   - fallback 永远位于链尾，保证 musicResolver 任何情况都能拿到可播放结果
 *   - registry 不感知 LLM、状态机、路由层；只输出有序、可调用的 provider 列表
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { createFallbackProvider } from './fallbackCatalog.js';
import { createExternalResolverProvider } from './providers/externalResolverProvider.js';
import { createLocalProvider } from './providers/localProvider.js';
import { createLxBridgeProvider } from './providers/lxBridgeProvider.js';
import { createNcmProvider } from './providers/ncmProvider.js';
import { createLxCandidateSearcher } from './lxBridge/candidateSearch.js';
import { createLxSourceRuntime } from './lxBridge/sourceRuntime.js';
import type { LxCandidateSearcher } from './lxBridge/types.js';
import type { MusicProvider } from './types.js';

/* 受支持的 chain 关键字。 */
const SUPPORTED_KEYS = new Set([
  'local',
  'external',
  'lx',
  'lx-primary',
  'lx-secondary',
  'ncm',
  'fallback',
]);
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/* 系统默认 LX 双源池：assets 随仓库提交，data 作为本机私有覆盖层。 */
const ASSET_LX_PRIMARY_SOURCE_FILE = resolve(serverRoot, 'assets/lx-sources/primary.js');
const ASSET_LX_SECONDARY_SOURCE_FILE = resolve(serverRoot, 'assets/lx-sources/secondary.js');
const LOCAL_LX_PRIMARY_SOURCE_FILE = resolve(serverRoot, 'data/lx-sources/primary/primary.js');
const LOCAL_LX_SECONDARY_SOURCE_FILE = resolve(serverRoot, 'data/lx-sources/secondary/secondary.js');
const DEFAULT_LX_QUALITY_PREFERENCE = ['flac', '320k', '128k'];
const SHARED_CANDIDATE_SUCCESS_CACHE_TTL_MS = 15_000;
const SHARED_CANDIDATE_FAILURE_CACHE_TTL_MS = 3_000;

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
  const lxProviders = createConfiguredLxProviders();
  for (const [key, provider] of lxProviders) {
    map.set(key, provider);
  }
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
    .flatMap((token) => expandChainKey(token))
    .filter((token) => SUPPORTED_KEYS.has(token));
  return tokens.length > 0 ? tokens : null;
}

/* 展开兼容 key，确保 MUSIC_PROVIDER_CHAIN=lx 仍代表默认 LX 双源池。 */
function expandChainKey(token: string): string[] {
  if (token === 'lx') return hasUserConfiguredLxSource() ? ['lx'] : ['lx-primary', 'lx-secondary'];
  return [token];
}

/*
 * 推导默认 chain。
 * 兼容 Phase D：MUSIC_PROVIDER=ncm 时把 ncm 放到 external 之后；
 * 否则按 owned → external → fallback 的稳定顺序。
 */
function defaultChain(): string[] {
  const chain: string[] = ['local', 'external'];
  if (hasUserConfiguredLxSource()) {
    chain.push('lx');
  } else {
    chain.push('lx-primary', 'lx-secondary');
  }
  if (env.MUSIC_PROVIDER === 'ncm') chain.push('ncm');
  chain.push('fallback');
  return chain;
}

/*
 * 创建 LX Bridge provider 集合。
 * 用户显式配置单源时优先尊重用户配置；否则启用本地默认双源池。
 */
function createConfiguredLxProviders(): Map<string, MusicProvider> {
  const providers = new Map<string, MusicProvider>();
  const candidateSearcher = createSharedLxCandidateSearcher();

  if (hasUserConfiguredLxSource()) {
    providers.set('lx', createLxProviderFromScript({
      key: 'lx',
      name: env.LX_SOURCE_NAME,
      description: 'User configured LX-compatible music source',
      scriptUrl: env.LX_SOURCE_SCRIPT_URL,
      scriptFile: env.LX_SOURCE_SCRIPT_FILE,
      sourceId: env.LX_SOURCE_ID,
      sourceName: env.LX_SOURCE_NAME,
      candidateSearcher,
    }));
    return providers;
  }

  providers.set('lx-primary', createLxProviderFromScript({
    key: 'lx-primary',
    name: 'LX Primary Source',
    description: 'Default primary LX-compatible music source',
    scriptFile: resolveDefaultLxSourceFile('primary'),
    sourceId: 'lx-primary-source',
    sourceName: 'LX Primary Source',
    candidateSearcher,
  }));
  providers.set('lx-secondary', createLxProviderFromScript({
    key: 'lx-secondary',
    name: 'LX Secondary Source',
    description: 'Default secondary LX-compatible music source',
    scriptFile: resolveDefaultLxSourceFile('secondary'),
    sourceId: 'lx-secondary-source',
    sourceName: 'LX Secondary Source',
    candidateSearcher,
  }));
  return providers;
}

interface LxProviderScriptConfig {
  key: string;
  name: string;
  description: string;
  scriptUrl?: string;
  scriptFile?: string;
  sourceId: string;
  sourceName: string;
  candidateSearcher: LxCandidateSearcher;
}

/* 创建单个 LX Bridge provider，候选搜索器由调用方注入以便多源池共享搜索结果。 */
function createLxProviderFromScript(config: LxProviderScriptConfig): MusicProvider {
  const hasCandidateSource = Boolean(
    env.LX_METADATA_RESOLVER_URL ||
      env.LX_METADATA_FIXTURE_FILE ||
      env.LX_ENABLE_KUWO_SEARCH,
  );

  return createLxBridgeProvider({
    manifest: {
      id: config.key,
      name: config.name,
      description: config.description,
    },
    runtime: createLxSourceRuntime({
      scriptUrl: config.scriptUrl,
      scriptFile: config.scriptFile,
      sourceId: config.sourceId,
      sourceName: config.sourceName,
      timeoutMs: env.LX_BRIDGE_TIMEOUT_MS,
      requestTimeoutMs: env.LX_BRIDGE_REQUEST_TIMEOUT_MS,
    }),
    candidateSearcher: config.candidateSearcher,
    isEnabled: () => hasConfiguredScript(config) && hasCandidateSource,
    qualityPreference: parseQualityPreference(env.LX_QUALITY_PREFERENCE),
    urlTtlMs: 90 * 1000,
  });
}

/* 默认源优先读取本机 data 覆盖；不存在时回落到仓库内置 assets 源。 */
function resolveDefaultLxSourceFile(kind: 'primary' | 'secondary'): string {
  const local = kind === 'primary' ? LOCAL_LX_PRIMARY_SOURCE_FILE : LOCAL_LX_SECONDARY_SOURCE_FILE;
  const asset = kind === 'primary' ? ASSET_LX_PRIMARY_SOURCE_FILE : ASSET_LX_SECONDARY_SOURCE_FILE;
  return existsSync(local) ? local : asset;
}

/* 本地脚本源需要检查文件真实存在，避免无效 provider 进入 chain 后才失败。 */
function hasConfiguredScript(config: LxProviderScriptConfig): boolean {
  if (config.scriptUrl) return true;
  if (!config.scriptFile) return false;
  return existsSync(config.scriptFile);
}

/* 用户显式配置单个 LX 源时，默认双源池不再抢占。 */
function hasUserConfiguredLxSource(): boolean {
  return Boolean(env.LX_SOURCE_SCRIPT_URL || env.LX_SOURCE_SCRIPT_FILE);
}

/* 创建共享候选搜索器，避免 lx-primary 失败后 lx-secondary 重复请求 Kuwo 搜索。 */
function createSharedLxCandidateSearcher(): LxCandidateSearcher {
  const base = createLxCandidateSearcher({
    resolverUrl: env.LX_METADATA_RESOLVER_URL,
    fixtureFile: env.LX_METADATA_FIXTURE_FILE,
    enableKuwoSearch: env.LX_ENABLE_KUWO_SEARCH,
    timeoutMs: env.LX_BRIDGE_TIMEOUT_MS,
  });
  const cache = new Map<
    string,
    {
      expiresAt: number;
      request: ReturnType<LxCandidateSearcher['searchCandidates']>;
    }
  >();

  return {
    searchCandidates: (input) => {
      const key = buildCandidateSearchKey(input);
      const now = Date.now();
      const existing = cache.get(key);
      if (existing && existing.expiresAt > now) return existing.request;
      const request = base.searchCandidates(input).then(
        (candidates) => {
          const current = cache.get(key);
          if (current?.request === request) {
            current.expiresAt = Date.now() + SHARED_CANDIDATE_SUCCESS_CACHE_TTL_MS;
          }
          return candidates;
        },
        (error: unknown) => {
          const current = cache.get(key);
          if (current?.request === request) {
            current.expiresAt = Date.now() + SHARED_CANDIDATE_FAILURE_CACHE_TTL_MS;
          }
          throw error;
        },
      );
      cache.set(key, {
        expiresAt: now + SHARED_CANDIDATE_SUCCESS_CACHE_TTL_MS,
        request,
      });
      return request;
    },
  };
}

/* 生成候选搜索复用 key，覆盖用户原文、推荐曲名和 limit。 */
function buildCandidateSearchKey(input: Parameters<LxCandidateSearcher['searchCandidates']>[0]): string {
  const titles = (input.preferredTitles ?? [])
    .map((title) => title.trim().toLowerCase())
    .filter((title) => title.length > 0)
    .sort()
    .join('|');
  return `${input.userText.trim().toLowerCase()}::${input.limit}::${titles}`;
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
