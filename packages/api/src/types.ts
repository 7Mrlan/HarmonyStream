/*
 * @claudio/api · HTTP 契约类型
 * -----------------------------
 * 前后端共享的 TypeScript 类型，与 server/src/routes/* 一一对应。
 * 任何契约变更必须同步更新此文件，前后端同时改。
 */

/* ========== 基础实体 ========== */

export type TrackSourceTier = 'owned' | 'external' | 'experimental' | 'fallback';

export type TrackCachePolicy = 'owned' | 'metadata-only' | 'no-cache';

export interface TrackSourceInfo {
  /* 音源 provider id，仅用于调试、缓存和预加载策略，不参与播放器渲染。 */
  provider: string;
  /* 音源能力层级：自有源可完整优化，外部源只能短缓存。 */
  tier: TrackSourceTier;
  /* 该曲目允许的缓存策略，由服务端 provider 声明。 */
  cachePolicy: TrackCachePolicy;
}

export interface Track {
  id: string;
  url: string; // 直链、相对媒体路径或远程 URL
  title: string;
  artist?: string;
  artwork?: string; // https url，512×512+
  duration?: number; // 秒
  quality?: string; // 实际解析到的音质，例如 320k / flac
  source?: TrackSourceInfo;
  expiresAt?: string;
}

export interface PlaybackCapabilities {
  /* 服务端队列中当前曲目前面是否还有可回退曲目。 */
  canPrevious: boolean;
  /* 服务端队列中当前曲目后面是否已有可立即播放曲目。 */
  canNext: boolean;
  /* 服务端完整内存队列长度，不等同于客户端可见队列切片长度。 */
  queueSize: number;
  /* 服务端当前曲目在完整内存队列里的索引。 */
  currentIndex: number;
  /* 当前 session 是否允许后台续推补歌。 */
  canAutoRefill: boolean;
}

/* ========== POST /api/chat ========== */

export interface ChatRequest {
  text: string;
  voice?: boolean; // 是否需要 TTS 合成
}

export interface ChatResponse {
  say: string; // DJ 文案
  play: string[]; // 推荐曲目（歌名，由后端解析为直链）
  reason?: string; // 选曲理由
  segue?: string; // 过渡词
}

/* ========== POST /api/listening-events ========== */

export type ListeningEventType = 'play' | 'skip' | 'previous' | 'favorite' | 'repeat' | 'feedback';

export interface ListeningEventRequest {
  type: ListeningEventType;
  title?: string;
  artist?: string;
  text?: string;
  at?: string;
  sourceEventIds?: string[];
}

export interface ListeningEventResponse {
  ok: boolean;
  id?: string;
  reason?: string;
}

/* ========== GET/POST /api/music-sources ========== */

export type MusicSourceMode = 'default' | 'user' | 'env';

export interface MusicSourceStatusResponse {
  activeMode: MusicSourceMode;
  defaultAvailable: boolean;
  hasUserSource: boolean;
  userSource?: {
    active: boolean;
    name: string;
    scriptHash: string;
    importedAt: string;
    sourceKeys: string[];
    lastValidationOk: boolean;
  };
  message?: string;
}

export interface MusicSourceImportRequest {
  name: string;
  script: string;
}

export interface MusicSourceValidationResult {
  ok: boolean;
  scriptHash?: string;
  sourceKeys: string[];
  reason?: string;
}

export interface MusicSourceImportResponse {
  ok: boolean;
  status: MusicSourceStatusResponse;
  validation: MusicSourceValidationResult;
}

export interface MusicSourceActivationRequest {
  mode: Exclude<MusicSourceMode, 'env'>;
}

export interface MusicSourceActivationResponse {
  ok: boolean;
  status: MusicSourceStatusResponse;
  reason?: string;
}

/* ========== GET /api/now ========== */

export interface NowResponse {
  track: Track | null;
  position: number; // 当前播放位置（秒）
  state: 'playing' | 'paused' | 'idle';
  playback?: PlaybackCapabilities;
}

/* ========== GET /api/next ========== */

export interface NextResponse {
  track: Track | null;
  reason: string; // 为什么是这一首
}

/* ========== GET /api/taste ========== */

/* ========== POST /api/playback/next | POST /api/playback/previous ========== */

export type PlaybackMoveResponse =
  | {
      ok: true;
      track: Track;
      queue: Track[];
      playback?: PlaybackCapabilities;
    }
  | {
      ok: false;
      reason: string;
      track: Track | null;
      queue: Track[];
      playback?: PlaybackCapabilities;
    };

export interface TasteResponse {
  genres: string[];
  moods: string[];
  recentArtists: string[];
}

/* ========== GET /api/plan/today ========== */

export interface PlanResponse {
  slots: Array<{
    time: string; // HH:MM
    theme: string;
    tracks?: string[];
  }>;
}

/* ========== GET /api/models ========== */

export interface ModelInfo {
  id: string; // 'deepseek' / 'qwen' / 'glm'
  displayName: string; // 'DeepSeek' / '通义千问' / '智谱'
}

export interface ModelsResponse {
  current: string;
  available: ModelInfo[];
}

/* ========== POST /api/models/switch ========== */

export interface SwitchModelRequest {
  id: string;
}

export interface SwitchModelResponse {
  ok: boolean;
  current: string;
}

/* ========== WS /stream 服务端推送事件 ========== */

export type StreamEvent =
  | { type: 'now-playing'; track: Track; position: number }
  | { type: 'chat-token'; text: string; final: boolean }
  | { type: 'tts-ready'; url: string; trackId?: string }
  | { type: 'track-commentary'; trackId: string; say: string; segue?: string; reason?: string }
  | { type: 'queue-update'; queue: Track[]; playback?: PlaybackCapabilities };
