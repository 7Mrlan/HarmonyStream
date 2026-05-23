/*
 * 音乐 provider 性能指标
 * ----------------------
 * Phase D.5 第二批：内部进程级指标，仅打日志，不暴露给前端 UI。
 *   - provider 调用耗时（ms）
 *   - cache hit / miss 计数
 *   - fallback 命中计数
 *   - 当前实现使用 console.info；后续接入 pino 时只换 sink 即可
 * 不依赖 prom-client 等重型库，避免 Phase D.5 第一版引入运行时成本。
 */

interface ProviderCounters {
  /* 调用总次数。 */
  calls: number;
  /* 命中次数（返回非空结果）。 */
  hits: number;
  /* 失败次数。 */
  errors: number;
  /* 累计耗时（ms），用于计算平均。 */
  totalMs: number;
  /* cache hit 次数。 */
  cacheHits: number;
  /* fallback 计入次数（provider 上报失败/无结果，最终被替代）。 */
  fallbackOuts: number;
}

const counters = new Map<string, ProviderCounters>();

/* 每多少次调用打印一次概要，避免日志刷屏。 */
const REPORT_EVERY_CALLS = 20;

/*
 * 包装 provider 调用，统计耗时和成功状态。
 * 调用方只需 await measureProviderCall(id, () => provider.searchPlayableTracks(...))。
 */
export async function measureProviderCall<T>(
  providerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const stats = ensureCounter(providerId);
  const startedAt = Date.now();
  stats.calls += 1;

  try {
    const result = await fn();
    stats.totalMs += Date.now() - startedAt;
    if (Array.isArray(result) ? result.length > 0 : Boolean(result)) {
      stats.hits += 1;
    }
    maybeReport(providerId, stats);
    return result;
  } catch (error) {
    stats.totalMs += Date.now() - startedAt;
    stats.errors += 1;
    maybeReport(providerId, stats);
    throw error;
  }
}

/* 记一次 cache 命中。 */
export function recordCacheHit(providerId: string): void {
  ensureCounter(providerId).cacheHits += 1;
}

/* 记一次回退（provider 无结果或失败，最终被替代）。 */
export function recordFallback(providerId: string): void {
  ensureCounter(providerId).fallbackOuts += 1;
}

/* 测试用：清空计数。 */
export function resetMusicMetricsForTests(): void {
  counters.clear();
}

/* 取一个 provider 的当前快照，方便调试日志。 */
export function snapshotMusicMetrics(): Record<string, ProviderCounters> {
  const snapshot: Record<string, ProviderCounters> = {};
  for (const [id, stats] of counters.entries()) {
    snapshot[id] = { ...stats };
  }
  return snapshot;
}

function ensureCounter(providerId: string): ProviderCounters {
  let stats = counters.get(providerId);
  if (!stats) {
    stats = { calls: 0, hits: 0, errors: 0, totalMs: 0, cacheHits: 0, fallbackOuts: 0 };
    counters.set(providerId, stats);
  }
  return stats;
}

function maybeReport(providerId: string, stats: ProviderCounters): void {
  if (stats.calls === 0) return;
  if (stats.calls % REPORT_EVERY_CALLS !== 0) return;
  const avgMs = stats.calls === 0 ? 0 : Math.round(stats.totalMs / stats.calls);
  /*
   * 选用 console.info 而非 pino logger，避免在 music 模块里耦合 fastify。
   * 服务端启动时 pino 会接管 stdout，依旧能在日志里看到这条记录。
   */
  console.info(
    `[music-metrics] provider=${providerId} calls=${stats.calls} hits=${stats.hits} errors=${stats.errors} cacheHits=${stats.cacheHits} fallbacks=${stats.fallbackOuts} avgMs=${avgMs}`,
  );
}
