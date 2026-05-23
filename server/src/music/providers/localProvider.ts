/*
 * 本地自有音源 provider
 * ---------------------
 * 扫描 MUSIC_LIBRARY_DIR 下的音频文件，作为 owned tier provider。
 * 第一版只做轻量文件名解析（artist - title），不引入重型 ID3 标签库；
 * 播放 URL 走 Claudio 服务自身的 /media/local/:id Range route，避免直接暴露文件路径。
 */

import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Track } from '@claudio/api';
import type { MusicProvider, MusicProviderManifest, MusicSearchInput } from '../types';
import { MUSIC_PROVIDER_API_VERSION } from '../types';

/* 支持的音频扩展名，PC/手机端 expo-audio 都能直接播放。 */
const SUPPORTED_EXTS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac']);

/* 单次扫描的最大文件数，避免大目录拖慢启动。 */
const MAX_SCAN_ENTRIES = 5000;

/* 扫描结果在内存中缓存的有效期（毫秒）。 */
const SCAN_CACHE_TTL_MS = 30 * 1000;

interface LocalLibraryEntry {
  /* 稳定 id，basedir 相对路径的 sha1 前缀，便于路由解析回真实文件。 */
  id: string;
  /* 绝对文件路径，仅服务端使用。 */
  absolutePath: string;
  /* 相对 base 的路径，用于排序和展示。 */
  relativePath: string;
  /* 解析得到的标题。 */
  title: string;
  /* 解析得到的歌手，可空。 */
  artist?: string;
}

/* 本地 provider manifest：owned tier，允许预加载和音频缓存。 */
const LOCAL_MANIFEST: MusicProviderManifest = {
  id: 'local',
  name: 'Local Music Library',
  version: '1.0.0',
  type: 'local',
  description: '扫描 MUSIC_LIBRARY_DIR 的本地音频文件，自有合法音源，可被完整优化。',
  pluginApiVersion: MUSIC_PROVIDER_API_VERSION,
  capabilities: ['metadata', 'audio-source'],
  tier: 'owned',
  defaultCachePolicy: 'owned',
  artworkCacheAllowed: true,
  audioPreloadAllowed: true,
  audioCacheAllowed: true,
};

let scanCache: { baseDir: string; entries: LocalLibraryEntry[]; expiresAt: number } | null = null;

/*
 * 创建本地 provider。
 * libraryDir / mediaBaseUrl 任一为空时 provider 自动禁用。
 */
export function createLocalProvider(libraryDir: string, mediaBaseUrl: string): MusicProvider {
  const normalizedDir = libraryDir.trim();
  const normalizedBase = mediaBaseUrl.trim().replace(/\/+$/, '');

  return {
    manifest: LOCAL_MANIFEST,
    isEnabled: () => Boolean(normalizedDir && normalizedBase),
    searchPlayableTracks: async (input) =>
      searchPlayableTracks(normalizedDir, normalizedBase, input),
  };
}

/*
 * 根据 id 解析回本地条目。
 * 路由层用它把 /media/local/:id 映射回文件，校验后再做 Range 流。
 */
export async function findLocalEntryById(
  libraryDir: string,
  id: string,
): Promise<LocalLibraryEntry | null> {
  if (!libraryDir || !id) return null;
  const entries = await scanLibrary(libraryDir);
  return entries.find((entry) => entry.id === id) ?? null;
}

/*
 * 扫描本地音乐库。
 * 命中缓存则直接返回；没有命中则递归 readdir。
 */
async function scanLibrary(baseDir: string): Promise<LocalLibraryEntry[]> {
  const now = Date.now();
  if (scanCache && scanCache.baseDir === baseDir && scanCache.expiresAt > now) {
    return scanCache.entries;
  }

  const absoluteBase = resolve(baseDir);
  const collected: LocalLibraryEntry[] = [];

  try {
    await walk(absoluteBase, absoluteBase, collected);
  } catch {
    /* 目录不可读或不存在时返回空列表，让 provider 自动禁用。 */
    scanCache = { baseDir, entries: [], expiresAt: now + SCAN_CACHE_TTL_MS };
    return [];
  }

  scanCache = { baseDir, entries: collected, expiresAt: now + SCAN_CACHE_TTL_MS };
  return collected;
}

