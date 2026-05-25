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

/* ========== GET /api/now ========== */

export interface NowResponse {
  track: Track | null;
  position: number; // 当前播放位置（秒）
  state: 'playing' | 'paused' | 'idle';
}

/* ========== GET /api/next ========== */

export interface NextResponse {
  track: Track | null;
  reason: string; // 为什么是这一首
}

/* ========== GET /api/taste ========== */

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
  petSprite: string; // 像素宠物 sprite key
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
  | { type: 'tts-ready'; url: string }
  | { type: 'queue-update'; queue: Track[] };
