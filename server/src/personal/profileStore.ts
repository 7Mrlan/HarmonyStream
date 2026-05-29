/*
 * 用户音乐资料读取
 * ----------------
 * 从 server/data/user-profile 读取用户私有资料；该目录被 .gitignore 忽略。
 * 没有资料时返回 empty profile，让上层明确知道不能假装认识用户。
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUserMusicProfileFromFiles,
  normalizeProfileText,
  normalizeStringArray,
} from './profileParsers.js';
import type { ListeningEvent, ListeningEventType, UserMusicProfile } from './profileTypes.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PROFILE_DIR = resolve(serverRoot, 'data/user-profile');
const LISTENING_EVENT_TITLE_MAX_LENGTH = 160;
const LISTENING_EVENT_ARTIST_MAX_LENGTH = 160;
const LISTENING_EVENT_TEXT_MAX_LENGTH = 500;
const LISTENING_EVENT_TIME_MAX_LENGTH = 80;

export interface LoadUserMusicProfileOptions {
  /* 测试或特殊运行时可指定资料目录。 */
  profileDir?: string;
}

export interface AppendListeningEventInput {
  /* 行为类型，沿用用户资料里的 listening event 语义。 */
  type: ListeningEventType;
  /* 关联歌名；feedback 可以没有歌名。 */
  title?: string;
  /* 关联歌手。 */
  artist?: string;
  /* 用户一句话反馈或系统备注。 */
  text?: string;
  /* 事件时间；为空时由服务端生成 ISO 时间。 */
  at?: string;
  /* 产生该事件的上游事件 id，便于后续回滚。 */
  sourceEventIds?: string[];
}

export interface AppendListeningEventOptions {
  /* 测试或特殊运行时可指定资料目录。 */
  profileDir?: string;
  /* 测试可注入固定时间，避免快照不稳定。 */
  now?: () => Date;
  /* 测试可注入固定 id，避免断言依赖随机数。 */
  createId?: () => string;
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
  return buildUserMusicProfileFromFiles({
    taste,
    routines,
    playlists,
    simplePlaylists,
    qqSongs,
    libraryInsights,
    listeningEvents,
    djMemory,
    moodRules,
  });
}

/*
 * 追加本地听歌事件。
 * 这是 Claudio 个人记忆闭环的唯一写入点：只做 append-only JSONL，不覆盖用户原始资料。
 */
export async function appendListeningEvent(
  input: AppendListeningEventInput,
  options: AppendListeningEventOptions = {},
): Promise<ListeningEvent> {
  const profileDir = options.profileDir ?? DEFAULT_PROFILE_DIR;
  const event = buildListeningEvent(input, options);

  await mkdir(profileDir, { recursive: true });
  await appendFile(resolve(profileDir, 'listening-events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');

  return event;
}

/*
 * 构造可落盘的听歌事件。
 * 路由层会先做请求校验；这里再做一次轻量保护，避免未来内部调用写入空事件。
 */
function buildListeningEvent(
  input: AppendListeningEventInput,
  options: AppendListeningEventOptions,
): ListeningEvent {
  const type = input.type;
  const title = truncateText(normalizeProfileText(input.title), LISTENING_EVENT_TITLE_MAX_LENGTH);
  const artist = truncateText(normalizeProfileText(input.artist), LISTENING_EVENT_ARTIST_MAX_LENGTH);
  const text = truncateText(normalizeProfileText(input.text), LISTENING_EVENT_TEXT_MAX_LENGTH);
  const at =
    truncateText(normalizeProfileText(input.at), LISTENING_EVENT_TIME_MAX_LENGTH) ??
    (options.now?.() ?? new Date()).toISOString();

  if (type === 'feedback' && !text) {
    throw new Error('feedback listening event requires text');
  }
  if (type !== 'feedback' && !title && !text) {
    throw new Error('track listening event requires title or text');
  }

  return {
    id: options.createId?.() ?? `event-${Date.now()}-${randomUUID().slice(0, 8)}`,
    type,
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    ...(text ? { text } : {}),
    at,
    sourceEventIds: normalizeStringArray(input.sourceEventIds),
  };
}

/* 限制自动写入记忆的文本长度，避免把超长聊天整段落盘。 */
function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
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