/*
 * 递归扫描目录。
 * 限制最大条目数和递归深度，避免误指根目录时把整盘扫穿。
 */
async function walk(
  baseDir: string,
  current: string,
  output: LocalLibraryEntry[],
  depth = 0,
): Promise<void> {
  if (depth > 6) return;
  if (output.length >= MAX_SCAN_ENTRIES) return;

  const items = await readdir(current);
  for (const name of items) {
    if (output.length >= MAX_SCAN_ENTRIES) break;
    if (name.startsWith('.')) continue;

    const fullPath = join(current, name);
    let info;
    try {
      info = await stat(fullPath);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      await walk(baseDir, fullPath, output, depth + 1);
      continue;
    }
    if (!info.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;

    const relativePath = relative(baseDir, fullPath).split(sep).join('/');
    const id = hashRelativePath(relativePath);
    const { title, artist } = parseTrackName(name);
    output.push({ id, absolutePath: fullPath, relativePath, title, artist });
  }
}

/*
 * 在本地库内做关键字搜索。
 * 第一版用 includes + 字符串归一化，命中文件名 / 解析出的 title / artist。
 */
async function searchPlayableTracks(
  libraryDir: string,
  mediaBaseUrl: string,
  input: MusicSearchInput,
): Promise<Track[]> {
  const entries = await scanLibrary(libraryDir);
  if (entries.length === 0) return [];

  const candidates = pickCandidates(entries, input);
  return candidates.slice(0, Math.max(1, input.limit)).map((entry) => entryToTrack(entry, mediaBaseUrl));
}

/*
 * 选择候选条目。
 * preferredTitles 命中优先；没有命中时退回用户原始输入；都为空时取前 N 条。
 */
function pickCandidates(entries: LocalLibraryEntry[], input: MusicSearchInput): LocalLibraryEntry[] {
  const haystack = entries.map((entry) => ({ entry, key: normalize(`${entry.title} ${entry.artist ?? ''} ${entry.relativePath}`) }));
  const queries = [...(input.preferredTitles ?? []), input.userText]
    .map((value) => normalize(value ?? ''))
    .filter((value) => value.length > 0);

  if (queries.length === 0) {
    return entries.slice(0, Math.max(1, input.limit));
  }

  const matched: LocalLibraryEntry[] = [];
  for (const query of queries) {
    for (const item of haystack) {
      if (matched.includes(item.entry)) continue;
      if (item.key.includes(query)) matched.push(item.entry);
    }
  }

  if (matched.length > 0) return matched;
  return entries.slice(0, Math.max(1, input.limit));
}

/*
 * 把条目映射为共享 Track。
 * url 走 Claudio 自身 /media/local/:id，便于走 Range 流和后续缓存策略。
 */
function entryToTrack(entry: LocalLibraryEntry, mediaBaseUrl: string): Track {
  return {
    id: `local-${entry.id}`,
    url: `${mediaBaseUrl}/media/local/${entry.id}`,
    title: entry.title,
    ...(entry.artist ? { artist: entry.artist } : {}),
    source: {
      provider: LOCAL_MANIFEST.id,
      tier: LOCAL_MANIFEST.tier,
      cachePolicy: LOCAL_MANIFEST.defaultCachePolicy,
    },
  };
}

/* 文件名解析：'artist - title.ext' / 'title.ext'。 */
function parseTrackName(filename: string): { title: string; artist?: string } {
  const withoutExt = filename.replace(/\.[^.]+$/, '').trim();
  const dashIndex = withoutExt.indexOf(' - ');
  if (dashIndex > 0) {
    const artist = withoutExt.slice(0, dashIndex).trim();
    const title = withoutExt.slice(dashIndex + 3).trim();
    if (artist && title) return { title, artist };
  }
  return { title: withoutExt };
}

/* 归一化字符串用于宽松匹配。 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/* 用 sha1 前缀作为 id，避免 URL 编码问题。 */
function hashRelativePath(relativePath: string): string {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 16);
}
