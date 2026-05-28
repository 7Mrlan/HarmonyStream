/*
 * 个人音乐资料类型
 * ----------------
 * Phase L.0 的核心是把“用户资料、场景、个人候选曲、TTS 语气”收束成稳定内部结构。
 * 这些类型只在服务端内部使用，不扩公开 API 契约。
 */

import type { Track } from '@claudio/api';
import type { TtsStyle } from '../tts/types.js';

export type { TtsStyle } from '../tts/types.js';

export type ProfileSource = 'user-data' | 'empty';

export type TimeSlot = 'morning' | 'daytime' | 'evening' | 'late-night';

export interface PersonalTrackSeed {
  /* 歌名。 */
  title: string;
  /* 歌手，可空；检索和 provider 解析时会拼到 searchQuery。 */
  artist?: string;
  /* 歌曲或用户关系备注，只进 prompt，不进公开 Track。 */
  note?: string;
  /* 口味、场景、情绪标签。 */
  tags: string[];
  /* 来源歌单名，帮助 DJ 解释“为什么像你”。 */
  source?: string;
  /* 用户显式权重，默认 1。 */
  weight: number;
}

export interface MusicLibraryTrack {
  /* 歌名，兼容截图里的 name 字段，内部统一为 title。 */
  title: string;
  /* 歌手，可空。 */
  artist?: string;
  /* 所属分组名，例如 上午轻音乐 / 会议间歌。 */
  sectionName: string;
  /* 来源文件，便于排障和隐私边界说明。 */
  sourceFile: string;
  /* 从分组名、描述和歌曲字段推断出的轻量标签。 */
  inferredTags: string[];
}

export interface MusicLibrarySection {
  /* 稳定 id，由分组名和来源文件生成。 */
  id: string;
  /* 用户写的分组名。 */
  name: string;
  /* 用户可选短描述；不是作文式记忆。 */
  description?: string;
  /* 来源文件。 */
  sourceFile: string;
  /* 第一版不读取文件 mtime；保留字段给后续导入 UI。 */
  importedAt?: string;
  /* 系统从分组名和描述推断出的标签。 */
  inferredTags: string[];
  /* 分组内歌曲。 */
  tracks: MusicLibraryTrack[];
}

export interface LibraryInsight {
  /* 稳定 id，可用于回滚或重算。 */
  id: string;
  /* AI 从歌单和行为里总结出的短偏好。 */
  summary: string;
  /* 轻量标签。 */
  tags: string[];
  /* 产生该总结的事件 id，便于后续删除或重算。 */
  sourceEventIds: string[];
  /* 置信度 0-1。 */
  confidence: number;
}

export type ListeningEventType = 'play' | 'skip' | 'previous' | 'favorite' | 'repeat' | 'feedback';

export interface ListeningEvent {
  /* 稳定 id；没有时由读取顺序生成。 */
  id: string;
  /* 行为类型。 */
  type: ListeningEventType;
  /* 关联歌名，可空。 */
  title?: string;
  /* 关联歌手，可空。 */
  artist?: string;
  /* 用户一句话反馈或系统备注。 */
  text?: string;
  /* 事件时间，保持原始 ISO 字符串。 */
  at?: string;
  /* 相关事件 id，用于后续回滚。 */
  sourceEventIds: string[];
}

export interface DjMemoryPreference {
  /* 稳定 id。 */
  id: string;
  /* 长期稳定偏好。 */
  summary: string;
  /* 轻量标签。 */
  tags: string[];
  /* 产生该记忆的事件 id。 */
  sourceEventIds: string[];
  /* 置信度 0-1。 */
  confidence: number;
}

export interface MoodRule {
  /* 情绪名，例如 开心、怀旧、深夜。 */
  mood: string;
  /* 用户输入命中这些词时激活规则。 */
  keywords: string[];
  /* 激活后优先匹配的歌曲标签。 */
  preferredTags: string[];
  /* 激活后建议的 TTS 语气。 */
  ttsStyle?: TtsStyle;
  /* 给 DJ 的短备注。 */
  note?: string;
}

export interface RoutineRule {
  /* 稳定 id。 */
  id: string;
  /* 展示名，例如 清晨通勤、深夜写代码。 */
  label: string;
  /* 起止小时，使用本地时间 0-23。 */
  startHour: number;
  endHour: number;
  /* 当前 routine 偏好的标签。 */
  preferredTags: string[];
  /* 给 DJ 的短备注。 */
  note?: string;
  /* 当前 routine 建议的 TTS 语气。 */
  ttsStyle?: TtsStyle;
}

export interface UserMusicProfile {
  /* profile 来源；empty 表示没有本机用户资料，不能假装认识用户。 */
  source: ProfileSource;
  /* 成功读取的本机资料文件名。 */
  loadedFiles: string[];
  /* 用户口味摘要，来自 taste.md。 */
  tasteSummary: string;
  /* 用户长期候选歌池。 */
  tracks: PersonalTrackSeed[];
  /* 用户导入的简单歌单分组，Phase L.1 Resident DJ 的主证据来源。 */
  librarySections: MusicLibrarySection[];
  /* 系统从歌单和行为里总结出的可回滚偏好。 */
  libraryInsights: LibraryInsight[];
  /* 播放、跳过、收藏和反馈事件。 */
  listeningEvents: ListeningEvent[];
  /* 长期稳定 DJ 记忆。 */
  djMemory: DjMemoryPreference[];
  /* 情绪到标签/语气的规则。 */
  moodRules: MoodRule[];
  /* 时间段习惯。 */
  routines: RoutineRule[];
}

