/*
 * 用户音乐资料读取
 * ----------------
 * 从 server/data/user-profile 读取用户私有资料；该目录被 .gitignore 忽略。
 * 没有资料时返回 empty profile，让上层明确知道不能假装认识用户。
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DjMemoryPreference,
  LibraryInsight,
  ListeningEvent,
  ListeningEventType,
  MusicLibrarySection,
  MusicLibraryTrack,
  MoodRule,
  PersonalTrackSeed,
  ProfileSource,
  RoutineRule,
  TtsStyle,
  UserMusicProfile,
} from './profileTypes.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PROFILE_DIR = resolve(serverRoot, 'data/user-profile');

interface RawPlaylistTrack {
  name?: unknown;
  title?: unknown;
  artist?: unknown;
  note?: unknown;
  tags?: unknown;
  moods?: unknown;
  scenes?: unknown;
  source?: unknown;
  weight?: unknown;
}

interface RawPlaylistFile {
  tracks?: unknown;
  playlists?: unknown;
}

interface RawSimplePlaylistSection {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  tracks?: unknown;
}

interface RawSimplePlaylistFile {
  sections?: unknown;
  tracks?: unknown;
}

interface RawInsightRecord {
  id?: unknown;
  summary?: unknown;
  text?: unknown;
  note?: unknown;
  tags?: unknown;
  sourceEventIds?: unknown;
  confidence?: unknown;
}

interface RawListeningEventRecord {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  name?: unknown;
  artist?: unknown;
  text?: unknown;
  note?: unknown;
  at?: unknown;
  time?: unknown;
  timestamp?: unknown;
  sourceEventIds?: unknown;
}

export interface LoadUserMusicProfileOptions {
  /* 测试或特殊运行时可指定资料目录。 */
  profileDir?: string;
}

/*
 * 读取用户音乐资料。
 * 文件缺失不会抛错；只有 JSON 格式错误会被折叠为空资料，避免 /api/chat 被用户文件拖死。
 */
export async function loadUserMusicProfile(
  options: LoadUserMusicProfileOptions = {},
): Promise<UserMusicProfile> {
  const profileDir = options.profileDir ?? DEFAULT_PROFILE_DIR;
  const [
    taste,
    routines,
    playlists,
    simplePlaylists,
    qqSongs,
    libraryInsights,
    listeningEvents,
    djMemory,
    moodRules,
  ] = await Promise.all([
    readOptionalText(resolve(profileDir, 'taste.md')),
    readOptionalText(resolve(profileDir, 'routines.md')),
    readOptionalText(resolve(profileDir, 'playlists.json')),
    readOptionalText(resolve(profileDir, 'simple-playlists.json')),
    readOptionalText(resolve(profileDir, 'qq_songs.json')),
    readOptionalText(resolve(profileDir, 'library-insights.json')),
    readOptionalText(resolve(profileDir, 'listening-events.jsonl')),
    readOptionalText(resolve(profileDir, 'dj-memory.json')),
    readOptionalText(resolve(profileDir, 'mood-rules.md')),
  ]);
  const librarySections = [
    ...parseSimplePlaylistSections(simplePlaylists, 'simple-playlists.json'),
    ...parseSimplePlaylistSections(qqSongs, 'qq_songs.json'),
  ];
  const legacyTracks = parsePlaylistTracks(playlists);
  const simpleTracks = librarySections.flatMap(sectionToTrackSeeds);

  const loadedFiles = [
    taste ? 'taste.md' : '',
    routines ? 'routines.md' : '',
    playlists ? 'playlists.json' : '',
    simplePlaylists ? 'simple-playlists.json' : '',
    qqSongs ? 'qq_songs.json' : '',
    libraryInsights ? 'library-insights.json' : '',
    listeningEvents ? 'listening-events.jsonl' : '',
    djMemory ? 'dj-memory.json' : '',
    moodRules ? 'mood-rules.md' : '',
  ].filter((file): file is string => Boolean(file));
  const source: ProfileSource = loadedFiles.length > 0 ? 'user-data' : 'empty';

  return {
    source,
    loadedFiles,
    tasteSummary: normalizeText(taste ?? '') ?? '',
    tracks: dedupeTracks([...simpleTracks, ...legacyTracks]),
    librarySections,
    libraryInsights: parseInsightRecords(libraryInsights, 'insight'),
    listeningEvents: parseListeningEvents(listeningEvents),
    djMemory: parseInsightRecords(djMemory, 'memory'),
    routines: parseRoutineRules(routines),
    moodRules: parseMoodRules(moodRules),
  };
}

