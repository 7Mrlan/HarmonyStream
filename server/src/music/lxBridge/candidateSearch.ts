/*
 * LX 候选搜索层
 * --------------
 * LX 用户源主要负责 musicUrl 解析，不负责从自然语言搜索歌曲。
 * 因此 G.1 把候选搜索显式放在外部 resolver / 本地 fixture，避免把用户源误当搜索引擎。
 */

import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { MusicSearchInput } from '../types.js';
import type {
  LxCandidateSearchConfig,
  LxCandidateSearcher,
  LxMusicCandidate,
} from './types.js';

const MusicCandidateSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  artwork: z.string().url().optional(),
  durationMs: z.number().positive().optional(),
  quality: z.string().min(1).optional(),
  musicInfo: z.record(z.unknown()),
});

const SearchResponseSchema = z.object({
  candidates: z.array(MusicCandidateSchema).default([]),
});

/*
 * 创建候选搜索器。
 * resolverUrl 优先；没有 resolver 时允许使用 fixture 做 G.1 smoke。
 */
export function createLxCandidateSearcher(config: LxCandidateSearchConfig): LxCandidateSearcher {
  const resolverUrl = config.resolverUrl?.trim().replace(/\/+$/, '');
  const fixtureFile = config.fixtureFile?.trim();

  return {
    searchCandidates: (input) =>
      searchCandidates({ ...config, resolverUrl, fixtureFile }, input),
  };
}

/*
 * 根据配置选择候选来源。
 * 没有任何候选来源时返回空数组，让 provider chain 继续 fallback。
 */
async function searchCandidates(
  config: LxCandidateSearchConfig,
  input: MusicSearchInput,
): Promise<LxMusicCandidate[]> {
  if (config.resolverUrl) {
    return searchCandidatesViaHttp(config.resolverUrl, input, config.timeoutMs);
  }
  if (config.fixtureFile) {
    return searchCandidatesFromFixture(config.fixtureFile, input);
  }
  if (config.enableKuwoSearch) {
    return searchCandidatesViaKuwo(input, config.timeoutMs);
  }
  return [];
}

/*
 * 调用外部候选 resolver。
 * 约定端点：POST {base}/search -> { candidates }，候选必须携带 LX musicInfo。
 */
async function searchCandidatesViaHttp(
  baseUrl: string,
  input: MusicSearchInput,
  timeoutMs: number,
): Promise<LxMusicCandidate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userText: input.userText,
        preferredTitles: input.preferredTitles ?? [],
        limit: input.limit,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`LX metadata resolver HTTP ${response.status}`);
    }
    return parseCandidatePayload(await response.json(), input);
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * 从本地 fixture 读取候选。
 * fixture 只用于 smoke / 本机验证，不作为产品内置音源。
 */
async function searchCandidatesFromFixture(
  filePath: string,
  input: MusicSearchInput,
): Promise<LxMusicCandidate[]> {
  const raw = await readFile(filePath, 'utf8');
  return parseCandidatePayload(JSON.parse(raw) as unknown, input);
}

/*
 * 校验并排序候选。
 * preferredTitles 命中优先；没有命中时保持 resolver 原始顺序。
 */
function parseCandidatePayload(payload: unknown, input: MusicSearchInput): LxMusicCandidate[] {
  const parsed = SearchResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('LX metadata resolver 响应不符合 schema');
  }

  const ordered = orderCandidatesByPreferredTitles(parsed.data.candidates, input.preferredTitles);
  return ordered.slice(0, Math.max(1, input.limit));
}

/*
 * 使用 Kuwo 公开搜索端点做最小候选搜索。
 * 这是系统默认 LX 源的候选层：只产出 LX musicInfo 候选，不直接解析音频 URL。
 */
async function searchCandidatesViaKuwo(
  input: MusicSearchInput,
  timeoutMs: number,
): Promise<LxMusicCandidate[]> {
  const queries = buildKuwoQueries(input);
  const candidates: LxMusicCandidate[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    if (candidates.length >= Math.max(input.limit * 3, 6)) break;
    const parsed = await fetchKuwoCandidates(query, Math.max(input.limit * 3, 6), timeoutMs);
    for (const candidate of parsed) {
      if (seenIds.has(candidate.id)) continue;
      seenIds.add(candidate.id);
      candidates.push(candidate);
    }
  }

  return orderCandidatesByPreferredTitles(candidates, input.preferredTitles);
}

