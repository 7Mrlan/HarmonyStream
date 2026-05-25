/*
 * LX Bridge 内部类型
 * ------------------
 * 这里定义 Claudio 服务端与 LX-compatible 用户源之间的最小契约。
 * 重点保持两层分离：候选搜索负责产出 musicInfo，用户源只负责把 musicInfo 解析为播放 URL。
 */

import type { MusicSearchInput } from '../types';

export interface LxMusicCandidate {
  /* 候选曲稳定 id，由候选 resolver 或 fixture 提供。 */
  id: string;
  /* LX 源 key，例如 kw / kg / tx / wy / mg / xm / local。 */
  source: string;
  /* 展示标题，用于映射为 Claudio Track。 */
  title: string;
  /* 展示歌手，可选。 */
  artist?: string;
  /* 专辑名，可选，仅作为元数据保留。 */
  album?: string;
  /* 封面 URL，可选。 */
  artwork?: string;
  /* 时长，毫秒。 */
  durationMs?: number;
  /* 期望音质，例如 128k / 320k / flac。 */
  quality?: string;
  /* 原样传给 LX 用户源的 musicInfo。 */
  musicInfo: Record<string, unknown>;
}

export interface LxResolvedUrl {
  /* 用户源解析出的可播放 URL。 */
  url: string;
  /* 实际解析音质。 */
  quality?: string;
  /* URL 过期时间，ISO 字符串。 */
  expiresAt?: string;
}

export interface LxCandidateSearcher {
  /* 根据 Claudio 搜索输入返回 LX 用户源可消费的候选 musicInfo。 */
  searchCandidates(input: MusicSearchInput): Promise<LxMusicCandidate[]>;
}

export interface LxCandidateSearchConfig {
  /* 外部候选 resolver 根地址；调用 POST {base}/search。 */
  resolverUrl?: string;
  /* 本地 smoke fixture 文件路径。 */
  fixtureFile?: string;
  /* 是否启用内置 Kuwo 候选搜索；系统默认源会使用它，用户可关闭或替换 resolver。 */
  enableKuwoSearch?: boolean;
  /* 请求超时。 */
  timeoutMs: number;
}

export interface LxBridgeRuntime {
  /* 加载当前启用源；源未变化时复用已有 worker context。 */
  loadActiveSource(): Promise<LxSourceInitResult>;
  /* 把候选 musicInfo 交给用户源解析播放 URL。 */
  resolveMusicUrl(candidate: LxMusicCandidate, quality?: string): Promise<LxResolvedUrl | null>;
  /* 销毁当前 worker。 */
  destroy(): Promise<void>;
}

export interface LxSourceRuntimeConfig {
  /* 用户源脚本 URL。 */
  scriptUrl?: string;
  /* 用户源脚本本地文件。 */
  scriptFile?: string;
  /* 用户源标识。 */
  sourceId: string;
  /* 展示名。 */
  sourceName: string;
  /* 脚本执行与 IPC 请求超时。 */
  timeoutMs: number;
  /* lx.request 默认超时。 */
  requestTimeoutMs: number;
}

export interface LxSourceScript {
  /* 用户源标识。 */
  id: string;
  /* 展示名。 */
  name: string;
  /* 脚本文本。 */
  code: string;
  /* sha256 hash，用于判断是否需要 reload。 */
  hash: string;
  /* 来源描述，用于日志。 */
  origin: string;
}

export interface LxSourceCapability {
  /* 用户源类型。G.1 只消费 music。 */
  type: 'music';
  /* 支持动作。G.1 只消费 musicUrl。 */
  actions: string[];
  /* 支持音质。 */
  qualitys: string[];
}

export interface LxSourceInitResult {
  /* 当前脚本 hash。 */
  scriptHash: string;
  /* 用户源声明的 source 能力。 */
  sources: Record<string, LxSourceCapability>;
}

export interface LxResolveMusicUrlRequest {
  /* 候选曲。 */
  candidate: LxMusicCandidate;
  /* 期望音质。 */
  quality?: string;
}

export interface LxWorkerClient {
  /* 在隔离进程内加载源脚本。 */
  loadSource(script: LxSourceScript): Promise<LxSourceInitResult>;
  /* 在隔离进程内请求 musicUrl。 */
  resolveMusicUrl(request: LxResolveMusicUrlRequest): Promise<LxResolvedUrl | null>;
  /* 销毁隔离进程。 */
  destroy(): Promise<void>;
}

export interface LxWorkerProcessOptions {
  /* IPC 单次请求超时。 */
  timeoutMs: number;
  /* lx.request 默认超时。 */
  requestTimeoutMs: number;
}

export interface LxBridgeProviderOptions {
  /* Bridge 运行时。 */
  runtime: LxBridgeRuntime;
  /* 候选搜索器。 */
  candidateSearcher: LxCandidateSearcher;
  /* provider 是否启用。 */
  isEnabled: () => boolean;
  /* 播放 URL 解析音质优先级。 */
  qualityPreference: string[];
  /* URL 短缓存 TTL。 */
  urlTtlMs: number;
}