/* 读取可选文本文件；不存在或不可读时返回 null。 */
async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    const value = await readFile(filePath, 'utf8');
    return value.trim() ? value : null;
  } catch {
    return null;
  }
}

/*
 * 解析 playlists.json。
 * 支持两种形态：直接数组，或 { tracks: [] } / { playlists: [{ name, tracks }] }。
 */
function parsePlaylistTracks(value: string | null): PersonalTrackSeed[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    const rawTracks = collectRawTracks(parsed);
    return dedupeTracks(
      rawTracks
        .map(normalizeTrackSeed)
        .filter((track): track is PersonalTrackSeed => Boolean(track)),
    );
  } catch {
    return [];
  }
}

/* 从多种 JSON 形态中收集原始 track。 */
function collectRawTracks(parsed: unknown): RawPlaylistTrack[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord) as RawPlaylistTrack[];
  if (!isRecord(parsed)) return [];

  const file = parsed as RawPlaylistFile;
  const directTracks = Array.isArray(file.tracks) ? file.tracks.filter(isRecord) : [];
  const playlistTracks = Array.isArray(file.playlists)
    ? file.playlists.flatMap((item) => {
        if (!isRecord(item)) return [];
        const source = normalizeText(item.name);
        const tracks = Array.isArray(item.tracks) ? item.tracks.filter(isRecord) : [];
        return tracks.map((track) => ({ ...track, source: normalizeText(track.source) ?? source }));
      })
    : [];

  return [...directTracks, ...playlistTracks] as RawPlaylistTrack[];
}

/* 归一化单条候选曲。 */
function normalizeTrackSeed(value: RawPlaylistTrack): PersonalTrackSeed | null {
  const title = normalizeText(value.title) ?? normalizeText(value.name);
  if (!title) return null;

  const artist = normalizeText(value.artist);
  const note = normalizeText(value.note);
  const source = normalizeText(value.source);
  const tags = normalizeTags(value.tags, value.moods, value.scenes);
  const weight = normalizeWeight(value.weight);

  return {
    title,
    ...(artist ? { artist } : {}),
    ...(note ? { note } : {}),
    ...(source ? { source } : {}),
    tags,
    weight,
  };
}

/*
 * 解析 Phase L.1 的简单歌单格式。
 * 支持 { sections: [{ name, description, tracks }] }、{ tracks: [] } 和纯数组。
 */
function parseSimplePlaylistSections(value: string | null, sourceFile: string): MusicLibrarySection[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return collectRawSimpleSections(parsed)
      .map((section, index) => normalizeLibrarySection(section, index, sourceFile))
      .filter((section): section is MusicLibrarySection => Boolean(section));
  } catch {
    return [];
  }
}

/*
 * 解析 library-insights.json / dj-memory.json。
 * 支持数组、{ insights: [] }、{ memories: [] }、{ preferences: [] }。
 */
function parseInsightRecords(value: string | null, kind: 'insight'): LibraryInsight[];
function parseInsightRecords(value: string | null, kind: 'memory'): DjMemoryPreference[];
function parseInsightRecords(
  value: string | null,
  kind: 'insight' | 'memory',
): Array<LibraryInsight | DjMemoryPreference> {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return collectRawInsightRecords(parsed)
      .map((record, index) => normalizeInsightRecord(record, index, kind))
      .filter((record): record is LibraryInsight | DjMemoryPreference => Boolean(record));
  } catch {
    return [];
  }
}

