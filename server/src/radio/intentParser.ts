/*
 * 电台意图解析。
 * 把用户输入转换成音乐检索意图；本模块保持纯函数，不读写 radioState。
 */

import type { GenerateMusicIntentResult } from '../llm/llmAdapter';

export interface ExplicitSongRequest {
  title: string;
  artist?: string;
  searchQuery: string;
}

export interface GenreRecommendationRequest {
  title: string;
  artist: string;
  mood: string;
}

/*
 * 常见情绪 / 类型请求的稳定推荐锚点。
 * 这里不是歌单系统，只负责把泛词转换成真实音乐源更容易解析的具体歌曲。
 */
const GENRE_RECOMMENDATIONS: Array<{
  keywords: string[];
  title: string;
  artist: string;
  mood: string;
}> = [
  {
    keywords: ['伤感', '难过', '失恋', 'emo', '悲伤', '催泪'],
    title: '晴天',
    artist: '周杰伦',
    mood: '伤感',
  },
  {
    keywords: ['治愈', '温柔', '放松', '安静', '睡前'],
    title: '小幸运',
    artist: '田馥甄',
    mood: '治愈',
  },
  {
    keywords: ['摇滚', '热血', '燃', '振奋'],
    title: '光辉岁月',
    artist: 'Beyond',
    mood: '摇滚',
  },
  {
    keywords: ['怀旧', '经典', '老歌'],
    title: '海阔天空',
    artist: 'Beyond',
    mood: '怀旧',
  },
];

/*
 * 从明确点歌文本里抽取歌名和歌手。
 * 这类输入不需要先调用 LLM 做意图识别，直接把短搜索词交给音乐源。
 */
export function parseExplicitSongRequest(text: string): ExplicitSongRequest | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const artistTitleMatch = normalized.match(
    /(?:我想听|想听|播放|放一首|来一首|点一首|听一下|听听|我要听)\s*([^，。,.!?！？]{1,40})的([^，。,.!?！？]{1,60})/u,
  );
  if (artistTitleMatch) {
    if (isRecommendationPhrase(artistTitleMatch[2] ?? '')) return null;

    const artist = trimSongPhrase(artistTitleMatch[1] ?? '');
    const title = trimSongPhrase(artistTitleMatch[2] ?? '');
    if (title) {
      return {
        title,
        ...(artist ? { artist } : {}),
        searchQuery: [title, artist].filter(Boolean).join(' '),
      };
    }
  }

  const titleOnlyMatch = normalized.match(
    /(?:我想听|想听|播放|放一首|来一首|点一首|听一下|听听|我要听)\s*([^，。,.!?！？]{1,60})/u,
  );
  const rawTitlePhrase = titleOnlyMatch?.[1] ?? '';
  if (isRecommendationPhrase(rawTitlePhrase)) return null;

  const title = trimSongPhrase(rawTitlePhrase);
  if (!title) return null;

  return {
    title,
    searchQuery: title,
  };
}

/*
 * 解析情绪或类型推荐请求。
 * 这类输入不是明确点歌，先给音乐源一个具体可搜索的锚点。
 */
export function parseGenreRecommendationRequest(text: string): GenreRecommendationRequest | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized || !/(?:想听|播放|放一首|来一首|点一首|听听|歌曲|音乐|歌单|类型|风格)/u.test(normalized)) {
    return null;
  }

  const matched = GENRE_RECOMMENDATIONS.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );
  if (!matched) return null;

  return {
    title: matched.title,
    artist: matched.artist,
    mood: matched.mood,
  };
}

/* 把本地解析出的明确点歌请求包装成和 LLM 意图一致的结果。 */
export function buildExplicitMusicIntent(request: ExplicitSongRequest): GenerateMusicIntentResult {
  return {
    ok: true,
    intent: {
      preferredTitles: [request.title],
      searchQuery: request.searchQuery,
      note: 'local explicit song parser',
    },
    providerId: 'local-parser',
    model: 'local-parser',
    elapsedMs: 0,
  };
}

/* 把本地情绪推荐包装成 LLM 意图格式，后续解析管线保持一致。 */
export function buildGenreMusicIntent(request: GenreRecommendationRequest): GenerateMusicIntentResult {
  return {
    ok: true,
    intent: {
      preferredTitles: [request.title],
      searchQuery: `${request.title} ${request.artist}`,
      mood: request.mood,
      note: 'local genre recommendation parser',
    },
    providerId: 'local-genre-parser',
    model: 'local-genre-parser',
    elapsedMs: 0,
  };
}

/*
 * 情绪、风格和泛化描述不是明确歌名。
 * 例如“想听伤感的歌曲”应交给推荐解析，而不是把“伤感”当成一首歌去搜。
 */
function isRecommendationPhrase(value: string): boolean {
  const trimmed = value.trim().replace(/(?:吧|谢谢|可以吗|好吗|呢|呀|啊)$/u, '').trim();
  if (!trimmed) return false;

  return (
    /^(?:歌|歌曲|音乐|曲子|歌单)$/u.test(trimmed) ||
    /的(?:歌曲|音乐|曲子|歌单|类型|风格)$/u.test(trimmed) ||
    /(?:歌曲|音乐|曲子|类型|风格|歌单|一些|几首|好听|适合|类似)$/u.test(trimmed)
  );
}

/* 去掉点歌短语后半段的评论、背景或闲聊要求，只保留可检索的标题片段。 */
function trimSongPhrase(value: string): string {
  return value
    .split(/(?:顺便|然后|并且|讲讲|讲一下|聊聊|介绍|背景|故事|这首歌|吧|谢谢)/u)[0]
    ?.trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim() ?? '';
}
