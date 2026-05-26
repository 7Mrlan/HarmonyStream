/*
 * 电台意图解析。
 * 把用户输入转换成音乐检索意图；本模块保持纯函数，不读写 radioState。
 */

import type { GenerateMusicIntentResult } from '../llm/llmAdapter.js';

export interface ExplicitSongRequest {
  title: string;
  artist?: string;
  searchQuery: string;
}

export interface GenreRecommendationRequest {
  title: string;
  artist: string;
  preferredTitles: string[];
  mood: string;
}

export type MusicRequestKind = 'explicit' | 'range' | 'multi';
export type GenericRecommendationRequest = GenreRecommendationRequest;

/*
 * 常见情绪 / 类型请求的稳定推荐锚点。
 * 这里不是歌单系统，只负责把泛词转换成真实音乐源更容易解析的具体歌曲。
 */
const GENRE_RECOMMENDATIONS: Array<{
  keywords: string[];
  tracks: Array<{
    title: string;
    artist: string;
  }>;
  mood: string;
}> = [
  {
    keywords: ['开心', '快乐', '愉快', '轻快', '元气', '高兴'],
    tracks: [
      { title: '稻香', artist: '周杰伦' },
      { title: '恋爱ing', artist: '五月天' },
      { title: '日不落', artist: '蔡依林' },
      { title: '快乐崇拜', artist: '潘玮柏' },
      { title: '暖暖', artist: '梁静茹' },
    ],
    mood: '开心',
  },
  {
    keywords: ['伤感', '伤心', '难过', '失恋', 'emo', '悲伤', '催泪'],
    tracks: [
      { title: '晴天', artist: '周杰伦' },
      { title: '突然好想你', artist: '五月天' },
      { title: '说好的幸福呢', artist: '周杰伦' },
      { title: '后来', artist: '刘若英' },
      { title: '好久不见', artist: '陈奕迅' },
    ],
    mood: '伤感',
  },
  {
    keywords: ['治愈', '温柔', '放松', '安静', '睡前'],
    tracks: [
      { title: '小幸运', artist: '田馥甄' },
      { title: '慢慢喜欢你', artist: '莫文蔚' },
      { title: '遇见', artist: '孙燕姿' },
      { title: '暖暖', artist: '梁静茹' },
      { title: '和你一样', artist: '李宇春' },
    ],
    mood: '治愈',
  },
  {
    keywords: ['摇滚', '热血', '燃', '振奋'],
    tracks: [
      { title: '光辉岁月', artist: 'Beyond' },
      { title: '倔强', artist: '五月天' },
      { title: '追梦赤子心', artist: 'GALA' },
      { title: '海阔天空', artist: 'Beyond' },
      { title: '夜空中最亮的星', artist: '逃跑计划' },
    ],
    mood: '摇滚',
  },
  {
    keywords: ['怀旧', '经典', '老歌'],
    tracks: [
      { title: '海阔天空', artist: 'Beyond' },
      { title: '红日', artist: '李克勤' },
      { title: '吻别', artist: '张学友' },
      { title: '千千阙歌', artist: '陈慧娴' },
      { title: '朋友', artist: '周华健' },
    ],
    mood: '怀旧',
  },
];

/*
 * 泛化推荐请求的默认锚点。
 * 用户只说“推荐歌曲”时没有情绪线索，先给一组覆盖面较稳的中文流行曲，避免把整句话当歌名搜索。
 */