export interface ListeningEnvironment {
  /* 本地时间。 */
  now: Date;
  /* 当前小时。 */
  hour: number;
  /* 粗粒度时段。 */
  timeSlot: TimeSlot;
  /* 当前命中的 routine。 */
  routine?: RoutineRule;
}

export interface PersonalCandidate {
  /* 个人资料里的候选曲。 */
  track: PersonalTrackSeed;
  /* 检索分数，仅服务端内部排序使用。 */
  score: number;
  /* 可进入 prompt 的短理由。 */
  reasons: string[];
}

export interface PersonalSearchResult {
  /* 命中的情绪规则。 */
  mood?: MoodRule;
  /* 当前时间与 routine。 */
  environment: ListeningEnvironment;
  /* 排序后的候选。 */
  candidates: PersonalCandidate[];
  /* 给 TTS 的语气建议。 */
  ttsStyle: TtsStyle;
}

export interface PersonalContext {
  /* 原始 profile 来源。 */
  profileSource: ProfileSource;
  /* 是否有真实本机用户资料。 */
  hasUserData: boolean;
  /* 用户口味摘要。 */
  tasteSummary: string;
  /* 当前听歌环境。 */
  environment: ListeningEnvironment;
  /* 个人候选曲。 */
  candidates: PersonalCandidate[];
  /* 简单歌单分组证据。 */
  librarySections: MusicLibrarySection[];
  /* 系统总结出的偏好证据。 */
  libraryInsights: LibraryInsight[];
  /* 本地听歌事件证据。 */
  listeningEvents: ListeningEvent[];
  /* 长期稳定 DJ 记忆。 */
  djMemory: DjMemoryPreference[];
  /* 最近播放历史。 */
  recentTracks: Track[];
  /* 给 musicResolver 的优先歌名。 */
  preferredTitles: string[];
  /* 给 LLM / fallback 的压缩上下文片段。 */
  promptLines: string[];
  /* 给本轮 TTS 的动态语气。 */
  ttsStyle: TtsStyle;
}

export type ResidentIntent = 'play' | 'chat-and-play' | 'adjust' | 'feedback' | 'import-help';

export type ComfortMode =
  | 'celebrate'
  | 'sit-with-you'
  | 'lift-gently'
  | 'focus-with-you'
  | 'nostalgia-soft'
  | 'neutral';

export type PlaylistShape = 'single' | 'short-arc' | 'set';

export type EnergyCurve = 'low-stable' | 'rise-gently' | 'bright' | 'deep-focus' | 'wind-down';

export type CuratedCandidateSource =
  | 'from-user-library'
  | 'similar-to-user-library'
  | 'llm-discovery';

export type CuratedCandidateSlot = 'open' | 'hold' | 'lift' | 'close';

export interface DjTurnPlan {
  /* 用户原话。 */
  userText: string;
  /* 本轮意图。 */
  intent: ResidentIntent;
  /* 情绪陪伴模式。 */
  comfortMode: ComfortMode;
  /* 歌单形态。 */
  playlistShape: PlaylistShape;
  /* 本轮目标候选数量。 */
  targetCount: 1 | 3 | 5;
  /* 歌单能量曲线。 */
  energyCurve: EnergyCurve;
  /* 本轮约束，例如不要太吵、不要说教。 */
  constraints: string[];
}

export interface MemoryEvidence {
  /* 证据类型。 */
  type: 'section' | 'track' | 'taste' | 'recent' | 'insight' | 'event' | 'memory' | 'mood';
  /* 可读标题。 */
  label: string;
  /* 证据分数，只用于排序。 */
  score: number;
  /* 证据原因。 */
  reason: string;
}

export interface CuratedCandidate {
  /* 候选歌名。 */
  title: string;
  /* 候选歌手。 */
  artist?: string;
  /* 候选来源。 */
  source: CuratedCandidateSource;
  /* 为什么放在这段歌单里。 */
  reason: string;
  /* 歌单位置。 */
  slot: CuratedCandidateSlot;
}

export interface CriticReport {
  /* 是否通过审查。 */
  ok: boolean;
  /* 命中的风险点。 */
  issues: string[];
  /* 降级后的安全文案，可选。 */
  safeSay?: string;
}

export interface ResidentDjAgentTiming {
  /* agent 名称。 */
  agent: string;
  /* 是否成功。 */
  ok: boolean;
  /* 耗时毫秒。 */
  elapsedMs: number;
  /* 失败或降级原因。 */
  reason?: string;
}

export interface ResidentDjDiagnostics {
  /* 内部 agent timing，只进日志或测试，不进公开 API。 */
  timings: ResidentDjAgentTiming[];
  /* 可读降级原因。 */
  fallbackReasons: string[];
}

export interface ResidentDjPlan {
  /* 设计智能体输出。 */
  turnPlan: DjTurnPlan;
  /* 记忆馆员输出。 */
  evidence: MemoryEvidence[];
  /* 策展 / scout 输出。 */
  curatedCandidates: CuratedCandidate[];
  /* 自动审查输出。 */
  critic: CriticReport;
  /* 给 prompt 的压缩行。 */
  promptLines: string[];
  /* 内部观测信息。 */
  diagnostics?: ResidentDjDiagnostics;
}