/*
 * 构造候选搜索关键词。
 * LLM 生成的 searchQuery 放在 userText；preferredTitles 作为补充查询，提升推荐歌名命中率。
 */
function buildKuwoQueries(input: MusicSearchInput): string[] {
  const queries = [input.userText, ...(input.preferredTitles ?? [])]
    .map((query) => query.trim())
    .filter((query) => query.length > 0);
  return [...new Set(queries)].slice(0, 4);
}

/* 调用 Kuwo 候选接口，并在旧搜索端点被拦截时切到溯音 Kuwo 直链接口。 */
async function fetchKuwoCandidates(
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<LxMusicCandidate[]> {
  try {
    return parseKuwoCandidates(await fetchKuwoSearch(query, limit, timeoutMs));
  } catch (error) {
    const fallback = await fetchSuyinKuwoDirectCandidate(query, timeoutMs);
    if (fallback) return [fallback];
    throw error;
  }
}

/* 调用 Kuwo 搜索接口并解析 JSON。 */
async function fetchKuwoSearch(
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url =
    'http://search.kuwo.cn/r.s?' +
    new URLSearchParams({
      client: 'kt',
      all: query,
      pn: '0',
      rn: String(limit),
      uid: '794762570',
      ver: 'kwplayer_ar_9.2.2.1',
      vipver: '1',
      show_copyright_off: '1',
      newver: '1',
      ft: 'music',
      cluster: '0',
      strategy: '2012',
      encoding: 'utf8',
      rformat: 'json',
      vermerge: '1',
      mobi: '1',
      issubtitle: '1',
    }).toString();

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        referer: 'http://www.kuwo.cn/',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kuwo search HTTP ${response.status}`);
    const text = await response.text();
    if (looksLikeHtml(text)) throw new Error('Kuwo search 返回 HTML，疑似被网络策略拦截');
    return parseKuwoJson(text);
  } finally {
    clearTimeout(timeout);
  }
}

/* 调用实测可用的溯音 Kuwo 接口；它直接返回播放 URL，可作为候选直链。 */
async function fetchSuyinKuwoDirectCandidate(
  query: string,
  timeoutMs: number,
): Promise<LxMusicCandidate | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url =
    'https://oiapi.net/api/Kuwo?' +
    new URLSearchParams({
      msg: query,
      n: '1',
      br: '1',
    }).toString();

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        referer: 'https://oiapi.net/',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Suyin Kuwo HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    return parseSuyinKuwoCandidate(payload, query);
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * Kuwo 搜索返回偶尔带非标准包裹；这里先尝试 JSON，再提取对象片段。
 */
function parseKuwoJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Kuwo search 响应不是 JSON');
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  }
}

/* 识别网关拦截页，避免从 HTML 里的 JavaScript 对象片段硬切 JSON。 */
function looksLikeHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

/* 把 Kuwo 搜索响应映射成 LX musicInfo 候选。 */
function parseKuwoCandidates(payload: unknown): LxMusicCandidate[] {
  if (!isRecord(payload) || !Array.isArray(payload.abslist)) return [];

  const candidates: LxMusicCandidate[] = [];
  for (const item of payload.abslist) {
    const candidate = parseKuwoCandidate(item);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

/* 解析溯音 Kuwo 返回的直链响应。 */
function parseSuyinKuwoCandidate(payload: unknown, query: string): LxMusicCandidate | null {
  if (!isRecord(payload)) return null;
  const directUrl = readSuyinDirectUrl(payload);
  if (!directUrl) return null;

  const message = readString(payload.message);
  const parsed = parseSuyinMessage(message);
  const title = parsed.title || readString(payload.name) || query;
  const artist = parsed.artist || readString(payload.artist);
  const artwork = parsed.artwork || readString(payload.pic) || readString(payload.img);
  const id = createSuyinCandidateId(title, artist, directUrl);

  return {
    id,
    source: 'kw',
    title,
    ...(artist ? { artist } : {}),
    ...(artwork ? { artwork } : {}),
    quality: inferQualityFromUrl(directUrl),
    musicInfo: {
      name: title,
      ...(artist ? { singer: artist } : {}),
      source: 'kw',
      songmid: id,
      claudioDirectUrl: directUrl,
    },
  };
}

/* 从溯音响应中读取播放直链。 */
function readSuyinDirectUrl(payload: Record<string, unknown>): string {
  const data = payload.data;
  if (isRecord(data)) {
    const nestedUrl = readString(data.url);
    if (nestedUrl) return nestedUrl;
  }
  const message = readString(payload.message);
  const matched = message.match(/音乐链接[：:](\S+)/u);
  return matched?.[1]?.trim() ?? '';
}

/* 从溯音 message 文本中提取标题、歌手和封面。 */
function parseSuyinMessage(message: string): { title: string; artist: string; artwork: string } {
  return {
    title: matchMessageLine(message, /歌名[：:]\s*([^\n]+)/u),
    artist: matchMessageLine(message, /歌手[：:]\s*([^\n]+)/u),
    artwork: matchMessageLine(message, /[±\s]*img=(\S+)/u),
  };
}

/* 读取 message 中的一行字段。 */
function matchMessageLine(message: string, pattern: RegExp): string {
  return message.match(pattern)?.[1]?.trim() ?? '';
}

/* 根据 URL 粗略推断音质，用于 UI 展示。 */
function inferQualityFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('flac') || lower.includes('format$flac')) return 'flac';
  if (lower.includes('320')) return '320k';
  return '128k';
}

/* 为直链候选生成稳定 id。 */
function createSuyinCandidateId(title: string, artist: string, url: string): string {
  const stable = `${title}-${artist}-${url.slice(0, 48)}`
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `suyin-${stable || Date.now()}`;
}

/* 解析单条 Kuwo 候选。 */
function parseKuwoCandidate(value: unknown): LxMusicCandidate | null {
  if (!isRecord(value)) return null;

  const songmid = readSongMid(value.MUSICRID);
  const title = decodeKuwoText(readString(value.SONGNAME));
  if (!songmid || !title) return null;

  const artist = formatKuwoArtist(decodeKuwoText(readString(value.ARTIST)));
  const album = decodeKuwoText(readString(value.ALBUM));
  const albumId = decodeKuwoText(readString(value.ALBUMID));
  const duration = readPositiveNumber(value.DURATION);

  return {
    id: `kuwo-${songmid}`,
    source: 'kw',
    title,
    ...(artist ? { artist } : {}),
    ...(album ? { album } : {}),
    ...(duration ? { durationMs: duration * 1000 } : {}),
    quality: '128k',
    musicInfo: {
      name: title,
      ...(artist ? { singer: artist } : {}),
      source: 'kw',
      songmid,
      ...(albumId ? { albumId } : {}),
      ...(album ? { albumName: album } : {}),
      ...(duration ? { interval: formatKuwoInterval(duration) } : {}),
    },
  };
}

/* 从 MUSICRID 里读取纯数字歌曲 id。 */
function readSongMid(value: unknown): string {
  const raw = readString(value);
  return raw.replace(/^MUSIC_/i, '').trim();
}

/* 读取字符串字段。 */
function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/* 读取正数。 */
function readPositiveNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseInt(readString(value), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

/* Kuwo 歌手字段使用 & 分隔，展示时改成中文顿号。 */
function formatKuwoArtist(value: string): string {
  return value.replace(/\s*&\s*/g, '、').trim();
}

/* 兼容 Kuwo 返回的常见 HTML 实体。 */
function decodeKuwoText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/* 把秒数格式化为 LX musicInfo 常见的 mm:ss 形态。 */
function formatKuwoInterval(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = `${seconds % 60}`.padStart(2, '0');
  return `${minutes}:${rest}`;
}

/*
 * 按 LLM 推荐曲名重排候选。
 * 只做轻量标题匹配，不替 resolver 做复杂搜索。
 */
function orderCandidatesByPreferredTitles(
  candidates: LxMusicCandidate[],
  preferredTitles: string[] | undefined,
): LxMusicCandidate[] {
  if (!preferredTitles || preferredTitles.length === 0) return [...candidates];

  const ordered: LxMusicCandidate[] = [];
  const remaining = [...candidates];

  for (const title of preferredTitles) {
    const index = remaining.findIndex((candidate) => isSameTitle(candidate.title, title));
    if (index === -1) continue;
    const [matched] = remaining.splice(index, 1);
    if (matched) ordered.push(matched);
  }

  return [...ordered, ...remaining];
}

/* 宽松标题匹配，用于把 LLM 推荐曲名排到前面。 */
function isSameTitle(left: string, right: string): boolean {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight);
}

/* 标题归一化。 */
function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

/* 判断 unknown 是否为对象记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