/* 收集可回滚偏好记录。 */
function collectRawInsightRecords(parsed: unknown): RawInsightRecord[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord) as RawInsightRecord[];
  if (!isRecord(parsed)) return [];

  const directKeys = ['insights', 'memories', 'preferences'];
  for (const key of directKeys) {
    const value = parsed[key];
    if (Array.isArray(value)) return value.filter(isRecord) as RawInsightRecord[];
  }
  return [];
}

/* 归一化可回滚偏好记录。 */
function normalizeInsightRecord(
  value: RawInsightRecord,
  index: number,
  kind: 'insight' | 'memory',
): LibraryInsight | DjMemoryPreference | null {
  const summary = normalizeText(value.summary) ?? normalizeText(value.text) ?? normalizeText(value.note);
  if (!summary) return null;

  const id = normalizeText(value.id) ?? `${kind}-${index + 1}`;
  return {
    id,
    summary,
    tags: normalizeTags(value.tags),
    sourceEventIds: normalizeStringArray(value.sourceEventIds),
    confidence: normalizeConfidence(value.confidence),
  };
}

/* 解析 listening-events.jsonl。 */
function parseListeningEvents(value: string | null): ListeningEvent[] {
  if (!value) return [];

  return value
    .split('\n')
    .map((line, index) => parseListeningEventLine(line, index))
    .filter((event): event is ListeningEvent => Boolean(event));
}

/* 解析单行听歌事件。 */
function parseListeningEventLine(line: string, index: number): ListeningEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return null;
    return normalizeListeningEvent(parsed as RawListeningEventRecord, index);
  } catch {
    return null;
  }
}

/* 归一化听歌事件。 */
function normalizeListeningEvent(value: RawListeningEventRecord, index: number): ListeningEvent | null {
  const type = normalizeListeningEventType(value.type);
  if (!type) return null;

  const title = normalizeText(value.title) ?? normalizeText(value.name);
  const artist = normalizeText(value.artist);
  const text = normalizeText(value.text) ?? normalizeText(value.note);
  const at = normalizeText(value.at) ?? normalizeText(value.time) ?? normalizeText(value.timestamp);

  return {
    id: normalizeText(value.id) ?? `event-${index + 1}`,
    type,
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    ...(text ? { text } : {}),
    ...(at ? { at } : {}),
    sourceEventIds: normalizeStringArray(value.sourceEventIds),
  };
}

/* 归一化听歌事件类型。 */
function normalizeListeningEventType(value: unknown): ListeningEventType | null {
  const text = normalizeText(value)?.toLowerCase();
  if (!text) return null;
  if (text === 'played' || text === 'complete' || text === 'completed') return 'play';
  if (text === 'liked' || text === 'love' || text === 'collected') return 'favorite';
  if (['play', 'skip', 'previous', 'favorite', 'repeat', 'feedback'].includes(text)) {
    return text as ListeningEventType;
  }
  return null;
}

/* 从简单歌单的多种形态中收集分组。 */
function collectRawSimpleSections(parsed: unknown): RawSimplePlaylistSection[] {
  if (Array.isArray(parsed)) {
    return [{ name: '导入歌单', tracks: parsed }];
  }
  if (!isRecord(parsed)) return [];

  const file = parsed as RawSimplePlaylistFile;
  if (Array.isArray(file.sections)) return file.sections.filter(isRecord) as RawSimplePlaylistSection[];
  if (Array.isArray(file.tracks)) return [{ name: '导入歌单', tracks: file.tracks }];
  return [];
}