const DEFAULT_RECOMMENDATION = {
  tracks: [
    { title: '晴天', artist: '周杰伦' },
    { title: '稻香', artist: '周杰伦' },
    { title: '突然好想你', artist: '五月天' },
    { title: '小幸运', artist: '田馥甄' },
    { title: '夜空中最亮的星', artist: '逃跑计划' },
  ],
  mood: '随便听点',
};

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

  const bareArtistTitleMatch = normalized.match(/^([^，。,.!?！？]{1,40})的([^，。,.!?！？]{1,60})$/u);
  if (bareArtistTitleMatch) {
    if (isRecommendationPhrase(bareArtistTitleMatch[2] ?? '')) return null;

    const artist = trimSongPhrase(bareArtistTitleMatch[1] ?? '');
    const title = trimSongPhrase(bareArtistTitleMatch[2] ?? '');
    if (isLikelyBareArtistTitle(artist, title)) {
      return {
        title,
        artist,
        searchQuery: `${title} ${artist}`,
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
  if (!normalized || !/(?:想听|推荐|播放|放一首|来一首|点一首|听听|歌|歌曲|音乐|歌单|类型|风格|几首|一些)/u.test(normalized)) {
    return null;
  }

  const matched = GENRE_RECOMMENDATIONS.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );
  if (!matched) return null;

  const [primary] = matched.tracks;
  if (!primary) return null;

  return {
    title: primary.title,
    artist: primary.artist,
    preferredTitles: matched.tracks.map((track) => track.title),
    mood: matched.mood,
  };
}

/* 识别没有情绪关键词的泛推荐请求。调用方应先尝试 LLM，失败后再用默认锚点兜底。 */
export function parseGenericRecommendationRequest(text: string): GenericRecommendationRequest | null {
  const normalized = text.trim().toLowerCase();
  if (!isGenericRecommendationRequest(normalized)) return null;
  return buildRecommendationRequest(DEFAULT_RECOMMENDATION);
}

/*
 * 判断用户是否明确要一组歌。
 * 这里只识别数量 / 歌单意图，不参与具体歌名解析，避免和明确点歌逻辑互相污染。
 */
export function parseMusicRequestKind(
  text: string,
  explicitRequest: ExplicitSongRequest | null,
  genreRequest: GenreRecommendationRequest | null,
): MusicRequestKind {
  if (explicitRequest) return 'explicit';

  const normalized = text.trim().toLowerCase();
  if (/(?:几首|多(?:来|推荐|放|点)|歌单|一组|一些|几支|playlist)/u.test(normalized)) {
    return 'multi';
  }

  if (genreRequest) return 'range';
  return 'range';
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
      preferredTitles: request.preferredTitles,
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

/*
 * 裸 “X的Y” 只在非常像“歌手的歌名”时进入本地 parser。
 * 返回时仍把整句作为主标题，避免“后来的我们”被拆成“我们 / 后来”后搜偏。
 */
function isLikelyBareArtistTitle(artist: string, title: string): boolean {
  if (!artist || !title) return false;
  if (artist.length > 6 || title.length < 2) return false;
  if (title.length === 1) return false;
  if (isCommonNounPhrase(title)) return false;
  return true;
}

/* 过滤明显不是歌名的日常名词后缀。 */
function isCommonNounPhrase(value: string): boolean {
  return /^(?:天气|世界|玫瑰|我们|星|事情|问题|东西|感觉|时候|地方|故事)$/u.test(value.trim());
}

/* 判断没有情绪关键词的泛化推荐请求。 */
function isGenericRecommendationRequest(value: string): boolean {
  const trimmed = value.trim().replace(/(?:吧|谢谢|可以吗|好吗|呢|呀|啊)$/u, '').trim();
  if (!trimmed) return false;

  return (
    /(?:推荐|随便|来点|来首|放点|听点)/u.test(trimmed) &&
    /(?:歌|歌曲|音乐|曲子)/u.test(trimmed)
  );
}

/* 从推荐锚点构造标准请求对象。 */
function buildRecommendationRequest(recommendation: typeof DEFAULT_RECOMMENDATION): GenreRecommendationRequest {
  const [primary] = recommendation.tracks;
  return {
    title: primary?.title ?? '',
    artist: primary?.artist ?? '',
    preferredTitles: recommendation.tracks.map((track) => track.title),
    mood: recommendation.mood,
  };
}

/* 去掉点歌短语后半段的评论、背景或闲聊要求，只保留可检索的标题片段。 */
function trimSongPhrase(value: string): string {
  return value
    .split(/(?:顺便|然后|并且|讲讲|讲一下|聊聊|介绍|背景|故事|这首歌|吧|谢谢)/u)[0]
    ?.trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim() ?? '';
}
