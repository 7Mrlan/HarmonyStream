/*
 * 测试数据工厂
 * ------------
 * 集中构造 Track、MusicLibrarySection、PersonalContext 和 UserMusicProfile，
 * 避免个人电台测试各自复制半份 schema。
 */

import type { Track } from '@claudio/api';
import type {
  MusicLibrarySection,
  PersonalContext,
  UserMusicProfile,
} from '../personal/profileTypes.js';

export interface TestTrackInput {
  title: string;
  artist?: string;
  id?: string;
  url?: string;
}

export interface TestSectionTrackInput {
  name: string;
  artist?: string;
}

export interface TestPersonalContextInput {
  sections?: MusicLibrarySection[];
  now?: Date;
  recentTracks?: Track[];
  listeningEvents?: PersonalContext['listeningEvents'];
  hasUserData?: boolean;
  tasteSummary?: string;
  promptLines?: string[];
  preferredTitles?: string[];
}

/* 构造可播放测试曲目。 */
export function createTestTrack(input: string | TestTrackInput): Track {
  const data = typeof input === 'string' ? { title: input } : input;
  return {
    id: data.id ?? `track-${data.artist ?? 'artist'}-${data.title}`,
    url: data.url ?? `https://example.com/${encodeURIComponent(data.title)}.mp3`,
    title: data.title,
    ...(data.artist ? { artist: data.artist } : {}),
  };
}

/* 构造简单歌单分组。 */
export function createMusicSection({
  name,
  inferredTags,
  tracks,
  description,
  sourceFile = 'simple-playlists.json',
}: {
  name: string;
  inferredTags: string[];
  tracks: TestSectionTrackInput[];
  description?: string;
  sourceFile?: string;
}): MusicLibrarySection {
  return {
    id: `section-${name}`,
    name,
    ...(description ? { description } : {}),
    sourceFile,
    inferredTags,
    tracks: tracks.map((track) => ({
      title: track.name,
      ...(track.artist ? { artist: track.artist } : {}),
      sectionName: name,
      sourceFile,
      inferredTags,
    })),
  };
}

/* 构造 Resident DJ / prompt 测试用个人上下文。 */
export function createPersonalContext(input: TestPersonalContextInput = {}): PersonalContext {
  const now = input.now ?? new Date('2026-05-28T09:00:00+08:00');
  const sections = input.sections ?? [];
  const hasUserData = input.hasUserData ?? sections.length > 0;

  return {
    profileSource: hasUserData ? 'user-data' : 'empty',
    hasUserData,
    tasteSummary:
      input.tasteSummary ??
      (hasUserData ? '偏好低刺激、分时段和不抢注意力的音乐。' : ''),
    environment: {
      now,
      hour: now.getHours(),
      timeSlot: now.getHours() < 12 ? 'morning' : now.getHours() >= 22 ? 'late-night' : 'daytime',
    },
    candidates: [],
    librarySections: sections,
    libraryInsights: [],
    listeningEvents: input.listeningEvents ?? [],
    djMemory: [],
    recentTracks: input.recentTracks ?? [],
    preferredTitles: input.preferredTitles ?? [],
    promptLines: input.promptLines ?? [],
    ttsStyle: {
      key: 'neutral-v1',
      emotion: '自然',
      styleInstruction: '语气自然',
    },
  };
}

/* 构造 profileSearch 测试用用户资料。 */
export function createUserMusicProfile(
  overrides: Partial<UserMusicProfile> = {},
): UserMusicProfile {
  return {
    source: 'user-data',
    loadedFiles: ['playlists.json'],
    tasteSummary: '喜欢清爽、个人化、有一点记忆点的华语流行。',
    tracks: [],
    librarySections: [],
    libraryInsights: [],
    listeningEvents: [],
    djMemory: [],
    moodRules: [],
    routines: [],
    ...overrides,
  };
}