/* 归一化一个简单歌单分组。 */
function normalizeLibrarySection(
  value: RawSimplePlaylistSection,
  index: number,
  sourceFile: string,
): MusicLibrarySection | null {
  const name = normalizeText(value.name) ?? normalizeText(value.title) ?? `导入歌单 ${index + 1}`;
  const description = normalizeText(value.description);
  const rawTracks = Array.isArray(value.tracks) ? value.tracks.filter(isRecord) : [];
  const sectionTags = inferTagsFromText([name, description].filter(Boolean).join(' '));
  const tracks = rawTracks
    .map((track) => normalizeLibraryTrack(track as RawPlaylistTrack, name, sourceFile, sectionTags))
    .filter((track): track is MusicLibraryTrack => Boolean(track));

  if (tracks.length === 0) return null;

  return {
    id: `${slugify(sourceFile)}-${slugify(name) || index + 1}`,
    name,
    ...(description ? { description } : {}),
    sourceFile,
    inferredTags: sectionTags,
    tracks,
  };
}

/* 归一化简单歌单里的单首歌。 */
function normalizeLibraryTrack(
  value: RawPlaylistTrack,
  sectionName: string,
  sourceFile: string,
  sectionTags: string[],
): MusicLibraryTrack | null {
  const title = normalizeText(value.title) ?? normalizeText(value.name);
  if (!title) return null;

  const artist = normalizeText(value.artist);
  const inferredTags = [
    ...sectionTags,
    ...inferTagsFromText(`${title} ${artist ?? ''}`),
    ...normalizeTags(value.tags, value.moods, value.scenes),
  ];

  return {
    title,
    ...(artist ? { artist } : {}),
    sectionName,
    sourceFile,
    inferredTags: [...new Set(inferredTags)],
  };
}

/* 把简单歌单分组转换成旧候选池，保留 L.0 兼容但不再作为主决策。 */
function sectionToTrackSeeds(section: MusicLibrarySection): PersonalTrackSeed[] {
  return section.tracks.map((track) => ({
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    tags: [...new Set([...section.inferredTags, ...track.inferredTags])],
    source: section.name,
    note: section.description ?? `${section.name} 分组里的歌`,
    weight: 1,
  }));
}

