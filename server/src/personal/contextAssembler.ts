/*
 * Context Assembler
 * -----------------
 * 把用户资料检索、当前时间、播放历史和当前曲压缩成 LLM 可消费的 Context Window。
 * 这是 Phase L.0 的中枢：prompt 只吃这里产出的结构化上下文。
 */

import type { Track } from '@claudio/api';
import { loadUserMusicProfile } from './profileStore.js';
import { searchPersonalProfile } from './profileSearch.js';
import type { MusicLibrarySection, PersonalContext, TtsStyle } from './profileTypes.js';

export interface AssemblePersonalContextInput {
  /* 用户原始输入。 */
  userText: string;
  /* 当前正在播放的曲目。 */
  currentTrack: Track | null;
  /* 最近播放历史。 */
  recentTracks: Track[];
  /* 可注入时间，便于测试。 */
  now?: Date;
  /* 可注入资料目录，便于测试。 */
  profileDir?: string;
}

const EMPTY_TTS_STYLE: TtsStyle = {
  key: 'neutral-v1',
  emotion: '自然',
  styleInstruction: '语气自然，像私人电台 DJ，贴近但不过度表演',
  speed: 1,
};

/*
 * 组装个人上下文。
 * 任何本机资料读取失败都在 profileStore 内部收敛为空资料，保证 /api/chat 不断链。
 */
export async function assemblePersonalContext(
  input: AssemblePersonalContextInput,
): Promise<PersonalContext> {
  const profile = await loadUserMusicProfile({ profileDir: input.profileDir });
  const search = searchPersonalProfile({
    userText: input.userText,
    profile,
    now: input.now,
    limit: 6,
  });
  const preferredTitles = search.candidates.map((candidate) => candidate.track.title);
  const promptLines = buildPromptLines({
    tasteSummary: profile.tasteSummary,
    hasUserData: profile.source === 'user-data',
    search,
    librarySections: profile.librarySections,
    recentTracks: input.recentTracks,
    currentTrack: input.currentTrack,
    libraryInsights: profile.libraryInsights,
    listeningEvents: profile.listeningEvents,
    djMemory: profile.djMemory,
  });

  return {
    profileSource: profile.source,
    hasUserData: profile.source === 'user-data',
    tasteSummary: profile.tasteSummary,
    environment: search.environment,
    candidates: search.candidates,
    librarySections: profile.librarySections,
    libraryInsights: profile.libraryInsights,
    listeningEvents: profile.listeningEvents,
    djMemory: profile.djMemory,
    recentTracks: input.recentTracks.map(cloneTrack),
    preferredTitles,
    promptLines,
    ttsStyle: search.ttsStyle ?? EMPTY_TTS_STYLE,
  };
}

interface BuildPromptLinesInput {
  tasteSummary: string;
  hasUserData: boolean;
  search: ReturnType<typeof searchPersonalProfile>;
  librarySections: MusicLibrarySection[];
  libraryInsights: PersonalContext['libraryInsights'];
  listeningEvents: PersonalContext['listeningEvents'];
  djMemory: PersonalContext['djMemory'];
  recentTracks: Track[];
  currentTrack: Track | null;
}

/* 构造可直接拼进 prompt 的短上下文行。 */
function buildPromptLines(input: BuildPromptLinesInput): string[] {
  const lines: string[] = [];
  const { environment, candidates, mood } = input.search;

  lines.push(`资料状态：${input.hasUserData ? '有本机用户音乐资料' : '暂无本机用户音乐资料'}`);
  if (input.tasteSummary) lines.push(`用户口味摘要：${compactLine(input.tasteSummary, 180)}`);
  lines.push(`当前时段：${formatTimeSlot(environment.timeSlot)} / ${environment.hour}:00`);
  if (environment.routine) {
    lines.push(
      `当前习惯：${environment.routine.label}${environment.routine.note ? `，${environment.routine.note}` : ''}`,
    );
  }
  if (mood) {
    lines.push(`命中情绪：${mood.mood}${mood.note ? `，${mood.note}` : ''}`);
  }

  if (candidates.length > 0) {
    lines.push(
      `个人候选：${candidates
        .slice(0, 5)
        .map((candidate) => formatCandidate(candidate))
        .join('；')}`,
    );
  } else {
    lines.push('个人候选：无命中，禁止假装了解用户资料，只讲本轮听感。');
  }

  if (input.librarySections.length > 0) {
    lines.push(
      `简单歌单分组：${input.librarySections
        .slice(0, 4)
        .map(formatLibrarySection)
        .join('；')}`,
    );
  }
  if (input.libraryInsights.length > 0) {
    lines.push(
      `资料洞察：${input.libraryInsights
        .slice(0, 3)
        .map((insight) => `${insight.summary}（置信度 ${insight.confidence}）`)
        .join('；')}`,
    );
  }
  if (input.djMemory.length > 0) {
    lines.push(
      `长期偏好：${input.djMemory
        .slice(0, 3)
        .map((memory) => `${memory.summary}（置信度 ${memory.confidence}）`)
        .join('；')}`,
    );
  }
  if (input.listeningEvents.length > 0) {
    lines.push(
      `近期行为证据：${input.listeningEvents
        .slice(-5)
        .map((event) => formatListeningEvent(event))
        .join('；')}`,
    );
  }

  if (input.recentTracks.length > 0) {
    lines.push(`最近播放：${input.recentTracks.slice(0, 5).map(formatTrack).join('；')}`);
  }
  if (input.currentTrack) {
    lines.push(`当前曲目：${formatTrack(input.currentTrack)}`);
  }

  return lines;
}

/* 格式化个人候选，保留证据但不泄露整份资料。 */
function formatCandidate(candidate: BuildPromptLinesInput['search']['candidates'][number]): string {
  const artist = candidate.track.artist ? ` / ${candidate.track.artist}` : '';
  const source = candidate.track.source ? ` / 来自 ${candidate.track.source}` : '';
  return `${candidate.track.title}${artist}${source}（${candidate.reasons.join('，')}）`;
}

/* 格式化简单歌单分组，只取少量歌曲作为证据。 */
function formatLibrarySection(section: MusicLibrarySection): string {
  const description = section.description ? `，${compactLine(section.description, 36)}` : '';
  const tags = section.inferredTags.length > 0 ? `，推断=${section.inferredTags.join('/')}` : '';
  const tracks = section.tracks
    .slice(0, 4)
    .map((track) => (track.artist ? `${track.title} / ${track.artist}` : track.title))
    .join('、');
  return `${section.name}${description}${tags}：${tracks}`;
}

/* 格式化本地听歌事件，只暴露必要证据。 */
function formatListeningEvent(event: PersonalContext['listeningEvents'][number]): string {
  const title = event.title ? ` ${event.title}${event.artist ? ` / ${event.artist}` : ''}` : '';
  const text = event.text ? `：${compactLine(event.text, 32)}` : '';
  return `${event.type}${title}${text}`;
}

/* 格式化 Track。 */
function formatTrack(track: Track): string {
  return track.artist ? `${track.title} / ${track.artist}` : track.title;
}

/* 克隆 Track，隔离 radioState 内存引用。 */
function cloneTrack(track: Track): Track {
  return { ...track, ...(track.source ? { source: { ...track.source } } : {}) };
}

/* 压缩单行上下文，避免 markdown 长段直接灌进 prompt。 */
function compactLine(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/* 时段中文名。 */
function formatTimeSlot(slot: PersonalContext['environment']['timeSlot']): string {
  if (slot === 'morning') return '清晨';
  if (slot === 'daytime') return '白天';
  if (slot === 'evening') return '傍晚';
  return '深夜';
}