/* 去重同名同歌手候选，保留较高权重和更多标签。 */
function dedupeTracks(tracks: PersonalTrackSeed[]): PersonalTrackSeed[] {
  const byKey = new Map<string, PersonalTrackSeed>();

  for (const track of tracks) {
    const key = `${track.title.trim().toLowerCase()}::${track.artist?.trim().toLowerCase() ?? ''}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, track);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...track,
      tags: [...new Set([...existing.tags, ...track.tags])],
      weight: Math.max(existing.weight, track.weight),
    });
  }

  return [...byKey.values()];
}

/*
 * 解析 routines.md。
 * 支持行格式：- 深夜写代码 | 22-3 | tags=深夜,电子 | tts=低声、贴近、慢一点
 */
function parseRoutineRules(value: string | null): RoutineRule[] {
  if (!value) return [];

  return value
    .split('\n')
    .map((line, index) => parseRoutineLine(line, index))
    .filter((rule): rule is RoutineRule => Boolean(rule));
}

/* 解析单行 routine。 */
function parseRoutineLine(line: string, index: number): RoutineRule | null {
  const trimmed = trimBullet(line);
  if (!trimmed || !trimmed.includes('|')) return null;

  const [labelPart, timePart, ...rest] = trimmed.split('|').map((part) => part.trim());
  const range = parseHourRange(timePart ?? '');
  if (!labelPart || !range) return null;

  const fields = parseKeyValueParts(rest);
  return {
    id: slugify(labelPart) || `routine-${index + 1}`,
    label: labelPart,
    startHour: range.startHour,
    endHour: range.endHour,
    preferredTags: splitTags(fields.tags ?? fields.tag ?? ''),
    ...(fields.note ? { note: fields.note } : {}),
    ...(fields.tts ? { ttsStyle: buildTextStyle(fields.tts) } : {}),
  };
}

/*
 * 解析 mood-rules.md。
 * 支持行格式：- 开心: keywords=开心,快乐 | tags=明亮,轻快 | tts=更有笑意
 */
function parseMoodRules(value: string | null): MoodRule[] {
  if (!value) return [];

  return value
    .split('\n')
    .map(parseMoodLine)
    .filter((rule): rule is MoodRule => Boolean(rule));
}

/* 解析单行 mood rule。 */
function parseMoodLine(line: string): MoodRule | null {
  const trimmed = trimBullet(line);
  if (!trimmed || !trimmed.includes(':')) return null;

  const [moodPart, configPart] = trimmed.split(/:(.+)/u).map((part) => part.trim());
  if (!moodPart || !configPart) return null;

  const fields = parseKeyValueParts(configPart.split('|').map((part) => part.trim()));
  const keywords = splitTags(fields.keywords ?? fields.keyword ?? moodPart);
  const preferredTags = splitTags(fields.tags ?? fields.tag ?? moodPart);

  return {
    mood: moodPart,
    keywords,
    preferredTags,
    ...(fields.note ? { note: fields.note } : {}),
    ...(fields.tts ? { ttsStyle: buildTextStyle(fields.tts) } : {}),
  };
}

/* 把自由文本 TTS 描述包装成内部 TtsStyle。 */
function buildTextStyle(text: string): TtsStyle {
  return {
    key: `custom-${slugify(text) || 'style'}`,
    emotion: text.slice(0, 24),
    styleInstruction: text,
  };
}

/* 解析 key=value 片段。 */
function parseKeyValueParts(parts: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue.join('=').trim();
    if (!key || !value) continue;
    fields[key] = value;
  }
  return fields;
}

/* 解析跨午夜小时区间。 */
function parseHourRange(value: string): Pick<RoutineRule, 'startHour' | 'endHour'> | null {
  const match = value.match(/(\d{1,2})(?::\d{2})?\s*[-~到]\s*(\d{1,2})(?::\d{2})?/u);
  if (!match) return null;

  const startHour = normalizeHour(Number.parseInt(match[1] ?? '', 10));
  const endHour = normalizeHour(Number.parseInt(match[2] ?? '', 10));
  if (startHour === null || endHour === null) return null;

  return { startHour, endHour };
}

/* 标准化小时。 */
function normalizeHour(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 23) return null;
  return value;
}

/* 归一化标签集合。 */
function normalizeTags(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => splitTags(value)))];
}

/* 归一化字符串数组，供可回滚事件 id 使用。 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/* 从分组名 / 描述里推断轻量标签，避免要求用户手写标签。 */
function inferTagsFromText(value: string): string[] {
  const tags: string[] = [];
  const pairs: Array<[RegExp, string]> = [
    [/上午|早上|清晨|morning/i, '清晨'],
    [/午休|中午|12[:：]?00|午间/i, '午休'],
    [/会议|开会|meeting/i, '会议间'],
    [/夜尾|夜晚|深夜|睡前|horizon|night/i, '深夜'],
    [/轻音乐|ambient|冥想|放松|不抢|轻一点/i, '低刺激'],
    [/运动|心率|跑步|workout/i, '运动'],
    [/专注|工作|学习|写代码|focus/i, '专注'],
    [/开心|快乐|高兴|bright/i, '开心'],
    [/伤心|难过|低落|emo/i, '低落'],
    [/怀旧|老歌|经典/i, '怀旧'],
  ];

  for (const [pattern, tag] of pairs) {
    if (pattern.test(value)) tags.push(tag);
  }
  return [...new Set(tags)];
}

/* 切分标签字符串或数组。 */
function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(splitTags);
  if (typeof value !== 'string') return [];
  return value
    .split(/[,，、/|]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

/* 归一化文本字段。 */
function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/* 权重限制在可解释的小范围内。 */
function normalizeWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(5, value));
}

/* 置信度限制在 0-1。 */
function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/* 去掉 markdown bullet。 */
function trimBullet(value: string): string {
  return value
    .trim()
    .replace(/^[-*]\s*/u, '')
    .trim();
}

/* 把中文标签粗略转换成稳定 id。 */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .slice(0, 40);
}

/* 判断 unknown 是否是对象记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
